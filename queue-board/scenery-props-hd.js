// scenery-props-hd.js: the 32-bit art of scenery-props.js's props in Erebor and the Shire, a quarter unit a pixel,
// registered in PROP_DRAW: the rocks of ore and of gems, the chest of gems, the kettle and barrel, and the carts (the
// scroll rack, the straw target and the sacks are in scenery-props-qd.js). Each material has a ramp of six steps
// (propRamp6), warm in the light and cool in the shade, lit from the upper left, with an outline in its own darkest hue;
// each prop is painted once on a canvas (propArt) and mirrored to face its worker. Every prop keeps the footprint and the
// spots realmProps gives it, and the heaps (drawHeap) build on it in the same places. Also the Shire's gardens
// (drawGardens), whose ground scenery-land.js paints and whose plants scene-wind.js bends with the wind. Loaded after
// scenery-props.js.

// A rock in a grid: a bumpy ellipse (centre cy, cx, radii ry, rx) cut flat at row floor, its face broken into flat facets
// lit from the upper left, the top edge of each facet catching the light and its foot a dark crack, darker toward the
// ground. keys run from shine to deep.
function propRock(G, cy, cx, ry, rx, floor, keys, seed, n = 7) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = rnd(seed + i * 13) * 6.283;
    const d = Math.sqrt(rnd(seed + i * 29)) * 0.8;
    const [y, x] = [Math.sin(a) * d, Math.cos(a) * d];
    return [cy + y * ry, cx + x * rx, -0.5 * x - 0.62 * y + 0.6 * Math.sqrt(1 - d * d) + (rnd(seed + i * 7) - 0.5) * 0.3];
  });
  const inside = (r, c) => {
    const [dx, dy] = [(c + 0.5 - cx) / rx, (r + 0.5 - cy) / ry];
    const k = 1 + 0.07 * Math.sin(3 * Math.atan2(dy, dx) + seed) + 0.05 * Math.sin(5 * Math.atan2(dy, dx) + seed * 2);
    return r <= floor && dx * dx + dy * dy <= k * k;
  };
  const facet = (r, c) => pts.reduce((b, [y, x], i) => { const d = (y - r - 0.5) ** 2 + (x - c - 0.5) ** 2; return d < b[1] ? [i, d] : b; }, [0, 1e9])[0];
  G.rect(0, 0, G.h, G.w, (r, c) => {
    if (!inside(r, c)) return '.';
    const f = facet(r, c);
    const l = pts[f][2];
    let t = l > 0.75 ? 0 : l > 0.5 ? 1 : l > 0.2 ? 2 : l > -0.1 ? 3 : 4;
    if (inside(r - 1, c) && facet(r - 1, c) !== f) t = Math.max(0, t - 1);
    else if (inside(r + 1, c) && facet(r + 1, c) !== f) t = 4;
    return keys[r >= floor - 1 ? Math.max(t, 3) : t];
  });
  return G;
}
// The outline of a rock or a crystal: its darkest hue below and to the right, a step softer on its lit sides.
const rockEdge = (G, soft = 'q') => G.edge((k, side) => (side === 't' || side === 'l' ? soft : 'o'));
// A shadow on the ground under a prop: a row of soft dark from column c0 to c1.
const SHADOW = 'rgba(20,13,30,0.32)';

