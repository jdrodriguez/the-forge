// worker-count.test.mjs: node --test worker-count.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlain } from './plain-script.mjs';
const { forgeSlots, burstOpen, holdsRegularSlot } = loadPlain('./worker-count.js');

const q = (host, extra = {}) => ({ live: true, host, status: 'building', ...extra });
const snap = (tickets, machines) => ({ tickets, machines });
const ONE = { host: 'one', maxWorkers: 5 }, TWO = { host: 'two', maxWorkers: 6 };

test('every regular slot holder counts, outside workers that take a slot included', () => {
  const s = forgeSlots(snap([q('one'), q('one'), q('one', { adhoc: true, takesSlot: true }), q('two')], [ONE, TWO]));
  assert.deepEqual([s.used, s.cap, s.over, s.text], [4, 11, 0, '4 of 11 slots']);
  assert.deepEqual(s.machines.map((m) => [m.host, m.used, m.cap]), [['one', 3, 5], ['two', 1, 6]]);
});

test('workers holding no regular slot are left out', () => {
  const none = [q('one', { sentry: true }), q('one', { status: 'merge-asked' }), q('one', { parked: true }), q('one', { waitingForSlot: { pool: 'regular' } }),
    q('one', { adhoc: true, takesSlot: false }), { host: 'one', status: 'merged' }];
  for (const t of none) assert.equal(holdsRegularSlot(t), false, JSON.stringify(t));
  assert.equal(forgeSlots(snap(none, [{ ...ONE, sentryWorkers: 1 }])).used, 0);
});

test('over capacity says by how much, per machine and in all', () => {
  const s = forgeSlots(snap([...Array(6)].map(() => q('one')).concat([q('two')]), [ONE, TWO]));
  assert.deepEqual([s.used, s.cap, s.over], [7, 11, 0]);
  assert.equal(s.machines[0].over, 1);
  const t = forgeSlots(snap([...Array(7)].map(() => q('one')), [ONE]));
  assert.deepEqual([t.used, t.cap, t.over, t.text], [7, 5, 2, '7 of 5 slots']);
});

test('a Sentry worker counts in regular slots only on a machine with no Sentry slots', () => {
  const t = [q('one', { sentry: true })];
  assert.equal(forgeSlots(snap(t, [{ ...ONE, sentryWorkers: 1 }])).used, 0);
  assert.equal(forgeSlots(snap(t, [{ ...ONE, sentryWorkers: 0 }])).used, 1);
});

test('numbers from a machine are read as numbers', () => {
  assert.equal(forgeSlots(snap([], [{ host: 'one', maxWorkers: '5', burstOpen: '2' }])).text, '0 of 7 slots');
  assert.equal(forgeSlots(snap([], [{ host: 'one', maxWorkers: '<b>' }])).text, '0 of 0 slots');
});

test('open burst slots add to capacity; closed ones do not', () => {
  assert.equal(forgeSlots(snap([], [{ ...ONE, burstOpen: 2 }])).cap, 7);
  assert.equal(forgeSlots(snap([], [{ ...ONE, burstOpen: 0 }])).cap, 5);
});

test('burst opens only while load and memory have room, by the dispatcher rule', () => {
  const load = (avg5) => ({ cores: 16, avg5, maxPerCore: 1.5 });
  assert.equal(burstOpen({ burstWorkers: 2, maxWorkers: 6 }, {}, load(5), 60), 2);
  assert.equal(burstOpen({ burstWorkers: 2, maxWorkers: 6 }, {}, load(13), 60), 0, 'load 13 is not under 0.75 x 16');
  assert.equal(burstOpen({ burstWorkers: 2, maxWorkers: 6, minMemoryFreePercent: 20 }, {}, load(5), 39), 0, 'memory under twice the floor');
  assert.equal(burstOpen({ burstWorkers: 2, maxWorkers: 0 }, {}, load(1), 90), 0, 'a wound-down machine opens none');
  assert.equal(burstOpen({ burstWorkers: 0, maxWorkers: 6 }, {}, load(1), 90), 0);
  assert.equal(burstOpen({ burstWorkers: 2, maxWorkers: 6, burstLoadPerCore: 0.2 }, {}, load(5), 90), 0, 'the host setting wins');
  assert.equal(burstOpen({ burstWorkers: 2, maxWorkers: 6 }, {}, null, 90), 0, 'no load reading opens none');
});

test('an empty or missing snapshot reads as nothing', () => {
  assert.deepEqual(forgeSlots(null), { used: 0, cap: 0, over: 0, text: '0 of 0 slots', machines: [] });
});
