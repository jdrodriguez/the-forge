// sprites-hd-folk.js: the 32-bit elves, Men, Rangers and wizards of the Middle-earth view, drawn with sprites-hd.js's
// parts, one character per quarter-unit pixel in each worker's colours (hdPal). The elf is the owner's approved sample:
// fair hair parted with a shine and long locks, a gold circlet with a blue gem, pointed ears, a robe with a cream panel
// embroidered in gold, bell sleeves with gold cuffs and a gold hem. Men of Rohan wear a tunic over a shirt, a leather
// belt and bracers, and boots; Rangers a deep hood and mantle, a baldric across the chest and tall boots; wizards a tall
// hat with a broad brim, a beard to the belt and a long robe, and carry a staff with a blue stone. Loaded after
// sprites-hd.js; sprites-qd.js has the hobbits, dwarves and orcs.

// The elf's head, 32 pixels square over its 8 units: the crown, the ears through the hair, the face between two locks
// that fall in front of the shoulders and end in strands. Shut, its lids close in a line that dips at the corners.
const ELF_CROWN = [
  '...........aaaaaooooo...........', '.........aacdddccccbboo.........', '.......aacddeeddcccccbboo.......',
  '......acdeeeddcabcddcbbbao......', '.....adeeeddcccabccddcbbaao.....', '....acdddcbccccabcccbcbbbaao....',
  '....acddcbccbccabccbccbbbaao....', 'p...ocYY+YYYYyyGGyyyygggggao...p', 'pp..ocyyyyyyyyGnmGggggggGGao..pp',
];
const ELF_EARS = [['ptp.o', 'pstpo', '.pstp', '.prts', '..prs', '..pqr', '...pq', '....p'], ['o.psp', 'opsrp', 'psrp.', 'srqp.', 'rqp..', 'qqp..', 'qp...', 'p....']];
const ELF_FACE = ['cbbasrmGrsabbb', 'ctssssqssssssa', 'ckkkkstsskkkka', 'ck*jwstssw*jka', 'cxijxstrsxijxa', 'strrsstrssrrrr',
  'stuussttrsuurr', 'sssssrqsssssrq', 'ssssssvvsssssq', 'apssssszsssrpa', 'aapsstsssrqpaa', 'a..pppppppp..a'];
const ELF_SHUT = [...ELF_FACE.slice(0, 2), 'cssssstsssssra', 'crpppstsspppra', 'cpqssstrsssqpa', ...ELF_FACE.slice(5)];
// Where a lock bends over the shoulder it catches the light in a band.
const elfLock = (k, left) => {
  const at = k === 12 ? 0 : k === 13 ? 1 : k < 6 ? 2 : k < 12 ? 3 : k < 18 ? 2 : 4;
  return (left ? ['deed', 'cddc', 'cdcb', 'ccdb', 'bdca'] : ['cddb', 'bccb', 'bcba', 'bbca', 'acba'])[at];
};
function elfHead(shut) {
  const G = qdGrid(32, 32);
  G.all(0, 0, ELF_CROWN);
  const face = shut ? ELF_SHUT : ELF_FACE;
  for (let r = 9; r < 29; r += 1) {
    const k = r - 9;
    if (k < 8) { G.put(r, 0, ELF_EARS[0][k]); G.put(r, 27, ELF_EARS[1][k]); } else { G.put(r, 4, 'o'); G.put(r, 27, 'o'); }
    G.put(r, 5, elfLock(k, true));
    G.put(r, 23, elfLock(k, false));
    if (k < face.length) G.put(r, 9, face[k]);
    else { G.put(r, 9, 'o'); G.put(r, 22, 'o'); }
  }
  G.all(27, 4, ['obdcao', '.odcbo', '.od.bo', '..o..o']);
  G.all(27, 22, ['oacbao', 'oabcao', 'ob.ao.', 'o..o..']);
  return G.rows();
}

