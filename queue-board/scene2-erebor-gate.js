// scene2-erebor-gate.js: Erebor's Front Gate on the map from above (scene2-erebor.js lays it out). A facade of dressed
// stone cut into the Lonely Mountain's cliff: the gate between fluted pillars banded with carving, under a lintel inlaid
// with gold runes and a gold crown, its dark hall within lit by the hoard's gold heaped on the floor (sparkles wink
// over it, and the halls glow at night); either side a dwarf king carved in the rock, helmed and crowned, his beard in
// braids to his belt, his hands on the haft of a great axe or hammer resting on his plinth. Before it the court:
// flagstones in staggered courses, a ring of runes round a knot of interlace before the steps, kerbs round its edge, and
// braziers whose fires flicker and glow at night. Painted once per size into canvases (m2EreArt) and laid on the ground.

const M2_ERE_GATE = ['#2e2b34', '#504c57', '#6d6974', '#8b8692', '#aba6b2', '#d0cbd6'];
const M2_ERE_KING = ['#221f28', '#3b3742', '#57525e', '#77727e', '#a19ca7', '#ccc7d1'];
const M2_ERE_FLAG = ['#36312e', '#4f4944', '#665f58', '#7d756c', '#958c81', '#b1a89a'];
const M2_ERE_RUNE = [[1, 0, 1, 1, 0, 1], [1, 1, 0, 1, 0, 0], [0, 1, 1, 0, 1, 1], [1, 0, 0, 1, 1, 0]];

// The gate's size from the facade's: its width, the pillars', each statue's, and the gate's height.
function m2EreGateSize(E) {
  const gw = Math.max(13, Math.min(18, Math.round(E.fh * 0.5)));
  const sw = Math.max(11, Math.min(15, Math.round(E.fh * 0.4)));
  return { gw, pw: 3, sw, gh: Math.min(E.fh - 7, Math.round(gw * 1.45)) };
}

// A king's statue sw by sh units, his weapon an axe or a hammer: a frontal figure carved in stone, lit on his left.
function m2EreKing(sw, sh, axe) {
  const key = `king${sw},${sh},${axe}`;
  if (m2EreArt.has(key)) return m2EreArt.get(key);
  const [W, H] = [sw * 4, sh * 4];
  const P = M2_ERE_KING;
  // What part of the statue a pixel is: helm, face, beard, body, hands, haft, head (of the weapon), boots, or nothing.
  const part = (px, py) => {
    const [u, v] = [(px + 0.5 - W / 2) / (W / 2), (py + 0.5) / H];
    const a = Math.abs(u);
    if (v < 0.035) return [-0.3, 0, 0.3].some((p) => Math.abs(u - p) < 0.06) ? 'crown' : null;
    if (v < 0.14) return a < 0.36 * Math.sqrt(Math.min(1, (v - 0.02) / 0.05)) ? (v < 0.06 ? 'crown' : 'helm') : null;
    if (v < 0.23 && a < 0.28) return 'face';
    const bw = 0.22 + (v - 0.2) * 0.32;
    const fork = v > 0.56 && a < (v - 0.56) * 1.4;
    if (v >= 0.2 && v < 0.64 && a < bw && !fork) return 'beard';
    if (v >= 0.62 && v < 0.7 && a < 0.3) return 'hands';
    if (v >= 0.66 && v < 0.98 && a < 0.065) return 'haft';
    const head = axe ? v > 0.8 && v < 0.98 && a < 0.42 && a > 0.06 && Math.abs(v - 0.89) < 0.09 * (0.4 + a * 1.6) : v > 0.85 && v < 0.98 && a < 0.32;
    if (head) return 'head';
    if (v >= 0.2 && v < 0.33 && a < Math.min(0.96, 0.62 + (v - 0.2) * 4)) return 'body';
    if (v >= 0.33 && v < 0.66 && a < 0.96 - (v - 0.33) * 0.3) return a > 0.66 ? 'arm' : 'body';
    if (v >= 0.66 && v < 0.94 && a < 0.62 + (v - 0.66) * 0.5) return 'body';
    if (v >= 0.94 && a > 0.12 && a < 0.62) return 'boot';
    return null;
  };
  const { c } = m2EreImage(sw, sh, (px, py) => {
    const p = part(px, py);
    if (!p) return null;
    if (!part(px - 1, py) || !part(px + 1, py) || !part(px, py - 1) || !part(px, py + 1)) return P[0];
    const u = (px + 0.5 - W / 2) / (W / 2);
    const side = u < -0.25 ? 1 : u > 0.35 ? -1 : 0;
    if (p === 'crown') return M2_PAL.gold[u < 0 ? 3 : 2];
    if (p === 'face') return py < H * 0.155 ? P[5] : Math.abs(Math.abs(u) - 0.13) < 0.06 && py < H * 0.19 ? P[0] : Math.abs(u) < 0.05 ? P[5] : P[3 + (u < 0 ? 1 : 0)];
    if (p === 'beard') return Math.floor((u + 1) * 9) % 3 === 0 ? P[3] : P[u < 0.1 ? 5 : 4];
    if (p === 'haft') return P[u < 0 ? 5 : 3];
    if (p === 'head') return P[(py & 3) === 0 ? 5 : 4 + (side < 0 ? -1 : 0)];
    if (p === 'hands') return P[4 + (side < 0 ? -1 : 0)];
    if (p === 'helm') return P[Math.max(1, Math.min(5, 3 + side + (py < H * 0.08 ? 1 : 0)))];
    if (p === 'boot') return P[3];
    if (p === 'arm') return P[side > 0 ? 4 : 2];
    const mail = (px + py) % 2 === 0 && py > H * 0.66 ? -1 : 0;
    return P[Math.max(2, 3 + side + mail - (py > H * 0.85 ? 1 : 0))];
  });
  m2EreArt.set(key, c);
  return c;
}

