// scenery-storm.js: what the Middle-earth view's rain does on the ground, and its lightning, in 32-bit (quarter-unit
// pixels). scene-weather.js says how much (sc.weather's amount, wet and flash) and calls these from its layer passes.
// Puddles gather in the road's wheel ruts after a while of rain and dry after it: each an uneven oval in a rim of wet
// mud, its water reflecting the sky (paler where it shows the horizon, along its far side, darker toward the near edge,
// grey under the overcast), with a glint along the far side that shimmers slowly, and white for a moment in a flash.
// While it rains the ground darkens, drops land on the ground and the road in crowns that throw droplets out to either
// side, and rings widen on the falls' pool and the puddles. Lightning lights the sky for a frame or two and the scene
// below it less, and on the first flash a forked bolt runs down from the clouds, a white core in a blue glow with
// tapering branches, the cloud lit around it. Loaded right after scenery-weather.js.

// The puddles: in the wheel ruts (scenery.js's roadRut, or paintRoad's path), at places fixed by a seed for the road's
// width. Each fills to its own width as the road gets wet, some soon after the rain starts and some only after a long
// one. Their mud is the road's own colour where they lie, darkened. Painted into a strip when the road's wetness, the
// sky or the road changes, and drawn from it a puddle at a time.
const wxPud = { key: '', cv: null, list: [] };
const wxRut = (x, i) => (typeof roadRut === 'function' ? roadRut(x, i)
  : ROAD_Y + [8, 17][i] + Math.round((Math.sin((x + i * 40) / 19) * 0.7 + Math.sin((x + i * 120) / 7) * 0.3) * 2) / 2);
function wxPuddles(g, sc) {
  const w = sc.weather;
  const H = SCENE_H - ROAD_Y;
  const road = skLayers.get('road');
  const [deck] = wxTones(sc);
  const key = `${sc.W},${w.wet},${sc.sky.top},${sc.sky.low},${deck},${w.cover},${road?.key}`;
  if (wxPud.key !== key) {
    wxPud.key = key;
    wxPud.cv ??= document.createElement('canvas');
    wxPud.cv.width = sc.W * SC_RES;
    wxPud.cv.height = H * SC_RES;
    const lg = wxPud.cv.getContext('2d');
    lg.setTransform(SC_RES, 0, 0, SC_RES, 0, -ROAD_Y * SC_RES);
    const px = road ? road.cv.getContext('2d').getImageData(0, 0, road.cv.width, road.cv.height).data : null;
    const dirtAt = (x, y) => {
      if (!px) return '#9b7b55';
      const i = (Math.min(road.cv.height - 1, Math.max(0, Math.round((y - ROAD_Y) * SC_RES))) * road.cv.width + Math.min(road.cv.width - 1, Math.round(x * SC_RES))) * 4;
      return hexOf([px[i], px[i + 1], px[i + 2]]);
    };
    const over = w.cover * 0.75;
    const [far, near] = [hdMix(hdMix(sc.sky.low, deck, over), '#ffffff', 0.18), hdMix(hdMix(sc.sky.top, deck, over), HD_DARK, 0.12)];
    const tones = [far, hdMix(far, near, 0.45), near];
    wxPud.list = [];
    for (let i = 0; i < sc.W / 14; i += 1) {
      const rut = i % 2;
      const x = 6 + Math.floor(wxHash(i, 31) * (sc.W - 12));
      const ww = Math.round((4 + wxHash(i, 32) * 7) * wxClamp(w.wet * 1.7 - wxHash(i, 33) * 0.7) * 4) / 4;
      if (ww < 1.5) continue;
      const y = Math.round(wxRut(x, rut) * 4) / 4 - 0.25;
      const dirt = hdMix(hdMix(dirtAt(x - ww / 2 - 1, y - 1), dirtAt(x + ww / 2 + 1, y + 2), 0.5), '#3a2a1c', 0.12);
      const [rim, lip] = [hdMix(dirt, '#24170e', 0.5), hdMix(dirt, '#2e2016', 0.28)];
      // Its quarter-unit rows, each as wide as an uneven oval allows: a lip of wet mud, a dark line where the far bank is
      // mirrored, two rows of the horizon's light with a glint, the sky darkening toward the zenith's colour down the
      // rest (dithered where one tone gives way to the next), and a paler lip along the near edge. Each row ends in a
      // pixel of dark mud.
      const ROWS = ['lip', 'bank', 0, 0, 0.5, 1, 1.5, 2, 'near'];
      ROWS.forEach((t, r) => {
        const e = (r + 0.5 - ROWS.length / 2) / (ROWS.length / 2);
        const hw = Math.max(0.25, Math.round((ww / 2) * Math.sqrt(1 - e * e * 0.85) * (1 + 0.07 * Math.sin(i * 3 + r * 1.7)) * 4) / 4);
        const yy = y + r / 4;
        if (typeof t === 'string') { pxBox(lg, x - hw - 0.25, yy, hw * 2 + 0.5, 0.25, t === 'lip' ? rim : t === 'near' ? lip : hdMix(rim, tones[2], 0.5)); return; }
        pxBox(lg, x - hw - 0.25, yy, hw * 2 + 0.5, 0.25, rim);
        const lo = Math.min(1, Math.floor(t));
        for (let c = x - hw; c < x + hw; c += 0.25) {
          const k = (BAYER[((r & 3) << 2) | (Math.round(c * 4) & 3)] + 0.5) / 16;
          pxBox(lg, c, yy, 0.25, 0.25, tones[t - lo > k ? lo + 1 : lo]);
        }
      });
      if (ww >= 3) {
        pxBox(lg, x - ww / 4 - 0.5, y + 0.5, Math.max(0.5, Math.round(ww * 0.25 * 4) / 4), 0.25, '#ffffff');
        pxBox(lg, x + ww / 6, y + 0.75, 0.5, 0.25, hdMix(far, '#ffffff', 0.6));
      }
      wxPud.list.push({ L: x - ww / 2, y, ww });
    }
  }
  for (const p of wxPud.list) {
    const [x, y, w] = [Math.max(0, p.L - 0.5), p.y - 0.25, p.ww + 1];
    g.drawImage(wxPud.cv, x * SC_RES, (y - ROAD_Y) * SC_RES, w * SC_RES, 2.75 * SC_RES, x, y, w, 2.75);
  }
  // Their shimmer: a short bright run sliding back and forth along each one's far side, still with reduced motion;
  // and in a flash, the water goes white.
  const t = scReduced.matches ? 0 : sc.tick;
  g.globalAlpha = 0.55;
  wxPud.list.forEach((p, k) => {
    if (p.ww < 3) return;
    const s = Math.round((p.ww / 2 - 1) * Math.sin(t / 23 + k * 1.9) * 4) / 4;
    pxBox(g, p.L + p.ww / 2 + s - 0.25, p.y + 0.75, 0.75, 0.25, '#f4f8ff');
  });
  if (w.flash) {
    g.globalAlpha = 0.6 * w.flash;
    for (const p of wxPud.list) pxBox(g, p.L + 0.5, p.y + 0.5, p.ww - 1, 1.25, '#f4f6ff');
  }
  g.globalAlpha = 1;
}

