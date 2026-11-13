// herald.test.mjs: checks the queue herald's event rules (herald-events.mjs) on made-up snapshots, and from sound.mjs
// its settings checks, the cue lengths it reads from the WAV files and its warn-the-board-then-play order. Run: node --test queue-board/herald.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, HORN_REPEAT_MS } from './herald-events.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyUpdate, DEFAULTS, wavSeconds, cueSeconds, playAfterWarning, ALERT_LEAD_MS, CUES } from './sound.mjs';

const T0 = Date.parse('2026-11-07T15:00:00Z');
const MIN = 60_000;
let gen = 0;
const REALMS = { 'main-mac': { key: 'rivendell', name: 'Rivendell', folk: 'elf' }, 'second-mac': { key: 'shire', name: 'The Shire', folk: 'hobbit' },
  'linux-box': { key: 'erebor', name: 'Erebor', folk: 'dwarf' }, 'plains-box': { key: 'rohan', name: 'Rohan', folk: 'man' } };
const machine = (host, name, extra = {}) => ({ host, name, ok: true, paused: null, error: null, fetchedAt: '2026-11-07T14:59:00Z', ...extra });
const live = (id, host, extra = {}) => ({ id, label: id, host, machine: host, live: true, status: 'building', workerState: 'busy', nickname: 'Frodo', title: `Title of ${id}`, ...extra });
function snap(over = {}) {
  gen += 1;
  return {
    generatedAt: new Date(T0 + gen * 1000).toISOString(),
    machines: [machine('main-mac', 'main-mac'), machine('second-mac', 'second'), machine('linux-box', 'box')],
    tickets: [live('ABC-1', 'main-mac')],
    asks: [],
    sessions: { handled: {}, machines: [{ host: 'main-mac', rows: [] }] },
    main: { status: 'green', sha: 'g1' },
    errors: {},
    config: { human: 'Alex', orchestrator: 'Planning', boardHost: 'main-mac', realms: REALMS },
    ...over,
  };
}
// Runs a baseline read of a, then a read of b, and returns b's events.
function diff(a, b, now = T0 + MIN, opts) {
  const first = step(null, a, T0, opts);
  return step(first.state, b, now, opts);
}
const kinds = (out) => out.events.map((e) => e.kind);

test('the first read announces nothing, even with plenty going on', () => {
  const s = snap({ tickets: [live('ABC-1', 'main-mac', { blockedSince: '2026-11-07T14:00:00Z' })], main: { status: 'red', sha: 'r1' } });
  assert.deepEqual(step(null, s, T0).events, []);
});

test('a worker newly blocked rings the needs bell with its name and ticket', () => {
  const out = diff(snap(), snap({ tickets: [live('ABC-1', 'main-mac', { blockedSince: '2026-11-07T15:00:30Z' })] }));
  assert.deepEqual(kinds(out), ['needs']);
  assert.equal(out.events[0].cue, 'needs');
  assert.equal(out.events[0].head, 'Frodo is blocked · ABC-1');
});

test('an ask in Linear and the ticket waiting on it are one event, said with the question', () => {
  const a = { id: 'ABC-1', title: 'T', question: 'Ship it?', createdAt: '2026-11-07T15:00:10Z' };
  const out = diff(snap(), snap({ tickets: [live('ABC-1', 'main-mac', { waiting: true })], asks: [a] }));
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].head, 'Frodo is waiting on you · ABC-1');
  assert.equal(out.events[0].body, 'Ship it?');
});

