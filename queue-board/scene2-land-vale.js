// scene2-land-vale.js: the Anduin's vale and the Long Lake on the map from above (scene2.js), at the places
// scene2-core-places.js gives them. The Carrock stands in the Anduin as a great rock island, the river opening into a
// pool round it, with steps cut up its south face to a flat grassy top and a ford of stepping stones over the shallows to
// the east bank, where a path leads to Beorn's gate. Beorn's homestead (scene2-land-vale-beorn.js), Rhosgobel
// (scene2-land-vale-wild.js), and Dale and Lake-town (scene2-land-lake.js) are composed here too. While this file is
// loaded, scene2-places.js leaves out its stand-ins for Beorn's hall, Radagast's hut and Dale's cottages.

// Every canvas this part paints, by its key (what it is, its size, the season), so a relayout paints nothing twice.
const m2ValeArt = new Map();
function m2ValeCanvas(key, w, h, paint) {
  if (!m2ValeArt.has(key)) {
    const { c, g } = m2Canvas(w, h);
    paint(g);
    m2ValeArt.set(key, c);
  }
  return m2ValeArt.get(key);
}
// A standing thing w by h units at (x, y) from a cached canvas, sorted by z, blocking walkers on foot when given.
function m2ValeThing(add, key, x, y, w, h, z, paint, foot) {
  const c = m2ValeCanvas(key, w, h, paint);
  const [qx, qy] = [Math.round(x * 4) / 4, Math.round(y * 4) / 4];
  const o = { x: qx, y: qy, w, h, z, c, draw: (g) => g.drawImage(c, qx, qy, w, h) };
  if (foot) o.foot = foot;
  add.obj(o);
  return o;
}
// Where a river's line (after its build, so its bends) crosses row y: the x of its first crossing, or null.
function m2ValeRiverX(pts, y) {
  for (let k = 0; k < (pts?.length ?? 0) - 1; k += 1) {
    const [[ax, ay], [bx, by]] = [pts[k], pts[k + 1]];
    if ((ay - y) * (by - y) <= 0 && ay !== by) return ax + ((bx - ax) * (y - ay)) / (by - ay);
  }
  return null;
}
// Turns the dark forest floor (and only it) back to open ground inside a box, for a clearing.
function m2ValeClear(L, x0, y0, x1, y1, m = M2_MAT.wild) {
  for (let py = Math.max(0, Math.round(y0 * 4)); py < Math.min(L.ph, Math.round(y1 * 4)); py += 1) {
    for (let px = Math.max(0, Math.round(x0 * 4)); px < Math.min(L.pw, Math.round(x1 * 4)); px += 1) {
      const i = py * L.pw + px;
      const edge = Math.min(px - x0 * 4, x1 * 4 - px, py - y0 * 4, y1 * 4 - py) / 4;
      if (L.mat[i] === M2_MAT.forest && edge > m2Noise(px / 4, py / 4, 3, 77) * 5) { L.mat[i] = m; L.under[i] = m; }
    }
  }
}

