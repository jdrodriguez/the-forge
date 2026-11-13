// scenery-snow.js: the snow the Middle-earth view's weather leaves on the ground, in 32-bit (quarter-unit pixels).
// scene-weather.js says how much has settled (sc.weather.snow). Snow settles over the minutes it falls: in patches that
// grow and join over the ground, the Shire's hill and the road, lit along their tops and shaded blue along their
// undersides, the darker grass and the ruts showing through last as tracks; deep snow lies in low drifts, each lit
// along its top and shaded along its near face, and a few crystals glint now and then. Along every top edge of what
// stands still (the pavilion's roof, the cliff over the falls, Erebor's crest and lintel, the hill's chimney, the
// fence, Meduseld and the stables) it builds a rim, thickest where the edge is flat, and it lies on the roofs of the
// healing house and the well. It melts back the same way. Where it lies is found by drawing, not by colour: a realm's
// ground is wherever drawRealm's picture matches landGround's alone (scenery-land.js), the hill wherever it matches
// shireHill's alone, so the land can be recoloured freely; the trees, the falls and anything else that moves get none.
// How late a pixel is covered follows how much darker it is than its ground's middle tone. A red main's war fires burn
// on over it. Drawn in scene.js's ground layer (the roofs' rims as depth-sorted items just after their props), so the
// figures stand on it and the night darkens it. Loaded right after scenery-storm.js.

// Settled snow's colours: a glint, lit along a patch's top, its body (bluer over dark ground), the drifts' lit tops and
// shaded faces, shaded blue along its underside.
const WX_WHITE = { spark: [255, 255, 255], lit: [250, 252, 255], body: [234, 239, 247], dim: [214, 222, 236], rise: [244, 247, 252],
  face: [208, 218, 234], shade: [184, 198, 222] };
// The top of what the snow map covers: the top of the realms' layers (scenery-land.js's drawRealm).
const WX_SNOW_TOP = GROUND_Y - 50;
const wxSnow = { key: '', drawn: '', at: null, caps: [], sparks: [], w2: 0, h2: 0, cv: null, img: null };
const wxLum = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
const wxSame = (a, b, i) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];

// When a pixel of ground at (x, y) is covered, as a snow level from 1 to 254 (255 never): in patches from a smooth
// field (worked out once for each two by two pixels, in field), their edges dithered, later by bias; a little stays
// bare even in the deepest snow.
const wxField = (x, y) => 0.5 + 0.22 * Math.sin(x / 4.7 + Math.sin(y / 2.9) * 1.3) * Math.cos(y / 2.2 + Math.sin(x / 6.1) * 0.8)
  + 0.15 * Math.sin(x / 2.6 + y / 1.6) + 0.13 * Math.cos(x / 7.9 - y / 1.3 + 2);
function wxLevel(field, w2, X, py, bias) {
  const f = (py >> 1) * (w2 >> 1) + (X >> 1);
  if (field[f] < 0) field[f] = wxField((X & ~1) / SC_RES, WX_SNOW_TOP + (py & ~1) / SC_RES);
  const v = field[f] * 0.85 + bias + (BAYER[(py & 3) * 4 + (X & 3)] / 16 - 0.47) * 0.06;
  return v > 0.97 ? 255 : Math.max(1, Math.round(v * 254));
}
// The drifts: low mounds lying across the ground at seeded places, [x, y, half length, half depth] in units, marked into
// a map of the snow's pixels: 1 along a mound's top (lit), 2 its near face (shaded), 3 the face's foot.
function wxMounds(sc, w2, h2) {
  const m = new Uint8Array(w2 * h2);
  for (let i = 0; i < (sc.W * (SCENE_H - GROUND_Y)) / 150; i += 1) {
    const [x, y, L, D] = [wxHash(i, 91) * sc.W, GROUND_Y + 3 + wxHash(i, 92) * (SCENE_H - GROUND_Y - 5), 4 + wxHash(i, 93) * 9, 0.7 + wxHash(i, 94) * 0.6];
    for (let py = Math.floor((y - D - WX_SNOW_TOP) * SC_RES); py <= (y + D - WX_SNOW_TOP) * SC_RES; py += 1) {
      for (let X = Math.max(0, Math.floor((x - L) * SC_RES)); X < Math.min(w2, (x + L) * SC_RES); X += 1) {
        const [dx, dy] = [(X + 0.5) / SC_RES - x, (py + 0.5) / SC_RES + WX_SNOW_TOP - y];
        if ((dx / L) ** 2 + (dy / (D * (1 + 0.25 * Math.sin(dx * 0.7 + i)))) ** 2 < 1 && py >= 0 && py < h2) m[py * w2 + X] = 1;
      }
    }
  }
  const out = new Uint8Array(w2 * h2);
  for (let p = w2; p < w2 * (h2 - 3); p += 1) if (m[p]) out[p] = !m[p - w2] ? 1 : !m[p + w2] ? 3 : !m[p + 2 * w2] || !m[p + 3 * w2] ? 2 : 0;
  return out;
}

