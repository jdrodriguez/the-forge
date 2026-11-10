// scene2-land-eriador-trolls.js: the Trollshaws on the map from above (scene2.js): a trampled clearing among rough
// wooded hills where Bert, Tom and William stand turned to stone, each about 40 units tall, grey and cracked, green with
// moss on everything that faces the sky and spotted white with birds' droppings: Bert hunched with his fists hanging,
// Tom with an arm raised in the quarrel, and William bent double over the cold ring of their fire with its spit.
// m2LandEriador (scene2-land-eriador.js) calls m2EriTrolls.

const M2_ERI_ROCK = ['#1c1d20', '#313338', '#494c4f', '#626666', '#80837f', '#a3a59d'];
const M2_ERI_MOSS = ['#2f3e20', '#4a5e2a', '#6a8038'];
// A troll as ellipses [cx, cy, rx, ry] in units, back to front: legs and feet, the body, a hump of shoulders, the
// hanging head with its jaw, nose and ears, and the arms. pose: 'hunch', 'raise' or 'bend'.
function m2EriTrollParts(pose) {
  if (pose === 'bend') {
    return [[20, 30, 3.2, 6.5], [24.5, 31, 3, 6], [19.5, 36.8, 3.6, 1.4], [25, 37, 3.4, 1.3], [21, 23, 6, 6],
      [14, 19, 8, 6.5], [8.5, 18.5, 5.5, 5.8], [11, 26, 2.4, 6], [9.5, 32, 2.6, 2.4], [4, 22, 3.8, 3.6], [3.8, 25, 3.2, 2],
      [1.6, 23, 1.6, 1.3], [6.5, 19.5, 1.1, 1.4], [16, 24, 2.4, 5.5], [15, 29.5, 2.6, 2.2]];
  }
  const raise = pose === 'raise';
  return [[6.5, 31, 3, 6.5], [12.5, 31, 3, 6.5], [6, 36.8, 3.4, 1.4], [13, 36.8, 3.4, 1.4], [9.5, 21, 7, 8.5],
    [9.5, 25, 6, 5.5], [9.5, 14.5, 8, 4.5], [9.5, 11, 3.8, 3.6], [9.5, 13.5, 3.4, 1.9], [9.5, 12, 1.2, 1.7],
    [5.6, 10.5, 0.9, 1.4], [13.4, 10.5, 0.9, 1.4], [2.4, 19.5, 2.3, 6.5], [2.1, 26.5, 2.4, 5], [2.3, 31.5, 2.7, 2.3],
    ...(raise ? [[16.5, 10, 2.2, 5.5], [17, 4.5, 2.3, 2.2]] : [[16.6, 19.5, 2.3, 6.5], [16.9, 26.5, 2.4, 5], [16.7, 31.5, 2.7, 2.3]])];
}
// A troll's canvas, w by 38 units, its feet on the bottom row: each pixel takes the light of the frontmost ellipse it
// falls in, with an outline where the figure ends, cracks, moss on top surfaces, droppings, and a face in the head.
function m2EriTrollArt(pose, season) {
  const w = pose === 'bend' ? 28 : 19;
  return m2EriCanvas(`troll${pose},${season}`, w, 38, (g) => {
    const parts = m2EriTrollParts(pose);
    // Each pixel's frontmost part and where in it the pixel falls, worked out once.
    const [PW, PH] = [w * 4, 152];
    const K = new Int8Array(PW * PH).fill(-1);
    const NX = new Float32Array(PW * PH);
    const NY = new Float32Array(PW * PH);
    // Back to front, each part claims the pixels inside it, so the frontmost part wins.
    parts.forEach(([cx, cy, rx, ry], k) => {
      for (let py = Math.max(0, Math.floor((cy - ry) * 4)); py < Math.min(PH, Math.ceil((cy + ry) * 4)); py += 1) {
        const ny = ((py + 0.5) / 4 - cy) / ry;
        for (let px = Math.max(0, Math.floor((cx - rx) * 4)); px < Math.min(PW, Math.ceil((cx + rx) * 4)); px += 1) {
          const nx = ((px + 0.5) / 4 - cx) / rx;
          if (nx * nx + ny * ny > 1) continue;
          const i = py * PW + px;
          K[i] = k; NX[i] = nx; NY[i] = ny;
        }
      }
    });
    m2MtLatInit();
    const NZ = new Float32Array((PW >> 1) * (PH >> 1));
    for (let y = 0; y < PH >> 1; y += 1) for (let x = 0; x < PW >> 1; x += 1) NZ[y * (PW >> 1) + x] = m2MtN(x / 2.5 + 7, y / 2.5);
    const kAt = (px, py) => (px < 0 || py < 0 || px >= PW || py >= PH ? -1 : K[py * PW + px]);
    const snow = season === 'winter';
    const R = M2_ERI_ROCK.map((c) => hdMix(c, { hunch: '#9a7a5a', raise: '#6a8a5a', bend: '#5a6a90' }[pose], 0.14));
    m2EriPixels(g, 0, 0, w * 4, 152, (px, py) => {
      const i = py * PW + px;
      const k = K[i];
      if (k < 0) return null;
      const nx = NX[i];
      const ny = NY[i];
      if (kAt(px - 1, py) < 0 || kAt(px + 1, py) < 0 || kAt(px, py - 1) < 0 || kAt(px, py + 1) < 0) return R[0];
      if (kAt(px + 2, py) < 0 || kAt(px, py + 2) < 0) return R[1];
      // A seam where a part in front meets one behind.
      const kb = kAt(px, py - 2);
      if (kb >= 0 && kb !== k && m2Hash(px, py, 90) < 0.7) return R[1];
      const up = ny < -0.25 && Math.abs(nx) < 0.85;
      const n = NZ[(py >> 1) * (PW >> 1) + (px >> 1)] * 0.8 + m2Hash(px >> 2, py >> 2, k) * 0.2;
      if (up && snow && n > 0.4) return n > 0.6 ? '#f4f8fa' : '#c9d4dc';
      if (up && n > 0.52) return M2_ERI_MOSS[n > 0.68 ? 2 : nx < 0 ? 1 : 0];
      if (ny < 0 && m2Hash(px, py, 91) < 0.018) return '#f2efe6';
      if (ny < 0 && m2Hash(px, py - 1, 91) < 0.018) return R[3];
      if (m2Hash(px >> 1, py >> 2, 92 + k) < 0.035) return R[1];
      const light = -0.65 * nx - 0.6 * ny + (M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * 0.45;
      return R[light > 0.7 ? 5 : light > 0.25 ? 4 : light > -0.2 ? 3 : light > -0.6 ? 2 : 1];
    });
    // The face: a heavy brow, deep sockets with a pale glint, the mouth's crack.
    const face = pose === 'bend' ? [[2.6, 21.6], [5, 21.4]] : [[8.2, 10.6], [10.8, 10.6]];
    for (const [ex, ey] of face) {
      pxBox(g, ex - 0.5, ey - 0.75, 1.25, 0.5, R[4]);
      pxBox(g, ex - 0.25, ey - 0.25, 0.75, 0.5, R[0]);
    }
    if (pose === 'bend') pxBox(g, 1.5, 24.5, 3, 0.25, R[0]);
    else pxBox(g, 8, 14, 3, 0.25, R[0]);
  });
}

// The clearing: trampled ground, the fire's cold ring with charred logs and the spit on its forked sticks, the three
// trolls round it, and trees and rough hills about. It keeps west of any realm it would run into.
function m2EriTrolls(L, plan, season, add) {
  const c = plan.places.trollshaws;
  const realm = plan.realms.find((r) => c.y > r.y - 10 && c.y < r.y + r.h && c.x > r.x - 16 && c.x < r.x + r.w);
  const cx = realm && c.x > realm.x - 20 ? realm.x - 20 : c.x;
  const base = c.y - 4;
  m2Blob(L, cx - 6, base + 2, 17, 5, M2_MAT.path, { wob: 2, seed: 93, aux: () => 120, keep: M2_MAT.water });
  const [fx, fy] = [cx - 8, base + 3.5];
  L.decals.push((g) => {
    m2Raster(g, fx - 2.5, fy - 1.25, 20, 10, (px, py) => {
      const d = Math.hypot((px - 9.5) / 9.5, (py - 4.5) / 4.5);
      if (d > 1) return null;
      if (d > 0.72) return (Math.floor(Math.atan2(py - 4.5, px - 9.5) * 2.5) % 2 ? M2_PAL.stone[4] : M2_PAL.stone[2]);
      return m2Hash(px, py, 94) < 0.3 ? '#2a2422' : m2Hash(px, py, 95) < 0.5 ? '#5a5250' : '#77706c';
    });
    pxBox(g, fx - 1.5, fy - 0.25, 3, 0.5, '#2a1a12');
    pxBox(g, fx - 0.5, fy - 0.75, 0.75, 1.5, '#3a2416');
  });
  const trolls = [['hunch', cx - 24, base - 3], ['raise', cx + 2, base - 2], ['bend', cx - 11, base + 1.5]];
  for (const [pose, x, y] of trolls.sort((a, b) => a[2] - b[2])) {
    const art = m2EriTrollArt(pose, season);
    m2Shadow(L, x + art.w / 2 + 3, y - 0.5, art.w * 0.55, 2.2, 0.8);
    m2EriPut(add, art, x, y - 38, y, [x + 2, y - 3, x + art.w - 2, y]);
  }
  // The spit over the fire, in front of William's hands.
  m2Thing(add, fx - 3, fy - 4, 6, 4.5, fy + 0.4, (g) => {
    pxBox(g, 0.5, 1, 0.5, 3.5, '#4a2f1e');
    pxBox(g, 5, 1, 0.5, 3.5, '#4a2f1e');
    pxBox(g, 0, 1, 6, 0.5, '#6e4a2e');
    pxBox(g, 0.25, 0.5, 0.5, 0.5, '#2a1a12');
    pxBox(g, 5.25, 0.5, 0.5, 0.5, '#2a1a12');
  });
  const G = m2EriGrass(season).map((col) => hdMix(col, '#2a3a24', 0.3));
  for (const [dx, dy, rx, hgt, s] of [[-18, -14, 9, 7, 1], [6, -16, 10, 8, 2]]) {
    const art = m2EriCanvas(`tsh${rx},${season}`, rx * 2, hgt + 8, (g) => m2EriHill(g, 0, 0, rx, 4, hgt, G, 0, s));
    m2EriPut(add, art, cx + dx - rx, base + dy - hgt - 8, base + dy);
  }
  for (const [dx, dy, kind, r] of [[-28, -12, 'ever', 5], [-8, -20, 'dark', 6], [14, -10, 'oak', 5], [-27, 8, 'pine', 4], [12, 9, 'oak', 5], [2, 12, 'bush', 3], [-18, 13, 'bush', 3]]) {
    if (m2EriClear(L, plan, cx + dx, base + dy - r * 0.5, r, r * 0.6)) m2Tree(L, add, cx + dx, base + dy, kind, r, season, Math.abs(Math.round(dx * 7 + dy)));
  }
}
