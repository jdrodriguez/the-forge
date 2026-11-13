// herald-realms.test.mjs: each realm's merge cue in the herald's event rules (herald-events.mjs): Rohan's horn, a
// fifth machine, a spread machine's ticket in the realm its worker sat in, and names an object inherits.
// Run: node --test queue-board/herald-realms.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { step } from './herald-events.mjs';

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

test('a realm or folk named like an inherited property plays the Men\'s horn and throws nothing', () => {
  const merged = { id: 'ABC-8', label: 'ABC-8', host: 'odd-box', realm: 'constructor', status: 'merged', mergedAt: new Date(T0).toISOString(), nickname: 'Hama', title: 'Fix', prNumber: 6 };
  const machines = [machine('odd-box', 'odd')];
  const config = { realms: { 'odd-box': { key: null, name: 'Odd', folk: 'toString' } } };
  const out = diff(snap({ machines, tickets: [], config }), snap({ machines, tickets: [merged], config }));
  assert.equal(out.events[0].cue, 'merge-rohan');
  assert.equal(out.events[0].head, 'Hama merged ABC-8 · Odd');
});
