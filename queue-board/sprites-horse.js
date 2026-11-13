// sprites-horse.js: the Sentry slot's Ranger on horseback for the Middle-earth view (scene-ride.js), at 32-bit: four
// pixels a unit, drawn in quarter units on scene.js's canvas. The horse faces right, its hooves on row y and its saddle
// over column x, 17 units from rump to nose and 10 to its back; scene.js mirrors it to face left. Its body, head, legs,
// mane and tail are sprites-horse-art.js's: rounded forms lit from the upper left, so the shoulder and haunch stand out
// in their own light and shade, an eye with a glint, a nostril and a bridle, strands in the mane and tail, and shaded
// hooves. Its gaits are stand, walk and gallop (four-frame leg cycles, the gallop with a moment off the ground and its
// mane and tail streaming), graze (head down) and rear (a short rear for a win). The Ranger is sprites.js's own figure
// with its hips in the saddle: the horse's barrel is drawn over its legs, then the saddle and one leg in its stirrup on
// the near side. Its riding poses (on the reins, the sword drawn back and the cut, a hand raised to ask, the sword held
// up to cheer) join sprites.js's POSES in the figure's own 32-bit colours and sleeves (qdFigurePal, f.P, f.sleeve,
// f.hand); it sleeps in its usual pose. The post it keeps by the road is sprites-horse-post.js's. The art is pixel maps
// in code; no image files. Loaded after sprites-work.js; sprites-horse-art.js and sprites-horse-post.js load after it.

// How far the rider's feet sit above the hooves, so its head is this much higher than on foot.
const HORSE_SEAT = 6;
// [coat, shade, mane and tail, lower legs], one per worker from its name: a bay with black points, a dark brown and a
// grey with a white mane.
const HORSE_COATS = [['#8a5a32', '#62401f', '#231914', '#2b211c'], ['#5a4334', '#3e2e23', '#16100c', '#241b15'], ['#aaa49a', '#827c73', '#ece8df', '#8a847b']];
// How far above its feet a mounted figure's head ends, for its bubble, name, snores and clicks.
const riderTop = (kind) => figureTop(kind) + HORSE_SEAT;

// Each coat's colours for the near side and (a step darker) the far legs, made once: ramps whose light warms toward
// gold and whose shade cools toward violet.
const HORSE_PALS = new Map();
function horsePal(coat, shade, mane, low) {
  const key = [coat, shade, mane, low].join();
  if (HORSE_PALS.has(key)) return HORSE_PALS.get(key);
  const pale = hdRgb(coat).reduce((s, v) => s + v) > 420;
  const darkMane = hdRgb(mane).reduce((s, v) => s + v) < 300;
  const deep = hdMix(shade, '#2a1b38', 0.45);
  const near = {
    1: hdMix(coat, pale ? '#fffaf0' : '#ffe2a6', pale ? 0.6 : 0.42), 2: hdMix(coat, '#ffd28a', pale ? 0.3 : 0.2), 3: coat, 4: shade, 5: deep,
    o: hdMix(shade, HD_DARK, 0.68),
    6: hdMix(low, darkMane ? '#8c8aa8' : HD_LIGHT, 0.28), 7: low, 8: hdMix(low, '#1c1428', 0.35), 9: hdMix(low, HD_DARK, 0.62), O: hdMix(low, HD_DARK, 0.8),
    h: '#857261', H: '#56473c', j: '#30261f', J: '#1a1210',
    M: darkMane ? hdMix(mane, '#9c98b8', 0.4) : '#ffffff', m: darkMane ? hdMix(mane, '#9c98b8', 0.18) : hdMix(mane, '#ffffff', 0.4), n: mane,
    N: darkMane ? hdMix(mane, HD_DARK, 0.45) : hdMix(mane, shade, 0.35), u: darkMane ? hdMix(mane, HD_DARK, 0.75) : hdMix(shade, HD_DARK, 0.45),
    k: '#160d14', w: '#ffffff', e: '#4a2a22', q: hdMix(deep, HD_DARK, 0.5), b: '#3a2416', B: '#7a5232', g: '#dfe6ee', G: '#6c7582',
  };
  const far = { ...near };
  for (const c of '12345o6789OhHjJ') far[c] = hdMix(near[c], deep, 0.38);
  HORSE_PALS.set(key, [near, far]);
  return HORSE_PALS.get(key);
}

