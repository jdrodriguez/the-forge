// scene2-body-captains.js: the Sentry's four captains on the map from above, 29 units tall, each as himself (riders:
// they have the ride pose). Aragorn a Ranger of the North in a weathered green-grey hooded cloak over a dark green
// jerkin, stubble, a sword at his hip. Faramir of Ithilien in green and brown, his cloak mottled like leaf and bark, his
// bow and quiver on his back, lit along his upper edge so he stands out in Ithilien's woods. Boromir of Gondor in a
// black surcoat with the White Tree over mail, a dark red cloak and the great horn on its baldric. Eomer a Marshal of
// Rohan in mail under a green tunic, a steel helm with a gold rim and a white horse-tail crest streaming back, his
// spear upright beside him.

// A hood about the head: from the front a cowl framing the face, from behind a point down the back, in profile a cowl
// whose point hangs behind the head. ramp is its cloth.
function m2bHood(G, K, f, ramp) {
  const tex = m2bFolds([], 0.3);
  const shell = (r, c) => ((c + 0.5 - f.cx + (K.side ? 2 : 0)) / (f.rx + 4)) ** 2 + ((r + 0.5 - f.cy + 2) / (f.ry + 5)) ** 2 <= 1;
  const opening = (r, c) => (K.side ? c > f.cx - 2 + Math.max(0, f.eye - 2 - r) && r > f.eye - 7 : ((c + 0.5 - f.cx) / (f.rx - 2)) ** 2 + ((r + 0.5 - f.cy - 3) / (f.ry - 1)) ** 2 <= 1);
  const normal = (r, c) => {
    const [nx, ny] = [(c + 0.5 - f.cx) / (f.rx + 4), (r + 0.5 - f.cy + 2) / (f.ry + 5)];
    return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
  };
  const inside = K.facing === 'up' ? shell : (r, c) => shell(r, c) && !opening(r, c);
  m2bVol(G, f.cy - f.ry - 8, f.cy + f.ry + 6, f.cx - f.rx - 6, f.cx + f.rx + 6, inside, normal, ramp, { tex });
  // The shadow inside the cowl over the brow.
  if (K.facing === 'down') m2bRows(G, f.eye - 6, f.eye - 5, (r) => [Math.round(f.cx - f.rx + 3 + (f.eye - 5 - r)), Math.round(f.cx + f.rx - 4)], ramp, { bias: -0.6, open: 'lr' });
  if (K.facing === 'up') m2bPoly(G, [[f.cy + 4, f.cx - 8], [f.cy + 4, f.cx + 8], [f.cy + 20, f.cx]], ramp, { tex });
  if (K.side) m2bPoly(G, [[f.cy - 4, f.cx - f.rx - 3], [f.cy + 10, f.cx - f.rx + 6], [f.cy + 16, f.cx - f.rx - 4]], ramp, { tex });
}

// A body for one captain: the Man's frame with its own colours, head and gear.
function m2bCaptain(kind, o) {
  m2bPeople(kind, {
    w: 28, h: 37, fx: 14, fy: 36, H: 116, neck: 43, waist: 70, hip: 80, shW: 16.5, waW: 12.5, hipW: 14,
    legW: 3.7, legGap: 5.5, footW: 4.3, footH: 5, face: { cy: 24, rx: 14.5, ry: 15, eye: 2, gap: 6 }, headFwd: 2,
    arm: { len: 29, rad: 4.3, at: 3, hand: 2.8, taper: 0.5, cuff: o.cuff },
    robe: { end: 90, hem: 15.5, front: 11, back: 10, short: true },
    R: { body: M2B.cloth, sleeve: o.sleeve ?? M2B.cloth, legs: 'ACIJKL', boot: M2B.leather },
    depthF: 10, depthB: 9, mouth: 31, rides: true, ...o,
    mats: { ACIJKL: ['#3e352e', '#26201b'], ...o.mats },
    behind(G, K) {
      if (K.facing !== 'up' && !K.ride) m2bCloak(G, K, 102, 15.5, 19, o.cloak);
      o.behind?.(G, K);
    },
    torso(G, K) {
      if (K.facing === 'up' && !K.ride) m2bCloak(G, K, 102, 15.5, 19, o.cloak);
      if (K.facing !== 'up' || K.ride) m2bBelt(G, K, K.waist - 2, 12.5);
      o.torso?.(G, K);
      if (K.facing === 'down' && !K.ride) m2bPut(G, K.neck - 1, K.cx - 3, ['.GyyG.', 'GyYYgG', 'GgyygG', '.GGGG.']);
    },
  });
}

