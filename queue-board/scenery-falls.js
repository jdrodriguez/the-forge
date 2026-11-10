// scenery-falls.js: Rivendell's waterfall in the Middle-earth view, in 32-bit (a quarter unit a pixel), at the realm's
// left edge inside the same box as before (20 units wide, from 44 rows above the ground to 22 below it), which
// realmProps (scenery-props.js) keeps the props off and beside which an elf plays the harp. A cliff of blue-grey stone
// stands on the left and a narrower rock on the right, both of rounded slabs worked out pixel by pixel: each slab lit
// on its upper left and shaded to its lower right, dark crevices between, moss in cushions on the tops of the slabs
// (thicker near the top, frosted in winter, golden in autumn, with small flowers in spring), ferns and hanging vines,
// and the rock darker and wet beside the water. Between them the river pours over a lip in three strands that spread as
// they fall, each lit on its left and shaded on its right, with streaks of light and shadow racing down them and white
// water churning where they break up at the foot. There white foam boils in bubbles, spray flies, mist rises and thins,
// and a pool lies in a ring of wet stones, deeper toward its middle, its front edge lit, with ripples spreading from the
// falls, light shimmering under them and glints twinkling; in winter ice rims it and icicles hang from the cliff, and in
// autumn a few leaves drift on it. fallsRock paints the still part into the realm's layer (scenery-land.js), drawFalls
// the moving water each frame, and fallsGlow, after the night shade, the moonlight on the water. Loaded after
// scenery-rohan.js.

const FALLS_ROCK = ['#d2dbe0', '#aebdc8', '#8494a5', '#64758a', '#4a586c', '#2e3846'];
const FALLS_MOSS = ['#c8e68c', '#9fd070', '#6aa84f', '#4a8238', '#2f5e2c'];
const FALLS_BACK = ['#3a4859', '#2f3b4a', '#55697f', '#232c38'];
const FALLS_WATER = ['#ffffff', '#d4f0ff', '#9fd4f6', '#6cb4ea', '#4a8fd4', '#336fb4'];
const FALLS_POND = ['#8fd0f4', '#6cb6ec', '#4f9ade', '#3a80c8', '#2c66ac', '#24538f'];
// The left cliff's crest, a row per half unit across it, and the right rock's.
const [FALLS_CREST_L, FALLS_CREST_R] = [[2.5, 2.5, 2, 2, 1.5, 1, 1, 1, 1.5, 2, 2, 2.5, 2, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 2], [9, 8, 7.5, 7, 7, 7, 7.5, 8.5]];
// The three strands: [first quarter-unit column, how many, how far it drifts by the foot, its columns' tones left to
// right, 0 white to 5 deep]. The last is in the right rock's shadow.
const FALLS_STRANDS = [[0, 9, -1, '011222334'], [9, 7, 0, '1012234'], [16, 8, 1.5, '11223345']];
// The stones round the pool [x, y, radius] in the falls' own units, the last a stepping stone in the water.
const FALLS_STONES = [[5, 60.5, 1.5], [6.5, 63, 1.5], [9, 64, 1.25], [12, 64.5, 1.5], [15, 64.25, 1.25], [17.5, 63, 1.5], [18.75, 60.5, 1.25], [13.5, 61.5, 1]];
const FALLS_POOL = { x: 12, y: 60.5, rx: 7.5, ry: 3.25 };
// Where the falls' own units start: the realm's left edge, 44 rows above the ground.
const fallsAt = (r) => [r.x0, GROUND_Y - 44];
const fallsCrest = (list, x) => { const s = x * 2; const a = list[Math.floor(s)] ?? list[list.length - 1]; const b = list[Math.floor(s) + 1] ?? a; return Math.round((a + (b - a) * (s - Math.floor(s))) * 4) / 4; };