// The columns of the near fore, far fore, near hind and far hind legs, from the saddle.
const LEG_X = [4, 5, -4, -5];
// Each gait's frames. legs: [foot, lift] per leg, in LEG_X's order: how far the hoof is forward of the leg's top
// (negative: behind it) and how far off the ground. bob lifts the whole horse (the gallop's moment in the air); tail is
// 0 hanging, 1 swished or 2 streaming (the mane streams with it); head is up unless it grazes; rise lifts the forehand
// of a rearing horse.
const still4 = [[0, 0], [0, 0], [0, 0], [0, 0]];
const GAITS = {
  stand: [{ legs: still4 }],
  walk: [
    { legs: [[1, 1], [-1, 0], [-1, 0], [1, 1]] },
    { legs: [[1, 0], [0, 0], [0, 0], [1, 0]], tail: 1 },
    { legs: [[-1, 0], [1, 1], [1, 1], [-1, 0]] },
    { legs: [[0, 0], [1, 0], [1, 0], [0, 0]], tail: 1 },
  ],
  gallop: [
    { legs: [[-1, 1], [-1, 2], [1, 1], [2, 2]], tail: 2 },
    { legs: [[1, 1], [0, 1], [0, 0], [-1, 0]], tail: 2 },
    { legs: [[2, 2], [2, 1], [-2, 1], [-2, 2]], tail: 2, bob: 1 },
    { legs: [[1, 0], [2, 1], [-1, 2], [-1, 1]], tail: 2 },
  ],
  graze: [{ legs: still4, head: 'down' }, { legs: still4, head: 'down', tail: 1 }],
  rear: [{ legs: [[0, 0], [0, 0], [1, 0], [0, 0]], rise: 2, tail: 1 }, { legs: [[0, 0], [0, 0], [1, 0], [0, 0]], rise: 3, tail: 1 }],
};

// The saddle over its red cloth with a gold edge, and the girth under the belly, one character per quarter-unit pixel:
// x A a s S leather (outline, shine, light, base, shade) with d stitching, E r R e cloth (outline, light, base, shade),
// z y Y gold (shade, base, light), i I a steel buckle.
const HORSE_SADDLE = { x0: -18, y0: -46, cv: new Map(), rows: [
  '................................', '..xxx...........................', '.xAax...................xxx.....',
  '.xaAsx.................xAasx....', '.xasSx................xAassx....', '.xasSSx..............xaassSx....',
  '.xassSxxxxxxxxxxxxxxxaasssSx....', '.xasssaAAaaaaaaaaaaaassssSSx....', 'EzxssssssssssssssssssssssSSxzE..',
  'ErxadsdsdsdsdsdsdsdsdsdsdsSxrE..', 'ErxasssssssssssssssssssssSSxRE..', 'ErxassssssssssssssssssssSSSxRE..',
  'ErRxasssssssssssssssssssSSxRRE..', 'ErRxasssssssssssssssssssSSxRRE..', 'ErRRxassssssssssssssssssSxRRRE..',
  'ErRRxxsdsdsdsdsdsdsdsdsxxRReE...', 'ErRRRRxxxxxxxxxxxxxxxxxRRRReE...', 'EyyRRRRRRRRRRRRRRRRRRRRRRReyE...',
  'EYyyyyyyyyyyyyyyyyyyyyyyyyyzE...', '.EzzzzzzzzzzzxiIixzzzzzzzzzE....', '..EEEEEEEEEEExsSsxEEEEEEEEE.....',
  '.............xsSx...............', '.............xsSx...............', '.............xsSx...............',
  '.............xxxx...............',
] };
const HORSE_TACK = { x: '#24150c', A: '#b8844e', a: '#8a5a34', s: '#6b4423', S: '#4a2e18', d: '#c39a68', E: '#3e1218', r: '#c2504a',
  R: '#9b3434', e: '#6c2228', z: '#a8762a', y: '#f2c14e', Y: '#fde08a', i: '#dfe6ee', I: '#6c7582' };
