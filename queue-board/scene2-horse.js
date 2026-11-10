// scene2-horse.js: the Sentry riders' horses on the map from above (scene2.js), seen from overhead in the map's 3/4
// look: in profile facing right (left is its mirror), coming toward you (its head nearest, the rump far behind) and going
// away (the rump and tail nearest). About 32 units from nose to tail. Gaits: stand (the tail swishing, an ear turning),
// walk (four beats), trot (diagonal pairs, the body bobbing), gallop (stretched out, mane and tail streaming) and graze
// (the head down to the grass). Each captain rides his own: Aragorn a near-black horse, Faramir a dark brown, Boromir a
// bay with black points, Eomer a grey of Rohan with a white mane; the saddle cloth in the rider's colours. Forms are
// laid out here and painted by scene2-horse-art.js, once per frame, kept in a cache.

const M2M_COATS = {
  dark: { base: '#4a3426', shade: '#2a1c16', mane: '#16100c', maneShade: '#0a0606', low: '#1c1410' },
  brown: { base: '#74503a', shade: '#4a3022', mane: '#1c140f', maneShade: '#0e0a08', low: '#2c2019' },
  bay: { base: '#9a6238', shade: '#6a3f22', mane: '#1e1612', maneShade: '#0e0a08', low: '#241a16' },
  grey: { base: '#bab6b0', shade: '#7e7a78', pale: true, mane: '#f6f4f0', maneShade: '#b4b0aa', paleMane: true, low: '#9e9a92' },
};
// Each captain's horse and saddle cloth [cloth, its shade, its trim].
const M2M_MOUNT = {
  ranger: ['dark', ['#3e4a36', '#262e22', '#8a7a5a']], ithilien: ['brown', ['#4f6a37', '#33482a', '#a08a5a']],
  gondor: ['bay', ['#2c2c38', '#1a1a22', '#c8ccd4']], rohirrim: ['grey', ['#3f7d3c', '#2a5a2b', '#e2b043']],
};
const m2mHorseArt = new Map();
// The canvas size in pixels and where its anchor is (the hooves' row, the middle) for each facing.
const M2M_HFRAME = { side: [144, 104, 72, 100], down: [88, 136, 44, 132], up: [88, 172, 44, 168] };
// The horse is painted at M2M_K of the size its forms are laid out at, about its hooves' anchor, so it keeps v1's horse
// to rider ratio (sprites-horse.js: 17 units rump to nose under a 15-unit rider) with the 19.5-unit riders.
const M2M_K = 0.69;
// Where the saddle's seat is, in units from the anchor, for each facing.
const M2M_SEAT = { side: [-1.75 * M2M_K, -15 * M2M_K], down: [0, -22 * M2M_K], up: [0, -18.5 * M2M_K] };

// Each leg's place in its gait's cycle (near fore, far fore, near hind, far hind), the stride and how high a hoof lifts.
const M2M_GAITS = { stand: [[0, 0, 0, 0], 0, 0], graze: [[0, 0, 0, 0], 0, 0], walk: [[0.25, 0.75, 0, 0.5], 5, 3.5],
  trot: [[0, 0.5, 0.5, 0], 7, 6], gallop: [[0.57, 0.45, 0.12, 0], 17, 9] };
const M2M_BOB = { stand: [0, 0, 0, 0], graze: [0, 0, 0, 0], walk: [0, -0.5, 0, -0.5], trot: [0, -2, 0, -2], gallop: [0, -3, -1, -2] };
const M2M_SWISH = [0, 3, 5, 2];

