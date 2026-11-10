// sprites-qd.js: the 32-bit hobbits, dwarves and orcs of the Middle-earth view, drawn with sprites-hd.js's parts like
// sprites-hd-folk.js's peoples, one character per quarter-unit pixel in each worker's colours (hdPal). Hobbits have a
// mop of curls, ears peeking through, rosy cheeks, a waistcoat with brass buttons over a white shirt, breeches and big
// bare feet with hair on top. Dwarves have a riveted steel helm with a nose guard, bushy brows, a broad beard to the belt
// ending in a braid with a gold bead, iron bracers, a broad belt with a gold buckle, a hem of mail and iron-capped
// boots. Orcs have a dark one-spiked helm, a heavy brow over glowing red eyes, tusks, pointed ears, iron shoulder plates
// riveted on black leather, bare green arms and a ragged hem. Loaded after sprites-hd-folk.js.

// A mass of curls a row at a time, half[r] pixels either side of column 16: each curl lit at its top left and shaded
// below, lighter on the head's left and darker on its right, with a ragged outline.
function hdCurls(G, half) {
  const tile = ['dccb', 'cbba', 'bcdc'];
  half.forEach((h, r) => {
    for (let c = 16 - h; c < 16 + h; c += 1) {
      let ch = tile[r % 3][(c + (Math.floor(r / 3) % 2) * 2) % 4];
      if (c < 12) ch = { b: 'c', c: 'd', a: 'b', d: (c + r) % 5 ? 'd' : 'e' }[ch];
      else if (c > 20) ch = { d: 'c', c: 'b', b: 'a', a: 'a' }[ch];
      const edge = c === 16 - h || c === 15 + h || (r < 2 && (c + r) % 3 === 0) || (r > 0 && Math.abs(c - 16) >= half[r - 1] && (c + r) % 2 === 0);
      G.put(r, c, edge ? 'o' : ch);
    }
  });
}

// The hobbit's head, its curls a unit over the head's top: the face's brows on row 13 and its chin on row 24.
function hobbitHead(shut) {
  const G = qdGrid(32, 26);
  hdCurls(G, [4, 7, 9, 10, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 11, 10]);
  G.all(13, 9, hdBrowFace('sabbbssssbbbas', shut).map((row, r) => (r === 6 ? row.replace(/u/g, 'z') : row)));
  G.all(11, 9, ['ccdbsscbcdssbc', 'sbcsssbssssbcs']);
  G.all(15, 5, ['.pp.', 'ptsp', 'ptrp', '.psp', '..pp']);
  G.all(15, 23, ['.pp.', 'psrp', 'prqp', 'prp.', 'pp..']);
  return G.rows();
}
// A waistcoat with brass buttons open over a white shirt with a collar.
function hobbitBody(h) {
  const G = hdTorso(24, h, [4, 19], 4);
  G.all(0, 7, ['.XWVVVVUX.', 'XWWVsrVUUX', '.XWWrqVUX.']);
  for (let r = 3; r < h - 2; r += 1) G.put(r, 8, r % 4 === 1 ? '2yUWVVVUy1' : '2XWWVVVUX1');
  G.all(h - 3, 8, ['21WVVU12', '.21VU12.', '..2112..'].map((s) => s.padEnd(10, '.')));
  return G.rows();
}
const HOBBIT_LEGS = { W: 24, at: [5, 12], L: 'DHFFFED', R: 'DFFEEED', lift: 2, bootX: [-5, 0],
  bootL: ['......psrp..', '......prsp..', '...odcdcbsp.', '.psttsssssrp', '..ppppppppp.'],
  bootR: ['..psrp......', '..prqp......', '.psbcbcdo...', 'prsssrrrrqp.', '.ppppppppp..'] };
hdPeople('hobbit', {
  up: 4,
  head: hobbitHead,
  body: hobbitBody,
  legs: (n, step) => hdLegs(n, step, HOBBIT_LEGS),
  arm: { L: 'XWWVU', R: 'VUUUX', cuff: ['W', 'V', 'X'] },
});

