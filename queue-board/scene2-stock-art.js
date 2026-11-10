// scene2-stock-art.js: the stocks of the map from above drawn at their things (scene2-stock.js keeps them): the forge's
// flare, the hoard heaped higher in Erebor's gate, the gem chest filling, the armor stand's pieces, the Shire cart's
// heap and the Men's sacks, the scroll rack's cells and a trough's feed or water. Pixel art in quarter units, lit
// from the upper left like the rest of the map; the still ones are painted once per count into small canvases.

const m2sArt = new Map();
const m2sOnce = (key, w, h, paint) => {
  if (!m2sArt.has(key)) { const { c, g } = m2Canvas(w, h); paint(g); m2sArt.set(key, c); }
  return m2sArt.get(key);
};
const M2S_FIRE = ['#fff3c4', '#ffd35a', '#ff8a2a', '#c2441c'];
const M2S_GEMS = ['#7fd8ff', '#ff7aa8', '#9aff9a', '#ffe27a', '#c9a6ff'];

// The forge's flare: five tongues of fire leaping out of the hearth's mouth with its foot at (x, y) and up the hood's
// face, each its own height by tick, white at the heart through yellow and orange to red at the edges.
function m2sFlames(g, x, y, tick) {
  for (let i = 0; i < 5; i += 1) {
    const h = 5 + Math.floor(m2Hash(i, tick, 71) * 6);
    const cx = x - 2.5 + i * 1.25 + Math.sin(tick * 1.3 + i * 2) * 0.25;
    for (let r = 0; r < h * 4; r += 1) {
      const t = r / (h * 4);
      const w = Math.max(1, Math.round((1 - t) * 5));
      for (let k = 0; k < w; k += 1) {
        const edge = Math.abs(k - (w - 1) / 2) / Math.max(1, w / 2);
        const c = M2S_FIRE[Math.min(3, Math.floor(edge * 2 + t * 2.2))];
        g.fillStyle = c;
        g.fillRect(Math.round((cx + (k - w / 2) / 4) * 4) / 4, y - 1.5 - r / 4, 0.25, 0.25);
      }
    }
  }
}

// The hoard in Erebor's gate (V: the gate's middle cx, its floor row gy, its width gw): a mound of gold coins with gems
// in it, wider and higher the more is stored beyond the six the gate began with, sparkling.
function m2sHoard(g, V, n, tick, reduced) {
  const k = Math.max(0, Math.min(1, (n - 6) / (M2S_MAX.hoard - 6)));
  if (k <= 0) return;
  const w = Math.round((V.gw - 3) * (0.4 + 0.55 * k) * 4) / 4;
  const h = Math.round((1 + 3.5 * k) * 4) / 4;
  const art = m2sOnce(`hoard${w},${h}`, w, h, (cg) => m2Raster(cg, 0, 0, w * 4, h * 4, (px, py) => {
    const u = (px + 0.5) / (w * 2) - 1;
    const v = 1 - (py + 0.5) / (h * 4);
    if (v > Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.15 * Math.abs(Math.sin(px * 0.7)))) return null;
    if (m2Hash(px, py, 72) < 0.04) return M2S_GEMS[Math.floor(m2Hash(px, py, 73) * 5)];
    const lit = u < -0.2 && v > 0.4 ? 4 : u < 0.3 ? 3 : 2;
    return (px + py * 2) % 5 === 0 ? M2_PAL.gold[lit - 1] : M2_PAL.gold[lit];
  }));
  g.drawImage(art, V.cx - w / 2, V.gy - 0.5 - h, w, h);
  if (reduced) return;
  for (let i = 0; i < 3; i += 1) {
    const t = (tick + i * 9) % 27;
    if (t > 4) continue;
    const sx = Math.round((V.cx + (m2Hash(i, Math.floor(tick / 27), 74) - 0.5) * w * 0.8) * 4) / 4;
    const sy = Math.round((V.gy - 0.75 - m2Hash(i, Math.floor(tick / 27), 75) * h * 0.8) * 4) / 4;
    pxBox(g, sx - 0.25, sy, 0.75, 0.25, '#ffffff');
    pxBox(g, sx, sy - 0.25, 0.25, 0.75, '#ffffff');
  }
}

