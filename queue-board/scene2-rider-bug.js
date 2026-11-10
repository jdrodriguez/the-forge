// scene2-rider-bug.js: the Sentry riders' bugs on the map from above (scene2.js), as v1's scene-ride.js has them
// (2026-11-09: bring the map to parity with the side view). While a rider is busy on patrol in his own land,
// every 10 to 30 seconds (from a generator seeded by his key) a "bug" orc comes out of the wild onto open ground near
// him, from beyond its place so it never runs through the horse, and he fights it in mounted charges
// (scene2-rider-fight.js). It falls on the last of two to four passes, and he rides on, rears with his sword up and
// goes back to his patrol. One bug at a time, and it isn't tied to any data. A bug still coming or fighting when he has
// something else to do (his mood changes, a duel, main red) fades where it stands. This file makes the bugs and draws
// them: coming, fighting, falling on its back and fading, or fading where it stood.

// Every bug fight on the map, so one whose rider has left the board still fades.
const m2mBugs = new Set();
// A whole number from lo to hi from rider a's generator (scene2-rider-fight.js's m2mBugRand).
const m2mBugSpan = (a, R, lo, hi) => lo + Math.floor(m2mBugRand(a, R) * (hi - lo + 1));

// Where a bug comes to fight rider a: about 34 units ahead of him (or behind, or slanting off), at the nearest place
// there with room, clear of the others; else the nearest such place in his land 12 to 48 units off.
function m2mMeet(a, R) {
  const ahead = a.face === 'left' ? -1 : a.face === 'right' ? 1 : m2mBugRand(a, R) < 0.5 ? -1 : 1;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0.6, 0.8], [-0.6, 0.8], [0.6, -0.8], [-0.6, -0.8]]) {
    const p = m2mFightNear(a, a.x + ahead * dx * 34, a.y + dy * 22, 12);
    if (p && Math.hypot(p.x - a.x, p.y - a.y) > 10) return p;
  }
  // None there: the nearest place in his land 12 to 48 units off him (a narrow land has room in a few places only).
  return m2mFightNear(a, a.x, a.y, 48, 12);
}

// A busy rider on patrol: whether his next bug has come, and if so the bug, made at a place near him. A place with no
// room puts it off three seconds.
function m2mBugDue(a, R) {
  R.bugAt ??= m2.tick + m2mBugSpan(a, R, 100, 300);
  if (R.bug || m2.tick < R.bugAt || !R.mounted) return false;
  const p = m2mMeet(a, R);
  if (!p) { R.bugAt = m2.tick + 30; return false; }
  // It comes out of the wild from beyond its place, on its own side of him: 30 units out, or nearer where that is shut.
  const d0 = Math.hypot(p.x - a.x, p.y - a.y) || 1;
  const [ex, ey] = [(p.x - a.x) / d0, (p.y - a.y) / d0];
  const P = m2.paths.cells();
  const out = [30, 22, 14].map((d) => ({ x: p.x + ex * d, y: p.y + ey * d })).find((e) => P.open[m2mCellOf(P, e.x, e.y)]) ?? { x: p.x + ex * 8, y: p.y + ey * 8 };
  const seed = pxHash(`${a.key}/bug${(R.bugs = (R.bugs ?? 0) + 1)}`) % 997;
  const o = { kind: m2eKindOf(seed), x: out.x, y: out.y, face: ex > 0 ? 'left' : 'right', seed, pose: ['walk', 0] };
  R.bug = Object.assign(m2mFightNew(a, R, o, p, m2mBugSpan(a, R, 2, 4)), { a, phase: 'fight', t0: m2.tick });
  m2mBugs.add(R.bug);
  return true;
}
// A bug still coming or fighting fades away when its rider has something else to do.
function m2mBugDrop(R) {
  if (R.bug?.phase === 'fight') Object.assign(R.bug, { phase: 'fade', t0: m2.tick });
  R.bugAt = null;
}

// Each frame: every bug in the depth sort (coming, fighting, falling on its back and fading, or fading where it stood),
// with the sparks of its fight; and the sparks of each rider's joust, over the swarm orc. A bug that has fallen and
// faded makes way for the rider's next, due 10 to 30 seconds on.
m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  const box = (o) => { const K = M2E_ORC[o.kind]; return [o.x - K.W / 2, o.y - K.FY, o.x + K.W / 2, o.y + 1]; };
  const sparks = (g, f) => { if (f.spark && !reduced) m2eSparks(g, f.spark.x, f.spark.y, tick - f.spark.at, f.spark.c); };
  for (const f of m2mBugs) {
    const { a, o } = f;
    const R = a.rr;
    const t = tick - f.t0;
    if (f.phase === 'fight' && (m2.actors.get(a.key) !== a || reduced)) Object.assign(f, { phase: 'fade', t0: tick });
    if ((f.phase === 'fall' && t > M2E_FALL) || (f.phase === 'fade' && t > 20)) {
      m2mBugs.delete(f);
      if (R?.bug === f) { R.bug = null; R.bugAt = tick + m2mBugSpan(a, R, 100, 300); }
      continue;
    }
    if (f.phase === 'fight') add(o.y + 0.1, (g = m2G) => { m2eOrcDraw(g, o, o.pose[0], o.pose[1]); sparks(g, f); }, box(o));
    else if (f.phase === 'fall') {
      const fade = t < 34 ? 1 : 1 - (t - 34) / (M2E_FALL - 34);
      add(o.y + 0.1, (g = m2G) => {
        if (t < 4) m2eOrcDraw(g, o, 'stagger', 1);
        else if (t < 9) m2eOrcDraw(g, o, 'fall', 0);
        else m2eOrcDraw(g, o, 'stand', 0, fade, 1);
        sparks(g, f);
      }, box(o));
    } else add(o.y + 0.1, (g = m2G) => m2eOrcDraw(g, o, 'stand', 0, 1 - t / 20), box(o));
  }
  for (const a of m2.actors.values()) {
    const j = a.rr?.joust;
    if (j?.spark) add(j.o.y + 0.2, (g = m2G) => sparks(g, j));
  }
}, 'bugs'));
