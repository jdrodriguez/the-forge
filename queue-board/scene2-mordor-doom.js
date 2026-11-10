// scene2-mordor-doom.js: Barad-dur and Mount Doom on the map from above (scene2.js), drawn in full so the stand-ins in
// scene2-gondor.js step aside. Barad-dur is a huge tower of black iron and stone on a spur of the Ered Lithui: a
// stepped plinth, a buttressed bastion with its gate, two lesser spires, a tapering shaft lit by ember slits, a spiked
// cornice and a keep crowned by two horns, with the dark socket between them where the events area draws the Eye.
// Mount Doom rises from a broad skirt of ash in the plain of Gorgoroth: a steep cone streaked with gullies, lava running
// down its flanks onto a field of cooled flows, the road climbing to the Sammath Naur's door glowing on its east side,
// and smoke rolling from the crater. Vents on the southern plain smoulder with thin smoke. The lava, the door and the slits are drawn again after the night's shade (the
// light layer in scene2-mordor.js), so they burn bright in the dark; m2.war makes them burn by day too.

(m2.south ??= {}).mordor = true;

// Barad-dur's stone, outline to rim light, and Mount Doom's ash, outline to its lit face.
const M2_MORDOR_IRON = ['#030205', '#0a070c', '#130f17', '#1c1621', '#271f2c', '#3a2f40'];
const M2_MORDOR_CONE = ['#0c0808', '#1a1312', '#281e1b', '#382a25', '#4a3830', '#5e473a'];
const M2_MORDOR_LAVA = ['#8e2412', '#c2401a', '#ff7a1e', '#ffb43a', '#ffe68a'];

// Ember slits on the shaft and the bastion, as [across, up] in units.
const M2_MORDOR_SLITS = [[0, 38], [-3.4, 34], [2.9, 31], [0, 27], [-2.4, 22], [3.6, 20], [-4.6, 28], [0, 18], [-8, 9], [6.5, 9.5], [9.3, 17], [-9.3, 21]];
// Barad-dur 30 by 64 units (the art is 28 wide; scene2-eye.js reads plan.places.eye for a canvas this wide), its
// foot on the last row. m2MordorTowerMass says whether a pixel at height t units falls in a mass, from the front back,
// and leaves that mass's centre and half width in M2_MORDOR_M.
const M2_MORDOR_M = { c: 0, h: 0 };
function m2MordorMass(c, h) { M2_MORDOR_M.c = c; M2_MORDOR_M.h = h; return true; }
function m2MordorThorn(u, t, base, lo, hi) {
  const a = Math.abs(u);
  return t >= base && t < base + 2 && a >= lo && a < hi && Math.abs(((a + 0.5) % 1.6) - 0.8) < (base + 2 - t) * 0.4;
}
function m2MordorTowerMass(u, t) {
  if (t >= 50) {
    if (t >= 64) return false;
    const f = (t - 50) / 14;
    const c = 4.4 - f * f * 3.4 + Math.sin(f * 3) * 0.6;
    const half = 1.7 * (1 - f) ** 0.8 + 0.25;
    if (Math.abs(u - c) < half) return m2MordorMass(c, half);
    if (Math.abs(u + c) < half) return m2MordorMass(-c, half);
    return false;
  }
  if (t >= 44) { const h = 5.6 - (t - 44) * 0.08; if (Math.abs(u) < h) return m2MordorMass(0, h); }
  else if (t >= 42) { if (Math.abs(u) < 7) return m2MordorMass(0, 7); }
  else if (t >= 14) { const h = 7.6 - (t - 14) * 0.07; if (Math.abs(u) < h) return m2MordorMass(0, h); }
  if (t >= 10 && t < 36) {
    const barb = (t % 5) < 1.2 && t > 14 ? (1 - (t % 5) / 1.2) * 1.1 : 0;
    const half = 2.7 * Math.pow(1 - (t - 10) / 26, 0.8) + 0.2 + barb;
    if (Math.abs(u - 9.3) < half) return m2MordorMass(9.3, half);
    if (Math.abs(u + 9.3) < half) return m2MordorMass(-9.3, half);
  }
  if (t >= 4 && t < 14 && Math.abs(u) < 11.5) return m2MordorMass(0, 11.5);
  if (t < 4) { const h = t < 2 ? 14 : 13; return Math.abs(u) < h && m2MordorMass(0, h); }
  // Spikes along the bastion's top and the cornice: a row of black thorns.
  if (m2MordorThorn(u, t, 14, 7.4, 11.5) || m2MordorThorn(u, t, 44, 5.6, 7)) return m2MordorMass(u < 0 ? -9 : 9, 3);
  return false;
}
// One pixel of Barad-dur: stone lit on its left, ribs and courses, ember slits and the gate's mouth.
function m2MordorTowerPx(px, py) {
  const u = (px + 0.5) / 4 - 15;
  const t = 64 - (py + 0.5) / 4;
  if (t >= 50.4 && t < 56.5 && Math.abs(u) < 2.6 - Math.max(0, t - 54) * 0.3) return Math.abs(u) > 2 || t < 51 ? '#1a0806' : '#020102';
  if (t < 8 && Math.abs(u) < 2.4 && (t < 6 || u * u + (t - 6) ** 2 < 5.76)) return Math.abs(u) > 1.9 || t > 7.4 ? M2_MORDOR_IRON[2] : t < 1.5 ? '#8e2412' : '#040203';
  if (!m2MordorTowerMass(u, t)) return null;
  for (const [su, st] of M2_MORDOR_SLITS) if (Math.abs(u - su) < 0.3 && t > st && t < st + 1.6) return '#ff5a1a';
  const { c, h: half } = M2_MORDOR_M;
  const nx = (u - c) / half;
  if (half - Math.abs(u - c) < 0.3) return M2_MORDOR_IRON[0];
  let k = nx < -0.78 ? 5 : nx < -0.25 ? 4 : nx < 0.3 ? 3 : nx < 0.7 ? 2 : 1;
  if (Math.abs(Math.abs(nx) - 0.5) < 0.05 && half > 5) k -= 1;
  if ((py % 14 === 0 && t > 14) || (py % 10 === 0 && t < 14)) k -= 1;
  if (m2Hash(px >> 1, py >> 1, 83) < 0.06) k -= 1;
  if (k === 3 && M2_BAYER[(py & 3) * 4 + (px & 3)] < 0.12) k = 4;
  return M2_MORDOR_IRON[Math.max(1, k)];
}

