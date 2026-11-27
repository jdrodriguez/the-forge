// scenery-land-qd.js: the landmarks of Rivendell and the Shire in the Middle-earth view, in 32-bit (a quarter unit a
// pixel), in the same places and sizes as before: Rivendell's white pavilion (fluted pillars with gold rings and ivy, an
// arch with a gold inlay under a beam, a curved teal roof of scalloped tiles whose eaves sweep up, and a gold leaf
// finial); the Shire's hill shaded by how it turns to the light, its round yellow door of planks in a timber ring with a
// brass knob, its round window, its stone chimney, the smoke that rises from it, and its fence. Rohan's tent is
// scenery-rohan.js's. Light comes from the upper left; each material has a ramp of five or six steps, warm in the light
// and cool in the shade. scenery-land.js paints the still ones into each realm's layer (landStill) and draws the smoke
// each frame (drawRealm); the light on the window and under the door at night is scenery-lights.js's, which takes the
// window's glass from shirePanes. Loaded right after scenery-land.js.

const PAV_STONE = ['#ffffff', '#f6f1e3', '#e4dccb', '#c9bca2', '#a69880', '#756a5a'];
const PAV_GOLD = ['#fff6c0', '#f6cf5a', '#d9a53a', '#a7742a', '#6b4317'];
const PAV_ROOF = ['#a8dccb', '#7fc2b0', '#5aa196', '#447f76', '#33625c', '#20403d'];
const PAV_IVY = ['#b4e07a', '#6aa84f', '#3f7a34'];
const PAV_FINIAL = ['...a....', '..abc...', '..abc...', '.abbcd..', '.abbcd..', '..bcd...', '...c....', '..bccd..', '.abbccd.', '.bbbccd.', '..dddd..'];
const PAV_LEAF = ['.b.', 'abc', '.c.'];

