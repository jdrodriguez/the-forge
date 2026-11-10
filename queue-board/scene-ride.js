// scene-ride.js: the Sentry slot's Ranger in the Middle-earth view (scene.js), a fighter on horseback, since Sentry
// reports bugs. While busy it patrols the whole road at a walk, edge to edge, and every 10 to 30 seconds a "bug" orc
// comes onto the road near it (scene-orcs.js's orcEntry). The Ranger fights it in mounted charges: it gallops in and
// cuts as it passes (the orc parries, ducks, or takes the hit and staggers), rides on, wheels round and charges back,
// while the orc turns to face it and now and then swings or lunges. The last of two to four passes fells it, as a
// duel's orc falls (scene-orcs.js), and the Ranger rears with its sword up and goes back to its patrol. A failing check
// on its PR is scene-orcs.js's duel, fought the same way wherever the Ranger is until the checks pass, when the next
// pass is the last blow. While main is red it fights a swarm orc on the road (scene-orcs.js's orcJoust), which stands
// and staggers but never falls, and lets it go when the swarm flees. Riders keep their patrols and fights clear of each
// other and of anyone standing on the road. Idle, waiting on CI or stalled, it sleeps in the saddle at its post in its
// own realm while the horse grazes; blocked, it raises a hand; green, it cheers now and then. With reduced motion it
// stays at its post and a fight is a still tableau. The art is sprites-horse.js. Loaded after scene-orcs.js, it sets
// sc.ride, which scene.js calls for each mounted actor (step, pose, draw, z), and scene-orcs.js for its duels (duel,
// charge); scene-orcs.js also ages each rider's bug.
const RIDE_WALK = 0.5;
const RIDE_GALLOP = 2;
// How far inside the road's ends a fight keeps its orc, so every charge has room to ride on and wheel.
const RIDE_ROOM = 18;
// The rows of road the riders and their orcs keep to, above the near verge, and how far in front of the orc or behind
// it a charge passes.
const RIDE_ROAD = [ROAD_Y + 4, SCENE_H - 4];
const RIDE_LANE = 3;
// How far apart two riders' fights keep, so their charges never cross.
const RIDE_APART = 50;
// How a pass that doesn't fell the orc comes out (the cut parried, ducked or landing, or the orc swinging or lunging and
// the rider parrying), each with the orc's pose, for how many ticks, and its sparks (scene-duel.js).
const RIDE_PASSES = ['parry', 'duck', 'hit', 'hit', 'swing', 'lunge'];
const RIDE_REACT = { parry: [['block', 0], 3, 'clash'], duck: [['bend', 0], 4, 'miss'], hit: [['stagger', 1], 4, 'hit'], swing: [['fight', 1], 3, 'clash'], lunge: [['lunge', 0], 3, 'clash'] };

// The road from end to end, which every rider patrols and fights along.
const rideSpan = () => [6, sc.W - 6];
const rideClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rideToward = (d) => Math.sign(d) * Math.min(1, Math.abs(d));
const rideGait = (moving) => (moving ? ['walk', Math.floor(sc.tick / 2) % 4] : ['stand', 0]);

// A rider's own state, kept on its actor: its generator, when its next bug comes, the bug, the swarm orc it fights,
// its cheer after a win and where its patrol is headed.
function rideState(a) {
  a.ride ??= { rng: workRng(pxHash(a.key) + 3), next: 0, bug: null, bugs: 0, joust: null, win: null, to: null, pause: 0, graze: false };
  return a.ride;
}

// One frame for a mounted actor: a duel's charges (moved by scene-orcs.js), the cheer after a win, a swarm orc, a bug,
// its patrol, or home. a.horse is the horse's [gait, frame] and a.rp the rider's [pose, frame].
function rideStep(a) {
  const R = rideState(a);
  const now = performance.now();
  a.lift = 0;
  if (scReduced.matches || a.mood === 'gone' || a.duel?.phase === 'fight') { orcUnjoust(a, R); rideDrop(R, now); }
  if (scReduced.matches) return rideHome(a, true);
  if (a.duel?.phase === 'fight') return;
  if (R.win && now > R.win.until) R.win = null;
  if (R.win) return rideWin(a, R.win);
  const o = orcJoust(a, R);
  if (o) { rideDrop(R, now); return rideCharge(R.joust, a, o); }
  const busy = a.mood === 'work' || a.mood === 'checking';
  if (!busy) rideDrop(R, now);
  if (R.bug?.phase === 'fight') return rideCharge(R.bug, a);
  if (busy) return ridePatrol(a, R, now);
  rideHome(a);
}

// A bug still coming or fighting fades away when the rider has something else to do.
const rideDrop = (R, now) => { if (R.bug?.phase === 'fight') Object.assign(R.bug, { phase: 'fade', at: now }); };

