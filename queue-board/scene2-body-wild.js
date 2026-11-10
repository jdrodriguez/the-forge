// scene2-body-wild.js: Beorn and Tom Bombadil on the map from above. Beorn, 36 units tall and broad: thick black hair
// and a great black beard, a tunic of undyed wool to his knees with a rope belt, bare knotted arms and bare legs, and
// his axe, which he leans on as he stands and swings when he chops. Tom Bombadil, 25 units under his hat, stout and
// merry: a battered brown hat with a long blue feather, a brown beard, a red face with bright blue eyes, a bright blue
// jacket with brass buttons, and big yellow boots.

const M2B_BEORN = {
  w: 34, h: 41, fx: 17, fy: 40, H: 144, neck: 54, waist: 94, hip: 104, shW: 23, waW: 19, hipW: 20, bulge: 1.5,
  legW: 5.2, legW0: 6.5, legGap: 8, footW: 6, footH: 5, face: { cy: 30, rx: 17, ry: 18, eye: 0, gap: 7 }, headFwd: 3,
  arm: { len: 38, rad: 6, at: 4, hand: 3.8, taper: 1.2 },
  robe: { end: 124, hem: 21, front: 15, back: 13, short: true },
  R: { body: 'MNPQRS', sleeve: M2B.skin, legs: M2B.skin, boot: 'DDEFHH', robe: 'MNPQRS', hand: M2B.skin },
  mats: { MNPQRS: ['#c2ae86', '#857152'], oabcde: ['#2e2a2c', '#141214'] },
  depthF: 15, depthB: 14, mouth: 40, neckW: 7, shadow: 13, carry: 'axe', carryAng: 90, tool: 'axe',
  toolOf: (P, t) => (t === 'quill' || t === 'staff' ? 'axe' : t),
  // The wool's weave: fine broken stripes.
  robeTex: (r, c) => ((r + (c >> 1)) % 4 === 0 ? -0.18 : (c + r) % 7 === 0 ? 0.12 : 0),
  bodyTex: (r, c) => ((r + (c >> 1)) % 4 === 0 ? -0.18 : 0),
  head(G, K) {
    const f = m2bHead(G, K, { ears: 'round', hair: { out: 3, lift: 3, fringe: 6, side: 10, fall: 24, fallW: 18, k: 2, part: 2 }, face: { brow: 'a', old: true, mouth: false } });
    if (K.stage === 'back') return;
    if (K.facing !== 'up') m2bBeard(G, f, { len: K.side ? 30 : 36, w: f.rx + 1, from: 5, point: 1.6, lip: 4, moustache: 'abccbbbbccba', tex: m2bStrands(2, 0.3) });
  },
  torso(G, K) {
    // The neckline's lacing and the rope belt.
    if (K.facing === 'down') for (let r = K.neck; r < K.neck + 10; r += 2) m2bAt(G, r, K.cx - 2, r % 4 ? 'Q.Q' : '.R.');
    m2bBelt(G, K, K.waist - 2, 19.5, 'DDEFHH', ['FHHF', 'HFFH', 'FHHF']);
    // Muscles: a shade down the inside of each bare upper arm comes from the limb; the elbows get a knot of light.
  },
};
m2bPeople('beorn', M2B_BEORN);

const M2B_TOM = {
  w: 26, h: 31, fx: 13, fy: 30, H: 92, hat: 14, neck: 41, waist: 63, hip: 70, shW: 16, waW: 15, hipW: 15, bulge: 2.5,
  legW: 3.6, legGap: 5.5, footW: 5.5, footH: 6, face: { cy: 23, rx: 14.5, ry: 14.5, eye: 1, gap: 6 }, headFwd: 2,
  arm: { len: 22, rad: 4, at: 3, hand: 2.8, taper: 0.4 },
  robe: { end: 78, hem: 16.5, front: 12, back: 11, short: true },
  R: { body: 'O12345', sleeve: 'O12345', legs: 'ACIJKL', boot: 'MNPQRS', hips: 'O12345' },
  mats: { O12345: ['#2f6fe0', '#1d4498'], ACIJKL: ['#6a5034', '#45331f'], MNPQRS: ['#f6cc2a', '#b8820e'], '[]{}:;': ['#7a5a36', '#4c3620'],
    oabcde: ['#8a5a2c', '#5a3a1c'], u: '#e8604c', i: '#5aa8ff', j: '#1f5ab8', '=?&_|-': ['#3a7ae8', '#1c3c90'] },
  depthF: 12, depthB: 10, mouth: 30, seatK: 0.55, tool: 'lily',
  // Big yellow boots: tall shafts and broad round toes.
  foot(G, K, fr, fc, s, bias) {
    m2bLimb(G, fr - 10, fc, fr - 4, fc, 4, 'MNPQRS', { bias });
    m2bBall(G, fr - 3, fc + s * 1.5, 3.2, 6, 'MNPQRS', { bias: bias + 0.1 });
  },
  footSide(G, K, fr, fc, bias) {
    m2bLimb(G, fr - 10, fc, fr - 4, fc, 4, 'MNPQRS', { bias });
    m2bBall(G, fr - 3, fc + 3, 3.2, 7, 'MNPQRS', { bias: bias + 0.1 });
  },
  head(G, K) {
    const f = m2bHead(G, K, { ears: 'round', hair: { out: 3, lift: 2, fringe: 6, side: 10, fall: 10, fallW: 16, k: 2 }, face: { brow: 'a', mouth: false, smile: true } });
    if (K.stage === 'back') return;
    if (K.facing !== 'up') {
      m2bBeard(G, f, { len: K.side ? 18 : 22, w: f.rx + 1, from: 4, point: 1.5, lip: 4, moustache: 'abccbbccba', tex: m2bStrands(2, 0.3) });
      if (!K.side) m2bAt(G, f.eye + 7, Math.round(f.cx) - 2, 'zvvz');
    }
    // The battered hat: a dented crown and a floppy brim, with a long blue feather in the band.
    const brim = f.eye - 6;
    const lean = K.side ? -2 : 0;
    m2bPoly(G, [[brim, f.cx - f.rx + 1], [brim - 12, f.cx - f.rx + 3 + lean], [brim - 14, f.cx - 2 + lean], [brim - 12, f.cx + 1 + lean], [brim - 13, f.cx + f.rx - 4 + lean], [brim, f.cx + f.rx - 1]], '[]{}:;', { ny: -0.2 });
    m2bRows(G, brim - 3, brim - 1, () => [Math.round(f.cx - f.rx + 2), Math.round(f.cx + f.rx - 2)], '[]{}:;', { bias: -0.4 });
    m2bBall(G, brim + 1, f.cx, 3, f.rx + 6, '[]{}:;', { bias: 0.1 });
    const fs = K.facing === 'up' ? -1 : 1;
    m2bLimb(G, brim - 3, f.cx + fs * 8, brim - 22, f.cx + fs * 15 + lean, 1.8, '=?&_|-', {}, 1.2);
  },
  torso(G, K) {
    if (K.facing === 'down') for (let r = K.neck + 4; r < K.waist; r += 5) m2bPut(G, r, K.cx - 1, ['Gy', 'gG']);
    m2bBelt(G, K, K.waist - 1, 15.5);
  },
};
m2bPeople('bombadil', M2B_TOM);
