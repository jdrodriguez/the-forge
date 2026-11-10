// scene2-land-lake-town.js: Esgaroth, Lake-town, on the map from above (scene2.js), called by scene2-land-vale.js with
// Dale's house kit (scene2-land-lake.js). It finds the Long Lake's real shores in the ground the world painted, lays a
// deck of planks on piles out on the water, sets wooden houses under steep shingled roofs round the Master's hall (a
// long hall with a carved gable and his banner), moors boats at the deck's edge, sends one boat rowing slowly over the
// lake, and runs a long bridge of planks on piles to the west shore with lamps along it that burn at night, their light
// trembling on the water below.

function m2LakeTown(L, plan, season, add) {
  const T = plan.places.lakeTown;
  const lake = plan.places.longLake;
  if (!T || !lake) return;
  const wet = (x, y) => m2MatAt(L, x, y) === M2_MAT.water;
  if (!wet(lake.x, lake.y)) return;
  // The lake's shores along the town's row and down its middle.
  let ty = Math.round(T.y);
  let [xw, xe] = [lake.x, lake.x];
  while (wet(xw - 1, ty) && xw > 0) xw -= 1;
  while (wet(xe + 1, ty) && xe < plan.W) xe += 1;
  let yn = ty;
  while (wet(lake.x, yn - 1) && yn > 0) yn -= 1;
  ty = Math.max(ty, yn + 9);
  const hw = Math.max(6, Math.min(9, (xe - xw) / 2 - 6));
  const cx = Math.round(Math.max(xw + hw + 6, xe - hw - 4));
  const [d0, d1] = [ty - 6, ty + 7];
  const [bx0, bx1, by] = [xw - 4, cx - hw, ty + 3];
  // The bridge and the deck: planks across, piles under their edges, rails along the bridge.
  L.decals.push((g) => {
    const W = M2_SHINGLE;
    for (let x = bx0; x < bx1; x += 0.5) {
      pxBox(g, x, by - 1.25, 0.5, 2.5, W[(x * 2) % 2 ? 3 : 4]);
      pxBox(g, x, by + 1.25, 0.5, 0.5, '#123352');
    }
    pxBox(g, bx0, by - 1.5, bx1 - bx0, 0.25, W[1]);
    pxBox(g, bx0, by + 1.25, bx1 - bx0, 0.25, W[1]);
    for (let x = bx0 + 2; x < bx1; x += 4) { pxBox(g, x, by + 1.5, 0.5, 1, W[0]); pxBox(g, x, by - 1.75, 0.5, 0.5, W[2]); }
    for (let y = d0; y < d1; y += 0.5) {
      pxBox(g, cx - hw, y, hw * 2, 0.5, W[Math.floor(y * 2) % 2 ? 3 : 4]);
      for (let x = cx - hw + ((Math.floor(y * 2) % 4) * 1.5); x < cx + hw; x += 6) pxBox(g, x, y, 0.25, 0.5, W[2]);
    }
    pxBox(g, cx - hw, d1, hw * 2, 0.75, W[1]);
    for (let x = cx - hw; x <= cx + hw; x += 2.5) { pxBox(g, x, d1 + 0.75, 0.5, 1, W[0]); pxBox(g, x, d1 + 1.75, 0.5, 0.25, '#4f9dbb'); }
    pxBox(g, cx - hw - 0.25, d0, 0.25, d1 - d0, W[0]);
    pxBox(g, cx + hw, d0, 0.25, d1 - d0 + 0.75, W[0]);
  });
  m2Path(L, [[bx0 - 1, by], [bx0 - 8, by - 3]], 1.6);
  const gate = plan.places.daleGate;
  if (gate) m2Path(L, [[bx0 - 8, by - 3], [(bx0 - 8 + gate.x) / 2 - 3, (by + gate.y) / 2], [gate.x, gate.y + 2]], 1.6);
  plan.places.lakeTownBridge = { x: bx0 - 1, y: by };
  // The houses round the hall, back row first, then the hall, then the front row.
  const W = M2_SHINGLE;
  const homes = [[-3, -4, 5, M2_SLATE], [-hw + 3, -1, 6, W], [hw - 3, -1.5, 5, M2_SLATE], [-hw + 3, 6.5, 6, M2_SLATE], [hw - 3, 6, 6, W]];
  for (const [dx, dz, w, roof] of homes.slice(0, 3)) m2TownHouse(add, L, cx + dx, ty + dz, w, roof, M2_PAL.wood, 'timber', season);
  m2ValeThing(add, `lakeHall,${season}`, cx - 5, ty - 13.5, 10, 16, ty + 2.5, (g) => m2LakeHall(g, season), [cx - 5, ty - 2, cx + 5, ty + 2.5]);
  add.light({ pane: { x: cx - 5 + 6.5, y: ty - 13.5 + 10, w: 2, h: 2, kind: 'square' } });
  m2LakeBanner(add, cx + 3.5, ty - 16.5);
  for (const [dx, dz, w, roof] of homes.slice(3)) m2TownHouse(add, L, cx + dx, ty + dz, w, roof, M2_PAL.wood, 'timber', season);
  // Boats moored along the deck's south edge, and one out on the lake.
  for (const [dx, k] of [[-hw + 2, 0], [hw - 5, 1]]) m2ValeThing(add, `boat${k}`, cx + dx, d1 + 1.5, 4.5, 2, d1 + 3.5, (g) => m2LakeBoat(g, k));
  // The boat out rowing takes whichever stretch of open water, below the town or above it, is longer.
  const span = (y) => {
    if (!wet(cx, y) || !wet(cx, y + 2)) return [cx, cx, y];
    let [a, b] = [cx, cx];
    while (wet(a - 2, y) && wet(a - 2, y + 2) && a > xw) a -= 1;
    while (wet(b + 8, y) && wet(b + 8, y + 2) && b < xe) b += 1;
    return [a, b, y];
  };
  const [ra, rb, ry] = [span(d1 + 7), span(Math.round((yn + d0) / 2) - 1)].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  if (rb - ra > 6) m2LakeRower(add, ra, rb, ry);
  // The lamps along the bridge and at the deck's corners.
  const lamps = [];
  for (let x = bx0 + 3; x < bx1 - 1; x += 7) lamps.push([x, by - 1.5]);
  lamps.push([cx - hw + 0.5, d1 + 0.5], [cx + hw - 0.5, d1 + 0.5]);
  for (const [lx, ly] of lamps) {
    m2ValeThing(add, 'lakeLamp', lx - 0.75, ly - 5, 1.5, 5.25, ly + 0.2, m2LakeLamp);
    add.light({ x: lx, y: ly - 4.5, r: 4, c: '#ffc56a', fire: true });
  }
  m2LakeGlints(add, lamps);
}
// The Master's hall, 10 by 16 units: a steep roof with a carved gable over a timber front, a broad door and a window.
function m2LakeHall(g, season) {
  const R = season === 'winter' ? M2_SHINGLE.map((c, i) => (i > 1 ? hdMix(c, '#eef4f8', 0.6) : c)) : M2_SHINGLE;
  m2Roof(g, 0, 0.5, 10, 2, 6.5, R, 0);
  m2Raster(g, 3, 0, 16, 14, (px, py) => (Math.abs(px + 0.5 - 8) <= py * 0.6 && py < 13 ? (Math.abs(px + 0.5 - 8) > py * 0.6 - 1.2 ? M2_PAL.gold[1] : M2_PAL.wood[px < 8 ? 3 : 2]) : null));
  pxBox(g, 4.75, 0, 0.5, 1, M2_PAL.gold[2]);
  m2Wall(g, 0.5, 9.25, 9, 6.75, M2_PAL.wood, 'timber');
  pxBox(g, 0.5, 9.25, 9, 0.5, M2_PAL.wood[0]);
  pxBox(g, 2, 12, 3, 4, M2_PAL.wood[0]);
  pxBox(g, 2.25, 12.25, 1.25, 3.75, M2_PAL.wood[2]);
  pxBox(g, 3.75, 12.25, 1, 3.75, M2_PAL.wood[1]);
  m2Window(g, 6.5, 10, 2, 2, M2_PAL.wood, 'square');
}
// The Master's banner on its pole, waving in two cached frames.
function m2LakeBanner(add, x, y) {
  const frames = [0, 1].map((k) => m2ValeCanvas(`lakeBanner${k}`, 4, 5, (g) => {
    pxBox(g, 0, 0, 0.5, 5, '#3a2a1a');
    pxBox(g, 0, 0, 0.25, 5, '#8a6a4a');
    m2Raster(g, 0.5, 0.25, 12, 8, (px, py) => {
      const wave = Math.round(Math.sin((px + k * 3) / 2.2) * 0.8);
      if (py < wave || py > 6 + wave - (px > 8 ? 1 : 0)) return null;
      return py === 3 + wave && px > 2 && px < 9 ? '#f2c14e' : px % 4 === (k ? 2 : 0) ? '#1e3a7a' : '#2c5aa8';
    });
  }));
  const f = (g, tick, reduced) => g.drawImage(frames[!reduced && (tick >> 3) % 2 ? 1 : 0], x, y, 4, 5);
  f.item = true;
  f.z = y + 14;
  add.anim(f);
}
// A rowing boat 4.5 by 2 units seen from above: a hull with its ribs and a thwart.
function m2LakeBoat(g, k) {
  m2Raster(g, 0, 0, 18, 8, (px, py) => {
    const nx = (px + 0.5 - 9) / 9;
    const half = 3.6 * Math.sqrt(Math.max(0, 1 - nx ** 4 * (nx > 0 ? 1 : 0.6)));
    const d = Math.abs(py + 0.5 - 4);
    if (d > half) return null;
    if (d > half - 1) return M2_SHINGLE[py < 4 ? 4 : 1];
    if (px === 8 || px === 9) return M2_SHINGLE[3];
    return k ? '#5a3a20' : '#4a3018';
  });
}
// The boat out rowing: back and forth across the lake below the town, its oars dipping by turns, and a wake behind it.
function m2LakeRower(add, x0, x1, y) {
  const frames = [0, 1].map((k) => m2ValeCanvas(`rower${k}`, 6, 4, (g) => {
    m2LakeBoat(g, 1);
    pxBox(g, 2, 0.5, 1, 1, '#8a2e22');
    pxBox(g, 2.25, 0.5, 0.5, 0.5, '#e8c8a0');
    pxBox(g, k ? 0.5 : 1, k ? -0.25 : 0, 3, 0.25, '#d4aa70');
    pxBox(g, k ? 0.5 : 1, k ? 2.25 : 2, 3, 0.25, '#d4aa70');
  }));
  const f = (g, tick, reduced) => {
    const p = ((reduced ? 0 : tick) % 900) / 900;
    const x = Math.round((x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(p * Math.PI * 2))) * 4) / 4;
    const east = p < 0.5;
    pxBox(g, east ? x - 2 : x + 6, y + 1, 2, 0.25, '#a6dbe4');
    pxBox(g, east ? x - 3.5 : x + 8, y + 1.25, 1, 0.25, '#7fc0d4');
    g.drawImage(frames[((reduced ? 0 : tick) >> 2) % 2], x, y - 0.5, 6, 4);
  };
  f.under = true;
  add.anim(f);
}
// A lamp on its post, 1.5 by 5 units.
function m2LakeLamp(g) {
  pxBox(g, 0.5, 1.5, 0.5, 3.75, '#3a2616');
  pxBox(g, 0.25, 0.5, 1, 1.25, '#2a2a30');
  pxBox(g, 0.5, 0.75, 0.5, 0.75, '#ffd27a');
  pxBox(g, 0.25, 0.25, 1, 0.25, '#4a4a52');
}
// The lamps' light on the water at night: short streaks under each lamp that shiver from frame to frame, drawn after the
// night's shade (scene2.js's light layer) so they glow.
let m2LakeLamps = [];
function m2LakeGlints(add, lamps) {
  m2LakeLamps = lamps;
}
m2.layers.light.push((g, tick, reduced) => {
  if (!m2LakeLamps.length || !m2.sky || (m2.sky.hour > 6.5 && m2.sky.hour < 17.8)) return;
  for (const [i, [lx, ly]] of m2LakeLamps.entries()) {
    for (let k = 0; k < 3; k += 1) {
      const j = reduced ? 0 : Math.round(Math.sin(tick * 0.6 + i * 2 + k) * 1.5) / 4;
      pxBox(g, lx - 0.5 + j, ly + 2 + k * 0.75, 1 - k * 0.25, 0.25, k ? '#c89a4a' : '#ffd27a');
    }
  }
});