// The dwarf's head under a riveted steel helm with a crest knob and a nose guard: bushy brows, a big nose, and a beard
// in locks to the belt that ends in a braid with a gold bead.
function dwarfHead(shut) {
  const G = qdGrid(32, 40);
  G.all(0, 15, ['66', '#6']);
  [8, 14, 18, 20, 22, 24, 24, 26, 26].forEach((w, k) => qdSpan(G, 1 + k, 16, w, k ? '6#0' : '6', k ? (k < 3 ? '0' : '9') : '6', k ? '876' : '6'));
  G.all(2, 13, ['##', '.0#']);
  qdSpan(G, 10, 16, 26, '6', '09#9', '6');
  qdSpan(G, 11, 16, 26, '6', '0', '6');
  qdSpan(G, 12, 16, 26, '6', '7', '6');
  for (let r = 13; r < 19; r += 1) { G.put(r, 4, 'odcb'); G.put(r, 24, 'bbao'); }
  G.all(13, 8, ['ocbbbbcsscbbbbo', 'skkkkssttskkkks', ...(shut ? ['srpppsttssppprs', 'sssssttrrsssss'] : ['sk*jwsttrswj*ks', 'sxijxsttrrxijxs']),
    'suussttrrrsuuss', 'cdussrttrrsusbb', 'dccssrrqqssscbb']);
  G.all(13, 15, ['09', '98', '98', '87']);
  for (let r = 19; r < 35; r += 1) {
    const w = r < 27 ? 26 : r < 31 ? 22 : 16;
    qdSpan(G, r, 16, w + 2, 'o', '.', 'o');
    for (let c = 0; c < w; c += 1) G.put(r, 16 - w / 2 + c, (c + (r >> 2)) % 5 === 1 ? 'e' : c < w * 0.4 ? 'd' : c < w * 0.75 ? 'c' : 'b');
  }
  G.all(19, 12, ['dcbvvvvbcd', '.dcbzzbcd.']);
  G.all(35, 13, ['oddcco', '.oYGo.', '.oygo.', '.ocbo.', '..oo..']);
  return G.rows();
}
// A tunic under the beard, a broad leather belt with a big gold buckle, and a hem of mail below it.
function dwarfBody(h) {
  const G = hdTorso(32, h, [4, 27], 3);
  const belt = h - 8;
  G.all(belt, 0, ['DHHHHHHHHHHGYYYYYGFFFFFFFFFFFEED', 'DFFFFFFFFFFGy+yygGEEEEEEEEEEEEED', 'DFFFFFFFFFFGyyyggGEEEEEEEEEEEEED',
    'DEEEEEEEEEEGGGGGGGEEEEEEEEEEDDDD']);
  for (let r = belt + 6; r < h; r += 1) G.put(r, 0, [...Array(32)].map((_, c) => (c === 0 || c === 31 ? '6' : (c + r) % 2 ? '7' : c < 12 ? '0' : '9')).join(''));
  return G.rows();
}
const DWARF_LEGS = { W: 32, at: [5, 17], L: 'O332221111', R: '112211111O', lift: 2, bootX: [-1, 0],
  bootL: ['DHHFFFFEEED.', 'DHFFFFFEEED.', 'D0#9FFFEEEED', 'DDDDDDDDDDDD'], bootR: ['DFFFFEEEEED.', 'DFFFFEEEEED.', 'DFFFFEEE987D', 'DDDDDDDDDDDD'] };
hdPeople('dwarf', {
  up: 4,
  head: dwarfHead,
  body: dwarfBody,
  legs: (n, step) => hdLegs(n, step, DWARF_LEGS),
  arm: { L: '14432', R: '3221O', cuff: ['0', '8', '6'] },
  // The braid at the beard's end swings back on a stride.
  sway: [[31, 40]],
});

