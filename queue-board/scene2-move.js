// scene2-move.js: how the workers of the map from above (scene2.js) spend their time, by the mood the side view gives
// them (scene.js's scMood). A busy worker works its station a while, then steps out from behind it, walks to a spot in
// its realm (the river bank, the pavilion, a hill door, the forge), works there a few seconds facing it and walks back,
// its choices and timings from a generator seeded by its name so no two move in step, one worker to a spot. Anyone
// not busy goes home first, then sleeps (idle, waiting on CI, stalled), raises a hand (waiting on the owner), cheers now
// and then (green), or stands faded (ended); a failing worker keeps working if busy and sleeps if not. A Sentry rider
// keeps watch at its post in its captain's land. Workers outside the queue roam their own lands while busy (Radagast
// round Rhosgobel, Treebeard in Fangorn, Beorn in the Anduin's vale; anyone else the roads, as Gandalf does) and sit
// down to sleep where they stop. With reduced motion nobody walks.

// A seeded generator for a worker: each call gives the next number in [0, 1).
function m2Rand(a) {
  a.rs = (Math.imul(a.rs ?? a.seed * 7919 + 17, 1103515245) + 12345) >>> 0;
  return ((a.rs >>> 8) % 100000) / 100000;
}
// Steps a figure toward p at speed v, facing the way it goes. False once it is there.
function m2Walk(a, p, v = 0.45) {
  const [dx, dy] = [p.x - a.x, p.y - a.y];
  const d = Math.hypot(dx, dy);
  if (d < 0.5) { a.x = p.x; a.y = p.y; return false; }
  a.x += (dx / d) * Math.min(v, d);
  a.y += (dy / d) * Math.min(v, d);
  a.face = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
  return true;
}
// Walks a list of waypoints in turn; true while still walking.
function m2Route(a) {
  while (a.route?.length) {
    if (m2Walk(a, a.route[0])) return true;
    a.route.shift();
  }
  return false;
}
const m2Busy = (a) => a.mood === 'work' || a.mood === 'checking' || (a.mood === 'failing' && ['busy', 'working'].includes(a.t.workerState));