// The Carrock: the pool the Anduin widens into, the rock on its island, and the ford east of it.
function m2Carrock(L, plan, add) {
  const c = plan.places.carrock;
  if (!c) return;
  const x = m2ValeRiverX(plan.rivers.anduin, c.y) ?? c.x;
  const y = c.y;
  m2Blob(L, x, y, 13, 9, M2_MAT.sand, { wob: 1.5, seed: 41, keep: M2_MAT.water });
  m2Blob(L, x, y, 10.5, 7, M2_MAT.water, { wob: 1.2, seed: 42, aux: (nx, ny) => 90 + Math.hypot(nx, ny) * 150 });
  // The ford: shallows over a gravel bar from the island to the east bank, with flat stones to step on.
  m2Stroke(L, [[x + 4, y + 2.5], [x + 12, y + 3]], 1.8, M2_MAT.water, { aux: () => 222 });
  const stones = [[5.5, 2.4], [7.6, 3], [9.7, 2.6], [11.6, 3.1]];
  L.decals.push((g) => {
    for (const [dx, dy] of stones) {
      const [sx, sy] = [Math.round((x + dx) * 4) / 4, Math.round((y + dy) * 4) / 4];
      pxBox(g, sx - 0.75, sy + 0.25, 1.75, 0.5, '#2a3c4c');
      pxBox(g, sx - 0.75, sy - 0.5, 1.5, 0.75, '#8c8780');
      pxBox(g, sx - 0.5, sy - 0.5, 0.75, 0.25, '#bab4a8');
      pxBox(g, sx - 1, sy + 0.5, 0.5, 0.25, '#d8f2f6');
      pxBox(g, sx + 0.75, sy - 0.25, 0.5, 0.25, '#d8f2f6');
    }
    // Foam where the water breaks round the island's foot.
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * Math.PI * 2;
      if (m2Hash(i, 3, 43) < 0.3) continue;
      pxBox(g, Math.round((x + Math.cos(a) * 6.6) * 4) / 4, Math.round((y + 0.6 + Math.sin(a) * 2.6) * 4) / 4, 0.5 + (i % 2) * 0.25, 0.25, i % 3 ? '#e8f6f8' : '#a6dbe4');
    }
  });
  m2Path(L, [[x + 13.5, y + 3], [x + 18, y + 6]], 1.6);
  plan.places.carrockFord = { x: x + 13.5, y: y + 3 };
  m2Shadow(L, x + 3, y + 1.2, 6.5, 2.2, 0.8);
  m2ValeThing(add, 'carrock', x - 6.5, y - 13, 13, 15, y + 2, m2CarrockPaint, [x - 6, y - 2, x + 6, y + 2.5]);
}
// The rock: sheer craggy faces in strata, lit on the west, ledges with moss, a flat grassy top ringed with pale stone,
// and the steps cut up its south face in two flights, from the water on the east to the lip of the top.
function m2CarrockPaint(g) {
  const R = ['#221e1e', '#3c3532', '#574e48', '#736860', '#94897c', '#b8ad9c'];
  const G = ['#2e4a24', '#3e6230', '#507a3a', '#6a9446', '#86ae58'];
  const [W, Hp] = [52, 60];
  const rim = (a) => 1 + (m2Noise(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 0.9, 48) - 0.5) * 0.35;
  const onTop = (px, py) => {
    const [nx, ny] = [(px + 0.5 - 26) / 20, (py + 0.5 - 13) / 8.5];
    return Math.hypot(nx, ny) / rim(Math.atan2(ny, nx));
  };
  const half = (py) => 20 + ((py - 13) / 37) * 4 + (m2Noise(py / 4, 1, 1.2, 49) - 0.5) * 4;
  const steps = new Map();
  // Flight one climbs west from the water's edge, the landing, flight two climbs back east to the top's lip.
  for (let i = 0; i < 9; i += 1) steps.set(`${40 - i * 1.5 | 0},${55 - i * 2}`, 1);
  for (let i = 0; i < 8; i += 1) steps.set(`${27 + i * 1.5 | 0},${37 - i * 2}`, 1);
  const tread = (px, py) => {
    for (const [k] of steps) {
      const [sx, sy] = k.split(',').map(Number);
      if (px >= sx && px < sx + 5 && py >= sy && py < sy + 2) return py === sy ? 2 : 1;
    }
    return 0;
  };
  m2Raster(g, 0, 0, W, Hp, (px, py) => {
    const t = onTop(px, py);
    const h = half(py);
    const dx = px + 0.5 - 26;
    const bottom = 50 + Math.round(Math.sqrt(Math.max(0, 1 - (dx / 25) ** 2)) * 7);
    const body = py >= 13 && py <= bottom && Math.abs(dx) <= h;
    if (t > 1 && !body) return null;
    if (t <= 1) {
      if (t > 0.8) return t > 0.93 ? R[1] : R[px < 26 ? 5 : 4];
      const lit = dx / 20 + (py - 13) / 8.5;
      return G[Math.max(0, Math.min(4, Math.floor(3 - lit * 1.1 + M2_BAYER[(py & 3) * 4 + (px & 3)] * 1.2 + (m2Hash(px >> 1, py >> 1, 44) < 0.12 ? -1 : 0))))];
    }
    if (Math.abs(dx) > h - 1 || py === bottom) return R[0];
    const st = tread(px, py);
    if (st) return st === 2 ? R[5] : R[1];
    if (tread(px, py - 1) === 1) return R[0];
    const nx = dx / h;
    let k = nx < -0.6 ? 5 : nx < -0.15 ? 4 : nx < 0.4 ? 3 : nx < 0.75 ? 2 : 1;
    const ledge = (py + Math.floor(m2Hash(px >> 3, 1, 45) * 4)) % 9;
    if (ledge === 0) return m2Hash(px, py, 50) < 0.35 ? G[2] : R[Math.min(5, k + 1)];
    if (ledge === 1) k -= 1;
    if (m2Hash(px >> 1, 2, 46) < 0.14 && py > 18) k -= 1;
    if (py > bottom - 5) k -= 1;
    if (py > bottom - 3 && m2Hash(px, py, 47) < 0.45) return '#24423a';
    return R[Math.max(0, Math.min(5, k))];
  });
  // A few stones and Beorn's flat seat-stone on the top.
  for (const [sx, sy] of [[4, 2.25], [8.5, 1.75], [6.25, 4]]) { pxBox(g, sx, sy, 0.75, 0.5, R[4]); pxBox(g, sx, sy + 0.5, 0.75, 0.25, R[1]); }
}

function m2LandVale(L, plan, season, add) {
  m2Carrock(L, plan, add);
  if (typeof m2Beorn === 'function') m2Beorn(L, plan, season, add);
  if (typeof m2Rhosgobel === 'function') m2Rhosgobel(L, plan, season, add);
  if (typeof m2Dale === 'function') m2Dale(L, plan, season, add);
  if (typeof m2LakeTown === 'function') m2LakeTown(L, plan, season, add);
}
m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  m2LandVale(L, plan, season, add);
  m2.valeMs = performance.now() - t0;
});