test('each event says whose call it is, so the scene can show who is calling', () => {
  const rows = [{ id: 's1', title: 'Planning', state: 'needs', activityAt: T0 + 30_000 }];
  const out = diff(snap(), snap({
    tickets: [live('ABC-1', 'main-mac', { blockedSince: '2026-11-07T15:00:30Z' }), live('ABC-5', 'linux-box', { pr: { number: 9, ci: { fail: ['lint'], running: [] } } })],
    asks: [{ id: 'ABC-8', question: 'Which way?' }],
    sessions: { handled: {}, machines: [{ host: 'main-mac', rows }] },
  }));
  const by = Object.fromEntries(out.events.map((e) => [e.key.split(':')[0], e.who]));
  assert.deepEqual(by.blocked, { host: 'main-mac', id: 'ABC-1', name: 'Frodo' });
  assert.deepEqual(by.ci, { host: 'linux-box', id: 'ABC-5', name: 'Frodo' });
  assert.deepEqual(by.session, { host: 'main-mac', session: 's1', name: 'Planning' });
  assert.equal(by.ask, null);
  const down = diff(snap(), snap({ machines: [machine('main-mac', 'main-mac', { ok: false })] }));
  const again = step(down.state, snap({ machines: [machine('main-mac', 'main-mac', { ok: false })] }), T0 + 2 * MIN);
  assert.deepEqual(again.events.find((e) => e.kind === 'trouble')?.who, { host: 'main-mac', name: 'main-mac' });
});

test('an ask on a bundle companion counts as its lead', () => {
  const lead = live('ABC-1', 'main-mac', { waiting: true, label: 'ABC-1 + ABC-2', bundle: [{ id: 'ABC-2' }] });
  const out = diff(snap(), snap({ tickets: [lead], asks: [{ id: 'ABC-2', question: 'Which way?' }] }));
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].head, 'Frodo is waiting on you · ABC-1 + ABC-2');
});

test('a PR newly waiting on the owner to merge rings the needs bell', () => {
  const out = diff(snap(), snap({ tickets: [live('ABC-1', 'main-mac', { status: 'merge-asked', prNumber: 12 })] }));
  assert.equal(out.events[0].head, "Frodo's PR #12 waits on your merge · ABC-1");
});

test('a session newly waiting, unless marked handled, and again after it does something new', () => {
  const row = (at, state = 'needs') => ({ id: 'local_1', title: 'Planning', state, activityAt: at, ask: 'Pick one' });
  const sess = (rows, handled = {}) => ({ handled, machines: [{ host: 'main-mac', rows }] });
  const a = diff(snap(), snap({ sessions: sess([row(100)]) }));
  assert.equal(a.events[0].head, 'Planning session is waiting on you');
  assert.equal(a.events[0].body, 'Pick one');
  assert.equal(diff(snap(), snap({ sessions: sess([row(100)], { 'main-mac:local_1': 100 }) })).events.length, 0);
  assert.equal(diff(snap({ sessions: sess([row(100)]) }), snap({ sessions: sess([row(200)]) })).events.length, 1);
  assert.equal(diff(snap(), snap({ sessions: sess([row(100, 'stopped')]) })).events.length, 1);
  assert.equal(diff(snap(), snap({ sessions: sess([row(100, 'review')]) })).events.length, 0);
});

test('a source the snapshot cannot speak for keeps its last state, so nothing fires when it returns', () => {
  const rows = [{ id: 'local_1', title: 'A', state: 'needs', activityAt: 5 }];
  const known = snap({ sessions: { handled: {}, machines: [{ host: 'main-mac', rows }] } });
  const blank = snap({ sessions: { handled: {}, machines: [{ host: 'main-mac', rows: null }] } });
  const first = step(null, known, T0);
  const mid = step(first.state, blank, T0 + MIN);
  assert.equal(mid.events.length, 0);
  assert.equal(mid.waiting, 1);
  assert.equal(step(mid.state, snap({ sessions: { handled: {}, machines: [{ host: 'main-mac', rows }] } }), T0 + 2 * MIN).events.length, 0);
});

test('a board restart that starts with no sessions scanned does not burst when they arrive', () => {
  const blank = snap({ sessions: { handled: {}, machines: [{ host: 'main-mac', rows: null }] } });
  const rows = [{ id: 'local_1', title: 'A', state: 'needs', activityAt: 5 }, { id: 'local_2', title: 'B', state: 'stopped', activityAt: 6 }];
  assert.equal(diff(blank, snap({ sessions: { handled: {}, machines: [{ host: 'main-mac', rows }] } })).events.length, 0);
});

