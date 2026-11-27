// scenery-farm.js: the Shire's well and pig pen in the Middle-earth view. realmProps (scenery-props.js) places them through
// PROP_MORE, in the lower band beside the front row of stations: the pen as far right as it fits and the well as far
// left, each left out when there is no room. The well is a round stone wall under a little shingled roof on two posts,
// with a crank on the side its user stands, and a rope and bucket that rise while a hobbit winds it. The pen is a small
// fenced yard of mud with a wallow, a trough along the end the hobbits pour into, and two small pigs that wander, root and
// lie down. drawProp draws the well and the pen's front fence through PROP_DRAW; scene-farm.js draws the back of the pen,
// the trough and the pigs as depth-sorted items, so the pigs stand between the fences. What moves (the bucket, the crank,
// the trough's food and water, the pigs) is scene-farm.js's state in the realm's tally. All of it is 32-bit art, a
// quarter unit a pixel, lit from the upper left on either side; what stands still is painted once (propArt). Loaded
// after scenery-props.js.
const FARM_LOW = 158;
const PEN_W = 28;
const PEN_H = 13;
const PEN_POSTS = [0, 9, 18, 27];

// The Shire's ground lines, back to front: the hill's foot, then each row of plots' (scene.js's SC_ROWS; a plot's bed
// stands on its row), down to the last one above the road. Everything standing on the Shire's grass has its foot on
// one, so things in a row share one baseline.
const shireRows = () => [GROUND_Y + 6, ...SC_ROWS.filter((y) => y <= ROAD_Y - 4)];
// The vegetable patch beside the hill, from cx + 27 to the realm's right edge where there is room: its soil runs 10
// units down to the first row of plots' foot, with its fence along its back. Null when there is no room.
function shirePatch(r) {
  const left = r.x0 + Math.floor(r.w / 2) + 27;
  const right = r.x0 + r.w - 5;
  const y = SC_ROWS[0];
  return right - left < 14 ? null : { left, right, y: y - 9, fence: [left - 1, y - 15, right + 1, y - 9] };
}
// The Sentry's lantern posts, whose poles rise from the road into the last row: nothing on the Shire's grass stands in
// front of one.
const shirePosts = (r) => sc.stations.filter((s) => s.sentry && s.realm === r).map((s) => [s.x - 4, ROAD_Y - 18, s.x + 7, ROAD_Y + 2]);
// The pen and the well stand on the last row's line; a pen or well with no room there tries the rows behind it, and
// the well then the hill's foot, and last the line between the first two rows, where it stood before (a short scene's
// two rows can leave no other room for it, and the hobbits' rounds need it).
PROP_MORE.hobbit = (r, P, fit) => {
  const rows = shireRows().slice(1).reverse();
  const first = (type, w, h, bases, xs, gap) => { for (const base of bases) { const p = fit(type, w, h, base, xs, gap); if (p) return p; } return null; };
  P.pen = first('pen', PEN_W, PEN_H, rows, xsFrom(r.x0 + r.w - PEN_W - 2, r.x0 + 2), 4);
  P.well = first('well', 13, 16, [...rows, GROUND_Y + 6, PROP_MID], xsFrom(r.x0 + 2, r.x0 + r.w - 15), 5);
};

// The well's colours: shingles (Q to t, O their outline), wood (a to e, A a post's pale top), stone (C to z, m mortar, j
// a joint), iron (F to I), the dark of the shaft (k) with water (w, W its sheen), and the rope (y, Y).
const WELL_PAL = { ...propRamp6('#b0683c', 'QRrstO'), ...propRamp6('#8a5a32', 'abcdeo'), A: '#d6a86e', ...propRamp6('#b4afa5', 'CLSqzn'),
  m: '#6e6a64', j: '#8d887f', ...propRamp6('#8d97a4', 'FGHI.K'), k: '#10151c', w: '#2f5a76', W: '#9fd0ff', y: '#b8a77a', Y: '#efe4bc' };
