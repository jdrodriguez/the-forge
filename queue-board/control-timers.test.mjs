// control-timers.test.mjs: the Fleet levers' end times (on time, missed while the board was down, after the value
// changed some other way, handed to a later change), undo, End now and Keep, the wake queue and the pause runner,
// against a temp copy of the example config (control-box.mjs). Run: node --test queue-board/control-timers.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { box, overwrite, refused, T0, HOUR } from './control-box.mjs';
import { createRunner } from './control-runner.mjs';

test('a timed change reverts by itself when its end time comes, with a note and a log line', async () => {
  const b = box();
  b.control.start(60_000);
  await b.control.perform({ op: 'maxWorkers', host: 'mini', value: 0, until: new Date(T0 + 2 * HOUR).toISOString() });
  assert.match(b.cfg().hosts.mini.maxWorkersNote, /maxWorkers 6 to 0; was 6, back to 6 at 2026-11-20 ~00:10Z unless changed before\.$/);
  b.clock.t = T0 + HOUR;
  await b.control.dueTimers();
  assert.equal(b.cfg().hosts.mini.maxWorkers, 0, 'not due yet');
  b.clock.t = T0 + 2 * HOUR + 1000;
  await b.control.dueTimers();
  b.control.stop();
  assert.equal(b.cfg().hosts.mini.maxWorkers, 6);
  assert.match(b.cfg().hosts.mini.maxWorkersNote, /2026-11-20 ~00:10Z, the board: maxWorkers 0 to 6, its end time came \(set at ~22:10Z to last until 2026-11-20 ~00:10Z\)\.$/);
  assert.deepEqual(b.log().map((x) => x.kind), ['change', 'revert']);
  assert.equal(b.control.state().timers.length, 0);
});

test('an end time missed while the board was down is caught up on start', async () => {
  const b = box();
  await b.control.perform({ op: 'number', key: 'maxConcurrent', value: 10, until: new Date(T0 + HOUR).toISOString() });
  b.clock.t = T0 + 5 * HOUR;
  const again = b.make();
  again.start(60_000);
  await again.dueTimers();
  again.stop();
  assert.equal(b.cfg().maxConcurrent, 36);
  assert.match(b.log().at(-1).reason, /caught up: its end time passed while the board was not running/);
});

test('an end time puts nothing back once the value changed some other way, and says so', async () => {
  const b = box();
  await b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 2, until: new Date(T0 + HOUR).toISOString() });
  overwrite(b, (cfg) => { cfg.hosts['main-mac'].maxWorkers = 4; });
  b.clock.t = T0 + HOUR + 1000;
  await b.control.dueTimers();
  assert.equal(b.cfg().hosts['main-mac'].maxWorkers, 4);
  assert.equal(b.log().at(-1).kind, 'skipped');
  assert.match(b.log().at(-1).reason, /it was 4 by then, not 2/);
});

test('a later change on a timed value takes the timer over, so the window still ends where it was going to', async () => {
  const b = box();
  await b.control.perform({ op: 'maxWorkers', host: 'mini', value: 0, until: new Date(T0 + HOUR).toISOString() });
  b.clock.t = T0 + 60_000;
  const [second] = await b.control.perform({ op: 'maxWorkers', host: 'mini', value: 2 });
  assert.equal(second.until, new Date(T0 + HOUR).toISOString());
  assert.equal(second.revertTo, 6);
  assert.deepEqual(b.control.state().timers.map((t) => t.id), [second.id]);
  b.clock.t = T0 + HOUR + 1000;
  await b.control.dueTimers();
  assert.equal(b.cfg().hosts.mini.maxWorkers, 6);
});

test('undo, End now, Keep and a later end time each act on the newest change only', async () => {
  const b = box();
  const [e] = await b.control.perform({ op: 'number', key: 'headroomFloorPercent', value: 20 });
  await b.control.perform({ op: 'undo', id: e.id });
  assert.equal(b.cfg().headroomFloorPercent, 10);
  assert.equal(b.log().at(-1).undoOf, e.id);
  await refused(b.control.perform({ op: 'undo', id: e.id }), 409, /later change/);
  const [t] = await b.control.perform({ op: 'number', key: 'headroomFloorPercent', value: 15 });
  await b.control.perform({ op: 'until', id: t.id, until: new Date(T0 + HOUR).toISOString() });
  assert.equal(b.control.state().timers[0].revertTo, 10);
  await b.control.perform({ op: 'keep', id: t.id });
  assert.equal(b.control.state().timers.length, 0);
  await b.control.perform({ op: 'until', id: t.id, until: new Date(T0 + HOUR).toISOString() });
  await b.control.perform({ op: 'end', id: t.id });
  assert.equal(b.cfg().headroomFloorPercent, 10);
  assert.equal(b.log().at(-1).reason, 'ended early from the board');
});

