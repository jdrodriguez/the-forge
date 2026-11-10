// scene2-edoras.js: Edoras on the map from above (scene2-rohan.js calls it for the first machine with no realm of its
// own). Meduseld on its green hill: the long hall under a roof of golden thatch that shines, its ridge ending in crossed
// gable boards carved as horses' heads, a gabled porch on carved pillars over its doors, and a broad stair of stone
// down the hill's face to the gate; a wall of sharpened timber stakes round the hill's foot, its gate between two
// timber towers flying Rohan's green banners; a stone basin by the stair's foot where water falls from a horse-head
// spout. The stables, horses and the barrows white with simbelmyne are scene2-edoras-stable.js's.

const M2_EDO_GOLD = ['#4a3010', '#7a561a', '#a87e2a', '#d0a63c', '#ecc85a', '#fff0a2'];
const M2_EDO_HILL = ['#25461f', '#335e28', '#437733', '#56903f', '#6fa84c', '#94c46a'];
const M2_EDO_TIMBER = ['#24140e', '#40261a', '#5e3a24', '#80542f', '#a8763f', '#cf9e5e'];

// The layout from the realm's box. The hill is seen as its flat top (an ellipse, the plateau the hall stands on) and its
// south face below it falling to its foot (a wider, flatter ellipse whose front edge is just above the road); hz is how
// tall the face stands. Also whether a box is free of the zones other areas draw their landmarks in.
function m2EdoLayout(r) {
  const span = r.ux1 - r.ux0;
  const cx = Math.round((r.ux0 + r.ux1) / 2);
  const hb = r.roadY - 5.5;
  const H = hb - r.y;
  const hw = Math.max(30, Math.min(48, Math.round(span * 0.34)));
  const hx = Math.round(cx - Math.min(6, span * 0.04));
  const hz = Math.max(11, Math.min(30, Math.round(H * 0.42)));
  const [prx, pry] = [hw / 2 + 4, Math.max(3.5, Math.min(7, H * 0.08))];
  const [frx, fry] = [prx + 10, pry + 2.5];
  const fcy = hb - fry;
  const pcy = fcy - hz;
  const zones = Object.values(r.plan.zones ?? {});
  const free = (x0, y0, x1, y1) => !zones.some((z) => x1 > z.x0 && x0 < z.x1 && y1 > z.y0 && y0 < z.y1);
  return { r, cx, hx, hb, hw, hz, prx, pry, pcy, frx, fry, fcy, rx: frx, ry: fry, hy: fcy, hallZ: pcy + pry * 0.55,
    wall: Math.max(11, Math.min(14, Math.round(H * 0.22))), free, spots: [],
    keep: [r.block, { x0: r.block.x0, y0: r.block.y0 - 32, x1: r.block.x1, y1: r.block.y0 }] };
}

function m2EdoEdoras(L, r, plan, season, add) {
  const D = m2EdoLayout(r);
  m2EdoHill(L, D, season);
  m2EdoPalisade(L, add, D);
  m2EdoHall(L, add, D);
  m2EdoHouses(L, add, D, season);
  m2EdoGuard(L, add, D);
  m2EdoWell(L, add, D);
  m2EdoStables(L, add, D, season);
  m2EdoBarrows(L, add, D, season);
  m2EdoTrain(L, add, D);
  r.spots.push(...D.spots);
}

