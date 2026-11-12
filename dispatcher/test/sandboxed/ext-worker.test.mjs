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
