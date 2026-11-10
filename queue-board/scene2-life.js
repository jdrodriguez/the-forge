// scene2-life.js: the life of a realm's workers on the map from above (scene2.js), registered as m2.step.life, which
// scene2-move.js runs for every realm worker. The moods keep the meaning they have in v1 and the README's table:
// - busy (building, or its checks running while it works): it works its station a while (the swing's three frames,
//   sparks off the anvil, soil off the hoe), then walks round whatever stands in the way (m2.paths) to a free spot in
//   its realm, does that spot's job there (scene2-jobs.js: the well, the pen, the harp, the forge and the rest), and
//   walks home again. One worker to a spot; its choices and timings come from its own seeded generator.
// - idle (and waiting on CI while idle): it sleeps at home, breathing, its Zzz rising; now and then it wakes, stretches,
//   looks about, and sits a while or smokes a pipe (hobbits, dwarves and Men; elves sit and hum) before it nods off.
// - stalled: asleep, its red bubble over it. Blocked: a hand up (the ask pose). Green: it cheers with a little jump
//   now and then and looks about between. Gone: it stands faded.
// Whatever it does, someone never stands frozen. With reduced motion everyone simply stands at its station.

// Starts a walk to p round whatever stands in the way, or out by the open ground in front of the station (m2Way)
// when m2.paths is not there.
function m2mGo(a, p) {
  const out = { x: a.homeX, y: (a.station?.y ?? a.homeY) + 3 };
  // Round anyone standing still on the way (at a desk, at a spot), not through them.
  const still = [...m2.actors.values()].filter((b) => b !== a && !b.moving && !b.rr?.mounted && b.mood !== 'gone');
  a.route = m2.paths?.route ? m2.paths.route(a, { x: a.x, y: a.y }, p, still) : m2Way(a, p, out);
  // No way there: it walks straight only when going home (it must get back to its station somehow).
  if (!a.route) a.route = p.x === a.homeX && p.y === a.homeY ? [p] : null;
  a.moving = m2Route(a);
  if (a.moving) m2mSpace(a);
  return Boolean(a.route);
}
const m2mAtHome = (a) => Math.abs(a.x - a.homeX) < 0.5 && Math.abs(a.y - a.homeY) < 0.5;
const m2mSpan = (a, lo, hi) => lo + Math.floor(m2Rand(a) * (hi - lo + 1));
// Personal space: no two people stop within M2M_GAP units of each other. Where another stops is the spot it holds,
// else where it stands (its home, for a worker going home).
const M2M_GAP = 9;
function m2mCrowded(a, x, y, gap = M2M_GAP) {
  for (const b of m2.actors.values()) {
    if (b === a || b.mood === 'gone') continue;
    const at = b.lf?.spot ?? b.rd?.spot ?? (b.moving && !b.road ? { x: b.homeX, y: b.homeY } : b);
    // Figures are tall, so one a little behind another still hides behind it: closer than gap across, or than
    // nearly twice that front to back, is too close.
    if (Math.abs(at.x - x) < gap && Math.abs(at.y - y) < gap * 1.8) return true;
  }
  return false;
}
// A free spot in the worker's realm that no one holds and no one stands near, held from the moment it is picked.
function m2mPickSpot(a) {
  // A place that is only a linked round's end (a chest, the mortar; scene2-haul.js) is never picked on its own.
  const free = a.realm.spots.filter((s) => !s.link && (!s.by || s.by === a.key) && !m2mCrowded(a, s.x, s.y));
  if (!free.length) return null;
  const s = free[Math.floor(m2Rand(a) * free.length)];
  s.by = a.key;
  return s;
}
// A walker passing someone who stands still steps aside, a little each tick, onto open ground, so nobody walks
// through anybody.
function m2mSpace(a) {
  // One squeezing past (m2mGiveWay) neither gives nor is given room.
  if (a.squeeze > 0) return;
  const P = m2.paths?.cells?.();
  for (const b of m2.actors.values()) {
    if (b === a || b.rr?.mounted || b.mood === 'gone' || b.squeeze > 0) continue;
    // Someone standing is given a wide berth; two walking past each other each give a little.
    const reach = b.moving ? 7.5 : 8;
    const [dx, dy] = [a.x - b.x, (a.y - b.y) * 1.6];
    const d = Math.hypot(dx, dy);
    if (d >= reach || d < 0.01) continue;
    const k = Math.min(b.moving ? 0.35 : 0.45, (reach - d) * 0.15);
    const [nx, ny] = [a.x + (dx / d) * k, a.y + (dy / d) * k * 0.6];
    if (!P || P.open[m2mCellOf(P, nx, ny)]) { a.x = nx; a.y = ny; }
  }
}
// Whether someone stands within body width of a walker's next leg (and not at its end).
function m2mBlocked(a) {
  const p = a.route[0];
  const [dx, dy] = [p.x - a.x, p.y - a.y];
  const len2 = dx * dx + dy * dy || 1;
  for (const b of m2.actors.values()) {
    if (b === a || b.moving || b.rr?.mounted || b.mood === 'gone') continue;
    const t = Math.max(0, Math.min(1, ((b.x - a.x) * dx + (b.y - a.y) * dy) / len2));
    const [qx, qy] = [a.x + dx * t - b.x, a.y + dy * t - b.y];
    if (Math.abs(qx) < Math.max(7, m2BodyOf(b.kind).w / 2 + 3) && Math.abs(qy) < 4 && Math.hypot(a.route.at(-1).x - b.x, a.route.at(-1).y - b.y) > 9) return true;
  }
  return false;
}
// How close two people's feet may come side by side before their bodies overlap: most of their two half widths.
const m2mRoom = (a, b) => (((m2BodyOf(a.kind).shadow ?? 8) + (m2BodyOf(b.kind).shadow ?? 8)) / 2) * 0.8;
// Whether (x, y) is inside anyone's room but skip's, so a step aside never lands on a third person.
const m2mInto = (a, x, y, skip) => [...m2.actors.values()].some((b) => b !== a && b !== skip && b.mood !== 'gone' && !b.rr?.mounted
  && Math.abs(x - b.x) < m2mRoom(a, b) && Math.abs(y - b.y) < 3);
