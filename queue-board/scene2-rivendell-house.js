// scene2-rivendell-house.js: the Last Homely House for scene2-rivendell.js, on the map from above (scene2.js), at the
// people's new size (an elf 30 units tall, the hall's door 16): not one block but pavilions at different heights
// stepping down the slope. At the back the high hall, its upper floor an open loggia of slender pointed arches behind a
// white balustrade, its tall door framed in gold; west of it, toward the falls, a lower wing with an open arcade and a
// terrace with a balustrade that overlooks the pool; east of it, further down the slope, a second low wing with its own
// arcade; and behind them a slender tower with stacked windows, a balcony ring and a spire whose sides sweep in. Every
// roof is teal slate whose eaves sweep up in curves to gold tips, with gold finials on the ridge. The house stands on
// a lawn terrace (paving only along the walls and the walk to the door), held by a wall of blocks hung with ivy, edged
// with low hedges, flower beds and two short balustrades by the steps. Windows and arches light up at night.

// A hipped roof w units wide, far units over the ridge and near units down to the eave, its hips curving in and its
// eave sweeping up toward the corners by sweep units: lit far slope, slate courses that follow the eave, a lit left hip
// and a shaded right one, a dark eave, and gold finials at the ridge's ends.
function m2RivRoof(g, x, y, w, far, near, P, sweep) {
  const [W, F, N] = [w * 4, far * 4, near * 4];
  const hip = Math.min(W * 0.1, N * 0.45);
  const EA = Array.from({ length: W + 2 }, (_, i) => F + N - sweep * 4 * Math.pow(Math.min(1, Math.abs(i - 1 + 0.5 - W / 2) / (W / 2)), 2.4));
  const IN = Array.from({ length: F + N + 3 }, (_, py) => (py <= F ? hip * (1 + ((F - py) / Math.max(1, F)) * 0.45) : hip * Math.pow(1 - Math.min(1, (py - F) / N), 1.7)));
  const eave = (px) => EA[px + 1];
  const inset = (py) => IN[py];
  const inside = (px, py) => py >= 0 && px >= IN[py] && px < W - IN[py] && py <= EA[px + 1] + 1;
  m2RivRaster(g, x, y, W, F + N + 2, (px, py) => {
    if (!inside(px, py)) return null;
    const e = eave(px);
    if (py >= e) return P[0];
    if (py <= F) return py === 0 || !inside(px - 1, py) || !inside(px + 1, py) ? P[1] : py >= F - 1 ? P[5] : P[4];
    if (!inside(px - 1, py) || !inside(px + 1, py)) return P[px < W / 2 ? 2 : 0];
    const d = e - py;
    const row = Math.floor(d / 6);
    const course = Math.floor(d) % 6;
    const joint = (px + (row % 2) * 4) % 8 === 0 && course > 1;
    let k = py - F < 3 ? 4 : course === 0 ? 1 : course === 5 ? 4 : joint ? 2 : 3;
    const [l, rr] = [px - inset(py), W - inset(py) - px];
    if (l < 7 && py > F + 2) k = Math.min(5, k + 1);
    if (rr < 7 && py > F + 2) k = Math.max(1, k - 1);
    return P[d < 2 ? 1 : k];
  });
  for (const fx of [hip / 4, w - hip / 4]) m2RivFinial(g, x + fx, y + far - 2.5);
  // The eave's upturned tips, gold.
  for (const tx of [x, x + w - 0.75]) {
    pxBox(g, tx, y + far + near - sweep - 0.75, 0.75, 0.5, M2_PAL.gold[2]);
    pxBox(g, tx + 0.125, y + far + near - sweep - 1.25, 0.5, 0.5, M2_PAL.gold[3]);
  }
}
// A gold finial, a little leaf on a stem, its foot at (x, y + 2).
function m2RivFinial(g, x, y) {
  m2RivRaster(g, x - 0.75, y - 0.5, 6, 11, (px, py) => (py < 6 ? (Math.abs(px - 2.5) * 1.6 + Math.abs(py - 3) < 3.4 ? M2_PAL.gold[px < 3 && py < 3 ? 4 : px < 3 ? 3 : 1] : null) : px === 2 || px === 3 ? M2_PAL.gold[px === 2 ? 3 : 1] : null));
}
// A spire of radius r round cx, h tall from tip to eave, its sides sweeping in, lit on the left, coursed, a gold tip.
function m2RivSpire(g, cx, y, r, h, P) {
  const [R, Hp] = [r * 4, h * 4];
  m2RivRaster(g, cx - r, y, R * 2, Hp + 4, (px, py) => {
    const dx = (px + 0.5 - R) / R;
    const t = Math.min(1, py / Hp);
    const half = Math.pow(t, 1.9) * 0.88 + (t > 0.9 ? (t - 0.9) * 1.2 : 0);
    const bottom = Hp + 3 * Math.sqrt(Math.max(0, 1 - dx * dx));
    if (Math.abs(dx) > half || py > bottom) return null;
    if (py >= bottom - 1 || Math.abs(dx) > half - 0.07) return P[0];
    const lit = dx / Math.max(0.05, half);
    let k = lit < -0.5 ? 5 : lit < -0.05 ? 4 : lit < 0.5 ? 3 : 2;
    if (py % 6 === 0 && py > 6) k = Math.max(1, k - 1);
    return P[k];
  });
  m2RivFinial(g, cx, y - 3);
}
// A round tower's body w by h: stone courses shaded round its curve, lit on the left.
function m2RivTowerWall(g, x, y, w, h, P) {
  m2RivRaster(g, x, y, w * 4, h * 4, (px, py) => {
    const u = (px + 0.5) / (w * 4) * 2 - 1;
    if (Math.abs(u) > 0.97 || py === h * 4 - 1) return P[0];
    const row = Math.floor(py / 6);
    const joint = py % 6 === 0 || (Math.floor((Math.asin(u) + 2) * 9 + (row % 2) * 0.5) !== Math.floor((Math.asin(Math.min(1, u + 0.03)) + 2) * 9 + (row % 2) * 0.5));
    let k = u < -0.55 ? 5 : u < -0.1 ? 4 : u < 0.45 ? 3 : 2;
    if (joint) k = Math.max(1, k - 1);
    return P[k];
  });
}
// A balustrade w units long with its foot on row h of a canvas: a rail lit along its top on little white balusters.
function m2RivRail(g, x, y, w, P) {
  m2RivRaster(g, x, y, w * 4, 12, (px, py) => {
    if (py < 3) return py === 0 ? P[5] : py === 1 ? P[4] : P[1];
    if (py > 9) return py === 11 ? P[0] : P[2];
    const b = px % 5;
    return b === 1 ? P[5] : b === 2 ? P[3] : b === 3 ? P[1] : null;
  });
}
// An open arcade w by h: n arches on slender columns, the dark room behind them warm toward its back. Returns the arches'
// panes for the night's light.
function m2RivArcade(g, x, y, w, h, n, P) {
  const bay = (w * 4) / n;
  const panes = [];
  m2RivRaster(g, x, y, w * 4, h * 4, (px, py) => {
    const b = px % bay;
    const ax = b - bay / 2;
    const rr = bay / 2 - 2;
    const pt = (ax0) => Math.hypot(Math.abs(ax0) + rr * 0.6, py - rr * 1.6 - 3) <= rr * 1.6;
    const open = Math.abs(ax) <= rr && (py >= rr * 1.6 + 3 || pt(ax)) && py < h * 4 - 2;
    if (!open) {
      if (py >= h * 4 - 2) return P[py === h * 4 - 1 ? 0 : 2];
      return Math.abs(ax) > rr + 1 ? P[Math.abs(ax) > rr + 1.6 ? (ax < 0 ? 5 : 3) : 2] : P[1];
    }
    return py > h * 4 - 6 ? '#3a2e26' : M2_PAL.glass[py < h * 2 ? 0 : 1];
  });
  for (let i = 0; i < n; i += 1) panes.push({ x: x + (i * bay + 2) / 4, y: y + 0.75, w: (bay - 4) / 4, h: h - 1.5, kind: 'arch' });
  return panes;
}

