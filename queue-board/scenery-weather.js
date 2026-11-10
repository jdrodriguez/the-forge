// scenery-weather.js: the overcast and the fog of the Middle-earth view's weather, in 32-bit (quarter-unit pixels).
// scene-weather.js sets sc.weather (what the weather is, the fades, how much snow has settled and how wet the road is)
// and calls these from its layer passes. Under an overcast, in rain and in snow a ceiling of cloud covers the sky the
// view adds above the scene, low soft billows in a few close tones, and runs down into the cloud deck along the top of
// the scene, whose front is a row of round billows lit from the upper left, darkening into shaded bellies with a dark
// rim, the nearer ones over the farther; both drift with the wind. In rain grey shafts hang from the bellies, leaning
// with it. Under the deck a wash of grey runs down the sky, heaviest at the top, and over the scene the light goes greyer
// and cooler. Fog hazes the feet of the mountains and lies in banks drifting slowly across the ground over a veil that
// thickens toward the road: each bank's top a row of long low humps with wisps above, lit along the top, shaded lower
// down, dithered finely from clear to solid. Everything is tinted toward the night and the red sky of a red main. The
// falling rain and snow are scene-weather-fall.js's, the puddles, splashes, rings and lightning scenery-storm.js's, the
// settled snow scenery-snow.js's. Loaded right after scene-weather-fall.js.

// Each weather's colours by day: the cloud deck, the wash over the sky and the cooler light over the scene. Clear with an
// overcast is a dry grey sky.
const WX_TONE = { clear: ['#737b8a', '#959ba6', '#646e84'], rain: ['#5d6676', '#7f858f', '#55607a'], storm: ['#41485a', '#5d6577', '#3a4360'],
  snow: ['#8d96a8', '#a6aebd', '#7f8aa3'], fog: ['#c3c8d1', '#cdd2db', '#a9b1c0'] };
const wxTone = { key: '', v: null };
function wxTones(sc) {
  const w = sc.weather;
  const kind = w.storm ? 'storm' : WX_TONE[w.kind] ? w.kind : 'rain';
  const dark = Math.round((1 - skLight(sc.sky.hour)) * 16) / 16;
  const war = Math.round((sc.war || 0) * 10);
  const key = `${kind},${dark},${war}`;
  if (wxTone.key !== key) {
    wxTone.v = [...WX_TONE[kind].map((c) => hdMix(hdMix(c, '#0e1226', dark * 0.8), '#4a1410', war * 0.045)), 1 - dark, kind];
    wxTone.key = key;
  }
  return wxTone.v;
}
// How much of the overcast shows under a red sky: less, so the red still reads.
const wxWarDim = (sc) => 1 - 0.45 * (sc.war || 0);
// How strong the grey wash over the sky is at row y for rain and snow: heaviest at the top, more for snow and storms.
const wxWashAt = (sc, y) => Math.min(0.95, (sc.weather.kind === 'snow' ? 0.84 : sc.weather.storm ? 0.88 : sc.weather.kind === 'clear' ? 0.76 : 0.82)
  + 0.1 * (1 - skLight(sc.sky.hour))) * sc.weather.cover * wxWarDim(sc) * Math.max(0, 1 - y / GROUND_Y) ** 0.38;
// A canvas w by h units at the scene's detail.
function wxCanvas(w, h) { const cv = document.createElement('canvas'); cv.width = w * SC_RES; cv.height = h * SC_RES; return cv; }
// The 8 by 8 ordered-dither threshold (0 to 1) at canvas pixel (px, py), for gradients finer than BAYER's sixteen steps.
const WX_B8 = [...Array(64)].map((_, i) => [0, 1, 2].reduce((v, b) => v + (((((i >> b) & 1) ^ ((i >> (3 + b)) & 1)) << 1) | ((i >> (3 + b)) & 1)) * 4 ** (2 - b), 0));
const wxDith = (px, py) => (WX_B8[((py & 7) << 3) | (px & 7)] + 0.5) / 64;

