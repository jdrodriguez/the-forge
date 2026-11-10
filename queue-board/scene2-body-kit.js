// scene2-body-kit.js: the shared kit for the peoples' bodies on the map from above (scene2.js), at 32-bit: 4 detail
// pixels a unit, the 3/4 overhead look of the 32-bit RPGs. Each body is painted pixel by pixel into a grid of palette
// characters from shaded volumes (row spans, ellipses and limbs), each lit by a normal against a light from the upper
// left, so every material gets its ramp of six steps (outline, deep, shade, base, light, shine) with a checker dither
// where two steps meet and an outline in its own darkest hue. scene2-body-parts.js composes the people from these, and
// each people's file (scene2-body-elf.js and the rest) gives its measures, colours and overlays. Grids use
// sprites-hd.js's qdGrid; a frame is drawn once per worker's colours and cached by scene2-folk.js.

// The light, from the upper left and toward the viewer.
const M2B_LIGHT = [-0.56, -0.46, 0.69];
// A lit value to a ramp step (1 deep to 5 shine), dithered in a checker where it sits near a step's edge.
function m2bLevel(lit, r, c) {
  const v = lit + ((r + c) & 1 ? 0.05 : -0.05);
  return v > 0.98 ? 5 : v > 0.8 ? 4 : v > 0.47 ? 3 : v > 0.15 ? 2 : 1;
}
const m2bDot = (nx, ny, nz) => nx * M2B_LIGHT[0] + ny * M2B_LIGHT[1] + nz * M2B_LIGHT[2];

// Paints a volume: inside(r, c) says which pixels, normal(r, c) gives [nx, ny, nz]. Edge pixels take the ramp's outline
// unless o.open names that side ('t', 'b', 'l', 'r'); o.tex(r, c) adds to the light (strands, folds, grain); o.rim
// lights the upper-left edge one step instead of outlining it (a lit rim that pops against dark ground); o.only(r, c)
// clips. A '.' in the ramp leaves that step clear.
function m2bVol(G, r0, r1, c0, c1, inside, normal, ramp, o = {}) {
  const cells = G.cells;
  const [H, W] = [cells.length, cells[0].length];
  const open = o.open ?? '';
  for (let r = Math.max(0, Math.floor(r0)); r <= Math.min(H - 1, Math.ceil(r1)); r += 1) {
    for (let c = Math.max(0, Math.floor(c0)); c <= Math.min(W - 1, Math.ceil(c1)); c += 1) {
      if (!inside(r, c) || (o.only && !o.only(r, c))) continue;
      const t = !inside(r - 1, c);
      const b = !inside(r + 1, c);
      const l = !inside(r, c - 1);
      const rr = !inside(r, c + 1);
      const edge = (t && !open.includes('t')) || (b && !open.includes('b')) || (l && !open.includes('l')) || (rr && !open.includes('r'));
      let ch;
      if (edge && o.rim && (t || l) && !b && !rr) ch = ramp[4];
      else if (edge) ch = ramp[0];
      else {
        const n = normal(r, c);
        ch = ramp[m2bLevel(m2bDot(...n) + (o.bias ?? 0) + (o.tex ? o.tex(r, c) : 0), r, c)];
      }
      if (ch && ch !== '.') cells[r][c] = ch;
    }
  }
}

