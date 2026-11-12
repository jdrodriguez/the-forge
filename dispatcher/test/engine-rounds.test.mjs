// Engine rounds after the first: a round that ended with something a push can fix starts the next one with a note
// built from GitHub; checks still running start none; an unrequested re-review gets a label instead of a round; the
// round cap makes the ticket stuck; a question goes to the human and the answer starts the next round.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGINE_T, HEAD, argOf, asks, comments, engineBox, extBriefs, labelOps, lines, starts, tick, ticket } from './engine-sandbox.mjs';

const FAILING = [
  { __typename: 'CheckRun', name: 'Claude Code Review', status: 'COMPLETED', conclusion: 'SUCCESS' },
  { __typename: 'CheckRun', name: 'test-api', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://github.com/your-org/your-app/actions/runs/111/job/222' },
];
const LOG = Array.from({ length: 100 }, (_, i) => `test-api\tRun tests\tlog line ${i + 1}`).join('\n');
const THREAD = { id: 'PRRT_1', isResolved: false, isOutdated: false, path: 'src/x.ts', line: 42, comments: { nodes: [{ body: 'Guard the empty list.', author: { login: 'review-bot' } }] } };

test('a done worker with a failing check and an open thread starts round 2 with --continue, the log tail and the thread', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' }, pr: { mergeStateStatus: 'UNSTABLE', statusCheckRollup: FAILING }, threads: [THREAD] });
  box.put('log-222.txt', LOG);
  const out = tick(box);
  assert.match(out, /ENG-9: started codex round 2 as e0: fix 1 failing check\(s\): test-api; address 1 review thread\(s\)/);
  const [s] = starts(box);
  assert.deepEqual(s.slice(0, 4), ['start', 'codex', 'ENG-9', 'agent/eng-9']);
  assert.ok(s.includes('--continue'));
  const [b] = extBriefs(box);
  assert.match(b, /Round 2 of at most 5 on ENG-9 \(`agent\/eng-9`, PR https:\/\/github\.com\/your-org\/your-app\/pull\/7 at abc1234567\)/);
  assert.match(b, /## Failing check: test-api \(FAILURE\)/);
  assert.match(b, /log line 100\n/);
  assert.match(b, /log line 21\n/);
  assert.doesNotMatch(b, /log line 20\n/, 'only the last 80 lines');
  assert.match(b, /`src\/x\.ts:42`, thread PRRT_1, by review-bot\n {2}> Guard the empty list\./);
  assert.ok(lines(box, 'gh-log').some((l) => l.includes('run view --job 222 --log-failed')));
  const t = ticket(box);
  assert.equal(t.round, 2);
  assert.equal(t.workerId, 'e0');
  assert.equal(t.engineStatus, 'busy');
  assert.equal(t.status, 'building');
  assert.match(comments(box).at(-1), /round 2 for Codex \(codex\/e0\): fix 1 failing check/);
});

test('a done worker with no PR gets a round that opens the PR', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' } });
  assert.match(tick(box), /ENG-9: started codex round 2 as e0: open the PR/);
  assert.match(extBriefs(box)[0], /## Open the PR\n\nThe last round ended without a pull request on `agent\/eng-9`/);
  assert.equal(ticket(box).round, 2);
});

test('checks still running start no round', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' }, pr: { mergeStateStatus: 'BLOCKED', statusCheckRollup: [
    ...FAILING, { __typename: 'CheckRun', name: 'test-web', status: 'IN_PROGRESS', conclusion: '' }] } });
  tick(box);
  assert.equal(starts(box).length, 0);
  const t = ticket(box);
  assert.equal(t.round, 1);
  assert.equal(t.engineStatus, 'done');
  assert.equal(t.status, 'building');
  assert.equal(t.goneTicks, 1, 'the stall rules read the ended run');
});

