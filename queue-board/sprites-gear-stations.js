// sprites-gear-stations.js: what the Middle-earth view's workers work at and what floats over them, at 32-bit: each
// station at each stage of its PR (drawStation: the elves' desk and scroll, the hobbits' garden bed, the dwarves' anvil
// and blade; the Men's shield is sprites-rohan.js's) and the speech bubbles with their glyphs (drawBubble). scene.js
// calls both. Split out of sprites-gear.js on 2026-11-07, when the 32-bit art made that file too long; it composes its
// art with sprites-gear.js's gearGrid, once on first use, and stamps it with sprites-gear.js's gearMap. Loaded right
// after sprites-gear.js.

// The stations' colours: the desk's wood 0 to 5, gold J j q Q +, the scroll's paper P V U and ink k K, a shadow under it
// (_); soil D d o O S s; leaves G g c C y Y; a withered stalk T t w W; a pumpkin Z z h H a A; steel N n m M L *; a red
// cross R r f; the stump's bark B b and rings x X.
const STATION_Q = {
  0: '#2a1614', 1: '#4e2c1c', 2: '#74462a', 3: '#a8703f', 4: '#cf9a62', 5: '#ecc48e',
  J: '#5e3a12', j: '#a8742a', q: '#e2b043', Q: '#fbdd86', '+': '#fffbe8',
  P: '#fbf4e0', V: '#e6dcc0', U: '#bfb08e', k: '#2b2440', K: '#6a5f80', _: '#1a0f0a55',
  D: '#26160f', d: '#45291a', o: '#654028', O: '#83593a', S: '#a27552', s: '#bf946a',
  G: '#1d3a1c', g: '#2f5e27', c: '#4a8a32', C: '#72b347', y: '#a5d76a', Y: '#d8f2a0',
  T: '#3e2312', t: '#6e4322', w: '#9c6a36', W: '#c4964f',
  Z: '#5a1e0a', z: '#9a3a14', h: '#cc5d1c', H: '#f08a2a', a: '#ffb452', A: '#ffe1a2',
  N: '#23243a', n: '#4b5266', m: '#77839a', M: '#a9b5c4', L: '#d6dfe8', '*': '#ffffff',
  R: '#5e1414', r: '#b22a22', f: '#f0563c', '#': '#160808',
  B: '#3a2416', b: '#5e3c22', x: '#8a6238', X: '#b38654',
};
const stationArt = new Map();
const stationOf = (key, build) => { if (!stationArt.has(key)) stationArt.set(key, build()); return stationArt.get(key); };
// A steady pseudo-random number from n, for grain and clods that stay put.
const gearRnd = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

