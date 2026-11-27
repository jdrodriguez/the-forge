// scene-work.js: what busy workers do in the Middle-earth view (scene.js). A worker whose ticket is building, or whose
// checks are running while it works, goes on rounds from its station: it walks to a spot, works there a few seconds,
// sometimes carries something back and drops it, then works its station for a while and picks the next job. Dwarves
// mine ore and tip it into the forge, dig gems out for the chest and hammer at the anvil; hobbits hoe and water their
// plot, pick vegetables for the cart and brew ale; elves write at the lectern, carry scrolls to and from the rack,
// shoot at the target, play the harp by the falls and gather golden leaves; Men carry sacks from their pile to the cart
// (their horses, water and sword drill are scene-rohan.js's). The Sentry's Ranger rides the road instead
// (scene-ride.js). Each worker's choices and timings come from a generator seeded by its key, so they are stable and no
// two workers move in step, and a spot holds one worker at a time. The station stays the worker's home and keeps
// showing how far its PR has come. A worker that stops being busy, or is pulled into a fight (scene-duel.js), drops
// what it was doing and goes home first. With reduced motion scene.js keeps workers at their stations. The props and
// their places are scenery-props.js; this file draws them as depth-sorted items, with arrows in flight. Loaded after
// scene.js, it sets sc.work, which scene.js calls on every frame: step (moves a worker), fx (its particles) and items.
const work = { realms: new Map(), shots: [] };
const NOTE = ['.11', '.1.', '11.'];

// Each realm's running tally, kept for the session: gems in the chest, the cart's load, scrolls on the rack, arrows in
// the target and when the forge last flared.
function workRealm(r) {
  let st = work.realms.get(r.m.host);
  if (!st) { st = { kind: r.kind, gems: 4, load: 2, scrolls: 5, arrows: 0, flare: 0 }; work.realms.set(r.m.host, st); }
  return st;
}
// A small seeded generator (mulberry32), one per worker.
function workRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const span = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const alt = (k) => (t) => Math.floor(t / k) % 2;
// A work swing over 2k ticks, through its in-between frame (hdSwingFrame, sprites-hd.js).
const swing = (k) => (t) => hdSwingFrame(t, k);
// Two beats: the first frame for k ticks, then the second.
const then = (k) => (t) => (t < k ? 0 : 1);

// A forge flare, when ore goes in: embers fly up and scene's items draw tall flames for a second.
function workFlare(r) {
  workRealm(r).flare = sc.tick + 12;
  spray(r.x0 + 14, GROUND_Y - 2, [PX.emberL, PX.ember, '#fff3c4'], 12, { up: 2, spread: 2, life: 7 });
}

