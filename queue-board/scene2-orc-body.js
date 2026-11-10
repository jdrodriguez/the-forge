// scene2-orc-body.js: how an orc of the map from above is put together for one facing, pose and frame
// (scene2-orc-art.js paints it). Places are given as (across, up) in units from the point between its feet. The far
// limbs are drawn first in a darker ramp, then the legs, the loincloth, the body, the shoulder plates, the head and the
// near arm with its blade. A goblin stoops: its big head hangs forward and low between its shoulders.

function m2eOrcBody(b, K, facing, pose, frame, torch, out) {
  const R = M2E_RAMP;
  const skin = R[K.skin];
  const body = R[K.body];
  const k = K.k;
  const p = (x, y) => [K.FX + x, K.FY - y];
  const walk = pose === 'walk';
  const bob = walk && frame % 1 ? 0.5 : 0;
  const kneel = pose === 'fall' ? K.hip * 0.45 : 0;
  // Leaning: back when staggered, forward on a strike; the upper body moves, the feet stay.
  const lean = (pose === 'stagger' ? -1.2 - frame * 0.5 : pose === 'attack' && frame === 1 ? 0.7 : pose === 'fall' ? 1.2 : 0) + (K.shield && pose !== 'stagger' ? 0.7 : 0);
  const up = (y) => y + bob - kneel;
  const mail = K.body === 'black' ? (px, py, s) => s - ((px + (py % 2) * 2) % 4 === 0 ? 1 : 0) : null;
  const stoop = facing === 'side' ? K.hunch : 0;
  const [tY, tRx, tRy] = K.torso;
  const [hY, hRx, hRy] = K.head;
  const headAt = facing === 'side' ? [stoop + 0.6 + lean * 1.3, up(hY) - (pose === 'stagger' ? 0.4 : 0)] : [lean * 0.4, up(hY) + (pose === 'stagger' ? 0.6 : 0)];
  const hand = { down: [K.shX + 0.7 * k, K.sh - 6.2 * k], up: [-(K.shX + 0.7 * k), K.sh - 6.2 * k], side: [1.2 * k, K.sh - 6 * k] }[facing];

  // Legs: hip, knee and foot, the knees bowed out; a stride or a raised foot when walking, folded when kneeling.
  const leg = (s, fx, fy, far = false) => {
    const hip = p(s * 1.3 * k, up(K.hip) + kneel * 0.4);
    const foot = p(fx, fy);
    const knee = p((s * 1.3 * k + fx) / 2 + (facing === 'side' ? 0.9 * k : s * K.bow * k), Math.max(fy + 0.6, up(K.knee) + kneel * 0.2));
    const Rl = far ? m2eDim(K.skin === 'gob' ? skin : R.hide) : K.skin === 'gob' ? skin : R.hide;
    m2eLimb(b, hip, knee, 1.15 * k, 1.0 * k, Rl);
    m2eLimb(b, knee, foot, 1.0 * k, 0.85 * k, Rl);
    m2eOval(b, foot[0] + (facing === 'side' ? 0.6 * k : 0), foot[1] + 0.2, 1.35 * k, 0.75 * k, far ? m2eDim(R.leather) : R.leather);
  };
  // An arm from the shoulder through the elbow to the hand, ending in a fist.
  const arm = (sh, el, hd, far = false) => {
    const Ra = far ? m2eDim(skin) : skin;
    m2eLimb(b, p(...sh), p(...el), 1.2 * k, 0.9 * k, Ra);
    m2eLimb(b, p(...el), p(...hd), 0.95 * k, 0.85 * k, Ra);
    m2eOval(b, ...p(...hd), 0.95 * k, 0.9 * k, Ra);
  };
  // The weapon arm's elbow and hand for this pose (x toward the arm's side, y up).
  const swing = (side) => {
    const [sx, sy] = side;
    if (pose === 'attack' && frame === 0) return [[sx - 1.2 * k, sy + 2.6 * k], [sx - 0.4 * k, sy + 5 * k], [-0.5, -1]];
    if (pose === 'attack' && frame === 0.5) return [[sx + 2 * k, sy + 1.4 * k], [sx + 4 * k, sy + 1.8 * k], [1, -0.35]];
    if (pose === 'attack') return [[sx + 2.2 * k, sy - 2 * k], [sx + 4.4 * k, sy - 3.6 * k], [0.8, 0.6]];
    if (pose === 'stagger') return [[sx - 1.6 * k, sy + 1.2 * k], [sx - 3 * k, sy + 1.4 * k], [-0.3, 1]];
    const s = walk ? (frame === 0 ? 1 : frame === 1 ? -1 : 0) : 0;
    return [[sx + 1.3 * k + s * 0.6, sy - 2.8 * k], [sx + 2.2 * k + s * 1.4, sy - 5.4 * k], [0.75, 0.7]];
  };

  if (facing === 'side') {
    const st = walk ? { 0: [2.2, -2], 0.5: [0.3, -0.3], 1: [-2, 2.2], 1.5: [-0.3, 0.3] }[frame] : pose === 'stagger' ? [-1.2, 1] : pose === 'fall' ? [1.5, -1.2] : [0.9, -0.8];
    const lift = walk && frame % 1 ? (frame === 0.5 ? [0.7, 0] : [0, 0.7]) : [0, 0];
    const sh = [lean + 0.2, up(K.sh)];
    // The far arm swings opposite the near one.
    const fs = walk ? (frame === 0 ? -1 : frame === 1 ? 1 : 0) : 0;
    arm([sh[0] - 0.8 * k, sh[1]], [sh[0] - 1 * k + fs * 0.6, sh[1] - 3 * k], [sh[0] - 0.4 * k + fs * 1.6, sh[1] - 6 * k], true);
    leg(-0.4, st[1] * k, lift[1], true);
    m2eOval(b, ...p(lean * 0.4 + 0.3, up(tY) - tRy * 0.35), tRx * 0.7, tRy * 0.65, body, { tex: mail });
    m2eOval(b, ...p(lean * 0.5 - 0.2, up(tY) + tRy * 0.25), tRx * 0.9, tRy * 0.75, body, { tex: mail });
    m2eOval(b, ...p(lean * 0.3 + 1.2 * k, up(K.hip) + 0.3), 1.8 * k, 1.6 * k, R.rag);
    leg(0.4, st[0] * k, lift[0]);
    m2eOrcHead(b, K, p(...headAt), 'side');
    if (K.shield && pose !== 'fall') m2eShield(b, ...p(lean + 2.4 * k, up(K.sh) - 4.2 * k), 3.3 * k, 0.55);
    m2eOval(b, ...p(sh[0] - 0.4 * k, sh[1] + 0.3), 1.9 * k, 1.5 * k, R.iron);
    const [el, hd, d] = swing([sh[0] + 0.4 * k, sh[1]]);
    if (pose === 'attack' && frame === 0) m2eBlade(b, K, p(...hd), [d[0], -d[1]], torch);
    arm([sh[0] + 0.4 * k, sh[1]], el, hd);
    if (!(pose === 'attack' && frame === 0)) m2eBlade(b, K, p(...hd), [d[0], -d[1]], torch);
    out.hand = p(...hd);
    return;
  }
  const back = facing === 'up';
  const m = back ? -1 : 1;
  // Down or up: which foot is forward (lower on the screen) and which is lifted.
  const st = walk ? { 0: [0.5, -0.9], 0.5: [0, 0], 1: [-0.9, 0.5], 1.5: [0, 0] }[frame] : [0, 0];
  const spread = pose === 'stagger' ? K.spread + 0.6 : K.spread;
  leg(-1, -spread * k, -st[0] * 0.6 + (st[0] < 0 ? 0.5 : 0));
  leg(1, spread * k, -st[1] * 0.6 + (st[1] < 0 ? 0.5 : 0));
  const shY = up(K.sh);
  const sx = K.shX + lean * 0.3;
  if (back) m2eOrcHead(b, K, p(...headAt), 'up');
  m2eOval(b, ...p(0, up(K.hip) + 0.4), 3.3 * k, 1.9 * k, R.rag);
  m2eOval(b, ...p(lean * 0.4, up(tY) - tRy * 0.35), tRx * 0.78, tRy * 0.65, body, { tex: mail });
  m2eOval(b, ...p(lean * 0.4, up(tY) + tRy * 0.25), tRx * 1.08, tRy * 0.72, body, { tex: mail });
  // A strap across the chest (a goblin's) or a belt (an Uruk's).
  if (!back && K.skin === 'gob') m2eLimb(b, p(-sx + 0.8, shY - 0.6), p(sx - 1.2, up(tY) - 2.4), 0.45, 0.45, R.rag, { line: false });
  if (K.skin === 'uruk') m2eLimb(b, p(-tRx + 0.8, up(K.hip) + 1.4), p(tRx - 0.8, up(K.hip) + 1.4), 0.6, 0.6, R.leather);
  for (const s of [-1, 1]) m2eOval(b, ...p(s * sx, shY + 0.2), 1.8 * k, 1.4 * k, R.iron);
  // The free arm hangs (or flings out when staggered); the weapon arm swings.
  const free = pose === 'stagger' ? [[-sx - 1.8 * k, shY - 1], [-sx - 3 * k, shY - 1.5]] : [[-sx - 0.6 * k, shY - 3 * k], [-sx - 0.4 * k + (walk ? (frame === 1 ? 0.4 : 0) : 0), shY - 6 * k + (walk && frame === 0 ? 0.5 : 0)]];
  arm([-sx * m, shY], [free[0][0] * m, free[0][1]], [free[1][0] * m, free[1][1]]);
  if (!back) m2eOrcHead(b, K, p(...headAt), 'down');
  if (K.shield && pose !== 'fall') {
    const at = p(-(sx + 1.4 * k) * m, shY - 4.6 * k);
    if (back) { m2eOval(b, ...at, 3.2 * k, 3.4 * k, M2E_RAMP.wood); m2eLimb(b, [at[0] - 2, at[1]], [at[0] + 2, at[1]], 0.4, 0.4, M2E_RAMP.leather); }
    else m2eShield(b, ...at, 3.4 * k, 0.9);
  }
  const [el, hd, d] = swing([sx, shY]);
  const [elm, hdm] = [[el[0] * m, el[1]], [hd[0] * m, hd[1]]];
  const dir = [d[0] * m, -d[1]];
  if (back || (pose === 'attack' && frame === 0)) m2eBlade(b, K, p(...hdm), dir, torch);
  arm([sx * m, shY], elm, hdm);
  if (!(back || (pose === 'attack' && frame === 0))) m2eBlade(b, K, p(...hdm), dir, torch);
  out.hand = p(...hdm);
  void hand;
}

