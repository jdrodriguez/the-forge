// scene2-rivendell-garden.js: the things the elves go to in Rivendell, for scene2-rivendell.js, on the map from above
// (scene2.js) at the people's new size: the pavilion, a round floor of pale paving on eight white pillars under a
// sweeping teal roof, with v1's rack of scrolls and a golden harp at its back; the healing house, a white cottage under a curved teal roof with a gold leaf on its finial and
// a round window, a bench along its front, a stone mortar at one end and a bed of herbs at the other; tall lamp posts
// with a lantern hanging from a curved arm (v1's four, each with room beside it for the elf who lights it) and small
// lanterns along the paths, all lit at night; and the bridge over the Bruinen, a white arch whose balustrades rise to
// its crown, with a lantern at each end.

// A tall lamp post with its foot at (x, y): a slender bronze post, a curved arm, and a lantern of gold and warm glass
// hanging from it; lit at night. Returns it.
function m2RivLamp(add, x, y, side = 1) {
  const o = m2Thing(add, x - 4, y - 21, 8, 21.5, y, (g) => {
    m2RivRaster(g, 0, 0, 32, 86, (px, py) => {
      const sx = side > 0 ? px : 31 - px;
      if (py > 6 && py < 84 && (sx === 15 || sx === 16)) return sx === 15 ? '#8a7a62' : '#3e3428';
      if (py >= 82 && sx >= 13 && sx <= 18) return py === 85 ? '#241c16' : '#5a4c3a';
      const arc = Math.hypot(sx - 22, py - 8) - 6;
      if (py < 8 && sx >= 16 && sx <= 28 && Math.abs(arc) < 0.9) return '#6a5a44';
      if (sx >= 25 && sx <= 31 && py >= 9 && py <= 22) {
        const [ax, ay] = [sx - 28, py - 9];
        if (ay < 2) return M2_PAL.gold[ax < 0 ? 3 : 1];
        if (Math.abs(ax) === 3 || ay === 13) return M2_PAL.gold[ax < 0 ? 2 : 0];
        return ay > 10 ? M2_PAL.gold[1] : ax < 0 && ay < 6 ? '#fff6d0' : '#f0c060';
      }
      return null;
    });
  });
  o.foot = [x - 1, y - 1, x + 1, y + 0.5];
  // Its light, which the lamplighter's round turns on and off (scene2-chores.js).
  const light = { x: x + side * 3, y: y - 17, r: 10, c: '#ffd27a', fire: true, lamp: 10 };
  add.light(light);
  return light;
}
// A small lantern on a short post along a path, its foot at (x, y), lit at night.
function m2RivLantern(add, x, y) {
  const o = m2Thing(add, x - 1.25, y - 9, 2.5, 9.5, y, (g) => {
    m2RivRaster(g, 0, 0, 10, 38, (px, py) => {
      if (py < 2) return px > 1 && px < 8 ? M2_PAL.elfRoof[py ? 2 : 4] : null;
      if (py < 9) return px === 1 || px === 8 || py === 8 ? M2_PAL.gold[1] : px > 1 && px < 8 ? (px < 4 && py < 6 ? '#fff6d0' : '#efbf5e') : null;
      if (px === 4 || px === 5) return px === 4 ? '#9a8a70' : '#4a3e30';
      return py > 34 && px > 2 && px < 7 ? '#5a4c3a' : null;
    });
  });
  o.foot = [x - 0.75, y - 0.75, x + 0.75, y + 0.5];
  // Lit and put out with the lamp post nearest it, on the lamplighter's round (scene2-chores.js).
  add.light({ x, y: y - 7, r: 6, c: '#ffd88a', fire: true, lamp: 6, lantern: true });
}

