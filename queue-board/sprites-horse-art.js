// sprites-horse-art.js: the 32-bit art of the Sentry Ranger's horse, which sprites-horse.js draws. Each part has a
// drawn outline (a polygon) and, inside it, rounded forms (the barrel, the haunch, the thigh, the shoulder, the breast,
// the neck, the jowl, the face and the muzzle, and each leg a chain of tapering limbs) lit from the upper left, so the
// shoulder and haunch swell out in their own light and shade on a clean silhouette. The mane and tail are laid on as
// strands; each part then takes an outline in its own darkest hue, and the eye, nostril, mouth and bridle are drawn on.
// Every part is a pixel map in quarter units (one character per pixel), cached per coat on a canvas at SC_RES and drawn
// as one image, so a frame costs a few drawImage calls. Places are in quarter units from the saddle column (x) and the
// hooves' row (y), facing right. No image files. Loaded after sprites-horse.js.

// The light, from the upper left and a little toward us.
const HA_SUN = [-0.5, -0.74, 0.46].map((v, i, a) => v / Math.hypot(...a));
// Each material's tones from lit to deep, then its outline: coat, lower legs, hoof, mane and tail.
const HA_TONE = { C: '12345o', P: '66789O', H: 'hhHjjJ', M: 'MmnNNu' };
// The light a pixel needs for each tone from the highlight down; below the last it is deep.
const HA_STEP = [0.8, 0.5, 0.12, -0.24];

