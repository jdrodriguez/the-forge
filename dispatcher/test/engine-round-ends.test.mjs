// How an engine round ends when it did not end done: a plan limit, a containment report, a failed run, a process that
// died without a final status. Also that a busy run is never called stalled, and that a crashed claim is adopted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ENGINE_T, argOf, asks, comments, engineBox, extBriefs, extCalls, labelOps, mergeRequest, rowFile, setRow, starts, tick, ticket } from './engine-sandbox.mjs';
import { state } from './sandbox.mjs';

const NOT_GREEN = { mergeStateStatus: 'BLOCKED' };

test('a worker on its plan limit hands the round to the other engine and keeps the round number', () => {
  const box = engineBox({ engines: ['codex', 'grok'], tickets: { 'ENG-9': { ...ENGINE_T, lastRoundNote: 'Round 1 work: build the counter.' } },
    registry: { status: 'limit' }, pr: NOT_GREEN });
  tick(box);
  const [s] = starts(box);
  assert.equal(s[1], 'grok');
  assert.ok(s.includes('--continue'));
  const t = ticket(box);
  assert.equal(t.engine, 'grok');
  assert.equal(t.account, 'grok');
  assert.equal(t.round, 1);
  assert.ok(state(box).engineLimits.codex);
  assert.match(extBriefs(box)[0], /Codex stopped mid-round on its plan or rate limit[\s\S]*Round 1 work: build the counter\./);
});

test('a worker on its plan limit with no other engine goes back to the queue', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'limit' }, pr: NOT_GREEN });
  const out = tick(box);
  assert.match(out, /ENG-9: no engine can run its next round on host-a \(codex hit its limit\), so it went back to the queue/);
  assert.equal(starts(box).length, 0);
  assert.deepEqual(labelOps(box), ['+L-agent-ready', '-L-agent-building'], 'ready goes on before building comes off');
  assert.equal(ticket(box), undefined, 'this machine lets go of it');
  assert.match(comments(box).at(-1), /so this ticket went back to the queue/);
});

test('a containment report stops the run, marks it stuck, writes the shared marker, asks the human with the files, and no round follows', () => {
  const box = engineBox({ engines: ['codex', 'grok'], tickets: { 'ENG-9': ENGINE_T }, pr: {},
    registry: { status: 'failed', report: 'containment: wrote outside the worktree (/etc/hosts)' } });
  const out = tick(box);
  assert.match(out, /ENG-9: ALERT: codex's run tripped ext-worker\.sh's containment/);
  assert.ok(extCalls(box).some((a) => a[0] === 'stop' && a[1] === 'ENG-9'), 'the run is stopped');
  const t = ticket(box);
  assert.equal(t.status, 'stuck');
  assert.match(t.engineContained, /^containment: wrote outside/);
  const marker = JSON.parse(fs.readFileSync(path.join(box.shared, 'engine-contained/ENG-9.json'), 'utf8'));
  assert.equal(marker.engine, 'codex');
  assert.match(marker.report, /^containment: wrote outside/);
  const [a] = asks(box);
  assert.match(argOf(a, '--ask'), /The Codex engine worker on ENG-9 tripped ext-worker\.sh's containment: containment: wrote outside the worktree/);
  assert.match(argOf(a, '--ask'), /run logs and audit \S+engine-workers\/ENG-9\/e-old/);
  assert.match(argOf(a, '--recommend'), /never back to an engine/);
  assert.equal(mergeRequest(box), null, 'its green PR is not sent on');
  tick(box);
  assert.equal(starts(box).length, 0);
  assert.equal(asks(box).length, 1);
});

test('a failed run gets one retry round, then the ticket goes stuck', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'failed', report: 'timed out after 10800s' }, pr: NOT_GREEN });
  tick(box);
  assert.equal(starts(box).length, 1);
  assert.match(extBriefs(box)[0], /## How the last round ended\n\ntimed out after 10800s/);
  assert.equal(ticket(box).engineRetries, 1);
  assert.equal(ticket(box).round, 2);
  setRow(box, { id: 'e0', status: 'failed', report: 'timed out after 10800s' });
  tick(box);
  assert.equal(starts(box).length, 1, 'no second retry');
  assert.equal(ticket(box).status, 'stuck');
  assert.match(ticket(box).reason, /failed again after a retry/);
});

test('a busy row whose process is gone and whose file is over 2 minutes old reads as failed and gets its retry', () => {
  // Over the highest pid macOS or a default Linux hands out, so it is never a live process.
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'busy', pid: 2 ** 22 + 12345 }, pr: NOT_GREEN });
  const old = new Date(Date.now() - 600_000);
  fs.utimesSync(rowFile(box), old, old);
  tick(box);
  assert.equal(starts(box).length, 1);
  assert.match(extBriefs(box)[0], /its process ended without writing a final status/);
});

test('a fresh busy row with a gone process is still read as busy', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'busy', pid: 2 ** 22 + 12345 }, pr: NOT_GREEN });
  tick(box);
  assert.equal(starts(box).length, 0, 'the launcher may still be writing it');
  assert.equal(ticket(box).engineStatus, 'busy');
});

test('a busy engine worker is never called stalled, however long it is quiet', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'busy' }, pr: NOT_GREEN });
  const out = tick(box);
  assert.doesNotMatch(out, /stalled/);
  assert.equal(asks(box).length, 0);
  assert.equal(ticket(box).stalledSince, undefined);
  assert.match(ticket(box).note, /^Codex round 1 running/);
});

test('an engine claim a crashed run left behind is adopted from the registry row, not undone', () => {
  const claimedAt = new Date(Date.now() - 60_000).toISOString();
  const box = engineBox({ tickets: { 'ENG-9': { status: 'claiming', claimedAt, branch: 'agent/eng-9', driver: 'engine', engine: 'codex', round: 1 } },
    registry: { status: 'busy', id: 'e7', startedAt: new Date().toISOString() } });
  const out = tick(box);
  assert.match(out, /ENG-9: interrupted claim reconciled, worker codex\/e7 is running/);
  const t = ticket(box);
  assert.equal(t.status, 'building');
  assert.equal(t.workerId, 'e7');
  assert.equal(labelOps(box).length, 0, 'labels untouched');
  assert.equal(starts(box).length, 0);
});