// The gems in the chest with its feet on row y, centred on x (scene2-erebor-works.js bakes its lid, thrown back, and its
// box apart): a heap rising from inside the box over the lid as there are more (21 at most), in their colours.
function m2sChest(g, x, y, gems) {
  const n = Math.round(gems);
  if (!n) return;
  const art = m2sOnce(`chest${n}`, 5, 2.5, (cg) => {
    const h = 2 + Math.round((n / M2S_MAX.gems) * 7);
    m2Raster(cg, 0, 0, 20, 10, (px, py) => {
      const crest = h - Math.abs(px + 0.5 - 10) / 3.5 + (m2Hash(px, 1, 76) - 0.5);
      if (10 - py > crest || px < 1 || px > 18) return null;
      return m2Hash(px, py, 77) < 0.55 ? M2S_GEMS[(px * 3 + py) % 5] : M2_PAL.gold[px < 9 ? 3 : 2];
    });
  });
  g.drawImage(art, x - 2.5, y - 4.5, 5, 2.5);
}

// The armor stand's pieces with the stand at (x, y) (scene2-erebor-works.js's m2EreArmor draws the stand bare): the
// breastplate, the helm over it, gauntlets on the crossbar's ends and a round shield leaning at the post's foot, as many
// as are hung.
function m2sArmor(g, x, y, n) {
  const I = M2_ERE_IRON;
  if (n >= 1) m2Raster(g, x + 0.5, y - 9, 26, 26, (px, py) => {
    const w = 12 - (py > 14 ? (py - 14) * 0.4 : 0);
    if (Math.abs(px + 0.5 - 13) > w || py > 25) return null;
    if (py < 2 || py === 18) return M2_PAL.gold[py < 2 ? 3 : 2];
    return Math.abs(px + 0.5 - 13) > w - 1 ? I[0] : px === 13 ? I[5] : I[px < 10 ? 4 : 3];
  });
  if (n >= 2) m2Raster(g, x + 1, y - 13, 22, 12, (px, py) => (Math.hypot(px + 0.5 - 11, (py + 0.5 - 8) * 1.3) < 9 ? (py > 7 && Math.abs(px - 11) < 3 ? I[0] : I[px < 9 ? 5 : px < 14 ? 4 : 3]) : null));
  if (n >= 3) for (const gx of [x - 0.25, x + 6.25]) m2Raster(g, gx, y - 9.25, 4, 7, (px, py) => (py === 0 || px === 0 || px === 3 ? I[0] : py > 4 ? M2_PAL.gold[2] : I[px < 2 ? 4 : 3]));
  if (n >= 4) m2Raster(g, x + 5, y - 4, 14, 16, (px, py) => {
    const d = Math.hypot(px + 0.5 - 7, (py + 0.5 - 8) * 0.9);
    if (d > 7) return null;
    if (d > 6) return I[0];
    if (d < 1.5) return M2_PAL.gold[3];
    return Math.abs(px - 7) < 1 || Math.abs(py - 8) < 1 ? M2_PAL.gold[2] : '#7a2a24';
  });
}

