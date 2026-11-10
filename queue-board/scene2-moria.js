// scene2-moria.js: Moria's West-gate on the map from above (scene2.js), under the Misty Mountains southwest of
// Rivendell, at plan.places.moriaWest: a sheer grey cliff whose smooth face hides the Doors of Durin, seen only as a
// faint silver tracery by day (the arch on its two pillars, the crown and its seven stars, the anvil, the two trees and
// the star of Feanor) that glows soft silver at night; the two holly trees flanking the doors; the dark still pool of
// the dammed Sirannon under the cliff; the old dry stream bed running away from it; and the Stair Falls, a rock step
// with its stair cut beside a thin trickle. It also holds the painting kit the Moria and Lorien files share: a canvas
// painted once per key straight into its pixels, and a standing thing with its footprint.

const m2MoriaCache = new Map();
const m2MoriaHex = new Map();
// A canvas w by h units at 4 pixels a unit, painted once per key by rule(px, py), which gives each pixel's colour as
// '#rrggbb' or nothing. Cached, so a relayout at the same size costs nothing.
function m2MoriaArt(key, w, h, rule) {
  const k = `${key}|${w}|${h}`;
  if (m2MoriaCache.has(k)) return m2MoriaCache.get(k);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * 4));
  c.height = Math.max(1, Math.ceil(h * 4));
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const px32 = new Uint32Array(img.data.buffer);
  for (let py = 0, i = 0; py < c.height; py += 1) {
    for (let px = 0; px < c.width; px += 1, i += 1) {
      const hex = rule(px, py);
      if (!hex) continue;
      let v = m2MoriaHex.get(hex);
      if (v === undefined) { v = m2Pack(hex); m2MoriaHex.set(hex, v); }
      px32[i] = v;
    }
  }
  g.putImageData(img, 0, 0);
  m2MoriaCache.set(k, c);
  return c;
}
// Stands a painted canvas on the map with its top-left at (x, y), w by h units, sorted by z (the row where it meets the
// ground), with foot [x0, y0, x1, y1] as the ground it blocks for walkers. Returns the object.
function m2MoriaThing(add, key, x, y, w, h, z, rule, foot) {
  const c = m2MoriaArt(key, w, h, rule);
  const o = { x, y, w, h, z, c, draw: (dst) => dst.drawImage(c, x, y, w, h) };
  if (foot) o.foot = foot;
  add.obj(o);
  return o;
}
// Marks the pixels inside(x, y) (in units, over the box) as material m, and returns the box's pixel count marked.
function m2MoriaMark(L, x0, y0, x1, y1, m, inside) {
  for (let py = Math.max(0, Math.floor(y0 * 4)); py < Math.min(L.ph, Math.ceil(y1 * 4)); py += 1) {
    for (let px = Math.max(0, Math.floor(x0 * 4)); px < Math.min(L.pw, Math.ceil(x1 * 4)); px += 1) {
      const v = inside(px / 4, py / 4);
      if (v === false || v == null) continue;
      const i = py * L.pw + px;
      L.mat[i] = m;
      L.under[i] = m;
      L.aux[i] = typeof v === 'number' ? v : 0;
    }
  }
}
// What glows at night (the doors' tracery, Mirrormere's stars, Lorien's lamps): each { c, x, y, w, h, pulse }, refilled
// by every build and drawn after the night's shade by the light layer below.
const m2MoriaGlows = [];
m2.layers.light.push((g, tick, reduced) => {
  if (!m2MoriaGlows.length) return;
  const dark = m2Dark(m2.sky?.hour ?? 12)[0];
  if (dark < 0.05) return;
  for (const l of m2MoriaGlows) {
    g.globalAlpha = dark * (reduced || !l.pulse ? 0.9 : 0.72 + 0.28 * Math.sin(tick * l.pulse + l.x));
    g.drawImage(l.c, l.x, l.y, l.w, l.h);
  }
  g.globalAlpha = 1;
});
m2.builds.unshift(() => { m2MoriaGlows.length = 0; });

