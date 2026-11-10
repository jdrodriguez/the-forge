// scene2-lands.js: the lands between the realms on the map from above (scene2.js), painted with the world: rivers with
// sandy banks along lines of places, widening downstream; lakes; mountain ranges as rows of peaks seen from overhead,
// each lit on its west face and shaded on its east, gullies down them and snow on the high ones (Mordor's walls are
// black and bare), on a bed of rock; forests as a dark floor crowded with trees (Mirkwood's black-green, Lothlorien's
// gold, the Old Forest and Fangorn old and close, Ithilien open and green); and bridges where a road crosses water.

// A river along pts, hw0 units wide either side at its start widening to hw1: a sandy bank, then the water, deep in the
// middle and pale at its edges.
function m2River(L, pts, hw0, hw1, seed) {
  const hw = (t) => hw0 + (hw1 - hw0) * t;
  const bends = m2Meander(pts, seed);
  m2Stroke(L, bends, (t) => hw(t) + 1.4, M2_MAT.sand, { over: M2_LAND_MATS });
  m2Stroke(L, bends, hw, M2_MAT.water);
  return bends;
}
// A line of places turned into a wandering one: points every few units, each pushed aside by a slow wave and a quicker
// one, so a river bends as rivers do (its first and last points stay put).
function m2Meander(pts, seed, amp = 3) {
  const out = [pts[0]];
  let along = 0;
  for (let k = 0; k < pts.length - 1; k += 1) {
    const [[ax, ay], [bx, by]] = [pts[k], pts[k + 1]];
    const len = Math.hypot(bx - ax, by - ay);
    const [nx, ny] = [-(by - ay) / (len || 1), (bx - ax) / (len || 1)];
    for (let d = 4; d < len; d += 4) {
      along += 4;
      const off = amp * Math.sin(along / 17 + seed) + amp * 0.5 * Math.sin(along / 6.3 + seed * 2);
      out.push([ax + ((bx - ax) * d) / len + nx * off, ay + ((by - ay) * d) / len + ny * off]);
    }
  }
  out.push(pts.at(-1));
  return out;
}
const M2_LAND_MATS = [1, 2, 3, 4, 5, 9, 12, 14, 15, 16, 18, 19];
// A lake rx by ry units round (x, y), with a sandy shore.
function m2Lake(L, x, y, rx, ry, seed) {
  m2Blob(L, x, y, rx + 2.5, ry + 2, M2_MAT.sand, { wob: 2, seed });
  m2Blob(L, x, y, rx, ry, M2_MAT.water, { wob: 2, seed: seed + 1, aux: (nx, ny) => Math.hypot(nx, ny) * 235 });
}