// A drop's rects as [colour, dx, dy, w, h] in quarter units, colour 0 bright and 1 faint. Landing on earth over four
// frames: it strikes, throws up a crown of two prongs with a droplet over each, the droplets fly out to either side and
// land, leaving a faint ring. Landing on water: a dot, then a flat ring that widens and fades.
const WX_SPLASH = [
  [[0, 0, 0, 0.5, 0.25], [0, 0.25, -0.75, 0.25, 0.5]],
  [[0, -0.25, 0, 1, 0.25], [0, -0.5, -0.5, 0.25, 0.5], [0, 0.75, -0.5, 0.25, 0.5], [1, -0.75, -1, 0.25, 0.25], [1, 1, -1, 0.25, 0.25]],
  [[1, -0.25, 0, 1, 0.25], [0, -1.25, -1, 0.25, 0.25], [0, 1.5, -1, 0.25, 0.25]],
  [[1, -1.5, 0, 0.25, 0.25], [1, 1.75, 0, 0.25, 0.25], [1, -0.75, 0.25, 0.5, 0.25], [1, 0.75, 0.25, 0.5, 0.25]],
];
const WX_RING = [0.25, 0.75, 1.25, 2].map((rx, f) => {
  if (!f) return [[0, 0, 0, 0.25, 0.25]];
  const ry = Math.max(0.25, Math.round(rx * 0.35 * 4) / 4);
  const out = [];
  for (let dy = -ry; dy <= ry; dy += 0.25) {
    const hx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.125)) ** 2)) * 4) / 4;
    if (Math.abs(dy) === ry) out.push([dy < 0 ? 0 : 1, -hx, dy, hx * 2 + 0.25, 0.25]);
    else out.push([dy < 0 ? 0 : 1, -hx, dy, 0.25, 0.25], [dy < 0 ? 0 : 1, hx, dy, 0.25, 0.25]);
  }
  return out;
});
// Every drop of a frame is gathered first and drawn in four fills: [splash bright, splash faint, ring bright, ring faint].
const wxDrops = [[], [], [], []];
const wxDrop = (shape, x, y, ring) => { for (const [c, dx, dy, w, h] of shape) wxDrops[c + (ring ? 2 : 0)].push(x + dx, y + dy, w, h); };
function wxDropsFill(g, night) {
  const cols = night ? ['#9aa6c0', '#6f7b98', '#c4d0e6', '#8e9cb8'] : ['#eef4fb', '#c9d6e6', '#f6fbff', '#cfe0f0'];
  wxDrops.forEach((r, k) => {
    if (!r.length) return;
    g.globalAlpha = [0.8, 0.55, 0.85, 0.6][k];
    g.fillStyle = cols[k];
    g.beginPath();
    for (let i = 0; i < r.length; i += 4) g.rect(r[i], r[i + 1], r[i + 2], r[i + 3]);
    g.fill();
    r.length = 0;
  });
  g.globalAlpha = 1;
}

