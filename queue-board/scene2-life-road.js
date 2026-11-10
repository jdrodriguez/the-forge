// scene2-life-road.js: the wanderers outside the queue on the map from above (scene2.js), registered as
// m2.step.road. While busy each goes about its own business at its land's roam spots (plan.roam, scene2-core-places.js),
// walking from one to the next round whatever stands in the way (m2.paths) and doing the spot's job there
// (scene2-jobs.js): Beorn chops wood and tends his hives in the Anduin's vale, Radagast feeds his birds and gathers
// herbs round Rhosgobel, Treebeard strides slowly through Fangorn and stops to hum, Tom Bombadil skips and dances along
// the Withywindle, and Gandalf (and any other wizard) walks the roads blowing smoke rings and stops to look about or
// smoke. Idle, a wanderer sits or sleeps where it stopped, breathing (Gandalf with his pipe now and then); blocked it
// raises a hand; green it cheers; gone it stands faded. With reduced motion it stands where it is.

// How each wanderer walks: its pace in units a tick, how many ticks each step of the four-step walk lasts, and how high
// it bounces (Bombadil skips).
const M2M_GAIT = { ent: [0.22, 4, 0], bombadil: [0.5, 2, 1.6], beorn: [0.42, 2, 0], wizard: [0.4, 2, 0] };
const m2mLandOf = (a) => (m2RoamOf(a.name)?.[0] ?? 'roads');

// Walks a wanderer along its route at its own pace and step, bouncing if it skips, smoking as it goes if it is a
// wizard on the roads. True while it is still walking.
function m2mStride(a, t) {
  const [v, k, bounce] = M2M_GAIT[a.kind] ?? M2M_GAIT.wizard;
  while (a.route?.length) {
    if (m2Walk(a, a.route[0], v)) {
      m2mSpace(a);
      const step = Math.floor(t / k) % 4;
      a.posed = { pose: 'walk', frame: [0, 0.5, 1, 1.5][step], face: a.face };
      if (bounce) a.hop = Math.abs(Math.sin((t / (2 * k)) * Math.PI)) * bounce;
      if (a.kind === 'wizard' && m2mLandOf(a) === 'roads' && t % 70 === 0) { const [px, py] = m2mPipeAt(a); m2mRing(px, py - 1.5); }
      return true;
    }
    a.route.shift();
  }
  return false;
}
// The next roam spot for a wanderer: any of its land's other spots, by its generator.
function m2mNextRoam(a, S) {
  const spots = m2.plan?.roam?.[m2mLandOf(a)] ?? [];
  if (!spots.length) return null;
  // Another of its spots, by its generator, where no one else stands or is headed, if there is one.
  for (let k = 0; k < 6; k += 1) {
    const s = spots[Math.floor(m2Rand(a) * spots.length)];
    if ((spots.length === 1 || s !== S.spot) && !m2mCrowded(a, s.x, s.y)) return s;
  }
  return null;
}

// Whether a place is behind or against something standing (a house, a tree), where the thing would cover a figure
// standing there: inside its box below its top few units.
const m2mInside = (x, y) => (m2.standing ?? []).some((o) => o.w > 6 && x > o.x + 1 && x < o.x + o.w - 1 && y > o.y + 4 && y < o.z + 2);

