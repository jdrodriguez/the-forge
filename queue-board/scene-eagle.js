// scene-eagle.js: the Great Eagles that bring a Claude app session's call in the Middle-earth view (scene.js). A session
// that calls the owner (scene-call.js, who.session) sends a giant eagle of the Misty Mountains in place of a messenger: 25
// units tall perched (an elf is 15), its wings about 64 across in flight. A call a few seconds old at most when the page
// first sees it flies in: the eagle comes down out of the sky the view adds above the scene, flapping, glides past its
// perch, banks round, flares its wings and lands on a crag at the back edge of the road in the realm whose machine the
// session runs on. An older call (after a reload, say) finds it already perched. Once it has landed it stands in the
// call's pool of light, rings of sound go out from its head and its name sits beside it; it turns its head back
// over its shoulder and shakes out its feathers now and then. When the call is dismissed or its five minutes end it
// raises its wings, takes off and flies up and away out of the top of the view, and its crag fades. A realm holds two
// eagles at most, each on a crag of its own clear of the front row's desks and names, the Ranger's post and the props
// on the front ground; any more sessions calling there fold into its oldest eagle, whose name then counts them. The
// crag stands behind every walker on the road, and it and the ground behind the eagle are a box workers walk round
// (sc.path.extra, scene-path.js). A flying eagle draws in the above layer, over the sky the view adds (in the night
// palette after dark); a perched one draws with the depth-sorted figures, so the night shade falls on it as on them.
// With reduced motion there is no flight: the eagle is simply perched, and goes when its call does. The art is
// sprites-eagle.js (perched, the crag) and sprites-eagle-fly.js (head, talons, wings, flight); scene-call.js calls
// sc.eagle's sync, light, tags, at and byKey; the light is scene-call-light.js's callPool and callRings, drawn larger.
const EAGLE_FRESH_MS = 8000;
// Ticks (a tenth of a second each) for the flight in and the flight out, and for the light to come up after landing.
const EAGLE_ARRIVE = 60;
const EAGLE_LEAVE = 40;
const EAGLE_GLOW = 6;
// The crag's base at the back edge of the road (its top, where the eagle's feet are, is EAGLE_STAND above that,
// sprites-eagle.js), the perched eagle's height over its feet, and a flying eagle's shoulders over its feet.
const EAGLE_BASE = ROAD_Y + 2;
const EAGLE_TALL = 25.5;
const EAGLE_LIFT = 13;
// How far either side of its perch an eagle and its crag reach, and how close a perch may come to a front-row desk.
const EAGLE_REACH = 11;
const EAGLE_DESK = 30;
const EAGLE_FLAP = ['up', 'mid', 'down', 'level'];
const eagles = { live: new Map(), gone: [], folded: new Set() };
const eagleQ = (v) => Math.round(v * 4) / 4;

