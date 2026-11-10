// scene2.js: Middle-earth seen from above (v2, 2026-11-07, #map), built beside the side view (scene.js, #scene), each
// a view of its own. The same workers drawn top-down in the 3/4 overhead look of 16-bit and 32-bit RPGs,
// on a map that follows Middle-earth as the books lay it out ("what we call the road today can be any other
// realm"), compressed to fill the view: each machine a realm at its place (the Shire, Rivendell, Erebor, Edoras for any
// other), the lands between drawn as mountains, forests, rivers and plains, quiet for now and ready for the later
// phases (the riders, wanderers, eagles, Gollum, Saruman, the orcs and Mordor's Eye find their places in the plan).
// Every live worker stands at its station (a desk, a garden plot, an anvil), walks to a spot or two while it works,
// sleeps when idle, and shows the side view's bubble for its mood; its name over it opens its session. The parts: the
// plan (scene2-plan.js), the ground (scene2-tiles.js), buildings (scene2-build.js), trees (scene2-trees.js), the lands
// (scene2-lands.js, scene2-places.js), each realm (scene2-rivendell.js, scene2-shire.js, scene2-erebor.js,
// scene2-rohan.js, which also composes the world), stations (scene2-stations.js), the figures (scene2-elf.js,
// scene2-folk.js), their rounds (scene2-move.js), what moves on the ground and the night (scene2-fx.js), and the names
// and clicks (scene2-tags.js). It keeps its own state and canvas and borrows v1's moods and art helpers read-only.
//
// Weather, when it comes (a later phase; 2026-11-07: "Don't want the clouds covering the work surface. But I do
// want to still show weather."): nothing may ever hide a worker, a station, a name or a bubble. Over the realms, only
// soft translucent cloud shadows that drift across and darken the ground a little; real cloud tops only over the empty
// lands and the map's edges (the mountains, the wilds between realms); rain as fine streaks, splashes and a wet sheen on
// the ground; snow settling on roofs and ground; fog only as a light veil that thins to nothing round workers and
// stations; lightning as a flash of light; wind in the trees and grass. The frame keeps a pass for each (under the
// standing things for shadows and sheen, over them for rain and snow, outside the realms' boxes for cloud tops).

const M2_RES = 4;
const m2 = { W: 320, H: 240, scale: 2, realms: [], stations: [], actors: new Map(), seats: new Map(), tags: new Map(),
  objects: [], anim: [], lights: [], tick: 0, running: false, last: 0, sky: null, ground: null, key: '', at: null, cost: 0,
  // The hooks the map's later parts register at load. builds(L, plan, season, add): once per layout, after the realms
  // and lands are painted (add.obj, add.anim, add.light as the composers use them). syncs(snap, relaid): after every
  // snapshot is matched. step.sentry(a, reduced) / step.road(a, reduced): a Sentry rider's or a wanderer's own moves.
  // layers, each frame: ground(g, tick, reduced) on the ground under everything that stands; items(add, tick, reduced)
  // puts standing things in the depth sort with add(z, draw, [x0, y0, x1, y1]) (the box stamps again any baked thing
  // in front of it); air(g, tick, reduced) over everything, before the night's shade; light(g, tick, reduced) after it.
  builds: [], syncs: [], step: {}, layers: { ground: [], items: [], air: [], light: [] } };
$('map').innerHTML = '<div class="sc-wrap"><div class="sc-stage m2-stage"><canvas></canvas><div class="sc-tags"></div></div></div>';
const m2Stage = $('map').querySelector('.sc-stage');
const m2View = m2Stage.querySelector('canvas');
const m2Tags = m2Stage.querySelector('.sc-tags');
const m2Off = document.createElement('canvas');
const m2G = m2Off.getContext('2d');
const m2Reduced = matchMedia('(prefers-reduced-motion: reduce)');
// The scene's clock (scenery-sun.js), or a fixed moment a test page sets in m2.at to render day or night on demand.
const m2Date = () => (m2.at ? new Date(m2.at) : new Date());
const m2Season = () => SEASONS[sceneNow(m2Date()).month];

// The largest whole-number scale (at least 2) at which the realms get the room they need (m2Plan), then a world that
// fills the column's width and the window's height down to the bottom at that scale, so every pixel stays square. A
// screen too small even at 2 scrolls sideways, as the side view does on a phone.
function m2Fit() {
  const availW = m2Stage.parentElement.clientWidth;
  if (availW < 40) return null;
  m2.fitTop = m2Stage.getBoundingClientRect().top + $('main').scrollTop + window.scrollY;
  const inset = getComputedStyle($('main')).overflowY === 'visible' ? 0 : 11;
  const availH = Math.max(150, window.innerHeight - m2.fitTop - inset);
  for (let s = 6; s >= 2; s -= 1) {
    const plan = m2Plan(Math.floor(availW / s), Math.floor(availH / s));
    if (plan.fits || s === 2) { m2.scale = s; return plan.fits || plan.W >= plan.minW ? plan : m2Plan(plan.minW, Math.floor(availH / s)); }
  }
  return null;
}

