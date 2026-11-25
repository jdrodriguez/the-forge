// The guards around a push and a merge: gated-push.mjs refuses a push that would land on a protected branch, or whose
// destination it cannot tell; the engine's git shim lets a dry run skip the hooks and nothing else; migration-order.mjs
// finds the migrations that clash with the base branch under each policy; the pre-merge check clears build output
// around a stray file. Runs against real temp git repos and a throwaway config.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tmp = (name) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), name)));

function config(dir, extra = {}) {
  const file = path.join(dir, 'agent-queue.config.json');
  fs.writeFileSync(file, JSON.stringify({ ...EXAMPLE, push: { gates: [], env: {} }, ...extra }));
  return file;
}
// A clone of a bare origin, on a work branch.
function clone() {
  const dir = tmp('gated-push-');
  const origin = path.join(dir, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const repo = path.join(dir, 'repo');
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git(repo, 'checkout', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'a');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'checkout', '-q', '-b', 'work');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'b');
  return { dir, repo, origin };
}
const gatedPush = (c, args, cfgFile) => spawnSync(process.execPath, [path.join(ROOT, 'dispatcher/gated-push.mjs'), ...args],
  { cwd: c.repo, env: { ...process.env, ...GIT_ENV, AGENT_QUEUE_CONFIG: cfgFile }, encoding: 'utf8' });

test('gated-push refuses a push that would land on the base branch, before any gate runs', () => {
  const c = clone();
  const cfgFile = config(c.dir, { push: { gates: [['sh', '-c', 'echo gate-ran > gate.log']], env: {} } });
  const r = gatedPush(c, ['origin', 'HEAD:main'], cfgFile);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /REFUSED\. This push would land on a protected branch/);
  assert.ok(!fs.existsSync(path.join(c.repo, 'gate.log')), 'no gate ran');
  assert.notEqual(git(c.origin, 'rev-parse', 'main'), git(c.repo, 'rev-parse', 'HEAD'));
});

test('gated-push pushes a work branch, and push.protectedBranches adds branches to refuse', () => {
  const c = clone();
  const ok = gatedPush(c, ['origin', 'HEAD:refs/heads/work'], config(c.dir));
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(git(c.origin, 'rev-parse', 'work'), git(c.repo, 'rev-parse', 'HEAD'));
  const r = gatedPush(c, ['origin', 'HEAD:refs/heads/release'], config(c.dir, { push: { gates: [], env: {}, protectedBranches: ['release'] } }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /refs\/heads\/release/);
});

test('gated-push refuses when the dry run that finds the destination fails', () => {
  const c = clone();
  const r = gatedPush(c, ['nowhere', 'HEAD:refs/heads/work'], config(c.dir));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /REFUSED\. The dry run that checks where this push lands failed/);
});

test("the engine's git shim lets only a dry run skip the hooks", () => {
  const dir = tmp('shim-');
  const fake = path.join(dir, 'fake');
  fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'git'), '#!/bin/sh\necho "real $*"\n', { mode: 0o755 });
  const ew = path.join(dir, 'ew');
  // The push shim needs the launcher's library, which this test leaves out: the git shim is written before it.
  spawnSync('bash', ['-c', `lib() { return 1; }; . "${path.join(ROOT, 'dispatcher/ext-worker-guard.sh')}"; write_shims`],
    { env: { ...process.env, EW: ew, EW_BASE: 'main', NET: '/dev/null' }, encoding: 'utf8' });
  const shim = fs.readdirSync(ew).map((d) => path.join(ew, d, 'git')).find((f) => fs.existsSync(f));
  assert.ok(shim, 'the git shim was written');
  const shimDir = path.dirname(shim);
  const gitShim = (...args) => spawnSync('bash', [shim, ...args], { env: { ...process.env, PATH: `${shimDir}:${fake}:/usr/bin:/bin` }, encoding: 'utf8' });
  const dry = gitShim('push', '--dry-run', '--no-verify', '--porcelain', 'origin', 'HEAD:refs/heads/x');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^real push --dry-run --no-verify/);
  const real = gitShim('push', '--no-verify', 'origin', 'HEAD:refs/heads/x');
  assert.equal(real.status, 126);
  assert.match(real.stderr, /refused: git push --no-verify/);
});

