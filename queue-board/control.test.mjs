// control.test.mjs: the Fleet levers' server (control.mjs and its modules) against a temp copy of the example config
// (control-box.mjs): what it accepts, what it refuses, how it writes the file and its notes, the accounts and the
// HTTP route. End times, pause and the wake queue are control-timers.test.mjs. Run: node --test queue-board/control.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { test } from 'node:test';
import { readConfig, writeConfig } from './control-config.mjs';
import { createControl } from './control.mjs';
import { box, overwrite, refused, T0, HOUR } from './control-box.mjs';

// The lines of `b` not in `a`, counting repeats.
const extra = (a, b) => {
  const left = a.split('\n');
  return b.split('\n').filter((l) => { const i = left.indexOf(l); if (i < 0) return true; left.splice(i, 1); return false; });
};
const added = (before, after) => extra(before, after);
const gone = (before, after) => extra(after, before);

test('maxWorkers: writes the value, a dated note and a log line, and changes no other line', async () => {
  const b = box();
  const before = b.text();
  const [e] = await b.control.perform({ op: 'maxWorkers', host: 'mini', value: 3, expect: 6, why: 'testing a reboot' });
  const cfg = b.cfg();
  assert.equal(cfg.hosts.mini.maxWorkers, 3);
  assert.equal(cfg.hosts.mini.maxWorkersNote, '2026-11-19 ~22:10Z, Alex via the board: maxWorkers 6 to 3 (testing a reboot); was 6.');
  assert.equal(added(before, b.text()).length, 2, 'the value line and its note line');
  assert.equal(gone(before, b.text()).length, 1, 'only the old value line');
  assert.deepEqual(b.log().map((x) => [x.kind, x.target, x.from, x.to]), [['change', 'maxWorkers:mini', 6, 3]]);
  assert.equal(e.by, 'Alex via the board');
  assert.equal(b.writes.length, 1, 'the board is told so its snapshot follows');
});

test('the levers change only the dispatcher section and keep every other part of the file', async () => {
  const b = box();
  const before = b.root();
  await b.control.perform({ op: 'number', key: 'maxConcurrent', value: 10 });
  const after = b.root();
  for (const k of Object.keys(before).filter((x) => x !== 'dispatcher')) assert.deepEqual(after[k], before[k], k);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  assert.equal(after.dispatcher.maxConcurrent, 10);
});

test('refuses unknown operations, machines, accounts, keys and values out of range, and writes nothing', async () => {
  const b = box();
  const before = b.text();
  await refused(b.control.perform({ op: 'setConfig', path: 'hosts', value: {} }), 400, /unknown operation/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'evil-host', value: 3 }), 400, /unknown machine/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'constructor', value: 3 }), 400, /unknown machine/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 99 }), 400, /from 0 to 24/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 2.5 }), 400, /whole number/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: '3' }), 400, /whole number/);
  await refused(b.control.perform({ op: 'burn', account: 'z', value: true }), 400, /unknown account/);
  await refused(b.control.perform({ op: 'burn', account: 'bb', value: true }), 400, /unknown account/);
  await refused(b.control.perform({ op: 'number', key: 'riskyPathPatterns', value: 1 }), 400, /unknown setting/);
  await refused(b.control.perform({ op: 'number', key: '__proto__.x', value: 1 }), 400, /unknown setting/);
  await refused(b.control.perform({ op: 'switch', key: 'permissionMode', value: true }), 400, /unknown setting/);
  await refused(b.control.perform({ op: 'model', value: 'gpt-5' }), 400, /model must be one of/);
  await refused(b.control.perform({ op: 'effort', value: 'turbo' }), 400, /effort must be one of/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 4, until: '2026-11-19T22:10:30Z' }), 400, /at least a minute/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 4, until: '2026-12-30T00:00:00Z' }), 400, /within 14 days/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 4, why: 'x'.repeat(141) }), 400, /140/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 4, why: 'ask me@example.com' }), 400, /email/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 5 }), 409, /already/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'main-mac', value: 4, expect: 7 }), 409, /it is 5 now, not 7/);
  await refused(b.control.perform({ batch: [] }), 400, /1 to 6/);
  assert.equal(b.text(), before);
  assert.equal(fs.existsSync(path.join(b.shared, 'control-log.jsonl')), false);
});

test("a write refuses when the file changed after it was read, and keeps the other writer's file", () => {
  const b = box();
  const read = readConfig(b.file);
  read.cfg.maxConcurrent = 1;
  const theirs = b.text().replace('"maxConcurrent": 36', '"maxConcurrent": 30');
  fs.writeFileSync(b.file, theirs);
  assert.throws(() => writeConfig(b.file, read), (e) => e.code === 'CHANGED');
  assert.equal(b.text(), theirs);
  assert.deepEqual(fs.readdirSync(b.dir).filter((f) => f.includes('.tmp')), [], 'no temp file left behind');
});