// A leg from its hip to the ground: the forearm or gaskin, the cannon below the knee or hock, and the hoof. In profile
// the hoof swings forward and back and lifts; seen from the front or behind it only lifts and nears.
function m2mLeg(out, hx, hy, ground, phase, gait, far, side, fore) {
  const [, stride, lift] = M2M_GAITS[gait];
  const p = phase * Math.PI * 2;
  const up = Math.max(0, Math.cos(p)) * lift * (side ? 1 : 1.4);
  const fx = side ? hx + stride * Math.sin(p) : hx;
  const fy = ground - up - (side ? 0 : stride * 0.35 * Math.sin(p));
  // In profile the knee (fore) bends forward and the hock (hind) back as the hoof lifts; seen end on, the joint
  // drops toward the hoof, so a lifted leg is short and thick.
  const kx = side ? (hx + fx) / 2 + (up > 1 ? (fore ? 2.5 : -2.5) : 0) : hx;
  const ky = hy + (fy - hy) * (side ? 0.5 : 0.5);
  const [r0, r1, c0, c1] = side ? [5.5, 3.2, 2.9, 2.3] : [6, 3.6, 3, 2.5];
  out.push({ t: 'c', x0: hx, y0: hy, x1: kx, y1: ky, r0, r1, part: far ? 'farleg' : 'leg' });
  out.push({ t: 'c', x0: kx, y0: ky, x1: fx, y1: fy - 3, r0: c0, r1: c1, part: far ? 'farlow' : 'low' });
  out.push({ t: 'e', cx: fx + (side ? 0.5 : 0), cy: fy - 1.5, rx: side ? 3.1 : 3.3, ry: 2.1, part: far ? 'farhoof' : 'hoof' });
}

