// scene2-land-eriador-willow.js: the Withywindle on the map from above (scene2.js), a dark slow stream that rises in
// the Barrow-downs and winds west through the Old Forest to the Brandywine, between muddy banks, shaded by the trees,
// with lily pads and fallen leaves on it and reeds on its banks; and Old Man Willow on its north bank, a huge grey-green
// willow whose long strands hang to the ground round a grey trunk split by a deep crack, its roots in the water.
// m2LandEriador (scene2-land-eriador.js) calls m2EriWithywindle.

// The stream's line: from the downs past the Old Forest's middle and the Withywindle's place to the nearest bend of the
// Brandywine to its west.
function m2EriStreamLine(plan) {
  const P = plan.places;
  const [w, f] = [P.withywindle, P.oldForest];
  const brandy = plan.rivers.brandywine ?? [];
  let mouth = [w.x - 30, w.y + 6];
  let best = 1e9;
  for (const [x, y] of brandy) {
    const d = Math.hypot(x - (w.x - 24), (y - w.y) * 1.6);
    if (x < w.x - 6 && d < best) { best = d; mouth = [x, y]; }
  }
  const src = [f.x + 18, f.y - 22];
  return m2Meander([src, [f.x + 9, f.y - 6], [f.x, f.y + 3], [w.x - 6, w.y + 1], mouth], 5, 2.2);
}

