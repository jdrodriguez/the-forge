// scene2-shire-oak.js: the Shire's own oaks on the map from above, unlike Rivendell's slender trees: broad old oaks
// with a short thick trunk that leans a little and flares into roots, a knot in its bark, crooked limbs spreading out
// of it, and a wide round crown of big lumpy clumps, each lit on its upper left with a dark scallop where it laps the
// one behind, the limbs showing through a few gaps low down. The leaves follow the season: fresh yellow-green in
// spring, deep green in summer, a patchwork of russet, copper and gold in autumn, and in winter the bare crooked limbs
// down to their twigs with snow along their tops and a few dead leaves clinging. The Party Tree is the greatest of
// them, with a ring bench round its trunk and paper lanterns hung under its crown; an apple tree is a smaller one hung
// with red fruit (white blossom in spring). Each is painted once per size, season and seed (m2ShireOakArt, three seeds
// a size, so a relayout reuses them), and m2ShireOak plants one: its shadow on the ground and the tree in depth order.

const M2_SHIRE_OAKS = new Map();
const M2_SHIRE_BARK = ['#2e2620', '#52463a', '#76664e', '#9c8868', '#bba98a'];
// Each season's leaves as [mid, lit, shade]; autumn has three, one picked for each clump.
const M2_SHIRE_LEAF = {
  spring: [['#7cb044', '#a4cc5c', '#548a34']], summer: [['#437c30', '#67a042', '#2d5a28']],
  autumn: [['#a8481c', '#d8702c', '#6a2a12'], ['#c06a1e', '#ee9c3a', '#7a3a12'], ['#c09228', '#ecc248', '#7e5a16']],
  party: [['#c28a2a', '#e8b448', '#8a5e1c'], ['#b07a2c', '#daa44c', '#7c5222'], ['#a85a2a', '#d07e3e', '#743a1e']],
};
const M2_SHIRE_LANTERN = ['#ff6a4a', '#ffd23a', '#7ad0ff', '#ff9ad0', '#9aff8a'];

// A line of bark w units thick from (ax, ay) to (bx, by), lit on its left.
function m2ShireLimb(g, ax, ay, bx, by, w, snow) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4);
  for (let j = 0; j <= n; j += 1) {
    const t = j / n;
    const [x, y] = [Math.round((ax + (bx - ax) * t) * 4) / 4, Math.round((ay + (by - ay) * t) * 4) / 4];
    const ww = Math.max(0.25, Math.round(w * (1 - t * 0.35) * 4) / 4);
    pxBox(g, x - ww / 2, y, ww, 0.5, M2_SHIRE_BARK[1]);
    if (ww >= 0.75) pxBox(g, x - ww / 2, y, 0.25, 0.5, M2_SHIRE_BARK[3]);
    if (snow && Math.abs(by - ay) < Math.abs(bx - ax) * 1.2) pxBox(g, x - ww / 2, y - 0.25, ww, 0.25, '#eef4f8');
  }
}
// Bare limbs for winter: a limb from (x, y) at angle a (from upright) len units long forks depth times.
function m2ShireTwigs(g, x, y, a, len, w, depth, seed) {
  const [ex, ey] = [x + Math.sin(a) * len, y - Math.cos(a) * len * 0.8];
  m2ShireLimb(g, x, y, ex, ey, w, true);
  if (depth <= 0) return;
  for (let i = 0; i < 2 + (m2Hash(seed, depth, 70) < 0.35 ? 1 : 0); i += 1) {
    m2ShireTwigs(g, ex, ey, a + (i - 0.5) * 0.9 + (m2Hash(seed, i + depth * 3, 71) - 0.5) * 0.5, len * 0.66, Math.max(0.25, w * 0.6), depth - 1, seed * 3 + i + 1);
  }
}