// Mount Doom 44 by 36 units, its foot on the last row. The cone leans a little west; the door is on its east flank.
const M2_MORDOR_RUNS = [[-1.8, 0.85, -0.2, 1, 1.5], [2.2, 1.1, 0.15, 2.4, 8], [-0.3, 0.55, -0.05, 4.1, 13]];
const M2_MORDOR_ROAD = [[15, 0.6], [-7, 6.5], [7.5, 12.5], [-2, 17], [5.6, 20]];
function m2MordorConeHalf(t) { return t < 6 || t > 31 ? 0 : 4.6 + 8.6 * Math.pow((31 - t) / 25, 1.25); }
function m2MordorDoomPx(px, py) {
  const [u, t] = [(px + 0.5) / 4 - 22, 36 - (py + 0.5) / 4];
  const cc = -1 + t * 0.02;
  const ch = m2MordorConeHalf(t);
  const lump = 1 + (m2Noise(u, 0, 3.5, 85) - 0.5) * 0.16;
  const skirt = t < 3.2 ? 19 * Math.sqrt(Math.max(0, 1 - ((3.2 - t) / 3.2) ** 2)) : t < 13 ? 19 * Math.pow(Math.max(0, 1 - ((t - 3.2) / 9.8) ** 2), 0.7) * lump : 0;
  const crater = (u - cc) ** 2 + ((t - 31) * 2.6) ** 2 < 21.16;
  const inCone = Math.abs(u - cc) < ch;
  if (!inCone && Math.abs(u) > skirt && !crater) return null;
  if (crater) {
    const d = Math.sqrt((u - cc) ** 2 + ((t - 31.2) * 2.6) ** 2);
    if (d > 3.7) return t > 31 ? M2_MORDOR_CONE[2] : M2_MORDOR_CONE[5];
    return M2_MORDOR_LAVA[d < 1.3 ? 4 : d < 2.4 ? 3 : d < 3.2 ? 2 : 1];
  }
  const door = [cc + m2MordorConeHalf(20) * 0.55, 20];
  const dd = [u - door[0], t - door[1]];
  if (Math.abs(dd[0]) < 1.25 && dd[1] > -1 && (dd[1] < 0.4 || Math.hypot(dd[0], dd[1] - 0.4) < 1.25)) {
    const inner = Math.abs(dd[0]) < 0.7 && (dd[1] < 0.4 || Math.hypot(dd[0], dd[1] - 0.4) < 0.7);
    return inner ? M2_MORDOR_LAVA[dd[1] < -0.4 ? 4 : dd[1] < 0.3 ? 3 : 2] : M2_MORDOR_CONE[0];
  }
  for (const [a, w, drift, ph, end] of M2_MORDOR_RUNS) {
    if (t > 30.6 || t < end) continue;
    const x = cc + a + drift * (30.6 - t) * 2.2 + Math.sin(t / 2.6 + ph) * 0.9;
    const half = w * (0.42 + (30.6 - t) / 70);
    const d = Math.abs(u - x);
    if (d >= half) continue;
    const crust = m2Hash(Math.floor(t * 1.3), Math.round(ph * 10), 84) < 0.22 && d > half * 0.25;
    if (crust) return '#4a160c';
    return M2_MORDOR_LAVA[d < half * 0.3 && (py + ph * 3) % 5 ? 3 : d < half * 0.7 ? 2 : 1];
  }
  for (let k = 1; k < M2_MORDOR_ROAD.length; k += 1) {
    const [[ax, at], [bx, bt]] = [M2_MORDOR_ROAD[k - 1], M2_MORDOR_ROAD[k]];
    if (t < Math.min(at, bt) - 0.6 || t > Math.max(at, bt) + 0.6) continue;
    const f = Math.max(0, Math.min(1, (t - at) / (bt - at || 1)));
    const x = cc + ax + (bx - ax) * f;
    if (Math.abs(u - x) < 0.6 * (1 + Math.abs(bx - ax) / Math.abs(bt - at || 1) * 0.25)) return Math.abs(u - x) > 0.35 ? M2_MORDOR_CONE[2] : '#6a554a';
  }
  const [c, half] = inCone ? [cc, ch] : [0, skirt];
  const nx = (u - c) / Math.max(1, half);
  const b0 = M2_BAYER[(py & 3) * 4 + (px & 3)];
  if (!inCone && t < 3.2 && b0 > t / 3.2 + 0.1) return null;
  if (!inCone && t < 2.4) return b0 < 0.5 ? M2_MORDOR_CONE[1] : '#2b2527';
  if (half - Math.abs(u - c) < 0.3 && (inCone || t > 4)) return M2_MORDOR_CONE[0];
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.35;
  let k = nx + b < -0.55 ? 5 : nx + b < -0.12 ? 4 : nx + b < 0.32 ? 3 : nx + b < 0.7 ? 2 : 1;
  const gully = m2Hash(Math.round(nx * (inCone ? 14 : 22)), Math.floor(t / 3), 86);
  if (gully < 0.28) k -= 1; else if (gully > 0.9) k += 1;
  if (!inCone && t > 10) k -= 1;
  if (m2Hash(px, py, 87) < 0.03) k += m2Hash(px, py, 88) < 0.5 ? 1 : -2;
  return M2_MORDOR_CONE[Math.max(1, Math.min(5, k))];
}
// The field of cooled flows round the mountain's foot, rx by ry units: tongues of black basalt reaching out, their
// seams still red near the mountain.
function m2MordorFlowPx(px, py, rx, ry) {
  const [u, v] = [(px + 0.5) / 4 - rx, (py + 0.5) / 4 - ry];
  const a = Math.atan2(v / ry, u / rx);
  const d = Math.sqrt((u / rx) ** 2 + (v / ry) ** 2);
  const reach = 0.42 + 0.58 * m2Noise(Math.cos(a) * 4 + 5, Math.sin(a) * 4 + 5, 0.6, 89) ** 3;
  if (d > reach) return null;
  const seam = m2Noise(u, v, 2.2, 90);
  const hot = d < reach * 0.6;
  // Under the mountain's skirt the seams stay dark, so nothing glows through it at night.
  if (Math.abs(seam - 0.5) < 0.035) return hot && (v > ry - 1 || Math.abs(u) > 20) ? M2_MORDOR_LAVA[d < reach * 0.35 ? 2 : 1] : '#3a1610';
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  if (d > reach - 0.08 && b > (reach - d) * 12) return null;
  const rope = Math.sin((Math.hypot(u, v * 2) - m2Noise(u, v, 3, 92) * 4) * 2.2) > 0.75;
  const k = rope ? 3 : (seam > 0.5 ? 2 : 1) + (m2Hash(px >> 1, py >> 1, 91) < 0.07 ? 1 : 0);
  return M2_MORDOR_BASALT[k];
}
const M2_MORDOR_BASALT = ['#140e0d', '#211716', '#2c1f1c', '#3e2b25'];