// The pixels paint(g) draws on a fresh canvas w by h pixels; a canvas's own pixels; and those paint(g) draws on a canvas
// the size of realm r's layer, in the layer's own place.
function wxDraw(w, h, paint) {
  const c = document.createElement('canvas');
  [c.width, c.height] = [w, h];
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  try { paint(g); } catch { /* art in the middle of a change draws nothing here */ }
  return g.getImageData(0, 0, w, h).data;
}
const wxPixels = (cv) => wxDraw(cv.width, cv.height, (g) => g.drawImage(cv, 0, 0));
const wxRealmPixels = (r, paint) => wxDraw((r.w + 16) * SC_RES, (ROAD_Y - WX_SNOW_TOP) * SC_RES, (g) => {
  g.setTransform(SC_RES, 0, 0, SC_RES, (8 - r.x0) * SC_RES, -WX_SNOW_TOP * SC_RES);
  paint(g);
});
// The brightness of each pixel of a picture w pixels wide, softened over the five columns and three rows around it
// (clear pixels left out), so a ground's fine texture does not stripe the snow; and the middle of it over the pixels a
// mask picks, for how much darker each one is than its own ground.
function wxSoftLum(d, w) {
  const n = d.length >> 2;
  const [L, A, out, solid] = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Uint8Array(n)];
  for (let p = 0, i = 0; p < n; p += 1, i += 4) if (d[i + 3]) { solid[p] = 1; L[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; }
  for (let p = 0; p < n; p += 1) {
    const [x, o] = [p % w, p - (p % w)];
    let [s, k] = [0, 0];
    for (let q = o + Math.max(0, x - 2), e = o + Math.min(w - 1, x + 2); q <= e; q += 1) if (solid[q]) { s += L[q]; k += 1; }
    A[p] = k ? s / k : 0;
  }
  for (let p = 0; p < n; p += 1) {
    let [s, k] = [solid[p] ? A[p] : 0, solid[p]];
    if (p >= w && solid[p - w]) { s += A[p - w]; k += 1; }
    if (p + w < n && solid[p + w]) { s += A[p + w]; k += 1; }
    out[p] = k ? s / k : 0;
  }
  return out;
}
function wxMid(L, pick) {
  const [n, all] = [new Uint32Array(256), pick.reduce((a, v) => a + v, 0)];
  for (let i = 0; i < pick.length; i += 1) if (pick[i]) n[Math.min(255, Math.round(L[i]))] += 1;
  let k = 0;
  for (let s = n[0]; k < 255 && s * 2 < all; k += 1) s += n[k + 1];
  return Math.max(1, k);
}

