// scene2-mordor.js: Mordor's ground and the Dead Marshes on the map from above (scene2.js). scene2-gondor.js's m2Mordor
// hands Mordor's ground to m2MordorLand: ash inside the mountain walls fraying at its edges, Udun's
// dark vale behind the Black Gate ringed by rock with orc forges on its floor, the cracked plateau of Gorgoroth between Mount Doom and Barad-dur
// (plates of ash split by black fissures that glow red near the mountain), scattered cinder and the roads from Udun to
// the tower and from the tower to the mountain. Northwest of the gate lie the Dead Marshes: murky pools among reeds,
// tussocks and mire, with pale faces under the water and candles that flicker over it at night. The light layer here
// draws Mordor's burning pixels again after the night's shade (the lava, the door, the slits, the torches), and when
// main is red (m2.war) it lets them burn by day and washes Mordor in red. scene2-mordor-gate.js draws the Black Gate and
// the crags, scene2-mordor-doom.js Barad-dur and Mount Doom.

// The colours that burn, and a burning copy of a painted canvas: only its pixels in those colours, the rest clear. The
// light layer draws it after the night's shade. Made in one pass over the pixels and cached by key.
const M2_MORDOR_HOT = ['#8e2412', '#c2401a', '#ff7a1e', '#ffb43a', '#ffe68a', '#ff5a1a', '#ff6a1e'];
function m2MordorGlowOf(key, src) {
  const k = `glow|${key}|${src.width}|${src.height}`;
  if (m2SouthCache.has(k)) return m2SouthCache.get(k);
  const hot = new Set(M2_MORDOR_HOT.map(m2Pack));
  const c = document.createElement('canvas');
  [c.width, c.height] = [src.width, src.height];
  const g = c.getContext('2d');
  const img = src.px32 ? g.createImageData(src.width, src.height) : src.getContext('2d').getImageData(0, 0, src.width, src.height);
  const px = new Uint32Array(img.data.buffer);
  const from = src.px32 ?? px;
  for (let i = 0; i < px.length; i += 1) px[i] = hot.has(from[i]) ? from[i] : 0;
  g.putImageData(img, 0, 0);
  m2SouthCache.set(k, c);
  return c;
}
// The plateau's plates: jittered seeds on a grid, kept per size so a relayout at the same size costs nothing.
function m2MordorSeeds(cols, rows, cell) {
  const s = new Float32Array(cols * rows * 2);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      s[(j * cols + i) * 2] = (i + 0.15 + m2Hash(i, j, 93) * 0.7) * cell;
      s[(j * cols + i) * 2 + 1] = (j + 0.15 + m2Hash(i, j, 94) * 0.7) * cell;
    }
  }
  return s;
}
// How far a pixel lies from the nearest fissure between two plates (the gap between its two nearest seeds), in pixels.
function m2MordorGap(S, cols, rows, cell, px, py) {
  const [gi, gj] = [Math.floor(px / cell), Math.floor(py / cell)];
  let [d1, d2] = [1e9, 1e9];
  for (let j = Math.max(0, gj - 1); j <= Math.min(rows - 1, gj + 1); j += 1) {
    for (let i = Math.max(0, gi - 1); i <= Math.min(cols - 1, gi + 1); i += 1) {
      const k = (j * cols + i) * 2;
      const d = (S[k] - px) ** 2 + (S[k + 1] - py) ** 2;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  }
  return Math.sqrt(d2) - Math.sqrt(d1);
}
// The plateau rx by ry units round its middle, with the mountain at (hx, hy) from its corner: fissures (red near the
// mountain, but dark under it), a lit lip on each plate's far edge, cinder and pale ash.
function m2MordorPlateauArt(rx, ry, hx, hy) {
  const cell = 26;
  const [cols, rows] = [Math.ceil((rx * 8) / cell) + 1, Math.ceil((ry * 8) / cell) + 1];
  const S = m2MordorSeeds(cols, rows, cell);
  const key = `mordorPlateau|${Math.round(hx)},${Math.round(hy)}`;
  // The edge's wobble, once a unit: the rule runs row by row, so a row of units is kept until the next.
  const wob = new Float32Array(rx * 2 + 2);
  let wobRow = -1;
  return m2SouthArt(key, rx * 2, ry * 2, (px, py) => {
    const [nx, ny] = [(px / 4 - rx) / rx, (py / 4 - ry) / ry];
    if (py >> 2 !== wobRow) { wobRow = py >> 2; wob.fill(-1); }
    if (wob[px >> 2] < 0) wob[px >> 2] = m2Noise(px >> 2, py >> 2, 6, 95);
    const edge = 1 - (nx * nx + ny * ny) - (wob[px >> 2] - 0.5) * 0.5;
    if (edge < 0) return null;
    const gap = m2MordorGap(S, cols, rows, cell, px, py);
    const heat = Math.max(0, 1 - Math.sqrt((px / 4 - hx) ** 2 + ((py / 4 - hy) * 1.6) ** 2) / 30);
    // Under the mountain nothing shows, and nothing may glow through it at night.
    const up = hy + 6 - py / 4;
    const under = up > -0.5 && up < 36 && Math.abs(px / 4 - hx) < 20 - up * 0.42;
    if (gap < 1.6 + heat * 0.8 && edge > M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.12) {
      if (heat > 0.25 && gap < 0.9 && !under) return heat > 0.6 ? '#ff7a1e' : '#c2401a';
      return heat > 0.15 && gap < 0.9 ? '#4a160c' : '#0a0708';
    }
    if (gap < 3.2 && m2MordorGap(S, cols, rows, cell, px, py - 3) < 1.6) return '#4a403e';
    const h = m2Hash(px, py, 96);
    if (h < 0.018) return '#3e2420';
    if (h > 0.992) return '#615753';
    // Each plate its own shade of ash, dithered toward the fissures, so the plateau reads as tilted slabs.
    const tone = m2Hash(Math.floor(px / cell * 3), Math.floor(py / cell * 3), 110) * 0.6 + (gap / cell) * 0.9 + M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.45;
    return edge < 0.08 && M2_BAYER[(py & 3) * 4 + (px & 3)] > edge * 10 ? null : M2_MORDOR_ASH[Math.min(3, Math.floor(tone * 2.2))];
  });
}
const M2_MORDOR_ASH = ['#231e20', '#2b2527', '#332c2d', '#3b3433'];

function m2MordorLand(L, plan) {
  const t0 = performance.now();
  const { x0, y0, x1, y1 } = plan.mordor;
  const P = plan.places;
  const [w, h] = [x1 - x0, y1 - y0];
  m2Rect(L, x0, y0, w, h, M2_MAT.ash);
  for (let t = 0; t < w + h; t += 6) {
    const [x, y] = t < w ? [x0 + t, y0] : [x0, y0 + t - w];
    m2Blob(L, x, y, 3 + m2Hash(t, 1, 57) * 4, 3 + m2Hash(t, 2, 57) * 3, M2_MAT.ash, { wob: 1.5, seed: t });
  }
  // Udun behind the gate: a sunken vale ringed by rock, its far wall a cliff, orc forges glowing on its floor.
  const gate = P.blackGate ?? { x: x0 + 14, y: y0 };
  const ud = { x: gate.x + 13, y: gate.y + 21 };
  const udun = m2SouthArt('mordorUdun', 30, 18, m2MordorUdunPx);
  L.decals.push((g) => g.drawImage(udun, ud.x - 15, ud.y - 9, 30, 18));
  ((m2.south ??= {}).glow ??= {}).udun = [{ c: m2MordorGlowOf('mordorUdun', udun), x: ud.x - 15, y: ud.y - 9, w: 30, h: 18 }];
  // The plateau of Gorgoroth between the mountain and the tower.
  const dm = P.doom;
  const bd = P.baradDur;
  if (dm && bd) {
    const [cx, cy] = [(dm.x + bd.x) / 2 - 2, Math.min(dm.y, bd.y) + 4];
    const [rx, ry] = [Math.round(Math.max(30, Math.abs(bd.x - dm.x) * 0.95)), Math.round(Math.max(18, h * 0.24))];
    const [hx, hy] = [dm.x - (cx - rx), dm.y - 6 - (cy - ry)];
    const art = m2MordorPlateauArt(rx, ry, hx, hy);
    L.decals.push((g) => g.drawImage(art, cx - rx, cy - ry, rx * 2, ry * 2));
    ((m2.south ??= {}).glow ??= {}).plateau = [{ c: m2MordorGlowOf(`plateau${rx},${ry},${Math.round(hx)},${Math.round(hy)}`, art), x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, soft: 0.7 }];
    // The roads: from Udun to the tower, and from the tower west to the mountain's door.
    const road = [[ud.x + 10, ud.y + 5], [ud.x + 30, ud.y + 14], [bd.x - 26, bd.y - 4], [bd.x - 4, bd.y + 1]];
    const toDoom = [[bd.x - 6, bd.y + 2], [bd.x - 22, bd.y + 10], [dm.x + 26, dm.y - 2], [dm.x + 15, dm.y + 0.5]];
    L.decals.push((g) => { m2MordorRoad(g, m2Meander(road, 3, 1.6)); m2MordorRoad(g, m2Meander(toDoom, 5, 1.4)); });
  }
  m2MordorMarsh(L, plan);
  m2.south.landMs = performance.now() - t0;
}
// Udun, 30 by 18 units: a rim of rock lit on its upper left, the far wall of the vale as a cliff with its lip lit and
// seams down it, a floor of dark ash, and five orc forges on it.
const M2_MORDOR_FORGES = [[-6, 2.5], [-1, 4.5], [4, 1.5], [7.5, 4], [1.5, 0]];
function m2MordorUdunPx(px, py) {
  const [u, v] = [(px + 0.5) / 4 - 15, (py + 0.5) / 4 - 9];
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  const d = Math.hypot(u / 14.5, v / 8.5) + (m2Noise(u, v, 2.5, 118) - 0.5) * 0.14;
  if (d > 1 || (d > 0.92 && b < (d - 0.92) * 12)) return null;
  for (const [fx, fy] of M2_MORDOR_FORGES) {
    const f = Math.hypot(u - fx, (v - fy) * 1.4);
    if (f < 0.55) return f < 0.3 ? '#ffb43a' : '#ff6a1e';
    if (f < 1) return '#0c0909';
  }
  if (d > 0.8) return -u - v * 1.4 + b * 4 > 3 ? '#4a4240' : u + v > 4 ? '#1e1a1b' : '#342d2e';
  const ix = u / (14.5 * 0.8);
  const top = -8.5 * 0.8 * Math.sqrt(Math.max(0, 1 - ix * ix));
  const wall = 3.4 * Math.sqrt(Math.max(0, 1 - ix * ix));
  if (v < top + wall) {
    if (v < top + 0.5) return '#4e4644';
    return (px % 5 === 0 || m2Hash(px >> 1, 1, 119) < 0.15) ? '#120e0f' : v > top + wall - 0.8 ? '#171314' : '#262022';
  }
  return m2Hash(px >> 1, py >> 1, 120) < 0.08 ? '#211b1c' : b < 0.5 ? '#161213' : '#1b1617';
}
// A beaten road of dark grit along pts, its edges ragged.
function m2MordorRoad(g, pts) {
  for (let k = 1; k < pts.length; k += 1) {
    const [[ax, ay], [bx, by]] = [pts[k - 1], pts[k]];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4);
    for (let j = 0; j <= n; j += 1) {
      const [x, y] = [Math.round((ax + ((bx - ax) * j) / n) * 4) / 4, Math.round((ay + ((by - ay) * j) / n) * 4) / 4];
      pxBox(g, x - 0.75, y - 0.5, 1.5, 1, '#3f3634');
      if (m2Hash(Math.round(x * 4), Math.round(y * 4), 100) < 0.3) pxBox(g, x - 0.75, y + 0.5, 1.5, 0.25, '#1e1819');
      if (m2Hash(Math.round(x * 4), Math.round(y * 4), 101) < 0.1) pxBox(g, x, y - 0.25, 0.25, 0.25, '#574c48');
    }
  }
}