const RERUN = [{ __typename: 'CheckRun', name: 'Claude Code Review', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://github.com/your-org/your-app/runs/999' }];
const rerunAdds = (box) => lines(box, 'gh-log').filter((l) => l.startsWith('pr edit 7') && l.includes('--add-label review:rerun'));

test('a review check that failed only with "Re-review not requested" gets the rerun label once per head and no round', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' }, pr: { mergeStateStatus: 'BLOCKED', statusCheckRollup: RERUN } });
  box.put('check-run.json', { output: { title: 'Re-review not requested: this head has no review' } });
  tick(box);
  assert.equal(starts(box).length, 0);
  assert.equal(rerunAdds(box).length, 1);
  assert.equal(ticket(box).rerunAsk.sha, HEAD);
  assert.equal(ticket(box).round, 1);
  tick(box);
  assert.equal(rerunAdds(box).length, 1, 'the same head is not asked again');
  assert.equal(starts(box).length, 0);
});

test('a review check that failed for another reason is a failing check for the next round', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'done' }, pr: { mergeStateStatus: 'BLOCKED', statusCheckRollup: RERUN } });
  box.put('check-run.json', { output: { title: '2 findings posted' } });
  tick(box);
  assert.equal(rerunAdds(box).length, 0);
  assert.match(extBriefs(box)[0], /## Failing check: Claude Code Review \(FAILURE\)/);
});

test('a round due at maxRounds marks the ticket stuck and says a redispatch hands it to Claude', () => {
  const box = engineBox({ tickets: { 'ENG-9': { ...ENGINE_T, round: 5 } }, registry: { status: 'done' }, pr: { mergeStateStatus: 'UNSTABLE', statusCheckRollup: FAILING } });
  tick(box);
  assert.equal(starts(box).length, 0);
  const t = ticket(box);
  assert.equal(t.status, 'stuck');
  assert.match(t.reason, /5 engine rounds ran and it still needs another \(fix 1 failing check\(s\): test-api\); `dispatcher\.mjs redispatch ENG-9` hands it to a Claude worker/);
  assert.ok(labelOps(box).includes('+L-agent-stuck'));
  assert.equal(asks(box).length, 1);
});

test("a blocked worker's question is relayed once, and once answered the next round starts with the answer", () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'blocked', question: 'Which timezone do the counts use?' }, pr: { mergeStateStatus: 'BLOCKED' } });
  tick(box);
  const [a] = asks(box);
  assert.deepEqual(a.slice(0, 6), ['ask', 'ENG-9', '--type', 'blocked', '--from', 'the Codex engine worker on host-a']);
  assert.match(argOf(a, '--ask'), /The Codex engine worker building ENG-9 stopped with a question: Which timezone do the counts use\?/);
  assert.equal(argOf(a, '--default'), 'the ticket waits');
  assert.ok(ticket(box).engineAsk.sent);
  tick(box);
  assert.equal(asks(box).length, 1, 'asked once');
  assert.equal(starts(box).length, 0, 'waits for the answer');
  assert.match(ticket(box).note, /waiting on the human's answer/);
  box.put('answer', 'ANSWERED\nUse the firm timezone.');
  tick(box);
  assert.equal(starts(box).length, 1);
  const [b] = extBriefs(box);
  assert.match(b, /## Your question\n\nWhich timezone do the counts use\?/);
  assert.match(b, /## The answer\n\nUse the firm timezone\./);
  assert.equal(ticket(box).round, 2);
  tick(box);
  assert.equal(asks(box).length, 1);
  assert.equal(starts(box).length, 1, 'the new round is busy, so nothing more starts');
});

test('a question still waits while the ticket carries needs-human, even with an answer on file', () => {
  const box = engineBox({ tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'blocked', question: 'Which one?' }, pr: { mergeStateStatus: 'BLOCKED' } });
  tick(box);
  box.put('labeled-needs-human.json', ['ENG-9']);
  box.put('answer', 'ANSWERED\nThis one.');
  tick(box);
  assert.equal(starts(box).length, 0);
  assert.match(ticket(box).note, /waiting on the human's answer/);
});
