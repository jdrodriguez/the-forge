// scene-rohan-horses.js: the horses of Rohan's paddock in the Middle-earth view (scene.js). Two horses, or three in a
// wide paddock, graze, look up, stand swishing and walk about inside its fence, each by its own seeded generator. When
// a Man fills the trough with water or hay they come to it and drink or eat it down. A Man going to lead one (a job in
// scene-rohan.js marked with horse steps) calls it to the gate, and it follows him on a lead rope, a few paces behind,
// out to the stables, where it stands tied at the hitching post while he grooms it, and back; let go at the gate, it
// walks back in. While main is red (sc.war) they bolt at a gallop off the nearer edge of the world and come back once
// it clears. With reduced motion they stand still. The paddock, trough and hitching post are scenery-rohan-props.js's
// and scenery-rohan-stables.js's, the horse sprites-rohan.js's drawLooseHorse. Loaded after scene-rohan.js.

// The herd, kept in the realm's tally (scene-work.js's workRealm) and made again when the paddock moves. Each horse has
// its place (x its middle, y its hooves), the way it faces, what it is doing (mode, with n ticks left or a target tx,
// ty), its coat and its generator.
function rohanHerd(r, P, st) {
  const p = P.paddock;
  st.trough ??= { hay: 0, water: 0 };
  if (st.herd?.key === P.key) return st.herd;
  const I = p.inside;
  const n = p.w >= 58 ? 3 : 2;
  const horses = Array.from({ length: n }, (_, i) => ({ i, coat: [0, 2, 1][i], x: I.x0 + ((I.x1 - I.x0) * (i + 0.5)) / n, y: I.y0 + ((i * 4) % (I.y1 - I.y0 + 1)),
    face: i % 2 ? -1 : 1, mode: 'graze', n: 30 + i * 45, rng: workRng(5150 + i) }));
  st.herd = { key: P.key, horses, open: false };
  return st.herd;
}
// Whether a horse is in its paddock and free to be called or come to the trough.
const rohanLoose = (h) => ['stand', 'graze', 'walk', 'look'].includes(h.mode);
// Where a horse stands to drink or eat at the trough: behind it with its head down over it.
const rohanSlot = (p, k) => ({ x: p.trough.x - 5 - k * 2.5, y: p.trough.y - 1 - k * 2.75 });

// One frame of a horse: bolting and staying away while main is red, coming back after; following a Man's lead; going to
// the trough while it holds anything; otherwise grazing, looking up, standing and taking a few steps about the paddock.
function rohanHorseStep(h, r, P, st, herd) {
  const p = P.paddock;
  const I = p.inside;
  const go = (tx, ty, v) => { h.moving = !wildMove(h, tx, ty, v); return !h.moving; };
  h.moving = false;
  if (sc.war > 0.3 && h.mode !== 'gone') {
    h.mode = go(r.x0 + r.w / 2 < sc.W / 2 ? -16 : sc.W + 16, h.y, 2.2) ? 'gone' : 'bolt';
    return;
  }
  if (h.mode === 'gone' || h.mode === 'bolt') {
    if (sc.war > 0.3) return;
    Object.assign(h, { mode: 'back', tx: I.x0 + ((I.x1 - I.x0) * (h.i + 0.5)) / herd.horses.length, ty: I.y0 + h.i * 2 });
  }
  // A Man's lead: called to the gate, following him, or tied at the stables; let go (or his round dropped), it goes home.
  const led = workDoing(r, (s) => s.horse && s.h === h.i);
  const want = led?.s.horse;
  if (want) {
    h.leader = led.b;
    if (want === 'call') { h.mode = 'call'; if (go(I.x1, p.gate.y, 0.5)) h.face = 1; return; }
    if (want === 'tie') { h.mode = 'tied'; if (go(P.tie.x, P.tie.y, 0.6)) h.face = 1; return; }
    h.mode = 'led';
    const L = h.leader;
    const d = Math.hypot(L.x - h.x, (L.y - h.y) * 2.2);
    if (d > 13) go(h.x + ((L.x - h.x) * (d - 13)) / d, h.y + ((L.y - h.y) * (d - 13)) / d, 0.9);
    else if (Math.abs(L.x - h.x) > 1) h.face = L.x < h.x ? -1 : 1;
    return;
  }
  if (h.leader || h.mode === 'call') Object.assign(h, { leader: null, mode: h.x < p.x + p.w - 2 && h.y >= p.y + 4 ? 'look' : 'home', n: 20 });
  // Home is through the gate: to just outside it, then in.
  if (h.mode === 'home' && go(p.gate.x, p.gate.y, 0.5)) Object.assign(h, { mode: 'back', tx: I.x1, ty: p.gate.y });
  if (h.mode === 'home') return;
  if (h.mode === 'back') {
    if (go(h.tx, h.ty, 0.6)) Object.assign(h, { mode: 'look', n: span(h.rng, 10, 30), tx: null, ty: null });
    return;
  }
  const { trough } = st;
  if ((trough.hay > 0 || trough.water > 0) && (rohanLoose(h) || h.mode === 'trough')) {
    // Two places at the trough; a third horse waits its turn.
    if (h.mode !== 'trough') {
      const used = herd.horses.filter((o) => o.mode === 'trough' || o.mode === 'eat').map((o) => o.slot);
      const k = [0, 1].find((q) => !used.includes(q));
      if (k === undefined) return;
      Object.assign(h, { mode: 'trough', slot: k });
    }
    const slot = rohanSlot(p, h.slot);
    if (go(slot.x, slot.y, 0.4)) Object.assign(h, { mode: 'eat', face: 1 });
    return;
  }
  if (h.mode === 'eat') {
    if (trough.hay > 0) trough.hay -= 1;
    else if (trough.water > 0) trough.water -= 1;
    else Object.assign(h, { mode: 'look', n: span(h.rng, 10, 30) });
    return;
  }
  if (h.mode === 'walk') {
    if (go(h.tx, h.ty, 0.3)) Object.assign(h, { mode: 'graze', n: span(h.rng, 30, 80) });
    return;
  }
  h.n -= 1;
  if (h.n > 0) return;
  const roll = h.rng();
  if (roll < 0.35) {
    // A few steps to a place clear of the other horses, if one of four tries finds one.
    for (let k = 0; k < 4; k += 1) {
      const [tx, ty] = [span(h.rng, Math.ceil(I.x0), Math.floor(I.x1)), span(h.rng, Math.ceil(I.y0), Math.floor(I.y1))];
      if (herd.horses.every((o) => o === h || Math.abs(o.x - tx) > 9 || Math.abs(o.y - ty) > 2.5)) return Object.assign(h, { mode: 'walk', tx, ty });
    }
  }
  if (roll < 0.7) Object.assign(h, { mode: 'graze', n: span(h.rng, 40, 120) });
  else if (roll < 0.85) Object.assign(h, { mode: 'look', n: span(h.rng, 15, 40) });
  else Object.assign(h, { mode: 'stand', n: span(h.rng, 20, 50) });
}
// Its gait this frame: a gallop while it bolts, walking while it moves, head down while it grazes or eats.
function rohanGait(h, still) {
  const t = sc.tick + h.i * 5;
  if (still) return ['stand', 0];
  if (h.mode === 'bolt') return ['gallop', sc.tick % 4];
  if (h.moving) return ['walk', Math.floor(t / 2) % 4];
  if (h.mode === 'graze' || h.mode === 'eat') return ['graze', Math.floor(t / 8) % 2];
  return ['stand', 0];
}

