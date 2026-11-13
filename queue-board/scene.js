// scene.js: the Middle-earth view, eye candy over the same snapshot as the Queue. Each machine is a realm and each live
// worker a figure of its people (sprites.js) at a station there, acting out where its ticket stands: working, asleep when
// idle (with an hourglass while CI runs), CI failing (!, and an orc to fight), waiting on the owner (raised hand, ?), stalled
// (asleep, a red Z), green (cheering) or ended (a ghost). The station shows how far the PR has come. A busy worker goes
// on rounds about its realm (scene-work.js, sc.work) and the Sentry's Ranger rides the road (scene-ride.js, sc.ride);
// workers outside the queue walk the road while busy and sleep where they stop; a merge in the last 15 minutes sets off
// fireworks. The orcs are scene-orcs.js (sc.orcs) and their fights scene-duel.js, the dark tower and its Eye of a red
// main scene-tower.js, who just called the owner (a pool of light, rings of sound, a messenger or a Great Eagle) scene-call.js, the backdrop
// and particles scenery.js, the names and realm notes scene-tags.js. Clicking a figure or its name opens the worker's
// session panel. It animates at about 10 frames a second only while this view is open and the tab visible; with reduced
// motion it draws one still frame per snapshot. Uses page.html's snap, view, standing, mergedTickets, esc and $, and
// session.js's openPanel. Alert sounds are the herald's (herald.mjs), on the Mac itself; this view plays none.
const scRealm = (host) => { const r = realmsFor(drawSnap()?.config, drawSnap()?.machines)[host]; return r ? [r[1], r[0], r[2]] : null; }; // [folk, realm name, key]; a machine with no realm is Men with no key (page.html's realmsFor)
const SC_COL = 30;
// The rows of stations, far enough apart that a front-row worker's bubble and name clear the back row's figures.
const SC_ROWS = [126, 160];
const SC_GLYPH = { blocked: 'ask', failing: 'alarm', stalled: 'sleep', checking: 'wait', waiting: 'wait', green: 'done', gone: 'gone' };
const SC_SEV = { ok: 'var(--ok)', run: 'var(--run)', warn: 'var(--warn)', bad: 'var(--bad)' };
const scReduced = matchMedia('(prefers-reduced-motion: reduce)');
const sc = { W: 320, H: SCENE_H, dy: 0, realms: [], stations: [], sky: skyAt(), actors: new Map(), seats: new Map(), tags: new Map(), tick: 0, running: false, last: 0, scale: 2 };
// Passes later files add to every frame, each called with (g, sc, tick): sky over the backdrop's sky, ground over its
// ground, air over the figures and props (before the night shade, so it darkens with them), light after the night
// shade, and above over the sky the view adds on top (g there is not shifted down by sc.dy). items(list) may push
// depth-sorted items, as sc.work's do.
sc.layers = { sky: [], ground: [], items: [], air: [], light: [], above: [] };
const scLayer = (name, g) => { for (const f of sc.layers[name]) f(g, sc, sc.tick); };

const SC_LEGEND = [['?', 'waiting on you'], ['!', 'CI failing, fighting an orc'], ['⌛', 'CI running'], ['z', 'idle, asleep'], ['Z', 'stalled', 'var(--bad)'],
  ['✓', 'green'], ['faded', 'ended'], ['orcs', 'main is red'], ['light', 'just called you', '#c99a00']];
$('scene').innerHTML = `<div class="sc-bar"><span class="sc-legend">${SC_LEGEND
  .map(([k, v, c]) => `<span><b${c ? ` style="color:${c}"` : ''}>${k}</b> ${v}</span>`).join('')}</span></div>
  <div class="sc-wrap"><div class="sc-stage"><canvas></canvas><div class="sc-tags"></div></div></div>`;
const scStage = $('scene').querySelector('.sc-stage');
const scCanvas = scStage.querySelector('canvas');
const scTags = scStage.querySelector('.sc-tags');
// The offscreen canvas holds SC_RES detail pixels per scene unit: 4, the 32-bit look (2026-11-07). Every
// position, size and hit box is in scene units, and scFrame scales the drawing by SC_RES with smoothing off, so art
// drawn in whole or half units looks as it did, while art drawn in quarter units (qdMap, sprites-hd.js) gets the finer
// pixels.
const SC_RES = 4;
const scOff = document.createElement('canvas');
const scG = scOff.getContext('2d');

