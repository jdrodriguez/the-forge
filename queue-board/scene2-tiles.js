// scene2-tiles.js: the ground of the map from above (scene2.js), painted once per layout into a cache at 4 pixels a
// unit and copied in every frame. Each realm's composer first marks what lies where, pixel by pixel (grass of its own
// kind, road, footpath, water, rock, cliff, flagstones, tilled soil, terrace paving, sand), with shadows cast by what
// stands on it; then every pixel is textured from its material's ramp of six steps (dark to light, warm lights and cool
// shades): grass in dithered patches with tufts and speckles, the road with ruts, pebbles and grass creeping over its
// edges, water deep in the middle and pale in the shallows with lines of ripple, cliffs in vertical seams, flagstones
// and paving in courses with mortar. Small things painted over it after (flowers, stones, leaves) are decals.

const M2_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
// A steady number in [0, 1) for a pixel or a cell, so textures stay put.
function m2Hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth value noise over a grid of cells s units apart.
function m2Noise(x, y, s, seed = 0) {
  const [gx, gy] = [Math.floor(x / s), Math.floor(y / s)];
  const [fx, fy] = [x / s - gx, y / s - gy];
  const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
  const v = (a, b) => m2Hash(gx + a, gy + b, seed);
  return (v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sy) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sy;
}

const M2_MAT = { elf: 1, hobbit: 2, dwarf: 3, man: 4, ash: 5, road: 6, path: 7, water: 8, rock: 9, cliff: 10, plaza: 11, soil: 12, terrace: 13, sand: 14,
  wheat: 15, greens: 16, snow: 17, wild: 18, forest: 19 };
const M2_RAMPS = {
  1: ['#1c4436', '#275c44', '#337252', '#41875d', '#58a06b', '#7ebc86'],
  2: ['#2b5520', '#3b742a', '#4f8f37', '#66a843', '#82bf52', '#a8da78'],
  3: ['#36322f', '#4a443e', '#5f574f', '#756c62', '#8d8478', '#aaa092'],
  4: ['#5a4b20', '#78652a', '#968036', '#b39b47', '#ccb55e', '#e3cf86'],
  5: ['#1b1719', '#262123', '#322c2d', '#3e3837', '#4d4542', '#615753'],
  6: ['#4f3923', '#664a30', '#7d5d3e', '#92704c', '#a8865e', '#c3a37d'],
  7: ['#64513a', '#7f694c', '#98815f', '#ad9672', '#c3ae8b', '#d9c9a6'],
  8: ['#123352', '#19466a', '#225e84', '#2f7a9e', '#4f9dbb', '#a6dbe4'],
  9: ['#282630', '#38353f', '#4c4853', '#625d68', '#7c7780', '#9f9aa0'],
  10: ['#29282e', '#3b3a42', '#4f4d56', '#66646c', '#817e86', '#a4a1a6'],
  11: ['#34302e', '#4d4844', '#645e58', '#7b746c', '#938b81', '#afa79b'],
  12: ['#2a1a10', '#402618', '#563521', '#6c462c', '#83593a', '#9e724c'],
  13: ['#565c5f', '#71787a', '#8c9392', '#a5aba8', '#bec3bc', '#dadcd3'],
  14: ['#665a46', '#7f725b', '#988a72', '#afa289', '#c6baa0', '#ded4bd'],
  15: ['#5e4a1c', '#836628', '#a8853a', '#c6a24c', '#ddbe64', '#f1db92'],
  16: ['#2a1a10', '#402618', '#2f5a24', '#3f7a2c', '#5a9a3c', '#8cc25a'],
  17: ['#4e5c6e', '#7d8ea2', '#a9b8c8', '#cfdbe6', '#ebf1f6', '#ffffff'],
  18: ['#2e3f24', '#3f552d', '#536c38', '#678344', '#809a54', '#a2b672'],
  19: ['#142219', '#1c3022', '#26402c', '#315236', '#3f6442', '#557a52'],
};
// The grasses take the season (scenery-elves.js's seasonNow): fresh in spring, a touch of gold in autumn, frost in winter.
const M2_TINT = { spring: ['#86d86a', 0.08], summer: null, autumn: ['#b39a3c', 0.2], winter: ['#dce6ea', 0.38] };
const m2Pack = (hex) => { const [r, g, b] = hdRgb(hex); return (255 << 24) | (b << 16) | (g << 8) | r; };
function m2Ramps(season) {
  const tint = M2_TINT[season];
  const out = { lit: [], dark: [] };
  for (const [id, ramp] of Object.entries(M2_RAMPS)) {
    const grass = [1, 2, 3, 4, 18, 19].includes(Number(id));
    const cols = ramp.map((c) => (grass && tint ? hdMix(c, tint[0], tint[1] * (Number(id) === 3 ? 0.5 : 1)) : c));
    out.lit[id] = Uint32Array.from(cols.map(m2Pack));
    out.dark[id] = Uint32Array.from(cols.map((c) => m2Pack(hdMix(c, '#0e1226', 0.42))));
  }
  return out;
}

