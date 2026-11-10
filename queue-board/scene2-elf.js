// scene2-elf.js: the elf of the map from above (scene2.js), seen from behind and in profile at 32-bit, to go with the
// approved sample's front (sprites-hd-folk.js's elfHead, elfBody and sprites-hd.js's arms, which scene2-folk.js reuses
// for the elf facing you). The same palette keys and ramps (hdPal): fair hair in locks with a shine, the gold circlet
// and its blue gem, pointed ears, the teal robe lit on its left with the cream panel and gold hem, bell sleeves with
// gold cuffs. From behind the hair falls in a mass of strands to the middle of the back, the ear tips showing either
// side; in profile (facing right; facing left is its mirror) the face shows one lashed eye, the nose, the mouth and the
// chin, the ear sweeping back through the hair, and the near arm swings with the stride. Maps are one character a
// quarter unit. Only constants and functions; scene2-folk.js composes the frames.

// The hair's strands across a column: lit on the left, shaded on the right, with fine seams.
const M2_STRAND = 'cdccbcdcbccbcdcbcbbcbaba';
const m2Strand = (c) => M2_STRAND[Math.max(0, Math.min(M2_STRAND.length - 1, c))];
// One step lighter in the hair's ramp.
const m2Up = (ch) => ({ a: 'b', b: 'c', c: 'd', d: 'e', e: 'e' }[ch] ?? ch);

// The head from behind, 32 by 32: the crown and a plain circlet band, the ear tips either side, and the hair falling
// down the back in strands with a shine across it, ending in points. The torso's map carries it on below.
function m2ElfHeadBack() {
  const G = qdGrid(32, 32);
  G.all(0, 0, ELF_CROWN.slice(0, 7));
  G.all(7, 0, ['p...ocYY+YYYYyyyyyyyygggggao...p', 'pp..ocyyyyyyyyyyyyyggggggGao..pp']);
  for (let r = 9; r < 32; r += 1) {
    const k = r - 9;
    const inset = r < 22 ? 0 : r < 27 ? 1 : 2;
    for (let c = 4 + inset; c <= 27 - inset; c += 1) {
      let ch = c === 4 + inset || c === 27 - inset ? 'o' : m2Strand(Math.round(((c - 5) * 23) / 22));
      if (r >= 10 && r <= 12 && c > 6 && c < 20) ch = m2Up(ch);
      if (r === 13 && c > 8 && c < 17) ch = m2Up(ch);
      if (r > 26 && (c + r) % 3 === 0) ch = '.';
      G.put(r, c, ch);
    }
    if (k < 8) {
      G.put(r, 0, ELF_EARS[0][k].replace(/t/g, 's').replace(/s/g, 'r'));
      G.put(r, 27, ELF_EARS[1][k].replace(/t/g, 's').replace(/s/g, 'r'));
      G.put(r, 4, 'o');
      G.put(r, 27, 'o');
    }
  }
  return G.rows();
}

// The head in profile, facing right, 32 by 32: the crown, the circlet with its gem at the brow, the hair falling down
// the back, the ear sweeping back through it, and the face: brow, one lashed eye with a glint, the nose, a blush, the
// mouth and the chin. Shut, the lid closes in a line.
const M2_PROFILE = [
  'cbsssqqqssp.', 'cbtsskkkkssp', 'cbtssw*jkssp', 'cbsssxijssssp', 'cbssuusssssssp', 'cbssussssrqp', 'cbsssssssp..',
  'cbrssssvvp..', 'cbrssssszsp.', 'caqrsssssp..', 'capqrssrp...', 'ca.ppppp....',
];
function m2ElfHeadSide(shut) {
  const G = qdGrid(32, 32);
  G.all(0, 0, ELF_CROWN.slice(0, 7));
  G.put(4, 24, 'cbbaao');
  G.put(5, 25, 'bbaao');
  G.put(6, 25, 'bbbao');
  G.all(7, 4, ['ocYY+YYYYyyyyyyyyyggggGo', 'ocyyyyyyyyyyyyyyyyyGnmGo']);
  for (let r = 9; r < 31; r += 1) {
    const end = r < 26 ? 17 : 17 - (r - 25) * 2;
    for (let c = 4; c <= end; c += 1) {
      let ch = c === 4 ? 'o' : m2Strand(Math.round(((c - 5) * 23) / 12));
      if (r >= 10 && r <= 12 && c > 5 && c < 12) ch = m2Up(ch);
      if (r > 27 && (c + r) % 3 === 0) ch = '.';
      G.put(r, c, ch);
    }
  }
  const face = shut ? [M2_PROFILE[0], 'cbtsssssssp', 'cbtssrpppssp', 'cbsssssssssp', ...M2_PROFILE.slice(4)] : M2_PROFILE;
  G.all(9, 17, face);
  G.all(8, 11, ['ptp.', 'pstpo', '.pstp', '.prts', '..prs', '..pqr', '...pq', '....p']);
  return G.rows();
}

