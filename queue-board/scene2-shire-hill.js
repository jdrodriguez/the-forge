// scene2-shire-hill.js: the Shire's hills on the map from above (scene2-shire.js), painted as real ground seen from the
// south and above: a field of heights made of grassy lobes (smooth bells with turf tops), each pixel lit by how its
// slope turns to the light from the upper left, with tufts, clover and wildflowers in the turf. Hobbit holes are dug
// into the hillsides: each a flat yard cut back to a curved face of dry stone where the door goes (a brow of turf over
// it), the yard's front a low retaining wall where it stands proud of the slope, a lawn with beds of flowers along its
// sides and a flagstone path down the middle; paths of beaten earth with steps run down the slopes. The hills fade into
// the land's own grass at their feet. m2ShireHills paints the heights into a canvas, one pixel a quarter unit, writing
// the pixels straight into an image (it is the realm's biggest painting), and hands back where any point shows (at).

// A lobe's profile from its middle (0) to its rim (1): a smooth bell with a turf top, looked up from a table.
const M2_SHIRE_BELL = Float32Array.from({ length: 257 }, (_, i) => 0.5 + 0.5 * Math.cos(Math.PI * Math.pow(i / 256, 0.8)));
const M2_SHIRE_SUN = [-0.55, -0.3, 0.78].map((v, i, a) => v / Math.hypot(...a));
const M2_SHIRE_BED = ['#e8483c', '#ffd23a', '#f7a6c8', '#ffffff', '#ff9a3a', '#b48ae8'];
// The warm dry stone of the faces the holes are set in, deep to light.
const M2_SHIRE_FACE = ['#2e2620', '#56463a', '#7a6650', '#987f62', '#b49c78', '#d2bc94'];

// Whether (x, y) lies in a hole's yard: between its face, which bows forward at the sides, and its front edge.
function m2ShireInYard(o, x, y) {
  const u = (x - o.x) / o.hw;
  return u >= -1 && u <= 1 && y >= o.face + u * u * o.bow && y <= o.front;
}
// The height of the land at (x, y) in units: the plan's lobes blended, cut down (or built up) to the floor of any yard
// there.
function m2ShireHeight(P, x, y) {
  for (const o of P.holes) if (m2ShireInYard(o, x, y)) return o.ledge;
  let h = 0;
  for (const l of P.lobes) {
    const dx = (x - l.x) / l.rx;
    if (dx >= 1 || dx <= -1) continue;
    const dy = (y - l.y) / l.ry;
    const d = dx * dx + dy * dy;
    if (d >= 1) continue;
    const v = l.h * M2_SHIRE_BELL[(d * 256) | 0];
    // Where two lobes meet they blend in a smooth saddle, not a crease.
    const k = Math.max(0, 6 - Math.abs(h - v)) / 6;
    h = h > 0 ? Math.max(h, v) + k * k * 1.5 : v;
  }
  return h;
}
// Which wall shows where the land steps up sharply at (x, y): 'face' behind a yard, 'retain' along a yard's front.
function m2ShireWallKind(P, x, y) {
  for (const o of P.holes) {
    const u = (x - o.x) / o.hw;
    if (u < -1 || u > 1) continue;
    const f = o.face + u * u * o.bow;
    if (y < f && y > f - 0.6) return Math.abs(u) > 0.82 - (m2Hash(Math.round(x * 4), 1, 4) * 0.08) ? 'bank' : 'face';
    if (y <= o.front && y > o.front - 0.6) return 'retain';
  }
  return 'bank';
}

