// scene2-body-dwarf.js: the dwarf of Erebor on the map from above, 22 units tall and broad: a riveted steel helm with a
// gold band and a nose guard, bushy brows, a big nose, a broad beard in locks down past the belt ending in a braid with
// a gold bead, a tunic in the worker's colour with a hem of mail, iron bracers, a broad leather belt with a big gold
// buckle, thick legs and iron-capped boots. From behind the helm's back and the hair under it, the beard's edges
// showing at the jaw; in profile the beard juts forward.

const M2B_DWARF = {
  w: 26, h: 27, fx: 13, fy: 26, H: 88, neck: 37, waist: 62, hip: 68, shW: 19, waW: 16.5, hipW: 17, bulge: 1,
  legW: 4.6, legGap: 6.5, footW: 5.5, footH: 5, face: { cy: 23, rx: 15, ry: 13, eye: 1, gap: 6 }, headFwd: 2,
  arm: { len: 23, rad: 4.8, at: 3, hand: 3.2, cuff: M2B.helm, taper: 0.4 },
  robe: { end: 78, hem: 18, front: 14, back: 12, short: true },
  R: { body: M2B.cloth, sleeve: M2B.cloth, legs: 'ACIJKL', boot: M2B.leather, robe: 'MNPQRS' },
  mats: { ACIJKL: ['#5a4a3c', '#3a2f26'], MNPQRS: ['#9aa3ae', '#626b78'] },
  depthF: 15, depthB: 12, mouth: 29, seatK: 0.5, neckW: 6,
  // The mail hem: rings in rows, lit and shaded in a checker.
  robeTex: (r, c) => (r % 2 ? ((c >> 1) % 2 ? -0.25 : 0.15) : ((c >> 1) % 2 ? 0.15 : -0.25)),
  head(G, K) {
    const f = m2bHead(G, K, { ears: null, hair: { out: 2, lift: 0, fringe: 8, side: 12, fall: 6, fallW: 16, k: 2 }, face: { brow: 'b', mouth: false, nose: ['tts', 'tsss', 'tsssr', 'ssrrq', '.rqq'] } });
    if (K.stage === 'back') return;
    const H = M2B.helm;
    // The helm's dome down to a gold band over the brows; from the front a nose guard down the nose.
    const band = f.eye - 6;
    m2bVol(G, f.cy - f.ry - 8, band, f.cx - f.rx - 3, f.cx + f.rx + 3, (r, c) => ((c + 0.5 - f.cx) / (f.rx + 2.5)) ** 2 + ((r + 0.5 - band) / (f.ry + 5)) ** 2 <= 1 && r <= band, (r, c) => {
      const [nx, ny] = [(c + 0.5 - f.cx) / (f.rx + 2.5), (r + 0.5 - band) / (f.ry + 5)];
      return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
    }, H, { tex: (r, c) => (Math.abs(c + 0.5 - f.cx) < 1 ? 0.25 : 0) });
    m2bRows(G, band - 2, band + 1, () => [Math.round(f.cx - f.rx - 3), Math.round(f.cx + f.rx + 2)], M2B.gold, { ny: -0.5 });
    if (K.facing !== 'up') for (const k of [-10, -4, 4, 10]) m2bAt(G, band - 1, Math.round(f.cx + (K.side ? k / 2 + 4 : k)), 'Y');
    m2bAt(G, f.cy - f.ry - 9, Math.round(f.cx) - 1, '6#6');
    if (K.facing === 'down') m2bRows(G, band + 1, f.eye + 3, () => [Math.round(f.cx) - 1, Math.round(f.cx)], H, { bias: 0.3 });
    if (K.facing !== 'up') {
      m2bBeard(G, f, { len: K.side ? 26 : 34, w: f.rx + 2, from: 3, point: 1.4, lip: 4, moustache: K.side ? false : 'bcdddccdddcb', tex: m2bStrands(2, 0.35) });
      if (!K.side) m2bPut(G, f.eye + 34, Math.round(f.cx) - 2, ['.bcb.', 'GyYyG', 'GyygG', '.bcb.', '.aba.']);
    } else m2bBeard(G, f, { back: true, w: f.rx + 1 });
  },
  torso(G, K) {
    m2bBelt(G, K, K.waist - 3, 17, M2B.leather, ['GGyyyyGG', 'Gy+YYyyG', 'GyyyyggG', 'GGGGGGGG']);
  },
};
m2bPeople('dwarf', M2B_DWARF);
