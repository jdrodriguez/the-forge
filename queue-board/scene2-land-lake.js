// scene2-land-lake.js: Dale and Lake-town on the map from above (scene2.js), called by scene2-land-vale.js. Dale fills the
// valley under Erebor's realm (which another file draws): stone houses with red tile and grey slate roofs either side of
// the River Running, a market square before a bell tower with its bell in an open belfry, a stone bridge over the river,
// and a town wall along the south with round towers at its corners and a gate where the road goes down to the Long Lake.
// Esgaroth, Lake-town, stands out on the lake (painted by the world) on a deck of planks over piles: wooden houses under
// steep shingled roofs round the Master's hall with its banner, boats moored at the deck's edge and one out rowing, and a
// long wooden bridge to the west shore, lamps along it lit at night with their light trembling on the water.

const M2_RED = ['#3a1410', '#5e2218', '#843222', '#a8442c', '#c8603e', '#e48a62'];
const M2_SLATE = ['#1a1e26', '#2a303c', '#3c4452', '#505a6a', '#6a7686', '#8c98a8'];
const M2_SHINGLE = ['#22160e', '#3a2616', '#563a20', '#74502c', '#94683a', '#b48850'];

// A town house w units wide in the given roof and wall, painted once: a hipped roof, a wall with a door and a window.
function m2TownHouse(add, L, x, z, w, roof, wall, kind, season, lights = true) {
  const [near, wh] = [Math.round(w * 0.42), Math.max(3, Math.round(w * 0.55))];
  const h = 2 + near + 1 + wh;
  const snow = season === 'winter';
  const key = `house${w},${roof[2]},${wall[2]},${kind},${snow}`;
  m2Shadow(L, x + 2, z + 0.3, w / 2 + 1.5, 1.6, 0.8);
  m2ValeThing(add, key, x - w / 2, z - h, w, h, z, (g) => {
    m2Roof(g, 0, 0, w, 2, near, snow ? roof.map((c, i) => (i > 1 ? hdMix(c, '#eef4f8', 0.6) : c)) : roof, Math.min(2, w / 6));
    m2Wall(g, 0.5, 3 + near, w - 1, wh, wall, kind);
    pxBox(g, w * 0.25, h - wh * 0.62, 2, wh * 0.62, M2_PAL.wood[1]);
    pxBox(g, w * 0.25, h - wh * 0.62, 0.5, wh * 0.62, M2_PAL.wood[3]);
    m2Window(g, w * 0.62, 3 + near + 1.5, 2.5, 2.5, wall, 'square');
    pxBox(g, w * 0.7, 0.5, 1.5, 2.5, M2_PAL.stone[2]);
    pxBox(g, w * 0.7, 0.5, 1.5, 0.5, M2_PAL.stone[4]);
  }, [x - w / 2, z - near * 0.6, x + w / 2, z]);
  if (lights) add.light({ pane: { x: Math.round((x - w / 2 + w * 0.62) * 4) / 4, y: Math.round((z - h + 3 + near + 1.5) * 4) / 4, w: 2.5, h: 2.5, kind: 'square' } });
  return { h, chimney: [x - w / 2 + w * 0.7 + 0.75, z - h] };
}