// One pavilion of the house, its front wall w wide and wh tall meeting the ground on row base at x: a sweeping roof
// over a wall whose ground floor is an open arcade (arches true) or a row of arched windows. Returns its panes.
function m2RivWing(add, x, base, w, wh, near, arches, foot) {
  const P = M2_PAL.elfWall;
  const panes = [];
  const H = wh + near + 7;
  const o = m2Thing(add, x - 2, base - H, w + 4, H + 0.5, base, (g) => {
    m2RivRoof(g, 0, 0, w + 4, 2, near, M2_PAL.elfRoof, Math.min(4, near * 0.5));
    const wy = H - wh;
    m2Wall(g, 2, wy, w, wh, P);
    pxBox(g, 2, wy + 0.5, w, 0.5, M2_PAL.gold[2]);
    const n = Math.max(2, Math.round(w / 6.5));
    if (arches) panes.push(...m2RivArcade(g, 3.5, wy + 2.5, w - 3, wh - 3, n, P));
    else for (let i = 0; i < n; i += 1) panes.push(m2Window(g, 2 + (i + 0.5) * (w / n) - 1.5, wy + 3, 3, wh - 6, P, 'arch'));
  });
  o.foot = foot;
  return panes.map((p) => ({ ...p, x: x - 2 + p.x, y: base - H + p.y }));
}

