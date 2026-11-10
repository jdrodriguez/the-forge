// scene-glow.js: the light of the Middle-earth view (scene.js), as late 16-bit games did it with colour maths. A light is a
// halo laid onto the scene with the canvas's soft-light and 'lighter' blends, so it warms and brightens what it falls on
// instead of greying it as a see-through disc would. It is painted on scene.js's 32-bit grid (SC_RES pixels to the unit)
// and steps down in eight bands from a pale core to a red-orange rim, each band dithered into the next with the 4 by 4
// ordered pattern, so it falls off smoothly with no ring showing. At night a light also casts a flat pool of the same
// light on the ground under or in front of it, and figures standing in a pool take a faint warm glow on the side facing
// it. A flame's halo wavers in size and brightness by tick, each out of step with the others; with reduced motion it
// holds still. Lights come up through dusk (scene hour 18.5 to 19.5) and die away through dawn (5.5 to 6.5). Fog widens
// and softens the halos, rain and snow brighten the pools, rain dims flames and leaves a streak of reflection under each
// pool, and a light inside a mist-covered realm is dimmed and spread. The orcs' torches are lit here too, found among
// scene-orcs.js's swarm. Sets sc.glow:
//   add(x, y, radius, colour, strength, opts): lights a spot for this frame, drawn in the light pass (after the night
//     shade, before the Eye, the call light and the bubbles). Any file may call it, in scene units, unmirrored.
//   draw(g, x, y, radius, colour, strength, opts): the same, drawn at once, so a flame drawn after it sits on its halo.
//   pane(g, x, y, w, h, colour, strength, front): light added at once onto an exact box, as a lit pane of glass, except
//     where a figure stands in front of it (its feet on row front or below).
//   clear(x, y, w, h, front): whether no figure stands in front of that box (feet on row front or below), so a flame
//     may be drawn again over its halo.
//   opts: flame (a seed: the halo flickers), wobble (how much, 1 by default), ry (the halo's height over its width),
//     pool ([x, y, radius]: where its pool lies on the ground at night), bearer (the figure carrying it, whose own side
//     its pool does not warm).
//   night: 0 by day, 1 at night, ramping through dusk and dawn. flick(seed): a flame's flicker now, about 0.88 to 1.12.
// Loaded after scene.js; uses scenery-sky.js's BAYER, scenery.js's rgbOf and rnd, and sprites-hd.js's hdMix.

// Each band's opacity, the rim's first; strength 1 adds the full amount.
const GLOW_BANDS = [0.07, 0.15, 0.23, 0.31, 0.39, 0.47, 0.55, 0.62];
// Each band's colour from the light's own: the outer three warmed toward red-orange, the inner four paled toward white.
const glowTone = (colour, k) => (k < 3 ? hdMix(colour, '#ff4a0a', 0.45 - k * 0.15) : hdMix(colour, '#fff6d6', (k - 3) * 0.13));
const glowSprites = new Map();
// A halo rx by ry units about its middle, painted once per size, colour and place on the dither grid (so halos that
// overlap dither in step), in pixels of the scene's grid: each pixel's band from its distance out, the ordered pattern
// choosing between the two bands either side, so the faint outer bands thin out to nothing with no edge.
function glowSprite(rx, ry, colour, ax, ay) {
  const key = `${rx},${ry},${colour},${ax},${ay}`;
  const old = glowSprites.get(key);
  if (old) return old;
  const w = Math.max(2, Math.ceil(rx * SC_RES) * 2);
  const h = Math.max(2, Math.ceil(ry * SC_RES) * 2);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const img = cv.getContext('2d').createImageData(w, h);
  const n = GLOW_BANDS.length;
  const tone = GLOW_BANDS.map((a, k) => [...rgbOf(glowTone(colour, k)), Math.round(a * 255)]);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const d = Math.hypot((i + 0.5 - w / 2) / (rx * SC_RES), (j + 0.5 - h / 2) / (ry * SC_RES));
      if (d >= 1) continue;
      const t = (1 - d) ** 1.05;
      const band = Math.min(n, Math.floor(t * n + BAYER[((j + ay) & 3) * 4 + ((i + ax) & 3)] / 16));
      if (band) img.data.set(tone[band - 1], (j * w + i) * 4);
    }
  }
  cv.getContext('2d').putImageData(img, 0, 0);
  if (glowSprites.size > 600) glowSprites.delete(glowSprites.keys().next().value);
  glowSprites.set(key, cv);
  return cv;
}
// Lays a halo rx by ry about (x, y) at strength (0 to 1), its pixels on the scene's grid: once soft-lit, which warms the
// hue under it (more red, less blue) without washing it out, then added, which brightens it.
function glowPaint(g, x, y, rx, ry, colour, strength) {
  if (strength <= 0.01) return;
  const q = (v) => Math.round(v * SC_RES) / SC_RES;
  const [qx, qy] = [Math.max(0.25, q(rx)), Math.max(0.25, q(ry))];
  const w = Math.max(2, Math.ceil(qx * SC_RES) * 2) / SC_RES;
  const h = Math.max(2, Math.ceil(qy * SC_RES) * 2) / SC_RES;
  const [ox, oy] = [q(x) - w / 2, q(y) - h / 2];
  const cv = glowSprite(qx, qy, colour, Math.round(ox * SC_RES) & 3, Math.round(oy * SC_RES) & 3);
  const [op, alpha] = [g.globalCompositeOperation, g.globalAlpha];
  g.globalAlpha = Math.min(1, strength);
  g.globalCompositeOperation = 'soft-light';
  g.drawImage(cv, ox, oy, w, h);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(cv, ox, oy, w, h);
  g.globalCompositeOperation = op;
  g.globalAlpha = alpha;
}