// The roof, a hip of shingles seen from the front: courses of tiles lit along their tops, their joints staggered from
// the course above and a dark line under each, the left hip lit and the right one in shade, over a lit eave board.
function wellRoof() {
  const G = propGrid(44, 16);
  for (let r = 0; r < 16; r += 1) {
    const w = Math.min(44, 20 + r * 2);
    const c0 = (44 - w) / 2;
    G.rect(r, c0, 1, w, (y, c) => {
      const x = c - c0;
      if (r === 0 || r === 15 || x === 0 || x === w - 1) return 'O';
      if (r >= 12) return r === 12 ? 'a' : r === 13 ? 'b' : 'd';
      const j = (r - 1) % 3;
      if (j === 2) return 't';
      if (j === 1 && (c + Math.floor((r - 1) / 3) * 2) % 5 === 0) return 't';
      const hip = x < 4 ? -1 : x > w - 5 ? 1 : 0;
      const t = (c < 15 ? 1 : c > 30 ? 3 : 2) + hip + (j === 0 ? -1 : 0);
      return 'QRrst'[Math.max(0, Math.min(4, t))];
    });
  }
  return G.rows();
}
const WELL_ROOF_Q = wellRoof();
// A wooden post a unit wide down rows r0 to r1 at column c, lit on its left with a streak of grain and a pale cap.
const wellPost = (G, c, r0, r1) => G.rect(r0, c, r1 - r0, 4, (r, x) => (r === r0 ? 'A' : ['a', 'b', r % 7 ? 'c' : 'd', 'd'][x - c]));
// Stone courses: blocks lit on their top edge, shaded below, between lines of mortar, the wall darker toward its right.
function wellStones(G, r0, n) {
  G.rect(r0, 1, n, 42, (r, c) => {
    const k = Math.floor((r - r0) / 4);
    const j = (r - r0) % 4;
    if (j === 3 || (c + k * 5) % 10 === 0) return 'm';
    const t = (c < 9 ? 0 : c > 33 ? 2 : 1) + (j === 0 ? 0 : j === 1 ? 1 : 2);
    return 'CLSqz'[Math.min(4, t)];
  });
}
// The back of the well, behind the bucket: the roof, the two posts and the beam under the eave, the axle with its end
// out past the post on the crank's side, and the far rim of the wall over the dark of the shaft and its water.
function wellBack(right) {
  const G = propGrid(44, 52).map(0, 0, WELL_ROOF_Q);
  wellPost(G, 4, 16, 52);
  wellPost(G, 36, 16, 52);
  G.rect(16, 4, 2, 36, (r) => (r === 16 ? 'O' : 'e'));
  G.rect(28, 8, 4, 28, (r) => 'abcd'[r - 28]).rect(28, right ? 40 : 0, 4, 4, (r, c) => (c % 4 === (right ? 3 : 0) ? 'H' : 'abcd'[r - 28]));
  G.rect(44, 0, 8, 44, (r, c) => {
    if (r === 44 || c === 0 || c === 43) return 'n';
    if (r < 47) return c % 7 === 3 ? 'j' : r === 45 ? 'C' : 'L';
    if (r === 47) return 'q';
    return r > 49 ? ((c > 10 && c < 14) || (c > 27 && c < 30) ? 'W' : 'w') : c < 3 || c > 40 ? 'z' : 'k';
  });
  return G.rows();
}
// The front of the wall, before the bucket: its rim of cap stones lit along the top, then two courses of blocks.
function wellFront() {
  const G = propGrid(44, 12);
  G.rect(0, 0, 4, 44, (r, c) => (c === 0 || c === 43 ? 'n' : r === 0 ? 'C' : r === 3 ? 'q' : c % 9 === 4 ? 'j' : c < 10 ? 'C' : 'L'));
  wellStones(G, 4, 7);
  return G.rect(11, 0, 1, 44, 'n').rect(4, 0, 7, 1, 'n').rect(4, 43, 7, 1, 'n').rows();
}
// The bucket: an iron handle over a wooden pail full of water, bound with an iron band.
const WELL_BUCKET = ['....GGHH....', '...G....I...', '..G......I..', '.oooooooooo.', '.oWWwwwwwwo.', '.oabbbbccdo.',
  '.oGGHHHHHIo.', '.oabbbbccdo.', '.oabbbbccdo.', '..oabbccdo..', '..oooooooo..'];
