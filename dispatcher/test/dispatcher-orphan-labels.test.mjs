// The orphan label check: a ticket labeled agent-building or agent-stuck that no enabled machine's state holds is logged
// once a day and asked about once after an hour, with no label changed. Other machines are read only from their synced
// heartbeats; a missing, ticket-less or stale heartbeat makes that machine unreadable and nothing is reported. The
// heartbeat this machine writes lists its tickets. Runs the real dispatcher in capacity-sandbox.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { capBox, heartbeat, lines, tick } from './capacity-sandbox.mjs';

const ORPHANS = [
  { identifier: 'ENG-88', state: { name: 'In Progress' }, labels: { nodes: [{ name: 'agent-building' }, { name: 'needs-human' }] } },
  { identifier: 'ENG-68', state: { name: 'In Progress' }, labels: { nodes: [{ name: 'agent-stuck' }] } },
];
function box(other) {
  const b = capBox({ dispatcher: { enabledHosts: ['host-a', 'host-b'], hosts: { 'host-a': { maxWorkers: 0, maxLoadPerCore: 1000, minMemoryFreePercent: 0 }, 'host-b': { maxWorkers: 0 } } },
    tickets: { 'ENG-68': { status: 'stuck', stuckAt: new Date().toISOString(), branch: 'agent/eng-68' } } });
  b.put('orphan-labels.json', ORPHANS);
  b.beat = (o) => {
    fs.mkdirSync(path.join(b.shared, 'heartbeats'), { recursive: true });
    fs.writeFileSync(path.join(b.shared, 'heartbeats/host-b.json'), JSON.stringify(o));
  };
  if (other) b.beat(other);
  return b;
}
const fresh = (tickets) => ({ host: 'host-b', at: new Date().toISOString(), tickets });
const logged = (out) => out.split('\n').filter((l) => /orphan label check: ENG-88/.test(l));

test('a ticket no machine holds is logged once a day, asked about once after an hour, and no label is touched', () => {
  const b = box(fresh({ 'ENG-90': 'building' }));
  const out1 = tick(b);
  assert.equal(new Set(logged(out1)).size, 1, out1);
  assert.match(logged(out1)[0], /ENG-88 \(In Progress\) is labeled agent-building, but no enabled machine's state holds it/);
  assert.doesNotMatch(out1, /orphan label check: ENG-68/, "this machine's own state holds ENG-68");
  assert.deepEqual(heartbeat(b).tickets, { 'ENG-68': 'stuck' });
  b.beat(fresh({ 'ENG-90': 'building' }));
  assert.equal(logged(tick(b)).length, 0, 'logged once a day');
  const memFile = path.join(b.stateDir, 'orphan-labels.json');
  const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
  mem['ENG-88'].since = new Date(Date.now() - 2 * 3.6e6).toISOString();
  fs.writeFileSync(memFile, JSON.stringify(mem));
  b.beat(fresh({ 'ENG-90': 'building' }));
  tick(b);
  b.beat(fresh({ 'ENG-90': 'building' }));
  tick(b);
  const asks = lines(b, 'asks').filter((l) => l.includes('ENG-88 is labeled agent-building'));
  assert.equal(asks.length, 1, lines(b, 'asks').join('\n'));
  assert.equal(lines(b, 'mutations').some((l) => /ENG-88|uuid-88/.test(l)), false, 'no label changed');
});

test("a ticket another machine's fresh heartbeat holds is not reported", () => {
  const b = box(fresh({ 'ENG-88': 'building' }));
  assert.equal(logged(tick(b)).length, 0);
});

test('a missing, ticket-less or stale heartbeat makes that machine unreadable, named once, and nothing is reported', () => {
  for (const other of [null, { host: 'host-b', at: new Date().toISOString() }, { host: 'host-b', at: new Date(Date.now() - 3 * 3.6e6).toISOString(), tickets: {} }]) {
    const b = box(other);
    const out = tick(b);
    assert.equal(logged(out).length, 0, out);
    assert.match(out, /orphan label check: skipped, unreadable: host-b \((no heartbeat|its heartbeat lists no tickets|heartbeat 20)/);
    assert.equal(lines(b, 'asks').some((l) => l.includes('ENG-88')), false);
  }
});

test('status prints a note instead of failing when Linear cannot be read, and still lists the tickets', async () => {
  const b = box(fresh({}));
  const preload = path.join(b.home, 'preload.mjs');
  fs.writeFileSync(preload, `${fs.readFileSync(preload, 'utf8')}\nglobalThis.fetch = async () => { throw new Error('no key'); };\n`);
  const { run } = await import('./capacity-sandbox.mjs');
  const out = run(b, ['status']);
  assert.match(out, /queue: unknown, Linear could not be read \(no key\)/);
  assert.match(out, /ENG-68\s+stuck/);
});
