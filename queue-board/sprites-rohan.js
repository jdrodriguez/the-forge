// sprites-rohan.js: the Men of Rohan's own art in the Middle-earth view, at 32-bit (a quarter unit a pixel). Their
// station is a round shield of Rohan leaning back on a wooden trestle, a saddle beside it, worked with a hammer; it
// shows how far the PR has come as the other stations do: 1 (building) a bare shield of planks with its iron rim half
// fitted, 2 (a PR open) painted green with the white horse taking shape over its chalk outline, 3 (CI failing) a red
// crack across it, 4 (green) a gilded rim and the white horse whole, sparkling. Also the poses and loads of their rounds:
// grooming a horse with a brush (groom), walking with a lead rope trailing back to a horse (carry with the load 'lead'),
// and an armful of hay; and a horse with no rider (drawLooseHorse) for the paddock. sprites-gear-stations.js's
// drawStation calls drawShieldStation for a Man's station. Loaded after sprites-chores.js.

const SHIELD_PAL = {
  ...Object.fromEntries(['#163a1a', '#215226', '#2f6a30', '#3f8a3a', '#5aa64e', '#7cc060'].map((c, k) => [`${k}`, c])),
  a: '#e2b47a', b: '#c8935a', c: '#a8743f', d: '#7e5230', e: '#4e2c1c', W: '#fbf8ee', w: '#dcd8c8', h: '#a8c8a0',
  F: '#c7d0dc', G: '#8a95a6', H: '#5a6078', I: '#2e3040', Q: '#fff0a2', q: '#ecc85a', J: '#a87e2a', j: '#6a4a12',
  R: '#160808', r: '#e0453a', x: '#24150c', A: '#b8844e', s: '#8a5a34', S: '#4a2e18', E: '#3e1218', K: '#c2504a', k: '#9b3434',
  t: '#cf9a62', u: '#a8703f', v: '#74462a', z: '#2a1614',
};
// The white horse running east, head and mane up front, its tail streaming behind.
const SHIELD_HORSE = ['..............##..', '.............####.', '...........######.', '..........####.###', '.........####...##',
  '#.......#####.....', '.###########......', '..##########......', '..###....####.....', '.##.......#..#....', '#.........#...#...'];
const SHIELD_C = { c: 34, r: 14, rx: 12, ry: 8.5 };

// The station at a stage, 14 by 9 units: the trestle, the saddle on its left end over a red cloth, and the shield.
function shieldArt(stage) {
  const G = propGrid(56, 36);
  G.rect(22, 3, 3, 50, (r) => (r === 22 ? 't' : r === 23 ? 'u' : 'v'));
  for (const c of [6, 46]) G.rect(25, c, 11, 3, (r, x) => 'tuv'[x - c]);
  G.rect(30, 9, 1, 37, 'v');
  // The saddle: its red cloth hanging over the plank's front, the leather seat, pommel and cantle lit from the west.
  G.rect(19, 3, 7, 14, (r, c) => (c === 3 || c === 16 ? 'E' : r === 25 ? 'q' : c < 8 ? 'K' : 'k'));
  G.map(12, 1, ['.xx.............', 'xAax........xx..', 'xasx.......xAsx.', 'xassxxxxxxxAssx.', 'xasssAAAaaassssx', 'xasssssssssssSSx',
    '.xssssssssssSSx.', '..xxxxxxxxxxxx..']);
  const { c: cc, r: cr, rx, ry } = SHIELD_C;
  const horse = (r, c) => SHIELD_HORSE[r - 9]?.[c - 25] === '#';
  for (let r = 0; r < 36; r += 1) {
    for (let c = 0; c < 56; c += 1) {
      const [dx, dy] = [(c + 0.5 - cc) / rx, (r + 0.5 - cr) / ry];
      const d = Math.hypot(dx, dy);
      if (d > 1) { if (d < 1 + 1.4 / ry && dy > 0.3) G.set(r, c, 'I'); continue; }
      const lum = -0.5 * dx - 0.55 * dy + 0.45 * Math.sqrt(1 - Math.min(1, d * d));
      if (d > 0.86) {
        if (stage === 4) G.set(r, c, lum > 0.45 ? 'Q' : lum > 0.1 ? 'q' : lum > -0.25 ? 'J' : 'j');
        else if (stage > 1 || dx < 0.15) G.set(r, c, lum > 0.4 ? 'F' : lum > 0 ? 'G' : lum > -0.35 ? 'H' : 'I');
        else G.set(r, c, (c % 5 === 0 ? 'e' : 'd'));
        continue;
      }
      if (stage < 2) {
        const board = Math.floor((c - 22) / 5);
        G.set(r, c, (c - 22) % 5 === 0 ? 'e' : 'abcd'[Math.max(0, Math.min(3, Math.round(1.6 - lum * 2.2 + (board % 2) * 0.5)))]);
        if ((r === 9 || r === 19) && (c - 22) % 5 === 2) G.set(r, c, 'H');
        continue;
      }
      G.set(r, c, `${Math.max(0, Math.min(5, Math.round(2.6 + lum * 3.2)))}`);
      if (!horse(r, c)) continue;
      const whole = stage > 2 || c < 34;
      const edge = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([y, x]) => !horse(y, x));
      if (whole) G.set(r, c, lum < -0.2 ? 'w' : 'W');
      else if (edge) G.set(r, c, 'h');
    }
  }
  if (stage === 3) {
    [[5, 41], [6, 40], [7, 40], [8, 39], [9, 38], [10, 38], [11, 37], [12, 36], [13, 36], [14, 35], [15, 33], [16, 32], [17, 32], [18, 31],
      [19, 30], [20, 29], [21, 28], [22, 28]].forEach(([r, c], k) => { G.set(r, c, 'R'); G.set(r, c + 1, k % 3 ? 'r' : 'R'); });
  }
  return G.rows();
}
// A Man's station at stage 0 to 4 (0 is the bare shield with no one at it), with the gold sparkles of stage 4.
function drawShieldStation(g, x, y, stage) {
  gearMap(g, stationOf(`shield${Math.max(1, stage)}`, () => shieldArt(Math.max(1, stage))), SHIELD_PAL, x - 6, y - 7.75);
  if (stage === 4) for (const [sx, sy] of [[x - 5.5, y - 9.5], [x + 5, y - 8.5]]) gearMap(g, GEAR_SPARK, STATION_Q, sx, sy);
}

