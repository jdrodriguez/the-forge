// scene2-gondor-citybuild.js: stands Minas Tirith (scene2-gondor-city.js paints it) on the map from above once per
// layout: the baked city with its footprint, its lamps, the Steward's white banner on the White Tower and black banners
// on the Great Gate's towers stirring in the wind, and after the night's shade its lit windows, slits and wall lamps.

// A banner's frames: a staff and a cloth of w by h units streaming east, rippling through four frames.
const m2MtFlags = new Map();
function m2MtFlag(kind, frame) {
  const key = `${kind}${frame}`;
  if (m2MtFlags.has(key)) return m2MtFlags.get(key);
  const [w, h] = kind === 'tower' ? [4.5, 1.6] : [2, 2.6];
  const { c, g } = m2Canvas(w + 1, h + 4);
  m2Raster(g, 0, 0, (w + 1) * 4, (h + 4) * 4, (px, py) => {
    if (px === 0) return py < (h + 4) * 4 ? '#5a5048' : null;
    const wave = Math.round(Math.sin((px / 4 + frame * 1.6) * 1.7) * (px / ((w + 1) * 4)) * 2.2);
    const y = py - wave;
    if (px < 1 || px > w * 4 || y < 0 || y >= h * 4) return null;
    const light = Math.sin((px / 4 + frame * 1.6) * 1.7) > 0.3;
    if (kind === 'tower') return y === 0 || y === h * 4 - 1 ? '#aeb8c8' : light ? '#ffffff' : '#dfe4ee';
    const dot = Math.hypot(px - w * 2, y - h * 1.6) < 2.2;
    return dot ? '#f4f6fa' : light ? '#2a2c34' : '#16171c';
  });
  m2MtFlags.set(key, c);
  return c;
}

const M2MT_STATE = {};
// The night's rule: only pixels that are a window, a door or a lamp's column by day are worked out again for their glow.
const M2MT_DARK = new Set(['#2a3040', '#3a4050', '#2c3240', '#14161c', '#2c2a2e', '#3e3a3c'].map(m2Pack));
const m2MtGlowRule = (day) => (px, py) => {
  const d = day ? day[py * M2MT.w * 4 + px] : 1;
  if (!d || (px % 4 !== 1 && !M2MT_DARK.has(d))) return null;
  return m2MtPix(px, py, true);
};
// Builds the city once per layout: the baked canvas with its footprint, the night's windows and lamps, the banners.
m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  const P = plan.places.minasTirith;
  if (!P) return;
  const [x, y, z] = [P.x + M2MT.ox, P.y + M2MT.oy, P.y + 6];
  m2Shadow(L, P.x + 9, P.y + 3.5, 31, 5.5, 0.75);
  const day = m2SouthThing(add, 'mt', x, y, M2MT.w, M2MT.h, z, (px, py) => m2MtPix(px, py, false), [P.x - 30, P.y - 16, P.x + 30, P.y + 6]);
  Object.assign(M2MT_STATE, { x, y, z, glow: m2SouthArt('mtglow', M2MT.w, M2MT.h, m2MtGlowRule(day.c.px32)) });
  plan.places.minasGate = { x: P.x + 8.4, y: P.y + 6.5 };
  for (const [dx, dy, r] of [[8.4, 4, 5], [0, -45, 6], [-14, -3, 4.5], [12, -14, 4.5], [-6, -26, 4.5]]) add.light({ x: P.x + dx, y: P.y + dy, r, c: '#ffe2a0', city: true });
  const flags = [['tower', 32, 1.2 - 4], ['gate', 37.6, 69.4 - 6.4], ['gate', 43.0, 69.4 - 6.4]];
  const f = (g, tick, reduced) => {
    const sway = m2.wind?.at?.(P.x, P.y, tick) ?? 0.5;
    for (const [kind, u, v] of flags) {
      const fr = reduced ? 0 : Math.floor(tick / Math.max(2, 5 - Math.abs(sway) * 3) + u) % 4;
      const c = m2MtFlag(kind, fr);
      g.drawImage(c, x + u, y + v, c.width / 4, c.height / 4);
    }
  };
  f.item = true;
  f.z = z + 0.05;
  add.anim(f);
  M2MT_STATE.ms = performance.now() - t0;
});
// The city's lit windows, slits and wall lamps after the night's shade, breathing a little.
m2.layers.light.push((g, tick) => {
  const s = M2MT_STATE;
  if (!s.glow) return;
  const dark = m2Dark(m2.sky?.hour ?? 12)[0];
  if (dark < 0.02) return;
  g.globalAlpha = dark * (0.88 + 0.12 * Math.sin(tick * 0.07));
  g.drawImage(s.glow, s.x, s.y, M2MT.w, M2MT.h);
  g.globalAlpha = 1;
});
