// sprites-eagle-fly.js: the Great Eagle's head, scroll, talons and wings, and its frames in flight (scene-eagle.js), in
// 32-bit on sprites-eagle.js's kit. The head is painted over the frame's silhouette: its gold crown and nape, long
// pointed hackles flowing down the neck, and the face hand-drawn at full size facing left (the heavy brow over a dark
// eye with a glint, the cere with its nostril, the yellow beak lit along its ridge and hooked down to a horn tip). A wing is laid feather by feather along a spine
// (shoulder, wrist, tip): the flight feathers hanging from it toward the tail or the back (the secondaries along the
// arm, the primaries fanned from the wrist, the outer ones parted into fingers), then the greater coverts over their
// bases and the lesser coverts along the lit leading edge. In flight the eagle is seen from below, wings spread about
// 64 units (half a realm): the body and breast, the tail fanned, the feathered legs, the scroll across its talons, the
// head turned the way it flies, and each wing set by its beat (raised, half raised, level in a glide, swept down); a
// bank tips one wing up and the other down, and a flare raises both with the legs reaching down. The right wing is a
// step deeper in shade, since the light comes from the left. Loaded after sprites-eagle.js. No image files.

// The face, 28 by 18 pixels, facing left, drawn over the head the frame has already shaded (painted from shapes by
// face.py): the heavy brow over a dark eye with an amber iris and a glint, the darker cheek, the lores, the cere with
// its nostril, the yellow beak lit along its ridge and hooked down to a dark horn tip, the lower mandible and the gape.
// The eye's centre is at (20.6, 7.4).
const EAGLE_FACE = [
  '............................',
  '...............dddddddd.....',
  '.............ddbbbbbbbbb....',
  '.........EEEEDDbbbbbbbbbbb..',
  '.......EFFFDDDDDaaaaaaaaab..',
  '.....HHDDDDDDDDDCbaaaaaaac..',
  '....IHHDDDDDDDABCbXX*KXXccc.',
  '....IHDDDDDDDDBDCbXKKKXXccc.',
  '...JHHDDDDDDDDDDCbXXKKXXdccc',
  '..HHHHCCCCCCCCDDCbeXXXeddcc.',
  '..HHHHCCCCCCCCDDCbdddddddcc.',
  '..HHHHCCBBBBBBBBBAAAddddcc..',
  '..HHBBBBB..CCCCCC.cdddcc....',
  '..HH.CCCCBBBBBBBB...........',
  '..GH.BBBB...................',
  '...G........................',
  '............................',
  '............................',
];
// The head over its shaded silhouette (hx, hy its centre in units, P to pixels, face -1 left or 1 right): the crown and
// nape gold, their edge running down and back from the brow; long pointed hackles from the back of the head, the
// upper ones lying back over the crown and the lower ones flowing along flow down the neck onto the shoulders, each of
// its own length so their tips blend into the brown feathers they overlap; and the face, its eye before the centre.
function eagleHeadPaint(G, M, P, hx, hy, face, [fx, fy]) {
  const [cx, cy] = P(hx, hy);
  const b = -face;
  eagleClip = M;
  eagleFill(G, M, 'gold', 3, (x, y) => {
    const [dx, dy] = [(x + 0.5 - cx) / 4, (y + 0.5 - cy) / 4];
    return (dx / 4.3) ** 2 + (dy / 3.6) ** 2 <= 1 && dy + 0.6 - 0.55 * dx * b < 0;
  });
  const n = Math.hypot(fx, fy);
  for (let i = 13; i >= 0; i -= 1) {
    const t = i / 13;
    const a = ((-100 + 118 * t) * Math.PI) / 180;
    const [bx, by] = [hx + b * Math.cos(a) * 3.1, hy + Math.sin(a) * 2.7];
    const [dx, dy] = [b * (1 - t) + (fx / n) * t, 0.25 * (1 - t) + (fy / n) * t];
    const L = (2 + 3.6 * t + ((i * 7) % 3) * 0.55) / Math.hypot(dx, dy);
    eagleFeather(G, ...P(bx, by), ...P(bx + dx * L, by + dy * L), 5.6, 'gold', i % 3 ? 3 : 4, { shaft: true });
  }
  eagleClip = null;
  const rows = face < 0 ? EAGLE_FACE : eagleFlip(EAGLE_FACE);
  const [ex, ey] = P(hx + face * 0.8, hy - 0.2);
  eaglePaste(G, rows, Math.round(ex - (face < 0 ? 20.6 : 7.4)), Math.round(ey - 7.4));
}

