// scene2-weather-fall.js: what falls and lies on the map from above (scene2.js), by m2.weather (scene2-weather.js).
// Rain falls in fine pale streaks slanted by the wind, each ending in a small splash ring where it lands, and a wet sheen
// darkens and cools the ground as the puddles gather (m2.weather.wet). Snow falls in flakes that drift and wobble down,
// and settles (m2.weather.snow) as a dithered white over the ground and roofs, thicker as more has fallen, never on the
// water. Fog is a pale veil that thins to nothing round every worker and station, so the work stays clear. In a storm
// lightning flashes the whole map white for a frame or two. Every drop and flake sits at a fixed place per index, so
// nothing is random from frame to frame; with reduced motion they hold still.

// The ground's water, kept from each layout, so snow never lies on a river or lake.
const m2WxGround = { L: null, snow: null, snowKey: '' };
m2.builds.push((L) => { m2WxGround.L = L; m2WxGround.snowKey = ''; });

// What falls is drawn once into tiles 96 units square (by kind, by how hard in quarters, by the lean in tenths, near or
// far) and each frame the tiles scroll down and across, two layers at different speeds so the fall has depth. Rain is
// streaks of 2 to 3.5 units, a quarter unit wide, leaning with the wind; snow is a pixel, a larger flake or a small plus.
const M2_FALL = 96;
const m2FallTiles = new Map();
function m2FallTile(kind, amount, lean, far) {
  const [q, l] = [Math.max(1, Math.round(amount * 4)), Math.round(lean * 10)];
  const key = `${kind}${q},${l},${far ? 1 : 0}`;
  if (m2FallTiles.has(key)) return m2FallTiles.get(key);
  const { c, g } = m2Canvas(M2_FALL, M2_FALL);
  const T = M2_FALL;
  const n = Math.round(q * (kind === 'rain' ? 26 : 30) * (far ? 0.7 : 1));
  for (let i = 0; i < n; i += 1) {
    const [x, y] = [Math.floor(m2Hash(i, 1, far ? 42 : 41) * T * 4) / 4, Math.floor(m2Hash(i, 2, far ? 42 : 41) * T * 4) / 4];
    if (kind === 'rain') {
      const steps = Math.round((2 + m2Hash(i, 3, 41) * 1.5) * (far ? 1.5 : 2));
      g.fillStyle = far ? '#9fb4cc' : i % 3 ? '#b6c9de' : '#e2ecf6';
      g.globalAlpha = far ? 0.4 : 0.6;
      for (let k = 0; k < steps; k += 1) {
        const [px, py] = [(x + (l / 10) * k * 0.5 + T) % T, (y + k * 0.5) % T];
        g.fillRect(Math.round(px * 4) / 4, py, 0.25, 0.5);
      }
    } else {
      g.fillStyle = far ? '#d6e0ee' : i % 2 ? '#ffffff' : '#eef3fb';
      g.globalAlpha = far ? 0.7 : 0.95;
      if (!far && i % 4 === 0) { g.fillRect(x - 0.25, y, 0.75, 0.25); g.fillRect(x, y - 0.25, 0.25, 0.75); }
      else g.fillRect(x, y, !far && i % 3 === 0 ? 0.5 : 0.25, !far && i % 3 === 0 ? 0.5 : 0.25);
    }
  }
  m2FallTiles.set(key, c);
  return c;
}
// One layer of tiles over the map, scrolled to (ox, oy).
function m2FallLayer(g, tile, ox, oy) {
  const T = M2_FALL;
  const [sx, sy] = [((ox % T) + T) % T, ((oy % T) + T) % T];
  for (let y = sy - T; y < m2.H; y += T) for (let x = sx - T; x < m2.W; x += T) g.drawImage(tile, Math.round(x * 4) / 4, Math.round(y * 4) / 4, T, T);
}
function m2Fall(g, tick, reduced, kind, amount, wind) {
  const t = reduced ? 0 : tick;
  const lean = kind === 'rain' ? Math.max(-0.7, Math.min(0.7, wind * 0.8)) : 0;
  for (const far of [true, false]) {
    const v = kind === 'rain' ? (far ? 5 : 7) : far ? 0.3 : 0.5;
    const oy = t * v;
    const ox = kind === 'rain' ? oy * lean : t * wind * (far ? 0.25 : 0.4) + Math.sin(t / 11 + (far ? 2 : 0)) * 1.5;
    m2FallLayer(g, m2FallTile(kind, amount, lean, far), ox + (far ? 37 : 0), oy + (far ? 53 : 0));
  }
}
// Splashes: small rings that open and fade where drops land, a few dozen at a time across the map.
function m2Splash(g, tick, amount) {
  const n = Math.round(amount * 70);
  for (let i = 0; i < n; i += 1) {
    const life = (tick + i * 7) % 9;
    const cycle = Math.floor((tick + i * 7) / 9);
    const x = Math.round(m2Hash(i, cycle, 43) * m2.W * 4) / 4;
    const y = Math.round(m2Hash(cycle, i, 44) * m2.H * 4) / 4;
    if (life > 4) continue;
    const r = 0.25 + life * 0.25;
    g.globalAlpha = 0.55 - life * 0.1;
    pxBox(g, x - r, y, 0.25, 0.25, '#d6e6f2');
    pxBox(g, x + r, y, 0.25, 0.25, '#d6e6f2');
    pxBox(g, x, y - r * 0.5, 0.25, 0.25, '#eef6fb');
    if (life > 1) pxBox(g, x - r * 0.5, y + r * 0.5, r, 0.25, '#b8cde0');
  }
  g.globalAlpha = 1;
}

