// scene-duel.js: how a worker and an orc fight in the Middle-earth view, for scene-orcs.js's duels (a PR's checks failing)
// and its swarm's hunters (main red). They meet on the open ground between the two rows of stations, near the worker's
// station, and fight across it in exchanges of a few beats: the orc presses in and swings while the worker gives ground
// and parries, the worker counters with a lunge and the orc staggers back, the worker chases it a few steps, they circle
// and change sides, one hops clear of a swing, and between exchanges they drift back toward the station. Every move is
// checked first (fightClear): it stays inside the realm, on the strip of ground between the rows, off every station and
// clear of other fights, so a fight never walks through a landmark or covers another worker's station. The Sentry's
// mounted Ranger fights on the road instead (scene-ride.js). With reduced motion a fight is a still tableau at the station.
// fightStep moves the worker itself (a.x, a.y, a.face, a.lift), so it stays clickable, and sets the poses: f.wp for the
// worker (scene.js's scPose reads it from a.foe) and f.op for the orc, at f.x and f.y facing f.face. Loaded before
// scene-orcs.js, which calls it.

// The strip a fight keeps to, as feet rows: below the back row's desks and above the front row's workers.
const FIGHT_Y = [137, 142];
const FIGHT_GAP = 11;
const HOP = [0, 1, 2, 2, 1, 0];
// A fight's beats. n: ticks; dw and dov: how far the worker and the orc move toward each other ('close' closes to
// striking distance; negative gives ground); poses: the worker's and the orc's [pose, frame] on tick t; clash, hit and
// miss: the tick the blades meet, the worker's blow lands or a swing misses.
const BEATS = {
  press: { n: 6, dw: -4, dov: 6, poses: (t) => [['block', hdWalkFrame(t, 1)], ['block', hdWalkFrame(t, 1)]] },
  push: { n: 6, dw: 6, dov: -4, poses: (t) => [['block', hdWalkFrame(t, 1)], ['block', hdWalkFrame(t, 1)]] },
  close: { n: 4, dov: 'close', poses: (t) => [['block', 2], ['block', hdWalkFrame(t, 1)]] },
  swing: { n: 6, poses: (t) => [['block', 2], ['fight', t < 2 ? 0 : t === 2 ? 0.5 : 1]], clash: 3 },
  strike: { n: 6, poses: (t) => [['fight', t < 2 ? 0 : t === 2 ? 0.5 : 1], ['block', 2]], clash: 3 },
  counter: { n: 6, dw: 2, dov: -5, poses: (t) => [['lunge', 0], ['stagger', hdWalkFrame(t, 1)]], hit: 0 },
  chase: { n: 5, dw: 'close', poses: (t) => [['block', hdWalkFrame(t, 1)], ['block', 2]] },
  dodge: { n: 6, dw: -4, poses: (t) => [['block', 2], ['fight', t < 1 ? 0 : t === 1 ? 0.5 : 1]], wLift: HOP, miss: 2 },
  duck: { n: 6, dov: -4, poses: (t) => [['lunge', 0], ['block', 2]], oLift: HOP, miss: 1 },
  swap: { n: 10, swap: true, poses: (t) => [['block', hdWalkFrame(t, 1)], ['block', hdWalkFrame(t, 1)]] },
  hold: { n: 5, poses: () => [['block', 2], ['block', 2]] },
  drift: { n: 10, drift: true, poses: (t) => [['block', hdWalkFrame(t, 1)], ['block', hdWalkFrame(t, 1)]] },
};
const EXCHANGES = [['press', 'swing', 'counter', 'chase'], ['close', 'swing', 'dodge', 'push', 'strike'], ['strike', 'counter', 'chase', 'swing'],
  ['swap', 'hold', 'close', 'swing'], ['push', 'strike', 'duck', 'press', 'swing'], ['close', 'swing', 'swing', 'counter', 'chase']];
// When a beat has no room: the move the other way, or a standing exchange.
const FIGHT_ALT = { press: 'push', push: 'press', dodge: 'swing', duck: 'strike', counter: 'strike', chase: 'hold', drift: 'hold', close: 'hold' };
// The exchanges of a fight that can't move.
const STANDING = [['swing', 'strike', 'hold'], ['strike', 'swing'], ['swing', 'swing', 'strike', 'hold']];

// A new fight for worker a, its orc starting at (x, y): a duel's orc comes down from the back of the realm, a hunter is
// wherever it was.
const fightNew = (a, x, y) => ({ on: false, x, y, face: -1, queue: [], beat: null, t: 0, lift: 0, start: null, path: null, rng: workRng(pxHash(a.key) + Math.floor(x)) });

