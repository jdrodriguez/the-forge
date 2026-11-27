// scene-orcs.js: the orcs of the Middle-earth view (scene.js). A worker whose PR has a failing CI check (board.mjs leaves
// the review's checks out) fights an orc: the orc comes down from the back of the realm and they fight across the open
// ground near the worker's station (scene-duel.js sets the moves). Once no check is failing (a fix pushed, a re-run
// started, the PR green or merged) the worker strikes a last blow, the orc falls where it stands and fades while the
// worker cheers, and the worker walks home;
// if the worker ends or its ticket leaves the board, the orc just fades. While main is red (snap.main, from board.mjs) a
// swarm runs through every realm and along the road, some with torches and one per realm hunting a worker to fight the
// same way, the realms burn and the sky turns red (scenery.js reads sc.war). When main is green again the swarm flees off
// the edges. The Sentry's mounted Ranger fights its duel on the road in charges instead (scene-ride.js), anywhere along
// it, against an orc that comes onto the road near it (orcEntry), as each of its bugs does; while main is red it takes on
// a swarm orc on the road (orcJoust), which stands and fights it. Loaded after scene.js, it sets sc.orcs, which scene.js
// calls after each snapshot (sync) and on every frame (items).
const ORC_FALL_MS = 2500;
const ORC_FADE_MS = 2000;
const ORC_BLOW_MS = 400;
const ORC_GAP = 15;
const SWARM_REALM = 4;
const SWARM_ROAD = 3;
const orcs = { war: false, swarm: [], loose: [], duelists: new Map(), n: 0 };
// A row for a swarm orc on the road, above its near verge.
const orcRoadY = () => ROAD_Y + 6 + Math.random() * (SCENE_H - ROAD_Y - 11);

// The duels follow each live ticket's PR checks; the swarm follows main. Runs after scene.js has matched the actors.
function orcSync() {
  const now = performance.now();
  for (const [key, a] of orcs.duelists) {
    if (sc.actors.get(key) === a) continue;
    if (a.duel && a.duel.phase !== 'fall') orcs.loose.push({ x: Math.round(a.duel.x), y: Math.round(a.duel.y), face: a.duel.face, seed: key, at: now });
    orcs.duelists.delete(key);
  }
  for (const a of sc.actors.values()) {
    const pr = a.t.pr;
    const d = a.duel;
    if (a.mood === 'gone') {
      if (d?.phase === 'fight') Object.assign(d, { phase: 'fade', at: now });
      continue;
    }
    if (!pr || !a.realm) continue;
    const won = a.mood === 'green' || pr.state === 'MERGED';
    if (pr.ci.fail.length && !won) {
      if (d?.phase !== 'fight') {
        const r = a.realm;
        a.duel = { ...(a.mounted ? sc.ride.duel(a) : fightNew(a, Math.min(r.x0 + r.w - 6, Math.max(r.x0 + 6, a.homeX + 20)), GROUND_Y + 3)), phase: 'fight', at: now };
      } else d.finish = false;
      orcs.duelists.set(a.key, a);
    } else if (d?.phase === 'fight') {
      // A rider lands the blow on its next pass.
      if (a.mounted && !scReduced.matches) d.finish = true;
      else orcBlow(a, d, now);
    }
  }
  const red = snap.main?.status === 'red';
  if (red && !orcs.war) orcMuster();
  if (!red) for (const o of orcs.swarm) { o.flee = true; o.prey = null; o.quarry = null; o.rider = null; }
  orcs.war = red;
}
// The last blow of a duel: the orc falls where it stands while its worker cheers.
function orcBlow(a, d, now) {
  Object.assign(d, { phase: 'fall', at: now, wp: ['lunge', 0], op: ['stagger', 1], lift: 0 });
  a.lift = 0;
  a.cheerUntil = now + ORC_FALL_MS;
  if (!scReduced.matches) spray(Math.round(d.x), Math.round(d.y) - 7, [PX.white, PX.red, PX.emberL], 5, { up: 0.8, spread: 1.6, life: 4 });
}