// An engine worker at its plan's limit sleeps under the red bubble, like a stalled one. CI failing beats a merge
// already asked for, so an orc fights whenever CI fails; a running review is waited on like CI (2026-11-09).
function scMood(t) {
  const { workerState: st, pr } = t;
  const busy = st === 'busy' || st === 'working';
  if (st === 'limit') return 'stalled';
  if (['failed', 'stopped', 'gone'].includes(st) || (!t.adhoc && st === 'done')) return 'gone';
  if (t.blockedSince || t.waiting) return 'blocked';
  if (t.stalledSince) return 'stalled';
  if (pr?.mergeQueue) return 'green';
  if (pr?.ci.fail.length) return 'failing';
  if (t.status === 'merge-asked' || (t.note || '').startsWith('green')) return 'green';
  if (pr?.ci.running.length || pr?.review === 'running') return busy ? 'checking' : 'waiting';
  return busy ? 'work' : 'idle';
}
const scStage4 = (t, mood) => (mood === 'green' ? 4 : t.pr?.ci.fail.length ? 3 : t.pr ? 2 : 1);

// Realms left to right in the snapshot's machine order, each wide enough for its stations in two staggered rows. Then the
// world grows to fill the view (scFit): every realm widens by the same share, its stations centred in the new room and
// its Sentry posts kept on the road at its right edge, each with a clear stretch beside it for its Ranger at home.
function scLayout() {
  const plans = drawSnap().machines.map((m) => {
    const [kind, title] = scRealm(m.host) ?? ['man', 'Rohan'];
    const live = drawSnap().tickets.filter((t) => t.live && !t.adhoc && t.host === m.host);
    const n = Math.max(m.maxWorkers || 0, live.filter((t) => !t.sentry).length);
    const k = Math.max(m.sentryWorkers || 0, live.filter((t) => t.sentry).length);
    const cols = Math.max(1, Math.ceil(n / 2));
    const pad = { elf: 24, dwarf: 28, man: 34 }[kind] ?? 12;
    // One post for all its Sentry riders: a second (one parked on a person's review) waits beside it, not widening the realm.
    return { m, kind, title, n, k, cols, pad, w: Math.max(92, pad + cols * SC_COL + 10 + (k ? 30 : 0)) };
  });
  const natural = plans.reduce((sum, p) => sum + p.w, 0);
  scFit(Math.max(natural, 240));
  const extra = Math.max(0, sc.W - natural);
  sc.realms = [];
  sc.stations = [];
  let x0 = 0;
  plans.forEach((p, i) => {
    const add = Math.floor(extra / plans.length) + (i === plans.length - 1 ? extra % plans.length : 0);
    const w = p.w + add;
    const left = x0 + Math.floor(add / 2) + p.pad + SC_COL / 2;
    const r = { kind: p.kind, title: p.title, m: p.m, x0, w };
    sc.realms.push(r);
    for (let j = 0; j < p.n; j += 1) {
      const row = j < p.cols ? 0 : 1;
      sc.stations.push({ id: `${p.m.host}:r${j}`, host: p.m.host, kind: p.kind, sentry: false, realm: r, y: SC_ROWS[row],
        x: left + (row ? j - p.cols : j) * SC_COL + (row ? SC_COL / 2 : 0) });
    }
    for (let j = 0; j < p.k; j += 1) sc.stations.push({ id: `${p.m.host}:s${j}`, host: p.m.host, kind: 'ranger', sentry: true, shared: j > 0, realm: r, x: x0 + w - 8 - j * 22, y: ROAD_Y + 2 });
    x0 += w;
  });
}

// The largest whole-number scale (at least 2) at which the realms fit across the view, then a world that fills the view at that
// scale: wider than the realms need, and taller by sc.dy rows of sky above the SCENE_H-row scene, so the ground stays at the bottom.
// Pixels stay square, so up to one scaled pixel is left over at the edges. A phone pans the map in its frame (README "On a phone").
const scTop = () => scStage.getBoundingClientRect().top + $('main').scrollTop + window.scrollY;
function scFit(natural) {
  const availW = scStage.parentElement.clientWidth;
  sc.scale = Math.max(2, Math.floor(availW / natural) || 2);
  sc.W = Math.max(natural, Math.floor(availW / sc.scale));
  sc.fitTop = scTop();
  const inset = getComputedStyle($('main')).overflowY === 'visible' ? 0 : 11; // the main panel's bottom margin and frame
  const room = typeof phoneMapRoom === 'function' ? phoneMapRoom(scStage.parentElement) : null; // a phone's frame height (mobile.js)
  sc.H = Math.max(SCENE_H, Math.floor((room ?? window.innerHeight - sc.fitTop - inset) / sc.scale));
  sc.dy = sc.H - SCENE_H;
}

