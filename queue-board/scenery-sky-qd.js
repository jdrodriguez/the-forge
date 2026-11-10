// scenery-sky-qd.js: the 32-bit art of scenery-sky.js that does not fit there. The clouds' painter: puffs lit as round
// bodies from the upper left, with soft edges away from the light, shaded bellies and creases where the puffs meet, and
// the ash of a red main lit from below. The mountains: a far range, the Lonely Mountain rising behind Erebor and near
// hills, each face lit or shaded across the ridge that runs down from its summit, spurs and gullies fanning out from the
// summit with one side catching the light, strata across the rock of the nearer ones, a bright edge where the light
// catches the outline and the ridge, snow on the high peaks that runs down the spurs in fingers, and a haze at their
// feet. Each range is worked out once per layout into classes of rock and snow, coloured for the hour, and laid down
// whole, so the far range drifts a little over the minutes (not with reduced motion) without being painted again.
// Loaded right after scenery-sky.js.

// Each cloud is a row of puffs [x, y, radius] over a flat bottom 3.5 rows below its y; five shapes.
const CLOUDS = [
  [[2.5, 1, 2.5], [6, -0.5, 3.5], [10.5, -1.5, 4.5], [15, 0, 3.5], [18.5, 1.5, 2.5]],
  [[2.5, 1.5, 2], [5.5, 0, 3], [9.5, -1, 4], [13.5, 0.5, 3], [17, 1.5, 2.5]],
  [[3, 0.5, 3], [7.5, -1.5, 4.5], [12, -0.5, 3.5], [16, 1, 2.5]],
  [[2, 1.5, 2], [5, 0.5, 2.75], [8.5, -0.5, 3.25], [12, 1, 2.5], [14.5, 2, 1.75]],
  [[3, 0, 3.25], [6.5, -2, 4], [10.5, -2.75, 4.75], [14.5, -0.75, 3.75], [18, 1, 2.75], [21, 2, 2]],
];
// A cloud's colours at this hour, lit to deep: white tinted by the horizon by day, more as the light goes, deep blue lit
// by the moon at night.
function skCloudPal(sky) {
  const dim = 1 - skLight(sky.hour);
  const body = blend(sky.night ? '#2b3155' : '#f4f7fb', sky.low, sky.night ? 0.1 : 0.22 + 0.4 * dim);
  const lit = blend(body, sky.night ? '#8d96c8' : '#ffffff', sky.night ? 0.3 : 0.55 - 0.15 * dim);
  const shade = blend(body, sky.top, sky.night ? 0.45 : 0.4 + 0.2 * dim);
  return [blend(lit, '#ffffff', sky.night ? 0.2 : 0.7), lit, body, blend(body, shade, 0.55), shade];
}
// Paints a cloud into a layer whose top-left is (x0, y0) of its shape: puffs [x, y, radius] over a flat bottom at row
// bottom. Each pixel takes the puff whose surface stands nearest the viewer there, lit by how it faces the light (a
// direction [x, y] across the sky), set in one of pal's five steps (lit to deep) and dithered between them. Lit from
// above, a cloud darkens toward its belly and in the crease where two puffs meet; lit from below, ash glows only along
// its underside. The outermost pixels away from the
// light are dithered half into the sky, so the edge is soft there and bright where the light catches it.
function skPuffs(cv, shape, pal, [lx, ly], bottom, x0, y0) {
  const P = skPixels(cv);
  const cols = pal.map((c) => skPack(c));
  const ln = Math.hypot(lx, ly, 0.45);
  for (let j = 0; j < P.h; j += 1) {
    const v = y0 + (j + 0.5) / SC_RES;
    for (let i = 0; i < P.w; i += 1) {
      const u = x0 + (i + 0.5) / SC_RES;
      const floor = bottom + Math.sin(u * 1.4) * 0.2;
      let [best, z1, z2, edge] = [-1, 0, 0, -9];
      shape.forEach(([x, y, r], k) => {
        const d = Math.hypot(u - x, v - y);
        edge = Math.max(edge, r - d);
        if (d >= r) return;
        const z = Math.sqrt(r * r - d * d);
        if (z > z1) [z2, z1, best] = [z1, z, k];
        else if (z > z2) z2 = z;
      });
      if (best < 0 || v > floor) continue;
      const [x, y, r] = shape[best];
      let s = 0.5 + 0.55 * (((u - x) * lx + (v - y) * ly + z1 * 0.45) / (r * ln));
      if (ly < 0) s -= Math.max(0, (v - floor + 2.5) / 2.5) * 0.4 + (z1 - z2 < 0.3 * r && v > y - r * 0.3 ? 0.16 : 0);
      else s -= 0.18;
      const lvl = Math.max(0, Math.min(4, Math.floor((1 - s) * 4.4 + (BAYER8[(j & 7) * 8 + (i & 7)] / 64 - 0.5) * (ly < 0 ? 0.7 : 1.1))));
      if ((edge < 0.25 || floor - v < 0.25) && lvl >= 2 && (i + j) & 1) continue;
      P.px[j * P.w + i] = cols[lvl];
    }
  }
  P.done();
}
// The box a shape's layer covers, [x0, y0, w, h] in whole units round its puffs and its bottom.
function skBox(shape, bottom) {
  const x0 = Math.floor(Math.min(...shape.map(([x, , r]) => x - r))) - 1;
  const y0 = Math.floor(Math.min(...shape.map(([, y, r]) => y - r))) - 1;
  return [x0, y0, Math.ceil(Math.max(...shape.map(([x, , r]) => x + r))) + 1 - x0, Math.ceil(bottom) + 1 - y0];
}
// A cloud of shape k at (x, y) in these colours (skCloudPal), or ash lit from below, from a layer painted once per shape
// and hour.
function skCloud(g, x, y, k, pal, ash = false) {
  const [shape, bottom, light] = ash ? [SK_ASH[k], 2, [0.15, 2.5]] : [CLOUDS[k], 3.5, [-0.6, -0.8]];
  const [x0, y0, w, h] = skBox(shape, bottom);
  const cv = skLayer(`${ash ? 'ash' : 'cloud'}${k}`, `${pal}`, w, h, (lg, c) => skPuffs(c, shape, pal, light, bottom, x0, y0));
  g.drawImage(cv, x + x0, y + y0, w, h);
}