// The cliff's stone, outline to shine: a cool smooth grey, and the rock of its broken top.
const M2_MORIA_FACE = ['#18171e', '#33323d', '#4b4a57', '#62616e', '#7a7986', '#9796a2', '#bdbcc6'];
const M2_MORIA_SILVER = ['#9aa3b4', '#b9c3d2'];
// The Doors of Durin's tracery in a box 36 by 52 pixels: k 2 for the line's bright core, 1 for its faint edge, 0 none.
function m2DurinLine(px, py) {
  const [cx, ay] = [17.5, 17];
  const r = Math.hypot(px - cx, py - ay);
  if (py <= ay && (Math.abs(r - 16.5) < 0.7)) return 2;
  if (py <= ay && Math.abs(r - 13.8) < 0.5) return 1;
  if (py <= ay && r > 14.4 && r < 16 && m2Hash(Math.floor(Math.atan2(py - ay, px - cx) * 14), 1, 80) < 0.55) return 1;
  if (py > ay && py < 51 && (Math.abs(px - 1.5) < 0.8 || Math.abs(px - 33.5) < 0.8)) return 2;
  if (py > ay - 2 && py < ay + 2 && (px < 5 || px > 30)) return 2;
  if (py === 51 && px > 0 && px < 35) return 1;
  // The two trees climbing inside the pillars, their branches reaching in and up.
  for (const tx of [5.5, 29.5]) {
    if (Math.abs(px - tx) < 0.6 && py > 22 && py < 50) return 1;
    const side = tx < cx ? 1 : -1;
    for (const by of [26, 32, 38, 44]) if ((px - tx) * side > 0 && (px - tx) * side < 4 && Math.abs(py - (by - (px - tx) * side * 0.7)) < 0.6) return 1;
  }
  // The crown with the seven stars arched over it, and the anvil and hammer under the crown.
  for (let s = 0; s < 7; s += 1) {
    const a = Math.PI * (0.15 + (s / 6) * 0.7);
    if (Math.abs(px - (cx - Math.cos(a) * 8)) < 0.7 && Math.abs(py - (11.5 - Math.sin(a) * 5.5)) < 0.7) return 2;
  }
  if (py >= 13 && py <= 15 && Math.abs(px - cx) < 3.5 && (py === 15 || (px + 0.5) % 2 < 1)) return 2;
  if ((py === 19 && Math.abs(px - cx) < 3.5) || (py === 20 && Math.abs(px - cx) < 1.5) || (py === 21 && Math.abs(px - cx) < 2.5)) return 1;
  // The star of Feanor: eight rays from its heart.
  const [sx, sy] = [cx, 31];
  const d = Math.hypot(px - sx, py - sy);
  if (d < 1.2) return 2;
  if (d < 7.5) {
    const a = Math.atan2(py - sy, px - sx) / (Math.PI / 4);
    if (Math.abs(a - Math.round(a)) * d < 0.55) return d < 5 ? 2 : 1;
  }
  return 0;
}
// The cliff w by h units, a bay in the mountain's foot: a broken rocky top that meets the mountain's rock behind it, a
// lit lip, then the sheer face with seams and the stains of old water down it, darker toward its foot; its sides fall
// to the ground as rocky slopes (the west one in shade, the east one lit, so the face reads as set back). The doors'
// tracery, faint by day, sits in the face's middle.
function m2MoriaCliffRule(w, h, faceTop) {
  const [W4, H4, F4] = [w * 4, h * 4, faceTop * 4];
  const R = M2_RAMPS[9];
  const F = M2_MORIA_FACE;
  const dx0 = Math.round(W4 / 2 - 18);
  return (px, py) => {
    const end = Math.min(px, W4 - 1 - px);
    const west = px < W4 / 2;
    const top = Math.round(m2Noise(px, 0, 7, 81) * 10 + (m2Hash(px >> 1, 2, 82) < 0.3 ? 1 : 0) + Math.max(0, 18 - end) * 1.1);
    if (py < top) return null;
    // The face's edge on each side: it widens a little toward its foot, and the slopes beyond it reach the ground.
    const t = Math.max(0, (py - F4) / (H4 - F4));
    const edge = 22 - t * 8 + (m2Noise(py, west ? 1 : 2, 4, 83) - 0.5) * 4;
    const skirt = 2 + Math.max(0, (F4 - py) / 3) + (m2Hash(py >> 1, west ? 3 : 4, 83) - 0.5) * 2;
    if (end < skirt) return null;
    const lip = F4 + Math.round((m2Noise(px, 5, 6, 84) - 0.5) * 5);
    const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
    if (py < lip - 1 || (end < edge && py >= lip - 1)) {
      if (end < skirt + 1 || (py === top && end > 18)) return R[0];
      let n = m2Noise(px, py, 3, 85) * 2.4 + b * 0.9 + (py - top < 2 ? 0.8 : 0);
      if (end < edge && py >= lip - 1) n += west ? -0.9 : 0.7;
      if (m2Hash(px >> 1, py >> 1, 86) < 0.06) n -= 1;
      return R[Math.max(1, Math.min(5, Math.floor(n + 1.4)))];
    }
    if (py === lip - 1) return F[6];
    if (py === lip) return F[5];
    if (py >= H4 - 1 || end < edge + 1) return F[0];
    const seam = m2Hash(px >> 1, 1, 87);
    let k = 3 + (t < 0.12 ? 1 : 0) - (t > 0.6 ? 1 : 0) - (t > 0.9 ? 1 : 0) + (b < t * 0.6 - 0.3 ? -1 : 0) + (m2Noise(px, py, 5, 91) > 0.68 ? 1 : 0);
    if (seam < 0.1 && m2Hash(px >> 1, py >> 3, 88) < 0.75) k -= 1;
    else if (seam > 0.94) k += 1;
    if ((py - lip) % 19 === 0 && m2Hash(px >> 3, py, 89) < 0.6) k -= 1;
    const stain = m2Hash(px >> 1, 7, 90) < 0.1 && py - lip < 14 + m2Hash(px >> 1, 8, 90) * 40;
    if (stain) k -= 1;
    if (end < edge + 5) k += west ? -1 : 0;
    k = Math.max(1, Math.min(6, k));
    const tr = px - dx0 >= 0 && px - dx0 < 36 && H4 - 1 - py < 52 ? m2DurinLine(px - dx0, 51 - (H4 - 1 - py)) : 0;
    if (tr) return hdMix(F[k], M2_MORIA_SILVER[1], tr === 2 ? 0.34 : 0.16);
    return stain && k < 3 ? '#3e4a44' : F[k];
  };
}
// The doors' tracery as it glows at night: the silver line with a soft halo round it.
function m2DurinGlow() {
  return m2MoriaArt('durinGlow', 11, 15, (px, py) => {
    const [x, y] = [px - 4, py - 4];
    const k = x >= 0 && x < 36 && y >= 0 && y < 52 ? m2DurinLine(x, y) : 0;
    if (k === 2) return '#f2f6ff';
    if (k === 1) return '#c8d6f4';
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const [u, v] = [x + a, y + b];
      if (u >= 0 && u < 36 && v >= 0 && v < 52 && m2DurinLine(u, v) && (px + py) % 2 === 0) return Math.abs(a) + Math.abs(b) < 2 ? '#7f97d0' : '#4a5c94';
    }
    return null;
  });
}
// A holly tree with its foot on the canvas's last row: a tall dark crown of glossy spiky leaves, bright where the light
// catches them, a few red berries, and a grey trunk below.
function m2HollyRule(season, seed) {
  const G = ['#08160e', '#10261a', '#183626', '#224a32', '#2f6040', '#5e9a6e', '#cfe8d4'];
  const [W4, H4] = [36, 64];
  return (px, py) => {
    if (py >= 50) return Math.abs(px - 17.5) < 2 + (py > 61 ? 1 : 0) ? ['#3a3430', '#6a625a', '#8c847a'][px < 17 ? 2 : px < 19 ? 1 : 0] : null;
    const t = py / 52;
    const half = 15 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62 + 0.25) * (1 - Math.max(0, t - 0.85) * 3);
    const jag = (m2Hash(py >> 1, seed, 89) - 0.5) * 3 + ((py >> 1) % 3 === 0 ? 1.5 : 0);
    const dx = px + 0.5 - W4 / 2;
    if (Math.abs(dx) > half + jag || py < 1) return null;
    if (Math.abs(dx) > half + jag - 1.2) return G[0];
    if (m2Hash(px >> 1, py >> 1, seed + 90) < 0.03 && (px + py) % 2 && py < 46) return m2Hash(px, py, 91) < 0.5 ? '#c41e24' : '#ff5a4a';
    if (season === 'winter' && py < 30 && m2Hash(px >> 1, py >> 1, 92) < 0.18 - t * 0.3) return '#eef4f8';
    const leaf = m2Hash(px >> 1, py >> 1, seed + 93);
    const lit = -dx / 15 - t * 0.9 + 0.6 + (leaf - 0.5) * 0.7;
    if (leaf > 0.94 && lit > 0) return G[6];
    return G[lit > 0.9 ? 5 : lit > 0.45 ? 4 : lit > 0 ? 3 : lit > -0.45 ? 2 : 1];
  };
}

