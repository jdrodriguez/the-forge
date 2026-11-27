// scene2-edoras-stable.js: Edoras's stables, horses and barrows on the map from above (scene2-edoras.js lays them
// out). East of the hill the stables, a long low timber building under golden thatch with its stalls open to the south
// and a horse looking out over a half door, and before it a paddock fenced with rails where horses graze, lift their
// heads and swish their tails; a cart heaped with sacks of grain by the stable door (v1's sacks and cart). West of the
// hill, beside the road, the barrows of the kings: green mounds white with simbelmyne. Horses are painted once per coat
// and pose into small canvases.

const M2_EDO_COATS = [['#2a1810', '#5e3a22', '#8a5a32', '#b07c48', '#1c120c'], ['#3a3632', '#8a847b', '#b8b2a8', '#e4e0d8', '#5a544e'],
  ['#2a140c', '#7a3a1a', '#a85a2a', '#cc7e44', '#3a1c10']];

// A horse 24 by 17 units facing right, coat c, grazing (head down) or not, its tail swung by swish.
function m2EdoHorse(c, graze, swish) {
  const key = `horse${c},${graze},${swish}`;
  if (m2EreArt.has(key)) return m2EreArt.get(key);
  const C = M2_EDO_COATS[c];
  const part = (px, py) => {
    const [x, y] = [px / 4, py / 4];
    if (((x - 11) / 7) ** 2 + ((y - 8.2) / 3.4) ** 2 < 1) return 'body';
    for (const lx of [6.2, 7.8, 14.2, 15.8]) if (Math.abs(x - lx) < 0.65 && y > 9 && y < 16.5) return y > 15.6 ? 'hoof' : 'leg';
    const tx = 4.2 - (y - 6) * (0.15 + swish * 0.12);
    if (y > 5.5 && y < 13.5 && Math.abs(x - tx) < 0.7 + (y - 6) * 0.05) return 'tail';
    if (graze) {
      const t = (x - 15.5) / 5;
      if (t > -0.1 && t < 1 && Math.abs(y - (6.8 + t * 6)) < 2.4 - t * 0.7) return t < 0.85 && y < 6.8 + t * 6 - 1.4 ? 'mane' : 'body';
      if (((x - 21) / 1.6) ** 2 + ((y - 14) / 2.4) ** 2 < 1) return y > 15.5 ? 'nose' : 'body';
    } else {
      const t = (x - 15) / 4.5;
      if (t > 0 && t < 1 && Math.abs(y - (6.5 - t * 4)) < 2 - t * 0.5) return y < 6.5 - t * 4 - 1 ? 'mane' : 'body';
      if (((x - 20.6) / 2.6) ** 2 + ((y - 2.6) / 1.3) ** 2 < 1) return x > 22.4 ? 'nose' : 'body';
      if (Math.abs(x - 19) < 0.5 && y > 0 && y < 1.6) return 'body';
    }
    return null;
  };
  const art = m2EreImage(24, 17, (px, py) => {
    const p = part(px, py);
    if (!p) return null;
    if (!part(px - 1, py) || !part(px + 1, py) || !part(px, py - 1) || !part(px, py + 1)) return C[0];
    if (p === 'tail' || p === 'mane') return py % 3 ? C[4] : C[1];
    if (p === 'hoof') return '#1a1410';
    if (p === 'nose') return C[1];
    if (p === 'leg') return C[px % 4 < 2 ? 2 : 1];
    const top = part(px, py - 3) ? 0 : 1;
    return C[top ? 3 : py > 40 ? 1 : 2];
  }).c;
  m2EreArt.set(key, art);
  return art;
}

