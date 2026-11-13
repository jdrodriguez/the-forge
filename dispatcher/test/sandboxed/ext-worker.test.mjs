// ext-worker.sh itself, in a throwaway world with fake CLIs (engine-fixture.mjs): what start refuses before anything
// runs, a full round for each engine, a question, a containment report, and a stop by PID. Needs sandbox-exec (macOS)
// or a working bwrap (Linux). Run with: npm run test:engines
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { engineWorld, noSandbox, readRow, runExt, waitRow } from '../engine-fixture.mjs';

const skip = noSandbox();
const brief = (w, text) => {
  const f = path.join(w.home, `brief-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(f, text);
  return f;
};

test('start refuses a bad ticket id, the base branch, an unknown engine and a secret-shaped brief, and touches nothing', { skip }, () => {
  const w = engineWorld('ext-refuse');
  const ok = brief(w, 'Build ABC-1.\n');
  for (const [args, rx] of [
    [['start', 'codex', 'abc_1', 'agent/abc-1', ok], /ticket must look like ABC-123/],
    [['start', 'codex', 'ABC-1', 'main', ok], /refusing to work on main/],
    [['start', 'codex', 'ABC-1', 'agent/../x', ok], /unsupported branch name/],
    [['start', 'claude', 'ABC-1', 'agent/abc-1', ok], /engine must be codex or grok/],
    [['start', 'codex', 'ABC-1', 'agent/abc-1', brief(w, `Push with ${'ghp_'}${'b'.repeat(36)}\n`)], /looks like it holds a secret:\n {2}a GitHub token/],
  ]) {
    const r = runExt(w, args);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, rx);
  }
  const r = runExt(w, ['start', 'codex', 'ABC-1', 'agent/abc-1', ok, '--timeout'], { timeout: 15_000 });
  assert.equal(r.status, 2, `a missing --timeout value is refused, never looped on: ${r.out}`);
  assert.match(r.out, /--timeout needs a number of seconds/);
  assert.equal(fs.existsSync(w.registry), false, 'no registry row was written');
  assert.equal(fs.existsSync(w.worktree('agent/abc-1')), false, 'no clone was made');
});

test('start refuses a branch already on origin without --continue', { skip }, () => {
  const w = engineWorld('ext-origin');
  execFileSync('git', ['-C', w.main, 'push', '-q', 'origin', 'HEAD:refs/heads/agent/abc-2']);
  const r = runExt(w, ['start', 'codex', 'ABC-2', 'agent/abc-2', brief(w, 'Build ABC-2.\n')]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /origin\/agent\/abc-2 exists; pass --continue/);
});

test('available says why an engine cannot run: an old codex, a grok that is not signed in', { skip }, () => {
  const w = engineWorld('ext-avail');
  fs.writeFileSync(path.join(w.bin, 'old-codex'), '#!/bin/sh\necho "codex-cli 0.150.0"\n', { mode: 0o755 });
  let r = runExt(w, ['available', 'codex'], { env: { ...w.env, CODEX_BIN: path.join(w.bin, 'old-codex'), EXT_WORKER_NO_CACHE: '1' } });
  assert.equal(r.status, 1);
  assert.match(r.out, /this needs 0\.166 or later/);
  fs.rmSync(path.join(w.home, '.grok/auth.json'));
  r = runExt(w, ['available', 'grok'], { env: { ...w.env, EXT_WORKER_NO_CACHE: '1' } });
  assert.equal(r.status, 1);
  assert.match(r.out, /grok is not signed in/);
});

for (const engine of ['codex', 'grok']) {
  test(`a ${engine} round runs in its own clone under the sandbox, commits through the guard's git, and ends done`, { skip, timeout: 120_000 }, async () => {
    const w = engineWorld(`ext-round-${engine}`);
    const r = runExt(w, ['start', engine, 'ABC-3', 'agent/abc-3', brief(w, 'Build ABC-3.\n')]);
    assert.equal(r.status, 0, r.out);
    const row = await waitRow(w, 'ABC-3');
    assert.equal(row.status, 'done', row.report);
    const wt = w.worktree('agent/abc-3');
    assert.equal(row.worktree, wt);
    assert.equal(fs.readFileSync(path.join(wt, '.git/objects/info/alternates'), 'utf8').trim(), `${w.main}/.git/objects`, 'the clone borrows the main objects');
    assert.equal(execFileSync('git', ['-C', wt, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim(), 'Round 1 from the fake engine');
    const summary = fs.readFileSync(path.join(row.logDir, 'summary.md'), 'utf8');
    assert.match(summary, /git is \S+\/shims\/git/, "the engine's git is the guard's");
    assert.match(summary, /HOME is \S+\/runs\/ABC-3-\w+\/home/, "the engine's HOME is the run's scratch folder");
    assert.equal(fs.existsSync(path.join(w.env.EXT_WORKER_ROOT, 'runs', `ABC-3-${row.id}`)), false, 'the run folder, with the auth copy, is gone');
  });
}

test('a question ends the round blocked with the question; an escape ends it failed with a containment report', { skip, timeout: 120_000 }, async () => {
  const w = engineWorld('ext-blocked');
  runExt(w, ['start', 'codex', 'ABC-4', 'agent/abc-4', brief(w, 'FAKE: question\n')]);
  const q = await waitRow(w, 'ABC-4');
  assert.equal(q.status, 'blocked');
  assert.match(q.question, /Question: which colour\?/);
  fs.mkdirSync(path.join(w.home, '.ssh'));
  fs.writeFileSync(path.join(w.home, '.ssh/config'), 'Host fixture\n');
  const esc = brief(w, 'FAKE: escape\n');
  fs.writeFileSync(esc, `FAKE: escape\n`);
  runExt(w, ['start', 'grok', 'ABC-5', 'agent/abc-5', esc]);
  const c = await waitRow(w, 'ABC-5');
  assert.equal(c.status, 'failed');
  assert.match(c.report, /^containment: .*pushed to main/);
});

test('a question file that is a link is never read out: the round ends with a containment report', { skip, timeout: 120_000 }, async () => {
  const w = engineWorld('ext-linkq');
  runExt(w, ['start', 'codex', 'ABC-9', 'agent/abc-9', brief(w, 'FAKE: link-question\n')]);
  const row = await waitRow(w, 'ABC-9');
  assert.equal(row.status, 'failed');
  assert.match(row.report, /^containment: .*its question file was a link/);
  assert.equal(row.question, null);
  assert.equal(fs.existsSync(path.join(row.logDir, 'question.md')), false);
});

test('a clone whose hooks changed between rounds gets no git command and no install: the round ends contained', { skip, timeout: 120_000 }, async () => {
  const w = engineWorld('ext-tamper');
  runExt(w, ['start', 'codex', 'ABC-10', 'agent/abc-10', brief(w, 'Build ABC-10.\n')]);
  assert.equal((await waitRow(w, 'ABC-10')).status, 'done');
  // What an escape on Linux could leave behind: a hook in the clone, which the next git command outside would run.
  const wt = w.worktree('agent/abc-10');
  const marker = path.join(w.home, 'hook-ran');
  fs.writeFileSync(path.join(wt, '.git/hooks/post-checkout'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(wt, '.git/hooks/post-merge'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  const r = runExt(w, ['start', 'codex', 'ABC-10', 'agent/abc-10', brief(w, 'Build ABC-10.\n'), '--continue']);
  assert.equal(r.status, 0, r.out);
  const row = await waitRow(w, 'ABC-10');
  assert.equal(row.status, 'failed');
  assert.match(row.report, /^containment: .*changed since the last round; no git command ran on it/);
  assert.equal(fs.existsSync(path.join(row.logDir, 'install.log')), false, 'the install never ran');
  assert.equal(fs.existsSync(path.join(wt, 'engine-round-2.txt')), false, 'the engine never ran');
  assert.equal(fs.existsSync(marker), false, 'no hook ran');
});

test('a nested repository in the clone ends the round contained, before any git command of the supervisor walks into it', { skip, timeout: 120_000 }, async () => {
  const w = engineWorld('ext-nested');
  runExt(w, ['start', 'codex', 'ABC-11', 'agent/abc-11', brief(w, 'FAKE: nested\n')]);
  const row = await waitRow(w, 'ABC-11');
  assert.equal(row.status, 'failed');
  assert.match(row.report, /^containment: .*a nested \.git appeared in it/);
});

test('a configured hook folder other than .husky is write-protected inside and covered by the baseline', { skip, timeout: 120_000 }, async () => {
  const w = engineWorld('ext-hookspath');
  fs.mkdirSync(path.join(w.main, 'repo-hooks'));
  fs.writeFileSync(path.join(w.main, 'repo-hooks/pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const g = (...a) => execFileSync('git', ['-C', w.main, ...a], { stdio: 'ignore' });
  g('add', 'repo-hooks');
  g('commit', '-q', '-m', 'hooks');
  g('push', '-q', 'origin', 'main');
  g('config', 'core.hooksPath', 'repo-hooks');
  runExt(w, ['start', 'codex', 'ABC-12', 'agent/abc-12', brief(w, 'Build ABC-12.\n')]);
  assert.equal((await waitRow(w, 'ABC-12')).status, 'done');
  const wt = w.worktree('agent/abc-12');
  // Inside the sandbox the folder is read-only.
  const r = runExt(w, ['sandbox-run', 'codex', wt, '--', '/usr/bin/touch', path.join(wt, 'repo-hooks/planted')]);
  assert.notEqual(r.status, 0);
  assert.equal(fs.existsSync(path.join(wt, 'repo-hooks/planted')), false);
  // A change to it between rounds, as an escape on Linux could make, ends the next round before any git runs.
  fs.writeFileSync(path.join(wt, 'repo-hooks/pre-commit'), '#!/bin/sh\ntouch /tmp/never\n', { mode: 0o755 });
  runExt(w, ['start', 'codex', 'ABC-12', 'agent/abc-12', brief(w, 'Build ABC-12.\n'), '--continue']);
  const row = await waitRow(w, 'ABC-12');
  assert.equal(row.status, 'failed');
  assert.match(row.report, /^containment: .*changed since the last round/);
});

test('a process the engine leaves running in its process group ends with the round', { skip, timeout: 120_000 }, async () => {
  const w = engineWorld('ext-linger');
  runExt(w, ['start', 'codex', 'ABC-8', 'agent/abc-8', brief(w, 'FAKE: linger\n')]);
  const row = await waitRow(w, 'ABC-8');
  assert.equal(row.status, 'done', row.report);
  const pid = Number(fs.readFileSync(path.join(w.worktree('agent/abc-8'), 'linger.pid'), 'utf8'));
  assert.ok(pid > 0);
  assert.throws(() => process.kill(pid, 0), 'the leftover process is gone');
});

test('stop ends a busy round by its PID and marks it failed, stopped', { skip, timeout: 120_000 }, async () => {
  const w = engineWorld('ext-stop');
  assert.equal(runExt(w, ['start', 'codex', 'ABC-6', 'agent/abc-6', brief(w, 'FAKE: sleep\n')]).status, 0);
  for (let i = 0; i < 80 && !readRow(w, 'ABC-6')?.enginePid; i += 1) await new Promise((r) => { setTimeout(r, 250); });
  assert.equal(runExt(w, ['start', 'codex', 'ABC-6', 'agent/abc-6', brief(w, 'Build.\n'), '--continue']).status, 2, 'a live worker refuses a second start');
  const r = runExt(w, ['stop', 'ABC-6']);
  assert.equal(r.status, 0, r.out);
  const row = await waitRow(w, 'ABC-6', 30_000);
  assert.equal(row.status, 'failed');
  assert.equal(row.report, 'stopped');
  assert.throws(() => process.kill(row.pid, 0), 'the supervisor is gone');
  assert.match(runExt(w, ['stop', 'ABC-7']).out, /no worker for ABC-7/);
});