// Matches live workers to actors, keeping each worker's station and position between snapshots.
function sceneSync() {
  if (!snap || !sc.running) return;
  scLayout();
  const live = drawSnap().tickets.filter((t) => t.live).sort((a, b) => (a.dispatchedAt || '').localeCompare(b.dispatchedAt || ''));
  const keep = new Set();
  const taken = new Set();
  for (const t of live) {
    const key = `${t.host}/${t.id}`;
    keep.add(key);
    let st = null;
    if (!t.adhoc) {
      const mine = sc.stations.filter((s) => s.host === t.host && s.sentry === Boolean(t.sentry) && !taken.has(s.id));
      st = mine.find((s) => s.id === sc.seats.get(key)) ?? mine[0] ?? null;
      if (st) { taken.add(st.id); sc.seats.set(key, st.id); }
    }
    const realm = st?.realm ?? sc.realms.find((r) => r.m.host === t.host);
    const home = st?.sentry ? { x: st.x - 12, y: ROAD_Y + 8 } : st ? { x: st.x, y: st.y - 3 } : { x: 10 + Math.random() * (sc.W - 20), y: roadRow() };
    const a = sc.actors.get(key) ?? { key, x: home.x, y: home.y, pause: 0, target: null, frame: -1, seed: pxHash(key) % 18 };
    const mood = scMood(t);
    Object.assign(a, { t, mood, station: st, realm, road: !st, mounted: Boolean(st?.sentry), homeX: home.x, homeY: home.y, stage: scStage4(t, mood),
      kind: t.adhoc ? wandererKind(t.nickname) : st?.sentry ? captainKind(t.nickname) : realm ? realm.kind : 'man', name: t.nickname || t.label || t.id });
    if (st) st.actor = a;
    sc.actors.set(key, a);
  }
  for (const k of [...sc.actors.keys()]) if (!keep.has(k)) sc.actors.delete(k);
  sc.orcs?.sync();
  sc.recent = mergedTickets(drawSnap()).filter((t) => Date.now() - Date.parse(t.mergedAt) < 15 * 60000);
  scSize();
  scTagsBuild();
  if (scReduced.matches && sc.running) scFrame();
}

// Sizes the canvases and the stage to scFit's world.
function scSize() {
  const dpr = window.devicePixelRatio || 1;
  scOff.width = sc.W * SC_RES;
  scOff.height = sc.H * SC_RES;
  scStage.style.width = `${sc.W * sc.scale}px`;
  scStage.style.height = `${sc.H * sc.scale}px`;
  scStage.style.setProperty('--sc-font', `${Math.max(9, Math.round(sc.scale * 3.3))}px`);
  scCanvas.width = sc.W * sc.scale * dpr;
  scCanvas.height = sc.H * sc.scale * dpr;
}

// The names, realm notes and clicks over the canvas are scene-tags.js.
scBindClicks();

