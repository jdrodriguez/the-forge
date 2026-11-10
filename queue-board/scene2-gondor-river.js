// scene2-gondor-river.js: the great river's landmarks on the map from above (scene2.js). The Argonath, two colossal
// stone kings either side of the Anduin with their left hands raised and axes in their right; the Emyn Muil, a maze of
// grey crags east of the river; Rauros, the falls, where the river pours over a ledge of rock in white foam and spray,
// with the green hills of Amon Hen and Amon Lhaw either side; and Fangorn's ancient gnarled trees among its forest.

const M2GR_STATE = {};
const M2GR_STONE = ['#2e3030', '#4c4e4c', '#6a6c66', '#8a8a82', '#a8a69c', '#c8c4b6'];
const M2GR_MOSS = ['#3c5a2c', '#56783a'];

// A king of the Argonath, 10 by 22 units, seen from behind as he faces north up the river toward travellers coming
// down it: the back of a crowned helm with its crest, a cloak in long folds widening to its hem with its seam down
// the back, the left arm raised with the palm open, an axe in the right hand, on a pedestal of rough rock.
const m2GrSeg = (u, v, ax, ay, bx, by, r) => {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - ax - dx * t, v - ay - dy * t) < r;
};
function m2GrKingRule(flip) {
  const S = M2GR_STONE;
  const inK = (u, v) => {
    if (v >= 18.5) return Math.abs(u - 5) <= 4.4 + (v - 18.5) * 0.4 ? 'ped' : null;
    if (Math.hypot((u - 5) / 1.35, (v - 4) / 1.6) < 1) return 'head';
    if (v >= 1.6 && v < 2.9 && Math.abs(u - 5) < 1.5 && (Math.floor(u * 4) % 3 !== 1 || v > 2.3)) return 'crown';
    if (m2GrSeg(u, v, 3.2, 6.6, 1.4, 2.4, 0.75) || (u >= 0.6 && u < 2.2 && v >= 0.6 && v < 2.6)) return 'arm';
    if (m2GrSeg(u, v, 6.9, 6.8, 7.4, 10.5, 0.75)) return 'arm';
    if (u >= 7.7 && u < 8.3 && v >= 3.5 && v < 17) return 'haft';
    if (Math.hypot((u - 8.6) / 1.1, (v - 4.6) / 1.5) < 1 && u > 8.1) return 'blade';
    const half = 2.2 + (v - 6) * 0.13;
    if (v >= 5.6 && v < 18.5 && Math.abs(u - 5) < half) return 'robe';
    return null;
  };
  return (qx, qy) => {
    const px = flip ? 39 - qx : qx;
    const [u, v] = [(px + 0.5) / 4, (qy + 0.5) / 4];
    const k = inK(u, v);
    if (!k) return null;
    if (inK(u - 0.25, v) !== k && inK(u - 0.25, v) === null || inK(u + 0.25, v) === null || inK(u, v - 0.25) === null) return S[0];
    const lit = (flip ? 9 - u : u) < 5;
    if (k === 'ped') return v > 21.4 ? S[1] : m2Hash(qx >> 1, qy >> 1, 48) < 0.12 ? M2GR_MOSS[0] : S[lit ? 3 : 2];
    if (k === 'crown') return S[5];
    if (k === 'head') return Math.abs(u - 5) < 0.25 ? S[2] : v > 5 ? S[lit ? 3 : 2] : S[lit ? 5 : 3];
    if (k === 'haft') return S[1];
    if (k === 'blade') return S[lit ? 5 : 4];
    if (k === 'arm') return S[lit ? 4 : 3];
    const fold = (Math.floor((u - 5) * (2.2 / (1 + (v - 6) * 0.05)) + 20) % 2 === 0) && v > 8;
    if (Math.abs(u - 5) < 0.2 && v > 6.5) return S[1];
    if (m2Hash(qx >> 1, qy >> 1, 41) < 0.05 + (v > 14 ? 0.07 : 0)) return M2GR_MOSS[lit ? 1 : 0];
    return S[(lit ? 4 : 3) - (fold ? 1 : 0)];
  };
}