// Two people about to walk into each other (2026-11-08: nobody walks through anybody). One that walks the same
// way behind another, or meets one coming with the right of way (the earlier key), stands where it is while the other
// passes, for up to four seconds; one with the right of way goes on. Someone standing in the way (or waiting) is stepped
// round, by a waypoint just beside them on open ground. True while it waits. A walker that has got nowhere for eight
// seconds (two waiting on each other, or pushing each other back, in a narrow place; 2026-11-09: a lamplighter and a
// worker going home under Orthanc) squeezes past for two, neither giving nor taking room (m2mSpace).
function m2mGiveWay(a) {
  if (a.squeeze > 0) { a.squeeze -= 1; return false; }
  const k = a.stall;
  if (!k || m2.tick - k.last > 2 || Math.hypot(a.x - k.x, a.y - k.y) > 1.5) a.stall = { x: a.x, y: a.y, t: m2.tick, last: m2.tick };
  else if (m2.tick - k.t > 80) { a.stall = null; a.squeeze = 20; return false; }
  else k.last = m2.tick;
  return m2mYield(a);
}
function m2mYield(a) {
  const p = a.route?.[0];
  if (!p) return false;
  const d = Math.hypot(p.x - a.x, p.y - a.y);
  if (d < 0.01) return false;
  const [nx, ny] = [a.x + ((p.x - a.x) / d) * Math.min(2, d), a.y + ((p.y - a.y) / d) * Math.min(2, d)];
  const end = a.route.at(-1);
  for (const b of m2.actors.values()) {
    if (b === a || b.mood === 'gone' || b.rr?.mounted || p.round === b.key) continue;
    const room = m2mRoom(a, b);
    // Only someone the next step closes on, and not someone by the end of its way.
    if (Math.abs(nx - b.x) >= room || Math.abs(ny - b.y) >= 3) continue;
    if (Math.hypot(nx - b.x, (ny - b.y) * 2) >= Math.hypot(a.x - b.x, (a.y - b.y) * 2)) continue;
    if (Math.hypot(end.x - b.x, end.y - b.y) < 6) continue;
    if (b.moving) {
      const q = b.route?.[0];
      const ahead = q && (q.x - b.x) * (b.x - a.x) + (q.y - b.y) * (b.y - a.y) > 0;
      if (!ahead && a.key < b.key) continue;
      if ((a.wait = (a.wait ?? 0) + 1) < 40) return true;
    }
    a.wait = 0;
    return !m2mStepRound(a, b, room);
  }
  a.wait = 0;
  return false;
}
// Puts a waypoint beside b first on a's way: left, right, behind or in front of them, on open ground clear of a body's
// ground and of everyone, the one that adds the least to the way. False if there is none.
function m2mStepRound(a, b, room) {
  const P = m2.paths?.cells?.();
  const p = a.route[0];
  const len = (c) => Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(p.x - c.x, p.y - c.y);
  const free = (c) => !P || (P.open[m2mCellOf(P, c.x, c.y)] && P.wide[m2mCellOf(P, c.x, c.y)]);
  const sides = [[room + 1.5, 0], [-room - 1.5, 0], [0, 4], [0, -4]].map(([dx, dy]) => ({ x: b.x + dx, y: b.y + dy, round: b.key }))
    .filter((c) => free(c) && !m2mInto(a, c.x, c.y, b)).sort((u, v) => len(u) - len(v));
  if (!sides.length) return false;
  a.route.unshift(sides[0]);
  return true;
}
function m2mRelease(S, a) {
  if (S.spot?.by === a.key) S.spot.by = null;
  S.spot = null;
  S.job = null;
  if (S.chain) m2hDrop(a, S);
}

