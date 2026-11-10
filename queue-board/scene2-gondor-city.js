// scene2-gondor-city.js: Minas Tirith, the White City, on the map from above (scene2.js), the landmark of the south.
// Seven white walled tiers rise at the White Mountains' east end, each ring smaller and higher than the one below, its
// terrace crowded with slate roofs and white house fronts. The great prow of rock runs from the Citadel down toward the
// Great Gate, splitting the tiers. On the Citadel's court stand the White Tower of Ecthelion and the White Tree. Banners
// stir on the tower and the gate towers, and at night the windows and the lamps along every wall are lit. Drawn once
// into a cached canvas (scene2-gondor.js's m2SouthArt) relative to plan.places.minasTirith, and stood on the map by
// scene2-gondor-citybuild.js. The Pelennor, the Rammas Echor and Osgiliath are scene2-gondor-fields.js's.

(m2.south ??= {}).city = true;
// White stone, outline to shine; slate and lead roofs with a few warm tiles.
const M2MT_W = ['#3c4050', '#6c7284', '#979daf', '#c2c6d2', '#e2e5ec', '#fbfcfd'];
const M2MT_ROOF = [['#3e4a5e', '#56667e', '#7486a0', '#93a4ba'], ['#4a515c', '#646c78', '#828a96', '#a2a8b2'], ['#6a4232', '#8a5a44', '#a8765a', '#c49474']];
const M2MT_GLOW = ['#ffcf6e', '#ffe39c', '#fff4cc'];
// The canvas: 64 by 80 units, its top-left 32 west and 73 north of the place; the first wall's foot on row 79.
const M2MT = { w: 64, h: 80, ox: -32, oy: -73, cx: 32 };

// The seven tiers: each ring's top ellipse (centre row cy, radii rx and ry) and its wall's face height hw.
function m2MtTiers() {
  const T = [];
  let cy = 61.4;
  for (let i = 0; i < 7; i += 1) {
    const rx = 29.5 - 3.4 * i;
    const t = { rx, ry: rx * 0.36, hw: i === 0 ? 7 : i === 6 ? 4.2 : 3.6, cy };
    if (i > 0) { cy = T[i - 1].cy - (2.8 + t.hw - (T[i - 1].ry - t.ry)); t.cy = cy; }
    T.push(t);
  }
  return T;
}
const M2MT_T = m2MtTiers();
const m2MtBay = (px, py) => M2_BAYER[(py & 3) * 4 + (px & 3)];
// A ramp step from a lightness in [0, 1], dithered on the Bayer grid so faces shade smoothly.
const m2MtStep = (R, l, px, py, lo = 1) => R[Math.max(lo, Math.min(R.length - 1, Math.floor(l * (R.length - 1) + m2MtBay(px, py) - 0.25)))];

