// scene2-land-eriador-bree.js: Bree on the map from above (scene2.js), where the East Road meets the Greenway: Bree-hill
// rising behind the village to the north-east with houses on its slope; the Hedge, a thick dark ring round the village
// with the Dike dug outside it, broken only where the roads come through, at the West-gate and the South-gate, each with
// its timber gate and a stone gatehouse; houses of stone and timber under thatch and slate; and the Prancing Pony, a big
// inn of three storeys: a stone ground floor with its tall front door up broad steps (a Man's height) beside the arch
// to its courtyard, two timber-framed floors above with rows of windows lit at night, chimneys, and its sign, a white
// pony rearing on a dark board. m2LandEriador (scene2-land-eriador.js) calls m2EriBree.

const M2_ERI_SLATE = ['#151a22', '#232b36', '#34404c', '#475562', '#5f6e7a', '#8796a0'];
const M2_ERI_BEAM = '#3a2418';

// The Pony's canvas, 22 by 45 units, its front on row 43 with steps below: slate roof and chimneys, two framed floors
// over a stone one. Returns the panes (canvas units) and the door's middle.
function m2EriPonyArt(season) {
  return m2EriCanvas(`pony${season}`, 22, 45, (g) => {
    const W = M2_PAL.elfWall;
    for (const x of [3.5, 16.5]) {
      pxBox(g, x, 0, 2, 4, '#5a2e22');
      pxBox(g, x, 0, 0.75, 4, '#84462e');
      pxBox(g, x - 0.25, 0, 2.5, 0.75, '#2a1610');
    }
    const eave = m2Roof(g, 0, 3, 22, 2.5, 7, M2_ERI_SLATE, 2);
    if (season === 'winter') m2Raster(g, 0.5, 3, 84, 12, (px, py) => (py < 10 - (px % 5 === 0 ? 2 : 0) && px > 6 && px < 78 ? (py < 3 ? '#ffffff' : '#dfe8f0') : null));
    const panes = [];
    // Two framed floors, the upper one jettied out over the lower.
    for (const [y, h] of [[eave, 6.5], [eave + 6.5, 6.5]]) {
      m2Wall(g, 0.25, y, 21.5, h, W, 'plaster');
      for (let x = 0.25; x <= 21.75; x += 4.3) pxBox(g, Math.min(x, 21.25), y, 0.5, h, M2_ERI_BEAM);
      pxBox(g, 0.25, y, 21.5, 0.5, M2_ERI_BEAM);
      pxBox(g, 0.25, y + h - 0.5, 21.5, 0.5, M2_ERI_BEAM);
      for (let i = 0; i < 5; i += 1) {
        const wx = 1.6 + i * 4.3;
        panes.push(m2Window(g, wx, y + 1.5, 2.25, 3, W, 'square'));
        if (i % 2) { pxBox(g, wx - 0.9, y + h - 1.5, 0.5, 1, M2_ERI_BEAM); pxBox(g, wx + 2.6, y + h - 1.5, 0.5, 1, M2_ERI_BEAM); }
      }
      pxBox(g, 0, y + h - 0.25, 22, 0.25, '#1e120c');
    }
    // The stone floor: the front door up its steps on the left, two windows, and the arch through to the courtyard.
    const S = M2_PAL.stone;
    m2Wall(g, 0.25, 25.75, 21.5, 17.25, S, 'stone');
    m2Raster(g, 1.25, 26.75, 24, 64, (px, py) => {
      const ax = px + 0.5 - 12;
      const inArch = py > 12 || ax * ax + (py - 12) ** 2 < 144;
      if (!inArch) return null;
      if (ax * ax + (py - 12) ** 2 > 100 && py <= 12) return S[5];
      if (Math.abs(ax) > 10) return S[5];
      if (px === 12 || px === 11) return '#2a160c';
      return [M2_PAL.wood[2], M2_PAL.wood[3], M2_PAL.wood[2], M2_PAL.wood[1]][(px >> 1) % 4];
    });
    pxBox(g, 2.6, 34.5, 0.5, 0.5, M2_PAL.gold[2]);
    for (const wx of [8.5, 11.25]) panes.push(m2Window(g, wx, 30, 2, 3.5, S, 'square'));
    m2Raster(g, 14, 30, 28, 52, (px, py) => {
      const ax = px + 0.5 - 14;
      if (py < 14 && ax * ax + (py - 14) ** 2 > 196) return null;
      if (py < 14 && ax * ax + (py - 14) ** 2 > 132) return S[py < 7 ? 5 : 4];
      if (Math.abs(ax) > 11.5) return S[ax < 0 ? 5 : 1];
      return py > 40 ? (py % 6 === 0 ? '#3a3230' : '#4e4440') : py > 30 ? '#1a1412' : '#0c0a0a';
    });
    m2Steps(g, 0.75, 43, 6, 1, S);
    // The sign: a dark board on an iron bracket between the floors, a white pony rearing on it.
    pxBox(g, 12, 22.5, 7, 0.5, '#1a1410');
    pxBox(g, 13.25, 23, 0.25, 1, '#1a1410');
    pxBox(g, 17.5, 23, 0.25, 1, '#1a1410');
    pxBox(g, 12.5, 24, 6, 4.5, '#1e2a1c');
    pxBox(g, 12.5, 24, 6, 0.25, M2_PAL.gold[1]);
    pxBox(g, 12.5, 28.25, 6, 0.25, '#0e140c');
    m2Raster(g, 13.5, 24.5, 16, 14, (px, py) => {
      const rows = ['....##..........', '...###..........', '...####.........', '....#####.......', '.....#########..', '.....##########.', '......#######..#', '......#.....#...', '.....#......#...', '.....#.......#..', '................', '..#.#####.###...', '................', '................'];
      return rows[py]?.[px] === '#' ? (py > 10 ? '#d8c890' : '#f4f2ea') : null;
    });
    return { panes, door: 3 };
  });
}

