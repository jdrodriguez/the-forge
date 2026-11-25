// Burst slots, holdNewWork, per-account caps, the weekly reserve, and the model switches (modelBySize, Fable, burn).
// Runs the real dispatcher in capacity-sandbox.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { acct, briefs, busy, capBox, dispatches, ended, heartbeat, live, ready, run, state, tick } from './capacity-sandbox.mjs';

const labels = (box) => dispatches(box).map((d) => d.label);
const models = (box) => dispatches(box).map((d) => d.model);

// --- burst slots ---------------------------------------------------------------------------------------------------

// One regular slot, held by a busy worker, and two burst slots. Four cores and maxLoadPerCore 2 put the burst's load
// line at 4 (half of 8), and minMemoryFreePercent 10 puts its memory line at 20%.
const BURST = { maxWorkers: 1, burstWorkers: 2, maxLoadPerCore: 2, minMemoryFreePercent: 10 };
const fullOfOne = (host = BURST, more = {}) => capBox({ host, tickets: { 'ENG-1': live(1) }, prs: { 1: { branch: 'agent/eng-1', merge: 'BLOCKED' } },
  ps: [busy(1)], readyList: [ready(11), ready(12), ready(13)], ...more });

test('a full machine with low load and plenty of memory starts the next tickets in its burst slots, and no more', () => {
  const box = fullOfOne();
  const out = tick(box, { FAKE_LOAD: '1', FAKE_FREE: '80' });
  assert.match(out, /ENG-11: dispatched to b\/w0, using a burst slot: load 1 of 8, 80% memory free/);
  assert.match(out, /ENG-12: dispatched to b\/w1, using a burst slot/);
  assert.equal(dispatches(box).length, 2);
  assert.equal(state(box).tickets['ENG-13'], undefined);
});

test('the same machine under load, or short of memory, starts nothing and says why the burst is closed', () => {
  const loaded = fullOfOne();
  assert.match(tick(loaded, { FAKE_LOAD: '5', FAKE_FREE: '80' }), /no slots for 3 ready: .*burst closed: load 5 is not under 4/);
  assert.equal(dispatches(loaded).length, 0);
  const short = fullOfOne();
  assert.match(tick(short, { FAKE_LOAD: '1', FAKE_FREE: '15' }), /burst closed: 15% of memory free is under 20%/);
  assert.equal(dispatches(short).length, 0);
});

test('burstWorkers 0 changes nothing, and a drained machine (maxWorkers 0) opens no burst slot however calm it is', () => {
  const none = fullOfOne({ ...BURST, burstWorkers: 0 });
  const out = tick(none, { FAKE_LOAD: '0' });
  assert.doesNotMatch(out, /burst/);
  assert.equal(dispatches(none).length, 0);
  const drained = capBox({ host: { ...BURST, maxWorkers: 0 }, readyList: [ready(11)] });
  tick(drained, { FAKE_LOAD: '0' });
  assert.equal(dispatches(drained).length, 0);
});

test('the Sentry pool takes no burst slot', () => {
  const box = capBox({ host: { ...BURST, maxWorkers: 2, sentryWorkers: 1 }, tickets: { 'ENG-1': live(1, { sentry: true }) },
    prs: { 1: { branch: 'agent/eng-1', merge: 'BLOCKED' } }, ps: [busy(1)], readyList: [ready(11, { labels: ['sentry-triaged'] })] });
  tick(box, { FAKE_LOAD: '0' });
  assert.equal(dispatches(box).length, 0);
});

test('a redispatch by hand on a full machine uses an open burst slot', () => {
  const box = capBox({ host: BURST, tickets: { 'ENG-1': live(1), 'ENG-9': live(9, { status: 'stuck', stuckAt: '2026-11-01T00:00:00Z' }) }, ps: [busy(1)] });
  assert.match(run(box, ['redispatch', 'ENG-9'], { FAKE_LOAD: '5' }), /nothing started.*burst closed/);
  assert.match(run(box, ['redispatch', 'ENG-9'], { FAKE_LOAD: '1' }), /ENG-9: redispatched to b\/w0/);
});

// --- holdNewWork ---------------------------------------------------------------------------------------------------

test('with holdNewWork, a machine with room claims nothing, its heartbeat says so, and a failed worker is still replaced', () => {
  const box = capBox({ dispatcher: { holdNewWork: true }, tickets: { 'ENG-9': live(9, { goneTicks: 1 }) },
    prs: { 9: { branch: 'agent/eng-9', merge: 'BLOCKED' } }, ps: [ended(9, 'failed')], readyList: [ready(11)] });
  const out = tick(box);
  assert.match(out, /1 ready, none claimed: new work is held on every machine \(dispatcher\.holdNewWork\); work already claimed carries on/);
  assert.equal(state(box).tickets['ENG-11'], undefined);
  assert.equal(heartbeat(box).held, true);
  assert.equal(briefs(box).length, 1, 'claimed work carries on');
  assert.match(run(box, ['status']), /new work HELD on every machine/);
});