test('migration clashes: a shared prefix under policy prefix, only an exact name under policy filename', async () => {
  const { migrationClashes, renameNote } = await import(pathToFileURL(path.join(ROOT, 'dispatcher/migration-order.mjs')).href);
  const base = ['20261101000000_theirs.sql', '20261102000000_later.sql', 'README.md'];
  const mig = { dir: 'migrations', pattern: '^\\d{14}_.*\\.sql$', prefixLength: 14 };
  assert.deepEqual(migrationClashes(['migrations/20261101000000_mine.sql', 'src/x.ts'], base, { ...mig, policy: 'prefix' }),
    { stale: ['migrations/20261101000000_mine.sql'], newest: '20261102000000_later.sql' });
  assert.deepEqual(migrationClashes(['migrations/20261101000000_mine.sql'], base, { ...mig, policy: 'filename' }).stale, [], 'an older unique name is fine');
  assert.deepEqual(migrationClashes(['migrations/20261101000000_theirs.sql'], base, { ...mig, policy: 'filename' }).stale, ['migrations/20261101000000_theirs.sql']);
  assert.deepEqual(migrationClashes(['migrations/20261103000000_new.sql'], base, { ...mig, policy: 'prefix' }).stale, []);
  assert.match(renameNote('ENG-9', ['migrations/x.sql'], '20261102000000_later.sql', { push: 'node gated-push.mjs' }), /new prefix after 20261102000000.*node gated-push\.mjs/s);
});

test('the pre-merge check clears each package build output and skips a stray file beside the packages', async () => {
  const dir = tmp('premerge-');
  process.env.AGENT_QUEUE_CONFIG = config(dir);
  const { clearBuildOutput } = await import(pathToFileURL(path.join(ROOT, 'dispatcher/premerge-check.mjs')).href);
  const pkgs = path.join(dir, 'packages');
  fs.mkdirSync(path.join(pkgs, 'api/dist'), { recursive: true });
  fs.writeFileSync(path.join(pkgs, 'api/dist/x.d.ts'), 'x');
  fs.writeFileSync(path.join(pkgs, 'api/tsconfig.tsbuildinfo'), 'x');
  fs.writeFileSync(path.join(pkgs, 'api/index.ts'), 'x');
  fs.writeFileSync(path.join(pkgs, '.DS_Store'), 'x');
  clearBuildOutput(dir, ['packages', 'missing']);
  assert.ok(!fs.existsSync(path.join(pkgs, 'api/dist')));
  assert.ok(!fs.existsSync(path.join(pkgs, 'api/tsconfig.tsbuildinfo')));
  assert.ok(fs.existsSync(path.join(pkgs, 'api/index.ts')));
  assert.ok(fs.existsSync(path.join(pkgs, '.DS_Store')));
});

test('gated-push refuses options that would hide where the push lands', () => {
  const c = clone();
  const r = gatedPush(c, ['--quiet', 'origin', 'HEAD:main'], config(c.dir));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /REFUSED\. --quiet would hide where the push lands/);
  assert.notEqual(git(c.origin, 'rev-parse', 'main'), git(c.repo, 'rev-parse', 'HEAD'));
});

test("the engine's git shim does not read an option's value as a dry run", () => {
  const dir = tmp('shim2-');
  const fake = path.join(dir, 'fake');
  fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'git'), '#!/bin/sh\necho "real $*"\n', { mode: 0o755 });
  const ew = path.join(dir, 'ew');
  spawnSync('bash', ['-c', `lib() { return 1; }; . "${path.join(ROOT, 'dispatcher/ext-worker-guard.sh')}"; write_shims`],
    { env: { ...process.env, EW: ew, EW_BASE: 'main', NET: '/dev/null' }, encoding: 'utf8' });
  const shim = fs.readdirSync(ew).map((d) => path.join(ew, d, 'git')).find((f) => fs.existsSync(f));
  const r = spawnSync('bash', [shim, 'push', '-o', '--dry-run', '--no-verify', 'origin', 'HEAD:refs/heads/x'],
    { env: { ...process.env, PATH: `${path.dirname(shim)}:${fake}:/usr/bin:/bin` }, encoding: 'utf8' });
  assert.equal(r.status, 126);
  assert.match(r.stderr, /refused: git push --no-verify/);
});
