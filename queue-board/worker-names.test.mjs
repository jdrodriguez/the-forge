// worker-names.test.mjs: node --test queue-board/worker-names.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giveNames } from './worker-names.mjs';
import { realmsByHost, assignRealms } from './realm-spread.mjs';

const POOLS = {
  rivendell: ['Elrond', 'Arwen', 'Haldir'], shire: ['Frodo', 'Sam', 'Merry'], erebor: ['Gimli', 'Balin', 'Dwalin'], rohan: ['Theoden', 'Eowyn', 'Hama'],
  sentry: ['Aragorn'], adhoc: ['Gandalf'], other: ['Beregond'],
};
const T0 = Date.parse('2026-11-12T12:00:00Z');
let seq = 0;
const live = (host, extra = {}) => ({ id: `ABC-${(seq += 1)}`, host, live: true, status: 'building', dispatchedAt: new Date(T0 + seq * 60_000).toISOString(), ...extra });
const fresh = () => ({ given: {}, lastGiven: {} });
const poolOf = (name) => Object.entries(POOLS).find(([, names]) => names.includes(name.replace(/ \d+$/, '')))?.[0];

test('with spread realms a worker is named from the realm it sits in', () => {
  const ts = Array.from({ length: 8 }, () => live('solo'));
  assignRealms(ts, realmsByHost(['solo'], null, true), {}, T0);
  giveNames(ts, POOLS, fresh(), { spread: true });
  for (const t of ts) assert.equal(poolOf(t.nickname), t.realm, `${t.id} ${t.nickname} in ${t.realm}`);
});

test('without spread a worker is named from its host pool, then its realm, then other', () => {
  const ts = [live('a'), live('b'), live('e')];
  assignRealms(ts, realmsByHost(['a', 'b', 'c', 'd', 'e'], null, false), {}, T0);
  giveNames(ts, { ...POOLS, b: ['Bilbo'] }, fresh());
  assert.deepEqual(ts.map((t) => t.nickname), ['Elrond', 'Bilbo', 'Beregond']);
});

test('a worker keeps its realm and its name across ten snapshots while others start and finish', () => {
  const byHost = realmsByHost(['solo'], null, true);
  const names = fresh();
  let mem = {};
  const watched = live('solo');
  let others = [live('solo'), live('solo'), live('solo'), live('solo')];
  const seen = [];
  for (let round = 0; round < 10; round += 1) {
    others = [...others.slice(1), live('solo')];
    const ts = [...others, watched].map((t) => ({ ...t, nickname: null }));
    mem = assignRealms(ts, byHost, mem, T0 + round * 60_000);
    giveNames(ts, POOLS, names, { spread: true, nowIso: new Date(T0 + round * 60_000).toISOString() });
    const w = ts.find((t) => t.id === watched.id);
    seen.push(`${w.realm}:${w.nickname}`);
    assert.equal(new Set(ts.filter((t) => t.live).map((t) => t.nickname)).size, ts.length, 'no two live workers share a name');
  }
  assert.equal(new Set(seen).size, 1, seen.join(' '));
  assert.equal(poolOf(seen[0].split(':')[1]), seen[0].split(':')[0]);
});

test('a name the dispatcher gave wins, and a full pool numbers its names', () => {
  const ts = [live('solo', { nickname: 'Legolas' }), live('solo'), live('solo'), live('solo'), live('solo')];
  for (const t of ts) t.realm = 'shire';
  giveNames(ts, POOLS, fresh(), { spread: true });
  assert.equal(ts[0].nickname, 'Legolas');
  assert.deepEqual(ts.slice(1).map((t) => t.nickname).sort(), ['Frodo', 'Frodo 2', 'Merry', 'Sam']);
});

test('a realm or host named like an inherited property finds no pool and takes other', () => {
  const ts = [live('constructor', { realm: 'toString' })];
  giveNames(ts, POOLS, fresh(), { spread: true });
  assert.equal(ts[0].nickname, 'Beregond');
});
