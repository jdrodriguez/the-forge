// scene2-shire-mill.js: the Mill on the Water and Bywater's pool, on the map from above. The Water runs in from the
// Shire's west edge between sandy banks, swings up under the mill's east end, and widens into Bywater pool, ringed with
// reeds and lily pads with three ducks paddling round it, before it runs on east to the Brandywine. The mill is an old
// house of coursed stone under a deep thatch, its door and two square windows in its south wall and sacks of flour by
// the door; on its east end its great undershot wheel stands in the stream, turning, its paddles dipping into the
// current and throwing up spray. The wheel's six frames are painted once; the river's glints come from scene2-fx.js.

const M2_SHIRE_WHEEL = [];
// The wheel, r units in radius, at frame k of 6: a rim of oak, eight spokes and eight paddles, an iron hub.
function m2ShireWheelArt(r, k) {
  if (M2_SHIRE_WHEEL[k]?.r === r) return M2_SHIRE_WHEEL[k].c;
  const { c, g } = m2Canvas(r * 2 + 2, r * 2 + 2);
  const R = r * 4 + 4;
  const W = M2_PAL.wood;
  const turn = (k / 6) * (Math.PI / 4);
  m2Raster(g, 0, 0, R * 2, R * 2, (px, py) => {
    const [dx, dy] = [px + 0.5 - R, py + 0.5 - R];
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) - turn;
    const seg = ((a % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4);
    const lit = dx + dy < 0;
    if (d > R) return null;
    // The paddles stick out past the rim, square-ended boards lit along their leading edge.
    if (d > R - 5) return seg < 0.26 ? W[d > R - 1 || seg > 0.22 ? 0 : seg < 0.07 ? 5 : lit ? 4 : 3] : null;
    if (d > R - 9) return d > R - 6 || d < R - 8 ? W[0] : W[lit ? 4 : 2];
    if (d < 4) return d < 2.5 ? (d < 1.2 ? '#8a8692' : '#4a4652') : '#2a2420';
    const sp = ((a + Math.PI / 8) % (Math.PI / 4) + Math.PI / 4) % (Math.PI / 4);
    return sp < 0.14 ? W[0] : sp < 0.3 ? W[lit ? 4 : 3] : null;
  });
  M2_SHIRE_WHEEL[k] = { r, c };
  return c;
}

// The Water across the realm r with its mill: the mill's foot on row mz from x mx (mw wide), the pool at (px, py).
// Paints the stream and pool and returns the stream's line.
function m2ShireWater(L, add, r, mx, mw, mz, pool) {
  const wx = mx + mw - 5;
  const ys = (x) => {
    if (x < wx - 12) return mz + 11 + Math.sin(x / 9) * 1.5;
    if (x < wx - 4) { const t = (x - wx + 12) / 8; return mz + 11 + Math.sin((wx - 12) / 9) * 1.5 + (4.5 - 11 - Math.sin((wx - 12) / 9) * 1.5) * (t * t * (3 - 2 * t)); }
    if (x < wx + 5) return mz + 4.5;
    const t = Math.min(1, (x - wx - 5) / Math.max(6, pool.x - wx - 5));
    return mz + 4.5 + (pool.y - mz - 4.5) * t * t * (3 - 2 * t) + Math.sin(x / 7) * (1 - Math.abs(t * 2 - 1)) * 1.2;
  };
  const line = (x) => (x > pool.x ? pool.y + (x - pool.x) * 0.06 : ys(x));
  const pts = [];
  for (let x = r.x - 4; x <= r.x + r.w + 6; x += 5) pts.push([x, line(x)]);
  // The stream runs east and west, so it is painted a column of pixels at a time: water near its line, sand beyond.
  const wet = (m) => m === M2_MAT.water;
  const land = new Set(M2_LAND_MATS);
  const [p0, p1] = [Math.max(0, Math.floor((r.x - 4) * 4)), Math.min(L.pw, Math.ceil((r.x + r.w + 6) * 4))];
  for (let px = p0; px < p1; px += 1) {
    const x = px / 4;
    const cy = line(x);
    const t = (x - r.x + 4) / (r.w + 10);
    const [hw, hs] = [2.3 + t * 0.6, 3.6 + t * 0.6];
    for (let py = Math.max(0, Math.floor((cy - hs) * 4)); py < Math.min(L.ph, Math.ceil((cy + hs) * 4)); py += 1) {
      const i = py * L.pw + px;
      const d = Math.abs(py / 4 - cy);
      if (d < hw) { L.mat[i] = M2_MAT.water; L.under[i] = M2_MAT.water; L.aux[i] = Math.min(255, (d / hw) * 255); }
      else if (!wet(L.mat[i]) && land.has(L.mat[i])) { L.mat[i] = M2_MAT.sand; L.under[i] = M2_MAT.sand; L.aux[i] = 0; }
    }
  }
  m2Blob(L, pool.x, pool.y, pool.rx + 2, pool.ry + 1.6, M2_MAT.sand, { wob: 1.5, seed: 31, keep: M2_MAT.water });
  m2Blob(L, pool.x, pool.y, pool.rx, pool.ry, M2_MAT.water, { wob: 1.4, seed: 32, aux: (x, y) => Math.hypot(x, y) * 235 });
  // Reeds round the pool's rim and lily pads on it.
  L.decals.push((g) => {
    for (let i = 0; i < 26; i += 1) {
      const a = m2Hash(i, 1, 33) * Math.PI * 2;
      const [qx, qy] = [pool.x + Math.cos(a) * (pool.rx + 0.5), pool.y + Math.sin(a) * (pool.ry + 0.4)];
      for (let j = 0; j < 3; j += 1) pxBox(g, Math.round((qx + j * 0.5) * 4) / 4, Math.round((qy - 1.5 + (j % 2) * 0.5) * 4) / 4, 0.25, 1.5, j === 1 ? '#8cae4a' : '#4f7a2c');
      if (i % 3 === 0) pxBox(g, Math.round(qx * 4) / 4, Math.round((qy - 2) * 4) / 4, 0.5, 0.75, '#6a4422');
    }
    for (let i = 0; i < 9; i += 1) {
      const [qx, qy] = [pool.x + (m2Hash(i, 2, 34) - 0.5) * pool.rx * 1.4, pool.y + (m2Hash(i, 3, 34) - 0.5) * pool.ry * 1.2];
      pxBox(g, Math.round(qx * 4) / 4, Math.round(qy * 4) / 4, 1.25, 0.75, '#3f7a2c');
      pxBox(g, Math.round(qx * 4) / 4, Math.round(qy * 4) / 4, 0.5, 0.25, '#7ab84a');
      if (i % 3 === 0) pxBox(g, Math.round(qx * 4) / 4 + 0.75, Math.round(qy * 4) / 4 - 0.25, 0.5, 0.5, '#f7c6d8');
    }
  });
  // The ducks, paddling slow rings round the pool.
  const ducks = (g, tick, reduced) => {
    for (let i = 0; i < 3; i += 1) {
      const a = (reduced ? 0 : tick / 900) * (i % 2 ? -1 : 1) + i * 2.1;
      const [dx, dy] = [Math.round((pool.x + Math.cos(a) * pool.rx * (0.45 + i * 0.12)) * 4) / 4, Math.round((pool.y + Math.sin(a) * pool.ry * (0.4 + i * 0.1)) * 4) / 4];
      const left = Math.sin(a) * (i % 2 ? -1 : 1) > 0;
      pxBox(g, dx - 1.25, dy + 0.25, 2.5, 0.25, '#a6dbe4');
      pxBox(g, dx - 1, dy - 0.75, 2, 1, i ? '#8a6a4a' : '#f4f1ea');
      pxBox(g, dx - 1, dy - 0.75, 2, 0.25, i ? '#a8885e' : '#ffffff');
      pxBox(g, dx + (left ? -1.25 : 0.5), dy - 1.5, 0.75, 0.75, i ? '#2f6a34' : '#f4f1ea');
      pxBox(g, dx + (left ? -1.75 : 1.25), dy - 1.25, 0.5, 0.25, '#e8902c');
    }
  };
  ducks.under = true;
  add.anim(ducks);
  return pts;
}