test('a machine the board never reached adds nothing until it has been seen once', () => {
  const unseen = snap({ machines: [machine('main-mac', 'main-mac'), machine('second-mac', 'second', { ok: false, fetchedAt: null })], tickets: [] });
  const back = snap({ tickets: [live('ABC-9', 'second-mac', { blockedSince: '2026-11-07T14:00:00Z' })] });
  assert.equal(diff(unseen, back).events.filter((e) => e.kind === 'needs').length, 0);
});

test('a ticket newly stuck tolls the trouble bell', () => {
  const out = diff(snap(), snap({ tickets: [live('ABC-1', 'main-mac', { live: false, status: 'stuck', stuckAt: '2026-11-07T15:00:30Z', reason: 'CI flaked' })] }));
  assert.deepEqual(kinds(out), ['trouble']);
  assert.equal(out.events[0].cue, 'trouble');
  assert.equal(out.events[0].body, 'CI flaked');
});

test('a machine out of reach for two fresh snapshots in a row, once', () => {
  const down = () => snap({ machines: [machine('main-mac', 'main-mac'), machine('second-mac', 'second', { ok: false, error: 'ssh timed out' })] });
  let r = step(null, snap(), T0);
  const seen = [];
  for (let i = 1; i <= 4; i += 1) { r = step(r.state, down(), T0 + i * MIN); seen.push(r.events.length); }
  assert.deepEqual(seen, [0, 1, 0, 0]);
  const same = down();
  r = step(step(r.state, snap(), T0 + 5 * MIN).state, same, T0 + 6 * MIN);
  assert.equal(step(r.state, same, T0 + 7 * MIN).events.length, 0, 'the same snapshot read twice counts once');
});

test('a machine newly paused tolls the bell', () => {
  const out = diff(snap(), snap({ machines: [machine('main-mac', 'main-mac', { paused: 'usage limit' })] }));
  assert.equal(out.events[0].head, 'main-mac is paused');
});

test('CI newly failing on a live PR beats the orc drum, and a re-run that fails again beats it again', () => {
  const pr = (fail) => ({ number: 7, ci: { fail, running: [] } });
  const failing = () => snap({ tickets: [live('ABC-1', 'main-mac', { pr: pr(['test-api']) })] });
  const out = diff(snap({ tickets: [live('ABC-1', 'main-mac', { pr: pr([]) })] }), failing());
  assert.deepEqual(kinds(out), ['ci']);
  assert.equal(out.events[0].head, 'An orc attacks Frodo · ABC-1');
  assert.equal(step(out.state, failing(), T0 + 2 * MIN).events.length, 0);
  const rerun = step(out.state, snap({ tickets: [live('ABC-1', 'main-mac', { pr: pr([]) })] }), T0 + 3 * MIN);
  assert.equal(step(rerun.state, failing(), T0 + 4 * MIN).events.length, 1);
});

test('when GitHub could not be read, CI keeps its last state', () => {
  const failing = snap({ tickets: [live('ABC-1', 'main-mac', { pr: { number: 7, ci: { fail: ['x'], running: [] } } })] });
  const blind = snap({ errors: { github: 'rate limited' } });
  const first = step(null, failing, T0);
  const mid = step(first.state, blind, T0 + MIN);
  assert.equal(step(mid.state, failing, T0 + 2 * MIN).events.length, 0);
});

