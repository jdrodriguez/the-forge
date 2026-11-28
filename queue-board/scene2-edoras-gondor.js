// scene2-edoras-gondor.js: Gondor's fields on the map from above, for a second machine with no realm of its own
// (scene2-rohan.js calls it). A steading of white stone in the middle of the back: a farmhouse under blue-grey slate
// with a door and shuttered windows, a barn beside it, a yard walled in white stone with its gate on the road, a round
// white well with a windlass in the yard and a haystack; either side strips of wheat and greens between low walls, and
// olive and fruit trees. Men fetch water at the well and come and go at the house's door.

const M2_EDO_WHITE = ['#565a62', '#868a91', '#b0b2b4', '#d2d2ce', '#eae8e0', '#fbfaf4'];
const M2_EDO_SLATE = ['#1c2430', '#2a3646', '#3a4a5e', '#4e6278', '#6a8098', '#94a8bc'];

function m2EdoGondor(L, r, plan, season, add) {
  const cx = Math.round((r.ux0 + r.ux1) / 2);
  const foot = r.roadY - 5;
  // Below any landmark's zone that reaches down into the back of the realm (Minas Tirith's, by Gondor's fields).
  const zs = Object.values(plan.zones ?? {}).filter((z) => z.x1 > r.ux0 && z.x0 < r.ux1 && z.y1 > r.y && z.y1 < foot - 22);
  const top = Math.max(r.y + 3, ...zs.map((z) => z.y1 + 2));
  const yw = Math.min(54, r.ux1 - r.ux0 - 30);
  const yd = Math.max(22, Math.min(40, foot - top));
  const [x0, y0] = [cx - yw / 2, foot - yd];
  const keep = [r.block, { x0: r.block.x0, y0: r.block.y0 - 32, x1: r.block.x1, y1: r.block.y0 }, { x0: x0 - 3, y0: y0 - 20, x1: x0 + yw + 3, y1: foot + 3 }];
  // The yard: beaten earth inside a low white wall, open at its gate on the road.
  m2Rect(L, x0, y0, yw, yd, M2_MAT.path, 120);
  m2Path(L, [[cx, foot], [cx, r.roadY]], 2.5);
  // Fields either side: strips of wheat and greens between paths.
  for (const [fx0, fx1] of [[r.ux0 - 2, x0 - 4], [x0 + yw + 4, r.ux1 + 2]]) {
    if (fx1 - fx0 < 8) continue;
    for (let y = top; y < foot - 4; y += 9) {
      m2Rect(L, fx0, y, fx1 - fx0, 7, (Math.round(y / 9) + Math.round(fx0)) % 2 ? M2_MAT.wheat : M2_MAT.greens);
    }
    keep.push({ x0: fx0, y0: top, x1: fx1, y1: foot });
  }
  const W = M2_EDO_WHITE;
  for (const [wx, wy, ww, wh, z] of [[x0, y0 - 2.5, yw, 3, y0 + 0.5], [x0, foot - 2.5, yw / 2 - 4, 3, foot + 0.5], [x0 + yw / 2 + 4, foot - 2.5, yw / 2 - 4, 3, foot + 0.5]]) {
    const o = m2Thing(add, wx, wy, ww, wh, z, (g) => {
      m2Raster(g, 0, 0, ww * 4, wh * 4, (px, py) => (py < 3 ? W[py === 0 ? 2 : 5] : px === 0 || px === ww * 4 - 1 || py === wh * 4 - 1 ? W[0] : W[(px + (py > 7 ? 5 : 0)) % 10 === 0 ? 2 : 4]));
    });
    o.foot = [wx, z - 1.5, wx + ww, z];
  }
  for (const side of [0, 1]) {
    const wx = side ? x0 + yw - 1.5 : x0;
    const o = m2Thing(add, wx, y0 - 2.5, 1.5, yd + 2.5, foot + 0.4, (g) => m2Raster(g, 0, 0, 6, (yd + 2.5) * 4, (px, py) => (px === 5 ? W[0] : W[px < 2 ? 5 : 3])));
    o.foot = [wx, y0, wx + 1.5, foot];
  }
  // The farmhouse at the back of the yard, the barn on its east side.
  const hw = Math.min(30, yw * 0.55);
  const hz = y0 + Math.min(16, yd * 0.5);
  const hx0 = x0 + 4;
  m2Shadow(L, hx0 + hw / 2 + 3, hz + 0.5, hw / 2 + 2, 2.4, 0.8);
  const panes = [];
  const house = m2Thing(add, hx0, hz - 23, hw, 23.5, hz + 0.5, (g) => {
    const eave = m2Roof(g, 0, 0, hw, 2, 9, M2_EDO_SLATE, 3);
    m2Wall(g, 0, eave, hw, 23.5 - eave, W, 'plaster');
    pxBox(g, hw - 7, 0, 2.5, 4, W[2]);
    for (const dx of [3, hw - 7]) {
      panes.push(m2Window(g, dx, 14, 3, 4, W, 'square'));
      pxBox(g, dx - 1, 14, 0.75, 4, '#2f5a7a');
      pxBox(g, dx + 3.25, 14, 0.75, 4, '#2f5a7a');
    }
    m2Raster(g, hw / 2 - 2.5, 14, 20, 38, (px, py) => (px === 0 || px === 19 || py === 0 ? W[0] : '#5e3a24'));
  });
  house.foot = [hx0, hz - 3, hx0 + hw, hz + 0.5];
  for (const p of panes) add.light({ pane: { ...p, x: hx0 + p.x, y: hz - 23 + p.y } });
  const bw = x0 + yw - 3 - (hx0 + hw + 3);
  if (bw >= 10) {
    const bx = hx0 + hw + 3;
    const bz = hz + 6;
    m2Shadow(L, bx + bw / 2 + 2, bz + 0.5, bw / 2 + 1, 2, 0.8);
    const barn = m2Thing(add, bx, bz - 18, bw, 18.5, bz + 0.5, (g) => {
      const eave = m2Roof(g, 0, 0, bw, 2, 7, M2_PAL.thatch, 1);
      m2Wall(g, 0, eave, bw, 18.5 - eave, W, 'stone');
      m2Raster(g, bw / 2 - 3, 11, 24, 30, (px, py) => (px === 0 || px === 23 || py === 0 ? M2_PAL.wood[0] : M2_PAL.wood[(px + py) % 8 === 0 ? 1 : px < 12 ? 3 : 2]));
    });
    barn.foot = [bx, bz - 3, bx + bw, bz + 0.5];
  }
  // The well in the yard: a round wall of white stone, a windlass on two posts over it, and a haystack beside.
  const [wx, wy] = [x0 + yw * 0.3, foot - 6];
  m2Shadow(L, wx + 1.5, wy + 0.5, 3.5, 1.1, 0.8);
  const well = m2Thing(add, wx - 3, wy - 8, 6, 8.5, wy + 0.5, (g) => {
    pxBox(g, 0.5, 0, 0.75, 6, M2_PAL.wood[2]);
    pxBox(g, 4.75, 0, 0.75, 6, M2_PAL.wood[2]);
    pxBox(g, 0.5, 1, 5, 0.75, M2_PAL.wood[4]);
    m2Raster(g, 0, 4, 24, 18, (px, py) => {
      const d = Math.hypot((px + 0.5 - 12) / 12, (py + 0.5 - 5) / 5);
      if (py < 8 && d < 1) return d > 0.7 ? W[5] : '#1e3346';
      return py >= 5 && py < 18 ? (px === 0 || px === 23 || py === 17 ? W[0] : W[(px + (py > 11 ? 4 : 0)) % 8 === 0 ? 2 : px < 8 ? 5 : 4]) : null;
    });
  });
  well.foot = [wx - 3, wy - 2, wx + 3, wy + 0.5];
  const [sx, sy] = [x0 + 6, foot - 5];
  m2Shadow(L, sx + 2, sy + 0.5, 4, 1.2, 0.8);
  const hay = m2Thing(add, sx - 3.5, sy - 6, 7, 6.5, sy + 0.5, (g) => m2Raster(g, 0, 0, 28, 26, (px, py) => {
    const d = Math.hypot((px + 0.5 - 14) / 14, (py + 0.5 - 18) / 18);
    return d < 1 && py < 25 ? (d > 0.92 ? M2_PAL.thatch[0] : M2_PAL.thatch[(px * 3 + py) % 7 === 0 ? 5 : px < 12 ? 4 : 3]) : null;
  }));
  hay.foot = [sx - 3.5, sy - 2, sx + 3.5, sy + 0.5];
  r.spots.push({ x: hx0 + hw / 2, y: hz + 4, face: 'up', job: 'hall' }, { x: wx + 5, y: wy + 2, face: 'left', job: 'well' });
  if (yw >= 36) r.spots.push(m2EdoPell(L, add, x0 + yw * 0.66, foot - 5));
  // Olive and fruit trees round the fields, clear of the stations and the steading.
  add.late(() => m2Scatter(L, add, { area: { x0: r.x + 2, y0: r.y + 2, x1: r.x + r.w - 2, y1: r.y + r.h }, n: Math.round(r.w / 14), kinds: [['ever', 4, 5], ['oak', 4, 6]], avoid: keep, mats: [M2_MAT.man, M2_MAT.hobbit, M2_MAT.wild], season, seed: 131 }));
}
