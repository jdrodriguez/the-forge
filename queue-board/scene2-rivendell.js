// scene2-rivendell.js: Rivendell on the map from above (scene2.js), the board host's realm, at the people's new size: a
// valley under a cliff, firs, beeches and birches thick along the cliff top and down its slopes in the season's colours;
// the Bruinen pouring over the cliff in a waterfall (strands that run, a curl of white at the lip, foam and spray on the
// pool) and running south down the valley's west side; the harp's seat and a lamp by the pool; the Last Homely House on
// its terrace east of the falls (scene2-rivendell-house.js) with steps down to the road; the elves' desks in the open
// ground below the road, kept clear; and in the lower valley the healing house with its bench, mortar and herbs, the
// pavilion with its rack of scrolls, the archery range where it fits (scene2-archery.js), and the white bridge over the
// Bruinen, joined by a path lit with lanterns (scene2-rivendell-garden.js). v1's four lamp posts stand beside the healing house, by the harp at the falls, at the
// pavilion's front corner and on the lower path at the far side of the bridge. The trees are scene2-rivendell-trees.js's.
// Each place an elf goes to is a spot with its job: falls, harp, read, heal, herbs, lamp, water and bridge.

const M2_RIV_WATER = ['#123352', '#19466a', '#225e84', '#2f7a9e', '#4f9dbb', '#a6dbe4', '#f4fbfc'];
const m2RivHit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const m2RivBox = (x, y, w, h) => ({ x0: x - w / 2, y0: y - h, x1: x + w / 2, y1: y + 2 });

function m2Rivendell(L, r, plan, season, add) {
  const t0 = performance.now();
  const river = plan.river;
  const top = 8;
  const cliff = river ? river.cliff : 20;
  const lip = (x) => r.y + top + Math.sin(x / 9) * 0.6;
  const foot = (x) => r.y + cliff + 1.2 * Math.sin(x / 13 + 1) + (m2Hash(Math.floor(x / 3), 1, 61) - 0.5) * 1.5;
  m2Cliff(L, r.x, r.x + r.w, lip, foot);
  const bank = (y) => (river ? river.cx(y) + river.hw(y) + 2 : r.x + 2);
  // What must stay in sight and clear: each station with the elf behind it, its name and bubble, and the road. Trees
  // also keep off the rows above the desk block where the elves stand, and every station's box (m2StationBox) with the 30 rows above it.
  const keep = [{ x0: r.x - 2, y0: r.roadY - 5, x1: r.x + r.w + 2, y1: r.roadY + 5 }];
  for (const s of plan.stations) if (s.realm === r) keep.push({ x0: s.x - 12, y0: s.hy - 40, x1: s.x + 12, y1: s.y + 3 });
  // Trees keep 3 units off every landmark's zone (pass 2: a fir stood on the Moria gate's roof).
  const shade = [{ x0: r.block.x0, y0: r.block.y0 - 30, x1: r.block.x1, y1: r.block.y0 + 2 }, ...Object.values(plan.zones ?? {}).map((z) => ({ x0: z.x0 - 3, y0: z.y0 - 3, x1: z.x1 + 3, y1: z.y1 + 3 }))];
  for (const s of plan.stations) {
    if (s.realm !== r) continue;
    const [bx0, by0, bx1, by1] = typeof m2StationBox === 'function' ? m2StationBox(s) : [s.x - 9, s.y - 18, s.x + 9, s.y + 1];
    shade.push({ x0: bx0, y0: by0 - 30, x1: bx1, y1: by1 + 1 });
  }
  const spots = [];
  const paths = [];
  const spot = (s) => { if (s) { spots.push(s); r.spots.push(s); } return s; };
  // The falls and a place to gaze at them; then the lower valley (the pavilion with the harp, the healing house, the
  // bridge), each where it fits clear of the desks. A healing house with no room there stands east of the pool instead.
  const wallY = r.y + r.back - 9;
  let pool = null;
  if (river) {
    m2RivFalls(add, river, lip(river.base));
    const py = river.pool.y + river.pool.ry + 4;
    pool = { x: bank(py) + 2, y: py };
    spot({ ...pool, face: 'up', job: 'falls' });
    paths.push([[pool.x, py + 1], [bank(r.roadY), r.roadY - 3]]);
  }
  const lower = m2RivLower(L, add, r, plan, season, { keep, bank, spot, paths });
  let hx = (river ? river.pool.x + river.pool.rx + 4 : r.ux0) + 1;
  if (!lower.heal) {
    const hy = wallY - 5;
    const H = m2RivHeal(L, add, spot, hx + 5 + 10, hy, season);
    paths.push([[H.heal.x, H.heal.y], [H.heal.x, r.roadY - 3]]);
    lower.boxes.push(H.box);
    r.heal = H;
    hx = H.box.x1 + 2;
  } else if (river) {
    r.heal = lower.heal;
    m2RivLampSpot(add, spot, hx + 4, pool.y + 6, 1);
    spot(m2RivBench(add, hx + 10, river.pool.y + 4, 'read'));
    hx += 14;
  }
  // The house on its terrace between the pool's side and the realm's east side.
  const house = m2RivHouse(L, add, { hx, room: Math.min(104, r.x + r.w - 9 - hx), base: wallY - 10, wallY, season });
  paths.push([[house.stepX, wallY + 5], [house.stepX, r.roadY - 3]]);
  for (const x of [house.stepX - 7, house.stepX + 7]) m2RivLantern(add, x, wallY + 6);
  for (const p of paths) m2RivWalk(L, p);
  const solid = [house.box, ...lower.boxes, ...keep, ...shade];
  r.rivMs = performance.now() - t0;
  add.late(() => m2RivPlant(L, add, r, plan, season, { solid, spots, paths, top, cliff, house, bank }));
}

