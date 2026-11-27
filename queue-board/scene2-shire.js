// scene2-shire.js: the Shire on the map from above (scene2.js), the second machine's realm. Along the back is Hobbiton round the
// Hill: the Hill itself, a big turf-topped mound with Bag End dug in near its top (the biggest hole, its round green
// door on a terrace of lawn and flower beds behind a retaining wall, a path of steps down to the gate), the holes of
// Bagshot Row at its foot and more holes in the lower hills either side, each with its painted door, round windows,
// lantern, chimney and front garden behind a white picket fence (scene2-shire-hill.js, scene2-shire-holes.js), and the
// Party Tree in its field below Bag End (scene2-shire-oak.js). Hedges run along the hills' feet with gaps at the gates,
// whose paths run down to the road. In the open ground round the stations stand the well, the kettle, the cart, the
// vegetable garden and apple trees (scene2-shire-props.js), and the big pen with its beasts (scene2-shire-pen.js). At
// the bottom the Water runs under the Mill and widens into Bywater pool (scene2-shire-mill.js). Shire oaks stand about.
// Each thing gives the spot where a hobbit does its job there: 'door', 'water', 'brew', 'garden', 'cart', 'apples',
// 'feed' and 'mill'.

const M2_SHIRE_BACKS = new Map();
const M2_SHIRE_DOORS = ['yellow', 'red', 'blue', 'plum', 'green', 'red', 'yellow', 'blue'];
let m2ShireStat = null;

function m2Shire(L, r, plan, season, add) {
  const t0 = performance.now();
  const B = r.roadY - 9;
  const back = m2ShireBack(L, r, season, add, B);
  const t1 = performance.now();
  const front = m2ShireFront(L, r, plan, season, add);
  m2ShireStat = { ms: +(performance.now() - t0).toFixed(1), back: +(t1 - t0).toFixed(1), r: [r.x, r.y, r.w, r.h, r.back, r.roadY, r.ux0, r.ux1], block: r.block, spots: r.spots.map((s) => s.job), left: front.left, holes: back.P.holes.map((o) => [Math.round(o.x), Math.round(o.face), +o.hw.toFixed(1)]) };
  return back;
}

