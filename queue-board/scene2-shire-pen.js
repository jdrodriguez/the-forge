// scene2-shire-pen.js: the Shire's big pen on the map from above (v1's pig pen, grown into a farmyard): a yard of
// trodden mud and straw with a wallow of brown water, a fence of split rails on stout posts all round, a little
// thatched sty straddling the back fence with its doorway open into the yard, and a trough along the front where the
// hobbits tip in feed over the rail. In it live two pigs, a goat and two geese, each of its own size and shape, lit
// from the upper left: they amble about, stop to root or graze (a pig's snout down, the goat's head in the straw), and
// while a hobbit feeds them they crowd to the trough. The sheep graze loose on a pasture outside it (m2ShireFlock,
// placed by scene2-shire-fill.js; 2026-11-08: pigs in the pen, sheep free outside it). Their frames are painted once (two steps of a walk
// and a head-down graze, each way they face) and the pen's whole round costs a few drawImage calls a frame.

const M2_SHIRE_BEAST = new Map();
// Each beast: its size in units, its colours (deep to light), how fast it walks.
const M2_SHIRE_BEASTS = {
  pig: { w: 9, h: 6, P: ['#5a2e30', '#a85a5a', '#d8848a', '#f0a8ae', '#ffd0d4'], v: 0.05 },
  sheep: { w: 9, h: 7, P: ['#5e584a', '#a8a090', '#d8d2c0', '#f2eee2', '#ffffff'], v: 0.04 },
  goat: { w: 8, h: 7.5, P: ['#3a2a1e', '#6e4a2e', '#a8784a', '#d8b48a', '#f2e2c4'], v: 0.06 },
  goose: { w: 4.5, h: 5, P: ['#7a7468', '#c8c2b4', '#e8e4da', '#f8f6f0', '#ffffff'], v: 0.035 },
};