// A footpath along pts, as m2Path draws one but painted in one pass (m2Stroke), over grass and the house's paving.
const M2_RIV_WALK = [M2_MAT.elf, M2_MAT.wild, M2_MAT.forest, M2_MAT.terrace, M2_MAT.sand, M2_MAT.path];
const m2RivWalk = (L, pts) => m2Stroke(L, pts, 2, M2_MAT.path, { over: M2_RIV_WALK });

// A stone reading bench with its foot at (x, y), the reader sitting facing south. Returns its spot.
function m2RivBench(add, x, y, job) {
  const S = M2_PAL.elfWall;
  const o = m2Thing(add, x - 5, y - 4, 10, 3.5, y - 0.5, (g) => {
    pxBox(g, 0, 0, 10, 1.25, S[5]);
    pxBox(g, 0, 1.25, 10, 0.5, S[1]);
    for (const px of [0.75, 7.75]) { pxBox(g, px, 1.75, 1.5, 1.75, S[3]); pxBox(g, px + 1, 1.75, 0.5, 1.75, S[1]); }
  });
  o.foot = [x - 5, y - 2.5, x + 5, y - 0.5];
  return { x, y, face: 'down', job };
}
// The healing house with its door at (x, y) (m2RivHealHouse), its healer's and herb-picker's spots, and v1's lamp
// beside it with its lamplighter's spot. Returns the house's spots and box.
function m2RivHeal(L, add, spot, x, y, season) {
  const H = m2RivHealHouse(L, add, x, y, season);
  spot(H.heal);
  spot(H.herbs);
  spot(H.mortar);
  m2RivLampSpot(add, spot, x - 15, y + 5, 1);
  return H;
}
// A tall lamp post at (x, y) with the place beside it where the elf who lights it stands.
function m2RivLampSpot(add, spot, x, y, side) {
  const light = m2RivLamp(add, x, y, side);
  spot({ x: x - side * 5, y: y + 1, face: side > 0 ? 'left' : 'right', job: 'lamp', lamp: { x: light.x, y: light.y, light } });
}

