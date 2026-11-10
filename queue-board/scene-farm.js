// scene-farm.js: the Shire's well and pigs in the Middle-earth view (scene.js). Three more hobbit jobs join the ones in
// scene-work.js (through scene-jobs.js's workAdd, so they share its seeded choice and its one-worker-per-spot rule):
// draw water at the well (walk there, wind the crank while the bucket rises, unhook it) and carry it home to pour on the
// station's plot; draw water and pour it into the pigs' trough; or bring the pigs food, a basket picked in the vegetable
// patch or taken from the cart, and tip it in. The pigs wander their pen, root about and sometimes lie down; when food
// or water lands in the trough they come to it and eat or drink until it is gone. With reduced motion workers stay at
// their stations (scene.js) and the pigs stand still. The well and pen are scenery-farm.js's, placed by realmProps.
// Loaded after scene-jobs.js.
const FEED = 140;
// Where each pig eats, in the pen's own columns from its trough end: side by side at the trough, one behind the other.
const PIG_SLOT = [{ x: 4, y: 6 }, { x: 4, y: 10 }];

// The trough and the pigs, kept in the realm's tally for the session. A pig's x is its left column and y its feet row,
// both counted inside the pen from its trough end.
function farmState(st) {
  st.trough ??= { food: 0, water: 0 };
  st.pigs ??= [0, 1].map((i) => ({ i, x: 9 + i * 7, y: 7 + i * 3, face: i ? 1 : -1, mode: 'stand', n: 20 + i * 25, rng: workRng(4242 + i) }));
  return st;
}

workAdd('hobbit', (a, P, st, rng) => {
  const { well, pen } = P;
  const r = a.realm;
  const jobs = [];
  if (pen) farmState(st);
  const toPen = (from, last) => [...workWay(r, from, pen.spot), { go: pen.spot, claim: true }, last];
  if (well) {
    const s = well.spot;
    const draw = [
      { go: s, claim: true },
      { pose: 'crank', n: span(rng, 32, 48), anim: (t) => Math.floor(t / 2) % 4, face: s.face, well: 'crank' },
      { pose: 'tip', n: 6, anim: () => 0, face: s.face, at: 3, well: 'take', fn: (b) => { b.carry = 'bucket'; } },
    ];
    jobs.push({ w: 2, spot: 'well', steps: draw,
      after: [{ pose: 'pour', tool: 'bucket', n: span(rng, 24, 36), anim: alt(4), face: 1, fn: (b) => { b.carry = null; } }] });
    if (pen) {
      jobs.push({ w: 2, spot: 'well', steps: [...draw, ...toPen(s, { pose: 'pour', tool: 'bucket', n: 16, anim: alt(4), face: pen.spot.face, at: 6,
        fn: (b) => { b.carry = null; st.trough.water = FEED; } })] });
    }
  }
  if (pen) {
    const feed = { pose: 'tip', tool: 'basket', n: 10, anim: then(4), face: pen.spot.face, at: 4, fn: (b) => {
      b.carry = null;
      st.trough.food = FEED;
      spray(penX(pen, 3), pen.y + 5, VEG, 4, { up: 0.5, spread: 1, life: 4 });
    } };
    if (P.veg.length) {
      const i = span(rng, 0, P.veg.length - 1);
      const v = P.veg[i];
      jobs.push({ w: 2, spot: `veg${i}`, steps: [
        { go: v, claim: true },
        { pose: 'bend', tool: 'basket', n: span(rng, 30, 45), anim: alt(4), face: v.face, fn: (b) => { b.carry = 'basket'; } },
        ...toPen(v, feed),
      ] });
    }
    if (P.cart && st.load >= 4) {
      jobs.push({ w: 1, spot: 'cart', steps: [
        { go: P.cart.spot, claim: true },
        { pose: 'tip', n: 8, anim: then(4), face: P.cart.spot.face, at: 4, fn: (b) => { b.carry = 'basket'; st.load = Math.max(0, st.load - 2); } },
        ...toPen(P.cart.spot, feed),
      ] });
    }
  }
  return jobs;
});

// The well's bucket and crank this frame, from the hobbit winding it, if any: the bucket rises as the winding goes on
// and stays up until it is unhooked.
function wellState(r) {
  const at = workDoing(r, (s) => s.well);
  if (!at) return { lift: 0, crank: 2 };
  const { b, s } = at;
  if (s.well === 'crank') return { lift: Math.min(1, b.job.t / s.n), crank: b.act?.[0] === 'crank' ? b.act[1] : 2 };
  return { lift: b.carry ? 0 : 1, crank: 2 };
}