// A shape given as a span [a, b] of columns per row (or null), shaded as a cylinder standing up: lit on its left, its
// top tipped toward the light by o.ny (and rounding over its top and bottom rows by o.round).
function m2bRows(G, r0, r1, span, ramp, o = {}) {
  const spans = new Map();
  for (let r = Math.floor(r0); r <= Math.ceil(r1); r += 1) spans.set(r, span(r));
  const inside = (r, c) => { const s = spans.get(r); return !!s && c >= s[0] && c <= s[1]; };
  let [c0, c1] = [1e9, -1e9];
  for (const s of spans.values()) if (s) { c0 = Math.min(c0, s[0]); c1 = Math.max(c1, s[1]); }
  const normal = (r, c) => {
    const [a, b] = spans.get(r);
    const nx = Math.max(-0.98, Math.min(0.98, (2 * (c + 0.5 - a)) / (b - a + 1) - 1));
    const v = (r - r0) / Math.max(1, r1 - r0);
    let ny = o.ny ?? -0.1;
    if (o.round) ny += v < o.round ? -0.6 * (1 - v / o.round) : 0;
    return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
  };
  m2bVol(G, r0, r1, c0, c1, inside, normal, ramp, o);
}
// A trunk or skirt from row r0 to r1 about column cx, its half width running from w0 to w1 (o.bulge rounds it out).
function m2bTaper(G, r0, r1, cx, w0, w1, ramp, o = {}) {
  m2bRows(G, r0, r1, (r) => {
    if (r < r0 || r > r1) return null;
    const t = (r - r0) / Math.max(1, r1 - r0);
    const w = w0 + (w1 - w0) * t + (o.bulge ?? 0) * Math.sin(Math.PI * t);
    return [Math.round(cx - w), Math.round(cx + w) - 1];
  }, ramp, o);
}
// An ellipse about (cy, cx), shaded as a ball.
function m2bBall(G, cy, cx, ry, rx, ramp, o = {}) {
  const inside = (r, c) => ((c + 0.5 - cx) / rx) ** 2 + ((r + 0.5 - cy) / ry) ** 2 <= 1;
  const normal = (r, c) => {
    const [nx, ny] = [(c + 0.5 - cx) / rx, (r + 0.5 - cy) / ry];
    return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
  };
  m2bVol(G, cy - ry - 1, cy + ry + 1, cx - rx - 1, cx + rx + 1, inside, normal, ramp, o);
}
// A limb or rod from (r0, c0) to (r1, c1), rad pixels round (to rad1 at its far end), shaded round its length.
function m2bLimb(G, r0, c0, r1, c1, rad, ramp, o = {}, rad1 = rad) {
  const [dr, dc] = [r1 - r0, c1 - c0];
  const len2 = Math.max(1e-6, dr * dr + dc * dc);
  const len = Math.sqrt(len2);
  // The side toward the light: the perpendicular pointing left (or up for a level limb).
  let [pr, pc] = [dc / len, -dr / len];
  if (pc > 0 || (Math.abs(pc) < 1e-6 && pr > 0)) [pr, pc] = [-pr, -pc];
  const at = (r, c) => {
    const [y, x] = [r + 0.5 - r0, c + 0.5 - c0];
    const t = Math.max(0, Math.min(1, (y * dr + x * dc) / len2));
    const [ey, ex] = [y - t * dr, x - t * dc];
    return [Math.hypot(ey, ex), (ey * pr + ex * pc), rad + (rad1 - rad) * t];
  };
  const inside = (r, c) => { const [d, , w] = at(r, c); return d <= w; };
  const normal = (r, c) => {
    const [, s, w] = at(r, c);
    const k = Math.max(-0.98, Math.min(0.98, s / w));
    return [pc * k, pr * k, Math.sqrt(1 - k * k)];
  };
  const m = Math.max(rad, rad1) + 1;
  m2bVol(G, Math.min(r0, r1) - m, Math.max(r0, r1) + m, Math.min(c0, c1) - m, Math.max(c0, c1) + m, inside, normal, ramp, o);
}
// A polygon (points [r, c]), shaded across each row as a cylinder.
function m2bPoly(G, pts, ramp, o = {}) {
  const rs = pts.map((p) => p[0]);
  const span = (r) => {
    const y = r + 0.5;
    const xs = [];
    pts.forEach(([ra, ca], i) => {
      const [rb, cb] = pts[(i + 1) % pts.length];
      if ((ra <= y && rb > y) || (rb <= y && ra > y)) xs.push(ca + ((y - ra) * (cb - ca)) / (rb - ra));
    });
    if (xs.length < 2) return null;
    const [a, b] = [Math.min(...xs), Math.max(...xs)];
    return b - a < 0.5 ? null : [Math.round(a), Math.round(b) - 1];
  };
  m2bRows(G, Math.floor(Math.min(...rs)), Math.ceil(Math.max(...rs)), span, ramp, o);
}