// A torso W pixels wide and h tall, lit on its left: rounded shoulders outlined, then light, base, shade and deep down
// its width, with folds (a lit ridge beside its shade) at the given columns from row from.
function hdTorso(W, h, folds = [], from = 5) {
  const G = qdGrid(W, h);
  const shade = (c) => (c === 0 ? '1' : c === W - 1 ? 'O' : c <= 2 ? '4' : c <= W * 0.72 ? '3' : c <= W * 0.86 ? '2' : '1');
  for (let r = 0; r < h; r += 1) for (let c = 0; c < W; c += 1) if ((r || (c > 1 && c < W - 2)) && (r !== 1 || (c && c < W - 1))) G.put(r, c, r ? shade(c) : 'O');
  G.all(1, 1, ['O4554', '4454', '44']);
  for (let r = from; r < h; r += 1) folds.forEach((c) => G.put(r, c, c < W / 2 ? '42' : '21'));
  return G;
}

// The elf's torso: a gold collar, folds across the chest and gathered above the belt, the cream panel down the front
// embroidered with small gold diamonds, and a gold belt with a clasp set with the blue gem.
const ELF_PANEL = (r) => (r % 6 === 1 ? 'yYVg' : r % 6 === 4 ? 'yWgg' : 'yWVg');
function elfBody(h) {
  const G = hdTorso(24, h);
  G.all(0, 7, ['GyqqqqqqyG', 'Yyqrrrqqyg', '.Yysrrqyg.', '..Yyyygg..', '...gggG...']);
  for (let r = 5; r <= 11; r += 1) { const k = (r - 5) >> 1; G.put(r, 8 - k, '42'); G.put(r, 15 + k, '21'); }
  const belt = h - 8;
  for (let r = 5; r < h; r += 1) if (r < belt || r > belt + 3) G.put(r, 10, ELF_PANEL(r));
  for (const c of [3, 6, 16, 19]) { G.put(belt - 2, c, c < 12 ? '42' : '21'); G.put(belt - 1, c, c < 12 ? '42' : '21'); }
  G.all(belt, 0, ['OYYYYYY+YYYYYYYyyyyyyygO', 'OyyyyyyyyyyyyyyyyggggggO', 'OgggggggggggggggggggGGGO', 'OGGGGGGGGGGGGGGGGGGGGGGO']);
  G.all(belt - 1, 9, ['.GyyG.', 'GY++yG', 'gYnmyG', 'gymmgG', 'GggggG', '.GGGG.']);
  for (let c = 1; c < 23; c += 1) if (c < 10 || c > 13) G.put(belt + 4, c, c < 10 ? '2' : '1');
  for (let r = belt + 5; r < h; r += 1) for (const [c, s] of [[4, '42'], [8, '42'], [15, '21'], [19, '21']]) G.put(r, c, s);
  return G.rows();
}