// A house w units wide whose front stands on row y, centred on x: its roof (thatch or slate), a stone or timber wall, a
// door and a window, a chimney; lit at night.
function m2EriHouse(L, add, x, y, w, roof, wall, seed) {
  const [near, wh] = [Math.round(w * 0.42), 9];
  const P = roof === 'slate' ? M2_ERI_SLATE : M2_PAL.thatch;
  const WP = wall === 'stone' ? M2_PAL.stone : M2_PAL.elfWall;
  const art = m2EriCanvas(`house${w},${roof},${wall},${seed % 3}`, w, near + wh + 6, (g) => {
    pxBox(g, w * 0.7, 0, 1.5, 3, '#5a4a40');
    pxBox(g, w * 0.7, 0, 0.5, 3, '#7a6a5c');
    const eave = m2Roof(g, 0, 2, w, 2, near, P, 0.75);
    m2Wall(g, 0.5, eave, w - 1, 5 + near + wh - eave, WP, wall === 'stone' ? 'stone' : 'plaster');
    if (wall !== 'stone') for (let bx = 0.5; bx < w; bx += 3) pxBox(g, Math.min(bx, w - 1), eave, 0.5, 5 + near + wh - eave, M2_ERI_BEAM);
    const dx = seed % 2 ? w * 0.22 : w * 0.62;
    pxBox(g, dx - 0.25, 5 + near + wh - 8.25, 3.5, 8.25, WP[0]);
    pxBox(g, dx, 5 + near + wh - 8, 3, 8, M2_PAL.wood[2]);
    pxBox(g, dx + 0.75, 5 + near + wh - 8, 0.25, 8, M2_PAL.wood[1]);
    pxBox(g, dx + 2.25, 5 + near + wh - 4.5, 0.5, 0.5, M2_PAL.gold[2]);
    return { pane: m2Window(g, seed % 2 ? w * 0.6 : w * 0.16, 5 + near + 2.5, 2.25, 2.75, WP, 'square') };
  });
  const [x0, y0] = [x - w / 2, y - art.h];
  m2Shadow(L, x + 2, y + 0.3, w / 2 + 1.5, 1.6, 0.8);
  m2EriPut(add, art, x0, y0, y, [x0 + 0.5, y - near - 1, x0 + w - 0.5, y]);
  add.light({ pane: { ...art.pane, x: x0 + art.pane.x, y: y0 + art.pane.y } });
  if (typeof m2Smoke === 'function') m2Smoke(add, x0 + w * 0.7 + 0.75, y0, seed);
}

