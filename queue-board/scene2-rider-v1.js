// scene2-rider-v1.js: in profile the Sentry's riders and their horses on the map from above are v1's own (sprites-horse.js
// drawRider, its horse, saddle and rider), drawn in a canvas at v1's four pixels a unit and stamped into the map pixel
// for pixel at M2V_K (scene2-body-v1.js) times v1's size, so the horse keeps v1's ratio to its rider. v1 has no horse
// seen end on, so a rider coming toward you or going away keeps scene2-horse.js's horse under v1's rider. A horse
// waiting by its post is v1's horse with its saddle and no rider, built from the same v1 parts drawRider uses.
// scene2-rider-draw.js calls these for the side facing.

// The canvas round v1's horse, in v1 units, and where its anchor (the saddle's column, the hooves' row) sits in it.
const M2V_HORSE = { w: 34, h: 30, ax: 16, ay: 28 };
// The map's gaits as v1 names them (v1 has no trot: a walk).
const M2V_GAIT = { stand: 'stand', graze: 'graze', walk: 'walk', trot: 'walk', gallop: 'gallop', rear: 'rear' };
const m2vRides = new Map();

// v1's horse alone, as drawRider draws it without its rider: far legs, tail, head, body, near legs and the saddle.
function m2vHorseOnly(g, kind, name, x, y, gait, gframe) {
  const frames = GAITS[gait] ?? GAITS.stand;
  const s = frames[gframe % frames.length];
  const [near, far] = horsePal(...(PEOPLE[kind]?.coat ?? HORSE_COATS[(pxHash(name) >>> 5) % HORSE_COATS.length]));
  const by = y - (s.bob ?? 0);
  const leg = (k, pal) => {
    const c = 4 * LEG_X[k] + 3;
    const fore = k < 2;
    const [foot, up] = s.legs[k];
    const top = fore ? -24 : -25;
    haDraw(g, haLeg(fore, top, 4 * foot + 1, 4 - 4 * up, false), pal, x + c / 4, by, null, pal === near ? top + (fore ? 1 : 6) : null);
  };
  leg(1, far);
  leg(3, far);
  haDraw(g, HA_TAILS[s.tail ?? 0], near, x, by, null);
  haDraw(g, haHead(s.head ?? 'up', s.tail === 2), near, x, by, null);
  haDraw(g, HA_BODY, near, x, by, null);
  leg(0, near);
  leg(2, near);
  haDraw(g, HORSE_SADDLE, HORSE_TACK, x, by, null);
}

// One cached frame: the horse with its rider in pose (or none), facing right, in v1's units.
function m2vRideArt(kind, name, gait, gframe, pose, frame) {
  const P = qdFigurePal(kind, name);
  const key = `${kind}|${P.key}|${gait}|${gframe}|${pose}|${frame}`;
  if (m2vRides.has(key)) return m2vRides.get(key);
  const H = M2V_HORSE;
  const c = document.createElement('canvas');
  c.width = H.w * 4;
  c.height = H.h * 4;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.setTransform(4, 0, 0, 4, 0, 0);
  if (pose) drawRider(g, kind, name, H.ax, H.ay, gait, gframe, pose, frame);
  else m2vHorseOnly(g, kind, name, H.ax, H.ay, gait, gframe);
  m2vRides.set(key, c);
  return c;
}

// Stamps a v1 frame with its anchor at (x, y), facing left or right, with a shadow under the hooves.
function m2vStampRide(g, art, x, y, face) {
  const K = M2V_K;
  const H = M2V_HORSE;
  const [px, py] = [Math.round(x * 4) / 4, Math.round(y * 4) / 4];
  const a = g.globalAlpha;
  g.globalAlpha = a * 0.3;
  g.drawImage(m2Foot(), px - 11, py - 1.5, 22, 3);
  g.globalAlpha = a;
  g.save();
  if (face === 'left') { g.translate(2 * px, 0); g.scale(-1, 1); }
  g.imageSmoothingEnabled = false;
  g.drawImage(art, px - H.ax * K, py - H.ay * K, H.w * K, H.h * K);
  g.restore();
}

// A mounted rider in profile, by his sword (scene2-rider.js, scene2-rider-fight.js): on the reins, drawn back as he
// charges (ready), its cut as he passes the orc, a parry (block), or held high while he cheers or rears (up).
const M2V_SWORD = { ready: ['slash', 0], cut: ['slash', 1], block: ['block', 2], up: ['brandish', 0] };
function m2vDrawRider(g, a) {
  const R = a.rr;
  const gait = M2V_GAIT[R.gait] ?? 'stand';
  const [pose, frame] = M2V_SWORD[R.sword] ?? (R.cheer ? M2V_SWORD.up : ['reins', 0]);
  if (a.mood === 'gone') g.globalAlpha = 0.4;
  m2vStampRide(g, m2vRideArt(a.kind, a.name, gait, R.gf ?? 0, pose, frame), a.x, a.y, a.face);
  g.globalAlpha = 1;
}

// A horse waiting by its post with no rider, in profile.
function m2vDrawHorse(g, a, x, y, face, gait, gf) {
  m2vStampRide(g, m2vRideArt(a.kind, a.name, M2V_GAIT[gait] ?? 'stand', gf ?? 0, null, 0), x, y, face);
}