// The ground pass: the wet ground and its puddles, the settled snow, and while it rains the splashes, the rings on the
// falls' pool and on the puddles. With reduced motion the drops hold still.
function wxGroundArt(g, sc, tick) {
  const w = sc.weather;
  if (w.wet > 0) {
    g.globalAlpha = 0.08 * w.wet;
    pxBox(g, 0, GROUND_Y, sc.W, ROAD_Y - GROUND_Y, '#0f1d14');
    g.globalAlpha = 0.16 * w.wet;
    pxBox(g, 0, ROAD_Y, sc.W, SCENE_H - ROAD_Y, '#2b1d12');
    g.globalAlpha = 1;
    wxPuddles(g, sc);
  }
  if (w.snow > 0 && typeof wxSnowDraw === 'function') wxSnowDraw(g, sc);
  if (w.kind !== 'rain' || w.amount < 0.02) return;
  const still = scReduced.matches;
  const t = still ? 1 : tick;
  for (let i = 0, n = Math.ceil(sc.W * 0.24 * w.amount * (still ? 0.4 : 1)); i < n; i += 1) {
    const ph = t + Math.floor(wxHash(i, 21) * 6);
    const cyc = Math.floor(ph / 6);
    if (!still && ph % 6 > 3) continue;
    const x = Math.round(wxHash(i, cyc * 2 + 1) * sc.W * 4) / 4;
    const y = Math.round((GROUND_Y + 4 + wxHash(i, cyc * 2 + 2) * (SCENE_H - GROUND_Y - 5)) * 4) / 4;
    if (sc.realms.some((q) => q.kind === 'elf' && x >= q.x0 && x < q.x0 + 21 && y < GROUND_Y + 22)) continue;
    wxDrop(WX_SPLASH[still ? 1 : ph % 6], x, y, false);
  }
  for (const r of sc.realms) {
    if (r.kind !== 'elf') continue;
    const [X, T] = fallsAt(r);
    const P = FALLS_POOL;
    for (let k = 0; k < 5; k += 1) {
      const ph = t + k * 3;
      const cyc = Math.floor(ph / 7);
      if ((!still && ph % 7 > 3) || wxHash(k, cyc + 77) > w.amount + 0.2) continue;
      const [dx, dy] = [(wxHash(k, cyc) - 0.5) * (P.rx * 2 - 5), (wxHash(k + 5, cyc) - 0.5) * (P.ry * 2 - 2)];
      wxDrop(WX_RING[still ? 2 : ph % 7], Math.round((X + P.x + dx) * 4) / 4, Math.round((T + P.y + dy) * 4) / 4, true);
    }
  }
  wxPud.list.forEach((p, k) => {
    const ph = t + k * 3;
    if (p.ww < 3 || (!still && ph % 6 > 3)) return;
    const f = still ? 1 : Math.min(ph % 6, Math.floor(p.ww / 2.5));
    wxDrop(WX_RING[f], Math.round((p.L + 1.5 + wxHash(k, Math.floor(ph / 6)) * (p.ww - 3)) * 4) / 4, p.y + 1.25, true);
  });
  wxDropsFill(g, sc.sky.night);
}

