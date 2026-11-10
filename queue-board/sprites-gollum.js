// sprites-gollum.js: Gollum in the Middle-earth view (scene-gollum.js), in 32-bit, a quarter unit a pixel on scene.js's
// canvas (SC_RES of 4). He is drawn as the books tell him: a small, thin, pale creature on long limbs and big flat feet,
// a big head with two big pale eyes that shine in the dark, a few lank hairs, and a ragged loincloth. Each pose is laid
// out as a little skeleton (hips, shoulders, head, hands and feet, the knees and elbows found from the limbs' lengths),
// its body painted from round shapes lit from the upper left onto a six-step ramp per material that runs warm in the
// light and cool in the shade, the farther limbs a step darker, each part edged where it lies over another, ringed
// with an outline in its own darkest hue, and then the face put on by hand: the eyes, the mouth, the hairs. Every
// finished frame is painted once into a small canvas at SC_RES (each way he faces, and in shadow apart) and drawn from
// there. His hoard, the Ring and the fish he catches are scene-gollum-tag.js's. Uses sprites-hd.js's hdMix and qdMap
// and scene.js's SC_RES. No image files.

// The ramps, from shine to outline: his skin pale with a cold grey-green cast, the loincloth's old brown rag, his hair.
const GOL_RAMP = {
  skin: ['#eeecd2', '#cfd0b0', '#a9ad8e', '#7d8676', '#56605d', '#2b3135'],
  cloth: ['#8f7d63', '#6f604c', '#56493a', '#3f352c', '#2b241f', '#171311'],
};
// Each material's characters, shine to outline, and the hand-placed ones: the eyes' white, their shade, the pale green
// iris and the pupil, the mouth and a tooth, and the hairs.
const GOL_KEYS = { skin: 'abcdef', cloth: 'ABCDEF' };
const GOL_PAL = { w: '#eef6de', x: '#b7c9ae', i: '#b9dc9c', k: '#0e1016', m: '#2a1f22', t: '#e9e2c6', h: '#3a3430', H: '#211e1c' };
for (const [mat, keys] of Object.entries(GOL_KEYS)) [...keys].forEach((k, i) => { GOL_PAL[k] = GOL_RAMP[mat][i]; });
// The frame: 56 by 40 pixels (14 by 10 units), the feet's line on its bottom edge at its middle.
const GOL_W = 56;
const GOL_H = 40;
const [GOL_AX, GOL_AY] = [28, 40];
// The poses are laid out a fifth smaller than he is drawn: every place, length and thickness grows by GOL_K.
const GOL_K = 1.2;
// Light from the upper left.
const golLit = (nx, ny, nz) => -0.55 * nx - 0.62 * ny + 0.56 * nz;

// Where the joint between two bones of lengths a and b lies, from root r to tip t, bent to side s (1 or -1).
function golBend(r, t, a, b, s) {
  const [dx, dy] = [t[0] - r[0], t[1] - r[1]];
  const d = Math.min(a + b - 0.01, Math.max(0.01, Math.hypot(dx, dy)));
  const k = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - k * k));
  const [ux, uy] = [dx / Math.hypot(dx, dy || 0.001), dy / Math.hypot(dx, dy || 0.001)];
  return [r[0] + ux * k - s * h * uy, r[1] + uy * k + s * h * ux];
}