// The forms of a horse in profile facing right.
function m2mSideForms(gait, frame) {
  const f = [];
  const [ph] = M2M_GAITS[gait];
  const b = M2M_BOB[gait][frame];
  const sw = M2M_SWISH[frame] * (gait === 'stand' || gait === 'graze' ? 1 : 0.3);
  const graze = gait === 'graze';
  if (gait === 'gallop') f.push({ t: 'c', x0: 27, y0: 43 + b, x1: 12, y1: 50 + b, r0: 5, r1: 4, part: 'tail' }, { t: 'c', x0: 12, y0: 50 + b, x1: 2, y1: 56 + b + (frame % 2), r0: 4, r1: 2, part: 'tail' });
  else f.push({ t: 'c', x0: 28, y0: 41 + b, x1: 19 + sw * 0.4, y1: 58 + b, r0: 4.5, r1: 5.5, part: 'tail' }, { t: 'c', x0: 19 + sw * 0.4, y0: 58 + b, x1: 17 + sw, y1: 86 + b, r0: 5.5, r1: 2.5, part: 'tail' });
  m2mLeg(f, 89, 60 + b, 100, ph[1] + frame / 4, gait, true, true, true);
  m2mLeg(f, 39, 60 + b, 100, ph[3] + frame / 4, gait, true, true, false);
  // At a gallop the neck stretches out forward and lower.
  const [nx, ny, hx, hy, mx, my] = graze ? [116, 76, 120, 94, 121, 97] : gait === 'gallop' ? [114, 32, 129, 42, 131, 44] : [109, 26, 123, 35, 125, 36];
  f.push({ t: 'c', x0: graze ? 112 : nx, y0: (graze ? 70 : ny - 11) + b, x1: graze ? 108 : nx - 1, y1: (graze ? 65 : ny - 18) + b, r0: 2.2, r1: 1, part: 'farear' });
  f.push({ t: 'e', cx: 42, cy: 51 + b, rx: 18, ry: 16, part: 'body', lit: 0.08 });
  f.push({ t: 'e', cx: 66, cy: 53 + b, rx: 30, ry: 16, part: 'body' });
  f.push({ t: 'e', cx: 91, cy: 52 + b, rx: 15, ry: 16, part: 'body', lit: 0.05 });
  f.push({ t: 'c', x0: 97, y0: 46 + b, x1: nx, y1: ny + b, r0: 11.5, r1: 7.5, part: 'body', lit: 0.05 });
  if (graze) f.push({ t: 'c', x0: 94, y0: 41 + b, x1: 110, y1: 70 + b, r0: 3.5, r1: 3, part: 'mane' });
  else f.push({ t: 'c', x0: 91, y0: 36 + b, x1: nx - 5, y1: ny - 9 + b, r0: 4.5, r1: 3.5, part: 'mane', lit: gait === 'gallop' ? 0.1 : 0 });
  f.push({ t: 'c', x0: nx + 1, y0: ny - 5 + b, x1: hx, y1: hy + b, r0: 7, r1: 5.5, part: 'head' });
  f.push({ t: 'e', cx: mx, cy: my + b, rx: 5.5, ry: 5, part: 'head', lit: -0.05 });
  const ear = M2M_SWISH[(frame + 1) % 4] > 2 && gait === 'stand' ? 1.5 : 0;
  if (!graze) f.push({ t: 'c', x0: nx + 3, y0: ny - 11 + b, x1: nx + 1 - ear, y1: ny - 19 + b, r0: 2.4, r1: 1, part: 'ear' });
  else f.push({ t: 'c', x0: 114, y0: 72 + b, x1: 110, y1: 68 + b, r0: 2.4, r1: 1, part: 'ear' });
  f.push({ t: 'c', x0: nx + 3, y0: ny - 8 + b, x1: nx + 6, y1: ny - 2 + b, r0: 2.2, r1: 1.6, part: 'mane' });
  f.push({ t: 'e', cx: graze ? 117 : nx + 6, cy: (graze ? 84 : ny - 1) + b, rx: 1.1, ry: 1.1, part: 'eye' });
  f.push({ t: 'e', cx: mx + 3, cy: my + 1 + b, rx: 0.8, ry: 0.8, part: 'eye' });
  m2mLeg(f, 97, 62 + b, 100, ph[0] + frame / 4, gait, false, true, true);
  m2mLeg(f, 46, 62 + b, 100, ph[2] + frame / 4, gait, false, true, false);
  // The tack: the cloth and its trim, the saddle with its pommel and girth, the bridle, the bit and the reins.
  f.push({ t: 'e', cx: 66, cy: 46 + b, rx: 15.5, ry: 9.5, part: 'trim', flat: true });
  f.push({ t: 'e', cx: 66, cy: 45 + b, rx: 14.5, ry: 8.5, part: 'cloth', flat: true });
  f.push({ t: 'c', x0: 66, y0: 48 + b, x1: 67, y1: 63 + b, r0: 1.4, r1: 1.4, part: 'leather', flat: true });
  f.push({ t: 'e', cx: 65, cy: 40 + b, rx: 9, ry: 4.5, part: 'leather', flat: true }, { t: 'e', cx: 57.5, cy: 38.5 + b, rx: 2.5, ry: 3, part: 'leather', flat: true, lit: 0.25 });
  f.push({ t: 'e', cx: 73, cy: 37.5 + b, rx: 2.2, ry: 2.5, part: 'leather', flat: true, lit: 0.25 });
  f.push({ t: 'c', x0: hx - 13, y0: hy - 9 + b, x1: hx - 11, y1: hy + 1 + b, r0: 0.8, r1: 0.8, part: 'leather', flat: true });
  f.push({ t: 'c', x0: hx - 10, y0: hy - 1 + b, x1: mx + 2, y1: my - 2 + b, r0: 0.8, r1: 0.8, part: 'leather', flat: true });
  f.push({ t: 'e', cx: mx - 1, cy: my + b, rx: 1.3, ry: 1.3, part: 'steel' });
  if (!graze) f.push({ t: 'c', x0: mx - 1, y0: my + b, x1: 80, y1: 38 + b, r0: 0.7, r1: 0.7, part: 'leather', flat: true });
  // What is nearer than the rider's legs, drawn again over him: the near legs, the neck, mane and head, the bridle and
  // reins. Only his thigh and boot lie over the barrel.
  for (const o of f) {
    const near = ['leg', 'low', 'hoof', 'head', 'ear', 'eye', 'mane'].includes(o.part);
    o.fr = near || (o.part === 'body' && o.t === 'c') || (o.part === 'leather' && o.t === 'c' && Math.min(o.x0, o.x1) >= 78);
  }
  return f;
}