// A robe below the body, 28 pixels wide and n + 1 tall from a row above the legs: flaring to the hem, its folds swinging
// on a stride, its hem lifted over the striding foot and that boot showing whole, both toes peeking out standing. The
// elf's has the cream panel and a gold hem set with teal diamonds; the wizard's (plain) a hem of deep cloth.
function hdRobe(n, step, plain) {
  const R = n + 1;
  const G = qdGrid(28, R);
  const sway = step === 0 ? 1 : step === 1 ? -1 : 0;
  const h0 = Math.max(0, R - 5);
  for (let r = 0; r < R; r += 1) {
    const L = r < R * 0.3 ? 2 : r < R * 0.6 ? 1 : 0;
    const off = r > R / 2 ? sway : 0;
    for (let c = L; c <= 27 - L; c += 1) {
      const lc = c - off;
      let ch = c === 27 - L ? 'O' : c === L ? '1' : c === L + 1 ? '5' : lc <= 3 ? '4' : lc <= 19 ? '3' : lc <= 22 ? '2' : '1';
      for (const [f, a, b] of [[6, r > 3 ? '5' : '4', '2'], [10, '4', '2'], [17, '2', '1'], [21, '2', '1']]) { if (lc === f) ch = a; if (lc === f + 1) ch = b; }
      G.put(r, c, ch);
    }
    if (!plain) G.put(r, 12 + off, ELF_PANEL(r + 24));
  }
  for (let c = 0; c < 28; c += 1) {
    const hr = h0 - ((sway === 1 && c < 14) || (sway === -1 && c >= 14) ? 1 : 0);
    const edge = c === 0 || c === 27;
    const lit = c < 14;
    const band = plain ? [edge ? 'O' : lit ? '2' : '1', edge ? 'O' : c % 4 === 1 ? '2' : '1', 'O']
      : [edge ? 'G' : lit ? 'Y' : 'y', edge ? 'G' : c % 4 === 1 ? '2' : c % 4 === 3 ? 'y' : lit ? 'y' : 'g', edge ? 'G' : lit ? 'g' : 'G'];
    band.forEach((ch, k) => G.put(hr + k, c, ch));
    for (let r = hr + 3; r < R; r += 1) G.cells[r][c] = '.';
  }
  const boot = ['EFHFE', 'EFFFFE'];
  if (sway === 1) G.all(R - 3, 5, ['.EEE.', ...boot]); else if (sway === -1) G.all(R - 3, 17, ['.EEE.', ...boot.map((s) => [...s].reverse().join(''))]);
  else { G.all(R - 2, 6, ['EEEE', 'EFHFE']); G.all(R - 2, 17, ['EEEE', 'EFFFE']); }
  if (sway === 1) G.all(R - 2, 18, ['EEE', 'EFE']); else if (sway === -1) G.all(R - 2, 7, ['EEE', 'EFE']);
  return G.rows();
}

hdPeople('elf', {
  head: elfHead,
  body: elfBody,
  legs: (n, step) => hdRobe(n, step, false),
  legsX: -0.5,
  legsY: -0.25,
  arm: { L: '15443', R: '3221O', bell: true, cuff: ['Y', 'g', 'G'] },
  // The locks below the chin swing back on a stride.
  sway: [[21, 32]],
});

// A face under its brows (one row of the hair's colours), the shared face below (sprites-hd.js's HD_FACE).
const hdBrowFace = (brow, shut) => [brow, ...(shut ? hdShut(HD_FACE) : HD_FACE)];

// A Man of Rohan: hair parted with a shine across the crown, falling past the ears to the jaw, and a short beard.
function manHead(shut) {
  const G = qdGrid(32, 24);
  G.all(0, 6, ['.....ooooooooo......', '...oocdddcccbbboo...', '..ocddeedddcccbbbo..', '.ocdeeeddcccbcccbbo.', 'ocddeddcccbcccbccbbo',
    'ocdddccbccbcccbcbbao', 'ocddcbccbccbccbcbbao', 'ocdcbcbccbbccbbcbbao', 'ocdbcbbbcbbbbbcbbbao']);
  for (let r = 9; r < 18; r += 1) { G.put(r, 6, 'ocd'); G.put(r, 23, 'bao'); }
  G.all(9, 9, hdBrowFace('sabbbssssbbbas', shut));
  G.all(16, 9, ['cssssrqssssscb', 'cdcbbbvvbbbcbb', 'cdcccbzzbccbba', '.ocdccccccbbo.', '..oocbbbbboo..', '....oooooo....']);
  G.all(17, 5, ['oco', '.o.']);
  G.all(17, 24, ['ao', 'o.']);
  return G.rows();
}
// A tunic over a shirt open at the neck, a leather belt with a gold buckle, the tunic's skirt below.
function manBody(h) {
  const G = hdTorso(24, h, [4, 19], h - 6);
  const belt = h - 8;
  G.all(0, 8, ['OsssssssO', '.OrssrqO.', '..WVVVU..', '...WVU...']);
  for (let r = 4; r < belt; r += 1) { G.put(r, 7, '1'); G.put(r, 16, '1'); }
  G.all(belt, 0, ['DHHHHHHHHFFGYYGFFFFFFEED', 'DFFFFFFFFFEgy+gEEEEEEEED', 'DEEEEEEEEEEGggGEEEEEEDDD']);
  return G.rows();
}
const MAN_LEGS = { W: 24, at: [4, 12], L: 'O2221111', R: '1121111O', lift: 3, bootX: [-1, 0],
  bootL: ['DHHFFEED', 'DHFFFEED', 'DHFFFFEED', 'DDDDDDDDD'], bootR: ['DFFFEEED', 'DFFEEEED', 'DFFFEEEEED', 'DDDDDDDDDD'] };
