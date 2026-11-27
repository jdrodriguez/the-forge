// scene-elves.js: Rivendell's healing house and lantern round in the Middle-earth view (scene.js), and the elves' herb
// jobs. Two jobs join the elves' own in scene-work.js (through scene-jobs.js's workAdd): pick herbs from the bed and grind
// them at the mortar, or tend the bed. A Rivendell worker that wins a duel (scene-orcs.js's fall phase) walks to the
// healing house once it has finished cheering and sits on the bench, with soft green sparkles about it; a free elf (an
// idle one first) comes out to the door and tends it with its hands held out, and if no elf is free the sparkles come
// anyway; then it goes home. At dusk (sky.hour from 18.5, which is sunset; scenery-sun.js) one elf leaves what it is doing and
// walks the round of the lanterns lighting each in turn, and at dawn (6.5, sunrise) it puts them out; with no elf in the realm
// they light and go out on their own, and with reduced motion they are simply lit at night. These rounds are chores,
// which this file runs itself (choreStep) ahead of a worker's own round and whatever its mood, so a sleeping elf gets
// up for them; scPose shows a chore's pose. Workers in the other realms are left as they were. Loaded after scene-jobs.js.

workAdd('elf', (a, P, st, rng) => {
  const H = P.heal;
  if (!H) return [];
  return [
    { w: 2, spot: 'herbs', steps: [
      { go: H.herbs, claim: true },
      { pose: 'bend', tool: 'herbs', n: span(rng, 30, 50), anim: alt(4), face: H.herbs.face, fn: (b) => { b.carry = 'herbs'; } },
      ...workWay(a.realm, H.herbs, H.spot),
      { go: H.spot, claim: true },
      { pose: 'grind', n: span(rng, 40, 64), anim: alt(3), face: H.spot.face, at: 0, grind: true, fn: (b) => { b.carry = null; } },
    ] },
    { w: 1, spot: 'herbs', steps: [{ go: H.herbs, claim: true }, { pose: 'bend', n: span(rng, 40, 60), anim: alt(5), face: H.herbs.face }] },
  ];
});

// One frame of a worker's chore, much as scene-work.js runs a round: walk to each place in turn, then hold each pose for
// its n ticks (and on while its wait says so, up to max). A fight or a cheer comes first; a finished chore leaves the
// worker to plan its next round from home.
function choreStep(a) {
  if (a.mood === 'gone') a.chore = null;
  const c = a.chore;
  a.chorePose = null;
  if (!c || a.foe || a.cheerUntil > performance.now()) return false;
  const s = c.steps[c.i];
  if (!s) { Object.assign(a, { chore: null, job: null, moving: false }); return false; }
  if (s.go) {
    c.path ??= workPath(a, s.go);
    a.moving = scMove(a, c.path[0], 0.8);
    if (!a.moving) c.path.shift();
    if (!c.path.length) { c.path = null; c.i += 1; }
    return true;
  }
  a.moving = false;
  if (s.face) a.face = s.face;
  a.chorePose = [s.pose, s.anim ? s.anim(c.t) : 0, s.tool];
  if (c.t === (s.at ?? (s.n ?? 1) - 1)) s.fn?.(a);
  c.t += 1;
  if (c.t >= (s.n ?? 1) && !(s.wait?.() && c.t < (s.max ?? 200))) { c.i += 1; c.t = 0; }
  return true;
}
JOB_HOOKS.step.push(choreStep);
{
  const basePose = scPose;
  scPose = (a) => (a.chorePose && !a.moving && !a.foe ? a.chorePose : basePose(a));
}
const seated = (a) => Boolean(a.chore?.steps[a.chore.i]?.sitting && !a.moving);
const elvesOf = (r) => [...sc.actors.values()].filter((b) => b.realm?.m.host === r.m.host && b.station && !b.mounted && b.mood !== 'gone');
const busyFirst = (p, q) => Number(!['work', 'checking'].includes(p.mood)) - Number(!['work', 'checking'].includes(q.mood));

// A worker of realm r that has just won its duel goes to the healing house, and a free elf comes to tend it.
function healVisits(r, H) {
  for (const a of elvesOf(r)) {
    if (a.duel?.phase !== 'fall' || a.healed === a.duel.at) continue;
    a.healed = a.duel.at;
    if (!H || a.chore) continue;
    const healer = elvesOf(r).filter((b) => b !== a && !b.chore && !b.foe && b.mood !== 'blocked').sort(busyFirst).reverse()[0] ?? null;
    a.chore = { i: 0, t: 0, steps: [...workWay(r, a, H.bench), { go: H.bench },
      { pose: 'sit', n: 50, face: H.bench.face, sitting: true, wait: () => Boolean(healer?.chore), max: 240 }] };
    if (!healer) continue;
    workDrop(healer);
    healer.chore = { i: 0, t: 0, steps: [...workWay(r, healer, H.healer), { go: H.healer },
      { pose: 'stand', n: 1, face: H.healer.face, wait: () => !seated(a), max: 200 },
      { pose: 'heal', n: 45, anim: alt(4), face: H.healer.face }] };
  }
}

