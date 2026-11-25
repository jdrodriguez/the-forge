// The hard limit and the wake queue: nothing automatic starts, respawns or wakes a session over hosts.<name>.maxWorkers
// (or sentryWorkers). A ticket that needs to work on a full machine waits in the wake queue, first come first served,
// and `dispatcher.mjs wake ENG-123` pushes one through once. Runs the real dispatcher in capacity-sandbox.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { OLD, HEAD, briefs, busy, capBox, editState, ended, heartbeat, lines, live, queueIds, ready, run, state, tick } from './capacity-sandbox.mjs';

// A full machine: two slots, both held by building tickets whose workers are busy and whose PRs are not green.
const BLOCKED = (n) => ({ branch: `agent/eng-${n}`, merge: 'BLOCKED' });
const FULL = { 'ENG-1': live(1), 'ENG-2': live(2) };
const FULL_PS = [busy(1), busy(2)];
const FULL_PRS = { 1: BLOCKED(1), 2: BLOCKED(2) };
// A ticket whose worker's session failed a tick ago: the next tick replaces it, given a slot.
const failing = (n) => live(n, { goneTicks: 1 });
const asks = (box) => lines(box, 'asks').filter((l) => l.startsWith('ask '));

test('a failed worker on a full machine waits in the wake queue: no replacement, never stuck, listed in the heartbeat', () => {
  const box = capBox({ tickets: { ...FULL, 'ENG-9': failing(9) }, prs: { ...FULL_PRS, 9: BLOCKED(9) }, ps: [...FULL_PS, ended(9, 'failed')] });
  const first = tick(box);
  assert.match(first, /ENG-9: needs to work again \(its worker b\/w-9 failed\), but this machine is full \(2\/2 slots in use\), so it waits in the wake queue/);
  for (let i = 0; i < 3; i += 1) tick(box);
  const st = state(box);
  assert.deepEqual(queueIds(box), ['ENG-9']);
  assert.equal(st.tickets['ENG-9'].status, 'building', 'it waits, never stuck');
  assert.match(st.tickets['ENG-9'].note, /^waiting for a free slot/);
  assert.equal(briefs(box).length, 0, 'no replacement worker while it waits');
  assert.equal(asks(box).length, 0, 'no stall or stuck ask for the wait');
  assert.deepEqual(heartbeat(box).wakeQueue.map((w) => w.id), ['ENG-9']);
  // ENG-2 merges and its worker ends: ENG-9 wakes and its replacement starts.
  editState(box, (s) => { s.tickets['ENG-2'].status = 'merged'; });
  box.put('ps.json', [busy(1), ended(9, 'failed')]);
  assert.match(tick(box), /ENG-9: a slot is free \(1\/2 in use\), so it wakes after \d+ minutes in the wake queue/);
  assert.equal(briefs(box).length, 1);
  assert.deepEqual(queueIds(box), []);
});

test('a waiting ticket takes a freed slot ahead of a new ready ticket', () => {
  const box = capBox({ tickets: { ...FULL, 'ENG-9': failing(9) }, prs: { ...FULL_PRS, 9: BLOCKED(9) }, ps: [...FULL_PS, ended(9, 'failed')], readyList: [ready(20)] });
  assert.match(tick(box), /no slots for 1 ready: .*3\/2 on this machine.*\(1 waiting for a slot\)/);
  editState(box, (s) => { s.tickets['ENG-2'].status = 'merged'; });
  box.put('ps.json', [busy(1), ended(9, 'failed')]);
  const out = tick(box);
  assert.match(out, /ENG-9: a slot is free \(1\/2 in use\), so it wakes/);
  assert.doesNotMatch(out, /ENG-20: dispatched/);
  assert.equal(state(box).tickets['ENG-20'], undefined);
});

test('two waiting tickets wake in the order they started waiting', () => {
  const box = capBox({ host: { maxWorkers: 1 }, tickets: { 'ENG-1': live(1), 'ENG-8': live(8, { goneTicks: 2 }), 'ENG-9': live(9, { goneTicks: 2 }) },
    prs: { 1: BLOCKED(1), 8: BLOCKED(8), 9: BLOCKED(9) }, ps: [busy(1), ended(8, 'failed'), ended(9, 'failed')],
    wakeQueue: [{ id: 'ENG-9', since: '2026-11-18T01:00:00Z', reason: 'x', pool: 'regular' }, { id: 'ENG-8', since: '2026-11-18T02:00:00Z', reason: 'x', pool: 'regular' }] });
  tick(box);
  assert.deepEqual(queueIds(box), ['ENG-9', 'ENG-8'], 'nothing wakes on a full machine, and the order holds');
  editState(box, (s) => { s.tickets['ENG-1'].status = 'merged'; });
  box.put('ps.json', [ended(8, 'failed'), ended(9, 'failed')]);
  const out = tick(box);
  assert.match(out, /ENG-9: a slot is free \(0\/1 in use\), so it wakes/);
  assert.doesNotMatch(out, /ENG-8: a slot is free/);
  assert.deepEqual(queueIds(box), ['ENG-8'], 'the later one keeps waiting');
});