// The lightning: the sky lights up for a frame or two and the scene below it less, and on the first flash a forked bolt
// runs down from the clouds, ending well above the peaks: a one-pixel white core in a pale blue glow and a wider faint
// one, three or four branches tapering off it to either side, and the cloud around its root lit. scene is false for the
// sky above the scene (g at the canvas top); the scene's top row is lit then, after the sky above has taken its colour.
// A soft round glow rx by ry units in pale blue, dithered (8 by 8) from solid at its middle to nothing at its edge, kept
// by size.
const wxGlows = new Map();
function wxGlow(rx, ry) {
  const key = `${rx},${ry}`;
  if (!wxGlows.has(key)) {
    const cv = wxCanvas(rx * 2, ry * 2);
    const img = cv.getContext('2d').createImageData(cv.width, cv.height);
    for (let py = 0; py < cv.height; py += 1) {
      for (let px = 0; px < cv.width; px += 1) {
        const d = Math.hypot((px + 0.5) / SC_RES / rx - 1, (py + 0.5) / SC_RES / ry - 1);
        if ((1 - d) ** 1.5 > wxDith(px, py)) img.data.set([223, 230, 255, 255], (py * cv.width + px) * 4);
      }
    }
    cv.getContext('2d').putImageData(img, 0, 0);
    wxGlows.set(key, cv);
  }
  return wxGlows.get(key);
}
function wxBoltPath(seed, x, y, end, spread, step, salt) {
  const pts = [[x, y]];
  while (pts.at(-1)[1] < end) {
    const [px, py] = pts.at(-1);
    pts.push([px + (wxHash(seed, pts.length + salt) - 0.5) * spread, Math.min(end, py + step * (0.6 + wxHash(seed, pts.length + salt + 9) * 0.8))]);
  }
  return pts;
}
function wxFlashArt(g, sc, scene) {
  const f = sc.weather.flash;
  if (!f) return;
  const night = sc.sky.night;
  g.globalAlpha = (night ? 0.55 : 0.45) * f;
  if (!scene) pxBox(g, 0, 0, sc.W, sc.dy + 0.5, '#eef2ff');
  else {
    const top = sc.dy > 0 ? 0.5 : 0;
    pxBox(g, 0, top, sc.W, GROUND_Y - top, '#eef2ff');
    g.globalAlpha = (night ? 0.35 : 0.25) * f;
    pxBox(g, 0, GROUND_Y, sc.W, SCENE_H - GROUND_Y, '#eef2ff');
  }
  g.globalAlpha = 1;
  if (f < 1) return;
  const seed = sc.weather.bolt;
  const oy = scene ? sc.dy : 0;
  const end = sc.dy + 38 + wxHash(seed, 2) * 8;
  const main = wxBoltPath(seed, 20 + wxHash(seed, 1) * (sc.W - 40), 0, end, 5, 3.5, 40);
  const lines = [[main, 1]];
  for (let b = 0; b < 3 + (seed % 2); b += 1) {
    const from = main[Math.min(main.length - 2, 2 + Math.floor(wxHash(seed, b + 60) * (main.length - 3)))];
    const side = wxHash(seed, b + 64) < 0.5 ? -1 : 1;
    const twig = [from];
    for (let k = 1; k < 4 + (b % 3); k += 1) twig.push([from[0] + side * k * (1.8 + wxHash(seed, b * 7 + k) * 1.2), from[1] + k * (1.6 + wxHash(seed, b * 5 + k + 80) * 1.4)]);
    lines.push([twig, 0.6]);
  }
  const [rx, ry] = [main[0][0], sc.dy + 18];
  g.globalAlpha = 0.5;
  g.drawImage(wxGlow(26, 12), rx - 26, ry - oy - 12, 52, 24);
  if (sc.dy > 8) g.drawImage(wxGlow(34, 24), rx - 34, sc.dy * 0.5 - oy - 24, 68, 48);
  for (const [c, wd, a, core] of [['#7f94ff', 1.75, 0.3, false], ['#c9d5ff', 0.75, 0.9, false], ['#ffffff', 0.25, 1, true]]) {
    for (const [line, k] of lines) {
      if (k < 1 && !core && wd > 1) continue;
      g.globalAlpha = a * (k < 1 && core ? 0.85 : 1);
      g.fillStyle = c;
      g.beginPath();
      for (let n = 1; n < line.length; n += 1) {
        const [[x0, y0], [x1, y1]] = [line[n - 1], line[n]];
        for (let y = Math.round(y0 * 4) / 4; y < y1; y += 0.25) {
          const x = Math.round((x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)) * 4) / 4;
          g.rect(x - (wd - 0.25) / 2, y - oy, wd, 0.25);
        }
      }
      g.fill();
    }
  }
  g.globalAlpha = 1;
}