test('a merge plays its realm voice, and an old merge seen late plays nothing', () => {
  const merged = (host, at) => ({ id: 'ABC-5', label: 'ABC-5', host, status: 'merged', mergedAt: new Date(at).toISOString(), nickname: 'Gimli', title: 'Fix', prNumber: 3 });
  const four = [machine('main-mac', 'main-mac'), machine('second-mac', 'second'), machine('linux-box', 'box'), machine('plains-box', 'plains')];
  for (const [host, cue] of [['main-mac', 'merge-rivendell'], ['second-mac', 'merge-shire'], ['linux-box', 'merge-erebor'], ['plains-box', 'merge-rohan']]) {
    const out = diff(snap({ machines: four, tickets: [] }), snap({ machines: four, tickets: [merged(host, T0)] }));
    assert.equal(out.events[0].cue, cue, host);
  }
  assert.match(diff(snap({ tickets: [] }), snap({ tickets: [merged('linux-box', T0)] })).events[0].head, /^Gimli merged ABC-5 · Erebor$/);
  assert.match(diff(snap({ machines: four, tickets: [] }), snap({ machines: four, tickets: [merged('plains-box', T0)] })).events[0].head, /^Gimli merged ABC-5 · Rohan$/);
  assert.equal(diff(snap({ tickets: [] }), snap({ tickets: [merged('main-mac', T0 - 2 * 60 * MIN)] })).events.length, 0);
});

test('a merge on a spread machine plays the cue of the realm its worker sat in', () => {
  const merged = (realm) => ({ id: 'ABC-7', label: 'ABC-7', host: 'main-mac', realm, status: 'merged', mergedAt: new Date(T0).toISOString(), nickname: 'Eowyn', title: 'Fix', prNumber: 5 });
  for (const [realm, cue, name] of [['rivendell', 'merge-rivendell', 'Rivendell'], ['shire', 'merge-shire', 'the Shire'], ['erebor', 'merge-erebor', 'Erebor'], ['rohan', 'merge-rohan', 'Rohan']]) {
    const out = diff(snap({ tickets: [] }), snap({ tickets: [merged(realm)] }));
    assert.equal(out.events[0].cue, cue, realm);
    assert.equal(out.events[0].head, `Eowyn merged ABC-7 · ${name}`);
  }
});

test('a fifth machine with no realm in the config merges under its own name with the Men\'s horn', () => {
  const merged = { id: 'ABC-6', label: 'ABC-6', host: 'fifth-box', status: 'merged', mergedAt: new Date(T0).toISOString(), nickname: 'Eomer', title: 'Fix', prNumber: 4 };
  const before = () => snap({ machines: [machine('fifth-box', 'Gondor')], tickets: [] });
  const out = diff(before(), snap({ machines: [machine('fifth-box', 'Gondor')], tickets: [merged] }));
  assert.equal(out.events[0].cue, 'merge-rohan');
  assert.match(out.events[0].head, /^Eomer merged ABC-6 · Gondor$/);
  const bare = snap({ machines: [machine('fifth-box', 'Gondor')], tickets: [merged] });
  delete bare.config;
  assert.equal(diff(before(), bare).events[0].cue, 'merge-rohan', 'a snapshot with no config still works');
});

test('main red sounds the horn, again every 15 minutes, again on a new red commit, and green again calls victory', () => {
  const red = (sha) => snap({ main: { status: 'red', sha, since: new Date(T0).toISOString(), title: 'feat: x', failing: ['build'] } });
  let r = step(null, snap(), T0);
  r = step(r.state, red('r1'), T0 + MIN);
  assert.deepEqual(kinds(r), ['mainRed']);
  assert.equal(r.events[0].cue, 'main-red');
  assert.equal(step(r.state, red('r1'), T0 + 5 * MIN).events.length, 0);
  const again = step(r.state, red('r1'), T0 + MIN + HORN_REPEAT_MS);
  assert.deepEqual(kinds(again), ['mainRed']);
  assert.match(again.events[0].head, /still red/);
  assert.deepEqual(kinds(step(r.state, red('r2'), T0 + 2 * MIN)), ['mainRed']);
  const unknown = step(r.state, snap({ main: { status: 'unknown' } }), T0 + 3 * MIN);
  assert.equal(unknown.events.length, 0);
  const green = step(unknown.state, snap(), T0 + 4 * MIN);
  assert.deepEqual(kinds(green), ['mainGreen']);
  assert.equal(step(green.state, snap(), T0 + 5 * MIN).events.length, 0);
});