test('a wake override pushes one waiting ticket through over the limit, exactly once, and is cleared', () => {
  const box = capBox({ host: { maxWorkers: 1 }, tickets: { 'ENG-1': live(1), 'ENG-8': failing(8), 'ENG-9': failing(9) },
    prs: { 1: BLOCKED(1), 8: BLOCKED(8), 9: BLOCKED(9) }, ps: [busy(1), ended(8, 'failed'), ended(9, 'failed')] });
  tick(box);
  assert.deepEqual(queueIds(box), ['ENG-8', 'ENG-9']);
  const said = run(box, ['wake', 'ENG-9']);
  assert.match(said, /ENG-9 waits in host-a's wake queue since .*Override recorded: host-a's next tick .*wakes it over the limit, once, and clears the request/);
  const file = path.join(box.shared, 'wake-requests/ENG-9.json');
  assert.ok(fs.existsSync(file));
  const out = tick(box);
  assert.match(out, /ENG-9: a wake override pushes it through over the limit \(1\/1 slots in use without it\)/);
  assert.doesNotMatch(out, /ENG-8: a slot is free|ENG-8: a wake override/);
  assert.equal(briefs(box).length, 1, 'its replacement started');
  assert.deepEqual(queueIds(box), ['ENG-8']);
  assert.ok(!fs.existsSync(file), 'honoured once and cleared');
  assert.doesNotMatch(tick(box), /override/);
  assert.equal(briefs(box).length, 1, 'nothing else goes over the limit');
});

test('an override for a ticket that does not wait for a slot is cleared unused', () => {
  const box = capBox({ tickets: { 'ENG-1': live(1) }, prs: { 1: BLOCKED(1) }, ps: [busy(1)] });
  assert.match(run(box, ['wake', 'ENG-1']), /ENG-1 is building on host-a and does not wait for a slot/);
  assert.match(tick(box), /ENG-1: cleared the wake override unused, since it does not wait for a slot \(building\)/);
  assert.ok(!fs.existsSync(path.join(box.shared, 'wake-requests/ENG-1.json')));
});

test('a new dispatch counts the busy worker of a ticket that holds no slot', () => {
  // ENG-9 waits on the orchestrator's merge, so it holds no slot, but its worker is busy.
  const box = capBox({ tickets: { 'ENG-1': live(1), 'ENG-9': live(9, { status: 'merge-asked', riskySha: HEAD, prNumber: 9 }) },
    prs: { 1: BLOCKED(1), 9: BLOCKED(9) }, ps: [busy(1), busy(9), { label: 'c', id: 'idle-x', status: 'idle', state: 'done', kind: 'background', pid: 5 }],
    readyList: [ready(20)] });
  assert.match(tick(box), /no slots for 1 ready: .*2\/2 on this machine.*\(1 working without a slot\)/);
  assert.equal(state(box).tickets['ENG-20'], undefined);
  box.put('ps.json', [busy(1), { ...ended(9), pid: 109 }]);
  assert.match(tick(box), /ENG-20: dispatched to b\/w0/);
});

test('a drained machine (maxWorkers 0) keeps a ticket that needs a worker waiting until it is restored', () => {
  const box = capBox({ host: { maxWorkers: 0 }, tickets: { 'ENG-9': failing(9) }, prs: { 9: BLOCKED(9) }, ps: [ended(9, 'failed')] });
  assert.match(tick(box), /ENG-9: needs to work again \(its worker b\/w-9 failed\), but this machine is full \(0\/0 slots in use\)/);
  tick(box);
  assert.deepEqual(queueIds(box), ['ENG-9']);
  assert.equal(state(box).tickets['ENG-9'].status, 'building');
});