// A pillar of white marble at px, two units wide: a fluted shaft lit on its left, gold rings under its capital and
// over its base, a capital and a plinth a half unit wider each side, and ivy climbing it.
function pavPillar(g, px, seed) {
  const [Sh, L, B, S, D, O] = PAV_STONE;
  [L, Sh, L, B, S, B, D, O].forEach((c, k) => pxBox(g, px + k / 4, GROUND_Y - 17, 0.25, 20, c));
  for (const y of [GROUND_Y - 16.5, GROUND_Y + 2.25]) {
    pxBox(g, px, y, 2, 0.25, PAV_GOLD[1]);
    pxBox(g, px, y + 0.25, 2, 0.25, PAV_GOLD[3]);
    qdDot(g, px + 0.25, y, PAV_GOLD[0]);
  }
  [Sh, L, S, D].forEach((c, k) => pxBox(g, px - 0.5, GROUND_Y - 18 + k / 4, 3, 0.25, c));
  [L, B, S, D].forEach((c, k) => pxBox(g, px - 0.5, GROUND_Y + 3 + k / 4, 3, 0.25, c));
  for (const dx of [-0.5, 2.25]) qdDot(g, px + dx, GROUND_Y - 17.75, PAV_GOLD[2]);
  for (let y = GROUND_Y + 2.5, k = 0; y > GROUND_Y - 12; y -= 0.25, k += 1) {
    const x = px + 0.75 + Math.round(Math.sin(y * 0.8 + seed) * 3) / 4;
    qdDot(g, x, y, PAV_IVY[2]);
    if (k % 5) continue;
    const s = k % 10 ? 0.25 : -0.5;
    pxBox(g, x + s, y - 0.25, 0.5, 0.5, PAV_IVY[1]);
    qdDot(g, x + s, y - 0.25, PAV_IVY[0]);
    qdDot(g, x + s + 0.25, y, PAV_IVY[2]);
  }
}
// The arch: spandrels hanging from the beam, deepest at the pillars, shaded along their underside, with a gold inlay
// following their edge and a gold leaf in each corner.
function pavArch(g, cx, c) {
  const [, , B, S, D] = PAV_STONE;
  for (let x = cx - 14; x < cx + 16; x += 0.25) {
    const d = Math.round(3 * ((x + 0.125 - c) / 15) ** 2 * 4) / 4;
    if (d <= 0) continue;
    pxBox(g, x, GROUND_Y - 18, 0.25, d, B);
    if (d > 0.5) qdDot(g, x, GROUND_Y - 18 + d - 0.5, S);
    qdDot(g, x, GROUND_Y - 18 + d - 0.25, D);
    if (d > 1.25) qdDot(g, x, GROUND_Y - 18 + d - 1, PAV_GOLD[(x * 4) % 2 ? 2 : 1]);
  }
  const pal = { a: PAV_GOLD[0], b: PAV_GOLD[1], c: PAV_GOLD[3] };
  for (const dx of [-12.5, 12.5]) qdMap(g, PAV_LEAF, pal, c + dx - 0.375, GROUND_Y - 17.25);
}
// The beam: lit along its top, a gold band, and the shadows of a row of dentils under it.
function pavBeam(g, cx) {
  const [Sh, L, B, S, D] = PAV_STONE;
  [Sh, L, B, B, PAV_GOLD[1], PAV_GOLD[3], S, D].forEach((c, k) => pxBox(g, cx - 18, GROUND_Y - 20 + k / 4, 38, 0.25, c));
  for (let x = cx - 17.25; x < cx + 20; x += 1) pxBox(g, x, GROUND_Y - 18.5, 0.25, 0.5, D);
  pxBox(g, cx + 19.75, GROUND_Y - 19.5, 0.25, 1.5, D);
}
// The roof, pixel by pixel: its top rises toward the middle and sweeps up again at the tips; under a lit ridge it is
// rows of scalloped tiles, each lit on its upper left and shaded round its rounded foot, a step darker right of the
// middle, over a dark eave.
function pavRoof(g, c) {
  const R = PAV_ROOF;
  qdPut(g, qdPixels(40, 4.5, (x, y) => {
    const X = c - 20 + x + 0.125;
    const Y = GROUND_Y - 24.5 + y + 0.125;
    const t = Math.abs(X - c) / 20;
    let top = GROUND_Y - 24.5 + 4 * t ** 1.5;
    if (t > 0.88) top -= ((t - 0.88) / 0.12) * 1.5;
    top = Math.round(top * 4) / 4;
    const bottom = t > 0.95 ? top + 1 : GROUND_Y - 20;
    if (Y < top || Y >= bottom) return null;
    const side = X < c - 0.5 ? 0 : 1;
    if (Y - top < 0.25) return R[side ? 2 : 0];
    if (bottom - Y < 0.25) return R[5];
    if (bottom - Y < 0.5) return R[4];
    const v = Y - top - 0.25;
    const row = Math.floor(v);
    const tu = ((X - c) / 1.25 + (row % 2) * 0.5 + 100) % 1;
    const edge = 0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - (2 * tu - 1) ** 2));
    const tv = v - row;
    const k = tv > edge ? 4 : tv > edge - 0.3 ? 3 : tv < 0.3 && tu < 0.5 ? 1 : 2;
    return R[Math.min(5, k + side)];
  }), c - 20, GROUND_Y - 24.5);
  for (const s of [-1, 1]) qdDot(g, c + s * 19.875 - 0.125, GROUND_Y - 22.25, PAV_GOLD[1]);
}
// Rivendell's pavilion. Its middle is a unit right of cx.
function elfPavilion(g, cx) {
  const c = cx + 1;
  pavPillar(g, cx - 16, 1);
  pavPillar(g, cx + 16, 4);
  pavArch(g, cx, c);
  pavBeam(g, cx);
  pavRoof(g, c);
  qdMap(g, PAV_FINIAL, { a: PAV_GOLD[0], b: PAV_GOLD[1], c: PAV_GOLD[2], d: PAV_GOLD[3] }, c - 1, GROUND_Y - 27.25);
}