// Paints a pose's shapes onto a grid: each part a round blob or a limb tapering from one point to another, with the
// light each pixel takes from the way its surface faces. Later parts cover earlier ones.
function golShapes(parts) {
  const n = GOL_W * GOL_H;
  const part = new Int16Array(n).fill(-1);
  const lum = new Float32Array(n);
  parts.forEach((p, id) => {
    const [x0, y0, x1, y1] = p.box;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(GOL_H, Math.ceil(y1)); y += 1) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(GOL_W, Math.ceil(x1)); x += 1) {
        const nrm = p.at(x + 0.5, y + 0.5);
        if (!nrm) continue;
        part[y * GOL_W + x] = id;
        lum[y * GOL_W + x] = golLit(...nrm) + (p.dim ?? 0);
      }
    }
  });
  return { part, lum };
}
// A blob: an ellipse about (cx, cy), rx by ry, rounded like a ball.
function golBlob(cx, cy, rx, ry, mat, dim = 0) {
  [rx, ry] = [rx * GOL_K, ry * GOL_K];
  return { mat, dim, box: [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1], at: (x, y) => {
    const [u, v] = [(x - cx) / rx, (y - cy) / ry];
    const q = u * u + v * v;
    return q > 1 ? null : [u, v, Math.sqrt(1 - q)];
  } };
}
// A limb: from a to b, its radius running from ra to rb, rounded like a rod.
function golLimb(a, b, ra, rb, mat, dim = 0) {
  [ra, rb] = [ra * GOL_K, rb * GOL_K];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const L2 = dx * dx + dy * dy || 1;
  const r = Math.max(ra, rb);
  return { mat, dim, box: [Math.min(a[0], b[0]) - r - 1, Math.min(a[1], b[1]) - r - 1, Math.max(a[0], b[0]) + r + 1, Math.max(a[1], b[1]) + r + 1], at: (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
    const [ox, oy] = [x - a[0] - dx * t, y - a[1] - dy * t];
    const rr = ra + (rb - ra) * t;
    const d = Math.hypot(ox, oy);
    if (d > rr) return null;
    return [ox / rr, oy / rr, Math.sqrt(Math.max(0, 1 - (d / rr) ** 2))];
  } };
}

// The finished pixels: each lit step on its material's ramp; a part lying under a nearer one is shaded along their
// meeting; a one-pixel outline round the whole in the darkest hue of what it borders, a step softer on the lit side.
function golPixels(parts) {
  const { part, lum } = golShapes(parts);
  const out = Array.from({ length: GOL_H }, () => Array(GOL_W).fill('.'));
  const at = (x, y) => (x < 0 || y < 0 || x >= GOL_W || y >= GOL_H ? -1 : part[y * GOL_W + x]);
  for (let y = 0; y < GOL_H; y += 1) {
    for (let x = 0; x < GOL_W; x += 1) {
      const id = at(x, y);
      if (id < 0) continue;
      const L = lum[y * GOL_W + x];
      let k = L > 0.88 ? 0 : L > 0.62 ? 1 : L > 0.24 ? 2 : L > -0.12 ? 3 : 4;
      const near = [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) > id);
      if (near) k = Math.min(4, Math.max(k + 1, 3 + (parts[id].mat === 'skin' ? 0 : 1)));
      out[y][x] = GOL_KEYS[parts[id].mat][k];
    }
  }
  for (let y = 0; y < GOL_H; y += 1) {
    for (let x = 0; x < GOL_W; x += 1) {
      if (at(x, y) >= 0) continue;
      const hit = [[0, -1, 5], [-1, 0, 5], [1, 0, 4], [0, 1, 4]].find(([dx, dy]) => at(x + dx, y + dy) >= 0);
      if (hit) out[y][x] = GOL_KEYS[parts[at(x + hit[0], y + hit[1])].mat][hit[2]];
    }
  }
  return out;
}