// The snow map for this layout, worked out again when a realm's layer or the road's is repainted. at holds each pixel's
// level, dim whether it lies over dark ground, drift its mark from wxMounds; caps each top edge of what stands still as
// [column, row, how flat (0 to 3) plus 4 when it faces right, away from the light]; sparks the pixels that may glint.
function wxSnowMap(sc) {
  const land = sc.realms.map((r) => skLayers.get(`land${r.x0}`));
  const front = sc.realms.map((r) => skLayers.get(`landf${r.x0}`));
  const road = skLayers.get('road');
  const key = `${sc.W},${sc.realms.map((r, k) => `${r.x0}:${r.w}:${land[k]?.key}:${front[k]?.key}`).join('|')},${road?.key}`;
  if (wxSnow.key === key) return wxSnow;
  const w2 = sc.W * SC_RES;
  const h2 = (SCENE_H - WX_SNOW_TOP) * SC_RES;
  const at = new Uint8Array(w2 * h2).fill(255);
  const dim = new Uint8Array(w2 * h2);
  const drift = wxMounds(sc, w2, h2);
  const [caps, sparks] = [[], []];
  // A pixel of ground the snow may cover, dark (0 to 1) as much darker than its ground's middle tone as it is: k times
  // that and lift later it is covered, and over clearly darker ground the snow is bluer.
  const field = new Float32Array((w2 >> 1) * (h2 >> 1) + w2).fill(-1);
  const cover = (X, py, dark, k, lift = 0) => {
    const i = py * w2 + X;
    const bias = Math.max(-0.04, Math.min(0.32, dark * k)) + lift;
    at[i] = wxLevel(field, w2, X, py, bias);
    dim[i] = dark > 0.12;
    if (wxHash(X, py * 7 + 3) < 1 / 900 && bias < 0.12) sparks.push(X, py);
  };
  const tufts = typeof landWind === 'function' ? !landWind() : true;
  sc.realms.forEach((r, k) => {
    if (!land[k] || typeof landGround !== 'function') return;
    const cx = r.x0 + Math.floor(r.w / 2);
    const F = wxRealmPixels(r, (g) => drawRealm(g, r, 0, sc.sky));
    const F2 = wxRealmPixels(r, (g) => drawRealm(g, r, 37, sc.sky));
    const G = wxRealmPixels(r, (g) => landGround(g, r, tufts));
    const Hh = r.kind === 'hobbit' && typeof shireHill === 'function' ? wxRealmPixels(r, (g) => shireHill(g, cx)) : null;
    const S = wxRealmPixels(r, (g) => { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(land[k].cv, 0, 0); if (front[k]) g.drawImage(front[k].cv, 0, 0); });
    const [lw, lh] = [(r.w + 16) * SC_RES, (ROAD_Y - WX_SNOW_TOP) * SC_RES];
    // What each pixel is: 4 something that moves and is there at both of two moments (a trunk, the falls and their
    // pool), else by the still layers: 1 open ground, 2 the hill, 3 still landmark, 0 sky. Smoke and a swaying crown
    // pass over the snow and leave it.
    const kind = new Uint8Array(lw * lh);
    for (let p = 0; p < lw * lh; p += 1) {
      const i = p * 4;
      if (!F[i + 3]) continue;
      if (!wxSame(F, S, i) && !wxSame(F2, S, i)) kind[p] = 4;
      else if (G[i + 3] && wxSame(S, G, i)) kind[p] = 1;
      else if (Hh && Hh[i + 3] === 255 && wxSame(S, Hh, i)) kind[p] = 2;
      else kind[p] = S[i + 3] ? 3 : 0;
    }
    const SL = wxSoftLum(S, lw);
    const mid = [0, wxMid(SL, kind.map((v) => v === 1)), Hh ? wxMid(SL, kind.map((v) => v === 2)) : 1];
    for (let py = 1; py < lh; py += 1) {
      for (let j = 8 * SC_RES; j < (r.w + 8) * SC_RES; j += 1) {
        const p = py * lw + j;
        const X = (r.x0 - 8) * SC_RES + j;
        const v = kind[p];
        if (v === 1 || v === 2) cover(X, py, (mid[v] - SL[p]) / mid[v], v === 1 ? 1 : 0.6);
        else if (v === 3 && kind[p - lw] !== 3 && kind[p - lw] !== 4) caps.push(X, py, 0);
      }
    }
  });
  // How flat each rim is: how many of the three columns either side have a rim within a row of it (0 to 3, halved), so
  // a rim thickens smoothly along a flat edge and thins where the edge turns; whether it faces right, falling away; and
  // its neighbours within three columns and four rows, [rim, columns away], so the snow can fill the dips between them.
  const capAt = new Map();
  for (let n = 0; n < caps.length; n += 3) capAt.set(caps[n + 1] * w2 + caps[n], n);
  const has = (X, py) => capAt.has(py * w2 + X) || capAt.has((py - 1) * w2 + X) || capAt.has((py + 1) * w2 + X);
  const nbs = [];
  for (let n = 0; n < caps.length; n += 3) {
    const [X, py] = [caps[n], caps[n + 1]];
    let score = 0;
    for (const d of [-3, -2, -1, 1, 2, 3]) score += has(X + d, py);
    const right = !has(X + 1, py) && (capAt.has((py + 2) * w2 + X + 1) || capAt.has((py + 3) * w2 + X + 1));
    caps[n + 2] = Math.floor(score / 2) + (right ? 4 : 0);
    const nb = [];
    for (let dx = -3; dx <= 3; dx += 1) for (let dy = -4; dy <= 4 && dx; dy += 1) if (capAt.has((py + dy) * w2 + X + dx)) nb.push(capAt.get((py + dy) * w2 + X + dx), Math.abs(dx));
    nbs.push(nb);
  }
  if (road) {
    const [rw, rh, py0] = [road.cv.width, road.cv.height, (ROAD_Y - WX_SNOW_TOP) * SC_RES];
    const RL = wxSoftLum(wxPixels(road.cv), rw);
    const mid = wxMid(RL, new Uint8Array(rw * rh).fill(1));
    for (let p = 0; p < rw * rh; p += 1) {
      const [X, py] = [p % rw, Math.floor(p / rw)];
      if (X < w2) cover(X, py0 + py, (mid - RL[p]) / mid, 1.5, 0.06);
    }
  }
  return Object.assign(wxSnow, { key, drawn: '', at, dim, drift, caps, nbs, sparks, w2, h2 });
}