hdPeople('man', {
  head: manHead,
  body: manBody,
  legs: (n, step) => hdLegs(n, step, MAN_LEGS),
  arm: { L: '14432', R: '3221O', cuff: ['H', 'F', 'D'] },
  sway: [[17, 24]],
});

// The Ranger's deep hood shades its brow; its mantle falls over the shoulders and swings back on a stride.
function rangerHead(shut) {
  const G = qdGrid(32, 26);
  [10, 14, 16, 18, 20, 22, 22, 24].forEach((w, r) => qdSpan(G, r, 16, w, r ? 'O445' : 'O', r ? '3' : 'O', r ? '2221O' : 'O'));
  qdSpan(G, 8, 16, 24, 'O4432', '1', '1221O');
  for (let r = 9; r < 20; r += 1) { G.put(r, 4, 'O4432'); G.put(r, 23, '1221O'); }
  G.all(9, 9, hdBrowFace('qqqqqqqqqqqqqq', shut).map((row, r) => (r === 1 ? row.replace(/s/g, 'r') : r === 9 ? 'prsrsrzrsrsrqp' : r === 10 ? '.pprsrrrsrqpp.' : row)));
  // The mantle over the shoulders, its hem ragged, pinned at the throat with a silver star.
  [26, 30, 32, 32].forEach((w, k) => qdSpan(G, 20 + k, 16, w, 'O44', '3', '2221O'));
  for (let r = 21; r < 24; r += 1) for (const c of [6, 12, 19, 25]) G.put(r, c, c < 16 ? '42' : '21');
  qdSpan(G, 24, 16, 30, 'O', '1', 'O');
  G.all(19, 14, ['.0.', '0#9', '.8.']);
  return G.rows();
}
// A tunic of the cloak's green under a leather baldric from shoulder to hip, a belt with a gold buckle.
function rangerBody(h) {
  const G = hdTorso(24, h, [5, 18], h - 5);
  const belt = h - 8;
  for (let r = 2; r < belt; r += 1) G.put(r, 3 + Math.round(((r - 2) * 14) / (belt - 2)), 'DHFE');
  G.all(belt, 0, ['DHHHHHHHHHFGYYGFFFFFFEED', 'DFFFFFFFFFFgy+gEEEEEEEED', 'DEEEEEEEEEEGggGEEEEEEDDD']);
  return G.rows();
}
const RANGER_LEGS = { ...MAN_LEGS, L: 'DFFFEEED', R: 'DEEEEEED',
  bootL: ['DHFFFEED', 'DHHFFEED', 'DHFFFEED', 'DHFFFFEED', 'DDDDDDDDD'], bootR: ['DFFEEEED', 'DFFFEEED', 'DFFEEEED', 'DFFFEEEEED', 'DDDDDDDDDD'] };
hdPeople('ranger', {
  head: rangerHead,
  body: rangerBody,
  legs: (n, step) => hdLegs(n, step, RANGER_LEGS),
  arm: { L: '14432', R: '3221O', cuff: ['H', 'F', 'D'] },
  sway: [[20, 26]],
});

