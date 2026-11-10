// scene2-life-beasts.js: the small beasts round the wanderers of the map from above (scene2.js). Radagast's birds (a
// sparrow, a robin and a blue tit) hop and peck on the ground about his feet, flit to another place round him with a
// beat of their wings, and fly after him when he walks on; a rabbit and a hedgehog potter about Rhosgobel and come in
// close while he scatters seed. Beorn's bees buzz in loops round his hives, and a few follow him while he tends them.
// By night the birds sit still and the bees are in the hive. While main is red (m2.war) they all flee as v1's deer do
// (scene-wild.js; 2026-11-09: parity with the side view): the rabbit bolts and the hedgehog trundles off into
// Mirkwood's eaves east of the hut, fading among the trees, the birds fly up and away over the forest, and the bees
// stay in the hive; once it clears they come back out to Rhosgobel. Art in quarter units, lit from the upper left,
// outlined in each animal's own dark; drawn once per frame and facing into small canvases. With reduced motion nothing
// moves, and in the war nothing shows.

const M2M_BEAST_PAL = {
  k: '#2a1c16', b: '#7a5232', B: '#a8784a', r: '#e0703a', R: '#f2a060', y: '#f2c040', e: '#0c0a10', w: '#5a3c26', W: '#c8b08a',
  t: '#3a68b0', T: '#6aa0e0', c: '#f0e070', g: '#8a7c6c', G: '#b8a890', s: '#5a4430', S: '#8a6c48', p: '#e89aa0', f: '#c8a07a', n: '#f4f0e8',
};
// A bird facing right: sat (0), hopped up (1), pecking (2), and flying with its wings up (3) and down (4). Its body
// letters b, B and r are swapped for each bird's own colours.
const M2M_BIRD = [
  ['...kkk...', '..kBBBk..', '.kbBBeBy.', 'kwbbrrrk.', '.kwwrrk..', '..k..k...'],
  ['...kkk...', '..kBBBk..', '.kbBBeBy.', 'kwbbrrrk.', '.kwwrrk..', '.........'],
  ['.........', '..kkk....', '.kbBBkk..', 'kwbbBBeBy', '.kwwrrrk.', '..k..k...'],
  ['k.......k', 'Wk.kkk.kW', '.WkbBBkW.', '..kbrBy..', '...kkk...', '.........'],
  ['.........', '...kkk...', '.kkbBBkk.', 'kWWbrBWWk', 'k..kkk..k', '.........'],
];
const M2M_BIRDS = [{ b: '#7a5232', B: '#a8784a', r: '#c8a07a' }, { b: '#6a4a30', B: '#8a6844', r: '#e0703a' }, { b: '#3a68b0', B: '#6aa0e0', r: '#f0e070' }];
// A rabbit facing right, sat up (0) and mid-hop (1).
const M2M_RABBIT = [
  ['.......kk....', '......kgGk...', '......kgGk...', '..kkkkkggkk..', '.kgggGGGgGek.', 'knggggGGGggpk', 'kngggggggkkk.', '.kkgggggggk..', '...kk...kkk..'],
  ['.......kk....', '......kgGk...', '..kkkkkgGkk..', '.kgggGGGggek.', 'knggggGGGGgpk', 'knnggggggkkk.', '.kkkgggggk...', '..k......kk..', '.............'],
];
// A hedgehog facing right, snuffling along (0, 1).
const M2M_HOG = [
  ['..k.k.k.k...', '.kSkSkSkSk..', 'kSsSsSsSsSk.', 'ksSsSsSsSffk.', 'ksssssssffefk', '.kkssssskffpk', '..k..k..kkk..'],
  ['...k.k.k.k..', '.kkSkSkSkSk.', 'kSsSsSsSsSk.', 'ksSsSsSsSffk.', 'ksssssssffefk', '.kksssssskfpk', '...k..k.kkk..'],
];
const m2mBeastArt = new Map();
// One beast's frame (rows) in palette pal, mirrored to face left, drawn once into a canvas.
function m2mBeast(key, rows, pal, left) {
  const k = `${key}|${left ? 1 : 0}`;
  if (m2mBeastArt.has(k)) return m2mBeastArt.get(k);
  const w = Math.max(...rows.map((r) => r.length));
  const { c, g } = m2Canvas(w / 4, rows.length / 4);
  m2Raster(g, 0, 0, w, rows.length, (px, py) => pal[(rows[py][left ? w - 1 - px : px] ?? '.')] ?? null);
  const out = { c, w: w / 4, h: rows.length / 4 };
  m2mBeastArt.set(k, out);
  return out;
}
const m2mStamp = (g, art, x, y) => g.drawImage(art.c, Math.round((x - art.w / 2) * 4) / 4, Math.round((y - art.h) * 4) / 4, art.w, art.h);