// A beast's frame facing right: pose 0 or 1 a step of its walk, 2 its head down to graze. Mirrored for the left.
function m2ShireBeastArt(kind, pose, left) {
  const key = `${kind}${pose}${left}`;
  if (M2_SHIRE_BEAST.has(key)) return M2_SHIRE_BEAST.get(key);
  const B = M2_SHIRE_BEASTS[kind];
  const { c, g } = m2Canvas(B.w, B.h);
  if (left) { g.translate(B.w, 0); g.scale(-1, 1); }
  const P = B.P;
  const ell = (cx, cy, rx, ry, cols, bumpy = 0) => m2Raster(g, cx - rx - 0.5, cy - ry - 0.5, (rx + 0.5) * 8, (ry + 0.5) * 8, (px, py) => {
    const [nx, ny] = [(px / 4 - rx - 0.5 + 0.125) / rx, (py / 4 - ry - 0.5 + 0.125) / ry];
    const d = nx * nx + ny * ny - (bumpy ? (m2Hash(px >> 2, py >> 2, 9) - 0.5) * bumpy : 0);
    if (d > 1) return null;
    if (d > 0.82) return cols[0];
    const l = -nx * 0.5 - ny * 0.8;
    return cols[l > 0.45 ? 4 : l > 0.05 ? 3 : l > -0.45 ? 2 : 1];
  });
  const leg = (x, y, h, col) => { pxBox(g, x, y, 0.75, h, col); pxBox(g, x, y + h - 0.25, 0.75, 0.25, P[0]); };
  const step = pose === 1 ? 0.5 : 0;
  const down = pose === 2;
  if (kind === 'goose') {
    leg(1.75 + step / 2, 3.75, 1, '#e8902c');
    leg(2.5 - step / 2, 3.75, 1, '#d87a1c');
    ell(2.1, 2.9, 1.8, 1.1, P);
    pxBox(g, 0, 2.4, 0.75, 0.5, P[1]);
    if (down) { pxBox(g, 3.4, 3, 0.75, 1, P[3]); pxBox(g, 3.6, 3.9, 0.75, 0.5, P[4]); pxBox(g, 4.1, 4.1, 0.5, 0.4, '#e8902c'); }
    else { pxBox(g, 3.2, 0.9, 0.75, 2.2, P[3]); pxBox(g, 3.2, 0.9, 0.25, 2.2, P[4]); pxBox(g, 3.2, 0.5, 1, 0.75, P[4]); pxBox(g, 4.1, 0.75, 0.5, 0.4, '#e8902c'); pxBox(g, 3.6, 0.6, 0.25, 0.25, '#1a1820'); }
  } else if (kind === 'pig') {
    for (const [lx, d] of [[1.6, step], [2.6, -step], [5.2, -step], [6.1, step]]) leg(lx + d, 4.6, 1.2, P[1]);
    ell(3.9, 3.3, 3.5, 2.05, P);
    pxBox(g, 0.1, 2.4, 0.5, 0.5, P[2]); pxBox(g, 0, 2.0, 0.25, 0.5, P[2]);
    const hy = down ? 4.1 : 3.0;
    ell(7.1, hy, 1.45, 1.35, P);
    pxBox(g, 8.1, hy - 0.2, 0.75, 0.9, P[3]); pxBox(g, 8.35, hy, 0.25, 0.25, P[0]); pxBox(g, 8.35, hy + 0.4, 0.25, 0.25, P[0]);
    pxBox(g, 6.6, hy - 1.6, 0.75, 0.75, P[2]); pxBox(g, 6.6, hy - 1.6, 0.25, 0.25, P[4]);
    pxBox(g, 7.5, hy - 0.4, 0.25, 0.25, '#1a1018');
  } else if (kind === 'sheep') {
    for (const [lx, d] of [[2, step], [3, -step], [5.4, -step], [6.3, step]]) leg(lx + d, 4.8, 1.8, '#2a2420');
    ell(4.1, 3.4, 3.7, 2.4, P, 0.35);
    const hy = down ? 4.6 : 2.6;
    pxBox(g, 7.2, hy - 0.9, 1.5, 1.9, '#2a2420'); pxBox(g, 7.4, hy - 0.7, 0.75, 0.75, '#4a4440');
    pxBox(g, 6.8, hy - 1, 0.75, 0.5, '#2a2420'); pxBox(g, 8.3, hy - 0.4, 0.25, 0.25, '#e8e0cc');
    ell(6.9, hy - 1.2, 0.8, 0.6, P);
  } else {
    for (const [lx, d] of [[1.6, step], [2.5, -step], [5, -step], [5.8, step]]) leg(lx + d, 4.8, 2.2, P[1]);
    ell(3.6, 3.7, 3.1, 1.8, P);
    pxBox(g, 2.4, 2.4, 2, 1.2, P[4]);
    pxBox(g, 0.2, 2.6, 0.5, 0.75, P[2]);
    const hy = down ? 5 : 2.4;
    ell(6.6, hy, 1.1, 1.2, P);
    pxBox(g, 7.3, hy, 0.75, 0.75, P[3]); pxBox(g, 6.9, hy + 1, 0.5, 0.9, P[1]);
    pxBox(g, 5.8, hy - 1.9, 0.5, 0.75, '#d8d0b8'); pxBox(g, 5.5, hy - 2.2, 0.5, 0.5, '#d8d0b8'); pxBox(g, 6.4, hy - 1.6, 0.5, 0.5, '#a89878');
    pxBox(g, 6.8, hy - 0.4, 0.25, 0.25, '#1a1018');
  }
  M2_SHIRE_BEAST.set(key, c);
  return c;
}

// A split-rail fence len units long along row y from x, its posts every step units, as pixels into g.
function m2ShireRails(g, x, y, len, step = 4) {
  const W = M2_PAL.wood;
  for (const ry of [4.25, 2]) { pxBox(g, x, y - ry, len, 0.75, W[3]); pxBox(g, x, y - ry, len, 0.25, W[5]); pxBox(g, x, y - ry + 0.75, len, 0.25, W[0]); }
  for (let i = 0; i <= len + 0.01; i += step) {
    const px = Math.min(x + i, x + len - 1);
    pxBox(g, px, y - 5.5, 1, 5.5, W[2]); pxBox(g, px, y - 5.5, 0.25, 5.5, W[4]); pxBox(g, px + 0.75, y - 5.5, 0.25, 5.5, W[0]); pxBox(g, px, y - 5.75, 1, 0.25, W[5]);
  }
}