function m2Step(a, reduced) {
  a.moving = false;
  a.atDesk = false;
  a.posed = null;
  a.hop = 0;
  // A worker in a fight (an orc's duel, scene2.js's m2.step.fight) moves as the fight says.
  if (a.fight && m2.step.fight) return m2.step.fight(a, reduced);
  if (reduced) {
    if (!a.road) Object.assign(a, { x: a.homeX, y: a.homeY, route: null, job: null });
    a.face = 'down';
    a.atDesk = Boolean(a.station && ['elf', 'man'].includes(a.station.kind) && !a.road);
    return;
  }
  if (a.road) return m2.step.road ? m2.step.road(a, reduced) : m2Wander(a);
  // A Sentry rider keeps watch at its post by the road (its horse and its patrol come with a later phase).
  if (a.station.sentry && m2.step.sentry) return m2.step.sentry(a, reduced);
  if (a.station.sentry) { Object.assign(a, { x: a.homeX, y: a.homeY, face: 'down', route: null }); m2Free(a); return; }
  // A realm worker's rounds, jobs and idle life (scene2-life.js) when that file has registered them.
  if (m2.step.life) return m2.step.life(a, reduced);
  const out = { x: a.homeX, y: a.station.y + 3 };
  const home = Math.abs(a.x - a.homeX) < 0.5 && Math.abs(a.y - a.homeY) < 0.5;
  if (a.route?.length) { a.moving = m2Route(a); if (a.moving) return; }
  if (!m2Busy(a)) {
    m2Free(a);
    if (!home) { a.route = m2Way(a, { x: a.homeX, y: a.homeY }, out); a.moving = m2Route(a); return; }
  } else if (home) {
    a.job ??= { until: m2.tick + 120 + Math.floor(m2Rand(a) * 200) };
    if (m2.tick >= a.job.until) {
      const spot = m2PickSpot(a);
      if (spot) { a.job = { spot, until: Infinity }; a.route = m2Way(a, spot, out); a.moving = m2Route(a); return; }
      a.job = null;
    }
  } else if (a.job?.spot) {
    if (a.job.until === Infinity) a.job.until = m2.tick + 40 + Math.floor(m2Rand(a) * 60);
    a.face = a.job.spot.face ?? 'up';
    if (m2.tick >= a.job.until) { m2Free(a); a.route = m2Way(a, { x: a.homeX, y: a.homeY }, out); a.moving = m2Route(a); }
    return;
  } else { a.route = m2Way(a, { x: a.homeX, y: a.homeY }, out); a.moving = m2Route(a); return; }
  a.face = 'down';
  a.atDesk = ['elf', 'man'].includes(a.station.kind);
}
// The way from where a worker is to p by the open ground in front of its station, so it never walks through its own
// desk, plot or anvil: out from behind it first when leaving, and in from the front when coming home.
function m2Way(a, p, out) {
  const leaving = Math.abs(a.x - a.homeX) < 0.5 && Math.abs(a.y - a.homeY) < 0.5;
  const toHome = p.x === a.homeX && p.y === a.homeY;
  const side = { x: a.homeX + (a.seed % 2 ? 9 : -9), y: out.y };
  if (leaving) return [{ x: side.x, y: a.homeY }, side, p];
  if (toHome) return [side, { x: side.x, y: a.homeY }, p];
  return [p];
}
// A free spot in the worker's realm (each holds one worker), or none.
function m2PickSpot(a) {
  const free = a.realm.spots.filter((s) => !s.by || s.by === a.key);
  if (!free.length) return null;
  const s = free[Math.floor(m2Rand(a) * free.length)];
  s.by = a.key;
  return s;
}
function m2Free(a) {
  if (a.job?.spot?.by === a.key) a.job.spot.by = null;
  a.job = null;
}
// A worker outside the queue: while busy it walks to a place on its realm's road, pauses, and goes on; otherwise it
// stays where it is.
function m2Wander(a) {
  if (!m2Busy(a)) { a.route = null; a.face = 'down'; return; }
  if (a.pause > 0) { a.pause -= 1; a.face = 'down'; return; }
  // The next place in its land, or for a road walker one of a few picks along the roads, the nearest of them.
  if (!a.route?.length) {
    const picks = [0, 1, 2, 3, 4, 5].map(() => m2RoadSpot(m2.plan, a.name, Math.floor(m2Rand(a) * 1e6)));
    a.route = [picks.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[1]];
  }
  a.moving = m2Route(a);
  if (!a.moving) a.pause = 20 + Math.floor(m2Rand(a) * 60);
}

// The pose, frame and facing a worker shows: walking (a four-step cycle at its own point in it), working at its station
// or a spot (the swing's three frames), or what its mood says at home.
function m2Pose(a) {
  const t = m2.tick + a.seed;
  if (a.moving) return ['walk', hdWalkFrame(t, 2), a.face];
  const swing = (k) => (m2Reduced.matches ? Math.floor(m2.tick / k) % 2 : hdSwingFrame(t, k));
  if (a.job?.spot && !a.route?.length) return ['stand', 0, a.job.spot.face ?? 'up'];
  if (m2Busy(a)) return a.road || a.station?.sentry ? ['stand', 0, 'down'] : ['work', swing(a.station?.kind === 'elf' ? 4 : 3), 'down'];
  if (a.mood === 'blocked') return ['ask', Math.floor(t / 4) % 2, 'down'];
  if (a.mood === 'green') return [t % 30 < 12 ? 'cheer' : 'stand', 0, 'down'];
  if (a.mood === 'gone') return ['stand', 0, 'down'];
  return ['sleep', m2Reduced.matches ? 0 : (t % 35 < 15 ? 1 : 0), 'down'];
}