// A busy Ranger walks the road from end to end, to one spot and then another clear of the other riders, stopping now
// and then (the horse sometimes grazing), until the next bug.
function ridePatrol(a, R, now) {
  const [lo, hi] = rideSpan();
  R.next ||= now + span(R.rng, 10000, 30000);
  if (!R.bug && now > R.next) return rideCharge(rideBug(a, R, now), a);
  a.rp = ['reins', 0];
  if (R.pause > 0) {
    R.pause -= 1;
    a.moving = false;
    a.horse = R.graze ? ['graze', Math.floor((sc.tick + a.seed) / 8) % 2] : ['stand', 0];
    return;
  }
  for (let i = 0; i < 6 && !R.to; i += 1) {
    const x = span(R.rng, lo + 4, hi - 4);
    if (i === 5 || rideClear(a, x, 24)) R.to = { x, y: span(R.rng, RIDE_ROAD[0], RIDE_ROAD[1] - 2) };
  }
  a.moving = scMove(a, R.to, RIDE_WALK);
  a.horse = rideGait(a.moving);
  if (!a.moving) Object.assign(R, { to: null, pause: span(R.rng, 20, 60), graze: R.rng() < 0.3 });
}
// A bug: an orc that comes onto the road to a place near the rider, and falls in two to four passes.
function rideBug(a, R, now) {
  const p = rideMeet(a, R.rng);
  R.bugs += 1;
  const b = { phase: 'fight', at: now, ...orcEntry(p, a.x), op: ['walk', 0], lift: 0, seed: `${a.key}/bug${R.bugs}` };
  R.bug = Object.assign(b, rideFight(a, b, span(R.rng, 2, 4), p));
  return R.bug;
}
// The orc of a failing check's duel, for scene-orcs.js: it comes onto the road to fight wherever the rider is, at its
// post or out on patrol.
function rideDuel(a) {
  const R = rideState(a);
  const p = rideMeet(a, R.rng);
  const d = { ...orcEntry(p, a.x), op: ['walk', 0], lift: 0 };
  return Object.assign(d, rideFight(a, d, Infinity, p));
}
// Where a bug's or a duel's orc stands to fight rider a: 22 pixels or more ahead of it (behind it near the end of the
// road), further out and on alternate sides on each try, until the place is clear of the other riders and of anyone
// standing on the road.
function rideMeet(a, rng) {
  const [lo, hi] = rideSpan();
  const ahead = a.face || 1;
  const dir = (ahead > 0 ? hi - a.x : a.x - lo) > RIDE_ROOM + 40 ? ahead : -ahead;
  const at = (i) => Math.round(rideClamp(a.x + dir * (i % 2 ? -1 : 1) * span(rng, 22, 40 + i * 20), lo + RIDE_ROOM, hi - RIDE_ROOM));
  const tries = [0, 1, 2, 3, 4, 5].map(at);
  return { x: tries.find((x) => rideClear(a, x, RIDE_APART)) ?? tries[0], y: span(rng, RIDE_ROAD[0] + 3, RIDE_ROAD[1] - 3) };
}
// Whether column x of the road is gap pixels clear, for rider a, of the other riders (where each is, where its patrol
// heads and where its fight stands) and half that clear of anyone standing still on the road.
function rideClear(a, x, gap) {
  return [...sc.actors.values()].every((b) => b === a || (b.mounted
    ? [b.x, b.ride?.to?.x, (b.ride?.bug ?? b.ride?.joust ?? b.duel)?.ox].every((v) => v === undefined || Math.abs(v - x) >= gap)
    : !b.road || b.moving || Math.abs(b.x - x) >= gap / 2));
}

// A new fight between rider a and orc o, to last n passes: where the orc stands to fight (p, or else where it is, kept
// on the road with room both sides) and where the rider starts its first charge (a run-up of 22 to 40 pixels on its own
// side, or the other side if that has no room).
function rideFight(a, o, n, p = o) {
  const [lo, hi] = rideSpan();
  const ox = Math.round(rideClamp(p.x, lo + RIDE_ROOM, hi - RIDE_ROOM));
  const oy = Math.round(rideClamp(p.y, RIDE_ROAD[0] + 1, RIDE_ROAD[1] - 1));
  const side = a.x < ox ? -1 : 1;
  let sx = ox + side * rideClamp(Math.abs(a.x - ox), 22, 40);
  if (sx < lo || sx > hi) sx = ox - side * 22;
  const rng = workRng(Math.floor(rideState(a).rng() * 4294967296));
  return { stage: 'come', ox, oy, sx: rideClamp(sx, lo, hi), lane: rng() < 0.5 ? 1 : -1, k: 0, n, t: 0, rng };
}
// The row a charge rides along: a few rows in front of the orc or behind it, by turns, kept on the road.
function rideLane(f) {
  let y = f.oy + f.lane * RIDE_LANE;
  if (y < RIDE_ROAD[0] || y > RIDE_ROAD[1]) { f.lane = -f.lane; y = f.oy + f.lane * RIDE_LANE; }
  return y;
}

