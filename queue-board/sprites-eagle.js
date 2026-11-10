// sprites-eagle.js: the Great Eagle that brings a Claude app session's call in the Middle-earth view (scene-eagle.js),
// perched, and the crag it perches on, in 32-bit: a quarter unit a pixel on scene.js's canvas (SC_RES of 4). A giant
// of the Misty Mountains, 24 units tall perched (an elf is 15): golden-brown feathers, a paler gold crown and hackles
// down the nape, a hooked yellow beak with a dark horn tip, a dark eye under a heavy brow, yellow talons, and a small
// rolled scroll tied with a red ribbon in its grip. Each frame is drawn at full size when it is first needed: the body
// and wing feather by feather (eagleFeather: each feather shaded across, lit on the side toward the light, darker on
// the other, with a dark rim where it lies over the next), laid in rows from the back forward; the masses under them
// (eagleBlob) lit from the upper left; the head and the talons with the scroll hand-drawn maps (sprites-eagle-fly.js
// holds them, with the wings and flight); the crag a set of faces (eaglePoly). A one-pixel outline in each material's
// own darkest hue goes round the whole, a step lighter on its lit side. Each finished frame is painted once into a
// canvas of SC_RES pixels a unit (day and night apart) and drawn from there. Uses sprites-hd.js's hdMix and qdMap.

const EAGLE_RAMP = {
  brown: ['#26120f', '#47231a', '#6c3820', '#965626', '#c07e34', '#e4ad55'],
  dark: ['#140c10', '#28181c', '#3e2620', '#573624', '#77502e', '#9a7040'],
  gold: ['#5a3412', '#8e5e24', '#b8862e', '#d6a748', '#ecc66c', '#fbe3a0'],
  tan: ['#3e2616', '#64421f', '#8c6232', '#b0844a', '#d0a868'],
  yellow: ['#5a3004', '#a0600c', '#d89018', '#f5b82a', '#ffd95a', '#fff4b0'],
  horn: ['#0e0c14', '#2a2834', '#4c4a5a', '#8a8a9c'],
  parch: ['#4e3c26', '#8c7250', '#bfa47a', '#e6d4aa', '#fbf3da'],
  red: ['#40080a', '#7c1612', '#b4261e', '#e2412f', '#ff8466'],
  rock: ['#25232b', '#403c46', '#5f5a62', '#878079', '#ada393', '#d4c8b0'],
  moss: ['#2c4018', '#4c6a26', '#749436', '#a4c25a'],
};
// The 32-bit characters, each ramp from its outline up to its highlight; K, X and * are the eye's pupil, iris and glint.
const EAGLE_CH = { brown: 'abcdef', dark: 'ghijkl', gold: 'mnopqr', tan: 'stuvw', yellow: 'ABCDEF', horn: 'GHIJ', parch: 'NOPQR', red: 'STUVW', rock: '012345', moss: '6789' };
const EAGLE_PAL = { K: '#080406', X: '#6a3412', '*': '#ffffff' };
const EAGLE_MAT = { K: ['brown', 0], X: ['brown', 0], '*': ['brown', 0] };
for (const [m, chars] of Object.entries(EAGLE_CH)) [...chars].forEach((ch, i) => { EAGLE_PAL[ch] = EAGLE_RAMP[m][i]; EAGLE_MAT[ch] = [m, i]; });
// The palette by night: every colour as the scene's night shade leaves it (scene.js), for an eagle drawn over the sky.
const EAGLE_NIGHT = Object.fromEntries(Object.entries(EAGLE_PAL).map(([k, c]) => [k, hdMix(c, '#0a0d24', 0.38)]));
// Which material's outline wins where two meet: the small bright parts keep theirs.
const EAGLE_FIRST = ['yellow', 'horn', 'red', 'parch', 'moss', 'rock', 'gold', 'tan', 'dark', 'brown'];

// A clear grid of w by h 32-bit pixels, and a pixel of material m at step k (kept within its ramp, above its outline).
const eagleGrid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const eagleStep = (m, k) => EAGLE_CH[m][Math.max(1, Math.min(EAGLE_CH[m].length - 1, Math.round(k)))];
// While eagleClip holds a mask, pixels land only where the mask is set ('#'), so feathers keep inside the silhouette.
let eagleClip = null;
function eagleSet(G, x, y, ch) { if (G[y] && x >= 0 && x < G[y].length && ch && (!eagleClip || eagleClip[y]?.[x] === '#')) G[y][x] = ch; }
const eagleFlip = (rows) => rows.map((row) => [...row].reverse().join(''));
// A fixed pseudo-random number in [0, 1) for a seed, so a feather's small offset is the same every time it is built.
const eagleRnd = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
// Light from the upper left.
const EAGLE_LIGHT = [-0.6, -0.8];

