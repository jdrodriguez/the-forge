// scene2-land-eriador.js: the wilds of Eriador on the map from above (scene2.js), each drawn round its place in
// plan.places: Weathertop (Amon Sul), a bald round hill above the Weather Hills that run north from it, with the broken
// ring of the old watchtower's stones on its flat crown; the Barrow-downs, low green downs crowned with round barrows
// ringed by standing stones (one with a dark doorway) and a stone circle on the highest, with a light mist in their
// hollows at night; and the Withywindle, a dark slow stream winding through the Old Forest down to the Brandywine, with
// Old Man Willow, a huge grey-green willow with a cracked trunk, on its bank. Bree is drawn by
// scene2-land-eriador-bree.js and the Trollshaws by scene2-land-eriador-trolls.js; m2LandEriador calls them all.

// Every painted canvas, by its key (kind, size, season, seed), so a relayout paints nothing twice.
const m2EriArt = new Map();
function m2EriCanvas(key, w, h, paint) {
  if (!m2EriArt.has(key)) {
    const { c, g } = m2Canvas(w, h);
    const out = paint(g) ?? {};
    m2EriArt.set(key, { c, w, h, ...out });
  }
  return m2EriArt.get(key);
}
// Like m2Raster, for big busy pictures: the rule's colours go into pixels at once and the picture is drawn over g at
// (x, y) units, w by h pixels.
const m2EriPack = new Map();
function m2EriPixels(g, x, y, w, h, rule) {
  const img = new ImageData(w, h);
  const out = new Uint32Array(img.data.buffer);
  let [last, packed] = [null, 0];
  for (let py = 0, i = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1, i += 1) {
      const c = rule(px, py);
      if (!c) continue;
      if (c !== last) {
        if (!m2EriPack.has(c)) m2EriPack.set(c, m2Pack(c));
        [last, packed] = [c, m2EriPack.get(c)];
      }
      out[i] = packed;
    }
  }
  const t = document.createElement('canvas');
  [t.width, t.height] = [w, h];
  t.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(t, x, y, w / 4, h / 4);
}
// Stands a cached canvas with its top-left at (x, y), sorted by z, blocking walkers in foot when given.
function m2EriPut(add, art, x, y, z, foot) {
  const o = { x, y, w: art.w, h: art.h, z, draw: (g) => g.drawImage(art.c, x, y, art.w, art.h) };
  if (foot) o.foot = foot;
  add.obj(o);
  return o;
}
// Whether the ground in an ellipse rx by ry round (x, y) is clear: no water, road, cliff or realm, and inside the world.
function m2EriClear(L, plan, x, y, rx, ry) {
  if (x - rx < 2 || x + rx > plan.W - 2 || y - ry < 2 || y + ry > plan.H - 2) return false;
  if (plan.realms.some((r) => x + rx > r.x && x - rx < r.x + r.w && y > r.y && y - ry * 3 < r.y + r.h)) return false;
  for (let a = 0; a < 6.28; a += 0.5) for (const f of [0.35, 0.7, 1]) {
    const m = m2MatAt(L, x + Math.cos(a) * rx * f, y + Math.sin(a) * ry * f);
    if (m === M2_MAT.water || m === M2_MAT.road || m === M2_MAT.cliff) return false;
  }
  return true;
}
// The nearest clear spot to (x, y) on a widening spiral, or (x, y) itself when none is found within reach units.
function m2EriFind(L, plan, x, y, rx, ry, reach = 24, taken = []) {
  for (let d = 0; d <= reach; d += 2) {
    for (let k = 0; k < Math.max(1, d * 1.5); k += 1) {
      const a = (k / Math.max(1, d * 1.5)) * Math.PI * 2;
      const [cx, cy] = [x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8];
      if (taken.some((t) => Math.abs(t.x - cx) < t.rx + rx - 2 && Math.abs(t.y - cy) < t.ry + ry + 3)) continue;
      if (m2EriClear(L, plan, cx, cy, rx, ry)) return [cx, cy, true];
    }
  }
  return [x, y, false];
}
// A hill seen from overhead in a box 2rx wide and hgt + 2ry tall at (ox, oy): a dome rx across, ry deep on the ground
// and hgt high, lit on its upper left in the grass ramp G, with tufts; flat (0 to 1) cuts its top into a plateau that is
// lit as one. Returns its crown: centre and radii.
function m2EriHill(g, ox, oy, rx, ry, hgt, G, flat = 0, seed = 0, rock = 0) {
  const [R, Yc] = [rx * 4, (hgt + ry) * 4];
  const cr = flat ? Math.sqrt(1 - (1 - flat) ** 2) : 0;
  const crown = { x: ox + rx, y: oy + Yc / 4 - hgt, rx: cr * rx, ry: cr * rx * (ry / rx) * 0.9 };
  m2Raster(g, ox, oy, R * 2, Yc + ry * 4, (px, py) => {
    const nx = (px + 0.5 - R) / R;
    if (Math.abs(nx) >= 1) return null;
    const s = Math.sqrt(1 - nx * nx);
    const f = flat ? Math.min(1, s / (1 - flat)) : s;
    const yt = Math.min(Yc - ry * 4 * s, Yc - hgt * 4 * f);
    const yb = Yc + ry * 4 * s;
    if (py < yt || py > yb) return null;
    const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
    const tuft = m2Hash(px >> 1, py, seed + 3) < 0.05 ? 0.35 : m2Hash(px >> 1, py - 1, seed + 3) < 0.05 ? -0.35 : 0;
    if (cr) {
      const [cx, cy] = [(px + 0.5 - R) / (crown.rx * 4), (py + 0.5 - (crown.y - oy) * 4) / (crown.ry * 4)];
      const d = cx * cx + cy * cy;
      if (d < 0.82) return G[b + tuft > 0.85 ? 5 : b + tuft < 0.2 ? 3 : 4];
      if (d < 1) return G[cy < 0 ? 5 : 3];
    }
    if (py >= yb - 1 && nx > -0.4) return G[0];
    if (py < yt + 1 && nx > 0.1) return G[1];
    if (rock && m2Noise(px, py * 1.6, 7, seed) > 1 - rock && py > yt + 6) {
      const r = M2_PAL.stone;
      return m2Noise(px - 2, py * 1.6 - 3, 7, seed) > 1 - rock ? r[nx < 0 ? 5 : 3] : r[1];
    }
    const v = (py - yt) / Math.max(1, yb - yt);
    const light = -0.9 * nx + (0.25 - v) * 1.2 + (b - 0.5) * 0.4 + tuft;
    return G[light > 0.62 ? 5 : light > 0.22 ? 4 : light > -0.15 ? 3 : light > -0.5 ? 2 : 1];
  });
  return crown;
}
// A standing stone w by h units with its foot at (x, y) in canvas g: lit on its left, a darker crown of lichen.
function m2EriStone(g, x, y, w, h, seed, P = M2_PAL.stone) {
  m2Raster(g, x - w / 2, y - h, w * 4, h * 4, (px, py) => {
    const top = Math.round(m2Hash(seed, px, 81) * 1.6);
    if (py < top || (py < 2 && (px === 0 || px === w * 4 - 1))) return null;
    if (px === 0 || px === w * 4 - 1 || py === h * 4 - 1) return P[0];
    if (py <= top + 1) return P[py === top ? 4 : 5];
    if (m2Hash(px, py + seed, 82) < 0.08) return '#5f6e3e';
    return P[px < w * 1.6 ? 5 : px < w * 2.8 ? 3 : 2];
  });
}
const m2EriGrass = (season, warm = 0) => m2GrassHex(M2_MAT.wild, season).map((c) => (warm ? hdMix(c, '#c8b468', warm) : c));