// A free perch in realm r, as its distance from the realm's left edge, or null: one whose crag and eagle stay inside
// the realm, clear of the front row's desks and names, the Ranger's post and the other eagles here, and of those the
// one that hides the least share of the props standing on the front ground (the well, the healing house, a tree; a
// thin post counts for less), leftmost first.
function eaglePlace(r) {
  const mine = [...eagles.live.values()].filter((b) => b.host === r.m.host).map((b) => b.dx);
  if (mine.length >= 2) return null;
  const front = sc.stations.filter((s) => s.realm === r && !s.sentry && s.y > ROAD_Y - 10).map((s) => s.x - r.x0);
  const posts = sc.stations.filter((s) => s.realm === r && s.sentry).map((s) => s.x - r.x0);
  const P = typeof realmProps === 'function' ? realmProps(r) : { list: [], solid: [] };
  const props = [...P.list.filter((p) => p.base > ROAD_Y - 30).map((p) => [p.x - r.x0, p.x - r.x0 + p.w]),
    ...P.solid.filter((b) => b[3] > ROAD_Y - 30).map((b) => [b[0] - r.x0, b[2] - r.x0])];
  const hard = (dx) => dx >= EAGLE_REACH && dx <= r.w - EAGLE_REACH && !front.some((s) => Math.abs(dx - s) < EAGLE_DESK)
    && !posts.some((p) => dx > p - 34 && dx < p + 12) && !mine.some((m) => Math.abs(dx - m) < 2 * EAGLE_REACH + 2);
  const hidden = (dx) => props.reduce((n, [a, b]) => n + (Math.max(0, Math.min(b, dx + 9) - Math.max(a, dx - 9)) / (b - a)) * (b - a < 6 ? 0.3 : 1), 0);
  let best = null;
  for (let dx = EAGLE_REACH; dx <= r.w - EAGLE_REACH; dx += 1) if (hard(dx) && (best === null || hidden(dx) < hidden(best))) best = dx;
  return best;
}
// Where an eagle's perch is now, following its realm if the world was laid out again.
function eaglePerchX(b) {
  const r = sc.realms.find((x) => x.m.host === b.host);
  if (r) b.x = r.x0 + Math.min(b.dx, r.w - EAGLE_REACH);
  return b.x;
}
// A point on a cubic curve through four points at t, with its direction.
function eagleCurve(P, t) {
  const u = 1 - t;
  const at = (k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k];
  const dir = (k) => 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]);
  return { x: at(0), y: at(1), dx: dir(0), dy: dir(1) };
}
// The flight in: from well above the view's top, heading right past the perch, round and back left to land facing
// left. The flight out: up and away to the left and out of the top. Both are the eagle's shoulders, in scene rows.
function eaglePath(b, leaving) {
  const x = eaglePerchX(b);
  const sy = EAGLE_BASE - EAGLE_STAND - EAGLE_LIFT;
  const top = -sc.dy - 32;
  if (!leaving) return [[x - 140, top], [x + 120, top + (sy - top) * 0.4], [x + 70, sy - 40], [x, sy]];
  const [fx, fy] = b.from ?? [x, sy];
  return [[fx, fy], [fx - 30, fy - 30], [fx - 90, top + 40], [fx - 150, top]];
}
// Its pose while perched: mostly still, now and then (each eagle on its own rhythm) its head turned back over its
// shoulder for a second and a half, or a quick shake of its feathers.
function eagleIdle(b) {
  if (scReduced.matches) return 'sit';
  const P = 64 + (b.seed % 5) * 9;
  const t = sc.tick + b.seed * 7;
  const ph = t % P;
  const pick = rnd(b.seed * 31 + Math.floor(t / P));
  if (pick < 0.45 && ph < 16) return 'look';
  if (pick >= 0.45 && pick < 0.75 && ph < 6) return ph % 2 ? 'sit' : 'ruffle';
  return 'sit';
}
// How an eagle is this frame: its perch's x (px), perched in a pose, or flying at (x, y) in a frame facing one way;
// how strong its light is (k, only once it has landed) and how solid its crag (rock), both 0 to 1.
function eagleNow(b) {
  const t = sc.tick - b.t0;
  const px = eaglePerchX(b);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  if (b.state === 'leave') {
    const n = { px, k: b.from ? 0 : clamp(1 - t / EAGLE_GLOW), rock: clamp(1 - (t - 8) / 12) };
    if (!b.from && t < 3) return { ...n, pose: 'mantle' };
    const u = clamp((t - (b.from ? 0 : 3)) / (EAGLE_LEAVE - 3));
    if (u >= 1) return n;
    const c = eagleCurve(eaglePath(b, true), u ** 1.4);
    const frame = u < 0.06 ? 'flare' : u < 0.7 ? EAGLE_FLAP[Math.floor(t / 2) % 4] : EAGLE_FLAP[Math.floor(t / 3) % 4];
    return { ...n, fly: true, x: c.x, y: c.y, frame, face: c.dx < 0 ? -1 : 1 };
  }
  if (b.state === 'arrive' && t < EAGLE_ARRIVE) {
    // Flapping as it comes down, then a glide with a slow wingbeat now and then, banked where it turns back, and a
    // flare before it lands.
    const u = t / EAGLE_ARRIVE;
    const P = eaglePath(b, false);
    const s = 1 - (1 - u) ** 2;
    const c = eagleCurve(P, s);
    const face = c.dx < 0 ? -1 : 1;
    const turning = Math.sign(eagleCurve(P, Math.max(0, s - 0.07)).dx) !== Math.sign(eagleCurve(P, Math.min(1, s + 0.07)).dx);
    const beat = t % 24 < 12 ? EAGLE_FLAP[Math.floor((t % 24) / 3)] : 'level';
    const frame = u > 0.88 ? 'flare' : u < 0.25 ? EAGLE_FLAP[Math.floor(t / 3) % 4] : turning ? 'bank' : beat;
    return { px, k: 0, rock: clamp(t / 10), fly: true, x: c.x, y: c.y, frame, face, mirror: frame === 'bank' && face < 0 };
  }
  const landed = b.state === 'arrive' ? t - EAGLE_ARRIVE : 99;
  const pose = landed < 3 ? 'mantle' : landed < 6 ? ['ruffle', 'sit', 'ruffle'][landed - 3] : eagleIdle(b);
  return { px, k: clamp(landed / EAGLE_GLOW), rock: 1, pose };
}
const eagleAll = () => [...eagles.live.values(), ...eagles.gone];

