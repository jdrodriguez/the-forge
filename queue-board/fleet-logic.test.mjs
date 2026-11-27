import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlain } from './plain-script.mjs';
const { acctReading, acctFlag, burstWords, tickWords } = loadPlain('./fleet-logic.js');

const snap = {
  machines: [
    { host: 'A', signedOut: ['c'], accounts: [
      { label: 'b', email: 'b@x', plan: 'Max', signedIn: true, usageAt: '2026-11-25T10:00:00Z', weekly: { used: 40, resetsAt: 'R1' }, fiveHour: null },
      { label: 'c', email: 'c@x', plan: 'Team', signedIn: false, usageAt: '2026-11-25T12:00:00Z', weekly: { used: 1 } },
    ] },
    { host: 'B', accounts: [
      { label: 'b', email: 'b@x', plan: 'Max', signedIn: true, usageAt: '2026-11-25T11:00:00Z', weekly: { used: 95.4, resetsAt: 'R2' }, fiveHour: { used: 10 } },
      { label: 'c', email: 'c@x', plan: 'Team', signedIn: true, usageAt: '2026-11-25T09:00:00Z', weekly: { used: 20 } },
    ] },
  ],
};

test('an account reads its freshest signed-in reading across machines', () => {
  const b = acctReading(snap, 'b');
  assert.deepEqual([b.email, b.plan, b.weekLeft, b.weekResets, b.fiveLeft, b.fiveLimit], ['b@x', 'Max', 5, 'R2', 90, true]);
  assert.deepEqual(b.signedOutOn, []);
});
test('a signed-out copy never wins the reading, and its machine is named', () => {
  const c = acctReading(snap, 'c');
  assert.equal(c.weekLeft, 80);
  assert.deepEqual(c.signedOutOn, ['A']);
});
test('an account no machine has reads as nothing', () => {
  const z = acctReading(snap, 'z');
  assert.deepEqual([z.email, z.weekLeft, z.fiveLimit], [null, null, false]);
});

test('the row mark: taken out, then signed out where it runs, then past 90%', () => {
  const hot = new Set(['b', 'c']);
  assert.deepEqual(acctFlag({ label: 'c', out: { since: 'x' }, on: [] }, acctReading(snap, 'c'), hot), { text: 'taken out', sev: '' });
  assert.deepEqual(acctFlag({ label: 'c', on: ['A', 'B'] }, acctReading(snap, 'c'), hot, (h) => `realm ${h}`), { text: 'signed out on realm A', sev: 'bad' });
  // Signed out only on a machine that does not use it: not the row's mark.
  assert.deepEqual(acctFlag({ label: 'c', on: ['B'] }, acctReading(snap, 'c'), hot), { text: 'past 90%', sev: 'warn' });
  assert.equal(acctFlag({ label: 'b', on: ['A'] }, acctReading(snap, 'b'), new Set()), null);
});

test('burst slots in words', () => {
  const load = (avg5) => ({ cores: 10, avg5, maxPerCore: 1.5 });
  assert.equal(burstWords({ burstWorkers: 0 }), 'off');
  assert.equal(burstWords({ burstWorkers: 2, maxWorkers: 0 }), 'closed while wound down');
  assert.equal(burstWords({ burstWorkers: 2, maxWorkers: 6, burstOpen: 2 }), 'open');
  assert.equal(burstWords({ burstWorkers: 2, maxWorkers: 6, burstOpen: 0, load: load(20), memFreePercent: 70 }), 'closed, load is high');
  assert.equal(burstWords({ burstWorkers: 2, maxWorkers: 6, burstOpen: 0, load: load(2), memFreePercent: 30 }), 'closed, memory is low');
  assert.equal(burstWords({ burstWorkers: 2, maxWorkers: 6, burstOpen: 0 }), 'closed, no reading');
});

test('the band says when it ticked, and the heartbeat only when stale', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const dur = (ms) => `${Math.round(ms / 60000)}m`;
  assert.equal(tickWords({ lastTick: '2026-11-25T11:54:00Z', heartbeat: { at: '2026-11-25T11:50:00Z' } }, now, 20, dur), 'ticked 6m ago');
  assert.equal(tickWords({ lastTick: '2026-11-25T11:54:00Z', heartbeat: { at: '2026-11-25T11:00:00Z' } }, now, 20, dur), 'ticked 6m ago, heartbeat 60m old');
  assert.equal(tickWords({}, now, 20, dur), 'never ticked');
});