// Weathertop: the bald hill with its plateau and the broken ring of Amon Sul, two lower Weather Hills behind it to the
// north, a footpath winding up its south face. The Sentry's posts stand at its foot, south of the hill.
function m2EriWeathertop(L, plan, season, add) {
  const p = plan.places.weathertop;
  const G = m2EriGrass(season, 0.06);
  const hills = [[-9, -22, 10, 4, 10, 5], [0, -2, 16, 6, 19, 1]];
  for (const [dx, dy, rx, ry, hgt, seed] of hills) {
    const art = m2EriCanvas(`wt${rx},${season}`, rx * 2, hgt + ry * 2, (g) => {
      const crown = m2EriHill(g, 0, 0, rx, ry, hgt, G, seed === 1 ? 0.2 : 0, seed, 0.25);
      if (seed !== 1) return;
      // The ring: eleven stones round the crown, three fallen away, the back ones first.
      const stones = [...Array(14).keys()].filter((i) => ![3, 7, 8].includes(i)).map((i) => {
        const a = (i / 14) * Math.PI * 2 + 0.2;
        return [crown.x + Math.cos(a) * crown.rx * 0.78, crown.y + Math.sin(a) * crown.ry * 0.78, i];
      }).sort((a, b) => a[1] - b[1]);
      for (const [sx, sy, i] of stones) m2EriStone(g, sx, sy + 0.4, i % 3 ? 2.25 : 1.75, 2.5 + m2Hash(i, 2, 83) * 2.5, i, ['#1a1818', '#33302e', '#4d4844', '#6a645e', '#8c857c', '#b0a99c']);
      for (const [sx, sy] of [[crown.x + 2.5, crown.y + 1.5], [crown.x - 4, crown.y - 0.5]]) m2EriStone(g, sx, sy, 2, 0.75, 9);
      m2Raster(g, rx - 0.5, hgt + ry, 6, (ry + 0.2) * 4 - 2, (px, py) => (Math.abs(px - 2.5 + Math.sin(py / 3) * 2) < 1.2 ? '#b8a878' : null));
    });
    const [x, y] = [p.x + dx - rx, p.y + dy - hgt - ry * 2];
    m2Shadow(L, p.x + dx + rx * 0.35, p.y + dy, rx + 1, ry * 0.6, 0.8);
    m2EriPut(add, art, x, y, p.y + dy, [p.x + dx - rx * 0.85, p.y + dy - ry * 1.6, p.x + dx + rx * 0.85, p.y + dy]);
  }
}

