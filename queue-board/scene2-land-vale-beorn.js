// scene2-land-vale-beorn.js: Beorn's homestead on the map from above (scene2.js), called by scene2-land-vale.js. A
// long, low timber hall under a great thatched roof, a porch of tree-trunk pillars along its front and a door big enough
// for Beorn (36 units tall), smoke from the louver on its ridge; the high thorn hedge round it all with a timber gateway
// in the south; the beehives (straw skeps in rows on benches) in the west yard with bees drifting between them and the
// flower beds of clover and bee flowers; the woodpile with the chopping block and its axe; the byre for his ponies with a
// pony looking out over the half-door and the feed trough in front. Each spot Beorn works at is listed in M2_BEORN_AT.

// Beorn's spots, as offsets from plan.places.beorn: where he stands and which way he faces.
const M2_BEORN_AT = { hives: [-13, 10.5, 'up'], wood: [18, 8, 'down'], garden: [9, 9, 'down'], feed: [27, 1, 'up'] };
const M2_THATCH = ['#2e2010', '#5a3e1a', '#7e5c26', '#a07c34', '#c09a48', '#dcbc70'];
const M2_LOGS = ['#2a1810', '#4a2c18', '#6a4424', '#8c5e34', '#b0804c', '#d4aa70'];

function m2Beorn(L, plan, season, add) {
  const B = plan.places.beorn;
  if (!B) return;
  const [bx, by] = [Math.round(B.x), Math.round(B.y)];
  // The hedge's west side keeps clear of the Anduin's east bank.
  let bank = -Infinity;
  for (let y = by - 48; y <= by + 22; y += 4) bank = Math.max(bank, (m2ValeRiverX(plan.rivers.anduin, y) ?? -99) + 6);
  const x0 = Math.round(Math.max(bx - 20, bank));
  const [x1, y0, y1] = [bx + 34, by - 48, by + 24];
  m2ValeClear(L, x0 - 8, y0 - 6, x1 + 8, y1 + 10);
  m2Rect(L, x0, y0, x1 - x0, y1 - y0, M2_MAT.hobbit);
  // The yard: trodden earth before the hall and the byre, the path from the door to the gate and on to the Carrock's ford.
  m2Blob(L, bx + 4, by + 1, 22, 5, M2_MAT.path, { wob: 2, seed: 51, aux: (nx, ny) => Math.hypot(nx, ny) * 200 });
  m2Path(L, [[bx, by - 4], [bx, y1 + 2]], 2.2);
  const ford = plan.places.carrockFord;
  m2Path(L, ford ? [[bx, y1 + 2], [bx - 4, y1 + 10], [ford.x + 4.5, ford.y + 3]] : [[bx, y1 + 2], [bx, y1 + 12]], 1.8);
  // The flower beds either side of the path, and clover over the whole lawn.
  m2Rect(L, bx - 10, by + 11, 7, 5, M2_MAT.greens);
  m2Rect(L, bx + 3, by + 11, 12, 5, M2_MAT.greens);
  const bloom = season === 'winter' ? ['#e8eef2'] : ['#b48ae8', '#f2d24a', '#ffffff', '#e86a9a', '#8a6ad8'];
  m2Flowers(L, bx - 10, by + 11, 25, 5, 60, bloom, [M2_MAT.greens], 52);
  if (season !== 'winter') m2Flowers(L, x0, y0 + 6, x1 - x0, y1 - y0 - 6, 60, ['#ffffff', '#f4b8d0', '#ffffff'], [M2_MAT.hobbit], 53);
  // The hall.
  m2Shadow(L, bx + 4, by - 6, 19, 3, 0.8);
  m2ValeThing(add, `beornHall,${season}`, bx - 18, by - 46, 36, 40.25, by - 6, (g) => m2BeornHall(g, season), [bx - 17, by - 18, bx + 17, by - 6]);
  for (const wx of [6.5, 27]) add.light({ pane: { x: bx - 18 + wx + 0.25, y: by - 46 + 25.25, w: 2.5, h: 3, kind: 'square' } });
  add.light({ x: bx - 6.5, y: by - 16, r: 6, c: '#ffc56a', fire: true });
  m2Smoke(add, bx + 0.5, by - 44, 5);
  // The byre, its trough, and the pony looking out.
  m2Shadow(L, bx + 28, by - 8, 8, 2, 0.8);
  m2ValeThing(add, `beornByre,${season}`, bx + 19, by - 27, 15, 19.25, by - 8, (g) => m2BeornByre(g, season), [bx + 19, by - 16, bx + 34, by - 8]);
  m2ValeThing(add, 'beornTrough', bx + 23, by - 6, 8, 3.5, by - 2.5, m2BeornTrough, [bx + 23, by - 4, bx + 31, by - 2.5]);
  m2BeornPony(add, bx + 23.5, by - 12);
  // The hives in two rows on their benches, and the bees.
  for (const [row, z] of [[0, by + 2], [1, by + 7]]) {
    m2Shadow(L, x0 + 10.5, z + 0.3, 8, 1, 0.7);
    m2ValeThing(add, `beornHives${row}`, x0 + 2.5 + row * 1.5, z - 5, 16, 5.5, z, (g) => m2BeornHives(g, row), [x0 + 2.5, z - 1.5, x0 + 18.5, z]);
  }
  m2BeornBees(add, x0 + 3, by - 3, bx + 14, by + 15);
  // The woodpile against the hedge's east side, and the chopping block with its axe.
  m2Shadow(L, bx + 26, by + 9.5, 7, 1.4, 0.7);
  m2ValeThing(add, 'beornWood', bx + 21, by + 3.5, 12, 6.25, by + 9.5, m2BeornWoodpile, [bx + 21, by + 7, bx + 33, by + 9.5]);
  L.decals.push((g) => { for (let i = 0; i < 14; i += 1) pxBox(g, Math.round((bx + 16 + m2Hash(i, 1, 54) * 5) * 4) / 4, Math.round((by + 10.5 + m2Hash(i, 2, 54) * 2.5) * 4) / 4, 0.5, 0.25, i % 3 ? '#d4aa70' : '#8c5e34'); });
  m2ValeThing(add, 'beornBlock', bx + 16.5, by + 7, 4.5, 4.5, by + 11, m2BeornBlock, [bx + 16.5, by + 10, bx + 19.5, by + 11]);
  m2BeornHedge(L, add, x0, x1, y0, y1, bx, season);
  plan.places.beornSpots = Object.fromEntries(Object.entries(M2_BEORN_AT).map(([k, [dx, dy, face]]) => [k, { x: bx + dx, y: by + dy, face, job: k }]));
}

