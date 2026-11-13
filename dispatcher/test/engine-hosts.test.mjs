// hosts.<name>.engines: which engines may run on one machine, out of fallback.engines. Absent means all of them, a list
// narrows them, and an empty list means none. It holds wherever an engine is chosen: the account rows, the next round
// and the handoff to the other engine on a plan limit. Runs the real dispatcher in engine-sandbox.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGINE_T, claude, claudeBriefs, engineBox, extCalls, issue, plans, starts, tick, ticket } from './engine-sandbox.mjs';

const BOTH = ['codex', 'grok'];
const GROK_LEADS = plans({ codex: 60, grok: 10 }); // Grok has 90% of its week left, Codex 40%

test('a host that lists only Codex never starts Grok, even when Grok has the most usage left', () => {
  const box = engineBox({ engines: BOTH, host: { engines: ['codex'] }, extUsage: GROK_LEADS, ready: [issue(11)] });
  tick(box);
  assert.deepEqual(starts(box).map((s) => s[1]), ['codex']);
  assert.equal(extCalls(box).some((a) => a[0] === 'available' && a[1] === 'grok'), false, 'Grok is not even asked about');
});

test('a host with an empty list starts no engine, and its ticket goes to a Claude account', () => {
  const box = engineBox({ engines: BOTH, host: { engines: [] }, usage: claude(50), extUsage: GROK_LEADS, ready: [issue(11)] });
  const out = tick(box);
  assert.equal(starts(box).length, 0);
  assert.match(out, /ENG-11: dispatched to b\/w0/);
  assert.equal(claudeBriefs(box).length, 1);
  assert.equal(ticket(box, 'ENG-11').driver, undefined);
});

test('a host with no engines key runs every engine in fallback.engines, as before', () => {
  const box = engineBox({ engines: BOTH, extUsage: GROK_LEADS, ready: [issue(11)] });
  tick(box);
  assert.deepEqual(starts(box).map((s) => s[1]), ['grok']);
});

test('a Codex limit on a host that lists only Codex does not hand the round to Grok: the ticket goes back to the queue', () => {
  const box = engineBox({ engines: BOTH, host: { engines: ['codex'] }, tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'limit' },
    pr: { mergeStateStatus: 'DIRTY' } });
  const out = tick(box);
  assert.equal(starts(box).length, 0, 'no round on Grok');
  assert.match(out, /ENG-9: no engine can run its next round on host-a \(codex hit its limit\), so it went back to the queue/);
  assert.equal(ticket(box), undefined);
});