const SK_ASH = [[[0, 0.5, 2], [4, -0.5, 3], [8.5, -1, 3.5], [13, -0.25, 3], [17.5, 0.25, 2.5], [21, 0.75, 1.75]],
  [[0, 0.5, 1.75], [3.5, -0.25, 2.5], [7.5, -0.5, 2.75], [11.5, 0, 2.25], [14.5, 0.5, 1.5]]];
const SK_ASH_PAL = ['#ff9a52', '#b23e1e', '#5c2024', '#3a1620', '#26101a'];

// The mountains' colours by day and by night: [lit face, shaded face, lit snow, shaded snow] for the far range, the
// Lonely Mountain and the near hills.
const MOUNT = {
  day: [['#a9aed0', '#8b90b6', '#f4f6fb', '#c6cce2'], ['#868bb2', '#686d93', '#eef1f7', '#b3b9d2'], ['#787ea3', '#5c6186', '#e6eaf2', '#a9b0ca']],
  night: [['#363a5c', '#292c48', '#7a81a8', '#555b82'], ['#2a2d4a', '#1f2238', '#646b92', '#474d70'], ['#24273f', '#1a1c30', '#5a6188', '#3f4566']],
};
// A range of peaks about every gap units, shifted by shift: { x, h, left and right slopes }, seeded by seed.
function skPeaks(W, gap, lo, hi, seed, shift) {
  const peaks = [];
  for (let i = Math.floor(-shift / gap) - 2; i * gap + shift < W + gap * 2; i += 1) {
    peaks.push({ x: i * gap + shift + rnd(i + seed) * gap * 0.5, h: lo + rnd(i + seed + 8) * (hi - lo), sl: 0.75 + rnd(i + seed + 16) * 0.3, sr: 0.8 + rnd(i + seed + 24) * 0.3 });
  }
  return peaks;
}
// A range's ten colours from its four: rock highlight, lit, mid, shade and deep, then snow the same, warm in the light
// and cool in the shade.
function skRangeRamp([lit, shade, snowL, snowS]) {
  return [blend(lit, '#fff1dc', 0.3), lit, blend(lit, shade, 0.5), shade, blend(shade, '#14122e', 0.3),
    blend(snowL, '#ffffff', 0.6), snowL, blend(snowL, snowS, 0.5), snowS, blend(snowS, shade, 0.4)];
}

