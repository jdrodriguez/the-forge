// scene2-fx.js: what moves on the ground of the map from above (scene2.js) and the light it gets. The river glints and
// its ripples drift downstream; chimneys and the forge send up smoke; and the scene's own clock (scenery-sun.js through
// scenery.js's skyAt) sets the light: full day, a warm wash at dawn and dusk, and at night a deep blue shade over the
// land with every window, door lamp and fire lit on top of it, each with a dithered glow round it.

// Glints on the rivers: short pale strokes that drift downstream with the current and wink out, a fixed set per world,
// only where the water shows (not under a bridge).
function m2RiverFx(plan, add, L) {
  const glints = [];
  for (const pts of Object.values(plan.rivers)) {
    const line = [];
    for (let k = 0; k < pts.length - 1; k += 1) {
      const [[ax, ay], [bx, by]] = [pts[k], pts[k + 1]];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5);
      for (let j = 0; j < n; j += 1) line.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, (by - ay) / Math.hypot(bx - ax, by - ay) || 0]);
    }
    const wet = line.map(([x, y]) => m2MatAt(L, x, y) === M2_MAT.water);
    for (let i = 0; i < line.length / 4; i += 1) {
      glints.push({ line, wet, at: m2Hash(i, line.length, 60) * line.length, off: m2Hash(i, 2, 60) * 2 - 1, len: 1 + Math.floor(m2Hash(i, 3, 60) * 3) * 0.5, ph: Math.floor(m2Hash(i, 4, 60) * 40) });
    }
  }
  const under = (g, tick, reduced) => {
    for (const s of glints) {
      const k = Math.floor(s.at + (reduced ? 0 : tick * 0.25)) % s.line.length;
      const life = (tick + s.ph) % 40;
      if (!s.wet[k] || (!reduced && life > 26)) continue;
      const [x, y] = s.line[k];
      pxBox(g, Math.round((x + s.off * 2.5) * 4) / 4, Math.round(y * 4) / 4, s.len, 0.25, life < 6 || life > 20 ? '#7fc0d4' : '#d8f2f6');
    }
  };
  under.under = true;
  add.anim(under);
}

// Smoke from a chimney or forge at (x, y): puffs that rise, lean with the wind, grow, lit on their upper left, and thin out.
function m2Smoke(add, x, y, seed, dark = false) {
  const f = (g, tick, reduced) => {
    for (let i = 0; i < 5; i += 1) {
      const t = ((reduced ? i * 9 : tick) + seed * 7 + i * 9) % 45;
      // The wind bends the column over as it rises (scene2-wind.js), a light breeze to the east without it.
      const lean = reduced ? 0.4 : (m2.wind?.at(x, y - t * 0.42, tick) ?? 0.4) + 0.15;
      const [px, py] = [x + Math.sin((t + seed) / 7) * 1.5 + t * 0.3 * lean, y - t * 0.42];
      const r = 0.75 + t / 30;
      g.globalAlpha = Math.max(0, 0.75 - t / 55);
      pxBox(g, Math.round((px - r) * 4) / 4, Math.round((py - r) * 4) / 4, r * 2, r * 2, dark ? '#4a4448' : '#d9d6d2');
      pxBox(g, Math.round((px - r) * 4) / 4, Math.round((py - r) * 4) / 4, r, r * 0.75, dark ? '#6a6368' : '#f4f2ee');
      g.globalAlpha = 1;
    }
  };
  f.over = true;
  add.anim(f);
}

