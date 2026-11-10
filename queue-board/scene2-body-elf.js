// scene2-body-elf.js: the elf of Rivendell on the map from above, 30 units tall and slim, redrawn at the new size from
// the approved 32-bit sample: fair hair (or dark, or silver) falling straight past the shoulders in strands with a
// shine, a gold circlet with a blue gem, long pointed ears, the robe in the worker's colour lit on its left with a cream
// panel edged in gold down the front, a gold collar and belt with a gem clasp, bell sleeves with gold cuffs and a gold
// hem. From behind the hair falls to the middle of the back; in profile the panel shows at the front edge.

const M2B_ELF = {
  w: 26, h: 33, fx: 13, fy: 32, H: 120, neck: 44, waist: 74, hip: 82, shW: 16, waW: 12, hipW: 13,
  legW: 3.5, legGap: 5, footW: 4, footH: 4, face: { cy: 23, rx: 16, ry: 16, eye: 2, gap: 6 }, headFwd: 2,
  arm: { len: 30, rad: 4.2, at: 3, hand: 2.6, cuff: M2B.gold, taper: 0.2 },
  robe: { end: 116, hem: 19, front: 14, back: 11 },
  R: { body: M2B.cloth, sleeve: M2B.cloth, legs: M2B.cloth, boot: 'DDEFHH', robe: M2B.cloth },
  depthF: 10, depthB: 8, mouth: 30, tool: 'quill',
  robeTex: m2bFolds([], 0.3),
  head(G, K) {
    const f = m2bHead(G, K, {
      ears: 'point',
      hair: { out: 3, lift: 2, fringe: 5, side: 14, fall: 30, fallW: 15, k: 2, part: 0, sweep: 0.18 },
      face: { brow: 'b' },
    });
    // The circlet across the brow, its gem at the middle (from behind, a plain band).
    const cr = f.eye - 7 - (K.facing === 'up' ? 0 : 0);
    if (K.facing === 'side') {
      m2bRows(G, cr - 1, cr + 1, () => [f.cx - f.rx + 1, f.cx + f.rx - 1], M2B.gold, { open: 'lr' });
      m2bPut(G, cr - 1, f.cx + f.rx - 4, ['GyG', 'ymn', 'GgG']);
    } else {
      m2bRows(G, cr - 1, cr + 1, (r) => [f.cx - f.rx - 2, f.cx + f.rx + 1], M2B.gold, { open: 'lr', ny: -0.6 });
      if (K.facing === 'down') m2bPut(G, cr - 1, f.cx - 2, ['GyyG', 'ymnn', 'Gmng', '.GG.']);
    }
  },
  torso(G, K) {
    const R = this.R;
    void R;
    if (K.facing === 'up') {
      // The belt across the back and a seam down it.
      for (let r = K.neck + 4; r < K.waist - 2; r += 1) m2bAt(G, r, K.cx - 1, '2');
      m2bRows(G, K.waist - 2, K.waist + 1, (r) => [Math.round(K.cx - 9), Math.round(K.cx + 8)], M2B.gold, { open: '' });
      if (!K.seated) for (let r = K.top + this.robe.end - 3; r <= K.top + this.robe.end - 1; r += 1) m2bRows(G, r, r, () => [K.cx - 14, K.cx + 13], M2B.gold);
      return;
    }
    if (K.facing === 'side') {
      for (let r = K.neck + 2; r < K.top + this.robe.end; r += 1) m2bAt(G, r, K.cx + 5 + (r > K.waist ? Math.round((r - K.waist) / 9) : 0), r % 5 ? 'yW' : 'YW');
      m2bRows(G, K.waist - 2, K.waist + 1, () => [K.cx - 7, K.cx + 8], M2B.gold);
      m2bAt(G, K.neck, K.cx - 1, 'GyyyyG');
      return;
    }
    // The cream panel edged in gold from the collar down the robe, the gold collar, the belt and its gem clasp.
    const end = K.seated ? K.foot - 2 : K.top + this.robe.end - 1;
    for (let r = K.neck + 2; r < end; r += 1) {
      const w = r < K.waist ? 2 : 2 + Math.round((r - K.waist) / 22);
      m2bAt(G, r, K.cx - w - 1, `y${'W'.repeat(w)}${'V'.repeat(w)}g`);
      if (r % 6 === 3) m2bAt(G, r, K.cx - w - 1, 'Y');
    }
    m2bPut(G, K.neck - 1, K.cx - 6, ['.GGyyyyyyGG.', 'GyYYyyyyyygG', '.GgyWWVVygG.', '..GgyWVyg G.'.replace(' ', 'G')]);
    m2bRows(G, K.waist - 2, K.waist + 1, () => [K.cx - 9, K.cx + 8], M2B.gold);
    m2bPut(G, K.waist - 3, K.cx - 3, ['.GGGG.', 'GyYYgG', 'Ymnnmg', 'Gmnmgg', '.GGGG.']);
    if (!K.seated) {
      const hem = K.top + this.robe.end;
      m2bRows(G, hem - 3, hem - 1, (r) => {
        const s = K.step;
        const w = this.robe.hem;
        if (s === 0) return [K.cx - 1, K.cx + w - 1];
        if (s === 1) return [K.cx - w, K.cx];
        return [K.cx - w, K.cx + w - 1];
      }, M2B.gold, { open: 't' });
    }
  },
};
m2bPeople('elf', M2B_ELF);
