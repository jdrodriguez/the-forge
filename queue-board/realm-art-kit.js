// realm-art-kit.js: the shared pieces of the Machines cards' pixel dioramas (realm-art.js), drawn at 32-bit, a quarter
// unit to the pixel, as the Middle-earth view is: a sky that deepens toward the top in fine dithered steps, puffed
// clouds by day and stars and a crescent moon by night, two ranges of far hills (the further one paler in the haze)
// with crests lit where they face the light, ground with tufts and pebbles, round discs and dithered halos, the elven
// trees, and artShape, which shades any shape from a ramp of its own colour. Only called while a band paints, so it may
// load before or after realm-art.js. Uses sprites-hd.js's hdMix, HD_DARK and HD_LIGHT.

// The 4 by 4 ordered-dither thresholds.
const ART_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const artDither = (px, py) => ART_BAYER[(py & 3) * 4 + (px & 3)] / 16;
// A material's ramp from its base colour and its shade: outline, deep, shade, base, light and highlight, the shades
// cooling toward blue and the lights warming toward cream, the lights fainter at night.
function artRamp(base, shade, night) {
  const k = night ? 0.55 : 1;
  return [hdMix(shade, HD_DARK, 0.55), hdMix(hdMix(shade, '#1d2148', 0.25), HD_DARK, 0.2), shade, base, hdMix(base, '#fff2cf', 0.2 * k), hdMix(base, '#fff2cf', 0.42 * k)];
}

// Paints every quarter-unit pixel of a shape inside the box [x, y, w, h] from a ramp (its first step the outline and
// its last the lit rim, those between the body from dark to light). inside(x, y) is asked of each pixel's middle. A
// pixel with open air below it or to its right is outline, one with open air above it or to its left the lit rim; the
// rest take a step by how far up and left of the middle (cx, cy) they sit, over spreads rx and ry, plus tex(x, y) for a
// grain of its own, dithered with the ordered pattern only where two steps meet. Anything at or below floor counts as
// solid, so a shape standing on the ground has no outline along its foot. A row's run of one colour is one rectangle.
function artShape(g, [x0, y0, w, h], inside, ramp, o = {}) {
  const { cx = x0 + w / 2, cy = y0 + h / 2, rx = w / 2, ry = h / 2, tex, floor = 99, rim = true } = o;
  const solid = (x, y) => y >= floor || inside(x, y);
  const top = ramp.length - 1;
  for (let r = 0; r < h * 4; r += 1) {
    const y = y0 + r / 4 + 0.125;
    let run = null;
    const flush = () => { if (run) { g.fillStyle = run.c; g.fillRect(run.x, y - 0.125, run.w, 0.25); } run = null; };
    for (let c = 0; c < w * 4; c += 1) {
      const x = x0 + c / 4 + 0.125;
      if (!inside(x, y)) { flush(); continue; }
      let i = 0;
      if (solid(x + 0.25, y) && solid(x, y + 0.25)) {
        if (rim && (!solid(x - 0.25, y) || !solid(x, y - 0.25))) i = top;
        else {
          const t = 0.5 - ((x - cx) / rx) * 0.45 - ((y - cy) / ry) * 0.35 + (tex ? tex(x, y) : 0);
          const n = top - 1;
          i = 1 + Math.max(0, Math.min(n - 1, Math.floor(t * n * 0.95 + (artDither(Math.round(x * 4), Math.round(y * 4)) - 0.47) * 0.6)));
        }
      }
      if (run && run.c === ramp[i]) run.w += 0.25;
      else { flush(); run = { x: x - 0.125, w: 0.25, c: ramp[i] }; }
    }
    flush();
  }
}