// --- per-account cap and reserve -----------------------------------------------------------------------------------

test('an account at its own workerCapByAccount takes no new worker; the next account gets it with its own cap', () => {
  const usage = [acct({ label: 'b', all: 95, working: 2 }), acct({ label: 'c', all: 70 })];
  const capped = capBox({ dispatcher: { workerCap: 8, workerCapByAccount: { b: 2 } }, usage, readyList: [ready(11, { size: 'M' })] });
  tick(capped);
  assert.deepEqual(dispatches(capped), [{ label: 'c', model: 'opus', cap: '8' }]);
  const open = capBox({ dispatcher: { workerCap: 8, workerCapByAccount: { b: 3 } }, usage, readyList: [ready(11, { size: 'M' })] });
  tick(open);
  assert.deepEqual(dispatches(open), [{ label: 'b', model: 'opus', cap: '3' }], 'fleet.sh is told the account cap');
  const off = capBox({ dispatcher: { workerCapByAccount: { b: 0, c: 0 } }, usage, readyList: [ready(11)] });
  tick(off);
  assert.equal(dispatches(off).length, 0, 'a cap of 0 takes the account out');
});

const RESERVE = { workerReservePercent: { max: 4, team: 8 }, headroomFloorPercent: 10 };

test('one tick spreads its tickets across accounts by the usage left after each worker reserve', () => {
  const usage = [acct({ label: 'b', all: 50, plan: 'max' }), acct({ label: 'd', all: 45, plan: 'team' })];
  const box = capBox({ host: { maxWorkers: 8 }, dispatcher: RESERVE, usage, readyList: [ready(11), ready(12), ready(13), ready(14)] });
  tick(box);
  // b 50, d 45: b; then b 46: b; then b 42 < d 45: d; then d 37 < b 42: b.
  assert.deepEqual(labels(box), ['b', 'b', 'd', 'b']);
});

test('an account whose running workers already reserve its week takes no new worker', () => {
  const usage = [acct({ label: 'h', all: 40, plan: 'max', working: 7 }), acct({ label: 'd', all: 30, plan: 'team' })];
  const box = capBox({ dispatcher: RESERVE, usage, readyList: [ready(11)] });
  tick(box);
  assert.deepEqual(labels(box), ['d'], 'h has more left, but 40 - 4 x 8 = 8 is under the 10% floor');
});

test('workers another machine runs on the same account count against its reserve, read from its heartbeat', () => {
  const usage = [acct({ label: 'b', all: 30, plan: 'max' }), acct({ label: 'd', all: 25, plan: 'team' })];
  const box = capBox({ dispatcher: { ...RESERVE, enabledHosts: ['host-a', 'host-b'] }, usage, readyList: [ready(11)] });
  fs.mkdirSync(path.join(box.shared, 'heartbeats'), { recursive: true });
  fs.writeFileSync(path.join(box.shared, 'heartbeats/host-b.json'),
    JSON.stringify({ host: 'host-b', at: new Date().toISOString(), accountsWorking: [{ key: 'b@example.com|max', label: 'b', working: 5 }] }));
  tick(box);
  assert.deepEqual(labels(box), ['d'], 'b: 30 - 4 x 6 = 6 with five workers on the other machine');
});

test("the heartbeat carries this machine's working sessions per account while a reserve is set, and not otherwise", () => {
  const usage = [acct({ label: 'c', all: 90, plan: 'team', working: 3 }), acct({ label: 'h', all: 90, plan: 'max' })];
  const box = capBox({ dispatcher: RESERVE, usage });
  tick(box);
  assert.deepEqual(heartbeat(box).accountsWorking, [{ key: 'c@example.com|team', label: 'c', working: 3 }]);
  const plain = capBox({ usage });
  tick(plain);
  assert.equal(heartbeat(plain).accountsWorking, undefined);
});

// --- models --------------------------------------------------------------------------------------------------------

const SONNET = { model: 'opus', modelBySize: { S: 'sonnet' } };

test('a Size S ticket starts on its modelBySize model and a Size M ticket on the regular model', () => {
  const box = capBox({ dispatcher: SONNET, readyList: [ready(11, { size: 'S' }), ready(12, { size: 'M' })] });
  tick(box);
  assert.deepEqual(models(box), ['sonnet', 'opus']);
  assert.equal(state(box).tickets['ENG-11'].model, 'sonnet');
  const plain = capBox({ dispatcher: { model: 'opus' }, readyList: [ready(11, { size: 'S' })] });
  tick(plain);
  assert.deepEqual(models(plain), ['opus'], 'no modelBySize, the regular model');
});

test("a failed Size S worker's replacement runs on the regular model", () => {
  const box = capBox({ dispatcher: SONNET, tickets: { 'ENG-9': live(9, { goneTicks: 1, model: 'sonnet' }) },
    prs: { 9: { branch: 'agent/eng-9', merge: 'BLOCKED' } }, ps: [ended(9, 'failed')] });
  tick(box);
  assert.deepEqual(models(box), ['opus']);
  assert.equal(state(box).tickets['ENG-9'].model, 'opus');
});