// The head at c (its centre in frame units): a goblin's bald pate with its big ears, an Uruk's under a helm, the face
// toward you, away (the back of the head, a few lank hairs) or in profile to the right.
function m2eOrcHead(b, K, [cx, cy], facing) {
  const R = M2E_RAMP;
  const skin = R[K.skin];
  const [, rx, ry] = K.head;
  const gob = K.skin === 'gob';
  if (gob) {
    const ears = facing === 'side' ? [[-1, 1]] : [[-1, 1], [1, 1]];
    for (const [s] of ears) {
      const a = facing === 'side' ? [cx - rx * 0.4, cy - 0.4] : [cx + s * (rx - 0.8), cy - 0.3];
      const tip = facing === 'side' ? [cx - rx - 2.2, cy - 2.2] : [cx + s * (rx + 2.1), cy - 1.9];
      m2eLimb(b, a, tip, 1.0, 0.25, facing === 'up' ? skin : skin);
      m2eDot(b, (a[0] + tip[0]) / 2 - 0.25, (a[1] + tip[1]) / 2, skin[1], 2, 1);
    }
  }
  m2eOval(b, cx, cy, rx, ry, skin);
  if (!gob) {
    // The helm: a dark iron cap over the brow, with a ridge and a rim.
    m2eOval(b, cx, cy - ry * 0.35, rx + 0.35, ry * 0.85, R.iron, { clip: (x, y) => y < cy - ry * 0.1 + (facing === 'up' ? ry * 0.5 : 0) });
    // The ridge along the helm's crown, front to back.
    if (facing === 'side') m2eLimb(b, [cx - rx * 0.7, cy - ry * 0.75], [cx + rx * 0.5, cy - ry * 1.12], 0.45, 0.45, R.iron);
    else m2eLimb(b, [cx, cy - ry * 1.18], [cx, cy - ry * (facing === 'up' ? 0.2 : 0.55)], 0.45, 0.4, R.iron);
  }
  if (facing === 'down') {
    m2eOrcFace(b, K, cx, cy + (gob ? 0.4 : 0.6));
    if (!gob) m2eDot(b, cx - 0.25, cy - ry * 0.15, '#4e5565', 2, 7);
    if (gob) for (const [dx, dy] of [[-1.5, -3.6], [0.25, -3.9], [1.5, -3.5]]) m2eDot(b, cx + dx, cy + dy, skin[1], 1, 2);
  } else if (facing === 'up') {
    if (gob) for (const [dx, dy] of [[-1.75, -2.5], [-0.5, -3], [0.75, -2.8], [1.75, -2.2], [0, -1.2]]) m2eDot(b, cx + dx, cy + dy, '#1a1c14', 1, 4);
  } else {
    // Profile: the brow, an eye, the nose's hook and the jaw with its tusk.
    const dark = gob ? '#0c1410' : '#07050a';
    m2eDot(b, cx + rx * 0.35, cy - 0.8, dark, 6, 1);
    m2eDot(b, cx + rx * 0.45, cy - 0.45, gob ? '#ffd23a' : '#ff6a2a', 3, 2);
    m2eDot(b, cx + rx * 0.45 + 0.5, cy - 0.2, '#2a0800', 1, 1);
    m2eOval(b, cx + rx - 0.3, cy + 0.7, 0.9, 0.8, skin);
    m2eDot(b, cx + rx * 0.3, cy + 2, dark, 7, 1);
    m2eDot(b, cx + rx * 0.62, cy + 1.5, '#efe4c0', 1, 2);
    if (!gob) m2eDot(b, cx + rx * 0.55, cy - ry * 0.3, '#4e5565', 2, 6);
  }
}
