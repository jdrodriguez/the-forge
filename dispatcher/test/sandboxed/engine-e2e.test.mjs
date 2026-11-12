// The engine path end to end, with the real dispatcher, the real ext-worker.sh and its sandbox, and a fake codex: a
// Size S ticket is built in round 1, gets one review-fix round, and once green goes to the orchestrator. The queue
// board, started from the same throwaway copy, shows it in its snapshot as an engine worker in a regular slot.
// GitHub and Linear are stubs (engine-sandbox.mjs), so the fake engine's commits stay in its clone and the PR's state
// is written by the test between ticks. Nothing real is read: the fleet is a stub, the token is a fixed string.
// Needs sandbox-exec (macOS) or bwrap (Linux); it is skipped elsewhere. Run with: npm run test:engines
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BRANCH, HEAD, engineBox, issue, NO_ROOM, plans } from '../engine-sandbox.mjs';
import { addEngineWorld, noSandbox, REPO_ROOT } from '../engine-fixture.mjs';
import { editConfig, runIn, state } from '../sandbox.mjs';

const PORT = 8796;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function world() {
  const box = engineBox({ engines: ['codex'], usage: NO_ROOM, extUsage: plans({ codex: 30 }), ready: [issue(9)] });
  const x = addEngineWorld(box.home);
  for (const f of fs.readdirSync(path.join(REPO_ROOT, 'dispatcher')).filter((n) => /^ext-worker.*\.sh$/.test(n))) {
    fs.copyFileSync(path.join(REPO_ROOT, 'dispatcher', f), path.join(box.dir, f));
    fs.chmodSync(path.join(box.dir, f), 0o755);
  }
  // The board from the same copy, keeping the stub ext-usage.mjs.
  for (const f of fs.readdirSync(path.join(REPO_ROOT, 'queue-board'))) {
    const to = path.join(box.root, 'queue-board', f);
    if (!fs.existsSync(to)) fs.cpSync(path.join(REPO_ROOT, 'queue-board', f), to, { recursive: true });
  }
  const token = path.join(box.stateDir, 'engine-gh-token');
  fs.writeFileSync(token, 'fake-token-for-tests\n', { mode: 0o600 });
  editConfig(box, (c) => ({ ...c, repoPath: x.main, workspaceCwd: path.dirname(x.main),
    push: { gates: [['node', '--version']], env: {} }, premerge: { ...c.premerge, installCommand: ['node', '--version'], copyFiles: [] },
    queueBoard: { ...c.queueBoard, host: 'host-a', port: PORT, bind: ['127.0.0.1'], extUsage: false, ssh: {}, weather: null, musicDir: path.join(box.home, 'music') },
    dispatcher: { ...c.dispatcher, externalBuilders: { fallback: { ...c.dispatcher.externalBuilders.fallback, engines: ['codex'], timeoutSeconds: 300, ghTokenFile: token } } } }));
  // Every node process (the dispatcher, the board, collect.mjs, ext-worker-lib.mjs) sees the stub hostname and Linear.
  const env = { ...x.env, NODE_OPTIONS: `--import=${path.join(box.home, 'preload.mjs')}` };
  const tick = () => {
    const r = runIn(box, ['tick'], env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r.stdout + r.stderr;
  };
  return { box, x, env, tick, wt: path.join(x.main, '.claude/worktrees', BRANCH.split('/').pop()) };
}

async function waitRound(box, id, workerId) {
  const file = path.join(box.stateDir, 'engine-workers', `${id}.json`);
  for (let i = 0; i < 240; i += 1) {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (r.id === workerId && r.status !== 'busy') return r;
    await sleep(250);
  }
  throw new Error(`the round of ${id} did not end: ${fs.readFileSync(file, 'utf8')}`);
}

async function snapshot(w) {
  const board = spawn(process.execPath, [path.join(w.box.root, 'queue-board/board.mjs')], {
    env: { ...process.env, ...w.env, HOME: w.box.home, AGENT_QUEUE_CONFIG: w.box.configFile, PATH: `${w.box.bin}:${process.env.PATH}`, LINEAR_API_KEY: 'fake-linear-key' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  board.stdout.on('data', (d) => { log += d; });
  board.stderr.on('data', (d) => { log += d; });
  try {
    for (let i = 0; i < 80; i += 1) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/api/snapshot`, { signal: AbortSignal.timeout(60_000) });
        if (res.ok) return await res.json();
      } catch {
        // not listening yet
      }
      await sleep(250);
    }
    throw new Error(`the board gave no snapshot: ${log}`);
  } finally {
    board.kill('SIGTERM');
  }
}

test('a fake Codex takes a Size S ticket through its build, one review-fix round and the hand-off to the orchestrator', { skip: noSandbox(), timeout: 240_000 }, async () => {
  const w = world();
  const { box } = w;

  // Tick 1: no Claude account has room, so Codex wins the ticket and builds it in round 1 under the real sandbox.
  let out = w.tick();
  assert.match(out, /ENG-9: dispatched to codex\/\w+ as an engine worker, round 1/);
  let t = state(box).tickets['ENG-9'];
  assert.equal(t.driver, 'engine');
  let row = await waitRound(box, 'ENG-9', t.workerId);
  assert.equal(row.status, 'done', row.report);
  assert.match(fs.readFileSync(path.join(w.wt, 'engine-round-1.txt'), 'utf8'), /round 1/);

  // The PR is open with a failing test job and an open review thread.
  box.put('pr.json', { mergeStateStatus: 'BLOCKED', statusCheckRollup: [
    { __typename: 'CheckRun', name: 'Claude Code Review', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://github.com/x/actions/runs/111/job/222' }] });
  box.put('log-222.txt', 'test\tRun tests\tExpected 2, received 3\n');
  box.put('threads.json', [{ id: 'PRRT_1', isResolved: false, isOutdated: false, path: 'src/x.ts', line: 4, comments: { nodes: [{ body: 'Handle the empty list.', author: { login: 'reviewer-bot' } }] } }]);

  // Tick 2: the round ended done and the PR is not green, so round 2 starts on the same clone with the fixes to make.
  out = w.tick();
  assert.match(out, /ENG-9: started codex round 2 as \w+: fix 1 failing check\(s\): test; address 1 review thread\(s\)/);
  t = state(box).tickets['ENG-9'];
  assert.equal(t.round, 2);
  row = await waitRound(box, 'ENG-9', t.workerId);
  assert.equal(row.status, 'done', row.report);
  const brief2 = fs.readFileSync(path.join(row.logDir, 'brief.md'), 'utf8');
  assert.match(brief2, /^Round 2 of at most 5 on ENG-9/);
  assert.match(brief2, /Expected 2, received 3/);
  assert.match(brief2, /Handle the empty list\./);
  assert.match(fs.readFileSync(path.join(w.wt, 'engine-round-2.txt'), 'utf8'), /^Round 2 of at most 5/);
  assert.equal(execFileSync('git', ['-C', w.wt, 'rev-list', '--count', 'origin/main..HEAD'], { encoding: 'utf8' }).trim(), '2');

  // The board shows it as an engine worker on this machine, in a regular slot.
  const snap = await snapshot(w);
  const card = snap.tickets.find((x) => x.id === 'ENG-9');
  assert.ok(card, JSON.stringify(snap.tickets));
  assert.equal(card.driver, 'engine');
  assert.equal(card.engine, 'codex');
  assert.equal(card.round, 2);
  assert.equal(card.live, true);
  assert.equal(card.status, 'building');
  assert.equal(card.sentry, false);
  assert.equal(card.parked, null);
  assert.equal(card.workerState, 'done');
  const machine = snap.machines.find((m) => m.host === 'host-a');
  assert.deepEqual(machine.engineAccounts, ['codex']);
  assert.equal(machine.maxWorkers, 4);

  // Tick 3: green, and the round has ended, so it goes to the orchestrator. The dispatcher never merges it.
  box.put('pr.json', { mergeStateStatus: 'CLEAN', headRefOid: HEAD, statusCheckRollup: [{ __typename: 'CheckRun', name: 'Claude Code Review', status: 'COMPLETED', conclusion: 'SUCCESS' }] });
  box.put('threads.json', []);
  out = w.tick();
  assert.match(out, /ENG-9: green, built and driven by codex, no Claude review yet, sent to the orchestrator to review and merge/);
  t = state(box).tickets['ENG-9'];
  assert.equal(t.status, 'merge-asked');
  const request = JSON.parse(fs.readFileSync(path.join(box.shared, 'merge-requests/ENG-9.json'), 'utf8'));
  assert.equal(request.driver, 'engine');
  assert.equal(request.engine, 'codex');
  const ghLog = fs.existsSync(path.join(box.home, 'gh-log')) ? fs.readFileSync(path.join(box.home, 'gh-log'), 'utf8') : '';
  assert.doesNotMatch(ghLog, /pr merge/);
});
