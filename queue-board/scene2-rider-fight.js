// scene2-rider-fight.js: how a Sentry rider on the map from above (scene2.js) fights an orc of his own in mounted
// charges, as v1's scene-ride.js does (2026-11-09: bring the map to parity with the side view): a bug on patrol
// (scene2-rider-bug.js) or, while main is red, the swarm orc of the roads he takes on (scene2-orcs.js's joust), which
// stands and fights the same way, staggering on hits but never falling, until main is green and it flees. A charge: he
// gallops in along a lane a few units in front of the orc or behind it, by turns, cuts as he passes, and the orc
// parries, takes the hit and staggers back, or swings or lunges while he parries; he rides on a bit over half his
// run-up, wheels round and charges back. The last pass of a bug fells it, and he rides on, rears with his sword up and
// goes back to what he was doing. A fight's place lies in his own land, outside the realms, the cities and Mordor, with
// open ground for the whole charge (the path grid's open cells, clear of every wall, wood and river). The charges run
// across the map, or slant up to 60 degrees and take a shorter run-up where a land is narrow (Ithilien, the Weathertop
// road between its two rivers). A fight keeps 50 units from the other riders' fights (and 12 from the riders
// themselves and anyone standing still), so two riders' charges never cross. scene2-rider.js calls these from his
// step; a jousted swarm orc is drawn by scene2-orc-draw.js in the pose set here.

const M2M_LANE = 4;
const M2M_APART = 50;
// The run-up of a charge: 22 units, or 16 or 12 in a cramped land (the Weathertop road, Ithilien, any land on a
// narrow window's map), riding on a bit over half that past the orc.
const M2M_RUNS = [22, 16, 12];
// How a pass that doesn't fell the orc comes out, each with the orc's pose, for how many ticks, and its sparks.
const M2M_PASSES = ['parry', 'hit', 'hit', 'swing', 'lunge'];
const M2M_REACT = { parry: [['attack', 0], 3, 'clash'], hit: [['stagger', 1], 4, 'hit'], swing: [['attack', 1], 3, 'clash'], lunge: [['attack', 1], 3, 'clash'] };
const M2M_FIGHT_SPARK = { clash: ['#fff6c0', '#ffd23a', '#ff9a3a'], hit: ['#ffffff', '#d83a2a', '#ff9a3a'] };
// The places drawn as stone (a city's tiers, a fortress's yard), where the path grid is open but no fight belongs.
const M2M_STONE = ['minasTirith', 'helmsDeep', 'isengard', 'osgiliath', 'dale', 'lakeTown', 'baradDur', 'blackGate', 'doom'];

// A rider's own generator for his fights and bugs, seeded by his key: each call gives the next number in [0, 1).
function m2mBugRand(a, R) {
  R.brs = (Math.imul(R.brs ?? pxHash(a.key) + 3, 1103515245) + 12345) >>> 0;
  return ((R.brs >>> 8) % 100000) / 100000;
}