// A torso from behind, 24 wide and h tall: the robe's back lit on its left with a seam down the middle and folds, the
// gold belt across it, and below the head's map the hair's ends over the shoulder blades.
function m2ElfTorsoBack(h) {
  const G = hdTorso(24, h, [5, 18]);
  const belt = h - 8;
  for (let r = 4; r < h; r += 1) if (r < belt || r > belt + 3) G.put(r, 11, '21');
  G.all(belt, 0, ['OYYYYYYYYYYYYYYyyyyyyygO', 'OyyyyyyyyyyyyyyyyggggggO', 'OgggggggggggggggggggGGGO', 'OGGGGGGGGGGGGGGGGGGGGGGO']);
  for (let r = 0; r < 18; r += 1) {
    const [a, b] = [5 + Math.floor(r / 4), 18 - Math.floor(r / 4)];
    for (let c = a; c <= b; c += 1) {
      if (r > 12 && (c + r) % 3 === 0) continue;
      G.put(r, c, c === a || c === b ? 'o' : m2Strand(Math.round(((c - a) * 23) / (b - a))));
    }
  }
  return G.rows();
}

// A torso in profile facing right, 20 wide and h tall: the back on the left, the chest on the right with the gold
// collar and a sliver of the cream panel edged in gold down the front, the belt across with its clasp at the front, and
// the hair's fall down the back to the shoulder blades.
function m2ElfTorsoSide(h) {
  const G = qdGrid(20, h);
  const belt = h - 8;
  for (let r = 0; r < h; r += 1) {
    const [a, b] = [r < 2 ? 4 - r * 2 : 1, r < 2 ? 15 + r * 2 : 18];
    for (let c = a; c <= b; c += 1) G.put(r, c, c === a || c === b || r === 0 ? 'O' : c <= a + 2 ? '4' : c <= 11 ? '3' : c <= 14 ? '2' : '1');
    if (r > 2 && (r < belt || r > belt + 3)) G.put(r, b - 2, r % 6 === 1 ? 'yY' : 'yW');
  }
  G.all(0, 11, ['GyqqqG', 'Yyqrrg', '.Yyyg.']);
  G.all(belt, 1, ['OYYYYYYYyyyyyyygO', 'OyyyyyyyyyyyyggGO', 'OgggggggggggggGGO', 'OGGGGGGGGGGGGGGGO']);
  G.all(belt, 14, ['GyyG', 'Ymny', 'GggG']);
  for (let r = 0; r < 17; r += 1) {
    const w = r < 11 ? 8 : 8 - (r - 10);
    for (let c = 0; c < w; c += 1) if (!(r > 12 && (c + r) % 3 === 0)) G.put(r, c, c === 0 || c === w - 1 ? 'o' : m2Strand(c * 3));
  }
  return G.rows();
}

// The robe below the belt, n + 1 rows from a row above the legs. Facing you or away it is 28 wide (sprites-hd-folk.js's
// hdRobe for the front, with the cream panel; from behind, plain down the back), flaring to a gold hem whose side over
// the striding foot lifts, the boot showing. In profile it is 22 wide: the front edge toward the right with the panel's
// gold edge, its hem lifting at the front on a stride over the leading boot while the trailing heel shows behind.
function m2ElfRobe(n, step, facing) {
  if (facing === 'down') return hdRobe(n, step, false);
  if (facing === 'up') { const gold = hdRobe(n, step, false); return hdRobe(n, step, true).map((row, r) => (r < n - 5 ? row : gold[r])); }
  const R = n + 1;
  const G = qdGrid(28, R + 1);
  const stride = step === 0 || step === 1;
  const h0 = R - 4;
  for (let r = 0; r < R; r += 1) {
    const spread = Math.floor((r / R) * 4);
    const [a, b] = [3 - spread + (stride && r > R / 2 ? -1 : 0), 21 + spread + (stride && r > R / 2 ? 1 : 0)];
    for (let c = a; c <= b; c += 1) {
      let ch = c === a || c === b ? 'O' : c <= a + 1 ? '5' : c <= a + 4 ? '4' : c <= b - 7 ? '3' : c <= b - 3 ? '2' : '1';
      if ((c - a) % 6 === 3 && r > 2) ch = ch === '3' ? '2' : ch === '4' ? '5' : ch;
      G.put(r, c, ch);
    }
    if (r < h0) G.put(r, b - 2, 'yW');
    if (r >= h0) for (let c = a; c <= b; c += 1) G.put(r, c, c === a || c === b ? 'G' : r === h0 ? (c < 13 ? 'Y' : 'y') : r === h0 + 1 ? (c % 4 === 1 ? '2' : 'g') : 'G');
  }
  if (stride) { G.all(R - 2, 23, ['EEE.', 'EFHFE']); G.all(R - 1, 0, ['.EFE']); } else G.all(R - 1, 10, ['EFHFE', '.....']);
  return G.rows();
}

// The near arm in profile from the shoulder, 14 wide and 19 tall: a sleeve outlined on both sides down a line swung
// forward (1), back (-1) or hanging (0), flaring to a bell with a gold cuff, and the hand below it.
function m2ElfArmSide(swing) {
  const G = qdGrid(14, 19);
  const dc = swing * 3;
  G.put(0, 3, 'O444O');
  qdRod(G, 1, 5, 10, 5 + dc, 'O45432O', -3);
  G.all(10, 1 + dc, ['O45443321O', 'OYYYYYgggO', 'GgggggGGGG']);
  G.all(13, 3 + dc, ['.tssr', 'tsssrq', 'tssrq', '.rqp']);
  return G.rows();
}