// A crag of the Emyn Muil w by h units: a knot of two or three jagged grey peaks, lit on the west and shaded on the
// east, with dark clefts between them.
const M2GR_CRAG = ['#1e1c22', '#34323a', '#4c4a54', '#66646e', '#84828a', '#a6a4a8'];
function m2GrCragRule(w, h, seed) {
  const [W4, H4] = [w * 4, h * 4];
  const tops = [0, 1, 2].slice(0, 2 + (seed % 2)).map((i) => [W4 * (0.2 + i * 0.3 + (m2Hash(seed, i, 43) - 0.5) * 0.15), H4 * (0.05 + m2Hash(seed, i + 3, 43) * 0.35)]);
  const at = (px, py) => {
    let best = -1;
    for (let i = 0; i < tops.length; i += 1) {
      const [ax, ay] = tops[i];
      const jag = (m2Hash(py >> 1, seed + i, 44) - 0.5) * 2.5;
      if (py >= ay && Math.abs(px - ax) <= (py - ay) * (W4 / H4) * 0.62 + jag) best = i;
    }
    return best;
  };
  return (px, py) => {
    const i = at(px, py);
    if (i < 0) return null;
    if (at(px - 1, py) !== i || at(px + 1, py) !== i || at(px, py - 1) !== i) return M2GR_CRAG[0];
    const [ax, ay] = tops[i];
    const west = px < ax + (py - ay) * 0.15;
    const cleft = m2Hash(px >> 1, py >> 2, seed + 9) < 0.12;
    let k = west ? (Math.abs(px - ax) < 2 ? 5 : 4) : 2;
    if (cleft) k -= 1;
    if (py > H4 - 4) k = Math.max(1, k - 1);
    return M2GR_CRAG[k];
  };
}

// An ancient tree of Fangorn: a huge gnarled trunk on spreading roots, its crown dark and heavy with moss and lichen.
function m2GrAncientRule(seed) {
  const C = ['#122016', '#1a2e1e', '#243e28', '#30502f', '#41643a', '#5c7c48'];
  const B = ['#1c140e', '#33241a', '#4c3626', '#664a34'];
  return (px, py) => {
    const [u, v] = [px / 4, py / 4];
    const lobes = [[7, 6, 6.2, 5], [3.4, 8, 3.4, 3], [10.8, 8.4, 3.4, 3], [7, 3.2, 4, 3]];
    let inC = false;
    let lit = 0;
    for (const [cx, cy, rx, ry] of lobes) {
      const d = Math.hypot((u - cx) / rx, (v - cy) / ry) + (m2Hash(px >> 2, py >> 2, seed) - 0.5) * 0.18;
      if (d < 1) { inC = true; lit = Math.max(lit, (1 - d) * 0.6 - (u - cx) / rx * 0.25 - (v - cy) / ry * 0.3); }
    }
    if (inC && v < 11.5) {
      if (m2Hash(px, py, seed + 2) < 0.04) return '#8aa070';
      return C[Math.max(0, Math.min(5, Math.floor(lit * 6 + 1 + M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.8)))];
    }
    const spread = v > 14 ? (v - 14) * 1.3 : 0;
    const half = 1.5 + spread + Math.sin(v * 1.7 + seed) * 0.3;
    const root = v > 15 && Math.abs(Math.sin((u - 7) * 1.4 + seed)) < 0.5;
    if (v >= 9 && v < 17.5 && Math.abs(u - 7) < half && (v < 15 || root)) {
      const x = (u - 7 + half) / (half * 2);
      if (x < 0.08 || x > 0.92) return B[0];
      if (m2Hash(px >> 1, py, seed + 3) < 0.1) return '#4a6234';
      return B[x < 0.4 ? 3 : x < 0.7 ? 2 : 1];
    }
    return null;
  };
}