// The Shire's hill, its profile as before (the wildflowers sit on it): each pixel shaded by how its face turns to the
// light from the upper left, in five steps dithered into each other, with fine blades over it, a lit rim along its
// crest and blades standing up from the crest.
const SHIRE_HILL = ['#3b6c27', '#4b8731', '#5c9c3c', '#7cba50', '#a1c77b'];
function shireHill(g, cx) {
  const ramp = SHIRE_HILL;
  const top = (dx) => Math.round((GROUND_Y + 6 - Math.sqrt(Math.max(0, 576 - dx * dx)) * 0.62) * 4) / 4;
  qdPut(g, qdPixels(48, 15, (x, y, i, j) => {
    const dx = x - 24 + 0.125;
    const Y = GROUND_Y - 9 + y;
    const t = top(dx);
    if (Y < t) return null;
    const [u, v] = [dx / 24, (GROUND_Y + 6 - Y - 0.125) / 14.9];
    const light = Math.max(0, -0.55 * u + 0.62 * v + 0.56 * Math.sqrt(Math.max(0, 1 - u * u - v * v)));
    let k = Math.max(0, Math.min(4, Math.floor(light * 4.4 + 0.2 + (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.47) * 0.9)));
    if (Y - t < 0.25 && dx < 8) k = Math.min(4, k + 1);
    const ci = (cx * 4 + i) >> 2;
    for (const cj of [Math.floor(j / 3), Math.floor(j / 3) + 1]) {
      if (qdHash(ci, cj + 500) > 0.45 || i !== ci * 4 - cx * 4 + Math.floor(qdHash(ci, cj + 501) * 4)) continue;
      const foot = cj * 3 + 2;
      const len = 1 + Math.floor(qdHash(cj, ci + 502) * 2);
      if (j <= foot && j > foot - len && Y - t > 0.5) return ramp[j === foot - len + 1 ? Math.min(4, k + 1) : Math.max(0, k - 1)];
    }
    return ramp[k];
  }), cx - 24, GROUND_Y - 9);
  for (let dx = -23.75; dx < 24; dx += 0.25) {
    if (rnd(dx * 4 + cx) > 0.3) continue;
    pxBox(g, cx + dx, top(dx + 0.125) - 0.25 - (rnd(dx * 9) < 0.4 ? 0.25 : 0), 0.25, 0.5, ramp[dx < 6 ? 3 : 2]);
  }
}