// Whether (x, y) is a place for rider a to fight with his charges along the axis (ux, uy): in his own land (64 units of
// his post), outside every realm (the workers' ground), every stone place and Mordor, and with open ground for the
// whole fight (the run-up, the pass and the wheel on both sides of the orc, along both lanes). A stray closed cell or
// two (a post, a trunk) is ridden past, and the edge of a house's or a tree's ground; a river, a wall, a wood or a
// house's floor is not.
function m2mRoomAt(a, x, y, ux = 1, uy = 0, run = M2M_RUNS[0]) {
  const P = m2.paths?.cells?.();
  if (!P || Math.hypot(x - a.homeX, y - a.homeY) > 64) return false;
  const at = (s, k) => [x + ux * s - uy * k, y + uy * s + ux * k];
  const ends = [at(-run, 0), at(run, 0), at(-run, M2M_LANE), at(run, -M2M_LANE), [x, y]];
  const inside = (b, m) => ends.some(([px, py]) => px > b.x0 - m && px < b.x1 + m && py > b.y0 - m && py < b.y1 + m);
  if (ends.some(([px, py]) => px < 6 || px > m2.W - 6 || py < 22 || py > m2.H - 4)) return false;
  if (m2.realms.some((r) => inside({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, 4))) return false;
  if ([...M2M_STONE.map((k) => m2.plan.zones?.[k]), m2.plan.mordor].some((b) => b && inside(b, 0))) return false;
  let [shut, near] = [0, 0];
  for (let k = -M2M_LANE; k <= M2M_LANE; k += M2M_LANE) {
    for (let d = -run - 2; d <= run + 2; d += 2) {
      const c = m2mCellOf(P, ...at(d, k));
      if (!P.open[c] ? (shut += 1) > 2 : !P.wide[c] && (near += 1) > (run < 20 ? 6 : 4)) return false;
    }
  }
  return true;
}
// Whether a fight at (x, y) keeps gap units from the other riders' fights and every duel on the board, and a quarter of
// that from the other riders themselves (where each is and where his patrol heads) and from anyone standing still. Two
// riders share a land, and a land is far smaller than v1's road (Ithilien has room for a fight in a handful of places),
// so only the fights keep v1's distance: a rider may patrol past another's fight, but two fights never meet.
function m2mFightClear(a, x, y, gap) {
  const far = (p, k = 1) => !p || Math.hypot(p.x - x, p.y - y) >= gap * k;
  for (const b of m2.actors.values()) {
    if (b === a || b.mood === 'gone') continue;
    const R = b.rr;
    if (b.station?.sentry) {
      const f = R?.bug?.phase === 'fight' ? R.bug : R?.joust;
      const duel = m2.orcs?.foe?.(b);
      if (!far(b, 0.25) || !far(R?.aim, 0.25) || !far(f && { x: f.ox, y: f.oy }) || !far(duel)) return false;
    } else if (!b.moving && !far(b, 0.25)) return false;
  }
  for (const f of m2e.duels.values()) if (f.phase === 'fight' && !far(f.o, 0.5)) return false;
  return true;
}
// The axes a fight's charges may run along: across the map, or slanting up to 60 degrees where a land is narrow (a
// rider is drawn in profile, so he never charges straight up or down).
const M2M_AXES = [0, 25, -25, 45, -45, 60, -60].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);
// Where rider a fights near (x, y), with the axis and run-up of his charges (p.ux, p.uy, p.run): there, or the nearest
// place between r0 and r units off that has room and is clear of the others, searched ring by ring; null when there is
// none.
function m2mFightNear(a, x, y, r, r0 = 0) {
  for (let d = r0; d <= r; d += 4) {
    for (let k = 0; k < (d ? 12 : 1); k += 1) {
      const p = { x: Math.round(x + Math.cos((k / 12) * Math.PI * 2) * d), y: Math.round(y + Math.sin((k / 12) * Math.PI * 2) * d * 0.6) };
      if (!m2mFightClear(a, p.x, p.y, M2M_APART)) continue;
      for (const run of M2M_RUNS) {
        const u = M2M_AXES.find(([ux, uy]) => m2mRoomAt(a, p.x, p.y, ux, uy, run));
        if (u) return Object.assign(p, { ux: u[0], uy: u[1], run });
      }
    }
  }
  return null;
}

// A new fight between rider a and orc o at place p (its charges along p's axis), to last n passes, his first charge
// starting from a run-up on his own side of the orc.
function m2mFightNew(a, R, o, p, n) {
  const f = { o, ox: p.x, oy: p.y, ux: p.ux ?? 1, uy: p.uy ?? 0, run: p.run ?? M2M_RUNS[0], stage: 'come', lane: m2mBugRand(a, R) < 0.5 ? 1 : -1, k: 0, n, t: 0 };
  f.side = m2mAlong(f, a)[0] < 0 ? -1 : 1;
  // Whatever way he was riding (his patrol's) gives way to the ride round to his first charge.
  a.route = null;
  return f;
}
// Where p is in fight f's own terms: how far along its axis from the orc, and how far to one side of it.
const m2mAlong = (f, p) => [(p.x - f.ox) * f.ux + (p.y - f.oy) * f.uy, (p.y - f.oy) * f.ux - (p.x - f.ox) * f.uy];
// The place s along fight f's axis and q to its side, kept on the map.
const m2mPlaceOf = (f, s, q) => ({ x: Math.max(4, Math.min(m2.W - 4, f.ox + f.ux * s - f.uy * q)), y: Math.max(8, Math.min(m2.H - 2, f.oy + f.uy * s + f.ux * q)) });
// Moves rider a by ds along fight f's axis, drifting toward his lane, and turns him the way he goes (dir, when given).
function m2mRideAxis(a, f, ds, dir) {
  const [s, q] = m2mAlong(f, a);
  const lane = f.lane * M2M_LANE;
  Object.assign(a, m2mPlaceOf(f, s + ds, q + Math.sign(lane - q) * Math.min(0.5, Math.abs(lane - q))));
  if (dir) a.face = dir > 0 ? 'right' : 'left';
}
// A place near orc o for rider a to fight it: where it stands, or the nearest place within 20 units that has room.
const m2mFightSpot = (a, o) => m2mFightNear(a, o.x, o.y, 20);