// A house where its ground is clear of roads, water and realms.
function m2EriHouseIf(L, plan, add, x, y, w, roof, wall, seed, taken) {
  const box = { x0: x - w / 2 - 1, y0: y - 19, x1: x + w / 2 + 1, y1: y + 1 };
  if (taken.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return;
  if (!m2EriClear(L, plan, x, y - 3, w / 2, 3)) return;
  taken.push(box);
  m2EriHouse(L, add, x, y, w, roof, wall, seed);
}
// A gate across a road: two posts and a beam over the way, the gate's leaves swung open against the posts.
function m2EriGate(add, x, y, span, across) {
  const art = m2EriCanvas(`gate${span},${across}`, across ? span + 2 : 3, across ? 9 : span + 8, (g) => {
    const post = (px, py, h) => { pxBox(g, px, py, 1.25, h, M2_PAL.wood[1]); pxBox(g, px, py, 0.5, h, M2_PAL.wood[3]); pxBox(g, px - 0.25, py, 1.75, 0.5, M2_PAL.wood[0]); };
    if (across) {
      post(0.25, 1, 8);
      post(span + 0.5, 1, 8);
      pxBox(g, 0, 1, span + 2, 1, M2_PAL.wood[2]);
      pxBox(g, 0, 1, span + 2, 0.25, M2_PAL.wood[4]);
      for (const gx of [1.5, span - 2]) for (let i = 0; i < 3; i += 1) pxBox(g, gx + i * 0.75, 4 + i * 0.25, 0.5, 4.5, M2_PAL.wood[2 + (i % 2)]);
    } else {
      post(0.75, 0, 7);
      post(0.75, span + 1, 7);
      pxBox(g, 1, 0, 0.75, span + 2, M2_PAL.wood[2]);
    }
  });
  const o = across ? m2EriPut(add, art, x - span / 2 - 1, y - 9, y) : m2EriPut(add, art, x - 1.5, y - span / 2 - 7, y + span / 2 + 1);
  o.foot = across ? [x - span / 2 - 1, y - 1, x - span / 2 + 0.5, y] : [x - 1, y + span / 2, x + 1, y + span / 2 + 1];
}

// The ring of the Hedge round (hx, hy), rx by ry: a clump every few degrees except where a road passes, the Dike as a
// dark ditch outside it, and a gate with its gatehouse at each gap. Returns the gaps.
function m2EriHedgeRing(L, plan, add, season, hx, hy, rx, ry, taken) {
  const near = (x, y, pad) => plan.roads.some((r) => r.pts.some((p, k) => {
    const q = r.pts[k + 1];
    if (!q) return false;
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - p[0] - dx * t, y - p[1] - dy * t) < r.hw + pad;
  }));
  const steps = 52;
  const open = [...Array(steps).keys()].map((i) => {
    const a = (i / steps) * Math.PI * 2;
    return near(hx + Math.cos(a) * rx, hy + Math.sin(a) * ry, 2.2) || m2MatAt(L, hx + Math.cos(a) * rx, hy + Math.sin(a) * ry) === M2_MAT.water;
  });
  const P = treeRamp([['#24452a', '#3a6a3a', '#163020'], ['#2a4e30', '#447640', '#1a3424']][0]);
  const C = season === 'winter' ? P.map((c, i) => (i < 3 ? hdMix(c, '#dfe8ec', 0.35) : c)) : P;
  const clump = m2EriCanvas(`hedge${season}`, 4, 5, (g) => m2Raster(g, 0, 0, 16, 20, (px, py) => {
    const d = ((px + 0.5 - 8) / 8) ** 2 + ((py + 0.5 - 9) / 9) ** 2;
    if (d > 1) return null;
    if (d > 0.78 && py > 6) return C[5];
    const l = -(px - 8) / 10 - (py - 6) / 9 + (M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * 0.6 + (m2Hash(px >> 1, py >> 1, 96) < 0.2 ? -0.4 : 0);
    return C[l > 0.6 ? 0 : l > 0.15 ? 1 : l > -0.3 ? 2 : l > -0.7 ? 3 : 4];
  }));
  const gaps = [];
  L.decals.push((g) => {
    for (let i = 0; i < steps * 3; i += 1) {
      const a = (i / (steps * 3)) * Math.PI * 2;
      if (open[Math.floor(i / 3)]) continue;
      const [x, y] = [hx + Math.cos(a) * (rx + 2.5), hy + Math.sin(a) * (ry + 2.2)];
      pxBox(g, Math.round(x * 4) / 4 - 0.5, Math.round(y * 4) / 4, 1.25, 0.75, '#2a2014');
      pxBox(g, Math.round(x * 4) / 4 - 0.5, Math.round(y * 4) / 4 + 0.75, 1.25, 0.25, '#7a6a44');
    }
  });
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const [x, y] = [hx + Math.cos(a) * rx, hy + Math.sin(a) * ry];
    if (open[i]) {
      if (!open[(i + steps - 1) % steps]) gaps.push({ i0: i, n: 0 });
      gaps.at(-1) && (gaps.at(-1).n += 1);
      continue;
    }
    if (taken.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) continue;
    m2EriPut(add, clump, x - 2, y - 4.5, y, [x - 1.6, y - 1.2, x + 1.6, y]);
  }
  return gaps.map(({ i0, n }) => {
    const a = ((i0 + (n - 1) / 2) / steps) * Math.PI * 2;
    return { a, x: hx + Math.cos(a) * rx, y: hy + Math.sin(a) * ry, n };
  });
}