test('a restart while main is red waits the full 15 minutes before the horn', () => {
  const red = () => snap({ main: { status: 'red', sha: 'r1' } });
  const first = step(null, red(), T0);
  assert.equal(step(first.state, red(), T0 + 14 * MIN).events.length, 0);
  assert.equal(step(first.state, red(), T0 + 15 * MIN).events.length, 1);
});

test('a reminder every reminderMinutes while anything waits, naming the oldest', () => {
  const blocked = (id, since, nick) => live(id, 'main-mac', { blockedSince: since, nickname: nick });
  const s = () => snap({ tickets: [blocked('ABC-1', '2026-11-07T14:20:00Z', 'Sam'), blocked('ABC-2', '2026-11-07T14:50:00Z', 'Pippin')] });
  const opts = { reminderMinutes: 30 };
  const first = step(null, s(), T0, opts);
  assert.equal(step(first.state, s(), T0 + 29 * MIN, opts).events.length, 0);
  const due = step(first.state, s(), T0 + 30 * MIN, opts);
  assert.deepEqual(kinds(due), ['reminder']);
  assert.equal(due.events[0].head, '2 things wait on you');
  assert.equal(due.events[0].body, 'Oldest, for 1.2h: Sam is blocked · ABC-1');
  assert.equal(step(due.state, s(), T0 + 45 * MIN, opts).events.length, 0);
  assert.equal(step(due.state, s(), T0 + 60 * MIN, opts).events.length, 1);
  const shorter = step(first.state, s(), T0 + 5 * MIN, { reminderMinutes: 5 });
  assert.deepEqual(kinds(shorter), ['reminder']);
});

test('no reminder when nothing waits, and a new needs event restarts the clock', () => {
  const opts = { reminderMinutes: 30 };
  const first = step(null, snap(), T0, opts);
  assert.equal(step(first.state, snap(), T0 + 60 * MIN, opts).events.length, 0);
  const rang = step(first.state, snap({ tickets: [live('ABC-1', 'main-mac', { blockedSince: '2026-11-07T15:40:00Z' })] }), T0 + 40 * MIN, opts);
  assert.deepEqual(kinds(rang), ['needs']);
  const s = snap({ tickets: [live('ABC-1', 'main-mac', { blockedSince: '2026-11-07T15:40:00Z' })] });
  assert.equal(step(rang.state, s, T0 + 60 * MIN, opts).events.length, 0);
  assert.equal(step(rang.state, s, T0 + 70 * MIN, opts).events.length, 1);
});

test('several events at once come in a fixed order: horn, trouble, needs, drum, merges', () => {
  const s = snap({
    main: { status: 'red', sha: 'r1' },
    tickets: [live('ABC-1', 'main-mac', { blockedSince: 'x', pr: { number: 1, ci: { fail: ['a'], running: [] } } }),
      { id: 'ABC-3', host: 'main-mac', status: 'merged', mergedAt: new Date(T0).toISOString() },
      { id: 'ABC-4', host: 'main-mac', status: 'stuck', stuckAt: 'y' }],
  });
  assert.deepEqual(kinds(diff(snap({ tickets: [] }), s)), ['mainRed', 'trouble', 'needs', 'ci', 'merge']);
});

test('the state holds only what the latest snapshot holds, so it does not grow', () => {
  let r = step(null, snap(), T0);
  for (let i = 1; i <= 50; i += 1) {
    r = step(r.state, snap({ tickets: [live(`ABC-${i}`, 'main-mac', { blockedSince: new Date(T0 + i * MIN).toISOString() })] }), T0 + i * MIN);
  }
  assert.equal(Object.keys(r.state.firstSeen).length, 1);
  assert.equal(Object.keys(r.state.parts['needs:tickets:main-mac']).length, 1);
});

