// sprites-work.js: the poses, tools and loads the Middle-earth workers use on their rounds (scene-work.js) and in their
// fights (scene-duel.js), added to sprites.js's POSES and TOOLS. A pose draws the arms and whatever they hold; carry
// walks with a load (ore or a sack on the shoulder, a gem held up, a basket, a scroll or leaves in both arms); bend
// crouches to pick from the ground with a basket beside; dig kneels and strikes low; stir works a paddle in a kettle;
// tip holds a load out and empties it; shoot draws a bow; harp plucks a harp; reach stretches up into a tree; water
// tilts a watering can; block holds the weapon up to parry; lunge thrusts it; stagger reels back. Drawn at 32-bit, a
// pixel a quarter unit (qdMap), with the figure's own sleeves and hands where it has them and a ramp per material lit
// from the upper left; no image files. Loaded after sprites-hd.js; the tools and arrows are sprites-gear.js's.

// Draws a small pixel map: rows of characters, each a colour from pal (any character not in pal is clear), top-left at
// (x, y), upside down when flip is set.
function pxMap(g, rows, pal, x, y, flip = false, mirror = false) {
  rows.forEach((row, r) => [...row].forEach((ch, c) => pal[ch] && pxDot(g, x + (mirror ? row.length - 1 - c : c), y + (flip ? rows.length - 1 - r : r), pal[ch])));
}
// Walks the cells of a line from (x0, y0) to (x1, y1), calling fn for each.
function pxWalk(x0, y0, x1, y1, fn) { gearWalk(y0, x0, y1, x1, (y, x) => fn(x, y)); }
// A one-pixel line from (x0, y0) to (x1, y1).
function pxLine(g, x0, y0, x1, y1, c) { pxWalk(x0, y0, x1, y1, (x, y) => pxDot(g, x, y, c)); }
// A rod through the unit cells from (x0, y0) to (x1, y1), in quarter units, with its ramp of colours laid across it
// (across the columns where it runs steep, down the rows where it runs flat, its first colour on the lit side), centred
// in the cells and starting at shift pixels in: sleeves, shafts, a paddle, a pestle.
function toolRod(g, x0, y0, x1, y1, ramp, shift = (4 - ramp.length) >> 1) {
  const steep = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
  const [m0, m1, c0, c1] = steep ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
  const [lo, hi] = [Math.min(m0, m1) * 4, Math.max(m0, m1) * 4 + 3];
  const [ca, cb] = m0 <= m1 ? [c0 * 4, c1 * 4] : [c1 * 4, c0 * 4];
  ramp.forEach((col, k) => {
    g.fillStyle = col;
    for (let m = lo; m <= hi; m += 1) {
      const cross = Math.round(ca + ((cb - ca) * Math.min(1, (m - lo) / Math.max(1, hi - 3 - lo)))) + shift + k;
      if (steep) g.fillRect(cross / 4, m / 4, 0.25, 0.25); else g.fillRect(m / 4, cross / 4, 0.25, 0.25);
    }
  });
}
// A thread a quarter unit thick from (x0, y0) to (x1, y1), on quarter-unit points: bowstrings, tongs, a taper.
const toolThread = (g, x0, y0, x1, y1, c) => {
  g.fillStyle = c;
  gearWalk(Math.round(y0 * 4), Math.round(x0 * 4), Math.round(y1 * 4), Math.round(x1 * 4), (y, x) => g.fillRect(x / 4, y / 4, 0.25, 0.25));
};

// A sleeve through the cells from (x0, y0) to (x1, y1), lit on the near arm's outer side, and a hand in the unit at
// (x, y): the figure's own (sprites.js's f.sleeve and f.hand), so a pose's arms match the arms it draws itself.
const armSleeve = (g, f, x0, y0, x1, y1) => f.sleeve(x0, y0, x1, y1);
const armHand = (g, f, x, y) => f.hand(x, y);