// A boulder of grey rock in facets with veins of copper ore, each lit along its top, and flecks of silver; three seeds
// give three boulders.
const ORE_PAL = propRamp6('#8e8a96', 'abcdeo', { q: hdMix('#5e5a68', HD_DARK, 0.35), z: SHADOW, ...propRamp6('#f0a33a', 'PQRST.'), w: '#ffffff', x: '#c8d4e2', y: '#7d8a9c' });
const ORE_VEIN = ['.PQ', 'QRS', 'RST', 'ST.'];
function oreArt(seed) {
  const G = propRock(propGrid(24, 24), 12.5, 12, 11, 11, 21, 'abcde', seed);
  [[5, 6], [11, 14], [14, 4], [6, 16]].slice(0, 3 + (seed % 2)).forEach(([r, c], i) => G.map(r + (seed % 3), c - i, ORE_VEIN));
  G.map(9, 9 + (seed % 3), ['wx', 'xy']).map(16, 15, ['x', 'y']);
  rockEdge(G);
  return G.rect(23, 3, 1, 18, 'z').rows();
}
// A dark rock with crystals of the four gems growing out of it: two points out of the top, two faces in its side, each
// crystal lit on its left face, dark on its right, with a glint at its tip.
const GEM_ROCK_PAL = { ...propRamp6('#625e6b', 'abcdeo'), q: '#3a3644', z: SHADOW, w: '#ffffff' };
const GEM_KEYS = ['FGHIf', 'JKLSj', 'MNPTm', 'UVXYu'];
GEMS.forEach(([light, dark], i) => {
  const [s, l, m, d, o] = GEM_KEYS[i];
  Object.assign(GEM_ROCK_PAL, { [s]: hdMix(light, '#ffffff', 0.5), [l]: light, [m]: hdMix(light, dark, 0.5), [d]: dark, [o]: hdMix(dark, HD_DARK, 0.6) });
});
// A crystal standing up, its lit face on the left and its point on top; keys run from its lit face to its dark one.
const CRYSTAL = ['.0..', '01..', '012.', '0123', '0123', '0123', '0123', '0223', '0223'];
const crystal = (G, r, c, keys, rows = CRYSTAL) => G.map(r, c, rows.map((s) => s.replace(/\d/g, (d) => keys[d])));
// The crystals swap ends on a rock that faces right (flip), the rock still lit from the left.
function gemRockArt(flip) {
  const G = propGrid(28, 24);
  const at = (c, w = 4) => (flip ? 28 - c - w : c);
  crystal(G, 0, at(5), 'FGHI');
  crystal(G, 3, at(9), 'GHII', CRYSTAL.slice(0, 7));
  crystal(G, 1, at(19), 'JKLS');
  G.put(0, at(5) + 1, 'w').put(1, at(19) + 1, 'w');
  propRock(propGrid(28, 24), 15, 14, 8.5, 13, 21, 'abcde', 5, 6).rows().forEach((row, r) => G.put(r, 0, r < 11 ? row.replace(/./g, (ch, c) => (G.at(r, c) === '.' ? ch : '.')) : row));
  // The faces in its side: a green one low on the left, a violet one on the right.
  G.map(14, at(6), ['.MN.', 'MwNP', 'MNPT', '.TT.']).map(15, at(18), ['.UV.', 'UwVX', 'UVXY', '.YY.']);
  G.edge((k, side) => ('FGHI'.includes(k) ? 'f' : 'JKLS'.includes(k) ? 'j' : side === 't' || side === 'l' ? 'q' : 'o'));
  return G.rect(23, 3, 1, 22, 'z').rows();
}
PROP_DRAW.ore = (g, p) => propArt(g, `ore${p.x % 3}`, ORE_PAL, () => oreArt(1 + (p.x % 3) * 4), p.x, p.y);
PROP_DRAW.gems = (g, p) => propArt(g, `gemrock${p.side > 0}`, GEM_ROCK_PAL, () => gemRockArt(p.side > 0), p.x, p.y);

// The chest, open: its lid stands up behind, the dark inside shows above an iron rim, three planks of oak run across its
// front with grain in them, two iron straps riveted down it, iron at its corners and a gold lock in the middle. The gems
// heap up in its mouth.
const CHEST_PAL = { ...propRamp6('#8a5a32', 'abcdeo'), l: '#4f321c', L: '#6a4426', k: '#2e1d12', i: '#140c08',
  ...propRamp6('#8d97a4', 'FGHIJK'), ...propRamp6('#e9b746', 'PQRST.'), z: SHADOW };