// The Dead Marshes, 46 by 26 units round their place: the mire's pixels (pools where the slow noise runs high).
const M2_MARSH = { w: 46, h: 26, pool: 0.53 };
// The marsh's pools as a field of noise, worked out once per quarter unit (with a margin of four rows either side),
// since the art and the water marking read it several times a pixel.
let m2MordorPoolGrid = null;
function m2MordorMarshPool(u, v) {
  const [W4, H4] = [M2_MARSH.w * 4, M2_MARSH.h * 4 + 8];
  if (!m2MordorPoolGrid) {
    m2MordorPoolGrid = new Float32Array(W4 * H4);
    for (let py = 0, i = 0; py < H4; py += 1) {
      for (let px = 0; px < W4; px += 1, i += 1) {
        const [x, y] = [(px + 0.5) / 4, (py - 4 + 0.5) / 4];
        m2MordorPoolGrid[i] = m2Noise(x, y, 4.2, 102) * 0.7 + m2Noise(x, y, 1.7, 103) * 0.3;
      }
    }
  }
  const [px, py] = [Math.round(u * 4 - 0.5), Math.round(v * 4 - 0.5) + 4];
  if (px >= 0 && py >= 0 && px < W4 && py < H4) return m2MordorPoolGrid[py * W4 + px];
  return m2Noise(u, v, 4.2, 102) * 0.7 + m2Noise(u, v, 1.7, 103) * 0.3;
}
function m2MordorMarshPx(px, py) {
  const [u, v] = [(px + 0.5) / 4, (py + 0.5) / 4];
  const [nx, ny] = [(u - M2_MARSH.w / 2) / (M2_MARSH.w / 2), (v - M2_MARSH.h / 2) / (M2_MARSH.h / 2)];
  const edge = 1 - Math.abs(nx) ** 2.4 - Math.abs(ny) ** 2.4 + (m2Noise(u, v, 3, 104) - 0.5) * 0.6;
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  if (edge < b * 0.35) return null;
  const p = m2MordorMarshPool(u, v);
  const wet = edge > 0.2;
  if (p > M2_MARSH.pool && wet) {
    const face = m2Hash(Math.floor(u / 3), Math.floor(v / 2), 106) < 0.06 && p > 0.62 && Math.hypot((u % 3) - 1.5, ((v % 2) - 1) * 1.6) < 0.55;
    if (face) return (px + py) & 1 ? '#a4b29c' : '#7e8c78';
    // The far bank's lip reflects the sky; ripples run across; the water darkens toward its middle.
    if (m2MordorMarshPool(u, v - 0.75) <= M2_MARSH.pool) return '#7a9286';
    if (py % 6 === 0 && m2Hash(px >> 2, py, 105) < 0.35) return '#5a7068';
    return p > 0.64 ? '#1a2828' : p > 0.58 ? '#243634' : '#34483f';
  }
  if (p > M2_MARSH.pool - 0.03 && wet) return m2MordorMarshPool(u, v + 0.5) > M2_MARSH.pool ? '#2a2216' : '#4a3e26';
  // Reeds in clumps: blades of one pixel, three to seven tall, lit on the left, pale at the tip.
  const [cx, cy] = [px >> 3, py >> 3];
  if (m2Hash(cx, cy, 107) < 0.4 && p > 0.4) {
    const col = px & 7;
    const hgt = 3 + Math.floor(m2Hash(px, cy, 121) * 5);
    if ([1, 3, 4, 6].includes(col) && (py & 7) >= 8 - hgt) return (py & 7) === 8 - hgt ? '#c4bc70' : col < 4 ? '#8e8c44' : '#64642e';
    if ((py & 7) === 7 && col > 0 && col < 7) return '#2e3218';
  }
  const k = m2Noise(u, v, 2.4, 108) + b * 0.3;
  return k < 0.45 ? '#3e4626' : k < 0.75 ? '#4c5530' : '#5c6438';
}
// Lays the marsh on the ground (its pools are water, so walkers keep out of them) with candles over five pools.
function m2MordorMarsh(L, plan) {
  const m = plan.places.deadMarshes;
  if (!m) return;
  const [x, y] = [m.x - M2_MARSH.w / 2, m.y - M2_MARSH.h / 2];
  const art = m2SouthArt('mordorMarsh', M2_MARSH.w, M2_MARSH.h, m2MordorMarshPx);
  const candles = [];
  for (let py = 0; py < M2_MARSH.h * 4; py += 1) {
    for (let px = 0; px < M2_MARSH.w * 4; px += 1) {
      const [u, v] = [(px + 0.5) / 4, (py + 0.5) / 4];
      const p = m2MordorMarshPool(u, v);
      const [nx, ny] = [(u - M2_MARSH.w / 2) / (M2_MARSH.w / 2), (v - M2_MARSH.h / 2) / (M2_MARSH.h / 2)];
      if (p <= M2_MARSH.pool || nx * nx + ny * ny > 0.7) continue;
      const [gx, gy] = [Math.round(x * 4) + px, Math.round(y * 4) + py];
      if (gx >= 0 && gy >= 0 && gx < L.pw && gy < L.ph) L.mat[gy * L.pw + gx] = M2_MAT.water;
      if (p > 0.6 && px % 20 === 10 && py % 14 === 7 && candles.length < 8) candles.push({ x: x + u, y: y + v - 0.5, s: candles.length });
    }
  }
  L.decals.push((g) => g.drawImage(art, x, y, M2_MARSH.w, M2_MARSH.h));
  ((m2.south ??= {}).glow ??= {}).marsh = candles.map((c) => ({ ...c, candle: true }));
  plan.places.deadMarshes.candles = candles;
}