// The sky down to the bottom of the band through the four colours of ART_SKY, every pixel row a blend of two of ten
// steps by the ordered pattern, so it deepens smoothly; laid straight into the canvas's pixels.
function artSkyFill(g, stops) {
  const { width: w, height: h } = g.canvas;
  const steps = [...Array(10)].map((_, i) => { const s = (i / 9) * 3; const k = Math.min(2, Math.floor(s)); return hdRgb(hdMix(stops[k], stops[k + 1], s - k)); });
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    const s = Math.min(1, y / (ART_GROUND * 4)) * 9;
    const lo = Math.min(8, Math.floor(s));
    for (let x = 0; x < w; x += 1) img.data.set([...steps[s - lo > artDither(x, y) ? lo + 1 : lo], 255], (y * w + x) * 4);
  }
  g.putImageData(img, 0, 0);
}
// A cloud: a few round puffs on a flat foot, lit white on top and shading to blue-grey underneath.
function artCloud(g, x, y, k) {
  const puffs = [[1.5, 2.2, 1.6], [4, 1.2, 2.3], [7, 1.6, 2], [9.3, 2.4, 1.4]].map(([px, py, r]) => [x + px * k, y + py, r * Math.min(1, k + 0.15)]);
  const inside = (px, py) => py < y + 3.4 && puffs.some(([cx, cy, r]) => (px - cx) ** 2 + (py - cy) ** 2 < r * r);
  artShape(g, [x - 1, y - 1.5, 12 * k + 2, 5], inside, ['#b4c3d8', '#c6d3e3', '#d9e2ee', '#edf2f8', '#ffffff', '#ffffff'], { cx: x + 3, cy: y + 1, rx: 6, ry: 2.4 });
}
// The sky: by day two clouds; by night stars, the brighter ones with a cross of fainter light, kept above the lettered
// name on the left so none sits between its letters, and a crescent moon.
function artSky(g, W, night, seed) {
  artSkyFill(g, night ? ART_SKY.night : ART_SKY.day);
  if (!night) {
    for (const f of [0.34, 0.62]) artCloud(g, Math.floor(W * f + artRnd(seed + f) * 8), 2.5 + Math.floor(artRnd(seed + f * 7) * 5), f < 0.5 ? 1 : 0.8);
    return;
  }
  for (let i = 0; i < W / 4; i += 1) {
    const x = Math.floor(artRnd(seed + i) * W * 4) / 4;
    const y = Math.floor(artRnd(seed + i + 99) * (x < W * 0.62 ? 9 : 17) * 4) / 4 + 0.5;
    if (i % 5) { artBox(g, x, y, 0.25, 0.25, ['#aeb6e0', '#7f87b8', '#c9d0f0', '#8d96c8'][i % 4]); continue; }
    for (const [dx, dy] of [[-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]]) artBox(g, x + dx, y + dy, 0.25, 0.25, '#6d76aa');
    for (const [dx, dy] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) artBox(g, x + dx, y + dy, 0.25, 0.25, '#3d4578');
    artBox(g, x, y, 0.25, 0.25, '#fff7dc');
  }
  const [mx, my] = [Math.floor(W * 0.5 + artRnd(seed + 3) * 10), 3.5];
  artHalo(g, mx, my, 3.2, '#2c3466');
  artShape(g, [mx - 1.5, my - 1.5, 4, 4], (x, y) => artInDisc(mx, my, 1.4)(x, y) && !artInDisc(mx + 0.8, my - 0.5, 1.2)(x, y), ['#b9b38f', '#cfc8a4', '#e4ddb8', '#f4eed0', '#fffbe6', '#fffbe6'], { cx: mx, cy: my, rx: 2, ry: 2 });
}

