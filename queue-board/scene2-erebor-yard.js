// scene2-erebor-yard.js: the dwarves' yard below Erebor's court on the map from above (scene2-erebor.js calls it). A
// court cut and paved by the dwarves: large dressed flags in courses, each its own shade, lit along its top edge and
// dark in its joints, with bands of dark stone inlaid with gold runes crossing it between the rows of anvils and down
// its middle, and pale kerbs round its edge. Mine rails run across its foot to a cart loaded with ore and a heap of it;
// lamps on iron posts stand along the bands and burn at night; the forge's coal heap, woodpile and quench barrel stand
// by it, crates by the rails, and the gem rock glitters. Every station and the rows above it where its worker stands
// stay clear of anything standing; the paving runs under them.

// The paving, laid before the works so the rails and the forge's things stand on it, leaving the river's bed open.
function m2EreYardPave(L, E) {
  const { r } = E;
  const [x0, x1, y0, y1] = [r.x + 2, r.x + r.w - 2, E.courtBot - 1, E.yardBot];
  for (let py = Math.round(y0 * 4); py < Math.min(L.ph, Math.round(y1 * 4)); py += 1) {
    for (let px = Math.max(0, Math.round(x0 * 4)), i = py * L.pw + px; px < Math.min(L.pw, Math.round(x1 * 4)); px += 1, i += 1) {
      if (L.mat[i] === M2_MAT.road) continue;
      L.mat[i] = M2_MAT.plaza;
      L.under[i] = M2_MAT.plaza;
    }
  }
  const bands = E.bands;
  const key = `yard${x1 - x0},${y1 - y0},${E.cx - x0},${bands.map((b) => Math.round(b - y0)).join('.')},${E.riverKey}`;
  if (!m2EreArt.has(key)) m2EreArt.set(key, m2EreYardArt(E, x0, y0, x1 - x0, y1 - y0, bands));
  const art = m2EreArt.get(key);
  L.decals.push((g) => g.drawImage(art, x0, y0, x1 - x0, y1 - y0));
}