function m2Moria(L, plan, season, add) {
  const P = plan.places.moriaWest;
  if (!P) return;
  const [x, y] = [P.x, P.y];
  const [w, h, faceTop] = [38, 24, 8];
  // The cliff, its foot on the gate's row, so the peaks behind it stand behind it.
  m2MoriaThing(add, `moriaCliff${season}`, x - w / 2, y - h, w, h, y, m2MoriaCliffRule(w, h, faceTop), [x - w / 2 + 3, y - 2.5, x + w / 2 - 3, y]);
  m2MoriaGlows.push({ c: m2DurinGlow(), x: x - 4.5 - 1, y: y - 13 - 1, w: 11, h: 15, pulse: 0.05 });
  // The ledge under the cliff where the doors open, and the pool before it.
  m2Rect(L, x - 13, y - 0.5, 26, 3, M2_MAT.path);
  const [cx, cy, rx, ry] = [x - 2, y + 7.5, 14, 4.6];
  const pool = (u, v) => {
    const [nx, ny] = [(u - cx) / rx, (v - cy) / ry];
    const a = Math.atan2(ny, nx);
    return Math.hypot(nx, ny) / (1 + 0.1 * (m2Noise(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + 9, 1, 94) - 0.5) * 2);
  };
  m2MoriaMark(L, cx - rx * 1.2, cy - ry * 1.2, cx + rx * 1.2, cy + ry * 1.2, M2_MAT.water, (u, v) => pool(u, v) <= 1 && 120);
  L.decals.push((g) => m2Raster(g, cx - rx * 1.2, cy - ry * 1.2, rx * 9.6, ry * 9.6, (px, py) => {
    const [u, v] = [cx - rx * 1.2 + px / 4, cy - ry * 1.2 + py / 4];
    const d = pool(u, v);
    if (d > 1.12) return null;
    const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
    if (d > 1) return d + b * 0.1 > 1.07 ? null : ['#2e2c22', '#3e3a2a'][(px >> 1) % 3 ? 0 : 1];
    if (d > 0.93) return '#1a2420';
    const ny = (v - cy) / ry;
    if (ny < -0.55 && d < 0.9) return b < 0.5 ? '#050a0b' : '#081010';
    if (d > 0.78 && m2Noise(u, v, 2.5, 95) > 0.62) return b < 0.4 ? '#1e2e1a' : '#142218';
    if ((py + (px >> 4)) % 7 === 0 && m2Hash(px >> 3, py, 96) < 0.35) return '#1c3230';
    return b < 0.25 ? '#0e1c1c' : '#0a1616';
  }));
  // The holly trees either side of the doors, standing in front of the cliff.
  for (const [hx, seed] of [[x - 9.5, 3], [x + 9.5, 7]]) {
    m2Shadow(L, hx + 2, y + 1.2, 4, 1.4, 0.7);
    m2MoriaThing(add, `holly${season}${seed}`, hx - 4.5, y + 1.5 - 16, 9, 16, y + 1.5, m2HollyRule(season, seed), [hx - 1, y + 0.5, hx + 1, y + 1.8]);
  }
  for (const [bx, by, r, s] of [[x - 14, y + 1, 3, 1], [x + 13.5, y + 0.8, 3.5, 2], [x + 16, y + 3, 2, 3]]) m2Rock(L, add, bx, by, r, s);
  m2MoriaStair(L, add, plan, season, cx - rx + 1, cy + 1);
}