// Lays out the lower valley below the desks: tries places for the healing house, the pavilion and the bridge in turn,
// each clear of the kept boxes and of each other, with the lower path joining them and v1's lamps beside them.
function m2RivLower(L, add, r, plan, season, { keep, bank, spot, paths }) {
  const river = plan.river;
  const boxes = [];
  const y0 = r.roadY + 8;
  // The lowest row keeps 8 units off the realm's foot, so nothing stands on the land south of it.
  const [x1, y1] = [r.x + r.w + 1, r.f1 - 6];
  // Each thing keeps 4 units of open ground from the others and 8 from the landmarks' zones (Moria's gate draws its
  // rubble and bushes past its zone), and stays off Caradhras's western slope, which rises over the realm's south-east
  // corner (pass 2, 2026-11-27: the south end was packed).
  const pad = (b, d) => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });
  const zones = Object.values(plan.zones ?? {}).map((z) => pad(z, 8));
  const red = plan.places.caradhras;
  if (red) {
    const cy = Math.min(red.y, Math.min(plan.zones?.moriaWest?.y0 ?? 1e9, plan.zones?.moriaEast?.y0 ?? 1e9) - 8);
    zones.push({ x0: red.x - 40, y0: cy - 56, x1: red.x + 40, y1: cy + 20 });
  }
  const ground = (x, y) => [M2_MAT.elf, M2_MAT.wild, M2_MAT.forest].includes(m2MatAt(L, x, y));
  // The Misty Mountains' western foot at a row (their line, plus the foothills drawn west of it).
  const misty = plan.ranges?.misty ?? [];
  const foot = (y) => { const k = misty.findIndex(([, py]) => py > y); if (k < 1) return Infinity; const [[ax, ay], [bx, by]] = [misty[k - 1], misty[k]]; return ax + ((bx - ax) * (y - ay)) / (by - ay) - 22; };
  const clear = (b) => b.x0 >= Math.max(r.x, bank(b.y1) - 1) && b.x1 <= Math.min(x1, foot(b.y0), foot(b.y1)) && ![...keep.map((k) => pad(k, 3)), ...boxes.map((k) => pad(k, 4)), ...zones].some((k) => m2RivHit(b, k))
    && ground(b.x0 + 1, b.y1 - 2) && ground(b.x1 - 1, b.y1 - 2) && ground((b.x0 + b.x1) / 2, b.y1 - 6) && ground(b.x0 + 1, b.y1 - 9) && ground(b.x1 - 1, b.y1 - 9);
  const find = (w, h, ox, prefer, yMax = y1) => {
    let best = null;
    for (let y = yMax; y >= y0 + h - 2; y -= 2) {
      for (let x = r.x + w / 2; x <= x1 - w / 2; x += 2) {
        const b = { x0: x - w / 2 + ox, y0: y - h, x1: x + w / 2 + ox, y1: y + 2 };
        if (!clear(b)) continue;
        const d = Math.abs(x - prefer) + (y1 - y) * 0.5;
        if (!best || d < best.d) best = { x, y, d, b };
      }
    }
    if (best) boxes.push(best.b);
    return best;
  };
  const midX = (Math.max(bank(y1), r.x) + x1) / 2;
  const out = { boxes };
  const pathPts = [];
  // The healing house toward the river, the pavilion east of it on the same lower path. Both are placed before either is
  // drawn: where the pavilion finds no room beside the house it is placed first and the house tries a narrower box (its
  // lamp then overhangs it), and a short valley lets the pavilion stand on the valley's foot itself, as before pass 2.
  const toRiver = Math.max(bank(y1), r.x) + 30;
  let heal = find(40, 35, -0.5, toRiver);
  let pav = find(28, 44, 0, x1 - 18) ?? find(28, 44, 0, x1 - 18, r.f1 + 2);
  if (!pav && heal) {
    boxes.splice(boxes.indexOf(heal.b), 1);
    pav = find(28, 44, 0, x1 - 18) ?? find(28, 44, 0, x1 - 18, r.f1 + 2);
    heal = find(40, 35, -0.5, toRiver) ?? find(36, 35, 1.5, toRiver);
  }
  if (heal) {
    out.heal = m2RivHeal(L, add, spot, heal.x, heal.y - 6, season);
    pathPts.push([heal.x, heal.y]);
  }
  if (pav) {
    const P = m2RivPavilion(L, add, pav.x, pav.y - 9);
    P.spots.forEach(spot);
    // Its lamp on whichever side has open ground, west first: the east side faces the mountains and Moria's gate.
    const lampOk = (x) => x > Math.max(r.x, bank(pav.y)) + 4 && x < r.x + r.w - 4 && ![...zones, ...boxes.filter((b) => b !== pav.b)].some((k) => m2RivHit({ x0: x - 7, y0: pav.y - 23, x1: x + 7, y1: pav.y + 2 }, k));
    const side = lampOk(pav.x - 15) ? -1 : 1;
    if (side < 0 || lampOk(pav.x + 15)) m2RivLampSpot(add, spot, pav.x + side * 15, pav.y - 2, -side);
    pathPts.push([pav.x, pav.y]);
  }
  // The archery range, where it fits: a straw target and the line an elf shoots from (scene2-archery.js), off the lower
  // path's row.
  const pathRow = pathPts.length ? Math.min(...pathPts.map((p) => p[1])) + 1 : null;
  if (pathRow !== null) boxes.push({ x0: r.x, y0: pathRow - 2, x1: Math.max(...pathPts.map((p) => p[0])) + 2, y1: pathRow + 2 });
  const range = find(32, 22, 0, midX);
  if (range) m2bowRange(L, add, range.b).forEach(spot);
  if (river && pathPts.length) {
    // The bridge crosses at the lower path's row, with lamp four on the far bank; the water spot on the near bank.
    const by = pathRow;
    const [wx0, wx1] = [river.cx(by) - river.hw(by) - 1, river.cx(by) + river.hw(by) + 1];
    paths.push([[wx1 + 2, by], ...pathPts.sort((a, b) => a[0] - b[0]).map(([x]) => [x, by])]);
    paths.push([[wx1 + 6, by], [bank(r.roadY + 6) + 2, r.roadY + 3]]);
    add.late(() => {
      spot(m2RivBridge(L, add, wx0, wx1, by));
      if (wx0 - r.x > 10) m2RivLampSpot(add, spot, wx0 - 5, by - 4, 1);
      m2RivWalk(L, [[r.x + 1, by], [wx0 - 1, by]]);
    });
    const wy = Math.round((by + r.block.y1) / 2);
    spot({ x: bank(wy) + 1, y: wy, face: 'left', job: 'water' });
    boxes.push({ x0: wx0 - 10, y0: by - 12, x1: wx1 + 4, y1: by + 8 });
  }
  return out;
}

