// scenery-sky.js: the sky of the Middle-earth view (scene.js), in 32-bit, a quarter unit to the pixel. The sky's colours
// by the scene's hour (scenery.js's skyAt) run down a smooth gradient, each row dithered finely between two of many
// close steps; stars twinkle at night in several steps, the big ones flashing out their arms; a crescent moon shows
// craters, a bright limb and its dark side faintly; the sun has a soft corona and reddens low in the sky; clouds drift
// with soft lit edges, shaded bellies and creases between their puffs, tinted by the hour. The red sky of a red main
// carries ash clouds lit from below, and the sky above the scene is dithered the same way. The clouds' painter and the
// mountains are scenery-sky-qd.js's. What does not move is painted once into layers (skLayer) and reused until the hour
// or the layout changes. Also the drawing helpers the land, the falls and others use. Loaded after scenery.js.

// A pixel of the 16-bit grid (half a unit square); skQd one of the 32-bit grid, a quarter unit (scene.js's SC_RES).
const skDot = (g, x, y, c) => pxBox(g, x, y, 0.5, 0.5, c);
const skQd = (g, x, y, c) => pxBox(g, x, y, 0.25, 0.25, c);

// Layers painted once and reused while their key holds, by name; the oldest is dropped when a resize has named many.
const skLayers = new Map();
function skLayer(name, key, w, h, paint) {
  const old = skLayers.get(name);
  if (old?.key === key) return old.cv;
  const cv = old?.cv ?? document.createElement('canvas');
  cv.width = Math.ceil(w * SC_RES);
  cv.height = Math.ceil(h * SC_RES);
  const lg = cv.getContext('2d');
  lg.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
  lg.imageSmoothingEnabled = false;
  paint(lg, cv);
  skLayers.delete(name);
  skLayers.set(name, { key, cv });
  if (skLayers.size > 40) skLayers.delete(skLayers.keys().next().value);
  return cv;
}