// The Citadel's things: the White Tower of Ecthelion with its pinnacle, two halls, the White Tree and the fountain.
function m2MtCitadel(u, v, px, py, glow) {
  const t = M2MT_T[6];
  if (u < 24 || u > 40 || v > t.cy + 3) return null;
  const top = t.cy - 0.6;
  const W = M2MT_W;
  if (u >= 29.6 && u < 34.4 && v >= 7.5 && v < top) {
    const x = (u - 29.6) / 4.8;
    if (x < 0.06 || x > 0.94) return glow ? null : W[0];
    const band = v < 9 ? 1 : Math.abs(v - 14) < 0.35 ? 2 : Math.abs(v - 21) < 0.3 ? 2 : 0;
    const win = (Math.abs(v - 11.2) < 0.6 || Math.abs(v - 17.4) < 0.6 || Math.abs(v - 24) < 0.6) && Math.abs(x - 0.5) < 0.09;
    if (win) return glow ? M2MT_GLOW[1] : '#2a3040';
    if (glow) return null;
    if (band === 2) return W[1];
    const l = 1.05 - x * 0.95 + (band === 1 ? 0.1 : 0);
    if (v < 8.25 && Math.floor(u * 2) % 2) return null;
    return m2MtStep(W, l, px, py, 1);
  }
  if (u >= 30.4 && u < 33.6 && v >= 1.2 && v < 7.5) {
    const half = 0.25 + ((v - 1.2) / 6.3) * 1.35;
    const dx = u - 32;
    if (Math.abs(dx) > half) return null;
    if (glow) return null;
    return Math.abs(dx) > half - 0.25 ? W[1] : dx < -0.2 ? W[5] : dx < 0.4 ? W[4] : W[2];
  }
  if (glow) return null;
  for (const [x0, x1] of [[24.6, 29.2], [34.8, 39.2]]) {
    if (u < x0 || u >= x1 || v < top - 3.4 || v >= top + 1.2) continue;
    const r = v < top - 1.2;
    if (r) return M2MT_ROOF[0][v < top - 2.6 ? 3 : u < (x0 + x1) / 2 ? 2 : 1];
    if (Math.abs(v - (top + 0.2)) < 0.3 && Math.floor(u * 2) % 3 === 0) return '#2a3040';
    return W[u < x0 + 0.3 || u > x1 - 0.3 ? 1 : 4];
  }
  const tree = Math.hypot((u - 36.2) / 1.7, (v - (t.cy + 0.3)) / 1.25);
  if (tree < 1) return tree > 0.8 ? '#8a98a0' : m2Hash(px, py, 5) < 0.18 ? '#d8f0e0' : (u < 36 ? W[5] : '#dfe8ec');
  if (Math.abs(u - 36.2) < 0.3 && v >= t.cy + 1.2 && v < t.cy + 2.6) return '#3a2c26';
  const ft = Math.hypot((u - 28.6) / 1.1, (v - (t.cy + 1.4)) / 0.55);
  if (ft < 1) return ft > 0.7 ? W[2] : '#7cc4e0';
  return null;
}

// The great prow of rock running from the Citadel down to the second tier: a keel of white stone narrow at its head,
// a walk with battlements along its top, its south face lit and its east end in shade, a lookout at its tip.
const M2MT_PROW = { ax: 33.2, tx: 40.4, ty: 44 };
function m2MtProw(u, v, px, py) {
  const { ax, tx, ty } = M2MT_PROW;
  const ay = M2MT_T[6].cy + 2.6;
  if (u < ax - 0.5 || u > tx + 0.6) return null;
  const f = Math.max(0, (u - ax) / (tx - ax));
  const ridge = ay + (ty - ay) * f;
  const foot = 43 + (66 - 43) * f;
  const W = M2MT_W;
  if (v < ridge - 0.9 || v > foot) return null;
  if (u < ax + (v - ridge) * 0.12) return null;
  if (v < ridge - 0.4) return Math.floor(px / 2) % 2 ? null : W[5];
  if (v < ridge) return W[4];
  if (u > tx - 0.25) return W[0];
  if (u > tx - 1.6) return m2MtStep(W, 0.34, px, py, 1);
  if (v - ridge < 0.3) return W[1];
  const strata = Math.abs(((v - ridge) % 1.8)) < 0.22 && m2Hash(Math.floor(u * 1.5), Math.floor(v / 1.8), 7) < 0.75;
  return strata ? W[2] : m2MtStep(W, 0.78 - (v - ridge) * 0.01 - f * 0.1, px, py, 2);
}
// The prow's shadow on the walls and roofs east of its tip.
const M2MT_DIM = new Map([M2MT_W, ...M2MT_ROOF].flatMap((R) => R.map((c, i) => [c, R[Math.max(0, i - 2)]])));
const m2MtProwShade = (u, v) => u > M2MT_PROW.tx + 0.4 && u < M2MT_PROW.tx + 2.6 && v > M2MT_PROW.ty && v < 64 + (u - M2MT_PROW.tx) * 0.5;