// The jobs each people can do, given its realm's props (P), tally (st) and the worker's generator. Each has a weight
// (w), the spot it holds until it heads home, its steps away from the station, and steps for once it is home again.
const WORK = {
  dwarf(a, P, st, rng) {
    // A rock with room on both sides takes a miner on each.
    const jobs = P.ore.flatMap((rock, i) => rock.spots.map((spot, k) => ({ w: 3, spot: `ore${i}${k}`, steps: [
      { go: spot },
      { pose: 'work', tool: 'pick', n: span(rng, 40, 70), anim: swing(3), face: spot.face },
      { pose: 'bend', n: 6, face: spot.face, fn: (b) => { b.carry = 'ore'; } },
      { go: P.forge },
      { pose: 'tip', tool: 'ore', n: 10, anim: then(4), face: P.forge.face, at: 4, fn: (b) => { b.carry = null; workFlare(b.realm); } },
    ] })));
    if (P.gems && P.chest) {
      const gem = `gem${span(rng, 0, 3)}`;
      jobs.push({ w: 2, spot: 'gems', steps: [
        { go: P.gems.spot },
        { pose: 'dig', tool: 'pick', n: span(rng, 40, 60), anim: alt(3), face: P.gems.spot.face },
        { pose: 'carry', tool: gem, n: 10, anim: () => 2, face: P.gems.spot.face, fn: (b) => { b.carry = gem; } },
        { go: P.chest.spot },
        { pose: 'tip', tool: gem, n: 8, anim: then(3), face: P.chest.spot.face, at: 3, fn: (b) => {
          b.carry = null;
          st.gems = Math.min(21, st.gems + 1);
          spray(P.chest.x + 5, P.chest.y + 1, GEMS.map((c) => c[0]), 6, { up: 0.9, spread: 1.4, life: 6 });
        } },
      ] });
    }
    return [...jobs, { w: 1, steps: [] }];
  },
  hobbit(a, P, st, rng) {
    const jobs = [{ w: 2, steps: [{ pose: 'sprinkle', n: span(rng, 30, 50), anim: alt(4), face: 1 }] }, { w: 1, steps: [] }];
    if (P.cart) {
      P.veg.forEach((v, i) => jobs.push({ w: 3, spot: `veg${i}`, steps: [
        { go: v },
        { pose: 'bend', tool: 'basket', n: span(rng, 40, 60), anim: alt(4), face: v.face, fn: (b) => { b.carry = 'basket'; } },
        { go: P.cart.spot },
        { pose: 'tip', tool: 'basket', n: 10, anim: then(4), face: P.cart.spot.face, at: 4, fn: (b) => {
          b.carry = null;
          st.load = Math.min(16, st.load + 2);
          spray(P.cart.x + 6, P.cart.y + 1, VEG, 4, { up: 0.6, spread: 1.2, life: 5 });
        } },
      ] }));
    }
    if (P.brew) jobs.push({ w: 2, spot: 'brew', steps: [{ go: P.brew.spot }, { pose: 'stir', n: span(rng, 50, 90), anim: alt(4), face: P.brew.spot.face }] });
    return jobs;
  },
  elf(a, P, st, rng) {
    const jobs = [{ w: 1, steps: [] }];
    if (P.rack) {
      // File the scroll just written, or, with the rack nearly full, fetch one back to the lectern.
      const file = st.scrolls < 7;
      const at = { face: P.rack.spot.face, n: 8, anim: then(4), at: 4 };
      jobs.push({ w: 2, steps: file
        ? [{ pose: 'bend', n: 5, fn: (b) => { b.carry = 'scroll'; } }, { go: P.rack.spot },
          { pose: 'tip', tool: 'scroll', ...at, fn: (b) => { b.carry = null; st.scrolls += 1; } }]
        : [{ go: P.rack.spot }, { pose: 'tip', ...at, fn: (b) => { b.carry = 'scroll'; st.scrolls -= 1; } }],
      after: file ? [] : [{ pose: 'tip', tool: 'scroll', n: 6, anim: then(3), face: 1, at: 3, fn: (b) => { b.carry = null; } }] });
    }
    if (P.target) {
      const t = P.target;
      const shot = { pose: 'shoot', n: 11, anim: then(7), face: t.spot.face, aim: { x: t.side < 0 ? t.x + 1 : t.x + 5, y: t.y + 3 } };
      jobs.push({ w: 2, spot: 'target', steps: [
        { go: t.spot }, shot, shot, shot,
        { go: { x: t.side < 0 ? t.x - 4 : t.x + 10, y: t.base + 1 } },
        { pose: 'tip', n: 8, anim: then(4), face: -t.side, at: 4, fn: () => { st.arrows = 0; } },
      ] });
    }
    jobs.push({ w: 2, spot: 'harp', steps: [{ go: P.harp }, { pose: 'harp', n: span(rng, 60, 100), anim: alt(4), face: P.harp.face }] });
    P.trees.forEach((tree, i) => jobs.push({ w: 1, spot: `tree${i}`, steps: [
      { go: tree.spot },
      { pose: 'reach', n: span(rng, 30, 50), anim: alt(5), face: tree.spot.face, tree },
      { pose: 'bend', n: 8, face: tree.spot.face, fn: (b) => { b.carry = 'leaves'; } },
    ], after: [{ pose: 'tip', tool: 'leaves', n: 6, anim: then(3), face: 1, at: 3, fn: (b) => { b.carry = null; } }] }));
    return jobs;
  },
  man(a, P, st) {
    if (!P.pile || !P.cart) return [{ w: 1, steps: [] }];
    return [{ w: 1, steps: [] }, { w: 2, spot: 'pile', steps: [
      { go: P.pile.spot },
      { pose: 'bend', n: 8, face: P.pile.spot.face, fn: (b) => { b.carry = 'sack'; } },
      { go: P.cart.spot },
      { pose: 'tip', tool: 'sack', n: 8, anim: then(3), face: P.cart.spot.face, at: 3, fn: (b) => { b.carry = null; st.load = Math.min(16, st.load + 1); } },
    ] }];
  },
};

