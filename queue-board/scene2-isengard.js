// scene2-isengard.js: Isengard on the map from above (scene2.js), at the Misty Mountains' southern tip. The Circle of
// Isengard is a great ring wall of black rock seen from overhead, its flat top lit and its outer face fluted like a
// cliff, pierced in the south by its one gate, an arched tunnel with its iron doors swung in. Inside, the plain is paved
// with dark flags and crossed by pale ways running out from the tower, lined with pillars of marble, copper and iron;
// shafts sunk in the paving breathe steam and glow at night. Black Orthanc stands in the middle (scene2-isengard-
// orthanc.js). The ring is cut into sixteen pieces, each sorted by its own front row with its own footprint, so a walker
// inside stands in front of the far wall and behind the near one, and the gate stays open.

// The black rock of the ring, outline to shine.
const M2_ISEN_ROCK = ['#060609', '#0f0f14', '#18181f', '#22222a', '#2e2e37', '#3d3c47', '#55535f', '#6e6c78'];
// The ring's measures in units: outer half axes, wall thickness across and down, wall height, gate half width.
const M2_ISEN_RING = { rx: 17, ry: 10.5, tx: 2.6, ty: 1.7, h: 5, gate: 2.4, n: 16 };

// One pixel of the whole ring, in a canvas whose top left is (cx - rx - 0.5, cy - ry - h - 0.5): its colour and which
// of the sixteen pieces it belongs to, or null. The top first, then the outer face of the near half, then the inner
// face of the far half.
function m2IsenRingPx(px, py) {
  const { rx, ry, tx, ty, h, gate, n } = M2_ISEN_RING;
  const [rxi, ryi] = [rx - tx, ry - ty];
  const dx = (px + 0.5) / 4 - (rx + 0.5);
  const gy = (py + 0.5) / 4 - (ry + h + 0.5);
  const ell = (x, y, a, b) => (x / a) ** 2 + (y / b) ** 2;
  const seg = (ang) => Math.floor((((ang + Math.PI / n) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / ((2 * Math.PI) / n));
  const R = M2_ISEN_ROCK;
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  const ty0 = gy + h;
  const oT = ell(dx, ty0, rx, ry);
  const iT = ell(dx, ty0, rxi, ryi);
  if (oT <= 1 && iT > 1) {
    // The flat top: its rims dark, a lit band along its inner rim in the far half, grainy rock between.
    const s = seg(Math.atan2(ty0 / ry, dx / rx));
    if (oT > 0.93 || iT < 1.05) return { c: R[ty0 < 0 && iT < 1.05 ? 6 : 1], s };
    const grain = m2Hash(px >> 1, py, 81) < 0.12 ? -1 : 0;
    return { c: R[(ty0 < -2 ? 5 : 4) + grain + (b > 0.7 ? 1 : 0)], s };
  }
  if (Math.abs(dx) < rx) {
    const yo = ry * Math.sqrt(1 - (dx / rx) ** 2);
    if (gy > yo - h && gy <= yo) {
      const s = seg(Math.atan2(yo / ry, dx / rx));
      const up = yo - gy;
      // The gate: an arched tunnel through the near wall, open where it shows the plain, its iron doors swung in.
      const spring = h - 1.1 - (1 - Math.sqrt(Math.max(0, 1 - (dx / gate) ** 2))) * 1.6;
      if (Math.abs(dx) < gate && up < spring) {
        if (Math.abs(dx) > gate - 0.5 || up > spring - 0.4) return { c: R[0], s };
        if (Math.abs(dx) > gate - 1.1) return { c: (py % 3 === 0 ? '#3a3a44' : '#24242c'), s };
        return null;
      }
      if (Math.abs(dx) < gate + 0.9 && up < spring + 0.9) return { c: R[Math.abs(dx) < gate + 0.4 && up > 0.3 ? 6 : 5], s };
      // The outer face: fluted like a cliff, lit where it turns west, a dark foot.
      const lit = -dx / rx;
      let k = lit > 0.55 ? 4 : lit > 0.1 ? 3 : lit > -0.45 ? 2 : 1;
      const flute = m2Hash(px >> 1, 3, 82);
      if (flute < 0.18) k -= 1; else if (flute > 0.86) k += 1;
      if (up < 0.6) k = 0;
      else if (up > h - 0.5) k += 1;
      return { c: R[Math.max(0, Math.min(6, k + (b > 0.85 ? 1 : 0)))], s };
    }
  }
  if (Math.abs(dx) < rxi) {
    const yi = -ryi * Math.sqrt(1 - (dx / rxi) ** 2);
    if (gy > yi - h && gy <= yi) {
      // The inner face of the far half, lit where it turns west (on the east side of the ring).
      const s = seg(Math.atan2(yi / ryi, dx / rxi));
      const lit = dx / rxi;
      let k = lit > 0.5 ? 3 : lit > -0.2 ? 2 : 1;
      if (m2Hash(px >> 1, 4, 82) < 0.16) k -= 1;
      if (yi - gy < 0.5) k = 0;
      return { c: R[Math.max(0, k)], s };
    }
  }
  return null;
}

// The ring painted once: per pixel its colour and piece, and each piece's box in pixels.
let m2IsenRingData = null;
function m2IsenRingMap() {
  if (m2IsenRingData) return m2IsenRingData;
  const { rx, ry, h, n } = M2_ISEN_RING;
  const [W, H] = [Math.ceil((rx * 2 + 1) * 4), Math.ceil((ry * 2 + h + 1) * 4)];
  const col = new Array(W * H).fill(null);
  const seg = new Int8Array(W * H).fill(-1);
  const box = Array.from({ length: n }, () => [1e9, 1e9, -1, -1]);
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const p = m2IsenRingPx(px, py);
      if (!p) continue;
      const i = py * W + px;
      [col[i], seg[i]] = [p.c, p.s];
      const bx = box[p.s];
      [bx[0], bx[1], bx[2], bx[3]] = [Math.min(bx[0], px), Math.min(bx[1], py), Math.max(bx[2], px), Math.max(bx[3], py)];
    }
  }
  m2IsenRingData = { W, H, col, seg, box };
  return m2IsenRingData;
}