// A terrace's houses between the wall above (its face's foot at fb) and the parapet on the rim (row ya).
function m2MtHouses(i, u, v, ya, fb, px, py, glow) {
  const W = M2MT_W;
  const dRim = ya - v;
  if (v - fb < 0.5) return glow ? null : M2MT_W[1];
  if (dRim < 0.9) return glow ? null : (m2Hash(px, py, 3) < 0.1 ? W[3] : W[4]);
  const row = Math.floor((dRim - 0.9) / 2.6);
  const r = (dRim - 0.9) - row * 2.6;
  const cw = 2.4 + m2Hash(row, i, 19) * 1.4;
  const cu = u + row * 1.3 + i * 2.1;
  const cell = Math.floor(cu / cw);
  const cx = cu / cw - cell;
  const h = m2Hash(cell, row * 7 + i, 23);
  if (cx < 0.08) return glow ? null : W[1];
  if (h < 0.1) {
    if (glow) return null;
    return r > 1.9 || r < 0.3 ? W[2] : ['#2f5a2c', '#3f7434', '#5a9440'][m2Hash(px >> 1, py >> 1, 4) < 0.5 ? 1 : r > 1.4 ? 2 : 0];
  }
  if (r < 1.15) {
    const win = Math.abs(r - 0.6) < 0.3 && Math.floor(cx * 6) % 3 === 1;
    if (win) return glow ? (h > 0.45 ? M2MT_GLOW[0] : null) : '#3a4050';
    return glow ? null : W[cx > 0.85 ? 2 : r < 0.25 ? 2 : 4];
  }
  if (glow) return null;
  const R = M2MT_ROOF[h > 0.88 ? 2 : h > 0.55 ? 1 : 0];
  return R[r > 2.3 ? 3 : r > 1.75 ? 2 : cx > 0.7 ? 0 : 1];
}

// A tier's wall face, row dF down from its rim at lightness by where it faces: the left lit, the right in shade.
function m2MtFace(i, u, v, ex, dF, px, py, glow) {
  const t = M2MT_T[i];
  const W = M2MT_W;
  if (Math.abs(ex) > 0.985) return glow ? null : W[0];
  if (i === 0 && Math.abs(u - 40.4) < 3.6) return m2MtGate(u, dF, px, py, glow);
  const slit = i > 0 && dF > 1.3 && dF < 2.3 && Math.floor((u + i * 1.3) * 1.25) % 4 === 0 && m2Hash(Math.floor(u * 1.25), i, 41) < 0.55 && Math.floor(px) % 4 === 1;
  if (slit) return glow ? (m2Hash(Math.floor(u * 1.25), i, 42) < 0.6 ? M2MT_GLOW[0] : null) : '#2c3240';
  if (glow) return null;
  if (dF < 0.25) return W[ex < 0.3 ? 5 : 4];
  if (dF > t.hw - 0.3) return W[1];
  const course = Math.abs((dF % 1.25) - 1.1) < 0.12 && (px + Math.floor(dF / 1.25) * 3) % 7 !== 0;
  const l = 0.7 - ex * 0.55 - (dF / t.hw) * 0.12 - (course ? 0.14 : 0);
  return m2MtStep(W, l, px, py, 1);
}
// The Great Gate in the first wall facing the Pelennor: two towers either side of a tall round arch with iron doors.
function m2MtGate(u, dF, px, py, glow) {
  const W = M2MT_W;
  const g = u - 40.4;
  if (Math.abs(g) < 1.5) {
    const top = 1.2 + (1 - Math.sqrt(Math.max(0, 1 - (g / 1.5) ** 2))) * 1.5;
    if (dF < top - 0.3) return glow ? null : W[3];
    if (dF < top) return glow ? null : W[1];
    if (glow) return dF > 4 && Math.abs(g) < 1.2 ? M2MT_GLOW[0] : null;
    return Math.abs(g) < 0.12 ? '#14161c' : (Math.floor(dF * 2) % 2 ? '#2c2a2e' : '#3e3a3c');
  }
  if (glow) return Math.abs(dF - 1.4) < 0.3 && Math.abs(Math.abs(g) - 2.65) < 0.2 ? M2MT_GLOW[1] : null;
  if (Math.abs(Math.abs(g) - 2.65) < 0.2 && Math.abs(dF - 1.4) < 0.3) return '#2c3240';
  return m2MtStep(W, g < 0 ? 0.82 : 0.48, px, py, 1);
}