function chestArt() {
  const G = propGrid(44, 32);
  G.rect(3, 2, 9, 40, 'K').rect(4, 3, 1, 38, 'b').rect(5, 3, 5, 38, (r, c) => ((c - 3) % 9 === 8 ? 'k' : r === 5 ? 'L' : 'l'));
  G.rect(5, 3, 5, 2, 'H').rect(5, 39, 5, 2, 'I').rect(10, 3, 2, 38, 'i');
  G.rect(12, 0, 3, 44, (r) => 'GHI'[r - 12]);
  G.rect(15, 0, 15, 44, (r, c) => {
    const k = (r - 15) % 5;
    const grain = rnd(r * 7 + Math.floor(c / 3)) > 0.82;
    return k === 0 ? (c > 34 ? 'c' : 'b') : k === 4 ? 'e' : grain ? 'd' : c > 36 ? 'd' : 'c';
  });
  for (const c of [0, 7, 34, 41]) G.rect(12, c, 18, 3, (r, x) => 'GHI'[x - c]);
  for (const c of [8, 35]) for (const r of [17, 22, 27]) G.put(r, c, 'F').put(r + 1, c, 'J');
  G.map(13, 18, ['KKKKKKKK', 'KQQQQRSK', 'KQPRRRSK', 'KQRRRRSK', 'KRRkkRSK', 'KRRkkSSK', 'KSSRkSTK', 'KSSSSSTK', '.KKKKKK.']);
  G.rect(12, 0, 19, 1, 'K').rect(12, 43, 19, 1, 'K').rect(30, 0, 1, 44, 'o').rect(31, 2, 1, 40, 'z');
  return G.rows();
}
PROP_DRAW.chest = (g, p, st, tick) => {
  propArt(g, 'chest', CHEST_PAL, chestArt, p.x, p.y);
  drawHeap(g, p.x + 1, p.y + 2, [9, 7, 5], st.gems, GEM_PILE, tick);
};

// The kettle on its fire beside a barrel of ale: the barrel's staves bulging between two iron hoops under its lid, and
// the black pot's lit rim round a head of foam over its round dark belly, on two logs; the fire is drawn over it. The two
// swap ends to face the worker, each still lit from the left.
const BREW_PAL = { ...propRamp6('#8a5a32', 'abcdeo'), ...propRamp6('#8d97a4', 'FGHIJK'), ...propRamp6('#4a4654', 'lmnpqr'),
  g: '#cfcbe0', A: '#fff2c4', B: '#f6cf6a', C: '#e0a83a', x: '#3a2216', X: '#6a4426', z: SHADOW };