// The next round for a worker: home first if it isn't there (or on its first round, a spell at its station of a length
// of its own, so workers start out of step), then a job no one else holds, then home and a spell at the station. Home is
// looked up when the worker sets off, in case its station has changed since.
function workPlan(a) {
  const P = realmProps(a.realm);
  const rng = (a.rng ??= workRng(pxHash(a.key)));
  const home = 'home';
  // At the station the work is in front: struck down onto the plot or anvil, or written at the desk (sprites-motion.js).
  const station = (lo, hi) => ({ pose: stationPose(a.kind), n: span(rng, lo, hi), anim: swing(3), face: 1 });
  const job = { key: P.key, i: 0, t: 0, steps: [{ go: home }] };
  if (!a.planned || Math.hypot(a.x - a.homeX, a.y - a.homeY) > 1) {
    job.steps.push(station(a.planned ? 20 : 0, a.planned ? 50 : 90));
    a.planned = true;
    return job;
  }
  const taken = (id) => [...sc.actors.values()].some((b) => b !== a && b.realm === a.realm && b.job?.spot === id);
  const jobs = (WORK[a.kind]?.(a, P, workRealm(a.realm), rng) ?? []).filter((j) => !j.spot || !taken(j.spot));
  let pick = rng() * jobs.reduce((sum, j) => sum + j.w, 0);
  const j = jobs.find((x) => (pick -= x.w) < 0) ?? { steps: [] };
  job.spot = j.spot;
  job.steps = [...j.steps, { go: home, release: true }, ...(j.after ?? []), station(50, 120)];
  return job;
}

// The way to a spot: straight there, except that a front-row worker steps out beside its desk before heading forward,
// and back beside it before stepping home, so it never walks through it.
function workPath(a, to) {
  const hx = a.homeX;
  const hy = a.homeY;
  const home = to.x === hx && to.y === hy;
  if (!(home ? a.y > hy + 2 : Math.abs(a.y - hy) < 1 && to.y > hy + 2)) return [to];
  const other = home ? a : to;
  let wx = hx + (other.x < hx ? -11 : 11);
  if (wx < a.realm.x0 + 4 || wx > a.realm.x0 + a.realm.w - 4) wx = 2 * hx - wx;
  return home ? [{ x: wx, y: hy + 6 }, { x: wx, y: hy }, to] : [{ x: wx, y: hy }, { x: wx, y: hy + 6 }, to];
}

// Moves a worker at a station for one frame. A worker in a fight is moved by scene-duel.js and one cheering stands
// still; one that isn't busy goes home; a busy one follows its round. Returns true, since it handled the move.
function workStep(a) {
  if (a.foe || a.cheerUntil > performance.now()) { workDrop(a); a.moving = false; return true; }
  if (a.mood !== 'work' && a.mood !== 'checking') {
    workDrop(a);
    a.moving = scMove(a, { x: a.homeX, y: a.homeY });
    if (!a.moving) a.face = 1;
    return true;
  }
  if (!a.job || a.job.key !== realmProps(a.realm).key) a.job = workPlan(a);
  const job = a.job;
  const s = job.steps[job.i];
  if (!s) { a.job = null; a.moving = false; return true; }
  a.act = null;
  if (s.go) {
    // Heading home frees the spot for the next worker.
    if (s.release) job.spot = null;
    job.path ??= workPath(a, s.go === 'home' ? { x: a.homeX, y: a.homeY } : s.go);
    a.moving = scMove(a, job.path[0], a.carry ? 0.7 : 0.8);
    if (!a.moving) job.path.shift();
    if (!job.path.length) { job.path = null; job.i += 1; }
    return true;
  }
  a.moving = false;
  if (s.face) a.face = s.face;
  a.aim = s.aim;
  a.tree = s.tree;
  a.act = [s.pose, s.anim ? s.anim(job.t) : 0, s.tool];
  if (job.t === (s.at ?? (s.n ?? 1) - 1)) s.fn?.(a);
  job.t += 1;
  if (job.t >= (s.n ?? 1)) { job.i += 1; job.t = 0; }
  return true;
}
const workDrop = (a) => { a.job = null; a.carry = null; a.act = null; };