// SWARM_REALM orcs come down from the hills of each realm and SWARM_ROAD run in along the road from the edges. The first
// of each realm hunts a worker; every other one carries a torch.
function orcMuster() {
  for (const o of orcs.swarm) o.flee = false;
  const have = (host) => orcs.swarm.filter((o) => o.host === host).length;
  const spawn = (r, i) => {
    orcs.n += 1;
    const o = { id: orcs.n, host: r?.m.host ?? null, hunter: Boolean(r) && i === 0, torch: i % 2 === 1, face: 1, pause: 0, target: null, frame: -1 };
    if (r) Object.assign(o, { x: r.x0 + 6 + Math.random() * (r.w - 12), y: GROUND_Y + 2 });
    else Object.assign(o, { x: i % 2 ? sc.W + 8 : -8, y: orcRoadY() });
    orcs.swarm.push(o);
  };
  for (const r of sc.realms) for (let i = have(r.m.host); i < SWARM_REALM; i += 1) spawn(r, i);
  for (let i = have(null); i < SWARM_ROAD; i += 1) spawn(null, i);
}

// Somewhere for a running orc to go: its realm's ground clear of the stations with their workers and names, the workers
// where they are and the other orcs' places, or the road when a few tries find none (2026-11-27: an orc stopped on a
// dwarf at his anvil).
function orcSpot(o) {
  const r = sc.realms.find((x) => x.m.host === o.host);
  if (!r) return { x: 6 + Math.random() * (sc.W - 12), y: orcRoadY() };
  const taken = [...sc.stations.filter((s) => s.realm === r && !s.sentry).map((s) => [s.x - 10, s.y - 30, s.x + 10, s.y + 3]),
    ...[...sc.actors.values()].filter((a) => a.realm === r).map((a) => [a.x - 8, a.y - 22, a.x + 8, a.y + 2]),
    ...orcs.swarm.filter((x) => x !== o).map((x) => x.target ?? x).map((p) => [p.x - 8, p.y - 22, p.x + 8, p.y + 2])];
  for (let k = 0; k < 12; k += 1) {
    const p = { x: r.x0 + 6 + Math.random() * (r.w - 12), y: GROUND_Y + 8 + Math.random() * (ROAD_Y - GROUND_Y - 10) };
    if (!taken.some((b) => boxHits(b, [p.x - 4, p.y - 20, p.x + 4, p.y]))) return p;
  }
  return { x: r.x0 + 6 + Math.random() * (r.w - 12), y: orcRoadY() };
}
// Moves an orc toward p at speed v (a worker walks at 0.7); with reduced motion it is simply there. False once arrived.
function orcRun(o, v, p) {
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const d = Math.hypot(dx, dy);
  if (scReduced.matches || d <= v) { o.x = p.x; o.y = p.y; o.moving = false; return false; }
  o.x += (dx / d) * v;
  o.y += (dy / d) * v;
  if (Math.abs(dx) > 0.5) o.face = dx < 0 ? -1 : 1;
  o.moving = true;
  return true;
}
// A hunter's worker: one at a station in its realm, not ended, not already in a duel and not hunted by another orc.
function orcQuarry(o) {
  const free = (a) => a && sc.actors.get(a.key) === a && a.station && !a.station.sentry && a.station.host === o.host && a.mood !== 'gone'
    && a.duel?.phase !== 'fight' && !orcs.swarm.some((h) => h !== o && h.quarry === a);
  if (!free(o.quarry)) o.quarry = [...sc.actors.values()].find(free) ?? null;
  return o.quarry;
}
// The swarm orc rider a fights while main is red (scene-ride.js): the one it has, or else the nearest free one on the
// road with room for the charges, once that is clear of the other riders and their fights (so a rider never rides past
// a nearer orc to the far end of the road). It lets go when main is green again and the orc flees.
function orcJoust(a, R) {
  const j = R.joust;
  if (j && (!orcs.war || j.o.flee || j.o.rider !== a || !orcs.swarm.includes(j.o))) orcUnjoust(a, R);
  if (!orcs.war || a.mood === 'gone') return null;
  if (R.joust) return R.joust.o;
  const [lo, hi] = rideSpan();
  const o = orcs.swarm.filter((s) => s.host === null && !s.flee && !s.rider && s.x >= lo + RIDE_ROOM && s.x <= hi - RIDE_ROOM)
    .sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
  if (!o || !rideClear(a, o.x, RIDE_APART)) return null;
  o.rider = a;
  R.joust = { o, ...rideFight(a, o, Infinity) };
  return o;
}
// Lets a rider's swarm orc go back to running.
const orcUnjoust = (a, R) => { if (R.joust?.o.rider === a) R.joust.o.rider = null; R.joust = null; };
// Where an orc comes from to fight a rider at p (a bug, or a failing check's duel), x being the rider's column: along
// the road from the end of the world beyond p when that is close, or else up onto the road from beyond its near verge,
// below the scene just past p. Either way it comes from p's side of the rider, so it never runs through the horse.
function orcEntry(p, x) {
  const side = p.x < x ? -1 : 1;
  if ((side > 0 ? sc.W - p.x : p.x) < 80) return { x: side > 0 ? sc.W + 6 : -6, y: p.y, face: -side };
  return { x: p.x + side * 14, y: SCENE_H + 4, face: -side };
}