test('status shows the slots in use and the wake queue', () => {
  const box = capBox({ tickets: { ...FULL, 'ENG-9': failing(9) }, prs: { ...FULL_PRS, 9: BLOCKED(9) }, ps: [...FULL_PS, ended(9, 'failed')] });
  tick(box);
  const out = run(box, ['status']);
  assert.match(out, /slots on host-a: 3\/2 in use/);
  assert.match(out, /wake queue on host-a: ENG-9 for \d+ min: its worker b\/w-9 failed/);
  assert.match(out, /ENG-9 +building .*\(waiting for a slot\)/);
});

test('a redispatch by hand refuses on a full machine, and goes through once with an override', () => {
  const box = capBox({ host: { maxWorkers: 1 }, tickets: { 'ENG-1': live(1), 'ENG-9': live(9, { status: 'stuck', stuckAt: OLD }) }, ps: [busy(1)] });
  assert.match(run(box, ['redispatch', 'ENG-9']), /ENG-9: nothing started, since a redispatch by hand would put host-a over its limit \(1\/1 slots in use without it\)/);
  assert.equal(briefs(box).length, 0);
  assert.deepEqual(queueIds(box), [], 'a refused hand command does not queue the ticket');
  run(box, ['wake', 'ENG-9']);
  assert.match(run(box, ['redispatch', 'ENG-9']), /ENG-9: redispatched to b\/w0/);
  assert.ok(!fs.existsSync(path.join(box.shared, 'wake-requests/ENG-9.json')));
});

test('wake on a machine that does not hold the ticket names the machine whose heartbeat lists it waiting', () => {
  const box = capBox({ dispatcher: { enabledHosts: ['host-a', 'host-b'] } });
  fs.mkdirSync(path.join(box.shared, 'heartbeats'), { recursive: true });
  fs.writeFileSync(path.join(box.shared, 'heartbeats/host-b.json'), JSON.stringify({ host: 'host-b', at: new Date().toISOString(),
    wakeQueue: [{ id: 'ENG-9', since: OLD, reason: 'its worker failed', pool: 'regular' }] }));
  assert.match(run(box, ['wake', 'ENG-9']), /ENG-9 waits in host-b's wake queue since 2026-11-01T00:00:00Z \(its worker failed\), as of its heartbeat at .*host-b's next tick .* wakes it over the limit/);
  tick(box);
  assert.ok(fs.existsSync(path.join(box.shared, 'wake-requests/ENG-9.json')), 'left for the machine that holds it');
});

// Sentry judgment PRs wait on the reviewer (example config: Sam, sam-github-login). A parked ticket gives up its slot.
const JUDGMENT = ['sentry-triaged', 'sentry-human-review'];
const changes = { id: 13, state: 'CHANGES_REQUESTED', body: 'Guard the empty list.', commit_id: HEAD, submitted_at: '2026-11-05T13:00:00Z', login: 'sam-github-login' };

