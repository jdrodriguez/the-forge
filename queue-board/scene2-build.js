// scene2-build.js: the kit the map from above (scene2.js) builds its standing things with, in the 3/4 overhead look:
// a roof shows its far slope as a lit sliver over the ridge and its near slope in courses of shingles down to the eave,
// a wall shows its south face under the eave (plaster, stone courses or timber), with arched, round or square windows
// (dark glass by day; scene2-fx.js lights them at night) and doors; terraces show a paved top and a retaining wall of
// blocks, with steps. Each thing is painted once, pixel by pixel through a rule (m2Raster), into its own canvas at 4
// pixels a unit, and stamped every frame in depth order with the figures. Light comes from the upper left.

// Ramps of six steps, outline to shine.
const M2_PAL = {
  elfRoof: ['#132430', '#1d3a4b', '#285264', '#366b7c', '#55909a', '#8cc2bf'],
  elfWall: ['#4f483e', '#857b68', '#ada38a', '#d2c8ac', '#e9e1c8', '#faf5e4'],
  stone: ['#262424', '#433f3c', '#5d5752', '#77706a', '#928a81', '#b3aca1'],
  wood: ['#2a1614', '#4e2c1c', '#74462a', '#a8703f', '#cf9a62', '#ecc48e'],
  thatch: ['#3a2810', '#64461c', '#8a672a', '#b0893c', '#cfaa55', '#e9cd86'],
  gold: ['#5e3a12', '#a8742a', '#e2b043', '#fbdd86', '#fffbe8', '#fffbe8'],
  glass: ['#141c28', '#1f2c3d', '#2c3e52', '#3d5268', '#56708a', '#7d96ae'],
};
// Paints a box of w by h pixels (a quarter unit each) whose top-left is at (x, y) units: rule(px, py) gives each
// pixel's colour or nothing; runs of one colour along a row become one rectangle.
function m2Raster(g, x, y, w, h, rule) {
  for (let py = 0; py < h; py += 1) {
    let run = null;
    let from = 0;
    for (let px = 0; px <= w; px += 1) {
      const c = px < w ? rule(px, py) : null;
      if (c === run) continue;
      if (run) { g.fillStyle = run; g.fillRect(x + from / 4, y + py / 4, (px - from) / 4, 0.25); }
      run = c;
      from = px;
    }
  }
}
// A canvas w by h units at 4 pixels a unit, its context in units.
function m2Canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * 4));
  c.height = Math.max(1, Math.ceil(h * 4));
  const g = c.getContext('2d');
  g.setTransform(4, 0, 0, 4, 0, 0);
  g.imageSmoothingEnabled = false;
  return { c, g };
}
// A standing thing w by h units drawn at (x, y), painted once by paint(g) in its own units, sorted by z (where it
// meets the ground). Returns it.
function m2Thing(add, x, y, w, h, z, paint) {
  const { c, g } = m2Canvas(w, h);
  paint(g);
  const o = { x, y, w, h, z, c, draw: (dst) => dst.drawImage(c, x, y, w, h) };
  add.obj(o);
  return o;
}