// His head, facing right with the face turned a little toward us, 18 by 17 pixels: a big bald skull lit on its crown,
// two big round pale eyes under shaded brows with a thin nose between them, hollow cheeks, a wide thin mouth and a small
// chin. golHead puts on each eye's pale green iris and its pupil, the open mouth and the hairs.
const GOL_HEAD = [
  '......ffffff......',
  '....ffbbaaabbff...',
  '...fbbaaaaaabbbcf.',
  '..fcbaaaaaabbbbcf.',
  '.fcbbaabbbbbbbbccf',
  '.fcbeeeeebbeeeeedf',
  'fdcbewwwebbewwwedf',
  'fdcbwwwwwbcwwwwwdf',
  'fdcbwwwwwbcwwwwwdf',
  'fecbxwwwxbcxwwwxef',
  'fedcdxxxdbcdxxxdef',
  '.fedccccdbbdccccef',
  '.feddcccdddcccddf.',
  '..fedmmmmmmmmdef..',
  '...feddccccdddf...',
  '....ffeeddddff....',
  '......ffffff......',
];
// Where each eye's pupil sits (its top pixel, one wide and two tall, inside an iris three by three; near eye then far
// eye) for each way he looks: right, left, down at his hands, and at us.
const GOL_LOOK = { R: [[7, 7], [14, 7]], L: [[5, 7], [12, 7]], D: [[6, 8], [13, 8]], F: [[6, 7], [13, 7]] };
// The hairs: three lank strands from the crown, over the sides of the skull and hanging past it.
const GOL_HAIR = [
  [[7, 0], [6, 1], [5, 1], [4, 2], [3, 3], [2, 4], [1, 5], [0, 6], [-1, 7], [-1, 8], [-1, 9], [-2, 10], [-2, 11], [-2, 12]],
  [[5, 0], [4, 0], [3, 1], [2, 2], [1, 3], [0, 4], [-1, 5], [-2, 6], [-2, 7], [-3, 8]],
  [[11, 0], [12, 1], [13, 1], [14, 2], [15, 3], [16, 4], [17, 5], [18, 6], [18, 7], [18, 8], [19, 9]],
];
function golHead(out, x0, y0, look = 'R', mouth = false) {
  const set = (x, y, k) => { if (x0 + x >= 0 && y0 + y >= 0 && x0 + x < GOL_W && y0 + y < GOL_H) out[y0 + y][x0 + x] = k; };
  GOL_HEAD.forEach((row, y) => [...row].forEach((k, x) => { if (k !== '.') set(x, y, k); }));
  for (const [px, py] of GOL_LOOK[look]) {
    for (let y = py; y < py + 3; y += 1) for (let x = px - 1; x <= px + 1; x += 1) if ('wx'.includes(GOL_HEAD[y]?.[x])) set(x, y, 'i');
    set(px, py, 'k');
    set(px, py + 1, 'k');
  }
  if (mouth) { for (let x = 7; x <= 11; x += 1) set(x, 14, 'm'); set(7, 13, 't'); set(10, 13, 't'); }
  GOL_HAIR.forEach((strand, i) => strand.forEach(([x, y], k) => set(x, y, k < 3 || i === 1 ? 'H' : 'h')));
}

