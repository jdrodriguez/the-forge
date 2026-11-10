// scene2-rider.js: the Sentry's riders on the map from above (scene2.js), registered as m2.step.sentry. Each captain
// keeps a lantern post in his own land (Aragorn on the East Road by Weathertop, Faramir in Ithilien, Boromir on the
// Pelennor, Eomer in the Riddermark) with his own horse (scene2-horse.js). By mood, as v1's scene-ride.js:
// - busy: he mounts and patrols his land at a walk round its loop (plan.patrols), trotting the long legs, halting now
//   and then while the horse crops the grass, heading for points 24 units clear of the other riders; every 10 to 30
//   seconds a bug comes out of the wild and he fights it in mounted charges (scene2-rider-bug.js and
//   scene2-rider-fight.js);
// - fighting: against the orc m2.orcs.foe(a) gives (scene2-orc*.js) he charges at a gallop, cuts as he passes with his
//   sword raised, rides on, wheels round and charges again; when it falls he rears with his sword up;
// - main red: he rides out at a swarm orc of the roads in his land (scene2-orcs.js's joust) and fights it until main is
//   green, whatever his mood but ended;
// - idle, waiting or stalled: he rides home, dismounts by his post and the horse grazes beside it while he sleeps, sits
//   or looks about (scene2-life.js's idle life); blocked he raises a hand at the post; green he cheers; gone, faded.
// Mounted, he draws himself (a.draw): the horse, then the rider in the body's ride pose (scene2-body-*.js) on the
// saddle, or until a body has one its standing frame cut at the waist, with his legs astride. With reduced motion he
// stands at his post and the horse stands beside it.

const M2M_RIDE = { walk: 0.5, trot: 0.95, gallop: 1.8 };
// Where a rider's horse waits by the post: right of the post for the first rider, left of his place for the second.
const m2mPark = (a) => (a.station.shared ? { x: a.homeX - 15, y: a.homeY + 1.5 } : { x: a.homeX + 21, y: a.homeY + 1.5 });
const m2mRider = (a) => (a.rr ??= { mounted: false, hx: null, hy: null, face: 'right', gait: 'stand', gf: 0, to: 0, pause: 0, graze: false, charge: null, idle: null });

// Rides along a.route at a gait; true while still riding. The gait's frame steps with the ticks.
function m2mRideRoute(a, R, gait) {
  R.gait = gait;
  R.gf = (gait === 'walk' ? m2.tick >> 1 : m2.tick) % 4;
  while (a.route?.length) {
    if (m2Walk(a, a.route[0], M2M_RIDE[gait])) return true;
    a.route.shift();
  }
  R.gait = 'stand';
  return false;
}

function m2mSentry(a, reduced) {
  const R = m2mRider(a);
  const park = m2mPark(a);
  if (R.hx == null || reduced) Object.assign(R, { hx: park.x, hy: park.y, face: a.station.shared ? 'right' : 'left', mounted: false });
  a.draw = null;
  a.box = null;
  a.tool = null;
  a.headUp = 0;
  if (reduced) {
    Object.assign(a, { x: a.homeX, y: a.homeY, face: 'down', route: null });
    Object.assign(R, { gait: 'stand', sword: null, win: null });
    m2mBugDrop(R);
    m2.orcs?.unjoust?.(a, R);
    return;
  }
  // A duel's foe still standing is charged; one falling ends the fight, and he rears in triumph a moment.
  const foe = m2.orcs?.foe?.(a);
  if (foe && foe.state !== 'fall') { m2mBugDrop(R); m2.orcs?.unjoust?.(a, R); return m2mCharge(a, R, foe); }
  if (R.charge) R.win = { t: 0, until: m2.tick + 30 };
  R.charge = null;
  if (R.win?.until > m2.tick && R.mounted) return m2mWin(a, R);
  Object.assign(R, { win: null, cheer: false, sword: null });
  // Main red: the swarm orc he takes on, till the swarm flees.
  const j = m2.orcs?.joust?.(a, R);
  if (j) { m2mBugDrop(R); return R.mounted ? m2mFight(a, R, j) : m2mMount(a, R); }
  if (m2Busy(a)) {
    if (!R.mounted) return m2mMount(a, R);
    if (R.bug?.phase === 'fight' || m2mBugDue(a, R)) return m2mFight(a, R, R.bug);
    return m2mPatrol(a, R);
  }
  m2mBugDrop(R);
  R.aim = null;
  if (R.mounted) return m2mRideHome(a, R, park);
  // On foot at the post: home first, then the idle life by mood, the horse grazing beside him.
  R.gait = (m2.tick + a.seed * 9) % 400 < 260 ? 'graze' : 'stand';
  R.gf = Math.floor((m2.tick + a.seed) / 6) % 4;
  if (a.route?.length) { a.moving = m2Route(a); if (a.moving) return; }
  if (!m2mAtHome(a)) return m2mGo(a, { x: a.homeX, y: a.homeY });
  R.idle ??= { idle: null };
  m2mIdle(a, R.idle);
}