// The rider's near leg down the horse's side, in its leather breeches and tall boot, the boot in the stirrup, in the
// figure's own colours (sprites.js's qdFigurePal): D E F H leather (outline, dark, base, light), 6 7 8 9 0 steel.
const HORSE_LEG = { x0: -4, y0: -38, cv: new Map(), rows: [
  'DHHHHHFFFFFFFD....', 'DHHFFFFFFFFFFFD...', 'DFFFFFFFFFFFFFED..', '.DEEFFFFFFFFFFED..', '..DDEEEEFFFFFFED..',
  '....DDEEEFFFFFED..', '......DDEFFFFFED..', '........DFHFFFEED.', '........DFHFFFEED.', '........DFFFEEED..',
  '........DFFFEEED..', '........DFFFEEED..', '........DFFFEEED..', '........DFFFEEED..', '.......DDDDDDDDDD.',
  '.......DHHFFFEEED.', '.......DHFFFFEEED.', '.......DHFFFFEEED.', '.......DHFFFFFFEDD', '......6DHFFFFFFFED',
  '......7DEEEEEEEEED', '......78DDDDDDDDD8', '......9000000009..', '.......6666666666.',
] };

// Draws the Ranger (or any figure) of this name on its horse, hooves on row y and saddle over column x, facing right.
// gait and gframe pick the horse's frame; pose, frame and tool are the rider's, as for drawFigure. Returns the rider's
// working hand.
function drawRider(g, kind, name, x, y, gait, gframe, pose, frame, tool) {
  const frames = GAITS[gait] ?? GAITS.stand;
  const s = frames[gframe % frames.length];
  // A people may name its own horse's coat (sprites-captains.js: Éomer rides a grey, as Firefoot is); else by the name.
  const [near, far] = horsePal(...(PEOPLE[kind]?.coat ?? HORSE_COATS[(pxHash(name) >>> 5) % HORSE_COATS.length]));
  const by = y - (s.bob ?? 0);
  let hand = null;
  const { head, lift } = drawHorse(g, x, by, s, near, far, (up) => { hand = drawFigure(g, kind, name, x, by - HORSE_SEAT - (up ? up(0) : 0), pose, frame, tool); });
  haDraw(g, HORSE_SADDLE, HORSE_TACK, x, by, lift);
  haDraw(g, HORSE_LEG, qdFigurePal(kind, name), x, by, lift);
  if (pose === 'reins') {
    const [mx, my] = head.mouth;
    horseRein(g, hand.x + 0.75, hand.y + 0.25, x + mx / 4, by + my / 4 - (lift ? lift(mx) : 0));
  }
  return hand;
}
// The horse alone at gait frame s, hooves on row by and its middle over column x, facing right, in the near and far
// palettes: the far legs, tail and head, then mid(lift) (a rider), then the barrel and the near legs. Returns the head's
// art (for its mouth) and the lift of a rearing horse.
function drawHorse(g, x, by, s, near, far, mid) {
  const rise = s.rise ?? 0;
  // A rearing horse tips back on its hind legs: each quarter column X rises with its distance from the rump, in
  // quarter-unit steps.
  const lift = rise ? (X) => Math.max(0, Math.round((rise * (X + 24)) / 12) / 4) : null;
  // A leg from under the body, its top raised with the forehand of a rearing horse (whose forelegs fold); a near leg is
  // drawn only from the body's lower edge down, so it runs out of the body without a seam.
  const leg = (k, pal) => {
    const c = 4 * LEG_X[k] + 3;
    const fore = k < 2;
    const [foot, up] = s.legs[k];
    const top = (fore ? -24 : -25) - (lift ? 4 * lift(c) : 0);
    const art = haLeg(fore, top, 4 * foot + 1, 4 - 4 * up, Boolean(rise && fore));
    haDraw(g, art, pal, x + c / 4, by, null, pal === near ? top + (fore ? 1 : 6) : null);
  };
  leg(1, far);
  leg(3, far);
  haDraw(g, HA_TAILS[s.tail ?? 0], near, x, by, lift);
  const head = haHead(s.head ?? 'up', s.tail === 2);
  haDraw(g, head, near, x, by, lift);
  mid?.(lift);
  haDraw(g, HA_BODY, near, x, by, lift);
  leg(0, near);
  leg(2, near);
  return { head, lift };
}
// The reins from the rider's hand to the bit: a strap a quarter unit wide, dark under a lit edge, so it shows on the
// mane and on the coat alike.
function horseRein(g, x0, y0, x1, y1) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4));
  for (let k = 0; k <= n; k += 1) {
    const px = Math.floor((x0 + ((x1 - x0) * k) / n) * 4) / 4;
    const py = Math.floor((y0 + ((y1 - y0) * k) / n) * 4) / 4;
    pxBox(g, px, py - 0.25, 0.25, 0.25, '#9a6a3c');
    pxBox(g, px, py, 0.25, 0.25, '#3a2414');
  }
}

