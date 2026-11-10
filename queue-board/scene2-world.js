// scene2-world.js: the map from above's world composer (m2PaintWorld, called by scene2.js's m2Build). It lays Eriador's
// wild grass over everything, then each land's own ground (Rohan's golden plains, Gondor's green fields, the Anduin's
// vale, Mordor's ash), each realm's ground with a ragged edge, the mountain ranges (the Misty Mountains down the middle,
// the Grey Mountains in the north, the White Mountains in the south, Mordor's black walls), lets each realm's file build
// its landmark (scene2-rivendell.js, scene2-shire.js, scene2-erebor.js, scene2-rohan.js), runs the rivers and the Long
// Lake, the roads and their bridges, plants the forests and the lone trees of the wilds, sets the quiet places
// (scene2-places.js) and Gondor and Mordor (scene2-gondor.js), and strews flowers. Later parts add theirs through
// scene2.js's m2.builds.

const M2_REALM = { elf: 'm2Rivendell', hobbit: 'm2Shire', dwarf: 'm2Erebor', man: 'm2Rohan' };
const M2_FLOWERS = { elf: ['#f4f1ff', '#a9c8ff', '#c9a6f0'], hobbit: ['#ffd23a', '#e8483c', '#ff9a3a', '#f7a6c8', '#ffffff'],
  dwarf: ['#d8d0ff'], man: ['#ffe066', '#ffffff', '#f2c14e'], wild: ['#f2e27a', '#ffffff', '#d8a6e8'] };
// The forests: [place or [u, v], half-width and half-height as fractions, kinds of tree, how close they stand].
const M2_FORESTS = [
  ['mirkwood', 0.07, 0.24, [['dark', 6, 9], ['dark', 5, 7], ['pine', 5, 7]], 0.6],
  ['oldForest', 0.04, 0.07, [['dark', 6, 8], ['ever', 6, 8], ['oak', 5, 7], ['dark', 5, 6]], 0.55],
  ['fangorn', 0.04, 0.055, [['dark', 7, 10], ['ever', 6, 9]], 0.62],
  ['ithilien', 0.034, 0.1, [['elf', 5, 7], ['ever', 5, 7], ['oak', 5, 6]], 0.9],
];

function m2PaintWorld(L, plan, season, add) {
  const { W, H } = plan;
  m2Rect(L, 0, 0, W, H, M2_MAT.wild);
  m2Blob(L, 0.53 * W, 0.75 * H, 0.17 * W, 0.085 * H, M2_MAT.man, { wob: 6, seed: 11 });
  m2Blob(L, 0.56 * W, 0.955 * H, 0.27 * W, 0.075 * H, M2_MAT.hobbit, { wob: 6, seed: 12 });
  for (const [where, fu, fv] of M2_FORESTS) m2ForestFloor(L, plan.places[where].x, plan.places[where].y, fu * W, fv * H, where.length * 13);
  m2Mordor(L, plan);
  for (const r of plan.realms) m2Ground(L, r);
  const tops = {};
  for (const [range, size] of [['grey', 16], ['misty', 24], ['white', 20], ['lithui', 16], ['ephel', 17]]) tops[range] = m2Range(L, add, plan.ranges[range], range, size, range.length * 7);
  plan.places.eyries = [0.15, 0.45, 0.8].map((f) => tops.misty[Math.floor(f * (tops.misty.length - 1))]);
  for (const r of plan.realms) window[M2_REALM[r.kind] ?? 'm2Rohan']?.(L, r, plan, season, add);
  const river = plan.river;
  if (river) m2Blob(L, river.pool.x, river.pool.y, river.pool.rx + 2.5, river.pool.ry + 2, M2_MAT.sand, { wob: 1.5, seed: 3 });
  for (const [k, pts] of Object.entries(plan.rivers)) {
    // The Bruinen keeps its width through Rivendell, where its bridge and pool are, and narrows beyond.
    plan.rivers[k] = k === 'bruinen' ? [...m2River(L, pts.slice(0, -4), 5, 5, 1), ...m2River(L, pts.slice(-5), 4, 2.5, 2)]
      : m2River(L, pts, k === 'anduin' ? 2.6 : 1.8, k === 'anduin' ? 4.5 : 3, k.length);
  }
  if (river) m2Blob(L, river.pool.x, river.pool.y, river.pool.rx, river.pool.ry, M2_MAT.water, { wob: 1.2, seed: 4, aux: (x, y) => Math.hypot(x, y) * 235 });
  const lake = plan.places.longLake;
  m2Lake(L, lake.x, lake.y, lake.rx ?? 0.022 * W, lake.ry ?? 0.05 * H, 9);
  for (const road of plan.roads) m2Stroke(L, road.pts, road.hw, M2_MAT.road, { over: [...M2_LAND_MATS, M2_MAT.plaza, M2_MAT.terrace] });
  m2Crossings(L, plan, add);
  m2Fords(L, plan);
  add.runLate();
  // Trees keep out of the realms, the landmarks' reserved zones (scene2-core-places.js) and a clearing round each post.
  const avoid = [...plan.realms.map((r) => ({ x0: r.x - 4, y0: r.y - 4, x1: r.x + r.w + 4, y1: r.y + r.h + 4 })), ...Object.values(plan.zones ?? {}),
    ...plan.stations.filter((s) => s.sentry).map((s) => ({ x0: s.x - 30, y0: s.y - 34, x1: s.x + 14, y1: s.y + 8 }))];
  // The Old Forest keeps its trees off the Withywindle's banks and out of Old Man Willow's box (scene2-land-eriador-willow.js).
  const stream = typeof m2EriStreamLine === 'function' ? m2EriStreamLine(plan) : [];
  const banks = stream.map(([x, y]) => ({ x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3 }));
  if (stream.length > 1) { const [wx, wy] = stream[Math.floor(stream.length * 0.62)]; banks.push({ x0: wx - 15, y0: wy - 30, x1: wx + 15, y1: wy }); }
  for (const [where, fu, fv, kinds, gap] of M2_FORESTS) {
    const c = plan.places[where];
    m2Forest(L, add, c.x, c.y, fu * W, fv * H, kinds, season, where.length * 13, where === 'oldForest' ? [...avoid, ...banks] : avoid, gap);
  }
  m2Scatter(L, add, { area: { x0: 0, y0: 0, x1: W, y1: H }, n: Math.round((W * H) / 2600), kinds: [['oak', 5, 7], ['ever', 5, 7], ['pine', 4, 5], ['bush', 2, 3]], avoid, mats: [M2_MAT.wild, M2_MAT.hobbit], season, seed: 21 });
  m2Places(L, plan, season, add);
  m2Gondor(L, plan, season, add);
  for (const s of plan.stations) m2StationGround(L, s);
  m2RiverFx(plan, add, L);
  for (const r of plan.realms) {
    const cols = M2_FLOWERS[r.kind] ?? M2_FLOWERS.man;
    m2Flowers(L, r.x, r.y, r.w, r.h, Math.round((r.w * r.h) / (r.kind === 'dwarf' ? 900 : 160)), cols, [M2_MAT[r.kind] ?? 4], r.x * 7 + r.y);
  }
  m2Flowers(L, 0, 0, W, H, Math.round((W * H) / 500), M2_FLOWERS.wild, [M2_MAT.wild, M2_MAT.man], 31);
}

