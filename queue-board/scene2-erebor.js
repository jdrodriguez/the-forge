// scene2-erebor.js: Erebor on the map from above (scene2.js), the dwarves' realm. The Lonely Mountain fills the back of the
// region: one great peak capped with snow, its rock in ridges and gullies lit from the west, its spurs reaching down
// either side of the valley where the Front Gate is carved (scene2-erebor-gate.js: the gate, the statues of the dwarf
// kings either side, the hoard glinting within, the patterned court and its braziers). The river Running issues from
// under the eastern spur and runs south past the stations to the Long Lake (scene2-erebor-river.js). The forge stands
// on the court's west side against the rock, the mine's mouth is cut in the western spur with rails and a cart running
// down from it, and the armor stand, gem rock and ore heap stand beside the rails (scene2-erebor-works.js). Below the
// road, the dwarves' yard (scene2-erebor-yard.js). Everything is laid out from the realm's own box.

// The realm's layout from its box: the gate's middle, the court's rows (down to just above the stations), the
// mountain's skyline and foot at each x, and the strips either side of the stations.
function m2EreLayout(r) {
  const cx = Math.round((r.ux0 + r.ux1) / 2);
  const courtBot = Math.min(r.roadY + 9, r.block.y0 - 2);
  const cd = Math.max(14, Math.min(26, Math.round(r.back * 0.3)));
  const courtTop = courtBot - cd;
  const fh = Math.max(26, Math.min(40, Math.round(r.back * 0.5)));
  const fw = Math.min(58, Math.round(fh * 1.55));
  // The mountain's foot: the facade's row behind the gate, falling toward the court's sides as the spurs come down.
  const foot = (x) => Math.min(r.roadY - 5, courtTop + Math.max(0, Math.abs(x - cx) - fw / 2 - 3) * 0.5 + Math.sin(x / 3.1) * 0.6 + Math.sin(x / 9.3) * 1.2);
  const pk = cx + r.w * 0.05;
  const drop = (courtTop - fh * 0.4 - r.y) * 0.8;
  const sky = (x) => r.y + 1 + drop * Math.min(1, Math.abs((x - pk) / (r.w / 2 + 6)) ** 1.25) + (m2Noise(x, 0, 6, 3) - 0.5) * 3 + (m2Noise(x, 0, 2, 4) - 0.5);
  const left = { x0: r.x + 2, x1: r.block.x0 - 1 };
  const right = { x0: r.block.x1 + 1, x1: r.x + r.w - 2 };
  return { r, cx, pk, courtTop, courtBot, cd, fh, fw, foot, sky, left, right, top: courtTop - fh };
}

function m2Erebor(L, r, plan, season, add) {
  const t0 = performance.now();
  const E = m2EreLayout(r);
  E.spots = [];
  E.keep = [r.block, { x0: r.block.x0, y0: r.block.y0 - 28, x1: r.block.x1, y1: r.block.y0 }];
  // The yard's foot, and where its rune bands cross it: below the last row of anvils, and down its middle when no
  // column of anvils stands there. A row of dwarves with their names fills all but a few units of the 46 between rows,
  // so a band between them or along the court's front ran under their feet and through their bodies (2026-11-27).
  E.yardBot = r.y + r.h - 3;
  const mine = plan.stations.filter((s) => s.realm === r);
  const rows = [...new Set(mine.map((s) => s.y))].sort((a, b) => a - b);
  E.bands = (rows.length ? [rows.at(-1) + 5] : []).filter((y) => y < E.yardBot - 6).map(Math.round);
  E.spine = mine.every((s) => Math.abs(s.x - E.cx) > 10);
  m2EreRiverRoute(E, plan);
  m2EreCourt(L, add, E);
  m2EreMountain(L, E, season);
  m2EreFacade(L, add, E);
  m2EreRiver(L, add, E, plan);
  m2EreBraziers(L, add, E);
  m2EreYardPave(L, E);
  m2EreWorks(L, add, E, season);
  m2EreWilds(L, add, E, season);
  // The spots once the yard's things are placed too (the gem rock's among them).
  r.spots.push(...E.spots);
  m2.ereMs = performance.now() - t0;
}

