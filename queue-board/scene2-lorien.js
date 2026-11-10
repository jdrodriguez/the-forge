// scene2-lorien.js: Lothlorien on the map from above (scene2.js), round plan.places.lorien where the Nimrodel runs
// into the Silverlode (whose course scene2-moria-east.js leaves in plan.silverlode) above the Anduin: the Golden Wood's
// mallorns, taller than any other tree on the map, on smooth silver trunks under broad crowns of gold leaves with
// silver undersides; grey-white flets among the boughs of some, with rope ladders down to the grass and soft lamps at
// night; the great mallorn of Caras Galadhon in the Naith south of the Silverlode; and the green floor beneath, starred
// with gold elanor and white niphredil. The kit (m2MoriaArt, m2MoriaThing, m2MoriaMark, m2MoriaGlows) is scene2-moria.js's.

// Gold leaves, outline to shine, a silver for their undersides; and the smooth silver bark, dark to light.
const M2_MALLORN_LEAF = ['#4a3008', '#8c6414', '#c49422', '#e6bc3c', '#f8da6a', '#fff4b4'];
const M2_MALLORN_SILVER = ['#a9ab8e', '#d6d8c4'];
const M2_MALLORN_BARK = ['#30343c', '#5a616c', '#7c838e', '#9ca3ac', '#bcc2c8'];
// A mallorn's crown of radius r: a broad main mass with many lobes round its rim and a few high ones, by seed.
// Returns near(px, py): the lobe a pixel falls in and how far into it, or null.
function m2MallornCrown(r, seed) {
  const R = r * 4;
  const lobes = [[R, R, R * 0.66]];
  const n = 8 + Math.floor(m2Hash(seed, 1, 127) * 3);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + m2Hash(seed, i, 128) * 0.5;
    const d = R * (0.56 + m2Hash(seed, i, 129) * 0.1);
    lobes.push([R + Math.cos(a) * d, R + Math.sin(a) * d * 0.84, R * (0.34 + m2Hash(seed, i, 130) * 0.1)]);
  }
  for (let i = 0; i < 3; i += 1) lobes.push([R * (0.62 + i * 0.3), R * (0.55 + m2Hash(seed, i, 131) * 0.2), R * 0.3]);
  return (px, py) => {
    let best = null;
    let bd = 9;
    for (const c of lobes) {
      const d = Math.hypot(px + 0.5 - c[0], py + 0.5 - c[1]) / c[2];
      if (d < bd) { bd = d; best = c; }
    }
    return bd <= 1 ? [best, bd] : null;
  };
}
// A mallorn's canvas (2r + 1 by 2r + tall + 1 units) as a pixel rule: its crown of radius r, gold lit from the upper
// left with leafy gaps and silver showing under its rim, over a smooth grey-silver trunk with tall units of it bare,
// shaded under the crown and flaring at its roots; with flet, a grey-white platform under the crown's edge and a rope
// ladder down beside the trunk.
function m2MallornRule(r, tall, flet, seed) {
  const near = m2MallornCrown(r, seed);
  const [W4, H4] = [(2 * r + 1) * 4, (2 * r + tall + 1) * 4];
  const mid = W4 / 2;
  const fy = Math.round(r * 7.3);
  const frx = r * 2.5;
  const fx = mid + (seed % 2 ? 3 : -3);
  const L = M2_MALLORN_LEAF;
  const B = M2_MALLORN_BARK;
  return (px, py) => {
    const hit = near(px - 2, py);
    if (hit) {
      const [cl, d] = hit;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !near(px - 2 + a, py + b))) return L[0];
      const [nx, ny] = [(px - 1.5 - cl[0]) / cl[2], (py + 0.5 - cl[1]) / cl[2]];
      const light = -(nx * 0.62 + ny * 0.78) - (py / (r * 8)) * 0.7 + 0.3;
      if (d > 0.84 && ny > 0) return m2Hash(px, py, seed + 120) < 0.45 ? M2_MALLORN_SILVER[0] : L[1];
      const s = m2Hash(px, py, seed + 121);
      let k = light > 0.8 ? 5 : light > 0.35 ? 4 : light > -0.1 ? 3 : light > -0.5 ? 2 : 1;
      if (m2Hash(px >> 1, py >> 1, seed + 124) < 0.07 && d > 0.45) k = Math.max(1, k - 1);
      else if (s < 0.07) k = Math.min(5, k + 1);
      if (k === 2 && m2Hash(px >> 1, py, seed + 122) < 0.2) return M2_MALLORN_SILVER[0];
      if (k >= 4 && s > 0.985) return M2_MALLORN_SILVER[1];
      return L[k];
    }
    if (flet) {
      const [dx, dy] = [(px + 0.5 - fx) / frx, (py + 0.5 - fy) / 2.6];
      if (dx * dx + dy * dy <= 1) return dy > 0.45 ? '#55594f' : dy < -0.3 ? '#dadcd2' : (px + 1) % 4 ? '#b4b8ac' : '#8e9286';
      if (py > fy + 2 && py < H4 - 2) {
        if (px === mid + 5 || px === mid + 7) return '#5e4426';
        if (px === mid + 6 && py % 3 === 0) return '#a88248';
      }
    }
    const top = r * 6;
    if (py < top) return null;
    const flare = py > H4 - 7 ? (py - (H4 - 7)) * 0.7 : 0;
    const dx = px + 0.5 - mid;
    if (Math.abs(dx) > 4 + flare) return null;
    if (Math.abs(dx) > 3 + flare || py === H4 - 1) return '#2a2c34';
    let k = dx < -1.5 ? 4 : dx < 0.5 ? 3 : dx < 2 ? 2 : 1;
    if (py < r * 8 + 6 && (py < r * 8 + 2 || (px + py) % 2)) k = Math.max(0, k - 2);
    if (flare && Math.abs(dx) > 3) k = 1;
    return B[m2Hash(px, py >> 2, seed + 123) < 0.07 ? Math.max(0, k - 1) : k];
  };
}
// Plants a mallorn with its foot at (x, y): its shadow, the tree in the depth order with its trunk's footprint, and a
// lamp on its flet at night.
function m2Mallorn(L, add, x, y, r, tall, flet, seed) {
  const [w, h] = [2 * r + 1, 2 * r + tall + 1];
  m2Shadow(L, x + r * 0.5, y - 0.6, r * 1.05, r * 0.5, 0.75);
  m2MoriaThing(add, `mallorn${r},${tall},${flet ? 1 : 0},${seed}`, x - w / 2, y - h + 0.5, w, h, y, m2MallornRule(r, tall, flet, seed), [x - 1.2, y - 0.8, x + 1.2, y + 0.4]);
  if (flet) add.light({ x: x + (seed % 2 ? 0.75 : -0.75), y: y - h + 0.5 + r * 1.83, r: 2.5, c: '#eef0dc' });
}

