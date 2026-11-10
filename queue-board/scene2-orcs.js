// scene2-orcs.js: the orcs of the map from above (scene2.js), as the side view has them (scene-orcs.js). A worker whose
// PR has a failing CI check (board.mjs leaves the review's checks out) fights an orc: the orc runs in from the back of
// the realm and they fight beside the worker's station (scene2-duel.js). Once no check is failing (a fix pushed, a
// re-run started, the PR green or merged) the worker strikes a last blow, the orc falls on its back and fades, and the
// worker cheers; a re-run that fails again brings a new orc. If the worker ends or leaves the board, the orc just fades. A Sentry rider's orc stands near its post and the rider's own
// moves (the motion area's charges) find it through m2.orcs.foe(a). While main is red (snap.main.status 'red') a swarm
// pours out of the Black Gate and the goblin caves under the Misty Mountains: four orcs run to every realm and six along
// the roads, every other one with a torch, and the first in each realm hunts a worker there and fights it as a duel's orc
// does, but never a Sentry rider. Each rider on watch has a road orc sent to his land, and he rides out at the nearest
// free one there and fights it in charges (m2.orcs.joust, scene2-rider-fight.js): it stands and fights back, staggering
// but never falling. When main is green again they flee off the map's nearest edge and the hunted and the riders go
// back to work. Goblins come from
// the caves and the Shire's and Rivendell's side of the map, Uruk-hai from Mordor. m2.orcs.foe(a) gives the orc fighting
// actor a ({ x, y, face, state }, face 'left' 'right' 'up' or 'down', state 'come', 'fight', 'fall' or 'fade') or null.

const m2e = { duels: new Map(), swarm: [], war: false, n: 0 };
const m2eKindOf = (seed) => (seed % 3 === 0 ? 'uruk' : 'goblin');

// After every snapshot: start, end or keep each duel by its worker's checks, and muster or rout the swarm by main.
function m2eOrcSync(snap2) {
  for (const [key, f] of m2e.duels) {
    const a = m2.actors.get(key);
    if (a === f.a) continue;
    if (f.phase !== 'fall') Object.assign(f, { phase: 'fade', t0: m2.tick });
    f.gone = true;
  }
  for (const a of m2.actors.values()) {
    const pr = a.t.pr;
    let f = m2e.duels.get(a.key);
    if (f?.hunter) continue;
    if (a.mood === 'gone') { if (f && f.phase !== 'fall' && f.phase !== 'fade') { Object.assign(f, { phase: 'fade', t0: m2.tick }); m2eLetGo(f); } continue; }
    const won = a.mood === 'green' || pr?.state === 'MERGED';
    if (pr?.ci?.fail?.length && !won) {
      if (!f || f.phase === 'fall' || f.phase === 'fade') { f = m2eDuel(a, null); m2e.duels.set(a.key, f); }
    } else if (f && (f.phase === 'come' || f.phase === 'fight')) m2eBlow(f);
  }
  const red = snap2.main?.status === 'red';
  if (red && !m2e.war) m2eMuster();
  if (!red && m2e.war) m2eRout();
  m2e.war = red;
  if (red) m2eToLands();
}
// A new fight for worker a, its orc coming from the back of the realm (or the swarm orc o that hunts it).
function m2eDuel(a, o) {
  const seed = pxHash(`${a.key}${m2e.n += 1}`) % 997;
  const f = { a, seed, phase: 'come', t0: m2.tick, hunter: Boolean(o) };
  m2ePlace(f, a);
  f.o = o ?? { kind: m2eKindOf(seed), x: f.ox + f.side * 18, y: Math.max(4, f.oy - 34), face: 'down', seed };
  Object.assign(f.o, { state: 'come' });
  if (!a.station?.sentry) a.fight = f;
  return f;
}
// The worker lets go of its fight (its tool back to its own, its pose its mood's).
function m2eLetGo(f) {
  if (f.a.fight === f) { f.a.fight = null; f.a.tool = undefined; f.a.posed = null; f.a.hop = 0; }
}
// The last blow: the orc falls where it stands while its worker cheers.
function m2eBlow(f) {
  Object.assign(f, { phase: 'fall', t0: m2.tick });
  f.o.state = 'fall';
}

