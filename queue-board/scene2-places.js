// scene2-places.js: the mountains' places on the map from above (scene2.js), and the small building kit other places
// share: the eagles' eyries (nests of sticks on the three highest summits of the northern Misty Mountains, which set
// plan.places.eyries for the eagles), the cairn where the road tops the High Pass, Goblin-town's gate (a black cleft in
// a crag at the mountains' foot, a torch glowing in it at night), and Edoras on its hill when no machine holds Rohan.
// The wilds have their own files: scene2-land-eriador*.js (Bree, Weathertop, the Trollshaws, the Barrow-downs, the
// Withywindle) and scene2-land-vale*.js and scene2-land-lake*.js (the Carrock, Beorn, Rhosgobel, Dale, Lake-town).

// A cottage w units wide with its front on row y, centred on x: a hipped roof over a wall with a door and a window.
function m2Cottage(L, add, x, y, w, roof, wall, kind = 'plaster') {
  const [near, wh] = [Math.round(w * 0.45), Math.max(4, Math.round(w * 0.38))];
  const h = 2 + near + 1 + wh;
  let pane = null;
  m2Shadow(L, x + 2, y + 0.3, w / 2 + 1.5, 1.6, 0.8);
  m2Thing(add, x - w / 2, y - h, w, h, y, (g) => {
    m2Roof(g, 0, 0, w, 2, near, roof, Math.min(3, w / 4));
    m2Wall(g, 0.5, 3 + near, w - 1, wh, wall, kind);
    pxBox(g, w * 0.3, h - 3, 1.75, 3, M2_PAL.wood[1]);
    pane = m2Window(g, w * 0.6, 3 + near + 1.25, 2, 2, wall, 'square');
  });
  add.light({ pane: { ...pane, x: x - w / 2 + pane.x, y: y - h + pane.y } });
  add.light({ x: x + w * 0.1, y: y - 2, r: 5, c: '#ffc56a' });
}
// A hill r units across with its foot on row y: grass lit on its upper left (with rock showing where kind is 'rock').
function m2Mound(L, add, x, y, rx, ry, G, draw) {
  m2Shadow(L, x + rx * 0.3, y, rx + 1, 2.5, 0.8);
  m2Thing(add, x - rx, y - ry, rx * 2, ry + 0.5, y, (g) => {
    m2Raster(g, 0, 0, rx * 8, ry * 4 + 2, (px, py) => {
      const [nx, ny] = [(px + 0.5 - rx * 4) / (rx * 4), (py + 0.5 - ry * 4) / (ry * 4)];
      const d = nx * nx + ny * ny;
      if (d > 1 && py < ry * 4) return null;
      if (py >= ry * 4) return Math.abs(nx) < 0.95 ? G[0] : null;
      if (d > 0.92) return G[0];
      const lit = -0.5 * nx - 0.55 * ny + M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.25 - 0.05;
      return G[lit > 0.7 ? 5 : lit > 0.45 ? 4 : lit > 0.2 ? 3 : lit > -0.05 ? 2 : 1];
    });
    draw?.(g);
  });
}
// A tower w wide and h tall standing at (x, y) in stone P: lit on its left, shaded on its right, a crown of horns.
function m2Tower(L, add, x, y, w, h, P, horns) {
  m2Shadow(L, x + w * 0.8, y, w + 2, 2, 0.9);
  m2Thing(add, x - w / 2 - 1, y - h - 3, w + 2, h + 3, y, (g) => {
    m2Raster(g, 0, 0, (w + 2) * 4, (h + 3) * 4, (px, py) => {
      const c = px - 4;
      if (py < 12) return horns && [0, 1, (w * 4) / 2 - 1, (w * 4) / 2, w * 4 - 2, w * 4 - 1].some((k) => Math.abs(c - k) < 1.5 + py / 6) && c >= 0 && c < w * 4 ? P[c < w * 2 ? 3 : 1] : null;
      const inset = py < 16 ? 0 : Math.max(0, Math.round(((py - 16) / (h * 4)) * -3));
      if (c < inset - 1 || c > w * 4 - inset) return null;
      if (c <= inset || c >= w * 4 - inset - 1) return P[0];
      return P[(py % 14 === 0 ? 1 : 0) + (c < w * 1.2 ? 4 : c < w * 2.4 ? 3 : 2)];
    });
  });
}

