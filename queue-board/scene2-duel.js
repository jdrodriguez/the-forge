// scene2-duel.js: how a worker and an orc fight on the map from above (scene2.js), for scene2-orcs.js's duels (a PR's
// checks failing) and its swarm's hunters (main red). The worker keeps to its station: it walks home first if it was
// out on its rounds, then turns to face the orc, which stands beside its desk, plot or anvil on the side with more
// room, so the fight never covers another station. They fight in exchanges of about three and a half seconds: the orc
// raises its blade and strikes while the worker parries (sparks fly where the blades meet), then the worker winds up
// and cuts, the orc staggers back a step and comes in again; each fight keeps its own rhythm and now and then the orc
// feints or presses twice. The last blow (scene2-orcs.js) fells the orc, which falls on its back away from the worker,
// lies a while and fades, while the worker cheers with a little jump. With reduced motion a fight is one still frame:
// the worker striking, the orc staggered. m2.step.fight (scene2-move.js calls it for any actor with a.fight set) moves
// the worker; m2eDuelPose gives both fighters' poses for a tick.

const M2E_GAP = 11;
const M2E_CYCLE = 36;
const M2E_FALL = 60;
// The tools a people fights with: a dwarf keeps its hammer, everyone else draws a sword.
const m2eWeapon = (a) => (a.kind === 'dwarf' ? 'hammer' : 'sword');

// The side of its station where an orc can stand to fight worker a: the side with no other station near, its seed's
// side when both are clear.
function m2eSide(a, x, y) {
  const near = (s) => m2.stations.some((t) => t.actor !== a && !t.sentry && Math.abs(t.hx - (x + s * M2E_GAP)) < 12 && Math.abs(t.hy - y) < 10);
  const pref = a.seed % 2 ? 1 : -1;
  if (!near(pref)) return pref;
  return near(-pref) ? pref : -pref;
}

// The poses of a duel f at tick t of its fight: the worker's [pose, frame] and the orc's, and how far the orc is pushed
// back (units) and whether blades meet (clash) or a blow lands (hit) on this tick.
function m2eDuelPose(f, t) {
  const c = (t + f.seed * 7) % M2E_CYCLE;
  const press = Math.floor((t + f.seed * 7) / M2E_CYCLE) % 3 === 2;
  const W = (k) => ['work', k];
  if (c < 6) return { w: W(0), o: ['attack', 0], back: 0 };
  if (c < 8) return { w: W(0), o: ['attack', 0.5], back: -0.5 };
  if (c < 12) return { w: W(0.5), o: ['attack', 1], back: -1, clash: c === 8 };
  if (c < 18) {
    // A press: the orc swings again instead of giving the worker its turn.
    if (press) return { w: W(c < 15 ? 0 : 0.5), o: ['attack', c < 14 ? 0 : c < 15 ? 0.5 : 1], back: c < 15 ? 0 : -1, clash: c === 15 };
    return { w: W(0), o: ['stand', 0], back: 0 };
  }
  if (c < 20) return { w: W(0.5), o: ['stand', 0], back: 0 };
  if (c < 24) return { w: W(1), o: ['stagger', 0], back: 1 + (c - 20) * 0.3, hit: c === 20 };
  if (c < 29) return { w: W(1), o: ['stagger', 1], back: 2 };
  return { w: W(0), o: ['walk', [0, 0.5, 1, 1.5][Math.floor(c / 2) % 4]], back: 2 - (c - 29) * 0.3 };
}

// Where worker a fights: at its station's home spot, or where it stands if it has none. Sets f.wx, f.wy and the orc's
// place beside it.
function m2ePlace(f, a) {
  f.wx = a.station ? a.homeX : a.x;
  f.wy = a.station ? a.homeY : a.y;
  f.side ??= a.station ? m2eSide(a, f.wx, f.wy) : a.seed % 2 ? 1 : -1;
  f.ox = f.wx + f.side * M2E_GAP;
  f.oy = f.wy + 0.25;
}

// One tick of a fighting worker (scene2-move.js's m2Step hands it over while a.fight is set).
function m2eFightStep(a, reduced) {
  const f = a.fight;
  m2ePlace(f, a);
  a.tool = m2eWeapon(a);
  if (typeof m2Free === 'function') m2Free(a);
  const face = f.side > 0 ? 'right' : 'left';
  if (reduced) {
    Object.assign(a, { x: f.wx, y: f.wy, route: null });
    a.posed = f.phase === 'fall' ? { pose: 'cheer', frame: 0, face: 'down' } : { pose: 'work', frame: 1, face };
    return;
  }
  // Home first, by the way round its station, then the fight.
  if (Math.hypot(a.x - f.wx, a.y - f.wy) > 0.6) {
    if (!a.route?.length) a.route = a.station ? m2Way(a, { x: f.wx, y: f.wy }, { x: f.wx, y: a.station.y + 3 }) : [{ x: f.wx, y: f.wy }];
    a.moving = m2Route(a);
    if (a.moving) return;
  }
  a.route = null;
  Object.assign(a, { x: f.wx, y: f.wy });
  const t = m2.tick - f.t0;
  if (f.phase === 'fall') {
    // The last blow, then a cheer with two little jumps.
    if (t < 4) { a.posed = { pose: 'work', frame: 1, face }; return; }
    a.posed = { pose: 'cheer', frame: 0, face: 'down' };
    const j = (t - 4) % 14;
    a.hop = t < 32 && j < 6 ? [0.5, 1.25, 1.5, 1.25, 0.5, 0][j] : 0;
    return;
  }
  if (f.phase !== 'fight') { a.posed = { pose: 'work', frame: 0, face }; return; }
  a.posed = { pose: f.wp?.[0] ?? 'work', frame: f.wp?.[1] ?? 0, face };
}
m2.step.fight = m2eFightStep;

// A burst of sparks at (x, y): a few bright pixels flung out, gone in a few ticks.
function m2eSparks(g, x, y, age, cols) {
  if (age > 5) return;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 0.6 + age * 0.7;
    g.fillStyle = cols[(i + age) % cols.length];
    g.fillRect(Math.round((x + Math.cos(a) * r) * 4) / 4, Math.round((y + Math.sin(a) * r * 0.8 - age * 0.15) * 4) / 4, 0.25, 0.25);
  }
  if (age < 2) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(x * 4) / 4 - 0.25, Math.round(y * 4) / 4, 0.75, 0.25); g.fillRect(Math.round(x * 4) / 4, Math.round(y * 4) / 4 - 0.25, 0.25, 0.75); }
}