// The elves' writing desk (and anyone's without a station of their own), 12 by 6 units: wood lit along its top with long
// streaks of grain, a drawer with a gold knob, and turned legs. The approved 32-bit sample's desk.
function gearDesk() {
  const G = gearGrid();
  for (let c = 0; c < 48; c += 1) {
    const end = c === 0 || c === 47;
    G.put(0, c, end ? '0' : '4');
    for (let r = 1; r <= 5; r += 1) G.put(r, c, end ? '0' : '3');
    G.put(6, c, end ? '0' : '2').put(7, c, '1');
    for (let r = 8; r <= 10; r += 1) G.put(r, c, end ? '0' : c < 3 || c > 44 ? '1' : '2');
    G.put(11, c, '0');
  }
  for (let r = 1; r <= 5; r += 1) {
    let c = 1 + Math.floor(gearRnd(r) * 6);
    while (c < 46) {
      const len = 5 + Math.floor(gearRnd(r * 31 + c) * 9);
      G.put(r, c, '2'.repeat(Math.min(len, 46 - c)));
      c += len + 4 + Math.floor(gearRnd(r * 17 + c) * 8);
    }
  }
  G.all(8, 18, ['111111111111', '133333JQj331', '1222222J2221']);
  for (const c0 of [4, 40]) for (let r = 12; r < 24; r += 1) G.put(r, c0, r === 15 || r === 21 ? '5320' : r === 23 ? '0000' : '3210');
  return G.done()[0];
}
// The scroll on the desk: paper len pixels long between two rollers capped in gold, lines of looped writing (the first
// line only half written while it builds) and a shadow under it.
const GEAR_WORDS = '..kKk.kk.KkkK..kKk.kKkk.k.Kk.';
function gearScroll(len, lines) {
  const G = gearGrid();
  for (let c = 3; c < len + 3; c += 1) {
    const w1 = GEAR_WORDS[c % GEAR_WORDS.length];
    const w2 = GEAR_WORDS[(c + 7) % GEAR_WORDS.length];
    G.put(1, c, 'P').put(2, c, c < 3 + lines * len && w1 !== '.' ? w1 : 'P').put(3, c, 'V');
    G.put(4, c, lines > 1 && c < len - 4 && w2 !== '.' ? 'K' : 'V').put(5, c, 'V').put(6, c, 'U').put(7, c, '_');
  }
  for (const c0 of [0, len + 3]) G.all(0, c0, ['jQj', '4ww'.replace(/w/g, '3'), '322', '322', '322', '322', '311', 'jJJ', '._.']);
  return G.done()[0];
}
// A red cross where CI failed and a four-pointed gold sparkle where it passed.
const GEAR_CROSS = ['.RR....RR.', 'RffR..RfrR', 'RfffRRfrrR', '.RfffrrrR.', '..RffrrR..', '..RffrrR..', '.RffrRrrR.', 'RffrR.RrrR',
  'RfrR...RrR', '.RR.....R.'];
const GEAR_SPARK = ['...Q...', '...q...', '..QqQ..', 'Qq+++qQ', '..QqQ..', '...q...', '...Q...'];
const GEAR_SPARK_SMALL = ['.Q.', 'Q+Q', '.Q.'];

// The hobbits' raised bed, 14 by 3 units: a mound of tilled soil in furrows with clods, behind a plank front.
function gearBed() {
  const G = gearGrid();
  for (let c = 0; c < 56; c += 1) {
    const edge = c === 0 || c === 55;
    const furrow = (c + 3) % 8;
    G.put(0, c, edge || c % 7 === 3 ? '.' : 'D');
    for (let r = 1; r <= 5; r += 1) G.put(r, c, edge ? 'D' : r === 1 ? (furrow < 3 ? 's' : 'S') : furrow === r || furrow === r + 4 ? 'o' : r > 3 ? 'O' : 'S');
    if (!edge && gearRnd(c) < 0.18) G.put(1 + Math.floor(gearRnd(c * 7) * 4), c, gearRnd(c * 3) < 0.5 ? 's' : 'd');
    G.put(6, c, edge ? '0' : '4');
    for (let r = 7; r <= 10; r += 1) G.put(r, c, edge ? '0' : c % 18 === 0 ? '1' : r === 10 ? '1' : (r * 13 + c) % 23 < 5 ? '2' : '3');
    G.put(11, c, '0');
  }
  for (const c of [2, 17, 36, 53]) G.put(8, c, '0');
  return G.done()[0];
}
// The bed's plant at each stage, 3 by 3 units: a sprout, a leafy seedling, a withered stalk, and ripe, a cabbage (the
// middle plant a pumpkin).
const GEAR_PLANT = [null,
  ['............', '............', '............', '............', '............', '.....Gy.....', '...GyyG.GG..', '..GcCyGGyCG.',
    '...GGcGGcG..', '......cG....', '......cG....', '......gG....'],
  ['............', '.....GG.....', '....GyCG....', '..GG.GcGGG..', '.GyCGGcGyCG.', '.GcCCgcGCcgG', '..GccgcgcgG.', 'GGGGgccgGGG.',
    'GyCCGgcGyCCG', '.GgcgGcGcgG.', '..GGG.cGGG..', '......gG....'],
  ['............', '.....TT.....', '....TwWT....', '...TwTWT.T..', '..Tw..tT.TW.', '..T...tTTwT.', '......tTwT..', '.....TtT....',
    '...TT.tT....', '..TwwTtT....', '...TT.tT....', '......tT....'],
  ['............', '............', '....GGGG....', '..GGyCCyGG..', '.GyCyyCCcCG.', 'GcCyYyCcCcgG', 'GcCCyCcCcgcG', 'GgcCCcCcgcgG',
    '.GgcCcccgcG.', '.GGgcgcggGG.', '..GGGGGGGG..', '............'],
];
const GEAR_PUMPKIN = ['............', '.....GcG....', '......cG....', '...ZZZgZZ...', '.ZhHHaHHHhZ.', 'ZhHaAaHHhhzZ', 'ZhHaaHhHhzzZ',
  'ZhHHHHhHhzzZ', 'ZzhHHhzhzzzZ', '.ZzhhzzzzzZ.', '..ZZZZZZZZ..', '............'];

