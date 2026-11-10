// scene2-life-deer.js: the deer of the map from above (scene2.js), v1's doe and stag (scene-wild.js, art from
// scenery-elves.js's deerArt) brought to the map (2026-11-09: parity with the side view). v1 grazes them at
// Rivendell's far edge; on the map Rivendell is all desks and paths, so they keep to the wild as the books have it: a
// glade on the eaves of Mirkwood near Radagast's Rhosgobel, the nearest stretch of open grass 28 to 70 units from his
// hut, clear of the roads, the stations, the riders' lands, the wanderers' spots and every named place (Dale, Beorn's
// hall). They walk a few steps, put their heads down to graze and look up now and then. While main is red (m2.war)
// they bolt into the forest toward Mirkwood's heart, fading among the trees, and stay away; once it clears they come
// back out and walk home to the glade. With reduced motion they stand still, and stay away while main is red. v1's art
// is stamped at the map's M2V_K, as the riders and orcs are; each deer's choices come from its own seeded generator.

const m2wDeer = { key: '', herd: [], glade: null };

// The glade for this layout: the open grass nearest Rhosgobel (28 to 70 units off) with room for two deer to wander
// (a box 24 by 8 of open ground off every standing thing), away from everything that moves there.
function m2wGlade() {
  const P = m2.paths?.cells?.();
  const R = m2.plan?.places?.rhosgobel;
  if (!P || !R) return null;
  const ok = (x, y) => { const c = m2mCellOf(P, x, y); return P.open[c] && P.wide[c]; };
  const seg = (x, y, [ax, ay], [bx, by]) => {
    const l = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  const far = (x, y) => m2.plan.roads.every((r) => r.pts.slice(1).every((p, i) => seg(x, y, r.pts[i], p) >= 9))
    && m2.stations.every((s) => Math.hypot(s.hx - x, s.hy - y) >= 26)
    && Object.values(m2.plan.patrols ?? {}).flat().every((p) => Math.hypot(p.x - x, p.y - y) >= 30)
    && Object.values(m2.plan.roam ?? {}).flat().every((p) => Math.hypot(p.x - x, p.y - y) >= 18)
    && !m2.realms.some((r) => x > r.x - 8 && x < r.x + r.w + 8 && y > r.y - 8 && y < r.y + r.h + 8)
    && Object.values(m2.plan.zones ?? {}).every((z) => x < z.x0 - 10 || x > z.x1 + 10 || y < z.y0 - 10 || y > z.y1 + 10);
  let best = null;
  for (let y = 24; y < m2.H - 8; y += 3) {
    for (let x = 16; x < m2.W - 16; x += 3) {
      const d = Math.hypot(x - R.x, y - R.y);
      if (d < 28 || d > 70 || (best && d >= best.d) || !far(x, y)) continue;
      let room = true;
      for (let dy = -6; dy <= 2 && room; dy += 2) for (let dx = -12; dx <= 12 && room; dx += 2) room = ok(x + dx, y + dy);
      if (room) best = { x, y, d };
    }
  }
  return best && { x0: best.x - 10, x1: best.x + 10, y0: best.y - 3, y1: best.y + 1 };
}

// The herd for this layout: a doe and a stag in the glade, each with its own generator.
function m2wHerd() {
  if (m2wDeer.key === m2.key) return m2wDeer.herd;
  m2wDeer.key = m2.key;
  const g = (m2wDeer.glade = m2wGlade());
  m2wDeer.herd = g ? [0, 1].map((i) => ({ i, stag: i === 1, x: g.x0 + 4 + i * 11, y: g.y0 + 1 + i * 3, face: i ? -1 : 1, mode: 'graze', n: 30 + i * 20, rs: 7100 + i, alpha: 1 })) : [];
  return m2wDeer.herd;
}
// Deer d's next number in [0, 1), and one between lo and hi.
function m2wRand(d) {
  d.rs = (Math.imul(d.rs, 1103515245) + 12345) >>> 0;
  return ((d.rs >>> 8) % 100000) / 100000;
}
const m2wSpan = (d, lo, hi) => lo + m2wRand(d) * (hi - lo);
// Moves deer d toward (tx, ty) at speed v; true once it is there.
function m2wMove(d, tx, ty, v) {
  const [dx, dy] = [tx - d.x, ty - d.y];
  const n = Math.hypot(dx, dy);
  if (n <= v) { Object.assign(d, { x: tx, y: ty }); return true; }
  d.x += (dx / n) * v;
  d.y += (dy / n) * v;
  if (Math.abs(dx) > 0.2) d.face = dx < 0 ? -1 : 1;
  return false;
}

// One frame of a deer, as v1's deerStep: bolting into the forest and staying away while main is red, coming back out
// once it clears, else grazing, looking up and taking a few steps about the glade. Where it vanished is where it comes
// back from, fading in over its first strides.
function m2wDeerStep(d, g) {
  const heart = m2.plan.places.mirkwood ?? { x: g.x0 + 10, y: g.y0 - 80 };
  if (m2.war > 0.3 && d.mode !== 'gone') {
    d.from ??= { x: d.x, y: d.y };
    const run = Math.hypot(d.x - d.from.x, d.y - d.from.y);
    d.alpha = Math.max(0, 1 - Math.max(0, run - 12) / 24);
    d.mode = d.alpha <= 0 || m2wMove(d, heart.x, heart.y, 2.2) ? 'gone' : 'bolt';
    return;
  }
  if (d.mode === 'gone' || d.mode === 'bolt') {
    if (m2.war > 0.3) return;
    Object.assign(d, { mode: 'back', tx: g.x0 + 4 + d.i * 11, ty: g.y0 + 1 + d.i * 3, out: { x: d.x, y: d.y }, from: null });
  }
  if (d.mode === 'back' || d.mode === 'walk') {
    if (d.out) d.alpha = Math.min(1, Math.hypot(d.x - d.out.x, d.y - d.out.y) / 12);
    if (m2wMove(d, d.tx, d.ty, d.mode === 'back' ? 0.7 : 0.25)) Object.assign(d, { mode: 'look', n: m2wSpan(d, 8, 20), tx: null, ty: null, out: null, alpha: 1 });
    return;
  }
  d.n -= 1;
  if (d.n > 0) return;
  const roll = m2wRand(d);
  if (roll < 0.3) Object.assign(d, { mode: 'walk', tx: m2wSpan(d, g.x0, g.x1), ty: m2wSpan(d, g.y0, g.y1) });
  else if (roll < 0.75) Object.assign(d, { mode: 'graze', n: m2wSpan(d, 30, 90) });
  else Object.assign(d, { mode: 'look', n: m2wSpan(d, 10, 30) });
}
const m2wDeerPose = (d, still) => (still ? 'stand' : d.mode === 'bolt' ? 'run'
  : d.mode === 'walk' || d.mode === 'back' ? (Math.floor(m2.tick / 2) % 2 ? 'walk' : 'stand') : d.mode === 'graze' ? 'graze' : 'stand');

// A deer with its feet at (x, y): v1's art stamped at the map's size on its shadow, facing its way.
function m2wDeerDraw(g, d, pose) {
  const K = typeof M2V_K === 'number' ? M2V_K : 1.3;
  const art = deerArt(pose, d.stag, d.face < 0);
  const [x, y] = [Math.round(d.x * 4) / 4, Math.round(d.y * 4) / 4];
  g.globalAlpha = d.alpha * 0.28;
  g.drawImage(m2Foot(), x - 6, y - 0.5, 12, 2);
  g.globalAlpha = d.alpha;
  g.imageSmoothingEnabled = false;
  g.drawImage(art.cv, Math.round((x - 5.5 * K) * 4) / 4, Math.round((y - 9.5 * K) * 4) / 4, art.w * K, art.h * K);
  g.globalAlpha = 1;
}

m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  if (typeof deerArt !== 'function' || !m2.plan?.places) return;
  const herd = m2wHerd();
  const g = m2wDeer.glade;
  for (const d of herd) {
    if (!reduced) m2wDeerStep(d, g);
    if (d.mode === 'gone' || (reduced && m2.war > 0.3) || d.alpha <= 0) continue;
    const pose = m2wDeerPose(d, reduced);
    add(d.y, (gx = m2G) => m2wDeerDraw(gx, d, pose), [d.x - 8, d.y - 14, d.x + 8, d.y + 1]);
  }
}, 'deer'));
