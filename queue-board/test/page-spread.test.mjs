// page-spread.test.mjs: one computer, the whole map (npm run test:page). With spread realms one machine's workers fill
// all four realms in both Middle-earth views, while every other view keeps the one real machine. It feeds the page
// snapshots built the way board.mjs builds them (fixtures.mjs oneMachine, oneMachineRounds) and checks: two workers in
// each realm, a worker keeping its realm and name over ten snapshots, a click on a worker opening its session panel and
// a click on Gollum's heap opening the real machine's Gollum page, the slot totals, and one realm with spread off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, startBoard, startChrome } from './page.mjs';
import { oneMachine, oneMachineRounds } from './fixtures.mjs';

const PROBE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'page-probe.js'), 'utf8');
const SHOTS = process.env.PAGE_SHOTS || null;
const NO_CHROME = chromePath() ? false : 'no headless Chrome found (set CHROME to its path); the page tests did not run';
const HOST = 'forge-solo';
const drawnHost = (realm) => (realm === 'rivendell' ? HOST : `${HOST}~${realm}`);

let board = null, chrome = null;
before(async () => {
  if (NO_CHROME) return;
  board = await startBoard(Number(process.env.PAGE_PORT2) || 8798);
  chrome = await startChrome(Number(process.env.PAGE_CDP_PORT2) || 9398);
});
after(async () => {
  board?.stop();
  await chrome?.close();
});
const shot = (name, png) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), png); } };
const load = (fixture, v, expr = PROBE, settle = 5000) => chrome.open(`${board.base}/#${v}`, { fixture, settle, expr });

test('one machine with eight live workers draws four realms with two workers each, in both views', { skip: NO_CHROME }, async () => {
  for (const v of ['scene', 'map']) {
    const fix = oneMachine();
    const r = await load(fix, v);
    shot(`one-spread-${v}-1790x1260`, r.png);
    assert.deepEqual(r.errors, [], v);
    assert.deepEqual(r.value.realms.map((x) => x.title).sort(), ['Erebor', 'Rivendell', 'Rohan', 'The Shire'], v);
    assert.deepEqual(r.value.clashes.filter((c) => !/ overlaps landmark /.test(c)), [], v);
    const seated = fix.tickets.filter((t) => t.live && !t.sentry && !t.adhoc);
    const per = {};
    for (const t of seated) {
      const w = r.value.workers.find((x) => x.id === t.id);
      assert.equal(w?.realm, drawnHost(t.realm), `${v}: ${t.id} sits in ${t.realm}`);
      assert.ok(w.station, `${v}: ${t.id} has a station`);
      per[w.realm] = (per[w.realm] ?? 0) + 1;
    }
    assert.deepEqual(Object.values(per), [2, 2, 2, 2], v);
  }
});

test('a worker keeps its realm and its name across ten snapshots while others start and finish', { skip: NO_CHROME }, async () => {
  const { snaps, watched } = oneMachineRounds();
  for (const v of ['scene', 'map']) {
    const expr = `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const seen = [];
      for (const s of ${JSON.stringify(snaps)}) {
        window.__fixture(s);
        await poll();
        await wait(1500);
        const actors = view === 'map' ? m2.actors : sc.actors;
        const a = [...actors.values()].find((x) => x.t?.id === ${JSON.stringify(watched)});
        seen.push(a ? [a.realm?.m.host, a.realm?.title, a.name, a.station?.id].join('|') : 'missing');
      }
      return seen;
    })()`;
    const r = await load(snaps[0], v, expr, 4000);
    assert.deepEqual(r.errors, [], v);
    assert.equal(r.value.length, 10, v);
    assert.equal(new Set(r.value).size, 1, `${v}: ${r.value.join(' / ')}`);
    assert.ok(!r.value[0].startsWith('missing'), v);
  }
});

