// scene2-weather.js: the weather over the map from above (scene2.js). It is the side view's weather (scene-weather.js):
// the real weather at the owner's place (snap.weather, from Open-Meteo every 15 minutes) when the report is under
// an hour old, else the schedule by season, and the test override in localStorage['board-weather'] over both. Each frame
// asks scene-weather.js's wxUpdate for it and copies it into m2.weather { kind, amount, wind, storm, cover, snow, wet,
// flash, source, label } for the map's other files, which read it with m2.weather?.
//
// The rule: weather never covers the work. So over the realms there are only cloud shadows, soft and see-through,
// drifting with the wind over everything (the more overcast, the more of them); real cloud tops, lit from the upper left
// and puffed up, drift only over the empty lands and the map's edges, and each one fades out as it nears a realm, a
// station or any worker. The rain, snow, fog and lightning are scene2-weather-fall.js's.

m2.weather = { kind: 'clear', amount: 0, wind: 0.25, storm: false, cover: 0, snow: 0, wet: 0, flash: 0, source: '', label: '' };
function m2WxUpdate() {
  if (typeof wxUpdate !== 'function' || typeof sc !== 'object' || !sc?.weather) return;
  try { wxUpdate(); } catch { return; }
  Object.assign(m2.weather, sc.weather);
}

// The cloud shadows: a tile 192 units square, at two pixels a unit, of soft blobs from value noise, dithered at their
// rims, one per eighth of cover. It repeats as it drifts downwind.
const M2_SHADE_TILE = 192;
const m2ShadeTiles = new Map();
function m2ShadeTile(cover) {
  const key = Math.round(cover * 8);
  if (m2ShadeTiles.has(key)) return m2ShadeTiles.get(key);
  const n = M2_SHADE_TILE * 2;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  // More cover lowers the bar a blob must clear, so the shadows join up into an overcast's broken shade.
  const bar = 0.66 - key * 0.045;
  const wrap = (x, y, s, seed) => {
    // Noise that repeats across the tile, so its edges meet.
    const [u, v] = [x / M2_SHADE_TILE, y / M2_SHADE_TILE];
    const a = m2Noise(x, y, s, seed);
    const b = m2Noise(x - M2_SHADE_TILE, y, s, seed);
    const cN = m2Noise(x, y - M2_SHADE_TILE, s, seed);
    const d = m2Noise(x - M2_SHADE_TILE, y - M2_SHADE_TILE, s, seed);
    return (a * (1 - u) + b * u) * (1 - v) + (cN * (1 - u) + d * u) * v;
  };
  for (let py = 0; py < n; py += 1) {
    for (let px = 0; px < n; px += 1) {
      const [x, y] = [px / 2, py / 2];
      const v = wrap(x, y, 48, 11) * 0.65 + wrap(x, y, 16, 12) * 0.35;
      const t = (v - bar) * 9 + M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5;
      if (t <= 0) continue;
      const i = (py * n + px) * 4;
      img.data[i] = 14;
      img.data[i + 1] = 18;
      img.data[i + 2] = 40;
      img.data[i + 3] = t > 1 ? 255 : 150;
    }
  }
  g.putImageData(img, 0, 0);
  m2ShadeTiles.set(key, c);
  return c;
}
// Where the clouds have drifted to by now, in units: downwind and a little south, faster in a stronger wind.
const m2Drift = { x: 0, y: 0, tick: 0 };
function m2DriftStep(tick, reduced) {
  if (reduced || tick === m2Drift.tick) return;
  const w = m2.weather.wind || 0.2;
  m2Drift.x += (0.04 + Math.abs(w) * 0.12) * Math.sign(w || 1);
  m2Drift.y += 0.015;
  m2Drift.tick = tick;
}
function m2CloudShadows(g) {
  const W = m2.weather;
  const cover = W.kind === 'fog' ? 0 : Math.max(W.cover, W.kind === 'clear' ? 0 : 0.5);
  if (cover < 0.1) return;
  const tile = m2ShadeTile(cover);
  const T = M2_SHADE_TILE;
  const [ox, oy] = [((m2Drift.x % T) + T) % T, ((m2Drift.y % T) + T) % T];
  g.globalAlpha = 0.1 + cover * 0.1;
  for (let y = oy - T; y < m2.H; y += T) for (let x = ox - T; x < m2.W; x += T) g.drawImage(tile, Math.round(x * 4) / 4, Math.round(y * 4) / 4, T, T);
  g.globalAlpha = 1;
}