// A realm's own ground over its region: a rounded box whose edge wanders, so it meets the land round it as a coast
// meets the sea, not along a ruled line.
function m2Ground(L, r) {
  const m = M2_MAT[r.kind] ?? M2_MAT.man;
  const [cx, cy, hx, hy] = [r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 3, r.h / 2 + 3];
  for (let py = Math.max(0, Math.floor((cy - hy - 8) * 4)); py < Math.min(L.ph, (cy + hy + 8) * 4); py += 1) {
    for (let px = Math.max(0, Math.floor((cx - hx - 8) * 4)); px < Math.min(L.pw, (cx + hx + 8) * 4); px += 1) {
      const [x, y] = [px / 4, py / 4];
      const d = ((x - cx) / hx) ** 4 + ((y - cy) / hy) ** 4;
      // The edge wanders by at most 0.575 either way, so only pixels in that band ask the noise.
      if (d > 1.58 || (d > 0.42 && d > 1 + (m2Noise(x, y, 7, r.x) - 0.5) * 0.9 + (m2Noise(x, y, 2.5, r.y) - 0.5) * 0.25)) continue;
      const i = py * L.pw + px;
      L.mat[i] = m;
      L.under[i] = m;
    }
  }
}


// The fords where walkers may cross a river without a bridge, as [river, near this place, west to east, north to south]:
// Sarn Ford on the Brandywine, the Carrock's ford and Osgiliath's on the Anduin, and the Greyflood's below the Downs.
const M2_FORDS = [['brandywine', 0.17, 0.77], ['anduin', 0.592, 0.24], ['anduin', 0.727, 0.86], ['bruinen', 0.29, 0.76]];
// Each ford sits on its river's own line (plan.fords [{ x, y, r }], for the walkers' paths): the water pale and shallow
// there, and a row of stepping stones across it.
function m2Fords(L, plan) {
  plan.fords = [];
  for (const [k, u, v] of M2_FORDS) {
    const pts = plan.rivers[k];
    if (!pts) continue;
    const [tx, ty] = [u * plan.W, v * plan.H];
    const [x, y] = pts.reduce((b, p) => (Math.hypot(p[0] - tx, p[1] - ty) < Math.hypot(b[0] - tx, b[1] - ty) ? p : b), pts[0]);
    const r = k === 'anduin' ? 6 : 4.5;
    plan.fords.push({ x, y, r });
    for (let py = Math.round((y - 2) * 4); py < Math.round((y + 2) * 4); py += 1) {
      for (let px = Math.round((x - r - 1) * 4); px < Math.round((x + r + 1) * 4); px += 1) {
        const i = py * L.pw + px;
        if (px >= 0 && py >= 0 && px < L.pw && py < L.ph && L.mat[i] === M2_MAT.water) L.aux[i] = Math.max(L.aux[i], 200);
      }
    }
    L.decals.push((g) => {
      for (let sx = x - r; sx <= x + r; sx += 2) {
        if (m2MatAt(L, sx, y) !== M2_MAT.water) continue;
        const sy = y + Math.sin(sx * 1.7) * 0.5;
        pxBox(g, Math.round(sx * 4) / 4, Math.round(sy * 4) / 4, 1.25, 1, '#6f6a66');
        pxBox(g, Math.round(sx * 4) / 4, Math.round(sy * 4) / 4, 0.75, 0.5, '#a8a29a');
        pxBox(g, Math.round(sx * 4) / 4, Math.round(sy * 4) / 4 + 1, 1.25, 0.25, '#2f6f8e');
      }
    });
  }
}