// A small rolled scroll lying across, its left end at (x0, y0) at its top, len by thick pixels: the parchment lit along
// its top and shaded under, its left end curled, and a red ribbon round it with a lit edge.
function eagleScroll(G, x0, y0, len, thick) {
  const [x, y] = [Math.round(x0), Math.round(y0)];
  for (let r = 0; r < thick; r += 1) {
    const k = r === 0 ? 4 : r < thick * 0.45 ? 3 : r < thick - 1 ? 2 : 1;
    for (let c = 2; c < len; c += 1) eagleSet(G, x + c, y + r, eagleStep('parch', k));
    for (let c = 0; c < 2; c += 1) eagleSet(G, x + c, y + r, eagleStep('parch', r === 0 || r === thick - 1 ? 1 : c ? 3 : 2));
  }
  eagleSet(G, x + 1, y + Math.floor(thick / 2), eagleStep('parch', 1));
  const rx = x + Math.round(len * 0.58);
  for (let r = 0; r < thick; r += 1) {
    eagleSet(G, rx, y + r, eagleStep('red', r ? 3 : 4));
    eagleSet(G, rx + 1, y + r, eagleStep('red', r ? 2 : 3));
  }
  eagleSet(G, rx + 2, y + thick, eagleStep('red', 2));
}
// A foot: toes from the ankle (in pixels) to each tip, yellow, lit along the top and ringed with scales, each ending
// in a dark talon that arches out from the foot and down to its point.
function eagleFoot(G, ax, ay, tips) {
  for (const [tx, ty, cx, cy] of tips) {
    eagleFeather(G, ax, ay, tx, ty, 5.5, 'yellow', 3);
    for (const f of [0.45, 0.7]) eagleSet(G, Math.round(ax + (tx - ax) * f), Math.round(ay + (ty - ay) * f), eagleStep('yellow', 1));
    const len = Math.hypot(cx - tx, cy - ty);
    let [nx, ny] = [-(cy - ty) / len, (cx - tx) / len];
    if (nx * (tx - ax) + ny * (ty - ay) < 0) [nx, ny] = [-nx, -ny];
    const [mx, my] = [(tx + cx) / 2 + nx * len * 0.3, (ty + cy) / 2 + ny * len * 0.3];
    eagleFeather(G, tx, ty, mx, my, 3.6, 'horn', 1);
    eagleFeather(G, mx, my, cx, cy, 2.6, 'horn', 1);
  }
}

// A wing from its shoulder (sx, sy, pixels), its arm at angle a1 and hand at a2 (degrees above level, out to side -1
// for left or 1 for right), arm and hand arm and hand pixels long, its feathers hanging toward (tx, ty), tone shifting
// its shade.
function eagleWing(G, sx, sy, a1, a2, side, arm, hand, tx, ty, tone = 0) {
  const dir = (a) => [side * Math.cos((a * Math.PI) / 180), -Math.sin((a * Math.PI) / 180)];
  const hang = ([dx, dy]) => (-dy * tx + dx * ty > dy * tx - dx * ty ? [-dy, dx] : [dy, -dx]);
  const [d1, d2] = [dir(a1), dir(a2)];
  const wx = sx + d1[0] * arm;
  const wy = sy + d1[1] * arm;
  const along = (f) => (f < 1 ? [sx + d1[0] * arm * f, sy + d1[1] * arm * f] : [wx + d2[0] * hand * (f - 1), wy + d2[1] * hand * (f - 1)]);
  const o = { tone, tip: 0.2, shaft: true };
  // The primaries, from the outermost finger in, fanning from along the hand to hanging behind it.
  for (let i = 9; i >= 0; i -= 1) {
    const [bx, by] = along(1 + 0.05 + i * 0.06);
    const t = i / 9;
    const h = hang(d2);
    const v = [h[0] * (1 - t) + d2[0] * t * 1.15, h[1] * (1 - t) + d2[1] * t * 1.15];
    const n = Math.hypot(...v);
    const L = hand * (0.62 + 0.3 * t);
    eagleFeather(G, bx, by, bx + (v[0] / n) * L, by + (v[1] / n) * L, i > 4 ? 6 : 8, 'dark', 3, o);
  }
  // The secondaries along the arm, from the wrist in, leaning a little toward the body.
  const h1 = hang(d1);
  for (let i = 9; i >= 0; i -= 1) {
    const [bx, by] = along(0.08 + i * 0.1);
    const L = hand * (0.58 + 0.05 * (((i * 7) % 3) - 1));
    eagleFeather(G, bx, by, bx + (h1[0] - d1[0] * 0.18) * L, by + (h1[1] - d1[1] * 0.18) * L, 8, 'brown', 3, o);
  }
  // The greater coverts over the flight feathers' bases, staggered and of uneven length, then two rows of lesser
  // coverts along the leading edge, lit.
  for (let i = 16; i >= 0; i -= 1) {
    const f = i * 0.075;
    const [bx, by] = along(f);
    const h = hang(f < 1 ? d1 : d2);
    const L = 12 + ((i * 5) % 4) * 1.5;
    eagleFeather(G, bx + h[0] * (i % 2) * 2, by + h[1] * (i % 2) * 2, bx + h[0] * L, by + h[1] * L, 10, 'brown', 3, { tone });
  }
  for (const [row, k] of [[1, 3], [0, 4]]) {
    for (let i = 15; i >= 0; i -= 1) {
      const f = i * 0.08 + row * 0.04;
      const [bx, by] = along(f);
      const h = hang(f < 1 ? d1 : d2);
      eagleFeather(G, bx - h[0] * 2 + h[0] * row * 3, by - h[1] * 2 + h[1] * row * 3, bx + h[0] * (6 + row * 3), by + h[1] * (6 + row * 3), 8, 'brown', k, { tone });
    }
  }
}