// Lays the world out again (the plan, the ground cache, the realms' objects) when its size, its realms or the season
// change, then matches live workers to stations, keeping each worker's station and place between snapshots.
function m2Sync() {
  if (!snap || !m2.running) return;
  m2.snap = snap;
  const plan = m2Fit();
  if (!plan) return;
  const key = [plan.W, plan.H, m2.scale, m2Season(), plan.realms.map((r) => `${r.m.host}${r.n},${r.k}`).join()].join('|');
  const relaid = key !== m2.key;
  if (relaid) {
    Object.assign(m2, { W: plan.W, H: plan.H, plan, realms: plan.realms, stations: plan.stations, key });
    m2Size();
    m2Build();
  }
  const live = snap.tickets.filter((t) => t.live).sort((a, b) => (a.dispatchedAt || '').localeCompare(b.dispatchedAt || ''));
  const keep = new Set();
  const taken = new Set();
  for (const t of live) {
    const key2 = `${t.host}/${t.id}`;
    keep.add(key2);
    const realm = m2.realms.find((r) => r.m.host === t.host) ?? m2.realms[0];
    if (!realm) continue;
    let st = null;
    if (!t.adhoc) {
      // A Sentry rider keeps its post in its captain's own land; a worker its station in its machine's realm.
      const land = t.sentry ? m2WatchOf(t.nickname) : null;
      const mine = m2.stations.filter((s) => (t.sentry ? s.sentry && s.land === land : !s.sentry && s.realm === realm) && !taken.has(s.id));
      st = mine.find((s) => s.id === m2.seats.get(key2)) ?? mine[0] ?? null;
      if (st) { taken.add(st.id); m2.seats.set(key2, st.id); }
    }
    const old = m2.actors.get(key2);
    const was = old ? { x: old.x - old.homeX, y: old.y - old.homeY, realm: old.realm } : null;
    const home = st ? { x: st.hx, y: st.hy } : old?.road && !relaid ? { x: old.homeX, y: old.homeY } : m2RoadSpot(m2.plan, t.nickname, pxHash(key2));
    const a = old ?? { key: key2, x: home.x, y: home.y, face: 'down', seed: pxHash(key2) % 97 };
    const mood = scMood(t);
    Object.assign(a, { t, mood, station: st, realm, road: !st, homeX: home.x, homeY: home.y, stage: scStage4(t, mood),
      kind: m2Kind(t, st, realm), name: t.nickname || t.label || t.id });
    // Another realm puts the worker straight at its new home. A new layout keeps it where it was, shifted with its home
    // (its walk and its job are dropped, since their spots moved, and its rounds bring it home from there).
    if (old && was.realm !== realm) Object.assign(a, { x: home.x, y: home.y, route: null, job: null });
    else if (old && relaid) {
      if (a.job?.spot?.by === a.key) a.job.spot.by = null;
      Object.assign(a, { x: Math.max(2, Math.min(m2.W - 2, home.x + was.x)), y: Math.max(8, Math.min(m2.H - 1, home.y + was.y)), route: null, job: null });
    }
    m2.actors.set(key2, a);
  }
  for (const k of [...m2.actors.keys()]) if (!keep.has(k)) m2.actors.delete(k);
  for (const s of m2.stations) s.actor = [...m2.actors.values()].find((a) => a.station === s) ?? null;
  for (const f of m2.syncs) f(snap, relaid);
  m2TagsBuild();
  if (m2Reduced.matches) m2Frame();
}
// A worker's people: its realm's (a Codex or Grok worker too, marked only on its tag), a Sentry rider's or a wanderer's
// own when those files know it, else a wizard.
function m2Kind(t, st, realm) {
  if (t.adhoc) return typeof wandererKind === 'function' ? wandererKind(t.nickname) : 'wizard';
  if (st?.sentry) return typeof captainKind === 'function' ? captainKind(t.nickname) : 'ranger';
  return realm.kind;
}

// Sizes the canvases and the stage to the world.
function m2Size() {
  const dpr = window.devicePixelRatio || 1;
  m2Off.width = m2.W * M2_RES;
  m2Off.height = m2.H * M2_RES;
  m2Stage.style.width = `${m2.W * m2.scale}px`;
  m2Stage.style.height = `${m2.H * m2.scale}px`;
  m2Stage.style.setProperty('--sc-font', `${Math.max(9, Math.round(m2.scale * 3.3))}px`);
  m2View.width = m2.W * m2.scale * dpr;
  m2View.height = m2.H * m2.scale * dpr;
}