// Rounded slabs [x, y, rx, ry] in rows of seeded heights and widths over a mass from column a to b, and the two
// boulders at the cliff's foot.
function fallsSlabs(a, b, top, foot, seed) {
  const list = [];
  for (let k = 0, y = top - 1; y < foot; k += 1) {
    const h = 3 + rnd(seed + k) * 3;
    for (let x = a - rnd(seed + k * 3) * 3; x < b;) {
      const w = 3 + rnd(seed + k * 7 + x) * 3.5;
      list.push([x + w / 2, y + h / 2 + (rnd(seed + x * 3 + k) - 0.5) * 0.8, w / 2 + 0.35, h / 2 + 0.35]);
      x += w;
    }
    y += h;
  }
  return list;
}
const FALLS_SLABS = [...fallsSlabs(-1, 10, 0, 66, 11), [2, 61.5, 2.6, 2.6], [5, 63.5, 2, 1.75], ...fallsSlabs(15, 21, 6, 58, 47)];
// The moss's colours in a season: frosted in winter, golden in autumn, fresh in spring.
const fallsMoss = (season) => FALLS_MOSS.map((c) => (season === 'winter' ? hdMix(c, '#dfe9ec', 0.4) : season === 'autumn' ? hdMix(c, '#b9a24a', 0.3) : season === 'spring' ? hdMix(c, '#d8f0a0', 0.12) : c));

// A pixel of the cliff, the rock or the wet rock behind the water at (x, y) in the falls' units, or none.
function fallsRockPixel(x, y, i, j, moss, season) {
  const [cx, cy] = [x + 0.125, y + 0.125];
  const left = (cx < 9.5 && cy >= fallsCrest(FALLS_CREST_L, cx) && cy < (cx < 4.5 ? 65.5 : 59)) || Math.hypot(cx - 2, cy - 61.5) < 2.6 || Math.hypot((cx - 5) / 2, (cy - 63.5) / 1.75) < 1;
  const right = cx >= 15.5 && cx < 19.5 && cy >= fallsCrest(FALLS_CREST_R, cx - 15.5) && cy < 58;
  if (!left && !right) {
    if (cx < 9.5 || cx >= 15.5 || cy < 1.5 || cy >= 58.5) return null;
    if (qdHash(i, j >> 3) < 0.03) return FALLS_BACK[2];
    return qdHash(i, 7) < 0.3 ? FALLS_BACK[0] : cy < 6 ? FALLS_BACK[3] : FALLS_BACK[1];
  }
  let [q1, q2, s] = [9, 9, -1];
  FALLS_SLABS.forEach(([sx, sy, rx, ry], n) => {
    const q = ((cx - sx) / rx) ** 2 + ((cy - sy) / ry) ** 2;
    if (q < q1) { [q2, q1, s] = [q1, q, n]; } else if (q < q2) q2 = q;
  });
  if (s < 0 || q1 > 1.05 || q2 - q1 < 0.12) return q2 - q1 < 0.05 || q1 > 1.2 ? FALLS_ROCK[5] : FALLS_ROCK[4];
  const [sx, sy, rx, ry] = FALLS_SLABS[s];
  // Each slab's face is half rounded and half cut in flat facets, so it reads as stone.
  const [nx, ny] = [(cx - sx) / rx, (cy - sy) / ry];
  const [fx, fy] = [Math.round(nx * 2) / 2, Math.round(ny * 2) / 2];
  const lit = (a, b, q) => -0.55 * a - 0.6 * b + 0.58 * Math.sqrt(Math.max(0.05, 1 - Math.min(0.95, q)));
  const wet = cx < 9.5 ? Math.max(0, (cx - 3) / 14) : Math.max(0, (19 - cx) / 10);
  const light = 0.55 * lit(fx, fy, fx * fx + fy * fy) + 0.45 * lit(nx, ny, q1) - wet * 0.7 + (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.47) * 0.06;
  let k = light > 0.85 ? 0 : light > 0.5 ? 1 : light > 0.12 ? 2 : light > -0.28 ? 3 : 4;
  const mossy = rnd(s * 7 + 3) < (cy < 14 ? 0.75 : 0.4) && !(cx > 8.25 && cx < 9.5) && !(cx >= 15.5 && cx < 16.5);
  if (mossy && -ny > 0.2 + 0.18 * Math.sin(nx * 5 + s)) {
    if (season === 'spring' && qdHash(i, j) < 0.025) return ['#fbe3ef', '#ffffff', '#ef8fbc'][s % 3];
    if (season === 'autumn' && qdHash(j, i) < 0.02) return '#d0702c';
    return moss[Math.min(4, k + (qdHash(i >> 1, j >> 1) < 0.3 ? 1 : 0))];
  }
  if ((cx > 8.5 && cx < 9.5) || (cx >= 15.5 && cx < 16.25)) { if (qdHash(i, j >> 2) < 0.06) return '#cfe8f5'; k = Math.max(k, 3); }
  return FALLS_ROCK[k];
}

