// scene2-haul.js: linked rounds on the map from above (scene2.js), as the side view links its places (scene-work.js,
// scene-farm.js, scene-hoard.js, scene-elves.js; 2026-11-09: "bring everything to parity"). A busy worker that
// picks a spot (scene2-life.js) may find the spot's job is one leg of a longer round: a dwarf mines ore at the adit,
// carries it on his shoulder to the forge and tips it in (the fire flares); digs a gem and carries it to the chest; a
// hobbit picks a basket in the garden and tips it into the cart; an elf carries the scroll it wrote to the rack. Each
// people's rounds are scene2-haul-jobs.js's (M2H_CHAINS, by the job of the spot picked); the stocks they fill and
// drain are scene2-stock.js's. A round is a list of legs, each a place (a spot of the realm, or home) and what is done
// there: a v1 pose held a while (sprites-work.js, sprites-chores.js: tip, bend, dig, crank, pour, grind, quench, shoot),
// or one of scene2-jobs.js's jobs, a load picked up or put down, and a change to the realm's stock at its moment.
// A worker walking with a load shows v1's carry pose with it; walking away (up) it shows its back with the load on its
// shoulder (m2hLoad). A place is held by the worker on its way there and at work there, and a worker finding a place
// held waits beside its way until it is free. A worker that stops being busy, is pulled into a fight or meets a new
// layout drops its load and its round and goes home first, as in the side view.

// The places a realm gives only as a leg's end (a chest, the mortar, the rack), never picked on their own, are marked
// link (scene2-life.js's m2mPickSpot leaves them out).
const m2hSpot = (r, job) => r?.spots.find((s) => s.job === job) ?? null;
const m2hSpots = (r, job) => r?.spots.filter((s) => s.job === job) ?? [];

// Leg helpers. A pose held with frames alternating every k ticks (alt), or its first frame for k ticks then the second
// (then), facing f, holding tool.
const m2hAlt = (pose, k, tool, f) => (a, t) => ({ pose, frame: Math.floor(t / k) % 2, face: f, tool });
const m2hThen = (pose, k, tool, f) => (a, t) => ({ pose, frame: t < k ? 0 : 1, face: f, tool });
// The side of a place a worker faces to use it: a spot facing up (the thing north of it) is worked side on, toward the
// thing's middle when the spot gives it (s.mid), else by the worker's seed, since v1's own poses are drawn front on.
const m2hSide = (a, s) => (s.face === 'left' || s.face === 'right' ? s.face : s.mid != null ? (s.mid < s.x ? 'left' : 'right') : a.seed % 2 ? 'left' : 'right');

// Starts a round for worker a at the spot it picked, if the spot's job has one in its people's rounds.
function m2hStart(a, S, spot) {
  const make = typeof M2H_CHAINS === 'object' ? M2H_CHAINS[a.kind]?.[spot.job] : null;
  const legs = make?.(a, a.realm, m2sOf(a.realm), spot);
  if (!legs?.length) return false;
  S.chain = { legs, i: 0, t: 0, there: false, tries: 0, wait: 0, last: m2.tick };
  return true;
}

// Drops a round: its load, the places it holds but its first spot (scene2-life.js frees that), and the round itself.
function m2hDrop(a, S) {
  for (const leg of S.chain?.legs ?? []) if (leg.to !== 'home' && leg.to !== S.spot && leg.to.by === a.key) leg.to.by = null;
  S.chain = null;
  a.carry = null;
  return false;
}

// Every tick of a worker in a round (walking too): a tick missed since the last (a fight, reduced motion) drops it.
function m2hTick(a, S) {
  if (m2.tick - S.chain.last > 2) m2hDrop(a, S);
  else S.chain.last = m2.tick;
}
// One tick of a worker's round when it is not walking. True while the round goes on; false once it has ended (or was
// dropped), after which scene2-life.js frees its spot and walks it home.
function m2hRun(a, S) {
  const C = S.chain;
  const leg = C.legs[C.i];
  if (!leg) { S.chain = null; return false; }
  if (leg.to !== 'home' && !a.realm.spots.includes(leg.to)) return m2hDrop(a, S);
  const home = leg.to === 'home';
  const to = home ? { x: a.homeX, y: a.homeY } : leg.to;
  if (!C.there) {
    // A place another holds: stand and wait for it (with the load), a while at most.
    if (!home && m2hHeld(leg.to, a)) {
      if ((C.wait += 1) > 160) return m2hDrop(a, S);
      m2hHold(a);
      return true;
    }
    if (!home) leg.to.by = a.key;
    C.wait = 0;
    if (Math.hypot(a.x - to.x, a.y - to.y) > 0.6) {
      if ((C.tries += 1) < 4 && m2mGo(a, to)) { m2hWalk(a); return true; }
      // Not reachable all the way: worked from where it got to, if that is near, else given up.
      if (Math.hypot(a.x - to.x, a.y - to.y) > 4) return m2hDrop(a, S);
    }
    Object.assign(C, { there: true, t: 0, tries: 0 });
  }
  if (leg.job) m2mDoJob(a, leg.job, C.t, leg.face ?? to.face ?? 'up', false);
  else {
    const p = leg.act ? leg.act(a, C.t) : { pose: 'stand', frame: 0 };
    a.hop = 0;
    a.posed = { pose: p.pose, frame: p.frame ?? 0, face: p.face ?? leg.face ?? 'down' };
    a.tool = p.tool ?? null;
  }
  a.face = a.posed.face;
  if (home) a.atDesk = ['elf', 'man'].includes(a.station?.kind) && a.posed.pose !== 'tip';
  leg.fx?.(a, C.t);
  if (C.t === (leg.fire ?? Math.max(0, leg.n - 1))) {
    leg.fn?.(a);
    if ('carry' in leg) a.carry = leg.carry;
  }
  C.t += 1;
  if (C.t >= leg.n && !(leg.wait?.(a) && C.t < (leg.max ?? 200))) {
    if (!home && leg.to !== S.spot && leg.to.by === a.key && C.legs[C.i + 1]?.to !== leg.to) leg.to.by = null;
    Object.assign(C, { i: C.i + 1, there: false, t: 0 });
    if (!C.legs[C.i]) { S.chain = null; return false; }
  }
  return true;
}