// Rolling far hills along the horizon, each quarter column its own height: lit along the crest and a little below it
// where the slope faces the upper left, shaded down the slopes that fall away, each dithered into the body. A further
// range behind, paler with the haze, first.
function artHills(g, W, amp, color, seed) {
  const dark = hdRgb(color).reduce((a, b) => a + b) < 300;
  artRange(g, W, amp * 1.35, hdMix(color, dark ? '#3c437c' : '#dfe6f0', 0.35), seed + 50, 2.4);
  artRange(g, W, amp, color, seed, 0);
}
function artRange(g, W, amp, color, seed, phase) {
  const raw = (x) => amp * (0.55 + 0.45 * Math.sin(x / 7 + seed + phase)) + amp * 0.3 * Math.sin(x / 3.1 + seed * 2 + phase * 2);
  const [crest, lit, dim] = [hdMix(color, HD_LIGHT, 0.22), hdMix(color, HD_LIGHT, 0.1), hdMix(color, HD_DARK, 0.13)];
  for (let c = 0; c < W * 4; c += 1) {
    const x = c / 4 + 0.125;
    const h = Math.round(raw(x) * 4) / 4;
    const slope = (raw(x + 0.2) - raw(x - 0.2)) / 0.4;
    artBox(g, x - 0.125, ART_GROUND - h, 0.25, h, color);
    const depth = Math.round(Math.min(1, Math.abs(slope) * 1.6) * 7);
    const shade = slope >= 0 ? lit : dim;
    if (slope >= 0) artBox(g, x - 0.125, ART_GROUND - h, 0.25, 0.25, crest);
    for (let k = slope >= 0 ? 1 : 0; k < depth; k += 1) if (artDither(c, k) < 1 - k / depth) artBox(g, x - 0.125, ART_GROUND - h + k / 4, 0.25, 0.25, shade);
  }
}

// The ground: a lit lip along its top, tufts of grass of three blades in the darker colour with a lit blade, pebbles lit
// on top, and a darker dithered band along the bottom.
const ART_TUFT = ['.l...', '.l.d.', 'dld.d', 'd.dd.'];
function artGround(g, W, color, dot, seed) {
  artBox(g, 0, ART_GROUND, W, ART_H - ART_GROUND, color);
  artBox(g, 0, ART_GROUND, W, 0.25, hdMix(color, HD_LIGHT, 0.24));
  artBox(g, 0, ART_GROUND + 0.25, W, 0.25, hdMix(color, HD_LIGHT, 0.1));
  for (let c = 0; c < W * 4; c += 1) for (let k = 0; k < 4; k += 1) if (artDither(c, k) < (k + 1) / 5) artBox(g, c / 4, ART_H - 1 + k / 4, 0.25, 0.25, dot);
  const pal = { l: hdMix(color, HD_LIGHT, 0.22), d: dot };
  for (let i = 0; i < W / 3; i += 1) {
    const x = Math.floor(artRnd(seed + i) * W * 4) / 4;
    const y = ART_GROUND + 0.75 + Math.floor(artRnd(seed + i + 7) * 12) / 4;
    if (i % 4 === 3) { artBox(g, x, y + 0.75, 0.5, 0.25, dot); artBox(g, x, y + 0.5, 0.5, 0.25, hdMix(color, HD_LIGHT, 0.3)); continue; }
    hdMap(g, ART_TUFT, pal, x, y, 0.25);
  }
}

// A filled disc about the middle of column cx and row cy, r and a half unit across from it, in quarter-unit rows.
function artDisc(g, cx, cy, r, color) {
  const R = r + 0.5;
  for (let k = -Math.ceil(R * 4); k < Math.ceil(R * 4); k += 1) {
    const dy = (k + 0.5) / 4;
    const half = Math.abs(dy) < R ? Math.round(Math.sqrt(R * R - dy * dy) * 4) / 4 : 0;
    if (half > 0) artBox(g, cx + 0.5 - half, cy + 0.5 + k / 4, half * 2, 0.25, color);
  }
}
// Light spilling from a lamp or a fire: a disc of colour (squashed to an oval, and kept below row from, for a pool on
// the ground) that thins out toward its edge through the ordered pattern, so it fades without a see-through tint.
function artHalo(g, cx, cy, r, color, squash = 1, from = -99) {
  for (let y = Math.max(from, cy + 0.5 - r * squash); y < cy + 0.5 + r * squash; y += 0.25) {
    for (let x = cx + 0.5 - r; x < cx + 0.5 + r; x += 0.25) {
      const d = Math.hypot(x + 0.125 - cx - 0.5, (y + 0.125 - cy - 0.5) / squash) / r;
      if (d < 1 && artDither(Math.round(x * 4), Math.round(y * 4)) < (1 - d) * 1.7) artBox(g, x, y, 0.25, 0.25, color);
    }
  }
}
// A lamp's light: a wide faint halo and a smaller brighter one inside it, both mixed from the colour behind and the
// lamp's.
function artLamp(g, cx, cy, r, behind, lamp, squash, from) {
  artHalo(g, cx, cy, r, hdMix(behind, lamp, 0.22), squash, from);
  artHalo(g, cx, cy, r * 0.6, hdMix(behind, lamp, 0.45), squash, from);
}
// Is (x, y) inside that disc? For shading a round thing with artShape.
const artInDisc = (cx, cy, r) => (x, y) => (x - cx - 0.5) ** 2 + (y - cy - 0.5) ** 2 < (r + 0.5) ** 2;