// The hill: its flat top lit and grassy, its south face falling to the foot, lit on the west and shaded on the east,
// darker toward the foot with ledges of turf; the dike's dark earth round the foot; and the stair of stone climbing the
// face from the gate to the hall's porch. Painted once per size into a canvas.
function m2EdoHill(L, D, season) {
  const { hx, frx, fry, fcy, prx, pry, pcy, hb, hz } = D;
  const [x0, y0, w, h] = [hx - frx - 3, pcy - pry - 1, frx * 2 + 6, hb + 2.5 - (pcy - pry - 1)];
  m2Blob(L, hx, fcy, frx + 2, fry + 2, M2_MAT.hobbit);
  D.keep.push({ x0, y0, x1: x0 + w, y1: y0 + h });
  const key = `edoHill${w},${h},${hz},${pry},${season}`;
  if (!m2EreArt.has(key)) {
    const tint = season === 'winter' ? '#dce6ea' : season === 'autumn' ? '#b39a3c' : null;
    const P = tint ? M2_EDO_HILL.map((c) => hdMix(c, tint, season === 'winter' ? 0.35 : 0.2)) : M2_EDO_HILL;
    const S = M2_PAL.stone;
    const [ox, oy] = [hx - x0, 0];
    m2EreArt.set(key, m2EreImage(w, h, (px, py) => {
      const [x, y] = [px / 4 - ox, y0 + py / 4];
      const dith = M2_BAYER[(py & 3) * 4 + (px & 3)];
      const inTop = (x / prx) ** 2 + ((y - pcy) / pry) ** 2 < 1;
      const rim = Math.abs(x) < prx ? pcy + pry * Math.sqrt(1 - (x / prx) ** 2) : null;
      const front = Math.abs(x) < frx ? fcy + fry * Math.sqrt(1 - (x / frx) ** 2) : null;
      const edge = Math.abs(x) < frx ? pcy + (fcy - pcy) * (1 - Math.sqrt(1 - (x / frx) ** 2)) : null;
      const ring = ((x / (frx + 2.5)) ** 2 + ((y - fcy) / (fry + 2)) ** 2 < 1) && !(front !== null && y < front);
      if (ring) return y > fcy ? (dith < 0.5 ? '#4a3a22' : '#5e4a2c') : null;
      if (inTop) {
        if (Math.abs(x) < 3.5 && y > pcy) return S[(py % 6 === 0) ? 5 : 3];
        const k = 3 + (x < 0 ? 1 : 0) + (dith > 0.8 ? 1 : 0) - ((x / prx) ** 2 + ((y - pcy) / pry) ** 2 > 0.85 ? 1 : 0);
        return P[Math.max(0, Math.min(5, k))];
      }
      if (front === null || y > front || (rim === null && y < edge) || (rim !== null && y < rim)) return null;
      // The stair down the face: treads lit along their noses, kerbs either side.
      if (Math.abs(x) < 3.5) return Math.abs(x) > 2.75 ? S[1] : (py % 6 === 0 ? S[5] : py % 6 === 5 ? S[1] : S[3]);
      const t = (y - (rim ?? edge)) / Math.max(1, front - (rim ?? edge));
      let k = 3 + (x < 0 ? 0.6 : -0.9) - t * 1.6 + (dith - 0.5) * 1.1 + (Math.abs(x) / frx) * (x < 0 ? 0.4 : -0.6);
      if (Math.floor(t * 4 + m2Hash(px >> 3, 0, 86) * 0.4) !== Math.floor((t - 0.03) * 4 + m2Hash(px >> 3, 0, 86) * 0.4)) k -= 1.2;
      return P[Math.max(0, Math.min(5, Math.floor(k)))];
    }).c);
  }
  const art = m2EreArt.get(key);
  L.decals.push((g) => g.drawImage(art, x0, y0, w, h));
  m2Shadow(L, hx + frx * 0.3, hb, frx * 0.9, 2.5, 0.6);
}

