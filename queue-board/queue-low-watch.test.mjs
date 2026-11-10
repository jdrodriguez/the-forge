import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacity, report } from './queue-low-watch.mjs';

const acct = (label, week, five = 0) => ({ label, signedIn: true, weekly: { used: week }, fiveHour: { used: five } });
const machine = (host, maxWorkers, accounts, extra = {}) => ({ host, name: host, ok: true, enabled: true, paused: null, maxWorkers, accounts, load: { cores: 10, avg5: 1, maxPerCore: 2 }, ...extra });
const snap = (machines, tickets, ready) => ({ config: { maxConcurrent: 12, headroomFloorPercent: 30 }, machines, tickets, ready });

test('free slots beyond the startable tickets read as dry, and blocked tickets do not count', () => {
  const c = capacity(snap(
    [machine('main', 5, [acct('b', 50)]), machine('linux', 4, [acct('c', 40)])],
    [{ host: 'main', live: true }, { host: 'main', live: true }, { host: 'linux', live: true }, { host: 'linux', live: false }],
    [{ id: 'ABC-1' }, { id: 'ABC-2', waitingOn: 'ABC-9' }],
  ));
  assert.equal(c.free, 6);
  assert.deepEqual(c.startable.map((r) => r.id), ['ABC-1']);
  assert.match(report(c), /6 worker slots free \(main 3, linux 3\), 1 ticket can start \(ABC-1\)/);
  assert.match(report(c), /ABC-2 \(on ABC-9\)/);
});

test('a machine whose accounts are all under the floor frees nothing, and says why', () => {
  const c = capacity(snap([machine('main', 5, [acct('a', 87), acct('d', 80, 10)])], [], []));
  assert.equal(c.free, 0);
  assert.match(report(c), /main: 5 open slots held back, no account above the 30% floor \(a 13% week/);
});

test('paused, disabled and overloaded machines add no slots; Sentry workers do not use a slot', () => {
  const c = capacity(snap([
    machine('p', 2, [acct('b', 10)], { paused: 'maintenance' }),
    machine('off', 2, [acct('b', 10)], { enabled: false }),
    machine('hot', 2, [acct('b', 10)], { load: { cores: 4, avg5: 9, maxPerCore: 2 } }),
    machine('ok', 1, [acct('b', 10)]),
  ], [{ host: 'ok', live: true, sentry: true }], []));
  assert.equal(c.free, 1);
});

test('an engine worker holds a slot in its machine\'s pool like a Claude worker', () => {
  const s = snap([machine('main', 3, [acct('b', 10)])], [{ host: 'main', live: true, driver: 'engine' }, { host: 'main', live: true }], []);
  assert.equal(capacity(s).free, 1);
  s.config.maxConcurrent = 2;
  assert.equal(capacity(s).free, 0);
});

test('Codex or Grok with room keeps a machine\'s slots open when every Claude account is under the floor', () => {
  const low = [acct('b', 95)];
  const s = snap([{ ...machine('main', 2, low), engineAccounts: ['codex'] }], [], []);
  assert.equal(capacity(s).free, 0);
  s.services = [{ name: 'Codex', machines: ['main'], weekly: { used: 40 } }];
  assert.equal(capacity(s).free, 2);
  s.services[0].limited = true;
  assert.equal(capacity(s).free, 0);
});

test('a PR waiting on a merge or on the reviewer frees its machine slot; only the merge wait still counts in maxConcurrent', () => {
  const s = snap([machine('main', 2, [acct('b', 10)])], [{ host: 'main', live: true, status: 'merge-asked' }, { host: 'main', live: true, status: 'building', parked: '2026-11-09T10:00:00Z' }], []);
  assert.equal(capacity(s).free, 2);
  s.config.maxConcurrent = 2;
  assert.equal(capacity(s).free, 1);
});

test('maxConcurrent caps the free slots across machines', () => {
  const s = snap([machine('a', 8, [acct('b', 10)]), machine('b', 8, [acct('c', 10)])], Array.from({ length: 10 }, () => ({ host: 'a', live: false })), []);
  s.config.maxConcurrent = 3;
  assert.equal(capacity(s).free, 3);
});