// The marks: per pixel its material, the material under a road's edge, a value for the texture (distance from a band's
// middle, or light on a slope), and shade (1 half, dithered; 2 whole). nz is the patchiness, one value a unit.
function m2Land(W, H) {
  const [pw, ph] = [W * 4, H * 4];
  const L = { W, H, pw, ph, mat: new Uint8Array(pw * ph), under: new Uint8Array(pw * ph), aux: new Uint8Array(pw * ph),
    shade: new Uint8Array(pw * ph), nz: new Float32Array(W * H), decals: [] };
  // Per unit: the patchiness, and the steady number that picks a tuft (looked up per pixel by m2GrassIdx).
  L.gh = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { L.nz[y * W + x] = 0.65 * m2Noise(x, y, 13) + 0.35 * m2Noise(x, y, 4.5, 9); L.gh[y * W + x] = m2Hash(x, y, 7); }
  return L;
}
// A rectangle in units of material m (and under it, so a road over it frays into it).
function m2Rect(L, x, y, w, h, m, aux = 0) {
  const [x0, y0] = [Math.max(0, Math.round(x * 4)), Math.max(0, Math.round(y * 4))];
  const [x1, y1] = [Math.min(L.pw, Math.round((x + w) * 4)), Math.min(L.ph, Math.round((y + h) * 4))];
  for (let py = y0; py < y1; py += 1) for (let px = x0, i = py * L.pw + x0; px < x1; px += 1, i += 1) { L.mat[i] = m; L.under[i] = m; L.aux[i] = aux; }
}
// An ellipse whose edge wobbles by wob units; aux(nx, ny) (each -1 to 1 across it) gives the texture's value, a slope's
// light for rock. keep: a material it must not paint over.
function m2Blob(L, cx, cy, rx, ry, m, { wob = 0, aux = null, seed = 0, keep = -1 } = {}) {
  const [x0, x1] = [Math.max(0, Math.floor((cx - rx - wob) * 4)), Math.min(L.pw, Math.ceil((cx + rx + wob) * 4))];
  const [y0, y1] = [Math.max(0, Math.floor((cy - ry - wob) * 4)), Math.min(L.ph, Math.ceil((cy + ry + wob) * 4))];
  const amp = wob ? wob / Math.max(rx, ry) : 0;
  const rim = new Float32Array(512);
  for (let k = 0; k < 512; k += 1) {
    const a = (k / 511) * 2 * Math.PI - Math.PI;
    rim[k] = 1 + (wob ? amp * (m2Noise(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + 9, 1, seed) - 0.5) * 2 : 0);
  }
  const [lo2, hi2] = [(1 - amp) ** 2, (1 + amp) ** 2];
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const [nx, ny] = [(px / 4 - cx) / rx, (py / 4 - cy) / ry];
      const d2 = nx * nx + ny * ny;
      // Only pixels near the rim ask the wobble (looked up by angle); the rest are plainly in or out.
      if (d2 > hi2) continue;
      if (d2 > lo2) {
        const e = rim[Math.round(((Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI)) * 511)];
        if (d2 > e * e) continue;
      }
      const i = py * L.pw + px;
      if (L.mat[i] === keep) continue;
      L.mat[i] = m;
      L.under[i] = m;
      L.aux[i] = aux ? Math.max(0, Math.min(255, aux(nx, ny))) : 0;
    }
  }
}
// A shadow on the ground: whole inside, dithered toward its rim.
function m2Shadow(L, cx, cy, rx, ry, soft = 0.7) {
  const [x0, x1] = [Math.max(0, Math.floor((cx - rx) * 4)), Math.min(L.pw, Math.ceil((cx + rx) * 4))];
  const [y0, y1] = [Math.max(0, Math.floor((cy - ry) * 4)), Math.min(L.ph, Math.ceil((cy + ry) * 4))];
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const d = ((px / 4 - cx) / rx) ** 2 + ((py / 4 - cy) / ry) ** 2;
      if (d > 1) continue;
      const i = py * L.pw + px;
      L.shade[i] = Math.max(L.shade[i], d < soft ? 2 : 1);
    }
  }
}
// What material lies at a unit's place.
const m2MatAt = (L, x, y) => L.mat[Math.min(L.ph - 1, Math.max(0, Math.round(y * 4))) * L.pw + Math.min(L.pw - 1, Math.max(0, Math.round(x * 4)))];