// One stake of the wall, 1.25 units wide and h tall, pointed, lit on its left.
function m2EdoStake(g, x, y, h) {
  const T = M2_EDO_TIMBER;
  m2Raster(g, x, y, 5, h * 4, (px, py) => (py < 3 && Math.abs(px - 2) > py ? null : px === 4 || py === h * 4 - 1 ? T[0] : py < 3 ? T[5] : T[px < 2 ? 4 : 3]));
}
// The wall of stakes round the hill's foot: its back arc behind the hall in one piece, its front arc in short runs each
// sorted at its own row, the gate's gap in the middle between two towers flying banners.
function m2EdoPalisade(L, add, D) {
  const { hx, hy, rx, ry } = D;
  const [ax, ay] = [rx + 1.5, ry + 0.5];
  const gap = 6.5;
  const pts = [];
  for (let a = 0; a < Math.PI * 2; a += 1.25 / ((ax + ay) / 2)) pts.push([hx + Math.cos(a) * ax, hy + Math.sin(a) * ay]);
  const back = pts.filter(([x, y]) => y < hy && Math.abs(x - hx) > D.frx * 0.88);
  const sh = 3.5;
  const o = m2Thing(add, hx - ax - 1, hy - ay - sh - 1, ax * 2 + 3, ay + sh + 2, hy, (g) => {
    for (const [x, y] of back.sort((p, q) => p[1] - q[1])) m2EdoStake(g, x - (hx - ax - 1), y - sh - (hy - ay - sh - 1), sh);
  });
  o.foot = null;
  const front = pts.filter(([x, y]) => y >= hy && Math.abs(x - hx) > gap).sort((p, q) => p[0] - q[0]);
  for (let i = 0; i < front.length; i += 6) {
    const run = front.slice(i, i + 6);
    const [rx0, rx1] = [Math.min(...run.map((p) => p[0])) - 1, Math.max(...run.map((p) => p[0])) + 1.5];
    const [ry0, ry1] = [Math.min(...run.map((p) => p[1])) - sh, Math.max(...run.map((p) => p[1]))];
    const t = m2Thing(add, rx0, ry0, rx1 - rx0, ry1 - ry0 + 0.5, ry1, (g) => {
      for (const [x, y] of run.sort((p, q) => p[1] - q[1])) m2EdoStake(g, x - rx0 - 0.6, y - sh - ry0, sh);
    });
    t.foot = [rx0, ry1 - 2, rx1, ry1];
  }
  // The gate towers either side of the gap, each a timber box under a pyramid of thatch, and the banners.
  const gy = hy + ay;
  for (const side of [-1, 1]) {
    const tx = hx + side * (gap + 1.5);
    m2Shadow(L, tx + 1.5, gy + 0.5, 3, 1, 0.8);
    const tw = m2Thing(add, tx - 2.5, gy - 12, 5, 12.5, gy + 0.5, (g) => {
      m2Wall(g, 0.25, 5, 4.5, 7.5, M2_EDO_TIMBER, 'timber');
      m2Raster(g, 0, 0, 20, 22, (px, py) => (Math.abs(px + 0.5 - 10) > 2 + py * 0.4 ? null : py === 21 ? M2_EDO_GOLD[0] : M2_EDO_GOLD[px < 10 ? 4 : 2]));
      m2Raster(g, 1.5, 7, 8, 4, (px) => (px % 3 === 0 ? '#120a08' : null));
    });
    tw.foot = [tx - 2.5, gy - 2, tx + 2.5, gy + 0.5];
    m2EdoBanner(add, tx + side * 0.2, gy - 12.5, side);
  }
  D.gate = { x: hx, y: gy };
}
// A banner on a pole over a tower: green with a white horse's blaze, rippling as it flies the way the wind blows.
function m2EdoBanner(add, x, y, seed) {
  const frames = m2EreArt.get('edoFlag') ?? [0, 1, 2, 3].map((k) => m2EreImage(6, 3, (px, py) => {
    const wave = Math.round(Math.sin((px + k * 6) / 4) * 1.5);
    const yy = py - wave - 1;
    if (yy < 0 || yy > 8 - px / 6 || px > 22) return null;
    if (yy === 0) return '#2a6a2a';
    if (px > 6 && px < 12 && yy > 2 && yy < 6) return '#f4f0e0';
    return wave > 0 ? '#3f8a3a' : '#2f7230';
  }).c);
  m2EreArt.set('edoFlag', frames);
  const f = (g, tick, reduced) => {
    pxBox(g, x, y - 4, 0.25, 4.5, M2_EDO_TIMBER[1]);
    const dir = (m2.wind?.at?.(x, y, tick) ?? 1) < 0 ? -1 : 1;
    const c = frames[reduced ? 0 : (tick + seed * 2 + 8) % 4];
    if (dir > 0) g.drawImage(c, x + 0.25, y - 4, 6, 3);
    else { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(c, 0, y - 4, 6, 3); g.restore(); }
  };
  f.over = true;
  f.m2own = true;
  add.anim(f);
}