// The paving's canvas, drawn slab by slab as rectangles (far quicker than pixel by pixel over so wide a court): courses
// of flags of two heights, the bands with their gold braid, the kerbs, and the river's bed cut out.
function m2EreYardArt(E, x0, y0, w, h, bands) {
  const F = M2_ERE_FLAG;
  const { c, g } = m2Canvas(w, h);
  const q = 0.25;
  // Warm stones and cool ones mixed, each slab its own.
  const COOL = ['#30333a', '#474b53', '#5d6169', '#73777e', '#8c8f95', '#a8aaae'];
  const WARM = ['#3a322c', '#544840', '#6e6056', '#85766a', '#9c8c7e', '#b5a594'];
  for (let top = 0, row = 0; top < h; row += 1) {
    const rh = row % 2 ? 6 : 7.5;
    const len = 11 + Math.floor(m2Hash(row, 0, 87) * 4) * 2;
    for (let sx = -((row * 4.5) % len); sx < w; sx += len) {
      const tone = m2Hash(Math.round(sx * 4), row, 88);
      const P = tone < 0.3 ? COOL : tone > 0.75 ? WARM : F;
      const k = m2Hash(row, Math.round(sx * 4), 90) < 0.35 ? 2 : 3;
      pxBox(g, sx, top, len, rh, P[k]);
      pxBox(g, sx, top, len, q, P[k + 2]);
      pxBox(g, sx, top, q, rh, P[4]);
      pxBox(g, sx + len - q, top, q, rh, P[1]);
      pxBox(g, sx, top + rh - q, len, q, F[1]);
      pxBox(g, sx, top + rh - 2 * q, len, q, P[k - 1]);
      if (tone > 0.8) for (let k = 0; k < 5; k += 1) pxBox(g, sx + 1 + m2Hash(k, row, 89) * (len - 2), top + 1 + m2Hash(row, k, 89) * (rh - 2), q * 2, q, P[1]);
    }
    top += rh;
  }
  // Worn paths, darker, from the court's middle to each anvil's worker, and the mountain's shadow along the north kerb.
  g.strokeStyle = '#1c1816';
  g.lineCap = 'round';
  g.lineWidth = 3.5;
  g.globalAlpha = 0.22;
  for (const s of E.r.plan.stations.filter((st) => st.realm === E.r)) {
    g.beginPath();
    g.moveTo(E.cx - x0, 0);
    g.quadraticCurveTo(E.cx - x0, s.hy - y0 - 6, s.x - x0, s.hy - y0 + 1);
    g.stroke();
  }
  g.globalAlpha = 0.45;
  pxBox(g, 0, 0, w, 1.5, '#141018');
  g.globalAlpha = 0.25;
  pxBox(g, 0, 1.5, w, 1.25, '#141018');
  g.globalAlpha = 1;
  // The bands: dark stone between pale kerbs, a braid of two gold strands with a stud where they cross.
  const band = (horiz, at, from, to) => {
    const box = (a0, b0, la, lb, col) => (horiz ? pxBox(g, a0, b0, la, lb, col) : pxBox(g, b0, a0, lb, la, col));
    box(from, at - 1.75, to - from, 3.5, '#2a2d36');
    box(from, at - 1.5, to - from, 3, '#454b58');
    for (let a = from; a < to; a += 2) box(a, at - 1.75, 1.75, 0.25, F[(a >> 1) % 2 ? 5 : 4]), box(a, at + 1.5, 1.75, 0.25, F[(a >> 1) % 2 ? 4 : 5]);
    for (let a = from; a < to; a += 0.25) {
      const wave = (Math.abs((((a * 4) % 16) + 16) % 16 - 8) - 4) * 0.2;
      box(a, at + wave - 0.125, 0.25, 0.25, (Math.floor(a) % 2) ? '#e2b043' : '#c9a24a');
      box(a, at - wave - 0.125, 0.25, 0.25, '#c9a24a');
      if ((((a * 4) % 16) + 16) % 16 < 1) box(a - 0.25, at - 0.375, 0.75, 0.75, '#fbdd86');
    }
  };
  for (const b of bands) band(true, b - y0, 0, w);
  band(false, E.cx - x0, 0, h);
  // Kerbs round the edge.
  for (let a = 0; a < w; a += 4) pxBox(g, a, h - 1, 4, 1, F[(a >> 2) % 2 ? 5 : 4]);
  for (let b = 0; b < h; b += 4) { pxBox(g, 0, b, 1, 4, F[(b >> 2) % 2 ? 5 : 4]); pxBox(g, w - 1, b, 1, 4, F[(b >> 2) % 2 ? 4 : 5]); }
  pxBox(g, 0, h - 0.25, w, 0.25, F[0]);
  // The river's bed cut out of the paving.
  g.globalCompositeOperation = 'destination-out';
  for (const [px, py] of E.river) { g.beginPath(); g.arc(px - x0, py - y0, 3.5, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  return c;
}

function m2EreWilds(L, add, E, season) {
  const { r } = E;
  const stations = r.plan.stations.filter((s) => s.realm === r);
  const clear = stations.map((s) => {
    const b = typeof m2StationBox === 'function' ? m2StationBox(s) : [s.x - 6, s.y - 17, s.x + 6, s.y + 1];
    return { x0: b[0] - 3, y0: b[1] - 30, x1: b[2] + 3, y1: b[3] + 3 };
  });
  const busy = [...E.keep.slice(2), ...clear];
  const free = (x, y, mx = 0, my = 0) => !busy.some((b) => x > b.x0 - mx && x < b.x1 + mx && y > b.y0 - my && y < b.y1 + my) && !E.wet(x, y);
  // The rails across the yard's foot from the mine's line to a cart loaded with ore and its heap by the channel.
  if (E.rails) {
    const ry = E.yardBot - 5;
    const ex = (E.channel?.rx ?? r.x + r.w - 6) - 7;
    if (ex - E.rails.x > 20) {
      L.decals.push((g) => {
        for (let y = E.rails.y1; y < ry; y += 1.5) pxBox(g, E.rails.x - 3, y, 6, 0.75, M2_PAL.wood[(Math.round(y * 2) % 3) + 1]);
        for (const rx of [E.rails.x - 2, E.rails.x + 1.5]) { pxBox(g, rx, E.rails.y1, 0.5, ry - E.rails.y1 + 2, M2_ERE_IRON[1]); pxBox(g, rx, E.rails.y1, 0.25, ry - E.rails.y1 + 2, M2_ERE_IRON[5]); }
        for (let x = E.rails.x - 2; x < ex; x += 1.5) pxBox(g, x, ry - 1.5, 0.75, 4, M2_PAL.wood[(Math.round(x * 2) % 3) + 1]);
        for (const yy of [ry - 1, ry + 1.5]) { pxBox(g, E.rails.x - 2, yy, ex - E.rails.x + 2, 0.5, M2_ERE_IRON[1]); pxBox(g, E.rails.x - 2, yy, ex - E.rails.x + 2, 0.25, M2_ERE_IRON[5]); }
      });
      if (free(ex - 4, ry + 1, 4, 1)) {
        m2EreProp(L, add, 'cart', ex - 4, ry + 2);
        busy.push({ x0: ex - 8, y0: ry - 6, x1: ex, y1: ry + 3 });
      }
    }
  }
  // A round well-head carved with runes in the open middle, where it stands clear of the anvils.
  const mids = E.bands.slice(0, -1).map((b, i) => (b + E.bands[i + 1]) / 2 + 3);
  const wells = [...mids.flatMap((y) => [[E.cx + 12, y], [E.cx - 12, y], [E.cx, y]]), [E.cx + 12, E.yardBot - 10], [E.cx - 14, E.yardBot - 10]];
  const wat = wells.find(([x, y]) => free(x, y, 5, 3));
  if (wat) {
    m2EreWellHead(L, add, wat[0], wat[1]);
    busy.push({ x0: wat[0] - 5, y0: wat[1] - 7, x1: wat[0] + 5, y1: wat[1] + 2 });
  }
  // Lamps on iron posts along the bands, where they stand clear of the anvils.
  const lamps = [];
  for (const by of E.bands) for (const lx of [E.cx, r.x + 6, E.left.x1 - 3, E.right.x0 + 1]) lamps.push([lx, by - 3.5]);
  let n = 0;
  for (const [lx, ly] of lamps) {
    if (n >= 6 || !free(lx, ly, 2, 1) || lx < r.x + 3) continue;
    m2EreLamp(L, add, lx, ly);
    busy.push({ x0: lx - 2, y0: ly - 14, x1: lx + 2, y1: ly + 1 });
    n += 1;
  }
  // The forge's things beside it, the store by the rails, the gem rock, each where it finds room.
  const fz = E.forge;
  const things = [
    ['coal', fz && [[fz.x - 16, fz.y + 1], [fz.x - 16, fz.y + 8], [fz.x - 9, fz.y + 10]]],
    ['wood', fz && [[fz.x - 9, fz.y + 10], [fz.x - 17, fz.y + 10], [fz.x + 2, fz.y + 11]]],
    ['barrel', fz && [[fz.x + 3, fz.y + 10], [fz.x - 3, fz.y + 10], [fz.x - 16, fz.y + 14]]],
    ['crates', E.rails && [[E.rails.x + 9, E.rails.y1 - 12], [E.rails.x + 9, E.rails.y1 + 16], [E.right.x0 + 3, r.block.y1 - 4]]],
    ['gems', [[E.rails ? E.rails.x + 1 : r.x + 10, r.block.y1 - 2], [r.x + 10, r.y + r.h - 8], [E.right.x0 + 4, r.y + r.h - 10], [r.x + r.w * 0.3, r.block.y1 + 8]]],
  ];
  for (const [kind, spots] of things) {
    const at = (spots ?? []).find(([x, y]) => free(x, y, 3, 2) && y < r.y + r.h - 2 && m2MatAt(L, x, y) !== M2_MAT.rock);
    if (!at) continue;
    m2EreProp(L, add, kind, at[0], at[1]);
    busy.push({ x0: at[0] - 5, y0: at[1] - 7, x1: at[0] + 5, y1: at[1] + 2 });
    if (kind === 'gems') E.spots.push({ x: at[0] + 6, y: at[1] + 1, face: 'left', job: 'gems' });
  }
  m2EreChest(L, add, E, busy.filter((b) => !clear.includes(b)));
}

// A round well-head at (x, y): a ring of dressed stone with a band of gold runes round it and dark water within.
function m2EreWellHead(L, add, x, y) {
  m2Shadow(L, x + 1.5, y + 0.5, 4.5, 1.4, 0.8);
  const G = M2_ERE_GATE;
  const o = m2Thing(add, x - 4.5, y - 6, 9, 6.5, y + 0.5, (g) => m2Raster(g, 0, 0, 36, 26, (px, py) => {
    const [u, v] = [(px + 0.5 - 18) / 18, (py + 0.5 - 7) / 7];
    const top = u * u + v * v < 1;
    if (top) return u * u + v * v < 0.45 ? (py < 6 ? '#0e1c2a' : '#1e3a52') : G[u < 0 ? 5 : 4];
    if (Math.abs(u) > 1 || py < 7 || py > 25 - (1 - Math.sqrt(Math.max(0, 1 - u * u))) * 4) return null;
    if (py > 12 && py < 17) return (px % 6 < 2 && (px + py) % 3 !== 0) ? '#e2b043' : '#3a3f4a';
    return py === 12 || py === 17 ? G[1] : G[u < -0.4 ? 4 : u < 0.4 ? 3 : 2];
  }));
  o.foot = [x - 4.5, y - 2.5, x + 4.5, y + 0.5];
}
// A lamp on an iron post at (x, y): a post with a cross-arm and a lantern of glass hung from it, lit at night.
function m2EreLamp(L, add, x, y) {
  const I = M2_ERE_IRON;
  m2Shadow(L, x + 1, y + 0.5, 1.6, 0.6, 0.8);
  const o = m2Thing(add, x - 2, y - 14, 4.5, 14.5, y + 0.5, (g) => {
    pxBox(g, 1.5, 3, 0.75, 11.5, I[2]);
    pxBox(g, 1.5, 3, 0.25, 11.5, I[4]);
    pxBox(g, 1, 13.5, 1.75, 1, I[1]);
    pxBox(g, 1.5, 2.5, 2.5, 0.5, I[2]);
    m2Raster(g, 2.5, 3, 8, 12, (px, py) => (py < 2 ? (px > 0 && px < 7 ? I[1] : null) : px === 0 || px === 7 || py === 11 ? I[0] : py < 4 ? '#fff1a8' : '#ffc84a'));
  });
  o.foot = [x - 0.75, y - 1, x + 0.75, y + 0.5];
  add.light({ x: x + 3.5, y: y - 9.5, r: 8, c: '#ffcf6a' });
  add.light({ pane: { x: x + 3, y: y - 10.5, w: 1.5, h: 2, kind: 'square' } });
}

// One of the yard's things standing with its foot at (x, y): a coal heap, a woodpile, a quench barrel, stacked crates,
// or the gem rock with crystals in it.
function m2EreProp(L, add, kind, x, y) {
  const W = M2_PAL.wood;
  const sizes = { coal: [7, 4], wood: [8, 5], barrel: [3.5, 4.5], crates: [7, 7], gems: [8, 6], cart: [7, 7] };
  const [w, h] = sizes[kind];
  m2Shadow(L, x + w * 0.2, y + 0.5, w * 0.6, 1.3, 0.8);
  const paint = kind === 'cart' ? null : {
    coal: (px, py) => {
      const top = 15 - Math.sqrt(Math.max(0, 1 - ((px + 0.5 - 14) / 14) ** 2)) * 14;
      if (py < top) return null;
      return py - top < 1 ? '#0e0c10' : (px * 5 + py * 3) % 11 === 0 ? '#5a5a66' : px < 12 ? '#2e2c34' : '#1c1a20';
    },
    wood: (px, py) => {
      const [col, row] = [Math.floor(px / 5), Math.floor((py - (Math.floor(px / 5) % 2) * 2) / 5)];
      const [cx, cy] = [col * 5 + 2.5, row * 5 + 2.5 + (col % 2) * 2];
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (py < 4 - (px > 10 && px < 22 ? 4 : 0) || d > 2.6) return py > 17 ? null : W[1];
      return d > 1.9 ? W[2] : d < 0.8 ? W[3] : '#d9b27a';
    },
    barrel: (px, py) => {
      if (py < 3) return Math.abs(px + 0.5 - 7) < 6.5 ? (py === 0 ? W[0] : '#4f9dbb') : null;
      const bulge = 6.5 + Math.sin((py / 18) * Math.PI) * 0.8;
      if (Math.abs(px + 0.5 - 7) > bulge) return null;
      return py % 6 === 2 ? '#3a3a42' : px < 5 ? W[4] : px < 10 ? W[3] : W[2];
    },
    crates: (px, py) => {
      const box = (x0, y0, s) => px >= x0 && px < x0 + s && py >= y0 && py < y0 + s;
      for (const [bx, by, s] of [[6, 0, 14], [0, 13, 15], [14, 13, 14]]) {
        if (!box(bx, by, s)) continue;
        const [u, v] = [px - bx, py - by];
        if (u === 0 || v === 0 || u === s - 1 || v === s - 1) return W[0];
        if (u === v || u === s - 1 - v) return W[2];
        return v < 3 ? W[5] : W[u < s / 2 ? 4 : 3];
      }
      return null;
    },
    gems: (px, py) => {
      const top = 23 - Math.sqrt(Math.max(0, 1 - ((px + 0.5 - 16) / 16) ** 2)) * 20;
      for (const [cx, ch, c] of [[9, 15, 0], [15, 22, 1], [21, 13, 2], [25, 9, 3]]) {
        if (Math.abs(px + 0.5 - cx) < 2.2 - Math.max(0, (24 - ch) - py) * 0 && py > 23 - ch && Math.abs(px + 0.5 - cx) < (py - (23 - ch)) * 0.7 + 0.5) return px < cx ? '#ffffff' : M2_ERE_GEM[c];
      }
      if (py < top) return null;
      return py - top < 1 ? M2_ERE_ROCK[1] : M2_ERE_ROCK[px < 14 ? 5 : 3 + ((px + py) % 5 === 0 ? -1 : 0)];
    },
  }[kind];
  const o = kind === 'cart' ? m2Thing(add, x - 3.5, y - 7, 7, 7, y + 0.5, (g) => g.drawImage(m2EreCartArt(), 0, 0, 7, 7))
    : m2Thing(add, x - w / 2, y - h, w, h + 0.5, y + 0.5, (g) => m2Raster(g, 0, 0, w * 4, h * 4, paint));
  o.foot = [x - w / 2, y - Math.min(2.5, h / 2), x + w / 2, y + 0.5];
  if (kind === 'gems') {
    const glint = (g, tick, reduced) => {
      const t = (reduced ? 0 : tick) % 30;
      if (t < 4) pxBox(g, x - 1 + (Math.floor(tick / 30) % 3) * 1.5, y - 4.5 + (t === 2 ? -0.25 : 0), 0.25, t === 2 ? 0.75 : 0.25, '#ffffff');
    };
    glint.over = true;
    glint.m2own = true;
    add.anim(glint);
  }
}