// An oak's canvas: a crown of radius r units over a trunk, for the season and seed; party for the Party Tree.
function m2ShireOakArt(r, season, seed, party = false, apple = false) {
  const key = `${r},${season},${seed},${party},${apple}`;
  if (M2_SHIRE_OAKS.has(key)) return M2_SHIRE_OAKS.get(key);
  const [rx, ry] = [r * 1.18, r * 0.86];
  const tall = Math.round(r * 0.5) + 1;
  const tw = Math.max(1.75, Math.round(r * 0.32 * 4) / 4);
  const w = Math.ceil(rx * 2 + 2);
  const h = Math.ceil(ry * 2 + tall + 2);
  const { c, g } = m2Canvas(w, h);
  const [cx, cy] = [w / 2, ry + 1];
  const foot = h - 0.5;
  const lean = (m2Hash(seed, 1, 72) - 0.5) * 1.5;
  // The trunk: thick, leaning a little, flaring into roots, a knot in it.
  const T = Math.round(tw * 4);
  m2Raster(g, cx - tw / 2 - 1, cy + ry * 0.35, T + 8, (foot - cy - ry * 0.35) * 4, (px, py) => {
    const rows = (foot - cy - ry * 0.35) * 4;
    const t = py / rows;
    const flare = t > 0.8 ? Math.round((t - 0.8) * 20) : 0;
    const shift = Math.round(lean * (1 - t) * 4);
    const [l, rr] = [4 - flare + shift, 4 + T + flare + shift];
    if (px < l || px >= rr) return null;
    const u = (px - l) / (rr - l);
    if (Math.abs(u - 0.55) < 0.12 && Math.abs(t - 0.5) < 0.06) return M2_SHIRE_BARK[0];
    const ridge = (px + (py >> 2)) % 5 === 0 ? -1 : 0;
    return M2_SHIRE_BARK[Math.max(0, (u < 0.25 ? 4 : u < 0.5 ? 3 : u < 0.8 ? 2 : 1) + ridge)];
  });
  const leaves = season !== 'winter';
  // The limbs out of the trunk's top, into the crown.
  const crotch = [cx + lean, cy + ry * 0.45];
  const limbs = [-1.1, -0.45, 0.35, 1.0].map((a, i) => [crotch[0] + Math.sin(a) * rx * 0.62, crotch[1] - Math.cos(a) * ry * (0.55 + m2Hash(seed, i, 73) * 0.25)]);
  if (leaves) for (const [lx, ly] of limbs) m2ShireLimb(g, crotch[0], crotch[1], lx, ly, tw * 0.55, false);
  else {
    for (let i = 0; i < 5; i += 1) m2ShireTwigs(g, crotch[0], crotch[1], -1.2 + i * 0.6 + (m2Hash(seed, i, 74) - 0.5) * 0.3, r * 0.5, tw * 0.5, 3, seed + i);
    for (let i = 0; i < r; i += 1) pxBox(g, Math.round((cx + (m2Hash(seed, i, 75) - 0.5) * rx * 1.6) * 4) / 4, Math.round((cy + (m2Hash(seed, i, 76) - 0.6) * ry * 1.4) * 4) / 4, 0.5, 0.25, '#8a5a2a');
  }
  if (leaves) {
    // The clumps, the far (north) ones first, so a nearer one laps over the one behind it.
    const n = 8 + Math.floor(m2Hash(seed, 2, 77) * 3);
    const cl = [[cx, cy - ry * 0.1, r * 0.62]];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + m2Hash(seed, i, 78) * 0.5;
      const d = 0.5 + m2Hash(seed, i, 79) * 0.14;
      cl.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, r * (0.4 + m2Hash(seed, i, 80) * 0.14)]);
    }
    cl.sort((p, q) => p[1] - q[1]);
    const pals = (party && season === 'autumn' ? M2_SHIRE_LEAF.party : M2_SHIRE_LEAF[season]).map(treeRamp);
    const pal = cl.map((k, i) => pals[Math.floor(m2Hash(seed, i, 81) * pals.length)]);
    // Which clump covers each pixel (the nearest lying over the rest), worked out once into a grid.
    const [GW, GH] = [w * 4, Math.ceil((cy + ry + 1) * 4)];
    const id = new Int8Array(GW * GH).fill(-1);
    const dist = new Float32Array(GW * GH);
    // Each clump over its own box, far ones first, so the nearest covering clump is the one left in a pixel.
    for (let i = 0; i < cl.length; i += 1) {
      const [kx, ky, kr] = cl[i];
      const [p0, p1] = [Math.max(0, Math.floor((kx - kr * 1.07) * 4)), Math.min(GW, Math.ceil((kx + kr * 1.07) * 4))];
      const [q0, q1] = [Math.max(0, Math.floor((ky - kr * 0.96) * 4)), Math.min(GH, Math.ceil((ky + kr * 0.96) * 4))];
      for (let py = q0; py < q1; py += 1) {
        const ey = ((py + 0.5) / 4 - ky) * 1.12;
        for (let px = p0; px < p1; px += 1) {
          const ex = (px + 0.5) / 4 - kx;
          const d2 = (ex * ex + ey * ey) / (kr * kr);
          const lim = 1 + (m2Hash(px >> 1, py >> 1, seed) - 0.5) * 0.12;
          if (d2 <= lim * lim) { id[py * GW + px] = i; dist[py * GW + px] = Math.sqrt(d2); }
        }
      }
    }
    const at = (px, py) => (px < 0 || py < 0 || px >= GW || py >= GH ? -1 : id[py * GW + px]);
    m2Raster(g, 0, 0, GW, GH, (px, py) => {
      const i = at(px, py);
      if (i < 0) return null;
      const d = dist[py * GW + px];
      const P = pal[i];
      if (at(px, py - 1) < 0 || at(px - 1, py) < 0 || at(px + 1, py) < 0 || at(px, py + 1) < 0) return P[5];
      const [kx, ky, kr] = cl[i];
      const [nx, ny] = [((px + 0.5) / 4 - kx) / kr, ((py + 0.5) / 4 - ky) / kr];
      // A dark scallop along a clump's edge where it lies over the one behind it.
      const under = at(px, py + 2);
      if (d > 0.84 && ny > 0.1 && under >= 0 && under !== i) return P[4];
      const lit = -(nx * 0.62 + ny * 0.78) + (1 - (py / 4) / (cy + ry)) * 0.25;
      let s = lit > 0.78 ? 0 : lit > 0.32 ? 1 : lit > -0.15 ? 2 : lit > -0.55 ? 3 : 4;
      const hh = m2Hash(px, py, seed + 5);
      if (hh < 0.08) s = Math.max(0, s - 1); else if (hh > 0.92) s = Math.min(4, s + 1);
      return P[s];
    });
  }
  // An apple tree: red apples on its crown in summer and autumn, white blossom in spring.
  if (apple && season !== 'winter') {
    for (let i = 0; i < r * 3; i += 1) {
      const [ax, ay] = [cx + (m2Hash(seed, i, 82) - 0.5) * rx * 1.5, cy + (m2Hash(seed, i, 83) - 0.6) * ry * 1.3];
      const col = season === 'spring' ? '#fbeef4' : i % 3 ? '#c0302a' : '#e8544a';
      pxBox(g, Math.round(ax * 4) / 4, Math.round(ay * 4) / 4, 0.5, 0.5, col);
      pxBox(g, Math.round(ax * 4) / 4, Math.round(ay * 4) / 4, 0.25, 0.25, '#ffd0c8');
    }
  }
  if (party) {
    // The ring bench round the trunk, and lanterns hung on strings under the crown.
    m2Raster(g, cx - tw / 2 - 2.5, foot - 2.25, (tw + 5) * 4, 9, (px, py) => {
      const e = ((px + 0.5 - (tw + 5) * 2) / ((tw + 5) * 2)) ** 2 + ((py + 0.5 - 4.5) / 4.5) ** 2;
      if (e > 1 || (e < 0.45 && py < 6)) return null;
      return py < 3 ? M2_PAL.wood[4] : e > 0.8 ? M2_PAL.wood[0] : M2_PAL.wood[2];
    });
    for (let i = 0; i < 9; i += 1) {
      const a = Math.PI * (0.12 + (i / 8) * 0.76);
      const [lx, ly] = [cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.82 + 0.75];
      pxBox(g, Math.round(lx * 4) / 4, Math.round(ly * 4) / 4, 0.75, 1, M2_SHIRE_LANTERN[i % 5]);
      pxBox(g, Math.round(lx * 4) / 4, Math.round(ly * 4) / 4, 0.25, 0.25, '#ffffff');
    }
  }
  const art = { c, w, h, fx: cx, fy: foot, ry, cy };
  M2_SHIRE_OAKS.set(key, art);
  return art;
}
// Plants an oak with its foot at (x, y), as a standing thing that blocks walkers at its trunk. Returns the thing.
function m2ShireOak(L, add, x, y, r, season, seed, party = false, apple = false) {
  const art = m2ShireOakArt(r, season, seed % 3, party, apple);
  m2Shadow(L, x + r * 0.5, y - 0.5, r * 1.15, r * 0.5, 0.75);
  const [ox, oy] = [x - art.fx, y - art.fy];
  const o = { z: y, x: ox, y: oy, w: art.w, h: art.h, c: art.c, draw: (g) => g.drawImage(art.c, ox, oy, art.w, art.h), foot: [x - 1.5, y - 1.5, x + 1.5, y + 0.5] };
  add.obj(o);
  return o;
}