// The forms of a horse coming toward you (down) or going away (up), its middle on column 36.
function m2mEndForms(facing, gait, frame) {
  const f = [];
  const [ph] = M2M_GAITS[gait];
  // Seen end on a gallop shows in the body's big rise and fall, a moment with all four hooves off the ground (the
  // highest frame), the head stretched low and the tail streaming; a walk only nods.
  const gal = gait === 'gallop';
  const b = M2M_BOB[gait][frame] * (gal ? 2.6 : 1);
  const air = gal && frame === 1 ? 9 : 0;
  const sw = M2M_SWISH[frame] * (gait === 'stand' || gait === 'graze' ? 1 : 0.3);
  const graze = gait === 'graze';
  const tack = (y) => f.push({ t: 'e', cx: 36, cy: y + 1 + b, rx: 16.5, ry: 13, part: 'trim', flat: true, tack: true }, { t: 'e', cx: 36, cy: y + b, rx: 15.5, ry: 12, part: 'cloth', flat: true, tack: true },
    { t: 'e', cx: 36, cy: y - 2 + b, rx: 8.5, ry: 6.5, part: 'leather', flat: true, tack: true }, { t: 'e', cx: 36, cy: y - 3 + b, rx: 6.5, ry: 4.5, part: 'leather', flat: true, lit: 0.15, tack: true });
  const leather = (x0, y0, x1, y1) => f.push({ t: 'c', x0, y0: y0 + b, x1, y1: y1 + b, r0: 0.8, r1: 0.8, part: 'leather', flat: true });
  if (facing === 'down') {
    // Coming toward you: the rump and tail far off at the top, the back with the saddle, the broad chest with the two
    // forearms under it, and the head nearest, hanging in front of the chest between the legs, ears up.
    if (gal) f.push({ t: 'c', x0: 36, y0: 22 + b, x1: 36 + sw * 2, y1: 2 + b, r0: 4.5, r1: 2.5, part: 'tail' });
    else f.push({ t: 'c', x0: 36, y0: 18 + b, x1: 36 + sw * 0.6, y1: 28 + b, r0: 4.5, r1: 3.5, part: 'tail' });
    m2mLeg(f, 23, 62 + b, 116 - air, ph[3] + frame / 4, gait, true, false, false);
    m2mLeg(f, 49, 62 + b, 116 - air, ph[2] + frame / 4, gait, true, false, false);
    f.push({ t: 'e', cx: 36, cy: 50 + b, rx: 19, ry: 26, part: 'body', lit: 0.05 });
    f.push({ t: 'e', cx: 36, cy: 76 + b, rx: 17, ry: 10, part: 'body', lit: -0.05 });
    // What is nearer than the rider's lap, drawn again over him (scene2-rider-draw.js): the breast, the forelegs,
    // the neck and the head.
    f.front = f.length;
    f.push({ t: 'e', cx: 36, cy: 80 + b, rx: 15, ry: 9, part: 'body', lit: 0.1 });
    m2mLeg(f, 24, 80 + b, 132 - air, ph[1] + frame / 4, gait, false, false, true);
    m2mLeg(f, 48, 80 + b, 132 - air, ph[0] + frame / 4, gait, false, false, true);
    tack(46);
    const [h0, h1, my] = graze ? [104, 120, 125] : gal ? [102, 118, 122] : [96, 110, 114];
    f.push({ t: 'c', x0: 36, y0: 60 + b, x1: 36, y1: h0 - 2 + b, r0: 9, r1: 8, part: 'body', lit: 0.18 });
    f.push({ t: 'c', x0: 36, y0: h0 + b, x1: 36, y1: h1 + b, r0: 8, r1: 6.5, part: 'head', lit: 0.08 });
    f.push({ t: 'e', cx: 36, cy: my + b, rx: 6, ry: 5, part: 'head', lit: -0.12 });
    f.push({ t: 'c', x0: 30, y0: h0 + 1 + b, x1: 27, y1: h0 - 6 + b, r0: 2.6, r1: 1, part: 'ear', lit: 0.1 }, { t: 'c', x0: 42, y0: h0 + 1 + b, x1: 45, y1: h0 - 6 + b, r0: 2.6, r1: 1, part: 'ear', lit: 0.1 });
    f.push({ t: 'c', x0: 36, y0: h0 - 1 + b, x1: 36, y1: h0 + 3 + b, r0: 2.6, r1: 1.4, part: 'mane', lit: 0.35 });
    f.push({ t: 'e', cx: 29.5, cy: h0 + 4 + b, rx: 1.2, ry: 1.2, part: 'eye' }, { t: 'e', cx: 42.5, cy: h0 + 4 + b, rx: 1.2, ry: 1.2, part: 'eye' });
    f.push({ t: 'e', cx: 33.5, cy: my + 2 + b, rx: 0.9, ry: 0.9, part: 'eye' }, { t: 'e', cx: 38.5, cy: my + 2 + b, rx: 0.9, ry: 0.9, part: 'eye' });
    leather(29.5, h1 - 3, 42.5, h1 - 3);
    leather(29.5, h0 + 1, 30, h1 - 3);
    leather(42.5, h0 + 1, 42, h1 - 3);
    if (!graze) { leather(30, h1, 25, 56); leather(42, h1, 47, 56); }
    return f;
  }
  // Going away: the head and ears far off at the top, the neck with the mane along it, the back and saddle, and the
  // round haunches nearest with the tail hanging between them over the hind legs.
  // The head and ears reach 36 pixels higher than the rest, so they rise over the rider's shoulders.
  const hd = (graze ? 8 : 0) - 36;
  f.push({ t: 'c', x0: 29, y0: 15 + hd + b, x1: 26, y1: 7 + hd + b, r0: 2.8, r1: 1, part: 'ear' }, { t: 'c', x0: 43, y0: 15 + hd + b, x1: 46, y1: 7 + hd + b, r0: 2.8, r1: 1, part: 'ear' });
  f.push({ t: 'c', x0: 36, y0: 26 + b, x1: 36, y1: 15 + hd + b, r0: 7, r1: 6.5, part: 'head' });
  m2mLeg(f, 26, 54 + b, 114 - air, ph[1] + frame / 4, gait, true, false, true);
  m2mLeg(f, 46, 54 + b, 114 - air, ph[0] + frame / 4, gait, true, false, true);
  f.push({ t: 'c', x0: 36, y0: 46 + b, x1: 36, y1: 20 + hd * 0.6 + b, r0: 11, r1: 7.5, part: 'body', lit: 0.1 });
  f.push({ t: 'c', x0: 36, y0: 44 + b, x1: 36, y1: 17 + hd + b, r0: 3, r1: 2.4, part: 'mane' });
  f.push({ t: 'e', cx: 36, cy: 64 + b, rx: 19, ry: 22, part: 'body' });
  // What is nearer than the rider's seat, drawn again over him: the hind legs, the haunches and the tail.
  f.front = f.length;
  m2mLeg(f, 25, 98 + b, 132 - air, ph[3] + frame / 4, gait, false, false, false);
  m2mLeg(f, 47, 98 + b, 132 - air, ph[2] + frame / 4, gait, false, false, false);
  f.push({ t: 'e', cx: 36, cy: 86 + b, rx: 18, ry: 13, part: 'body', lit: 0.04 }, { t: 'e', cx: 30, cy: 85 + b, rx: 9, ry: 10, part: 'body', lit: 0.16 });
  tack(58);
  f.push({ t: 'e', cx: 36, cy: 63 + b, rx: 7, ry: 2.5, part: 'leather', flat: true, lit: 0.3 });
  if (gait === 'gallop') f.push({ t: 'c', x0: 36, y0: 80 + b, x1: 36 + sw * 3, y1: 122 + b, r0: 5.5, r1: 2.5, part: 'tail' });
  else f.push({ t: 'c', x0: 36, y0: 78 + b, x1: 36 + sw * 0.4, y1: 100 + b, r0: 4, r1: 5.5, part: 'tail' }, { t: 'c', x0: 36 + sw * 0.4, y0: 100 + b, x1: 36 + sw, y1: 124 + b, r0: 5.5, r1: 2.5, part: 'tail' });
  return f;
}