// One frame of a pig. Food or water in the trough calls both pigs to it (up from lying down too), and they eat or drink
// it down; otherwise each finishes what it is doing and its generator picks the next: a few steps somewhere in the pen,
// rooting, standing about or lying down.
function pigStep(pig, trough, others) {
  const stock = trough.food > 0 ? 'food' : trough.water > 0 ? 'water' : null;
  if (stock && pig.mode !== 'eat' && pig.mode !== 'go') Object.assign(pig, { mode: 'go', tx: PIG_SLOT[pig.i].x, ty: PIG_SLOT[pig.i].y });
  if (pig.mode === 'go' || pig.mode === 'walk') {
    const dx = pig.tx - pig.x;
    const dy = pig.ty - pig.y;
    const d = Math.hypot(dx, dy);
    if (d <= 0.3) {
      Object.assign(pig, { x: pig.tx, y: pig.ty }, pig.mode === 'go' ? { mode: 'eat', face: -1 } : { mode: 'stand', n: span(pig.rng, 8, 20) });
      return;
    }
    pig.x += (dx / d) * Math.min(0.3, d);
    pig.y += (dy / d) * Math.min(0.3, d);
    if (Math.abs(dx) > 0.2) pig.face = dx < 0 ? -1 : 1;
    return;
  }
  if (pig.mode === 'eat') {
    if (stock) trough[stock] -= 1;
    else Object.assign(pig, { mode: 'stand', n: span(pig.rng, 10, 20) });
    return;
  }
  pig.n -= 1;
  if (pig.n > 0) return;
  const roll = pig.rng();
  // A few steps to a place clear of the other pig, if the first tries find one.
  const other = others.find((o) => o !== pig);
  for (let k = 0; roll < 0.4 && k < 4; k += 1) {
    const [tx, ty] = [span(pig.rng, 7, PEN_W - PIG_LEN - 1), span(pig.rng, 6, 10)];
    if (!other || Math.abs(tx - other.x) > 6 || Math.abs(ty - other.y) > 2) return Object.assign(pig, { mode: 'walk', tx, ty });
  }
  if (roll < 0.4) Object.assign(pig, { mode: 'stand', n: span(pig.rng, 6, 14) });
  else if (roll < 0.65) Object.assign(pig, { mode: 'root', n: span(pig.rng, 20, 50) });
  else if (roll < 0.85) Object.assign(pig, { mode: 'stand', n: span(pig.rng, 10, 30) });
  else Object.assign(pig, { mode: 'lie', n: span(pig.rng, 80, 200) });
}
// Its pose this frame: stepping while it walks, the snout going down and up while it roots or eats, lying flat.
function pigPose(pig, still) {
  const t = sc.tick + pig.i * 3;
  if (still) return 'stand';
  if (pig.mode === 'walk' || pig.mode === 'go') return Math.floor(t / 2) % 2 ? 'step' : 'stand';
  if (pig.mode === 'root') return t % 8 < 5 ? 'root' : 'stand';
  if (pig.mode === 'eat') return t % 6 < 4 ? 'root' : 'stand';
  return pig.mode === 'lie' ? 'lie' : 'stand';
}

// Each frame: the well's state for drawProp, and the back of the pen, the trough and the pigs as depth-sorted items
// (drawProp draws the pen's front fence in front of them). Rooting throws up mud and eating drops bits at the snout.
JOB_HOOKS.items.push((items) => {
  const still = scReduced.matches;
  for (const r of sc.realms) {
    if (r.kind !== 'hobbit') continue;
    const P = realmProps(r);
    const st = workRealm(r);
    if (P.well) st.well = wellState(r);
    const pen = P.pen;
    if (!pen) continue;
    farmState(st);
    items.push({ z: pen.y, draw: () => drawPenBack(scG, pen) });
    items.push({ z: pen.y + 4, draw: () => drawTrough(scG, pen, st.trough, sc.tick) });
    for (const pig of st.pigs) {
      if (!still) pigStep(pig, st.trough, st.pigs);
      const x = Math.round(pig.x);
      const left = pen.side > 0 ? pen.x + PEN_W - x - PIG_LEN : pen.x + x;
      const face = pen.side > 0 ? -pig.face : pig.face;
      const y = pen.y + Math.round(pig.y);
      const pose = pigPose(pig, still);
      if (!still && pose === 'root' && sc.tick % 7 === pig.i) {
        const snout = face > 0 ? left + PIG_LEN - 1 : left;
        if (pig.mode === 'eat') spray(snout, y - 1, st.trough.food > 0 ? VEG : ['#8fc3ff', '#cfe6ff'], 1, { up: 0.4, spread: 0.6, life: 3 });
        else spray(snout, y, ['#5a3d24', '#7a5634'], 2, { up: 0.6, spread: 1, life: 3 });
      }
      items.push({ z: y, draw: () => drawPig(scG, pig.i, left, y, face, pose) });
    }
  }
});

// Water falling from a hobbit's bucket as it pours.
JOB_HOOKS.fx.push((a, pose, frame, hand) => {
  if (pose === 'pour' && sc.tick % 2 === 0) spray(hand.x, hand.y, ['#8fc3ff', '#cfe6ff', '#6fb6f0'], 2, { up: 0, spread: 0.5, life: 5, fall: 0.3 });
});