// A row of n rounded puffs along a strip w wide that tiles, [x, y, r] seeded by seed. wxPuffEdge is how low any of
// them reaches over column x (down) or how high (up, for a fog bank's top), or rest where none is; squash flattens them.
const wxPuffs = (n, w, y, dy, r, dr, seed) => [...Array(n)].map((_, k) => [((k + wxHash(k, seed) / 2) * w) / n, y + wxHash(k, seed + 1) * dy, r + wxHash(k, seed + 2) * dr]);
function wxPuffEdge(puffs, w, x, rest, down, squash = 1) {
  let e = rest;
  for (const [px, py, r] of puffs) {
    const dx = Math.abs(((x + 0.125 - px + w * 1.5) % w) - w / 2);
    if (dx < r) e = down ? Math.max(e, py + Math.sqrt(r * r - dx * dx) * squash) : Math.min(e, py - Math.sqrt(r * r - dx * dx) * squash);
  }
  return Math.round(e * 4) / 4;
}

// Paints billows [cx, cy, rx, ry, contrast, seed] into img (w by h units, tiling sideways, and up and down when wrap),
// the lower (nearer) over the higher: each a rounded top with a few soft lumps over a flatter base, lit from above and a
// little from the left and darkening into its belly, in bands of the five tones of ramp (light to dark) dithered only
// where two meet; then its bottom edge takes a darker tone where it hangs over a farther billow or the open sky (the
// darkest for the bold front ones), and a bold one's upper edge a lighter one where it stands before a farther one.
function wxBillows(img, w, h, puffs, ramp, wrap) {
  const [W2, H2] = [img.width, img.height];
  const id = new Int16Array(W2 * H2).fill(-1);
  const rgb = ramp.map(rgbOf);
  const put = (p, c) => { img.data[p * 4] = rgb[c][0]; img.data[p * 4 + 1] = rgb[c][1]; img.data[p * 4 + 2] = rgb[c][2]; img.data[p * 4 + 3] = 255; };
  const order = puffs.map((_, i) => i).sort((a, b) => puffs[a][1] - puffs[b][1]);
  for (const i of order) {
    const [cx, cy, rx, ry, k, seed] = puffs[i];
    for (const ox of [-w, 0, w]) {
      for (const oy of wrap ? [-h, 0, h] : [0]) {
        const [x0, x1] = [Math.max(0, Math.floor((cx + ox - rx * 1.15) * SC_RES)), Math.min(W2, Math.ceil((cx + ox + rx * 1.15) * SC_RES))];
        const [y0, y1] = [Math.max(0, Math.floor((cy + oy - ry * 1.15) * SC_RES)), Math.min(H2, Math.ceil((cy + oy + ry) * SC_RES))];
        for (let py = y0; py < y1; py += 1) {
          const up = ((py + 0.5) / SC_RES - cy - oy) / ry;
          const dy = up > 0 ? up / 0.55 : up;
          for (let px = x0; px < x1; px += 1) {
            const dx = ((px + 0.5) / SC_RES - cx - ox) / rx;
            const d = Math.hypot(dx, dy);
            const a = Math.atan2(dy, dx);
            if (d >= 1 + (0.1 * Math.sin(a * 6 + seed) + 0.04 * Math.sin(a * 11 + seed * 2)) * Math.min(1, Math.max(0, -dy * 2))) continue;
            let lum = -0.28 * dx - 0.7 * dy + 0.3 * Math.sqrt(Math.max(0, 1 - d * d));
            if (dy > 0.3) lum -= (dy - 0.3) * 0.5;
            const t = Math.max(0, Math.min(4, 2 - lum * 1.9 * k));
            const lo = Math.floor(t);
            const f = (t - lo - 0.3) / 0.4;
            put(py * W2 + px, f > (f < 1 ? wxDith(px, py) : 0) ? Math.min(4, lo + 1) : lo);
            id[py * W2 + px] = i;
          }
        }
      }
    }
  }
  const farther = (j, i) => j < 0 || puffs[j][1] < puffs[i][1];
  for (let p = W2; p < W2 * (H2 - 1); p += 1) {
    const i = id[p];
    if (i < 0) continue;
    const bold = puffs[i][4] >= 0.5;
    if (id[p + W2] !== i && farther(id[p + W2], i)) put(p, bold ? 4 : 3);
    else if (bold && id[p - W2] !== i && id[p - W2] >= 0 && farther(id[p - W2], i)) put(p, 1);
  }
}