// The pavilion with its floor's middle at (x, y), compact: a round floor of pale paving, the rack of scrolls, the golden
// harp and three pillars behind, five pillars and the sweeping roof in front; the harper and a reader sit before it on
// the floor's south rim. Returns their spots and the box it fills.
function m2RivPavilion(L, add, x, y) {
  const P = M2_PAL.elfWall;
  m2Blob(L, x, y, 12, 5, M2_MAT.terrace, { seed: 5 });
  m2Shadow(L, x + 3, y + 1.5, 12, 4, 0.8);
  const ring = (k) => [x + Math.cos((k / 8) * Math.PI * 2) * 10, y + Math.sin((k / 8) * Math.PI * 2) * 4];
  const back = m2Thing(add, x - 12, y - 25, 24, 21.5, y - 3.5, (g) => {
    m2RivRaster(g, 8, 12, 32, 28, (px, py) => {
      if (py < 2 || py > 25) return py === 0 || py === 27 ? M2_PAL.wood[1] : M2_PAL.wood[py < 2 ? 4 : 2];
      if (px < 2 || px > 29 || px % 10 < 2) return M2_PAL.wood[px % 10 === 0 ? 4 : 2];
      if (py % 8 < 2) return M2_PAL.wood[1];
      return py % 8 < 6 ? ['#efe6c8', '#d8c89a', '#c9a96a'][Math.floor(px / 3) % 3] : M2_PAL.wood[0];
    });
    for (const k of [4, 6, 8]) { const [px, py] = ring(k); m2Pillar(g, px - x + 12, 21.5 + py - y + 3.5 - 0.5, 19, P); }
    m2RivHarp(g, 5, 7);
  });
  back.foot = [x - 5, y - 5, x + 5, y - 3.5];
  const front = m2Thing(add, x - 13, y - 34, 26, 39, y + 4.5, (g) => {
    for (const k of [0, 1, 2, 3, 7]) { const [px, py] = ring(k); if (py >= y - 1) m2Pillar(g, px - x + 13, 34 + py - y, 21, P); }
    m2RivDome(g, 13, 2, 13, 10, M2_PAL.elfRoof);
  });
  front.foot = [x - 11, y + 2, x + 11, y + 4.5];
  add.light({ x, y: y - 8, r: 10, c: '#ffd88a' });
  // The reader's spot carries the rack, whose cells show the scrolls filed in it (scene2-stock-art.js's m2sRack).
  return { x, y, spots: [{ x: x - 5, y: y + 7, face: 'up', job: 'harp' }, { x: x + 6, y: y + 7, face: 'up', job: 'read', mid: x, rack: { x, y, z: y - 3.5 } }],
    box: { x0: x - 13, y0: y - 35, x1: x + 13, y1: y + 9, z: y + 4.5 } };
}

// A golden harp 5.5 units wide and 14 tall standing with its foot at (x, y + 14) in a canvas: a pillar lit on its left,
// a curved neck, pale strings between them, a carved foot.
function m2RivHarp(g, x, y) {
  m2RivRaster(g, x, y, 22, 56, (px, py) => {
    const curveX = 4 + Math.round(Math.sin((py / 56) * Math.PI) * 12);
    if (px >= 1 && px <= 3 && py > 6 && py < 52) return M2_PAL.gold[px === 1 ? 4 : 2];
    if (Math.abs(px - curveX) <= 1 && py < 52) return M2_PAL.gold[px <= curveX ? 3 : 1];
    if (py < 7 && px < 12 && Math.abs(py - 3 + (px - 6) / 4) < 2) return M2_PAL.gold[2];
    if (py > 50 && px < 16) return M2_PAL.gold[py === 55 ? 0 : 1];
    if (px > 3 && px < curveX - 1 && px % 3 === 0 && py > 8 && py < 50) return '#f6efd6';
    return null;
  });
}