// Settled snow as a canvas the world's size at two pixels a unit: on open ground only (never water, rock, cliffs, the
// mountains' own snow, the forests or Mordor's ash), in patches that grow and join as it deepens, solid inside and
// dithered only at their rims, a slow second noise shading drifts a cool blue-grey; cut round every standing thing baked
// into the ground (buildings, trees, rocks), which instead get a dusting on their upper parts, thicker toward the top, so
// roofs and crowns go white without losing their shape. Made again only when the depth changes by a sixteenth or the
// layout does.
const M2_SNOW_OFF = new Set([M2_MAT.water, M2_MAT.rock, M2_MAT.cliff, M2_MAT.snow, M2_MAT.forest, M2_MAT.ash]);
function m2SnowCover(depth) {
  const key = `${m2.key}|${Math.round(depth * 16)}`;
  if (m2WxGround.snowKey === key) return m2WxGround.snow;
  const L = m2WxGround.L;
  const [w, h] = [m2.W * 2, m2.H * 2];
  const c = m2WxGround.snow ?? document.createElement('canvas');
  [c.width, c.height] = [w, h];
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const most = Math.min(1, depth) * 0.9;
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      if (L && M2_SNOW_OFF.has(m2MatAt(L, px / 2, py / 2))) continue;
      const t = most * 1.1 + (m2Noise(px / 2, py / 2, 13, 51) - 0.5) * 0.8;
      const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
      if (t < 0.45 || (t < 0.62 && b > (t - 0.45) / 0.17)) continue;
      const i = (py * w + px) * 4;
      const s = m2Noise(px / 2, py / 2, 12, 52);
      const shade = s < 0.36 || (s < 0.42 && b > (s - 0.36) / 0.06);
      [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = shade ? [228, 235, 246, 235] : [246, 249, 255, 235];
    }
  }
  g.putImageData(img, 0, 0);
  // The standing things: their shapes cut out of the snow, then a dusting laid back over their upper parts only.
  const dust = document.createElement('canvas');
  [dust.width, dust.height] = [w, h];
  const d = dust.getContext('2d');
  d.imageSmoothingEnabled = false;
  d.setTransform(2, 0, 0, 2, 0, 0);
  for (const o of m2.standing ?? []) o.draw(d, 0);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(dust, 0, 0);
  d.setTransform(1, 0, 0, 1, 0, 0);
  d.globalCompositeOperation = 'source-in';
  const dot = document.createElement('canvas');
  [dot.width, dot.height] = [4, 4];
  const dg = dot.getContext('2d');
  for (let k = 0; k < 16; k += 1) if (M2_BAYER[k] < 0.8) { dg.fillStyle = M2_BAYER[k] < 0.45 ? '#f6f9ff' : '#dfe7f3'; dg.fillRect(k % 4, k >> 2, 1, 1); }
  d.fillStyle = d.createPattern(dot, 'repeat');
  d.fillRect(0, 0, w, h);
  // How much dusting each thing gets, top to bottom, gathered in one mask and applied once.
  const mask = document.createElement('canvas');
  [mask.width, mask.height] = [w, h];
  const mg = mask.getContext('2d');
  for (const o of m2.standing ?? []) {
    const gr = mg.createLinearGradient(0, o.y * 2, 0, (o.y + o.h) * 2);
    gr.addColorStop(0, `rgba(0, 0, 0, ${most})`);
    gr.addColorStop(0.4, `rgba(0, 0, 0, ${0.8 * most})`);
    gr.addColorStop(0.75, 'rgba(0, 0, 0, 0)');
    mg.fillStyle = gr;
    mg.fillRect(o.x * 2, o.y * 2, o.w * 2, o.h * 2);
  }
  d.globalCompositeOperation = 'destination-in';
  d.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(dust, 0, 0);
  Object.assign(m2WxGround, { snow: c, snowKey: key });
  return c;
}