// Paints the snow at level s (0 to 1) into the map's canvas: each covered pixel lit if the one above is bare, shaded if
// the one below is, otherwise its body, with the drifts showing as it deepens; then the rims, a few columns at first and
// every one by a third of the way, thicker as it deepens, lit on top and shaded where they meet what they lie on.
function wxSnowPaint(M, s) {
  const { w2, h2, at, dim, drift, caps } = M;
  if (M.img?.width !== w2 || M.img?.height !== h2) {
    M.img = new ImageData(w2, h2);
    M.cv = document.createElement('canvas');
    [M.cv.width, M.cv.height] = [w2, h2];
  }
  const d = M.img.data;
  d.fill(0);
  const lvl = Math.min(255, s * 262);
  const deep = wxClamp((s - 0.45) / 0.4) * 100;
  const put = (i, c) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; };
  for (let i = w2; i < at.length - w2; i += 1) {
    if (at[i] >= lvl) continue;
    if (at[i - w2] >= lvl) { put(i, WX_WHITE.lit); continue; }
    if (at[i + w2] >= lvl) { put(i, WX_WHITE.shade); continue; }
    const m = drift[i] && deep > (wxHash(i % 97, 3) * 0.6 + 0.2) * 100 ? drift[i] : 0;
    put(i, m === 1 ? WX_WHITE.rise : m === 2 ? WX_WHITE.face : m === 3 ? WX_WHITE.shade : dim[i] ? WX_WHITE.dim : WX_WHITE.body);
  }
  const grow = wxClamp((s - 0.1) / 0.7);
  const top = new Float32Array(caps.length / 3).fill(1e9);
  for (let k = 0; k < caps.length; k += 3) {
    if (wxHash(caps[k], 61) <= s * 3) top[k / 3] = caps[k + 1] + 1 - Math.max(1, Math.round(((caps[k + 2] & 3) + 1) * 2 * grow));
  }
  const fill = top.map((t, n) => { let m = t; const nb = M.nbs[n]; for (let j = 0; j < nb.length; j += 2) m = Math.min(m, top[nb[j] / 3] + nb[j + 1]); return t < 1e9 ? Math.max(m, t - 3) : t; });
  for (let k = 0; k < caps.length; k += 3) {
    const [X, py, f] = [caps[k], caps[k + 1], caps[k + 2]];
    const T = py + 1 - fill[k / 3];
    for (let t = 0; t < T && py - t >= 0; t += 1) {
      put((py - t) * w2 + X, t === T - 1 ? (f & 4 ? WX_WHITE.body : WX_WHITE.lit) : t === 0 && T > 2 ? WX_WHITE.shade : WX_WHITE.body);
    }
  }
  M.cv.getContext('2d').putImageData(M.img, 0, 0);
}