// One feather from its base (ax, ay) to its tip (bx, by), in pixels, w across at its widest: narrow at the base, full
// through the middle, rounding to its tip. Across it, the side toward the light a step up and the other a step down;
// along its edge a dark rim (lit along the near edge of the light side) so it reads over the feather it lies on, a
// step lighter with o.soft (the breast's small feathers); o.tip darkens its last part (a flight feather's dark end),
// o.shaft draws the quill a step light, o.tone shifts it all.
function eagleFeather(G, ax, ay, bx, by, w, m, k, o = {}) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
  const [nx, ny] = [-uy, ux];
  const lit = nx * EAGLE_LIGHT[0] + ny * EAGLE_LIGHT[1] > 0 ? 1 : -1;
  const r = w / 2;
  const kk = k + (o.tone ?? 0);
  for (let y = Math.floor(Math.min(ay, by) - r); y <= Math.ceil(Math.max(ay, by) + r); y += 1) {
    for (let x = Math.floor(Math.min(ax, bx) - r); x <= Math.ceil(Math.max(ax, bx) + r); x += 1) {
      const [px, py] = [x + 0.5 - ax, y + 0.5 - ay];
      const t = (px * ux + py * uy) / len;
      if (t < 0 || t > 1) continue;
      const s = px * nx + py * ny;
      const half = r * (t < 0.2 ? 0.55 + 2.25 * t : t < 0.68 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - 0.68) / 0.32) ** 2)));
      if (Math.abs(s) > half) continue;
      const side = s >= 0 ? 1 : -1;
      let step = kk;
      if (half - Math.abs(s) < 1 || (1 - t) * len < 1) step = side === lit && t < 0.68 ? kk + 1 : kk - (o.soft ? 1 : 2);
      else if (Math.abs(s) > half * 0.42) step = side === lit ? kk + 1 : kk - 1;
      if (o.shaft && Math.abs(s) < 0.5 && t > 0.08 && t < 0.8) step = kk + 1;
      if (o.tip && t > 1 - o.tip) step -= 1;
      eagleSet(G, x, y, eagleStep(m, step));
    }
  }
}
// A rounded mass (an ellipse rx by ry about cx, cy, in pixels), lit from the upper left in bands of its ramp, darker at
// its rim.
function eagleBlob(G, cx, cy, rx, ry, m, k) {
  const R = Math.max(rx, ry);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const [dx, dy] = [x + 0.5 - cx, y + 0.5 - cy];
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (d > 1) continue;
      const lum = (dx / R) * EAGLE_LIGHT[0] + (dy / R) * EAGLE_LIGHT[1];
      eagleSet(G, x, y, eagleStep(m, k + Math.round(lum * 1.8) - (d > 0.8 ? 1 : 0)));
    }
  }
}
// A filled polygon (points in pixels) of one character, for the crag's faces.
function eaglePoly(G, pts, ch) {
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
    const cy = y + 0.5;
    const xs = [];
    pts.forEach(([x0, y0], i) => {
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= cy) !== (y1 <= cy)) xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
    });
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x += 1) eagleSet(G, x, y, ch);
  }
}
// A line of one character, a pixel wide.
function eagleLine(G, x0, y0, x1, y1, ch) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i += 1) eagleSet(G, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), ch);
}
// The silhouette is a mask grid ('#' inside): discs (an ellipse rx by ry about cx, cy, in pixels), and a spine of discs
// along a line of [x, y, radius] points, one every pixel with the radius running smoothly between them, so the body,
// neck and head make one outline with no notch where they join.
function eagleDisc(M, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 && M[y]?.[x]) M[y][x] = '#';
  }
}
function eagleSpine(M, pts) {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [[x0, y0, r0], [x1, y1, r1]] = [pts[i], pts[i + 1]];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k <= n; k += 1) eagleDisc(M, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r0 + ((r1 - r0) * k) / n, r0 + ((r1 - r0) * k) / n);
  }
}
// Fills the silhouette (or the part of it where keep(x, y) holds) with material m, lit from the upper left: a step
// lighter along its upper and left edges, a step darker along its lower and right, two near the edge's very foot.
function eagleFill(G, M, m, k, keep = () => true) {
  const out = (x, y) => M[y]?.[x] !== '#';
  M.forEach((row, y) => row.forEach((v, x) => {
    if (v !== '#' || !keep(x, y)) return;
    let s = k;
    if (out(x - 1, y - 1) || out(x, y - 2) || out(x - 2, y)) s += 1;
    if (out(x + 1, y + 1) || out(x + 2, y + 2)) s -= 1;
    if (out(x + 1, y + 1) && out(x, y + 1)) s -= 1;
    eagleSet(G, x, y, eagleStep(m, s));
  }));
}
// Lays a hand-drawn map (rows of 32-bit characters, '.' clear) with its top-left at (x, y).
const eaglePaste = (G, rows, x, y) => rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') eagleSet(G, x + c, y + r, ch); }));
// A one-pixel outline round the shape, side by side not corner to corner, in the darkest step of the material it
// borders, or the step above that where the shape lies below or right of it (its lit side); returns the rows.
function eagleSelout(G) {
  const at = (r, c) => G[r]?.[c] ?? '.';
  const rank = (ch) => EAGLE_FIRST.indexOf(EAGLE_MAT[ch][0]);
  return G.map((row, r) => row.map((ch, c) => {
    if (ch !== '.') return ch;
    const shade = [at(r - 1, c), at(r, c - 1)].filter((v) => v !== '.');
    const near = [...shade, at(r + 1, c), at(r, c + 1)].filter((v) => v !== '.');
    if (!near.length) return '.';
    const m = EAGLE_MAT[near.sort((p, q) => rank(p) - rank(q))[0]][0];
    return EAGLE_CH[m][shade.length ? 0 : 1];
  }).join(''));
}
// Each frame built once (make returns its rows and where its anchor lies, in pixels), painted once per palette into a
// canvas of SC_RES pixels a unit, and drawn with its anchor at (x, y).
const eagleFrames = new Map();
function eagleBlit(g, key, make, x, y, night) {
  if (!eagleFrames.has(key)) eagleFrames.set(key, make());
  const f = eagleFrames.get(key);
  const k = `${night ? 1 : 0}`;
  if (!f[k]) {
    const res = typeof SC_RES === 'number' ? SC_RES : 4;
    f[k] = document.createElement('canvas');
    f[k].width = Math.ceil((f.rows[0].length / 4) * res);
    f[k].height = Math.ceil((f.rows.length / 4) * res);
    const lg = f[k].getContext('2d');
    lg.setTransform(res, 0, 0, res, 0, 0);
    qdMap(lg, f.rows, night ? EAGLE_NIGHT : EAGLE_PAL, 0, 0);
  }
  g.drawImage(f[k], x - f.ax / 4, y - f.ay / 4, f.rows[0].length / 4, f.rows.length / 4);
}