function barrelArt() {
  const G = propGrid(14, 20);
  for (let r = 1; r < 19; r += 1) {
    const hw = 5.5 + Math.sin((Math.PI * r) / 19) * 1.2;
    for (let c = 0; c < 14; c += 1) {
      const nx = (c + 0.5 - 7) / hw;
      if (Math.abs(nx) > 1) continue;
      const hoop = r === 4 || r === 5 || r === 14 || r === 15;
      const t = nx < -0.55 ? 0 : nx < -0.1 ? 1 : nx < 0.45 ? 2 : nx < 0.8 ? 3 : 4;
      G.set(r, c, hoop ? 'FGHIJ'[t] : (c + 1) % 3 === 0 && t > 0 ? 'de'[Math.min(1, t >> 1)] : 'abcde'[t]);
    }
  }
  return G.put(0, 3, 'oooooooo').put(1, 2, 'obbbbbcco').put(2, 2, 'occccddeo').put(11, 7, 'FH').rect(19, 1, 1, 13, 'o').rows();
}
function kettleArt() {
  const G = propGrid(28, 20);
  G.ball(10, 14, 8.5, 14, 'mnnpq').cut(0, 0, 5, 28).put(7, 5, 'gg').put(8, 4, 'g');
  G.edge(() => 'r');
  G.map(1, 3, ['rrrrrrrrrrrrrrrrrrrrrr', 'rlmAAAAAABAAAAABBBnpqr', 'rlmBBCBBBBBCBBBBCCnpqr', 'rllmmmmmmmnnnnnnnppqqr']).rect(5, 2, 1, 24, 'q');
  return G.put(18, 2, 'xXXXXXXXXXXXXXXXXXXXXXXx').put(19, 2, 'xxxxxxxxxxxxxxxxxxxxxxxx').rows();
}
// The fire under the kettle in four frames: tongues of flame from red at their tips through orange to a pale core.
const FLAME_PAL = { Y: '#fff6c8', F: '#ffd25a', f: PX.ember, e: '#d0452a', E: '#8a2a1c' };
const brewFlame = (k) => Array.from({ length: 6 }, (_, r) => Array.from({ length: 28 }, (_, c) => {
  if (c < 3 || c > 24) return '.';
  const h = 2.5 + 3.5 * Math.abs(Math.sin(c * 0.75 + k * 1.9 + Math.sin(c * 0.3 + k))) * (c % 4 === 1 ? 1 : 0.7);
  const up = 5 - r;
  if (up >= h) return '.';
  const t = up / h;
  return t < 0.3 ? (c % 4 === 1 || c % 4 === 2 ? 'Y' : 'F') : t < 0.6 ? 'F' : t < 0.85 ? 'f' : (up > 3 ? 'e' : 'E');
}).join(''));
// The kettle and barrel face the worker who stirs it, its fire flickers and the ale bubbles: a bubble swells on the foam
// and bursts.
PROP_DRAW.brew = (g, p, st, tick) => {
  const kx = p.side < 0 ? p.x : p.x + 4;
  propArt(g, 'barrel', BREW_PAL, barrelArt, p.side < 0 ? p.x + 7.5 : p.x, p.y);
  propArt(g, 'kettle', BREW_PAL, kettleArt, kx, p.y);
  const k = [0, 2, 1, 3][Math.floor(tick / 2) % 4];
  propArt(g, `flame${k}`, FLAME_PAL, () => brewFlame(k), kx, p.y + 3.5);
  const phase = tick % 3;
  if (!phase) return;
  const bx = kx + 1.5 + Math.floor(rnd(Math.floor(tick / 3)) * 14) / 4;
  pxBox(g, bx, p.y + 0.5, phase === 2 ? 0.5 : 0.25, 0.25, '#fffbe8');
  if (phase === 2) pxBox(g, bx + 0.25, p.y + 0.75, 0.25, 0.25, '#e0a83a');
};

// A handcart: a bed of planks under a lit rail, darker end posts, a shaft with a grip to pull it by, and two wheels with
// iron tyres, a lit felloe, six spokes and a hub.
const CART_PAL = { ...propRamp6('#a0703f', 'abcdeo'), ...propRamp6('#6e4a2a', 'ABCDE.'), ...propRamp6('#8d97a4', 'FGHIJK'), z: SHADOW, y: '#33251c' };
function cartWheel(G, r0, c0) {
  G.rect(r0, c0, 12, 12, (r, c) => {
    const [dy, dx] = [r - r0 - 5.5, c - c0 - 5.5];
    const d = Math.hypot(dx, dy);
    const lit = dx + dy < 0;
    if (d > 6) return '.';
    if (d > 5) return lit ? 'H' : 'K';
    if (d > 4) return lit ? 'b' : 'd';
    if (d < 1.6) return d < 0.9 ? (lit ? 'F' : 'H') : 'I';
    const a = (Math.atan2(dy, dx) / (Math.PI / 3) + 6) % 1;
    return Math.min(a, 1 - a) * d < 0.5 ? (lit ? 'c' : 'd') : 'y';
  });
}
// The cart with its shaft to the right, or to the left when left is set, lit from the left either way.
function cartArt(left) {
  const G = propGrid(52, 32);
  const o = left ? 8 : 0;
  G.rect(8, o, 1, 44, 'o').rect(9, o, 1, 44, 'a').rect(10, o, 1, 44, 'b').rect(11, o, 1, 44, 'd');
  G.rect(12, o, 6, 44, (r, c) => (r === 12 ? 'b' : r === 15 ? 'e' : rnd(r * 5 + Math.floor((c - o) / 4)) > 0.85 ? 'd' : c - o > 36 ? 'd' : 'c'));
  G.rect(18, o, 1, 44, 'e').rect(19, o, 1, 44, 'o');
  for (const c of [o + 1, o + 40]) G.rect(9, c, 10, 3, (r, x) => 'ACE'[x - c]);
  G.rect(8, o, 12, 1, 'o').rect(8, o + 43, 12, 1, 'o');
  const s = left ? 0 : 44;
  G.rect(13, s, 1, 8, 'o').rect(14, s, 1, 8, 'b').rect(15, s, 1, 8, 'd').rect(16, s, 1, 8, 'o').map(12, left ? 0 : 48, ['oooo', 'oABo', 'oBCo', 'oCDo', 'oDEo', 'oooo']);
  G.rect(20, o + 3, 1, 38, 'z');
  cartWheel(G, 20, o + 4);
  cartWheel(G, 20, o + 24);
  return G.rows();
}
// The cart's shaft points away from the worker who loads it; vegetables or sacks heap up on its bed.
PROP_DRAW.cart = (g, p, st, tick) => {
  propArt(g, p.side > 0 ? 'cartL' : 'cart', CART_PAL, () => cartArt(p.side > 0), p.x, p.y);
  drawHeap(g, p.x + (p.side > 0 ? 3 : 1), p.y + 1, [9, 7], st.load, st.kind === 'man' ? ['#ddc89c', '#b49d70'] : VEG, tick);
};