function m2Lorien(L, plan, season, add) {
  const P = plan.places;
  if (!P.lorien) return;
  const lo = m2LorienAt(plan);
  const { rx, ry } = lo;
  const fa = typeof M2_FORESTS !== 'undefined' && M2_FORESTS.find((f) => f[0] === 'fangorn');
  const [fx, fy, frx, fry] = fa && P.fangorn ? [P.fangorn.x, P.fangorn.y, fa[1] * plan.W * 0.6, fa[2] * plan.H * 0.6] : [0, 0, 0, 0];
  const M = P.mirrormere;
  const zE = plan.zones?.moriaEast;
  const wet = (u, v) => [M2_MAT.water, M2_MAT.sand].includes(m2MatAt(L, u, v));
  const clear = (u, v, m) => !(frx && ((u - fx) / frx) ** 2 + ((v - fy) / fry) ** 2 < 1) && !(M && Math.hypot((u - M.x) / 11, (v - M.y) / 5.5) < 1 + m / 24) && !(zE && u > zE.x0 - m && u < zE.x1 + m && v > zE.y0 - m && v < zE.y1 + m);
  const inWood = (u, v) => ((u - lo.x) / rx) ** 2 + ((v - lo.y) / ry) ** 2 <= 1 + (m2Noise(u, v, 4, 124) - 0.5) * 0.5;
  // The Nimrodel from the north-west into the Silverlode, kept clear of Mirrormere.
  const sl = plan.silverlode ?? [];
  if (sl.length) {
    const join = sl.reduce((b, p) => (Math.hypot(p[0] - lo.x + 6, p[1] - lo.y) < Math.hypot(b[0] - lo.x + 6, b[1] - lo.y) ? p : b), sl[0]);
    const pts = [[lo.x - 7, lo.y - ry - 6], [lo.x - 6, lo.y - 9], [join[0], join[1]]].map(([u, v]) => (M && Math.abs(v - M.y) < 8 ? [Math.max(u, M.x + 13), v] : [u, v]));
    m2River(L, pts, 0.6, 0.85, 9);
  }
  // The green floor, starred with elanor and niphredil.
  m2MoriaMark(L, lo.x - rx - 3, lo.y - ry - 3, lo.x + rx + 3, lo.y + ry + 3, M2_MAT.elf, (u, v) => inWood(u, v) && !wet(u, v) && clear(u, v, 0) && m2MatAt(L, u, v) !== M2_MAT.road);
  m2Flowers(L, lo.x - rx, lo.y - ry, rx * 2, ry * 2, 60, ['#ffd84a', '#ffffff', '#ffe27a'], [M2_MAT.elf], 125);
  // The trees: the great mallorn of Caras Galadhon first, south of the Silverlode, then the wood round it.
  const trees = [];
  // A crown must not hide Mirrormere's water or the East-gate's face behind it.
  const E = P.moriaEast;
  const keep = [M && [M.x - 10, M.y - 4.5, M.x + 10, M.y + 1.5], E && [E.x - 14, E.y - 19, E.x + 14, E.y + 4]].filter(Boolean);
  const hides = (x, y, r) => keep.some(([a, b, c, d]) => x + r > a && x - r < c && y > b && y - 2 * r - 4 < d);
  const ok = (x, y, r) => inWood(x, y) && clear(x, y, r) && !hides(x, y, r) && [[0, 0], [-r * 0.8, 0], [r * 0.8, 0], [0, -1.2]].every(([a, b]) => !wet(x + a, y + b)) && !trees.some((t) => Math.hypot(t.x - x, (t.y - y) * 1.5) < (t.r + r) * 0.44);
  const plant = (x, y, r, tall, flet, seed) => { trees.push({ x, y, r }); m2Mallorn(L, add, x, y, r, tall, flet, seed); };
  for (const [dx, dy] of [[2, 8], [-2, 8], [5, 6], [0, 5], [-4, 4]]) {
    if (ok(lo.x + dx, lo.y + dy, 10)) { plant(lo.x + dx, lo.y + dy, 10, 4, true, 1); break; }
  }
  let nflet = 0;
  // The wood itself, crowded: big mallorns first, then younger ones filling the gaps between them.
  for (let i = 0; i < 900 && trees.length < 44; i += 1) {
    const [u, v] = [lo.x + (m2Hash(i, 1, 126) - 0.5) * rx * 2, lo.y + (m2Hash(i, 2, 126) - 0.5) * ry * 2];
    const r = i < 400 ? 5 + Math.floor(m2Hash(i, 3, 126) * 2.6) : 4;
    if (!ok(u, v, r)) continue;
    const flet = nflet < 7 && r > 4 && m2Hash(i, 4, 126) < 0.4;
    if (flet) nflet += 1;
    plant(u, v, r, 2 + Math.floor(m2Hash(i, 5, 126) * 3), flet, 2 + (i % 5));
  }
  // Low gold-green undergrowth among the trunks along the wood's southern edge.
  for (const t of trees) {
    for (const k of [0, 1]) {
      const [u, v] = [t.x + (m2Hash(t.x | 0, k, 132) - 0.5) * t.r * 1.6, t.y + 0.8 + m2Hash(t.y | 0, k, 133) * 1.6];
      if (wet(u, v) || !inWood(u, v) || hides(u, v, 1)) continue;
      const seed = (k + (t.x | 0)) % 4;
      m2MoriaThing(add, `lorienFern${seed}`, u - 2, v - 2.5, 4, 2.75, v, (px, py) => {
        const [nx, ny] = [(px + 0.5 - 8) / 8, (py + 0.5 - 7) / 7];
        const jag = (m2Hash(px >> 1, seed, 134) - 0.5) * 0.4;
        if (nx * nx + ny * ny > 1 + jag || py > 10) return null;
        const lit = -nx * 0.6 - ny * 0.8 + (m2Hash(px, py, seed + 135) - 0.5) * 0.6;
        return ['#3e4a14', '#647022', '#8e9432', '#c2b04a', '#e8d878'][lit > 0.8 ? 4 : lit > 0.3 ? 3 : lit > -0.2 ? 2 : lit > -0.7 ? 1 : 0];
      });
    }
  }
  plan.lorienTrees = trees;
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  m2Lorien(L, plan, season, add);
  m2.cost_lorien = performance.now() - t0;
});