const GEMS = [['#ff8f84', '#e0453a'], ['#b5dcff', '#4a95f0'], ['#a8f0c4', '#3fae6c'], ['#e2c4ff', '#a36ef0']];
const STRING = '#e9e3d3';
const CAN = ['#a9c2d0', '#6f8a9a'];
// What a worker carries, as quarter-unit maps drawn with their bottom row centred under the hand: ore with orange veins,
// a stitched sack tied at the neck, a woven basket of vegetables, a rolled scroll with a ribbon, a bunch of autumn leaves,
// and gem0 to gem3, the four colours of cut gem with a glint. held says how each is carried.
const LOADS = {
  ore: [['.....XXXX.......', '...XXLLbbXX.....', '..XLLbbcbbBXX...', '.XLbbbcCcbbBBX..', '.XLbbcCbbbcBBX..', 'XLbbbbcbbccbBBX.',
    'XLbbBbbbcCcbBBX.', 'XbbbbBbbbcbBBBX.', 'XbbcbbBbbbbBBBX.', '.XBcCcBBbBBBBX..', '..XXBBBBBBBXX...', '....XXXXXXX.....'],
  { L: '#b8b4be', b: '#8a8692', B: '#625e6b', X: '#2e2b36', c: '#f0a33a', C: '#ffd27a' }],
  sack: [['.......tt..tt.......', '........tTTt........', '.......OtTTtO.......', '.......OllsSO.......', '......OlssssSO......',
    '.....OlssssssSO.....', '....OlsssssssSSO....', '...OlssssssssSSDO...', '..OlsssksksksssSDO..', '..OlssssssssssSSDO..',
    '.OlssssssssssssSSDO.', '.OlsssssssssssSSSDO.', 'OlssssssssssssSSSDDO', 'OlssssssssssssSSSDDO', 'OssssssssssssSSSSDDO',
    'OsssssssssssSSSSDDDO', '.OssssssssSSSSSDDDO.', '.ODsssSSSSSSSDDDDDO.', '..OODDDDDDDDDDDDOO..', '....OOOOOOOOOOOO....'],
  { l: '#f3e6c4', s: '#ddc89c', S: '#b49d70', D: '#8a744c', O: '#5a4630', k: '#8a7550', t: '#a07848', T: '#6e4f2c' }],
  leaves: [['...yY.......yY......', '..yYYa.....yYYa.....', '.yYYaaA..yyYaaA..y..', 'yYYaaAA.yYYaaAAyYY..', '.YaaAA.yYYaaAAyYYaa.',
    '..aAA.yYYaaAA.YaaAA.', '....AAYaaAA....aAA..', '.....AaAA.......A...'], { y: '#fdf0b0', Y: '#f0d36a', a: '#c99a30', A: '#8a6420' }],
  ...Object.fromEntries(GEMS.map(([light, dark], i) => [`gem${i}`, [['..oooo..', '.owwlmo.', 'owllmmdo', 'olllmddo', 'omlmmddo',
    '.omdddo.', '..oddo..', '...oo...'], { w: '#ffffff', l: light, m: hdMix(light, dark, 0.5), d: dark, o: hdMix(dark, HD_DARK, 0.55) }]])),
};
// The basket and the scroll are built in code: the basket's weave in rows that alternate, under a rim and a heap of
// greens, carrots and tomatoes; the scroll a roll of paper with gold caps and a red ribbon round its middle.
LOADS.basket = [(() => {
  const G = gearGrid().all(0, 3, ['...KgGK..oE...rA..gGK..', '..KgggGK.oEE.rrrA.KggGK.', '.KgggGGKoooEErrrAKgggGGK', 'KGgGGGKEEEEEAAAAAKGgGGGK']);
  for (let r = 4; r < 16; r += 1) {
    const i = r < 6 ? 0 : Math.max(0, r - 12);
    for (let c = i; c < 28 - i; c += 1) {
      const edge = c === i || c === 27 - i || r === 15;
      G.put(r, c, edge ? 'D' : r < 6 ? (r === 4 ? 'w' : 'W') : ((c >> 1) + (r >> 1)) % 2 ? (c > 20 ? 'V' : 'v') : 'V');
    }
  }
  return G.done()[0];
})(), { w: '#e8c488', W: '#c49452', v: '#c8964f', V: '#8a6233', D: '#4a3018', g: '#8fd05a', G: '#4f9a2a', K: '#2a5a1a',
  o: '#ffc070', E: '#ff8a2a', r: '#ff7a6a', A: '#c8352a' }];