// The light layer: Mordor's burning pixels after the night's shade, the marsh candles flickering, and the war's red.
function m2MordorLight(g, tick, reduced) {
  const S = m2.south;
  if (!S?.glow || !m2.plan?.mordor) return;
  const dark = m2Dark(m2.sky?.hour ?? 12)[0];
  const war = Math.max(0, Math.min(1, m2.war ?? 0));
  if (war > 0.01) {
    const { x0, y0, x1, y1 } = m2.plan.mordor;
    g.globalAlpha = war * (0.1 + 0.04 * Math.sin(tick * 0.15));
    pxBox(g, x0, y0, x1 - x0, y1 - y0, '#8a1a0a');
  }
  const burn = Math.max(dark, war * 0.7);
  if (burn > 0.02) {
    const pulse = reduced ? 1 : 0.88 + 0.12 * Math.sin(tick * 0.21);
    for (const list of Object.values(S.glow)) {
      for (const e of list) {
        if (e.candle) {
          if (dark < 0.3) continue;
          const on = reduced || m2Hash(e.s, Math.floor((tick + e.s * 5) / 7), 109) < 0.8;
          if (!on) continue;
          const bob = reduced ? 0 : Math.round(Math.sin(tick * 0.2 + e.s) * 2) / 4;
          g.globalAlpha = dark * 0.35;
          g.drawImage(m2Glow(3, '#bfe0b0'), e.x - 3, e.y - 3 + bob, 6, 6);
          g.globalAlpha = dark;
          pxBox(g, e.x - 0.25, e.y - 0.5 + bob, 0.5, 0.75, '#e8ffd8');
          continue;
        }
        if (e.torch) {
          if (dark < 0.2) continue;
          const k = reduced ? 0 : (tick + Math.round(e.x)) % 3;
          g.globalAlpha = dark;
          pxBox(g, e.x - 0.25, e.y - 1 - (k === 1 ? 0.25 : 0), 0.5, 0.75, '#ffb43a');
          pxBox(g, e.x - 0.25 + (k === 2 ? 0.25 : 0), e.y - 0.25, 0.5, 0.5, '#ff6a1e');
          continue;
        }
        g.globalAlpha = burn * (e.soft ?? 1) * pulse;
        g.drawImage(e.c, e.x, e.y, e.w, e.h);
      }
    }
  }
  g.globalAlpha = 1;
}
m2.layers.light.push(m2MordorLight);