// The stables and paddock east of the hill, in the room between it and the realm's east edge; where the realm is too
// narrow for that, a smaller stable stands in front of the wall's east side by the road, with no paddock.
function m2EdoStables(L, add, D, season) {
  const { r } = D;
  const x1 = r.ux1 + 2;
  const wide = x1 - (D.hx + D.rx + 3) >= 18;
  const sw = wide ? Math.min(30, x1 - (D.hx + D.rx + 3)) : Math.min(20, x1 - (D.hx + 9));
  const x0 = wide ? D.hx + D.rx + 3 : x1 - sw;
  const sy = wide ? r.y + Math.max(14, Math.min(22, (D.hb - r.y) * 0.45)) : D.hb + 0.5;
  if (sw < 13 || !D.free(x0, sy - 15, x0 + sw, sy + 1)) return;
  m2Shadow(L, x0 + sw / 2 + 2, sy + 0.5, sw / 2 + 1, 2, 0.8);
  const T = M2_EDO_TIMBER;
  const o = m2Thing(add, x0, sy - 15, sw, 15.5, sy + 0.5, (g) => {
    m2Wall(g, 0, 7, sw, 8.5, T, 'timber');
    for (let x = 1.5; x < sw - 5; x += 6) {
      m2Raster(g, x, 9, 18, 26, (px, py) => (py < 14 ? (px === 0 || px === 17 ? T[0] : '#140c0a') : px === 0 || px === 17 || py === 14 ? T[0] : T[px % 6 === 0 ? 2 : 3]));
    }
    m2Roof(g, 0, 0, sw, 2, 7, M2_EDO_GOLD, 1);
  });
  o.foot = [x0, sy - 3, x0 + sw, sy + 0.5];
  // A horse's head over the second stall's half door.
  const horse = m2EdoHorse(2, false, 0);
  add.obj({ x: x0 + 7, y: sy - 8.5, w: 6, h: 5, z: sy + 0.6, draw: (g) => g.drawImage(horse, 64, 0, 32, 26, x0 + 6, sy - 8.5, 6, 5) });
  // The cart heaped with sacks by the stable's west end (or, by the road, against the hill's wall west of the gate).
  const cx = wide ? x0 + 2 : D.hx - D.rx * 0.75 - 4;
  const cy = wide ? sy + 7 : D.hb + 0.5;
  m2Shadow(L, cx + 4, cy + 0.5, 5, 1.3, 0.8);
  // Its sacks are drawn as many as the Men have loaded (scene2-stock-art.js's m2sCart, from the spot's cart).
  const cart = m2Thing(add, cx - 1, cy - 7, 11, 7.5, cy + 0.5, (g) => {
    m2Raster(g, 0, 4, 44, 10, (px, py) => (px === 0 || px === 43 || py === 9 ? T[0] : T[py < 2 ? 4 : px % 8 ? 3 : 2]));
    for (const wx of [1.5, 7]) m2Raster(g, wx, 5, 10, 10, (px, py) => (Math.hypot(px - 5, py - 5) < 5 ? (Math.hypot(px - 5, py - 5) > 3.8 || px === 5 || py === 5 ? T[1] : null) : null));
  });
  cart.foot = [cx - 1, cy - 2, cx + 10, cy + 0.5];
  const load = { x: cx - 1, y: cy - 7, z: cy + 0.5, sacks: true };
  D.spots.push(wide ? { x: cx - 2.5, y: cy + 0.5, face: 'right', job: 'cart', cart: load } : { x: cx + 4, y: cy + 4, face: 'up', job: 'cart', mid: cx + 4, cart: load });
  // The paddock below the stables when there is room for it, its back rail clear of the cart's wheels and its west rail
  // clear of the hill's palisade.
  if (wide) m2EdoPaddock(L, add, D, x0 + 3, cy + 5, r.x + r.w - 1.5, Math.min(D.hb + 1, cy + 22));
  D.keep.push({ x0, y0: sy - 15, x1: x0 + sw, y1: cy + 1 });
}

// The barrows of the kings west of the hill beside the road: low green mounds, white with simbelmyne.
function m2EdoBarrows(L, add, D, season) {
  const { r } = D;
  const x1 = D.hx - D.rx - 3;
  const x0 = r.ux0 - 2;
  if (x1 - x0 < 9) return;
  const cols = Math.max(1, Math.floor((x1 - x0) / 11));
  const P = M2_EDO_HILL;
  const mounds = [];
  for (let row = 0; row < 3; row += 1) for (let c = 0; c < cols; c += 1) mounds.push([x0 + 5.5 + c * 11 + (row % 2) * 3, D.hb - 4 - row * 9]);
  for (const [mx, my] of mounds) {
    if (my - 5 < r.y + 2 || !D.free(mx - 6, my - 5, mx + 6, my + 1)) continue;
    m2Shadow(L, mx + 1.5, my + 0.5, 5.5, 1.6, 0.7);
    L.decals.push((g) => {
      m2Raster(g, mx - 5, my - 4, 40, 18, (px, py) => {
        const [nx, ny] = [(px + 0.5 - 20) / 20, (py + 0.5 - 12) / 12];
        const d = nx * nx + ny * ny;
        if (d > 1 || py > 17) return null;
        const fl = m2Hash(px >> 1, py >> 1, Math.round(mx * 3 + my));
        if (fl < 0.16 && ((px ^ py) & 1) === 0) return fl < 0.06 ? '#ffffff' : fl < 0.11 ? '#eef4e6' : '#cfe0c4';
        return P[Math.max(0, Math.min(5, Math.floor(3 - nx * 1.5 - ny * 1.2 + M2_BAYER[(py & 3) * 4 + (px & 3)])))];
      });
    });
    D.keep.push({ x0: mx - 6, y0: my - 5, x1: mx + 6, y1: my + 1 });
  }
}