// The smoke from the crater: twelve frames of puffs rolling up and drifting east, dark with lit tops, their bellies
// red near the fire. Painted once ever.
let m2MordorPlume = null;
function m2MordorSmokeFrames() {
  if (m2MordorPlume) return m2MordorPlume;
  const C = ['#2a2222', '#3e3434', '#544848', '#6e6262', '#b8481c', '#7a2a16', '#5a2a20'].map(m2Pack);
  m2MordorPlume = [];
  for (let f = 0; f < 12; f += 1) {
    const c = document.createElement('canvas');
    [c.width, c.height] = [120, 120];
    const g = c.getContext('2d');
    const img = g.createImageData(120, 120);
    const out = new Uint32Array(img.data.buffer);
    for (let i = 9; i >= 0; i -= 1) {
      const a = ((i + f / 12) / 10) % 1;
      const [x, y, r] = [(6 + a * a * 18 + Math.sin(a * 7 + i) * 1.1) * 4, (27.5 - a * 21) * 4, (1.6 + a * 3.8) * 4];
      for (let py = Math.max(0, Math.floor(y - r)); py < Math.min(120, Math.ceil(y + r)); py += 1) {
        for (let px = Math.max(0, Math.floor(x - r)); px < Math.min(120, Math.ceil(x + r)); px += 1) {
          const [dx, dy] = [px + 0.5 - x, py + 0.5 - y];
          const d = Math.hypot(dx, dy) / r;
          const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
          if (d > 1 - b * 0.18 || (a > 0.62 && b < (a - 0.62) * 2.4)) continue;
          let k;
          if (a < 0.28 && dy > -r * 0.1) k = a < 0.12 ? 4 : dy > r * 0.5 ? 5 : 6;
          else { const lit = -(dx + dy * 1.2) / r + b * 0.4; k = lit > 0.7 ? 3 : lit > 0 ? 2 : lit > -0.7 ? 1 : 0; }
          out[py * 120 + px] = C[k];
        }
      }
    }
    g.putImageData(img, 0, 0);
    m2MordorPlume.push(c);
  }
  return m2MordorPlume;
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  const P = plan.places;
  const glow = [];
  // Barad-dur on its dark spur, its shadow falling to the lower right.
  const bd = P.baradDur;
  m2Blob(L, bd.x, bd.y - 1, 18, 7, M2_MAT.rock, { wob: 2.5, seed: 92, aux: (nx, ny) => 150 - nx * 60 - ny * 70 });
  m2Shadow(L, bd.x + 9, bd.y + 1, 15, 3.4, 0.75);
  const tower = m2SouthThing(add, 'mordorTower', bd.x - 15, bd.y - 64, 30, 64.25, bd.y, m2MordorTowerPx, [bd.x - 13, bd.y - 4, bd.x + 13, bd.y + 0.5]);
  glow.push({ c: m2MordorGlowOf('mordorTower', tower.c), x: bd.x - 15, y: bd.y - 64, w: 30, h: 64.25 });
  plan.places.eye = { x: bd.x, y: bd.y - 53.4 };
  add.light({ x: bd.x, y: bd.y - 1, r: 6, c: '#c2401a', fire: true });
  // Mount Doom: the cooled flows on the ground round its foot, then the mountain.
  const dm = P.doom;
  const [frx, fry] = [27, 10];
  const flow = m2SouthArt('mordorFlow', frx * 2, fry * 2, (px, py) => m2MordorFlowPx(px, py, frx, fry));
  L.decals.push((g) => g.drawImage(flow, dm.x - frx, dm.y - fry + 1, frx * 2, fry * 2));
  glow.push({ c: m2MordorGlowOf('mordorFlow', flow), x: dm.x - frx, y: dm.y - fry + 1, w: frx * 2, h: fry * 2, soft: 0.6 });
  m2Shadow(L, dm.x + 10, dm.y + 0.5, 20, 3.6, 0.7);
  const doom = m2SouthThing(add, 'mordorDoom', dm.x - 22, dm.y - 36, 44, 36.25, dm.y, m2MordorDoomPx, [dm.x - 19, dm.y - 6, dm.x + 19, dm.y + 0.5]);
  glow.push({ c: m2MordorGlowOf('mordorDoom', doom.c), x: dm.x - 22, y: dm.y - 36, w: 44, h: 36.25 });
  const top = { x: dm.x - 0.4, y: dm.y - 31 };
  const door = { x: dm.x - 1 + 0.4 + m2MordorConeHalf(20) * 0.55, y: dm.y - 20 };
  plan.places.sammathNaur = door;
  add.light({ x: top.x, y: top.y, r: 14, c: '#ff6a2a', fire: true, always: true });
  add.light({ x: door.x, y: door.y, r: 7, c: '#ff9a40', fire: true, always: true });
  const frames = m2MordorSmokeFrames();
  const smoke = (g, tick, reduced) => g.drawImage(frames[reduced ? 0 : Math.floor(tick / 2) % 12], top.x - 6, top.y - 27, 30, 30);
  smoke.item = true;
  smoke.z = dm.y + 0.4;
  add.anim(smoke);
  // Vents on the southern plain: a pit with fire at its heart and a thin smoke, clear of the mountain and the tower.
  const { x0, y0, x1, y1 } = plan.mordor;
  const vents = [[0.3, 0.86], [0.6, 0.93], [0.86, 0.72], [0.5, 0.7]].map(([fu, fv]) => ({ x: x0 + (x1 - x0) * fu, y: y0 + (y1 - y0) * fv }))
    .filter((v) => Math.hypot(v.x - dm.x, (v.y - dm.y) * 1.5) > 26 && Math.hypot(v.x - bd.x, (v.y - bd.y) * 1.5) > 18 && v.y < plan.H - 4);
  const pit = m2SouthArt('mordorVent', 6, 3, (px, py) => {
    const d = Math.hypot((px + 0.5 - 12) / 12, (py + 0.5 - 6) / 6);
    return d > 1 ? null : d < 0.3 ? M2_MORDOR_LAVA[3] : d < 0.5 ? M2_MORDOR_LAVA[1] : d < 0.75 ? '#0a0707' : py < 6 ? '#463c38' : '#1c1617';
  });
  L.decals.push((g) => { for (const v of vents) g.drawImage(pit, v.x - 3, v.y - 1.5, 6, 3); });
  for (const [i, v] of vents.entries()) {
    glow.push({ c: m2MordorGlowOf('mordorVent', pit), x: v.x - 3, y: v.y - 1.5, w: 6, h: 3, soft: 0.5 });
    add.light({ x: v.x, y: v.y, r: 4, c: '#ff6a2a', fire: true });
    const puff = (g, tick, reduced) => {
      g.globalAlpha = 0.6;
      g.drawImage(frames[reduced ? 0 : Math.floor(tick / 3 + i * 4) % 12], v.x - 2.4, v.y - 11.4, 12, 12);
      g.globalAlpha = 1;
    };
    puff.item = true;
    puff.z = v.y + 0.2;
    add.anim(puff);
  }
  (m2.south.glow ??= {}).doom = glow;
  m2.south.doomMs = performance.now() - t0;
});