// A tuft of grass in a unit's 4 by 4 pixels: lighter blades (+) over a darker root (-).
const M2_TUFTS = [['..+.', '.+.+', '+.-.', '.-..'], ['.+..', '+.+.', '.-+.', '..-.'], ['+..+', '.+..', '.-.+', '..-.']];
function m2GrassIdx(L, px, py, i) {
  const [ux, uy] = [px >> 2, py >> 2];
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  const u = uy * L.W + ux;
  let k = Math.max(1, Math.min(4, Math.floor(L.nz[u] * 2.6 + 0.9 + b)));
  const h = L.gh[u];
  if (h < 0.13) {
    const ch = M2_TUFTS[Math.floor(h * 23) % 3][py & 3][px & 3];
    if (ch === '+') k += 1; else if (ch === '-') k -= 1;
  } else if (m2Hash(px, py, 3) < 0.035) k += m2Hash(px, py, 4) < 0.5 ? 1 : -1;
  return Math.max(0, Math.min(5, k));
}
// Each pixel's step in its material's ramp.
function m2TexIdx(L, m, px, py, i) {
  const a = L.aux[i];
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  const nz = L.nz[(py >> 2) * L.W + (px >> 2)];
  switch (m) {
    case 6: case 7: {
      if (a > 205 && L.under[i] && m2Hash(px, py, 11) < (a - 205) / 60) return -1;
      if (a > 180) return 1;
      if (m === 6 && a > 70 && a < 108 && m2Hash(px >> 1, py, 2) < 0.8) return 1;
      if (m2Hash(px, py, 12) < 0.012) return 5;
      if (m2Hash(px, py - 1, 12) < 0.012) return 1;
      return Math.floor(nz * 2 + 1.5 + b * 0.9) + (m === 6 && a < 24 && m2Hash(px >> 1, py >> 1, 5) < 0.18 ? 1 : 0);
    }
    case 8: {
      if (a > 228) return 5;
      if (a > 190) return 4;
      const rip = (py + Math.floor(px / 22) * 3) % 9 === 0 && m2Hash(px >> 3, py, 8) < 0.45;
      return Math.min(5, Math.floor(nz * 1.6 + (a / 255) * 1.8 + 0.7 + b * 0.8) + (rip ? 1 : 0));
    }
    case 9: return Math.max(0, Math.min(5, Math.floor(a / 52 + b * 0.9 - 0.2 + (m2Hash(px >> 1, py >> 1, 6) < 0.08 ? -1 : 0))));
    case 10: {
      const seam = m2Hash(px >> 1, 1, 13);
      let k = 2 + (seam < 0.35 ? 1 : 0) - (seam > 0.85 ? 1 : 0) + (m2Hash(px >> 1, py >> 3, 14) < 0.1 ? -1 : 0) + ((py + (px >> 4)) % 13 === 0 ? 1 : 0);
      if (a < 22) k = 5 - (a >> 4); else if (a > 225) k = 0; else if (a > 190) k -= 1;
      return Math.max(0, Math.min(5, k));
    }
    case 11: case 13: {
      const [tw, th] = m === 11 ? [16, 12] : [12, 12];
      const row = Math.floor(py / th);
      const tx = (px + (row % 2) * (tw / 2)) % tw;
      const ty = py % th;
      if (tx === 0 || ty === 0) return m === 11 ? 1 : 2;
      const col = Math.floor((px + (row % 2) * (tw / 2)) / tw);
      let k = 2 + Math.floor(m2Hash(col, row, 15) * 2.4);
      if (tx === 1 || ty === 1) k += 1; else if (tx === tw - 1 || ty === th - 1) k -= 1;
      if (m2Hash(px, py, 16) < 0.03) k -= 1;
      return Math.max(0, Math.min(5, k));
    }
    case 12: {
      const f = py % 8;
      if (f < 2) return f ? 1 : 0;
      if (f === 2) return 4;
      return 2 + (m2Hash(px >> 1, py >> 1, 17) < 0.25 ? 1 : 0);
    }
    case 15: {
      const f = py % 6;
      return Math.max(0, Math.min(5, (f === 0 ? 1 : f === 1 ? 4 : 3) + (m2Hash(px >> 1, py, 24) < 0.15 ? 1 : 0) - (m2Hash(px, py >> 1, 25) < 0.06 ? 1 : 0)));
    }
    case 16: {
      const [fx, fy] = [(px + (Math.floor(py / 10) % 2) * 5) % 10, py % 10];
      if (fy < 2) return fy;
      const leaf = Math.abs(fx - 5) + Math.abs(fy - 6) < 4;
      return leaf ? (fy < 5 && fx < 6 ? 5 : fx > 6 || fy > 7 ? 3 : 4) : 1;
    }
    case 17: return Math.max(0, Math.min(5, Math.floor(a / 52 + 0.6 + b * 0.8)));
    case 14: return Math.max(0, Math.min(5, Math.floor(nz * 2 + 2 + b * 0.9) + (m2Hash(px, py, 18) < 0.04 ? 1 : 0) - (m2Hash(px, py - 1, 18) < 0.04 ? 2 : 0)));
    case 5: return Math.max(0, Math.min(5, Math.floor(nz * 2.4 + 1 + b) - (m2Hash(px >> 1, py, 19) < 0.04 ? 1 : 0)));
    default: return m2GrassIdx(L, px, py, i);
  }
}
// Textures every pixel, then paints the decals over it: the finished ground as a canvas at 4 pixels a unit.
function m2LandFinish(L, plan, season) {
  const ramps = m2Ramps(season);
  const img = new ImageData(L.pw, L.ph);
  const out = new Uint32Array(img.data.buffer);
  for (let py = 0, i = 0; py < L.ph; py += 1) {
    for (let px = 0; px < L.pw; px += 1, i += 1) {
      let m = L.mat[i] || 1;
      let k = m2TexIdx(L, m, px, py, i);
      if (k < 0) { m = L.under[i] || 1; k = m2GrassIdx(L, px, py, i); }
      const s = L.shade[i];
      out[i] = (s === 2 || (s === 1 && ((px ^ py) & 1)) ? ramps.dark : ramps.lit)[m][k];
    }
  }
  const c = document.createElement('canvas');
  [c.width, c.height] = [L.pw, L.ph];
  const g = c.getContext('2d');
  g.putImageData(img, 0, 0);
  g.setTransform(4, 0, 0, 4, 0, 0);
  g.imageSmoothingEnabled = false;
  for (const d of L.decals) d(g);
  return c;
}
// A cliff face across x0 to x1 units, from top(x) to bottom(x): its lip lit, seams down it, darkening to its foot.
function m2Cliff(L, x0, x1, top, bottom) {
  for (let px = Math.max(0, Math.round(x0 * 4)); px < Math.min(L.pw, Math.round(x1 * 4)); px += 1) {
    const [a, b] = [Math.round(top(px / 4) * 4), Math.round(bottom(px / 4) * 4)];
    for (let py = Math.max(0, a); py < Math.min(L.ph, b); py += 1) {
      const i = py * L.pw + px;
      L.mat[i] = M2_MAT.cliff;
      L.aux[i] = Math.min(255, ((py - a) / Math.max(1, b - a)) * 255);
    }
  }
}
// A footpath along the points [[x, y], ...], hw units either side of its line, fraying into the ground it crosses.
function m2Path(L, pts, hw = 2.5, m = M2_MAT.path) {
  for (let k = 1; k < pts.length; k += 1) {
    const [[ax, ay], [bx, by]] = [pts[k - 1], pts[k]];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let j = 0; j <= n; j += 1) {
      const [cx, cy] = [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n];
      for (let py = Math.round((cy - hw) * 4); py < Math.round((cy + hw) * 4); py += 1) {
        for (let px = Math.round((cx - hw) * 4); px < Math.round((cx + hw) * 4); px += 1) {
          if (px < 0 || py < 0 || px >= L.pw || py >= L.ph) continue;
          const d = Math.hypot(px / 4 - cx, py / 4 - cy) / hw;
          const i = py * L.pw + px;
          if (d > 1 || [M2_MAT.water, M2_MAT.road, M2_MAT.cliff].includes(L.mat[i])) continue;
          if (L.mat[i] !== m) { L.under[i] = L.mat[i]; L.aux[i] = 255; }
          L.mat[i] = m;
          L.aux[i] = Math.min(L.aux[i], d * 255);
        }
      }
    }
  }
}
// A grass's ramp in the season's tint, as colours, for hills and banks painted outside the ground.
const m2GrassHex = (id, season) => { const t = M2_TINT[season]; return M2_RAMPS[id].map((c) => (t ? hdMix(c, t[0], t[1]) : c)); };