// A practice post for sword drill: a stout post wrapped in straw at its head with a crossbar for arms, a shield hung on
// it, standing at (x, y). Returns its spot, beside it facing it.
function m2EdoPell(L, add, x, y) {
  const T = M2_EDO_TIMBER;
  m2Shadow(L, x + 1.5, y + 0.5, 2.5, 0.9, 0.8);
  const o = m2Thing(add, x - 3, y - 11, 6, 11.5, y + 0.5, (g) => {
    pxBox(g, 2.5, 2, 1.25, 9.5, T[3]);
    pxBox(g, 2.5, 2, 0.5, 9.5, T[4]);
    pxBox(g, 0, 4.5, 6, 1, T[2]);
    m2Raster(g, 1.5, 0, 13, 14, (px, py) => (Math.hypot(px - 6, (py - 6) * 0.9) < 6 ? (py % 3 === 0 ? M2_PAL.thatch[2] : px < 6 ? M2_PAL.thatch[5] : M2_PAL.thatch[4]) : null));
    m2Raster(g, 1.75, 5.5, 10, 12, (px, py) => (Math.hypot(px - 5, py - 5) < 5 ? (Math.hypot(px - 5, py - 5) > 4 ? M2_EDO_GOLD[2] : px === 5 || py === 5 ? '#f4f0e0' : '#2f7230') : null));
  });
  o.foot = [x - 1.5, y - 1, x + 1.5, y + 0.5];
  return { x: x + 7, y: y + 1, face: 'left', job: 'train' };
}
// Edoras's training ground: a practice post wherever it finds room clear of the hall, the stables and the zones.
function m2EdoTrain(L, add, D) {
  const { r } = D;
  const busy = D.keep.slice(2);
  const cands = [[r.ux1 - 6, D.hb - 16], [D.hx + D.rx + 6, D.hy + 2], [r.ux0 + 3, r.y + 12], [r.ux1 - 4, r.y + 12]];
  const at = cands.find(([x, y]) => y - 12 > r.y && D.free(x - 3, y - 11, x + 10, y + 3) && !busy.some((b) => x + 10 > b.x0 && x - 3 < b.x1 && y + 3 > b.y0 && y - 11 < b.y1));
  if (at) D.spots.push(m2EdoPell(L, add, at[0], at[1]));
}

