// scene-jobs.js: how the newer rounds join scene-work.js's in the Middle-earth view (scene.js) without changing it: the
// Shire's well and pigs (scene-farm.js), Erebor's storehouse and armor stand (scene-hoard.js) and Rivendell's healing,
// lanterns and wildlife (scene-elves.js). workAdd puts a people's extra jobs beside its own, with the same seeded choice
// and the same one-worker-per-spot rule. An added job also holds every place it goes (its go steps marked claim), not
// only its spot, since several go to two places (the well and then the trough): no other worker's round may pass through
// one while it holds it, and an added job waits for a place another round is using. The other files hook into each
// frame through JOB_HOOKS: step (takes over moving a worker; true if it did), items (depth-sorted items and per-frame
// state), fx (particles at a worker's hand) and lights (what glows after the night shade, which scene.js calls after
// drawLights). Loaded after scene-work.js.
const JOB_HOOKS = { step: [], items: [], fx: [], lights: [] };
const placeKey = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;
const sameRealm = (a, b) => a !== b && a.realm && b.realm?.m.host === a.realm.m.host;

// The places a worker's round still has ahead of it, with the one it is at: the targets of its go steps from the last
// one it set off for. Home and the waypoints on the way (via) don't count.
function workRoute(b) {
  const j = b.job;
  if (!j) return [];
  let i = j.i;
  while (i > 0 && !j.steps[i]?.go) i -= 1;
  return j.steps.slice(i).filter((s) => s.go && s.go !== 'home' && !s.via).map((s) => placeKey(s.go));
}
const workClaims = (b) => Boolean(b.job?.steps.some((s) => s.claim));

// Whether worker a may take job j now. An added job needs every place it goes clear of every other round in the realm;
// one of scene-work.js's own needs its places clear of the rounds that hold theirs, so the two never meet at a place.
function workFree(a, j) {
  const mine = j.steps.filter((s) => s.go && s.go !== 'home' && !s.via).map((s) => placeKey(s.go));
  if (!mine.length) return true;
  const added = j.steps.some((s) => s.claim);
  return ![...sc.actors.values()].some((b) => sameRealm(a, b) && (added || workClaims(b)) && workRoute(b).some((k) => mine.includes(k)));
}
// Adds more(a, P, st, rng)'s jobs to a people's own, then keeps only the ones workFree allows.
function workAdd(kind, more) {
  const base = WORK[kind];
  WORK[kind] = (a, P, st, rng) => [...base(a, P, st, rng), ...more(a, P, st, rng)].filter((j) => workFree(a, j));
}

// The worker in realm r whose current step passes test, and that step.
function workDoing(r, test) {
  for (const b of sc.actors.values()) {
    const s = b.job?.steps[b.job.i];
    if (s && b.realm?.m.host === r.m.host && test(s, b)) return { b, s };
  }
  return null;
}

// A way from one place to another that keeps clear of the front row's desks: straight there, or round a corner, or
// along the bottom of the grass in front of the desks. Returns the waypoints between, as go steps.
function workWay(r, from, to) {
  const desks = sc.stations.filter((s) => s.realm?.m.host === r.m.host && !s.sentry && s.y > PROP_MID).map((s) => [s.x - 9, s.y - 7, s.x + 9, s.y + 2]);
  const clear = (p, q) => {
    const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y));
    for (let i = 1; i < n; i += 1) {
      const x = p.x + ((q.x - p.x) * i) / n;
      const y = p.y + ((q.y - p.y) * i) / n;
      if (desks.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) return false;
    }
    return true;
  };
  const low = ROAD_Y - 1;
  for (const via of [[], [{ x: to.x, y: from.y }], [{ x: from.x, y: to.y }], [{ x: from.x, y: low }, { x: to.x, y: low }]]) {
    const pts = [from, ...via, to];
    if (pts.every((p, i) => !i || clear(pts[i - 1], p))) return via.map((go) => ({ go, via: true }));
  }
  return [];
}

// The hooks, wrapped around scene-work.js's own.
{
  const base = { ...sc.work };
  sc.work.step = (a) => JOB_HOOKS.step.some((h) => h(a)) || base.step(a);
  sc.work.items = (items) => { base.items(items); for (const h of JOB_HOOKS.items) h(items); };
  sc.work.fx = (a, pose, frame, hand) => {
    const changed = pose !== a.fxPose || frame !== a.fxFrame;
    base.fx(a, pose, frame, hand);
    for (const h of JOB_HOOKS.fx) h(a, pose, frame, hand, changed);
  };
  sc.work.lights = (g) => { for (const h of JOB_HOOKS.lights) h(g); };
}
