// scene2-gondor.js: Gondor and Mordor on the map from above (scene2.js). The world's composer (scene2-world.js) paints
// Mordor's ground first (m2Mordor) and sets the standing things with the quiet places (m2Gondor). The south's own files
// draw each landmark in full through m2.builds and mark it in m2.south, so the plain stand-ins here step aside:
// scene2-gondor-*.js (the White City, the Pelennor, Osgiliath, the southern fields, the great river and the Sea),
// scene2-mordor*.js (the Black Gate, Barad-dur, Mount Doom, the Dead Marshes), scene2-helm*.js and scene2-isengard*.js.
// It also holds the south's painting kit: m2SouthArt paints a canvas once per key straight into its pixels, which is
// far quicker than m2Raster's rectangles for big art, and m2SouthThing stands one on the map with its footprint.

const m2SouthCache = new Map();
const m2SouthHex = new Map();
// A canvas w by h units at 4 pixels a unit, painted once per key by rule(px, py), which gives each pixel's colour as
// '#rrggbb' or nothing. Cached, so a relayout at the same size costs nothing. The canvas keeps its pixels (c.px32),
// so a glow or mask can be taken from them without reading the canvas back.
function m2SouthArt(key, w, h, rule) {
  const k = `${key}|${w}|${h}`;
  if (m2SouthCache.has(k)) return m2SouthCache.get(k);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * 4));
  c.height = Math.max(1, Math.ceil(h * 4));
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const px32 = new Uint32Array(img.data.buffer);
  let [last, lastV] = ['', 0];
  for (let py = 0, i = 0; py < c.height; py += 1) {
    for (let px = 0; px < c.width; px += 1, i += 1) {
      const hex = rule(px, py);
      if (!hex) continue;
      if (hex !== last) {
        last = hex;
        lastV = m2SouthHex.get(hex);
        if (lastV === undefined) { lastV = m2Pack(hex); m2SouthHex.set(hex, lastV); }
      }
      px32[i] = lastV;
    }
  }
  g.putImageData(img, 0, 0);
  c.px32 = px32;
  m2SouthCache.set(k, c);
  return c;
}
// Stands a painted canvas on the map at (x, y), w by h units, sorted by z (the row where it meets the ground), with
// foot [x0, y0, x1, y1] as the ground it blocks for walkers. Returns the object.
function m2SouthThing(add, key, x, y, w, h, z, rule, foot) {
  const c = m2SouthArt(key, w, h, rule);
  const o = { x, y, w, h, z, c, draw: (dst) => dst.drawImage(c, x, y, w, h) };
  if (foot) o.foot = foot;
  add.obj(o);
  return o;
}

// Gondor's and Mordor's standing things, after the forests and the quiet places.
function m2Gondor(L, plan, season, add) {
  const P = plan.places;
  const S = m2.south ?? {};
  if (!S.city) m2MinasTirith(L, add, P.minasTirith.x, P.minasTirith.y);
  if (S.mordor) return;
  m2Doom(L, add, P.doom.x, P.doom.y);
  m2Tower(L, add, P.baradDur.x, P.baradDur.y, 9, 40, ['#020203', '#0c0a0e', '#16121a', '#201a24', '#2c2430', '#3a2e3c'], true);
  plan.places.eye = { x: P.baradDur.x, y: P.baradDur.y - 44 };
}

// Mordor: ash inside its mountain walls (scene2-places.js sets Mount Doom and Barad-dur on it), fraying at its edges.
function m2Mordor(L, plan) {
  if (typeof m2MordorLand === 'function') { m2MordorLand(L, plan); return; }
  const { x0, y0, x1, y1 } = plan.mordor;
  m2Rect(L, x0, y0, x1 - x0, y1 - y0, M2_MAT.ash);
  for (let t = 0; t < (x1 - x0) + (y1 - y0); t += 6) {
    const [x, y] = t < x1 - x0 ? [x0 + t, y0] : [x0, y0 + t - (x1 - x0)];
    m2Blob(L, x, y, 3 + m2Hash(t, 1, 57) * 4, 3 + m2Hash(t, 2, 57) * 3, M2_MAT.ash, { wob: 1.5, seed: t });
  }
}

// Minas Tirith on the shoulder of the White Mountains: seven white tiers each walled and roofed, rising one inside the
// next, and the white tower above them all with its pennant.
function m2MinasTirith(L, add, x, y) {
  const W = ['#5e6066', '#8e9096', '#b8bac0', '#d8dade', '#eeeff2', '#ffffff'];
  m2Shadow(L, x + 5, y, 24, 3, 0.8);
  m2Thing(add, x - 22, y - 42, 44, 42.5, y, (g) => {
    for (let i = 0; i < 7; i += 1) {
      const [rx, ry, by] = [22 - i * 2.6, 6 - i * 0.5, 42 - i * 4.4];
      m2Raster(g, 22 - rx, by - ry * 2 - 3, rx * 8, ry * 8 + 12, (px, py) => {
        const [nx, ny] = [(px + 0.5 - rx * 4) / (rx * 4), (py + 0.5 - ry * 4) / (ry * 4)];
        const top = nx * nx + ny * ny <= 1;
        const face = !top && Math.abs(nx) <= 1 && py >= ry * 4 && py < ry * 4 + 12 && (ny * ny + nx * nx > 1 || py >= ry * 4);
        if (top) return (px + py * 3) % 11 === 0 ? W[2] : W[nx < -0.3 ? 5 : nx < 0.4 ? 4 : 3];
        if (face && Math.hypot(nx, (py - 12 + 0.5 - ry * 4) / (ry * 4)) <= 1) return py >= ry * 4 + 10 ? W[0] : (px % 7 === 0 && py % 5 === 2 ? '#3a3c48' : W[nx < 0 ? 3 : 2]);
        return null;
      });
    }
    m2Raster(g, 21, 0, 8, 34, (px, py) => (px < 1 || px > 6 ? (py < 6 ? null : W[0]) : W[px < 3 ? 5 : px < 5 ? 4 : 2]));
    m2Raster(g, 22.5, -0.5, 12, 4, (px, py) => (px === 0 ? W[0] : py < 3 - px / 5 ? '#e0e8f4' : null));
  });
  add.light({ x, y: y - 20, r: 9, c: '#ffe2a0' });
}
// Mount Doom: a dark cone of ash with lava running down its flanks from a crater that glows.
function m2Doom(L, add, x, y) {
  m2Shadow(L, x + 5, y, 15, 3, 0.85);
  m2Thing(add, x - 14, y - 20, 28, 20.5, y, (g) => {
    m2Raster(g, 0, 0, 112, 82, (px, py) => {
      const half = 10 + py * 0.56;
      const dx = px + 0.5 - 56;
      if (Math.abs(dx) > half || py < 4) return null;
      if (py < 7) return Math.abs(dx) < half - 5 ? ['#ff8a2a', '#ffd35a', '#c2441c'][(px + py) % 3] : '#2a1a14';
      const lava = Math.abs(dx - Math.sin(py / 5) * 6 - (px > 56 ? 12 : -16)) < 1.2 && py < 70;
      if (lava) return py % 6 < 3 ? '#ff6a1a' : '#c2341a';
      if (Math.abs(dx) > half - 1.2) return '#0c0808';
      return ['#3a2c28', '#2c221f', '#201816', '#160f0e'][dx < -half * 0.4 ? 0 : dx < half * 0.1 ? 1 : dx < half * 0.6 ? 2 : 3];
    });
  });
  add.light({ x, y: y - 19, r: 10, c: '#ff6a2a', fire: true });
}