// The house at the back of the realm: hx is where it may start, room how wide it may be, base the row where its front
// wings meet the terrace and wallY the terrace's front edge. Returns where it stands, its door, its steps and its box.
function m2RivHouse(L, add, { hx, room, base, wallY, season }) {
  const P = M2_PAL.elfWall;
  const R = M2_PAL.elfRoof;
  const hw = Math.round(Math.max(24, Math.min(34, room * 0.48)));
  const ww = Math.max(10, Math.min(20, Math.floor((room + 4 - hw) / 2)));
  const W = ww * 2 + hw - 4;
  const x0 = Math.round(hx);
  const hallX = x0 + ww - 2;
  const hb = base - 7;
  const panes = [];
  // Paving only along the walls and the walk from the door down to the steps; the rest of the terrace is lawn.
  const stepX = Math.round(hallX + hw / 2);
  m2Rect(L, x0 - 3, hb - 4, W + 6, base - hb + 7, M2_MAT.terrace);
  m2Rect(L, stepX - 5, base, 10, wallY - base + 1, M2_MAT.terrace);
  m2Shadow(L, x0 + W / 2 + 4, base + 1, W / 2 + 3, 2.4, 0.85);
  // The tower behind the west corner of the hall.
  const tw = 10;
  const th = 40;
  const tx = hallX - 4;
  const to = m2Thing(add, tx - 2, hb - 4 - th - 25, tw + 4, th + 25.5, hb - 4, (g) => {
    m2RivTowerWall(g, 2, 25, tw, th, P);
    for (let k = 0; k < 3; k += 1) panes.push({ ...m2Window(g, 2 + tw / 2 - 1.25, 25 + 4 + k * 11, 2.5, 6, P, 'arch'), ox: tx - 2, oy: hb - 4 - th - 25 });
    pxBox(g, 1.5, 33, tw + 1, 1.25, P[4]);
    pxBox(g, 1.5, 34.25, tw + 1, 0.5, P[0]);
    m2RivRail(g, 1.75, 30, tw + 0.5, P);
    m2RivSpire(g, 2 + tw / 2, 3, tw / 2 + 2, 21, R);
  });
  to.foot = [tx, hb - 7, tx + tw, hb - 4];
  // The high hall: its roof, a lower floor with the door and windows, an upper loggia behind a balustrade.
  const hh = 26;
  const near = 11;
  const HH = hh + near + 7;
  const ho = m2Thing(add, hallX - 2, hb - HH, hw + 4, HH + 0.5, hb, (g) => {
    m2RivRoof(g, 0, 0, hw + 4, 3, near, R, 4.5);
    const wy = HH - hh;
    m2Wall(g, 2, wy, hw, hh, P);
    pxBox(g, 2, wy + 0.5, hw, 0.75, M2_PAL.gold[2]);
    panes.push(...m2RivArcade(g, 3, wy + 2.5, hw - 2, 9, Math.max(3, Math.round(hw / 6)), P).map((p) => ({ ...p, ox: hallX - 2, oy: hb - HH })));
    m2RivRail(g, 2, wy + 9, hw, P);
    pxBox(g, 2, wy + 12, hw, 0.5, P[4]);
    const n = Math.max(2, Math.round(hw / 7));
    for (let i = 0; i < n; i += 1) {
      const cx = 2 + (i + 0.5) * (hw / n);
      if (Math.abs(cx - (2 + hw / 2)) > 5.5) panes.push({ ...m2Window(g, cx - 1.5, wy + 15, 3, 7, P, 'arch'), ox: hallX - 2, oy: hb - HH });
    }
    const dx = 2 + hw / 2;
    m2RivRaster(g, dx - 4, HH - 16, 32, 64, (px, py) => {
      const [ax, ay] = [px + 0.5 - 16, py + 0.5];
      const inA = (m) => Math.abs(ax) <= 16 - m && (ay >= 16 || Math.hypot(Math.abs(ax) + 8, ay - 16) <= 24 - m);
      if (!inA(0)) return null;
      if (!inA(3)) return M2_PAL.gold[ax < -5 ? 3 : ax < 5 ? 2 : 1];
      return M2_PAL.wood[Math.abs(ax) < 1 ? 0 : (px + 1) % 6 === 0 ? 1 : ax < 0 ? 3 : 2];
    });
  });
  ho.foot = [hallX, hb - 6, hallX + hw, hb];
  for (const p of panes) Object.assign(p, { x: p.ox + p.x, y: p.oy + p.y });
  // The west wing toward the falls with its terrace and balustrade, and the east wing further down the slope.
  panes.push(...m2RivWing(add, x0, base - 3, ww, 13, 7, true, [x0, base - 9, x0 + ww, base - 3]));
  const dk = m2Thing(add, x0 - 4, base - 6, ww + 2, 4, base - 1, (g) => { m2RivRail(g, 0, 0, ww + 2, P); });
  dk.foot = [x0 - 4, base - 3, x0 - 2, base - 1];
  panes.push(...m2RivWing(add, hallX + hw - 2, base + 1, ww, 12, 6, true, [hallX + hw - 2, base - 5, hallX + hw - 2 + ww, base + 1]));
  for (const p of panes) {
    add.light({ pane: { x: p.x, y: p.y, w: p.w, h: p.h, kind: p.kind } });
    add.light({ x: p.x + p.w / 2, y: p.y + p.h + 1.5, r: 4.5, c: '#ffcf6a' });
  }
  add.light({ x: stepX, y: hb - 4, r: 9, c: '#ffcf6a' });
  m2RivTerraceEdge(L, add, { x0: x0 - 4, x1: x0 + W + 4, stepX, wallY, base, season });
  return { x: x0, w: W, base: base + 1, stepX, wallY, doorX: stepX, wing: null, box: { x0: x0 - 5, y0: hb - th - 30, x1: x0 + W + 5, y1: wallY + 6 } };
}