// The dwarves' anvil, 12 by 6 units: a steel anvil with a horn to the left and a heel to the right, its face lit, on a
// banded stump with its bark and rings.
// Each row of the anvil as its left and right edge and its part: the outline across the top, the lit face, the body,
// the underside of the horn and heel, the waist and the foot.
const GEAR_ANVIL = [[7, 40, 'top'], [4, 41, 'face'], [1, 42], [0, 44], [1, 44, 'under'], [4, 42, 'under'], [9, 40, 'under'],
  [14, 35], [14, 35], [12, 37], [11, 38, 'under'], [11, 38, 'top']];
function gearStump() {
  const G = gearGrid();
  GEAR_ANVIL.forEach(([L, R, part], r) => {
    for (let c = L; c <= R; c += 1) {
      const edge = c === L || c === R || part === 'top';
      const ramp = part === 'under' ? 'mmmn' : part === 'face' ? (c < 9 ? '*' : 'L') : c < L + 3 ? 'L' : c > R - 4 ? 'n' : c > R - 8 ? 'm' : 'M';
      G.put(r, c, edge ? 'N' : part === 'under' ? (c > R - 5 ? 'n' : 'm') : ramp);
    }
  });
  for (let r = 12; r < 24; r += 1) {
    for (let c = 12; c < 37; c += 1) {
      const edge = c === 12 || c === 36 || r === 23;
      G.put(r, c, edge ? 'B' : r === 12 ? (c < 24 ? 'X' : 'x') : c < 15 ? 'x' : c > 32 ? 'B' : (c * 7 + r * 3) % 11 < 2 ? 'B' : 'b');
    }
  }
  for (const r of [15, 20]) G.put(r, 13, 'B'.repeat(23));
  return G.done()[0];
}
// The blade on the anvil, 8 units long: a wooden tang to the left and the blade lit along its top, in the colours of its
// heat: glowing (flickering while it builds), hot, cracked red, finished gold.
const GEAR_HEAT = { 2: ['#fff1c0', '#ffc24a', '#ff8a2a', '#b8461c'], 3: ['#ff9a80', '#e0452c', '#a82a20', '#5e1414'],
  4: ['#fffbe8', '#fbdd86', '#e2b043', '#8a5a1a'] };
const GEAR_HEAT_STEEL = ['#ffffff', '#d6dfe8', '#a9b5c4', '#4b5266'];
// The blade's palette at each stage (steel while it builds), and the glow creeping up its point.
const GEAR_BLADE_PAL = [1, 2, 3, 4].map((s) => { const h = GEAR_HEAT[s] ?? GEAR_HEAT_STEEL; return { 0: '#2a1614', 1: '#74462a', 2: h[3], 3: h[1], 4: h[2], '+': h[0] }; });
const GEAR_GLOW_PAL = { 2: GEAR_HEAT[2][3], 3: GEAR_HEAT[2][1], 4: GEAR_HEAT[2][2], '+': GEAR_HEAT[2][1] };
const GEAR_BLADE = ['112222222222222222222222222.....', '0133++++++++3333333333333333....', '01333333333333333333333333333...',
  '0144444444444444444444444444444.', '.0444444444444444444444444444...'];