// A paddock in the box x0..x1, y0..y1: rails along its back and front, posts down its ends, and horses at their ease in
// it, grazing and lifting their heads, drifting slowly as they crop. The life lead's horses (scene2-horse.js) when they
// are loaded and the paddock is long enough for them, else Edoras's own smaller ones.
function m2EdoPaddock(L, add, D, x0, y0, x1, y1) {
  if (y1 - y0 < 12 || x1 - x0 < 16 || !D.free(x0, y0 - 3, x1, y1)) return false;
  const T = M2_EDO_TIMBER;
  for (const yy of [y0, y1]) {
    const rail = m2Thing(add, x0, yy - 3, x1 - x0, 3.5, yy + 0.5, (g) => {
      for (let x = 0; x < x1 - x0; x += 4) pxBox(g, x, 0, 0.75, 3.5, T[2]);
      pxBox(g, 0, 0.5, x1 - x0, 0.5, T[4]);
      pxBox(g, 0, 2, x1 - x0, 0.5, T[3]);
    });
    rail.foot = [x0, yy - 1, x1, yy + 0.5];
  }
  // The ends: a rail down each from the back rail to the front one, a post every 4 units (2026-11-27: with only the back
  // and front rails the paddock read as two loose fences with the trough between them).
  for (const xx of [x0, x1 - 0.75]) {
    const end = m2Thing(add, xx, y0 - 0.5, 0.75, y1 - y0 + 1, y0 + 0.5, (g) => {
      pxBox(g, 0.25, 0, 0.5, y1 - y0 + 1, T[3]);
      for (let y = 0; y < y1 - y0; y += 4) pxBox(g, 0, y, 0.75, 1, T[2]);
    });
    end.foot = [xx, y0, xx + 0.75, y1];
  }
  const big = typeof m2mDrawHorse === 'function' && x1 - x0 >= 36;
  const n = Math.max(1, Math.min(3, Math.floor((x1 - x0) / (big ? 34 : 22))));
  // The trough inside the west fence, where the Men bring feed and water (scene2-haul-jobs.js) and the nearest horse
  // comes to eat or drink it down (2026-11-09, as the side view's pigs eat theirs).
  const ty = Math.round((y0 + y1) / 2);
  const tr = m2Thing(add, x0 + 1, ty - 1.5, 7, 3, ty + 1.5, (g) => m2Raster(g, 0, 0, 28, 12, (px, py) => (py === 0 || px === 0 || px === 27 ? T[0] : py < 4 ? '#3a2414' : T[py < 8 ? 3 : 1])));
  tr.foot = [x0 + 1, ty - 0.5, x0 + 8, ty + 1.5];
  const trough = { x0: x0 + 1, y0: ty - 1.5, x1: x0 + 8, y1: ty + 1.5, z: ty + 1.5, sx0: x0 + 1.5, sx1: x0 + 7.5, sy: ty - 1.25, sh: 0.75 };
  for (let i = 0; i < n; i += 1) {
    const hx = x0 + (x1 - x0) * ((i + 0.5) / n);
    const hy = y0 + 6 + ((i * 7) % Math.max(1, y1 - y0 - 7));
    const kind = ['rohirrim', 'gondor', 'ithilien'][i % 3];
    const H = { x: hx, y: hy };
    const f = (g, tick, reduced) => {
      const t = reduced ? 0 : tick + i * 97;
      // The first horse goes to the trough while there is anything in it, and eats there; then back to its grass.
      const T2 = i === 0 && !reduced && typeof m2sTroughFor === 'function' ? m2sTroughFor(D.r.m.host) : null;
      const want = T2 && (T2.food > 0 || T2.water > 0) ? { x: x0 + 14, y: ty + 2 } : { x: hx + Math.sin(t / 400 + i) * 3, y: hy };
      const d = Math.hypot(want.x - H.x, want.y - H.y);
      if (!reduced && d > 0.3) { H.x += ((want.x - H.x) / d) * Math.min(0.25, d); H.y += ((want.y - H.y) / d) * Math.min(0.25, d); }
      const there = T2 && d <= 0.3 && (T2.food > 0 || T2.water > 0);
      if (there) m2sEat(T2, 1);
      const graze = there || (d <= 0.3 && Math.floor(t / 80) % 3 !== 2);
      const face = there ? 'left' : d > 0.3 ? (want.x < H.x ? 'left' : 'right') : Math.floor(t / 900 + i) % 2 ? 'left' : 'right';
      f.z = H.y;
      if (big) m2mDrawHorse(g, kind, H.x, H.y, face, graze ? 'graze' : d > 0.3 ? 'walk' : 'stand', graze ? 0 : Math.floor(t / 3) % 4);
      else {
        g.save();
        if (face === 'left') { g.translate(2 * H.x, 0); g.scale(-1, 1); }
        g.drawImage(m2EdoHorse(i % 3, graze, Math.floor(t / 4) % 6 === 0 ? 1 : 0), H.x - 10, H.y - 14, 20, 14.2);
        g.restore();
      }
    };
    f.item = true;
    f.z = hy;
    f.m2own = true;
    add.anim(f);
  }
  D.spots.push({ x: x0 - 3, y: ty, face: 'right', job: 'horses', trough });
  D.keep.push({ x0, y0: y0 - 4, x1, y1: y1 + 1 });
  return true;
}