// Moves a figure toward p at speed v, facing the way it goes, round whatever stands in the way (sc.path, scene-path.js).
// False once it is there.
function scMove(a, p, v = 0.7) {
  const q = sc.path?.via(a, p) ?? p;
  const [dx, dy] = [q.x - a.x, q.y - a.y];
  const d = Math.hypot(dx, dy);
  if (d < 0.6) { a.x = q.x; a.y = q.y; return q !== p; }
  Object.assign(a, { x: a.x + (dx / d) * Math.min(v, d), y: a.y + (dy / d) * Math.min(v, d) });
  if (Math.abs(dx) > 0.3) a.face = dx < 0 ? -1 : 1;
  return true;
}
// Workers at stations go on rounds or fight (scene-work.js, scene-duel.js), and stay home with reduced motion. A Ranger
// on horseback is scene-ride.js's. A walker outside the queue walks the road while busy and stops where it is otherwise.
function scStep(a) {
  if (a.mounted) return sc.ride.step(a);
  if (scReduced.matches) { a.moving = false; if (!a.road) Object.assign(a, { x: a.homeX, y: a.homeY, face: 1, lift: 0, job: null, act: null, carry: null }); return; }
  if (!a.road) { if (!sc.work?.step(a)) a.moving = scMove(a, { x: a.homeX, y: a.homeY }); return; }
  if (a.mood !== 'work' && a.mood !== 'checking') { a.target = null; a.moving = false; return; }
  if (a.pause > 0) { a.pause -= 1; a.moving = false; return; }
  a.target ??= { x: 8 + Math.random() * (sc.W - 16), y: roadRow() };
  // A slow people (the Ent: PEOPLE.ent.pace 2) takes unhurried strides at a fraction of the speed.
  a.moving = scMove(a, a.target, 0.7 / (PEOPLE[a.kind]?.pace ?? 1));
  if (!a.moving) { a.target = null; a.pause = 15 + Math.floor(Math.random() * 45); }
}
// a.foe (its fight, with its pose) and a.cheerUntil come from scene-orcs.js, a.act and a.carry (its round) from
// scene-work.js. Idle, waiting on CI and stalled workers sleep; their bubbles tell them apart. Returns [pose, frame, tool].
function scPose(a) {
  const t = sc.tick;
  if (a.foe?.wp && a.mood !== 'gone') return a.foe.wp;
  // A four-step walk and a swing with an in-between (sprites-hd.js), each worker at its own point in them; reduced motion's
  // still frame shows the swing raised or striking.
  if (a.moving) return [a.carry ? 'carry' : 'walk', hdWalkFrame(t + a.seed, 2 * (PEOPLE[a.kind]?.pace ?? 1)), a.carry];
  if (a.cheerUntil > performance.now()) return [t % 6 < 3 ? 'cheer' : 'stand', 0];
  const swing = (k) => (scReduced.matches ? Math.floor(t / k) % 2 : hdSwingFrame(t + a.seed, k));
  if (a.mood === 'work' || a.mood === 'checking') return a.act ?? ['work', swing(3)];
  if (a.mood === 'failing') return a.t.workerState === 'busy' || a.t.workerState === 'working' ? ['work', swing(2)] : ['sleep', 0];
  if (a.mood === 'blocked') return ['ask', Math.floor(t / 4) % 2];
  if (a.mood === 'green') return [t % 20 < 10 ? 'cheer' : 'stand', 0];
  if (a.mood === 'gone') return ['stand', 0];
  return ['sleep', 0];
}
// How far above its feet a figure's head ends, a Ranger on its horse included, for bubbles, names, snores and clicks.
// A people that sleeps in another shape (Beorn as a bear: PEOPLE.beorn.sleepTop) is that tall while it sleeps.
const scHead = (a) => (a.mounted ? riderTop(a.kind) : a.pose === 'sleep' && PEOPLE[a.kind]?.sleepTop ? PEOPLE[a.kind].sleepTop : figureTop(a.kind));
// A figure facing left is mirrored about its own column, so its pixels stay whole; a.lift raises one hopping in a fight.
function scDrawActor(a) {
  const [pose, frame, tool] = a.mounted ? sc.ride.pose(a) : scPose(a);
  a.pose = pose;
  const x = Math.round(a.x);
  if (a.mood === 'gone') scG.globalAlpha = 0.4;
  scG.save();
  if (a.face < 0) { scG.translate(2 * x + 1, 0); scG.scale(-1, 1); }
  const hand = a.mounted ? sc.ride.draw(a, x, pose, frame, tool) : drawFigure(scG, a.kind, a.name, x, Math.round(a.y) - (a.lift || 0), pose, frame, tool);
  scG.restore();
  scG.globalAlpha = 1;
  if (!scReduced.matches && !a.mounted) sc.work?.fx(a, pose, frame, a.face < 0 ? { ...hand, x: 2 * x - hand.x } : hand);
  if (pose === 'sleep' && a.mood === 'idle' && !scReduced.matches && (sc.tick + a.seed) % 18 === 0) {
    snore(x + 1, Math.round(a.y) - scHead(a) - 3, sc.sky.night ? '#d6e0ff' : '#3d55b0');
  }
}
function scFrame() {
  sc.tick += 1;
  if (sc.tick % 10 === 0 && Math.abs(scTop() - sc.fitTop) > 1) sceneSync();
  if (sc.tick % 300 === 0) sc.sky = skyAt();
  const g = scG;
  const reduced = scReduced.matches;
  g.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
  g.imageSmoothingEnabled = false;
  g.save();
  g.translate(0, sc.dy);
  drawBackdrop(g, sc, sc.tick);
  scLayer('sky', g);
  scLayer('ground', g);
  const items = sc.stations.filter((s) => !s.shared).map((s) => ({ z: s.y, draw: () => drawStation(g, s.kind, s.x, s.y, s.actor && sc.actors.get(s.actor.key) === s.actor ? s.actor.stage : 0, sc.tick) }));
  // Behind its desk at home, a Ranger by its place on the road; read at sorting, since a fight moves its worker later.
  for (const a of sc.actors.values()) {
    scStep(a);
    const atHome = a.station && Math.abs(a.x - a.homeX) < 1 && Math.abs(a.y - a.homeY) < 1;
    a.z = a.mounted ? sc.ride.z(a) : atHome ? a.station.y - 0.5 : a.y;
    items.push({ get z() { return a.z; }, draw: () => scDrawActor(a) });
  }
  sc.orcs?.items(items);
  sc.work?.items(items);
  sc.call?.items(items);
  for (const f of sc.layers.items) f(items);
  items.sort((p, q) => p.z - q.z).forEach((i) => i.draw());
  for (const r of sc.realms) if (!r.m.ok || r.m.paused) drawMist(g, r, sc.tick);
  scLayer('air', g);
  if (sc.sky.night) { g.globalAlpha = 0.38; pxBox(g, 0, GROUND_Y - 62, sc.W, SCENE_H, '#0a0d24'); g.globalAlpha = 1; }
  drawLights(g, sc, sc.tick);
  sc.work?.lights?.(g);
  scLayer('light', g);
  if (sc.war) drawEye(g, sc, sc.tick);
  sc.call?.light(g);
  for (const a of sc.actors.values()) {
    const glyph = SC_GLYPH[a.mood];
    if (glyph && !(a.mood === 'checking' && a.moving)) drawBubble(g, Math.round(a.x), Math.round(a.y) - scHead(a) - 1, glyph, a.mood === 'stalled' ? PX.red : undefined);
  }
  if (!reduced && sc.tick % 12 === 0) {
    for (const t of sc.recent || []) {
      const r = sc.realms.find((x) => x.m.host === t.host);
      if (r) burst(r.x0 + 10 + Math.random() * (r.w - 20), 22 + Math.random() * 40);
    }
  }
  stepParticles(g, reduced);
  g.restore();
  drawSkyAbove(g, sc, sc.tick);
  scLayer('above', g);
  // Where the screen has fewer pixels than the canvas (a phone, or a plain screen at a small scale), it is shrunk with
  // smoothing, so no row of detail is dropped; otherwise every pixel stays square.
  const v = scCanvas.getContext('2d');
  v.imageSmoothingEnabled = scCanvas.width < scOff.width;
  v.imageSmoothingQuality = 'high';
  v.drawImage(scOff, 0, 0, scOff.width, scOff.height, 0, 0, scCanvas.width, scCanvas.height);
  scPlaceTags();
}

function scLoop(now) {
  if (!sc.running) return;
  requestAnimationFrame(scLoop);
  if (now - sc.last < 100) return;
  sc.last = now;
  scFrame();
}
// page.html's applyView calls this with whether Middle-earth is open. It starts only once every script has run (the
// first snapshot can call it before the rounds, orcs, Ranger, tower and calls have loaded; the DOMContentLoaded start
// below covers it), and asks for the frame loop before the first sync, so a sync that throws can't leave it stopped.
function sceneShow(on) {
  if (on && !sc.running && document.readyState !== 'loading') {
    sc.running = true;
    if (!scReduced.matches) requestAnimationFrame(scLoop);
    sceneSync();
    if (scReduced.matches) scFrame();
  } else if (!on) sc.running = false;
  sc.call?.stream(on);
}
// The world's size depends on the view's, so a resize lays it out again; scFrame also re-fits when anything above the
// map moves its top edge (fonts loading, the stats or the phone's tab strip wrapping).
window.addEventListener('resize', () => { if (sc.running) { sceneSync(); scFrame(); } });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => sceneShow(view === 'scene'), { once: true });
else sceneShow(view === 'scene');