// The waterfall over the cliff where the river begins: four frames of strands running down (lit in the middle, deep at
// the edges), a white curl over the lip and foam where it lands, cycled every other tick (held still with reduced motion).
function m2RivFalls(add, river, lipY) {
  const hw = river.hw(river.top) + 1.5;
  const [x0, y0] = [river.base - hw, lipY - 0.5];
  const h = river.top + 3 - y0;
  const frames = [0, 1, 2, 3].map((k) => {
    const { c, g } = m2Canvas(hw * 2, h);
    m2RivRaster(g, 0, 0, hw * 8, h * 4, (px, py) => {
      const e = Math.abs(px + 0.5 - hw * 4) / (hw * 4);
      const s = Math.floor(px / 3);
      const v = (py - k * 5 + Math.floor(m2Hash(s, 1, 62) * 24)) % 18;
      if (py < 3) return M2_RIV_WATER[py === 0 ? 5 : 6];
      if (py > h * 4 - 7) return (px + py + k) % 3 ? M2_RIV_WATER[6] : M2_RIV_WATER[5];
      if (e > 0.92) return M2_RIV_WATER[1];
      let i = e > 0.75 ? 2 : e > 0.45 ? 3 : 4;
      if (v < 2) i = Math.min(6, i + 2); else if (v < 5) i += 1; else if (v > 15) i -= 1;
      return M2_RIV_WATER[i];
    });
    return c;
  });
  const f = (g, tick, reduced) => g.drawImage(frames[reduced ? 0 : (tick >> 1) & 3], x0, y0, hw * 2, h);
  f.under = true;
  add.anim(f);
  const spray = (g, tick, reduced) => {
    g.fillStyle = '#f4fbfc';
    for (let i = 0; i < 8; i += 1) {
      const t = ((reduced ? i * 4 : tick) + i * 5) % 16;
      g.globalAlpha = 0.8 - t / 20;
      g.fillRect(Math.round((river.base + (m2Hash(i, 2, 62) - 0.5) * hw * 2.4) * 4) / 4, Math.round((river.top + 2 - t * 0.25) * 4) / 4, 0.5, 0.5);
    }
    g.globalAlpha = 1;
  };
  spray.over = true;
  add.anim(spray);
}