test('a burn that ends by itself takes the account out of burnAccounts and burnUntil', async () => {
  const b = box();
  await b.control.perform({ op: 'burn', account: 'b', value: true, until: new Date(T0 + 3 * HOUR).toISOString() });
  b.clock.t = T0 + 3 * HOUR + 1000;
  await b.control.dueTimers();
  const cfg = b.cfg();
  assert.deepEqual(cfg.burnAccounts, ['c', 'a']);
  assert.equal(cfg.burnUntil, undefined);
});

test('a timer on a value that was unset puts it back to unset after later changes and a new end time', async () => {
  const b = box();
  overwrite(b, (cfg) => { delete cfg.maxDispatchesPerDay; });
  await b.control.perform({ op: 'number', key: 'maxDispatchesPerDay', value: 10, until: new Date(T0 + HOUR).toISOString() });
  b.clock.t = T0 + 60_000;
  await b.control.perform({ op: 'number', key: 'maxDispatchesPerDay', value: 20 });
  b.clock.t = T0 + 120_000;
  const [third] = await b.control.perform({ op: 'number', key: 'maxDispatchesPerDay', value: 30 });
  assert.equal(third.revertTo, null);
  await b.control.perform({ op: 'until', id: third.id, until: new Date(T0 + 2 * HOUR).toISOString() });
  assert.equal(b.control.state().timers[0].revertTo, null);
  b.clock.t = T0 + 2 * HOUR + 1000;
  await b.control.dueTimers();
  assert.equal(Object.hasOwn(b.cfg(), 'maxDispatchesPerDay'), false);
});

test('push through writes the wake request the dispatcher reads, only for a ticket waiting for a slot', async () => {
  const b = box();
  b.snap.machines[2].ok = false;
  await refused(b.control.perform({ op: 'wake', ticket: 'ABC-1' }), 409, /not waiting for a slot/);
  await refused(b.control.perform({ op: 'wake', ticket: '../../x' }), 400, /look like ABC-123/);
  await refused(b.control.perform({ op: 'wake', ticket: 'XYZ-7064' }), 400, /look like ABC-123/);
  await b.control.perform({ op: 'wake', ticket: 'ABC-7064' });
  const req = JSON.parse(fs.readFileSync(path.join(b.shared, 'wake-requests/ABC-7064.json'), 'utf8'));
  assert.equal(req.id, 'ABC-7064');
  assert.equal(b.log().at(-1).host, 'linux-box');
  assert.deepEqual(b.control.state().wakeRequests, ['ABC-7064']);
});

test('a machine the snapshot reads takes its wake queue from the snapshot only, never from an older heartbeat', () => {
  const b = box();
  assert.deepEqual(b.control.state().waiting, [], 'linux-box is reachable and its state lists no ticket waiting');
  b.snap.machines[2].ok = false;
  assert.deepEqual(b.control.state().waiting.map((w) => [w.id, w.from]), [['ABC-7064', 'heartbeat']]);
});

test('pause runs the dispatcher CLI on that machine with a clean reason, and a timed pause resumes by itself', async () => {
  const b = box();
  await b.control.perform({ op: 'pause', host: 'linux-box', value: true, why: "reboot; rm -rf ~ 'now'", until: new Date(T0 + HOUR).toISOString() });
  assert.deepEqual(b.calls[0], { host: 'linux-box', args: ['pause', 'from the board: reboot; rm -rf  now, until 2026-11-19 ~23:10Z'] });
  b.snap.machines[2].paused = `2026-11-19T22:10:03Z ${b.calls[0].args[1]}`;
  b.clock.t = T0 + HOUR + 1000;
  await b.control.dueTimers();
  assert.deepEqual(b.calls[1], { host: 'linux-box', args: ['resume'] });
  assert.equal(b.log().at(-1).kind, 'revert');
});

