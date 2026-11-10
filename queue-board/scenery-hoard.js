// scenery-hoard.js: Erebor's treasure storehouse and armor stand in the Middle-earth view. realmProps (scenery-props.js)
// places them through PROP_MORE in the lower band beside the front row of stations, clear of the Sentry's post and its
// Ranger at home on the road; the wall's foot is already the ore's and the gems'. The storehouse is a vault cut into an
// outcrop of rock: a dressed-stone doorway with a rune over it and its heavy iron-bound door swung open, the hoard of
// gold and gems inside growing as dwarves bring gems (the realm's tally keeps the count, capped to fit). The armor stand
// is a small anvil on a stump, a quench trough and a stand holding a breastplate and helm, with pegs on its arms where
// finished pieces hang until the stand is full and is cleared. drawProp draws both through PROP_DRAW; what the dwarf at
// the stand is doing (a hot plate on the anvil) is scene-hoard.js's state in the tally. All of it is 32-bit art, a
// quarter unit a pixel, lit from the upper left whichever way it faces, painted once (propArt). Loaded after
// scenery-farm.js.
const HOARD_MAX = 24;
const ARMOR_MAX = 4;

PROP_MORE.dwarf = (r, P, fit, outs, desks) => {
  for (const s of sc.stations) {
    if (s.realm !== r || !s.sentry) continue;
    const b = [s.x - 26, FARM_LOW - 15, s.x + 6, ROAD_Y + 8];
    outs.push(b);
    desks.push(b);
  }
  P.vault = fit('vault', 14, 13, FARM_LOW, xsFrom(r.x0 + 2, r.x0 + r.w - 16), 4);
  const xs = xsFrom(r.x0 + 2, r.x0 + r.w - 23);
  P.armor = fit('armor', 21, 13, FARM_LOW, xs, 5, true) ?? fit('armor', 21, 13, PROP_MID, xs, 5, true);
  if (P.armor) {
    // Pieces go up on the stand from the spot at its far end, or else from in front of it.
    const a = P.armor;
    a.hang = a.spots[1] ?? { x: a.side > 0 ? a.x + 9 : a.x + 11, y: a.base + 3, face: a.side > 0 ? -1 : 1 };
  }
};

// The vault's colours: rock (a to e, o its outline, q softer), dressed stone (A to E, m mortar), the dark inside (D, k
// deeper) and its floor (f), the rune over the door (G, g), and the door's oak (L to N) and iron (H to J, w a rivet).
// The stone's shade is F, since D is the dark.
const VAULT_PAL = { ...propRamp6('#6a6572', 'abcdeo'), q: '#3e3a44', ...propRamp6('#d6d0c4', 'ABCFE.'), m: '#7a7468', D: '#17141c', k: '#0e0c12',
  f: '#262029', G: '#ffe58a', g: '#c98f22', ...propRamp6('#6a4a2e', 'LlMNn.'), ...propRamp6('#9aa4b1', 'HhIJ.K'), w: '#e6ecf2' };