const WELL_KNOB = ['.ab.', 'abcd', 'bccd', '.dd.'];
// Draws the well. st.well is { lift, crank } from scene-farm.js: how far the bucket has risen (0 to 1) and the crank's
// frame (0 to 3: up, out, down, out). The crank is on the side whose spot the hobbit stands at.
function drawWell(g, p, st) {
  const { lift = 0, crank = 2 } = st?.well ?? {};
  const right = p.side > 0;
  const x = right ? p.x : p.x + 2;
  const y = p.y;
  propArt(g, `wellback${right}`, WELL_PAL, () => wellBack(right), x, y);
  // The rope wound on the axle, a twist of light on it, growing as the bucket rises.
  const coil = Math.round(lift * 8) / 4;
  pxBox(g, x + 5 - coil, y + 7, 1 + coil * 2, 1, WELL_PAL.y);
  for (let q = 0; q < (1 + coil * 2) * 4; q += 1) pxBox(g, x + 5 - coil + q / 4, y + 7 + (q % 4) / 4, 0.25, 0.25, WELL_PAL.Y);
  const top = y + Math.round((12 - 4 * lift) * 4) / 4;
  pxBox(g, x + 5.5, y + 8, 0.25, top - y - 8, WELL_PAL.Y);
  pxBox(g, x + 5.75, y + 8, 0.25, top - y - 8, WELL_PAL.y);
  propArt(g, 'wellbucket', WELL_PAL, () => WELL_BUCKET, x + 4, top);
  propArt(g, 'wellfront', WELL_PAL, wellFront, x, y + 13);
  // The crank: its iron arm from the axle's end to the grip, and a wooden knob that pokes out toward the hobbit.
  const gy = y + [5, 7, 9, 7][crank];
  const ax = right ? x + 11 : x - 1;
  pxBox(g, ax + 0.25, Math.min(gy, y + 7) + 0.25, 0.25, Math.abs(gy - y - 7) + 0.5, WELL_PAL.G);
  pxBox(g, ax + 0.5, Math.min(gy, y + 7) + 0.25, 0.25, Math.abs(gy - y - 7) + 0.5, WELL_PAL.I);
  pxBox(g, ax, y + 7.25, 1, 0.5, WELL_PAL.H);
  propArt(g, 'wellknob', WELL_PAL, () => WELL_KNOB, right ? ax + 1 : ax - 1, gy);
}
PROP_DRAW.well = drawWell;

