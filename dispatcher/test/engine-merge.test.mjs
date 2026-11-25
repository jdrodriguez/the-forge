// The merge rules for engine PRs: a green one goes to the orchestrator and never merges through the dispatcher, one
// that merged without the orchestrator raises an alarm, and a redispatch to Claude keeps the PR on the same path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGINE_T, HEAD, ROOM, argOf, asks, claudeBriefs, engineBox, extCalls, labelOps, mergeRequest, merges, mutations, run, starts, tick,
  ticket } from './engine-sandbox.mjs';

test('a green engine PR goes to the orchestrator with who built it, and the dispatcher never merges it', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' }, pr: {} });
  const out = tick(box);
  assert.match(out, /ENG-9: green, built and driven by codex, no Claude review yet, sent to the orchestrator to review and merge/);
  const req = mergeRequest(box);
  assert.equal(req.driver, 'engine');
  assert.equal(req.engine, 'codex');
  assert.equal(req.review, 'built and driven by codex, no Claude review yet');
  assert.equal(req.head, HEAD);
  assert.equal(req.pr, 7);
  assert.deepEqual(req.risky, [], 'no reviewed paths, and it still goes to the orchestrator');
  assert.equal(ticket(box).status, 'merge-asked');
  tick(box);
  assert.equal(merges(box).length, 0, 'never merged here');
  assert.equal(ticket(box).status, 'merge-asked');
});

test('a green engine PR is held while its round still runs', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'busy' }, pr: {} });
  tick(box);
  assert.equal(mergeRequest(box), null);
  assert.equal(merges(box).length, 0);
  assert.equal(ticket(box).status, 'building');
  assert.match(ticket(box).note, /green, waiting for its Codex round to end/);
});

test('an engine PR that shows merged without ever being sent to the orchestrator raises an alarm and still moves to Verifying', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' }, pr: { state: 'MERGED', mergeCommit: { oid: 'def4567890' } } });
  const out = tick(box);
  assert.match(out, /ENG-9: ALERT: PR https:\/\/github\.com\/your-org\/your-app\/pull\/7 was merged while codex drove it/);
  assert.ok(extCalls(box).some((a) => a[0] === 'stop' && a[1] === 'ENG-9'), 'the run is stopped');
  const [a] = asks(box);
  assert.match(argOf(a, '--ask'), /codex most likely merged it itself/);
  const t = ticket(box);
  assert.equal(t.status, 'merged');
  assert.ok(t.mergedWithoutReview);
  assert.ok(mutations(box).some((m) => m.op === 'issueUpdate' && m.s === 's-ver'), 'moved to Verifying');
});

test('an engine PR the orchestrator merged after merge-asked raises no alarm', () => {
  const asked = { ...ENGINE_T, status: 'merge-asked', prNumber: 7, riskySha: HEAD };
  const box = engineBox({ tickets: { 'ENG-9': asked }, registry: { status: 'done' }, pr: { state: 'MERGED', mergeCommit: { oid: 'def4567890' } } });
  const out = tick(box);
  assert.doesNotMatch(out, /ALERT/);
  assert.equal(asks(box).length, 0);
  assert.equal(ticket(box).status, 'merged');
});

test('redispatch gives a stuck engine ticket to a Claude worker kept out of the engine checkout, and its green PR still goes to the orchestrator', () => {
  const stuck = { ...ENGINE_T, status: 'stuck', round: 5, reason: '5 engine rounds ran' };
  const box = engineBox({ usage: ROOM, tickets: { 'ENG-9': stuck }, registry: { status: 'done' } });
  const out = run(box, ['redispatch', 'ENG-9']);
  assert.match(out, /ENG-9: redispatched to b\/w0/);
  assert.equal(starts(box).length, 0, 'no engine round');
  const [b] = claudeBriefs(box);
  assert.match(b, /^The previous worker on ENG-9 was codex, an engine worker, and its checkout at \S+\/eng-9 holds engine-written code, git hooks and dependencies\. Never run anything in it/);
  assert.match(b, /cut your own worktree, under a different name, from origin\/agent\/eng-9/);
  assert.match(b, /Continue the work on ENG-9 from origin\/agent\/eng-9/);
  let t = ticket(box);
  assert.equal(t.status, 'building');
  assert.equal(t.driver, undefined);
  assert.equal(t.engine, undefined);
  assert.equal(t.round, undefined);
  assert.equal(t.account, 'b');
  assert.equal(t.workerId, 'w0');
  assert.deepEqual(t.engineHistory.map((h) => [h.engine, h.rounds]), [['codex', 5]]);
  assert.deepEqual(labelOps(box), ['+L-agent-building', '-L-agent-ready', '-L-agent-stuck']);

  box.put('pr.json', {});
  box.put('ps.json', [{ label: 'b', id: 'w0', status: 'idle', kind: 'background' }]);
  tick(box);
  const req = mergeRequest(box);
  assert.match(req.review, /^built by codex and finished by a Claude worker/);
  assert.equal(req.driver, undefined);
  t = ticket(box);
  assert.equal(t.status, 'merge-asked');
  tick(box);
  assert.equal(merges(box).length, 0, 'never merged here');
});

test('redispatch refuses while the engine run is still busy', () => {
  const box = engineBox({ usage: ROOM, tickets: { 'ENG-9': { ...ENGINE_T, status: 'stuck' } }, registry: { status: 'busy' } });
  const out = run(box, ['redispatch', 'ENG-9']);
  assert.match(out, /ENG-9: its codex run e-old is still busy; stop it first with ext-worker\.sh stop ENG-9/);
  assert.equal(claudeBriefs(box).length, 0);
  assert.equal(ticket(box).driver, 'engine');
});