// A range worked out pixel by pixel over columns x0 to x1 and rows top to GROUND_Y: for each pixel its class (0 clear,
// 1 to 5 rock from highlight to deep, 6 to 10 snow the same) and its haze in sixteenths. Each column belongs to the peak
// standing tallest over it, its outline roughened into crags. Right of a summit the face above the ridge running down
// from it is shaded. Spurs fan out from the summit, their left sides lit and their right sides shaded, with gullies
// deep in the shaded face; strata cross the rock where asked; snow lies over the top snow units of a peak at least
// snowMin tall and runs further down the spurs' crests and the ridge.
function skRangeShape(peaks, x0, x1, top, { snow, snowMin, strata, haze }) {
  const R = SC_RES;
  const [w, h] = [Math.round((x1 - x0) * R), Math.round((GROUND_Y - top) * R)];
  const cls = new Uint8Array(w * h);
  const hz = new Uint8Array(w * h);
  for (let i = 0; i < w; i += 1) {
    const x = x0 + (i + 0.5) / R;
    let [p, ph] = [null, 0];
    for (const q of peaks) {
      const d = x - q.x;
      const qh = q.h - Math.abs(d) * (d < 0 ? q.sl : q.sr);
      if (qh > ph) [ph, p] = [qh, q];
    }
    if (!p) continue;
    const T = GROUND_Y - ph - Math.sin(x * 0.9 + p.h) * 0.6 - Math.sin(x * 2.3) * 0.3 - Math.sin(x * 5.3 + p.h * 2) * 0.12 - (rnd(Math.floor(x * 2) + p.h * 7) - 0.5) * 0.3;
    const d = x - p.x;
    const sy = GROUND_Y - p.h;
    const [K, turn] = [7 + Math.floor(rnd(p.x + 1) * 5), rnd(p.x + 3) * 6.28];
    const line0 = sy + snow + Math.sin(x * 1.7) * 0.5 + (rnd(Math.floor(x * 4) + p.x) < 0.3 ? 0.25 : 0);
    for (let j = Math.max(0, Math.ceil((T - top) * R - 0.5)); j < h; j += 1) {
      const y = top + (j + 0.5) / R;
      const yr = d > 0 ? GROUND_Y - (p.h - d * 2.4) + Math.sin(y * 1.1 + p.x) * 0.35 : -1;
      const shaded = y < yr;
      const fall = Math.max(0, Math.min(1, (y - sy - 1.5) / 5));
      const a = Math.atan2(d, Math.max(0.6, y - sy + 0.6)) * K + turn + Math.sin(y * 0.3 + p.x) * 0.25 + (rnd(Math.floor(y * 1.5) + p.x * 3) - 0.5) * 0.5;
      const [sp, cp] = [Math.sin(a) * fall, Math.cos(a) * fall];
      let lvl = shaded ? (cp > 0.55 ? 2 : sp < -0.75 ? 4 : 3) : (cp < -0.35 ? 2 : 1);
      if (!shaded && (y - T < 0.3 || (d > 0 && y - yr < 0.65))) lvl = 0;
      if (strata && y - T > 1) {
        const s = y - sy + d * (p.x % 2 > 1 ? 0.18 : -0.14);
        if ((s * R) % (2.75 * R) < 1 && Math.sin(x * 0.8 + Math.floor(s / 2.75) * 2.1) > -0.1) lvl = Math.min(4, lvl + 1);
      }
      let c = lvl + 1;
      if (p.h >= snowMin && y < line0 + Math.max(0, sp) ** 2 * snow * 0.9 + (d > 0 && Math.abs(y - yr) < 0.5 ? snow * 0.5 : 0)) {
        c = shaded ? (sp < -0.6 ? 10 : 9) : lvl === 0 ? 6 : lvl === 2 ? 8 : 7;
      }
      cls[j * w + i] = c;
      hz[j * w + i] = Math.min(15, Math.floor(haze(y) * 16 + BAYER[(j & 3) * 4 + (i & 3)] / 16));
    }
  }
  return { w, h, cls, hz };
}
// Colours a range's classes for this hour's ramp, hazed toward color, into a layer.
function skRangePaint(cv, S, ramp, color) {
  const P = skPixels(cv);
  const table = Array.from({ length: 16 }, (_, k) => [0, ...ramp.map((c) => skPack(blend(c, color, k / 16)))]);
  for (let n = 0; n < S.cls.length; n += 1) if (S.cls[n]) P.px[n] = table[S.hz[n]][S.cls[n]];
  P.done();
}