// The pen's columns run from its trough end, mirrored when the trough is at its right.
const penX = (p, c, w = 1) => (p.side > 0 ? p.x + PEN_W - c - w : p.x + c);
// The pen's colours: wood (a to e, Q a cut post's pale top), mud (M to N, its clods and hoof prints), the wallow's water
// (u to v, U its sheen) and the trough's dark floor (f).
const PEN_PAL = { ...propRamp6('#8a5a32', 'abcdeo'), Q: '#d6a86e', ...propRamp6('#7a5634', 'MNPRS.'), u: '#8a7050', U: '#c4b08a', v: '#5e452c', f: '#2e2016' };
// The pen in a grid of its own size, with a unit column c (w wide) counted from its trough end.
const penGrid = (side, h) => { const G = propGrid(PEN_W * 4, h * 4); G.col = (c, w = 1) => (side > 0 ? PEN_W - c - w : c) * 4; return G; };
const penPost = (G, c, r0, r1) => G.rect(r0, c, r1 - r0, 4, (r, x) => (r === r0 ? 'Q' : r === r1 - 1 ? 'e' : ['a', 'b', 'c', 'd'][x - c]));
const penRail = (G, r0) => G.rect(r0, 0, 4, PEN_W * 4, (r, c) => (r === r0 ? 'a' : r === r0 + 3 ? 'e' : rnd(r * 13 + Math.floor(c / 3)) > 0.8 ? 'd' : r === r0 + 1 ? 'b' : 'c'));
// The yard and the back fence, behind the pigs: mud in the shade of the fence at the back, flecked with clods and hoof
// prints, and a wallow of brown water with a pale sheen and a wet dark rim.
function penBack(side) {
  const G = penGrid(side, 12);
  G.rect(12, 4, 36, PEN_W * 4 - 8, (r, c) => {
    const n = rnd(r * 37 + c * 11);
    return r < 15 ? 'R' : n > 0.97 ? 'M' : n > 0.88 ? 'N' : n < 0.06 ? 'R' : 'P';
  });
  const w = G.col(18, 7);
  G.rect(16, w, 12, 28, (r, c) => {
    const [dx, dy] = [(c + 0.5 - w - 14) / 14, (r + 0.5 - 22) / 6];
    const d = dx * dx + dy * dy;
    return d > 1 ? '.' : d > 0.72 ? 'v' : dy < -0.3 && dx < 0.1 && dx > -0.6 ? 'U' : 'u';
  });
  for (const c of PEN_POSTS) penPost(G, G.col(c), 0, 16);
  penRail(G, 4);
  penRail(G, 12);
  return G.rows();
}
function drawPenBack(g, p) {
  propArt(g, `penback${p.side > 0}`, PEN_PAL, () => penBack(p.side), p.x, p.y);
}
// The trough along the pen's end, running from the back fence toward the front: a box of planks, its left side lit and
// its right in shade whichever end it is at, its floor dark when empty, with whatever is in it: vegetables, water that
// ripples, both (vegetables at the back), or nothing. The pigs eat side by side at its open side.
function troughArt() {
  const G = propGrid(16, 32);
  G.rect(0, 0, 32, 4, (r, c) => 'abcd'[c]).rect(0, 12, 32, 4, (r, c) => 'cdde'[c - 12]).rect(0, 4, 2, 8, (r) => (r ? 'c' : 'b'));
  G.rect(2, 4, 26, 8, (r, c) => (c % 4 === 3 ? 'e' : 'f')).rect(28, 0, 4, 16, (r) => 'bcde'[r - 28]);
  return G.edge(() => 'o').rows();
}
function drawTrough(g, p, trough, tick) {
  const food = trough?.food > 0;
  const water = trough?.water > 0;
  const lx = Math.min(penX(p, 2), penX(p, 5));
  propArt(g, 'trough', PEN_PAL, troughArt, lx, p.y + 3);
  if (water) {
    const wy = p.y + (food ? 7 : 3.5);
    pxBox(g, lx + 1, wy, 2, p.y + 10 - wy, '#4a95d6');
    pxBox(g, lx + 1, wy, 2, 0.5, '#8fc8f8');
    pxBox(g, lx + 1, wy, 0.25, p.y + 10 - wy, '#6fb6f0');
    for (let k = 0; k < 5; k += 1) {
      const t = Math.floor(tick / 4) + k * 7;
      pxBox(g, lx + 1 + (t % 6) / 4, wy + 0.75 + ((k * 9 + t * 3) % Math.max(1, (p.y + 9.5 - wy) * 4)) / 4, 0.5, 0.25, '#cfe6ff');
    }
  }
  if (food) for (let row = 4; row <= (water ? 6 : 9); row += 1) for (const c of [3, 4]) heapPiece(g, Math.min(penX(p, 3), penX(p, 4)) + (c - 3), p.y + row, VEG[(row * 2 + c) % VEG.length]);
}
// The front fence and the sides, in front of the pigs.
function penFront(side) {
  const G = penGrid(side, PEN_H);
  penRail(G, 36);
  penRail(G, 44);
  for (const c of PEN_POSTS) penPost(G, G.col(c), 32, 52);
  penPost(G, 0, 4, 48);
  return penPost(G, PEN_W * 4 - 4, 4, 48).rows();
}
function drawPenFront(g, p) {
  propArt(g, `penfront${p.side > 0}`, PEN_PAL, () => penFront(p.side), p.x, p.y);
}
PROP_DRAW.pen = drawPenFront;

