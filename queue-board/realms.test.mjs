// realms.test.mjs: node --test queue-board/realms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REALM_KINDS, REALM_ORDER, realmTable } from './realms.mjs';

const HOSTS = ['box-a', 'box-b', 'box-c', 'box-d', 'box-e'];

test('four realms, each with a key, a name and a folk', () => {
  assert.deepEqual(REALM_ORDER, ['rivendell', 'shire', 'erebor', 'rohan']);
  assert.deepEqual(REALM_KINDS.rohan, { key: 'rohan', name: 'Rohan', folk: 'man' });
  for (const [k, r] of Object.entries(REALM_KINDS)) assert.equal(r.key, k);
});

test('with no map the enabled hosts take Rivendell, the Shire, Erebor and Rohan in order, and a fifth has none', () => {
  const t = realmTable(HOSTS, null);
  assert.deepEqual(Object.fromEntries(Object.entries(t).map(([h, r]) => [h, r.key])), { 'box-a': 'rivendell', 'box-b': 'shire', 'box-c': 'erebor', 'box-d': 'rohan' });
  assert.equal(t['box-e'], undefined);
  assert.deepEqual(t['box-d'], { key: 'rohan', name: 'Rohan', folk: 'man' });
});

test('one, two and three hosts take the first realms', () => {
  assert.deepEqual(Object.keys(realmTable(['solo'], undefined)), ['solo']);
  assert.equal(realmTable(['solo'])['solo'].key, 'rivendell');
  assert.equal(realmTable(['x', 'y', 'z'])['z'].key, 'erebor');
});

test('the config can name Rohan, and an unknown key leaves that host as the fallback', () => {
  const t = realmTable(HOSTS, { 'box-a': 'rohan', 'box-b': 'erebor', 'box-c': 'gondor' });
  assert.equal(t['box-a'].key, 'rohan');
  assert.equal(t['box-a'].folk, 'man');
  assert.equal(t['box-b'].name, 'Erebor');
  assert.equal(t['box-c'], undefined);
  assert.equal(t['box-d'], undefined, 'a map given in full leaves the rest unnamed');
  assert.deepEqual(Object.keys(realmTable(['box-a'], { 'box-a': 'shire', 'off-box': 'erebor' })), ['box-a'], 'a host that is not enabled has no entry');
});

test('entries are copies, so a caller cannot change the kinds', () => {
  const t = realmTable(['solo']);
  t.solo.name = 'Changed';
  assert.equal(REALM_KINDS.rivendell.name, 'Rivendell');
});