// A pose's body, facing right, in pixels from the feet's line at the frame's middle: hips, the middle of the back and
// the shoulders; each foot and hand, the near one first, with the side its knee or elbow bends to; the order its parts
// lie in from the back (a far arm, b far leg, t the body and loincloth, n near leg, m near arm); and where the head's
// top-left goes, which way he looks and whether his mouth is open.
function golParts(P) {
  const A = (p) => [GOL_AX + p[0] * GOL_K, GOL_AY + p[1] * GOL_K];
  const [wx, wy] = P.sway ?? [0, 0];
  const U = (p) => [GOL_AX + p[0] * GOL_K + wx, GOL_AY + p[1] * GOL_K + wy];
  const [hip, mid, sh] = [U(P.hip), U(P.back), U(P.sh)];
  const legs = P.feet.map(([fx, fy, tx, ty, s, kx, ky], i) => {
    const [h, ankle, toe] = [P.hips ? A(P.hips[i]) : [hip[0] + (i ? -1.8 : 0.6), hip[1] - (i ? 0.6 : 0)], A([fx, fy]), A([tx, ty])];
    const knee = kx === undefined ? golBend(h, ankle, (P.thigh ?? 11) * GOL_K, (P.shin ?? 11) * GOL_K, s) : A([kx, ky]);
    const dim = i ? (P.far ?? -0.45) : 0;
    return [...(P.thighR === 0 ? [] : [golLimb(h, knee, P.thighR ?? 1.8, 1.3, 'skin', dim + (P.thighDim ?? 0))]), golLimb(knee, ankle, 1.2, 0.8, 'skin', dim),
      golBlob(knee[0], knee[1], 1.4, 1.3, 'skin', dim), golLimb(ankle, toe, 1.1, 1, 'skin', dim)];
  });
  const arms = P.hands.map(([hx, hy, s, ex, ey], i) => {
    const [s0, hand] = [P.shs ? U(P.shs[i]) : [sh[0] + (i ? -1.8 : 0.6), sh[1] + (i ? -0.6 : 0.6)], (P.handsStay ? A : U)([hx, hy])];
    const elbow = ex === undefined ? golBend(s0, hand, (P.upper ?? 8.5) * GOL_K, (P.fore ?? 9) * GOL_K, s) : U([ex, ey]);
    const dim = i ? (P.far ?? -0.45) : 0;
    return [golLimb(s0, elbow, 1, 0.8, 'skin', dim), golLimb(elbow, hand, 0.8, 0.7, 'skin', dim), golBlob(hand[0], hand[1], 1.3, 1, 'skin', dim)];
  });
  const [r0, r1] = P.torso ?? [2.6, 3.1];
  const flap = P.flap ?? [2.5, 1, 3.2, 3.5];
  const td = P.torsoDim ?? 0;
  const body = [golLimb(hip, mid, r0, r1, 'skin', td), golLimb(mid, sh, r1, r1 - 0.6, 'skin', td), golLimb(sh, U(P.neck), 1.3, 1.2, 'skin'),
    golBlob(hip[0] + 0.6, hip[1] + 0.4, P.loin?.[0] ?? 3.4, P.loin?.[1] ?? 2.2, 'cloth'), golLimb([hip[0] + flap[0] * GOL_K, hip[1] + flap[1] * GOL_K], [hip[0] + flap[2] * GOL_K, hip[1] + flap[3] * GOL_K], 1.3, 0.8, 'cloth')];
  const by = { a: arms[1] ?? [], b: legs[1] ?? [], t: body, n: legs[0] ?? [], m: arms[0] ?? [] };
  return [...(P.order ?? 'abtnm')].flatMap((k) => by[k]);
}
// Where a pose's head goes, its top-left in pixels from the feet's line: laid out for the smaller figure, so moved out
// with the rest, and swayed with the body.
const golHeadAt = (P) => [Math.round(P.head[0] * GOL_K - 0.6) + (P.sway?.[0] ?? 0), Math.round(P.head[1] * GOL_K - 1.4) + (P.sway?.[1] ?? 0)];
// A finished frame's rows of characters for a pose. A peek has no body: only the head and the two hands gripping the
// edge he hides behind.
function golRows(P) {
  const out = golPixels(P.peek ? P.hands.map(([hx, hy]) => golBlob(GOL_AX + hx * GOL_K, GOL_AY + hy * GOL_K, 1.4, 1.1, 'skin')) : golParts(P));
  const set = (x, y, k) => { if (x >= 0 && y >= 0 && x < GOL_W && y < GOL_H) out[y][x] = k; };
  // His long fingers: from each hand, three thin lines the way P.fingers points.
  P.hands.forEach(([hx, hy], i) => {
    const [dx, dy] = P.fingers?.[i] ?? [0, 0];
    [hx, hy] = [hx * GOL_K + (P.handsStay ? 0 : P.sway?.[0] ?? 0), hy * GOL_K + (P.handsStay ? 0 : P.sway?.[1] ?? 0)];
    if (!dx && !dy) return;
    for (const f of [-1, 0, 1]) {
      for (let k = 1; k <= 3; k += 1) set(Math.round(GOL_AX + hx + dx * k + f * (dy ? 1 : 0)), Math.round(GOL_AY + hy + 0.5 + dy * k + f * (dx ? 0.6 : 0)), k === 3 ? 'e' : 'c');
    }
  });
  const [hx, hy] = golHeadAt(P);
  golHead(out, GOL_AX + hx, GOL_AY + hy, P.look, P.mouth);
  return out.map((r) => r.join(''));
}

