// scenery-land.js: each realm's ground in the Middle-earth view, in 32-bit (a quarter unit a pixel, scene.js's SC_RES),
// and the order a realm draws in. The ground is its realm's colour worked out pixel by pixel: a haze along its far
// edge dithered into the grass, broad patches of darker and sunlit grass with dithered edges, and fine blades lit at the
// tip; long dry grass in Rohan; gravel and cracks on Erebor's stone; and by the season of the date small flowers in the
// grass (spring and summer) or fallen leaves under Rivendell's trees (autumn). The landmarks are scenery-land-qd.js's
// (Rivendell's pavilion, the Shire's hill, door, window, chimney, smoke and fence), scenery-rohan.js's (Rohan's tent
// and pennant), scenery-erebor.js's (the wall, the gate and the forge) and scenery-falls.js's (Rivendell's waterfall);
// the lights that stay bright at night are scenery-lights.js's. What stands still is painted once per layout and season
// into a layer (skLayer, scenery-sky.js); the smoke, the pennant, the falls' water and, with the wind (scene-wind.js),
// the trees, the grass and the garden plants move each frame. The ground keeps to its realm's GROUND colours and the
// four mixes of them that settled snow knows. Also the quarter-unit drawing helpers the landmarks share. Loaded after
// scenery-sky.js.

// A pixel of the 32-bit grid, and an oval rx by ry about (cx, cy) in quarter-unit rows.
const qdDot = (g, x, y, c) => pxBox(g, x, y, 0.25, 0.25, c);
function qdOval(g, cx, cy, rx, ry, c) {
  for (let y = -Math.ceil(ry * 4) / 4; y < ry; y += 0.25) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((y + 0.125) / ry) ** 2)) * 4) / 4;
    if (hw > 0) pxBox(g, cx - hw, cy + y, hw * 2, 0.25, c);
  }
}
// A material's six steps from its base: a shine and a light that lean warm, the base, a shade and a deep that lean
// cool, and an outline in its own darkest hue.
const qdRamp = (c) => {
  const deep = hdMix(c, '#283a6e', 0.5);
  return [hdMix(c, '#fff0c8', 0.55), hdMix(c, '#fff0c8', 0.25), c, hdMix(c, '#283a6e', 0.28), deep, hdMix(deep, HD_DARK, 0.55)];
};
// Whether pixel (i, j) takes the second of two colours where a share t of the pixels should: the 4 by 4 ordered dither.
const qdDith = (i, j, t) => t * 16 > BAYER[(j & 3) * 4 + (i & 3)] + 0.5;
// A fixed hash of two whole numbers, 0 to 1.
const qdHash = (a, b) => rnd(a * 157.31 + b * 31.7 + 0.5);