function m2mRoad(a, reduced) {
  const S = (a.rd ??= { spot: null, job: null, t: 0, n: 0, idle: null });
  a.tool = null;
  if (reduced) { a.route = null; a.face = 'down'; return; }
  const t = m2.tick + a.seed * 7;
  if (!m2Busy(a)) {
    S.job = null;
    // At rest it first steps clear of anyone it stopped beside.
    if (a.route?.length) { a.moving = m2mStride(a, t); if (a.moving) return; }
    const near = [...m2.actors.values()].find((b) => b !== a && b.mood !== 'gone' && Math.abs(b.x - a.x) < M2M_GAP && Math.abs(b.y - a.y) < M2M_GAP * 1.8);
    // Or out from in front of a house it stopped against.
    const stuck = near || m2mInside(a.x, a.y);
    if (stuck && (S.shoves = (S.shoves ?? 0) + 1) < 6) {
      // Away from them first, else round the compass, to open ground no one else stands near.
      const P = m2.paths?.cells?.();
      const away = near ? Math.atan2(a.y - near.y, a.x - near.x) : Math.PI / 2;
      for (let k = 0; k < 8; k += 1) {
        const ang = away + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 4);
        const to = { x: a.x + Math.cos(ang) * (M2M_GAP + 4), y: a.y + Math.sin(ang) * (M2M_GAP + 4) * 1.8 };
        if (P && !P.open[m2mCellOf(P, to.x, to.y)]) continue;
        if (m2mCrowded(a, to.x, to.y) || m2mInside(to.x, to.y)) continue;
        a.route = m2.paths?.route(a, { x: a.x, y: a.y }, to) ?? null;
        if (a.route) { a.moving = m2mStride(a, t); return; }
      }
    }
    if (!stuck) S.shoves = 0;
    a.route = null;
    return m2mRest(a, S, t);
  }
  S.idle = null;
  // Someone who stopped on its way since it set off: a new way round them.
  if (a.route?.length && (m2.tick + a.seed) % 12 === 0 && m2mBlocked(a)) {
    a.route = m2.paths.route(a, { x: a.x, y: a.y }, a.route.at(-1), [...m2.actors.values()].filter((b) => b !== a && !b.moving && !b.rr?.mounted)) ?? a.route;
  }
  if (a.route?.length && m2mGiveWay(a)) { a.posed = { pose: 'stand', frame: 0, face: a.face }; return; }
  if (a.route?.length) { a.moving = m2mStride(a, t); if (a.moving) return; }
  if (!S.job) {
    const spot = m2mNextRoam(a, S);
    if (!spot) { a.posed = { pose: 'stand', frame: 0, face: m2mLook('down', t) }; return; }
    S.spot = spot;
    S.job = M2M_JOBS[spot.job] ?? M2M_JOBS.look;
    S.n = m2mSpan(a, S.job.n[0], S.job.n[1]) * (a.kind === 'ent' ? 2 : 1);
    S.t = 0;
    S.tries = 0;
    a.route = m2.paths?.route ? m2.paths.route(a, { x: a.x, y: a.y }, spot, [...m2.actors.values()].filter((b) => b !== a && !b.moving && !b.rr?.mounted)) : [spot];
    // A spot no way reaches is skipped for another next tick.
    if (!a.route) { S.job = null; S.spot = spot; a.posed = { pose: 'stand', frame: 0, face: m2mLook('down', t) }; return; }
    a.moving = m2mStride(a, t);
    return;
  }
  if (Math.hypot(a.x - S.spot.x, a.y - S.spot.y) > 0.6 && (S.tries = (S.tries ?? 0) + 1) < 4) {
    a.route = m2.paths.route(a, { x: a.x, y: a.y }, S.spot);
    if (!a.route) S.job = null;
    a.moving = m2mStride(a, t);
    return;
  }
  // Someone got there first: on to another spot.
  if (S.t === 0 && m2mCrowded(a, a.x, a.y)) { S.job = null; return; }
  S.t += 1;
  m2mDoJob(a, S.job, S.t, S.spot.face ?? 'down', false);
  // Treebeard sways as he hums, a slow lean one way and the other.
  if (a.kind === 'ent' && S.t % 40 < 20) a.hop = 0.25;
  if (S.t >= S.n) { S.job = null; a.posed = null; a.tool = null; }
}

// A wanderer at rest where it stopped: blocked, green and gone as every worker; idle, it sleeps (its Zzz rising) and
// now and then sits up a while, Gandalf with his pipe.
function m2mRest(a, S, t) {
  a.face = 'down';
  if (a.mood === 'green') {
    const k = t % 46;
    if (k < 12) { a.posed = { pose: 'cheer', frame: 0, face: 'down' }; a.hop = Math.sin((k / 12) * Math.PI) * 1.5; }
    else a.posed = { pose: 'stand', frame: 0, face: m2mLook('down', k) };
    return;
  }
  if (a.mood === 'blocked' || a.mood === 'gone' || a.mood === 'stalled') return;
  if (!S.idle || m2.tick >= S.idle.until) {
    const next = S.idle?.act === 'sleep' ? (a.kind === 'wizard' && m2Rand(a) < 0.6 ? 'smoke' : 'sit') : 'sleep';
    S.idle = { act: next, from: m2.tick, until: m2.tick + (next === 'sleep' ? m2mSpan(a, 250, 600) : m2mSpan(a, 120, 260)) };
  }
  const u = m2.tick - S.idle.from;
  if (S.idle.act === 'sleep') {
    a.posed = { pose: 'sleep', frame: m2mBreath(a, u), face: 'down' };
    if (a.mood === 'idle' && (u + a.seed) % 26 === 0) m2mZ(a.x + 3, a.y - m2BodyOf(a.kind).head + 2);
  } else if (S.idle.act === 'smoke') { a.posed = { pose: 'smoke', frame: u % 40 < 16 ? 1 : 0, face: 'down' }; m2mPipe(a, u); }
  else a.posed = { pose: 'sit', frame: m2mBreath(a, u), face: 'down' };
}

m2.step.road = m2mSafe(m2mRoad, 'road');