test('with model fable, a worker runs Fable while its account may, and modelFallback otherwise', () => {
  const cases = [
    [acct({ all: 80, fable: 97 }), 'fable'],
    [acct({ all: 80, fable: 4 }), 'opus'], // the Fable allowance is spent, and the spent window is no spent week
    [acct({ all: 80 }), 'opus'], // no Fable window
    [acct({ all: 40, fable: 100 }), 'opus'], // more than half the week used (fableMinWeeklyLeftPercent 50)
  ];
  for (const [row, want] of cases) {
    const box = capBox({ dispatcher: { model: 'fable' }, usage: [row], readyList: [ready(11, { size: 'M' })] });
    tick(box);
    assert.deepEqual(models(box), [want], JSON.stringify(row.usage.windows));
  }
  const none = capBox({ dispatcher: { model: 'fable', noFableAccounts: ['b'] }, usage: [acct({ all: 90, fable: 100 })], readyList: [ready(11)] });
  tick(none);
  assert.deepEqual(models(none), ['opus'], 'noFableAccounts wins over model fable');
});

test('fableAccounts picks the model only: Fable while allowed, Size S included, and no place ahead of the others', () => {
  const on = { ...SONNET, fableAccounts: ['h'] };
  const solo = capBox({ dispatcher: on, usage: [acct({ label: 'h', all: 80, fable: 100 })], readyList: [ready(11, { size: 'S' })] });
  tick(solo);
  assert.deepEqual(models(solo), ['fable']);
  const pair = capBox({ dispatcher: on, usage: [acct({ label: 'b', all: 90, fable: 100 }), acct({ label: 'h', all: 60, fable: 100 })], readyList: [ready(11, { size: 'M' })] });
  tick(pair);
  assert.deepEqual(dispatches(pair).map((d) => [d.label, d.model]), [['b', 'opus']]);
  const past = capBox({ dispatcher: on, usage: [acct({ label: 'h', all: 40, fable: 100 })], readyList: [ready(11, { size: 'S' })] });
  tick(past);
  assert.deepEqual(models(past), ['sonnet'], 'past half its week the account runs its usual model');
});

const burnPair = (burnAll, burnFable = 100) => [acct({ label: 'b', all: 90, fable: 100 }), acct({ label: 'g', all: burnAll, fable: burnFable })];
const BURN = { ...SONNET, burnAccounts: ['g'] };

test('a burn account wins the ticket over an account with more usage left, on Fable, Size S included', () => {
  const box = capBox({ dispatcher: BURN, usage: burnPair(60), readyList: [ready(11, { size: 'S' })] });
  tick(box);
  assert.deepEqual(dispatches(box).map((d) => [d.label, d.model]), [['g', 'fable']]);
});

test('a burn account is ranked like any other once its Fable is spent, its burnUntil has passed, or it is under the burn floor', () => {
  for (const [dispatcher, usage] of [[BURN, burnPair(60, 0)], [{ ...BURN, burnUntil: { g: '2020-01-01T00:00:00Z' } }, burnPair(60)], [BURN, burnPair(1)]]) {
    const box = capBox({ dispatcher, usage, readyList: [ready(11, { size: 'M' })] });
    tick(box);
    assert.deepEqual(dispatches(box).map((d) => [d.label, d.model]), [['b', 'opus']]);
  }
  const still = capBox({ dispatcher: { ...BURN, burnUntil: { g: '2999-01-01T00:00:00Z' } }, usage: burnPair(60), readyList: [ready(11, { size: 'M' })] });
  tick(still);
  assert.deepEqual(labels(still), ['g'], 'inside its burnUntil it still burns');
});

test('a no-Fable burn account goes first, the primary account included, on the usual models', () => {
  const usage = [acct({ label: 'b', all: 99, fable: 100 }), acct({ label: 'a', all: 95, fable: 100 })];
  const box = capBox({ dispatcher: { ...SONNET, burnAccounts: ['a'], noFableAccounts: ['a'] }, usage, readyList: [ready(11, { size: 'S' }), ready(12, { size: 'M' })] });
  tick(box);
  assert.deepEqual(dispatches(box).map((d) => [d.label, d.model]), [['a', 'sonnet'], ['a', 'opus']]);
});

test('a burn account is capped by the same reserve', () => {
  const usage = [acct({ label: 'g', all: 30, fable: 100, working: 7 }), acct({ label: 'b', all: 50, fable: 100 })];
  const box = capBox({ dispatcher: { ...BURN, ...RESERVE, burnAccounts: ['g'] }, usage, readyList: [ready(11, { size: 'M' })] });
  tick(box);
  assert.deepEqual(labels(box), ['b'], 'g: 30 - 4 x 8 is under the burn floor');
});