// The cloud: a ceiling tile that tiles every way (rows of low flat billows in close tones) and the deck along the top of
// the scene, a strip as wide as the tile whose top is the tile's own rows down to the back billows' middles, with two
// rows of billows hanging below it, and in rain the shafts under them. Painted when the colour or the wind's lean
// changes, each ramp warmer in the light and cooler in the shade, its light dimmer at night.
const WX_DECK = { w: 192, h: 28, ceil: 56, shaft: 20 };
const wxDeck = { key: '', x: 0, ceil: null, front: null, shafts: null, shaftKey: '' };
function wxRampOf(c, light, k = 1) {
  const up = (0.05 + 0.16 * light) * k;
  return [hdMix(hdMix(c, '#ffffff', up * 1.8), '#fff1dc', 0.08 * light), hdMix(c, '#ffffff', up), c,
    hdMix(hdMix(c, HD_DARK, 0.14 * k), '#1c2a52', 0.1), hdMix(c, HD_DARK, 0.32 * k)];
}
function wxDeckPaint(deck, light, kind) {
  const D = WX_DECK;
  const soft = kind === 'snow' ? 0.65 : kind === 'storm' ? 1.15 : 1;
  const ceilPuffs = [];
  for (let row = 0; row < 8; row += 1) {
    for (const [x, y, r] of wxPuffs(8, D.w, row * 7 + 2, 2, 12, 8, 120 + row * 3)) ceilPuffs.push([x + (row % 2) * 11, y, r, r * 0.36, 0.32 * soft, row + x]);
  }
  const ceil = wxCanvas(D.w, D.ceil);
  const cimg = ceil.getContext('2d', { alpha: false }).createImageData(ceil.width, ceil.height);
  const ramp = wxRampOf(deck, light, 0.6);
  const base = [...rgbOf(ramp[2]), 255];
  for (let i = 0; i < cimg.data.length; i += 4) cimg.data.set(base, i);
  wxBillows(cimg, D.w, D.ceil, ceilPuffs, ramp, true);
  ceil.getContext('2d').putImageData(cimg, 0, 0);
  const back = wxPuffs(13, D.w, 9, 3, 6, 4, 51).map(([x, y, r], k) => [x, y, r * 1.5, r * 0.8, 0.55 * soft, k * 1.7]);
  const front = wxPuffs(9, D.w, 14, 4, 7, 4, 55).map(([x, y, r], k) => [x, y, r * 1.6, r * 0.95, 0.85 * soft, k * 2.3 + 1]);
  const cv = wxCanvas(D.w, D.h);
  const img = cv.getContext('2d').createImageData(cv.width, cv.height);
  const W2 = cv.width;
  for (let px = 0; px < W2; px += 1) {
    const mass = wxPuffEdge(back.map(([x, y, rx]) => [x, y, rx * 0.6]), D.w, px / SC_RES, 8, true, 0.2) * SC_RES;
    for (let py = 0; py < mass; py += 1) img.data.set(cimg.data.subarray((py * W2 + px) * 4, (py * W2 + px) * 4 + 4), (py * W2 + px) * 4);
  }
  wxBillows(img, D.w, D.h, [...back, ...front], wxRampOf(deck, light), false);
  cv.getContext('2d').putImageData(img, 0, 0);
  return { ceil, front: cv, puffs: front };
}
// The rain shafts: under each front billow a curtain of broken streaks leaning slant, thick under the belly and thinning
// to nothing a few units down.
function wxShaftPaint(D, deck, wash, slant) {
  const cv = wxCanvas(WX_DECK.w, WX_DECK.shaft);
  const img = cv.getContext('2d').createImageData(cv.width, cv.height);
  const c = [...rgbOf(hdMix(deck, wash, 0.25)), 255];
  for (let py = 0; py < cv.height; py += 1) {
    const y = py / SC_RES;
    for (let px = 0; px < cv.width; px += 1) {
      const x = px / SC_RES - slant * y;
      let s = 0;
      for (const [cx, , rx] of D.puffs) {
        const dx = Math.abs(((x - cx + WX_DECK.w * 1.5) % WX_DECK.w) - WX_DECK.w / 2) / (rx * 0.75);
        if (dx < 1) s = Math.max(s, 1 - dx * dx);
      }
      const col = Math.round(x * SC_RES);
      const d = s * 0.6 * (1 - y / WX_DECK.shaft) ** 1.3;
      if (d > 0.2 + 0.8 * wxHash(col, Math.floor((py + col * 5) / 9))) img.data.set(c, (py * cv.width + px) * 4);
    }
  }
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}
function wxDeckArt(sc) {
  const [deck, wash, , light, kind] = wxTones(sc);
  if (wxDeck.key !== `${deck},${kind}`) Object.assign(wxDeck, wxDeckPaint(deck, light, kind), { key: `${deck},${kind}`, shaftKey: '' });
  const slant = Math.round(sc.weather.wind * 5.5) / 10;
  if (sc.weather.kind === 'rain' && wxDeck.shaftKey !== `${deck},${slant}`) Object.assign(wxDeck, { shafts: wxShaftPaint(wxDeck, deck, wash, slant), shaftKey: `${deck},${slant}` });
  return wxDeck;
}