// Paints the plan P = { x0, x1, top, base, lobes: [{ x, y, rx, ry, h }], holes: [{ x, face, bow, hw, front, ledge }],
// paths: [{ x, y0, y1, hw, wig }], season, seed } into a canvas whose top-left is at (x0, y) units. Returns { c, x, y,
// w, h, at(x, y) } where at gives where the ground point (x, y) shows in the canvas, in its units.
function m2ShireHills(P) {
  const { x0, x1, top, base } = P;
  const pw = Math.ceil((x1 - x0) * 4);
  const gh = Math.ceil((base - top) * 4);
  const Hg = new Float32Array(pw * gh);
  // What covers each cell: 0 turf, 1 a yard's lawn, 2 its flagstones, 3 a flower bed, 4 a path down a slope.
  const Cv = new Uint8Array(pw * gh);
  // The lobes, each over its own box only, blended where they meet; then the yards cut in and the paths laid.
  const cols = (x0l, x1l) => [Math.max(0, Math.floor((x0l - x0) * 4)), Math.min(pw, Math.ceil((x1l - x0) * 4))];
  const rows = (y0l, y1l) => [Math.max(0, Math.floor((y0l - top) * 4)), Math.min(gh, Math.ceil((y1l - top) * 4))];
  // The lobes are worked out on a grid half as fine (each over its own box, the columns cut to its ellipse), then
  // spread to every pixel between the four nearest.
  const [hw2, hh2] = [(pw >> 1) + 2, (gh >> 1) + 2];
  const Hc = new Float32Array(hw2 * hh2);
  for (const l of P.lobes) {
    for (let r = Math.max(0, Math.floor(((l.y - l.ry - top) * 4) / 2)); r < Math.min(hh2, Math.ceil(((l.y + l.ry - top) * 4) / 2) + 1); r += 1) {
      const dy = (top + (r * 2 + 0.5) / 4 - l.y) / l.ry;
      if (dy <= -1 || dy >= 1) continue;
      const half = l.rx * Math.sqrt(1 - dy * dy);
      const dy2 = dy * dy;
      for (let c = Math.max(0, Math.floor(((l.x - half - x0) * 4) / 2)); c < Math.min(hw2, Math.ceil(((l.x + half - x0) * 4) / 2) + 1); c += 1) {
        const dx = (x0 + (c * 2 + 0.5) / 4 - l.x) / l.rx;
        const d = dx * dx + dy2;
        if (d >= 1) continue;
        const v = l.h * M2_SHIRE_BELL[(d * 256) | 0];
        const i = r * hw2 + c;
        const h = Hc[i];
        const k = Math.max(0, 6 - Math.abs(h - v)) / 6;
        Hc[i] = h > 0 ? Math.max(h, v) + k * k * 1.5 : v;
      }
    }
  }
  for (let r = 0; r < gh; r += 1) {
    const base = (r >> 1) * hw2;
    const odd = r & 1;
    for (let c = 0, o = r * pw; c < pw; c += 1, o += 1) {
      const i = base + (c >> 1);
      const a = c & 1 ? (Hc[i] + Hc[i + 1]) * 0.5 : Hc[i];
      Hg[o] = odd ? (a + (c & 1 ? (Hc[i + hw2] + Hc[i + hw2 + 1]) * 0.5 : Hc[i + hw2])) * 0.5 : a;
    }
  }
  for (const p of P.paths) {
    const [r0, r1] = rows(p.y0, p.y1);
    for (let r = r0; r < r1; r += 1) {
      const y = top + (r + 0.5) / 4;
      const cx = p.x + Math.sin(((y - p.y0) / (p.y1 - p.y0)) * Math.PI) * p.wig;
      const [c0, c1] = cols(cx - p.hw, cx + p.hw);
      for (let c = c0; c < c1; c += 1) Cv[r * pw + c] = 4;
    }
  }
  for (const o of P.holes) {
    const [c0, c1] = cols(o.x - o.hw, o.x + o.hw);
    const [r0, r1] = rows(o.face, o.front);
    for (let r = r0; r < r1; r += 1) {
      const y = top + (r + 0.5) / 4;
      for (let c = c0; c < c1; c += 1) {
        const x = x0 + (c + 0.5) / 4;
        const u = (x - o.x) / o.hw;
        if (u < -1 || u > 1 || y < o.face + u * u * o.bow) continue;
        const i = r * pw + c;
        Hg[i] = o.ledge;
        const dx = Math.abs(x - o.x);
        Cv[i] = dx < 1.9 ? 2 : dx > o.hw - 3.5 || y < o.face + 3 + ((x - o.x) / o.hw) ** 2 * o.bow ? (dx > 4 ? 3 : 2) : 1;
      }
    }
  }
  let hmax = 0;
  for (let i = 0; i < Hg.length; i += 1) if (Hg[i] > hmax) hmax = Hg[i];
  const y0 = Math.floor(top - hmax - 2);
  const ch = Math.ceil((base - y0) * 4) + 1;
  const { c: cv, g } = m2Canvas(x1 - x0, ch / 4);
  const img = g.createImageData(pw, ch);
  const out = new Uint32Array(img.data.buffer);
  const G = m2GrassHex(M2_MAT.hobbit, P.season);
  const Gp = G.map(m2Pack);
  const S = M2_PAL.stone.map(m2Pack);
  const F = M2_SHIRE_FACE.map(m2Pack);
  const E = M2_RAMPS[7].map(m2Pack);
  const Soil = M2_RAMPS[12].map(m2Pack);
  const Bed = M2_SHIRE_BED.map(m2Pack);
  const Leaf = ['#2f5a24', '#3f7a2c', '#5a9a3c'].map(m2Pack);
  const B = (px, py) => M2_BAYER[(py & 3) * 4 + (px & 3)];
  const [lx, ly, lz] = M2_SHIRE_SUN;
  const hm = Math.max(1, hmax);
  // One hash per unit cell, for the tufts and flowers in the turf.
  const uw = (pw >> 2) + 1;
  const Hu = new Float32Array(uw * ((gh >> 2) + 1));
  for (let i = 0; i < Hu.length; i += 1) Hu[i] = m2Hash(i % uw, Math.floor(i / uw), P.seed);
  const sun = (i, c) => {
    const gx = Math.max(-2.5, Math.min(2.5, ((c < pw - 1 ? Hg[i + 1] : Hg[i]) - (c > 0 ? Hg[i - 1] : Hg[i])) * 2));
    const gy = Math.max(-2.5, Math.min(2.5, ((i + pw < Hg.length ? Hg[i + pw] : Hg[i]) - (i >= pw ? Hg[i - pw] : Hg[i])) * 2));
    return (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1);
  };
  // The turf's colour at a cell: lit by its slope, dithered between steps, with tufts and now and then a flower.
  const turf = (px, py, c, r, lam, h, mown) => {
    if (mown) return Gp[B(px, py) > 0.85 ? 3 : 4];
    let k = Math.max(0.9, 3.0 + (lam - lz) * 4.6 + (h / hm) * 1.1) + B(px, py) * 0.85 - 0.45;
    const hx = Hu[(r >> 2) * uw + (c >> 2)];
    if (hx < 0.2) {
      const t = M2_TUFTS[Math.floor(hx * 15) % 3][r & 3][c & 3];
      if (t === '+') k += 1; else if (t === '-') k -= 1;
    }
    if (hx > 0.955 && (c & 3) === 1 && (r & 3) === 1) return Bed[Math.floor(hx * 997) % Bed.length];
    if (hx > 0.955 && (c & 3) === 2 && (r & 3) === 1) return Gp[5];
    if (hx > 0.955 && (c & 3) === 1 && (r & 3) === 2) return Gp[1];
    return Gp[Math.max(0, Math.min(5, Math.floor(k)))];
  };
  const groundAt = (y) => Math.floor((y - y0) * 4);
  // Swept from the front row back, all columns at once, each keeping the highest pixel painted so far (Ymin).
  const Ymin = new Int32Array(pw).fill(groundAt(base) + 1);
  const TopH = new Float32Array(pw);
  for (let r = gh - 1; r >= 0; r -= 1) {
    const y = top + (r + 0.5) / 4;
    for (let c = 0; c < pw; c += 1) {
      const i = r * pw + c;
      const h = Hg[i];
      let ymin = Ymin[c];
      const sy = Math.floor((y - h - y0) * 4);
      if (sy >= ymin) continue;
      const cover = Cv[i];
      // Flat land outside the hills stays clear, and the hills' feet fade into it in a dither.
      if (!cover && h < 0.7) { Ymin[c] = sy; TopH[c] = 0; continue; }
      const span = ymin - sy;
      const lam = cover && cover < 4 ? 0.78 : sun(i, c);
      let col;
      if (cover === 2) {
        const [u, v] = [Math.floor((c + (Math.floor(r / 6) % 2) * 3) / 6), Math.floor(r / 6)];
        const edge = (c + (Math.floor(r / 6) % 2) * 3) % 6 === 0 || r % 6 === 0;
        col = edge ? S[1] : S[m2Hash(u, v, 5) < 0.5 ? 4 : 3];
      } else if (cover === 3) {
        const hb = m2Hash(c >> 2, r >> 2, P.seed + 3);
        const [u, v] = [c & 3, r & 3];
        const bloom = hb < 0.5 && u > 0 && v < 3 && !(u === 3 && v === 0);
        col = bloom ? (u === 1 && v === 0 ? Gp[5] : Bed[Math.floor(hb * 97) % Bed.length]) : Leaf[(u + v + (hb > 0.75 ? 1 : 0)) % 3];
      } else if (cover === 4) {
        const st = r % 7;
        col = st === 0 ? E[1] : st === 1 ? E[4] : E[2 + (m2Hash(c, r, 8) < 0.25 ? 1 : 0)];
      } else col = turf(c, sy, c, r, lam, h, cover === 1);
      out[sy * pw + c] = col;
      // A sharp step up shows as a wall below the lip: the stone face behind a yard, a yard's retaining wall, or a bank.
      if (span > 5) {
        const kind = m2ShireWallKind(P, x0 + (c + 0.5) / 4, y);
        const brow = 2 + (m2Hash(c, 2, 5) < 0.5 ? 1 : 0) + (m2Hash(c >> 1, 3, 5) < 0.3 ? 2 : 0);
        for (let py = sy + 1; py < ymin; py += 1) {
          const k = py - sy - 1;
          let w;
          if (kind === 'bank') w = Gp[k < 2 ? 2 : B(c, py) < 0.5 ? 1 : 0];
          else if (kind === 'face' && k < brow) w = k === 0 ? Gp[3] : Gp[k % 2 ? 2 : 1];
          else if (kind === 'face' && k === brow) w = F[0];
          else {
            const row = Math.floor(k / 5);
            const j = (c + (row % 2) * 4) % 9;
            w = k % 5 === 4 || j === 0 ? F[1] : k % 5 === 0 ? F[4] : F[m2Hash(Math.floor((c + (row % 2) * 4) / 9), row, 9) < 0.5 ? 3 : 2];
            if (kind === 'retain' && k === 0) w = F[5];
          }
          out[py * pw + c] = w;
        }
      } else for (let py = sy + 1; py < ymin; py += 1) out[py * pw + c] = col;
      Ymin[c] = sy;
      TopH[c] = h;
    }
  }
  // The skyline of a hill: its top pixel catches the light and a dark line parts it from the land behind.
  for (let c = 0; c < pw; c += 1) {
    if (TopH[c] > 2 && Ymin[c] > 0) { out[Ymin[c] * pw + c] = Gp[5]; out[(Ymin[c] - 1) * pw + c] = Gp[0]; }
  }
  // The hills' rims: a dark line where turf meets the land on the shaded (right and lower) side, a lit one on the left.
  const hill = (i) => out[i] !== 0;
  const rim = new Uint32Array(out);
  for (let py = 1; py < ch - 1; py += 1) {
    for (let px = 1; px < pw - 1; px += 1) {
      const i = py * pw + px;
      if (!hill(i)) continue;
      if (!hill(i + 1) || !hill(i + pw)) rim[i] = Gp[0];
      else if (!hill(i - 1)) rim[i] = Gp[4];
      else if (!hill(i + 2) || !hill(i + 2 * pw)) rim[i] = Gp[1];
    }
  }
  img.data.set(new Uint8ClampedArray(rim.buffer));
  g.putImageData(img, 0, 0);
  const at = (x, y) => [x - x0, y - m2ShireHeight(P, x, y) - y0];
  return { c: cv, g, x: x0, y: y0, w: x1 - x0, h: ch / 4, at };
}