// The perched eagle in pose (sit, look, ruffle or mantle), side on and facing left, 25 units from its feet to its
// crown. One silhouette: a teardrop body leaning forward, full at the breast and the back, running up into a thick neck
// as wide as the back of the head, the head set forward and low on the shoulders, the throat filled under the chin,
// the feathered legs, and the folded wing along the side; filled brown and lit on the upper left as a whole, then
// clothed inside its outline: the breast's feathers in rows that shrink toward the throat (the lower laid first, so
// each row overlaps the one under it), the legs' long feathers, the folded wing (primaries crossing the tail,
// secondaries, greater coverts, the lighter shoulder over where neck meets body), the head's gold crown and nape with
// long pointed hackles flowing down over the neck and the wing's shoulder, and the face (eagleHeadPaint, with
// sprites-eagle-fly.js). Behind it all the tail hangs down past the wing tips; in front, the talons on the scroll.
// ruffle has its feathers shaken out; look has its head turned back over its shoulder; mantle has its wings raised.
// Its anchor is between its feet.
const EAGLE_WING_FOLD = [[-1.8, -17.2], [1, -18.4], [3.6, -16.6], [5.6, -12.5], [6.6, -7.5], [7.2, -3], [7, -0.6], [5.6, -1.4], [3.8, -4], [1.6, -8.2], [-0.6, -12], [-2.2, -15]];
function eagleSit(pose) {
  const top = pose === 'mantle' ? 40 : 27;
  const [G, M, W] = [0, 0, 0].map(() => eagleGrid(100, (top + 4) * 4));
  const [ax, ay] = [50, top * 4];
  const P = (x, y) => [ax + x * 4, ay + y * 4];
  const F = (bx, by, tx, ty, w, m, k, o) => eagleFeather(G, ...P(bx, by), ...P(tx, ty), w * 4, m, k, o);
  const puff = pose === 'ruffle' ? 0.45 : 0;
  const face = pose === 'look' ? 1 : -1;
  const [hx, hy] = face > 0 ? [-2, -21.6] : [-3.4, -21.4];
  eagleSpine(M, [[4, -3.5, 2.8], [2.4, -6.5, 4.3], [1, -9.8, 5.3], [0, -12.8, 5.4], [-0.8, -15.6, 4.8], [-1.6, -18, 4.1], [hx + 1.2, -20, 3.8]]
    .map(([x, y, r]) => [...P(x, y), (r + puff) * 4]));
  eagleDisc(M, ...P(hx, hy), 16.4, 13.6);
  eagleDisc(M, ...P(face > 0 ? -2.8 : -4.3, -18.4), 10, 10);
  for (const [x, y, r] of [[-1.1, -3.2, 2.6], [0.6, -2.9, 2.4]]) eagleDisc(M, ...P(x, y), r * 4, r * 4);
  if (pose !== 'mantle') { eaglePoly(M, EAGLE_WING_FOLD.map(([x, y]) => P(x, y)), '#'); eaglePoly(W, EAGLE_WING_FOLD.map(([x, y]) => P(x, y)), '#'); }
  for (let i = -2; i <= 2; i += 1) F(3.2 + i * 0.3, -6.5, 6 + i * 0.75, 2.6 - Math.abs(i) * 0.35, 2.8, 'dark', 3, { tip: 0.22, shaft: true });
  if (pose === 'mantle') eagleWing(G, ...P(1.5, -16), 82, 64, 1, 28, 38, 1, 0.1, -1);
  eagleFill(G, M, 'brown', 3);
  // The breast's feathers, clipped to the silhouette in front of the wing; bigger low down, smaller toward the throat.
  eagleClip = M.map((row, y) => row.map((v, x) => (v === '#' && W[y][x] !== '#' ? '#' : '.')));
  for (let row = 0; row < 12; row += 1) {
    const y = -4 - row * 1.18;
    const size = 1.15 - row * 0.035;
    for (let col = 0; col < 7; col += 1) {
      const j = eagleRnd(row * 11 + col * 7) - 0.5;
      const x = -6.4 + col * 1.3 * size + (row % 2) * 0.65 * size + j * 0.5;
      F(x + 0.35, y - 2.1 * size + j * 0.3, x - 0.2 - puff * 0.5, y + 0.4 + puff * 0.3 - j * 0.3, (2.3 + puff * 0.6) * size, 'brown', 3, { soft: true });
    }
  }
  eagleClip = M;
  for (const x of [-3, -2, -1, 0, 1]) F(x + 0.4, -6.8, x - 0.2 - puff * 0.4, -0.9, 2.4 + puff * 0.3, 'tan', 2, { shaft: true, soft: true });
  eagleClip = W;
  const lift = puff * 1.4;
  if (pose !== 'mantle') {
    for (let i = 4; i >= 0; i -= 1) F(2.2 + i * 0.3, -12.2 + i * 0.75 - lift, 6.1 + i * 0.25, -1.6 + i * 0.35 - lift, 2.5, 'dark', 3, { tip: 0.2, shaft: true });
    for (let i = 5; i >= 0; i -= 1) F(-0.6 + i * 0.75, -15.2 + i * 0.95 - lift, 2.4 + i * 0.8, -8.6 + i * 0.85 - lift, 2.7, 'brown', 3, { tip: 0.15, shaft: true });
    for (let i = 6; i >= 0; i -= 1) F(-1.4 + i * 0.7, -16.8 + i * 0.7 - lift, 0.2 + i * 0.75, -13 + i * 0.7 - lift, 2.4, 'brown', 3, { shaft: true });
    for (let row = 0; row < 3; row += 1) {
      for (let i = 0; i < 5 - row; i += 1) {
        const [x, y] = [-1.8 + i * 1.05 + row * 0.5, -15.2 - row * 1.1 - lift];
        F(x, y - 1.6, x + 0.7 + puff * 0.3, y + 0.5, 2.1, 'brown', 4);
      }
    }
  }
  eagleClip = null;
  if (pose === 'mantle') eagleWing(G, ...P(0.5, -16.5), 76, 56, 1, 30, 40, 1, 0.1, 0);
  eagleFoot(G, ...P(1.6, -1.8), [[...P(-0.4, -0.6), ...P(-1.2, 0)], [...P(0.7, -0.5), ...P(0, 0.1)], [...P(3.4, -0.5), ...P(4.1, 0)]]);
  eagleScroll(G, ...P(-6, -1.8), 21, 7);
  eagleFoot(G, ...P(-0.8, -2.8), [[...P(-4.4, -2), ...P(-5.3, -0.7)], [...P(-3.3, -1.6), ...P(-4.1, -0.3)], [...P(-2.1, -1.6), ...P(-2.8, -0.3)]]);
  eagleHeadPaint(G, M, P, hx, hy, face, face > 0 ? [0.1, 1] : [0.45, 0.9]);
  return { rows: eagleSelout(G), ax, ay };
}
// Draws the perched eagle with its feet at (x, y), whatever the pose; by night over the sky in the night palette.
function drawEaglePerched(g, x, y, pose, night = false) {
  eagleBlit(g, `sit:${pose}`, () => eagleSit(pose), x, y, night);
}