// The far range, the Lonely Mountain rising behind Erebor (58 rows, as the realm notes expect) and the near hills, each
// worked out once per layout, coloured for the hour, and laid down whole: the far range drifts up to two and a half
// units and the near hills one, a quarter unit at a time.
const skRanges = { key: '', list: [] };
const skFeet = (y) => Math.max(0, Math.min(1, (y - GROUND_Y + 12) / 12)) * 0.26;
function drawMountains(g, W, realms, sky, tick = 0) {
  const erebor = realms.find((r) => r.kind === 'dwarf');
  const ex = erebor ? erebor.x0 + erebor.w / 2 : null;
  const key = `${W},${ex}`;
  if (skRanges.key !== key) {
    skRanges.key = key;
    skRanges.list = [
      ['far', 0, skRangeShape(skPeaks(W, 34, 22, 40, 3, 0), -4, W + 4, GROUND_Y - 42, { snow: 5, snowMin: 30, strata: false, haze: (y) => 0.1 + 0.1 * Math.max(0, (y - GROUND_Y + 40) / 40) + skFeet(y) }), -4, 5],
      ex === null ? null : ['lonely', 1, skRangeShape([{ x: ex, h: 58, sl: 0.85, sr: 0.85 }], ex - 70, ex + 70, GROUND_Y - 60, { snow: 9, snowMin: 0, strata: true, haze: (y) => 0.03 + skFeet(y) }), ex - 70, 0],
      ['near', 2, skRangeShape(skPeaks(W, 46, 10, 22, 61, 0), -2, W + 2, GROUND_Y - 24, { snow: 4, snowMin: 20, strata: true, haze: skFeet }), -2, 2],
    ].filter(Boolean);
  }
  const still = typeof scReduced !== 'undefined' && scReduced.matches;
  const drift = still ? 0 : Math.sin(tick / 1500);
  const light = skLight(sky.hour);
  const pal = MOUNT.day.map((set, k) => skRangeRamp(set.map((c, j) => blend(blend(MOUNT.night[k][j], c, light), sky.low, 0.12))));
  for (const [name, k, S, x0, sway] of skRanges.list) {
    const [w, h] = [S.w / SC_RES, S.h / SC_RES];
    const cv = skLayer(`range-${name}`, `${key},${pal[k]},${sky.low}`, w, h, (lg, c) => skRangePaint(c, S, pal[k], sky.low));
    g.drawImage(cv, x0 + Math.round(drift * sway * 2) / 4, GROUND_Y - h, w, h);
  }
}