test('a timed pause ends only on a fresh reading: offline, it stays paused and is tried again', async () => {
  const b = box();
  await b.control.perform({ op: 'pause', host: 'linux-box', value: true, until: new Date(T0 + HOUR).toISOString() });
  b.snap.machines[2].ok = false;
  b.clock.t = T0 + HOUR + 1000;
  await b.control.dueTimers();
  assert.deepEqual(b.calls.map((c) => c.args[0]), ['pause'], 'no resume while the machine cannot be read');
  assert.equal(b.control.state().timers.length, 1, 'the end time is still pending');
  b.snap.machines[2] = { ...b.snap.machines[2], ok: true, paused: `2026-11-19T22:10:03Z ${b.calls[0].args[1]}` };
  await b.control.dueTimers();
  assert.deepEqual(b.calls.map((c) => c.args[0]), ['pause', 'resume']);
});

test('a planted link at a wake request is replaced, never written through', async () => {
  const b = box();
  b.snap.machines[2].ok = false;
  const target = path.join(b.dir, 'elsewhere.txt');
  fs.writeFileSync(target, 'untouched\n');
  fs.mkdirSync(path.join(b.shared, 'wake-requests'));
  fs.symlinkSync(target, path.join(b.shared, 'wake-requests', 'ABC-7064.json'));
  await b.control.perform({ op: 'wake', ticket: 'ABC-7064' });
  assert.equal(fs.readFileSync(target, 'utf8'), 'untouched\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(b.shared, 'wake-requests', 'ABC-7064.json'), 'utf8')).id, 'ABC-7064');
});

test('Keep on a burn whose log line cannot be written leaves burnUntil as it was', { skip: process.getuid?.() === 0 && 'root ignores a read-only file' }, async () => {
  const b = box();
  const until = new Date(T0 + 3 * HOUR).toISOString();
  const [e] = await b.control.perform({ op: 'burn', account: 'b', value: true, until });
  const log = path.join(b.shared, 'control-log.jsonl');
  fs.chmodSync(log, 0o444);
  try {
    await assert.rejects(b.control.perform({ op: 'keep', id: e.id }));
  } finally {
    fs.chmodSync(log, 0o644);
  }
  assert.equal(b.cfg().burnUntil.b, until);
});

test('a timed pause leaves alone a machine paused again by hand after it', async () => {
  const b = box();
  await b.control.perform({ op: 'pause', host: 'linux-box', value: true, until: new Date(T0 + HOUR).toISOString() });
  b.snap.machines[2].paused = '2026-11-19T22:40:00Z paused by hand for a disk swap';
  b.clock.t = T0 + HOUR + 1000;
  await b.control.dueTimers();
  assert.deepEqual(b.calls.map((c) => c.args[0]), ['pause']);
  assert.equal(b.log().at(-1).kind, 'skipped');
});

test('a change whose log line cannot be written is not left in the config, and a pause is taken back', async () => {
  const b = box();
  const before = b.text();
  fs.mkdirSync(path.join(b.shared, 'control-log.jsonl'));
  await assert.rejects(b.control.perform({ op: 'maxWorkers', host: 'mini', value: 0, until: new Date(T0 + HOUR).toISOString() }));
  assert.ok(b.text() === before, 'the config is as it was');
  await assert.rejects(b.control.perform({ op: 'pause', host: 'linux-box', value: true, until: new Date(T0 + HOUR).toISOString() }));
  assert.deepEqual(b.calls.map((c) => c.args[0]), ['pause', 'resume']);
});

test('QUEUE_BOARD_CONTROL_RECORD takes the pause instead of a machine', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-runner-'));
  const record = path.join(dir, 'calls.jsonl');
  const run = createRunner({ here: 'main-mac', root: '/nowhere', machines: [], env: { QUEUE_BOARD_CONTROL_RECORD: record } });
  assert.match(await run('linux-box', ['pause', 'x']), /recorded, not run/);
  const line = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.deepEqual([line.host, line.args], ['linux-box', ['pause', 'x']]);
  const live = createRunner({ here: 'main-mac', root: '/nowhere', machines: [], env: {} });
  await refused(live('unknown-box', ['resume']), 502, /no way to reach unknown-box/);
});