function m2Dale(L, plan, season, add) {
  const D = plan.places.dale;
  if (!D) return;
  const ere = plan.realms.find((r) => r.kind === 'dwarf');
  const top = Math.max(D.y - 14, ere ? ere.y + ere.h + 2 : -99);
  const cx = Math.round(D.x);
  const rvx = cx + 9;
  // The lake's north shore below the town: the town wall stands above it, the back row's roofs may lean over the realm.
  const lake = plan.places.longLake;
  const lx = lake.x - 4;
  let ly = top + 8;
  while (ly < plan.H - 1 && m2MatAt(L, lx, ly) !== M2_MAT.water && m2MatAt(L, cx, ly + 2) !== M2_MAT.water) ly += 1;
  const wallZ = Math.round(Math.min(top + 28, ly - 4));
  const [y0, y1] = [wallZ - 19, wallZ - 6];
  // The River Running, from Erebor's realm down through the town to the Long Lake's north shore.
  let wy = ly;
  while (wy < plan.H - 1 && m2MatAt(L, lx, wy) !== M2_MAT.water) wy += 1;
  const run = [[rvx, top - 1], [rvx, y0 + 6], [rvx + 2, wallZ], [(rvx + 2 + lx) / 2, (wallZ + wy) / 2 + 1], [lx, wy + 2]];
  m2Stroke(L, run, 3.4, M2_MAT.sand, { over: M2_LAND_MATS });
  m2Stroke(L, run, 2.1, M2_MAT.water);
  plan.rivers.running = run;
  // The town's ground: paved streets and the market square, the road down to the lake through the south gate.
  m2Blob(L, cx - 2, (y0 + wallZ) / 2, 31, (wallZ - y0) / 2 + 6, M2_MAT.man, { wob: 3, seed: 71, keep: M2_MAT.water });
  m2Path(L, [[cx - 3, top - 4], [cx - 3, wallZ + 3]], 2.4, M2_MAT.road);
  m2Path(L, [[cx - 30, y0 + 6], [rvx - 3, y0 + 6]], 1.8, M2_MAT.road);
  m2Path(L, [[rvx + 3, y0 + 6], [cx + 30, y0 + 6]], 1.8, M2_MAT.road);
  m2Rect(L, cx - 9, y0 + 3, 13, y1 - y0 - 3, M2_MAT.plaza);
  m2Stroke(L, [[rvx - 4.5, y0 + 6], [rvx + 4.5, y0 + 6]], 2.4, M2_MAT.terrace, { aux: () => 60 });
  m2Parapets(add, rvx - 4.5, y0 + 6, rvx + 4.5, y0 + 6, 2);
  plan.places.daleGate = { x: cx - 3, y: wallZ + 1 };
  // The houses, back row first.
  const houses = [[-26, y0, 13, M2_RED], [-13, y0 - 1, 12, M2_SLATE], [17, y0 - 1, 12, M2_RED], [28, y0 + 1, 11, M2_SLATE],
    [-27, y1, 12, M2_SLATE], [-15, y1 + 1, 12, M2_RED], [19, y1, 13, M2_SLATE], [30, y1 + 2, 9, M2_RED]];
  for (const [dx, z, w, roof] of houses) {
    const hs = m2TownHouse(add, L, cx + dx, z, w, roof, M2_PAL.stone, 'stone', season);
    if (dx === -13 || dx === 17 || dx === -27) m2Smoke(add, hs.chimney[0], hs.chimney[1], dx + 40);
  }
  // The bell tower on the square's north side, and a well in the square.
  m2Shadow(L, cx + 1.5, y0 + 3, 5, 1.6, 0.8);
  m2ValeThing(add, `daleTower,${season}`, cx - 4.5, y0 - 30, 9, 33.25, y0 + 3, (g) => m2DaleTower(g, season), [cx - 4, y0, cx + 4, y0 + 3]);
  add.light({ x: cx, y: y0 - 18, r: 4, c: '#ffc56a' });
  m2ValeThing(add, 'daleWell', cx - 8, y1 - 3, 4, 4, y1 + 1, m2DaleWell, [cx - 8, y1, cx - 4, y1 + 1]);
  m2DaleWalls(L, add, cx, wallZ, rvx);
  // Lamps by the gate, on the bridge and in the square at night.
  for (const [lx, ly] of [[cx - 7, wallZ - 9], [cx + 1, wallZ - 9], [rvx, y0 + 3], [cx - 1, y1 - 1]]) add.light({ x: lx, y: ly, r: 5, c: '#ffc56a', fire: true });
}
// The bell tower, 9 by 33 units: courses of stone, an open belfry with the bronze bell, a slate pyramid with a vane.
function m2DaleTower(g, season) {
  const S = M2_PAL.stone;
  m2Wall(g, 1, 10, 7, 23, S, 'stone');
  pxBox(g, 1, 10, 7, 0.75, S[5]);
  pxBox(g, 2, 11.5, 5, 5.5, '#141218');
  for (const bx of [1, 4, 7]) pxBox(g, bx, 11, 1, 6, S[bx < 2 ? 4 : 2]);
  m2Raster(g, 2.5, 12, 16, 14, (px, py) => {
    const half = 2 + py * 0.42;
    if (Math.abs(px + 0.5 - 8) > half) return null;
    return py > 11 ? '#6a4a1a' : px < 7 ? '#e8b850' : px < 10 ? '#c08a30' : '#8a5a20';
  });
  pxBox(g, 4.25, 16.25, 0.5, 0.5, '#3a2a10');
  pxBox(g, 0.5, 17, 8, 1, S[4]);
  pxBox(g, 0.5, 17.75, 8, 0.25, S[1]);
  m2Window(g, 3.5, 21, 2, 3, S, 'arch');
  pxBox(g, 3.25, 28.5, 2.5, 4.5, M2_PAL.wood[1]);
  const R = season === 'winter' ? M2_SLATE.map((c, i) => (i > 1 ? hdMix(c, '#eef4f8', 0.6) : c)) : M2_SLATE;
  m2Raster(g, 0, 2, 36, 32, (px, py) => {
    const half = 2 + py * 0.56;
    if (Math.abs(px + 0.5 - 18) > half) return null;
    if (py === 31 || Math.abs(px + 0.5 - 18) > half - 1) return R[0];
    return R[(px < 18 ? 4 : 2) + (py % 5 === 0 ? -1 : 0)];
  });
  pxBox(g, 4.25, 0, 0.5, 2.5, '#2a2a30');
  pxBox(g, 4.5, 0.25, 1.5, 0.75, M2_PAL.gold[2]);
}
// The well: a ring of stones with a little roof over its windlass.
function m2DaleWell(g) {
  const S = M2_PAL.stone;
  pxBox(g, 0.25, 2.25, 3.5, 1.5, S[3]);
  pxBox(g, 0.25, 2.25, 3.5, 0.5, S[5]);
  pxBox(g, 1, 2.5, 2, 0.5, '#1a2a3a');
  pxBox(g, 0.5, 0.75, 0.5, 1.75, M2_PAL.wood[2]);
  pxBox(g, 3, 0.75, 0.5, 1.75, M2_PAL.wood[2]);
  pxBox(g, 0, 0, 4, 1, M2_RED[3]);
  pxBox(g, 0, 0, 4, 0.25, M2_RED[5]);
}
// The town wall along the south, broken by the gate and by the river's water-gate, with a round tower at each end.
function m2DaleWalls(L, add, cx, z, rvx) {
  const S = M2_PAL.stone;
  const piece = (x0, x1) => {
    if (x1 - x0 < 1) return;
    const w = Math.round(x1 - x0);
    m2Shadow(L, (x0 + x1) / 2 + 1, z + 0.4, w / 2 + 1, 1.4, 0.7);
    m2ValeThing(add, `daleWall${w}`, x0, z - 6, w, 6.25, z, (g) => {
      m2Wall(g, 0, 1.5, w, 4.75, S, 'stone');
      m2Raster(g, 0, 0, w * 4, 7, (px, py) => (px % 8 < 5 ? (py < 2 ? S[5] : py === 6 ? S[1] : S[4]) : py > 4 ? S[3] : null));
    }, [x0, z - 2, x1, z]);
  };
  piece(cx - 32, cx - 6);
  piece(cx, rvx - 4);
  piece(rvx + 4, cx + 32);
  for (const tx of [cx - 34, cx - 7, cx + 1, cx + 34]) {
    const big = tx === cx - 34 || tx === cx + 34;
    const r = big ? 3.5 : 2.5;
    m2Shadow(L, tx + 1.5, z + 0.5, r + 1, 1.4, 0.7);
    m2ValeThing(add, `daleTowerR${r}`, tx - r, z - (big ? 11 : 9), r * 2, big ? 11.5 : 9.5, z + 0.5, (g) => {
      m2Raster(g, 0, 0, r * 8, (big ? 11.5 : 9.5) * 4, (px, py) => {
        const nx = (px + 0.5 - r * 4) / (r * 4);
        if (py < 3) return px % 6 < 4 ? S[py === 0 ? 1 : 5] : null;
        if (Math.abs(nx) > 0.98) return S[0];
        const k = nx < -0.4 ? 4 : nx < 0.3 ? 3 : 2;
        return S[(py % 5 === 0) ? k - 1 : k];
      });
    }, [tx - r, z - 1.5, tx + r, z + 0.5]);
  }
}