// Rauros's falling water in four frames: streaks of foam sliding down over the ledge, spray at the foot.
const m2GrFalls = new Map();
function m2GrFallsArt(w, h, f) {
  const key = `${w},${h},${f}`;
  if (m2GrFalls.has(key)) return m2GrFalls.get(key);
  const c = m2SouthArt(`grFalls${key}`, w, h, (px, py) => {
    const s = (py + f * 3 + Math.floor(m2Hash(px, 1, 45) * 12)) % 12;
    if (py > h * 4 - 5) return m2Hash(px, py + f, 46) < 0.55 ? (m2Hash(px, py, 47) < 0.5 ? '#ffffff' : '#d8eef4') : null;
    return s < 3 ? '#ffffff' : s < 6 ? '#bfe4ee' : px % 3 === 0 ? '#7fc0d8' : '#4f9dbb';
  });
  m2GrFalls.set(key, c);
  return c;
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  const P = plan.places;
  const rx = (y) => (typeof m2GfRiverX === 'function' ? m2GfRiverX(plan, y) : plan.W * 0.65);
  // The Emyn Muil: rocky ground and crags east of the river.
  if (P.emynMuil) {
    const e = P.emynMuil;
    m2Blob(L, e.x + 4, e.y, 19, 9, M2_MAT.rock, { wob: 3, seed: 61, aux: (nx, ny) => 120 - nx * 60 - ny * 40 });
    for (let k = 0; k < 15; k += 1) {
      const [x, y] = [e.x + 4 + (m2Hash(k, 1, 62) - 0.5) * 34, e.y + (m2Hash(k, 2, 62) - 0.5) * 15];
      if (m2MatAt(L, x, y) === M2_MAT.water || Math.abs(x - rx(y)) < 6) continue;
      const w = 4 + Math.floor(m2Hash(k, 3, 62) * 6);
      const h = Math.round(w * 0.85);
      m2Shadow(L, x + w * 0.3, y, w * 0.45, 1.5, 0.8);
      m2SouthThing(add, `grCrag${w}_${k % 5}`, x - w / 2, y - h, w, h, y, m2GrCragRule(w, h, k % 5), [x - w / 2.5, y - 1.5, x + w / 2.5, y]);
    }
  }
  // The Argonath: a king on each bank, facing down the river.
  if (P.argonath) {
    const y = P.argonath.y;
    const x = rx(y);
    for (const s of [-1, 1]) {
      const kx = x + s * 7;
      m2Shadow(L, kx + 2, y + 0.5, 5, 1.6, 0.8);
      m2SouthThing(add, 'grKing', kx - 5, y - 21.5, 10, 22, y + 0.5, m2GrKingRule(false), [kx - 4, y - 2, kx + 4, y + 0.5]);
    }
  }
  // Nen Hithoel, the long lake between the Argonath and Rauros, with the spire of Tol Brandir standing in it.
  if (P.argonath && P.rauros && P.rauros.y - P.argonath.y > 8) {
    const [y0, y1] = [P.argonath.y + 2.5, P.rauros.y - 1.5];
    const [cy, cx] = [(y0 + y1) / 2, rx((y0 + y1) / 2)];
    m2Blob(L, cx, cy, 6.5, (y1 - y0) / 2 + 1, M2_MAT.sand, { wob: 1, seed: 63 });
    m2Blob(L, cx, cy, 5, (y1 - y0) / 2, M2_MAT.water, { wob: 1, seed: 64, aux: (nx, ny) => Math.hypot(nx, ny) * 235 });
    m2Shadow(L, cx + 1.5, cy + 0.5, 2.2, 0.9, 0.8);
    m2SouthThing(add, 'grTol', cx - 1.5, cy - 7, 3, 7.5, cy + 0.5, m2GrCragRule(3, 7.5, 2), [cx - 1, cy - 0.5, cx + 1, cy + 0.5]);
  }
  // Rauros: a ledge of rock across the river, the falling water animated, the two hills either side.
  if (P.rauros) {
    const y = P.rauros.y;
    const x = rx(y);
    const w = 11;
    m2Rect(L, x - w / 2 - 1, y - 1, w + 2, 1, M2_MAT.cliff);
    L.decals.push((g) => { g.fillStyle = M2GR_STONE[4]; g.fillRect(x - w / 2 - 1, y - 1.5, w + 2, 0.5); });
    const f = (g, tick, reduced) => {
      const art = m2GrFallsArt(w - 2, 4, reduced ? 0 : Math.floor(tick / 2) % 4);
      g.drawImage(art, x - w / 2 + 1, y - 1, w - 2, 4);
    };
    f.under = true;
    add.anim(f);
    for (const s of [-1, 1]) {
      const hx = x + s * 12;
      if (m2MatAt(L, hx, y) === M2_MAT.water || typeof m2Mound !== 'function') continue;
      m2Mound(L, add, hx, y + 1, 6, 6, m2GrassHex(M2_MAT.forest, season), (g) => {
        for (let t = 0; t < 7; t += 1) {
          const [cx, cy] = [2 + m2Hash(t, s + 2, 65) * 8, 1.5 + m2Hash(t, s + 3, 65) * 3.5];
          g.fillStyle = '#1c3020';
          g.fillRect(cx - 0.75, cy - 0.5, 1.75, 1.5);
          g.fillStyle = t % 2 ? '#3e6a3a' : '#4f7e44';
          g.fillRect(cx - 0.75, cy - 0.75, 1.5, 1);
        }
      });
    }
  }
  // Fangorn's ancient trees, among the forest the world planted.
  if (P.fangorn) {
    const fg = P.fangorn;
    for (const [dx, dy, seed] of [[-9, -2, 1], [6, 4, 2], [-2, 9, 3], [12, -6, 4]]) {
      const [x, y] = [fg.x + dx, fg.y + dy];
      if (m2MatAt(L, x, y) === M2_MAT.water) continue;
      m2Shadow(L, x + 2, y, 6, 2, 0.75);
      m2SouthThing(add, `grOld${seed}`, x - 7, y - 17.5, 14, 18, y, m2GrAncientRule(seed), [x - 2, y - 1.5, x + 2, y]);
    }
  }
  M2GR_STATE.ms = performance.now() - t0;
});