// The Great Gate's two towers, standing out from the first wall and rising above its battlements.
function m2MtGateTowers(u, v, px, py, glow) {
  const g = u - 40.4;
  if (Math.abs(g) < 1.5 || Math.abs(g) > 3.9) return null;
  const t = M2MT_T[0];
  const ex = (u - M2MT.cx) / t.rx;
  const ya = t.cy + t.ry * Math.sqrt(1 - ex * ex) + 0.6;
  if (v < ya - 3 || v >= ya + t.hw - 0.6) return null;
  const W = M2MT_W;
  const left = g < 0;
  const edge = Math.abs(Math.abs(g) - 1.5) < 0.25 || Math.abs(Math.abs(g) - 3.9) < 0.25;
  if (v < ya - 2.4) return Math.floor(px / 2) % 2 ? null : glow ? null : W[left ? 5 : 3];
  if (glow) return Math.abs(v - (ya + 0.4)) < 0.35 && Math.abs(Math.abs(g) - 2.7) < 0.2 ? M2MT_GLOW[1] : null;
  if (edge) return W[0];
  if (v < ya - 2) return W[left ? 5 : 4];
  if (Math.abs(v - (ya + 0.4)) < 0.35 && Math.abs(Math.abs(g) - 2.7) < 0.2) return '#2a3040';
  return m2MtStep(W, left ? 0.85 - (v - ya) * 0.02 : 0.45, px, py, 1);
}

// One pixel of the city: the Citadel and the prow over the tiers, the tiers from the highest down.
function m2MtPix(px, py, glow) {
  const [u, v] = [(px + 0.5) / 4, (py + 0.5) / 4];
  const c = m2MtCitadel(u, v, px, py, glow) ?? m2MtGateTowers(u, v, px, py, glow);
  if (c) return c;
  for (let i = 6; i >= 0; i -= 1) {
    const t = M2MT_T[i];
    const ex = (u - M2MT.cx) / t.rx;
    if (Math.abs(ex) > 1) continue;
    const s = Math.sqrt(1 - ex * ex);
    const [ya, yb] = [t.cy + t.ry * s, t.cy - t.ry * s];
    if (v < yb - 0.5 || v >= ya + t.hw) continue;
    if (i > 0 && i < 6) { const p = m2MtProw(u, v, px, py); if (p) return glow ? null : p; }
    const shade = !glow && m2MtProwShade(u, v);
    if (v >= ya) { const c = m2MtFace(i, u, v, ex, v - ya, px, py, glow); return shade ? M2MT_DIM.get(c) ?? c : c; }
    const merlon = (Math.floor(px / 2) + i) % 2 === 0;
    if (v >= ya - 0.5) {
      if (glow && Math.floor(u + i * 1.7) % 4 === 0 && px % 4 === 1) return M2MT_GLOW[2];
      if (merlon) return glow ? null : M2MT_W[ex < 0.3 ? 5 : 3];
    }
    if (v < yb) { if (merlon && i < 6) return glow ? null : M2MT_W[3]; continue; }
    if (i === 6) return glow ? null : M2MT_W[m2Hash(px >> 1, py >> 1, 6) < 0.2 ? 4 : 5];
    const n = M2MT_T[i + 1];
    const en = (u - M2MT.cx) / n.rx;
    const fb = Math.abs(en) < 1 ? n.cy + n.hw + n.ry * Math.sqrt(1 - en * en) : yb;
    const c = m2MtHouses(i, u, v, ya, fb, px, py, glow);
    return shade ? M2MT_DIM.get(c) ?? c : c;
  }
  return null;
}