// The ground pass's settled snow: the map's canvas, painted again only when the level or the layout changes; then its
// glints, each crystal catching the light for a moment now and then (a few hold still with reduced motion, and they are
// dimmer at night); then any war fires (scenery.js) again, burning on top of it.
function wxSnowDraw(g, sc) {
  const M = wxSnowMap(sc);
  const s = sc.weather.snow;
  const key = `${M.key},${s}`;
  if (M.drawn !== key) { wxSnowPaint(M, s); M.drawn = key; }
  g.drawImage(M.cv, 0, WX_SNOW_TOP, sc.W, SCENE_H - WX_SNOW_TOP);
  const lvl = Math.min(255, s * 262);
  const still = scReduced.matches;
  g.fillStyle = '#ffffff';
  g.globalAlpha = sc.sky.night ? 0.55 : 0.95;
  g.beginPath();
  for (let n = 0; n < M.sparks.length; n += 2) {
    const [X, py] = [M.sparks[n], M.sparks[n + 1]];
    if (M.at[py * M.w2 + X] >= lvl) continue;
    const f = still ? (n % 6 ? 9 : 1) : (sc.tick + Math.floor(wxHash(X, py) * 97)) % 37;
    if (f > 2) continue;
    const [x, y] = [X / SC_RES, WX_SNOW_TOP + py / SC_RES];
    g.rect(x, y, 0.25, 0.25);
    if (f === 1) { g.rect(x - 0.25, y, 0.75, 0.25); g.rect(x, y - 0.25, 0.25, 0.75); }
  }
  g.fill();
  g.globalAlpha = 1;
  if (sc.war) for (const r of sc.realms) drawFires(g, r, sc.tick, sc.war);
}

// The roofs among the props: the healing house's and the well's (scenery-heal.js, scenery-farm.js), each drawn once
// into a canvas of its own to find the top of its outline in each column, as [column, row, how flat, faces right] in
// pixels from the prop's corner. Only tops in the upper part of the prop count, so the herb bed, the mortar and the
// well's crank and bucket (which move) get none.
const wxRoofCaps = new Map();
function wxPropCaps(p) {
  const [x0, y0, w, h] = [p.x - 2, p.y - 2, p.w + 4, p.base - p.y + 3];
  const key = `${p.type},${p.side},${p.x % 1},${w},${h}`;
  if (!wxRoofCaps.has(key)) {
    const [cw, ch] = [w * SC_RES, h * SC_RES];
    const d = wxDraw(cw, ch, (g) => { g.setTransform(SC_RES, 0, 0, SC_RES, -x0 * SC_RES, -y0 * SC_RES); drawProp(g, p, {}, 0); });
    const tops = [...Array(cw)].map((_, X) => { for (let py = 0; py < ch * 0.5; py += 1) if (d[(py * cw + X) * 4 + 3] > 128) return py; return -1; });
    wxRoofCaps.set(key, tops.map((py, X) => {
      const [a, b] = [tops[X - 1] ?? py, tops[X + 1] ?? py];
      const dd = Math.max(Math.abs(a - py), Math.abs(b - py));
      return [X, py, dd === 0 ? 2 : dd === 1 ? 1 : 0, b > py + 1];
    }).filter(([, py]) => py >= 0));
  }
  return [x0, y0, wxRoofCaps.get(key)];
}
// The items pass: each roof's rim of snow as an item just after its prop, so a worker in front still hides it. The
// snow lies on the roof's top edge, lit along its top and shaded where it meets the roof, in a path per colour.
function wxItems(list, sc) {
  const s = sc.weather.snow;
  if (s <= 0 || typeof realmProps !== 'function' || typeof drawProp !== 'function') return;
  const grow = wxClamp((s - 0.1) / 0.7);
  for (const r of sc.realms) {
    for (const p of realmProps(r).list) {
      if (p.type !== 'heal' && p.type !== 'well') continue;
      list.push({ z: p.base + 0.01, draw: () => {
        const [x0, y0, caps] = wxPropCaps(p);
        for (const [colour, top] of [['#e6ecf5', false], ['#fbfdff', true], ['#c4d0e4', null]]) {
          scG.fillStyle = colour;
          scG.beginPath();
          for (const [X, py, flat, right] of caps) {
            if (wxHash(X, 62) > s * 3) continue;
            const T = Math.max(1, Math.round((5 + flat * 2 + (wxHash(X, 63) - 0.5) * 2) * grow));
            const [x, y] = [x0 + X / SC_RES, y0 + (py + 1 - T) / SC_RES];
            if (top === false) scG.rect(x, y, 0.25, T / SC_RES);
            else if (top && !right) scG.rect(x, y, 0.25, 0.25);
            else if (top === null && T > 2) scG.rect(x, y0 + py / SC_RES, 0.25, 0.25);
          }
          scG.fill();
        }
      } });
    }
  }
}