// The timber of the Shire's door, window and fence, and the yellow of the door.
const SHIRE_WOOD = ['#d9a066', '#b07a45', '#8a5a32', '#623e20', '#46290f', '#2e1a0a'];
const SHIRE_DOOR = ['#fff2a8', '#f6d468', '#e6b83c', '#c99a30', '#a27a22', '#6b4f17'];
// A ring of timber at distance d from its middle, between in and out: lit toward the upper left and shaded toward the
// lower right, with joints between its segments and a line of grain along it.
function shireRing(dx, dy, d, i, j, segs) {
  const W = SHIRE_WOOD;
  const lit = -(dx + dy) / (d * 1.414 || 1);
  let k = 2 - Math.round(lit * 1.2 + (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.47) * 0.6);
  if ((((Math.atan2(dy, dx) / (Math.PI * 2)) * segs + 10) % 1) < 0.08) k = 4;
  return W[Math.max(0, Math.min(4, k))];
}
// The round door: a yellow leaf of planks, lit on the upper left, with grain, iron straps and a brass knob in the
// middle, in a ring of timber; under it a dark gap (where its light shows at night) and a stone step.
function shireDoor(g, cx) {
  const [W, Y] = [SHIRE_WOOD, SHIRE_DOOR];
  qdPut(g, qdPixels(10, 10, (x, y, i, j) => {
    const [dx, dy] = [x - 4.875, y - 4.875];
    const d = Math.hypot(dx, dy);
    if (d > 5) return null;
    if (dy > 4 && dy < 4.5 && Math.abs(dx) < 2) return '#24160c';
    const foot = Math.abs(dx) < 2 && dy > 3 && dy < 4;
    if (d > 4.65) return W[dx + dy < -3 ? 4 : 5];
    if (d > 3.65 && !foot) return shireRing(dx, dy, d, i, j, 10);
    if (d > 3.4 && !foot) return W[4];
    const kn = Math.hypot(dx, dy);
    if (kn < 0.7) return kn > 0.5 ? Y[5] : dx + dy < -0.3 ? '#fff6d0' : dx + dy < 0.25 ? '#e9b746' : '#a07a22';
    if (Math.abs(dy + 1.5) < 0.2 && dx < -0.5) return dy < -1.5 ? '#6a5a50' : '#3e3028';
    if (Math.abs(dy - 2) < 0.2 && dx < -0.5) return dy < 2 ? '#6a5a50' : '#3e3028';
    const p = (dx + 3.5) / 1.4;
    const f = p - Math.floor(p);
    let k = f < 0.18 ? 4 : f < 0.36 ? 1 : f > 0.82 ? 3 : 2;
    if (k === 2 && qdHash(i, j >> 2) < 0.14) k = 3;
    if (k < 4) k += dx + dy < -3.5 ? -1 : dx + dy > 2.5 ? 1 : 0;
    return Y[Math.max(0, k)];
  }), cx - 5, GROUND_Y - 4);
  pxBox(g, cx - 4.5, GROUND_Y + 5.5, 9, 0.25, '#d4cdbd');
  pxBox(g, cx - 4.5, GROUND_Y + 5.75, 9, 0.25, '#9a9282');
  pxBox(g, cx + 4.25, GROUND_Y + 5.5, 0.25, 0.5, '#6f685c');
}
// The round window at (cx - 11, GROUND_Y + 1), a pixel at (x, y) of its four-unit box: a timber ring, a cross of
// mullions half a unit wide, and glass that shows the sky by day (pale to the upper left, a streak of light across
// it) or, lit, warm light.
function shireWindowPixel(x, y, i, j, lit) {
  const [dx, dy] = [x - 1.875, y - 1.875];
  const d = Math.hypot(dx, dy);
  if (d > 2) return null;
  if (d > 1.78) return SHIRE_WOOD[5];
  if (d > 1.5) return shireRing(dx, dy, d, i, j, 6);
  if (Math.abs(dx) < 0.25 || Math.abs(dy) < 0.25) return SHIRE_WOOD[Math.abs(dx) < 0.25 ? (dx < 0 ? 1 : 3) : dy < 0 ? 1 : 3];
  const s = -(dx + dy);
  if (lit) return s > 1 ? '#fff3c4' : s > -0.8 ? '#ffd36b' : '#f0a848';
  if (Math.abs(dx - dy + 0.4) < 0.2) return '#e2f2fb';
  return s > 1.1 ? '#b9d6ea' : s > 0.2 ? '#7f9fbc' : s > -0.9 ? '#4d6a88' : '#34465c';
}
function shireWindow(g, cx, lit) {
  qdPut(g, qdPixels(4, 4, (x, y, i, j) => shireWindowPixel(x, y, i, j, lit)), cx - 13, GROUND_Y - 1);
}
// The window's glass as runs [x, y, w, h, bright] in quarter-unit rows (bright toward the upper left), for the light
// scenery-lights.js adds onto it at night.
const shirePaneRuns = new Map();
function shirePanes(cx) {
  if (!shirePaneRuns.has(cx)) {
    const runs = [];
    for (let j = 0; j < 16; j += 1) {
      for (let i = 0; i < 16; i += 1) {
        const [dx, dy] = [i / 4 - 1.875, j / 4 - 1.875];
        if (Math.hypot(dx, dy) > 1.5 || Math.abs(dx) < 0.25 || Math.abs(dy) < 0.25) continue;
        const bright = -(dx + dy) > 1;
        const last = runs[runs.length - 1];
        if (last && last[1] === GROUND_Y - 1 + j / 4 && last[0] + last[2] === cx - 13 + i / 4 && last[4] === bright) last[2] += 0.25;
        else runs.push([cx - 13 + i / 4, GROUND_Y - 1 + j / 4, 0.25, 0.25, bright]);
      }
    }
    shirePaneRuns.set(cx, runs);
  }
  return shirePaneRuns.get(cx);
}

