// scene2-chores.js: Rivendell's chores on the map from above, as the side view's scene-elves.js runs them (2026-11-09:
// parity). A chore takes a worker ahead of its own round and whatever its mood, so a sleeping elf gets up
// for it (scene2-life.js runs m2kStep first):
// - The lamplighter's round. The lamp posts are lit from dusk (the hour 18.5, sunset) to dawn (6.5). When the hour
//   turns, one elf leaves what it is doing and walks to each lamp post that is not as the hour wants it, nearest first,
//   lifts its taper and lights it (or puts it out), and each goes on or off as the elf reaches it; the small lanterns
//   along the paths and steps go with the post nearest them. With no elf in the realm they change one by one by
//   themselves; with reduced motion they are simply lit at night.
// - The healer's visit. A Rivendell worker that wins its orc duel (scene2-orcs.js's fall phase, read here only) walks to
//   the healing house once its fight is over and sits on the bench, green sparkles about it; a free elf (an idle one
//   first) comes to the door and tends it with its hands held out, and if no elf is free the sparkles come anyway; then
//   it goes home.
// A lamp's light is its m2.lights entry (scene2-rivendell-garden.js marks it with lamp, its radius when lit): a lamp put
// out has radius 0, which scene2-fx.js's m2Night skips.

const m2kLampsWanted = (hour) => hour >= 18.5 || hour < 6.5;
const m2kElves = (r) => [...m2.actors.values()].filter((b) => b.realm === r && b.station && !b.station.sentry && !b.road && b.mood !== 'gone');
const m2kBusy = (b) => m2Busy(b);

// Starts a chore for worker a: what it was doing is dropped (its round's load and places too).
function m2kGive(a, steps, extra = {}) {
  if (a.lf) m2mRelease(a.lf, a);
  Object.assign(a, { carry: null, route: null, chore: { i: 0, t: 0, tries: 0, steps, ...extra } });
}
// One tick of a worker's chore, much as a round runs (scene2-haul.js): walk to each place in turn round whatever stands
// in the way, then hold each pose its n ticks (and on while its wait says so, up to max). True while it has the worker.
function m2kStep(a) {
  const c = a.chore;
  if (!c) return false;
  if (a.mood === 'gone') { a.chore = null; return false; }
  if (a.route?.length) {
    if (m2mGiveWay(a)) { a.posed = { pose: 'stand', frame: 0, face: a.face }; return true; }
    a.moving = m2Route(a);
    if (a.moving) { m2mSpace(a); return true; }
  }
  const s = c.steps[c.i];
  if (!s) { a.chore = null; a.posed = null; return false; }
  if (s.go) {
    if (Math.hypot(a.x - s.go.x, a.y - s.go.y) > 0.6 && (c.tries += 1) < 5 && m2mGo(a, s.go)) return true;
    Object.assign(c, { i: c.i + 1, t: 0, tries: 0 });
    return true;
  }
  a.moving = false;
  a.hop = 0;
  a.posed = { pose: s.pose, frame: s.anim ? s.anim(c.t) : 0, face: s.face ?? 'down' };
  a.tool = null;
  a.face = a.posed.face;
  s.fx?.(a, c.t);
  if (c.t === (s.at ?? (s.n ?? 1) - 1)) s.fn?.(a);
  c.t += 1;
  if (c.t >= (s.n ?? 1) && !(s.wait?.() && c.t < (s.max ?? 200))) Object.assign(c, { i: c.i + 1, t: 0 });
  return true;
}
const m2kSeated = (a) => Boolean(a.chore?.steps[a.chore.i]?.sitting && !a.moving && !a.route?.length);