// The swarm: four orcs to each realm and six along the roads, from the nearest of Mordor's gate and the goblin caves.
function m2eMuster() {
  const P = m2.plan.places;
  const gates = [P.blackGate ?? P.baradDur, P.caves ?? P.gollumCave].filter(Boolean);
  const from = (x, y) => gates.slice().sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
  const spawn = (r, i, x, y) => {
    const g = from(x, y);
    m2e.n += 1;
    const mordor = g === gates[0] && gates.length > 1;
    m2e.swarm.push({ id: m2e.n, realm: r, hunter: Boolean(r) && i === 0, torch: i % 2 === 1, kind: mordor && m2e.n % 2 ? 'uruk' : 'goblin',
      x: g.x + (m2e.n % 5) * 3 - 6, y: g.y + 4 + (m2e.n % 3) * 2, face: 'down', seed: m2e.n * 37, wait: i * 6 + (m2e.n % 4) * 3, state: 'run' });
  };
  m2e.swarm.forEach((o) => { o.flee = false; });
  for (const r of m2.realms) for (let i = m2e.swarm.filter((o) => o.realm === r).length; i < 4; i += 1) spawn(r, i, r.x + r.w / 2, r.y + r.h / 2);
  const roads = m2.plan.roads;
  for (let i = m2e.swarm.filter((o) => !o.realm).length; i < 6; i += 1) {
    const road = roads[i % roads.length];
    const [x, y] = road.pts[Math.floor(road.pts.length / 2)];
    spawn(null, i, x, y);
  }
}
// As many road orcs to each land as it has riders on watch (not ended), the nearest free ones, so every rider has a
// swarm orc to ride out at in his own land.
function m2eToLands() {
  const want = new Map();
  for (const a of m2.actors.values()) if (a.station?.sentry && a.mood !== 'gone') want.set(a.station.land, (want.get(a.station.land) ?? 0) + 1);
  for (const [land, n] of want) {
    const c = m2.plan.patrols?.[land]?.[0];
    if (!c) continue;
    for (let k = m2e.swarm.filter((o) => o.land === land && !o.flee).length; k < n; k += 1) {
      const o = m2e.swarm.filter((s) => !s.realm && !s.land && !s.flee && !s.rider).sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y))[0];
      if (!o) break;
      Object.assign(o, { land, route: null });
    }
  }
}
// The swarm orc rider a fights while main is red: the one he has, or else the nearest free road orc within 90 units of
// his post (one sent to his own land first, and never one another land's free rider waits for) with room round it for
// the charges, clear of the other riders and their fights. He lets go when main is green and it flees, or when he ends.
function m2eJoust(a, R) {
  const j = R.joust;
  if (j && (!m2e.war || a.mood === 'gone' || j.o.flee || j.o.rider !== a || !m2e.swarm.includes(j.o))) m2eUnjoust(a, R);
  if (!m2e.war || a.mood === 'gone' || typeof m2mFightSpot !== 'function') return null;
  if (R.joust) return R.joust;
  // The search for a free one with room is the costly part: twice a second is often enough.
  if ((m2.tick + a.seed) % 5) return null;
  const land = a.station.land;
  // An orc sent to another land is left to that land's riders while one of them is still free.
  const waiting = (l) => [...m2.actors.values()].some((b) => b.station?.sentry && b.station.land === l && b.mood !== 'gone' && !b.rr?.joust);
  const cost = (o) => Math.hypot(o.x - a.x, o.y - a.y) + (o.land === land ? 0 : 60);
  const near = m2e.swarm.filter((o) => !o.realm && !o.flee && !o.rider && !o.duel && o.wait <= 0 && Math.hypot(o.x - a.homeX, o.y - a.homeY) < 90
    && (!o.land || o.land === land || !waiting(o.land))).sort((p, q) => cost(p) - cost(q));
  for (const o of near.slice(0, 3)) {
    const p = m2mFightSpot(a, o);
    if (!p) continue;
    Object.assign(o, { rider: a, route: null, pose: ['walk', 0] });
    R.joust = m2mFightNew(a, R, o, p, Infinity);
    return R.joust;
  }
  return null;
}
// Lets a rider's swarm orc go back to running.
function m2eUnjoust(a, R) {
  if (R.joust?.o.rider === a) R.joust.o.rider = null;
  R.joust = null;
}