// The facade, the gate, the statues, and the steps down, as one canvas laid on the ground, with the hall's glow and the
// hoard's sparkles over it each frame.
function m2EreFacade(L, add, E) {
  const S = m2EreGateSize(E);
  const { cx, fw, fh } = E;
  const x0 = cx - fw / 2;
  const y0 = E.top;
  const key = `fac${fw},${fh},${S.gw},${S.sw},${S.gh}`;
  if (!m2EreArt.has(key)) m2EreArt.set(key, m2EreFacadeArt(fw, fh, S));
  const art = m2EreArt.get(key);
  L.decals.push((g) => {
    g.drawImage(art, x0, y0, fw, fh);
    m2Steps(g, cx - S.gw / 2 - 1, E.courtTop, S.gw + 2, 3, M2_ERE_GATE);
  });
  const gy = E.courtTop;
  // The hoard's sparkles: points on the gold heaps inside the gate, each winking in turn.
  const pts = [];
  for (let i = 0; i < 9; i += 1) pts.push([cx + (m2Hash(i, 1, 68) - 0.5) * (S.gw - 3), gy - 1.2 - m2Hash(i, 2, 68) * 2.6, Math.floor(m2Hash(i, 3, 68) * 24)]);
  const spark = (g, tick, reduced) => {
    if (reduced) return;
    for (const [sx, sy, ph] of pts) {
      const t = (tick + ph) % 24;
      if (t > 5) continue;
      const c = t === 2 || t === 3 ? '#ffffff' : '#fff1a8';
      pxBox(g, sx - 0.25, sy, 0.75, 0.25, c);
      if (t === 2 || t === 3) pxBox(g, sx, sy - 0.5, 0.25, 1.25, c);
    }
  };
  spark.under = true;
  spark.m2own = true;
  add.anim(spark);
  add.light({ x: cx, y: gy - 3, r: 10, c: '#ffb04a' });
  add.light({ x: cx, y: gy - S.gh * 0.6, r: 7, c: '#ff9a3a', fire: true });
  E.spots.push({ x: cx - 2, y: gy + 6, face: 'up', job: 'gate' }, { x: cx + S.gw / 2 - 1, y: gy + 2, face: 'up', job: 'hoard', mid: cx, vault: { cx, gy, gw: S.gw } });
  E.keep.push({ x0: x0, y0: y0, x1: x0 + fw, y1: gy + 5 });
}
function m2EreFacadeArt(fw, fh, S) {
  const [W, H] = [fw * 4, fh * 4];
  const G = M2_ERE_GATE;
  const mid = W / 2;
  const [gw, pw, gh] = [S.gw * 4, S.pw * 4, S.gh * 4];
  const gx0 = mid - gw / 2;
  const lin = H - gh - 16;
  const { c, g } = m2EreImage(fw, fh, (px, py) => {
    const dx = px - mid;
    const ax = Math.abs(dx + 0.5);
    // The cut's lip: the rock's shadow along the top and down the east side.
    if (py < 3 || px > W - 4) return G[0];
    if (px < 2) return G[4];
    // The gate's opening, its top stepped in twice, dark within and lit low by the gold.
    const step = py < H - gh + 4 ? 8 : py < H - gh + 8 ? 4 : 0;
    if (ax < gw / 2 - step && py >= H - gh) {
      const t = (py - (H - gh)) / gh;
      const heap = H - py < 10 - Math.abs(Math.sin(dx / 6)) * 5 - (ax / (gw / 2)) * 3;
      if (heap) return M2_PAL.gold[(px * 7 + py * 3) % 11 === 0 ? 4 : (px + py) % 3 === 0 ? 3 : H - py < 3 ? 1 : 2];
      if (ax > gw / 2 - step - 2) return G[0];
      return t < 0.35 ? '#08060a' : t < 0.7 ? '#130b0c' : '#2a1610';
    }
    // The pillars either side: fluted, banded with carving every few units, the left face lit.
    if (ax >= gw / 2 && ax < gw / 2 + pw && py >= lin) {
      const k = ax - gw / 2;
      if ((py - lin) % 20 < 3) return (px + py) % 2 ? G[5] : G[3];
      return k === 0 || k === pw - 1 ? G[0] : G[k % 3 === 1 ? 2 : dx < 0 ? 5 : 4];
    }
    // The lintel over both, inlaid with runes in gold, and the crown above its middle.
    if (ax < gw / 2 + pw + 2 && py >= lin - 2 && py < lin + 14) {
      if (py === lin - 2 || py === lin + 13) return G[0];
      if (py < lin + 1) return G[5];
      const [rc, rr] = [Math.floor((px - gx0 + 2) / 6), py - lin - 3];
      const glyph = M2_ERE_RUNE[((rc % 4) + 4) % 4];
      if (rr >= 0 && rr < 8 && (px - gx0 + 2) % 6 < 2 && glyph[Math.floor(rr / 1.4)] && ax < gw / 2 + pw - 2) return M2_PAL.gold[rr < 3 ? 3 : 2];
      return G[py < lin + 3 ? 4 : 3];
    }
    if (ax < 8 && py >= lin - 14 && py < lin - 2) {
      const [cxp, cyp] = [Math.floor((dx + 8) / 3), Math.floor((py - lin + 14) / 3)];
      const crown = ['#.#.#', '#####', '.###.', '.....'][cyp]?.[Math.min(4, cxp)] === '#';
      return crown ? M2_PAL.gold[cyp === 0 ? 4 : 2] : py === lin - 14 ? G[0] : G[3];
    }
    // The niches behind the statues, then the facade's dressed courses.
    const nx = ax - (gw / 2 + pw + 2);
    if (nx >= 0 && nx < S.sw * 4 && py > 10 && py < H - 10) return nx < 2 || py < 13 ? '#1a181e' : nx < 6 ? G[0] : '#24212a';
    const row = Math.floor(py / 12);
    const j = (px + (row % 2) * 10) % 20;
    if (py % 12 === 0 || j === 0) return G[1];
    if (py % 12 === 1 || j === 1) return G[4];
    return G[3 - (m2Hash(Math.floor((px + (row % 2) * 10) / 20), row, 69) < 0.4 ? 1 : 0)];
  });
  // The statues on their plinths in the niches, the axe-bearer on the west and the hammer-bearer on the east.
  const sh = fh - 6;
  for (const [side, axe] of [[-1, true], [1, false]]) {
    const sx = fw / 2 + side * (S.gw / 2 + S.pw + 2 + S.sw / 2) - S.sw / 2;
    g.drawImage(m2EreKing(S.sw, sh - 3, axe), sx, 2.5, S.sw, sh - 3);
    m2Retain(g, sx - 0.5, fh - 4.5, S.sw + 1, 4.5, G);
  }
  return c;
}

