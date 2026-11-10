// scene2-body-ent.js: Treebeard on the map from above, 56 units tall, the biggest walker on the map and plainly a
// walking tree. His skin is grey-brown bark with long vertical furrows that wander, knots, and a lighter bark rim on his
// lit side. His arms are branches held out from the trunk, each forking into a side branch with a leaf tuft and
// ending in spread twig fingers. A long beard of grey-green moss hangs from his chin in ragged strands. A crown of
// branches with leaf clusters breaks his outline above the head, and he stands on spreading roots. As he strides his
// trunk and crown rock from side to side (forward in profile) and his arms swing wide. The worker's skin keys become
// bark (a ramp over them), so his face and hands are bark too.

// Bark's grain: furrows down the trunk that wander a little, a lit ridge beside each, and a fainter seam between.
const m2bBark = (r, c) => {
  const w = Math.round(Math.sin(r * 0.11 + Math.floor(c / 6) * 1.9) * 1.4);
  const k = (((c + w) % 6) + 6) % 6;
  return k === 0 ? -0.5 : k === 1 ? 0.2 : k === 3 ? -0.14 : 0;
};
// The arms: branches held out from the trunk, hands well clear of it, swinging wide on the stride.
const M2B_ENT_ARMS = {
  hang: [[0.45, 9], [0.86, 16]], fore: [[0.42, 6], [0.78, 9]], back: [[0.45, 12], [0.82, 22]],
  sHang: [[0.5, 3], [0.92, 7]], sFore: [[0.45, 9], [0.74, 24]], sBack: [[0.46, -7], [0.8, -18]],
};
// A cluster of leaves: three overlapping tufts, lit and shaded, so its edge is ragged.
function m2bLeaves(G, r, c, rad) {
  m2bBall(G, r + rad * 0.3, c - rad * 0.6, rad * 0.7, rad * 0.8, 'Zfhl,`', { tex: m2bCurls, bias: -0.15 });
  m2bBall(G, r + rad * 0.2, c + rad * 0.7, rad * 0.65, rad * 0.75, 'Zfhl,`', { tex: m2bCurls, bias: -0.1 });
  m2bBall(G, r - rad * 0.3, c, rad * 0.75, rad * 0.85, 'Zfhl,`', { tex: m2bCurls, bias: 0.1 });
}
const M2B_ENT = {
  w: 50, h: 64, fx: 25, fy: 63, H: 224, neck: 64, waist: 124, hip: 140, shW: 28, waW: 23, hipW: 26,
  legW: 8, legW0: 12, legGap: 12, footW: 11, footH: 8, bulge: 3, face: { cy: 34, rx: 18, ry: 25, eye: -2, gap: 9 }, headFwd: 3,
  arm: { len: 86, rad: 7.5, at: 6, hand: 5.5, taper: 3 },
  R: { body: 'MNPQRS', sleeve: 'MNPQRS', legs: 'MNPQRS', boot: 'MNPQRS', hips: 'MNPQRS', hand: 'MNPQRS' },
  mats: { MNPQRS: ['#857358', '#4e4032'], pqrstu: ['#8e7c5e', '#584834'], oabcde: ['#98aa76', '#566444'], 'Zfhl,`': ['#5e9c3c', '#2c5a22'],
    j: '#4a2c14', i: '#8bbf5a', w: '#d8d4a8', x: '#9a9a78' },
  depthF: 22, depthB: 20, mouth: 56, neckW: 10, seatK: 0.4, shadow: 20, headU: 60, sleepU: 46,
  rim: { M: 'R', p: 't', o: 'd', Z: 'l' },
  bodyTex: m2bBark, backTex: m2bBark, hipTex: m2bBark, legTex: m2bBark, hipOpen: 'tb',
  tools: { quill: 'staff', staff: 'staff' },
  armPose: (name, L) => M2B_ENT_ARMS[name]?.map(([r, c]) => [r * L, c]),
  // He rocks side to side as he strides (from behind and in front) and leans into each stride in profile.
  rock: (K) => (K.side ? [6, 2, 6, 2] : [-7, 0, 7, 0])[K.frame * 2],
  head(G, K) {
    const f = m2bHead(G, K, { ears: null, hair: null, face: { brow: 'b', old: true, mouth: false, blush: false, nose: ['tr', 'tr', 'tsr', 'tsr', 'tssr', 'srrq', '.qq'] }, faceSide: { nose: ['ts', 'tsp', 'tssp', 'ssrp', 'srrp', 'pp'] } });
    if (K.stage === 'back') return;
    const top = f.cy - f.ry;
    // Furrows up the face's sides and brow.
    if (!K.side) for (let r = top + 3; r < f.cy + f.ry - 4; r += 1) for (const c of [-13, 12, -8, 8]) if ((r >> 2) % 3) m2bAt(G, r, f.cx + c + Math.round(Math.sin(r * 0.3)), 'q');
    // The crown: branches from the head's top forking out into leaf clusters, wider than the head.
    const crown = K.side ? [[-14, -8, 7], [-2, -18, 8], [-24, 2, 6], [8, -10, 5]] : [[-24, -2, 6.5], [-14, -14, 7], [0, -21, 8], [14, -14, 7], [24, -2, 6.5]];
    const sway = K.walk ? (K.side ? 3 : [-4, 0, 4, 0][K.frame * 2]) : 0;
    for (const [dc, dr, rad] of crown) {
      const [er, ec] = [top + dr + 3, f.cx + dc + sway];
      m2bLimb(G, top + 6, f.cx + dc * 0.25, er, ec, 2.2, 'MNPQRS', { tex: m2bBark }, 1.2);
      m2bLimb(G, (top + 6 + er) / 2, (f.cx + dc * 0.25 + ec) / 2, er - 4, ec + Math.sign(dc || 1) * 5, 1.2, 'MNPQRS', {}, 0.7);
    }
    for (const [dc, dr, rad] of crown) m2bLeaves(G, top + dr, f.cx + dc + sway, rad);
    if (K.facing === 'up') return;
    // The beard of grey-green moss from the chin, hanging past his chest in ragged strands.
    const len = K.side ? 54 : 70;
    // The moss: a mass from the cheeks over the chin, breaking into long locks of different lengths that hang past
    // his chest and sway with his stride; deep seams between locks, lit tufts.
    const moss = (r, c) => ((c * 3) % 7 === 0 ? -0.45 : (c * 3) % 7 === 1 ? 0.25 : 0) + ((r * 5 + c * 3) % 19 === 0 ? 0.4 : 0);
    const bx = K.side ? f.cx + f.rx * 0.55 : f.cx;
    const locks = K.side ? [[-6, 44], [-1, 58], [4, 40]] : [[-17, 34], [-12, 52], [-6, 66], [0, 74], [6, 62], [12, 48], [17, 30]];
    for (const [dc, n] of locks) {
      const sw = (sway * n) / 60;
      m2bLimb(G, f.eye + 10, bx + dc * 0.9, f.eye + n * 0.6, bx + dc + sw * 0.5, 4.2, M2B.hair, { tex: moss }, 3.2);
      m2bLimb(G, f.eye + n * 0.6, bx + dc + sw * 0.5, f.eye + n, bx + dc * 1.05 + sw, 3.2, M2B.hair, { tex: moss }, 1.2);
    }
    m2bBeard(G, f, { len: 26, w: K.side ? f.rx : f.rx + 3, from: 5, point: 2, lip: 5, moustache: 'bcddeddddedcb', tex: (r, c) => moss(r, c) - 0.18 });
    if (!K.side) for (const [r, c] of [[24, -6], [38, 4], [52, -2], [30, 9], [62, -7]]) m2bAt(G, f.eye + r, f.cx + c, 'Zl');
  },
  // From each hand a side branch forks off up the forearm with a tuft of leaves, and twig fingers spread from the hand,
  // each forking at its tip. Leaves sprout on the shoulders.
  over(G, K) {
    for (const { h, e, bias } of K.hands ?? []) {
      const [dr, dc] = [h[0] - e[0], h[1] - e[1]];
      const len = Math.hypot(dr, dc) || 1;
      const [ur, uc] = [dr / len, dc / len];
      const out = Math.sign(h[1] - K.cx) || 1;
      const [mr, mc] = [(e[0] + h[0]) / 2, (e[1] + h[1]) / 2];
      const [br, bc] = [mr - 12, mc + out * 10];
      m2bLimb(G, mr, mc, br, bc, 2.4, 'MNPQRS', { bias, tex: m2bBark }, 1.2);
      m2bLeaves(G, br - 2, bc + out * 2, 4.5);
      for (const k of [-0.6, -0.2, 0.2, 0.6]) {
        const [tr, tc] = [ur * Math.cos(k) - uc * Math.sin(k), ur * Math.sin(k) + uc * Math.cos(k)];
        const [fr, fc] = [h[0] + tr * 14, h[1] + tc * 14];
        m2bLimb(G, h[0] + ur * 3, h[1] + uc * 3, fr, fc, 1.7, 'MNPQRS', { bias }, 0.9);
        m2bLimb(G, fr - tr * 3, fc - tc * 3, fr + tr * 2 - tc * 3, fc + tc * 2 + tr * 3, 0.8, 'MNPQRS', { bias }, 0.6);
      }
    }
    const sway = K.walk ? (K.side ? 3 : [-4, 0, 4, 0][K.frame * 2]) : 0;
    if (K.facing !== 'side') for (const s of [-1, 1]) m2bLeaves(G, K.neck + 1, K.cx + s * 24 + sway, 5);
    else m2bLeaves(G, K.neck, K.cx - 6 + sway, 5);
  },
  torso(G, K) {
    // Knots in the trunk: a dark ring round a lit boss.
    const knots = K.facing === 'up' ? [[-20, 8], [30, -6]] : K.side ? [[-18, 0], [12, -4]] : [[-12, -14], [10, 12], [34, -4]];
    for (const [dr, dc] of knots) {
      m2bBall(G, K.waist + dr, K.cx + dc, 3.5, 2.8, 'MNPQRS', { bias: -0.6 });
      m2bBall(G, K.waist + dr - 0.5, K.cx + dc - 0.5, 1.6, 1.2, 'MNPQRS', { bias: 0.3, open: 'tblr' });
    }
  },
  // Feet of roots: a broad base splitting into five toes that spread and grip the ground.
  foot(G, K, fr, fc, s, bias) {
    m2bBall(G, fr - 4.5, fc + s, 5, 10.5, 'MNPQRS', { bias, tex: m2bBark });
    for (const d of [-2, -1, 0, 1, 2]) m2bLimb(G, fr - 4, fc + s + d * 3, fr - 0.5, fc + s + d * 6, 1.8, 'MNPQRS', { bias: bias - 0.1 }, 1);
  },
  footSide(G, K, fr, fc, bias) {
    m2bBall(G, fr - 4.5, fc + 3, 5, 11, 'MNPQRS', { bias, tex: m2bBark });
    for (const d of [-1, 0, 1, 2]) m2bLimb(G, fr - 3, fc + 3 + d * 4, fr - 0.5, fc + 4 + d * 6, 1.6, 'MNPQRS', { bias: bias - 0.1 }, 0.9);
  },
};
m2bPeople('ent', M2B_ENT);