// The willow's canvas, 30 by 32 units, its foot at (15, 31): the trunk first, then the crown and its hanging curtain of
// strands with gaps through which the trunk and its crack show.
function m2EriWillowArt(season) {
  const tint = season === 'autumn' ? '#a89a48' : season === 'winter' ? '#b8bcb0' : null;
  const C = ['#17201a', '#26342a', '#3a4c3c', '#53664f', '#71836a', '#97a68a', '#bcc8a8'].map((c) => (tint ? hdMix(c, tint, 0.22) : c));
  const bark = ['#1a1512', '#2e2620', '#463b32', '#62564a', '#807466', '#a0968a'];
  return m2EriCanvas(`willow${season}`, 30, 32, (g) => {
    m2EriPixels(g, 0, 0, 120, 128, (px, py) => {
      const x = (px + 0.5 - 60) / 4;
      const y = (py + 0.5) / 4;
      // Roots fan out over the bank; the trunk leans a little and splits in a crack down its middle.
      const tw = 3.2 + Math.max(0, y - 24) * 0.55 + Math.max(0, 19 - y) * -0.05;
      const tx = x + (y - 31) * 0.08;
      if (y > 15 && y < 31.75 && Math.abs(tx) < tw) {
        const crack = Math.abs(tx - 0.4 + Math.sin(y * 1.3) * 0.35) < (y > 26 ? 0.9 : 0.4);
        if (crack) return y > 27 ? '#050404' : bark[0];
        const edge = Math.abs(tx) > tw - 0.3 || y > 31.4;
        const root = y > 27 && m2Hash(Math.floor(tx * 2), 1, 86) < 0.4;
        const k = edge ? 0 : (tx < -tw * 0.35 ? 4 : tx < tw * 0.2 ? 3 : 2) + (m2Hash(px, py >> 1, 85) < 0.12 ? -1 : 0) + (root ? 1 : 0);
        return bark[Math.max(0, Math.min(5, k))];
      }
      return null;
    });
    // The crown: a dome of leafy lobes, each lit on its upper left, its strands hanging in a curtain nearly to the ground
    // except over the trunk, where they part.
    const lobes = [-12, -8.5, -4.5, -1, 2.5, 6, 9.5, 12.5].map((lx, i) => [lx, 3.5 + (lx / 13) ** 2 * 6 + (i % 2) * 1.2, 3.4 + (i % 3) * 0.3]);
    lobes.push([-6, 7, 4], [0, 5.5, 4.2], [6.5, 7.5, 4], [-10, 10, 3.6], [10.5, 10.5, 3.6]);
    m2EriPixels(g, 0, 0, 120, 128, (px, py) => {
      const x = (px + 0.5 - 60) / 4;
      const y = (py + 0.5) / 4;
      // The lowest lobe the pixel falls in (squared distances, no allocation: this runs for every pixel).
      let best = -1;
      let bd = 0;
      for (let j = 0; j < lobes.length; j += 1) {
        const L = lobes[j];
        const dx = x - L[0];
        const dy = (y - L[1]) * 1.15;
        const d2 = (dx * dx + dy * dy) / (L[2] * L[2]);
        if (d2 <= 1 && (best < 0 || L[1] > lobes[best][1])) { best = j; bd = d2; }
      }
      if (best >= 0 && y <= 13.5 + Math.cos(x / 4.5) * 1.5) {
        const [lx, ly, lr] = lobes[best];
        const d = Math.sqrt(bd);
        if (d > 0.9 && y < ly) return C[0];
        const l = -(x - lx) / lr * 0.7 - (y - ly) / lr * 0.8 + (M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * 0.5 - (x / 14) * 0.3;
        return C[l > 0.75 ? 6 : l > 0.35 ? 5 : l > -0.05 ? 4 : l > -0.45 ? 3 : 2];
      }
      if (Math.abs(x) > 14 || y < 9) return null;
      const col = px >> 1;
      const len = 23 + m2Hash(col, 3, 87) * 6 - Math.abs(x) * 0.28 - (Math.abs(x + 0.3) < 4 ? 9 : 0);
      if (y > len || ((px & 1) && m2Hash(col, 9, 88) < 0.3)) return null;
      if (y > len - 0.5) return C[1];
      const k = (col % 3 === 0 ? 2 : col % 3 === 1 ? 3 : 4) - (x > 4 ? 1 : 0) - (y > len - 3 ? 1 : 0);
      return C[Math.max(1, k)];
    });
  });
}

function m2EriWithywindle(L, plan, season, add) {
  const bends = m2EriStreamLine(plan);
  const hw = (t) => 1.1 + t * 1.3;
  m2Stroke(L, bends, (t) => hw(t) + 1, M2_MAT.soil, { over: M2_LAND_MATS });
  m2Stroke(L, bends, hw, M2_MAT.water, { over: [...M2_LAND_MATS, M2_MAT.soil] });
  // The trees' shade lies over the whole stream, so it reads dark and slow.
  for (let k = 0; k < bends.length; k += 1) {
    const [x, y] = bends[k];
    const r = hw(k / bends.length) + 0.5;
    for (let py = Math.round((y - r) * 4); py < Math.round((y + r) * 4); py += 1) {
      for (let px = Math.round((x - r) * 4); px < Math.round((x + r) * 4); px += 1) {
        if (px < 0 || py < 0 || px >= L.pw || py >= L.ph) continue;
        const i = py * L.pw + px;
        if (L.mat[i] === M2_MAT.water) L.shade[i] = (px + py) % 3 ? 2 : 1;
      }
    }
  }
  L.decals.push((g) => {
    for (let k = 3; k < bends.length - 2; k += 1) {
      const [x, y] = bends[k];
      const h = m2Hash(k, 5, 89);
      if (h < 0.3) {
        pxBox(g, Math.round((x - 0.5) * 4) / 4, Math.round(y * 4) / 4, 1, 0.5, '#3f6a34');
        pxBox(g, Math.round((x - 0.25) * 4) / 4, Math.round(y * 4) / 4, 0.25, 0.25, '#7aa456');
        if (h < 0.08) pxBox(g, Math.round(x * 4) / 4, Math.round((y - 0.25) * 4) / 4, 0.25, 0.25, '#f4f0f8');
      } else if (h < 0.45) pxBox(g, Math.round((x + 0.5) * 4) / 4, Math.round((y + 0.5) * 4) / 4, 0.5, 0.25, '#b8862e');
      if (h > 0.7) {
        const side = h > 0.85 ? 1 : -1;
        const bx = x + 0.5;
        const by = y + side * (hw(k / bends.length) + 1.2);
        for (let j = 0; j < 3; j += 1) pxBox(g, Math.round((bx + j * 0.5) * 4) / 4, Math.round((by - 1 - (j % 2) * 0.5) * 4) / 4, 0.25, 1 + (j % 2) * 0.5, j % 2 ? '#6f8a3a' : '#4a6428');
      }
    }
  });
  // Old Man Willow on the north bank, a little past the stream's middle.
  const k = Math.floor(bends.length * 0.62);
  const [wx, wy] = bends[k];
  const [x, y] = [wx, wy - hw(0.62) - 1.5];
  const art = m2EriWillowArt(season);
  m2Shadow(L, x + 4, y - 0.5, 13, 4, 0.75);
  m2EriPut(add, art, x - 15, y - 31.5, y, [x - 4, y - 3, x + 4, y]);
  m2EriState.willow = { x, y };
  const [fx, fy] = bends[Math.min(bends.length - 1, k + 3)];
  m2EriState.fish = { x: fx, y: fy - hw(0.7) - 2.5 };
}