// Matches this frame's session callers (from scene-call.js's callResolve, oldest call first) to eagles. A caller
// keeps its eagle; a new one gets an eagle if its realm has a free perch, flying in if its newest call is fresh (or it
// had been folded into another eagle until now) and motion is allowed, else already perched; any caller left over
// folds into its realm's oldest eagle. An eagle whose caller is gone flies off.
function eagleSync(birds) {
  const still = scReduced.matches;
  const seen = new Set();
  const rest = [];
  for (const e of birds) {
    let b = eagles.live.get(e.key);
    if (!b) {
      const dx = eaglePlace(e.realm);
      if (dx === null) { rest.push(e); continue; }
      const fresh = callAge(e.calls[0]) < EAGLE_FRESH_MS || eagles.folded.has(e.key);
      b = { key: e.key, host: e.realm.m.host, seed: pxHash(e.key) % 97, dx, x: e.realm.x0 + dx, t0: sc.tick, state: !still && fresh ? 'arrive' : 'perch' };
      eagles.live.set(e.key, b);
    }
    seen.add(e.key);
    b.env = { ...e, more: 0 };
  }
  eagles.folded = new Set(rest.map((e) => e.key));
  for (const e of rest) {
    const host = [...eagles.live.values()].find((b) => b.host === e.realm.m.host && seen.has(b.key));
    if (host) host.env = { ...host.env, calls: [...host.env.calls, ...e.calls], more: host.env.more + 1 };
  }
  for (const [k, b] of eagles.live) {
    if (seen.has(k)) continue;
    eagles.live.delete(k);
    if (still) continue;
    const n = eagleNow(b);
    eagles.gone.push({ ...b, state: 'leave', t0: sc.tick, from: n.fly ? [n.x, n.y] : null });
  }
  eagles.gone = eagles.gone.filter((b) => sc.tick - b.t0 < EAGLE_LEAVE + 22);
}