// A part's grid, w by h pixels, whose top-left pixel is quarter unit (x0, y0).
function haGrid(x0, y0, w, h) {
  const n = w * h;
  return { x0, y0, w, h, m: Array(n).fill(''), t: new Float32Array(n), z: new Float32Array(n).fill(-1e9), ch: Array(n).fill('.') };
}
// Where form s covers the point (X, Y): its depth toward us and the light on it, or null (or, forced, its edge's light,
// for a point of the outline no form covers). A form is an ellipsoid e (centre, radii across, down and in depth, and a
// tilt) or a tapering limb s (two ends, each with its radius), set z toward us, with its material m and a light bias b.
function haHit(s, X, Y, force) {
  let d;
  let n;
  let deep;
  if (s.e) {
    const [cx, cy, rx, ry, rz, a] = s.e;
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    const u = ((X - cx) * c + (Y - cy) * sn) / rx;
    const v = (-(X - cx) * sn + (Y - cy) * c) / ry;
    d = Math.hypot(u, v);
    const k = d > 1 ? 1 / d : 1;
    n = [((u * k) / rx) * c - ((v * k) / ry) * sn, ((u * k) / rx) * sn + ((v * k) / ry) * c, Math.sqrt(Math.max(0, 1 - d * d)) / rz];
    deep = rz;
  } else {
    const [ax, ay, r0, bx, by, r1] = s.s;
    const [ex, ey] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((X - ax) * ex + (Y - ay) * ey) / (ex * ex + ey * ey || 1)));
    deep = r0 + (r1 - r0) * t;
    const [dx, dy] = [X - ax - ex * t, Y - ay - ey * t];
    d = Math.hypot(dx, dy) / deep;
    n = [dx / deep / Math.max(1, d), dy / deep / Math.max(1, d), Math.sqrt(Math.max(0, 1 - d * d))];
  }
  if (d > 1 && !force) return null;
  const k = Math.hypot(...n) || 1;
  const z = d > 1 ? -1e8 : (s.z ?? 0) + deep * Math.sqrt(1 - d * d);
  return [z, (n[0] * HA_SUN[0] + n[1] * HA_SUN[1] + n[2] * HA_SUN[2]) / k + (s.b ?? 0)];
}
// Whether the point (X, Y) is inside polygon poly.
function haIn(poly, X, Y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [[xi, yi], [xj, yj]] = [poly[i], poly[j]];
    if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Paints the inside of polygon poly with the forms, the nearest form winning each pixel (the first form lights any
// pixel no form covers); below quarter row fall the light dims toward the belly and the ground.
function haPaint(G, poly, forms, fall = 1e9) {
  for (let j = 0; j < G.h; j += 1) {
    for (let i = 0; i < G.w; i += 1) {
      const [X, Y, k] = [G.x0 + i + 0.5, G.y0 + j + 0.5, j * G.w + i];
      if (!haIn(poly, X, Y)) continue;
      forms.forEach((s, f) => {
        const hit = haHit(s, X, Y, f === 0);
        if (hit && hit[0] > G.z[k]) [G.z[k], G.t[k], G.m[k]] = [hit[0], hit[1] - Math.max(0, Y - fall) * 0.022, s.m];
      });
      const step = HA_STEP.findIndex((s) => G.t[k] > s);
      if (G.m[k]) G.ch[k] = HA_TONE[G.m[k]][step < 0 ? 4 : step];
    }
  }
}
// A strand of mane or tail along the curve p0, p1, p2 (quarter units), w pixels wide at its root and tapering, in tone c.
function haStrand(G, [p0, p1, p2], w, c) {
  for (let t = 0; t <= 1; t += 0.03) {
    const [X, Y] = [0, 1].map((a) => (1 - t) ** 2 * p0[a] + 2 * (1 - t) * t * p1[a] + t * t * p2[a]);
    const r = Math.max(0.5, (w / 2) * (1 - 0.7 * t));
    for (let j = Math.floor(Y - r); j <= Math.ceil(Y + r); j += 1) {
      for (let i = Math.floor(X - r); i <= Math.ceil(X + r); i += 1) {
        const k = (j - G.y0) * G.w + (i - G.x0);
        if (i >= G.x0 && i < G.x0 + G.w && j >= G.y0 && j < G.y0 + G.h && Math.hypot(i + 0.5 - X, j + 0.5 - Y) <= r) [G.m[k], G.ch[k]] = ['M', c];
      }
    }
  }
}
// Outlines G: a pixel with open space beside it takes its material's outline, except along the top rows given (a leg's
// root, which runs on into the body) and where seam(X, Y) says the open space is where another part joins. The coat
// just under a lock of mane falls into its shade.
function haOutline(G, open = 0, seam = () => false) {
  const { w, h } = G;
  const free = (i, j) => (i < 0 || i >= w || j < 0 || j >= h || !G.m[j * w + i]) && !seam(G.x0 + i, G.y0 + j);
  const out = [];
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const k = j * w + i;
      if (!G.m[k]) continue;
      if (free(i - 1, j) || free(i + 1, j) || (j >= open && free(i, j - 1)) || free(i, j + 1)) out.push([k, HA_TONE[G.m[k]][5]]);
      else if (G.m[k] !== 'M' && G.m[k - w] === 'M') out.push([k, HA_TONE[G.m[k]][3]]);
    }
  }
  out.forEach(([k, c]) => { G.ch[k] = c; });
}
// Writes the rows from quarter unit (X, Y) into G, skipping '.'.
function haPut(G, X, Y, rows) {
  rows.forEach((s, r) => [...s].forEach((c, n) => {
    const [i, j] = [X - G.x0 + n, Y - G.y0 + r];
    if (c !== '.' && i >= 0 && i < G.w && j >= 0 && j < G.h) G.ch[j * G.w + i] = c;
  }));
}
// A strap of leather from (X0, Y0) to (X1, Y1), lit (B) along its upper side if wide.
function haStrap(G, X0, Y0, X1, Y1, wide) {
  const n = Math.max(Math.abs(X1 - X0), Math.abs(Y1 - Y0));
  for (let k = 0; k <= n; k += 1) {
    const [X, Y] = [Math.round(X0 + ((X1 - X0) * k) / n), Math.round(Y0 + ((Y1 - Y0) * k) / n)];
    haPut(G, X, Y, wide ? ['B', 'b'] : ['b']);
  }
}
const haPart = (G) => ({ x0: G.x0, y0: G.y0, rows: Array.from({ length: G.h }, (_, j) => G.ch.slice(j * G.w, (j + 1) * G.w).join('')), cv: new Map() });