// The healing house with its front wall on row y, its door at x, facing south: a white cottage, a bench along its front,
// a mortar at its west end and a bed of herbs at its east end. Returns its spots and box.
function m2RivHealHouse(L, add, x, y, season) {
  const [W, wh] = [20, 18];
  const x0 = x - W / 2;
  m2Rect(L, x0 - 2, y - 3, W + 4, 9, M2_MAT.terrace);
  m2Rect(L, x0 + W + 2, y - 2, 7, 6, M2_MAT.soil);
  m2Shadow(L, x + 3, y + 0.5, W / 2 + 2, 2.2, 0.85);
  const P = M2_PAL.elfWall;
  const panes = [];
  const o = m2Thing(add, x0 - 1, y - wh - 15, W + 2, wh + 15.5, y, (g) => {
    m2RivRoof(g, 0, 2, W + 2, 2, 11, M2_PAL.elfRoof, 3.5);
    m2Wall(g, 1, 15, W, wh, P);
    panes.push(m2Window(g, 4, 15 + 5, 5, 5, P, 'round'), m2Window(g, W - 7, 15 + 4, 3.5, 9, P, 'arch'));
    m2RivRaster(g, W / 2 + 1 - 3.5, 15 + wh - 15, 28, 60, (px, py) => {
      const [ax, ay] = [px + 0.5 - 14, py + 0.5];
      if (ay < 14 && ax * ax + (ay - 14) ** 2 > 196) return null;
      if (Math.abs(ax) > 11.5 || (ay < 14 && ax * ax + (ay - 14) ** 2 > 132)) return M2_PAL.gold[ax < 0 ? 3 : 1];
      return M2_PAL.wood[px % 6 === 0 ? 1 : ax < 0 ? 4 : 3];
    });
    // A gold leaf over the door and a green cross of healing on the lintel.
    pxBox(g, W / 2 + 0.5, 15 + 0.5, 1, 1.5, M2_PAL.gold[3]);
    pxBox(g, W / 2 - 1, 15 + wh - 17.25, 4, 1, '#5ab878');
  });
  o.foot = [x0, y - 8, x0 + W, y];
  for (const p of panes) add.light({ pane: { ...p, x: x0 - 1 + p.x, y: y - wh - 15 + p.y } });
  add.light({ x, y: y - 4, r: 7, c: '#ffcf6a' });
  // The bench along the front, west of the door, and the mortar at the west end.
  const b = m2Thing(add, x0 + 1, y + 0.5, 7, 3.5, y + 3.5, (g) => {
    pxBox(g, 0, 0, 7, 1.25, M2_PAL.wood[4]);
    pxBox(g, 0, 1.25, 7, 0.5, M2_PAL.wood[1]);
    for (const px of [0.5, 5.5]) pxBox(g, px, 1.75, 1, 1.75, M2_PAL.wood[2]);
  });
  b.foot = [x0 + 1, y + 0.5, x0 + 8, y + 3.5];
  const m = m2Thing(add, x0 - 5, y - 2, 4, 5, y + 3, (g) => {
    m2RivRaster(g, 0, 0, 16, 20, (px, py) => {
      if (py < 8) return px > 9 && px < 12 && py > 0 ? '#8a6a48' : null;
      const half = py < 12 ? 7 : 5;
      if (Math.abs(px + 0.5 - 8) > half) return null;
      return py === 8 ? '#3a3636' : py === 9 ? M2_PAL.stone[5] : M2_PAL.stone[px < 6 ? 4 : px < 11 ? 3 : 2];
    });
  });
  m.foot = [x0 - 5, y, x0 - 1, y + 3];
  // The bed of herbs: rows of leafy tufts with white and violet flowers.
  const herb = season === 'winter' ? ['#5a6a52', '#7a8a6a'] : ['#3e8a4a', '#6ab86a'];
  L.decals.push((g) => {
    for (let i = 0; i < 12; i += 1) {
      const [hx, hy] = [x0 + W + 3 + (i % 4) * 1.5, y - 1 + Math.floor(i / 6) * 1.75];
      pxBox(g, hx, hy, 1, 0.5, herb[0]);
      pxBox(g, hx + 0.25, hy - 0.25, 0.5, 0.25, herb[1]);
      if (season !== 'winter' && i % 3 === 0) pxBox(g, hx + 0.25, hy - 0.5, 0.25, 0.25, i % 2 ? '#f4f0ff' : '#b89ae8');
    }
  });
  return {
    heal: { x: x0 + 10.5, y: y + 5, face: 'left', job: 'heal' },
    herbs: { x: x0 + W + 5.5, y: y + 6, face: 'up', job: 'herbs' },
    // Where an elf grinds the herbs it picked, east of the mortar (a linked round's end, scene2-haul-jobs.js).
    mortar: { x: x0 + 1.5, y: y + 5.5, face: 'left', job: 'mortar', link: true, mid: x0 - 3 },
    bench: { x: x0 + 4, y: y + 4, face: 'down' },
    box: { x0: x0 - 6, y0: y - wh - 16, x1: x0 + W + 9, y1: y + 6, z: y + 3.5 },
  };
}