function m2mLife(a, reduced) {
  const S = (a.lf ??= { t: 0, spot: null, job: null, spell: 0, idle: null });
  a.tool = null;
  if (reduced) {
    m2mRelease(S, a);
    Object.assign(a, { x: a.homeX, y: a.homeY, route: null, face: 'down', carry: null, chore: null });
    a.atDesk = m2Busy(a) && ['elf', 'man'].includes(a.station.kind);
    return;
  }
  // A chore (scene2-chores.js: the lamplighter's round, a healer's visit) comes before everything, whatever the mood.
  if (m2kStep(a)) return;
  // A new layout leaves the old spot behind.
  if (S.spot && !a.realm.spots.includes(S.spot)) m2mRelease(S, a);
  // A linked round missed a tick (a fight, reduced motion): dropped, as the side view drops it.
  if (S.chain) m2hTick(a, S);
  // Someone who stopped on its way since it set off: a new way round them.
  if (a.route?.length && (m2.tick + a.seed) % 12 === 0 && m2mBlocked(a)) m2mGo(a, a.route.at(-1));
  if (a.route?.length && m2mGiveWay(a)) { a.posed = { pose: 'stand', frame: 0, face: a.face }; if (a.carry) m2hHold(a); return; }
  if (a.route?.length) { a.moving = m2Route(a); if (a.moving) { m2mSpace(a); m2hWalk(a); return; } }
  const home = m2mAtHome(a);
  if (!m2Busy(a)) {
    if (S.chain) m2hDrop(a, S);
    a.carry = null;
    m2mRelease(S, a);
    if (!home) return m2mGo(a, { x: a.homeX, y: a.homeY });
    return m2mIdle(a, S);
  }
  S.idle = null;
  // A linked round (scene2-haul.js): its legs until it ends, then the spot freed and home.
  if (S.chain) {
    if (m2hRun(a, S)) return;
    a.carry = null;
    m2mRelease(S, a);
    S.spell = m2.tick + m2mSpan(a, 120, 320);
    a.posed = null;
    a.tool = null;
    return home ? undefined : m2mGo(a, { x: a.homeX, y: a.homeY });
  }
  a.carry = null;
  if (S.spot) {
    // A spot the way cannot reach all the way (out on a bank) is worked from as near as the walker got.
    if (Math.hypot(a.x - S.spot.x, a.y - S.spot.y) > 0.6 && (S.tries = (S.tries ?? 0) + 1) < 4) {
      if (m2mGo(a, S.spot)) return;
      // A spot it cannot reach: given up, and back to its station.
      m2mRelease(S, a);
      S.spell = m2.tick + m2mSpan(a, 60, 160);
      return m2mGo(a, { x: a.homeX, y: a.homeY });
    }
    S.t += 1;
    m2mDoJob(a, S.job, S.t, S.spot.face ?? 'up', false);
    if (S.t >= S.n) {
      m2mRelease(S, a);
      S.spell = m2.tick + m2mSpan(a, 120, 320);
      a.posed = null;
      a.tool = null;
      m2mGo(a, { x: a.homeX, y: a.homeY });
    }
    return;
  }
  if (!home) return m2mGo(a, { x: a.homeX, y: a.homeY });
  // At its station: working it until its spell there is up, then off to a free spot.
  if (!S.spell) S.spell = m2.tick + m2mSpan(a, 60, 260);
  if (m2.tick >= S.spell) {
    const spot = m2mPickSpot(a);
    if (spot) {
      S.spot = spot;
      // The spot's job may be one leg of a linked round (scene2-haul.js), which takes the worker from here.
      if (m2hStart(a, S, spot)) return m2hRun(a, S);
      S.job = m2mJobOf(a, spot);
      S.n = m2mSpan(a, S.job.n[0], S.job.n[1]);
      S.t = 0;
      S.tries = 0;
      if (m2mGo(a, spot)) return;
      m2mRelease(S, a);
      S.spell = m2.tick + m2mSpan(a, 60, 160);
    }
    S.spell = m2.tick + m2mSpan(a, 60, 160);
  }
  a.face = 'down';
  a.atDesk = ['elf', 'man'].includes(a.station.kind);
  m2mStationFx(a);
}