// One tick of a fight in mounted charges between rider a and the orc of fight f (a bug, or a jousted swarm orc). It
// moves and poses them both.
function m2mFight(a, R, f) {
  m2mMounted(a, R);
  if (f.stage === 'come') return m2mFightCome(a, R, f);
  a.route = null;
  if (f.stage === 'charge') return m2mFightPass(a, R, f);
  m2mFightRound(a, R, f);
}
// The orc comes to its place while the rider rides round to the start of his first charge, at a canter by the way
// round what stands.
function m2mFightCome(a, R, f) {
  m2mOrcBusy(f, a);
  const s = m2mPlaceOf(f, f.side * f.run, f.lane * M2M_LANE);
  R.sword = null;
  if (!a.route?.length) {
    const way = Math.hypot(a.x - s.x, a.y - s.y) > 6 ? m2.paths?.route?.(a, { x: a.x, y: a.y }, s) : [s];
    // The way search is busy this tick: he waits a tick where he is.
    if (way?.length === 1 && way[0].x === a.x && way[0].y === a.y) { R.gait = 'stand'; return; }
    a.route = way ?? [s];
  }
  a.moving = m2mRideRoute(a, R, 'gallop');
  if (!a.moving) { a.route = null; f.stage = 'ready'; }
}
// The orc between blows: reeling from the last one, going back to its place, or braced and facing the rider. True while
// it is busy, so the rider waits for it.
function m2mOrcBusy(f, a) {
  const o = f.o;
  if (f.react?.n > 0) {
    o.pose = f.react.pose;
    f.react.n -= 1;
    if (f.push > 0) { o.x += f.ux * f.dir; o.y += f.uy * f.dir; f.push -= 1; }
    o.moving = false;
    return true;
  }
  if (Math.hypot(o.x - f.ox, o.y - f.oy) > 1) {
    m2eRun(o, { x: f.ox, y: f.oy }, 0.9);
    o.pose = ['walk', hdWalkFrame(m2.tick + o.seed, 1)];
    return true;
  }
  Object.assign(o, { moving: false, face: a.x < o.x ? 'left' : 'right', pose: ['attack', 0] });
  return false;
}
// Between charges he wheels round (a few strides on, a turn, a few back toward the orc), then waits facing it with his
// sword drawn back until the orc is ready, and charges.
function m2mFightRound(a, R, f) {
  const busy = m2mOrcBusy(f, a);
  const dir = m2mAlong(f, a)[0] > 0 ? -1 : 1;
  const facing = a.face === 'left' ? -1 : a.face === 'right' ? 1 : 0;
  if (f.stage === 'ready' && facing !== dir) Object.assign(f, { stage: 'wheel', t: 0, wdir: facing || -dir });
  if (f.stage === 'wheel') {
    const t = f.t;
    f.t += 1;
    m2mRideAxis(a, f, t < 3 ? f.wdir * 0.6 : -f.wdir * 0.4, t === 2 || facing === 0 ? -f.wdir : 0);
    Object.assign(R, { gait: 'walk', gf: t % 4, sword: null });
    a.moving = true;
    if (f.t >= 6) f.stage = 'ready';
    return;
  }
  a.moving = false;
  Object.assign(R, { gait: 'stand', sword: 'ready' });
  if (busy) return;
  // The next pass: the last of a bug's fells it; never the same pass twice running, if the dice allow.
  const pick = () => M2M_PASSES[Math.floor(m2mBugRand(a, R) * M2M_PASSES.length)];
  let plan = f.k >= f.n - 1 ? 'fell' : pick();
  if (plan === f.plan) plan = pick();
  Object.assign(f, { stage: 'charge', dir, plan, done: false, cut: 0, tx: dir * f.run * (0.55 + m2mBugRand(a, R) * 0.18) });
}
// A charge: he gallops along his lane past the orc, sword drawn back, and cuts as he passes (or parries its swing or
// lunge), then rides on a bit over half his run-up and wheels round.
function m2mFightPass(a, R, f) {
  const [d, o] = [f.dir, f.o];
  m2mRideAxis(a, f, d * M2M_RIDE.gallop, d);
  a.moving = true;
  Object.assign(R, { gait: 'gallop', gf: m2.tick % 4 });
  const s = m2mAlong(f, a)[0];
  const dist = -s * d;
  const guard = f.plan === 'swing' || f.plan === 'lunge';
  if (!f.done && dist <= 1) m2mPassHit(a, R, f);
  R.sword = f.done ? (f.cut > 0 ? (guard ? 'block' : 'cut') : null) : dist < 16 ? (guard ? 'block' : 'ready') : null;
  f.cut -= 1;
  if (f.phase === 'fall') return;
  if (f.done) m2mOrcBusy(f, a);
  else Object.assign(o, { face: a.x < o.x ? 'left' : 'right', pose: guard && dist < 10 ? ['attack', dist < 4 ? 1 : 0.5] : ['attack', 0] });
  if ((s - f.tx) * d < 0 && a.x > 4 && a.x < m2.W - 4) return;
  Object.assign(f, { stage: 'wheel', t: 0, wdir: d, lane: -f.lane, k: f.k + 1 });
}
// The moment he passes the orc: a felling blow ends a bug (it falls, and he rides on and rears), any other its own way.
function m2mPassHit(a, R, f) {
  const o = f.o;
  Object.assign(f, { done: true, cut: 3 });
  const y = o.y - (o.kind === 'uruk' ? 14 : 10);
  if (f.plan === 'fell') {
    Object.assign(f, { phase: 'fall', t0: m2.tick, spark: { at: m2.tick, x: o.x, y: y + 2, c: M2M_FIGHT_SPARK.hit } });
    o.pose = ['stagger', 1];
    R.win = { to: m2mPlaceOf(f, f.tx, f.lane * M2M_LANE), dir: f.dir, t: 0, until: m2.tick + 30 };
    return;
  }
  const [pose, n, spark] = M2M_REACT[f.plan];
  f.react = { pose, n };
  f.push = f.plan === 'hit' ? 2 : 0;
  f.spark = { at: m2.tick, x: (a.x + o.x) / 2, y, c: M2M_FIGHT_SPARK[spark] };
}
// After a felling blow, or a duel won: he rides on to the end of his pass, rears with his sword up and holds it there,
// then goes back to what he was doing. The rear is v1's own, in profile.
function m2mWin(a, R) {
  const w = R.win;
  m2mMounted(a, R);
  Object.assign(R, { sword: 'up', cheer: true });
  a.route = null;
  const left = w.to ? Math.hypot(w.to.x - a.x, w.to.y - a.y) : 0;
  if (left > 0.5) {
    a.x += ((w.to.x - a.x) / left) * Math.min(1.5, left);
    a.y += ((w.to.y - a.y) / left) * Math.min(1.5, left);
    a.face = w.dir > 0 ? 'right' : 'left';
    Object.assign(R, { gait: 'gallop', gf: m2.tick % 4 });
    a.moving = true;
    return;
  }
  w.t += 1;
  a.moving = false;
  const side = a.face === 'left' || a.face === 'right';
  Object.assign(R, { gait: side && w.t < 9 ? 'rear' : 'stand', gf: w.t < 3 || w.t > 6 ? 0 : 1 });
}