// Particles for what a worker is doing this frame, at its working hand (in scene pixels, already turned with the
// worker). fwd is the way it faces.
function workFx(a, pose, frame, hand) {
  const changed = pose !== a.fxPose || frame !== a.fxFrame;
  a.fxPose = pose;
  a.fxFrame = frame;
  const fwd = a.face < 0 ? -1 : 1;
  const x = Math.round(a.x);
  const tool = pose === 'carry' ? a.carry : a.act?.[2];
  // A struck tool's head lands at the hand point itself (sprites-motion.js); the side swing's lies ahead of the fist.
  const ahead = pose === 'strike' ? 0 : 1;
  if ((pose === 'work' || pose === 'strike') && frame === 1 && changed) {
    if (tool === 'pick') spray(hand.x + 6 * fwd * ahead, hand.y, ['#a5a1ab', '#7e7a86', '#f0a33a'], 3, { up: 1, spread: 1.6, life: 4 });
    else if (a.kind === 'dwarf') spray(hand.x + 4 * fwd * ahead, hand.y, [PX.emberL, PX.ember, '#fff3c4'], 4, { up: 1.3, spread: 1.8, life: 4 });
    else if (a.kind === 'hobbit') spray(hand.x + 4 * fwd * ahead, hand.y + 4 * ahead, [PX.soil, PX.soilD], 2, { up: 0.8, spread: 1.2, life: 4 });
    else if (a.kind === 'elf') spray(x + 2 * fwd, Math.round(a.y) - 6, [PX.blue, '#e6f2ff', PX.gold], 1, { up: 0.35, spread: 0.3, life: 16, fall: 0 });
  }
  if (pose === 'write' && frame === 1 && changed && (sc.tick + a.seed) % 4 === 0) spray(hand.x, hand.y - 1, [PX.blue, '#e6f2ff', PX.gold], 1, { up: 0.35, spread: 0.3, life: 16, fall: 0 });
  if (pose === 'dig' && frame === 1 && changed) {
    spray(hand.x, hand.y, ['#625e6b', '#a5a1ab'], 2, { up: 0.9, spread: 1.4, life: 4 });
    if (Math.random() < 0.5) spray(hand.x, hand.y - 1, GEMS[Math.floor(Math.random() * 4)], 2, { up: 0.7, spread: 0.8, life: 5 });
  }
  if (pose === 'bend' && tool === 'basket' && frame === 1 && changed) spray(hand.x + 2 * fwd, hand.y - 1, VEG, 1, { up: 0.9, spread: 0.4, life: 4 });
  if (pose === 'stir') {
    if (sc.tick % 3 === 0) spray(hand.x, hand.y - 1, ['#ecebf0', '#cfcfd6'], 1, { up: 0.3, spread: 0.4, life: 14, fall: -0.01 });
    if (changed) spray(hand.x - fwd, hand.y + 1, ['#f2d27a', '#fff7dc'], 2, { up: 0.25, spread: 1, life: 3, fall: 0 });
  }
  if ((pose === 'water' || pose === 'sprinkle') && frame === 1) spray(hand.x, hand.y, ['#8fc3ff', '#cfe6ff'], 1, { up: 0, spread: 0.3, life: 5, fall: 0.25 });
  if (pose === 'harp' && sc.tick % 7 === 0) {
    particles.push({ x: hand.x, y: hand.y - 3, vx: 0.12 * fwd, vy: -0.25, life: 24, color: ['#fff3c4', '#e6f2ff', PX.gold][sc.tick % 3], fall: 0, glyph: NOTE, sway: 0.3 });
  }
  if (pose === 'reach' && a.tree && sc.tick % 4 === 0) {
    const t = a.tree;
    particles.push({ x: t.x - 4 + Math.random() * 10, y: t.top + 6 + Math.random() * 6, vx: 0, vy: 0.18, life: 28, color: Math.random() < 0.5 ? '#f0d36a' : '#c99a30', fall: 0, sway: 0.35 });
  }
  if (pose === 'shoot' && frame === 1 && changed && a.aim) work.shots.push({ x: hand.x, y: hand.y, tx: a.aim.x, ty: a.aim.y, host: a.realm.m.host });
  if (pose === 'carry' && tool?.startsWith('gem') && sc.tick % 3 === 0) spray(hand.x, hand.y, ['#ffffff', GEMS[tool[3]][0]], 1, { up: 0.3, spread: 0.7, life: 3, fall: 0 });
  if (pose === 'tip' && frame === 1 && changed && (tool === 'basket' || tool === 'leaves' || tool === 'sack')) {
    spray(hand.x + 2 * fwd, hand.y + 1, tool === 'basket' ? VEG : tool === 'leaves' ? ['#f0d36a', '#c99a30'] : ['#ddc89c', '#b49d70'], 3, { up: 0.3, spread: 0.8, life: 5 });
  }
}