// The mill, mw units wide with its foot on row mz from x mx, and its wheel in the stream at its east end. Returns the
// spot where a hobbit takes in the grain at its door.
function m2ShireMill(L, add, mx, mw, mz) {
  const roofH = 9.25;
  const wallH = 7.5;
  const panes = [];
  m2Shadow(L, mx + mw / 2 + 2, mz, mw / 2 + 2, 2.5, 0.8);
  const o = m2Thing(add, mx, mz - roofH - wallH + 0.5, mw, roofH + wallH, mz, (g) => {
    m2Wall(g, 0.5, roofH - 0.5, mw - 1, wallH, M2_PAL.stone, 'stone');
    m2Roof(g, 0, 0, mw, 2.25, 6.5, M2_PAL.thatch, 2);
    pxBox(g, 3, roofH + 1.5, 4, wallH - 2, M2_PAL.wood[1]);
    pxBox(g, 3.25, roofH + 1.75, 3.5, wallH - 2.25, M2_PAL.wood[3]);
    pxBox(g, 3.25, roofH + 1.75, 0.5, wallH - 2.25, M2_PAL.wood[4]);
    pxBox(g, 6, roofH + 4, 0.5, 0.5, M2_PAL.gold[2]);
    for (const wx of [9, mw - 9]) panes.push(m2Window(g, wx, roofH + 1.5, 3, 3, M2_PAL.wood, 'square'));
    // Sacks of flour by the door.
    for (const [sx, sy] of [[0.5, roofH + wallH - 3], [1.75, roofH + wallH - 2.25]]) { pxBox(g, sx, sy, 2, 2.25, '#c8bca0'); pxBox(g, sx, sy, 1.25, 1.75, '#ece4d0'); pxBox(g, sx + 0.5, sy - 0.25, 1, 0.5, '#a89878'); }
  });
  o.foot = [mx, mz - 9, mx + mw, mz];
  for (const p of panes) add.light({ pane: { ...p, x: mx + p.x, y: o.y + p.y } });
  add.light({ x: mx + 5, y: mz - 3, r: 6, c: '#ffc56a' });
  // The wheel, turning, and the spray it throws up where its paddles meet the water.
  const wr = 6;
  const [wx, wy] = [mx + mw - 5 - wr - 1, mz + 5.5 - wr * 2 - 1.5];
  const wheel = (g, tick, reduced) => {
    g.drawImage(m2ShireWheelArt(wr, reduced ? 0 : Math.floor(tick / 3) % 6), wx, wy, wr * 2 + 2, wr * 2 + 2);
    for (let i = 0; i < 6; i += 1) {
      const t = ((reduced ? i * 3 : tick) + i * 5) % 14;
      g.globalAlpha = 0.85 - t / 18;
      pxBox(g, Math.round((wx + wr + 1 + (i - 2.5) * 1.6 + t * 0.12) * 4) / 4, Math.round((mz + 4.5 - t * 0.25 + (t * t) / 70) * 4) / 4, 0.5, 0.5, '#f4fbfc');
    }
    g.globalAlpha = 1;
  };
  wheel.item = true;
  wheel.z = mz + 3;
  add.anim(wheel);
  return { x: Math.round(mx + 5), y: mz + 3.5, face: 'up', job: 'mill' };
}
