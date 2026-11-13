// Cases a pre-push review found: a requeue must not lose that an engine built the branch, or the PR it opened; a
// round on a ticket waiting for the orchestrator must find a free slot first; and the green path must read a round an
// interrupted tick started before it hands the PR on.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CLAUDE_T, ENGINE_T, HEAD, OLD, ROOM, engineBox, mergeRequest, merges, starts, tick, ticket } from './engine-sandbox.mjs';

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