// The plain inside the ring, as a ground decal (rxi by ryi round the centre): dark flags in courses, the pale ways out
// from the tower with kerbs, the court round its foot, the ring's own shadow along its western inner rim, Orthanc's
// shadow cast east, and the shafts with their grates.
function m2IsenPlainPx(px, py, rxi, ryi, shafts) {
  const dx = (px + 0.5) / 4 - rxi;
  const gy = (py + 0.5) / 4 - ryi;
  if ((dx / rxi) ** 2 + (gy / ryi) ** 2 > 1) return null;
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  for (const [sx, sy] of shafts) {
    const d = ((dx - sx) / 1.1) ** 2 + ((gy - sy) / 0.75) ** 2;
    if (d < 1) return d > 0.62 ? (gy < sy ? '#4a2c22' : '#6e4632') : ((px + py) % 2 && (px % 3) ? '#0a0605' : '#2a1610');
  }
  let shade = 0;
  if (((dx + 1.4) / rxi) ** 2 + ((gy + 0.9) / ryi) ** 2 > 1) shade = 2;
  else if (((dx - 7.5) / 8) ** 2 + ((gy - 2.1) / 1.9) ** 2 < 1 && dx > 3) shade = 1;
  const tower = (dx / 6.6) ** 2 + ((gy - 1.4) / 4.2) ** 2;
  let ramp = null;
  if (tower < 1) ramp = tower > 0.86 ? 1 : 3;
  else {
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      const [wx, wy] = [Math.cos(a) * rxi, Math.sin(a) * ryi];
      const len = Math.hypot(wx, wy);
      const along = (dx * wx + gy * wy) / len;
      const off = Math.abs(dx * wy - gy * wx) / len;
      const hw = k === 2 ? 1.9 : k % 2 ? 0.9 : 1.3;
      if (along > 0 && off < hw) { ramp = off > hw - 0.3 ? 1 : (Math.floor(along * 2) % 2 ? 3 : 4) - (m2Hash(px >> 2, py >> 2, 83) < 0.15 ? 1 : 0); break; }
    }
  }
  const P = ['#16161b', '#2a2a31', '#3a3a42', '#4c4b54', '#5c5b64'];
  if (ramp == null) {
    const row = Math.floor(py / 4);
    const j = (px + (row % 2) * 4) % 8;
    if (py % 4 === 0 || j === 0) ramp = 0;
    else ramp = m2Hash((px + (row % 2) * 4) >> 3, row, 84) < 0.4 ? 1 : 2;
    if (ramp && b > 0.88) ramp += 1;
  }
  ramp = Math.max(0, ramp - shade);
  return shade === 1 && ramp > 0 && (px ^ py) & 1 ? P[ramp - 1] : P[ramp];
}