// A rider on foot walks to his horse's side and mounts.
function m2mMount(a, R) {
  const side = { x: R.hx + (a.station.shared ? 4 : -4), y: R.hy + 0.5 };
  if (a.route?.length) { a.moving = m2Route(a); if (a.moving) return; }
  if (Math.hypot(a.x - side.x, a.y - side.y) > 0.6) { a.route = [side]; a.moving = m2Route(a); return; }
  Object.assign(a, { x: R.hx, y: R.hy, face: R.face });
  R.mounted = true;
  R.to = Math.floor(m2Rand(a) * 6);
  m2mMounted(a, R);
}

// A busy rider rides his land's loop point by point, trotting a long leg, halting now and then while the horse grazes.
function m2mPatrol(a, R) {
  m2mMounted(a, R);
  // His land's loop, or when none of its points can be reached the short way (the loop crosses a river with no
  // bridge near), a small loop of open ground round his post.
  const loop = (R.skips ?? 0) > 5 ? m2mLocalLoop(a, R) : m2.plan?.patrols?.[a.station.land];
  if (!loop?.length) { R.gait = 'stand'; return; }
  if (R.pause > 0) {
    R.pause -= 1;
    R.gait = R.graze ? 'graze' : 'stand';
    R.gf = Math.floor((m2.tick + a.seed) / 6) % 4;
    return;
  }
  if (a.route?.length) { a.moving = m2mRideRoute(a, R, R.far ? 'trot' : 'walk'); if (a.moving) return; }
  let p = loop[R.to % loop.length];
  // A point within 24 units of another rider (where he is or where he heads) is passed over for the next.
  for (let i = 0; i < loop.length - 1 && !R.tries && m2mRiderNear(a, p, 24); i += 1) p = loop[(R.to += 1) % loop.length];
  R.aim = p;
  // A point the way cannot reach all the way (in the river) counts as reached from as near as he got.
  if (Math.hypot(a.x - p.x, a.y - p.y) > 1 && (R.tries = (R.tries ?? 0) + 1) < 3) {
    a.route = m2.paths?.route(a, { x: a.x, y: a.y }, p);
    // A point no way reaches, or only the long way round (behind a range or a city wall), is left for the next.
    if (!a.route || m2mWayLen(a, a.route) > Math.hypot(a.x - p.x, a.y - p.y) * 2.2 + 24) {
      Object.assign(R, { to: R.to + 1, tries: 0, skips: (R.skips ?? 0) + 1 });
      a.route = null;
      // Stuck where no way leads anywhere (a pocket by the river): straight back to his post, and round it from there.
      if (R.skips > 12) { a.route = [{ x: a.homeX, y: a.homeY + 3 }]; R.skips = 6; }
      return;
    }
    R.far = Math.hypot(a.x - p.x, a.y - p.y) > 40;
    a.moving = m2mRideRoute(a, R, R.far ? 'trot' : 'walk');
    return;
  }
  R.to += 1;
  R.tries = 0;
  // Only a ride to a new point counts as a loop that works; the same point again and again does not.
  if ((R.skips ?? 0) <= 5 && R.lastP !== p) R.skips = 0;
  R.lastP = p;
  // He halts only where no one stands near, so he never stops on anybody.
  if (m2Rand(a) < 0.45 && !m2mCrowded(a, a.x, a.y, 14)) Object.assign(R, { pause: 30 + Math.floor(m2Rand(a) * 60), graze: m2Rand(a) < 0.5 });
}

// Whether p is within gap units of another rider still on the board, where he is or where his patrol heads.
const m2mRiderNear = (a, p, gap) => [...m2.actors.values()].some((b) => b !== a && b.mood !== 'gone' && b.rr?.mounted
  && [b, b.rr.aim].some((q) => q && Math.hypot(q.x - p.x, q.y - p.y) < gap));

// Six points of open ground round a rider's post, at 14 to 22 units, kept for the layout.
function m2mLocalLoop(a, R) {
  if (R.local?.key === m2.key) return R.local.pts;
  const P = m2.paths.cells();
  const pts = [];
  for (let i = 0; i < 12 && pts.length < 6; i += 1) {
    const t = (i / 12) * Math.PI * 2;
    const p = { x: a.homeX + Math.cos(t) * (14 + (i % 3) * 4), y: a.homeY + Math.sin(t) * 9 };
    if (P.open[m2mCellOf(P, p.x, p.y)] && m2mClear(P, a.homeX, a.homeY + 2, p.x, p.y)) pts.push(p);
  }
  R.local = { key: m2.key, pts: pts.length ? pts : [{ x: a.homeX, y: a.homeY + 3 }] };
  return R.local.pts;
}