// Main is green: every swarm orc runs for the nearest edge, and the hunted go free.
function m2eRout() {
  for (const o of m2e.swarm) {
    o.flee = true;
    o.route = null;
    o.rider = null;
    o.land = null;
    const f = o.duel;
    if (f) { m2eLetGo(f); m2e.duels.delete(f.a.key); o.duel = null; }
    const W = m2.W;
    const H = m2.H;
    const d = [[o.x, -12], [W - o.x, W + 12], [o.y, null], [H - o.y, null]];
    const k = d.indexOf(d.slice().sort((p, q) => p[0] - q[0])[0]);
    o.goal = k === 0 ? { x: -14, y: o.y } : k === 1 ? { x: W + 14, y: o.y } : k === 2 ? { x: o.x, y: -14 } : { x: o.x, y: H + 30 };
  }
}

// Steps an orc toward p at speed v, facing the way it runs; false once there.
function m2eRun(o, p, v) {
  const [dx, dy] = [p.x - o.x, p.y - o.y];
  const d = Math.hypot(dx, dy);
  o.moving = d > 0.5;
  if (!o.moving) { o.x = p.x; o.y = p.y; return false; }
  o.x += (dx / d) * Math.min(v, d);
  o.y += (dy / d) * Math.min(v, d);
  o.face = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
  return true;
}
// Somewhere for a swarm orc to run next: across its realm, or along its road.
function m2eSpot(o) {
  const h = pxHash(`${o.id}|${m2.tick}`);
  const r = o.realm;
  if (r) return { x: r.x + 8 + (h % 1000) / 1000 * (r.w - 16), y: r.y + 10 + ((h >>> 10) % 1000) / 1000 * (r.h - 16) };
  // One sent to a rider's land runs about its patrol loop.
  const loop = o.land && m2.plan.patrols?.[o.land];
  if (loop?.length) { const p = loop[h % loop.length]; return { x: p.x + ((h >>> 8) % 13) - 6, y: p.y + ((h >>> 12) % 7) - 3 }; }
  const road = m2.plan.roads[o.id % m2.plan.roads.length];
  const k = (h >>> 3) % (road.pts.length - 1);
  const t = ((h >>> 12) % 100) / 100;
  const [[ax, ay], [bx, by]] = [road.pts[k], road.pts[k + 1]];
  return { x: Math.max(4, Math.min(m2.W - 4, ax + (bx - ax) * t)), y: Math.max(8, Math.min(m2.H - 2, ay + (by - ay) * t)) };
}
// A hunter's worker: one at a station in its realm, still on the board, not already fighting.
function m2eQuarry(o) {
  return [...m2.actors.values()].find((a) => a.realm === o.realm && a.station && !a.station.sentry && a.mood !== 'gone' && !a.fight) ?? null;
}
// One tick of a swarm orc: waiting at its gate, running its realm or road, hunting, or fleeing.
function m2eSwarmStep(o, reduced) {
  if (o.flee) { if (reduced) { o.x = o.goal.x; o.y = o.goal.y; } else m2eRun(o, o.goal, 1.1); return; }
  if (o.duel) return;
  // One a rider fights stands where his fight puts it (scene2-rider-fight.js).
  if (o.rider) { if (m2.actors.get(o.rider.key) === o.rider && o.rider.rr?.joust?.o === o) return; o.rider = null; }
  if (o.wait > 0) { o.wait -= 1; o.moving = false; return; }
  if (o.hunter && o.realm && o.x > o.realm.x && o.x < o.realm.x + o.realm.w && o.y > o.realm.y && o.y < o.realm.y + o.realm.h) {
    const a = m2eQuarry(o);
    if (a) { o.duel = m2eDuel(a, o); m2e.duels.set(a.key, o.duel); return; }
  }
  if (reduced) { const p = m2eSpot(o); o.x = p.x; o.y = p.y; return; }
  if (!o.route?.length) {
    const p = m2eSpot(o);
    o.route = m2.paths?.route ? m2.paths.route(o, { x: o.x, y: o.y }, p) ?? [p] : [p];
    // A way that is already there (its start and goal in one cell) comes back empty: then straight to the spot.
    if (!o.route.length) o.route = [p];
  }
  if (!m2eRun(o, o.route[0], 0.75)) { o.route.shift(); if (!o.route.length) o.wait = 6 + (pxHash(`${o.id}${m2.tick}`) % 20); }
}

m2.syncs.push((s) => m2eOrcSync(s));
m2.orcs = {
  joust: m2eJoust,
  unjoust: m2eUnjoust,
  foe(a) {
    const f = m2e.duels.get(a?.key);
    if (!f || f.gone || f.phase === 'fade') return null;
    const o = f.o;
    return { x: o.x, y: o.y, face: o.face, state: f.phase };
  },
};