// Whether a fighter of this kind can stand with its feet at (x, y): inside the realm, on the strip (or near it, loose,
// while circling), clear of every station's art and of the fighters of every other fight.
function fightClear(a, x, y, kind, f, loose = false) {
  const r = a.realm;
  const [lo, hi] = loose ? [FIGHT_Y[0] - 4, FIGHT_Y[1] + 3] : FIGHT_Y;
  if (!r || x < r.x0 + 5 || x > r.x0 + r.w - 5 || y < lo || y > hi) return false;
  const me = [x - 4, y - figureTop(kind) + 1, x + 4, y];
  for (const s of sc.stations) {
    if (s.realm === r && boxHits([s.x - 8, s.y - 6, s.x + 8, s.y + 1], me)) return false;
  }
  // Nor on a worker standing still, at its anvil or at work (2026-11-27: a duel's orc stood in Fili).
  for (const b of sc.actors.values()) {
    if (b !== a && b.realm === r && !b.mounted && !b.moving && !b.foe && boxHits([b.x - 4, b.y - figureTop(b.kind) + 1, b.x + 4, b.y], me)) return false;
  }
  for (const o of sc.fights ?? []) {
    if (o.f === f) continue;
    if ((Math.abs(o.a.x - x) < 8 && Math.abs(o.a.y - y) < 5) || (Math.abs(o.f.x - x) < 8 && Math.abs(o.f.y - y) < 5)) return false;
  }
  return true;
}

// Where a fight starts: the nearest open ground to the worker's station with room for the orc beside it.
function fightStart(a, f) {
  for (const y of [140, 142, 138, 141, 139, 137]) {
    for (const dx of [0, 4, -4, 8, -8, 12, -12, 17, -17, 23, -23, 30, -30, 40, -40]) {
      for (const side of [1, -1]) {
        const x = Math.round(a.homeX + dx);
        if (fightClear(a, x, y, a.kind, f) && fightClear(a, x + side * FIGHT_GAP, y, 'orc', f)) return { x, y, side };
      }
    }
  }
  return null;
}

// The next beat: the next of the current exchange, or a new exchange (led by a drift back toward the station if the
// fight has strayed), each checked for room and swapped for its alternative, a change of sides or a stand-off if it
// has none.
function fightNext(f, a) {
  if (!f.queue.length) {
    f.queue = [...EXCHANGES[Math.floor(f.rng() * EXCHANGES.length)]];
    if (Math.abs((f.wx + f.x) / 2 - a.homeX) > 20) f.queue.unshift('drift');
  }
  const name = f.queue.shift();
  f.beat = fightPlan(f, a, name) ?? fightPlan(f, a, FIGHT_ALT[name]) ?? fightPlan(f, a, 'swap')
    ?? { ...BEATS.hold, name: 'hold', w0: f.wx, w1: f.wx, o0: f.x, o1: f.x, y0: f.by, y1: f.by };
  f.t = 0;
}
// Where a beat would leave the two, tried a few ways (a drift home in shorter steps, a stand-off shuffling along the
// strip or not), the first with room; null if none has.
function fightPlan(f, a, name) {
  const b = BEATS[name];
  if (!b) return null;
  const s = f.x >= f.wx ? 1 : -1;
  const gap = Math.abs(f.x - f.wx);
  const w = Math.round(f.wx + s * (b.dw === 'close' ? gap - FIGHT_GAP : b.dw ?? 0));
  const o = Math.round(f.x - s * (b.dov === 'close' ? gap - FIGHT_GAP : b.dov ?? 0));
  const home = Math.round(a.homeX - (f.wx + f.x) / 2);
  let tries = [[w, o, f.by]];
  if (b.drift) tries = [10, 6, 3].map((k) => Math.sign(home) * Math.min(k, Math.abs(home))).map((d) => [w + d, o + d, f.by]);
  if (b.swap) tries = [[Math.round(f.x), Math.round(f.wx), f.by]];
  if (name === 'hold' && f.rng() < 0.5) tries.unshift([w, o, f.by + (f.rng() < 0.5 ? -2 : 2)]);
  // Circling, the orc passes in front of the worker or behind it.
  const dip = f.rng() < 0.5 ? 3 : -3;
  for (const [w1, o1, y1] of tries) {
    if (!b.swap && (Math.abs(o1 - w1) < 8 || Math.abs(o1 - w1) > 20)) continue;
    if (!fightClear(a, w1, y1, a.kind, f) || !fightClear(a, o1, y1, 'orc', f)) continue;
    const mid = Math.round((w1 + o1) / 2);
    if (b.swap && !(fightClear(a, mid, f.by + dip, 'orc', f, true) && fightClear(a, mid, f.by - Math.sign(dip) * 2, a.kind, f, true))) continue;
    return { ...b, name, w0: f.wx, w1, o0: f.x, o1, y0: f.by, y1, dip };
  }
  return null;
}