// The row just under the eave of a roof m2Roof paints at y with these slopes: a wall hung under the roof starts there,
// and a post holding the roof up reaches above it (pass 5, 2026-11-27: walls started at y + far + near + 1, three
// quarters of a unit under the eave, and every such roof floated).
function m2RoofEave(y, far, near) {
  return y + (Math.ceil((far + near) * 4) + 1) / 4;
}
// A hipped roof w units wide whose far slope is far units tall over the ridge and near slope near units under it,
// the hips cut in by hip units at the ridge: shingles in courses with staggered joints, the ridge capped, the eave's
// edge dark, the left hip lit and the right one shaded. Returns m2RoofEave, where the wall under it starts.
function m2Roof(g, x, y, w, far, near, P, hip = 0) {
  const [W, F, N] = [w * 4, far * 4, near * 4];
  const ridge = F;
  m2Raster(g, x, y, W, F + N + 1, (px, py) => {
    const t = py <= ridge ? (ridge - py) / Math.max(1, F) : (py - ridge) / Math.max(1, N);
    const inset = Math.round(hip * 4 * (1 - t));
    if (px < inset || px >= W - inset) return null;
    const edge = px === inset || px === W - inset - 1;
    if (py === F + N) return P[0];
    if (py <= ridge) return edge || py === 0 ? P[1] : py === ridge ? P[5] : P[4];
    if (edge) return P[0];
    const hipL = px < inset + Math.round(hip * 4 * t) + 1 && hip;
    const hipR = px > W - inset - Math.round(hip * 4 * t) - 2 && hip;
    const course = (py - ridge - 1) % 6;
    const joint = (px + (Math.floor((py - ridge - 1) / 6) % 2) * 4) % 8 === 0 && course > 0;
    let k = py - ridge < 3 ? 4 : course === 5 ? 1 : course === 0 ? 4 : joint ? 2 : 3;
    if (hipL) k = Math.min(5, k + 1);
    if (hipR) k = Math.max(1, k - 1);
    if (py >= F + N - 2) k = 1;
    return P[k];
  });
  return m2RoofEave(y, far, near);
}
// A wall's south face w by h units: plaster with a stone plinth and a lit band under the eave, coursed stone, or timber
// boards; the left edge lit and the right edge shaded.
function m2Wall(g, x, y, w, h, P, kind = 'plaster') {
  const [W, Hp] = [w * 4, h * 4];
  m2Raster(g, x, y, W, Hp, (px, py) => {
    if (px === 0 || px === W - 1 || py === Hp - 1) return P[0];
    if (py < 2) return P[1];
    let k = 3;
    if (kind === 'stone') {
      const row = Math.floor(py / 5);
      const j = (px + (row % 2) * 6) % 12;
      k = py % 5 === 0 || j === 0 ? 1 : py % 5 === 1 || j === 1 ? 4 : 2 + (m2Hash(Math.floor((px + (row % 2) * 6) / 12), row, 21) < 0.5 ? 1 : 0);
    } else if (kind === 'timber') {
      k = px % 6 === 0 ? 1 : px % 6 === 1 ? 4 : 3;
    } else {
      if (py > Hp - 6) k = py === Hp - 6 ? 4 : (px + (py % 2) * 3) % 6 === 0 ? 1 : 2;
      else if (py < 4) k = 4;
      else if (m2Hash(px >> 1, py >> 1, 22) < 0.05) k = 2;
    }
    if (px < 3) k = Math.min(5, k + 1);
    if (px > W - 4) k = Math.max(1, k - 1);
    return P[k];
  });
}
// A window w by h units in a wall: arched (elven), round (a hobbit's, with a cross of glazing bars), or square (with a
// sill), its frame in the wall's own ramp and its glass dark by day. Returns its pane for the night's light.
function m2Window(g, x, y, w, h, P, kind = 'arch') {
  const [W, Hp] = [w * 4, h * 4];
  const inside = (px, py, m) => {
    const [ax, ay] = [px + 0.5 - W / 2, py + 0.5];
    if (kind === 'round') return ax * ax + (ay - Hp / 2) ** 2 <= (W / 2 - m) ** 2;
    if (kind === 'arch' && ay < W / 2) return ax * ax + (ay - W / 2) ** 2 <= (W / 2 - m) ** 2;
    return Math.abs(ax) <= W / 2 - m && ay >= m && ay <= Hp - m;
  };
  m2Raster(g, x, y, W, Hp, (px, py) => {
    if (!inside(px, py, 0)) return null;
    if (!inside(px, py, 1.5)) return py > Hp / 2 && px > W / 2 ? P[1] : P[0];
    const bar = kind === 'round' ? px === Math.floor(W / 2) || py === Math.floor(Hp / 2) : kind === 'square' && px === Math.floor(W / 2);
    if (bar) return P[1];
    return M2_PAL.glass[py < Hp * 0.4 && px < W / 2 ? 4 : px > W * 0.65 ? 1 : 2];
  });
  if (kind === 'square') pxBox(g, x - 0.25, y + h - 0.5, w + 0.5, 0.75, P[4]);
  return { x, y, w, h, kind };
}
// A retaining wall of blocks w by h units under a terrace's edge, its top course lit.
function m2Retain(g, x, y, w, h, P) {
  m2Wall(g, x, y, w, h, P, 'stone');
  pxBox(g, x, y, w, 0.5, P[5]);
  pxBox(g, x, y + 0.5, w, 0.25, P[2]);
}
// Steps w units wide, n treads going down from (x, y), each lit along its nose.
function m2Steps(g, x, y, w, n, P) {
  for (let i = 0; i < n; i += 1) {
    pxBox(g, x - i * 0.25, y + i * 1.5, w + i * 0.5, 1.5, P[i % 2 ? 3 : 4]);
    pxBox(g, x - i * 0.25, y + i * 1.5, w + i * 0.5, 0.25, P[5]);
    pxBox(g, x - i * 0.25, y + i * 1.5 + 1.25, w + i * 0.5, 0.25, P[1]);
  }
}
// A slender pillar h units tall standing at (x, y): lit on its left, a capital and a base.
function m2Pillar(g, x, y, h, P) {
  m2Raster(g, x - 0.75, y - h, 6, h * 4, (px, py) => {
    const cap = py < 3 || py > h * 4 - 3;
    if (!cap && (px === 0 || px === 5)) return null;
    return px === 0 || px === 5 || py === h * 4 - 1 ? P[0] : P[px < 2 ? 5 : px < 4 ? 3 : 2];
  });
}