// The court before the gate, in a canvas laid on the ground under the mountain's foot: a hollow that widens from the
// facade toward the road with rounded front corners, paved in staggered courses of flags, the rune ring and its knot
// before the steps, kerbs round its edge, open where the river runs.
function m2EreCourt(L, add, E) {
  const { r, cx } = E;
  const half = (y) => E.fw / 2 + 10 + Math.max(0, (y - E.courtTop) / E.cd) * 16;
  const inside = (x, y) => {
    const hw = half(y);
    const dx = Math.abs(x - cx) - (hw - 6);
    const dy = y - (E.courtBot - 6);
    return Math.abs(x - cx) < hw && (dx < 0 || dy < 0 || (dx / 6) ** 2 + (dy / 6) ** 2 < 1);
  };
  const [x0, x1] = [Math.max(r.x + 1, cx - half(E.courtBot) - 1), Math.min(r.x + r.w - 1, cx + half(E.courtBot) + 1)];
  const [y0, y1] = [E.courtTop - 3, E.courtBot];
  for (let py = Math.max(0, Math.round(y0 * 4)); py < Math.min(L.ph, Math.round(y1 * 4)); py += 1) {
    const hw = half(py / 4) * 4;
    for (let px = Math.max(0, Math.round((cx * 4) - hw)); px < Math.min(L.pw, Math.round(cx * 4 + hw)); px += 1) {
      if (py / 4 > E.courtBot - 6 && !inside(px / 4, py / 4)) continue;
      const i = py * L.pw + px;
      L.mat[i] = M2_MAT.plaza;
      L.under[i] = M2_MAT.plaza;
      L.aux[i] = 0;
    }
  }
  const wet = E.wet ?? (() => false);
  const ring = { x: cx, y: E.courtTop + E.cd * 0.58, rx: Math.min(E.cd * 1.15, E.fw * 0.36), ry: Math.min(E.cd * 1.15, E.fw * 0.36) * 0.42 };
  const key = `court${x1 - x0},${y1 - y0},${cx - x0},${ring.rx},${E.cd},${E.riverKey ?? ''}`;
  if (!m2EreArt.has(key)) m2EreArt.set(key, m2EreCourtArt(x0, y0, x1 - x0, y1 - y0, ring, wet, inside));
  const art = m2EreArt.get(key);
  L.decals.push((g) => g.drawImage(art, x0, y0, x1 - x0, y1 - y0));
}
function m2EreCourtArt(x0, y0, w, h, ring, wet, inside) {
  const F = M2_ERE_FLAG;
  const { c } = m2EreImage(w, h, (px, py) => {
    const [x, y] = [x0 + px / 4, y0 + py / 4];
    if (wet(x, y) || !inside(x, y)) return null;
    // Kerbs: pale stones round the edge, a dark line outside them.
    if (!inside(x - 1.25, y) || !inside(x + 1.25, y) || !inside(x, y + 1.25)) {
      if (!inside(x - 0.25, y) || !inside(x + 0.25, y) || !inside(x, y + 0.25)) return F[0];
      return (Math.floor(px / 12) + Math.floor(py / 12)) % 2 ? F[5] : F[4];
    }
    const [nx, ny] = [(x - ring.x) / ring.rx, (y - ring.y) / ring.ry];
    const d = Math.hypot(nx, ny);
    if (d < 1.12) {
      if (d > 0.95 || (d > 0.8 && d < 0.84)) return d > 1.08 || d < 0.81 ? F[0] : F[1];
      if (d > 0.84) {
        // The rune band: a mark at every few degrees, gold in the stone.
        const a = Math.floor(((Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI)) * 40);
        return a % 2 === 0 && M2_ERE_RUNE[a % 4][Math.floor((d - 0.84) * 50) % 6] ? '#c9a24a' : '#3c414c';
      }
      // The knot: two squares of interlace turned against each other round a gold boss.
      if (d < 0.18) return d < 0.1 ? '#fbdd86' : '#a8742a';
      const sq = (u, v) => Math.abs(Math.max(Math.abs(u), Math.abs(v)) - 0.5) < 0.07;
      const [ru, rv] = [(nx + ny) * 0.7071, (ny - nx) * 0.7071];
      if (sq(nx, ny) || sq(ru, rv)) return (Math.floor(Math.atan2(ny, nx) * 4) % 2 ? F[5] : F[4]);
      return '#2f333c';
    }
    // The flags: short courses of squarish slabs, each its own shade, a soft light edge and dark joints.
    const row = Math.floor(py / 8);
    const len = 10 + Math.floor(m2Hash(row, 0, 70) * 3) * 3;
    const j = (px + row * 5) % len;
    if (py % 8 === 7 || j === 0) return F[1];
    const tone = m2Hash(Math.floor((px + row * 5) / len), row, 71);
    if (py % 8 === 0) return F[tone < 0.5 ? 3 : 4];
    return F[tone < 0.3 ? 2 : 3];
  });
  return c;
}