// A horse's frame for a rider's kind: { c, w, h, ax, ay } in units (ax, ay the anchor inside it).
function m2mHorseFrame(kind, facing, gait, frame) {
  const [coatName, cloth] = M2M_MOUNT[kind] ?? M2M_MOUNT.ranger;
  const key = `${kind}|${facing}|${gait}|${frame}`;
  let art = m2mHorseArt.get(key);
  if (!art) {
    const [w, h, ax, ay] = M2M_HFRAME[facing];
    const P = m2mHorsePal(M2M_COATS[coatName], cloth);
    let forms = facing === 'side' ? m2mSideForms(gait, frame) : m2mEndForms(facing, gait, frame);
    let front = null;
    if (facing !== 'side') {
      // End on, a horse is half again as wide as its rider: the forms are laid out narrow and spread here about the
      // middle, and moved down by the room the frame keeps above them.
      const k = 1.4;
      const top = facing === 'up' ? 36 : 0;
      const X = (x) => 44 + (x - 36) * k;
      const at = forms.front;
      forms = forms.map((o) => (o.t === 'e' ? { ...o, cx: X(o.cx), cy: o.cy + top, rx: o.rx * k }
        : { ...o, x0: X(o.x0), x1: X(o.x1), y0: o.y0 + top, y1: o.y1 + top, r0: o.flat ? o.r0 : o.r0 * 1.25, r1: o.flat ? o.r1 : o.r1 * 1.25 }));
      forms.front = at;
    }
    // Shrink every form toward the anchor (small parts keep at least a pixel's radius).
    const front0 = forms.front;
    const K = M2M_K;
    const r = (v) => (v < 1.5 ? Math.max(0.8, v * K) : v * K);
    forms = forms.map((o) => (o.t === 'e' ? { ...o, cx: ax + (o.cx - ax) * K, cy: ay + (o.cy - ay) * K, rx: r(o.rx), ry: r(o.ry) }
      : { ...o, x0: ax + (o.x0 - ax) * K, x1: ax + (o.x1 - ax) * K, y0: ay + (o.y0 - ay) * K, y1: ay + (o.y1 - ay) * K, r0: r(o.r0), r1: r(o.r1) }));
    if (facing !== 'side') front = m2mPaintHorse(w, h, forms.filter((o, i) => i >= front0 && !o.tack), P);
    else front = m2mPaintHorse(w, h, forms.filter((o) => o.fr), P);
    art = { c: m2mPaintHorse(w, h, forms, P), front, w: w / 4, h: h / 4, ax: ax / 4, ay: ay / 4 };
    m2mHorseArt.set(key, art);
  }
  return art;
}
// Draws a horse with its hooves on row y, centred on x, facing left, right, up or down, its shadow under it.
function m2mDrawHorse(g, kind, x, y, face, gait, frame, frontOnly = false) {
  const facing = face === 'left' || face === 'right' ? 'side' : face;
  const art = m2mHorseFrame(kind, facing, gait, frame);
  const [px, py] = [Math.round(x * 4) / 4, Math.round(y * 4) / 4];
  const side = facing === 'side';
  if (frontOnly) { if (art.front) g.drawImage(art.front, px - art.ax, py - art.ay, art.w, art.h); return; }
  const a = g.globalAlpha;
  g.globalAlpha = a * 0.3;
  g.drawImage(m2Foot(), px - (side ? 12 : 7.5), py - (side ? 1.5 : 6), side ? 24 : 15, side ? 3 : 7.5);
  g.globalAlpha = a;
  g.save();
  if (face === 'left') { g.translate(2 * px, 0); g.scale(-1, 1); }
  g.drawImage(art.c, px - art.ax, py - art.ay, art.w, art.h);
  g.restore();
  // Going away at a gallop, puffs of dust kicked up behind its hind hooves, drifting toward you and swelling.
  if (gait === 'gallop' && facing === 'up') {
    g.globalAlpha = a * 0.4;
    g.fillStyle = '#d2c29c';
    for (let k = 0; k < 3; k += 1) {
      const t = (frame + k * 1.3) % 4;
      const [cx, cy, r] = [px + (k - 1) * 4.5 + (t % 2 ? 0.75 : -0.75), py + 0.5 + t * 1.6, 0.75 + t * 0.35];
      const q = (v) => Math.round(v * 4) / 4;
      g.fillRect(q(cx - r), q(cy - r * 0.5), q(r * 2), q(r));
      g.fillRect(q(cx - r * 0.5), q(cy - r * 0.9), q(r), q(r * 1.8));
    }
    g.globalAlpha = a;
  }
}