// The body: the barrel, the haunch over the croup and rump, the thigh swelling down toward the hock, the shoulder blade
// sloping from the withers to the point of the shoulder, the breast and the elbow. Its top edge in front of the withers
// is where the neck joins, so it takes no outline there.
const HA_BODY = (() => {
  const G = haGrid(-31, -47, 67, 30);
  haPaint(G, [[12, -44.5], [6, -43.5], [0, -42.5], [-6, -42.5], [-12, -44], [-17, -45], [-22, -44.5], [-26, -42.5], [-28.5, -39.5],
    [-29.5, -35.5], [-29.5, -31], [-28.5, -27], [-26.5, -23.5], [-24, -20], [-21, -18.5], [-9, -18.5], [-6, -20.5], [-2, -22], [6, -22],
    [12, -22.5], [15, -23.5], [18, -22], [24, -22.5], [28, -24], [31.5, -27], [33.5, -31], [34, -36], [32.5, -40], [29, -43],
    [24, -45], [18, -45.5]], [
    { e: [0, -31, 27, 13, 15, 0], m: 'C' },
    { e: [-17, -33, 12, 11, 8, -0.2], z: 9, m: 'C' },
    { e: [-14, -24, 6.5, 8, 5, -0.35], z: 13, m: 'C' },
    { e: [20, -33, 7.5, 12, 6, -0.45], z: 10, m: 'C' },
    { e: [28.5, -29, 5.5, 8.5, 6, 0], z: 10, m: 'C' },
    { e: [16, -24.5, 4, 3, 3, 0], z: 14, m: 'C' },
  ], -30);
  haOutline(G, 0, (X, Y) => X >= 13 && Y <= -38);
  return haPart(G);
})();

// The neck and head, held up or bent down to graze: its outline, its forms, both ears (the far one darker, behind), the
// crest the mane hangs from, the forelock, the face's features (k eye, w its glint, e its iris, q nostril and mouth, g
// G the bit's ring) and the bridle (b B leather), and where the reins meet the bit (mouth).
const HA_HEAD_ART = {
  up: { grid: [8, -73, 40, 37], fall: -44, mouth: [40, -45.5],
    poly: [[10, -44], [12.5, -48.5], [16, -54], [20, -59], [24, -62.5], [28, -64.5], [32, -64.5], [35, -62.5], [38.5, -58.5], [41.5, -54.5],
      [44, -50.5], [45.5, -48], [45.5, -45.5], [44.5, -44], [42.5, -43], [40, -42.5], [38, -43.5], [35.5, -45.5], [33, -47.5], [31, -49],
      [30, -50], [31, -46], [32.5, -42], [33.5, -38], [33, -36], [10, -36]],
    forms: [{ s: [16, -40, 10.5, 27, -58, 6.5], m: 'C' }, { e: [20, -51, 4, 10, 4, -0.62], z: 3, m: 'C', b: 0.05 },
      { e: [30.5, -55, 6.5, 6.5, 6, 0], z: 6, m: 'C' }, { e: [32, -61, 4, 3.5, 3.5, 0], z: 7, m: 'C' },
      { e: [38.5, -54, 4.5, 10, 4.5, -0.62], z: 6, m: 'C' }, { e: [42.5, -46, 4, 4, 4, 0], z: 7, m: 'C' }],
    ears: [[[25.5, -63.5], [26.5, -71], [28.5, -64]], [[28, -63.5], [30, -72], [31.5, -63.5]]],
    crest: [[27, -64], [10.5, -45]], hang: [0.25, 1], fore: [[30, -65], [34.5, -60.5]],
    face(G) {
      haPut(G, 33, -61, ['.555', '5wkk', '.kek', '..2.']);
      haPut(G, 43, -50, ['2q', 'qq', '.q']);
      haPut(G, 40, -45, ['qqqq']);
      haStrap(G, 29, -64, 38, -48, true);
      haPut(G, 30, -65, ['BBbbb']);
      haStrap(G, 36, -51, 42, -55, true);
      haStrap(G, 30, -61, 31, -51);
      haPut(G, 38, -47, ['.gg.', 'g..G', '.GG.']);
    } },
  down: { grid: [8, -49, 40, 49], fall: -10, mouth: [37.5, -5.5],
    poly: [[11, -46.5], [18, -47], [24, -46.5], [30, -44.5], [34, -41], [37, -36.5], [39, -34], [42, -31.5], [43.5, -27], [43.6, -20],
      [43.8, -12], [44.4, -6], [44, -1.5], [42, 0], [37, 0], [35, -1.5], [34.3, -6], [33.8, -11], [32, -14], [29.8, -18], [29.3, -23],
      [30, -27], [31, -29.5], [29, -32], [25, -36], [11, -36]],
    forms: [{ s: [14, -40, 9.5, 34, -33, 6.5], m: 'C' }, { e: [33.5, -22.5, 4.5, 6, 5, 0], z: 8, m: 'C' },
      { e: [39.5, -30, 4, 4, 4, 0], z: 6, m: 'C' }, { e: [39.5, -16, 4.5, 13, 4.5, 0.03], z: 5, m: 'C' },
      { e: [40, -4.5, 4.5, 4.5, 4, 0], z: 7, m: 'C' }],
    ears: [[[36, -35.5], [39.5, -41.5], [38.5, -35]], [[38, -34.5], [43, -40.5], [41, -33.5]]],
    crest: [[12, -47.5], [37.5, -36]], hang: [0.05, 1], fore: [[39.5, -35], [42.5, -29.5]],
    face(G) {
      haPut(G, 37, -28, ['.55', '5wk', 'kek', '.2.']);
      haPut(G, 42, -9, ['2.', 'qq', 'q.']);
      haPut(G, 38, -1, ['qqqq']);
      haStrap(G, 37, -34, 37, -9, true);
      haPut(G, 38, -35, ['BBbb']);
      haPut(G, 34, -14, ['BBBBBBBBBB', 'bbbbbbbbbb']);
      haStrap(G, 37, -32, 31, -28);
      haPut(G, 36, -8, ['.gg.', 'g..G', '.GG.']);
    } },
};
const HA_HEADS = new Map();
function haHead(pose, stream) {
  const key = pose + (stream ? '>' : '');
  if (HA_HEADS.has(key)) return HA_HEADS.get(key);
  const H = HA_HEAD_ART[pose];
  const G = haGrid(...H.grid);
  const ear = ([a, b, c], z, bias) => haPaint(G, [a, b, c], [{ s: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 2, ...b, 0.5], z, m: 'C', b: bias }]);
  ear(H.ears[0], -50, -0.3);
  haPaint(G, H.poly, H.forms, H.fall);
  ear(H.ears[1], 50, 0);
  // The mane: locks from the crest hanging over the neck's near side (or streaming back), the lit ones among them.
  const [[ax, ay], [bx, by]] = H.crest;
  for (let k = 0; k < 11; k += 1) {
    const [sx, sy] = [ax + ((bx - ax) * k) / 10, ay + ((by - ay) * k) / 10];
    const len = 7 + ((k * 7) % 4);
    const [dx, dy] = stream ? [-1, 0.2 + 0.12 * (k % 2)] : H.hang;
    haStrand(G, [[sx, sy - 1], [sx + dx * len * 0.5 - 1, sy + dy * len * 0.45], [sx + dx * len, sy + dy * len]], 3, 'nmNMnNmnMNm'[k]);
  }
  const [[fx, fy], [gx, gy]] = H.fore;
  haStrand(G, [[fx, fy], [(fx + gx) / 2 + 1, fy], [gx, gy]], 2.5, 'm');
  haStrand(G, [[fx - 1, fy + 1], [(fx + gx) / 2, fy + 2], [gx - 1, gy + 1]], 2, 'N');
  haOutline(G);
  H.face(G);
  HA_HEADS.set(key, { ...haPart(G), mouth: H.mouth });
  return HA_HEADS.get(key);
}