// Meduseld: timber walls under the golden roof, the porch's gable over its doors, horse-head finials, lit windows.
function m2EdoHall(L, add, D) {
  const { hx, hw, hallZ, wall } = D;
  const [far, near] = [3, Math.round(hw * 0.33)];
  const h = far + near + 1 + wall;
  const x0 = hx - hw / 2;
  const y0 = hallZ - h;
  m2Shadow(L, hx + 4, hallZ + 0.5, hw / 2 + 3, 3, 0.8);
  const panes = [];
  const o = m2Thing(add, x0 - 1, y0 - 3, hw + 2, h + 3.5, hallZ + 0.5, (g) => {
    m2Wall(g, 1, far + near + 1, hw, wall, M2_EDO_TIMBER, 'timber');
    for (let x = 4; x < hw - 2; x += 7) pxBox(g, 1 + x, far + near + 1, 0.75, wall, M2_EDO_GOLD[2]);
    pxBox(g, 1, far + near + 3, hw, 0.75, '#2f7230');
    for (const dx of [6, 13, hw - 16, hw - 9]) panes.push(m2Window(g, 1 + dx, far + near + 4.5, 2.5, 4, M2_EDO_TIMBER, 'square'));
    m2Roof(g, 1, 3, hw, far, near, M2_EDO_GOLD, 0);
    // Gold glints in the thatch, the sheen the Riders saw from far off.
    m2Raster(g, 1, 3 + far + 1, hw * 4, near * 4 - 4, (px, py) => ((px * 7 + py * 13) % 37 === 0 && py % 6 > 1 ? '#fff6c0' : null));
    // The crossed horse-head boards at each end of the ridge.
    for (const ex of [1.5, hw + 0.5]) m2Raster(g, ex - 1.5, 0, 12, 13, (px, py) => {
      const [u, v] = [px - 6, py];
      const board = Math.abs(Math.abs(u) - (12 - v) * 0.45) < 1;
      const head = v < 4 && Math.abs(u) > 2 && Math.abs(u) < 6 && v > (Math.abs(u) - 3);
      return board || head ? (u < 0 ? M2_EDO_GOLD[4] : M2_EDO_TIMBER[3]) : null;
    });
    // The porch: a gable of thatch facing south on carved pillars, the doors under it.
    const pw = 15;
    const px0 = 1 + hw / 2 - pw / 2;
    const gt = far + near - 7;
    m2Raster(g, px0, gt, pw * 4, 32, (px, py) => {
      const half = (py + 1) * (pw * 2) / 32;
      const d = Math.abs(px + 0.5 - pw * 2);
      if (d > half) return null;
      if (d > half - 2.5) return Math.abs(d - half) < 1 ? M2_EDO_TIMBER[0] : M2_EDO_GOLD[py % 4 < 2 ? 3 : 1];
      return py > 26 ? M2_EDO_TIMBER[1] : M2_EDO_GOLD[(px + py * 2) % 7 === 0 ? 5 : px < pw * 2 ? 4 : 3];
    });
    m2Raster(g, px0 + pw / 2 - 2.5, gt - 2.5, 20, 12, (px, py) => (Math.abs(Math.abs(px - 10) - py * 0.8) < 1.2 && py < 9 ? M2_EDO_GOLD[px < 10 ? 5 : 3] : null));
    for (const ppx of [px0 + 1.5, px0 + pw - 3]) {
      m2Raster(g, ppx, gt + 8, 6, (wall + 7 - 8) * 4, (px, py) => (px === 0 || px === 5 ? M2_EDO_TIMBER[0] : py % 10 < 2 ? M2_EDO_GOLD[3] : M2_EDO_TIMBER[px < 3 ? 5 : 3]));
    }
    const dy = far + near + 1 + wall - 9;
    m2Raster(g, px0 + pw / 2 - 3, dy, 24, 36, (px, py) => (px === 0 || px === 23 || py === 0 ? M2_EDO_TIMBER[0] : px === 12 ? M2_EDO_TIMBER[0] : (px % 6 === 3 && py % 8 === 4) ? M2_EDO_GOLD[4] : M2_EDO_TIMBER[px < 12 ? 3 : 2]));
  });
  o.foot = [x0, hallZ - 4, x0 + hw + 1, hallZ + 0.5];
  for (const p of panes) add.light({ pane: { ...p, x: x0 - 1 + p.x, y: y0 - 3 + p.y } });
  add.light({ x: hx, y: hallZ - 4, r: 11, c: '#ffc56a' });
  D.spots.push({ x: hx + 1, y: hallZ + 4, face: 'up', job: 'hall' });
  D.keep.push({ x0: x0 - 2, y0, x1: x0 + hw + 2, y1: hallZ + 6 });
}