// A small pig, ten units long, facing right: a round body lit along its back and shaded under its belly, a curly tail,
// a flap of ear over its brow, an eye with a glint, a blush on its cheek and a pale snout with two nostrils. Standing,
// mid-step (one pair of legs leading, then the other), rooting with its snout to the ground (the same pose eats and drinks
// at the trough) or lying down with its eyes shut and its legs tucked under.
function pigArt(pose) {
  const G = propGrid(40, 20);
  const low = pose === 'lie' ? 5 : 0;
  if (pose !== 'lie') {
    const legs = pose === 'step0' ? [[6, -1], [12, 1], [25, 1], [31, -1]] : pose === 'step1' ? [[6, 1], [12, -1], [25, -1], [31, 1]] : [[7, 0], [12, 0], [26, 0], [31, 0]];
    legs.forEach(([c, s], i) => { for (let r = 13; r < 20; r += 1) G.put(r, c + (r > 16 ? s : 0), r > 17 ? 'HHh' : i % 3 ? 'RSS' : 'QRS'); });
  }
  G.ball(9.5 + low, 18, 6.5, 15, 'PQRST');
  const head = pose === 'root' ? [12, 31.5] : [8.5 + low, 31.5];
  // A crease of shade where the head meets the neck, then the head over it.
  G.rect(0, 0, 20, 40, (r, c) => (c < head[1] && G.at(r, c) !== '.' && ((r + 0.5 - head[0]) / 6.4) ** 2 + ((c + 0.5 - head[1]) / 7.4) ** 2 <= 1 ? 'S' : undefined));
  G.ball(head[0], head[1], 5.5, 6.5, 'PQRST');
  const [hr, hc] = [Math.round(head[0]), Math.round(head[1])];
  G.ball(hr + 1.5, hc + 5.5, 3, 2.6, 'NNNnn').put(hr, hc + 7, 'NN').put(hr + 1, hc + 7, 'mN').put(hr + 2, hc + 7, 'mN').put(hr + 3, hc + 7, 'Nn');
  G.put(hr + 4, hc + 3, 'SS').put(hr + 1, hc, 'BB');
  G.put(hr - 2, hc + 1, pose === 'lie' ? 'RR' : 'wk').put(hr - 1, hc + 1, 'kk');
  G.map(hr - 7, hc - 4, ['.EE.....', 'EEEe....', '.EEEee..', '..Eeeeee', '...eeee.']);
  G.map(3 + low, 0, ['.RS.', 'R..S', 'R.S.', '.R..', '..RR']);
  G.edge((k, side) => (side === 't' || side === 'l' ? 'p' : 'o'));
  return G.rows();
}
const PIG_PAL = [['#f0a8b4', '#f4b6c0'], ['#e6a690', '#eab09c']].map(([c, ear]) => propRamp6(c, 'PQRSTo', {
  p: hdMix(c, HD_DARK, 0.45), H: '#6e4048', h: '#4a2a32', E: ear, e: hdMix(ear, '#a2463a', 0.3),
  k: '#2b1420', w: '#ffffff', B: hdMix(c, '#e0453a', 0.3), N: hdMix(c, HD_LIGHT, 0.55), n: hdMix(c, '#c56f80', 0.45), m: '#7f3a48',
}));
const PIG_LEN = 10;
// Draws pig i with its left column at x and its feet on row y, facing right (face 1) or left. A stepping pig leads with
// one pair of legs or the other as it moves along.
function drawPig(g, i, x, y, face, pose) {
  const p = pose === 'step' ? `step${Math.abs(Math.round(x + y)) % 2}` : PIG_ART_POSES.includes(pose) ? pose : 'stand';
  propArt(g, `pig${i % 2}${p}`, PIG_PAL[i % 2], () => pigArt(p), x, y - 4, face < 0);
}
const PIG_ART_POSES = ['stand', 'root', 'lie'];