// The crags and the perched eagles, depth-sorted with the figures at the crag's base (behind everyone on the road),
// each standing in the call's pool of light once its light is up.
function eagleItems(list) {
  const g = scG;
  const still = scReduced.matches;
  for (const b of eagleAll()) {
    const n = eagleNow(b);
    if (n.rock <= 0) continue;
    const x = Math.round(n.px);
    list.push({ z: EAGLE_BASE, draw: () => {
      if (n.k > 0 && b.state !== 'leave') callPool(g, x, EAGLE_BASE, b.env.calls[0], still, sc.tick, 1.8);
      g.globalAlpha = n.rock;
      drawEagleRock(g, x, EAGLE_BASE);
      g.globalAlpha = 1;
      if (n.pose) drawEaglePerched(g, x, EAGLE_BASE - EAGLE_STAND, n.pose);
    } });
  }
}
// The eagles in flight, over everything and over the sky the view adds (g here is not shifted down by sc.dy).
function eagleAbove(g) {
  for (const b of eagleAll()) {
    const n = eagleNow(b);
    if (n.fly) drawEagleFlying(g, eagleQ(n.x), eagleQ(n.y + sc.dy), n.frame, n.face, sc.sky.night, n.mirror);
  }
}
// While a perched eagle stays, once it has landed, the rings of sound from its head, nearly twice a figure's.
function eagleLight(g, still) {
  const head = Math.round(EAGLE_BASE - EAGLE_STAND - EAGLE_TALL);
  for (const b of eagles.live.values()) {
    const n = eagleNow(b);
    if (!still && n.pose && n.k > 0) callRings(g, Math.round(n.px) - 3.5, head + 3, b.env.calls[0], sc.tick + b.seed, 1.8);
  }
}
// A perched eagle's name beside its breast, counting any callers folded into it: on the side away from the other
// eagle in its realm if it fits there (its width guessed from the tags' font, page.html's --sc-font), else on the
// other side, else over its head. And the eagle at a point (scene units), perched with its crag or flying in.
function eagleTags() {
  const em = Math.max(9, Math.round(sc.scale * 3.3)) / sc.scale;
  const list = [...eagles.live.values()].filter((b) => eagleNow(b).pose);
  return list.map((b) => {
    const name = b.env.more ? `${b.env.name} +${b.env.more}` : b.env.name;
    const tag = { key: b.key, calls: b.env.calls, name, y: EAGLE_BASE - EAGLE_STAND - 12 };
    const w = name.length * em * 0.72 + 12 / sc.scale;
    const others = list.filter((o) => o !== b && o.host === b.host).map((o) => o.x);
    const fits = (side) => (side > 0 ? b.x + 8 + w < sc.W && !others.some((o) => o > b.x && o - 9 < b.x + 8 + w)
      : b.x - 10 - w > 0 && !others.some((o) => o < b.x && o + 8 > b.x - 10 - w));
    const first = others.some((o) => o > b.x) ? -1 : 1;
    const side = [first, -first].find(fits);
    if (side) return { ...tag, x: side > 0 ? b.x + 8 : b.x - 10, side };
    return { ...tag, x: b.x - 2.5, y: EAGLE_BASE - EAGLE_STAND - EAGLE_TALL - 1, over: true };
  });
}
function eagleAt(x, y) {
  for (const b of eagles.live.values()) {
    const n = eagleNow(b);
    if (n.pose && Math.abs(x - n.px) <= 10 && y >= EAGLE_BASE - EAGLE_STAND - EAGLE_TALL && y <= EAGLE_BASE + 0.5) return b.env;
    if (n.fly && Math.abs(x - n.x) <= 26 && Math.abs(y - n.y) <= 10) return b.env;
  }
  return null;
}
// A box the workers walk round for each crag: its foot and the ground behind it that the eagle's body would hide, so
// no one walks out of sight behind it with a name showing over its breast.
const eagleBoxes = (r) => eagleAll().filter((b) => b.host === r.m.host && eagleNow(b).rock > 0)
  .map((b) => [b.x - 10, EAGLE_BASE - 22, b.x + 9, EAGLE_BASE + 0.5]);

if (typeof drawEaglePerched === 'function' && typeof drawEagleFlying === 'function') {
  sc.layers.items.push(eagleItems);
  sc.layers.above.push(eagleAbove);
  if (sc.path) sc.path.extra = eagleBoxes;
  sc.eagle = { sync: eagleSync, light: eagleLight, tags: eagleTags, at: eagleAt, byKey: (k) => eagles.live.get(k)?.env ?? null };
}