test('a config reached through a symlink is written at its target, and the link stays a link', async () => {
  const b = box();
  const link = path.join(b.dir, 'linked.json');
  fs.symlinkSync(b.file, link);
  const c = createControl({ configFile: link, sharedDir: b.shared, here: 'main-mac', snapshot: () => b.snap, now: () => b.clock.t, runDispatcher: async () => 'ok' });
  await c.perform({ op: 'number', key: 'maxConcurrent', value: 12 });
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'still a link');
  assert.equal(b.cfg().maxConcurrent, 12, 'the change reached the file the link points at');
});

test('wind down keeps each slot count beside it, refuses the steppers meanwhile, and bring back restores them', async () => {
  const b = box();
  await b.control.perform({ op: 'drain', host: 'linux-box', value: true, why: 'reboot' });
  let h = b.cfg().hosts['linux-box'];
  assert.deepEqual([h.maxWorkers, h.sentryWorkers, h.burstWorkers], [0, 0, 0]);
  assert.deepEqual([h.maxWorkersBeforeDrain, h.sentryWorkersBeforeDrain, h.burstWorkersBeforeDrain], [6, 1, 2]);
  assert.match(h.drainNote, /wound down, nothing new starts here and running work finishes: maxWorkers 6 to 0, sentryWorkers 1 to 0, burstWorkers 2 to 0 \(reboot\)\.$/);
  await refused(b.control.perform({ op: 'maxWorkers', host: 'linux-box', value: 2 }), 409, /wound down; bring it back first/);
  await b.control.perform({ op: 'drain', host: 'linux-box', value: false });
  h = b.cfg().hosts['linux-box'];
  assert.deepEqual([h.maxWorkers, h.sentryWorkers, h.burstWorkers, h.maxWorkersBeforeDrain], [6, 1, 2, undefined]);
  assert.equal(Object.keys(h).indexOf('maxWorkers') < Object.keys(h).indexOf('accounts'), true, 'keys keep their order');
});

test('burn: an end time also goes into burnUntil and the Fable switch stays where it was', async () => {
  const b = box();
  await b.control.perform({ op: 'burn', account: 'b', value: true, until: new Date(T0 + 3 * HOUR).toISOString() });
  const cfg = b.cfg();
  assert.deepEqual(cfg.burnAccounts, ['c', 'a', 'b']);
  assert.equal(cfg.burnUntil.b, new Date(T0 + 3 * HOUR).toISOString());
  assert.ok(cfg.noFableAccounts.includes('b'), 'b ran no Fable before, so the burn does not start Fable on it');
});

test('Fable on an account takes it out of noFableAccounts and into fableAccounts; a batch adds the burn in one write', async () => {
  const b = box();
  const entries = await b.control.perform({ batch: [{ op: 'fable', account: 'h', value: true }, { op: 'burn', account: 'h', value: true }], until: new Date(T0 + 20 * HOUR).toISOString(), why: 'free Fable reset' });
  const cfg = b.cfg();
  assert.deepEqual(cfg.noFableAccounts, ['a']);
  assert.deepEqual(cfg.fableAccounts, ['h']);
  assert.deepEqual(cfg.burnAccounts, ['c', 'a', 'h']);
  assert.equal(entries.length, 2);
  assert.equal(b.control.state().timers.length, 2);
  assert.ok(b.control.state().accounts.find((a) => a.label === 'h').fable);
});

test('out of the queue takes an account off every machine and back restores exactly those machines', async () => {
  const b = box();
  await b.control.perform({ op: 'out', account: 'h', value: true, why: 'saving it for my own use' });
  let cfg = b.cfg();
  for (const h of Object.values(cfg.hosts)) assert.ok(!(h.accounts ?? []).includes('h'));
  assert.deepEqual(cfg.accountsOut.h.hosts, ['main-mac', 'mini', 'linux-box']);
  await refused(b.control.perform({ op: 'hostAccount', host: 'main-mac', account: 'h', value: true }), 409, /out of the queue; put it back first/);
  await b.control.perform({ op: 'out', account: 'h', value: false });
  cfg = b.cfg();
  assert.ok(cfg.hosts['linux-box'].accounts.includes('h'));
  assert.equal(cfg.accountsOut, undefined);
});

test('a machine takes only an account it has a folder for', async () => {
  const b = box();
  await refused(b.control.perform({ op: 'hostAccount', host: 'mini', account: 'b', value: true }), 400, /no folder on mini/);
  await b.control.perform({ op: 'hostAccount', host: 'main-mac', account: 'g', value: true });
  assert.deepEqual(b.cfg().hosts['main-mac'].accounts, ['a', 'b', 'c', 'd', 'g', 'h']);
});

test('holding new work writes holdNewWork next to maxConcurrent with its own note', async () => {
  const b = box();
  await b.control.perform({ op: 'switch', key: 'holdNewWork', value: true, why: 'let the pipeline breathe' });
  const cfg = b.cfg();
  assert.equal(cfg.holdNewWork, true);
  assert.match(cfg.holdNewWorkNote, /new work held on every machine: no new ticket is claimed, and claimed work carries on \(let the pipeline breathe\)\.$/);
});