// One tick of a fight between worker a and the orc of fight f.
function fightStep(f, a) {
  if (scReduced.matches) return fightStill(f, a);
  if (!f.on) return fightApproach(f, a);
  if (!f.beat || f.t >= f.beat.n) fightNext(f, a);
  const b = f.beat;
  const t = f.t;
  const k = (t + 1) / b.n;
  let wx = b.w0 + (b.w1 - b.w0) * k;
  let ox = b.o0 + (b.o1 - b.o0) * k;
  const y = b.y0 + (b.y1 - b.y0) * k;
  let wy = y;
  let oy = y;
  if (b.swap) {
    const mid = (b.w0 + b.o0) / 2;
    const c = Math.cos(Math.PI * k);
    wx = mid + (b.w0 - mid) * c;
    ox = mid + (b.o0 - mid) * c;
    oy += b.dip * Math.sin(Math.PI * k);
    wy -= Math.sign(b.dip) * 2 * Math.sin(Math.PI * k);
  }
  Object.assign(f, { wx, x: ox, y: oy, by: y, lift: b.oLift?.[t] ?? 0 });
  Object.assign(a, { x: wx, y: wy, z: wy, lift: b.wLift?.[t] ?? 0 });
  if (Math.abs(ox - wx) > 0.5) { a.face = ox > wx ? 1 : -1; f.face = -a.face; }
  [f.wp, f.op] = b.poses(t);
  fightSparks(b, t, wx, ox, y);
  f.t += 1;
}
// The worker walks out to the starting place beside its station (round its desk, as on its rounds) while the orc runs in.
function fightApproach(f, a) {
  f.start ??= fightStart(a, f);
  if (!f.start) return fightStill(f, a);
  const { x, y, side } = f.start;
  f.path ??= workPath(a, { x, y });
  const walking = scMove(a, f.path[0], 0.9);
  if (!walking && f.path.length > 1) f.path.shift();
  const running = orcRun(f, 1.3, { x: x + side * FIGHT_GAP, y });
  f.wp = walking ? ['walk', hdWalkFrame(sc.tick)] : ['block', 2];
  f.op = running ? ['walk', hdWalkFrame(sc.tick, 1)] : ['block', 2];
  a.lift = 0;
  a.z = a.y;
  if (!walking) a.face = side;
  if (!walking && !running && f.path.length === 1) Object.assign(f, { on: true, wx: x, by: y, face: -side });
}
// A fight that doesn't move: where no open ground was found, or with reduced motion (one frame).
function fightStill(f, a) {
  Object.assign(a, { x: a.homeX, y: a.homeY, face: 1, lift: 0 });
  Object.assign(f, { x: a.homeX + ORC_GAP, y: a.homeY, face: -1, lift: 0 });
  if (scReduced.matches) { f.wp = ['block', 2]; f.op = ['fight', 1]; return; }
  if (!f.beat || f.t >= f.beat.n || !f.beat.still) {
    if (!f.queue.length || f.beat && !f.beat.still) f.queue = [...STANDING[Math.floor(f.rng() * STANDING.length)]];
    f.beat = { ...BEATS[f.queue.shift()], still: true };
    f.t = 0;
  }
  [f.wp, f.op] = f.beat.poses(f.t);
  fightSparks(f.beat, f.t, a.x, f.x, a.y);
  f.t += 1;
}
function fightSparks(b, t, wx, ox, y) {
  if (scReduced.matches) return;
  if (t === b.clash) spray(Math.round((wx + ox) / 2), Math.round(y) - 9, [PX.emberL, PX.white, PX.gold], 4, { up: 0.9, spread: 1.6, life: 3 });
  if (t === b.hit) spray(Math.round(ox + (ox > wx ? -1 : 1)), Math.round(y) - 7, [PX.white, PX.red, PX.emberL], 4, { up: 0.7, spread: 1.4, life: 3 });
  if (t === b.miss) spray(Math.round((wx + ox) / 2), Math.round(y) - 7, ['#c8c4cc', '#9a96a0'], 2, { up: 0.2, spread: 1.6, life: 3, fall: 0 });
}