// A chain slung between two pillars' rings, sagging between them, dark iron with a lit link here and there.
function m2IsenChain(add, [ax, ay], [bx, by]) {
  const [x0, x1, y0] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by) - 4];
  const w = Math.max(0.5, x1 - x0);
  add.obj({ x: x0, y: y0, w, h: Math.abs(by - ay) + 2.5, z: Math.max(ay, by) + 0.05, draw: (g) => {
    for (let t = 0; t <= 1; t += 0.06) {
      const [x, y] = [ax + (bx - ax) * t, ay - 3.2 + (by - ay) * t + Math.sin(t * Math.PI) * 0.9];
      g.fillStyle = Math.round(t * 16) % 3 ? '#26262c' : '#6a6a72';
      g.fillRect(Math.round(x * 4) / 4, Math.round(y * 4) / 4, 0.25, 0.25);
    }
  } });
}
// A pillar 1.25 by 4.5 units in marble, copper or iron, lit on its left, with a capital and a chain ring.
function m2IsenPillarPx(kind) {
  const M = { marble: ['#4a4650', '#9e9aa4', '#c8c4cc', '#ecebef'], copper: ['#2a1810', '#7a4a2a', '#a8683a', '#e09a5a'], iron: ['#08080a', '#24242a', '#3a3a42', '#5a5a64'] }[kind];
  return (px, py) => {
    const cap = py < 3;
    if (!cap && (px === 0 || px === 4)) return py > 15 ? M[0] : null;
    if (cap) return py === 0 ? M[3] : py === 2 ? M[0] : M[2];
    if (py === 17) return M[0];
    return M[px === 1 ? 3 : px === 2 ? 2 : 1];
  };
}