test('a machine load guard, a worker cap per account, the model and Codex as an account each write their key', async () => {
  const b = box();
  await b.control.perform({ op: 'loadGuard', host: 'mini', key: 'maxLoadPerCore', value: 1.5 });
  await b.control.perform({ op: 'workerCap', account: 'e', value: 1 });
  await b.control.perform({ op: 'model', value: 'fable' });
  await b.control.perform({ op: 'sizeModel', size: 'S', value: 'sonnet' });
  await b.control.perform({ op: 'engine', engine: 'grok', value: false });
  const cfg = b.cfg();
  assert.equal(cfg.hosts.mini.maxLoadPerCore, 1.5);
  assert.deepEqual(cfg.workerCapByAccount, { e: 1 });
  assert.equal(cfg.model, 'fable');
  assert.equal(cfg.modelBySize.S, 'sonnet');
  assert.deepEqual(cfg.externalBuilders.fallback.engines, ['codex']);
  await b.control.perform({ op: 'workerCap', account: 'e', value: null });
  assert.equal(b.cfg().workerCapByAccount, undefined);
});

test('take out refuses while a machine has no account list, since it may use every account', async () => {
  const b = box();
  overwrite(b, (cfg) => { delete cfg.hosts.mini.accounts; });
  await refused(b.control.perform({ op: 'out', account: 'h', value: true }), 409, /mini has no account list/);
});

test('an omitted engines list reads as both engines, as the dispatcher reads it, and turning one off keeps the other', async () => {
  const b = box();
  overwrite(b, (cfg) => { cfg.externalBuilders.fallback = { enabled: true }; });
  assert.deepEqual(b.control.state().engines.list, ['codex', 'grok']);
  await b.control.perform({ op: 'engine', engine: 'codex', value: false, expect: true });
  assert.deepEqual(b.cfg().externalBuilders.fallback.engines, ['grok']);
});

test('a floor the dispatcher reads with a fallback can be undone back to unset', async () => {
  const b = box();
  overwrite(b, (cfg) => { delete cfg.fableFloorPercent; });
  const [e] = await b.control.perform({ op: 'number', key: 'fableFloorPercent', value: 1, expect: null });
  await b.control.perform({ op: 'undo', id: e.id });
  assert.equal(Object.hasOwn(b.cfg(), 'fableFloorPercent'), false);
});

test('a planted link at the temp file name is never followed', async () => {
  const b = box();
  const target = path.join(b.dir, 'elsewhere.txt');
  fs.writeFileSync(target, 'untouched\n');
  fs.symlinkSync(target, path.join(b.dir, `.agent-queue.config.json.board-${process.pid}.tmp`));
  await b.control.perform({ op: 'number', key: 'maxConcurrent', value: 11 });
  assert.equal(fs.readFileSync(target, 'utf8'), 'untouched\n');
  assert.ok(fs.lstatSync(b.file).isFile());
  assert.equal(b.cfg().maxConcurrent, 11);
});

test('the HTTP route wants its header and a JSON body, and its answer carries no note and no email', async () => {
  const b = box();
  b.snap.machines[2].ok = false;
  overwrite(b, (cfg) => { cfg.modelBySize = { 'ops@example.com': 'sonnet' }; });
  const server = http.createServer((req, res) => b.control.handle(req, res, (r, code, type, body) => { r.writeHead(code, { 'Content-Type': type }); r.end(body); }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/control`;
  const post = (body, headers) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = { 'X-Board': 'control', 'Content-Type': 'application/json' };
  try {
    assert.equal((await post({ op: 'maxWorkers', host: 'main-mac', value: 4 }, { 'Content-Type': 'application/json' })).status, 403);
    assert.equal((await post({ op: 'maxWorkers', host: 'main-mac', value: 4 }, { 'X-Board': 'control', 'Content-Type': 'text/plain' })).status, 403);
    assert.equal((await post({ op: 'maxWorkers', host: 'main-mac', value: 40 }, json)).status, 400);
    assert.equal((await post([1], json)).status, 400);
    assert.equal((await fetch(url, { method: 'PUT' })).status, 405);
    const ok = await (await post({ op: 'maxWorkers', host: 'main-mac', value: 4 }, json)).json();
    assert.equal(ok.ok, true);
    const changed = await (await post({ op: 'maxWorkers', host: 'main-mac', value: 3, expect: 5 }, json)).json();
    assert.deepEqual([changed.ok, changed.current], [false, 4], 'a value that moved is refused with what it is now');
    const text = await (await fetch(url)).text();
    assert.doesNotMatch(text, /@/, 'no email anywhere in the answer, the wake reason from a heartbeat included');
    assert.doesNotMatch(text, /Note"/, 'no note field');
    const state = JSON.parse(text);
    assert.equal(state.hosts.find((h) => h.host === 'main-mac').maxWorkers, 4);
    assert.match(state.waiting[0].reason, /\[email\] full/);
  } finally {
    server.close();
  }
});