// How long a way is, from where a walker stands along its waypoints.
function m2mWayLen(a, way) {
  let [x, y, n] = [a.x, a.y, 0];
  for (const p of way ?? []) { n += Math.hypot(p.x - x, p.y - y); [x, y] = [p.x, p.y]; }
  return n;
}

// Home from a patrol: he rides to where the horse waits, dismounts beside it and walks to his post.
function m2mRideHome(a, R, park) {
  m2mMounted(a, R);
  if (a.route?.length) { a.moving = m2mRideRoute(a, R, Math.hypot(a.x - park.x, a.y - park.y) > 50 ? 'trot' : 'walk'); if (a.moving) return; }
  if (Math.hypot(a.x - park.x, a.y - park.y) > 1) {
    a.route = m2.paths?.route(a, { x: a.x, y: a.y }, park) ?? [park];
    if (a.route.length === 1 && a.route[0].x === a.x && a.route[0].y === a.y) return;
    a.moving = m2mRideRoute(a, R, 'walk');
    return;
  }
  Object.assign(R, { mounted: false, hx: park.x, hy: park.y, face: a.station.shared ? 'right' : 'left', gait: 'stand' });
  a.draw = null;
  Object.assign(a, { x: park.x + (a.station.shared ? 4 : -4), y: park.y + 0.5, face: 'down' });
}

// Mounted: the rider draws himself, horse and all, and his horse is wherever he is.
function m2mMounted(a, R) {
  a.draw = m2mDrawMounted;
  // The box of the rider himself, from his head to his boots, for scene2.js's see-through pass: what stands in front of
  // him shows him through it, while his horse is hidden by it as anything else would be.
  const b = m2BodyOf(a.kind);
  const seat = a.y + M2M_SEAT[a.face === 'left' || a.face === 'right' ? 'side' : a.face][1];
  a.box = [a.x - b.w * 0.3, seat - (b.head - (b.seat ?? b.head * 0.42)) - 1, a.x + b.w * 0.3, seat + 6];
  a.headUp = 8;
  R.hx = a.x;
  R.hy = a.y;
  R.face = a.face;
}

// A charge against an orc: in to a start a little way off it, a gallop past it with the sword raised and a cut as he
// passes, on 14 units beyond, a wheel round, and again from the other side, a lane in front of or behind the orc by turns.
function m2mCharge(a, R, o) {
  if (!R.mounted) { Object.assign(a, { x: R.hx, y: R.hy }); R.mounted = true; }
  m2mMounted(a, R);
  a.route = null;
  const C = (R.charge ??= { stage: 'come', lane: 1, t: 0, dir: a.x < o.x ? 1 : -1 });
  C.t += 1;
  if (C.stage === 'come') {
    const s = { x: o.x - C.dir * 26, y: o.y + C.lane * 3 };
    a.moving = m2Walk(a, s, M2M_RIDE.gallop * 0.8);
    Object.assign(R, { gait: a.moving ? 'gallop' : 'stand', gf: m2.tick % 4, sword: a.moving ? null : 'ready' });
    if (!a.moving) Object.assign(C, { stage: 'charge', t: 0 });
    return;
  }
  if (C.stage === 'charge') {
    a.x += C.dir * M2M_RIDE.gallop;
    a.y += Math.sign(o.y + C.lane * 3 - a.y) * Math.min(0.5, Math.abs(o.y + C.lane * 3 - a.y));
    a.face = C.dir > 0 ? 'right' : 'left';
    const past = (a.x - o.x) * C.dir;
    Object.assign(R, { gait: 'gallop', gf: m2.tick % 4, sword: past > -4 && past < 4 ? 'cut' : past > -16 ? 'ready' : null });
    if (past > -2 && past < 0) m2mPuff(o.x, o.y - 12, ['#ffffff', '#cfe0ff', '#ffd27a'], 4, { up: 0.5, spread: 1.2, life: 4, kind: 'spark' });
    if (past > 14) Object.assign(C, { stage: 'wheel', t: 0 });
    m2mMounted(a, R);
    return;
  }
  // The wheel: on a few strides, round, and back toward the orc.
  a.x += C.t < 4 ? C.dir * 0.6 : -C.dir * 0.4;
  if (C.t === 4) a.face = C.dir > 0 ? 'left' : 'right';
  Object.assign(R, { gait: 'walk', gf: (m2.tick >> 1) % 4, sword: null });
  m2mMounted(a, R);
  if (C.t >= 9) Object.assign(C, { stage: 'come', t: 0, dir: -C.dir, lane: -C.lane });
}

m2.step.sentry = m2mSafe(m2mSentry, 'sentry');
m2.rider = { charge: (a, reduced) => (reduced ? m2mSentry(a, true) : m2mCharge(a, m2mRider(a), m2.orcs?.foe?.(a) ?? a.fight)) };
