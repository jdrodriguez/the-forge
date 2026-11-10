// scene-wild.js: Rivendell's wildlife and weather in the Middle-earth view (scene.js). Two deer, a doe and a stag,
// graze at the valley's far edge behind the back row: they walk a few steps, put their heads down to graze and look up
// now and then. While main is red (sc.war) they bolt off the nearer edge of the world and come back once it clears.
// Three small birds perch on the tree tops, swaying with them in the wind, hop, flit from tree to tree and sometimes
// fly off and come back a while later; at night they settle on their perches and stay. The season (scenery-elves.js's
// seasonNow) sends leaves drifting down in autumn, petals in spring and snow in winter. With reduced motion the deer
// and birds stand still and nothing falls; the deer stay away while main is red. Each animal's choices come from its
// own seeded generator. The art is scenery-elves.js's. Loaded after scene-elves.js.
const wild = new Map();

// The tree tops of realm r, where birds perch: the top row of each canopy, as drawElfTree draws it, with the tree's seed
// and size. topNow is where a top is this frame, moved as far as the wind bends that tree's crown (scenery-land.js asks
// sc.wind.tree for the same sway, and drawElfTree bends the crown by elfTopShift).
function treeTops(r) {
  const t = elfTrees(r);
  return [...t.small.map(([x, h, seed]) => ({ x: x + 1, y: GROUND_Y + 6 - h - 5, seed, size: 0.6 })), ...t.tall.map(([x, h]) => ({ x: x + 1, y: GROUND_Y + 6 - h - 8, seed: x, size: 1 }))];
}
const topNow = (t, season) => ({ x: t.x + elfTopShift(t.size, season, sc.wind ? sc.wind.tree(t.x, t.seed, sc.tick) : 0), y: t.y });
// The deer's pasture: a strip along the back of the valley at its far edge, clear of the back row of stations and above
// their desks. Its x is where a deer's middle stands.
function pasture(r) {
  const back = sc.stations.filter((s) => s.realm?.m.host === r.m.host && !s.sentry && s.y < PROP_MID).map((s) => s.x);
  const x1 = r.x0 + r.w - 9;
  return { x0: Math.min(x1, Math.max(r.x0 + r.w - 26, Math.max(0, ...back) + 13)), x1, y0: GROUND_Y + 3, y1: GROUND_Y + 7 };
}

function wildState(r) {
  let w = wild.get(r.m.host);
  if (!w) {
    const p = pasture(r);
    w = {
      deer: [0, 1].map((i) => ({ i, stag: i === 1, x: p.x0 + i * 9, y: p.y0 + i * 4, face: i ? -1 : 1, mode: 'graze', n: 30 + i * 20, rng: workRng(7100 + i) })),
      birds: [0, 1, 2].map((i) => ({ i, perch: i * 3, x: 0, y: 0, mode: 'perch', n: 20 + i * 30, rng: workRng(8100 + i), color: ['#4a3b30', '#3a4a6b', '#6b4a3a'][i] })),
    };
    wild.set(r.m.host, w);
  }
  return w;
}

// Moves p toward (tx, ty) at speed v; true once it is there.
function wildMove(p, tx, ty, v) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= v) { p.x = tx; p.y = ty; return true; }
  p.x += (dx / d) * v;
  p.y += (dy / d) * v;
  if (Math.abs(dx) > 0.2) p.face = dx < 0 ? -1 : 1;
  return false;
}

// One frame of a deer: bolting and staying away while main is red, walking back once it clears, else grazing,
// looking up and taking a few steps about the pasture.
function deerStep(d, r) {
  const p = pasture(r);
  if (sc.war > 0.3 && d.mode !== 'gone') {
    const edge = r.x0 + r.w / 2 < sc.W / 2 ? -16 : sc.W + 16;
    if (wildMove(d, edge, d.y, 2.2)) d.mode = 'gone';
    else d.mode = 'bolt';
    return;
  }
  if (d.mode === 'gone' || d.mode === 'bolt') {
    if (sc.war > 0.3) return;
    d.mode = 'back';
  }
  if (d.mode === 'back' || d.mode === 'walk') {
    if (d.mode === 'back') { d.tx ??= p.x0 + d.i * 9; d.ty ??= p.y0 + d.i * 4; }
    if (wildMove(d, d.tx, d.ty, d.mode === 'back' ? 0.7 : 0.25)) Object.assign(d, { mode: 'look', n: span(d.rng, 8, 20), tx: null, ty: null });
    return;
  }
  d.n -= 1;
  if (d.n > 0) return;
  const roll = d.rng();
  if (roll < 0.3) Object.assign(d, { mode: 'walk', tx: span(d.rng, p.x0, p.x1), ty: span(d.rng, p.y0, p.y1) });
  else if (roll < 0.75) Object.assign(d, { mode: 'graze', n: span(d.rng, 30, 90) });
  else Object.assign(d, { mode: 'look', n: span(d.rng, 10, 30) });
}
const deerPose = (d, still) => (still ? 'stand' : d.mode === 'bolt' ? 'run' : d.mode === 'walk' || d.mode === 'back' ? (Math.floor(sc.tick / 2) % 2 ? 'walk' : 'stand') : d.mode === 'graze' ? 'graze' : 'stand');