// Textures added to the light: strands of hair down a head (fine dark seams, lit locks), folds down cloth, and a shine
// band across hair near its crown.
const m2bStrands = (k = 3, deep = 0.3) => (r, c) => ((c * 7 + (r >> 3)) % (k * 2) === 0 ? -deep : (c * 7 + (r >> 3)) % (k * 2) === 3 ? 0.12 : 0);
const m2bFolds = (cols, deep = 0.32) => (r, c) => (cols.includes(c) ? -deep : cols.includes(c - 1) ? 0.14 : 0);
const m2bCurls = (r, c) => { const k = (r % 4) * 4 + ((c + ((r >> 2) & 1) * 2 + ((r * 7 + (c >> 2) * 3) % 5 === 0 ? 1 : 0)) % 4); return 0.7 * [0.25, 0.1, -0.1, -0.35, 0.15, 0.2, 0, -0.3, -0.1, 0, -0.25, -0.4, -0.35, -0.2, -0.45, -0.5][k] + 0.1; };

// The colours of one body: the worker's palette P (sprites-hd.js's hdPal) with the people's own materials on top,
// each a six-step ramp from a base and a shade (hdRamp) under a key of six characters, or a single colour.
const m2bPals = new Map();
function m2bPal(P, kind, mats = {}) {
  const key = `${P.key}|${kind}`;
  if (!m2bPals.has(key)) {
    const pal = { ...P };
    for (const [keys, v] of Object.entries(mats)) {
      if (typeof v === 'string') { pal[keys] = v; continue; }
      const ramp = v.length === 6 ? v : hdRamp(v[0], v[1]);
      [...keys].forEach((ch, i) => { pal[ch] = ramp[i]; });
    }
    m2bPals.set(key, pal);
  }
  return m2bPals.get(key);
}
// The ramps the palette already holds, outline to shine, as six-character strings.
const M2B = { cloth: 'O12345', hair: 'oabcde', skin: 'pqrstt', helm: '67890#', gold: 'GGgyY+', leather: 'DDEFHH', cream: 'XUUVWW', bone: 'DBBTTT' };

// Writes a string at (r, c) rounded to whole pixels, skipping '.' (qdGrid's put wants whole indexes).
const m2bAt = (G, r, c, s) => G.put(Math.round(r), Math.round(c), s);
// Writes a small map of characters at (r, c), skipping '.', mirrored when flip.
function m2bPut(G, r, c, rows, flip) {
  rows.forEach((s, k) => m2bAt(G, r + k, c, flip ? [...s].reverse().join('') : s));
}

// A face from the front, its lash line on row r about column cx: brows of the hair's shade (or o.brow), lashed eyes
// with whites, irises, pupils and a glint, a nose lit on its left, blush, a mouth and lip. o.gap is the space between
// the eyes; o.shut closes them in a curved line; o.old gives heavier brows and a line under the eyes; o.mouth false
// hides the mouth (a beard covers it).
function m2bFace(G, r, cx, o = {}) {
  const gap = o.gap ?? 4;
  const [l, rr] = [Math.round(cx - gap / 2) - 5, Math.round(cx + gap / 2)];
  const brow = o.brow ?? 'a';
  const browRows = o.old ? [`${brow}${brow}${brow}${brow}.`, `.${brow}${brow}${brow}${brow}${brow}`] : [`.${brow}${brow}${brow}.`, `${brow}....`];
  m2bPut(G, r - 3, l, browRows, false);
  m2bPut(G, r - 3, rr - (o.old ? 1 : 0), browRows, true);
  const eye = o.shut ? ['.....', 'qkkkq', '.qqq.'] : ['.kkkk', 'kw*jk', 'xwijx', '.rrr.'];
  const eyeR = o.shut ? eye : ['kkkk.', 'k*jwk', 'xijwx', '.rrr.'];
  m2bPut(G, r, l, eye, false);
  m2bPut(G, r, rr, eyeR, false);
  if (o.old) { m2bAt(G, r + 4, l, '.qq'); m2bAt(G, r + 4, rr + 2, 'qq'); }
  // The nose, lit on its left, its shade falling down and right.
  const nx = Math.round(cx) - 1;
  m2bPut(G, r + 2, nx, o.nose ?? ['ts', 'ts', 'tsr', 'srq']);
  if (o.blush !== false) { m2bAt(G, r + 4, l, 'uu'); m2bAt(G, r + 4, rr + 3, 'uu'); }
  if (o.mouth !== false) {
    const m = r + 7 + (o.mouthAt ?? 0);
    m2bAt(G, m, nx - 1, o.smile ? 'v..v' : '.vvv');
    m2bAt(G, m + 1, nx, o.smile ? 'vv' : 'zz');
  }
}
// A face in profile looking right, its lash line on row r and the face's front edge at column fx: one lashed eye with
// its glint, the brow, the nose standing out past the edge, a mouth and the chin.
function m2bProfile(G, r, fx, o = {}) {
  const brow = o.brow ?? 'a';
  fx = Math.round(fx) - 1;
  m2bAt(G, r - 3, fx - 7, `${brow}${brow}${brow}${brow}`);
  m2bPut(G, r, fx - 7, o.shut ? ['....', 'qkkq', '.qq.'] : ['.kkk', 'kw*j', 'xwij', '.rr.']);
  m2bPut(G, r + 1, fx - 1, o.nose ?? ['ss', 'tsp', 'tssp', 'ssrp', 'spp']);
  if (o.mouth !== false) { m2bAt(G, r + 7, fx - 3, 'vv'); m2bAt(G, r + 8, fx - 2, 'z'); }
  if (o.blush !== false) m2bAt(G, r + 4, fx - 7, 'uu');
}