// The crag it perches on, 20 units across and 7 high about its base's centre: a lit top where the eagle stands, a lit
// upper-left face, a front face, the right side in shade, the foot dark where it meets the ground, cracks, lichen, and a
// smaller boulder at its right foot.
const EAGLE_STAND = 7;
function eagleCrag() {
  const G = eagleGrid(88, 36);
  const [ax, ay] = [44, 32];
  const P = (pts) => pts.map(([x, y]) => [ax + x * 4, ay + y * 4]);
  eaglePoly(G, P([[-10, 0], [-9.8, -2], [-8.6, -3.6], [-7.2, -5.4], [-5.6, -6.6], [-2.5, -7.3], [1.5, -7.2], [4.5, -6.6], [6.2, -5.4], [7.8, -3.8], [9.4, -2.2], [10, 0]]), '2');
  eaglePoly(G, P([[-9.8, -2], [-8.6, -3.6], [-7.2, -5.4], [-5.6, -6.6], [-4.6, -5.8], [-6, -3.4], [-7.2, -1.2]]), '4');
  eaglePoly(G, P([[-7.2, -1.2], [-6, -3.4], [-4.6, -5.8], [-1, -5.6], [0.8, -3.6], [0.2, 0], [-7, 0]]), '3');
  eaglePoly(G, P([[-5.6, -6.6], [-2.5, -7.3], [1.5, -7.2], [4.5, -6.6], [3.2, -5.8], [-1, -5.6], [-4.6, -5.8]]), '4');
  eaglePoly(G, P([[-4.6, -6.7], [-2.5, -7.2], [0.5, -7.1], [-1.5, -6.6]]), '5');
  eaglePoly(G, P([[-10, -0.7], [10, -0.7], [10, 0], [-10, 0]]), '1');
  for (const [x0, y0, x1, y1] of [[-3, -5.4, -2.2, -2.8], [-2.2, -2.8, -3, -0.6], [4, -5, 5.2, -2.6], [-6.4, -2.6, -5.4, -1.2]]) {
    const [[a, b], [c, d]] = P([[x0, y0], [x1, y1]]);
    eagleLine(G, a, b, c, d, '1');
    eagleLine(G, a + 1, b, c + 1, d, '3');
  }
  eagleBlob(G, ax + 34, ay - 5, 10, 6, 'rock', 3);
  for (const [x, y] of [[-3.5, -6.9], [-3, -6.8], [2.5, -6.9], [3, -6.7], [-7.2, -4.6]]) eagleBlob(G, ax + x * 4, ay + y * 4, 2, 1.2, 'moss', 2);
  return { rows: eagleSelout(G), ax, ay };
}
// Draws the crag with its base centred at (x, y), and its shadow along the ground.
function drawEagleRock(g, x, y, night = false) {
  const a = g.globalAlpha;
  g.globalAlpha = a * 0.3;
  g.fillStyle = '#3a2a1c';
  g.fillRect(x - 9, y - 0.25, 22, 1);
  g.globalAlpha = a;
  eagleBlit(g, 'crag', eagleCrag, x, y, night);
}