// A cloud top seen from above, w units wide: a cauliflower of puffs, big ones in the middle and small ones round the
// rim, all kept inside its box. Its height is the highest puff over each pixel, softened, and its light comes from that
// height's slope toward the upper left: white on the lit crowns, through pale greys to a cool lavender in the folds and
// round the lower right, each step dithered into the next so there are no hard bands. A rain cloud is greyer. With
// shadow true it is the cloud's shape in one dark, for its shadow on the land. Each drawn once.
const M2_CLOUD = ['#ffffff', '#f3f4f9', '#e2e5f0', '#c9cde0', '#aab0c9', '#8c91ad'];
const m2Clouds = new Map();
function m2CloudArt(w, seed, grey, shadow = false) {
  const key = `${w},${seed},${grey ? 1 : 0},${shadow ? 1 : 0}`;
  if (m2Clouds.has(key)) return m2Clouds.get(key);
  const h = Math.round(w * 0.62);
  const puffs = [];
  for (let i = 0; i < 16; i += 1) {
    const core = i < 5;
    const r = w * (core ? 0.15 + m2Hash(seed, i, 3) * 0.06 : 0.07 + m2Hash(seed, i, 3) * 0.06);
    const [u, v] = [m2Hash(seed, i, 1), m2Hash(seed, i, 2)];
    const ang = u * Math.PI * 2;
    const rad = core ? v * 0.18 : 0.26 + v * 0.12;
    puffs.push([Math.max(r + 1, Math.min(w - r - 1, w / 2 + Math.cos(ang) * rad * w)), Math.max(r + 1, Math.min(h - r - 1, h / 2 + Math.sin(ang) * rad * h * 1.2)), r]);
  }
  const [pw, ph] = [w * 4, h * 4];
  const H = new Float32Array(pw * ph).fill(-1);
  for (let py = 0; py < ph; py += 1) {
    for (let px = 0; px < pw; px += 1) {
      const [x, y] = [(px + 0.5) / 4, (py + 0.5) / 4];
      let best = -1;
      for (const [cx, cy, r] of puffs) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 < r * r) best = Math.max(best, Math.sqrt(r * r - d2) + r * 0.5);
      }
      H[py * pw + px] = best;
    }
  }
  const at = (px, py) => H[Math.max(0, Math.min(ph - 1, py)) * pw + Math.max(0, Math.min(pw - 1, px))];
  const ramp = grey ? M2_CLOUD.map((k) => hdMix(k, '#5e6378', 0.32)) : M2_CLOUD;
  const { c, g } = m2Canvas(w, h);
  m2Raster(g, 0, 0, pw, ph, (px, py) => {
    const z = at(px, py);
    if (z < 0) return null;
    const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
    if (shadow) return z > 1.5 || b < z / 1.5 ? '#101428' : null;
    // The slope over three pixels each way, lit from the upper left, with a little ambient from the crown's height.
    const sx = at(px + 3, py) - at(px - 3, py);
    const sy = at(px, py + 3) - at(px, py - 3);
    const lit = 0.42 + (sx * 0.5 + sy * 0.6) * 0.16 + (z / w) * 1.5 - (py / ph) * 0.3;
    const t = Math.max(0, Math.min(5, (1 - lit) * 4.2 + (b - 0.5)));
    if (z < 1.2 && (px + py) % 2) return null;
    return ramp[Math.round(t)];
  });
  m2Clouds.set(key, c);
  return c;
}
// How far a box is from the nearest work: each realm's region, each station and each worker, in units.
function m2Clear(x0, y0, x1, y1) {
  let d = Infinity;
  const gap = (ax0, ay0, ax1, ay1) => Math.hypot(Math.max(0, ax0 - x1, x0 - ax1), Math.max(0, ay0 - y1, y0 - ay1));
  for (const r of m2.realms) d = Math.min(d, gap(r.x, r.y, r.x + r.w, r.y + r.h));
  for (const a of m2.actors.values()) d = Math.min(d, gap(a.x - 10, a.y - 32, a.x + 10, a.y + 3));
  return d;
}
// The cloud tops over the empty lands and along the map's top and bottom edges: a few per eighth of cover, drifting with the wind and wrapping round the map, each
// fading out within twenty units of the work.
function m2CloudTops(g) {
  const W = m2.weather;
  const cover = W.kind === 'fog' ? 0 : Math.max(W.cover, W.kind === 'clear' ? 0 : 0.5);
  const n = Math.round(cover * 9);
  const grey = W.kind === 'rain' || W.storm;
  for (let i = 0; i < n; i += 1) {
    const w = 34 + Math.floor(m2Hash(i, 5, 91) * 4) * 8;
    const h = w * 0.62;
    const span = m2.W + w * 2;
    const x = (((m2Hash(i, 1, 91) * span + m2Drift.x * (0.9 + m2Hash(i, 2, 91) * 0.3)) % span) + span) % span - w;
    // Half of them keep to the map's top and bottom edges, half off the map, where nothing works.
    const edge = i % 2 === 0;
    const y = edge ? (i % 4 === 0 ? -h * (0.35 + m2Hash(i, 3, 91) * 0.2) : m2.H - h * (0.45 + m2Hash(i, 3, 91) * 0.2))
      : (m2Hash(i, 3, 91) * (m2.H + h) + m2Drift.y * 2) % (m2.H + h) - h;
    const fade = Math.min(1, Math.max(0, (m2Clear(x, y, x + w, y + h) - 4) / 20));
    if (fade <= 0.05) continue;
    g.globalAlpha = fade * 0.28;
    g.drawImage(m2CloudArt(w, i % 5, grey, true), Math.round((x + 7) * 4) / 4, Math.round((y + 10) * 4) / 4, w, h);
    g.globalAlpha = fade * 0.92;
    g.drawImage(m2CloudArt(w, i % 5, grey), Math.round(x * 4) / 4, Math.round(y * 4) / 4, w, h);
  }
  g.globalAlpha = 1;
}

// The weather is read first thing in each frame, before anything draws; the shadows and the cloud tops go over
// everything that stands, before the night's shade.
m2.layers.ground.unshift((g, tick, reduced) => { m2WxUpdate(); m2DriftStep(tick, reduced); });
m2.layers.air.push((g) => { m2CloudShadows(g); m2CloudTops(g); });
