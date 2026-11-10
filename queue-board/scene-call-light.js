// scene-call-light.js: the light round a caller in the Middle-earth view (scene-call.js), in 32-bit, a quarter unit a
// pixel on scene.js's canvas: the pool of light at its feet and the rings of sound going out from its head, each in
// the call's colour (callTint). Each pool and ring is painted once into a small canvas of SC_RES pixels a unit and
// drawn from it with the alpha it needs that frame. Each takes a size (1 for a figure) so a giant eagle
// (scene-eagle.js) gets light to match it. scene-call.js and scene-eagle.js call callPool and callRings. Loaded after
// scene-call.js.

// The call's light in 32-bit, each piece painted once per colour and size into a canvas of SC_RES pixels a unit, by
// paint(g) in units, and drawn from it at (x, y) with the alpha given.
const callLightCache = new Map();
function callLightSprite(g, key, w, h, x, y, alpha, paint) {
  let cv = callLightCache.get(key);
  if (!cv) {
    if (callLightCache.size > 60) callLightCache.clear();
    cv = document.createElement('canvas');
    cv.width = Math.ceil(w * SC_RES);
    cv.height = Math.ceil(h * SC_RES);
    const lg = cv.getContext('2d');
    lg.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
    paint(lg);
    callLightCache.set(key, cv);
  }
  g.globalAlpha = alpha;
  g.drawImage(cv, x, y, w, h);
  g.globalAlpha = 1;
}
const callQuarter = (v) => Math.floor(v * 4) / 4;
// A pool of light on the ground at a caller's feet, drawn before the figure so it stands in it: an oval 13 units across
// (times size) in quarter-unit pixels, its rim broken into a checker so it fades into the ground, the tint inside it
// and a paler heart under the feet.
function callPool(g, x, y, c, still, tick, size = 1) {
  const [tint] = callTint(c);
  const [w, h] = [Math.round(13 * size), Math.round(3 * Math.sqrt(size) * 4) / 4];
  callLightSprite(g, `pool${tint}|${size}`, w, h, x + 0.5 - w / 2, y - h / 3, 0.3 + (still ? 0 : 0.12 * Math.sin(tick / 5)), (lg) => {
    const pale = hdMix(tint, '#ffffff', 0.45);
    const [cols, rows] = [w * 4, h * 4];
    for (let r = 0; r < rows; r += 1) {
      for (let q = 0; q < cols; q += 1) {
        const d = Math.hypot((q + 0.5 - cols / 2) / (cols / 2), (r + 0.5 - rows / 2) / (rows / 2));
        if (d > 1 || (d > 0.84 && (q + r) % 2)) continue;
        lg.fillStyle = d < 0.5 ? pale : tint;
        lg.fillRect(q / 4, r / 4, 0.25, 0.25);
      }
    }
  });
}
// Rings of sound, a burst of three arcs either side of the head, each widening and fading as it goes. Each arc is a
// curve of quarter-unit pixels: a pale inner edge, the ring in the call's colour (two pixels deep, three at a larger
// size), and a soft shadow outside it a pixel down; every pixel is laid once, so the arc stays even. Each width is
// painted once per colour and size.
function callRings(g, x, y, c, tick, size = 1) {
  const [tint] = callTint(c);
  const every = callAge(c) < CALL_LOUD_MS ? 15 : 40;
  const mid = x + 0.5;
  const deep = size > 1.4 ? [0.25, 0.5, 0.75] : [0.25, 0.5];
  for (let k = 0; k < 3; k += 1) {
    const life = (tick % every) - k * 3;
    if (life < 0 || life > 9) continue;
    const r = (5 + life * 1.3) * size;
    const s = Math.ceil(r + 2);
    callLightSprite(g, `ring${tint}|${life}|${size}`, 2 * s, 2 * s, mid - s, y + 0.5 - s, 1 - life / 10, (lg) => {
      const seen = new Set();
      const out = deep.at(-1) + 0.25;
      for (const [dr, down, color, share] of [[0, 0, hdMix(tint, '#ffffff', 0.55), 0.9], ...deep.map((d) => [d, 0, tint, 1]), [out, 0.25, PX.ink, 0.4]]) {
        lg.globalAlpha = share;
        lg.fillStyle = color;
        const n = Math.ceil((r + dr) * 7);
        for (let i = 0; i <= n; i += 1) {
          const a = (i / n - 0.5) * (Math.PI / 2);
          const u = callQuarter(s + Math.cos(a) * (r + dr));
          const v = callQuarter(s + Math.sin(a) * (r + dr) * 0.9) + down;
          if (seen.has(`${u},${v}`)) continue;
          seen.add(`${u},${v}`);
          lg.fillRect(u, v, 0.25, 0.25);
          lg.fillRect(2 * s - u - 0.25, v, 0.25, 0.25);
        }
      }
    });
  }
}