const m2mWild = { birds: null, ground: null, bees: null, key: '' };
const m2mFind = (name) => [...m2.actors.values()].find((a) => m2Plain(a.name).includes(name));
const m2mNight = () => Boolean(m2.sky?.night);

// Each bird keeps its own place round its centre (Radagast's feet, or Rhosgobel's), hopping a little way now and then,
// pecking, or flying to a new place on an arc, its shadow on the ground under it.
function m2mBirdStep(b, cx, cy, busy) {
  const d = Math.hypot(b.x - cx - b.ox, b.y - cy - b.oy);
  if (b.fly) {
    b.fly.t += 1;
    const k = Math.min(1, b.fly.t / b.fly.n);
    b.x = b.fly.x0 + (cx + b.ox - b.fly.x0) * k;
    b.y = b.fly.y0 + (cy + b.oy - b.fly.y0) * k;
    b.h = Math.sin(k * Math.PI) * b.fly.top;
    b.face = cx + b.ox < b.fly.x0 ? -1 : 1;
    if (k >= 1) b.fly = null;
    return;
  }
  b.h = 0;
  if (d > 6 || Math.random() < (busy ? 0.006 : 0.012)) {
    const a = Math.random() * Math.PI * 2;
    const r = busy ? 4 + Math.random() * 5 : 6 + Math.random() * 8;
    Object.assign(b, { ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.6 + 1 });
    b.fly = { t: 0, n: Math.max(8, Math.round(d * 1.2)), x0: b.x, y0: b.y, top: 3 + Math.min(8, d * 0.4) };
    return;
  }
  b.n -= 1;
  if (b.n > 0) return;
  b.n = 6 + Math.floor(Math.random() * 18);
  const r = Math.random();
  if (r < 0.35) { b.x += (Math.random() - 0.5) * 2.5; b.y += (Math.random() - 0.5) * 1.2; b.hopT = 3; b.face = Math.random() < 0.5 ? -1 : 1; }
  else b.peck = r < (busy ? 0.9 : 0.7) ? 6 : 0;
}
function m2mBirdFrame(b, tick) {
  if (b.fly) return tick % 4 < 2 ? 3 : 4;
  if (b.hopT > 0) { b.hopT -= 1; return 1; }
  if (b.peck > 0) { b.peck -= 1; return b.peck % 3 ? 2 : 0; }
  return 0;
}

// The rabbit and the hedgehog potter about the centre, a short hop or a snuffle at a time, and come in close while
// seed is down.
function m2mGroundStep(m, cx, cy, feeding) {
  const [tx, ty] = feeding ? [cx + m.fx, cy + 2] : [m.tx, m.ty];
  const d = Math.hypot(tx - m.x, ty - m.y);
  m.moving = false;
  if (d > 1 && (m.kind === 'hog' || m.t % 12 < 5)) {
    const v = m.kind === 'hog' ? 0.12 : 0.45;
    m.x += ((tx - m.x) / d) * Math.min(v, d);
    m.y += ((ty - m.y) / d) * Math.min(v, d);
    m.face = tx < m.x ? -1 : 1;
    m.moving = true;
  } else if (!feeding && Math.random() < 0.01) {
    m.tx = m.hx + (Math.random() - 0.5) * 22;
    m.ty = m.hy + (Math.random() - 0.5) * 10;
  }
  m.t += 1;
}

// Beorn's bees: each loops round its hive on a figure of its own, a few drawn off toward Beorn while he tends them.
function m2mBees(g, hive, beorn, tick) {
  for (let i = 0; i < 7; i += 1) {
    const s = tick * (0.09 + i * 0.013) + i * 2.1;
    const near = beorn && i < 3 && Math.hypot(beorn.x - hive.x, beorn.y - hive.y) < 14;
    const [cx, cy] = near ? [beorn.x, beorn.y - m2BodyOf(beorn.kind).head * 0.6] : [hive.x, hive.y - 5];
    const x = cx + Math.sin(s) * (3 + (i % 3) * 2) + Math.sin(s * 2.3) * 1.2;
    const y = cy + Math.cos(s * 1.3) * (2 + (i % 2)) - (i % 4);
    const [px, py] = [Math.round(x * 4) / 4, Math.round(y * 4) / 4];
    g.fillStyle = '#1a1408';
    g.fillRect(px, py, 0.75, 0.5);
    g.fillStyle = '#f2c030';
    g.fillRect(px + 0.25, py, 0.25, 0.5);
    g.fillStyle = tick % 2 ? '#f4f8ff' : '#b8c8d8';
    g.fillRect(px + 0.25, py - 0.25, 0.25 + (tick % 2) * 0.25, 0.25);
  }
}