// The poses. Crouched, he faces us: knees up either side of his head, arms hanging between them to the ground, his
// face turned a little to the right. On the move he goes on all fours, seen from the side.
const GOL_SIT = { hip: [0, -5], back: [0, -9], sh: [0, -12], neck: [0, -15], head: [-7, -27], far: -0.1,
  torso: [1.6, 2.2], loin: [3.4, 1.5], flap: [-0.5, 1, -0.5, 3], torsoDim: -0.5, thighR: 1.1, thighDim: -0.55, order: 'btnam', hips: [[2, -5], [-2, -5]], shs: [[3, -12.5], [-3, -12.5]],
  feet: [[5, -2, 10, -1, 1, 10, -15], [-5, -2, -10, -1, 1, -10, -14]], hands: [[3.5, -1.5, 1, 3.5, -8], [-3.5, -1.5, 1, -3.5, -8]] };
// Clutching: his hands together under his chin, elbows down by his knees, looking down at what he holds.
const GOL_CLUTCH = { ...GOL_SIT, look: 'D', hands: [[1, -11, 1, 5.5, -7], [-0.5, -11.5, 1, -5, -7]] };
// On all fours: an arched back, the head low and forward.
const GOL_FOURS = { hip: [-6, -7], back: [-1.5, -10], sh: [3, -8.5], neck: [6, -10], head: [5, -19], far: -0.45, order: 'abtnm', torso: [1.8, 2.3],
  loin: [2.6, 1.8], flap: [-1, 1.5, -2, 3.5], thigh: 7.5, shin: 7.5, upper: 6, fore: 6.5 };
// A step of the creep for frame f: each limb is down three frames, sliding back as he goes, and swings forward in the
// fourth, one limb at a time (near hand, far foot, far hand, near foot), his body bobbing a pixel.
function golCreep(f) {
  const at = (n, x) => { const p = (f + n) % 4; return [x + [2, 0.5, -1, 1][p], p === 3 ? -3 : -1.5]; };
  const [nh, ff, fh, nf] = [at(0, 10), at(1, -8), at(2, 8), at(3, -6)];
  return { ...GOL_FOURS, sway: [0, f % 2 ? -1 : 0], feet: [[nf[0], nf[1] - 0.5, nf[0] + 4, nf[1] + 0.5, -1], [ff[0], ff[1] - 0.5, ff[0] + 4, ff[1] + 0.5, -1]],
    hands: [[nh[0], nh[1], -1], [fh[0], fh[1], -1]], handsStay: true };
}
// A bound of the scuttle: stretched out with hands far forward and feet far back, then gathered under him in the air.
const golScuttle = (f) => {
  const [hn, hf, fn, ff, up] = [[14, 9, -14, -11, 0], [7, 9, -4, -6, -2], [11, 14, -11, -14, 0], [9, 6, -6, -3, -2]][f];
  return { ...GOL_FOURS, sway: [0, up], handsStay: true, feet: [[fn, -2, fn + (up ? 4 : -4), -1, up ? -1 : 1], [ff, -2, ff + (up ? 4 : -4), -1, up ? -1 : 1]],
    hands: [[hn, up ? -2 : -1.5, -1], [hf, -1.5, -1]] };
};
const GOL_POSES = {
  crouch: [GOL_SIT, { ...GOL_SIT, sway: [0, 1], handsStay: true }, { ...GOL_SIT, look: 'L' }, { ...GOL_SIT, look: 'F' }],
  rock: [-1, 0, 1, 0].map((x, f) => ({ ...GOL_SIT, sway: [x, 0], handsStay: true, mouth: f % 2 === 1 })),
  clutch: [0, -1, 0, 1].map((x, f) => ({ ...GOL_CLUTCH, sway: [x, 0], mouth: f % 2 === 1 })),
  creep: [0, 1, 2, 3].map(golCreep),
  scuttle: [0, 1, 2, 3].map(golScuttle),
  // Peeking over an edge three pixels above his frame's foot: his head and hands, the fingers hooked over it.
  peek: ['L', 'R'].map((look) => ({ peek: true, look, head: [-7, -17], hands: [[-6, -5], [6, -5]], fingers: [[0, 1], [0, 1]] })),
  // Snatching at a fish: lunging forward with both hands thrust out low.
  snatch: [{ ...GOL_FOURS, hip: [-7, -8], back: [-3, -11], sh: [2, -10], neck: [5, -10], head: [4, -20], feet: [[-4, -2, 0, -1, -1], [-7, -2, -3, -1, -1]],
    hands: [[14, -1.5, -1], [12, -1, -1]], look: 'R', mouth: true }],
  // Holding up what he caught, his hands under his open mouth.
  hold: [{ ...GOL_SIT, look: 'D', mouth: true, hands: [[1, -13, 1, 5.5, -8], [-0.5, -13.5, 1, -5, -8]] }],
};