// Draws a horse, mirrored about its own column when it faces west, and keeps where its mouth is for a rope.
function rohanHorseDraw(h, gait, frame) {
  const X = Math.round(h.x);
  const y = Math.round(h.y * 4) / 4;
  scG.save();
  if (h.face < 0) { scG.translate(2 * X + 1, 0); scG.scale(-1, 1); }
  const head = drawLooseHorse(scG, X, y, gait, frame, h.coat);
  scG.restore();
  const mx = X + head.mouth[0] / 4;
  h.mouth = [h.face < 0 ? 2 * X + 1 - mx : mx, y + head.mouth[1] / 4];
}
// A rope that sags between two points, a quarter unit thick, dark under a lit strand.
function rohanRope(g, [x0, y0], [x1, y1]) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
  const sag = Math.min(2, Math.hypot(x1 - x0, y1 - y0) * 0.12);
  for (let k = 0; k <= n; k += 1) {
    const t = k / n;
    const [x, y] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)];
    qdDot(g, Math.round(x * 4) / 4, Math.round(y * 4) / 4, k % 3 ? '#6e4f2c' : '#b08a58');
  }
}

// Each frame: the paddock's back fence, its trough, the horses and any lead rope as depth-sorted items.
JOB_HOOKS.items.push((items) => {
  const still = scReduced.matches;
  for (const r of sc.realms) {
    if (r.kind !== 'man') continue;
    const P = realmProps(r);
    const p = P.paddock;
    if (!p) continue;
    const st = workRealm(r);
    const herd = rohanHerd(r, P, st);
    herd.open = herd.horses.some((h) => ['call', 'led', 'tied', 'home'].includes(h.mode));
    items.push({ z: p.y + 4, draw: () => rohanPaddockBack(scG, p, herd.open) });
    items.push({ z: p.trough.y, draw: () => rohanTrough(scG, p, st.trough) });
    for (const h of herd.horses) {
      if (!still) rohanHorseStep(h, r, P, st, herd);
      if (h.mode === 'gone' || (still && sc.war)) continue;
      const [gait, frame] = rohanGait(h, still);
      items.push({ z: h.y, draw: () => rohanHorseDraw(h, gait, frame) });
      const L = h.leader;
      if (h.mode === 'led' && L?.carry === 'lead' && L.leadHand) {
        items.push({ z: Math.max(h.y, L.y) + 0.1, draw: () => h.mouth && rohanRope(scG, [L.x + L.leadHand.dx, L.y + L.leadHand.dy], h.mouth) });
      } else if (h.mode === 'tied' && Math.hypot(h.x - P.tie.x, h.y - P.tie.y) < 0.5) {
        items.push({ z: h.y + 0.1, draw: () => h.mouth && rohanRope(scG, h.mouth, [P.tie.post + 0.25, GROUND_Y + 2.25]) });
      }
    }
  }
});