// A curry brush: a wooden back over dark bristles.
const ROHAN_BRUSH = ['.oooo.', 'obbbBo', 'oBBBBo', '.kkkk.'];
const ROHAN_BRUSH_PAL = { o: '#2e1d12', b: '#c08a58', B: '#8a5a32', k: '#3a3040' };
// An armful of hay, golden stalks sticking out every way.
const ROHAN_HAY = ['....y..Y...y.y......', '..yYy.yYYyYyYy.Y.y..', '.yYYyYYyYYyYYyYyYy..', 'yYyYYyYyyYYyYyYYyYy.', 'YyYYdYyYYdYyYYdYyYYy',
  '.yYdYYyYdYYyYdYyYdY.', 'yYdYyYdYyYdYyYdYYdYy', '.dYdYdYdYdYdYdYdYdd.', '..d.d..d.d...d..d...'];
LOADS.hay = [ROHAN_HAY, { y: '#f2dc8a', Y: '#d8b85a', d: '#a8863a' }];

Object.assign(POSES, {
  groom: {
    arms(g, f) {
      // The front hand runs a brush up and down a horse's side, the other arm hanging.
      const b = f.bodyTop;
      const hy = b + 1 + f.frame;
      restArm({ ...f, frame: 2 });
      armSleeve(g, f, f.armR, b + 1, f.armR + 1, hy);
      gearMap(g, ROHAN_BRUSH, ROHAN_BRUSH_PAL, f.armR + 1.5, hy - 0.75);
      armHand(g, f, f.armR + 2, hy);
      return { x: f.armR + 3, y: hy };
    },
  },
});
// Walking with the load 'lead': the front arm swings with the stride and the back hand holds a lead rope trailing to
// the horse behind (scene-rohan-horses.js draws the rope from the hand this returns). Any other load is carried as before.
{
  const carry = POSES.carry.arms;
  POSES.carry.arms = (g, f) => {
    if (f.tool !== 'lead') return carry(g, f);
    const b = f.bodyTop;
    f.arm(f.armR, b, b + 2, b + 3, f.frame === 0 ? 1 : f.frame === 1 ? -1 : 0);
    armSleeve(g, f, f.armL, b + 1, f.armL - 1, b + 2);
    armHand(g, f, f.armL - 2, b + 2);
    return { x: f.armL - 2, y: b + 2.5 };
  };
}

// A horse with no rider, hooves on row y and its middle over column x, facing right (scene.js's way of mirroring a
// figure turns it): gait and its frame as the Ranger's horse takes them (sprites-horse.js's GAITS), in coat k of
// HORSE_COATS. Returns its head's art, for the mouth a rope is tied to.
function drawLooseHorse(g, x, y, gait, frame, k) {
  const frames = GAITS[gait] ?? GAITS.stand;
  const s = frames[frame % frames.length];
  const [near, far] = horsePal(...HORSE_COATS[k % HORSE_COATS.length]);
  return drawHorse(g, x, y - (s.bob ?? 0), s, near, far).head;
}