// Each frame's rows, worked out once, and its picture at SC_RES for each way he faces and each depth of shadow: 0 in
// the open, 1 in shadow, 2 deep in it (a dark doorway), where only his eyes keep their pale light.
const GOL_ROWS = new Map();
const GOL_CANVAS = new Map();
const GOL_SHADE = [0, 0.22, 0.6];
const golPal = (shade) => Object.fromEntries(Object.entries(GOL_PAL).map(([k, c]) => [k, hdMix(c, '#151b2b', GOL_SHADE[shade] * ('wxi'.includes(k) ? 0.15 : 1))]));
const GOL_PALS = [0, 1, 2].map(golPal);
function golFrame(pose, frame) {
  const list = GOL_POSES[pose];
  const f = ((frame % list.length) + list.length) % list.length;
  const key = `${pose}${f}`;
  if (!GOL_ROWS.has(key)) GOL_ROWS.set(key, golRows(list[f]));
  return [key, f];
}
// Draws him with his feet's line at (x, y), in a pose and frame, facing right (face 1) or left (-1), in shadow or not.
// A peek is drawn with the edge he grips at y.
function drawGollum(g, x, y, pose, frame, face = 1, shade = 0) {
  const [key] = golFrame(pose, frame);
  const ck = `${key}${face < 0 ? 'm' : 'r'}${shade}`;
  let cv = GOL_CANVAS.get(ck);
  if (!cv) {
    const rows = GOL_ROWS.get(key);
    cv = document.createElement('canvas');
    cv.width = (GOL_W / 4) * SC_RES;
    cv.height = (GOL_H / 4) * SC_RES;
    const c = cv.getContext('2d');
    c.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
    qdMap(c, face < 0 ? rows.map((r) => [...r].reverse().join('')) : rows, GOL_PALS[shade], 0, 0);
    GOL_CANVAS.set(ck, cv);
  }
  const q = (v) => Math.round(v * 4) / 4;
  g.drawImage(cv, q(x) - GOL_AX / 4, q(y) - GOL_AY / 4 + (pose === 'peek' ? 0.75 : 0), GOL_W / 4, GOL_H / 4);
}
// Where his two eyes are in a frame, in units from his feet's line (or a peek's edge), for their glow in the dark.
function golEyes(pose, frame, face = 1) {
  const [hx, hy] = golHeadAt(GOL_POSES[pose][golFrame(pose, frame)[1]]);
  return [[hx + 6.5, hy + 8.5], [hx + 13.5, hy + 8.5]].map(([x, y]) => [(face < 0 ? -x : x) / 4, (y + (pose === 'peek' ? 3 : 0)) / 4]);
}