// One frame of a bird: on its perch it hops now and then; when its time there is up it flits to another tree top or
// flies off out of sight and comes back later. At night it stays on its perch.
function birdStep(b, tops, season) {
  const home = topNow(tops[b.perch % tops.length], season);
  if (b.mode === 'perch') {
    Object.assign(b, { x: home.x, y: home.y });
    b.n -= 1;
    if (b.n > 0 || sc.sky.night) return;
    if (b.rng() < 0.75) Object.assign(b, { mode: 'fly', perch: span(b.rng, 0, tops.length - 1) });
    else Object.assign(b, { mode: 'away', tx: b.rng() < 0.5 ? -10 : sc.W + 10, ty: 4, n: span(b.rng, 120, 400) });
    return;
  }
  if (b.mode === 'away') {
    if (wildMove(b, b.tx, b.ty, 1.4)) { b.n -= 1; if (b.n <= 0) b.mode = 'fly'; }
    return;
  }
  if (wildMove(b, home.x, home.y, 1.2)) Object.assign(b, { mode: 'perch', n: span(b.rng, 40, 160) });
}

// Leaves, petals or snow, a few a frame, over the trees or the whole valley.
function seasonFall(r, tops) {
  const season = seasonNow();
  if (season === 'winter' && sc.tick % 2 === 0) {
    particles.push({ x: r.x0 + Math.random() * r.w, y: Math.random() * (ROAD_Y - 20), vx: 0.05, vy: 0.22, life: 30 + Math.random() * 30, color: '#ffffff', fall: 0, sway: 0.3 });
  }
  const rate = season === 'autumn' ? 5 : season === 'spring' ? 11 : 0;
  if (!rate || sc.tick % rate) return;
  const t = tops[Math.floor(Math.random() * tops.length)];
  const colors = season === 'autumn' ? ['#e0a83a', '#d0702c', '#a5502e', '#f2d27a'] : ['#fbe3ef', '#f4a6c8', '#ffffff'];
  particles.push({ x: t.x - 4 + Math.random() * 9, y: t.y + 3 + Math.random() * 10, vx: 0.06, vy: 0.16, life: 36 + Math.random() * 20, color: colors[Math.floor(Math.random() * colors.length)], fall: 0, sway: 0.35 });
}

// Each frame: steps and draws Rivendell's animals as depth-sorted items and lets the season fall.
JOB_HOOKS.items.push((items) => {
  const still = scReduced.matches;
  for (const r of sc.realms) {
    if (r.kind !== 'elf') continue;
    const w = wildState(r);
    const tops = treeTops(r);
    const season = seasonNow();
    if (!still) seasonFall(r, tops);
    for (const d of w.deer) {
      if (!still) deerStep(d, r);
      if (d.mode === 'gone' || (still && sc.war)) continue;
      const [x, y, pose] = [Math.round(d.x), Math.round(d.y), deerPose(d, still)];
      items.push({ z: y, draw: () => drawDeer(scG, x - 5, y, d.face, pose, d.stag) });
    }
    for (const b of w.birds) {
      if (!tops.length) break;
      if (!still) birdStep(b, tops, season);
      else Object.assign(b, topNow(tops[b.perch % tops.length], season));
      const flying = b.mode !== 'perch';
      const frame = flying ? Math.floor(sc.tick / 2) % 2 : !still && (sc.tick + b.i * 7) % 23 < 2 ? 1 : 0;
      items.push({ z: GROUND_Y + 7, draw: () => drawBird(scG, Math.round(b.x * 4) / 4 - 1, Math.round(b.y), flying, frame, b.color) });
    }
  }
});
