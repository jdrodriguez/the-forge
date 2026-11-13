// scene-rohan.js: the Men of Rohan's rounds in the Middle-earth view (scene.js). Their jobs join the sack haul in
// scene-work.js through scene-jobs.js's workAdd, with the same seeded choice and the same one-worker-per-place rule:
// sword drill at the straw man in the training yard (cuts, a lunge and a guard, three times over, straw flying and the
// straw man shaking at each hit); carrying water from the basin at the foot of Meduseld's stair to the paddock's
// trough and pouring it in; forking an armful of hay from the stables' bay to the trough; and leading a horse from the
// paddock's gate to the stables on a lead rope, grooming it there tied to the hitching post, and leading it back. Their
// station is the shield (sprites-rohan.js), worked with a hammer, chips of wood, paint or gold flying at each blow.
// The paddock's horses are scene-rohan-horses.js's; a leading job tells its horse what to do through its steps' horse
// marks (call, lead, tie) and h, the horse's number. Loaded after scene-wild.js.

workAdd('man', (a, P, st, rng) => {
  const r = a.realm;
  const jobs = [];
  if (P.dummy) {
    const s = P.dummy.spot;
    const cut = () => ({ pose: 'work', tool: 'sword', n: span(rng, 12, 24), anim: swing(2), face: s.face, drill: true });
    const lunge = { pose: 'lunge', tool: 'sword', n: 6, face: s.face, drill: true };
    const guard = { pose: 'block', tool: 'sword', n: 5, face: s.face };
    jobs.push({ w: 2, spot: 'dummy', steps: [{ go: s, claim: true }, cut(), lunge, guard, cut(), lunge, guard, cut(), lunge] });
  }
  const pad = P.paddock;
  if (!pad) return jobs;
  const herd = rohanHerd(r, P, st);
  const trough = pad.water;
  const fill = (what) => (b) => { b.carry = null; st.trough.hay = 0; st.trough.water = 0; st.trough[what] = ROHAN_FEED; };
  jobs.push({ w: 2, spot: 'basin', steps: [
    { go: P.basin, claim: true },
    { pose: 'bend', n: span(rng, 20, 30), anim: alt(4), face: P.basin.face, fn: (b) => { b.carry = 'bucket'; } },
    ...workWay(r, P.basin, trough),
    { go: trough, claim: true },
    { pose: 'pour', tool: 'bucket', n: 16, anim: alt(4), face: trough.face, at: 6, fn: fill('water') },
  ] });
  jobs.push({ w: 2, spot: 'hay', steps: [
    { go: P.hay, claim: true },
    { pose: 'bend', n: span(rng, 24, 36), anim: alt(4), face: P.hay.face, fn: (b) => { b.carry = 'hay'; } },
    ...workWay(r, P.hay, trough),
    { go: trough, claim: true },
    { pose: 'tip', tool: 'hay', n: 10, anim: then(4), face: trough.face, at: 4, fn: fill('hay') },
  ] });
  const free = sc.war ? [] : herd.horses.filter(rohanLoose);
  if (free.length) {
    const h = free[span(rng, 0, free.length - 1)].i;
    const lead = (steps) => steps.map((s) => ({ ...s, horse: 'lead', h }));
    const { gate } = pad;
    const hold = (n, horse, fn) => ({ pose: 'tip', n, anim: () => 0, face: horse === 'call' ? gate.face : P.groom.face, horse, h, at: n - 1, fn });
    jobs.push({ w: 2, spot: 'lead', steps: [
      { go: gate, claim: true },
      hold(30, 'call', (b) => { b.carry = 'lead'; }),
      ...lead([...workWay(r, gate, P.groom), { go: P.groom, claim: true }]),
      hold(6, 'tie', (b) => { b.carry = null; }),
      { pose: 'groom', n: span(rng, 60, 100), anim: alt(3), face: P.groom.face, horse: 'tie', h },
      hold(6, 'tie', (b) => { b.carry = 'lead'; }),
      ...lead([...workWay(r, P.groom, gate), { go: gate }]),
      { pose: 'tip', n: 8, anim: then(4), face: gate.face, at: 4, fn: (b) => { b.carry = null; } },
    ] });
  }
  return jobs;
});

// The colours that fly from the shield at a hammer blow, by its stage: wood chips, green paint and white, green and
// red, and gold.
const ROHAN_CHIPS = [null, ['#cf9a62', '#a8703f', '#74462a'], ['#5aa64e', '#fbf8ee', '#3f8a3a'], ['#5aa64e', '#e0453a', '#fbf8ee'], ['#fff0a2', '#ecc85a', '#ffffff']];
const ROHAN_STRAW_FX = ['#e8d48a', '#c9ad5a', '#a8863a'];

// Particles at a Man's hand, and where his lead rope starts: chips off the shield at each blow, straw off the straw man
// (which shakes) at each cut and lunge, hay as he tips it, and a little dust while he grooms.
JOB_HOOKS.fx.push((a, pose, frame, hand, changed) => {
  if (a.kind !== 'man' || a.mounted) return;
  if (a.carry === 'lead') a.leadHand = { dx: hand.x - a.x, dy: hand.y - a.y };
  const fwd = a.face < 0 ? -1 : 1;
  const s = a.job?.steps[a.job.i];
  const tool = a.act?.[2];
  const hit = (pose === 'work' && frame === 1 && changed) || (pose === 'lunge' && changed);
  if (hit && s?.drill) {
    workRealm(a.realm).dummyHit = sc.tick;
    spray(hand.x + 3 * fwd, hand.y + 1, ROHAN_STRAW_FX, 3, { up: 0.6, spread: 1.4, life: 5 });
  } else if (pose === 'work' && frame === 1 && changed && !tool && ROHAN_CHIPS[a.stage]) {
    spray(hand.x + 3 * fwd, hand.y + 1, ROHAN_CHIPS[a.stage], 2, { up: 0.8, spread: 1.2, life: 4 });
  }
  if (pose === 'tip' && tool === 'hay' && frame === 1 && changed) spray(hand.x + 2 * fwd, hand.y + 1, ROHAN_STRAW_FX, 4, { up: 0.3, spread: 0.9, life: 5 });
  if (pose === 'groom' && sc.tick % 6 === 0) spray(hand.x, hand.y, ['#c8b48a', '#a8966c'], 1, { up: 0.2, spread: 0.6, life: 6, fall: 0.02 });
});