test("a parked ticket with the reviewer's requested changes waits on a full Sentry slot, then gets its worker", () => {
  const box = capBox({ host: { maxWorkers: 0, sentryWorkers: 1 },
    tickets: { 'ENG-3': live(3, { sentry: true }), 'ENG-9': live(9, { sentry: true, parked: OLD, prNumber: 9 }) },
    prs: { 9: { branch: 'agent/eng-9', reviews: [changes] }, 3: BLOCKED(3) }, labels: { 'ENG-9': JUDGMENT, 'ENG-3': JUDGMENT }, ps: [busy(3), ended(9)] });
  assert.match(tick(box), /ENG-9: needs to work again \(Sam requested changes on PR #9\), but this machine is full \(1\/1 Sentry slots in use\)/);
  assert.equal(briefs(box).length, 0);
  assert.equal(state(box).wakeQueue[0].pool, 'sentry');
  editState(box, (s) => { s.tickets['ENG-3'].status = 'merged'; });
  box.put('ps.json', [ended(9)]);
  assert.match(tick(box), /ENG-9: a Sentry slot is free \(0\/1 in use\), so it wakes/);
  assert.equal(briefs(box).length, 1);
  assert.match(briefs(box)[0], /Sam reviewed PR #9 for ENG-9/);
});

test('a green PR waiting on the reviewer is parked, and its busy worker still keeps a new Sentry ticket out', () => {
  const box = capBox({ host: { maxWorkers: 0, sentryWorkers: 1 }, tickets: { 'ENG-9': live(9, { sentry: true, prNumber: 9 }) },
    prs: { 9: { branch: 'agent/eng-9' } }, labels: { 'ENG-9': JUDGMENT }, ps: [busy(9)], readyList: [ready(20, { labels: ['sentry-triaged'] })] });
  const out = tick(box);
  assert.match(out, /ENG-9: waiting on Sam's review, so it gives up its Sentry slot until they answer/);
  assert.ok(state(box).tickets['ENG-9'].parked);
  assert.match(out, /no slots for 1 ready: .*Sentry slot 1\/1.*\(1 working without a slot\)/);
  box.put('ps.json', [{ ...busy(9), status: 'idle', state: 'done' }]);
  assert.match(tick(box), /ENG-20: dispatched to b\/w0 in the Sentry slot/);
});

test('a waiting ticket never jumps a ticket that started waiting before it, even by hand', () => {
  const box = capBox({ tickets: { 'ENG-1': live(1), 'ENG-8': live(8, { goneTicks: 2 }), 'ENG-9': live(9, { goneTicks: 2 }) }, ps: [busy(1), ended(8, 'failed'), ended(9, 'failed')],
    wakeQueue: [{ id: 'ENG-8', since: '2026-11-18T01:00:00Z', reason: 'x', pool: 'regular' }, { id: 'ENG-9', since: '2026-11-18T02:00:00Z', reason: 'x', pool: 'regular' }] });
  assert.match(run(box, ['redispatch', 'ENG-9']), /ENG-9: nothing started/);
  assert.equal(briefs(box).length, 0);
});

test('a redispatch by hand that starts nothing keeps its wake override for the next try', () => {
  const box = capBox({ host: { maxWorkers: 1 }, tickets: { 'ENG-1': live(1), 'ENG-9': live(9, { status: 'stuck', stuckAt: OLD }) }, ps: [busy(1)], usage: [] });
  run(box, ['wake', 'ENG-9']);
  assert.match(run(box, ['redispatch', 'ENG-9']), /no account has a free worker slot/);
  assert.ok(fs.existsSync(path.join(box.shared, 'wake-requests/ENG-9.json')));
});

test('a wake override is not spent when the ticket had room anyway', () => {
  const box = capBox({ tickets: { 'ENG-9': failing(9) }, prs: { 9: BLOCKED(9) }, ps: [ended(9, 'failed')] });
  run(box, ['wake', 'ENG-9']);
  const out = tick(box);
  assert.doesNotMatch(out, /pushes it through/);
  assert.equal(briefs(box).length, 1);
  assert.match(out, /ENG-9: cleared the wake override unused/);
});

test('a wake override whose start fails stands, and is spent by the start that succeeds', () => {
  const box = capBox({ host: { maxWorkers: 1 }, tickets: { 'ENG-1': live(1), 'ENG-9': failing(9) }, prs: { 1: BLOCKED(1), 9: BLOCKED(9) },
    ps: [busy(1), ended(9, 'failed')], usage: [] });
  run(box, ['wake', 'ENG-9']);
  const file = path.join(box.shared, 'wake-requests/ENG-9.json');
  assert.match(tick(box), /ENG-9: a wake override pushes it through/);
  assert.equal(briefs(box).length, 0, 'no account had room, so nothing started');
  assert.ok(fs.existsSync(file), 'the override stands for the next try');
  box.put('usage.json', [{ label: 'b', signed_in: true, working: 0, usage: { available: true, five_hour: null, weekly: { remaining_percentage: 90 } } }]);
  tick(box);
  assert.equal(briefs(box).length, 1);
  assert.ok(!fs.existsSync(file), 'spent by the start');
  tick(box);
  assert.equal(briefs(box).length, 1, 'never a second start over the limit');
});

test('a waiter whose PR cannot be read leaves the queue after wakeQueueMaxReadFailures ticks, and the human hears once', () => {
  const box = capBox({ dispatcher: { wakeQueueMaxReadFailures: 2 }, tickets: { 'ENG-9': live(9, { prNumber: 99 }) }, ps: [ended(9, 'failed')],
    wakeQueue: [{ id: 'ENG-9', since: OLD, reason: 'x', pool: 'regular' }] });
  tick(box);
  assert.deepEqual(queueIds(box), ['ENG-9']);
  assert.match(tick(box), /ENG-9: left the wake queue, its PR could not be read on 2 ticks in a row/);
  assert.deepEqual(queueIds(box), []);
  assert.equal(lines(box, 'asks').filter((l) => /left host-a's wake queue/.test(l)).length, 1);
});