LOADS.scroll = [Array.from({ length: 8 }, (_, r) => Array.from({ length: 24 }, (_, c) => {
  const end = c < 3 || c > 20;
  if ((r === 0 || r === 7) && (c === 0 || c === 23)) return '.';
  return (end ? 'JQqqjjJJ' : c >= 10 && c <= 13 ? 'RffrrARR' : 'oPPppsSo')[r];
}).join('')), { J: '#5e3a12', Q: '#fbdd86', q: '#e2b043', j: '#a8742a', R: '#5e1414', f: '#f0563c', r: PX.red, A: '#8e2f2f',
  o: '#6e6450', P: '#ffffff', p: PX.white, s: '#d9d2c0', S: '#b4ab94' }];
const HELD = { ore: 'shoulder', sack: 'shoulder', gem0: 'high', gem1: 'high', gem2: 'high', gem3: 'high' };
function drawLoad(g, load, x, y, flip = false) {
  const [rows, pal] = LOADS[load] ?? [];
  if (rows) gearMap(g, flip ? [...rows].reverse() : rows, pal, x - rows[0].length / 8, y - rows.length / 4 + 1, `load${load}${flip}`);
}

// The things the poses hold: a longbow with a leather grip and nocked tips, bent in an arc, and a tin watering can with
// a handle over its top, lit on the left.
const POSE_ART = {
  bow: (() => {
    const G = gearGrid();
    [['0', 31], ['2', 30], ['4', 29], ['0', 28]].forEach(([ch, rad]) => G.arc(-23, 17.5, rad, -0.62, 0.62, ch));
    return G.all(15, 4, ['KlK', 'Kok', 'KlK', 'Kok', 'KlK', 'KlK']).all(-1, 0, ['J.', 'qJ']).all(35, 0, ['qJ', 'J.']).done()[0];
  })(),
  can: ['....oooooo......', '...o......o.....', '..o........o....', 'oooooooooooooooo', 'olbbbbbbbbbbbbCo', 'olcccccccccccCCo',
    'olccccccccccCCCo', 'olccccccccccCCCo', 'olccccccccccCCCo', 'olcccccccccCCCCo', 'olcccccccccCCCCo', 'occcccccccCCCCCo',
    'occcccccccCCCCCo', 'occcccccccCCCCCo', 'occccccccCCCCCCo', 'oCCCCCCCCCCCCCCo', '.oooooooooooooo.'],
  canPx: { l: '#e2eef4', b: '#8aa4b4', c: CAN[0], C: CAN[1], o: '#2f3d48' },
  rose: ['.oo.', 'olco', 'occo', 'oCCo', '.oo.'],
};
// A gold harp: silver strings down to a slanting soundbox, a scrolled neck across the top and a carved pillar at the
// front, drawn with its top-left at (0, 0) for the harp pose to stamp.
function poseHarp(c) {
  for (const [sx, n] of [[1, 3.5], [1.75, 5], [2.5, 6.75]]) pxBox(c, sx, 1, 0.25, n, '#e6edf6');
  toolRod(c, 0.25, 1.25, 3.25, 8.25, ['#5e3a12', '#d8b468', '#a8742a', '#5e3a12'], 0);
  qdMap(c, ['.JJJJJJJJJJJJJJ.', 'JQQQ++QQQQqqqqqJ', '.JqqqqqqqqqqjjjJ', '..JJJJJJJJJJJJJ.'], GEAR_PX, 0, 0);
  toolRod(c, 3.25, 1.25, 3.25, 8.25, [GEAR_PX.J, GEAR_PX.Q, GEAR_PX.q, GEAR_PX.j, GEAR_PX.J], 0);
}
// A rod dx units across and dy down from its first cell, stamped once for each length and ramp: a paddle, a pestle.
const poseRod = (g, x0, y0, x1, y1, ramp, name) => gearPaint(g, `${name}${x1 - x0},${y1 - y0}`, () => [Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1],
  (c) => toolRod(c, Math.max(0, x0 - x1), Math.max(0, y0 - y1), Math.max(0, x1 - x0), Math.max(0, y1 - y0), ramp), Math.min(x0, x1), Math.min(y0, y1));