// The braziers: a bronze bowl on a stone pedestal either side of the steps and at the court's front corners, each fire
// flickering in four frames painted once, glowing at night.
function m2EreBraziers(L, add, E) {
  const S = m2EreGateSize(E);
  const P = M2_ERE_GATE;
  const flames = m2EreArt.get('flame') ?? [0, 1, 2, 3].map((k) => {
    const { c, g } = m2Canvas(4, 5);
    m2Raster(g, 0, 0, 16, 20, (px, py) => {
      const sway = Math.sin((py + k * 5) / 3) * (20 - py) * 0.08;
      const half = Math.max(0, (py - 2 - (k % 2)) * 0.42);
      const d = Math.abs(px + 0.5 - 8 - sway);
      if (d > half || py > 19) return null;
      const f = d / Math.max(1, half) + (20 - py) / 26;
      return f < 0.55 ? '#fff3c4' : f < 0.85 ? '#ffd35a' : f < 1.1 ? '#ff8a2a' : '#c2441c';
    });
    return c;
  });
  m2EreArt.set('flame', flames);
  const spots = [[E.cx - S.gw / 2 - 4, E.courtTop + 4], [E.cx + S.gw / 2 + 4, E.courtTop + 4]];
  for (const [bx, by] of spots) {
    m2Shadow(L, bx + 1.5, by, 3, 1.2, 0.8);
    const o = m2Thing(add, bx - 2.5, by - 9, 5, 9.5, by, (g) => {
      m2Raster(g, 0, 0, 20, 38, (px, py) => {
        if (py < 8) return Math.abs(px + 0.5 - 10) < 10 - Math.max(0, py - 3) * 0.9 ? (py < 2 ? '#2a1a12' : py < 3 ? '#e09a4a' : px < 8 ? '#c27a34' : '#8a4e22') : null;
        if (py < 30) return Math.abs(px + 0.5 - 10) < 3.5 + (py > 26 ? 2 : 0) ? P[px < 9 ? 4 : 2] : null;
        return px > 1 && px < 18 ? P[py === 30 ? 5 : px < 8 ? 3 : 2] : null;
      });
    });
    o.foot = [bx - 2.5, by - 1.5, bx + 2.5, by + 0.5];
    const fire = (g, tick, reduced) => g.drawImage(flames[reduced ? 0 : (tick + Math.round(bx)) % 4], bx - 2, by - 13.5, 4, 5);
    fire.item = true;
    fire.z = by + 0.05;
    fire.m2own = true;
    add.anim(fire);
    add.light({ x: bx, y: by - 10, r: 9, c: '#ff9a40', fire: true });
  }
  E.spots.push({ x: spots[0][0] - 4, y: spots[0][1] + 3, face: 'right', job: 'brazier' });
}
