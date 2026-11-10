// scene2-war.js: the war on the map from above (scene2.js) while main is red (scene2-orcs.js musters the swarm). m2.war
// eases from 0 to 1 over about five seconds when main turns red and back when it is green again, as the side view's red
// sky does; the land and the water redden under it, and the realms'
// roofs burn: flames lick along the ridge of every building with a lit window (each house, hall and hole the realms
// light at night), with embers and dark smoke rising and drifting, and a red glow round each fire. Nothing covers a
// worker: the fires sit on the roofs, behind anyone standing in front of the building.

m2.war = 0;
const m2eFire = { key: '', spots: [] };

// The fires for this layout: on top of each realm building that has a lit window, two along a wide roof, one on a small.
function m2eFireSpots() {
  if (m2eFire.key === m2.key) return m2eFire.spots;
  m2eFire.key = m2.key;
  const spots = [];
  const seen = new Map();
  const inRealm = (x, y) => m2.realms.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  for (const l of m2.lights) {
    const p = l.pane;
    if (!p || !inRealm(p.x, p.y)) continue;
    const o = (m2.standing ?? []).find((s) => s.w >= 6 && p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
    if (!o) continue;
    // The roof is just above the building's highest window.
    if (!seen.has(o)) seen.set(o, p.y);
    seen.set(o, Math.min(seen.get(o), p.y));
  }
  for (const [o, top] of seen) {
    const n = o.w > 22 ? 3 : o.w > 12 ? 2 : 1;
    for (let i = 0; i < n; i += 1) spots.push({ x: o.x + (o.w * (i + 1)) / (n + 1), y: Math.max(o.y + 2, top - 3), z: o.z + 0.05, seed: spots.length * 13 + 5 });
  }
  m2eFire.spots = spots;
  return spots;
}

// A roof fire, 8 by 10 units, in one of four flicker steps: tongues of flame that rise from a burning base, white-gold
// at the heart, orange, then red and a dark red rim, dithered between, each tongue swaying with the step. Painted once.
const m2eFlames = [];
function m2eFlameArt(f) {
  if (m2eFlames[f]) return m2eFlames[f];
  const { c, g } = m2Canvas(8, 10);
  const tongues = [[-9, 26, 5], [0, 38, 7], [9, 24, 5], [-4, 18, 4], [5, 30, 4]];
  m2Raster(g, 0, 0, 32, 40, (px, py) => {
    const [x, y] = [px + 0.5 - 16, 39.5 - py];
    let best = 0;
    for (const [dx, h0, w] of tongues) {
      const h = h0 + Math.sin(f * 1.7 + dx) * 4;
      if (y > h) continue;
      const sway = Math.sin(f * 1.3 + dx * 0.4 + y / 6) * (y / h) * 2.5;
      const half = w * (1 - y / h) ** 0.7 + (y < 6 ? 3 : 0);
      const d = Math.abs(x - dx - sway) / Math.max(0.5, half);
      if (d <= 1) best = Math.max(best, (1 - d) * 0.7 + (1 - y / h) * 0.6);
    }
    if (!best) return null;
    const v = best + (M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * 0.18;
    return v > 1 ? '#fff4c0' : v > 0.82 ? '#ffd23a' : v > 0.6 ? '#ff8a1a' : v > 0.38 ? '#e2401a' : v > 0.16 ? '#9a1e0a' : '#5a0c04';
  });
  m2eFlames[f] = c;
  return c;
}
// A puff of smoke r units across, round and dithered at its rim, lit on its upper left. Painted once per size.
const m2ePuffs = new Map();
function m2ePuff(r) {
  if (m2ePuffs.has(r)) return m2ePuffs.get(r);
  const { c, g } = m2Canvas(r * 2, r * 2);
  m2Raster(g, 0, 0, r * 8, r * 8, (px, py) => {
    const [x, y] = [(px + 0.5) / (r * 4) - 1, (py + 0.5) / (r * 4) - 1];
    const d = Math.hypot(x, y) + M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.2;
    if (d > 1.05) return null;
    return Math.hypot(x + 0.35, y + 0.35) < 0.5 ? '#4e4246' : d > 0.9 ? '#1e171a' : '#2e2428';
  });
  m2ePuffs.set(r, c);
  return c;
}
// A roof fire with its feet at (x, y), grown to k (0 to 1), with embers flung up.
function m2eFlame(g, x, y, t, k) {
  const art = m2eFlameArt(Math.floor(t / 2) % 4);
  const [w, h] = [8 * k, 10 * k];
  g.drawImage(art, Math.round((x - w / 2) * 4) / 4, Math.round((y - h + 1) * 4) / 4, Math.round(w * 4) / 4, Math.round(h * 4) / 4);
  for (let i = 0; i < 3; i += 1) {
    const e = (t * 0.7 + i * 9 + x) % 18;
    g.fillStyle = e < 6 ? '#fff0a0' : e < 12 ? '#ffb02a' : '#e2401a';
    g.fillRect(Math.round((x + Math.sin(e / 2 + i * 2) * 2.5) * 4) / 4, Math.round((y - 8 * k - e * 0.55) * 4) / 4, 0.25, 0.25);
  }
}
// Dark smoke rising from a fire, drifting with the wind and growing and thinning as it climbs.
function m2eWarSmoke(g, x, y, t, k) {
  const wind = m2.wind?.at ? m2.wind.at(x, y, t) : 0.4;
  for (let i = 0; i < 4; i += 1) {
    const age = (t + i * 10 + Math.round(x) * 3) % 40;
    const r = Math.min(4, 1 + Math.floor(age / 10));
    const px = x + age * 0.14 * (1 + wind) + Math.sin((age + x) / 6);
    const py = y - 9 - age * 0.45;
    g.globalAlpha = Math.max(0, 0.6 - age / 66) * Math.min(1, m2.war * 1.5) * k;
    g.drawImage(m2ePuff(r), Math.round((px - r) * 4) / 4, Math.round((py - r) * 4) / 4, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

// The war's tint under everything that stands: the land and water reddened.
m2.layers.ground.push((g, tick, reduced) => {
  const red = m2e.war ? 1 : 0;
  m2.war = reduced ? red : Math.max(0, Math.min(1, m2.war + (red ? 0.02 : -0.02)));
  if (m2.war < 0.01) return;
  g.globalAlpha = m2.war * 0.3;
  g.fillStyle = '#8a1a08';
  g.fillRect(0, 0, m2.W, m2.H);
  g.globalAlpha = 1;
});
// The fires on the roofs, in the depth sort just in front of their buildings.
m2.layers.items.push((add, tick, reduced) => {
  if (m2.war < 0.15) return;
  const k = Math.min(1, (m2.war - 0.15) * 2);
  const t = reduced ? 0 : tick;
  for (const s of m2eFireSpots()) add(s.z, () => m2eFlame(m2G, s.x, s.y, t + s.seed, k));
});
// The smoke over the fires.
m2.layers.air.push((g, tick, reduced) => {
  if (m2.war < 0.3 || reduced) return;
  for (const s of m2eFireSpots()) m2eWarSmoke(g, s.x, s.y, tick + s.seed, 1);
});
// Each fire glows, more at night.
m2.layers.light.push((g, tick) => {
  if (m2.war < 0.15) return;
  const dark = typeof m2Dark === 'function' ? m2Dark(m2.sky?.hour ?? 12)[0] : 0;
  const glow = m2Glow(8, '#ff6a1a');
  for (const s of m2eFireSpots()) {
    g.globalAlpha = m2.war * (0.16 + dark * 0.36) * (0.85 + 0.15 * Math.sin(tick * 0.8 + s.seed));
    g.drawImage(glow, s.x - 8, s.y - 10, 16, 16);
  }
  g.globalAlpha = 1;
});