// The bits that fly off a station's work, on the frame the swing strikes (m2Pose's own swing, k 4 for elves, else 3):
// sparks off the dwarves' anvil, soil off the hobbits' hoe into their plot, a glint off an elf's or a Man's quill.
function m2mStationFx(a) {
  const k = a.station.kind === 'elf' ? 4 : 3;
  const t = m2.tick + a.seed;
  if (!m2mStrike(t, k)) return;
  const s = a.station;
  if (s.kind === 'dwarf') m2mPuff(s.x + 1, s.y - 8, M2M_SPARK, 5, { up: 0.8, spread: 1.4, fall: 0.07, life: 6, kind: 'spark' });
  else if (s.kind === 'hobbit') m2mPuff(s.x + 2.5, s.y - 4, M2M_SOIL, 3, { up: 0.5, spread: 0.9, fall: 0.09, life: 7, floor: s.y - 2 });
  else if (t % (k * 6) < k * 2) m2mGlint(s.x + 3, s.y - 9, '#e6f2ff');
}

// The idle life at home, by mood.
function m2mIdle(a, S) {
  a.face = 'down';
  const t = m2.tick + a.seed * 5;
  if (a.mood === 'green') {
    // A cheer with a jump every few seconds, looking about between.
    const k = t % 46;
    if (k < 12) { a.posed = { pose: 'cheer', frame: 0, face: 'down' }; a.hop = Math.sin((k / 12) * Math.PI) * 1.5; }
    else a.posed = { pose: 'stand', frame: 0, face: m2mLook('down', k) };
    return;
  }
  if (a.mood === 'blocked' || a.mood === 'gone' || a.mood === 'stalled') return;
  // Idle or waiting: mostly asleep, waking now and then for a while.
  if (!S.idle || m2.tick >= S.idle.until) S.idle = m2mNextIdle(a, S.idle?.act);
  const I = S.idle;
  const u = m2.tick - I.from;
  if (I.act === 'sleep') {
    a.posed = { pose: 'sleep', frame: m2mBreath(a, u), face: 'down' };
    if (a.mood === 'idle' && (u + a.seed) % 26 === 0) m2mZ(a.x + 3, a.y - m2BodyOf(a.kind).head + 2);
  } else if (I.act === 'stretch') {
    a.posed = { pose: u < 10 ? 'cheer' : 'stand', frame: 0, face: 'down' };
    a.hop = u < 10 ? 0.25 : 0;
  } else if (I.act === 'look') a.posed = { pose: 'stand', frame: 0, face: m2mLook('down', u) };
  else if (I.act === 'shift') a.posed = { pose: 'walk', frame: Math.floor(u / 10) % 2 ? 0.5 : 0, face: ['down', 'left', 'down', 'right'][Math.floor(u / 20) % 4] };
  else if (I.act === 'smoke') { a.posed = { pose: 'smoke', frame: u % 40 < 16 ? 1 : 0, face: 'down' }; m2mPipe(a, u); }
  else if (I.act === 'hum') {
    a.posed = { pose: 'sit', frame: m2mBreath(a, u), face: 'down' };
    if (u % 18 === 0) m2mNote(a.x + 2, a.y - m2BodyOf(a.kind).sleepHead - 2, 1);
  } else a.posed = { pose: 'sit', frame: m2mBreath(a, u), face: 'down' };
}
// What an idle worker does next: after sleep it wakes with a stretch, then looks about, shifts its feet, sits, or
// smokes (hums, for an elf), then sleeps again. Times in ticks (ten a second).
function m2mNextIdle(a, last) {
  const r = m2Rand(a);
  let act;
  let n;
  if (!last) [act, n] = r < 0.7 ? ['sleep', m2mSpan(a, 30, 400)] : ['look', 50];
  else if (last === 'sleep') [act, n] = ['stretch', 18];
  else if (last === 'stretch') [act, n] = r < 0.5 ? ['look', 56] : ['shift', 40];
  else if (last === 'look' || last === 'shift') {
    const pipe = a.kind !== 'elf';
    [act, n] = r < 0.45 ? [pipe ? 'smoke' : 'hum', m2mSpan(a, 160, 320)] : r < 0.85 ? ['sit', m2mSpan(a, 140, 300)] : ['sleep', m2mSpan(a, 250, 600)];
  } else [act, n] = ['sleep', m2mSpan(a, 250, 600)];
  return { act, from: m2.tick, until: m2.tick + n };
}

m2.step.life = m2mSafe(m2mLife, 'life');