// A hunter takes on its quarry as a duel's orc does (scene-duel.js); a new quarry starts a new fight. A road orc a
// rider has taken on stands where scene-ride.js puts it.
function orcStep(o) {
  if (o.flee) {
    orcRun(o, 1.8, { x: o.x < sc.W / 2 ? -14 : sc.W + 14, y: o.y });
    o.lift = 0;
    return;
  }
  if (o.rider) {
    if (sc.actors.get(o.rider.key) === o.rider) { o.moving = false; return; }
    o.rider = null;
  }
  const q = o.hunter ? orcQuarry(o) : null;
  if (q) {
    if (o.fighting !== q) Object.assign(o, fightNew(q, o.x, o.y), { fighting: q });
    fightStep(o, q);
    o.prey = q;
    q.foe = o;
    return;
  }
  o.prey = null;
  o.fighting = null;
  o.lift = 0;
  if (o.pause > 0) { o.pause -= 1; o.moving = false; return; }
  o.target ??= orcSpot(o);
  if (!orcRun(o, 1.3, o.target)) { o.target = null; o.pause = 4 + Math.floor(Math.random() * 14); }
}

// An orc facing right (face 1) or left (-1), mirrored about its own column so its pixels stay whole.
function orcDraw(x, y, face, pose, frame, seed, alpha = 1, torch = false) {
  scG.save();
  scG.globalAlpha = alpha;
  if (face < 0) { scG.translate(2 * x + 1, 0); scG.scale(-1, 1); }
  const hand = drawFigure(scG, 'orc', seed, x, y, pose, frame);
  if (torch) drawTorch(scG, hand, sc.tick);
  scG.restore();
}
// A beaten orc on its back, feet where it stood and head away from the worker it faced: the figure turned a quarter turn
// with an exact integer transform, so its pixels stay crisp.
function orcFallen(x, y, seed, alpha, face) {
  scG.save();
  scG.globalAlpha = Math.max(0, alpha);
  scG.transform(0, 1, face < 0 ? -1 : 1, 0, x, y - 4);
  drawFigure(scG, 'orc', seed, 0, 0, 'stand', 0);
  scG.restore();
}
// An orc in a fight, in the pose scene-duel.js gave it, raised off the ground while it hops.
const orcFighting = (f, seed) => orcDraw(Math.round(f.x), Math.round(f.y) - (f.lift || 0), f.face, f.op?.[0] ?? 'block', f.op?.[1] ?? 2, seed);
function orcDuel(a, d, e) {
  const x = Math.round(d.x);
  const y = Math.round(d.y);
  if (d.phase === 'fight' || (d.phase === 'fall' && e < ORC_BLOW_MS)) orcFighting(d, a.key);
  else if (d.phase === 'fade') orcDraw(x, y, d.face, 'stand', 0, a.key, 1 - e / ORC_FADE_MS);
  else if (e < ORC_BLOW_MS + 350) orcDraw(x - d.face, y, d.face, 'stand', 0, a.key);
  else orcFallen(x, y, a.key, Math.min(1, 1 - (e - 900) / (ORC_FALL_MS - 900)), d.face);
}
function orcSwarmDraw(o) {
  if (o.prey || o.rider) return orcFighting(o, `orc${o.id}`);
  const roar = !o.moving && !o.torch && o.id % 3 === 0 && sc.tick % 10 < 4;
  orcDraw(Math.round(o.x), Math.round(o.y), o.face, o.moving ? 'walk' : roar ? 'cheer' : 'stand', o.moving ? hdWalkFrame(sc.tick + o.id, 1) : 0, `orc${o.id}`, 1, o.torch);
}