function m2Places(L, plan, season, add) {
  const P = plan.places;
  if (!plan.realms.some((r) => r.kind === 'man')) {
    m2Mound(L, add, P.edoras.x, P.edoras.y + 4, 13, 7, m2GrassHex(M2_MAT.man, season));
    m2Cottage(L, add, P.edoras.x, P.edoras.y - 1, 18, M2_PAL.gold, M2_PAL.wood, 'timber');
  }
  m2PlaceEyries(plan, add);
  m2PlacePass(L, plan, add);
  m2PlaceGoblinGate(L, plan, add);
}
// The eagles' eyries: the three highest summits of the Misty Mountains' northern half, each with a nest of sticks on
// its top (the eagles perch there).
function m2PlaceEyries(plan, add) {
  const tops = (plan.peaks?.misty ?? []).filter((t) => t.foot < plan.H * 0.4 && !t.red).sort((a, b) => b.h - a.h);
  const pick = [];
  for (const t of tops) if (pick.length < 3 && pick.every((p) => Math.hypot(p.x - t.x, p.foot - t.foot) > 24)) pick.push(t);
  if (pick.length) plan.places.eyries = pick.map((t) => ({ x: t.x, y: t.y + 1, foot: t.foot }));
  for (const e of plan.places.eyries ?? []) {
    // A wide ring of sticks, lit on its upper left, its hollow dark with a down lining.
    const nest = m2PlaceArt('nest', 11, 4.5, (px, py) => {
      const [nx, ny] = [(px - 21.5) / 22, (py - 9) / 9];
      const d = Math.hypot(nx, ny);
      if (d > 1) return null;
      if (d < 0.5) return ny < -0.1 ? '#2a1c12' : '#cfc6b0';
      if (d > 0.88) return '#1e140a';
      const k = (px * 3 + py * 7 + (px >> 1)) % 6;
      return (ny < 0 ? ['#a8864e', '#c8a466', '#8a6a3c'] : ['#5a4026', '#6e5230', '#4a321c'])[k % 3] ?? '#6e5230';
    });
    add.obj({ x: e.x - 5.5, y: e.y - 2.25, w: 11, h: 4.5, z: e.foot + 0.3, draw: (g) => g.drawImage(nest, e.x - 5.5, e.y - 2.25, 11, 4.5) });
  }
}
// The High Pass: where the road over the Misty Mountains tops out, a cairn of grey stones beside it.
function m2PlacePass(L, plan, add) {
  const hp = plan.places.highPass;
  if (!hp) return;
  let best = null;
  for (const road of plan.roads ?? []) {
    for (let s = 0; s < road.pts.length - 1; s += 1) {
      const [[ax, ay], [bx, by]] = [road.pts[s], road.pts[s + 1]];
      const [vx, vy] = [bx - ax, by - ay];
      const t = Math.max(0, Math.min(1, ((hp.x - ax) * vx + (hp.y - ay) * vy) / (vx * vx + vy * vy || 1)));
      const [x, y] = [ax + vx * t, ay + vy * t];
      const d = Math.hypot(x - hp.x, y - hp.y);
      if (!best || d < best.d) best = { d, x, y: y - road.hw - 1.5 };
    }
  }
  if (!best || best.d > 30) return;
  const cairn = m2PlaceArt('cairn', 5, 6, (px, py) => {
    const w = 3 + py * 0.75;
    const c = 10 + (py % 4 < 2 ? 0.5 : -0.5);
    if (Math.abs(px - c) > w || py > 23) return null;
    if (Math.abs(px - c) > w - 1 || (py % 4 === 3 && px % 5 !== 0)) return M2_PAL.stone[0];
    return M2_PAL.stone[px < c - 1 ? 5 : px < c + 2 ? 4 : 2];
  });
  m2Shadow(L, best.x + 1.5, best.y, 3, 1, 0.8);
  add.obj({ x: best.x - 2.5, y: best.y - 6, w: 5, h: 6, z: best.y, foot: [best.x - 2, best.y - 1.5, best.x + 2, best.y], draw: (g) => g.drawImage(cairn, best.x - 2.5, best.y - 6, 5, 6) });
  plan.places.passTop = { x: best.x, y: best.y };
}
// Goblin-town's gate: a broken crag set into the Misty Mountains' foot on gollumCave's row, the nearest slope to it,
// with a tall black cleft under a jutting brow, a torch's glow in it at night, and a trampled ledge before it with a few
// pale bones.
function m2PlaceGoblinGate(L, plan, add) {
  const c = plan.places.gollumCave;
  if (!c) return;
  const F = plan.fields?.misty;
  let gx = c.x;
  for (let d = 0; d < 40; d += 0.5) {
    const hit = [c.x + d, c.x - d].find((x) => m2MtHeightAt(F, x, c.y - 3) > 5);
    if (hit !== undefined) { gx = hit + (hit > c.x ? -2 : 2); break; }
  }
  const R = M2_STONE.misty[0];
  const crag = m2PlaceArt('goblinCrag', 18, 14, (px, py) => {
    const nx = (px - 35.5) / 36;
    const top = 6 + Math.abs(nx) * 34 - Math.max(0, 9 - Math.abs(px - 18) * 1.2) - Math.max(0, 7 - Math.abs(px - 52) * 1.1) + (m2Hash(px >> 1, 5, 77) - 0.5) * 3;
    if (py < top || py > 55) return null;
    const cleft = Math.abs(px - 35 - (py > 40 ? 0 : (40 - py) * 0.08)) < 4.5 - Math.max(0, 30 - py) * 0.35 && py > 22;
    if (cleft) return py < 25 ? R[0] : '#040306';
    if (py < top + 1.5) return R[0];
    if (py >= 19 && py <= 21 && Math.abs(px - 35) < 9) return R[py === 21 ? 0 : 1];
    const lit = -nx * 0.7 + (m2Hash(px >> 2, py >> 1, 78) - 0.5) * 0.6 - (py - top) * 0.012;
    if (m2Hash(px >> 1, py >> 2, 79) < 0.06) return R[1];
    return R[lit > 0.4 ? 5 : lit > 0.05 ? 4 : lit > -0.3 ? 3 : 2];
  });
  const [x, y] = [gx - 9, c.y + 2];
  m2Blob(L, gx, y + 2.5, 7, 2.5, M2_MAT.path, { wob: 1, seed: 61, aux: (nx, ny) => Math.hypot(nx, ny) * 200 });
  L.decals.push((g) => {
    for (const [bx, by, w] of [[-4, 2.25, 1.5], [3, 3, 1.25], [5, 1.75, 0.75], [-2, 3.5, 1]]) { g.fillStyle = '#d8d0b8'; g.fillRect(gx + bx, y + by, w, 0.25); g.fillRect(gx + bx, y + by - 0.25, 0.25, 0.75); }
  });
  add.obj({ x, y: y - 14, w: 18, h: 14, z: y, foot: [x + 1, y - 4, x + 17, y], draw: (g) => g.drawImage(crag, x, y - 14, 18, 14) });
  add.light({ x: gx, y: y - 3, r: 5, c: '#ff8a3a', fire: true });
}
const m2PlaceArts = new Map();
// A small thing painted once w by h units through rule(px, py) at 4 pixels a unit, cached by name.
function m2PlaceArt(name, w, h, rule) {
  if (!m2PlaceArts.has(name)) {
    const { c, g } = m2Canvas(w, h);
    m2Raster(g, 0, 0, w * 4, h * 4, rule);
    m2PlaceArts.set(name, c);
  }
  return m2PlaceArts.get(name);
}