const GEAR_CRACK = ['...#..', '..#...', '..##..', '.#..#.', '#.....'];

// A worker's station; stage is how far its PR has come: 0 nothing, 1 building, 2 PR open, 3 CI failing, 4 green.
// Elves write a scroll that grows, hobbits grow a garden, dwarves forge a blade that glows, fails red and ends gold, Men
// paint a shield of Rohan (drawShieldStation, sprites-rohan.js), and the Sentry's Ranger keeps a post by the road whose
// lantern burns while it works (drawPost, sprites-horse.js).
function drawStation(g, kind, x, y, stage, tick) {
  if (kind === 'hobbit') {
    gearMap(g, stationOf('bed', gearBed), STATION_Q, x - 7, y - 2);
    if (stage) for (const dx of [-5, -1, 3]) gearMap(g, stage === 4 && dx === -1 ? GEAR_PUMPKIN : GEAR_PLANT[stage], STATION_Q, x + dx - 1, y - 5);
  } else if (kind === 'dwarf') {
    gearMap(g, stationOf('anvil', gearStump), STATION_Q, x - 6, y - 5);
    if (!stage) return;
    // The tang in wood and the blade in its heat's tones: still steel while it builds, with its point glowing and the
    // glow creeping and flickering.
    gearMap(g, GEAR_BLADE, GEAR_BLADE_PAL[stage - 1], x - 4, y - 6.25);
    if (stage === 1) {
      const n = 10 + (tick % 4 < 2 ? 0 : 3);
      gearMap(g, GEAR_BLADE.map((row) => row.slice(-n).padStart(32, '.')), GEAR_GLOW_PAL, x - 4, y - 6.25, `glow${n}`);
    }
    if (stage === 3) gearMap(g, GEAR_CRACK, STATION_Q, x - 0.25, y - 6.5);
    if (stage === 4) { gearMap(g, GEAR_SPARK_SMALL, STATION_Q, x + 1, y - 6.25); gearMap(g, GEAR_SPARK, STATION_Q, x + 3, y - 8.5); }
  } else if (kind === 'ranger') {
    drawPost(g, x, y, stage, tick);
  } else if (kind === 'man') {
    drawShieldStation(g, x, y, stage);
  } else {
    gearMap(g, stationOf('desk', gearDesk), STATION_Q, x - 6, y - 5);
    const units = [0, 3, 6, 6, 8][stage];
    if (!units) return;
    gearMap(g, stationOf(`scroll${stage}`, () => gearScroll(units * 4 - 2, stage === 1 ? 0.6 : 2)), STATION_Q, x - 4.5, y - 7.25);
    if (stage === 3) gearMap(g, GEAR_CROSS, STATION_Q, x - 1.75, y - 8);
    if (stage === 4) for (const sx of [x - 5.25, x + 4.5]) gearMap(g, GEAR_SPARK, STATION_Q, sx, y - 8);
  }
}
// Glyphs for the speech bubbles, 12 by 18 quarter units: # in the glyph's colour, + a lighter tint of it.
const GLYPH = {
  ask: ['...++###....', '..+######...', '.+###..####.', '.###....###.', '........###.', '.......####.', '......####..', '.....####...',
    '....####....', '....###.....', '....###.....', '....###.....', '............', '............', '....+##.....', '....###.....',
    '....###.....', '............'],
  alarm: ['....+##.....', '....+###....', '....####....', '....####....', '....####....', '....####....', '....####....', '....####....',
    '....####....', '.....###....', '.....###....', '.....##.....', '............', '............', '....+##.....', '....####....',
    '....####....', '.....##.....'],
  sleep: ['++#########.', '###########.', '###########.', '.......####.', '......####..', '......###...', '.....###....', '....###.....',
    '....###.....', '...###......', '..####......', '.####.......', '.###........', '####........', '###########.', '###########.',
    '###########.', '............'],
  wait: ['############', '############', '.#++++++++#.', '.#++++++++#.', '..#++++++#..', '...#++++#...', '....#++#....', '.....##.....',
    '.....##.....', '....#.+#....', '...#..+.#...', '..#...+..#..', '.#....+...#.', '.#...+++..#.', '.#..+++++.#.', '.#.+++++++#.',
    '############', '############'],
  done: ['............', '............', '..........+#', '.........+##', '........+###', '.......+###.', '......+###..', '.....+###...',
    '##..+###....', '###+###.....', '.#####......', '..####......', '...##.......', '............', '............', '............',
    '............', '............'],
  gone: ['............', '............', '............', '............', '............', '............', '............', '............',
    '............', '............', '............', '............', '............', '............', '.++#...++#..', '.###...###..',
    '.###...###..', '............'],
};
const GLYPH_COLOR = { ask: PX.ember, alarm: PX.red, sleep: '#5b7bd5', wait: '#b08a2e', done: '#2f9a5f', gone: PX.stoneD };
// The bubble, 9 units by 8.5: a rounded body outlined in ink, its white face lit along the top and shaded to the lower
// right, and a tail down to its tip.
function gearBubble() {
  const G = gearGrid();
  const inset = [5, 3, 2, 1, 1];
  for (let r = 0; r < 26; r += 1) {
    const i = r < 5 ? inset[r] : r > 20 ? inset[25 - r] : 0;
    for (let c = i; c < 36 - i; c += 1) {
      const edge = r === 0 || r === 25 || c === i || c === 35 - i;
      const top = r < 5 && (c === i + 1 || r === 1 || (r < 3 && c === i + 2));
      G.put(r, c, edge ? 'o' : top || r === 2 ? '+' : c > 32 - i || r > 22 ? 's' : 'w');
    }
  }
  for (const [r, c, row] of [[25, 13, 'owwwwwwso'], [26, 14, 'owwwwwso'], [27, 14, 'owwwwso'], [28, 15, 'owwwso'], [29, 15, 'owwso'],
    [30, 15, 'owso'], [31, 16, 'oso'], [32, 16, 'oo'], [33, 16, 'o']]) G.put(r, c, row);
  return G.done()[0];
}
const BUBBLE_PX = { o: PX.ink, '+': '#ffffff', w: PX.white, s: '#d9d2c0' };
// A bubble whose tail tip is at (x, y); color overrides the glyph's own (a stalled worker's Z is red). The glyph sits on
// a darker edge of its own colour, down and right by a pixel, so it stands off the white.
function drawBubble(g, x, y, glyph, color = GLYPH_COLOR[glyph]) {
  gearMap(g, stationOf('bubble', gearBubble), BUBBLE_PX, x - 4, y - 9);
  gearPaint(g, `glyph${glyph}${color}`, () => [3.25, 4.75], (c) => {
    qdMap(c, GLYPH[glyph], { '#': hdMix(color, BUBBLE_PX.s, 0.45), '+': hdMix(color, BUBBLE_PX.s, 0.45) }, 0.25, 0.25);
    qdMap(c, GLYPH[glyph], { '#': hdMix(color, PX.ink, 0.35), '+': hdMix(color, PX.ink, 0.35) }, 0.25, 0);
    qdMap(c, GLYPH[glyph], { '#': color, '+': hdMix(color, '#ffffff', 0.45) }, 0, 0);
  }, x - 1, y - 7.5);
}
