// scene2-body-man.js: the Men of Rohan (Edoras) and of Gondor's fields on the map from above, 29 units tall: hair to
// the shoulders with a swept fringe, a tunic in the worker's colour to mid-thigh with a stitched yoke and a leather
// belt with a brass buckle, dark trousers, boots, and a green riding cloak pinned at the throat with a gold brooch (the
// horse-folk's colour). From behind the cloak covers the back; in profile it hangs from the shoulder.

const M2B_MAN = {
  w: 26, h: 33, fx: 13, fy: 32, H: 116, neck: 43, waist: 70, hip: 80, shW: 16, waW: 12.5, hipW: 14,
  legW: 3.6, legGap: 5.5, footW: 4.2, footH: 5, face: { cy: 24, rx: 15, ry: 15.5, eye: 2, gap: 6 }, headFwd: 2,
  arm: { len: 29, rad: 4.2, at: 3, hand: 2.8, taper: 0.5 },
  robe: { end: 92, hem: 15.5, front: 11, back: 10, short: true },
  R: { body: M2B.cloth, sleeve: M2B.cloth, legs: 'ACIJKL', boot: M2B.leather },
  mats: { ACIJKL: ['#4a4038', '#2f2924'], MNPQRS: ['#3f7a3a', '#2a5428'] },
  depthF: 10, depthB: 9, mouth: 31, tool: 'hammer', rides: true,
  robeTex: m2bFolds([], 0.3),
  behind(G, K) { if (K.facing !== 'up' && !K.ride) m2bCloak(G, K, 100, 15, 18, 'MNPQRS'); },
  head(G, K) {
    m2bHead(G, K, {
      ears: 'round',
      hair: { out: 3, lift: 2, fringe: 4, side: 9, fall: 15, fallW: 16, k: 3, part: -4, sweep: 0.3 },
      face: { brow: 'a' },
    });
  },
  torso(G, K) {
    if (K.facing === 'up') {
      if (!K.ride) m2bCloak(G, K, 100, 15, 18, 'MNPQRS');
      else m2bBelt(G, K, K.waist - 2, 12.5);
      return;
    }
    if (K.side) { m2bBelt(G, K, K.waist - 2, 12); return; }
    // The yoke stitched across the chest and the placket down to the belt.
    m2bRows(G, K.neck, K.neck + 5, (r) => [Math.round(K.cx - 13 + (r - K.neck)), Math.round(K.cx + 12 - (r - K.neck))], M2B.cloth, { open: 't', bias: 0.25 });
    for (let r = K.neck + 5; r < K.waist - 2; r += 1) m2bAt(G, r, K.cx - 1, r % 4 === 1 ? 'y' : '1');
    m2bBelt(G, K, K.waist - 2, 12.5);
    if (!K.ride) m2bPut(G, K.neck - 1, K.cx - 3, ['.GyyG.', 'GyYYgG', 'GgyygG', '.GGGG.']);
  },
};
m2bPeople('man', M2B_MAN);
