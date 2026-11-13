// Cases the pre-push reviews found: a requeue must not lose that an engine built the branch, or the PR it opened; a
// round on a ticket waiting for the orchestrator must find a free slot first; the green path must read a round an
// interrupted tick started before it hands the PR on; a paused queue starts no round; and a ticket whose engine fails
// to start goes to the next account in the same tick.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CLAUDE_T, ENGINE_T, HEAD, OLD, ROOM, claude, claudeBriefs, engineBox, issue, mergeRequest, merges, plans, starts, tick, ticket } from './engine-sandbox.mjs';

const DIRTY = { mergeStateStatus: 'DIRTY' };
const marker = (box, id = 'ENG-9') => {
  try {
    return JSON.parse(fs.readFileSync(path.join(box.shared, 'engine-built', `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
};

test('a requeue keeps a shared record that an engine built the branch, with the PR it opened', () => {
  const box = engineBox({ tickets: { 'ENG-9': { ...ENGINE_T, prNumber: 7 } }, registry: { status: 'limit' }, pr: DIRTY });
  tick(box);
  assert.equal(ticket(box), undefined, 'back in the queue');
  const m = marker(box);
  assert.deepEqual(m.engines, ['codex']);
  assert.equal(m.prNumber, 7);
});

test("a Claude worker's green PR on a branch an engine built goes to the orchestrator, and the engine's open PR is found", () => {
  const later = new Date(Date.now() + 3.6e6).toISOString(); // claimed after the PR was opened
  const claude = { ...CLAUDE_T, branch: 'agent/eng-9', workerName: 'queue-eng-9', claimedAt: later, dispatchedAt: later };
  const box = engineBox({ usage: ROOM, tickets: { 'ENG-9': claude }, pr: {}, ps: [{ label: 'b', id: 'w-live', status: 'busy', kind: 'background', pid: 1 }] });
  fs.mkdirSync(path.join(box.shared, 'engine-built'), { recursive: true });
  fs.writeFileSync(path.join(box.shared, 'engine-built/ENG-9.json'), JSON.stringify({ id: 'ENG-9', engines: ['grok'], prNumber: 7 }));
  const out = tick(box);
  assert.equal(ticket(box).prNumber, 7, 'the PR opened before this claim is still found');
  assert.match(out, /ENG-9: green, built by grok and finished by a Claude worker/);
  assert.equal(mergeRequest(box).review, "built by grok and finished by a Claude worker, no orchestrator review of the engine's code yet");
  assert.equal(merges(box).length, 0, 'never merged here');
});

test('a round due on a ticket waiting for the orchestrator waits for a free slot, and starts once there is one', () => {
  const asked = { ...ENGINE_T, status: 'merge-asked', prNumber: 7, riskySha: HEAD };
  const busy = [{ label: 'b', id: 'w-live', status: 'busy', kind: 'background', pid: 1 }];
  const full = engineBox({ host: { maxWorkers: 1 }, tickets: { 'ENG-9': asked, 'ENG-8': CLAUDE_T }, registry: { status: 'done' }, pr: DIRTY, ps: busy });
  const out = tick(full);
  assert.match(out, /ENG-9: a round is due \(resolve its conflict with main\) but every slot on host-a is taken, so it waits/);
  assert.equal(starts(full).length, 0);
  assert.equal(ticket(full).status, 'merge-asked');
  const room = engineBox({ host: { maxWorkers: 2 }, tickets: { 'ENG-9': asked, 'ENG-8': CLAUDE_T }, registry: { status: 'done' }, pr: DIRTY, ps: busy });
  tick(room);
  assert.equal(starts(room).length, 1);
  assert.equal(ticket(room).status, 'building', 'back from the orchestrator to its engine');
});

test('a green PR whose next round an interrupted tick started is held for that round, never handed on past it', () => {
  const t = { ...ENGINE_T, roundStarting: { at: OLD, round: 2, engine: 'codex', summary: 'fix the review thread' } };
  const box = engineBox({ tickets: { 'ENG-9': t }, pr: {}, registry: { id: 'e-new', status: 'busy', pid: process.pid, startedAt: new Date().toISOString() } });
  const out = tick(box);
  assert.match(out, /ENG-9: adopted codex round 2 \(e-new\)/);
  assert.equal(ticket(box).workerId, 'e-new');
  assert.equal(ticket(box).roundStarting, undefined);
  assert.equal(mergeRequest(box), null, 'not sent to the orchestrator while the adopted round runs');
});

test('a paused queue starts no round: the ticket waits with a note', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' }, pr: DIRTY });
  fs.writeFileSync(path.join(box.stateDir, 'PAUSED'), 'paused by hand\n');
  const out = tick(box);
  assert.match(out, /ENG-9: a round is due \(resolve its conflict with main\), held while the queue is paused/);
  assert.equal(starts(box).length, 0);
  assert.match(ticket(box).note, /held while the queue is paused/);
  assert.equal(ticket(box).round, 1);
});

test('when the engine that won a ticket fails to start, the ticket goes to the next account with room in the same tick', () => {
  const box = engineBox({ usage: claude(50), extUsage: plans({ codex: 20 }), ready: [issue(11)] });
  box.put('start-fails', '');
  const out = tick(box);
  assert.match(out, /ENG-11: claim or engine start failed, reconciling/);
  assert.match(out, /ENG-11: its engine failed to start, so it goes to b instead/);
  assert.match(out, /ENG-11: dispatched to b\/w0/);
  assert.equal(claudeBriefs(box).length, 1);
  assert.equal(ticket(box, 'ENG-11').account, 'b');
  assert.equal(ticket(box, 'ENG-11').driver, undefined);
});