// The Barrow-downs: four low downs, a stone circle on the highest and round barrows on the others, each barrow ringed
// with small standing stones, and a dark door in the south face of one.
function m2EriBarrow(g, x, y, r, seed, door) {
  const ring = [...Array(8).keys()].map((i) => {
    const a = (i / 8) * Math.PI * 2 + seed;
    return [x + Math.cos(a) * (r + 1.4), y + Math.sin(a) * (r * 0.42 + 0.7), i];
  });
  for (const [sx, sy, i] of ring) if (sy < y) m2EriStone(g, sx, sy, 1, 1.75 + (i % 2) * 0.5, i + seed);
  const G = ['#26381e', '#35502a', '#486a34', '#5e8440', '#7a9e52', '#9cba6c'];
  m2Raster(g, x - r, y - r * 0.9, r * 8, r * 5.4, (px, py) => {
    const [nx, ny] = [(px + 0.5 - r * 4) / (r * 4), (py + 0.5 - r * 3.6) / (r * 3.6)];
    if (ny > 0 ? nx * nx + (ny * 2.4) ** 2 > 1 : nx * nx + ny * ny > 1) return null;
    if (ny > 0.3 && nx > -0.3 && nx * nx + (ny * 2.4) ** 2 > 0.8) return G[0];
    const l = -0.8 * nx - 0.7 * ny + (M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * 0.4;
    return G[l > 0.55 ? 5 : l > 0.15 ? 4 : l > -0.25 ? 3 : 2];
  });
  if (door) {
    pxBox(g, x - 1.25, y - 1.5, 2.5, 2.25, M2_PAL.stone[3]);
    pxBox(g, x - 0.75, y - 1, 1.5, 1.75, '#07060a');
    pxBox(g, x - 1.5, y - 1.75, 3, 0.5, M2_PAL.stone[5]);
    pxBox(g, x + 0.75, y - 1.25, 0.5, 2, M2_PAL.stone[1]);
  }
  for (const [sx, sy, i] of ring) if (sy >= y) m2EriStone(g, sx, sy, 1, 1.75 + (i % 2) * 0.5, i + seed);
}
function m2EriDowns(L, plan, season, add) {
  const p = plan.places.barrowDowns;
  const G = m2EriGrass(season, 0.05).map((c) => hdMix(c, '#6aa048', 0.25));
  const downs = [[-4, 2, 12, 5, 7, 'circle'], [8, -14, 11, 4, 5, 'barrows2'], [16, 14, 10, 4, 5, 'door'], [-10, -20, 8, 4, 4, 'barrow']];
  m2EriState.mist = [];
  const taken = [];
  for (const [dx0, dy0, rx0, ry0, hgt0, what] of downs) {
    // Where the downs are squeezed between the rivers and the road, a down shrinks to fit or is left out.
    let rx; let ry; let hgt; let half; let fx; let fy; let ok = false;
    for (const sc of [1, 0.8, 0.65]) {
      [rx, ry, hgt] = [Math.round(rx0 * sc), Math.max(3, Math.round(ry0 * sc)), Math.max(3, Math.round(hgt0 * sc))];
      half = ry + hgt / 2;
      [fx, fy, ok] = m2EriFind(L, plan, p.x + dx0, p.y + dy0 - half, rx, half, 40, taken);
      if (ok) break;
    }
    if (!ok) continue;
    taken.push({ x: fx, y: fy, rx, ry: half });
    const [dx, dy] = [fx - p.x, fy + half - p.y];
    const art = m2EriCanvas(`bd${what}${rx},${season}`, rx * 2, hgt + ry * 2, (g) => {
      const c = m2EriHill(g, 0, 0, rx, ry, hgt, G, 0.2, rx);
      if (what === 'circle') {
        const stones = [...Array(10).keys()].map((i) => [c.x + Math.cos(i * 0.628) * c.rx * 0.8, c.y + Math.sin(i * 0.628) * c.ry * 0.8, i]).sort((a, b) => a[1] - b[1]);
        for (const [sx, sy, i] of stones) m2EriStone(g, sx, sy + 0.5, 1.25, 3 + (i % 3) * 0.5, i + 40);
      } else if (what === 'barrows2') {
        m2EriBarrow(g, c.x - 4.5, c.y + 0.5, 3, 1, false);
        m2EriBarrow(g, c.x + 4, c.y + 1.5, 3.5, 2, false);
      } else m2EriBarrow(g, c.x, c.y + 1, what === 'door' ? 4 : 3, 3, what === 'door');
    });
    const [cx, cy] = [p.x + dx, p.y + dy];
    m2Shadow(L, cx + rx * 0.3, cy, rx, ry * 0.5, 0.85);
    m2EriPut(add, art, cx - rx, cy - hgt - ry * 2, cy, [cx - rx * 0.8, cy - ry * 1.5, cx + rx * 0.8, cy]);
    m2EriState.mist.push({ x: cx + rx * 0.7, y: cy + 1, w: rx * 1.1 });
  }
}

// Mist lying in the downs' hollows at night: a thin dithered veil that breathes, light enough to see through.
const m2EriState = { mist: [] };
m2.layers.air.push((g, tick, reduced) => {
  const dark = typeof m2Dark === 'function' ? m2Dark(m2.sky?.hour ?? 12)[0] : 0;
  if (dark < 0.05 || !m2EriState.mist.length) return;
  for (const [i, m] of m2EriState.mist.entries()) {
    const art = m2EriCanvas(`mist${Math.round(m.w)}`, m.w * 2, 5, (mg) => m2Raster(mg, 0, 0, m.w * 8, 20, (px, py) => {
      const d = ((px + 0.5 - m.w * 4) / (m.w * 4)) ** 2 + ((py - 10) / 9) ** 2;
      return d < 1 && M2_BAYER[(py & 3) * 4 + (px & 3)] > 0.35 + d * 0.5 ? '#dfe6ee' : null;
    }));
    g.globalAlpha = dark * (0.2 + 0.06 * Math.sin((reduced ? 0 : tick) / 40 + i));
    g.drawImage(art.c, m.x - m.w + (reduced ? 0 : Math.sin(tick / 90 + i) * 1.5), m.y - 2.5, art.w, art.h);
  }
  g.globalAlpha = 1;
});

function m2LandEriador(L, plan, season, add) {
  const P = plan.places;
  if (!P.bree || !P.weathertop) return;
  if (typeof m2EriBree === 'function') m2EriBree(L, plan, season, add);
  m2EriWeathertop(L, plan, season, add);
  if (P.trollshaws && typeof m2EriTrolls === 'function') m2EriTrolls(L, plan, season, add);
  if (P.barrowDowns) m2EriDowns(L, plan, season, add);
  if (P.withywindle && typeof m2EriWithywindle === 'function') m2EriWithywindle(L, plan, season, add);
}
m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  m2LandEriador(L, plan, season, add);
  m2EriState.ms = performance.now() - t0;
});
