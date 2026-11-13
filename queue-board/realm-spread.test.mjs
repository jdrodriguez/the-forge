// realm-spread.test.mjs: node --test queue-board/realm-spread.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spreadOn, realmsByHost, assignRealms, KEEP_MS } from './realm-spread.mjs';

const T0 = Date.parse('2026-11-12T12:00:00Z');
let seq = 0;
const at = (min) => new Date(T0 + min * 60_000).toISOString();
const live = (host, extra = {}) => ({ id: `ABC-${(seq += 1)}`, host, live: true, status: 'building', dispatchedAt: at(seq), ...extra });

test('spread is on by default only for one host, and true or false wins', () => {
  assert.equal(spreadOn(undefined, ['solo']), true);
  assert.equal(spreadOn('auto', ['solo']), true);
  assert.equal(spreadOn('auto', ['a', 'b']), false);
  assert.equal(spreadOn(false, ['solo']), false);
  assert.equal(spreadOn(true, ['a', 'b']), true);
  assert.equal(spreadOn('auto', []), false);
});

test('off, each host has its own realm; on, one host holds all four', () => {
  assert.deepEqual(realmsByHost(['solo'], null, false), { solo: ['rivendell'] });
  assert.deepEqual(realmsByHost(['solo'], null, true), { solo: ['rivendell', 'shire', 'erebor', 'rohan'] });
  assert.deepEqual(realmsByHost(['solo'], { solo: 'erebor' }, true), { solo: ['erebor', 'rivendell', 'shire', 'rohan'] });
  // A realm the config gives a host that is not enabled is free (the example config names one).
  assert.deepEqual(realmsByHost(['main-mac'], { 'main-mac': 'rivendell', 'linux-box': 'erebor' }, true), { 'main-mac': ['rivendell', 'shire', 'erebor', 'rohan'] });
});

test('on with several hosts, the free realms are dealt round them and a host with no realm gets none', () => {
  assert.deepEqual(realmsByHost(['a', 'b'], null, true), { a: ['rivendell', 'erebor'], b: ['shire', 'rohan'] });
  assert.deepEqual(realmsByHost(['a', 'b', 'c'], { a: 'shire', b: 'rohan' }, true), { a: ['shire', 'rivendell'], b: ['rohan', 'erebor'], c: [] });
  assert.deepEqual(realmsByHost(['a', 'b', 'c', 'd', 'e'], null, true).e, []);
});

test('eight workers on one machine sit two to a realm', () => {
  const byHost = realmsByHost(['solo'], null, true);
  const ts = Array.from({ length: 8 }, () => live('solo'));
  assignRealms(ts, byHost, {}, T0);
  const per = {};
  for (const t of ts) per[t.realm] = (per[t.realm] ?? 0) + 1;
  assert.deepEqual(per, { rivendell: 2, shire: 2, erebor: 2, rohan: 2 });
});

test('the Sentry rider and the wanderers are balanced apart from the regular workers', () => {
  const byHost = realmsByHost(['solo'], null, true);
  const ts = [live('solo'), live('solo', { sentry: true }), live('solo', { adhoc: true })];
  assignRealms(ts, byHost, {}, T0);
  assert.deepEqual(ts.map((t) => t.realm), ['rivendell', 'rivendell', 'rivendell']);
});

test('a worker keeps its realm for its life and after its merge, while others start and finish', () => {
  const byHost = realmsByHost(['solo'], null, true);
  let mem = {};
  const watched = live('solo');
  let others = [live('solo'), live('solo'), live('solo')];
  const seen = [];
  for (let round = 0; round < 10; round += 1) {
    // One worker finishes and a new one starts each round.
    others = [...others.slice(1), live('solo')];
    const ts = [...others, { ...watched }].map((t) => ({ ...t }));
    mem = assignRealms(ts, byHost, mem, T0 + round * 60_000);
    seen.push(ts.find((t) => t.id === watched.id).realm);
  }
  assert.equal(new Set(seen).size, 1, `kept one realm: ${seen.join(',')}`);
  const merged = [{ ...watched, live: false, status: 'merged' }];
  assignRealms(merged, byHost, mem, T0 + 11 * 60_000);
  assert.equal(merged[0].realm, seen[0], 'the merge keeps it');
});

test('a merge the board never saw live takes its machine\'s first realm', () => {
  const t = { id: 'ABC-900', host: 'solo', live: false, status: 'merged' };
  assignRealms([t], realmsByHost(['solo'], { solo: 'shire' }, true), {}, T0);
  assert.equal(t.realm, 'shire');
});

test('with spread off every ticket sits in its machine\'s realm, and a host with no realm has none', () => {
  const byHost = realmsByHost(['a', 'b', 'c', 'd', 'e'], null, false);
  const ts = [live('a'), live('d'), live('e')];
  assignRealms(ts, byHost, { 'a/ABC-0': { realm: 'shire', seen: T0 } }, T0);
  assert.deepEqual(ts.map((t) => t.realm), ['rivendell', 'rohan', null]);
});

test('a remembered realm the machine no longer holds is given again, and old memory is dropped', () => {
  const t = live('solo');
  const mem = { [`solo/${t.id}`]: { realm: 'rohan', seen: T0 } , 'solo/ABC-OLD': { realm: 'shire', seen: T0 - KEEP_MS - 1 } };
  const next = assignRealms([t], realmsByHost(['solo'], null, false), mem, T0);
  assert.equal(t.realm, 'rivendell');
  assert.equal(next['solo/ABC-OLD'], undefined);
  assert.equal(next[`solo/${t.id}`].realm, 'rivendell');
});

test('with spread on, one enabled host the map does not name still fills all four realms', () => {
  assert.deepEqual(realmsByHost(['laptop'], { desktop: 'rivendell' }, true), { laptop: ['rivendell', 'shire', 'erebor', 'rohan'] });
  const ts = Array.from({ length: 4 }, () => live('laptop'));
  assignRealms(ts, realmsByHost(['laptop'], { desktop: 'rivendell' }, true), {}, T0);
  assert.deepEqual(ts.map((t) => t.realm).sort(), ['erebor', 'rivendell', 'rohan', 'shire']);
});

test('an inherited name in the map gives no realm, and a ticket on an unknown host gets none', () => {
  assert.deepEqual(realmsByHost(['solo'], { solo: 'constructor' }, false), { solo: [] });
  const ts = [live('solo'), live('constructor')];
  assignRealms(ts, realmsByHost(['solo'], { solo: 'constructor' }, false), {}, T0);
  assert.deepEqual(ts.map((t) => t.realm), [null, null]);
});

test('a ticket still on the board keeps its realm however old the memory, and one gone is forgotten', () => {
  const byHost = realmsByHost(['solo'], null, true);
  const t = live('solo');
  const old = T0 - KEEP_MS - 24 * 3600_000;
  const mem = { [`solo/${t.id}`]: { realm: 'rohan', seen: old }, 'solo/ABC-GONE': { realm: 'shire', seen: old } };
  const next = assignRealms([t], byHost, mem, T0);
  assert.equal(t.realm, 'rohan', 'kept after a board stopped for nine days');
  assert.equal(next['solo/ABC-GONE'], undefined);
  assert.equal(next[`solo/${t.id}`].seen, T0);
});