// The water's body as it falls, in quarter-unit columns, each in its strand's tone, drifting with its strand as it
// falls: c is the column, 0 to 23 from the lip's left at x 9.5.
const fallsStrand = (c) => FALLS_STRANDS.find(([a, n]) => c >= a && c < a + n);
const FALLS_COLS = Array.from({ length: 24 }, (_, c) => Float32Array.from({ length: 233 }, (_, n) => 9.5 + c / 4 + Math.round(fallsStrand(c)[2] * Math.max(0, (n / 4 - 2) / 56) ** 1.5 * 4) / 4));
const fallsColX = (c, y) => FALLS_COLS[c][Math.max(0, Math.min(232, Math.round(y * 4)))];
const fallsTone = (c) => { const [a, , , tones] = fallsStrand(c); return Number(tones[c - a]); };
function fallsSheet(g, X, T) {
  for (let c = 0; c < 24; c += 1) {
    let from = 2;
    for (let y = 2.25; y <= 58; y += 0.25) {
      if (y < 58 && fallsColX(c, y) === fallsColX(c, from)) continue;
      pxBox(g, X + fallsColX(c, from), T + from, 0.25, y - from, FALLS_WATER[fallsTone(c)]);
      from = y;
    }
  }
}
// A wet stone: a dark outline, its body, a lit cap to its upper left, and a line of foam where it meets the water (its
// glint twinkles in drawFalls).
function fallsStone(g, x, y, r, moss) {
  const ry = r * 0.8;
  qdOval(g, x, y, r, ry, '#33404e');
  qdOval(g, x - 0.25, y - 0.25, r - 0.25, ry - 0.25, '#5f6f80');
  qdOval(g, x - 0.5, y - 0.5, r - 0.75, ry - 0.75, '#8d9daf');
  if (r > 1.2) qdOval(g, x - 0.75, y - 0.5, r - 1.25, Math.max(0.25, ry - 1), '#c3d1dc');
  pxBox(g, x - r + 0.5, y + ry - 0.25, r * 2 - 1, 0.25, '#bfe6fb');
  if (moss) pxBox(g, x - 0.75, y - ry, 1.25, 0.25, moss[1]);
}

// A vine hanging from (x, y) for len units, wandering a little, a leaf every unit on alternate sides.
function fallsVine(g, x, y, len, moss) {
  for (let k = 0; k < len; k += 0.25) {
    const vx = x + Math.round(Math.sin(k * 1.3 + x) * 1.2) / 4;
    qdDot(g, vx, y + k, '#3f7a34');
    if ((k * 4) % 4 !== 0 || k === 0) continue;
    const s = k % 2 ? 0.25 : -0.5;
    pxBox(g, vx + s, y + k, 0.5, 0.5, moss[2]);
    qdDot(g, vx + s, y + k, moss[1]);
    qdDot(g, vx + s + 0.25, y + k + 0.25, moss[3]);
  }
}
// A fern from (x, y) leaning out to side dir: a stem that arcs up and over, with a leaflet each side at every step.
function fallsFern(g, x, y, dir, moss) {
  for (let k = 1; k <= 8; k += 1) {
    const [px, py] = [x + dir * k * 0.25, y - Math.round((k * 0.3 - k * k * 0.035) * 4) / 4];
    qdDot(g, px, py, moss[3]);
    if (k % 2 && k < 8) { qdDot(g, px, py - 0.25, moss[1]); qdDot(g, px, py + 0.25, moss[2]); }
  }
}