// The basin by the stair's foot inside the gate: a stone trough, water falling into it from a horse-head spout.
function m2EdoWell(L, add, D) {
  const [x, y] = [D.hx + 8, Math.round((D.pcy + D.pry + D.hb) / 2) - 1];
  const S = M2_PAL.stone;
  m2Shadow(L, x + 1.5, y + 0.5, 3.5, 1, 0.8);
  const o = m2Thing(add, x - 3, y - 6, 6, 6.5, y + 0.5, (g) => {
    m2Raster(g, 0.5, 0, 8, 12, (px, py) => (py < 4 ? (Math.abs(px - 4) < 3 ? S[px < 4 ? 5 : 3] : null) : px > 1 && px < 6 ? S[px < 4 ? 4 : 2] : null));
    m2Raster(g, 0, 3, 24, 14, (px, py) => (py < 3 ? (py === 0 || px === 0 || px === 23 ? S[1] : '#4f9dbb') : px === 0 || px === 23 || py === 13 ? S[0] : S[(px + (py > 8 ? 6 : 0)) % 12 === 0 ? 1 : px < 6 ? 4 : 3]));
  });
  o.foot = [x - 3, y - 2, x + 3, y + 0.5];
  const drip = (g, tick, reduced) => { pxBox(g, x - 1.2, y - 4.5, 0.25, 1.5, (reduced ? 0 : tick) % 2 ? '#a6dbe4' : '#ffffff'); };
  drip.over = true;
  drip.m2own = true;
  add.anim(drip);
  D.spots.push({ x: x - 5, y: y + 2, face: 'right', job: 'well' });
}

// Edoras's houses climbing the hill's face either side of the stair: timber walls under thatch, a door and a window
// each, in rows that step up the slope, nearer rows in front.
function m2EdoHouses(L, add, D, season) {
  const { hx, frx, hb, hz } = D;
  const T = M2_EDO_TIMBER;
  for (let row = 0; row < (hz >= 16 ? 3 : 2); row += 1) {
    const by = hb - 4.5 - row * hz * 0.4;
    const reach = frx - 6 - row * 5;
    for (const side of [-1, 1]) {
      for (let dx = 10 + (row % 2) * 4; dx + 5 < reach; dx += 12) {
        if (side > 0 && row === 1 && dx < 14) continue;
        const x = hx + side * dx;
        const w = 9 + ((dx + row) % 3);
        m2Shadow(L, x + 2, by + 0.5, w / 2 + 1, 1.2, 0.8);
        const o = m2Thing(add, x - w / 2, by - 10, w, 10.5, by + 0.5, (g) => {
          m2Wall(g, 0.25, 5.5, w - 0.5, 5, T, 'timber');
          m2Raster(g, w / 2 - 1, 7, 8, 14, (px, py) => (px === 0 || px === 7 || py === 0 ? T[0] : '#2a1810'));
          m2Raster(g, w - 3.5, 7, 6, 6, (px, py) => (px === 0 || px === 5 || py === 0 || py === 5 ? T[1] : '#3d5268'));
          m2Roof(g, 0, 0, w, 1, 4, M2_PAL.thatch, 1.5);
          pxBox(g, 1, 1, 0.75, 1.5, T[1]);
        });
        o.foot = [x - w / 2, by - 2.5, x + w / 2, by + 0.5];
        if ((dx + row) % 2) add.light({ pane: { x: x + w / 2 - 3.25, y: by - 3, w: 1.5, h: 1.5, kind: 'square' } });
      }
    }
  }
}
// The guard post at the head of the stair: two spears planted either side with the guards' round shields, green and
// gold, leaning on them.
function m2EdoGuard(L, add, D) {
  const y = D.pcy + D.pry + 0.5;
  for (const side of [-1, 1]) {
    const x = D.hx + side * 5;
    const o = m2Thing(add, x - 2, y - 11, 4, 11.5, y + 0.5, (g) => {
      pxBox(g, 1.75, 1.5, 0.5, 10, M2_EDO_TIMBER[3]);
      m2Raster(g, 1, 0, 6, 8, (px, py) => (Math.abs(px - 3) < (py < 6 ? py / 2.5 : 3 - (py - 6)) ? (px < 3 ? '#e6e6ee' : '#9a9aa6') : null));
      m2Raster(g, 0, 6, 16, 16, (px, py) => {
        const d = Math.hypot(px - 7.5, py - 7.5);
        return d < 7.5 ? (d > 6.2 ? M2_EDO_GOLD[2] : Math.abs(px - 7.5) < 1 || Math.abs(py - 7.5) < 1 ? M2_EDO_GOLD[4] : px < 7 ? '#3f8a3a' : '#2a6a2a') : null;
      });
    });
    o.foot = [x - 1, y - 1, x + 1, y + 0.5];
  }
}