// The old bed of the Sirannon, dry since the stream was dammed, from the pool's west end down to the Stair Falls: a
// pale stony strip winding west, and at its end a rock step with its stair cut beside a thin trickle of water.
function m2MoriaStair(L, add, plan, season, sx, sy) {
  const pts = [[sx, sy], [sx - 4, sy + 2], [sx - 7, sy + 2.5], [sx - 10, sy + 5]];
  const ok = [M2_MAT.wild, M2_MAT.elf, M2_MAT.rock, M2_MAT.forest, M2_MAT.man, M2_MAT.hobbit, M2_MAT.path];
  m2Stroke(L, pts, 1.7, M2_MAT.sand, { over: ok });
  L.decals.push((g) => {
    for (let i = 0; i < 46; i += 1) {
      const t = m2Hash(i, 1, 97);
      const k = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
      const f = t * (pts.length - 1) - k;
      const [u, v] = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f + (m2Hash(i, 2, 97) - 0.5) * 3, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f + (m2Hash(i, 3, 97) - 0.5) * 2];
      if (m2MatAt(L, u, v) !== M2_MAT.sand) continue;
      const [qx, qy] = [Math.round(u * 4) / 4, Math.round(v * 4) / 4];
      pxBox(g, qx, qy, 0.5, 0.25, M2_PAL.stone[4]);
      pxBox(g, qx, qy + 0.25, 0.5, 0.25, M2_PAL.stone[1]);
    }
  });
  // The step: its top level with the bed, its face toward the southwest, the stair on its east side.
  const [ex, ey] = pts.at(-1);
  const [lw, lh] = [13, 5];
  const S = M2_MORIA_FACE;
  m2Shadow(L, ex + 1, ey + 0.4, lw / 2 + 1, 1.2, 0.8);
  m2MoriaThing(add, 'moriaStep', ex - lw / 2, ey - lh, lw, lh, ey, (px, py) => {
    const [W4, H4] = [lw * 4, lh * 4];
    const end = Math.min(px, W4 - 1 - px);
    if (py < 6 - Math.min(6, end) * 0.6 || py < Math.round(m2Noise(px, 1, 5, 98) * 4)) return null;
    if (py < 8) return M2_RAMPS[9][py < 6 ? 4 : 3];
    if (py === 8) return S[5];
    const stair = px > W4 - 20 && px < W4 - 6;
    if (stair) {
      const s = Math.floor((py - 9) / 3);
      return (py - 9) % 3 === 0 ? S[6] : (py - 9) % 3 === 2 ? S[1] : S[3 + (s % 2)];
    }
    if (Math.abs(px - (W4 / 2 - 6)) < 1.5) return py % 3 ? '#cfe6ee' : '#8fb8c8';
    if (py === H4 - 1 || end < 1) return S[0];
    return S[(m2Hash(px >> 1, 3, 99) < 0.15 ? 2 : 3) + (px < 6 ? 1 : 0)];
  }, [ex - lw / 2 + 1, ey - 1.5, ex + lw / 2 - 5, ey]);
  m2Blob(L, ex - 1.5, ey + 1.6, 2.2, 1.2, M2_MAT.water, { aux: (nx, ny) => Math.hypot(nx, ny) * 230 });
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  m2Moria(L, plan, season, add);
  m2.cost_moria = performance.now() - t0;
});