// The forge's flare: six tongues of fire in quarter units along the hearth from x, their feet on row base, each a
// different height that leaps by tick, narrowing to a wavering tip, white-hot at the heart, yellow, then orange on the lit
// left and red on the right.
function workFlames(g, x, base, tick) {
  for (let i = 0; i < 6; i += 1) {
    const h = (5 + Math.floor(rnd(i + tick * 3) * 7)) * 4;
    for (let r = 0; r < h; r += 1) {
      const t = r / h;
      const w = Math.round(1 + 7 * t ** 0.7);
      const c0 = i * 8 + 4 - (w >> 1) + Math.round(Math.sin(r * 0.35 + tick * 1.3 + i * 2) * 2.2 * (1 - t) ** 2);
      const ramp = w < 3 ? 'e' : w < 5 ? 'Eef' : t > 0.6 ? 'Eehhheff' : 'Eeehhef';
      for (let k = 0; k < w; k += 1) pxBox(g, x + (c0 + k) / 4, base - (h - r) / 4, 0.25, 0.25, GEAR_PX[ramp[Math.round((k * (ramp.length - 1)) / Math.max(1, w - 1))]]);
    }
  }
}

// Each frame: the props as depth-sorted items, the forge's flare and the arrows in flight. An arrow that reaches the
// target sticks in it.
function workItems(items) {
  for (const r of sc.realms) {
    const P = realmProps(r);
    const st = workRealm(r);
    for (const p of P.list) items.push({ z: p.base, draw: () => drawProp(scG, p, st, sc.tick) });
    if (r.kind === 'dwarf' && st.flare > sc.tick) {
      sc.glow?.add(r.x0 + 14, GROUND_Y - 3, 12, '#ff9a3c', 0.6);
      items.push({ z: GROUND_Y + 5, draw: () => workFlames(scG, r.x0 + 9, GROUND_Y + 2, sc.tick) });
    }
  }
  for (const s of work.shots) {
    const dir = s.tx < s.x ? -1 : 1;
    s.x += dir * 4;
    s.y += Math.sign(s.ty - s.y) * Math.min(1, Math.abs(s.ty - s.y));
    if ((s.x - s.tx) * dir >= 0) {
      s.done = true;
      const st = work.realms.get(s.host);
      if (st) st.arrows = Math.min(3, st.arrows + 1);
      spray(s.tx, s.ty, ['#e4c97a', '#c9a85a'], 2, { up: 0.5, spread: 1, life: 3 });
      continue;
    }
    items.push({ z: 200, draw: () => drawArrow(scG, Math.round(s.x) - 4 * dir, Math.round(s.x) - (dir > 0 ? 1 : -1), Math.round(s.y), dir) });
  }
  work.shots = work.shots.filter((s) => !s.done);
}

sc.work = { step: workStep, fx: workFx, items: workItems };