// The Shire's own gardens, apart from the plots the hobbits work: beds of leafy clumps either side of the round door
// starred with flowers (petals lit at the top round a centre), wildflowers on the hill, and a vegetable patch of tilled
// ridges and furrows between the hill and the fence where there is room: cabbages along the back and front rows and
// lettuces, a pumpkin or two among them, in the middle (realmProps keeps the same patch clear). parts picks what to
// draw: 'all', the 'ground' (the beds' earth and the patch's soil, which stand still) or the 'plants'. bend(x) says how
// many half units the top of the plant at column x leans with the wind (scene-wind.js), -1 to 1, or null to leave that
// plant out; its top leans that far, its middle half as far, and its foot stays put.
const GARDEN_FLOWERS = ['#e0453a', '#f2c14e', '#ef8fbc', '#fbf6ea', '#9b6fd0'];
const GARDEN_LEAF = { a: '#b6e08a', b: '#7fbf55', c: '#4f8f34', d: '#2f5e20', e: '#e2f5c4' };
const GARDEN_PLANTS = {
  cabbage: [['..aab...', '.abeab..', 'abbebbc.', 'aeabbecd', 'bbbcbccd', 'cbcccdcd', '.cdcddd.', '..dddd..'], GARDEN_LEAF],
  lettuce: [['a..a..a.', 'abaabab.', 'bababbab', 'abbcbbcb', 'bcbbcbcc', 'cbccccdc', '.cdccdd.', '..dddd..'], { ...GARDEN_LEAF, a: '#dcf5a8', b: '#a6d877' }],
  pumpkin: [['...tT...', '..bt....', '.aPPpPq.', 'aPpPPpPq', 'PpPPpPpq', 'pPpPpPqq', '.qpqpqq.', '..qqqq..'],
    { ...GARDEN_LEAF, a: '#ffd9a0', P: '#ffb24a', p: PX.ember, q: '#b0561a', t: '#3f7a2a', T: '#6fae4a' }],
};
const GARDEN_CLUMP = ['..a...', '.abb..', 'abbbc.', '.bbcbc', 'abcbcc', 'bbcccd', '.cbccd', 'bcccdd', '.cddd.', '..dd..'];
// Draws a plant's rows at (x, y): the top two rows lean by b half units, the next two by half that.
function gardenLean(g, rows, pal, x, y, b) {
  qdMap(g, rows.slice(0, 2), pal, x + Math.round(b * 2) / 4, y);
  qdMap(g, rows.slice(2, 4), pal, x + Math.round(b) / 4, y + 0.5);
  qdMap(g, rows.slice(4), pal, x, y + 1);
}
// A bloom: petals round a centre, the top one lit and the bottom one shaded, on a stem.
const GARDEN_BLOOM = ['..l..', '.lcl.', 'lcycd', '.cdd.', '..d..', '..s..'];
const BLOOMS = new Map();
function gardenBloom(c) {
  if (!BLOOMS.has(c)) BLOOMS.set(c, { l: hdMix(c, HD_LIGHT, 0.5), c, d: hdMix(c, PROP_COOL, 0.35), y: c === GARDEN_FLOWERS[1] ? '#b5652a' : '#ffd84a', s: '#2f5e20' });
  return BLOOMS.get(c);
}
function drawGardens(g, r, cx, bend = () => 0, parts = 'all') {
  const ground = parts !== 'plants';
  const lean = (x) => (parts === 'ground' ? null : bend(x));
  const bloom = (x, y, b = 0) => gardenLean(g, GARDEN_BLOOM, gardenBloom(GARDEN_FLOWERS[Math.floor(rnd(x * 3 + y) * GARDEN_FLOWERS.length)]), x, y, b);
  for (const [from, to] of [[cx - 23, cx - 7], [cx + 7, cx + 23]]) {
    const y = GROUND_Y + 6;
    if (ground) {
      pxBox(g, from, y + 0.5, to - from, 2.75, '#3f7a2a');
      pxBox(g, from, y + 3.25, to - from, 0.25, '#7a5634');
      pxBox(g, from, y + 3.5, to - from, 0.25, PX.soil);
      pxBox(g, from, y + 3.75, to - from, 0.25, PX.soilD);
    }
    for (let x = from; x < to - 1; x += 1.5) {
      const b = lean(x);
      if (b !== null) gardenLean(g, GARDEN_CLUMP, GARDEN_LEAF, x, y + 0.5, b);
    }
    for (let x = from; x < to - 1; x += 2) {
      const b = lean(x);
      if (b !== null) { bloom(x, y, b); bloom(x + 1, y + 1.75, b / 2); }
    }
  }
  // Wildflowers on the hill, clear of the door.
  for (let i = 0; i < 14; i += 1) {
    const dx = Math.floor(rnd(cx + i * 13) * 44) - 22;
    const b = lean(cx + dx);
    if (Math.abs(dx) < 7 || b === null) continue;
    const top = GROUND_Y + 6 - Math.floor(Math.sqrt(24 * 24 - dx * dx) * 0.62);
    bloom(cx + dx, top + 2 + Math.floor(rnd(cx + i * 29) * (GROUND_Y + 4 - top - 2)), b);
  }
  const left = cx + 27;
  const right = r.x0 + r.w - 5;
  if (right - left < 14) return;
  const y = GROUND_Y + 10;
  if (ground) {
    // Three ridges of tilled soil, each lit along its crown and dark in the furrow below, flecked with clods.
    const band = ['#3d2818', '#8a6440', '#9a7450', PX.soil, PX.soil, PX.soil, '#80593a', PX.soil, PX.soil, '#6a4a2c', PX.soilD, '#3d2818'];
    for (let k = 0; k < 40; k += 1) pxBox(g, left, y + k / 4, right - left, 0.25, band[k % 12] ?? PX.soil);
    for (let i = 0; i < (right - left) * 3; i += 1) {
      const [fx, fy] = [left + Math.floor(rnd(left + i * 3) * (right - left) * 4) / 4, y + 0.75 + Math.floor(rnd(i * 11 + 5) * 36) / 4];
      pxBox(g, fx, fy, 0.25, 0.25, i % 3 ? '#4f3420' : '#a8825a');
    }
  }
  // Each plant's top leans; its foot stays rooted.
  for (let row = 0; row < 3; row += 1) {
    for (let x = left + 2; x < right - 2; x += 4) {
      const b = lean(x);
      if (b === null) continue;
      const [rows, pal] = GARDEN_PLANTS[row !== 1 ? 'cabbage' : rnd(x + 3) > 0.7 ? 'pumpkin' : 'lettuce'];
      gardenLean(g, rows, pal, x, y + 1 + row * 3, b);
    }
  }
}