// One tick of a fight in mounted charges between rider a and orc o, with f its state (for a duel or a bug, f is the
// orc too). It moves the rider (a.x, a.y, a.face, a.z) and sets its gait and pose, and moves and poses the orc (o.x,
// o.y, o.face, o.op, o.lift), which is all scene-orcs.js needs to draw it.
function rideCharge(f, a, o = f) {
  if (scReduced.matches) return rideTableau(a, o);
  const [lo, hi] = rideSpan();
  o.lift = 0;
  if (f.stage === 'come') rideCome(f, a, o);
  else if (f.stage === 'charge') ridePass(f, a, o, lo, hi);
  else rideRound(f, a, o, lo, hi);
  a.z = a.y;
}
// The orc comes in to its place while the rider rides to the start of its first charge.
function rideCome(f, a, o) {
  rideOrc(f, a, o);
  a.moving = scMove(a, { x: f.sx, y: rideLane(f) }, RIDE_GALLOP);
  a.horse = a.moving ? ['gallop', sc.tick % 4] : ['stand', 0];
  a.rp = ['reins', 0];
  if (!a.moving) f.stage = 'ready';
}
// The orc between blows: reeling from the last one, walking back to its place, or braced and facing the rider. True
// while it is busy, so the rider waits for it.
function rideOrc(f, a, o) {
  if (f.react?.n > 0) {
    o.op = f.react.pose;
    f.react.n -= 1;
    if (f.push > 0) { o.x += f.dir; f.push -= 1; }
    return true;
  }
  if (Math.hypot(o.x - f.ox, o.y - f.oy) > 1.5) {
    orcRun(o, 0.9, { x: f.ox, y: f.oy });
    o.op = ['walk', hdWalkFrame(sc.tick, 1)];
    return true;
  }
  o.moving = false;
  o.face = a.x < o.x ? -1 : 1;
  o.op = ['block', 2];
  return false;
}
// Between charges the rider wheels round (a few steps on, a turn, a few steps back toward the orc), then waits facing
// it, sword drawn back, until the orc is ready, and charges.
function rideRound(f, a, o, lo, hi) {
  const busy = rideOrc(f, a, o);
  const dir = o.x < a.x ? -1 : 1;
  if (f.stage === 'ready' && a.face !== dir) Object.assign(f, { stage: 'wheel', t: 0, wdir: a.face || 1 });
  if (f.stage === 'wheel') {
    const t = f.t;
    f.t += 1;
    a.x = rideClamp(a.x + (t < 3 ? f.wdir * 0.6 : -f.wdir * 0.4), lo, hi);
    a.y += rideToward(rideLane(f) - a.y);
    if (t === 2) a.face = -f.wdir;
    Object.assign(a, { moving: true, horse: ['walk', t % 4], rp: ['reins', 0] });
    if (f.t >= 6) f.stage = 'ready';
    return;
  }
  Object.assign(a, { moving: false, horse: ['stand', 0], rp: ['slash', 0] });
  if (!busy) ridePlan(f, o, dir);
}
// The next pass: which way, how far the rider rides on past the orc, and how it comes out. The last of a bug's passes,
// or the first after a duel's checks pass (f.finish, from scene-orcs.js), fells the orc.
function ridePlan(f, o, dir) {
  const pick = () => RIDE_PASSES[Math.floor(f.rng() * RIDE_PASSES.length)];
  let plan = f.finish || f.k >= f.n - 1 ? 'fell' : pick();
  // Never the same pass twice running, if the dice allow.
  if (plan === f.plan) plan = pick();
  Object.assign(f, { stage: 'charge', dir, plan, done: false, cut: 0, t: 0, tx: o.x + dir * span(f.rng, 10, 15) });
}
// A charge: the rider gallops along its lane past the orc, sword drawn back, and cuts as it passes (or parries the
// orc's swing or lunge), then rides on 10 to 15 pixels and wheels round.
function ridePass(f, a, o, lo, hi) {
  const d = f.dir;
  a.x = rideClamp(a.x + d * RIDE_GALLOP, lo, hi);
  a.y += rideToward(rideLane(f) - a.y);
  Object.assign(a, { face: d, moving: true, horse: ['gallop', f.t % 4] });
  f.t += 1;
  const dist = (o.x - a.x) * d;
  const guard = f.plan === 'swing' || f.plan === 'lunge';
  if (!f.done && dist <= 1) rideStrike(f, a, o);
  if (f.done) a.rp = f.cut > 0 ? (guard ? ['block', 2] : ['slash', 1]) : ['reins', 0];
  else a.rp = dist < 16 ? (guard ? ['block', 2] : ['slash', 0]) : ['reins', 0];
  f.cut -= 1;
  if (o.phase === 'fall') return;
  if (f.done) rideOrc(f, a, o);
  else Object.assign(o, { face: -d, op: f.plan === 'swing' && dist < 12 ? ['fight', 0] : ['block', 2] });
  if ((a.x - f.tx) * d < 0 && a.x > lo && a.x < hi) return;
  Object.assign(f, { stage: 'wheel', t: 0, wdir: d, lane: -f.lane, k: f.k + 1 });
}
// The moment the rider passes the orc. A felling blow is scene-orcs.js's orcBlow, and the rider cheers after it.
function rideStrike(f, a, o) {
  const now = performance.now();
  f.done = true;
  f.cut = 3;
  if (f.finish) f.plan = 'fell';
  if (f.plan === 'fell') {
    orcBlow(a, o, now);
    rideState(a).win = { tx: f.tx, dir: f.dir, t: 0, until: now + 2200 };
    return;
  }
  const [pose, n, spark] = RIDE_REACT[f.plan];
  f.react = { pose, n };
  f.push = f.plan === 'hit' ? 2 : 0;
  fightSparks({ [spark]: 0 }, 0, a.x - f.dir * 4, o.x, o.y);
}
// After the felling blow the rider rides on to the end of its pass, rears with its sword up and holds it there, then
// goes back to what it was doing.
function rideWin(a, w) {
  a.rp = ['brandish', 0];
  const left = (w.tx - a.x) * w.dir;
  if (left > 0.5) {
    Object.assign(a, { x: a.x + w.dir * Math.min(1.5, left), face: w.dir, moving: true, horse: ['gallop', sc.tick % 4] });
    return;
  }
  a.moving = false;
  w.t += 1;
  a.horse = w.t < 9 ? ['rear', w.t < 3 || w.t > 6 ? 0 : 1] : ['stand', 0];
}
// With reduced motion a fight is a still tableau at the post: the rider turned toward the orc with its sword drawn back,
// the orc swinging at it.
function rideTableau(a, o) {
  Object.assign(a, { x: a.homeX, y: a.homeY, face: -1, moving: false, z: a.homeY, horse: ['stand', 0], rp: ['slash', 0] });
  Object.assign(o, { x: a.homeX - 18, y: a.homeY, face: 1, lift: 0, op: ['fight', 1] });
}