// The 4 by 4 ordered-dither thresholds (0 to 15), and the 8 by 8 ones (0 to 63) for the finer 32-bit gradients.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER8 = Array.from({ length: 64 }, (_, i) => 16 * [0, 2, 3, 1][((i >> 3) & 1) * 2 + (i & 1)] + BAYER[((i >> 4) & 3) * 4 + ((i >> 1) & 3)]);
// A colour packed for a Uint32Array over ImageData (little-endian: alpha, blue, green, red), alpha 0 to 1.
const skPack = (h, a = 1) => { const [r, g, b] = rgbOf(h); return ((Math.round(a * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0; };
// A layer's pixels to paint by hand: the image, its pixels as packed colours, and how to put it back.
function skPixels(cv) {
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  return { w: cv.width, h: cv.height, px: new Uint32Array(img.data.buffer), done: () => ctx.putImageData(img, 0, 0) };
}

// Fills a layer with a vertical gradient through colors (top to bottom, evenly spaced) in steps flat colours, each row
// dithered between its two nearest steps on the 8 by 8 grid, so it reads smooth with no colour but the steps. An ease
// above 1 holds the top colour longer and gathers the last steps near the bottom, as a glow on the horizon does.
function skDither(cv, colors, steps, ease = 1) {
  const P = skPixels(cv);
  const at = (t) => { const s = t * (colors.length - 1); const i = Math.min(colors.length - 2, Math.floor(s)); return blend(colors[i], colors[i + 1], s - i); };
  const ramp = [...Array(steps)].map((_, i) => skPack(at(i / (steps - 1))));
  for (let y = 0; y < P.h; y += 1) {
    const s = (y / Math.max(1, P.h - 1)) ** ease * (steps - 1);
    const lo = Math.min(steps - 2, Math.floor(s));
    const f = (s - lo) * 64;
    const [a, b, row] = [ramp[lo], ramp[lo + 1], (y & 7) * 8];
    for (let x = 0; x < P.w; x += 1) P.px[y * P.w + x] = f > BAYER8[row + (x & 7)] + 0.5 ? b : a;
  }
  P.done();
}

// An oval of radii rx by ry about (cx, cy) in rows px units tall (half units unless asked), nothing drawn from row maxY
// down; skDisc a round one, skQDisc a round one in quarter-unit rows.
function skOval(g, cx, cy, rx, ry, c, maxY = Infinity, px = 0.5) {
  for (let y = -Math.ceil(ry / px) * px; y < ry && cy + y < maxY; y += px) {
    const hw = Math.round((rx * Math.sqrt(Math.max(0, 1 - ((y + px / 2) / ry) ** 2))) / px) * px;
    if (hw > 0) pxBox(g, cx - hw, cy + y, hw * 2, px, c);
  }
}
const skDisc = (g, cx, cy, r, c, maxY) => skOval(g, cx, cy, r, r, c, maxY);
const skQDisc = (g, cx, cy, r, c) => skOval(g, cx, cy, r, r, c, Infinity, 0.25);

// A soft glow of color about (x, y): three ovals rx by ry and smaller, fainter outward, stronger by strength.
function skGlow(g, x, y, rx, ry, color, strength) {
  [[1, 0.06], [0.72, 0.08], [0.45, 0.1]].forEach(([k, a]) => { g.globalAlpha = a * strength; skOval(g, x, y, rx * k, ry * k, color); });
  g.globalAlpha = 1;
}

// A tongue of flame w units wide on a base at (x, y), h units tall, tapering to a point: its edge in color and its
// inside the next colour warmer, so a red tongue has an orange heart and a yellow one a pale core.
const FLAME_IN = { [PX.red]: PX.ember, [PX.ember]: PX.emberL, [PX.emberL]: '#fff3c4' };
function fireTongue(g, x, y, w, h, color) {
  for (let k = 0; k < h * 2; k += 1) {
    const ww = Math.max(0.5, Math.round((1 - k / (h * 2)) * w * 2) / 2);
    const left = x + Math.round(w - ww) / 2;
    pxBox(g, left, y - 0.5 - k / 2, ww, 0.5, color);
    if (ww > 1) pxBox(g, left + 0.5, y - 0.5 - k / 2, ww - 1, 0.5, FLAME_IN[color] ?? color);
  }
}

// How much daylight the scene's hour has: 0 at night, 1 by day, ramping through dawn and dusk.
const skLight = (hour) => Math.max(0, Math.min(1, hour < 12 ? (hour - 5) / 2.5 : (20 - hour) / 2.5));

// Stars over rows, placed by fixed seeds on the quarter-unit grid, tinted a little blue, warm or cold. Six in ten are a
// faint pixel leaning toward the sky (top); three a bright one in a soft cross that brightens as it twinkles; one a large star
// whose arms flash out to three pixels. Each twinkles once every 40 ticks, swelling and fading over eight in steps.
const SK_STAR = ['#e9ecff', '#e9ecff', '#fff0d2', '#d4e0ff'];
const SK_SWELL = [1, 2, 3, 4, 4, 3, 2, 1];
function skStars(g, n, W, rows, sx, sy, tick, top) {
  for (let i = 0; i < n; i += 1) {
    const x = Math.floor(rnd(i + sx) * W * 4) / 4;
    const y = Math.floor(rnd(i + sy) * rows * 4) / 4;
    const k = rnd(i + sx + 211);
    const t = (tick + i * 7) % 40;
    const tw = t < 8 ? SK_SWELL[t] : 0;
    const tint = SK_STAR[i % 4];
    if (k > 0.9) {
      const arm = 0.25 * (1 + (tw > 1) + (tw > 3));
      for (let a = 0.25; a <= arm; a += 0.25) {
        const c = blend(tint, top, 0.2 + a);
        for (const [dx, dy] of [[-a, 0], [a, 0], [0, -a], [0, a]]) skQd(g, x + dx, y + dy, c);
      }
      if (tw > 2) for (const [dx, dy] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) skQd(g, x + dx, y + dy, blend(tint, top, 0.6));
      skQd(g, x, y, '#ffffff');
    } else if (k > 0.6) {
      for (const [dx, dy] of [[-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]]) skQd(g, x + dx, y + dy, blend(tint, top, 0.78 - tw * 0.1));
      skQd(g, x, y, tw > 2 ? '#ffffff' : tint);
    } else skQd(g, x, y, blend(tint, top, Math.max(0.05, 0.25 + k * 0.5 - tw * 0.12)));
  }
}

// Paints a round body into a layer s units square centred on it, pixel by pixel: shade(u, v, d) gives the colour and
// alpha of the pixel at (u, v) units from the centre, d from it, or null for none.
function skBody(cv, s, shade) {
  const P = skPixels(cv);
  for (let j = 0; j < P.h; j += 1) {
    for (let i = 0; i < P.w; i += 1) {
      const [u, v] = [(i + 0.5) / SC_RES - s / 2, (j + 0.5) / SC_RES - s / 2];
      const c = shade(u, v, Math.hypot(u, v), BAYER8[(j & 7) * 8 + (i & 7)] / 64);
      if (c) P.px[j * P.w + i] = c;
    }
  }
  P.done();
}
// A soft ring of light from radius r0 to r1, strongest a at r0, falling away in dithered steps of an eighth.
const skHalo = (d, r0, r1, a, b) => Math.floor(Math.max(0, 1 - (d - r0) / (r1 - r0)) ** 2 * a * 24 + b) / 24;

// The moon, its box's top-left at (x, y) as before: a halo, the whole disc faintly lit by the earth with its seas just
// showing, and a crescent lit on its left with a bright limb, seas and craters (each shaded on the side away from the
// light, lit on the side toward it), and a soft edge along the terminator.
const SK_CRATERS = [[-3, -1.25, 0.6], [-2.25, 1.75, 0.5], [-3.25, 1, 0.3], [-1.25, 3, 0.45], [-2, -2.75, 0.4]];
function skMoon(g, x, y, sky) {
  const [cx, cy] = [Math.round((x + 3) * 4) / 4, y + 4];
  g.drawImage(skLayer('moon', sky.top, 20, 20, (lg, cv) => skBody(cv, 20, (u, v, d, b) => skMoonAt(u, v, d, b, sky.top))), cx - 10, cy - 10, 20, 20);
}
function skMoonAt(u, v, d, b, top) {
  if (d >= 4) { const a = skHalo(d, 4, 9.5, 0.26, b); return a > 0 ? skPack('#f2f0dc', a) : null; }
  const sea = Math.sin(u * 1.7 + 0.6) * Math.cos(v * 1.3 - 0.4) + Math.sin(u * 3.1 - v * 2.3) * 0.4 > 0.45;
  const bite = Math.hypot(u - 1.5, v + 0.75) - 3.75;
  if (bite < 0 || (u >= 1.5 && v < 2.9)) return skPack(blend(top, '#c9c6b0', sea ? 0.17 : 0.24 + (d > 3.75 ? 0.04 : 0)));
  let k = d > 3.7 ? 0 : d > 3.2 && u < -1 ? 1 : 2;
  if (sea) k += 1;
  for (const [x, y, r] of SK_CRATERS) {
    const e = Math.hypot(u - x, v - y);
    if (e < r) k = u < x ? 4 : 1;
    else if (e < r + 0.25 && u > x) k = Math.min(k, 1);
  }
  if (bite < 0.3 + b * 0.4) k = Math.max(k, 3);
  return skPack(['#fffbea', '#f8f4df', '#ebe7cf', '#d8d3b9', '#c3bea3'][Math.min(4, k)]);
}

// The sun, its box's top-left at (x, y) as before: a soft corona in the light of the horizon, faintly rayed, then a
// disc with a deeper rim, darkening toward its limb from a pale core up and to the left, turning orange as it sinks
// toward dawn or dusk.
function skSun(g, x, y, sky) {
  const [cx, cy] = [x + 4, y + 3];
  const low = Math.max(0, Math.min(1, (Math.abs(sky.hour - 12.5) - 3.5) / 2.5));
  const body = blend('#ffe58a', '#ffa55a', low);
  const glow = blend('#fff2b0', sky.low, 0.35);
  const ramp = [blend(body, '#ffffff', 0.75), blend(body, '#ffffff', 0.45), body, blend(body, '#e0902a', 0.22), blend(body, '#e0702a', 0.34)].map((c) => skPack(c));
  const cv = skLayer('sun', `${body}${glow}`, 26, 26, (lg, c) => skBody(c, 26, (u, v, d, b) => {
    if (d >= 4.5) {
      const a = skHalo(d, 4.5, 12.5, 0.4 * (1 + 0.18 * Math.cos(Math.atan2(v, u) * 8)), b);
      return a > 0 ? skPack(blend(glow, '#ffffff', Math.max(0, 0.4 - (d - 4.5) / 8)), a) : null;
    }
    if (d >= 4) return ramp[4];
    return ramp[Math.min(3, Math.floor(Math.hypot(u + 0.75, v + 0.75) / 1.45 + b * 0.6))];
  }));
  g.drawImage(cv, cx - 13, cy - 13, 26, 26);
}

function drawSky(g, W, sky, tick) {
  g.drawImage(skLayer('sky', `${W}${sky.top}${sky.low}`, W, GROUND_Y, (lg, cv) => skDither(cv, [sky.top, sky.low], 24, 1.4)), 0, 0, W, GROUND_Y);
  if (sky.night) {
    skStars(g, 90, W, 70, 0, 99, tick, sky.top);
    skMoon(g, Math.floor((W * 0.12 + ((sky.hour + 6) % 24) * 4) * 4) / 4, 13, sky);
  } else skSun(g, Math.floor(((sky.hour - 6) / 13.5) * W * 4) / 4, Math.floor((10 + Math.abs(sky.hour - 12.5) * 4) * 4) / 4, sky);
  const pal = skCloudPal(sky);
  for (let c = 0; c < 4; c += 1) {
    const x = ((rnd(c + 5) * W + tick * (0.08 + c * 0.03)) % (W + 40)) - 30;
    skCloud(g, Math.round(x * 4) / 4, 18 + c * 11, (c * 2) % 5, pal);
  }
}

// At night scene.js's shade starts hard at GROUND_Y - 62; the rows above darken toward it over the sky, the red sky and
// the tower, so its edge shows no line across them. drawBackdrop calls it before the mountains.
function skNightEdge(g, W, sky) {
  if (!sky.night) return;
  for (let y = GROUND_Y - 76; y < GROUND_Y - 62; y += 0.25) {
    g.globalAlpha = (0.38 * (y + 0.125 - GROUND_Y + 76)) / 14;
    pxBox(g, 0, y, W, 0.25, '#0a0d24');
  }
  g.globalAlpha = 1;
}

// The red sky of a red main, over the day or night sky and behind the mountains: a deep red gradient, and ash clouds
// drifting east over it, dark on top and lit orange from below by the fires.
function drawWarSky(g, W, war, tick = 0) {
  g.globalAlpha = 0.55 * war;
  g.drawImage(skLayer('war', `${W}`, W, GROUND_Y, (lg, cv) => skDither(cv, ['#3a0a10', '#d8431f'], 20, 1.2)), 0, 0, W, GROUND_Y);
  g.globalAlpha = 0.8 * war;
  for (let c = 0; c < 6; c += 1) {
    const x = ((rnd(c + 70) * W + tick * (0.14 + c * 0.03)) % (W + 40)) - 20;
    skCloud(g, Math.round(x * 4) / 4, 12 + c * 8 + Math.floor(rnd(c + 80) * 6), c % 2, SK_ASH_PAL, true);
  }
  g.globalAlpha = 1;
}

// The sky above the scene when the view is taller than it (scene.dy rows, scene.js). Its colour comes from the scene's
// own top row (the commonest of a few samples, so a star or cloud there doesn't set it), which carries the red of a war
// sky and the weather's too, and deepens toward the zenith in fine dithered steps; stars at night, a couple of clouds by
// day. Reading the canvas back is slow, so the row is sampled again only every three seconds or when the size, the sky
// or the war changes.
const skAbove = { key: '', base: '' };
function drawSkyAbove(g, scene, tick) {
  const { W, dy, sky } = scene;
  if (dy <= 0) return;
  const key = `${W},${dy},${sky.top},${scene.war}`;
  if (key !== skAbove.key || tick % 30 === 0) {
    const row = g.getImageData(0, dy * SC_RES, W * SC_RES, 1).data;
    const seen = {};
    for (const x of [2, W >> 2, W >> 1, (3 * W) >> 2, W - 3]) {
      const c = hexOf([...row.slice(x * SC_RES * 4, x * SC_RES * 4 + 3)]);
      seen[c] = (seen[c] ?? 0) + 1;
    }
    Object.assign(skAbove, { key, base: Object.entries(seen).sort((a, b) => b[1] - a[1])[0][0] });
  }
  const { base } = skAbove;
  g.drawImage(skLayer('above', `${W},${dy},${base}`, W, dy, (lg, cv) => skDither(cv, [blend(base, '#000000', 0.22), base], 16)), 0, 0, W, dy);
  if (sky.night) return skStars(g, Math.floor(W / 4), W, dy, 300, 700, tick, base);
  if (scene.war) return;
  g.save();
  g.beginPath();
  g.rect(0, 0, W, dy);
  g.clip();
  const pal = skCloudPal(sky);
  for (let c = 0; c < 2; c += 1) {
    const x = ((rnd(c + 40) * W + tick * (0.05 + c * 0.03)) % (W + 40)) - 30;
    skCloud(g, Math.round(x * 4) / 4, Math.floor(dy * (0.3 + c * 0.35)), [3, 1][c], pal);
  }
  g.restore();
}
