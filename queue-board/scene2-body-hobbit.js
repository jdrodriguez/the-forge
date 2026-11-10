// scene2-body-hobbit.js: the hobbit of the Shire on the map from above, 20 units tall, stout and round: a big head under
// a mop of curls with the ears peeking through and rosy cheeks, a white shirt with full sleeves under a waistcoat in
// the worker's colour with brass buttons, a round belly, breeches buckled at the knee, and big bare feet with curly hair
// on top. From behind the curls cover the head down to the collar; in profile the belly rounds out in front.

const M2B_HOBBIT = {
  w: 22, h: 25, fx: 11, fy: 24, H: 80, neck: 37, waist: 56, hip: 62, shW: 14, waW: 14, hipW: 14, bulge: 2.5,
  legW: 3.4, legGap: 5, footW: 5.5, footH: 4, face: { cy: 20, rx: 14.5, ry: 14, eye: 2, gap: 6 }, headFwd: 3,
  arm: { len: 20, rad: 3.8, at: 3, hand: 2.7, taper: 0.3 },
  R: { body: M2B.cloth, sleeve: M2B.cream, legs: 'ACIJKL', boot: M2B.skin, hips: 'ACIJKL' },
  mats: { ACIJKL: ['#7a5a3a', '#57402a'] },
  depthF: 13, depthB: 9, mouth: 30, seatK: 0.6, shadow: 9, neckW: 4,
  bodyTex: m2bFolds([], 0.3),
  head(G, K) {
    m2bHead(G, K, {
      ears: 'round',
      hair: { out: 4, lift: 3, fringe: 3, side: 7, fall: 9, fallW: 15, curls: true },
      face: { brow: 'a', smile: true },
    });
  },
  // A bare foot: the shin below the breeches' buckled cuff, the broad foot with its toes, and curls on top.
  foot(G, K, fr, fc, s, bias) {
    const up = K.facing === 'up';
    m2bLimb(G, fr - 9, fc, fr - 3, fc, 2.6, M2B.skin, { bias: bias + 0.1 });
    m2bBall(G, fr - 2.5, fc + s * 1.5, 2.8, 5.5, M2B.skin, { bias: bias + 0.15 });
    if (!up) m2bPut(G, fr - 2, Math.round(fc + s * 1.5) - 4, ['.r.r.r.r.']);
    m2bPut(G, fr - 5, Math.round(fc) - 2, up ? ['bcb', 'abca'] : ['cdcb', 'bccba']);
  },
  footSide(G, K, fr, fc, bias) {
    m2bLimb(G, fr - 9, fc, fr - 3, fc, 2.6, M2B.skin, { bias: bias + 0.1 });
    m2bBall(G, fr - 2.5, fc + 2.5, 2.8, 6, M2B.skin, { bias: bias + 0.15 });
    m2bPut(G, fr - 5, Math.round(fc), ['cdcb', 'bccbaa']);
  },
  torso(G, K) {
    if (K.facing === 'up') return;
    if (K.side) {
      m2bPut(G, K.neck, K.cx + 6, ['UVWWX', 'XVWX', 'XWX']);
      for (let r = K.neck + 5; r < K.waist; r += 4) m2bAt(G, r, K.cx + 11, 'y');
      return;
    }
    // The shirt's collar and front between the waistcoat's edges, and the brass buttons down one edge.
    m2bRows(G, K.neck, K.waist + 1, (r) => {
      const t = (r - K.neck) / (K.waist - K.neck);
      const w = 4 - t * 3;
      return [Math.round(K.cx - w), Math.round(K.cx + w) - 1];
    }, M2B.cream, { open: 'b', bias: 0.2 });
    m2bPut(G, K.neck - 1, K.cx - 6, ['XWWVX..XVVUX', '.XWWVXXVUUX.', '..XWVX.XVX..']);
    for (let r = K.neck + 5; r < K.waist; r += 4) m2bPut(G, r, K.cx + 3, ['Gy', 'gG']);
    // The breeches' waistband.
    m2bRows(G, K.waist - 1, K.waist + 1, () => [Math.round(K.cx - 14), Math.round(K.cx + 13)], 'ACIJKL', { ny: -0.6 });
  },
};
m2bPeople('hobbit', M2B_HOBBIT);
