// scene2-mordor-gate.js: the Black Gate of Mordor and Mordor's crags on the map from above (scene2.js). The Morannon
// closes the pass of Cirith Gorgor where the Ephel Duath and the Ered Lithui meet: a wall of black stone with a walk
// and merlons along its top, the great iron doors under their arch, banded and riveted, and the two Towers of the Teeth
// either side, battered at the foot, slit with ember windows and crowned with fangs of stone. The doors stand over a
// Man's head and the towers near twice his height. Black needle crags rise along the inner feet of both
// ranges, sharper than the ranges' own peaks, and stand alone on the southern plain, and torches burn on the battlements at night.

const M2_MORDOR_WALL = ['#0b090a', '#181415', '#241f20', '#322b2c', '#433a39', '#5a4d49'];
const M2_MORDOR_DOOR = ['#060608', '#101014', '#1a1a20', '#26262e', '#363642', '#4c4c5a'];
const M2_MORDOR_CRAG = ['#060405', '#120c0d', '#1e1516', '#2c1f1e', '#3e2b27', '#563b31'];

// One pixel of the gate, drawn on a plan 38 by 36 and stood M2_MORDOR_GS times that size, its foot on the last row.
const M2_MORDOR_GS = 4 / 3;
function m2MordorGatePx(px, py) {
  const [u, t] = [((px + 0.5) / 4) / M2_MORDOR_GS - 19, 36 - ((py + 0.5) / 4) / M2_MORDOR_GS];
  const W = M2_MORDOR_WALL;
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  const course = Math.floor(py / 7);
  const block = Math.floor((px + course * 5) / (8 + (course % 3) * 2));
  const joint = py % 7 === 0 || (px + course * 5) % (8 + (course % 3) * 2) === 0;
  const tone = m2Hash(block, course, 111) < 0.3 ? 1 : 0;
  // The Towers of the Teeth, in front of the wall: battered at the foot, a gallery near the top, a crown of fangs.
  for (const tc of [-13, 13]) {
    const lx = u - tc;
    const half = 4.3 - t * 0.03 + (t < 2.5 ? 0.6 : 0);
    if (t < 29 && Math.abs(lx) < half) {
      const slit = Math.abs(lx) < 0.3 && [6, 12, 18, 24].some((r) => t > r && t < r + 1.7);
      if (slit) return '#ff5a1a';
      if (half - Math.abs(lx) < 0.3) return W[0];
      const nx = lx / half;
      let k = (nx < -0.7 ? 5 : nx < -0.15 ? 4 : nx < 0.4 ? 3 : 2) - (joint ? 1 : 0) - tone;
      if (t < 2.5 && t > 2.2) k = 5;
      return W[Math.max(1, k)];
    }
    if (t >= 29 && t < 31 && Math.abs(lx) < 4.9) return t > 30.7 ? W[2] : t < 29.3 ? W[0] : W[lx < -2.5 ? 4 : lx < 2 ? 3 : 1];
    if (t >= 31 && t < 37) {
      for (const [kc, hgt, bend] of [[-3.7, 5, -0.35], [-1.2, 3, 0], [1.2, 3.4, 0], [3.7, 5, 0.35]]) {
        const f = (t - 31) / hgt;
        const c = kc + bend * f * f * 3;
        const r = 0.95 * (1 - f);
        if (f < 1 && Math.abs(lx - c) < r) return Math.abs(lx - c) > r - 0.3 ? W[0] : W[lx - c < 0 ? 5 : 2];
      }
    }
  }
  // The doors under their arch: two leaves of black iron, planks, straps and rivets.
  const arch = 10.5 + 3 * Math.sqrt(Math.max(0, 1 - (u / 5) ** 2));
  if (Math.abs(u) < 5.9 && t < arch + 0.9) {
    if (Math.abs(u) >= 5 || t >= arch) return (Math.floor(Math.atan2(t - 10.5, u) * 7) % 2) ? W[4] : W[2];
    const D = M2_MORDOR_DOOR;
    if (Math.abs(u) < 0.25) return D[0];
    const strap = [2.5, 6, 9.5].some((r) => t > r && t < r + 0.75);
    if (strap) return (px % 4 === 1 && py % 3 === 1) ? D[5] : D[3];
    const plank = Math.abs(((u + 5) % 1.4) - 0.7) > 0.58;
    return plank ? D[1] : D[u < -3 ? 3 : 2];
  }
  // The wall between the towers and its stubs beyond, a walk on top and black thorns along it.
  const wallTop = Math.abs(u) < 9.5 ? 19 : 15;
  if (t < wallTop) {
    if (t > wallTop - 1.5) return t > wallTop - 0.3 ? W[2] : W[(px + py) % 9 === 0 ? 2 : 4];
    if (t > wallTop - 1.8) return W[0];
    let k = 3 - (joint ? 2 : 0) - tone;
    if (t < 2) k = 1;
    if (b < 0.06) k += 1;
    return W[Math.max(1, k)];
  }
  const tu = ((u + 40) % 1.6) - 0.8;
  if (t < wallTop + 1.8 && Math.abs(tu) < 0.6 * (1 - (t - wallTop) / 1.8) && Math.abs(u) < 19) return tu < 0 ? W[3] : W[1];
  return null;
}
// A cluster of black needles w by h units, its foot on the last row: three spires of jagged height, lit on their left.
function m2MordorCragPx(px, py, w, h, seed) {
  const [u, t] = [(px + 0.5) / 4, h - (py + 0.5) / 4];
  for (const [f, hf, wf] of [[0.5, 1, 0.24], [0.27, 0.62, 0.2], [0.76, 0.48, 0.18]]) {
    const top = h * hf * (0.85 + m2Hash(seed, f * 10, 112) * 0.15);
    if (t > top) continue;
    const c = w * f + (m2Hash(seed, f * 20, 113) - 0.5) * 1.2 + (t / h) * (m2Hash(seed, 3, 114) - 0.5) * 2;
    const jag = (m2Hash(Math.floor(t * 1.5), seed + f * 9, 115) - 0.5) * 0.7;
    const half = w * wf * Math.pow(1 - t / top, 0.8) + jag * (1 - t / top);
    const d = u - c;
    if (Math.abs(d) >= half) continue;
    if (half - Math.abs(d) < 0.3 || t < 0.4) return M2_MORDOR_CRAG[0];
    const nx = d / Math.max(0.5, half);
    let k = nx < -0.5 ? 5 : nx < 0 ? 4 : nx < 0.5 ? 2 : 1;
    if (m2Hash(px >> 1, py >> 2, seed + 116) < 0.12) k -= 1;
    return M2_MORDOR_CRAG[Math.max(1, k)];
  }
  return null;
}
// The point d units along a line of places.
function m2MordorAlong(pts, d) {
  for (let k = 1; k < pts.length; k += 1) {
    const [[ax, ay], [bx, by]] = [pts[k - 1], pts[k]];
    const len = Math.hypot(bx - ax, by - ay);
    if (d <= len) return [ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len];
    d -= len;
  }
  return pts.at(-1);
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  const P = plan.places;
  const gate = P.blackGate;
  if (!gate) return;
  const glow = [];
  const [gx, gy] = [gate.x, gate.y + 4];
  const S = M2_MORDOR_GS;
  const [w, h] = [38 * S, 36 * S + 0.25];
  m2Shadow(L, gx + 6, gy + 0.5, 26, 3, 0.75);
  m2Stroke(L, [[gx - 24, gy - 1], [gx + 24, gy - 1]], 2.8, M2_MAT.rock, { aux: () => 70 });
  const art = m2SouthThing(add, 'mordorGate', gx - w / 2, gy - h + 0.25, w, h, gy, m2MordorGatePx, [gx - w / 2, gy - 4, gx + w / 2, gy + 0.5]);
  glow.push({ c: m2MordorGlowOf('mordorGate', art.c), x: gx - w / 2, y: gy - h + 0.25, w, h });
  for (const [dx, dy, r] of [[-13 * S, -32 * S, 5], [13 * S, -32 * S, 5], [-6 * S, -20 * S, 3.5], [6 * S, -20 * S, 3.5]]) {
    add.light({ x: gx + dx, y: gy + dy, r, c: '#ff7a2a', fire: true });
    glow.push({ torch: true, x: gx + dx, y: gy + dy + 1 });
  }
  // Crags along the inner feet of the two ranges, clear of the gate, the tower and the mountain.
  const R = plan.ranges ?? {};
  const spots = [];
  if (R.ephel) for (const d of [18, 40, 66, 94]) { const [x, y] = m2MordorAlong(R.ephel, d); spots.push([x + 10, y + 3]); }
  if (R.lithui) for (const d of [34, 58, 86, 120]) { const [x, y] = m2MordorAlong(R.lithui, d); spots.push([x, y + 9]); }
  const { x0, y0, x1, y1 } = plan.mordor ?? { x0: gx, y0: gy, x1: gx, y1: gy };
  for (const [fu, fv] of [[0.42, 0.78], [0.72, 0.84], [0.95, 0.9], [0.2, 0.95]]) spots.push([x0 + (x1 - x0) * fu, y0 + (y1 - y0) * fv]);
  const clear = (x, y) => [[gx, gy - 8, 32], [P.baradDur?.x, P.baradDur?.y - 4, 22], [P.doom?.x, P.doom?.y - 6, 26]].every(([cx, cy, r]) => cx === undefined || Math.hypot(x - cx, (y - cy) * 1.3) > r);
  spots.forEach(([x, y], i) => {
    if (!clear(x, y) || y > plan.H - 2) return;
    const w = 7 + Math.round(m2Hash(i, 1, 117) * 5);
    const h = Math.round(w * (1.5 + m2Hash(i, 2, 117) * 0.4));
    const seed = i % 5;
    m2Shadow(L, x + w * 0.35, y, w * 0.5, 1.6, 0.8);
    m2SouthThing(add, `mordorCrag${seed}`, x - w / 2, y - h, w, h + 0.25, y, (px, py) => m2MordorCragPx(px, py, w, h, seed), [x - w * 0.35, y - 1.5, x + w * 0.35, y + 0.5]);
  });
  ((m2.south ??= {}).glow ??= {}).gate = glow;
  m2.south.gateMs = performance.now() - t0;
});
