// scenery-lights.js: the lights of the Middle-earth view that stay bright at night, drawn after scene.js's night shade:
// the Shire's round window and the light under its door, Erebor's forge and the glow of its halls through the gate, the
// falls in the moonlight, and the war fires' glow. Their halos and the pools they cast on the ground at night are
// scene-glow.js's (sc.glow); each comes up through dusk and dies away through dawn (sc.glow.night). The shapes they light
// are scenery-land.js's, scenery-erebor.js's and scenery-falls.js's. Loaded after scenery-erebor.js.

// After the night shade: the Shire's window and door, the forge, the gate's glow from the halls within, the falls in the
// moonlight, and the war fires' glow, which flickers with each fire and pools round it at night, with the fire's flames
// drawn again over it so they stay crisp (unless someone stands in front of the fire).
function drawLights(g, scene, tick) {
  const G = scene.glow;
  const dark = G ? G.night : Number(scene.sky.night);
  for (const r of scene.realms) {
    const cx = r.x0 + Math.floor(r.w / 2);
    if (r.kind === 'hobbit' && dark > 0) shireLights(g, G, cx, dark);
    if (r.kind === 'elf' && scene.sky.night) fallsGlow(g, r, tick);
    if (r.kind === 'dwarf') ereborLights(g, r, tick, scene.sky.night);
    if (!scene.war) continue;
    for (const f of warFires(r)) {
      if (!G) continue;
      G.draw(g, f.x + 0.5, f.y - 2.5, 9, PX.ember, scene.war * (0.45 + 0.55 * dark), { flame: f.x, ry: 0.9, pool: [f.x + 0.5, f.y + 1, 12] });
      if (G.clear(f.x - 3, f.y - 8, 7, 9, f.y + 1)) warFlames(g, f, r.x0, tick, scene.war);
    }
  }
}

// The Shire after dark: light added onto the round window's four panes (so a hobbit passing in front is lit by it, not
// hidden behind it), brightest in the upper left, with a halo and a pool on the flower bed below, and a line of light
// under the round door that spills a pool onto the path. All of it fades up through dusk. The panes are the glass of
// scenery-land-qd.js's 32-bit window (shirePanes, in quarter-unit runs), or else the same glass worked out here: inside
// a radius of a unit and a half, less a cross of mullions half a unit wide.
function shireLights(g, G, cx, dark) {
  if (!G) return;
  G.draw(g, cx - 11, GROUND_Y + 1, 5, '#ffc45a', 0.6 * dark, { pool: [cx - 11, GROUND_Y + 6.5, 5] });
  G.draw(g, cx, GROUND_Y + 5, 4.5, '#ffc45a', 0.45 * dark, { ry: 0.45, pool: [cx, GROUND_Y + 8.5, 9] });
  for (const [x, y, w, h, bright] of shireGlass(cx)) G.pane(g, x, y, w, h, bright ? '#fff0c0' : '#ffb848', 0.9 * dark, GROUND_Y + 5);
  G.pane(g, cx - 2, GROUND_Y + 5, 4, 0.5, '#ffb848', 0.9 * dark, GROUND_Y + 5);
  G.pane(g, cx - 1, GROUND_Y + 5, 2, 0.5, '#fff0c0', 0.6 * dark, GROUND_Y + 5);
}
function shireGlass(cx) {
  if (typeof shirePanes === 'function') return shirePanes(cx);
  const runs = [];
  for (let py = -1.5; py < 1.5; py += 0.25) {
    for (let px = -1.5; px < 1.5; px += 0.25) {
      const [mx, my] = [px + 0.125, py + 0.125];
      if (Math.hypot(mx, my) > 1.5 || Math.abs(mx) < 0.25 || Math.abs(my) < 0.25) continue;
      runs.push([cx - 11 + px, GROUND_Y + 1 + py, 0.25, 0.25, px + py < -1]);
    }
  }
  return runs;
}