// The vault cut into a mound of rock in facets: a doorway of dressed stone, its jambs in courses and its arch in wedge
// stones round the dark room, a threshold, a gold rune over it, and the oak door swung open against the rock beside it,
// bound with two iron straps and a ring. flip puts the doorway at the right, the light still from the left.
function vaultArt(flip) {
  const G = rockEdge(propRock(propGrid(56, 52), 30.5, flip ? 26 : 30, 29, 28, 49, 'abcde', 11, 9));
  // The doorway: an arch of radius 12 over jambs from row 24 down, its room 24 wide; the arch's wedge stones are parted
  // by joints that run out from its centre, the jambs' blocks by courses of mortar.
  const cx = flip ? 32 : 24;
  G.rect(8, 0, 44, 56, (r, c) => {
    const dx = c + 0.5 - cx;
    const a = Math.abs(dx);
    const top = r < 24 ? Math.hypot(dx, r + 0.5 - 24) : a;
    if (r >= 48) return a <= 16 ? 'ACE.'[r - 48] : undefined;
    if (top < 12) return r >= 42 ? 'f' : r < 18 || a > 10 ? 'k' : 'D';
    if (top >= 16) return undefined;
    if (r < 24 ? ((Math.atan2(r + 0.5 - 24, dx) / Math.PI) * 7 + 7) % 1 < 0.14 : (r - 24) % 6 === 5) return 'm';
    return top > 15 ? 'E' : dx < 0 ? (top > 14 ? 'A' : 'B') : top > 14 ? 'F' : 'C';
  });
  G.map(1, cx - 2, ['G.G.G', '.GGG.', '..G..', '..G..', '..g..']);
  // The door, swung open: three planks of oak lit on their left, two straps riveted across and a ring to pull it by.
  const d0 = flip ? 0 : 40;
  G.rect(12, d0, 36, 16, (r, c) => {
    const x = c - d0;
    if (x === 0 || x === 15 || r === 12 || r === 47) return 'n';
    if (r === 18 || r === 19 || r === 38 || r === 39) return x % 5 === 2 && r % 2 === 0 ? 'w' : r % 2 ? 'I' : 'h';
    return x % 5 === 0 ? 'N' : x % 5 === 1 ? 'L' : x % 5 === 4 ? 'M' : 'l';
  });
  G.map(27, d0 + (flip ? 10 : 3), ['.HH.', 'H..J', 'H..J', '.JJ.']);
  return G.rows();
}
// A piece of the hoard in its unit square, a pixel bigger to the right and above so the pile laps over itself: a coin
// lying tilted, or a cut gem.
const HOARD_SHAPES = { coin: ['.....', '.aab.', 'abbcd', '.cdd.', '.....'], gem: ['.aab.', 'abbcc', '.ccd.', '..d..', '.....'] };
const HOARD = [PX.gold, '#d4a02a', PX.gold, GEMS[0][0], PX.gold, '#fff3c4', GEMS[1][0], '#d4a02a', GEMS[2][0], PX.gold, GEMS[3][0]];
const hoardShape = (c) => (c === PX.gold || c === '#d4a02a' || c === '#fff3c4' ? 'coin' : 'gem');
// The vault, its doorway at the end its spot is on. st.hoard is how much treasure is inside.
function drawVault(g, p, st, tick) {
  const flip = p.side > 0;
  const col = (c, w = 1) => (flip ? p.x + 14 - c - w : p.x + c);
  propArt(g, `vault${flip}`, VAULT_PAL, () => vaultArt(flip), p.x, p.y);
  // The heap, from the floor up, each row a little narrower: coins and gems lit at their upper left; one now and then
  // catches the light.
  let n = 0;
  const count = Math.min(HOARD_MAX, st.hoard ?? 0);
  for (let row = 0; row < 6 && n < count; row += 1) {
    const w = row < 2 ? 6 : row < 4 ? 4 : 2;
    for (let i = 0; i < w && n < count; i += 1, n += 1) {
      const c = HOARD[(n * 5 + row) % HOARD.length];
      const [x, y] = [col(3 + (6 - w) / 2 + i), p.y + 11 - row];
      propArt(g, `hoard:${c}`, propRamp6(c, 'abcde'), () => HOARD_SHAPES[hoardShape(c)], x, y - 0.25);
      if ((tick + n * 7) % 50 === 0) heapGlint(g, x + 0.5, y + 0.25);
    }
  }
}
PROP_DRAW.vault = drawVault;

// The armor stand's colours: steel (P to T, o its outline), the helm's eye holes (k), gold (G, g, Y), and wood (U to Z).
const ARMOR_PAL = { ...propRamp6('#b8c2ce', 'PQRSTo'), k: '#120e16', G: '#f2c14e', Y: '#fff1a8', g: '#a8761c', ...propRamp6('#8a5a32', 'UVWXZu'),
  ...propRamp6('#4a95f0', 'ABC...'), b: '#5a3c24', B: '#7b5638' };
// The anvil on its stump: a steel face lit along its top, its horn out to one side (the left, or the right when flip), its
// waist narrow over a heavy foot, on a stump with bark at its sides and its cut top pale.
const ANVIL = ['...xxxxxxxxxxxxxxxxx....', 'xxxxxxxxxxxxxxxxxxxx....', '.xxxxxxxxxxxxxxxxxxx....', '....xxxxxxxxxxxxxxxx....',
  '.......xxxxxxxxxx.......', '......xxxxxxxxxxxx......'];