// The back of the realm, from its top down to row B: the hills with their holes and the Party Tree, painted as one
// canvas (it stands behind everything south of B), the hedges along B, and the paths from the gates to the road.
function m2ShireBack(L, r, season, add, B) {
  const top = r.y + 2;
  const D = B - top;
  const span = r.ux1 - r.ux0;
  const hp = Math.max(16, Math.min(30, D * 0.4));
  const hx = r.ux0 + span * (span > 140 ? 0.4 : 0.42);
  const rx = Math.min(52, span * 0.36);
  const ry = Math.min(30, D * 0.42);
  const ly = B - ry - 3;
  const lobes = [{ x: hx, y: ly, rx, ry, h: hp }, { x: hx - rx * 0.5, y: ly + ry * 0.2, rx: rx * 0.62, ry: ry * 0.75, h: hp * 0.62 }, { x: hx + rx * 0.35, y: ly - ry * 0.25, rx: rx * 0.6, ry: ry * 0.6, h: hp * 0.85 }];
  if (span >= 120) lobes.push({ x: r.ux0 + span * 0.07, y: B - D * 0.36, rx: span * 0.13, ry: D * 0.32, h: hp * 0.5 });
  const east = { x: r.ux1 - span * 0.1, y: B - D * 0.34, rx: span * 0.15, ry: D * 0.31, h: hp * 0.58 };
  if (span >= 110) lobes.push(east);
  const P = { x0: r.ux0 - 5, x1: r.ux1 + 5, top, base: B, lobes, holes: [], paths: [], season, seed: r.x + 7 };
  const nat = (x, y) => m2ShireHeight({ lobes, holes: [] }, x, y);
  // Bag End, near the top of the Hill: its yard dug back into the slope, its front where the slope falls below it.
  const fy = ly + ry * 0.1;
  const ledge = Math.max(3, nat(hx, fy) - 13);
  let front = fy + 5;
  while (front < fy + 14 && nat(hx, front) > ledge + 0.25) front += 0.5;
  P.holes.push({ x: hx, face: fy, bow: 2, hw: Math.min(18, rx * 0.6), front, ledge, paint: 'green', frame: 'yellow', big: true, windows: 4, bench: true, seed: 1 });
  P.paths.push({ x: hx, y0: front, y1: B, hw: 1.4, wig: 2.5 });
  // Bagshot Row: a low ridge along the Hill's foot with a row of smaller smials dug into it, packed into the stretches
  // either side of Bag End's path, the Party Field kept at the east end.
  lobes.push({ x: hx - rx * 0.1, y: B - D * 0.18, rx: span * 0.8, ry: Math.max(12, D * 0.2), h: 17 });
  const pr = span > 140 ? 13 : span > 105 ? 11 : 9;
  const fieldW = pr * 2.4 + 3;
  const segs = [[r.ux0 - 6, hx - 2], [hx + 4.5, r.x + r.w - 1 - fieldW]];
  let dug = 0;
  segs.forEach(([s0, s1], side) => {
    const k = Math.floor((s1 - s0 + 1) / 21);
    if (k < 1) return;
    const hw = Math.min(13.5, (s1 - s0 + 1) / k / 2 - 0.5);
    for (let j = 0; j < k; j += 1) {
      // West of the path they are packed toward it, east of it from it, where the Hill stands highest.
      const x = side ? s0 + hw + j * (hw * 2 + 1) : s1 - hw - j * (hw * 2 + 1);
      let face = null;
      for (let y = B - 8; y > B - 26; y -= 0.5) if (nat(x, y) >= (hw < 12 ? 11.5 : 12.5)) { face = y; break; }
      if (face === null) continue;
      const i = dug++;
      P.holes.push({ x, face, bow: 1.5, hw, front: B - 0.5, ledge: 0, small: hw < 12, paint: M2_SHIRE_DOORS[(i + r.x) % M2_SHIRE_DOORS.length],
        frame: ['green', 'yellow', 'green', 'blue', 'red'][i % 5], windows: 2, porch: i % 3 === 1, bench: hw > 11 && i % 3 === 2, butt: i % 2 === 0, seed: i + 2 });
    }
  });
  const feetHoles = P.holes.filter((o) => !o.ledge);
  const partyX = Math.min(r.x + r.w - 1 - fieldW / 2, Math.max(hx + rx * 0.78, ...feetHoles.filter((o) => o.x > hx).map((o) => o.x + o.hw + fieldW / 2)));
  const party = { x: partyX, y: B - 4, r: pr };
  const trees = lobes.filter((l) => l.h > 12).map((l, i) => ({ x: l.x + l.rx * (i % 2 ? -0.25 : 0.2), y: l.y - l.ry * 0.5, r: 6 })).filter((t) => !P.holes.some((o) => Math.abs(o.x - t.x) < o.hw && t.y > o.face - 10));
  // The canvas reaches only as far north as the hills do; the oaks behind them stand on the open land.
  P.top = Math.max(top, Math.min(...lobes.map((l) => l.y - l.ry)) - 1);
  const key = JSON.stringify([P, party, trees]);
  let art = M2_SHIRE_BACKS.get(key);
  if (!art) {
    const H = m2ShireHills(P);
    const holes = P.holes.map((o) => m2ShireHole(H.g, H, P, o));
    for (const t of trees.sort((a, b) => a.y - b.y)) {
      const oak = m2ShireOakArt(t.r, season, trees.indexOf(t) % 3);
      const [tx, ty] = H.at(t.x, t.y);
      H.g.drawImage(oak.c, tx - oak.fx, ty - oak.fy, oak.w, oak.h);
    }
    if (party) {
      const oak = m2ShireOakArt(party.r, season, 3, true);
      const [tx, ty] = H.at(party.x, party.y);
      H.g.globalAlpha = 0.3;
      m2Raster(H.g, tx - party.r * 1.2 + 1, ty - 1.25, party.r * 9, 12, (px, py) => (((px + 0.5) / (party.r * 4.5) - 1) ** 2 + ((py + 0.5) / 6 - 1) ** 2 < 1 ? '#1a2a14' : null));
      H.g.globalAlpha = 1;
      H.g.drawImage(oak.c, tx - oak.fx, ty - oak.fy, oak.w, oak.h);
      holes.party = { x: tx, y: ty - oak.fy + oak.cy, ...oak };
    }
    art = { H, holes };
    M2_SHIRE_BACKS.set(key, art);
  }
  const { H, holes } = art;
  // Each hill casts a soft shadow onto the land to its south-east.
  for (const l of lobes) if (l.h > hp * 0.8) m2Shadow(L, l.x + l.rx * 0.32, Math.min(B - 1, l.y + l.ry * 0.5), l.rx * 0.98, l.ry * 0.62, 0.55);
  add.obj({ x: H.x, y: H.y, w: H.w, h: H.h, z: B, c: H.c, draw: (g) => g.drawImage(H.c, H.x, H.y, H.w, H.h), foot: [P.x0, top, P.x1, B] });
  holes.forEach((h, i) => {
    for (const l of h.lights) {
      if (l.pane) add.light({ pane: { ...l.pane, x: l.pane.x + H.x, y: l.pane.y + H.y } });
      else add.light({ x: l.x + H.x, y: l.y + H.y, r: l.r, c: '#ffc56a' });
    }
    m2Smoke(add, h.smoke.x, h.smoke.y, i * 11 + 3);
  });
  if (holes.party) for (let i = 0; i < 5; i += 1) add.light({ x: H.x + holes.party.x - party.r + i * party.r * 0.5, y: H.y + holes.party.y + party.r * 0.6, r: 3, c: M2_SHIRE_LANTERN[i] });
  // The hedges along the hills' feet, broken at each picket fence, at Bag End's path and at the Party Field.
  const gaps = [...feetHoles.map((o) => [o.x - o.hw - 0.5, o.x + o.hw + 0.5]), [hx - 3, hx + 3], [party.x - 8, party.x + 8]].sort((a, b) => a[0] - b[0]);
  let x = r.ux0 - 4;
  for (const [g0, g1] of [...gaps, [r.x + r.w - 2, Infinity]]) {
    if (g0 - x > 3) m2Hedge(L, add, x, B + 0.25, g0 - x, season, Math.round(x));
    x = Math.max(x, g1);
  }
  for (const o of [...feetHoles, { x: hx }]) m2Path(L, [[o.x, B - 1], [o.x, r.roadY - 2]], 1.8);
  for (const o of feetHoles.slice(0, 3)) r.spots.push({ x: Math.round(o.x), y: B + 3.5, face: 'up', job: 'door' });
  // Oaks and apple trees behind the hills, half hidden by them.
  const n = Math.max(2, Math.floor(span / 26));
  for (let i = 0; i < n; i += 1) {
    const tx = r.ux0 + 6 + ((i + 0.5) / n) * (span - 12) + (m2Hash(i, 1, r.x) - 0.5) * 8;
    const ty = top + 10 + m2Hash(i, 2, r.x) * Math.max(2, ly - ry - top - 10);
    m2ShireOak(L, add, tx, ty, i % 3 === 1 ? 5 : 6 + (i % 2), season, i * 5 + 1, false, i % 3 === 1);
  }
  return { B, P };
}
