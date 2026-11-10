// scene2-orc-art.js: the orcs of the map from above (scene2.js) and the small kit the events' art is painted with. A
// figure is built from rounded parts (ovals and limbs) painted pixel by pixel at 4 pixels a unit: each part is shaded as
// a solid lit from the upper left, in a ramp of five steps that runs cool in the shade and warm in the light, dithered
// where two steps meet, and outlined in its own darkest hue (lighter on its lit side), so parts that overlap still read
// apart. Two kinds stand in the swarm: the goblin of the Misty Mountains (21 units tall, hunched, sallow, big ears and
// yellow eyes, a notched scimitar, a leather jerkin) and the Uruk-hai (30 tall, dark-skinned, an iron helm with a nose
// guard, mail and a broad falchion). Each comes in three facings (down, up, side for right; left is side mirrored) and
// the poses walk (frames 0, 0.5, 1, 1.5), stand, attack (0 raised, 0.5 swinging, 1 striking), stagger (0, 1) and fall
// (0, on its knees). A torch-bearer has the torch in place of the blade; m2eOrcFrame gives where its hand is, so the
// flame can be drawn live. Every frame is painted once, when first needed, and kept.

// Ramps, outline to shine. A ramp's rim (when it has one) is the colour of its outline on the lit side, so a dark
// figure keeps its edge against dark ground.
const M2E_RAMP = {
  gob: ['#0d1411', '#1d2c24', '#314434', '#4a5d3d', '#69794a', '#929c62'],
  uruk: ['#0b090d', '#1d1619', '#332523', '#4b372d', '#694f3e', '#8d6d52'],
  leather: ['#140c0a', '#2b1a12', '#47301c', '#664626', '#886034', '#ab8250'],
  iron: ['#0a0b11', '#1b1f28', '#313745', '#4e5565', '#767e8e', '#aab1be'],
  rag: ['#140808', '#2c1010', '#481a16', '#64281e', '#82402a', '#a45a3a'],
  black: ['#060609', '#121318', '#20222c', '#33364a', '#4d5266', '#767d94'],
  hide: ['#0c0806', '#1c130e', '#2e2016', '#43301f', '#5a432b', '#76593a'],
  wood: ['#1e1008', '#3a2412', '#5a3a1c', '#7c5428', '#9e7038', '#c09050'],
};
M2E_RAMP.gob.rim = '#a8b070';
M2E_RAMP.uruk.rim = '#a8826a';
M2E_RAMP.leather.rim = '#c09060';
M2E_RAMP.iron.rim = '#d0d6e0';
M2E_RAMP.black.rim = '#9aa2bc';
M2E_RAMP.hide.rim = '#9a7a52';
// The Uruk's shield: black, with an iron rim.
M2E_RAMP.shield = ['#000000', '#060608', '#0c0c10', '#131318', '#1b1b22', '#26262e'];
const M2E_L = (() => { const v = [-0.5, -0.62, 0.6]; const n = Math.hypot(...v); return v.map((k) => k / n); })();
// A ramp one step darker, for the limbs on the far side of a body.
const m2eDim = (R) => [R[0], R[0], R[1], R[2], R[3], R[4]];