// The orc's head under a dark helm with one crude spike and a riveted rim: a heavy brow over red eyes, a flat nose, a
// wide mouth with tusks rising over the lip, and pointed ears out to the sides.
function orcHead(shut) {
  const G = qdGrid(32, 28);
  G.all(0, 14, ['.6', '60', '606', '6096', '60976', '609876']);
  [14, 20, 22, 24, 26, 26, 26, 26].forEach((w, k) => qdSpan(G, 5 + k, 16, w, k < 2 ? '6#' : '6#0', k < 3 ? '0' : '9', k < 2 ? '76' : '876'));
  G.all(6, 10, ['##', '.#0']);
  qdSpan(G, 13, 16, 26, '6', '78', '6');
  for (const c of [5, 10, 21, 26]) G.put(13, c, '0');
  G.all(14, 7, ['pqqqqqqqqqqqqqqqqp', 'qrrrrrqqssqqrrrrrq', 'srkkkkqsttsqkkkkrs', ...(shut ? ['sqppppqsttsqppppqs', 'ssqrrqssttssqrrqss']
    : ['srkijkqsttsqkjikrs', 'ssqrrqssttssqrrqss']), 'sssssqrsssrqssssss', 'ssssrqpqqqpqrsssss', 'sTsrrrrrrrrrrrsTrq', 'sTvvvvvvvvvvvvvBrq',
  'sBzzzzzzzzzzzzzBqq', 'pqssssssssssssssqp', '.pqqsssssssssqqqp.', '..pppppppppppppp..']);
  G.all(18, 0, ['pp.....', 'qtpp...', '.qttspp', '..qrrsp', '...pppp']);
  G.all(18, 25, ['.....pp', '...ppqq', 'pprrqq.', 'prrqq..', 'pppp...']);
  // Cheek guards hang from the rim either side of the face.
  G.all(14, 3, ['6096', '6096', '6986', '.66.']);
  G.all(14, 25, ['6876', '6876', '6876', '.66.']);
  return G.rows();
}
// Black leather under iron shoulder plates riveted on, a belt with an iron buckle, and a ragged hem.
function orcBody(h) {
  const G = hdTorso(32, h, [9, 22], 7);
  G.all(0, 0, ['.6666666666.', '6#00999998876', '6009999998876', '60999#99988766', '6099999998876', '.68888877766', '..6666666.']);
  G.all(0, 20, ['.6666666666.', '6#0999999876', '60999999987 6', '6099#999988766', '6099999988776', '.6888877766.', '..6666666.'].map((s) => s.replace(' ', '6')));
  const belt = h - 8;
  for (let r = 6; r < belt; r += 1) { const k = Math.round(((r - 6) * 9) / (belt - 6)); G.put(r, 7 + k, 'DHFD'); G.put(r, 21 - k, 'DFED'); }
  G.put(Math.round((belt + 6) / 2), 14, '6#06');
  G.all(belt, 0, ['DFFFFFFFFFFF6#0996FFFFFFFFFFFEED', 'DFFFFFFFFFFF609986EEEEEEEEEEEEED', 'DEEEEEEEEEEE698876EEEEEEEEEEEEED',
    'DEEEEEEEEEEE666666EEEEEEEEEEEDDD']);
  for (let c = 1; c < 31; c += 1) if (c % 4 === 1) G.put(h - 1, c, ' ');
  return G.rows();
}
const ORC_LEGS = { W: 32, at: [5, 17], L: 'O332221111', R: '112211111O', lift: 3, bootX: [-1, 0],
  bootL: ['DFFHFFEEED..', 'DHFFFEEEED..', 'DHFFFFEEEED.', 'DDDDDDDDDDDD'], bootR: ['DFFFEEEEED..', 'DFFFEEEEED..', 'DFFFFEEEEED.', 'DDDDDDDDDDDD'] };
hdPeople('orc', {
  up: 8,
  head: orcHead,
  body: orcBody,
  legs: (n, step) => hdLegs(n, step, ORC_LEGS),
  arm: { L: 'pttsr', R: 'srrqp', cuff: ['0', '8', '6'] },
});