// The pen w by h units with its top-left at (x, y). Returns the spot where a hobbit feeds the beasts.
function m2ShirePen(L, add, x, y, w, h, season, host) {
  m2Rect(L, x + 0.5, y + 0.5, w - 1, h - 1, M2_MAT.path, 120);
  const wal = [x + w * 0.62, y + h * 0.45, w * 0.13, h * 0.17];
  // The wallow, a puddle of brown water with a lit rim, and straw strewn over the trodden earth.
  L.decals.push((g) => {
    m2Raster(g, wal[0] - wal[2], wal[1] - wal[3], wal[2] * 8, wal[3] * 8, (px, py) => {
      const e = ((px + 0.5) / (wal[2] * 4) - 1) ** 2 + ((py + 0.5) / (wal[3] * 4) - 1) ** 2 + (m2Hash(px >> 2, py >> 2, 6) - 0.5) * 0.25;
      if (e > 1) return null;
      return e > 0.8 ? '#4a3420' : py < wal[3] * 2.5 && e > 0.5 ? '#8a6a44' : e < 0.25 && px < wal[2] * 4 ? '#7a5a3a' : '#5e4228';
    });
    for (let i = 0; i < w * h * 0.12; i += 1) {
      const [sx, sy] = [x + 1 + m2Hash(i, 1, 66) * (w - 2), y + 1 + m2Hash(i, 2, 66) * (h - 2)];
      if (Math.hypot((sx - wal[0]) / (wal[2] + 1), (sy - wal[1]) / (wal[3] + 1)) < 1) continue;
      pxBox(g, Math.round(sx * 4) / 4, Math.round(sy * 4) / 4, 0.75, 0.25, i % 3 ? '#d8b860' : '#b8943c');
    }
  });
  // The back and side fences, and the sty straddling the back fence at its west end.
  const sty = Math.min(14, w * 0.3);
  const back = m2Thing(add, x - 0.5, y - 12, w + 1, 12.5, y + 0.25, (g) => {
    m2ShireRails(g, 0.5, 12, w);
    const eave = m2Roof(g, 0.5, 0, sty + 2, 1.5, 4.5, M2_PAL.thatch, 1.25);
    m2Wall(g, 1.5, eave, sty, 12 - eave, M2_PAL.wood, 'timber');
    pxBox(g, 1.5 + sty / 2 - 2, 8, 4, 4, '#1a1410');
    pxBox(g, 1.5 + sty / 2 - 2, 11.5, 4, 0.5, '#d8b860');
  });
  back.foot = [x, y - 2, x + w, y + h];
  // The side fences, a post at a time so each stands at its own depth, with the rails running back to the last post.
  for (const sx of [x, x + w - 1]) {
    for (let k = 4; k <= h; k += 4) {
      m2Thing(add, sx, y + k - 9.5, 1, 9.75, y + k, (g) => {
        for (const ry of [4.25, 2]) { pxBox(g, 0.25, 4 - ry, 0.5, 4, M2_PAL.wood[3]); pxBox(g, 0.25, 4 - ry, 0.25, 4, M2_PAL.wood[5]); }
        pxBox(g, 0, 4, 1, 5.5, M2_PAL.wood[2]); pxBox(g, 0, 4, 0.25, 5.5, M2_PAL.wood[4]); pxBox(g, 0.75, 4, 0.25, 5.5, M2_PAL.wood[0]);
      });
    }
  }
  // The front fence and trough, drawn each frame over the beasts behind them.
  const tx = x + w * 0.3;
  const { c: fc, g: fg } = m2Canvas(w + 1, 7);
  // The trough's inside is dark wood; the feed or water the hobbits bring is drawn in it (scene2-stock-art.js).
  m2Raster(fg, w * 0.3 - 4, 3.5, 40, 10, (px, py) => (py === 0 || px === 0 || px === 39 ? M2_PAL.wood[0] : py < 3 ? (px > 2 && px < 37 && py > 0 ? '#3a2414' : M2_PAL.wood[4]) : M2_PAL.wood[py < 6 ? 3 : 1]));
  m2ShireRails(fg, 0.5, 6.75, w);
  add.obj({ z: y + h, draw: (g) => g.drawImage(fc, x - 0.5, y + h - 6.75, w + 1, 7) });
  // The trough's box and the strip of its top, for what is in it (scene2-stock.js).
  const [t0, ty0] = [x - 0.5 + w * 0.3 - 4, y + h - 6.75 + 3.5];
  const pen = { x0: t0, y0: ty0, x1: t0 + 10, y1: ty0 + 2.5, z: y + h, sx0: t0 + 0.75, sx1: t0 + 9.25, sy: ty0 + 0.25 };
  const spot = { x: Math.round(tx), y: y + h + 3.5, face: 'up', job: 'feed', mid: t0 + 5, pen };
  // The beasts: where each is, where it is going, and what it is doing.
  const herd = ['pig', 'pig', 'goat', 'goose', 'goose'].slice(0, w > 40 ? 5 : 3).map((kind, i) => ({
    kind, x: x + 4 + m2Hash(i, 3, 67) * (w - 10), y: y + 4 + m2Hash(i, 4, 67) * (h - 6), tx: 0, ty: 0, t: i * 13, mode: 'graze', left: i % 2 === 0, seed: i }));
  const box = [x + 5, y + 4, x + w - 5, y + h - 1.5];
  // Feeding time while a hobbit stands at the trough or there is feed or water in it; each beast eating at the trough
  // takes a bite a tick, until it is empty (2026-11-09, as the side view's pigs eat the trough down).
  const f = (g, tick, reduced) => {
    const trough = typeof m2sTroughFor === 'function' ? m2sTroughFor(host) : null;
    const full = Boolean(trough && (trough.food > 0 || trough.water > 0));
    if (tick % 8 === 0) f.busy = !reduced && m2ShireBusy(spot);
    const busy = !reduced && (full || f.busy);
    for (const b of herd) {
      if (!reduced) m2ShireBeastStep(b, box, busy, tx, tick);
      else m2ShireScared(b, box, true);
      m2ShireBeastPose(b, tick, reduced);
      if (!reduced && b.mode === 'eat') m2sEat(trough, 1);
    }
    herd.sort((p, q) => p.y - q.y);
    for (const b of herd) m2ShireBeastPaint(g, b);
  };
  f.item = true;
  f.z = y + 0.5;
  add.anim(f);
  return spot;
}
// While main is red (scene2-war.js's m2.war; the coordinator, 2026-11-09, as the side view's deer bolt), every beast
// runs to the corner of its pen or pasture farthest from the road (its south-west) and huddles there, the herd packed
// close, each at its own place in the huddle by its seed, until the war clears and it goes back to its grazing. True
// while it is scared, the beast moved. With reduced motion (still true) it is put straight in its huddle.
const m2ShireWar = () => (m2.war ?? 0) > 0.3;
function m2ShireHuddle(b, box) {
  const k = b.seed % 5;
  return { x: Math.min(box[2], box[0] + 1 + (k % 3) * 2.6), y: Math.max(box[1], box[3] - 0.5 - Math.floor(k / 3) * 2.2) };
}
function m2ShireScared(b, box, still = false) {
  if (!m2ShireWar()) {
    if (b.mode === 'huddle' || b.scared) Object.assign(b, { mode: 'graze', t: 20 + b.seed * 9, eat: false, scared: false });
    return false;
  }
  const h = m2ShireHuddle(b, box);
  b.scared = true;
  if (still) { Object.assign(b, { x: h.x, y: h.y, mode: 'huddle', left: true }); return true; }
  const [dx, dy] = [h.x - b.x, h.y - b.y];
  const d = Math.hypot(dx, dy);
  const v = M2_SHIRE_BEASTS[b.kind].v * 3;
  if (d <= v) { Object.assign(b, { x: h.x, y: h.y, mode: 'huddle' }); return true; }
  Object.assign(b, { x: b.x + (dx / d) * v, y: b.y + (dy / d) * v, mode: 'walk', left: dx < 0 });
  return true;
}
// A beast's frame this tick (a step of its walk, or its head down while it grazes or eats) and where it is drawn.
function m2ShireBeastPose(b, tick, reduced) {
  const B = M2_SHIRE_BEASTS[b.kind];
  const pose = b.mode === 'walk' ? ((tick + b.seed * 3) >> 3) % 2 : (b.mode === 'eat' || b.mode === 'graze') && (b.mode === 'eat' || (tick + b.seed * 17) % 90 < 60) ? 2 : 0;
  b.art = m2ShireBeastArt(b.kind, reduced ? 0 : pose, b.left);
  b.dx = Math.round((b.x - B.w / 2) * 4) / 4;
  b.dy = Math.round((b.y - B.h) * 4) / 4;
}
// A beast on its shadow.
function m2ShireBeastPaint(g, b) {
  const B = M2_SHIRE_BEASTS[b.kind];
  g.globalAlpha = 0.25;
  pxBox(g, b.dx + B.w * 0.15, b.dy + B.h - 0.75, B.w * 0.7, 0.75, '#1a1410');
  g.globalAlpha = 1;
  g.drawImage(b.art, b.dx, b.dy, B.w, B.h);
}
// The sheep, n of them loose on their pasture P (a box of open grass clear of everything placed, x0, y0, x1, y1): each
// walks to a spot, grazes a while and picks another, sorted at its own feet among the hobbits and the trees.
function m2ShireFlock(add, P, n) {
  const B = M2_SHIRE_BEASTS.sheep;
  const box = [P.x0 + B.w / 2 + 1, P.y0 + B.h + 1, P.x1 - B.w / 2 - 1, P.y1 - 1];
  for (let i = 0; i < n; i += 1) {
    const b = { kind: 'sheep', x: box[0] + m2Hash(i, 5, 67) * (box[2] - box[0]), y: box[1] + m2Hash(i, 6, 67) * (box[3] - box[1]),
      tx: 0, ty: 0, t: i * 29, mode: 'graze', left: i % 2 === 1, seed: i + 7 };
    const f = (g, tick, reduced) => {
      if (!reduced) m2ShireBeastStep(b, box, false, 0, tick);
      else m2ShireScared(b, box, true);
      m2ShireBeastPose(b, tick, reduced);
      m2ShireBeastPaint(g, b);
      f.z = b.y;
    };
    f.item = true;
    f.z = b.y;
    add.anim(f);
  }
}
// One tick of a beast's round: walk to its target, then graze or rest a while, then pick another; at feeding time,
// go to the trough and eat there.
function m2ShireBeastStep(b, box, busy, tx, tick) {
  if (m2ShireScared(b, box)) return;
  if (busy && b.mode !== 'eat' && b.mode !== 'walk') { b.mode = 'walk'; b.tx = tx + (b.seed - 3) * 2.2; b.ty = box[3] - 0.5 - (b.seed % 2) * 2; b.eat = true; }
  if (!busy && b.eat) { b.eat = false; b.t = 0; b.mode = 'graze'; }
  if (b.mode === 'walk') {
    const [dx, dy] = [b.tx - b.x, b.ty - b.y];
    const d = Math.hypot(dx, dy);
    const v = M2_SHIRE_BEASTS[b.kind].v * (b.eat ? 1.8 : 1);
    if (Math.abs(dx) > 0.2) b.left = dx < 0;
    if (d < v) { b.mode = b.eat ? 'eat' : 'graze'; b.t = 60 + Math.floor(m2Hash(b.seed, tick, 68) * 140); return; }
    b.x += (dx / d) * v;
    b.y += (dy / d) * v;
    return;
  }
  if (b.mode === 'eat') { b.mode = busy ? 'eat' : 'graze'; return; }
  if ((b.t -= 1) > 0) return;
  b.mode = 'walk';
  b.tx = box[0] + m2Hash(b.seed, tick, 69) * (box[2] - box[0]);
  b.ty = box[1] + m2Hash(b.seed, tick + 1, 69) * (box[3] - box[1]);
}