// The chimney: a stack of small stones (its foot goes into the hill, drawn over it) under a cap slab a little wider.
const CHIMNEY_STONE = ['#d8d3cb', '#b9b4ac', '#9a958e', '#7a7670', '#5a5753', '#3a3734'];
function shireChimney(g, cx) {
  const C = CHIMNEY_STONE;
  qdBlocks(g, cx + 9.25, GROUND_Y - 12.25, 2.5, 6, 1, [C[1], [C[2], C[3], hdMix(C[2], C[3], 0.5)], C[4], C[5]], cx, 0.75, 1.5);
  [C[5], C[0], C[2], C[4]].forEach((c, k) => pxBox(g, cx + 9, GROUND_Y - 13 + k / 4, 3, 0.25, c));
  pxBox(g, cx + 9.25, GROUND_Y - 12, 2.5, 0.25, '#2f2b29');
}
// The smoke: puffs that rise, sway, swell, thin and drift downwind, each a cloud of three lobes (one while it is small)
// lit on its upper left and shaded below, its lobes' shade, body and light laid in that order so they run together. Each
// size of puff is painted once, by day and by night, and drawn thinner as it rises.
const shirePuffs = new Map();
function shirePuff(rad, night) {
  const key = `${rad},${night}`;
  if (!shirePuffs.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil((rad * 2 + 1) * SC_RES);
    const p = cv.getContext('2d');
    p.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
    const lobes = rad > 1 ? [[-0.55, 0.3, 0.7], [0.6, 0.25, 0.65], [0, -0.2, 1]] : [[0, 0, 1]];
    (night ? ['#3e4256', '#555a70', '#70768e'] : ['#b8bccb', '#e2e4ea', '#ffffff']).forEach((c, n) => {
      for (const [ox, oy, f] of lobes) {
        const r = Math.round((rad * f - n * 0.25) * 4) / 4;
        if (r > 0) qdOval(p, Math.round((rad + 0.5 + ox * rad - n * 0.25) * 4) / 4, Math.round((rad + 0.5 + oy * rad - n * 0.25) * 4) / 4, r, r, c);
      }
    });
    shirePuffs.set(key, cv);
  }
  return shirePuffs.get(key);
}
function shireSmoke(g, cx, tick, sky) {
  const lean = landWind()?.at(cx + 10, tick) ?? 0;
  for (let k = 0; k < 7; k += 1) {
    const phase = (tick + k * 5.14) % 36;
    const rad = Math.round((0.6 + phase / 22) * 4) / 4;
    const x = Math.round((cx + 10.5 + Math.sin((phase + k) / 5) * 1.2 + lean * phase * 0.22) * 4) / 4;
    const y = Math.round((GROUND_Y - 13.75 - phase * 0.9) * 4) / 4;
    const cv = shirePuff(rad, Boolean(sky.night));
    g.globalAlpha = Math.max(0, Math.min(1, 1.15 - phase / 32));
    g.drawImage(cv, x - rad - 0.5, y - rad - 0.5, cv.width / SC_RES, cv.height / SC_RES);
  }
  g.globalAlpha = 1;
}

// The fence along the back of the Shire's vegetable patch (shirePatch, scenery-farm.js), its posts' feet on the patch's
// back edge (2026-11-27: it stood on its own off the patch's corner and read as floating): two rails lit along their
// tops with grain, and posts lit on their left with a rounded cap, a knot and a shadow at the foot.
function shireFence(g, r) {
  const patch = shirePatch(r);
  if (!patch) return;
  const [x0, top, x1, foot] = patch.fence;
  const [Sh, L, B, S, D] = qdRamp(PX.wood);
  for (const y of [top + 1, top + 3]) {
    [L, B, B, D].forEach((c, k) => pxBox(g, x0, y + k / 4, x1 - x0, 0.25, c));
    for (let x = x0; x < x1; x += 0.25) if (rnd(x * 4 + y) < 0.14) qdDot(g, x, y + (rnd(x * 3) < 0.5 ? 0.25 : 0.5), S);
  }
  const n = Math.max(2, Math.round((x1 - x0 - 1) / 4));
  for (let i = 0; i <= n; i += 1) {
    const x = Math.round((x0 + ((x1 - x0 - 1) * i) / n) * 4) / 4;
    [L, B, S, D].forEach((c, k) => pxBox(g, x + k / 4, top, 0.25, foot - top, c));
    pxBox(g, x + 0.25, top - 0.25, 0.5, 0.25, L);
    qdDot(g, x + 0.25, top, Sh);
    qdDot(g, x + 0.5, top + 2.25, D);
    pxBox(g, x + 1, foot - 0.25, 1, 0.25, landSteps('hobbit')[0]);
  }
}