// The cart's heap (C: the cart's canvas corner x, y and season, seed, as scene2-shire-props.js paints it): of its
// fourteen pieces as many as the load fills, in the season's colours.
function m2sCart(g, C, load) {
  // The Men's cart (scene2-edoras-stable.js) carries sacks, up to six on its bed.
  if (C.sacks) {
    const at = [[2.5, 2], [5.5, 2.2], [1, 0.5], [4, 0], [6.5, 0.8], [3.5, -1]];
    const k = Math.round((Math.min(load, M2S_MAX.load) / M2S_MAX.load) * at.length);
    const sack = m2sOnce('mensack', 3, 3, (cg) => m2Raster(cg, 0, 0, 12, 12, (px, py) => (Math.hypot(px - 6, py - 6) < 5.5 ? (Math.hypot(px - 6, py - 6) > 4.6 ? '#5a4a30' : px < 6 ? '#e8dcb8' : '#c8b88e') : null)));
    for (const [sx, sy] of at.slice(0, k).sort((p, q) => p[1] - q[1])) g.drawImage(sack, C.x + sx, C.y + sy, 3, 3);
    return;
  }
  const n = Math.round((Math.min(load, M2S_MAX.load) / M2S_MAX.load) * 14);
  const heap = C.colors ?? (C.season === 'winter' ? ['#c9b48a', '#a8946a', '#e2d2a8'] : C.season === 'summer' ? ['#5a9a3c', '#8cc25a', '#3f7a2c']
    : C.season === 'spring' ? ['#7aa83a', '#e8902c', '#c9b48a'] : ['#e8902c', '#c0302a', '#ffb050']);
  for (let i = 0; i < n; i += 1) {
    const hx = C.x + 2 + m2Hash(i, 1, C.seed) * 11.5;
    const hy = C.y + 3.25 + m2Hash(i, 2, C.seed) * 1.5 - Math.sin(((i % 7) / 6) * Math.PI) * 1.25;
    const [px, py] = [Math.round(hx * 4) / 4, Math.round(hy * 4) / 4];
    const col = heap[i % 3];
    pxBox(g, px, py, 1.75, 1.5, hdMix(col, '#000000', 0.25));
    pxBox(g, px, py, 1.5, 1.25, col);
    pxBox(g, px + 0.25, py + 0.25, 0.5, 0.25, hdMix(col, '#ffffff', 0.45));
  }
}

// The scroll rack under Rivendell's pavilion with the floor's middle at (x, y): its nine cells, a scroll's rolled ends
// in each of the first n and the rest dark, leaving the middle pillar standing over it.
function m2sRack(g, x, y, n) {
  for (let i = 0; i < 9; i += 1) {
    const [c, row] = [i % 3, Math.floor(i / 3)];
    const [cx, cy] = [x - 4 + (2 + 10 * c) / 4, y - 13 + (2 + 8 * row) / 4];
    m2Raster(g, cx, cy, 8, 4, (px, py) => {
      if (Math.abs(cx + (px + 0.5) / 4 - x) < 0.8) return null;
      if (i >= n) return py === 3 ? M2_PAL.wood[1] : M2_PAL.wood[0];
      return ['#efe6c8', '#d8c89a', '#c9a96a'][Math.floor(px / 3) % 3];
    });
  }
}

// What is in a trough (T: its box and the strip of its top, sx0 to sx1 on row sy): feed in bits along it as much as is
// left, or water from the middle out with a glint that moves along it; nothing when it is empty.
function m2sTrough(g, T, trough, tick) {
  const len = T.sx1 - T.sx0;
  if (trough.food > 0) {
    // Chunks of feed half a unit across, a slot every three quarters of a unit, filled as far as there is food.
    const slots = Math.floor(len / 0.75);
    const n = Math.ceil((Math.min(trough.food, M2S_FEED) / M2S_FEED) * slots);
    for (let i = 0; i < n; i += 1) {
      const k = (i * 5) % slots;
      const c = T.feed?.[i % T.feed.length] ?? ['#e8902c', '#7aa83a', '#d8402c', '#e3cf86'][i % 4];
      pxBox(g, T.sx0 + k * 0.75, T.sy - 0.25, 0.5, 0.5, c);
      pxBox(g, T.sx0 + k * 0.75, T.sy - 0.25, 0.25, 0.25, hdMix(c, '#ffffff', 0.4));
    }
  } else if (trough.water > 0) {
    const w = Math.max(0.5, Math.round((Math.min(trough.water, M2S_FEED) / M2S_FEED) * len * 4) / 4);
    const x0 = Math.round((T.sx0 + (len - w) / 2) * 4) / 4;
    pxBox(g, x0, T.sy, w, T.sh ?? 0.5, '#2f7a9e');
    pxBox(g, x0, T.sy, w, 0.25, '#4f9dbb');
    pxBox(g, x0 + Math.floor(((tick / 3) % (w * 4))) / 4, T.sy, 0.25, 0.25, '#cfe6ff');
  }
}