// The sky pass: for rain and snow the grey wash, a row at a time, and the deck drifting with the wind, its shafts under
// it in rain; the scene's top row is left one flat colour, so the sky the view adds above takes a steady colour from it
// (the above pass then lays the ceiling over that row too). For fog the haze over the mountains' feet.
function wxSkyArt(g, sc) {
  const w = sc.weather;
  if (w.cover <= 0) return;
  const [deck, wash] = wxTones(sc);
  if (w.kind === 'fog') {
    for (let y = GROUND_Y - 44; y < GROUND_Y; y += 0.5) {
      g.globalAlpha = 0.3 * w.amount * wxWarDim(sc) * ((y - GROUND_Y + 44) / 44) ** 1.2;
      pxBox(g, 0, y, sc.W, 0.5, wash);
    }
    g.globalAlpha = 1;
    return;
  }
  for (let y = 0; y < GROUND_Y; y += 1) {
    g.globalAlpha = wxWashAt(sc, y);
    pxBox(g, 0, y, sc.W, 1, wash);
  }
  const D = wxDeckArt(sc);
  if (!scReduced.matches) wxDeck.x = (wxDeck.x + 0.04 + 0.12 * w.wind + WX_DECK.w) % WX_DECK.w;
  const x0 = Math.round(wxDeck.x * 4) / 4 - WX_DECK.w;
  if (w.kind === 'rain' && D.shafts) {
    g.globalAlpha = w.cover * Math.min(1, w.amount * 1.4) * wxWarDim(sc);
    for (let x = x0; x < sc.W; x += WX_DECK.w) g.drawImage(D.shafts, x, WX_DECK.h - 7, WX_DECK.w, WX_DECK.shaft);
  }
  g.globalAlpha = w.cover * wxWarDim(sc);
  for (let x = x0; x < sc.W; x += WX_DECK.w) g.drawImage(D.front, x, 0, WX_DECK.w, WX_DECK.h);
  if (sc.dy > 0) pxBox(g, 0, 0, sc.W, 0.25, deck);
  g.globalAlpha = 1;
}

// The sky the view adds above the scene: the ceiling's tiles, their bottom row on the scene's top row so they run on
// into the deck, under the cooler light, hiding the stars and clouds there.
function wxAboveArt(g, sc) {
  const w = sc.weather;
  if (w.cover <= 0 || w.kind === 'fog') return;
  const [, , cool] = wxTones(sc);
  const D = wxDeckArt(sc);
  const C = WX_DECK.ceil;
  g.globalAlpha = w.cover * wxWarDim(sc);
  for (let y = sc.dy; y > -C; y -= C) {
    for (let x = Math.round(wxDeck.x * 4) / 4 - WX_DECK.w; x < sc.W; x += WX_DECK.w) g.drawImage(D.ceil, x, y, WX_DECK.w, C);
  }
  g.globalAlpha = 0.12 * w.cover * wxWarDim(sc);
  pxBox(g, 0, 0, sc.W, sc.dy + 0.5, cool);
  g.globalAlpha = 1;
}