// The still part of the falls: the cliff and the rocks (painted once a season and kept), the water's body, moss along
// the crests with drips, vines, ferns, the pool and the stones round it, and the season's ice.
const fallsArt = new Map();
function fallsRock(g, r, season = seasonNow()) {
  const [[X, T], moss] = [fallsAt(r), fallsMoss(season)];
  if (!fallsArt.has(season)) fallsArt.set(season, qdPixels(20, 66, (x, y, i, j) => fallsRockPixel(x, y, i, j, moss, season)));
  qdPut(g, fallsArt.get(season), X, T);
  fallsSheet(g, X, T);
  // The lip: the river's surface coming to the edge, darkest far off, and its bright brink.
  [5, 4, 3, 2, 0, 1].forEach((k, n) => pxBox(g, X + 9.5, T + 0.5 + n / 4, 6, 0.25, FALLS_WATER[k]));
  for (const [a, b, list, x0] of [[0, 9.5, FALLS_CREST_L, 0], [15.5, 19.5, FALLS_CREST_R, 15.5]]) {
    for (let x = a; x < b; x += 0.25) {
      const y = T + fallsCrest(list, x - x0);
      const thick = 0.75 + Math.floor(rnd(x * 4 + 5) * 3) / 4;
      pxBox(g, X + x, y, 0.25, thick, moss[2]);
      qdDot(g, X + x, y, moss[0]);
      qdDot(g, X + x, y + 0.25, moss[1]);
      qdDot(g, X + x, y + thick - 0.25, moss[3]);
      if (rnd(x * 7) < 0.3) qdDot(g, X + x, y - 0.25, moss[1]);
      if (rnd(x * 5 + 1) < 0.2) pxBox(g, X + x, y + thick, 0.25, 0.25 + Math.floor(rnd(x * 3) * 3) / 4, season === 'winter' ? '#d8eef8' : moss[3]);
    }
  }
  for (const [x, y, len] of [[7.5, 2.5, 7], [8.5, 3, 11], [3, 3.5, 4], [17, 8.5, 5], [1.25, 14, 3]]) fallsVine(g, X + x, T + y, len, moss);
  for (const [x, y, dir] of [[6, 22.5, 1], [2.5, 34, 1], [7.25, 44, 1], [17.5, 26, -1], [4.5, 51.5, 1]]) fallsFern(g, X + x, T + y, dir, moss);
  fallsPool(g, X, T, season);
  FALLS_STONES.forEach(([x, y, rad], i) => fallsStone(g, X + x, T + y, rad, i % 3 === 1 ? moss : null));
  if (season !== 'winter') return;
  for (const [x, y, len] of [[7.75, 3, 2], [8.75, 4, 1.5], [3.5, 4.25, 1.25], [16, 9.5, 2], [17.25, 9.25, 1.25], [5.5, 3, 1]]) {
    for (let k = 0; k < len; k += 0.25) pxBox(g, X + x, T + y + k, k < len * 0.5 ? 0.5 : 0.25, 0.25, k < 0.5 ? '#ffffff' : '#c8e6f6');
  }
}
// The pool: shallow and pale at its rim, deeper toward its middle and in the cliff's shadow at its back, its front edge
// lit; ringed with ice in winter.
function fallsPool(g, X, T, season) {
  const P = FALLS_POOL;
  qdPut(g, qdPixels(16, 7, (x, y, i, j) => {
    const [px, py] = [P.x - 8 + x + 0.125, P.y - 3.5 + y + 0.125];
    const q = ((px - P.x) / P.rx) ** 2 + ((py - P.y) / P.ry) ** 2;
    if (q > 1) return null;
    if (season === 'winter' && q > 0.78) return qdDith(i, j, (q - 0.78) * 8) ? '#f2fafe' : '#c6e4f4';
    if (q > 0.86) return py > P.y ? '#d8f0ff' : FALLS_POND[5];
    const d = (1 - q) * 5.2 + (py < P.y ? 0.8 : 0) + (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.47) * 0.8;
    return FALLS_POND[Math.max(0, Math.min(5, Math.floor(d)))];
  }), X + P.x - 8, T + P.y - 3.5);
}
// Foam bubbles, painted once per size: a shaded body, a lighter one up and to the left, and a lit cap; and the mist's
// puffs, one flat colour (moon is true or false for foam, or 'mist' or 'mist night').
const fallsBubbles = new Map();
function fallsBubble(rad, moon) {
  const key = `${rad},${moon}`;
  if (!fallsBubbles.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(rad * 2 * SC_RES);
    const b = cv.getContext('2d');
    b.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
    const [shade, body, lit] = { mist: ['#eef6ff'], 'mist night': ['#9fb0d0'], true: ['#9fb4d0', '#c8d8ee', '#eef6ff'], false: ['#a9d4f0', '#e4f4ff', '#ffffff'] }[moon];
    qdOval(b, rad, rad, rad, rad, shade);
    if (body) qdOval(b, rad - 0.25, rad - 0.25, rad - 0.25, rad - 0.25, body);
    if (lit && rad > 0.75) qdOval(b, rad - 0.5, rad - 0.5, rad - 0.75, rad - 0.75, lit);
    fallsBubbles.set(key, cv);
  }
  return fallsBubbles.get(key);
}
// The moving water: the lip with light running along its brink, streaks of light and shadow racing down each column
// faster as they fall, and white water where the strands break up at the foot. In moonlight only the light is drawn,
// pale.
function fallsWater(g, X, T, tick, moon) {
  const W = FALLS_WATER;
  const pale = (k) => (moon ? '#d8ecff' : W[k]);
  for (let x = 9.5; x < 15.5; x += 0.25) {
    const p = Math.round(x * 4);
    if ((p + Math.floor(tick / 2)) % 7 < 2) qdDot(g, X + x, T + 1.75, pale(0));
    if ((p * 3 - tick) % 13 === 0) qdDot(g, X + x, T + 0.75, pale(1));
  }
  for (let c = 0; c < 24; c += 1) {
    const tone = fallsTone(c);
    for (const [lit, period, speed, len] of [[true, 7 + ((c * 5) % 4), 1.6 + ((c * 7) % 3) * 0.35, 1 + (c % 3) * 0.5], [false, 11 + (c % 3), 1.3, 2]]) {
      if (moon && (!lit || tone > 3)) continue;
      const shift = ((tick * speed + rnd(c + (lit ? 17 : 41)) * period) % period) - period;
      for (let s = shift; s < 56; s += period) {
        const y0 = Math.max(2, Math.round((2 + s) * 4) / 4);
        const y1 = Math.min(58, Math.round((2 + s + len * (1 + s / 30)) * 4) / 4);
        if (y1 > y0) pxBox(g, X + fallsColX(c, (y0 + y1) / 2), T + y0, 0.25, y1 - y0, moon ? pale(0) : W[lit ? Math.max(0, tone - 2) : Math.min(5, tone + 1)]);
      }
    }
    if (moon) continue;
    for (let k = 0; k < 3; k += 1) {
      const y = 52.5 + ((tick * 1.7 + rnd(c * 3 + k) * 6 + k * 2) % 5.5);
      pxBox(g, X + fallsColX(c, y), T + Math.round(y * 4) / 4, 0.25, 0.5, k ? W[1] : W[0]);
    }
  }
}