// The tail for each tail frame (hanging, swished, streaming): locks from the dock at the top of the croup.
const HA_TAILS = [[[-37, -32], [-36, -13]], [[-40, -30], [-43, -17]], [[-36, -45], [-46, -33]]].map(([c, e], f) => {
  const G = haGrid(-48, -46, 26, 38);
  for (let k = 0; k < 8; k += 1) {
    const s = k - 3.5;
    const [sx, sy] = f === 2 ? [0.4 * s, 1.1 * s] : [1.1 * s, 0.4 * s];
    haStrand(G, [[-27.5 + s * 0.4, -41 + Math.abs(s) * 0.3], [c[0] + sx * 0.6, c[1] + sy * 0.6], [e[0] + sx, e[1] + sy + (k % 3) * (f === 2 ? 0 : 1.5)]],
      3.2, 'NnmMnmNn'[k]);
  }
  haOutline(G);
  return haPart(G);
});

// One leg from its top (quarter units from the leg's column and the hooves' row) to its hoof, bottom centre hx, hy:
// the forearm or gaskin in the coat, bending forward at the knee or back at the hock, the cannon, fetlock and pastern
// in the lower legs' colour, and the hoof. folded tucks a foreleg up under the chest (a rear). The joints come from a
// two-bone reach, so a lifted hoof bends the leg as a horse's does.
const HA_LEGS = new Map();
function haLeg(fore, top, hx, hy, folded) {
  const key = [fore, top, hx, hy, folded].join();
  if (HA_LEGS.has(key)) return HA_LEGS.get(key);
  const T = [fore ? 0 : 6.5, top];
  let F = [hx - 1, hy - 8];
  const [a, b] = fore ? [12, 8.6] : [13.5, 9.5];
  let M = [T[0] + 7, T[1] + 6];
  if (folded) F = [M[0] - 1.5, M[1] + 7.5];
  else {
    const [dx, dy] = [F[0] - T[0], F[1] - T[1]];
    const [L, d] = [Math.hypot(dx, dy), Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, Math.hypot(dx, dy)))];
    const [ux, uy] = [dx / L, dy / L];
    F = [T[0] + ux * d, T[1] + uy * d];
    const along = (a * a - b * b + d * d) / (2 * d);
    const off = Math.sqrt(Math.max(0, a * a - along * along)) * (fore ? 1 : -1);
    M = [T[0] + ux * along - uy * off, T[1] + uy * along + ux * off];
  }
  const lifted = folded || hy < 3;
  const H = lifted ? [F[0] + (folded ? -1 : 0.5), F[1] + 4] : [hx, hy - 4];
  const G = haGrid(-10, top, 20, Math.ceil(Math.max(H[1] + 5, F[1] + 4) - top));
  haPaint(G, [[-10, top], [10, top], [10, top + G.h], [-10, top + G.h]], [
    { s: [...T, fore ? 4.2 : 5, ...M, fore ? 2.6 : 2.7], m: 'C' },
    { s: [...M, fore ? 2.3 : 2.4, ...F, 1.8], z: 1, m: 'P' },
    { e: [...F, 2.3, 2.1, 2, 0], z: 2, m: 'P' },
    { s: [...F, 1.9, H[0] - 0.5, H[1] - 0.5, 1.7], z: 1, m: 'P' },
    ...(fore ? [] : [{ e: [M[0] - 1.5, M[1] - 0.5, 1.8, 2.2, 2, 0], z: 1, m: 'P' }]),
  ]);
  G.m.forEach((m, k) => { if (m && G.z[k] < -1e7) [G.m[k], G.ch[k]] = ['', '.']; });
  haOutline(G, 2);
  // The hoof: its wall lit on the heel side and darker toward the toe, on a dark sole; tipped back when lifted.
  haPut(G, Math.round(H[0]) - (lifted ? 2 : 3), Math.round(H[1]),
    lifted ? ['JhHJ.', 'JhHjJ', '.JHjJ', '..JJ.'] : ['.JhHJ.', 'JhhHjJ', 'JhHHjJ', 'JJJJJJ']);
  HA_LEGS.set(key, haPart(G));
  return HA_LEGS.get(key);
}