// How dark it is by the scene's hour: 0 by day, 1 from 19.5 to 5.5, ramping through dusk and dawn.
const glowNight = (h) => Math.max(0, Math.min(1, h >= 12 ? h - 18.5 : 6.5 - h));
const glowStill = () => typeof scReduced !== 'undefined' && scReduced.matches;
// A flame's flicker by tick, a slow sway, a quick shiver and a random jump every other tick, each seed out of step.
function glowFlick(seed, wobble = 1) {
  if (glowStill()) return 1;
  const t = sc.tick + seed * 7.3;
  return 1 + wobble * (0.055 * Math.sin(t * 0.83 + seed) + 0.035 * Math.sin(t * 2.1 + seed * 3) + 0.06 * (rnd(Math.floor(t / 2) + seed * 31) - 0.5));
}
// What the weather does to light this frame (sc.weather, scene-weather.js): fog widens and softens a halo and thins its
// pool, rain and snow brighten the pools, and rain dims a flame.
function glowWeather() {
  const w = sc.weather;
  const a = w && w.kind !== 'clear' ? Math.max(0, Math.min(1, w.amount || 0)) : 0;
  const k = a ? w.kind : 'clear';
  return {
    spread: k === 'fog' ? 1 + 0.4 * a : 1,
    halo: k === 'fog' ? 1 - 0.15 * a : 1,
    pool: k === 'rain' ? 1 + 0.4 * a : k === 'snow' ? 1 + 0.25 * a : k === 'fog' ? 1 - 0.3 * a : 1,
    flame: k === 'rain' ? 1 - 0.2 * a : 1,
    wet: k === 'rain' ? a : 0,
  };
}
// Whether (x) stands in a realm under mist (out of reach or paused, scenery-props.js's drawMist).
const glowMisted = (x) => sc.realms.some((r) => x >= r.x0 && x < r.x0 + r.w && (!r.m?.ok || r.m?.paused));

// This frame's queue, its pools (for the warm side on figures standing in them) and its weather; a new tick starts afresh,
// so a page that never runs the light pass never piles them up.
const glowNow = { tick: -1, queue: [], pools: [], folk: null, weather: null };
function glowFrame() {
  if (glowNow.tick !== sc.tick) Object.assign(glowNow, { tick: sc.tick, queue: [], pools: [], folk: null, weather: glowWeather() });
  return glowNow;
}