// The still world: the ground painted once into a cache at 4 pixels a unit (scene2-tiles.js), and the realms' standing
// things (buildings, trees, rocks), their moving parts and their lights, each realm's composer adding its own.
function m2Build() {
  const W = m2.W;
  const H = m2.H;
  const t0 = performance.now();
  const L = m2Land(W, H);
  m2.objects = [];
  m2.anim = [];
  m2.lights = [];
  const season = m2Season();
  // late: work a realm wants done once the rivers and roads are down (planting its trees clear of them).
  const late = [];
  const add = { obj: (o) => m2.objects.push(o), anim: (f) => m2.anim.push(f), light: (l) => m2.lights.push(l), late: (f) => late.push(f), runLate: () => late.splice(0).forEach((f) => f()) };
  m2PaintWorld(L, m2.plan, season, add);
  for (const f of m2.builds) f(L, m2.plan, season, add);
  add.runLate();
  m2.ground = m2LandFinish(L, m2.plan, season);
  m2Bake();
  m2.buildMs = performance.now() - t0;
}
// Bakes every standing thing with a box into the ground cache, in depth order, and files it in a grid of 32-unit cells,
// so a frame stamps again only the few that stand in front of a figure or station they overlap (m2Front).
function m2Bake() {
  const g = m2.ground.getContext('2d');
  const boxed = m2.objects.filter((o) => o.w).sort((a, b) => a.z - b.z);
  boxed.forEach((o) => o.draw(g, 0));
  m2.grid = new Map();
  for (const o of boxed) {
    for (let cy = Math.floor(o.y / 32); cy <= Math.floor((o.y + o.h) / 32); cy += 1) {
      for (let cx = Math.floor(o.x / 32); cx <= Math.floor((o.x + o.w) / 32); cx += 1) {
        const k = cy * 1000 + cx;
        if (!m2.grid.has(k)) m2.grid.set(k, []);
        m2.grid.get(k).push(o);
      }
    }
  }
  m2.baked = boxed.length;
  m2.standing = boxed;
  m2.objects = m2.objects.filter((o) => !o.w);
}
// The baked things that stand in front of (z above) a moving or changing thing in the box x0..x1, y0..y1, to stamp again.
function m2Front(out, x0, y0, x1, y1, z) {
  for (let cy = Math.floor(y0 / 32); cy <= Math.floor(y1 / 32); cy += 1) {
    for (let cx = Math.floor(x0 / 32); cx <= Math.floor(x1 / 32); cx += 1) {
      for (const o of m2.grid.get(cy * 1000 + cx) ?? []) if (o.z > z && o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0) out.add(o);
    }
  }
}