// Where the water lands, everything inside the falls' box: churning foam, ripples spreading over the pool from it,
// light shimmering on the pool under the falls, the stones' glints, spray thrown up and falling back, and mist rising
// and thinning; in autumn a few leaves drift round the pool. In moonlight the foam, ripples and glints are drawn pale
// and the rest left out.
function fallsFoam(g, X, T, tick, moon, sky) {
  const P = FALLS_POOL;
  const A = g.globalAlpha;
  const inPool = (x, y, m = 0.85) => ((x - P.x) / P.rx) ** 2 + ((y - P.y) / P.ry) ** 2 < m;
  for (let k = 0; k < 3; k += 1) {
    const grow = (tick * 0.3 + k * 2.2) % 6.6;
    const [rx, cy] = [1.5 + grow, 59.75];
    g.globalAlpha = A * (moon ? 0.6 : 0.9) * (1 - grow / 7.5);
    for (let dx = -rx; dx <= rx; dx += 0.25) {
      const y = cy + Math.round(rx * 0.36 * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)) * 4) / 4;
      if (inPool(12.5 + dx, y)) qdDot(g, X + Math.round((12.5 + dx) * 4) / 4, T + y, moon ? '#e8f4ff' : '#c8ecff');
    }
  }
  g.globalAlpha = A * (moon ? 0.5 : 0.7);
  if (!moon) qdOval(g, X + 12.5, T + 58.5, 6, 1.75, '#d8eefc');
  for (let k = 0; k < 8; k += 1) {
    const y = 60.25 + ((tick * 0.4 + k * 1.3) % 2.75);
    if (inPool(9.75 + k * 0.75, y)) pxBox(g, X + 9.75 + k * 0.75, T + Math.round(y * 4) / 4, 0.25, 0.5, '#d4f0ff');
  }
  g.globalAlpha = A;
  for (let b = 0; b < 14; b += 1) {
    const rad = [1, 1.25, 1.5, 1.75][(b + Math.floor(tick / 3)) % 4] + (b % 5 === 2 ? 0.25 : 0);
    const x = Math.round((7.75 + b * 0.68 + Math.sin((tick + b * 3) / 2.2) * 0.5) * 4) / 4;
    const y = Math.round((57.25 + ((b * 5 + Math.floor(tick / 2)) % 3) * 0.25 + (b === 0 || b === 13 ? 0.75 : 0)) * 4) / 4;
    g.drawImage(fallsBubble(rad, moon), X + x - rad, T + y - rad, rad * 2, rad * 2);
  }
  FALLS_STONES.forEach(([x, y, rad], i) => qdDot(g, X + x - rad * 0.5, T + y - rad * 0.5, (tick + i * 5) % 14 < 11 ? '#ffffff' : '#a9c3dc'));
  for (let k = 0; k < 5; k += 1) if ((tick + k * 7) % 12 < 4) qdDot(g, X + 7 + k * 2.25, T + 61.25 + (k % 3) * 0.75, '#ffffff');
  if (moon) return;
  for (let i = 0; i < 16; i += 1) {
    const t = (tick + Math.floor(i * 2.7)) % 10;
    const side = i % 2 ? 1 : -1;
    const x = 12.5 + side * (1 + (i % 3)) + side * (0.35 + (i % 4) * 0.12) * t;
    const y = 57.5 - (0.9 + (i % 3) * 0.25) * t + 0.12 * t * t;
    const size = t < 4 && i % 3 === 0 ? 0.5 : 0.25;
    if (x >= 4 && x < 19.5 && y >= 40 && y < 66) pxBox(g, X + Math.round(x * 4) / 4, T + Math.round(y * 4) / 4, size, size, i % 3 ? '#d8efff' : '#ffffff');
  }
  for (let i = 0; i < 6; i += 1) {
    const q = (tick * 0.5 + i * 3.3) % 20;
    const rad = Math.round((1.5 + q * 0.08) * 4) / 4;
    const x = Math.round(Math.min(19.5 - rad, Math.max(4 + rad, 7 + i * 2 + Math.sin((q + i) / 3))) * 4) / 4;
    g.globalAlpha = A * 0.22 * (1 - q / 20);
    g.drawImage(fallsBubble(rad, sky?.night ? 'mist night' : 'mist'), X + x - rad, T + Math.round((57 - q * 0.7) * 4) / 4 - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = A;
  if (landSeasonNow() !== 'autumn') return;
  for (let k = 0; k < 3; k += 1) {
    const a = tick * 0.012 + k * 2.1;
    pxBox(g, X + Math.round((P.x + Math.cos(a) * 5.5) * 4) / 4, T + Math.round((P.y + 0.75 + Math.sin(a) * 1.5) * 4) / 4, 0.5, 0.25, LAND_LEAVES[k]);
  }
}

// The moving water, each frame, over the still part in the realm's layer.
function drawFalls(g, r, tick, sky) {
  const [X, T] = fallsAt(r);
  fallsWater(g, X, T, tick, false);
  fallsFoam(g, X, T, tick, false, sky);
}

// After the night shade: the moonlight caught on the falls' streaks, the lip, the foam, the ripples and the wet stones.
function fallsGlow(g, r, tick) {
  const [X, T] = fallsAt(r);
  g.globalAlpha = 0.55;
  fallsWater(g, X, T, tick, true);
  g.globalAlpha = 0.5;
  fallsFoam(g, X, T, tick, true);
  g.globalAlpha = 1;
}