// How dark it is at the scene's hour (0 by day, 1 at night) and how warm the low sun is.
function m2Dark(hour) {
  if (hour >= 7 && hour < 17.6) return [0, 0];
  if (hour >= 17.6 && hour < 19.8) { const t = (hour - 17.6) / 2.2; return [t, Math.sin(t * Math.PI)]; }
  if (hour >= 5 && hour < 7) { const t = 1 - (hour - 5) / 2; return [t, Math.sin(t * Math.PI) * 0.8]; }
  return [1, 0];
}
// A glow of radius r in colour c: rings that fade outward, dithered at each step so they stay crisp, one per size.
const m2Glows = new Map();
function m2Glow(r, c) {
  const key = `${r}${c}`;
  if (!m2Glows.has(key)) {
    const { c: cv, g } = m2Canvas(r * 2, r * 2);
    m2Raster(g, 0, 0, r * 8, r * 8, (px, py) => {
      const d = Math.hypot(px + 0.5 - r * 4, py + 0.5 - r * 4) / (r * 4);
      const step = d + M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.16;
      return step < 0.35 ? hdMix(c, '#ffffff', 0.15) : step < 0.62 ? c : step < 0.9 ? hdMix(c, '#000000', 0.25) : null;
    });
    m2Glows.set(key, cv);
  }
  return m2Glows.get(key);
}
// A pool of light of radius r in colour c, to add onto the dark: bright at its heart and falling off outward in four
// steps, each dithered into the next so the pool reads round and soft in pixels. One per size and colour.
function m2Pool(r, c) {
  const key = `pool${r}${c}`;
  if (!m2Glows.has(key)) {
    const { c: cv, g } = m2Canvas(r * 2, r * 2);
    const tones = [hdMix(c, '#ffffff', 0.35), c, hdMix(c, '#000000', 0.35), hdMix(c, '#000000', 0.6), hdMix(c, '#000000', 0.8)];
    m2Raster(g, 0, 0, r * 8, r * 8, (px, py) => {
      const d = Math.hypot(px + 0.5 - r * 4, py + 0.5 - r * 4) / (r * 4);
      const k = Math.floor(Math.pow(d, 0.8) * 5 + M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5);
      return d >= 1 || k > 4 ? null : tones[Math.max(0, k)];
    });
    m2Glows.set(key, cv);
  }
  return m2Glows.get(key);
}
// The light over everything. By day nothing, but a light marked always (the forge, Mount Doom) glows a little. At dawn
// a rose wash and at dusk an amber one. At night the land is multiplied down toward a deep moonlit blue, which keeps
// each colour's own hue where a flat shade would grey it, with a thin navy veil on top; then every light pours back:
// a lamp's, fire's or window's glow added onto the dark so it lights what is round it, breathing gently on a beat of its
// own (a fire flickers faster), the window panes lit warm, the White City's lamps (city) as small bright points.
function m2Night(g, sky, tick) {
  const [dark, warm] = m2Dark(sky?.hour ?? 12);
  const hour = sky?.hour ?? 12;
  if (warm > 0.01) {
    g.globalAlpha = warm * 0.18;
    pxBox(g, 0, 0, m2.W, m2.H, hour < 12 ? '#ff8a8a' : '#ff8030');
  }
  if (dark > 0.01) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = dark;
    pxBox(g, 0, 0, m2.W, m2.H, '#6874b0');
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = dark * 0.22;
    pxBox(g, 0, 0, m2.W, m2.H, '#0a0e2e');
  }
  const day = 1 - dark;
  for (const l of m2.lights) {
    const s = dark + (l.always ? day * 0.45 : 0);
    if (s <= 0.01) continue;
    const beat = (tick + l.x * 7 + l.y * 3) * 0.05;
    const breath = l.fire ? 0.8 + 0.12 * Math.sin(tick * 0.9 + l.x) + 0.08 * Math.sin(tick * 2.3 + l.y) : 0.9 + 0.1 * Math.sin(beat);
    if (l.r) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = s * (l.city ? 0.75 : 0.6) * breath;
      g.drawImage(m2Pool(l.r, l.c), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      g.globalCompositeOperation = 'source-over';
      if (l.city || l.fire) {
        g.globalAlpha = s * breath;
        pxBox(g, Math.round(l.x * 4) / 4 - 0.25, Math.round(l.y * 4) / 4 - 0.25, 0.5, 0.5, l.fire ? '#ffe9a8' : '#fff6d0');
      }
    }
    if (l.pane && dark > 0.01) {
      g.globalAlpha = dark * (0.85 + 0.15 * Math.sin(beat));
      m2PaneLight(g, l.pane);
    }
  }
  g.globalAlpha = 1;
}
// A lit pane: warm glass inside the window's frame, brighter at its middle, with the glazing bars still dark.
function m2PaneLight(g, p) {
  const key = `pane${p.w},${p.h},${p.kind}`;
  if (!m2Glows.has(key)) {
    const { c, g: pg } = m2Canvas(p.w, p.h);
    const [W, Hp] = [p.w * 4, p.h * 4];
    m2Raster(pg, 0, 0, W, Hp, (px, py) => {
      const [ax, ay] = [px + 0.5 - W / 2, py + 0.5];
      const m = 1.5;
      const ok = p.kind === 'round' ? ax * ax + (ay - Hp / 2) ** 2 <= (W / 2 - m) ** 2
        : p.kind === 'arch' && ay < W / 2 ? ax * ax + (ay - W / 2) ** 2 <= (W / 2 - m) ** 2 : Math.abs(ax) <= W / 2 - m && ay >= m && ay <= Hp - m;
      if (!ok) return null;
      if (p.kind === 'round' ? px === Math.floor(W / 2) || py === Math.floor(Hp / 2) : p.kind === 'square' && px === Math.floor(W / 2)) return '#5a3a1a';
      return Math.abs(ax) < W / 5 && Math.abs(ay - Hp / 2) < Hp / 4 ? '#fff2b8' : py > Hp * 0.7 ? '#e89a3a' : '#ffcf6a';
    });
    m2Glows.set(key, c);
  }
  g.drawImage(m2Glows.get(key), p.x, p.y, p.w, p.h);
}