const PADDLE = [GEAR_PX[0], GEAR_PX[4], GEAR_PX[3], GEAR_PX[1]];
// The arm that isn't working: hanging, swinging opposite its leg on a walk's stride (frame 0 back, 1 forward; the
// passing steps 0.5 and 1.5, and 2, hang still).
const restArm = (f) => {
  const swing = f.frame === 0 ? -1 : f.frame === 1 ? 1 : 0;
  f.arm(f.armL, f.bodyTop, f.bodyTop + 2, f.bodyTop + 3, swing);
};

Object.assign(POSES, {
  carry: {
    step: true,
    arms(g, f) {
      const b = f.bodyTop;
      if (HELD[f.tool] === 'shoulder') { f.arm(f.armR, b - 1, b + 1, b - 2); restArm(f); return { x: f.armR, y: b - 2 }; }
      if (HELD[f.tool] === 'high') { f.arm(f.armR, b - 2, b, b - 3); restArm(f); return { x: f.armR, y: b - 5 }; }
      f.arm(f.armL, b, b + 1, b + 2);
      f.arm(f.armR, b, b + 1, b + 2);
      return { x: f.x, y: b };
    },
    over(g, f) {
      const held = HELD[f.tool];
      if (held === 'shoulder') drawLoad(g, f.tool, f.armR + 1, f.bodyTop - 2);
      else if (held === 'high') drawLoad(g, f.tool, f.armR + 0.5, f.bodyTop - 4);
      else drawLoad(g, f.tool, f.x, f.bodyTop + 3);
    },
  },
  bend: {
    drop: 9, nod: 2, lean: 1,
    arms(g, f) {
      // The front arm reaches down and out to the ground, picking on alternate frames.
      const hy = f.y - f.frame;
      f.arm(f.armL, f.bodyTop + 1, f.bodyTop + 2, f.bodyTop + 3);
      armSleeve(g, f, f.armR, f.bodyTop + 1, f.armR + 2, hy - 1);
      armHand(g, f, f.armR + 2, hy);
      return { x: f.armR + 2, y: hy };
    },
    over(g, f) { if (f.tool) drawLoad(g, f.tool, f.armR + 6, f.y); },
  },
  dig: {
    drop: 9,
    arms(g, f) {
      const b = f.bodyTop;
      f.arm(f.armL, b + 1, b + 2, b + 3);
      if (f.frame === 0) { f.arm(f.armR, b - 1, b, b - 2); drawTool(g, f.tool, { x: f.armR, y: b - 2, up: true }); return { x: f.armR, y: b - 6 }; }
      armSleeve(g, f, f.armR, b + 1, f.armR, b + 2);
      armHand(g, f, f.armR + 1, b + 3);
      drawTool(g, f.tool, { x: f.armR + 1, y: b + 3, up: false });
      return { x: f.armR + 5, y: b + 3 };
    },
  },
  stir: {
    arms(g, f) {
      // A long paddle from above the head down into the kettle in front, its top swinging with the frame.
      const b = f.bodyTop;
      const [x0, y0, x1, y1] = [f.armR + f.frame * 2, b - 5, f.armR + 4, f.y - 3];
      const hx = Math.round(x0 + ((x1 - x0) * (b + 1 - y0)) / (y1 - y0));
      restArm({ ...f, frame: 2 });
      poseRod(g, x0, y0, x1, y1, PADDLE, 'paddle');
      if (hx > f.armR) armSleeve(g, f, f.armR, b + 1, hx - 1, b + 1);
      armHand(g, f, hx, b + 1);
      return { x: x1, y: f.y - 5 };
    },
  },
  tip: {
    arms(g, f) {
      const b = f.bodyTop;
      f.arm(f.armL, b, b + 1, b + 2);
      armSleeve(g, f, f.armR, b + 1, f.armR + 1, b + 1);
      armHand(g, f, f.armR + 2, b + 1);
      return { x: f.armR + 3, y: b + 1 };
    },
    over(g, f) { if (f.tool) drawLoad(g, f.tool, f.armR + 3 + f.frame, f.bodyTop - 1 + f.frame * 3, f.frame === 1); },
  },
  shoot: {
    arms(g, f) {
      // The bow held out in front; on frame 0 the string drawn back to the chest with an arrow nocked, then loosed and
      // still trembling.
      const b = f.bodyTop;
      const bow = f.armR + 3;
      armSleeve(g, f, f.armR, b + 1, f.armR + 1, b + 1);
      gearMap(g, POSE_ART.bow, GEAR_PX, bow - 1.25, b - 3.25);
      if (f.frame === 0) {
        toolThread(g, bow - 0.75, b - 2.75, f.x + 0.5, b + 1.25, STRING);
        toolThread(g, f.x + 0.5, b + 1.25, bow - 0.75, b + 5.5, STRING);
        drawArrow(g, f.x + 1, bow + 1.5, b + 1.25);
        armSleeve(g, f, f.armL, b + 1, f.x - 1, b + 1);
        armHand(g, f, f.x, b + 1);
      } else {
        toolThread(g, bow - 0.75, b - 2.75, bow - 0.5 - (sc.tick % 2) * 0.25, b + 1.25, STRING);
        toolThread(g, bow - 0.5 - (sc.tick % 2) * 0.25, b + 1.25, bow - 0.75, b + 5.5, STRING);
        restArm({ ...f, frame: 2 });
      }
      armHand(g, f, f.armR + 2, b + 1);
      return { x: bow + 2, y: b + 1 };
    },
  },
  harp: {
    arms(g, f) {
      // A gold harp on the knee (poseHarp), plucked on alternate frames.
      const b = f.bodyTop;
      const h = f.armR + 2;
      armSleeve(g, f, f.armR, b + 1, f.armR + 1, b + 1);
      gearPaint(g, 'harp', () => [4.5, 9.5], poseHarp, h - 0.25, b - 3.25);
      restArm({ ...f, frame: 2 });
      armHand(g, f, h + 1 + f.frame, b + f.frame);
      return { x: h + 2, y: b - 4 };
    },
  },
  reach: {
    arms(g, f) {
      const b = f.bodyTop;
      const [up, down] = f.frame ? [f.armL, f.armR] : [f.armR, f.armL];
      f.arm(up, b - 3, b, b - 4);
      f.arm(down, b, b + 2, b + 3);
      return { x: up, y: b - 5 };
    },
  },
  water: {
    arms(g, f) {
      // A watering can held out; its spout tips down on frame 1 and the rose at its end pours.
      const b = f.bodyTop;
      const c = f.armR + 1;
      restArm({ ...f, frame: 2 });
      f.arm(f.armR, b + 1, b + 2, b + 3);
      gearMap(g, POSE_ART.can, POSE_ART.canPx, c, b - 0.75);
      for (const [d, col] of [[0, '#2f3d48'], [0.25, CAN[0]], [0.5, CAN[1]], [0.75, '#2f3d48']]) toolThread(g, c + 3.75, b + 1.75 + d + f.frame * 0.5, c + 5.75, b + 1.75 + d + f.frame * 3, col);
      gearMap(g, POSE_ART.rose, POSE_ART.canPx, c + 5.75, b + 1.25 + f.frame * 3);
      return { x: c + 6, y: b + 3 + f.frame * 3 };
    },
  },
  block: {
    step: true, fight: true,
    arms(g, f) {
      const b = f.bodyTop;
      restArm({ ...f, frame: 2 });
      armSleeve(g, f, f.armR, b + 1, f.armR, b + 1);
      armHand(g, f, f.armR + 1, b);
      drawTool(g, f.tool, { x: f.armR + 1, y: b, up: true });
      return { x: f.armR + 1, y: b - 4 };
    },
  },
  lunge: {
    lean: 1, step: true, fight: true,
    arms(g, f) {
      const b = f.bodyTop;
      armSleeve(g, f, f.armL - 1, b + 1, f.armL, b + 1);
      armHand(g, f, f.armL - 2, b + 1);
      armSleeve(g, f, f.armR, b + 1, f.armR + 2, b + 1);
      armHand(g, f, f.armR + 3, b + 1);
      drawTool(g, f.tool, { x: f.armR + 3, y: b + 1, up: false });
      return { x: f.armR + 8, y: b + 1 };
    },
  },
  stagger: {
    lean: -1, step: true, fight: true,
    arms(g, f) {
      const b = f.bodyTop;
      armSleeve(g, f, f.armL, b, f.armL - 1, b - 1);
      armHand(g, f, f.armL - 2, b - 2);
      f.arm(f.armR, b - 2, b, b - 3);
      drawTool(g, f.tool, { x: f.armR, y: b - 3, up: true });
      return { x: f.armR, y: b - 6 };
    },
  },
});