// One frame: the ground from its cache, then everything that stands (buildings, trees, stations, figures) sorted by
// where it meets the ground, the moving water, fire and smoke, the night's shade and lights, and the bubbles.
function m2Frame() {
  const t0 = performance.now();
  m2.tick += 1;
  if (m2.tick % 10 === 0 && Math.abs(m2Stage.getBoundingClientRect().top + $('main').scrollTop + window.scrollY - m2.fitTop) > 1) m2Sync();
  if (m2.tick % 300 === 0 || !m2.sky) m2.sky = skyAt(m2Date());
  if (!m2.ground) return;
  const g = m2G;
  g.setTransform(M2_RES, 0, 0, M2_RES, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(m2.ground, 0, 0, m2.W, m2.H);
  const reduced = m2Reduced.matches;
  for (const f of m2.anim) if (f.under) f(g, m2.tick, reduced);
  for (const f of m2.layers.ground) f(g, m2.tick, reduced);
  const items = m2.objects.map((o) => ({ z: o.z, draw: () => o.draw(g, m2.tick) }));
  const front = new Set();
  // The bodies of the workers, so a baked thing stamped in front of one (a tree's crown, a roof) shows it through.
  const bodies = [];
  for (const s of m2.stations) {
    items.push({ z: s.y, draw: () => m2DrawStation(g, s, s.actor?.stage ?? 0, m2.tick) });
    const sb = typeof m2StationBox === 'function' ? m2StationBox(s) : [s.x - 7, s.y - 13, s.x + 7, s.y + 1];
    m2Front(front, sb[0], sb[1], sb[2], sb[3], s.y);
  }
  for (const a of m2.actors.values()) {
    m2Step(a, reduced);
    // A worker at its desk is drawn just before it, so the desk hides its lower body (scene2-stations.js M2_STATION_TOP).
    const z = a.atDesk ? a.station.y - 0.1 : a.y;
    const b = m2BodyOf(a.kind);
    items.push({ z, draw: () => m2DrawActor(g, a) });
    // A mounted rider (scene2-rider.js) gives its own box, the rider from head to boots, and the whole mount is covered.
    if (a.box) m2Front(front, a.x - 15, a.y - 29, a.x + 15, a.y + 2.5, z);
    else m2Front(front, a.x - b.fx, a.y - b.fy, a.x - b.fx + b.w, a.y + 2.5, z);
    const [x0, y0, x1, y1] = a.box ?? [a.x - b.fx, a.y - b.head - 1, a.x - b.fx + b.w, a.y + 1];
    bodies.push({ z, x0, y0, x1, y1 });
  }
  for (const f of m2.anim) if (f.item) items.push({ z: f.z, draw: () => f(g, m2.tick, reduced) });
  const add = (z, draw, box) => { items.push({ z, draw }); if (box) m2Front(front, box[0], box[1], box[2], box[3], z); };
  for (const f of m2.layers.items) f(add, m2.tick, reduced);
  for (const o of front) {
    const hide = bodies.filter((q) => q.z < o.z && o.x < q.x1 && o.x + o.w > q.x0 && o.y < q.y1 && o.y + o.h > q.y0);
    items.push({ z: o.z, draw: () => (hide.length ? m2SeeThrough(g, o, hide) : o.draw(g, m2.tick)) });
  }
  items.sort((p, q) => p.z - q.z).forEach((i) => i.draw());
  for (const f of m2.anim) if (f.over) f(g, m2.tick, reduced);
  for (const f of m2.layers.air) f(g, m2.tick, reduced);
  m2Night(g, m2.sky, m2.tick);
  for (const f of m2.layers.light) f(g, m2.tick, reduced);
  for (const a of m2.actors.values()) {
    const glyph = SC_GLYPH[a.mood];
    if (glyph && !(a.mood === 'checking' && a.moving)) drawBubble(g, Math.round(a.x), Math.round(a.y) - m2Head(a) - 1, glyph, a.mood === 'stalled' ? PX.red : undefined);
  }
  const v = m2View.getContext('2d');
  v.imageSmoothingEnabled = m2View.width < m2Off.width;
  v.imageSmoothingQuality = 'high';
  v.drawImage(m2Off, 0, 0, m2Off.width, m2Off.height, 0, 0, m2View.width, m2View.height);
  m2PlaceTags();
  m2.cost = m2.cost * 0.9 + (performance.now() - t0) * 0.1;
}

// Draws a baked thing that stands in front of workers: whole outside their bodies, and at a quarter of its strength over
// them, so a figure under a crown or behind a roof is always seen.
function m2SeeThrough(g, o, hide) {
  g.save();
  g.beginPath();
  g.rect(o.x, o.y, o.w, o.h);
  for (const q of hide) g.rect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
  g.clip('evenodd');
  o.draw(g, m2.tick);
  g.restore();
  g.save();
  g.beginPath();
  for (const q of hide) g.rect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
  g.clip();
  g.globalAlpha = 0.24;
  o.draw(g, m2.tick);
  g.restore();
}

function m2Loop(now) {
  if (!m2.running) return;
  requestAnimationFrame(m2Loop);
  if (now - m2.last < 100 || document.hidden) return;
  m2.last = now;
  m2Frame();
}
// page.html's applyView calls this with whether the view from above is open (#map).
// It starts only once the page has run every script: the first snapshot's applyView (page.html's poll) can come before
// the later scene2 files load, and a sync then would throw on a part not there yet (the DOMContentLoaded start below
// runs it instead). The loop is asked for before the sync, so a sync that throws can never leave m2.running on with no
// frames coming (2026-11-09: the map stayed frozen on about half of all loads).
function mapShow(on) {
  if (on && !m2.running && document.readyState !== 'loading') {
    m2.running = true;
    if (!m2Reduced.matches) requestAnimationFrame(m2Loop);
    m2Sync();
    if (m2Reduced.matches) m2Frame();
  } else if (!on) m2.running = false;
  // The live call stream (scene2-call-bar.js), one for the page while either view of Middle-earth is open.
  if (typeof m2eStream === 'function') m2eStream(m2.running);
}
// A resize (page.html fires one on every switch of view) lays the world out for its new size, and a
// new snapshot (page.html replaces snap on every poll) re-matches the workers within a second.
window.addEventListener('resize', () => { if (m2.running) { m2Sync(); m2Frame(); } });
setInterval(() => { if (m2.running && snap !== m2.snap) m2Sync(); }, 1000);
// The first start waits until every script has run, since the map's parts load after this file.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mapShow(view === 'map'), { once: true });
else mapShow(view === 'map');