// The wizard: a tall hat leaning back at its tip, with a gold band and a broad brim, in the hat's own colour (the helm
// ramp, 6 to #, which sprites.js's WIZARDS sets, so Gandalf's hat can be blue over his grey); bushy brows, and a beard in
// long locks to the belt.
function wizardHead(shut) {
  const G = qdGrid(32, 66);
  for (let r = 0; r < 20; r += 1) {
    const w = 2 + Math.round(r * 0.66);
    qdSpan(G, r, 16 + Math.max(0, Math.round(2.6 - r * 0.3)), w, w > 7 ? '60#' : w > 3 ? '60' : '6', '9', w > 7 ? '876' : w > 3 ? '76' : '6');
  }
  G.all(18, 10, ['677777777776', '6YyyyyyyygG6', '6gggggggggG6']);
  qdSpan(G, 21, 16, 28, '6600', '9', '88766');
  qdSpan(G, 22, 16, 32, '6000', '9', '88876');
  qdSpan(G, 23, 16, 32, '67', '7', '76');
  qdSpan(G, 24, 16, 30, '6', '6', '6');
  G.all(25, 7, ['bcccssqssssscccb', 'ocdeeedssdeeeddb', 'ocddkkkstskkkddb', ...(shut ? ['ocsrpppstspppsbb', 'ocssssstrsssssbb'] : ['ocsw*jstssj*wsbb', 'ocsxijstrsijxsbb'])]);
  G.all(30, 7, ['ocsstrrsssrrssbb', 'ocddeddsqsddedcb']);
  for (let r = 32; r < 64; r += 1) {
    const w = r < 50 ? 18 : r < 58 ? 14 : 10;
    qdSpan(G, r, 16, w + 2, 'o', '.', 'o');
    for (let c = 0; c < w; c += 1) G.put(r, 16 - (w >> 1) + c, (c + (r >> 3)) % 4 === 1 ? 'e' : c < w * 0.4 ? 'd' : c < w * 0.75 ? 'c' : 'b');
  }
  G.all(32, 11, ['ddcvvvvvcd', '.dczzzzcd.']);
  G.all(64, 12, ['.oddcco.', '..oooo..']);
  return G.rows();
}
// A plain robe body with a gold belt; the beard covers its front.
function wizardBody(h) {
  const G = hdTorso(24, h, [3, 20], 4);
  G.all(h - 8, 0, ['OYYYYYYYYYYYyyyyyyyyyygO', 'OyyyyyyyyyyyyyyyyyyggggO', 'OGGGGGGGGGGGGGGGGGGGGGGO']);
  return G.rows();
}
hdPeople('wizard', {
  up: 24,
  head: wizardHead,
  body: wizardBody,
  legs: (n, step) => hdRobe(n, step, true),
  legsX: -0.5,
  legsY: -0.25,
  arm: { L: '15443', R: '3221O', bell: true, cuff: ['2', '1', 'O'] },
  // The hat's tip and the end of the beard swing back on a stride.
  sway: [[0, 9], [52, 66]],
});
// The wizard's staff, held beside its hand from the head's top to the ground: gnarled wood, the fingers round it, and a
// blue stone in a crook at its head.
function hdStaff(g, P, x, top, y) {
  hdStamp(g, P, `staff${y - top}`, () => {
    const G = qdGrid(6, (y - top + 1) * 4 + 4);
    G.all(0, 0, ['.DDD..', 'DnnmD.', 'D*nmmD', 'DnmmD.', '.DmD..', '.DHFD.', 'DH.FD.']);
    for (let r = 7; r < (y - top + 1) * 4 + 4; r += 1) G.put(r, 1, r % 9 === 4 ? 'DFE' : r % 9 === 5 ? 'HFD' : 'HFD');
    G.all(36, 0, ['tsr', 'srq']);
    return G.rows();
  }, x - 0.25, top - 1);
}