// The rider's arms in its riding poses are the figure's own sleeves and fists (sprites-hd.js's f.sleeve, f.hand and
// f.arm); the swords are drawn here in its colours (f.P): 6 7 8 9 0 # steel (outline to glint), G g y Y gold, D E F
// leather. horseSword makes one along a diagonal, n pixels of blade pointing down-right for the cut (dir 1) or up-left
// drawn back over the shoulder (dir -1), as a quarter-unit map with the cell of its grip (hilt) where the fist holds it.
function horseSword(dir, n) {
  const w = n + 8;
  const rows = Array.from({ length: w }, () => Array(w).fill('.'));
  const put = (r, c, ch) => { if (r >= 0 && r < w && c >= 0 && c < w) rows[r][c] = ch; };
  // Built pointing down-right from its grip at (2, 2), then turned round for a blade drawn back.
  for (let t = 0; t < n; t += 1) { put(5 + t, 4 + t, '6'); put(5 + t, 5 + t, '9'); put(5 + t, 6 + t, '#'); put(4 + t, 6 + t, '7'); }
  put(4 + n, 5 + n, '6'); put(4 + n, 6 + n, '0');
  [[1, 7, 'G'], [2, 6, 'Y'], [3, 5, 'y'], [4, 4, 'y'], [5, 3, 'g'], [6, 2, 'g'], [7, 1, 'G'], [2, 7, 'G'], [8, 2, 'G']].forEach(([r, c, ch]) => put(r, c, ch));
  [[2, 2, 'F'], [3, 3, 'E'], [1, 1, 'E'], [2, 3, 'D'], [0, 0, 'y'], [0, 1, 'G'], [1, 0, 'G']].forEach(([r, c, ch]) => put(r, c, ch));
  const out = rows.map((r) => r.join(''));
  return dir > 0 ? { rows: out, hilt: [2, 2] } : { rows: out.reverse().map((r) => [...r].reverse().join('')), hilt: [w - 3, w - 3] };
}
const HORSE_SWORDS = { back: horseSword(-1, 18), cut: horseSword(1, 16) };
const horseSwordAt = (g, P, sw, x, y) => qdMap(g, sw.rows, P, x - sw.hilt[0] / 4, y - sw.hilt[1] / 4);

Object.assign(POSES, {
  // The near hand forward and low on the reins; the far one is hidden behind the body.
  reins: {
    arms(g, f) {
      const b = f.bodyTop;
      f.sleeve(f.armR, b, f.armR + 2, b + 2);
      f.hand(f.armR + 2, b + 2);
      return { x: f.armR + 2, y: b + 2 };
    },
  },
  // Frame 0 draws the sword back over the shoulder; frame 1 cuts down and forward past the horse's shoulder.
  slash: {
    fight: true,
    arms(g, f) {
      const b = f.bodyTop;
      if (f.frame === 0) {
        horseSwordAt(g, f.P, HORSE_SWORDS.back, f.armR + 0.5, b - 2.5);
        f.arm(f.armR, b - 2, b, b - 3);
        return { x: f.armR - 4, y: b - 7 };
      }
      f.sleeve(f.armR, b, f.armR + 2, b + 2);
      horseSwordAt(g, f.P, HORSE_SWORDS.cut, f.armR + 2.5, b + 2.5);
      f.hand(f.armR + 2, b + 2);
      return { x: f.armR + 6, y: b + 7 };
    },
  },
  // A hand raised high beside the hood, waving (frame 0 or 1), to ask for help.
  hail: {
    arms(g, f) {
      const b = f.bodyTop;
      f.sleeve(f.armR, b, f.armR + 1, b - 1);
      f.arm(f.armR + 1, b - 4 + f.frame, b - 1, b - 5 + f.frame);
      return { x: f.armR + 1, y: b - 5 };
    },
  },
  // The sword held straight up to cheer.
  brandish: {
    fight: true,
    arms(g, f) {
      const b = f.bodyTop;
      f.arm(f.armR, b - 3, b, b - 4);
      drawTool(g, 'sword', { x: f.armR, y: b - 4, up: true });
      return { x: f.armR, y: b - 11 };
    },
  },
});