test('a click on a worker opens its session panel, and a click on Gollum opens the real machine\'s Gollum page', { skip: NO_CHROME }, async () => {
  const fix = oneMachine();
  const far = fix.tickets.find((t) => t.live && t.realm === 'erebor');
  for (const v of ['scene', 'map']) {
    const expr = `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      const tags = view === 'map' ? m2Tags : scTags;
      const tag = [...tags.querySelectorAll('[data-id]')].find((b) => b.dataset.id.endsWith(${JSON.stringify(far.id)}));
      tag?.click();
      await wait(2500);
      out.panel = Boolean(sessEl.open) && sessEl.innerText.includes(${JSON.stringify(far.id)});
      sessEl.close?.();
      await wait(300);
      const canvas = view === 'map' ? m2View : scCanvas;
      const box = canvas.getBoundingClientRect();
      let at = null;
      for (let i = 0; i < 40 && !at; i += 1) {
        if (view === 'map') { const L = m2eLairs.by.get(${JSON.stringify(HOST)}); if (L) at = [L.heap.x / m2.W, L.heap.y / m2.H]; }
        else { const g = gols.get(${JSON.stringify(HOST)}); if (g?.hoard) at = [g.hoard[0] / sc.W, (g.hoard[1] + sc.dy - 0.5) / sc.H]; }
        if (!at) await wait(250);
      }
      out.lairs = view === 'map' ? [...m2eLairs.by.keys()].filter((h) => grHost(h)?.rows.length || grHost(h)?.ring.length) : [...gols.values()].filter((g) => g.job).map((g) => g.host);
      if (at) canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + at[0] * box.width, clientY: box.top + at[1] * box.height }));
      await wait(800);
      out.hash = location.hash;
      return out;
    })()`;
    const r = await load(fix, v, expr, 6000);
    assert.deepEqual(r.errors, [], v);
    assert.equal(r.value.panel, true, `${v}: the panel opened on ${far.id}`);
    assert.deepEqual(r.value.lairs, [HOST], `${v}: one Gollum, in the first realm`);
    assert.equal(r.value.hash, `#gollum/${HOST}`, v);
  }
});

test('the header and the Queue view count the machine\'s own slots, and the other views show one machine', { skip: NO_CHROME }, async () => {
  const fix = oneMachine();
  const expr = `({ header: [...document.querySelectorAll('.stat')].map((e) => e.innerText).join(' | '), queue: document.getElementById('view-queue')?.innerText ?? '' })`;
  const q = await load(fix, 'queue', expr);
  assert.deepEqual(q.errors, [], 'queue');
  assert.match(q.value.header, /\b\d+ of 8 building\b/);
  assert.match(q.value.queue, /\b\d+ of 8 at work\b/);
  // No drawn realm's id (host~realm) reaches a card, a link or the text of the views that show machines.
  for (const v of ['queue', 'machines', 'worktrees', 'gollum', 'sessions']) {
    const r = await load(fix, v, `({ cards: [...document.querySelectorAll('#view-${v} article.mcard[id]')].map((e) => e.id), drawn: document.getElementById('view-${v}').innerHTML.includes('${HOST}~') })`);
    assert.deepEqual(r.errors, [], v);
    assert.equal(r.value.drawn, false, `${v} shows only the real machine`);
    if (v === 'machines') assert.ok(r.value.cards.includes(`m-${HOST}`), `${v}: ${r.value.cards}`);
    if (v === 'gollum') assert.ok(r.value.cards.includes(`g-${HOST}`), `${v}: ${r.value.cards}`);
  }
});

test('with spreadRealms false the same machine draws one realm, as before', { skip: NO_CHROME }, async () => {
  for (const v of ['scene', 'map']) {
    const fix = oneMachine(Date.now(), 8, { spread: false });
    const r = await load(fix, v);
    shot(`one-plain-${v}-1790x1260`, r.png);
    assert.deepEqual(r.errors, [], v);
    assert.deepEqual(r.value.realms.map((x) => x.title), ['Rivendell'], v);
    // Every live worker is drawn, and the regular ones sit at stations in the one realm.
    const live = fix.tickets.filter((t) => t.live);
    assert.deepEqual(r.value.workers.map((w) => w.id).sort(), live.map((t) => t.id).sort(), v);
    for (const t of live.filter((x) => !x.sentry)) {
      const w = r.value.workers.find((x) => x.id === t.id);
      assert.equal(w.realm, HOST, `${v}: ${t.id}`);
      assert.ok(w.station, `${v}: ${t.id} has a station`);
    }
  }
});