// A pixel buffer w by h units (4 pixels a unit), every pixel clear.
function m2eBuf(w, h) {
  const W = Math.ceil(w * 4);
  const H = Math.ceil(h * 4);
  return { w: W, h: H, px: new Array(W * H).fill(null) };
}
// Paints one part: inside(x, y) says whether a point (units) is in it, normal(x, y) its surface normal there. Each pixel
// gets a ramp step from the light, dithered; a pixel at the part's edge gets its outline. tex(px, py, step) may change
// a step (mail rings, stitching).
function m2ePart(b, box, inside, normal, R, { line = true, tex = null, flat = 0 } = {}) {
  const [x0, y0, x1, y1] = box.map((v) => Math.floor(v * 4));
  const ins = (px, py) => inside((px + 0.5) / 4, (py + 0.5) / 4);
  for (let py = Math.max(0, y0 - 1); py <= Math.min(b.h - 1, y1 + 1); py += 1) {
    for (let px = Math.max(0, x0 - 1); px <= Math.min(b.w - 1, x1 + 1); px += 1) {
      if (!ins(px, py)) continue;
      const [nx, ny, nz] = normal((px + 0.5) / 4, (py + 0.5) / 4);
      const l = nx * M2E_L[0] + ny * M2E_L[1] + nz * M2E_L[2];
      if (line && (!ins(px - 1, py) || !ins(px + 1, py) || !ins(px, py - 1) || !ins(px, py + 1))) { b.px[py * b.w + px] = l > 0.45 ? R.rim ?? R[1] : R[0]; continue; }
      let s = Math.floor(Math.max(0, Math.min(0.999, (Math.max(0, l) * 0.86 + 0.12) * (1 - flat) + flat * 0.6)) * 5 + (M2_BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * 0.7);
      s = Math.max(0, Math.min(4, s));
      if (tex) s = Math.max(0, Math.min(4, tex(px, py, s)));
      b.px[py * b.w + px] = R[1 + s];
    }
  }
}
// An oval centred at (cx, cy) with radii rx, ry; clip(x, y) may cut it.
function m2eOval(b, cx, cy, rx, ry, R, o = {}) {
  const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && (!o.clip || o.clip(x, y));
  const normal = (x, y) => { const nx = (x - cx) / rx; const ny = (y - cy) / ry; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; };
  m2ePart(b, [cx - rx, cy - ry, cx + rx, cy + ry], inside, normal, R, o);
}
// A limb from a to b, its radius r0 at a narrowing (or widening) to r1 at b.
function m2eLimb(buf, [ax, ay], [bx, by], r0, r1, R, o = {}) {
  const [dx, dy] = [bx - ax, by - ay];
  const n2 = dx * dx + dy * dy || 1;
  const near = (x, y) => { const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / n2)); return [t, ax + dx * t, ay + dy * t]; };
  const inside = (x, y) => { const [t, cx, cy] = near(x, y); return Math.hypot(x - cx, y - cy) <= r0 + (r1 - r0) * t; };
  const normal = (x, y) => {
    const [t, cx, cy] = near(x, y);
    const r = r0 + (r1 - r0) * t;
    const [nx, ny] = [(x - cx) / r, (y - cy) / r];
    return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
  };
  const m = Math.max(r0, r1);
  m2ePart(buf, [Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m], inside, normal, R, o);
}
// One or more pixels of colour c at (x, y) units, w by h pixels.
function m2eDot(b, x, y, c, w = 1, h = 1) {
  const [px, py] = [Math.floor(x * 4), Math.floor(y * 4)];
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) if (px + i >= 0 && px + i < b.w && py + j >= 0 && py + j < b.h) b.px[(py + j) * b.w + px + i] = c;
}
// The buffer as a canvas at 4 pixels a unit.
function m2ePaint(b) {
  const { c, g } = m2Canvas(b.w / 4, b.h / 4);
  m2Raster(g, 0, 0, b.w, b.h, (px, py) => b.px[py * b.w + px]);
  return c;
}