function m2Isengard(L, plan, season, add) {
  const t0 = performance.now();
  const I = plan.places.isengard;
  const { rx, ry, tx, ty, h, gate, n } = M2_ISEN_RING;
  const [cx, cy] = [I.x, I.y + 1];
  const [rxi, ryi] = [rx - tx, ry - ty];
  // The ring's shadow on the ground outside it, to the east and south.
  for (let py = Math.round((cy - ry) * 4); py < Math.round((cy + ry + 2) * 4); py += 1) {
    for (let px = Math.round((cx - rx) * 4); px < Math.round((cx + rx + 2.5) * 4); px += 1) {
      if (px < 0 || py < 0 || px >= L.pw || py >= L.ph) continue;
      const [dx, gy] = [px / 4 - cx, py / 4 - cy];
      if ((dx / rx) ** 2 + (gy / ry) ** 2 > 1 && ((dx - 1.8) / rx) ** 2 + ((gy - 1) / ry) ** 2 <= 1) L.shade[py * L.pw + px] = 2;
    }
  }
  const shafts = [[-8.5, -3.6], [8.6, -3.4], [-9.4, 3.2], [9.2, 3.6], [-3.6, -6.2], [4.2, 6.4]];
  const plainArt = m2SouthArt('isenPlain', rxi * 2, ryi * 2, (px, py) => m2IsenPlainPx(px, py, rxi, ryi, shafts));
  L.decals.push((g) => g.drawImage(plainArt, cx - rxi, cy - ryi, rxi * 2, ryi * 2));
  // The sixteen pieces of the ring, each its own standing thing with its footprint; the gate's piece leaves its arch open.
  const R = m2IsenRingMap();
  const [ox, oy] = [cx - rx - 0.5, cy - ry - h - 0.5];
  for (let s = 0; s < n; s += 1) {
    const [bx0, by0, bx1, by1] = R.box[s];
    if (bx1 < 0) continue;
    const [w, hh] = [(bx1 - bx0 + 1) / 4, (by1 - by0 + 1) / 4];
    const c = m2SouthArt(`isenRing${s}`, w, hh, (px, py) => {
      const i = (py + by0) * R.W + px + bx0;
      return R.seg[i] === s ? R.col[i] : null;
    });
    const [x, y] = [ox + bx0 / 4, oy + by0 / 4];
    const a0 = ((s - 0.5) / n) * Math.PI * 2;
    const a1 = ((s + 0.5) / n) * Math.PI * 2;
    const pts = [a0, (a0 + a1) / 2, a1].flatMap((a) => [[cx + Math.cos(a) * rx, cy + Math.sin(a) * ry], [cx + Math.cos(a) * rxi, cy + Math.sin(a) * ryi]]);
    const fx = pts.map((p) => p[0]);
    const fy = pts.map((p) => p[1]);
    const foot = [Math.min(...fx), Math.min(...fy), Math.max(...fx), Math.max(...fy)];
    const o = { x, y, w, h: hh, z: foot[3], c, draw: (dst) => dst.drawImage(c, x, y, w, hh) };
    if (s === Math.round(n / 4)) {
      // The gate's piece blocks only its two sides.
      add.obj({ ...o, foot: [foot[0], foot[1], cx - gate - 0.3, foot[3]] });
      add.obj({ x: cx + gate + 0.3, y: foot[1], w: 0.01, h: 0.01, z: foot[3] - 0.01, foot: [cx + gate + 0.3, foot[1], foot[2], foot[3]], draw: () => {} });
    } else add.obj({ ...o, foot });
  }
  // Pillars in pairs down the four great ways, each kind in turn.
  const kinds = ['marble', 'copper', 'iron'];
  let k = 0;
  for (const [a, from, step, hw] of [[Math.PI / 2, 7.4, 2.6, 1.9], [0, 8, 3, 1.3], [Math.PI, 8, 3, 1.3], [-Math.PI / 2, 5.2, 2.2, 1.3]]) {
    const [wx, wy] = [Math.cos(a) * rxi, Math.sin(a) * ryi];
    const len = Math.hypot(wx, wy);
    const [ux, uy] = [wx / len, wy / len];
    const prev = {};
    for (let d = from; d < len - 1.6; d += step) {
      for (const side of [-1, 1]) {
        const off = hw + 0.7;
        const [x, y] = [cx + ux * d - uy * off * side, cy + uy * d + ux * off * side * 0.62];
        const kind = kinds[k++ % 3];
        m2SouthThing(add, `isenPillar-${kind}`, x - 0.62, y - 4.4, 1.25, 4.5, y, m2IsenPillarPx(kind));
        if (prev[side]) m2IsenChain(add, prev[side], [x, y]);
        prev[side] = [x, y];
      }
    }
  }
  if (typeof m2IsenOrthanc === 'function') m2IsenOrthanc(L, plan, add, I.x, I.y);
  m2IsenVents(add, shafts.map(([sx, sy]) => [cx + sx, cy + sy]));
  m2.south = { ...(m2.south ?? {}), isengard: true };
  window.m2IsenMs = performance.now() - t0;
}

// Steam rising from the shafts in soft puffs that drift and fade, and their embers glowing at night.
function m2IsenVents(add, vents) {
  const puff = m2SouthArt('isenPuff', 3, 3, (px, py) => {
    const d = Math.hypot(px - 5.5, py - 5.5);
    return d > 5.6 ? null : d > 4.4 || (px > 6 && py > 6) ? '#9a96a0' : '#d4d0d8';
  });
  vents.forEach(([x, y], i) => {
    if (i % 2) add.light({ x, y, r: 4, c: '#ff5a2a', fire: true });
  });
  const f = (g, tick, reduced) => {
    for (let i = 0; i < 4; i += 1) {
      const [x, y] = vents[i];
      for (let j = 0; j < 3; j += 1) {
        const t = (((reduced ? 40 : tick) + i * 37 + j * 40) % 120) / 120;
        const s = 1 + t * 2.2;
        g.globalAlpha = 0.5 * (1 - t) * Math.min(1, t * 6);
        g.drawImage(puff, Math.round((x + Math.sin(t * 5 + i) * 1.2 + t * 1.5 - s / 2) * 4) / 4, Math.round((y - 0.5 - t * 9 - s / 2) * 4) / 4, s, s);
      }
    }
    g.globalAlpha = 1;
  };
  f.over = true;
  add.anim(f);
}

m2.builds.push(m2Isengard);