// A belt round the trunk at row r, 4 rows deep, w either side of the middle, lit on its top, with a buckle at the
// middle from the front (none from behind) or near the front edge in profile.
function m2bBelt(G, K, r, w, ramp = M2B.leather, buckle = ['GyyG', 'y..g', 'GggG']) {
  const [a, b] = K.side ? [K.cx - (K.S.depthB ?? w) - 1, K.cx + (K.S.depthF ?? w)] : [Math.round(K.cx - w), Math.round(K.cx + w) - 1];
  m2bRows(G, r, r + 3, () => [a, b], ramp, { ny: -0.5 });
  if (K.facing === 'down') m2bPut(G, r, Math.round(K.cx) - 2, buckle);
  if (K.side) m2bPut(G, r, b - 4, buckle.map((s) => s.slice(0, 3)));
}
// A cloak from the shoulders: from behind it covers the back to row end and flares (w0 at the shoulders, w1 at the
// hem); from the front only its edges show past the arms and its clasp at the throat; in profile it hangs down the
// back. ramp is its cloth; o.tex its folds.
function m2bCloak(G, K, end, w0, w1, ramp, o = {}) {
  const r0 = K.neck - 1;
  const r1 = K.top + end - (K.seated ? (K.S.H - K.S.hip) * 0.5 : 0);
  const tex = o.tex ?? m2bFolds([-1], 0.3);
  if (K.side) {
    m2bPoly(G, [[r0, K.cx - 4], [r0, K.cx + 3], [r1 - 2, K.cx - (o.back ?? 6)], [r1, K.cx - (o.back ?? 6) - 6 - (K.walk ? 2 : 0)]], ramp, { tex });
    return;
  }
  m2bRows(G, r0, r1, (r) => {
    const t = (r - r0) / Math.max(1, r1 - r0);
    const w = w0 + (w1 - w0) * Math.sqrt(t);
    const sway = K.step === 0 ? -1 : K.step === 1 ? 1 : 0;
    return [Math.round(K.cx - w + sway * t * 2), Math.round(K.cx + w + sway * t * 2) - 1];
  }, ramp, { tex: (r, c) => tex(r, (c - K.cx + 40) % 7 === 0 ? -1 : c), round: 0.08 });
}

// A lit rim on a figure's upper-left edge: each outline pixel (a key of map) with nothing to its left or above it takes
// the lighter colour map gives, so a dark figure stands out against dark ground (Faramir in Ithilien's trees).
function m2bRim(G, map) {
  const cells = G.cells;
  for (let r = 1; r < cells.length; r += 1) for (let c = 1; c < cells[r].length; c += 1) {
    const rim = map[cells[r][c]];
    if (rim && (cells[r][c - 1] === '.' || cells[r - 1][c] === '.')) cells[r][c] = rim;
  }
}

// Leans everything above row hip sideways: rows shift by up to lean pixels at row top, none at the hip.
function m2bShear(G, top, hip, lean) {
  if (!lean) return;
  const cells = G.cells;
  for (let r = 0; r < Math.min(hip, cells.length); r += 1) {
    const k = Math.round((lean * (hip - r)) / Math.max(1, hip - top));
    if (!k) continue;
    const row = cells[r];
    cells[r] = row.map((_, c) => row[c - k] ?? '.');
  }
}