// Whether another worker holds place s: one still on the map that is at its job there or on a round through it (a
// hold left behind by a worker that has gone, or moved on, is stale and given up).
function m2hHeld(s, a) {
  if (!s.by || s.by === a.key) return false;
  const b = m2.actors.get(s.by);
  if (b && b.mood !== 'gone' && (b.lf?.spot === s || b.lf?.chain?.legs.some((l) => l.to === s))) return true;
  s.by = null;
  return false;
}
// A worker standing with its load (waiting for a place, or giving way).
function m2hHold(a) {
  a.moving = false;
  a.posed = a.carry && a.face !== 'up' ? { pose: 'carry', frame: 0, face: a.face === 'down' ? 'down' : a.face } : { pose: 'stand', frame: 0, face: a.face ?? 'down' };
  a.tool = a.carry ?? null;
}
// A worker walking with its load: v1's carry pose in step, unless it walks away from you (then its back, and m2hLoad
// draws the load on its shoulder).
function m2hWalk(a) {
  if (!a.carry || !a.moving || a.face === 'up') return;
  a.posed = { pose: 'carry', frame: hdWalkFrame(m2.tick + a.seed, 2), face: a.face };
  a.tool = a.carry;
}

// A load drawn on its own, at v1's four pixels a unit, cached by name: v1's drawLoad at the middle of a 16-unit square.
const m2hLoads = new Map();
function m2hLoadArt(load) {
  if (!m2hLoads.has(load)) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.setTransform(4, 0, 0, 4, 0, 0);
    if (typeof drawLoad === 'function') drawLoad(g, load, 8, 8);
    m2hLoads.set(load, c);
  }
  return m2hLoads.get(load);
}
// Where a load sits on a worker seen from behind, in map units from its feet: on its right shoulder, by v1's body.
function m2hShoulder(a) {
  const p = PEOPLE[a.kind] ?? PEOPLE.man;
  return { x: (p.w / 2 + 1) * M2V_K * 0.6, y: -(p.h - 4) * M2V_K };
}
// The load of a worker walking away from you, on its shoulder, at v1's size times the bodies' (M2V_K).
function m2hLoad(g, a) {
  const art = m2hLoadArt(a.carry);
  const s = m2hShoulder(a);
  const k = typeof M2V_K === 'number' ? M2V_K : 1.3;
  g.imageSmoothingEnabled = false;
  g.drawImage(art, Math.round((a.x + s.x - 8 * k) * 4) / 4, Math.round((a.y + s.y - 8 * k) * 4) / 4, 16 * k, 16 * k);
}
const m2hLoadShown = (a) => a.carry && a.moving && a.face === 'up' && !a.posed && !a.fight;

m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  if (reduced) return;
  for (const a of m2.actors.values()) {
    if (!m2hLoadShown(a)) continue;
    const s = m2hShoulder(a);
    add(a.y + 0.05, () => m2hLoad(m2G, a), [a.x + s.x - 4, a.y + s.y - 4, a.x + s.x + 4, a.y + s.y + 4]);
  }
}, 'haul'));
// At night the workers are stamped again over the shade (scene2-glow.js), and so are their loads.
m2.layers.light.push(m2mSafe((g, tick, reduced) => {
  const dark = typeof m2GlowDark === 'function' ? m2GlowDark() : 0;
  if (reduced || dark < 0.05) return;
  g.globalAlpha = dark * 0.5;
  for (const a of m2.actors.values()) if (m2hLoadShown(a)) m2hLoad(g, a);
  g.globalAlpha = 1;
}, 'haul-night'));