// A cluster of leaves about (cx, cy), round with a leafy edge that juts and dips, lit on its upper left.
function artCluster(g, cx, cy, r, ramp, seed) {
  const edge = (x, y) => r + (artRnd(Math.floor((Math.atan2(y - cy - 0.5, x - cx - 0.5) + 4) * 4) + seed * 7) - 0.5) * 0.7;
  artShape(g, [cx - r, cy - r, r * 2 + 1.5, r * 2 + 1.5], (x, y) => Math.hypot(x - cx - 0.5, y - cy - 0.5) < edge(x, y), ramp,
    { cx: cx, cy: cy, rx: r * 1.6, ry: r * 1.6, tex: (px, py) => (artRnd(Math.floor(px * 4) * 13 + Math.floor(py * 4) * 7 + seed) - 0.5) * 0.22 });
}
// An elven tree: a pale trunk flaring at its foot with streaks and knots in the bark and two boughs into the crown,
// under a canopy of leaf clusters, each round and lit on its upper left, the back ones darker, with a few leaves gone
// gold.
function artTree(g, x, top, h, night) {
  const foot = top + h - 9;
  const bark = night ? artRamp('#8b8270', '#6b6455', true) : artRamp('#b0a48a', '#857a66');
  const trunk = (px, py) => px > x - (py > ART_GROUND - 1 ? 0.5 : 0) && px < x + 2 + (py > ART_GROUND - 1 ? 0.5 : 0);
  artShape(g, [x - 0.5, foot, 3, ART_GROUND - foot], trunk, bark,
    { floor: ART_GROUND, cx: x + 0.5, rx: 1.5, ry: 40, tex: (px, py) => (Math.floor(px * 4) % 3 === 1 ? -0.25 : 0) + (artRnd(Math.floor(px * 4) * 5 + Math.floor(py * 2) + x) > 0.9 ? -0.5 : 0) });
  const rows = [2, 4, 6, 7, 7, 7, 6, 5, 3].slice(0, Math.max(5, Math.round(h / 1.4)));
  const leaves = night ? artRamp('#2f6b55', '#22513f', true) : artRamp('#4f9a74', '#367258');
  const back = night ? artRamp('#24564a', '#1b4236', true) : artRamp('#3c8062', '#2b5d47');
  const clusters = [];
  rows.forEach((w, i) => { for (let k = -w + 1.5; k <= w - 1.5; k += 2.6) clusters.push([x + 1 + k + (artRnd(x + i * 7 + k) - 0.5), top + i + 0.5, 1.3 + artRnd(x * 3 + i + k) * 0.6]); });
  clusters.forEach(([cx, cy, r], i) => artCluster(g, cx - 0.5, cy - 0.5, r, i % 3 === 1 ? back : leaves, x + i));
  for (let i = 0; i < 7; i += 1) {
    const [lx, ly] = clusters[Math.floor(artRnd(x + i * 5) * clusters.length)];
    artBox(g, lx - 0.75 + Math.floor(artRnd(x + i * 3) * 6) / 4, ly - 0.75 + Math.floor(artRnd(x + i * 11) * 6) / 4, 0.25, 0.25, i % 2 ? '#e3c766' : '#f2d982');
  }
}