// Fog: a pale veil over the whole map, drawn at a unit a pixel with smoothing (a veil is soft), with clear holes round
// each worker and station that fade out over a few units, and slow drifting thicker banks.
const m2Fog = { c: null, g: null };
function m2FogVeil(g, tick, amount) {
  const [w, h] = [Math.ceil(m2.W / 2), Math.ceil(m2.H / 2)];
  if (!m2Fog.c || m2Fog.c.width !== w || m2Fog.c.height !== h) {
    m2Fog.c = document.createElement('canvas');
    [m2Fog.c.width, m2Fog.c.height] = [w, h];
    m2Fog.g = m2Fog.c.getContext('2d');
  }
  const f = m2Fog.g;
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, w, h);
  f.fillStyle = `rgba(214, 220, 228, ${0.5 * amount})`;
  f.fillRect(0, 0, w, h);
  // Thicker banks drifting with the wind.
  for (let i = 0; i < 9; i += 1) {
    const bx = ((m2Hash(i, 1, 53) * (w + 60) + tick * 0.05 * (1 + (i % 3))) % (w + 60)) - 30;
    const by = m2Hash(i, 2, 53) * h;
    const r = 14 + m2Hash(i, 3, 53) * 16;
    const gr = f.createRadialGradient(bx, by, 0, bx, by, r);
    gr.addColorStop(0, `rgba(226, 231, 238, ${0.35 * amount})`);
    gr.addColorStop(1, 'rgba(226, 231, 238, 0)');
    f.fillStyle = gr;
    f.fillRect(bx - r, by - r, r * 2, r * 2);
  }
  // The clear round the work: every worker (its whole body) and every station.
  f.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r) => {
    const gr = f.createRadialGradient(x / 2, y / 2, r * 0.25, x / 2, y / 2, r / 2);
    gr.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    f.fillStyle = gr;
    f.fillRect(x / 2 - r / 2, y / 2 - r / 2, r, r);
  };
  for (const a of m2.actors.values()) hole(a.x, a.y - 12, 34);
  for (const s of m2.stations) hole(s.x, s.y - 6, 26);
  f.globalCompositeOperation = 'source-over';
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(m2Fog.c, 0, 0, w * 2, h * 2);
  g.restore();
}

// The passes: the wet sheen and the settled snow on the ground under everything that stands (the roofs and trees are in
// the ground's cache, so the snow lies on them too); the splashes there as well; rain, snow and fog over everything
// before the night's shade; the lightning after it, so a flash lights the night.
m2.layers.ground.push((g, tick, reduced) => {
  const W = m2.weather;
  if (W.wet > 0.05) {
    g.globalAlpha = W.wet * 0.14;
    pxBox(g, 0, 0, m2.W, m2.H, '#1c2c44');
    g.globalAlpha = 1;
  }
  if (W.snow > 0.04) g.drawImage(m2SnowCover(W.snow), 0, 0, m2.W, m2.H);
  if (W.kind === 'rain' && W.amount > 0.05 && !reduced) m2Splash(g, tick, W.amount);
});
m2.layers.air.push((g, tick, reduced) => {
  const W = m2.weather;
  if (W.kind === 'fog' && W.amount > 0.02) m2FogVeil(g, tick, W.amount);
  if ((W.kind === 'rain' || W.kind === 'snow') && W.amount > 0.02) m2Fall(g, tick, reduced, W.kind, W.amount, W.wind);
});
m2.layers.light.push((g) => {
  const f = m2.weather.flash;
  if (!f) return;
  g.globalAlpha = 0.35 * f;
  pxBox(g, 0, 0, m2.W, m2.H, '#eef2ff');
  g.globalAlpha = 1;
});