// A light now: its halo (flickering if it is a flame), and at night its pool on the ground, with a streak of reflection
// under it in the rain.
function glowDraw(g, x, y, radius, colour, strength, o = {}) {
  const F = glowFrame();
  const W = F.weather;
  const mist = glowMisted(x);
  const f = o.flame === undefined ? 1 : glowFlick(o.flame, o.wobble);
  const s = strength * (1 + (f - 1) * 1.6) * (o.flame === undefined ? 1 : W.flame) * (mist ? 0.55 : 1);
  const r = radius * (1 + (f - 1) * 0.9) * W.spread * (mist ? 1.2 : 1);
  glowPaint(g, x, y, r, r * (o.ry ?? 1), colour, s * W.halo);
  const night = sc.glow.night;
  if (!o.pool || night <= 0) return;
  const [px, py, pr] = o.pool;
  const ps = s * night * W.pool;
  const prr = pr * (1 + (f - 1) * 0.6) * (1 + W.wet * 0.15) * (mist ? 1.2 : 1);
  glowPaint(g, px, py, prr, prr * 0.32, colour, ps * 0.85);
  if (W.wet > 0.2) glowPaint(g, px, py + prr * 0.3, Math.max(0.5, pr * 0.12), pr * 0.3, colour, ps * W.wet * 0.5);
  if (!mist) F.pools.push({ x: px, y: py, r: prr * 1.25, s: ps, c: colour, bearer: o.bearer });
}
const glowAdd = (...args) => { glowFrame().queue.push(args); };
// The figures this frame, each with the box it stands in (a mounted Ranger's takes in its horse), from sc.actors and
// the orcs' swarm.
function glowFolkNow() {
  const F = glowFrame();
  if (F.folk) return F.folk;
  F.folk = [...(sc.actors?.values() ?? [])].filter((a) => a.mood !== 'gone')
    .map((a) => ({ x: a.x, y: a.y, h: typeof scHead === 'function' ? scHead(a) : figureTop(a.kind), half: a.mounted ? 9 : 3, ref: a }));
  if (typeof orcs !== 'undefined') for (const o of orcs.swarm ?? []) F.folk.push({ x: o.x, y: o.y - (o.lift || 0), h: figureTop('orc'), half: 3, ref: o });
  return F.folk;
}
// The figures standing in front of a box x, y, w by h (their feet on row front or below) and overlapping it.
const glowBefore = (x, y, w, h, front = y + h) => glowFolkNow().filter((a) => a.y >= front && x < a.x + a.half && x + w > a.x - a.half && y < a.y + 0.5 && y + h > a.y - a.h);
// Light added onto an exact box, as a lit pane of glass (dimmed inside a realm under mist): in one piece when nobody
// stands in front of it, or else a pixel of the scene's grid at a time, leaving out what a figure standing in front of
// it covers (one whose feet are on row front or below; one further back is behind the wall the pane is in).
function glowPane(g, x, y, w, h, colour, strength, front = y + h) {
  const folk = glowBefore(x, y, w, h, front);
  const [op, alpha] = [g.globalCompositeOperation, g.globalAlpha];
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.max(0, Math.min(1, strength * (glowMisted(x) ? 0.55 : 1)));
  const p = 1 / SC_RES;
  if (!folk.length) pxBox(g, x, y, w, h, colour);
  for (let px = x; folk.length && px < x + w - p / 2; px += p) {
    for (let py = y; py < y + h - p / 2; py += p) {
      if (!folk.some((a) => px + p > a.x - a.half && px < a.x + a.half && py + p > a.y - a.h && py < a.y + 0.5)) pxBox(g, px, py, p, p, colour);
    }
  }
  g.globalCompositeOperation = op;
  g.globalAlpha = alpha;
}

// The orcs' torches (scene-orcs.js's swarm draws one at its hand while it walks or stands, not in a fight): where the
// hand is in each pose and step of its walk (the same frame scene-orcs.js draws) comes from drawing the orc once on a
// scratch canvas, then the flame is a hand's width up from it, mirrored with the orc when it faces left.
const glowHands = new Map();
const glowScratch = document.createElement('canvas').getContext('2d');
function glowHand(pose, frame) {
  const key = `${pose}${frame}`;
  if (!glowHands.has(key)) glowHands.set(key, drawFigure(glowScratch, 'orc', 'torch', 0, 0, pose, frame));
  return glowHands.get(key);
}
function glowTorches() {
  const swarm = typeof orcs !== 'undefined' ? orcs.swarm : [];
  for (const o of swarm ?? []) {
    if (!o.torch || o.prey || o.rider) continue;
    const x = Math.round(o.x);
    const y = Math.round(o.y);
    const h = glowHand(o.moving ? 'walk' : 'stand', o.moving ? hdWalkFrame(sc.tick + o.id, 1) : 0);
    const fx = o.face < 0 ? x - h.x - 0.25 : x + h.x + 1.25;
    glowAdd(fx, y + h.y - 5.5, 5, '#ff9a3c', 0.35 + 0.55 * sc.glow.night, { flame: o.id * 5 + 3, pool: [fx, y + 0.5, 6], bearer: o });
  }
}

// Figures standing in a pool at night: a faint warm glow over the side facing the light, the closer the stronger.
function glowFolk(g, pools) {
  for (const a of pools.length ? glowFolkNow() : []) {
    for (const p of pools) {
      const d = Math.hypot(a.x - p.x, (a.y - p.y) * 2.5);
      if (d >= p.r || d < 0.5 || p.bearer === a.ref) continue;
      const side = a.x < p.x ? 1 : -1;
      glowPaint(g, Math.round(a.x) + 0.5 + side * 2, a.y - a.h / 2 + 0.5, 1.5, a.h / 2, p.c, Math.min(0.35, p.s * (1 - d / p.r) * 0.6));
    }
  }
}

sc.glow = {
  add: glowAdd,
  draw: glowDraw,
  pane: glowPane,
  clear: (x, y, w, h, front) => !glowBefore(x, y, w, h, front).length,
  flick: glowFlick,
  get night() { return glowNight(sc.sky.hour); },
};
// The light pass: the torches, every light added this frame, then the warm side of the figures standing in the pools.
sc.layers.light.push((g) => {
  glowTorches();
  const F = glowFrame();
  for (const args of F.queue) glowDraw(g, ...args);
  if (sc.glow.night > 0) glowFolk(g, F.pools);
  F.queue = [];
  F.pools = [];
});
