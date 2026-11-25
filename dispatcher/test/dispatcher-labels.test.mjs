// Queue labels after a replacement and a merge, and a bundle lead taken out of its bundle: a replacement swaps
// agent-ready for agent-building as a claim does, a merge removes agent-ready too, a lead whose bundle PR merged without
// it (its ID not in the PR title, and back to agent-ready) leaves state instead of being marked merged, and a read-only
// check lists tickets in Verifying or done that still carry a queue label. Runs the real dispatcher in capacity-sandbox.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OLD, capBox, lines, live, run, state, tick } from './capacity-sandbox.mjs';

const mutations = (box) => lines(box, 'mutations').map((l) => JSON.parse(l));
const ops = (box) => mutations(box).filter((m) => m.l).map((m) => `${m.op === 'issueAddLabel' ? '+' : '-'}${m.l}`);
const bundle = (title) => capBox({
  tickets: { 'ENG-9': live(9, { prNumber: 9, bundle: ['ENG-10'] }),
    'ENG-10': { status: 'bundled', bundledInto: 'ENG-9', branch: 'agent/eng-9', account: 'b', workerId: 'w-9', workerName: 'queue-eng-9', claimedAt: OLD } },
  prs: { 9: { branch: 'agent/eng-9', state: 'MERGED', title } },
});

test('a redispatch swaps agent-ready for agent-building, and takes agent-stuck off a stuck ticket', () => {
  const box = capBox({ tickets: { 'ENG-9': live(9, { status: 'stuck', stuckAt: OLD }) } });
  assert.match(run(box, ['redispatch', 'ENG-9']), /ENG-9: redispatched/);
  const got = ops(box);
  for (const want of ['+L-agent-building', '-L-agent-ready', '-L-agent-stuck']) assert.ok(got.includes(want), `${want} in ${got}`);
});

test('a redispatch of a ticket that is not stuck leaves agent-stuck alone', () => {
  const box = capBox({ tickets: { 'ENG-9': live(9) } });
  run(box, ['redispatch', 'ENG-9']);
  assert.deepEqual(ops(box).sort(), ['+L-agent-building', '-L-agent-ready']);
});

test('a merge removes agent-ready as well as agent-building', () => {
  const box = capBox({ tickets: { 'ENG-9': live(9, { prNumber: 9 }) }, prs: { 9: { branch: 'agent/eng-9', state: 'MERGED' } } });
  tick(box);
  assert.equal(state(box).tickets['ENG-9'].status, 'merged');
  const got = ops(box);
  assert.ok(got.includes('-L-agent-building') && got.includes('-L-agent-ready'), got.join(' '));
});

test('a bundle lead taken out of its bundle leaves state when the bundle PR merges without it; its companion is merged', () => {
  const box = bundle('ENG-10: the companion only');
  box.put('issue-labels.json', { 'ENG-9': ['agent-ready'] });
  const out = tick(box);
  assert.match(out, /ENG-9: its bundle PR #9 merged without it .* so it leaves this machine's state/);
  const st = state(box);
  assert.equal(st.tickets['ENG-9'], undefined);
  assert.equal(st.tickets['ENG-10'].status, 'merged');
  assert.ok(!mutations(box).some((m) => m.i === 'uuid-9' && m.op === 'issueUpdate'), 'ENG-9 is not moved to Verifying');
});

test('a bundle lead still named in the merged PR title is merged as before', () => {
  const box = bundle('ENG-9 + ENG-10: both');
  box.put('issue-labels.json', { 'ENG-9': ['agent-ready'] });
  tick(box);
  assert.equal(state(box).tickets['ENG-9'].status, 'merged');
});

test('a bundle lead left out of the title but still building is merged as before', () => {
  const box = bundle('ENG-10: the companion only');
  box.put('issue-labels.json', { 'ENG-9': ['agent-building'] });
  tick(box);
  assert.equal(state(box).tickets['ENG-9'].status, 'merged');
});

test('tickets in Verifying or done that still carry a queue label are listed once a tick, and nothing is changed', () => {
  const box = capBox({});
  box.put('label-check.json', [{ identifier: 'ENG-7', state: { name: 'Verifying' }, labels: { nodes: [{ name: 'agent-ready' }] } },
    { identifier: 'ENG-8', state: { name: 'Done' }, labels: { nodes: [{ name: 'agent-building' }, { name: 'bug' }] } }]);
  const out = tick(box);
  assert.match(out, /label check: ENG-7 is Verifying and still labeled agent-ready/);
  assert.match(out, /label check: ENG-8 is Done and still labeled agent-building/);
  assert.equal(ops(box).length, 0);
});