function m2EriBree(L, plan, season, add) {
  const c = plan.places.bree;
  // Bree-hill behind the village to the north-east, its crown showing over the inn's roof.
  const G = m2EriGrass(season, 0.08);
  const hill = m2EriCanvas(`breehill${season}`, 20, 16, (g) => m2EriHill(g, 0, 0, 10, 4, 8, G, 0, 11));
  const [bx, by] = [c.x + 18, c.y - 22];
  m2Shadow(L, bx + 4, by, 10, 2.5, 0.85);
  m2EriPut(add, hill, bx - 10, by - 16, by, [bx - 8, by - 6, bx + 8, by]);
  // The Prancing Pony, east of the crossroads, its front to the road.
  const art = m2EriPonyArt(season);
  const [px, pz] = [c.x + 13, c.y + 8];
  const [x0, y0] = [px - 11, pz - 43];
  m2Shadow(L, px + 3, pz - 0.5, 13, 3, 0.85);
  m2EriPut(add, art, x0, y0, pz, [x0 + 0.5, pz - 9, x0 + 21.5, pz]);
  for (const p of art.panes) add.light({ pane: { ...p, x: x0 + p.x, y: y0 + p.y } });
  add.light({ x: x0 + 3, y: pz - 2, r: 7, c: '#ffc56a', fire: true });
  add.light({ x: x0 + 14, y: pz - 4, r: 5, c: '#ffb050' });
  if (typeof m2Smoke === 'function') { m2Smoke(add, x0 + 4.5, y0, 7); m2Smoke(add, x0 + 17.5, y0, 13); }
  m2EriState.door = { x: x0 + 3.75, y: pz + 1.5 };
  const taken = [{ x0: x0 - 1, y0: pz - 12, x1: x0 + 23, y1: pz + 3 }];
  const [hx, hy, rx, ry] = [c.x + 4, c.y - 1, 24, 17];
  const gaps = m2EriHedgeRing(L, plan, add, season, hx, hy, rx, ry, taken);
  for (const gp of gaps) {
    if (Math.sin(gp.a) > 0.6) {
      m2EriGate(add, gp.x, gp.y + 1, 8, true);
      m2EriHouseIf(L, plan, add, gp.x - 12, gp.y + 5, 12, 'slate', 'stone', 4, taken);
    } else if (Math.cos(gp.a) < -0.6) {
      m2EriGate(add, gp.x, gp.y + 1, 8, true);
      m2EriHouseIf(L, plan, add, gp.x + 6, gp.y - 6, 12, 'slate', 'stone', 3, taken);
    }
  }
  for (const [dx, dy, w, roof, wall, seed] of [[-11, -12, 14, 'thatch', 'timber', 1], [-12, 14, 13, 'thatch', 'stone', 5], [13, 26, 13, 'slate', 'timber', 2], [-13, 38, 13, 'thatch', 'timber', 6], [16, 44, 12, 'thatch', 'stone', 7]]) {
    m2EriHouseIf(L, plan, add, c.x + dx, c.y + dy, w, roof, wall, seed, taken);
  }
}