// At home by its post, facing it. By mood: asleep in the saddle while the horse grazes (idle, waiting on CI, stalled),
// a hand up (blocked), cheering now and then (green), or sitting still (ended, and anything else). still: with reduced
// motion it is simply there.
function rideHome(a, still = false) {
  const R = rideState(a);
  Object.assign(R, { next: 0, to: null, pause: 0 });
  if (still) Object.assign(a, { x: a.homeX, y: a.homeY });
  // From far along the road it canters home, and walks the last stretch.
  const far = Math.abs(a.x - a.homeX) > 60;
  a.moving = !still && scMove(a, { x: a.homeX, y: a.homeY }, far ? 1.4 : RIDE_WALK + 0.2);
  a.horse = far && a.moving ? ['gallop', sc.tick % 4] : rideGait(a.moving);
  a.rp = ['reins', 0];
  if (a.moving) return;
  a.face = 1;
  const t = sc.tick + a.seed;
  const m = a.mood;
  if (a.cheerUntil > performance.now() || (m === 'green' && t % 20 < 10)) a.rp = ['brandish', 0];
  else if (m === 'idle' || m === 'stalled' || m === 'waiting') [a.horse, a.rp] = [['graze', Math.floor(t / 8) % 2], ['sleep', 0]];
  else if (m === 'blocked') a.rp = ['hail', Math.floor(t / 4) % 2];
  else if (m === 'gone') a.rp = ['stand', 0];
}

// The horse and its rider, at column x (scene.js has already turned the canvas for one facing left).
function rideDraw(a, x, pose, frame, tool) {
  const [gait, gframe] = a.horse ?? ['stand', 0];
  return drawRider(scG, a.kind, a.name, x, Math.round(a.y), gait, gframe, pose, frame, tool);
}
sc.ride = { step: rideStep, pose: (a) => a.rp ?? ['reins', 0], draw: rideDraw, z: (a) => a.y, duel: rideDuel, charge: rideCharge };