// Each kind's measures (units above the feet): hip, knee, shoulder height and half width, the torso and head ovals,
// a width factor for limbs, the blade's length and the frame.
const M2E_ORC = {
  goblin: { W: 24, H: 26, FX: 12, FY: 24.5, hip: 4.6, knee: 2.5, sh: 10.6, shX: 3.8, torso: [8.2, 3.6, 3.7], head: [14.8, 4.4, 4.0], k: 1, blade: 6.5, spread: 1.9, bow: 0.9, hunch: 1.4, skin: 'gob', body: 'leather' },
  uruk: { W: 32, H: 36, FX: 16, FY: 34.5, hip: 8.6, knee: 4.8, sh: 18.6, shX: 5.6, torso: [14.8, 5.2, 5.4], head: [24.2, 4.3, 4.2], k: 1.35, blade: 8.5, spread: 2.5, bow: 1.5, shield: true, hunch: 0.6, skin: 'uruk', body: 'black' },
};
const m2eOrcArt = new Map();
// One frame of an orc of this kind, facing down, up or side, in a pose and frame, with a torch or a blade: { c, hand }
// with hand where the weapon hand is in frame units (feet at the kind's FX, FY).
function m2eOrcFrame(kind, facing, pose, frame, torch = false) {
  const key = `${kind}|${facing}|${pose}|${frame}|${torch ? 1 : 0}`;
  if (m2eOrcArt.has(key)) return m2eOrcArt.get(key);
  const K = M2E_ORC[kind];
  const b = m2eBuf(K.W, K.H);
  const out = { c: null, hand: null, K };
  m2eOrcBody(b, K, facing, pose, frame, torch, out);
  out.c = m2ePaint(b);
  m2eOrcArt.set(key, out);
  return out;
}
// The blade (or nothing, for a torch-bearer) in the hand at h pointing along d: a wooden grip, an iron guard and a
// notched blade that curves a little at its tip (a goblin's scimitar) or stays broad (an Uruk's falchion).
function m2eBlade(b, K, h, d, torch) {
  if (torch) return;
  const n = Math.hypot(...d);
  const [ux, uy] = [d[0] / n, d[1] / n];
  const at = (t, s = 0) => [h[0] + ux * t - uy * s, h[1] + uy * t + ux * s];
  const I = M2E_RAMP.iron;
  m2eLimb(b, at(-1.1), at(0.3), 0.42, 0.42, M2E_RAMP.wood);
  m2eLimb(b, at(0.5, -1.1 * K.k), at(0.5, 1.1 * K.k), 0.4, 0.4, I);
  const curve = K.skin === 'gob' ? 0.9 : 0.2;
  m2eLimb(b, at(0.9), at(K.blade * 0.6, curve * 0.3), 0.5 * K.k, 0.55 * K.k, I);
  m2eLimb(b, at(K.blade * 0.6, curve * 0.3), at(K.blade, curve), 0.55 * K.k, 0.25, I);
  // A bright edge along the blade so it reads at a glance.
  for (let t = 1.2; t < K.blade - 0.6; t += 0.25) m2eDot(b, ...at(t, -0.3 * K.k + (curve * t * t) / (K.blade * K.blade) * 0.8), '#e8eef4');
  m2eDot(b, ...at(K.blade * 0.45, -0.45 * K.k), '#1b1f28');
}
// The face toward you: slanted brows, yellow eyes (an Uruk's narrower and redder), a flat nose, a wide mouth with tusks;
// the Uruk's helm with its nose guard.
function m2eOrcFace(b, K, x, y) {
  const uruk = K.skin === 'uruk';
  const dark = uruk ? '#07050a' : '#0c1410';
  for (const s of [-1, 1]) {
    const ex = x + s * 1.55 - 0.375;
    m2eDot(b, ex - (s < 0 ? 0.25 : 0), y - 1.1 + (s < 0 ? 0 : 0), dark, 4, 1);
    m2eDot(b, ex + (s < 0 ? -0.25 : 0.5), y - 1.35, dark, 2, 1);
    m2eDot(b, ex, y - 0.6, uruk ? '#ff6a2a' : '#ffd23a', 3, 2);
    m2eDot(b, ex + (s < 0 ? 0.5 : 0), y - 0.6, uruk ? '#fff0b0' : '#fff6c0', 1, 1);
    m2eDot(b, ex + 0.25, y - 0.35, '#2a0800', 1, 1);
  }
  m2eDot(b, x - 0.5, y + 0.75, dark, 1, 1);
  m2eDot(b, x + 0.25, y + 0.75, dark, 1, 1);
  m2eDot(b, x - 1.5, y + 1.9, dark, 13, 1);
  m2eDot(b, x - 1.25, y + 1.4, '#efe4c0', 1, 2);
  m2eDot(b, x + 1, y + 1.4, '#efe4c0', 1, 2);
  m2eDot(b, x - 0.5, y + 2.15, '#3a1810', 5, 1);
}

// The White Hand of Saruman on a shield at (x, y) units, squeezed across by sx (1 face on): four fingers up, a thumb out
// to the left and the palm, white on the black face.
function m2eWhiteHand(b, x, y, sx = 1) {
  const W = '#f4f4ee';
  const w = Math.max(1, Math.round(2 * sx));
  const at = (i) => x + (Math.round(i * sx * 2) / 4);
  for (const [i, h] of [[-3, 6], [-1, 8], [1, 8], [3, 6]]) m2eDot(b, at(i) - 0.25, y - 2.75 + (8 - h) / 4, W, w, h);
  m2eDot(b, at(-3) - 0.25, y - 0.75, W, Math.round(7 * w / 2) + w, 5);
  m2eDot(b, at(-5) - 0.25, y - 0.5, W, w, 2);
  m2eDot(b, at(-6) - 0.25, y - 1, W, Math.max(1, w / 2), 2);
}
// A round shield centred at (x, y), radius r, squeezed across by sx, with the White Hand on it.
function m2eShield(b, x, y, r, sx = 1) {
  m2eOval(b, x, y, r * sx, r, M2E_RAMP.iron);
  m2eOval(b, x, y, r * sx - 0.5, r - 0.5, M2E_RAMP.shield, { line: false });
  m2eDot(b, x - 0.125, y - 0.125, '#4e5565', 1, 1);
  m2eWhiteHand(b, x + 0.25 * sx, y + 0.25, sx);
}