// Each frame: moves the fights and the swarm, adds the orcs to scene.js's depth-sorted items, sets each fighting worker's
// foe, fades the red sky in or out and sends smoke up from the fires.
function orcItems(items) {
  const now = performance.now();
  const still = scReduced.matches;
  for (const a of sc.actors.values()) a.foe = null;
  // Every fight on the board, so scene-duel.js can keep each clear of the others.
  sc.fights = [...[...sc.actors.values()].filter((a) => a.duel?.phase === 'fight').map((a) => ({ f: a.duel, a })),
    ...orcs.swarm.filter((o) => o.prey).map((o) => ({ f: o, a: o.prey }))];
  sc.war = still ? Number(orcs.war) : Math.min(1, Math.max(0, (sc.war || 0) + (orcs.war ? 0.04 : -0.04)));
  for (const a of sc.actors.values()) {
    const d = a.duel;
    if (!d) continue;
    const e = now - d.at;
    if ((d.phase === 'fall' && e > ORC_FALL_MS) || (d.phase === 'fade' && e > ORC_FADE_MS)) { a.duel = null; orcs.duelists.delete(a.key); continue; }
    if (d.phase === 'fight') (a.mounted ? sc.ride.charge : fightStep)(d, a);
    if (d.phase === 'fight' || (d.phase === 'fall' && e < ORC_BLOW_MS)) a.foe = d;
    items.push({ z: d.y + 0.1, draw: () => orcDuel(a, d, e) });
  }
  orcBugs(items, now);
  for (const o of orcs.swarm) {
    orcStep(o);
    items.push({ z: o.y + 0.1, draw: () => orcSwarmDraw(o) });
  }
  orcs.swarm = orcs.swarm.filter((o) => !(o.flee && (o.x < -12 || o.x > sc.W + 12)));
  orcs.loose = orcs.loose.filter((o) => now - o.at < ORC_FADE_MS);
  for (const o of orcs.loose) items.push({ z: o.y, draw: () => orcDraw(o.x, o.y, o.face, 'stand', 0, o.seed, 1 - (now - o.at) / ORC_FADE_MS) });
  if (still || sc.war < 0.3 || sc.tick % 3) return;
  for (const r of sc.realms) {
    for (const f of warFires(r)) if (Math.random() < 0.6) spray(f.x, f.y - 6, ['#4a4650', '#5d5862', '#38353d'], 1, { up: 0.4, spread: 0.5, life: 14, fall: -0.02, size: 2 });
  }
}

// Every rider's bug (scene-ride.js) as a depth-sorted item, drawn as a duel's orc is, until it has fallen and faded. The
// rider's next bug is due 10 to 30 seconds after.
function orcBugs(items, now) {
  for (const a of sc.actors.values()) {
    const R = a.ride;
    const b = R?.bug;
    if (!b) continue;
    const e = now - b.at;
    if ((b.phase === 'fall' && e > ORC_FALL_MS) || (b.phase === 'fade' && e > ORC_FADE_MS)) {
      R.bug = null;
      R.next = now + span(R.rng, 10000, 30000);
      continue;
    }
    items.push({ z: b.y + 0.1, draw: () => orcDuel({ key: b.seed }, b, e) });
  }
}

sc.orcs = { sync: orcSync, items: orcItems };