// The lanterns are lit from dusk to dawn.
const lampsWanted = (hour) => hour >= 18.5 || hour < 6.5;
// Sends one elf round the lanterns that are not as the hour wants them, nearest first, or with no elf in the realm
// changes them one by one by themselves.
function lampRound(r, P, st) {
  const lamps = P.lamps;
  if (!lamps.length) return;
  const hour = sc.sky.hour;
  st.lamps ??= lamps.map(() => hour >= 19.5 || hour < 6.5);
  if (scReduced.matches) { st.lamps = lamps.map(() => sc.sky.night); return; }
  const want = lampsWanted(hour);
  if (lamps.every((p) => Boolean(st.lamps[p.i]) === want)) return;
  const elves = elvesOf(r);
  if (elves.some((b) => b.chore?.lamps)) return;
  const elf = elves.filter((b) => !b.chore && !b.foe && b.duel?.phase !== 'fight').sort(busyFirst)[0];
  if (!elf) {
    if (!elves.length && sc.tick % 12 === 0) st.lamps[lamps.find((p) => Boolean(st.lamps[p.i]) !== want).i] = want;
    return;
  }
  const left = lamps.filter((p) => Boolean(st.lamps[p.i]) !== want);
  const order = [];
  for (let from = elf; left.length; from = order[order.length - 1].spot) {
    left.sort((p, q) => Math.hypot(p.spot.x - from.x, p.spot.y - from.y) - Math.hypot(q.spot.x - from.x, q.spot.y - from.y));
    order.push(left.shift());
  }
  workDrop(elf);
  elf.chore = { i: 0, t: 0, lamps: true, steps: order.flatMap((p, k) => [...workWay(r, k ? order[k - 1].spot : elf, p.spot), { go: p.spot },
    { pose: 'light', n: 10, anim: then(5), face: p.spot.face, at: 5, fn: () => {
      st.lamps[p.i] = want;
      spray(p.x + 1, p.y + 1, want ? [PX.emberL, '#fff3c4'] : ['#cfcfd6', '#ecebf0'], 3, { up: 0.5, spread: 0.8, life: 5, fall: want ? 0.1 : -0.02 });
    } }]) };
}

// Each frame in Rivendell: healing visits, the lantern round, whether the mortar is in use, and sparkles about a
// worker on the healing bench.
JOB_HOOKS.items.push(() => {
  for (const r of sc.realms) {
    if (r.kind !== 'elf') continue;
    const P = realmProps(r);
    const st = workRealm(r);
    st.grinding = Boolean(workDoing(r, (s) => s.grind));
    lampRound(r, P, st);
    if (scReduced.matches) continue;
    healVisits(r, P.heal);
    for (const a of elvesOf(r)) {
      if (!seated(a) || sc.tick % 3) continue;
      particles.push({ x: a.x - 4 + Math.random() * 9, y: a.y - 12 + Math.random() * 10, vx: 0, vy: -0.15, life: 16, color: ['#c8f7d4', '#7fe0a0', '#eafff0'][sc.tick % 3], fall: 0, sway: 0.2 });
    }
  }
});

// Green sparkles drifting from a healer's palms, green dust off the pestle, and bits of weed from a tended bed.
JOB_HOOKS.fx.push((a, pose, frame, hand, changed) => {
  if (pose === 'heal' && sc.tick % 2 === 0) particles.push({ x: hand.x, y: hand.y - 1 + Math.random() * 3, vx: 0.25 * (a.face < 0 ? -1 : 1), vy: -0.08, life: 12, color: ['#c8f7d4', '#7fe0a0'][sc.tick % 2], fall: 0, sway: 0.15 });
  if (pose === 'grind' && changed && frame === 1) spray(hand.x, hand.y - 1, ['#7fc27a', '#a8d89a'], 2, { up: 0.5, spread: 0.8, life: 4 });
  if (pose === 'bend' && a.kind === 'elf' && changed && frame === 1) spray(hand.x, hand.y, ['#7fc27a', '#4f9a5a'], 1, { up: 0.7, spread: 0.6, life: 4 });
});

// After the night shade: the lanterns and the healing house's window.
JOB_HOOKS.lights.push((g) => {
  for (const r of sc.realms) if (r.kind === 'elf') drawElfLights(g, r, realmProps(r), workRealm(r));
});

// Rivendell's desks in the side view (scene.js's scLayout): as many to a row as the realm's final width holds (its Sentry
// post stands on the road, not the grass), centred in it, so three desks sit two and one instead of one to a row in a
// staircase (pass 2, 2026-11-27). Returns the desks to a row and the first one's x.
function scElfRow(p, x0, w) {
  const room = w - p.pad - 10 - SC_COL;
  const span = (cols) => Math.max(...Array.from({ length: p.n }, (_, j) => (j % cols) * SC_COL + (Math.floor(j / cols) % 2 ? SC_COL / 2 : 0)));
  let cols = Math.max(p.cols, Math.min(p.n, Math.floor((w - p.pad - 10) / SC_COL)));
  cols = Math.ceil(p.n / Math.ceil(p.n / cols));
  while (cols > p.cols && span(cols) > room) cols -= 1;
  return { cols, left: x0 + p.pad + Math.round((w - p.pad - span(cols)) / 2) };
}