// Art worked out pixel by pixel: a canvas w by h units at SC_RES, each pixel's colour from shade(x, y, i, j), its
// top-left in units from the canvas's corner and its column and row, or clear where shade returns nothing.
const qdRgb = new Map();
function qdPixels(w, h, shade) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * SC_RES);
  cv.height = Math.ceil(h * SC_RES);
  const g = cv.getContext('2d');
  const img = g.createImageData(cv.width, cv.height);
  const d = img.data;
  for (let j = 0, o = 0; j < cv.height; j += 1) {
    for (let i = 0; i < cv.width; i += 1, o += 4) {
      const c = shade(i / SC_RES, j / SC_RES, i, j);
      if (!c) continue;
      let v = qdRgb.get(c);
      if (!v) qdRgb.set(c, (v = hdRgb(c)));
      d[o] = v[0];
      d[o + 1] = v[1];
      d[o + 2] = v[2];
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
const qdPut = (g, cv, x, y) => { g.imageSmoothingEnabled = false; g.drawImage(cv, x, y, cv.width / SC_RES, cv.height / SC_RES); };
// Courses of dressed stones over a box, each course ch units tall, its stones of seeded widths from wMin to wMax units
// and every other course set over by half the least: each stone one of faces, lit along its top and left, shaded
// along its bottom and right, with mortar between.
function qdBlocks(g, x, y, w, h, ch, [lit, faces, shade, mortar], seed, wMin, wMax) {
  for (let k = 0, by = y; by < y + h - 0.01; k += 1, by += ch) {
    const bh = Math.min(ch, y + h - by);
    for (let bx = x - (k % 2 ? Math.round(wMin * 2) / 4 : 0); bx < x + w;) {
      const bw = Math.max(0.75, Math.round((wMin + rnd(seed + k * 31 + bx * 7) * (wMax - wMin)) * 4) / 4);
      const [a, b] = [Math.max(x, bx), Math.min(x + w, bx + bw)];
      pxBox(g, a, by, b - a, bh, faces[Math.floor(rnd(seed + bx * 3 + k * 5) * faces.length)]);
      pxBox(g, a, by, b - a, 0.25, lit);
      if (bx >= x) pxBox(g, a, by, 0.25, bh, lit);
      if (bh > 0.5) pxBox(g, a, by + bh - 0.5, b - a, 0.25, shade);
      if (b === bx + bw) pxBox(g, b - 0.5, by + 0.25, 0.25, bh - 0.5, shade);
      pxBox(g, a, by + bh - 0.25, b - a, 0.25, mortar);
      if (b === bx + bw) pxBox(g, b - 0.25, by, 0.25, bh, mortar);
      bx += bw;
    }
  }
}

// A material's four colours from its base: highlight, base, shade and an outline of its own hue.
const ldRamp = (c, d = 0.25) => { const s = hdMix(c, HD_DARK, d); return [hdMix(c, HD_LIGHT, 0.3), c, s, hdMix(s, HD_DARK, 0.6)]; };

// A tuft of three blades at (x, y), the middle one tallest, lit at the tips, with a shadow at its foot. scene-wind.js
// bends these, and the road's dry grass (scenery.js) is drawn with it.
function ldTuft(g, x, y, tip, stem, foot, tall = 0) {
  pxBox(g, x - 0.5, y, 2, 0.5, foot);
  pxBox(g, x, y - 1, 0.5, 1, stem);
  pxBox(g, x + 0.5, y - 1.5 - tall, 0.5, 1.5 + tall, stem);
  pxBox(g, x + 1, y - 1, 0.5, 1, stem);
  skDot(g, x, y - 1, tip);
  skDot(g, x + 0.5, y - 1.5 - tall, tip);
}
// Where a realm's tufts grow, by a fixed seed, as [x, y, how much taller the middle blade is]: none on Erebor's stone,
// long grass in Rohan. landGround draws them still, or with the wind (landWind, scene-wind.js) they sway instead.
const landTufts = (r) => (r.kind === 'dwarf' ? [] : Array.from({ length: Math.ceil(r.w / (r.kind === 'man' ? 2 : 3)) }, (_, i) => [
  r.x0 + Math.floor(rnd(r.x0 + i * 3) * r.w * 2) / 2, GROUND_Y + 2.5 + Math.floor(rnd(r.x0 * 3 + i + 400) * (ROAD_Y - GROUND_Y - 4) * 2) / 2,
  r.kind === 'man' ? 0.5 + (i % 2) * 0.5 : 0]));
const landWind = () => (typeof sc === 'object' && sc.wind) || null;
// The season, looked up again at most once a minute (seasonNow formats the date, too slow to do every frame).
const landSeasonAt = { t: -Infinity, s: '' };
const landSeasonNow = () => { const now = Date.now(); if (now - landSeasonAt.t > 60000) Object.assign(landSeasonAt, { t: now, s: seasonNow() }); return landSeasonAt.s; };

// The ground's steps, darkest first: its dark grass deepened, its dark grass, its grass, and its grass lit a little,
// more and most (the colours scenery-snow.js settles snow on).
const landSteps = (kind) => {
  const [grass, grassD] = GROUND[kind] ?? GROUND.man;
  return [hdMix(grassD, HD_DARK, 0.25), grassD, grass, hdMix(grass, HD_LIGHT, 0.16), hdMix(grass, HD_LIGHT, 0.35), hdMix(grass, HD_LIGHT, 0.4)];
};
// The patches: a smooth field over the ground, low where its grass is dark and high where the sun lies on it, stretched
// wide as ground seen from above at a slant is.
const landField = (X, y) => 0.5 + 0.22 * Math.sin(X / 9.3 + Math.sin(y / 3.1) * 1.7) * Math.cos(y / 2.6 + Math.sin(X / 7.7) * 0.9)
  + 0.14 * Math.sin(X / 4.3 + y / 2.2) + 0.1 * Math.cos(X / 13.1 - y / 1.7);
// Each kind's blades: [share of the cells that have one, tallest in pixels, how many steps lighter its tip is].
const LAND_BLADES = { elf: [0.55, 3, 1], hobbit: [0.6, 3, 1], man: [0.8, 5, 2], dwarf: [0, 0, 0] };

// The ground's patches and blades, worked out once a paint: the field on a half-unit grid, which each pixel takes
// between its four nearest points, and each cell's blade (cells a unit wide and three pixels tall) as its column, foot
// row and length in pixels, or -1 for none.
function landTables(r) {
  const H = ROAD_Y - GROUND_Y;
  const [gw, gh] = [r.w * 2 + 2, H * 2 + 2];
  const field = new Float32Array(gw * gh);
  for (let b = 0; b < gh; b += 1) for (let a = 0; a < gw; a += 1) field[b * gw + a] = landField(r.x0 + a / 2, b / 2);
  const [share, tall] = LAND_BLADES[r.kind] ?? LAND_BLADES.man;
  const c0 = (r.x0 * SC_RES) >> 2;
  const [cw, ch] = [Math.ceil((r.w * SC_RES) / 4) + 2, Math.ceil((H * SC_RES) / 3) + 2];
  const blades = new Int16Array(cw * ch * 3).fill(-1);
  for (let cj = 0; cj < ch; cj += 1) {
    for (let c = 0; c < cw; c += 1) {
      const ci = c0 + c;
      if (qdHash(ci, cj * 7 + 3) > share) continue;
      const foot = cj * 3 + 2;
      blades.set([ci * 4 - r.x0 * SC_RES + Math.floor(qdHash(ci, cj) * 4), foot, 1 + Math.floor(qdHash(cj, ci) * tall * (0.6 + (0.4 * foot) / (H * SC_RES)))], (cj * cw + c) * 3);
    }
  }
  return { field, gw, blades, cw, c0 };
}
// A pixel of a realm's ground at (x, y) units from its top-left: its step (landSteps).
function landStep(r, T, x, y, i, j) {
  const a0 = Math.floor(x * 2);
  const b0 = Math.floor(y * 2);
  const fa = x * 2 - a0;
  const fb = y * 2 - b0;
  const [F, p] = [T.field, b0 * T.gw + a0];
  const n = (F[p] * (1 - fa) + F[p + 1] * fa) * (1 - fb) + (F[p + T.gw] * (1 - fa) + F[p + T.gw + 1] * fa) * fb;
  let k = 2;
  if (qdDith(i, j, (0.36 - n) / 0.06 + 0.5)) k = 1;
  if (k === 1 && qdDith(i, j, (0.21 - n) / 0.05 + 0.5)) k = 0;
  if (qdDith(i, j, (n - 0.73) / 0.05 + 0.5)) k = 3;
  // The far edge, hazy toward the mountains.
  if (y < 0.5 || (y < 3 && !qdDith(i, j, (y - 0.25) / 2.75))) k = Math.max(k, 3);
  if (r.kind === 'dwarf') return k;
  // A blade in this cell or the one below: one pixel wide, its foot darker than the ground and its tip lighter.
  const lift = (LAND_BLADES[r.kind] ?? LAND_BLADES.man)[2];
  const c = ((r.x0 * SC_RES + i) >> 2) - T.c0;
  for (let cj = Math.floor(j / 3), n = 0; n < 2; cj += 1, n += 1) {
    const q = (cj * T.cw + c) * 3;
    const foot = T.blades[q + 1];
    if (T.blades[q] !== i || j > foot || j <= foot - T.blades[q + 2]) continue;
    return j === foot - T.blades[q + 2] + 1 ? Math.min(5, k + lift) : Math.max(0, k - 1);
  }
  return k;
}

// Erebor's gravel: in cells a unit and a half by a unit, now and then a pebble two or three pixels wide, lit on its
// upper left with a shadow to its lower right.
function landPebble(x0, i, j) {
  const [ci, cj] = [Math.floor((x0 * SC_RES + i) / 6), Math.floor(j / 4)];
  if (qdHash(ci, cj + 900) > 0.16) return null;
  const [pi, pj] = [ci * 6 - x0 * SC_RES + 1 + Math.floor(qdHash(ci, cj + 901) * 2), cj * 4 + Math.floor(qdHash(ci, cj + 902) * 2)];
  const [pw, ph] = qdHash(ci, cj + 903) < 0.4 ? [3, 2] : [2, 1];
  const [u, v] = [i - pi, j - pj];
  if (u >= 0 && u < pw && v >= 0 && v < ph) return u === 0 && v === 0 ? '#a39b90' : '#857d73';
  return (u === pw && v >= 0 && v <= ph) || (v === ph && u >= 1 && u <= pw) ? 0 : null;
}

// A realm's ground between the mountains and the road, with its grass tufts too when tufts is set (without the wind).
function landGround(g, r, tufts = true, season = seasonNow()) {
  const { x0, w } = r;
  const H = ROAD_Y - GROUND_Y;
  const steps = landSteps(r.kind);
  const dwarf = r.kind === 'dwarf';
  const T = landTables(r);
  qdPut(g, qdPixels(w, H, (x, y, i, j) => {
    const k = landStep(r, T, x, y, i, j);
    if (dwarf && y > 1) { const p = landPebble(x0, i, j); if (p !== null) return p === 0 ? steps[0] : p; }
    return steps[k];
  }), x0, GROUND_Y);
  // Blades along the far edge, against the mountains.
  for (let x = x0; x < x0 + w; x += 0.25) if (!dwarf && rnd(x * 4 + x0) < 0.35) pxBox(g, x, GROUND_Y - 0.25 * (1 + Math.floor(rnd(x * 7) * 2)), 0.25, 0.5, steps[rnd(x * 3) < 0.5 ? 3 : 2]);
  if (dwarf) landCracks(g, r, steps);
  else landSeason(g, r, season);
  if (tufts) for (const [x, y, tall] of landTufts(r)) ldTuft(g, x, y, steps[4], steps[1], steps[0], tall);
}
// Cracks in Erebor's stone: thin dark lines that wander to the right, their lower lip catching the light.
function landCracks(g, r, steps) {
  for (let i = 0; i < r.w / 9; i += 1) {
    let x = r.x0 + 2 + Math.floor(rnd(r.x0 + i * 13) * (r.w - 8) * 4) / 4;
    let y = GROUND_Y + 4 + Math.floor(rnd(r.x0 + i * 17 + 3) * (ROAD_Y - GROUND_Y - 8) * 4) / 4;
    for (let k = 0, n = 10 + Math.floor(rnd(i + 5) * 14); k < n; k += 1) {
      qdDot(g, x, y, steps[0]);
      qdDot(g, x, y + 0.25, steps[3]);
      x += 0.25;
      const s = rnd(x * 9 + i);
      y += s < 0.25 ? -0.25 : s > 0.75 ? 0.25 : 0;
      if (rnd(x * 5 + y) < 0.1) { qdDot(g, x, y + 0.25, steps[0]); y += 0.25; }
    }
  }
}

// What the season leaves on the grass: small flowers of four petals round a centre in spring and summer, and in autumn
// Rivendell's fallen leaves, thickest under its trees, and a few in the Shire.
const LAND_FLOWERS = { elf: ['#f4f7ff', '#bfe0ff', '#d8c4f0'], hobbit: ['#fff6d0', '#ffd35a', '#ff9fb8', '#c9a0ff'], man: ['#f8f8ff', '#ffe28a'] };
const LAND_LEAVES = ['#d39a36', '#d0702c', '#a5502e', '#ecc25e'];
function landSeason(g, r, season) {
  const H = ROAD_Y - GROUND_Y;
  const flowers = { spring: 1, summer: 0.5 }[season] ?? 0;
  const set = LAND_FLOWERS[r.kind] ?? LAND_FLOWERS.man;
  for (let i = 0; i < (r.w / 5) * flowers; i += 1) {
    const x = r.x0 + 1 + Math.floor(rnd(r.x0 + i * 19 + 7) * (r.w - 2) * 4) / 4;
    const y = GROUND_Y + 4 + Math.floor(rnd(r.x0 + i * 23 + 11) * (H - 6) * 4) / 4;
    const c = set[i % set.length];
    qdDot(g, x, y - 0.25, hdMix(c, HD_LIGHT, 0.5));
    pxBox(g, x - 0.25, y, 0.75, 0.25, c);
    qdDot(g, x, y + 0.25, hdMix(c, HD_DARK, 0.3));
    qdDot(g, x, y, '#f2c14e');
  }
  if (season !== 'autumn' || (r.kind !== 'elf' && r.kind !== 'hobbit')) return;
  const trees = r.kind === 'elf' ? Object.values(elfTrees(r)).flat().map(([x]) => x + 1) : [];
  for (let i = 0; i < r.w / (r.kind === 'elf' ? 1.5 : 6); i += 1) {
    const near = trees.length && i % 3 ? trees[i % trees.length] + (rnd(i + r.x0) - 0.5) * 14 : r.x0 + rnd(i * 3 + r.x0) * r.w;
    const x = Math.round(Math.min(r.x0 + r.w - 1, Math.max(r.x0, near)) * 4) / 4;
    const y = GROUND_Y + 2 + Math.floor(rnd(i * 7 + r.x0 + 1) * (i % 3 ? 10 : H - 4) * 4) / 4;
    const c = LAND_LEAVES[i % 4];
    pxBox(g, x, y, 0.5, 0.25, c);
    qdDot(g, x + (i % 2 ? 0 : 0.25), y + 0.25, hdMix(c, HD_DARK, 0.35));
  }
}

// What stands still in a realm, painted into its layer. With the wind (still false) the grass, Rivendell's trees and
// the Shire's garden plants move instead (drawRealm, scene-wind.js), and the falls' rock and the pavilion are painted
// again over the trees from drawRealm's second layer; they stay in this one too, so settled snow (scenery-snow.js, which
// reads this layer) lies on the pavilion's roof and the cliff but not on the pool or the floor under them.
function landStill(g, r, still = true, season = seasonNow()) {
  const cx = r.x0 + Math.floor(r.w / 2);
  g.imageSmoothingEnabled = false;
  landGround(g, r, still, season);
  if (r.kind === 'elf') {
    if (still) elfGrove(g, r, season, 0, null);
    elfFront(g, r, cx);
  } else if (r.kind === 'hobbit') {
    shireChimney(g, cx);
    shireHill(g, cx);
    shireDoor(g, cx);
    shireWindow(g, cx, false);
    shireFence(g, r);
    drawGardens(g, r, cx, undefined, still ? 'all' : 'ground');
  } else if (r.kind === 'dwarf') {
    ereborWall(g, r);
    ereborGate(g, cx);
    ereborForge(g, r.x0);
  } else rohanTent(g, cx);
}
// Rivendell's trees, the line along the back of the valley first and then the tall ones, each swaying with the wind at
// its column a little out of step with the rest.
function elfGrove(g, r, season, tick, wind) {
  const trees = elfTrees(r);
  for (const [x, h, seed] of trees.small) drawElfTree(g, x, h, seed, 0.6, season, wind ? wind.tree(x + 1, seed, tick) : 0);
  for (const [x, h] of trees.tall) drawElfTree(g, x, h, x, 1, season, wind ? wind.tree(x + 1, x, tick) : 0);
}
const elfFront = (g, r, cx) => { g.imageSmoothingEnabled = false; fallsRock(g, r); elfPavilion(g, cx); };

// A realm: its layer (a margin each side, for a tree that leans over the edge), then what moves. With the wind, Rivendell's
// trees, then the falls' rock and the pavilion in front of them from a second layer, as far down as the falls' pool.
function drawRealm(g, r, tick, sky) {
  const top = GROUND_Y - 50;
  const wind = landWind();
  const season = landSeasonNow();
  const key = `${r.kind},${r.w},${season},${Boolean(wind)}`;
  g.drawImage(skLayer(`land${r.x0}`, key, r.w + 16, ROAD_Y - top, (lg) => { lg.translate(8 - r.x0, -top); landStill(lg, r, !wind, season); }), r.x0 - 8, top, r.w + 16, ROAD_Y - top);
  const cx = r.x0 + Math.floor(r.w / 2);
  if (r.kind === 'elf') {
    if (wind) elfGrove(g, r, season, tick, wind);
    if (wind) g.drawImage(skLayer(`landf${r.x0}`, key, cx + 32 - r.x0, 74, (lg) => { lg.translate(8 - r.x0, -top); elfFront(lg, r, cx); }), r.x0 - 8, top, cx + 32 - r.x0, 74);
    drawFalls(g, r, tick, sky);
  } else if (r.kind === 'hobbit') shireSmoke(g, cx, tick, sky);
  else if (r.kind === 'man') rohanPennant(g, cx, tick);
}