const haRes = () => (typeof SC_RES === 'number' ? SC_RES : 4);
// Draws part p in palette pal with its place from column x and row y (units), its canvas made on first use. lift, if
// given, raises each quarter column X by lift(X) units (a rearing horse tipping back on its hind legs), drawn in strips
// of equal lift. from, if given, leaves out the rows above quarter row from.
function haDraw(g, p, pal, x, y, lift, from) {
  const [w, h] = [p.rows[0].length, p.rows.length];
  let cv = p.cv.get(pal);
  if (!cv) {
    const R = haRes();
    cv = document.createElement('canvas');
    [cv.width, cv.height] = [Math.ceil((w * R) / 4), Math.ceil((h * R) / 4)];
    const cg = cv.getContext('2d');
    cg.setTransform(R, 0, 0, R, 0, 0);
    qdMap(cg, p.rows, pal, 0, 0);
    p.cv.set(pal, cv);
  }
  const R = cv.width / w;
  const r0 = from == null ? 0 : Math.max(0, Math.min(h - 1, from - p.y0));
  for (let i = 0; i < w;) {
    const l = lift ? lift(p.x0 + i) : 0;
    let e = lift ? i + 1 : w;
    while (e < w && lift(p.x0 + e) === l) e += 1;
    g.drawImage(cv, i * R, r0 * R, (e - i) * R, (h - r0) * R, x + (p.x0 + i) / 4, y + (p.y0 + r0) / 4 - l, (e - i) / 4, (h - r0) / 4);
    i = e;
  }
}