// A fog bank: a strip that tiles sideways, its top a row of long low humps with a few thin wisps drifting above them,
// dithered (8 by 8) from clear along that edge to solid a few units in, lit along the top and shaded lower down. A floor
// bank stays solid to its bottom (it lies on the road); the others thin out again below. Painted once per colour.
const WX_FOG = { w: 192, h: 32 };
function wxFogPaint(lit, body, shade, floor) {
  const cv = wxCanvas(WX_FOG.w, WX_FOG.h);
  const g = cv.getContext('2d');
  const img = g.createImageData(cv.width, cv.height);
  const cols = [lit, body, shade].map((c) => [...rgbOf(c), 255]);
  const humps = wxPuffs(7, WX_FOG.w, 11, 4, 10, 8, floor ? 85 : 81);
  const s = floor ? 2 : 0;
  for (let px = 0; px < cv.width; px += 1) {
    const x = px / SC_RES;
    const top = wxPuffEdge(humps, WX_FOG.w, x, 14, false, 0.45) + 0.4 * Math.sin(x / 2.1 + s);
    const wisp = top - 2.5 - 0.8 * Math.sin(x / 13 + s);
    const wk = Math.max(0, Math.sin((x * 2 * Math.PI) / 48 + s)) * 0.45;
    for (let py = 0; py < cv.height; py += 1) {
      const y = py / SC_RES;
      const edge = Math.min(1, Math.max(0, (y - top) / 5)) * (0.88 + 0.12 * Math.sin(x / 3.3 + y / 1.9));
      const d = Math.max(Math.min(edge, floor ? 1 : (WX_FOG.h - y) / 7), wk * Math.max(0, 1 - Math.abs(y - wisp) / 0.8));
      if (d <= wxDith(px, py)) continue;
      const low = floor ? 0 : (y - top - 9) / 6;
      img.data.set(y - top < 2.5 ? cols[0] : low > wxDith(px + 3, py + 5) ? cols[2] : cols[1], (py * cv.width + px) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
// The banks: [top row, drift per tick, strength, where along the strip it starts, floor bank].
const WX_BANKS = [[GROUND_Y - 22, 0.03, 0.42, 0, 0], [GROUND_Y + 6, -0.05, 0.3, 70, 0], [SCENE_H - WX_FOG.h, 0.08, 0.42, 130, 1]];
const wxFog = { key: '', cv: null };

// The air pass: for rain and snow the cooler, greyer light over the scene; for fog a veil thickening toward the road and
// the banks drifting over it.
function wxAirArt(g, sc, tick) {
  const w = sc.weather;
  if (w.cover <= 0) return;
  const [, wash, cool] = wxTones(sc);
  if (w.kind !== 'fog') {
    const c = 0.2 * w.cover * wxWarDim(sc);
    g.globalAlpha = c;
    pxBox(g, 0, 0, sc.W, SCENE_H, cool);
    // At night the rows over the night shade's top darken toward it (skNightEdge, scenery-sky.js); the washes hid that
    // much of it, so that much goes back on.
    for (let y = GROUND_Y - 76; sc.sky.night && y < GROUND_Y - 62; y += 1) {
      g.globalAlpha = ((0.38 * (y - GROUND_Y + 76.5)) / 14) * (1 - (1 - wxWashAt(sc, y)) * (1 - c));
      pxBox(g, 0, y, sc.W, 1, '#0a0d24');
    }
    g.globalAlpha = 1;
    return;
  }
  const a = w.amount * wxWarDim(sc);
  if (a <= 0.01) return;
  for (let y = GROUND_Y; y < SCENE_H; y += 0.5) {
    g.globalAlpha = a * (0.3 + 0.15 * ((y - GROUND_Y) / (SCENE_H - GROUND_Y)));
    pxBox(g, 0, y, sc.W, 0.5, wash);
  }
  const key = `${wash},${cool}`;
  if (wxFog.key !== key) {
    const [lit, body, shade] = [hdMix(wash, '#ffffff', 0.55), hdMix(wash, '#ffffff', 0.3), hdMix(wash, '#ffffff', 0.1)];
    wxFog.cv = [wxFogPaint(lit, body, shade, false), wxFogPaint(lit, body, shade, true)];
    wxFog.key = key;
  }
  const t = scReduced.matches ? 0 : tick;
  for (const [top, v, k, phase, floor] of WX_BANKS) {
    g.globalAlpha = k * a;
    const off = (((phase + t * v) % WX_FOG.w) + WX_FOG.w) % WX_FOG.w;
    for (let x = Math.round(off * 4) / 4 - WX_FOG.w; x < sc.W; x += WX_FOG.w) g.drawImage(wxFog.cv[floor], x, top, WX_FOG.w, WX_FOG.h);
  }
  g.globalAlpha = 1;
}