test('settings updates are checked field by field', () => {
  const base = { ...DEFAULTS, events: { ...DEFAULTS.events } };
  assert.equal(applyUpdate(base, { muted: true }).muted, true);
  assert.equal(applyUpdate(base, { events: { merge: false } }).events.merge, false);
  assert.equal(applyUpdate(base, { events: { merge: false } }).events.needs, true);
  assert.equal(applyUpdate(base, { volume: 0 }).volume, 0);
  for (const bad of [{ muted: 'yes' }, { volume: 101 }, { volume: 5.5 }, { reminderMinutes: 0 }, { events: { foo: true } },
    { events: { merge: 1 } }, { colour: 'red' }, null, [], { events: [] }]) {
    assert.throws(() => applyUpdate(base, bad), undefined, JSON.stringify(bad));
  }
  assert.equal(base.muted, false, 'the input is never changed');
});

// A WAV file of seconds at 8 kHz, 16-bit mono, with an odd-sized chunk ahead of its data as some writers add.
function wav(seconds) {
  const chunk = (id, body) => { const h = Buffer.alloc(8); h.write(id, 'ascii'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };
  const fmt = Buffer.alloc(16);
  [[1, 0, 2], [1, 2, 2], [8000, 4, 4], [16000, 8, 4], [2, 12, 2], [16, 14, 2]].forEach(([v, at, n]) => fmt.writeUIntLE(v, at, n));
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), chunk('fmt ', fmt), chunk('LIST', Buffer.from('abc', 'ascii')), Buffer.from([0]),
    chunk('data', Buffer.alloc(Math.round(seconds * 8000) * 2))]);
  return chunk('RIFF', body);
}

test('a cue length is read from the WAV header', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herald-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.wav'), wav(1.5));
    assert.equal(wavSeconds(path.join(dir, 'a.wav')), 1.5);
    fs.writeFileSync(path.join(dir, 'b.wav'), 'not a wav file at all');
    assert.throws(() => wavSeconds(path.join(dir, 'b.wav')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const cue of Object.keys(CUES)) assert.ok(cueSeconds(cue) > 0.5 && cueSeconds(cue) < 20, `${cue} is ${cueSeconds(cue)}s`);
});

// Runs playAfterWarning with a stand-in board warning and a stand-in player, noting when each was called.
async function warnThenPlay(announce) {
  const calls = [];
  const t0 = Date.now();
  const child = await playAfterWarning('needs', 55, (cue, seconds) => { calls.push({ what: 'warn', cue, seconds, at: Date.now() - t0 }); return announce(); },
    (cue, volume) => { calls.push({ what: 'play', cue, volume, at: Date.now() - t0 }); return 'child'; });
  return { calls, child };
}

test('the herald warns the board, waits the lead, then plays', async () => {
  const { calls, child } = await warnThenPlay(() => Promise.resolve());
  assert.deepEqual(calls.map((c) => c.what), ['warn', 'play']);
  assert.equal(child, 'child');
  assert.equal(calls[0].cue, 'needs');
  assert.equal(calls[0].seconds, cueSeconds('needs'));
  assert.equal(calls[1].volume, 55);
  assert.ok(calls[1].at - calls[0].at >= ALERT_LEAD_MS - 5, `played ${calls[1].at - calls[0].at} ms after the warning`);
});

test('a board that is down, hangs or throws never holds the cue back', async () => {
  for (const announce of [() => Promise.reject(new Error('ECONNREFUSED')), () => new Promise(() => {}), () => { throw new Error('boom'); }]) {
    const { calls } = await warnThenPlay(announce);
    assert.deepEqual(calls.map((c) => c.what), ['warn', 'play']);
    assert.ok(calls[1].at < ALERT_LEAD_MS + 150, `played at ${calls[1].at} ms`);
  }
});
