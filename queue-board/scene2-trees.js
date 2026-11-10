// scene2-trees.js: what grows on the map from above (scene2.js), seen from overhead at 32-bit: trees as round crowns of
// leaf clumps, each clump lit on its upper left with dark gaps between them and an outline in the leaves' own darkest
// hue, a short trunk showing under the crown and a soft shadow cast to the lower right; pines in tiers; hedges as rows
// of clumps; boulders; and flowers, stones and fallen leaves strewn as decals. The leaves follow the real season
// through scenery-elves.js's canopies (blossom in spring, green in summer, gold and russet in autumn, evergreen and
// snow in winter). Each kind of tree is painted once into a canvas and shared.

const m2TreeArt = new Map();
// Canopies that keep their own colours whatever the season: Mirkwood's black-green, and Lothlorien's mallorn gold.
const M2_CANOPY = { dark: [['#1d3a2a', '#2b5038', '#12261b'], ['#24442f']], gold: [['#c9a23a', '#ecd06a', '#93741c'], ['#fff3b0', '#e6eef0']] };
// A crown of radius r: a main mass and clumps round its rim, by seed. Returns [inside(px, py), the clump centres].
function m2Crown(r, seed) {
  const R = r * 4;
  const clumps = [[R, R * 1.02, R * 0.72]];
  const n = 5 + Math.floor(m2Hash(seed, 1, 30) * 3);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + m2Hash(seed, i, 31);
    const d = R * (0.5 + m2Hash(seed, i, 32) * 0.12);
    clumps.push([R + Math.cos(a) * d, R * 1.02 + Math.sin(a) * d * 0.86, R * (0.42 + m2Hash(seed, i, 33) * 0.12)]);
  }
  const near = (px, py) => {
    let best = null;
    let bd = 9;
    for (const c of clumps) {
      const d = Math.hypot(px + 0.5 - c[0], py + 0.5 - c[1]) / c[2];
      if (d < bd) { bd = d; best = c; }
    }
    return bd <= 1 ? [best, bd] : null;
  };
  return near;
}
// A tree's canvas: its crown of radius r (units) over a trunk tall units of bare trunk, coloured by the season's
// canopy (canopyOf) for its seed; kind 'apple' hangs red fruit in summer and autumn.
function m2TreeCanvas(kind, r, tall, season, seed) {
  const key = `${kind}${r},${tall},${season},${seed}`;
  if (m2TreeArt.has(key)) return m2TreeArt.get(key);
  const [mid0, dots] = M2_CANOPY[kind] ?? canopyOf(kind === 'ever' ? (season === 'winter' ? 'winter' : 'summer') : season, seed);
  const mid = kind === 'ever' ? mid0.map((c) => hdMix(c, '#1d3a34', 0.28)) : mid0;
  const [hi, lit, base, shade, deep, line] = treeRamp(mid);
  const w = r * 2 + 1;
  const h = r * 2 + tall + 1;
  const { c, g } = m2Canvas(w, h);
  const near = m2Crown(r, seed);
  const bark = ['#2a1a12', '#4a2f1e', '#6e4a2e', '#8f6640'];
  // The trunk, lit on its left, flaring at its roots.
  m2Raster(g, r - 1, r * 1.6, 12, (tall + r * 0.4) * 4, (px, py) => {
    const flare = py > (tall + r * 0.4) * 4 - 4 ? 1 : 0;
    if (px < 3 - flare || px > 8 + flare) return null;
    return bark[px <= 3 ? 3 : px <= 5 ? 2 : px <= 7 ? 1 : 0];
  });
  m2Raster(g, 0.5, 0, r * 8, r * 8, (px, py) => {
    const hit = near(px, py);
    if (!hit) return null;
    const [cl, d] = hit;
    const out = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !near(px + a, py + b));
    if (out) return line;
    const [nx, ny] = [(px + 0.5 - cl[0]) / cl[2], (py + 0.5 - cl[1]) / cl[2]];
    const light = -(nx * 0.62 + ny * 0.78) + (py / (r * 8)) * -0.5 + 0.25;
    if (d > 0.88 && ny > -0.2) return deep;
    let k = light > 0.75 ? 0 : light > 0.35 ? 1 : light > -0.15 ? 2 : light > -0.55 ? 3 : 4;
    const s = m2Hash(px, py, seed);
    if (s < 0.07) k = Math.max(0, k - 1); else if (s > 0.94) k = Math.min(4, k + 1);
    return [hi, lit, base, shade, deep][k];
  });
  // Blossom, fruit, other leaves or snow, on the crown's upper parts.
  const fruit = kind === 'apple' && (season === 'summer' || season === 'autumn');
  const nDots = Math.round(r * r * 0.45);
  for (let i = 0; i < nDots; i += 1) {
    const [px, py] = [Math.floor(m2Hash(seed, i, 34) * r * 8), Math.floor(m2Hash(seed, i, 35) * r * 8)];
    const hit = near(px, py);
    if ((kind === 'ever' && season !== 'winter') || kind === 'dark') continue;
    if (!hit || hit[1] > 0.8 || (season === 'winter' && m2Hash(px, py, 36) > 0.55 - (py / (r * 8)) * 0.5)) continue;
    const col = fruit ? (i % 3 ? '#c0302a' : '#e8544a') : dots[i % dots.length];
    pxBox(g, 0.5 + px / 4, py / 4, fruit ? 0.5 : 0.25 + (i % 2) * 0.25, 0.5, col);
    if (fruit) pxBox(g, 0.5 + px / 4, py / 4, 0.25, 0.25, '#ffb0a0');
  }
  const art = { c, w, h };
  m2TreeArt.set(key, art);
  return art;
}
// A pine in tiers, seen from overhead: dark spreading layers, each lit along its upper left, snow on them in winter.
function m2PineCanvas(r, season, seed) {
  const key = `pine${r},${season},${seed}`;
  if (m2TreeArt.has(key)) return m2TreeArt.get(key);
  const P = ['#0f2a22', '#173c30', '#215040', '#2d6650', '#4a8466', '#e8f1f5'];
  const h = r * 3;
  const { c, g } = m2Canvas(r * 2 + 1, h + 2);
  pxBox(g, r, h - 0.5, 1, 2, '#4a2f1e');
  pxBox(g, r, h - 0.5, 0.5, 2, '#6e4a2e');
  for (let t = 0; t < 4; t += 1) {
    const [y0, rw] = [t * h * 0.22, r * (0.45 + t * 0.19)];
    m2Raster(g, r + 0.5 - rw, y0, rw * 8, h * 0.36 * 4, (px, py) => {
      const dx = (px + 0.5 - rw * 4) / (rw * 4);
      const tt = py / (h * 0.36 * 4);
      const jag = (Math.floor(px / 2) % 2) * 0.06;
      if (Math.abs(dx) > tt + jag || tt > 1) return null;
      if (tt > 0.86 || Math.abs(dx) > tt - 0.08) return P[0];
      const snow = season === 'winter' && tt < 0.35 && m2Hash(px, py + t * 9, seed) < 0.6;
      return snow ? P[5] : P[dx < -0.3 ? 4 : dx < 0.15 ? 3 : dx < 0.55 ? 2 : 1];
    });
  }
  const art = { c, w: r * 2 + 1, h: h + 2 };
  m2TreeArt.set(key, art);
  return art;
}
// Plants a tree with its foot at (x, y): its shadow on the ground and the tree in the depth order.
function m2Tree(L, add, x, y, kind, r, season, seed) {
  const art = kind === 'pine' ? m2PineCanvas(r, season, seed % 5) : m2TreeCanvas(kind, r, kind === 'bush' ? 0 : Math.max(2, Math.round(r * 0.35)), season, seed % 7);
  const [sx, sy] = [x + r * 0.45, y - (kind === 'bush' ? 0.5 : 0.8)];
  m2Shadow(L, sx, sy, r * 1.0, r * 0.5, 0.75);
  if (season === 'autumn' && kind !== 'pine') {
    L.decals.push((g) => {
      for (let i = 0; i < r * 3; i += 1) {
        const [a, d] = [m2Hash(seed, i, 37) * 6.28, r * (0.4 + m2Hash(seed, i, 38) * 0.9)];
        pxBox(g, Math.round((x + Math.cos(a) * d) * 4) / 4, Math.round((y + Math.sin(a) * d * 0.5) * 4) / 4, 0.25, 0.25, canopyOf(season, seed)[0][i % 3]);
      }
    });
  }
  add.obj({ z: y, x: x - art.w / 2, y: y - art.h + 0.5, w: art.w, h: art.h, draw: (g) => g.drawImage(art.c, x - art.w / 2, y - art.h + 0.5, art.w, art.h) });
}
// A hedge len units long with its front edge on row y, seen from above: a lumpy leafy top lit from the upper left,
// clumps overhanging a darker front face that fades to deep shade at its foot, with glints and holes in the leaves.
function m2Hedge(L, add, x, y, len, season, seed) {
  const P = treeRamp([['#3d7a3a', '#5a9a48', '#2a5a2c'], ['#356e42', '#4f8a50', '#244c30']][seed % 2]);
  const tint = season === 'autumn' ? '#8a7a30' : season === 'winter' ? '#cfdde2' : null;
  const C = tint ? P.map((c, i) => (i < 5 ? hdMix(c, tint, 0.18) : c)) : P;
  m2Shadow(L, x + len / 2 + 1, y + 0.5, len / 2 + 1, 1.8, 0.65);
  const W = Math.round(len * 4);
  m2Thing(add, x, y - 7, len, 7.5, y, (g) => {
    m2Raster(g, 0, 0, W, 30, (px, py) => {
      const top = 3 - 2.2 * Math.abs(Math.sin((px + seed * 7) / 6.5)) + (m2Hash(px >> 2, 1, seed) < 0.25 ? -0.8 : 0);
      const lip = 13 + 1.6 * Math.sin((px + seed * 3) / 4.7) + (m2Hash(px >> 1, 2, seed) < 0.2 ? 1 : 0);
      const end = Math.min(px, W - 1 - px);
      if (py < top + Math.max(0, 3 - end) || py > 29 - (end < 2 ? 2 - end : 0)) return null;
      if (py < top + 1 + Math.max(0, 3 - end) || end === 0) return C[5];
      const n = m2Noise(px, py, 2.6, seed) + (m2Hash(px, py, seed + 1) - 0.5) * 0.25;
      if (py < lip) {
        const lit = n + (lip - py) / lip * 0.35 - (px / W) * 0.15;
        if (m2Hash(px, py, seed + 2) < 0.03) return C[0];
        return C[lit > 0.75 ? 0 : lit > 0.5 ? 1 : 2];
      }
      if (py < lip + 1) return C[4];
      const k = py > 27 ? 5 : py > 22 ? 4 : n > 0.6 ? 2 : 3;
      return m2Hash(px, py, seed + 3) < 0.04 ? C[5] : C[k];
    });
  });
}
// A boulder r units across with its foot on row y, lit on its upper left, with a crack.
function m2Rock(L, add, x, y, r, seed) {
  const P = M2_PAL.stone;
  m2Shadow(L, x + r * 0.3, y, r * 0.8, r * 0.35, 0.8);
  m2Thing(add, x - r / 2, y - r * 0.8, r, r * 0.85, y, (g) => {
    const [W, Hh] = [r * 4, r * 3.2];
    m2Raster(g, 0, 0, W, Hh + 1, (px, py) => {
      const [nx, ny] = [(px + 0.5 - W / 2) / (W / 2), (py + 0.5 - Hh * 0.62) / (Hh * 0.62)];
      const d = nx * nx + ny * ny * (ny > 0 ? 2.4 : 1);
      if (d > 1) return null;
      if (d > 0.8) return P[0];
      const k = nx + ny < -0.6 ? 5 : nx + ny < 0 ? 4 : nx + ny < 0.6 ? 3 : 2;
      return P[px === Math.round(W * (0.4 + m2Hash(seed, 1, 39) * 0.2)) && py > Hh * 0.3 && py < Hh * 0.7 ? 1 : k];
    });
  });
}
// Flowers strewn over grass in a box: count tufts of two or three blooms in the given colours, each with a lit petal
// and a gold eye, only where the ground is one of mats.
function m2Flowers(L, x, y, w, h, count, colours, mats, seed) {
  L.decals.push((g) => {
    for (let i = 0; i < count; i += 1) {
      const [fx, fy] = [x + m2Hash(seed, i, 40) * w, y + m2Hash(seed, i, 41) * h];
      if (!mats.includes(m2MatAt(L, fx, fy))) continue;
      const col = colours[i % colours.length];
      for (let j = 0; j < 2 + (i % 2); j += 1) {
        const [bx, by] = [Math.round((fx + (j - 1) * 0.75) * 4) / 4, Math.round((fy + (j % 2) * 0.5) * 4) / 4];
        pxBox(g, bx, by + 0.25, 0.5, 0.25, hdMix(col, '#000000', 0.25));
        pxBox(g, bx, by, 0.25, 0.25, hdMix(col, '#ffffff', 0.35));
        pxBox(g, bx + 0.25, by, 0.25, 0.25, col);
        pxBox(g, bx + 0.25, by + 0.25, 0.25, 0.25, '#f2c14e');
      }
    }
  });
}
// Plants up to n trees in a region's box (area), each of a kind [kind, smallest, largest radius] picked by turns, only
// on the given grounds, clear of the boxes to avoid (with room for its crown) and of each other. Returns the planted.
function m2Scatter(L, add, { area, n, kinds, avoid = [], mats, season, seed, gap = 0.9 }) {
  const trees = [];
  for (let i = 0; i < n * 8 && trees.length < n; i += 1) {
    const [kind, r0, r1] = kinds[i % kinds.length];
    const r = Math.round(r0 + m2Hash(seed, i, 42) * (r1 - r0));
    const x = area.x0 + r + m2Hash(seed, i, 43) * (area.x1 - area.x0 - 2 * r);
    const y = area.y0 + r * 2 + m2Hash(seed, i, 44) * (area.y1 - area.y0 - r * 2);
    if (avoid.some((b) => x + r > b.x0 && x - r < b.x1 && y + 2 > b.y0 && y - r * 2 < b.y1)) continue;
    if (![[0, 0], [-r, 0], [r, 0], [0, -r], [-r, -r], [r, -r], [0, -2 * r]].every(([dx, dy]) => mats.includes(m2MatAt(L, x + dx, y + dy)))) continue;
    if (trees.some((t) => Math.hypot(t.x - x, (t.y - y) * 1.4) < (t.r + r) * gap)) continue;
    trees.push({ x, y, r });
    m2Tree(L, add, x, y, kind, r, season, Math.floor(m2Hash(seed, i, 45) * 1000));
  }
  return trees;
}