function anvilArt(flip) {
  const G = propGrid(24, 16);
  ANVIL.forEach((row, r) => [...(flip ? [...row].reverse().join('') : row)].forEach((ch, c) => {
    if (ch === 'x') G.set(r, c, r === 0 ? 'P' : 'PQRST'[Math.min(4, (c < 8 ? 1 : c < 15 ? 2 : 3) + (r > 2 ? 1 : 0))]);
  }));
  G.rect(6, 3, 10, 18, (r, c) => (r === 6 ? (c < 8 ? 'U' : 'V') : c < 5 ? 'b' : c > 18 ? 'Z' : r % 4 === 1 && c % 5 === 2 ? 'X' : c < 9 ? 'V' : 'W'));
  return G.edge((k, side) => ('UVWXZbB'.includes(k) ? 'u' : side === 't' ? 'S' : 'o')).rows();
}
// The quench trough: a wooden box brimming with water, its front rim lit, its front planked.
function quenchArt() {
  const G = propGrid(20, 12);
  G.rect(0, 1, 1, 18, 'V').rect(1, 1, 3, 18, (r, c) => (c === 1 ? 'V' : c === 18 ? 'X' : r === 1 ? 'A' : r === 2 ? 'B' : 'C'));
  G.rect(4, 1, 7, 18, (r, c) => (r === 4 ? 'U' : c % 6 === 0 ? 'X' : c < 4 ? 'V' : 'W'));
  return G.edge(() => 'u').rows();
}
// The stand: a helm with eye holes either side of its nose guard over a breastplate lit on its left with a ridge down
// its middle and a gold trim at the neck and a gold-trimmed belt, on a crossbar whose pegs hang at both ends, a post and
// a foot.
function standArt() {
  const G = propGrid(40, 44);
  G.rect(15, 0, 3, 40, (r) => 'UVX'[r - 15]).rect(18, 2, 6, 3, (r, c) => 'VWX'[c - 2]).rect(18, 35, 6, 3, (r, c) => 'VWX'[c - 35]);
  G.rect(27, 18, 14, 4, (r, c) => 'UVWX'[c - 18]).rect(41, 10, 3, 20, (r, c) => (r === 41 ? 'U' : c < 14 ? 'V' : 'W')).rect(11, 18, 1, 4, 'W');
  G.rect(12, 8, 15, 24, (r, c) => {
    const w = 12 - Math.max(0, r - 18) * 0.5;
    const dx = c + 0.5 - 20;
    if (Math.abs(dx) > w) return '.';
    if (r === 12 && Math.abs(dx) < 4) return 'G';
    if (Math.abs(dx) < 0.6) return 'P';
    const t = dx < -7 ? 1 : dx < 0 ? 2 : dx < 6 ? 3 : 4;
    return 'PQRST'[Math.min(4, t + (r > 23 ? 1 : 0) - (r < 15 && dx < 0 ? 1 : 0))];
  });
  G.rect(27, 12, 2, 16, (r, c) => (r === 27 ? (c === 19 || c === 20 ? 'Y' : 'G') : 'g'));
  G.ball(6, 20, 6, 7.5, 'PQRST').cut(9, 0, 3, 40);
  G.rect(6, 12, 1, 16, (r, c) => (c < 20 ? 'G' : 'g')).map(7, 14, ['RRRRRQRRRRRR', 'kkkRSPRRkkkS', 'kkkRRPSSkkkS', 'RR..RPS...SS']);
  return G.edge((k, side) => ('UVWXZ'.includes(k) ? 'u' : side === 't' || side === 'l' ? 'S' : 'o')).rows();
}
// A finished piece on a peg: a little breastplate, or a helm.
const PIECE = [['.oooooo.', 'oPQQRSTo', 'oQQRRSTo', '.oQRRSo.', '.oQRRSo.', '..oGgo..', '..oooo..'],
  ['..oooo..', '.oPQRSo.', 'oPQQRRSo', 'oQRRRSTo', 'okkRRkko', 'oR.RS.So', '.o.oo.o.']];
// The armor stand, 21 columns: the anvil at the end its spot is on, then the trough, then the stand. st.anvil is set
// while a plate is on the anvil (scene-hoard.js), and st.armor counts the finished pieces on the pegs below its arms:
// a plate each side, then a helm under each.
function drawArmor(g, p, st, tick) {
  const flip = p.side > 0;
  const col = (c, w = 1) => (flip ? p.x + 21 - c - w : p.x + c);
  const base = p.base;
  propArt(g, `anvil${flip}`, ARMOR_PAL, () => anvilArt(flip), col(0, 6), base - 3);
  if (st.anvil) {
    // The plate glowing on the anvil's face, white at its heart, flickering hotter and cooler.
    const hot = tick % 4 < 2;
    pxBox(g, col(2, 3), base - 3.5, 3, 0.25, hot ? '#fff1a8' : PX.emberL);
    pxBox(g, col(2, 3), base - 3.25, 3, 0.25, hot ? PX.emberL : PX.ember);
    pxBox(g, col(2, 3) + 0.75, base - 3.5, 1.5, 0.25, '#fffbe8');
    sc.glow?.add(col(2, 3) + 1.5, base - 3.25, 3, '#ff9a3c', 0.3, { flame: p.x, wobble: 0.6 });
  }
  propArt(g, 'quench', ARMOR_PAL, quenchArt, col(6, 5), base - 2);
  // The water's sheen drifts along the trough.
  pxBox(g, col(7, 3) + ((tick >> 2) % 9) / 4, base - 1.5, 0.75, 0.25, '#e6f2ff');
  propArt(g, 'stand', ARMOR_PAL, standArt, col(11, 10), base - 10);
  for (let i = 0; i < Math.min(ARMOR_MAX, st.armor ?? 0); i += 1) {
    propArt(g, `piece${i >> 1}`, ARMOR_PAL, () => PIECE[i >> 1], col(i % 2 ? 19 : 11, 2), base - 4 + (i >> 1) * 2);
  }
}
PROP_DRAW.armor = drawArmor;