// The mountain above the court, painted once per size and season into a canvas and laid over the ground: a few broad
// ridges falling from the peak, each lit on its west face and in shadow on its east, snow on the summit lying longer
// in the gullies and thinning down the slopes in patches, scree at the foot, a carved band in buttresses behind the
// court that fades into the spurs, and rubble.
const m2EreArt = new Map();
// A canvas w by h units painted pixel by pixel by rule(px, py) (a colour or nothing) straight into its image data,
// far quicker than a rectangle per run where the colours change at every pixel.
const m2EreHex = new Map();
function m2EreImage(w, h, rule) {
  const { c, g } = m2Canvas(w, h);
  const img = g.createImageData(c.width, c.height);
  const out = new Uint32Array(img.data.buffer);
  for (let py = 0, i = 0; py < c.height; py += 1) {
    for (let px = 0; px < c.width; px += 1, i += 1) {
      const col = rule(px, py);
      if (!col) continue;
      let v = m2EreHex.get(col);
      if (v === undefined) { v = m2Pack(col); m2EreHex.set(col, v); }
      out[i] = v;
    }
  }
  g.putImageData(img, 0, 0);
  return { c, g };
}
const M2_ERE_ROCK = ['#1b1920', '#29262f', '#37333d', '#47424d', '#58525e', '#6c6571', '#837c87', '#a29ba4'];
const M2_ERE_SNOW = ['#56657c', '#7a8ba4', '#9eb0c6', '#c4d2e2', '#e4ecf5', '#ffffff'];
function m2EreMountain(L, E, season) {
  const { r, foot, sky } = E;
  const [x0, y0, w] = [r.x - 2, r.y, r.w + 4];
  const h = Math.ceil(r.roadY - 4 - y0);
  for (let x = x0; x < x0 + w; x += 0.25) m2Rect(L, x, sky(x), 0.25, foot(x) - sky(x), M2_MAT.rock, 120);
  const key = `mt${w},${h},${E.fw},${Math.round(E.courtTop - y0)},${Math.round(E.pk - x0)},${season}`;
  if (!m2EreArt.has(key)) m2EreArt.set(key, m2EreMountainArt(E, x0, y0, w, h, season));
  const art = m2EreArt.get(key);
  L.decals.push((g) => g.drawImage(art, x0, y0, w, h));
}
function m2EreMountainArt(E, x0, y0, w, h, season) {
  const { pk, foot, sky } = E;
  const snowLine = season === 'winter' ? 0.34 : season === 'summer' ? 0.1 : 0.14;
  const W = w * 4;
  const top = new Float32Array(W);
  const bot = new Float32Array(W);
  const seams = new Uint8Array(W);
  for (let px = 0; px < W; px += 1) {
    const x = x0 + px / 4;
    top[px] = (sky(x) - y0) * 4;
    bot[px] = (foot(x) - y0) * 4;
    const sm = m2Hash(Math.floor(px / 5 + m2Noise(x, 0, 4, 9) * 2), 0, 66);
    seams[px] = sm < 0.2 ? 2 : sm > 0.75 ? 5 : 4;
  }
  // The ridges' kinks from noise sampled once a unit and blended between, far cheaper than noise at every pixel.
  const gw = w + 2;
  const kink = new Float32Array(gw * (h + 2));
  for (let j = 0; j < h + 2; j += 1) for (let i = 0; i < gw; i += 1) kink[j * gw + i] = m2Noise(x0 + i, y0 + j, 7, 7) - 0.5;
  const kinkAt = (px, py) => {
    const [i, j, fx, fy] = [px >> 2, py >> 2, (px & 3) / 4, (py & 3) / 4];
    const k = j * gw + i;
    return (kink[k] * (1 - fx) + kink[k + 1] * fx) * (1 - fy) + (kink[k + gw] * (1 - fx) + kink[k + gw + 1] * fx) * fy;
  };
  const R = M2_ERE_ROCK;
  const S = M2_ERE_SNOW;
  const noiseAt = (px, py, off) => kinkAt(Math.min(W - 5, (px + off) % W), py);
  const { c, g } = m2EreImage(w, h, (px, py) => {
    if (py < top[px] || py >= bot[px]) return null;
    const x = x0 + px / 4;
    const y = y0 + py / 4;
    const toBot = bot[px] - py;
    if (py - top[px] < 1) return R[0];
    const dith = M2_BAYER[(py & 3) * 4 + (px & 3)];
    // The carved band behind the court: dressed rock in buttresses either side of the facade, fading out toward the
    // spurs, where the mountain's own rock and scree run down to the ground.
    const band = 20 * Math.max(0, Math.min(1, 1 - (Math.abs(x - E.cx) - E.fw / 2 - 2) / 14));
    if (toBot < 2) return R[0];
    if (toBot < band) {
      const col = Math.floor((px - Math.round((E.cx - x0) * 4)) / 40);
      const inB = ((px - Math.round((E.cx - x0) * 4)) % 40 + 40) % 40;
      if (inB < 7) return inB === 6 ? R[1] : toBot > band - 2 ? R[7] : R[inB < 3 ? 6 : 5];
      const k = seams[px] - (toBot < 8 ? 1 : 0) + (dith < 0.25 ? 1 : 0) - (x > E.pk ? 1 : 0) - (col % 2 ? 1 : 0);
      return toBot > band - 2 ? R[5] : R[Math.max(1, Math.min(7, k))];
    }
    // Broad ridges falling from the peak: across each, the west face rises from its gully to the crest in light,
    // brightest at the crest, and the east face falls away in shadow, lifting a little toward the next gully.
    const a = Math.atan2(x - pk, (y - y0 + 3) * 1.5) * 3.3 + kinkAt(px, py) * 0.55;
    const n = Math.floor(a);
    const f = a - n;
    const t = (py - top[px]) / Math.max(1, bot[px] - top[px]);
    const westFace = f < 0.58;
    const side = x < pk ? 0.6 : -0.5;
    let v = westFace ? 3.6 + (f / 0.58) * 2.4 : 1.6 + ((f - 0.58) / 0.42) * 1.4;
    v += side - t * 1.6 + (dith - 0.5) * 0.9;
    // Snow: on the summit, lying longer in the gullies and on the lit faces, and thinning down the ridges in patches.
    const gul = f < 0.12 || f > 0.9;
    const sl = snowLine * (westFace ? 1.2 : 0.8) * (gul ? 1.35 : 1) + noiseAt(px, py, 97) * 0.12;
    const thin = (t - sl) / 0.22;
    if (t < sl || (thin < 1 && noiseAt(px, py, 211) * 1.6 + 0.5 > 0.35 + thin * 0.75 + (westFace ? 0 : 0.2))) {
      const k = Math.floor(v * 0.85 + 0.6);
      return S[Math.max(0, Math.min(5, k))];
    }
    if (Math.abs(f - 0.58) < 0.02 && t < 0.85) return R[x < pk ? 7 : 6];
    if (f < 0.02) return R[1];
    // Scree at the foot of the slopes: loose stones speckled light and dark.
    if (t > 0.78 && m2Hash(px, py, 75) < 0.22) v += m2Hash(px, py, 76) < 0.5 ? 2 : -1.5;
    if (m2Hash(px >> 2, py >> 1, 74 + n) > 0.93) v -= 1.2;
    return R[Math.max(1, Math.min(7, Math.floor(v)))];
  });
  // Rubble at the cliff's foot: a scatter of stones, each lit on its upper left.
  for (let i = 0; i < w / 2.5; i += 1) {
    const x = x0 + m2Hash(i, 1, 67) * w;
    if (Math.abs(x - E.cx) < E.fw / 2 + 2) continue;
    const y = foot(x) - 0.75 - m2Hash(i, 2, 67) * 1.5;
    const s = 0.5 + Math.floor(m2Hash(i, 3, 67) * 3) * 0.25;
    pxBox(g, x - x0, y - y0, s + 0.25, s, R[2]);
    pxBox(g, x - x0, y - y0, s, 0.25, R[6]);
  }
  return c;
}

// A rocky outcrop on the ground: a mound of rock lit on its upper left with facets, rx by ry units round (x, y).
function m2Outcrop(L, x, y, rx, ry, seed) {
  m2Shadow(L, x + rx * 0.3, y + ry * 0.6, rx, ry * 0.6, 0.8);
  m2Blob(L, x, y, rx, ry, M2_MAT.rock, { wob: 2, seed, aux: (nx, ny) => 140 - nx * 70 - ny * 60 + (Math.floor(Math.atan2(ny, nx) * 3) % 2 ? 30 : -20) });
}