// The realm's lamp posts (their spots) and, for each, the small lanterns that go with it: the nearest post's.
function m2kLamps(r) {
  if (r.lampKey === m2.key) return r.lampList;
  const posts = r.spots.filter((s) => s.lamp);
  const lanterns = m2.lights.filter((l) => l.lantern && l.x >= r.x - 4 && l.x <= r.x + r.w + 4 && l.y >= r.y - 4 && l.y <= r.y + r.h + 4);
  const list = posts.map((s, i) => ({ i, spot: s, lights: [s.lamp.light] }));
  for (const l of lanterns) {
    const near = list.slice().sort((p, q) => Math.hypot(p.spot.x - l.x, p.spot.y - l.y) - Math.hypot(q.spot.x - l.x, q.spot.y - l.y))[0];
    near?.lights.push(l);
  }
  Object.assign(r, { lampKey: m2.key, lampList: list });
  return list;
}
// Sends one elf round the lamp posts not as the hour wants them, nearest first; or, with no elf, changes one by itself.
function m2kLampRound(r, st, reduced) {
  const lamps = m2kLamps(r);
  if (!lamps.length || !m2.sky) return;
  const hour = m2.sky.hour;
  if (!st.lamps || st.lamps.length !== lamps.length) st.lamps = lamps.map(() => hour >= 19.5 || hour < 6.5);
  if (reduced) { st.lamps = lamps.map(() => m2kLampsWanted(hour)); return; }
  const want = m2kLampsWanted(hour);
  const left = lamps.filter((p) => st.lamps[p.i] !== want);
  if (!left.length) return;
  const elves = m2kElves(r);
  if (elves.some((b) => b.chore?.lamps)) return;
  const elf = elves.filter((b) => !b.chore && !b.fight).sort((p, q) => Number(!m2kBusy(p)) - Number(!m2kBusy(q)))[0];
  if (!elf) {
    if (!elves.length && m2.tick % 12 === 0) st.lamps[left[0].i] = want;
    return;
  }
  const order = [];
  for (let from = elf; left.length; from = order.at(-1).spot) {
    left.sort((p, q) => Math.hypot(p.spot.x - from.x, p.spot.y - from.y) - Math.hypot(q.spot.x - from.x, q.spot.y - from.y));
    order.push(left.shift());
  }
  m2kGive(elf, order.flatMap((p) => [{ go: p.spot }, {
    pose: 'light', n: 10, anim: (t) => (t < 5 ? 0 : 1), face: p.spot.face, at: 5, fn: () => {
      st.lamps[p.i] = want;
      m2mPuff(p.spot.lamp.x, p.spot.lamp.y, want ? ['#ffe9a0', '#fff3c4'] : ['#cfcfd6', '#ecebf0'], 5, { up: 0.4, spread: 0.8, fall: want ? 0.04 : -0.02, life: 10 });
    } }]), { lamps: true });
}

// A Rivendell worker that has just won its duel goes to the healing house once its fight is over, and a free elf
// comes to tend it.
function m2kHealVisits(r, H) {
  for (const a of m2kElves(r)) {
    const f = typeof m2e === 'object' ? m2e.duels.get(a.key) : null;
    if (f?.a === a && f.phase === 'fall' && a.healed !== f) { a.healed = f; a.healDue = Boolean(H); }
    if (!a.healDue || a.fight || a.chore) continue;
    a.healDue = false;
    const healer = m2kElves(r).filter((b) => b !== a && !b.chore && !b.fight && b.mood !== 'blocked').sort((p, q) => Number(!m2kBusy(q)) - Number(!m2kBusy(p)))[0] ?? null;
    m2kGive(a, [{ go: H.bench }, { pose: 'sit', n: 50, face: 'down', sitting: true, wait: () => Boolean(healer?.chore?.healing === a), max: 240,
      fx: (b, t) => { if (t % 3 === 0) m2mGlint(b.x - 4 + Math.random() * 9, b.y - 14 + Math.random() * 10, ['#c8f7d4', '#7fe0a0', '#eafff0'][t % 3]); } }]);
    if (!healer) continue;
    // The healer stands a step east of the bench, by the door, facing the patient.
    const at = { x: H.bench.x + 9, y: H.bench.y + 1 };
    m2kGive(healer, [{ go: at }, { pose: 'stand', n: 1, face: 'left', wait: () => !m2kSeated(a), max: 200 },
      { pose: 'heal', n: 45, anim: (t) => Math.floor(t / 4) % 2, face: 'left',
        fx: (b, t) => { if (t % 2 === 0) { const h = m2mHand(b, b.face); m2mGlint(h.x, h.y, M2M_GREEN[t % 2]); } } }], { healing: a });
  }
}

// Each frame in Rivendell: the lantern round and the healer's visits, and every lamp lit or put out as its state says.
m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  for (const r of m2.realms) {
    if (r.kind !== 'elf') continue;
    const st = m2sOf(r);
    m2kLampRound(r, st, reduced);
    if (!reduced && r.heal) m2kHealVisits(r, r.heal);
    for (const p of m2kLamps(r)) for (const l of p.lights) l.r = st.lamps?.[p.i] === false ? 0 : l.lamp;
  }
}, 'chores'));