// The hall, 36 by 40 units: the roof's ridge with crossed boards at its ends and a louver in the middle, the eave over the
// porch's shade, the tree-trunk pillars, the plank wall, two shuttered windows and the great arched door.
function m2BeornHall(g, season) {
  const roof = season === 'winter' ? M2_THATCH.map((c, i) => (i > 1 ? hdMix(c, '#eef4f8', 0.55) : c)) : M2_THATCH;
  m2Roof(g, 0, 1, 36, 3, 15, roof, 3);
  for (const ex of [3, 31]) m2Raster(g, ex, 0, 8, 8, (px, py) => (Math.abs(px - py) < 1 || Math.abs(7 - px - py) < 1) && py < 6 ? M2_LOGS[px < 4 ? 4 : 2] : null);
  pxBox(g, 16.5, 2, 3, 2.5, M2_LOGS[1]);
  pxBox(g, 16.5, 2, 3, 0.75, M2_LOGS[4]);
  pxBox(g, 17.25, 3, 1.5, 1.25, '#1a1008');
  // The wall of laid logs, each rounded (lit along its top, dark under), their ends showing at the corners.
  m2Raster(g, 1, 19.25, 136, 80, (px, py) => {
    const r = py % 10;
    let k = r === 0 ? 0 : r < 3 ? 4 : r < 7 ? 3 : r < 9 ? 2 : 1;
    if (px < 3 || px > 132) return (r > 1 && r < 8) ? M2_LOGS[px < 3 ? 5 : 3] : M2_LOGS[0];
    if (m2Hash(px >> 3, py >> 2, 60) < 0.08 && r > 2 && r < 8) k -= 1;
    return M2_LOGS[Math.max(0, k)];
  });
  pxBox(g, 1, 19.25, 34, 2.25, M2_LOGS[0]);
  pxBox(g, 1.25, 21.5, 33.5, 0.75, '#1a0e08');
  pxBox(g, 1, 38.5, 34, 1.75, M2_PAL.stone[2]);
  pxBox(g, 1, 38.5, 34, 0.5, M2_PAL.stone[4]);
  // Windows with their shutters open.
  for (const wx of [6.5, 27]) {
    pxBox(g, wx - 1.5, 25, 1.25, 3.5, M2_PAL.wood[3]);
    pxBox(g, wx + 2.75, 25, 1.25, 3.5, M2_PAL.wood[2]);
    m2Window(g, wx, 25, 3, 3.5, M2_LOGS, 'square');
  }
  // The great door: a dark arched opening, planks bound with iron, a ring to pull it.
  m2Raster(g, 12.5, 21.5, 44, 68, (px, py) => {
    const [ax, ay] = [px + 0.5 - 22, py + 0.5];
    const arch = ay < 22 ? ax * ax + (ay - 22) ** 2 <= 22 * 22 : Math.abs(ax) <= 22;
    if (!arch) return null;
    const inner = ay < 22 ? ax * ax + (ay - 22) ** 2 <= 19 * 19 : Math.abs(ax) <= 19;
    if (!inner) return py > 34 && px > 22 ? M2_LOGS[1] : M2_LOGS[0];
    if (py === 26 || py === 27 || py === 54 || py === 55) return py % 2 ? '#2a2a30' : '#6a6a74';
    if (Math.abs(ax) < 1) return '#140c06';
    return M2_PAL.wood[(px % 8 === 0 ? 1 : px % 8 === 1 ? 4 : 3) - (ax > 0 ? 1 : 0)];
  });
  pxBox(g, 16.5, 31.5, 0.75, 1, '#9a9aa4');
  pxBox(g, 19, 31.5, 0.75, 1, '#9a9aa4');
  // The pillars: trunks with their bark, a capital block under the eave.
  for (const px0 of [2.25, 8.75, 25.75, 32.25]) {
    m2Raster(g, px0, 21.5, 7, 68, (px, py) => {
      if (py < 4) return M2_LOGS[py < 1 ? 5 : 3];
      if (px === 0 || px === 6) return py > 4 ? null : M2_LOGS[0];
      if (px === 1 || px === 5) return M2_LOGS[0];
      return M2_LOGS[(px < 3 ? 4 : px < 4 ? 3 : 2) - (m2Hash(px, py >> 2, 55) < 0.18 ? 1 : 0)];
    });
  }
  pxBox(g, 11, 40, 14, 0.25, M2_PAL.stone[1]);
}
// The byre, 15 by 19 units: a lean-to of boards under thatch, two stalls with half-doors.
function m2BeornByre(g, season) {
  const roof = season === 'winter' ? M2_THATCH.map((c, i) => (i > 1 ? hdMix(c, '#eef4f8', 0.55) : c)) : M2_THATCH;
  m2Roof(g, 0, 0, 15, 2, 6, roof, 1.5);
  m2Wall(g, 0.5, 8.25, 14, 11, M2_LOGS, 'timber');
  for (const sx of [1.5, 8]) {
    pxBox(g, sx, 10, 5.5, 9, '#140c06');
    pxBox(g, sx, 14.5, 5.5, 4.5, M2_PAL.wood[3]);
    pxBox(g, sx, 14.5, 5.5, 0.5, M2_PAL.wood[5]);
    pxBox(g, sx + 0.25, 16.5, 5, 0.25, M2_PAL.wood[1]);
    pxBox(g, sx, 18.75, 5.5, 0.25, M2_PAL.wood[0]);
  }
  pxBox(g, 8.5, 12.5, 4.5, 2, '#c6a24c');
  pxBox(g, 8.5, 12.5, 4.5, 0.5, '#f1db92');
}
// The trough on its legs, with hay heaped in it.
function m2BeornTrough(g) {
  pxBox(g, 0.5, 2.5, 0.75, 1, M2_LOGS[1]);
  pxBox(g, 6.75, 2.5, 0.75, 1, M2_LOGS[1]);
  pxBox(g, 0, 0.75, 8, 2, M2_LOGS[3]);
  pxBox(g, 0, 0.75, 8, 0.25, M2_LOGS[5]);
  pxBox(g, 0, 2.5, 8, 0.25, M2_LOGS[0]);
  m2Raster(g, 0.5, 0, 28, 4, (px, py) => (py + (m2Hash(px, 1, 56) < 0.5 ? 0 : 1) > 0 ? ['#f1db92', '#ddbe64', '#a8853a', '#836628'][py] : null));
}
// The pony in the left stall, its head over the half-door, nodding now and then.
function m2BeornPony(add, x, y) {
  const P = ['#2a1a10', '#5a3420', '#7e4c2c', '#a06a40', '#e8dcc8'];
  const frames = [0, 1].map((f) => m2ValeCanvas(`beornPony${f}`, 5, 6, (g) => {
    const d = f * 0.75;
    pxBox(g, 1, 2, 3, 4, P[2]);
    pxBox(g, 1, 2, 1, 4, P[3]);
    pxBox(g, 0.75, 1 + d, 3.5, 3, P[2]);
    pxBox(g, 1, 1 + d, 1.25, 2.5, P[3]);
    pxBox(g, 1.75, 3.25 + d, 1.5, 1.25, P[3]);
    pxBox(g, 1.75, 4.25 + d, 1.5, 0.25, P[0]);
    pxBox(g, 1.5, 1.75 + d, 0.5, 0.5, P[0]);
    pxBox(g, 3, 1.75 + d, 0.5, 0.5, P[0]);
    pxBox(g, 2, 1 + d, 1, 1.25, P[4]);
    pxBox(g, 0.75, 0.25 + d, 0.75, 1, P[1]);
    pxBox(g, 3.5, 0.25 + d, 0.75, 1, P[1]);
    pxBox(g, 1.5, 0.5 + d, 2, 0.75, P[0]);
  }));
  const f = (g, tick, reduced) => g.drawImage(frames[!reduced && tick % 90 > 70 ? 1 : 0], x, y, 5, 6);
  f.item = true;
  f.z = y + 6.5;
  add.anim(f);
}
// A bench of skeps, 16 by 5.5 units: four domes of coiled straw on a plank, each with its dark entrance.
function m2BeornHives(g, row) {
  pxBox(g, 0, 4, 16, 0.75, M2_LOGS[3]);
  pxBox(g, 0, 4, 16, 0.25, M2_LOGS[5]);
  pxBox(g, 0, 4.75, 16, 0.25, M2_LOGS[0]);
  for (const lx of [0.75, 15]) pxBox(g, lx, 5, 0.5, 0.5, M2_LOGS[1]);
  const S = ['#4a3410', '#7a5a1e', '#a8802e', '#cca246', '#e8c870', '#f6e2a0'];
  for (let i = 0; i < 4; i += 1) {
    m2Raster(g, 0.5 + i * 4, 0, 14, 16, (px, py) => {
      const [nx, ny] = [(px + 0.5 - 7) / 7, (py + 0.5 - 16) / 16];
      if (nx * nx + ny * ny > 1) return null;
      if (nx * nx + ny * ny > 0.82) return S[0];
      if (py > 11 && Math.abs(nx) < 0.2) return '#1a1008';
      const coil = py % 3 === 0;
      return S[Math.max(1, Math.min(5, (nx < -0.3 ? 4 : nx < 0.3 ? 3 : 2) + (coil ? -1 : 0) + (py < 4 && nx < 0 ? 1 : 0) + (row && i === 2 ? -1 : 0)))];
    });
  }
}
// The bees: specks of gold and black drifting in slow loops over the hives and the beds; they keep to their hives at night.
function m2BeornBees(add, x0, y0, x1, y1) {
  const bees = Array.from({ length: 12 }, (_, i) => ({ cx: x0 + m2Hash(i, 1, 57) * (x1 - x0), cy: y0 + m2Hash(i, 2, 57) * (y1 - y0), rx: 2 + m2Hash(i, 3, 57) * 4, ry: 1 + m2Hash(i, 4, 57) * 2.5, ph: m2Hash(i, 5, 57) * 6.28, sp: 0.05 + m2Hash(i, 6, 57) * 0.05 }));
  const path = bees.map((b) => Array.from({ length: 64 }, (_, k) => {
    const a = b.ph + k * (Math.PI * 2 / 64) * (1 + Math.round(b.sp * 20));
    return [Math.round((b.cx + Math.cos(a) * b.rx) * 4) / 4, Math.round((b.cy + Math.sin(a * 2) * b.ry) * 4) / 4];
  }));
  const f = (g, tick, reduced) => {
    if ((m2.sky?.hour ?? 12) < 7 || (m2.sky?.hour ?? 12) > 18.5) return;
    const k = reduced ? 0 : tick;
    for (let i = 0; i < path.length; i += 1) {
      const [x, y] = path[i][(k + i * 5) % 64];
      pxBox(g, x, y, 0.5, 0.25, '#f2c43a');
      pxBox(g, x + 0.25, y, 0.25, 0.25, '#2a1e10');
      if ((k + i) % 2) pxBox(g, x, y - 0.25, 0.25, 0.25, '#f4f8ff');
    }
  };
  f.over = true;
  add.anim(f);
}
// The woodpile, 12 by 6 units: split logs stacked with their ends showing, the top row's bark lengths lit.
function m2BeornWoodpile(g) {
  m2Raster(g, 0, 0, 48, 25, (px, py) => {
    if (py < 5) return py === 0 ? M2_LOGS[0] : px % 9 === 0 ? M2_LOGS[1] : M2_LOGS[py < 2 ? 4 : 3];
    const row = Math.floor((py - 5) / 5);
    const off = row % 2 ? 2.5 : 0;
    const [cx, cy] = [Math.floor((px + off) / 5) * 5 + 2.5 - off, 5 + row * 5 + 2.5];
    const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
    if (d > 2.6) return py > 23 ? null : M2_LOGS[0];
    if (d > 1.9) return M2_LOGS[2];
    return d < 0.8 ? M2_LOGS[3] : px < cx ? '#e4c08a' : '#c89e64';
  });
}
// The chopping block, a stump 3 units across, with the axe bitten into its top.
function m2BeornBlock(g) {
  pxBox(g, 0.5, 2, 3, 2.25, M2_LOGS[2]);
  pxBox(g, 0.5, 2, 1, 2.25, M2_LOGS[3]);
  pxBox(g, 0.5, 4, 3, 0.25, M2_LOGS[0]);
  m2Raster(g, 0.5, 1, 12, 5, (px, py) => (Math.hypot((px + 0.5 - 6) / 6, (py + 0.5 - 2.5) / 2.5) > 1 ? null : Math.hypot((px + 0.5 - 6) / 6, (py + 0.5 - 2.5) / 2.5) > 0.7 ? M2_LOGS[1] : (px + py) % 4 ? '#e4c08a' : '#b08048'));
  m2Raster(g, 1.5, 0, 12, 8, (px, py) => (Math.abs(px - 2 - py * 1.1) < 1 && py < 7 ? M2_LOGS[px < 6 ? 4 : 2] : null));
  pxBox(g, 2.75, 1.25, 1.25, 1, '#6a6a74');
  pxBox(g, 2.75, 1.25, 1.25, 0.25, '#c4c4cc');
}
// The thorn hedge, 9 units high: its north and south rows (the south one broken by the gateway) and its sides in short
// lengths, each sorted where it stands, thick and dark with white may blossom (red haws in autumn, frost in winter).
function m2BeornHedge(L, add, x0, x1, y0, y1, bx, season) {
  const seg = (x, y, w, h, z, key) => {
    m2Shadow(L, x + w / 2 + 1, z + 0.4, w / 2 + 1, 1.4, 0.6);
    m2ValeThing(add, `thorn${key},${w},${h},${season}`, x, y, w, h, z, (g) => m2ThornPaint(g, w, h, season, key), [x, z - 2.5, x + w, z]);
  };
  for (let x = x0; x < x1; x += 9) seg(x, y0 - 9, Math.min(9, x1 - x), 9.5, y0, 1);
  for (let x = x0; x < x1; x += 9) {
    const w = Math.min(9, x1 - x);
    if (x + w > bx - 3.5 && x < bx + 3.5) {
      if (x < bx - 3.5) seg(x, y1 - 7, bx - 3.5 - x, 7.5, y1, 2);
      if (x + w > bx + 3.5) seg(bx + 3.5, y1 - 7, x + w - bx - 3.5, 7.5, y1, 2);
    } else seg(x, y1 - 7, w, 7.5, y1, 2);
  }
  for (let t = y0 - 8; t < y1 - 6.5; t += 6) {
    const h = Math.min(6, y1 - 6.5 - t);
    for (const sx of [x0 - 1, x1 - 3]) m2ValeThing(add, `thornSide,${h},${season}`, sx, t, 4, h + 0.25, t + h, (g) => m2ThornSide(g, h, season), [sx, t, sx + 4, t + h]);
  }
  m2ValeThing(add, 'beornGate', bx - 5, y1 - 12, 10, 12.5, y1 + 0.2, m2BeornGatePaint);
}
function m2ThornPaint(g, w, h, season, seed) {
  const C = m2ThornRamp(season);
  const flower = season === 'autumn' ? '#c8322a' : season === 'winter' ? '#ffffff' : season === 'summer' ? '#f0e8d8' : '#ffffff';
  m2Raster(g, 0, 0, w * 4, h * 4, (px, py) => {
    const bump = 3 + 2.5 * Math.abs(Math.sin((px + seed * 13) / 4.1)) + m2Hash(px >> 1, seed, 58) * 1.5;
    if (py < 6 - bump || py > h * 4 - 2) return null;
    if (py === h * 4 - 2) return C[0];
    if (py < 7 - bump) return C[0];
    const k = py < 9 ? 4 : py < 18 ? 3 : py < 28 ? 2 : 1;
    const hsh = m2Hash(px, py, seed + 59);
    if (hsh < 0.035 && py < h * 4 - 6) return flower;
    if (hsh > 0.93) return C[0];
    return C[Math.max(0, Math.min(5, k + (hsh < 0.15 ? 1 : 0) + (px < 2 ? 1 : 0)))];
  });
}
// A length of the hedge's side seen from above: its leafy top, lit on the west, dark on the east.
function m2ThornSide(g, h, season) {
  const C = m2ThornRamp(season);
  m2Raster(g, 0, 0, 16, h * 4 + 1, (px, py) => {
    const wob = Math.round(Math.sin((py + 3) / 2.3) * 0.8);
    if (px < wob || px > 15 + wob - (py % 5 === 0 ? 1 : 0)) return null;
    if (px === wob) return C[0];
    const hsh = m2Hash(px, py, 61);
    if (hsh < 0.04) return season === 'autumn' ? '#c8322a' : '#ffffff';
    return C[Math.max(1, Math.min(5, (px < 5 ? 4 : px < 11 ? 3 : 2) + (hsh < 0.18 ? 1 : hsh > 0.85 ? -1 : 0)))];
  });
}
function m2ThornRamp(season) {
  return season === 'winter' ? ['#1a2418', '#2e3a2c', '#4a5848', '#6e7c6c', '#a8b4b0', '#e8eef2'] : season === 'autumn' ? ['#14200f', '#24361a', '#3a4e22', '#56682c', '#76863a', '#98a450'] : ['#102414', '#1c3a1e', '#2a5228', '#3a6a32', '#52843e', '#72a050'];
}
// The gateway: two great posts and a lintel beam, open beneath for walkers.
function m2BeornGatePaint(g) {
  for (const px0 of [0.25, 8]) {
    pxBox(g, px0, 1.5, 1.75, 11, M2_LOGS[2]);
    pxBox(g, px0, 1.5, 0.75, 11, M2_LOGS[4]);
    pxBox(g, px0 + 1.5, 1.5, 0.25, 11, M2_LOGS[0]);
  }
  pxBox(g, 0, 0, 10, 2, M2_LOGS[3]);
  pxBox(g, 0, 0, 10, 0.5, M2_LOGS[5]);
  pxBox(g, 0, 1.75, 10, 0.25, M2_LOGS[0]);
}