// The White Tree of Gondor under its seven stars on the surcoat (white on black), and the horse of Rohan.
const M2B_TREE = ['..W.W.W..', '.W.WWW.W.', 'W.WWWWW.W', '.WWWWWWW.', '..WWWWW..', '.W.WWW.W.', '....W....', '....W....', '...WWW...', '..W.W.W..'];
const M2B_HORN = ['......VVB', '....VBTTV', '..VBTTTBV', 'yBTTTTBV.', 'GyTTBBV..', '.GGVV....'];

m2bCaptain('ranger', {
  tool: 'sword', cloak: 'MNPQRS', mats: { MNPQRS: ['#6b7560', '#454d3e'] },
  head(G, K) {
    const f = m2bHead(G, K, { ears: 'round', hair: { out: 2, lift: 1, fringe: 5, side: 12, fall: 14, k: 2, part: 3 }, face: { brow: 'a' } });
    if (K.stage === 'back') return;
    if (K.facing === 'down') for (let c = -6; c <= 5; c += 2) m2bAt(G, f.eye + 8 + (Math.abs(c) > 3 ? -1 : 0), Math.round(f.cx + c), 'r');
    if (!K.ride || true) m2bHood(G, K, f, 'MNPQRS');
  },
  torso(G, K) {
    // The sword's hilt and scabbard at the left hip.
    if (K.facing === 'down') m2bPut(G, K.waist - 6, K.cx - 16, ['.GG.', 'GyYG', '.DD.', '.DD.', '.DF.', '.EF.', '.EF.', '.EF.', '.EF.', '.EF.', '.DD.']);
  },
});
m2bCaptain('ithilien', {
  tool: 'bow', toolOf: (P, t) => (t === 'quill' || t === 'sword' ? 'bow' : t), cloak: 'MNPQRS',
  mats: { MNPQRS: ['#7a8c3e', '#4c5a2a'], 'Zfhl,`': ['#a0784a', '#6a4c2c'] },
  // Leaf and bark: blotches of brown over the green cloak, and a lit rim along his upper edge.
  rim: { O: '5', M: 'R', o: 'd', D: 'H', Z: 'l' },
  head(G, K) {
    const f = m2bHead(G, K, { ears: 'round', hair: { out: 3, lift: 2, fringe: 4, side: 10, fall: 15, fallW: 15, k: 3, part: -3 }, face: { brow: 'a' } });
    if (K.stage === 'back') return;
    if (K.facing !== 'up') m2bRows(G, f.cy + f.ry - 3, f.cy + f.ry + 1, () => [Math.round(f.cx - 9), Math.round(f.cx + 8)], 'Zfhl,`', { ny: -0.5 });
  },
  behind(G, K) {
    // The bow's upper limb over his left shoulder and the quiver's fletching over his right.
    if (K.facing === 'down') { m2bLimb(G, K.neck + 12, K.cx - 12, K.neck - 18, K.cx - 20, 1.3, 'Zfhl,`'); m2bPut(G, K.neck - 7, K.cx + 10, ['W.V.W', 'WVWVW', '.ZZZ.', '.Z,Z.']); }
  },
  torso(G, K) {
    if (K.facing === 'up') {
      m2bLimb(G, K.neck - 14, K.cx + 14, K.waist + 14, K.cx - 14, 1.4, 'Zfhl,`');
      m2bRows(G, K.neck - 4, K.waist - 4, (r) => [Math.round(K.cx + 3 - (r - K.neck) * 0.2), Math.round(K.cx + 9 - (r - K.neck) * 0.2)], 'Zfhl,`');
      m2bPut(G, K.neck - 8, K.cx + 3, ['W.V.W', 'WVWVW']);
    }
    // A baldric across the chest.
    if (K.facing === 'down' && !K.ride) for (let r = 0; r < 24; r += 1) m2bAt(G, K.neck + 2 + r, Math.round(K.cx + 10 - r * 0.85), 'Zf');
  },
});
m2bCaptain('gondor', {
  tool: 'sword', cloak: '[]{}:;', sleeve: 'MNPQRS', cuff: 'MNPQRS',
  mats: { MNPQRS: ['#a8b0bc', '#6a7280'], '[]{}:;': ['#8a2a2a', '#5a1a1e'] },
  sleeveTex: null,
  head(G, K) {
    m2bHead(G, K, { ears: 'round', hair: { out: 3, lift: 2, fringe: 5, side: 11, fall: 16, fallW: 15, k: 3, part: 0 }, face: { brow: 'a' } });
  },
  torso(G, K) {
    if (K.facing === 'down') {
      m2bPut(G, K.neck + 6, K.cx - 5, M2B_TREE);
      m2bPut(G, K.neck + 3, K.cx - 5, ['W.W.W.W.W'.slice(0, 9)]);
      if (!K.ride) m2bPut(G, K.waist + 1, K.cx + 8, M2B_HORN);
    }
    if (K.side && !K.ride) m2bPut(G, K.waist + 1, K.cx - 4, M2B_HORN);
  },
});
m2bCaptain('rohirrim', {
  tool: 'spear', carry: 'spear', toolOf: (P, t) => (t === 'quill' || t === 'sword' ? 'spear' : t), cloak: 'MNPQRS', sleeve: '[]{}:;',
  mats: { MNPQRS: ['#3f7d3c', '#2a5428'], '[]{}:;': ['#a9b1bc', '#6b7380'] },
  head(G, K) {
    const f = m2bHead(G, K, { ears: 'round', hair: { out: 3, lift: 0, fringe: 3, side: 14, fall: 18, fallW: 16, k: 2 }, face: { brow: 'b' } });
    if (K.stage === 'back') return;
    const band = f.eye - 5;
    m2bVol(G, f.cy - f.ry - 6, band, f.cx - f.rx - 3, f.cx + f.rx + 3, (r, c) => ((c + 0.5 - f.cx) / (f.rx + 2.5)) ** 2 + ((r + 0.5 - band) / (f.ry + 3)) ** 2 <= 1 && r <= band, (r, c) => {
      const [nx, ny] = [(c + 0.5 - f.cx) / (f.rx + 2.5), (r + 0.5 - band) / (f.ry + 3)];
      return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
    }, M2B.helm);
    m2bRows(G, band - 2, band, () => [Math.round(f.cx - f.rx - 3), Math.round(f.cx + f.rx + 2)], M2B.gold, { ny: -0.5 });
    // The white horse-tail crest from the helm's top streaming back (down the back of the head from behind).
    const top = f.cy - f.ry - 6;
    if (K.side) {
      m2bLimb(G, top + 1, f.cx, top - 2, f.cx - 8, 2.4, M2B.cream, { tex: m2bStrands(2, 0.3) }, 2.8);
      m2bLimb(G, top - 2, f.cx - 8, f.cy + 12, f.cx - f.rx - 6 - (K.walk ? 2 : 0), 2.8, M2B.cream, { tex: m2bStrands(2, 0.3) }, 3.8);
    }
    else if (K.facing === 'up') m2bLimb(G, top + 1, f.cx, f.cy + 18, f.cx + 1, 3, M2B.cream, { tex: m2bStrands(2, 0.3) }, 4);
    else m2bLimb(G, top + 3, f.cx, top - 3, f.cx, 2.6, M2B.cream, { tex: m2bStrands(2, 0.3) }, 2);
  },
  torso(G, K) {
    // Mail showing at the neck and below the tunic, and the gold trim of the tunic.
    if (K.facing === 'down') {
      m2bRows(G, K.neck, K.neck + 3, () => [K.cx - 6, K.cx + 5], '[]{}:;', { tex: (r, c) => ((r + c) % 2 ? -0.3 : 0.2) });
      for (let r = K.neck + 4; r < K.waist - 2; r += 1) m2bAt(G, r, K.cx - 1, r % 3 ? 'y' : 'Y');
    }
  },
});
