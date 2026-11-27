// page.test.mjs: the page smoke test (npm run test:page). It starts this repo's board on a spare port with a throwaway
// config, loads every view in headless Chrome with each snapshot fixture (fixtures.mjs), and fails on any uncaught
// page error. With four machines it checks both Middle-earth views at five window sizes: four realms, each worker at a
// station in its own machine's realm, the frame clock moving, and none of the map's overlaps (page-probe.js).
// PAGE_SHOTS=<folder> keeps a screenshot of each check there. Without Chrome every test skips and says why.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, startBoard, startChrome } from './page.mjs';
import { fourMachines, threeMachines, oneMachine } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = fs.readFileSync(path.join(HERE, 'page-probe.js'), 'utf8');
const VIEWS = ['queue', 'sessions', 'inbox', 'scene', 'map', 'fleet', 'worktrees'];
const SIZES = [[1100, 900], [1400, 900], [1790, 1260], [2400, 1500], [390, 844]];
const SHOTS = process.env.PAGE_SHOTS || null;
const NO_CHROME = chromePath() ? false : 'no headless Chrome found (set CHROME to its path); the page tests did not run';
if (NO_CHROME) console.log(`# skipped: ${NO_CHROME}`);

let board = null, chrome = null;
before(async () => {
  if (NO_CHROME) return;
  board = await startBoard(Number(process.env.PAGE_PORT) || 8797);
  chrome = await startChrome(Number(process.env.PAGE_CDP_PORT) || 9397);
});
after(async () => {
  board?.stop();
  await chrome?.close();
});

const shot = (name, png) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), png); } };
const load = (fixture, v, [width, height] = [1790, 1260], settle = 4500) => chrome.open(`${board.base}/#${v}`, { width, height, fixture, settle, expr: PROBE });

for (const [name, make] of [['four', fourMachines], ['three', threeMachines], ['one', oneMachine]]) {
  test(`every view loads the ${name}-machine fixture with no page error`, { skip: NO_CHROME }, async () => {
    for (const v of VIEWS) {
      const r = await load(make(), v);
      shot(`${name}-${v}-1790x1260`, r.png);
      assert.deepEqual(r.errors, [], `${name} ${v}`);
      assert.equal(r.value?.view, v, `${name} ${v} opened`);
    }
  });
}

// Each live worker in the queue stands at a station of its own machine's realm (Sentry riders and wanderers keep to
// the road and their posts).
function checkWorkers(value, fix, label) {
  const seated = fix.tickets.filter((t) => t.live && !t.adhoc && !t.sentry);
  for (const t of seated) {
    const w = value.workers.find((x) => x.id === t.id);
    assert.ok(w, `${label}: ${t.id} is drawn`);
    assert.equal(w.realm, t.host, `${label}: ${t.id} is in its machine's realm`);
    assert.ok(w.station, `${label}: ${t.id} has a station`);
  }
}

// The map's landmark zones are the room each landmark keeps for its drawing, and with three realms Rivendell's valley
// already holds Moria's west gate and touches the zones of the wilds round it (Bree, Weathertop, the Barrow-downs,
// Goblin-town's cave) at some sizes, as the Shire touches Bree's and the Trollshaws'. Those are the map as it was
// designed. A fourth realm may add none: no realm overlaps another or runs off the map, no Sentry post stands in a
// realm, Rohan touches no landmark, and every other contact is one the three-realm map has at the same size.
for (const [width, height] of SIZES) {
  test(`four realms in both views at ${width}x${height}, workers at their stations, no overlap`, { skip: NO_CHROME }, async () => {
    for (const v of ['scene', 'map']) {
      const fix = fourMachines();
      const r = await load(fix, v, [width, height], 6000);
      shot(`four-${v}-${width}x${height}`, r.png);
      const label = `${v} ${width}x${height}`;
      assert.deepEqual(r.errors, [], label);
      assert.deepEqual(r.value.realms.map((x) => x.kind), ['elf', 'hobbit', 'dwarf', 'man'], label);
      assert.deepEqual(r.value.realms.map((x) => x.title), ['Rivendell', 'The Shire', 'Erebor', 'Rohan'], label);
      assert.ok(r.value.ticks[1] > r.value.ticks[0], `${label}: the frame clock moves`);
      checkWorkers(r.value, fix, label);
      if (v === 'scene') { assert.deepEqual(r.value.clashes, [], label); continue; }
      assert.ok(r.value.realms[3].edoras, `${label}: Rohan is Edoras`);
      const three = await load(threeMachines(), v, [width, height], 4000);
      shot(`three-${v}-${width}x${height}`, three.png);
      const before = new Set(three.value.clashes.filter((c) => / overlaps landmark /.test(c)));
      const added = r.value.clashes.filter((c) => !before.has(c));
      assert.deepEqual(added, [], `${label}: overlaps the three-realm map does not have`);
      assert.ok(!r.value.clashes.some((c) => c.includes('Rohan')), label);
    }
  });
}