// The bridge over the Bruinen at row y from bank x0 to bank x1: white paving across the water, balustrades that rise to
// the crown, the arch's face over its dark opening, and a lantern at each end. Runs once the river is down. Returns its
// spot on the crown.
function m2RivBridge(L, add, x0, x1, y) {
  const P = M2_PAL.elfWall;
  const w = x1 - x0;
  m2Stroke(L, [[x0 - 2, y], [x1 + 2, y]], 3, M2_MAT.terrace, { aux: () => 60 });
  m2Shadow(L, (x0 + x1) / 2 + 1, y + 7, w / 2 + 1, 1.6, 0.9);
  const rise = (px, W) => Math.sin(Math.min(1, Math.max(0, px / W)) * Math.PI) * 6;
  const n = m2Thing(add, x0 - 2, y - 7, w + 4, 4, y - 3, (g) => {
    const W = (w + 4) * 4;
    m2RivRaster(g, 0, 0, W, 16, (px, py) => {
      const t = 12 - rise(px, W);
      if (py < t || py > t + 4) return null;
      return py < t + 1 ? P[5] : py > t + 3 ? P[1] : px % 4 === 1 ? P[4] : P[2];
    });
  });
  n.foot = [x0, y - 3.5, x1, y - 3];
  const s = m2Thing(add, x0 - 2, y - 2.5, w + 4, 9, y + 6.5, (g) => {
    const W = (w + 4) * 4;
    m2RivRaster(g, 0, 0, W, 36, (px, py) => {
      const t = 10 - rise(px, W);
      if (py < t) return null;
      if (py < t + 2) return py === Math.ceil(t) ? P[5] : P[4];
      if (py < t + 5) return px % 4 === 1 ? P[5] : px % 4 === 2 ? P[2] : null;
      const arch = Math.hypot((px - W / 2) / (W * 0.36), (py - 36) / 22);
      if (py < t + 7) return py < t + 6 ? P[4] : P[3];
      if (arch < 1) return arch > 0.9 ? P[0] : null;
      return P[px < W * 0.2 ? 4 : px > W * 0.8 ? 2 : 3];
    });
  });
  s.foot = [x0, y + 2.5, x1, y + 3];
  m2RivLantern(add, x0 - 3, y - 3.5);
  m2RivLantern(add, x1 + 3, y - 3.5);
  return { x: (x0 + x1) / 2, y: y + 0.5, face: 'down', job: 'bridge' };
}

// The pavilion's roof: a low cone of radius r round cx whose sides sweep out to a flared eave, h from its tip to the
// eave, lit on the left, with ribs running down from a gold tip and a dark lip along the eave.
function m2RivDome(g, cx, y, r, h, P) {
  const [R, Hp] = [r * 4, h * 4];
  m2RivRaster(g, cx - r, y, R * 2, Hp + 8, (px, py) => {
    const dx = (px + 0.5 - R) / R;
    const t = Math.min(1, py / Hp);
    const half = 0.06 + 0.94 * Math.pow(t, 1.45);
    const bottom = Hp + 6 * Math.sqrt(Math.max(0, 1 - dx * dx)) - 3 * dx * dx;
    if (Math.abs(dx) > half || py > bottom) return null;
    if (py >= bottom - 1.5) return py >= bottom - 0.5 ? P[0] : P[2];
    if (Math.abs(dx) > half - 0.05) return P[0];
    const a = dx / Math.max(0.05, half);
    const rib = Math.abs(((a + 1) * 4) % 1 - 0.5) < 0.07;
    let k = a < -0.5 ? 5 : a < -0.05 ? 4 : a < 0.5 ? 3 : 2;
    if (rib) k = Math.max(1, k - 2);
    return P[k];
  });
  m2RivFinial(g, cx, y - 3);
}