// The terrace's front edge from ex0 to ex1 on row wallY: a wall of blocks hung with ivy, in two runs either side of the
// steps, a short balustrade by the steps, low hedges along the rest, flower beds on the lawn and below the wall.
function m2RivTerraceEdge(L, add, { x0: ex0, x1: ex1, stepX, wallY, base, season }) {
  const P = M2_PAL.elfWall;
  m2Shadow(L, (ex0 + ex1) / 2 + 2, wallY + 5, (ex1 - ex0) / 2, 1.4, 0.9);
  const ivy = season === 'winter' ? ['#3e5a48', '#56705c'] : season === 'autumn' ? ['#8a3a24', '#b05a2c'] : ['#2f6a3a', '#4f8e4a'];
  const e = m2Thing(add, ex0, wallY - 0.5, ex1 - ex0, 5, wallY + 4.5, (g) => {
    m2Retain(g, 0, 0.5, ex1 - ex0, 4, M2_PAL.stone);
    m2Steps(g, stepX - ex0 - 4, 0.5, 8, 3, P);
    for (let i = 0; i < (ex1 - ex0) * 1.2; i += 1) {
      const px = m2Hash(i, 1, 91) * (ex1 - ex0);
      if (Math.abs(px - (stepX - ex0)) < 6) continue;
      const len = 0.5 + m2Hash(i, 2, 91) * 2.5;
      pxBox(g, Math.round(px * 4) / 4, 0.5, 0.5, len, ivy[i % 2]);
    }
  });
  e.foot = [ex0, wallY, ex1, wallY + 4];
  const rails = m2Thing(add, stepX - 12, wallY - 3, 24, 3.5, wallY + 0.25, (g) => {
    m2RivRail(g, 0, 0, 7, P);
    m2RivRail(g, 17, 0, 7, P);
    for (const px of [0, 6.25, 17, 23.25]) pxBox(g, px, -0.5, 0.75, 3.5, P[5]);
  });
  rails.foot = [stepX - 12, wallY - 1, stepX + 12, wallY];
  for (const [a, b] of [[ex0 + 1, stepX - 13], [stepX + 13, ex1 - 1]]) if (b - a > 4) m2Hedge(L, add, a, wallY, b - a, season, Math.round(a));
  const cols = season === 'winter' ? ['#e8eef2'] : ['#f4f1ff', '#ffd23a', '#c9a6f0', '#f49ab8'];
  for (const [a, b] of [[ex0 + 2, stepX - 7], [stepX + 7, ex1 - 2]]) {
    m2Flowers(L, a, base + 2, b - a, wallY - base - 4, Math.round((b - a) * 1.4), cols, [M2_MAT.elf], Math.round(a) + 3);
    m2Flowers(L, a, wallY + 5, b - a, 3, Math.round((b - a) * 0.8), cols, [M2_MAT.elf], Math.round(a) + 5);
  }
}