// A stroke along the points [[x, y], ...]: material m within hw(t) units of the line (t from 0 at its start to 1 at its
// end), aux the distance from the line (0 to 255 at the edge) or aux(x, y); it paints over only the materials it may.
// Each segment marks the pixels of its own capsule with their nearest distance in a scratch buffer, so every pixel is
// worked out once however many segments pass near it, and aux is asked once per pixel.
function m2Stroke(L, pts, hw, m, { aux = null, over = null } = {}) {
  if (pts.length < 2) return;
  if (!L.sd) Object.assign(L, { sd: new Float32Array(L.pw * L.ph), sgen: new Uint32Array(L.pw * L.ph), gen: 0 });
  const gen = (L.gen += 1);
  const lens = pts.slice(1).map(([x, y], k) => Math.hypot(x - pts[k][0], y - pts[k][1]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const wAt = typeof hw === 'function' ? hw : () => hw;
  const touched = [];
  let done = 0;
  for (let k = 0; k < lens.length; k += 1) {
    const [[ax, ay], [bx, by]] = [pts[k], pts[k + 1]];
    const len = lens[k];
    const [w0, w1] = [wAt(done / total), wAt((done + len) / total)];
    const wm = Math.max(w0, w1);
    const [dx, dy, l2] = [bx - ax, by - ay, (bx - ax) ** 2 + (by - ay) ** 2 || 1];
    const [x0, x1] = [Math.max(0, Math.floor((Math.min(ax, bx) - wm) * 4)), Math.min(L.pw, Math.ceil((Math.max(ax, bx) + wm) * 4))];
    const [y0, y1] = [Math.max(0, Math.floor((Math.min(ay, by) - wm) * 4)), Math.min(L.ph, Math.ceil((Math.max(ay, by) + wm) * 4))];
    for (let py = y0; py < y1; py += 1) {
      const y = (py + 0.5) / 4;
      for (let px = x0, i = py * L.pw + x0; px < x1; px += 1, i += 1) {
        const x = (px + 0.5) / 4;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const r = Math.hypot(x - ax - dx * u, y - ay - dy * u) / (w0 + (w1 - w0) * u);
        if (r > 1) continue;
        if (L.sgen[i] !== gen) { L.sgen[i] = gen; L.sd[i] = r; touched.push(i); } else if (r < L.sd[i]) L.sd[i] = r;
      }
    }
    done += len;
  }
  const may = over ? new Uint8Array(256) : null;
  for (const o of over ?? []) may[o] = 1;
  for (const i of touched) {
    if (may && !may[L.mat[i]]) continue;
    const v = aux ? aux((i % L.pw) / 4, Math.floor(i / L.pw) / 4) : L.sd[i] * 255;
    if (L.mat[i] !== m) { L.under[i] = L.mat[i]; L.aux[i] = v; } else if (!aux) L.aux[i] = Math.min(L.aux[i], v);
    L.mat[i] = m;
  }
}