// In the war a beast m runs for its hiding place (hx, hy) at speed v and fades among the trees over its last 8 units,
// then stays hidden; when it clears it comes back out from there, fading in, and its own step takes it home. Gives its
// alpha, and whether it is fleeing or hidden (so its own step is skipped).
function m2mFlee(m, war, hx, hy, v) {
  if (war) {
    const d = Math.hypot(hx - m.x, hy - m.y);
    if (d > v) Object.assign(m, { x: m.x + ((hx - m.x) / d) * v, y: m.y + ((hy - m.y) / d) * v, face: hx < m.x ? -1 : 1, moving: true, t: (m.t ?? 0) + 1 });
    else Object.assign(m, { x: hx, y: hy, moving: false });
    m.hid = true;
    return { alpha: Math.min(1, Math.max(0, d - v) / 8), away: true };
  }
  if (m.hid) Object.assign(m, { hid: false, back: 0 });
  m.back = Math.min(1, (m.back ?? 1) + 0.08);
  return { alpha: m.back, away: false };
}

m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  const plan = m2.plan;
  if (!plan?.places?.rhosgobel) return;
  if (m2mWild.key !== m2.key) {
    const c = plan.places.rhosgobel;
    m2mWild.key = m2.key;
    m2mWild.birds = M2M_BIRDS.map((pal, i) => ({ i, pal: { ...M2M_BEAST_PAL, ...pal }, x: c.x + i * 4 - 4, y: c.y + 6 + i, ox: i * 4 - 4, oy: 3, h: 0, n: i * 5, face: i % 2 ? -1 : 1, fly: null }));
    m2mWild.ground = [['rabbit', -12, 8], ['hog', 10, 9]].map(([kind, dx, dy], i) => ({ kind, x: c.x + dx, y: c.y + dy, hx: c.x + dx, hy: c.y + dy, tx: c.x + dx, ty: c.y + dy, fx: i ? 5 : -6, face: 1, t: i * 7 }));
  }
  const rad = m2mFind('radagast');
  const cx = rad ? rad.x : plan.places.rhosgobel.x;
  const cy = rad ? rad.y : plan.places.rhosgobel.y + 8;
  const feeding = Boolean(rad?.posed?.pose === 'work' && rad.tool === 'seed');
  const still = reduced || m2mNight();
  const war = m2.war > 0.3;
  const R = plan.places.rhosgobel;
  for (const b of m2mWild.birds) {
    // In the war a bird climbs away over the forest, wings beating, its shadow left behind on the ground.
    const run = reduced ? { alpha: war ? 0 : 1, away: war } : m2mFlee(b, war, R.x + 34 + b.i * 8, R.y - 30 - b.i * 4, 0.9);
    if (run.away) { b.fly = null; b.h = Math.min(14, (b.h ?? 0) + 0.4); } else if (!still) m2mBirdStep(b, cx, cy, feeding);
    if (run.alpha <= 0) continue;
    const f = run.away ? (tick % 4 < 2 ? 3 : 4) : still ? 0 : m2mBirdFrame(b, tick + b.i);
    const art = m2mBeast(`bird${b.i}.${f}`, M2M_BIRD[f], b.pal, b.face < 0);
    add(b.y, (g = m2G) => {
      g.globalAlpha = run.alpha;
      if (b.h > 0.5) { g.globalAlpha = 0.25 * run.alpha; g.fillStyle = '#0c1018'; g.fillRect(Math.round(b.x * 4) / 4 - 0.75, b.y - 0.25, 1.5, 0.5); g.globalAlpha = run.alpha; }
      m2mStamp(g, art, b.x, b.y - b.h);
      g.globalAlpha = 1;
    });
  }
  for (const m of m2mWild.ground) {
    // The rabbit bolts, the hedgehog trundles, each to its own cover in the trees east of the hut.
    const run = reduced ? { alpha: war ? 0 : 1, away: war } : m2mFlee(m, war, R.x + (m.kind === 'hog' ? 26 : 32), R.y + (m.kind === 'hog' ? 14 : 4), m.kind === 'hog' ? 0.3 : 1.1);
    if (!run.away && !still) m2mGroundStep(m, cx, cy, feeding);
    if (run.alpha <= 0) continue;
    const f = m.moving && !reduced ? Math.floor(m.t / 3) % 2 : 0;
    const art = m2mBeast(`${m.kind}${f}`, (m.kind === 'hog' ? M2M_HOG : M2M_RABBIT)[f], M2M_BEAST_PAL, m.face < 0);
    add(m.y, (g = m2G) => { g.globalAlpha = run.alpha; m2mStamp(g, art, m.x, m.y + 0.5); g.globalAlpha = 1; });
  }
  // Beorn's bees, by day and in peace.
  const hive = plan.roam?.beorn?.find((s) => s.job === 'hives');
  if (hive && !m2mNight() && !war) {
    const beorn = m2mFind('beorn');
    add(hive.y + 30, (g = m2G) => m2mBees(g, hive, beorn, reduced ? 0 : tick));
  }
}, 'beasts'));