// Mountain stone by range: rock outline to shine, and snow from shade to white (none for Mordor's).
const M2_STONE = {
  misty: [['#1e1c26', '#34313e', '#4a4756', '#625e6c', '#7e7a86', '#a29ea6'], ['#71809a', '#a8b6c6', '#d6e0ea', '#f6f9fc']],
  grey: [['#23232a', '#3a3a44', '#53535e', '#6c6c76', '#8a8a92', '#acacb2'], ['#7d8a9c', '#b2bfcc', '#dce4ec', '#f6f9fc']],
  white: [['#2a2a30', '#45444c', '#5f5e66', '#7b7a80', '#9a989c', '#c0bec0'], ['#7a889a', '#b4c0cc', '#e0e6ec', '#ffffff']],
  ephel: [['#0a080a', '#171214', '#241c1e', '#33282a', '#463634', '#5e4438'], null],
};
M2_STONE.lithui = M2_STONE.ephel;
const m2Peaks = new Map();
// A peak w units wide and w * 0.85 tall in a range's stone, its foot on the canvas's last row.
function m2Peak(w, range, seed) {
  const key = `${w},${range},${seed}`;
  if (m2Peaks.has(key)) return m2Peaks.get(key);
  const [R, S] = M2_STONE[range];
  const h = Math.round(w * (S ? 0.85 : 1));
  const { c, g } = m2Canvas(w, h);
  const [W4, H4] = [w * 4, h * 4];
  const apex = W4 * (0.42 + m2Hash(seed, 1, 70) * 0.16);
  const lean = (m2Hash(seed, 2, 70) - 0.5) * 0.3;
  const snow = 0.28 + m2Hash(seed, 3, 70) * 0.14;
  m2Raster(g, 0, 0, W4, H4, (px, py) => {
    const t = py / H4;
    const jag = (m2Hash(Math.floor(py / 3), seed, 71) - 0.5) * 3 + (S ? 0 : (m2Hash(Math.floor(py / 2), seed, 72) - 0.5) * 3);
    const [l, r] = [apex - t * apex * 1.02 + jag, apex + t * (W4 - apex) * 1.02 - jag];
    if (px < l || px > r) return null;
    const ridge = apex + py * lean;
    const west = px < ridge;
    if (px < l + 1 || px > r - 1 || py === 0) return R[0];
    const gully = m2Hash(px >> 1, py >> 2, seed + 73) < 0.12;
    if (S && t < snow + (m2Hash(px >> 2, seed, 74) - 0.5) * 0.12) return S[west ? (Math.abs(px - ridge) < 2 ? 3 : 2) : gully ? 0 : 1];
    let k = west ? (Math.abs(px - ridge) < 2 ? 5 : 4) : 2;
    if (gully) k -= 1;
    if (t > 0.86) k = Math.max(1, k - 1);
    return R[k];
  });
  m2Peaks.set(key, c);
  return c;
}
// A range along pts (scene2-land-peaks.js draws it): peaks of varied height with ridges, snow, passes and shadowed
// valleys. Returns the summits, north to south.
function m2Range(L, add, pts, range, size, seed) {
  return m2MtRange(L, add, pts, range, size, seed, m2.plan, m2Season());
}
// A forest rx by ry units round (x, y): a dark floor, crowded with trees of the kinds given, clear of the boxes to avoid.
// Its floor is laid early, before the realms' grounds and the roads, and its trees planted late, clear of both.
function m2ForestFloor(L, x, y, rx, ry, seed) {
  m2Blob(L, x, y, rx, ry, M2_MAT.forest, { wob: Math.min(rx, ry) * 0.35, seed });
}
function m2Forest(L, add, x, y, rx, ry, kinds, season, seed, avoid = [], gap = 0.66) {
  const area = { x0: x - rx, y0: y - ry, x1: x + rx, y1: y + ry };
  return m2Scatter(L, add, { area, n: Math.round((rx * ry * 3.2) / 55), kinds, avoid, mats: [M2_MAT.forest], season, seed, gap });
}
// Bridges where a road crosses water: the road's stones laid across, a parapet each side on a road that runs east and
// west (walkers pass behind the near one), and the arch's shadow on the water.
function m2Crossings(L, plan, add) {
  for (const road of plan.roads) {
    for (let s = 0; s < road.pts.length - 1; s += 1) {
      const [[ax, ay], [bx, by]] = [road.pts[s], road.pts[s + 1]];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay));
      let wet = null;
      for (let j = 0; j <= n; j += 1) {
        const [x, y] = [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n];
        const water = [M2_MAT.water, M2_MAT.sand].includes(m2MatAt(L, x, y));
        if (water && !wet) wet = [x, y];
        if (!water && wet) {
          m2Span(L, add, wet, [x, y], road.hw);
          wet = null;
        }
      }
    }
  }
}
function m2Span(L, add, [ax, ay], [bx, by], hw) {
  const len = Math.hypot(bx - ax, by - ay);
  const [ux, uy] = [(bx - ax) / (len || 1), (by - ay) / (len || 1)];
  const [x0, y0, x1, y1] = [ax - ux * 2, ay - uy * 2, bx + ux * 2, by + uy * 2];
  m2Shadow(L, (x0 + x1) / 2 + 1, (y0 + y1) / 2 + hw + 2, Math.max(4, Math.abs(x1 - x0) / 2 + 2), 2, 0.9);
  m2Stroke(L, [[x0, y0], [x1, y1]], hw + 0.5, M2_MAT.terrace, { aux: () => 60 });
  m2Parapets(add, x0, y0, x1, y1, hw);
}
// The parapets of a bridge that runs east and west, as standing things.
function m2Parapets(add, x0, y0, x1, y1, hw) {
  if (Math.abs(y1 - y0) > Math.abs(x1 - x0) * 0.6) return;
  const [l, w] = [Math.min(x0, x1) - 1, Math.abs(x1 - x0) + 2];
  const ym = (y0 + y1) / 2;
  const P = M2_PAL.stone;
  for (const [top, z] of [[ym - hw - 2, ym - hw], [ym + hw - 0.5, ym + hw + 2]]) {
    m2Thing(add, l, top, w, 3, z, (g) => {
      m2Raster(g, 0, 0, w * 4, 12, (px, py) => (py < 4 ? P[py === 0 ? 1 : py < 3 ? 5 : 4] : px === 0 || px === w * 4 - 1 || py === 11 ? P[0] : P[(px + (py > 7 ? 5 : 0)) % 10 === 0 ? 1 : 3]));
    });
  }
}