// Each beat's arm and hand angles for the left wing and the right; a flare reaches the legs down.
const EAGLE_BEAT = { up: [[52, 74], [52, 74]], mid: [[24, 30], [24, 30]], level: [[6, -4], [6, -4]], down: [[-22, -40], [-22, -40]],
  bank: [[30, 34], [-14, -28]], flare: [[60, 86], [60, 86]] };
// A flight frame, facing right (face 1) or left: its rows, and its anchor at the shoulders' centre, in pixels. Behind,
// the tail fanned and the wings; then one silhouette of body, thick neck, head and throat, filled and lit as a whole,
// with the breast's feathers and the legs' inside its outline; the scroll and talons; and the head (eagleHeadPaint),
// turned the way it flies, its hackles flowing down onto the shoulders.
function eagleFly(frame, face) {
  const [G, M] = [eagleGrid(272, 200), eagleGrid(272, 200)];
  const [ax, ay] = [136, 104];
  const P = (x, y) => [ax + x * 4, ay + y * 4];
  const [[l1, l2], [r1, r2]] = EAGLE_BEAT[frame] ?? EAGLE_BEAT.level;
  const low = frame === 'flare' ? 1.5 : 0;
  for (let i = -4; i <= 4; i += 1) eagleFeather(G, ...P(i * 0.25, 7), ...P(i * 1.25, 17), 11, 'dark', 3, { tip: 0.22, shaft: true });
  eagleWing(G, ...P(3.2, -0.5), r1, r2, 1, 42, 48, 0, 1, -1);
  eagleWing(G, ...P(-3.2, -0.5), l1, l2, -1, 42, 48, 0, 1, 0);
  const [hx, hy] = [face * 1.3, -5.4];
  eagleDisc(M, ...P(0, 3), 17, 27);
  eagleSpine(M, [[...P(0, -0.5), 15], [...P(hx * 0.7, -3.4), 14]]);
  eagleDisc(M, ...P(hx, hy), 16.4, 13.6);
  eagleDisc(M, ...P(hx + face * 1.6, -3.2), 9, 9);
  for (const s of [-1, 1]) eagleDisc(M, ...P(s * 1.9, 8.4 + low / 2), 8, 10);
  eagleFill(G, M, 'brown', 3);
  eagleClip = M;
  for (let row = 0; row < 8; row += 1) {
    for (let col = -3; col <= 3; col += 1) {
      const [x, y] = [col * 1.45 + (row % 2) * 0.72, 8.4 - row * 1.35];
      const j = eagleRnd(row * 13 + col * 5 + 40) - 0.5;
      eagleFeather(G, ...P(x + j * 0.5, y - 2.2), ...P(x - j * 0.3, y + 0.4), 9.5, 'brown', 3, { soft: true });
    }
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i += 1) eagleFeather(G, ...P(s * (1.4 + i * 0.6), 6.4), ...P(s * (1.7 + i * 0.6), 10.4 + low), 10, 'tan', 2, { soft: true });
  eagleClip = null;
  eagleScroll(G, ...P(-2.6, 10.6 + low), 22, 6);
  for (const s of [-1, 1]) eagleFoot(G, ...P(s * 1.6, 9.8 + low), [[...P(s * 0.9 - 0.6, 11 + low), ...P(s * 0.9 - 0.9, 12.2 + low)], [...P(s * 2.3, 11 + low), ...P(s * 2.2, 12.3 + low)]]);
  eagleHeadPaint(G, M, P, hx, hy, face, [-face * 0.2, 1]);
  return { rows: eagleSelout(G), ax, ay };
}
// Draws the flying eagle with its shoulders at (x, y), in frame (up, mid, level, down, bank or flare), facing right
// (face 1) or left (-1), by night in the night palette; mirror turns a bank to the right into one to the left.
function drawEagleFlying(g, x, y, frame, face = 1, night = false, mirror = false) {
  const f = mirror ? -face : face;
  if (!mirror) return eagleBlit(g, `fly:${frame},${f}`, () => eagleFly(frame, f), x, y, night);
  g.save();
  g.translate(2 * x, 0);
  g.scale(-1, 1);
  eagleBlit(g, `fly:${frame},${f}`, () => eagleFly(frame, f), x, y, night);
  g.restore();
}
