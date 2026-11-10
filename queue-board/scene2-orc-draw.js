// scene2-orc-draw.js: each frame of the orcs on the map from above (scene2.js): the duels move on (the orc runs in,
// they fight, it falls or fades), the swarm runs, and every orc goes into the depth sort with its shadow; a torch's
// flame flickers live in the orc's hand and glows after dark. A beaten orc lies on its back with its feet where it
// stood, its head away from the worker, and fades. A swarm orc a Sentry rider fights stands in the pose his fight gives.

// An orc at (x, y) facing left, right, up or down, in a pose and frame, alpha a; lying turns it on its back.
function m2eOrcDraw(g, o, pose, frame, a = 1, lying = 0) {
  const side = o.face === 'left' || o.face === 'right';
  const art = m2eOrcFrame(o.kind, side ? 'side' : o.face, pose, frame, o.torch);
  const K = art.K;
  const [x, y] = [Math.round(o.x * 4) / 4, Math.round(o.y * 4) / 4];
  g.globalAlpha = a * 0.32;
  g.drawImage(m2Foot(), x - 4 * K.k, y - 0.25, 8 * K.k, 2.5);
  g.globalAlpha = a;
  g.save();
  g.translate(x, y);
  if (lying) {
    // On its back: a quarter turn about its feet, head away from the side it faced.
    g.rotate((o.face === 'left' ? 1 : -1) * Math.PI / 2);
    g.translate(0, 1);
  } else if (o.face === 'left') g.scale(-1, 1);
  g.drawImage(art.c, -K.FX, -K.FY, K.W, K.H);
  if (o.torch && !lying) m2eTorch(g, art.hand[0] - K.FX, art.hand[1] - K.FY, m2.tick + o.seed);
  g.restore();
  g.globalAlpha = 1;
  if (o.torch && !lying) {
    const hx = o.face === 'left' ? x - (art.hand[0] - K.FX) : x + art.hand[0] - K.FX;
    m2e.lit.push([hx, y + art.hand[1] - K.FY - 3.5]);
  }
}
// A torch held at (x, y): a dark shaft, a pitch-soaked head and a flame of three tongues that flickers.
function m2eTorch(g, x, y, t) {
  const q = (v) => Math.round(v * 4) / 4;
  g.fillStyle = '#3a2412';
  g.fillRect(q(x - 0.25), q(y - 3.5), 0.5, 4.25);
  g.fillStyle = '#5a3a1c';
  g.fillRect(q(x - 0.25), q(y - 3.5), 0.25, 4.25);
  g.fillStyle = '#1e1008';
  g.fillRect(q(x - 0.5), q(y - 4), 1, 0.75);
  y -= 1;
  const f = [0, 1, 2, 1][Math.floor(t / 2) % 4];
  const flame = [['#9a1e0a', -1, 2, 2], ['#e2401a', -0.75, 3 + f * 0.25, 1.5], ['#ff8a1a', -0.5, 2.5 + f * 0.25, 1], ['#ffd23a', -0.25, 1.75 + f * 0.25, 0.5], ['#fff4c0', -0.25, 0.75, 0.5]];
  for (const [c, dx, h, w] of flame) { g.fillStyle = c; g.fillRect(q(x + dx + (f === 2 ? 0.25 : 0)), q(y - 3 - h), w, h); }
}

// One frame of a duel f: moves it on, and adds its orc (and the sparks of its fight) to the depth sort.
function m2eDuelFrame(f, add, reduced) {
  const a = f.a;
  const o = f.o;
  const t = m2.tick - f.t0;
  if (!f.gone) m2ePlace(f, a);
  if (f.hunter && !f.gone && (m2.actors.get(a.key) !== a || a.mood === 'gone')) { m2eLetGo(f); m2e.duels.delete(a.key); o.duel = null; return; }
  if (f.phase === 'come') {
    if (reduced || !m2eRun(o, { x: f.ox, y: f.oy }, 0.9)) Object.assign(f, { phase: 'fight', t0: m2.tick });
    o.state = f.phase;
    add(o.y + 0.1, (g) => m2eOrcDraw(g, o, o.moving ? 'walk' : 'stand', o.moving ? hdWalkFrame(m2.tick + f.seed, 1) : 0), o);
    return;
  }
  // A rider's orc keeps its place by the post and turns to face the rider wherever it rides.
  const rider = a.station?.sentry;
  if (f.phase === 'fight') {
    const p = reduced ? { w: ['work', 1], o: ['stagger', 0], back: 1 } : m2eDuelPose(f, t);
    f.wp = p.w;
    const toward = rider ? (a.x < o.x ? -1 : 1) : -f.side;
    o.face = toward < 0 ? 'left' : 'right';
    o.x = (rider ? f.ox + f.side * 3 : f.ox) - toward * p.back;
    o.y = f.oy;
    o.state = 'fight';
    const mid = [(a.x + o.x) / 2, o.y - (o.kind === 'uruk' ? 14 : 10)];
    if (p.clash) f.spark = { at: m2.tick, x: mid[0], y: mid[1], c: ['#fff6c0', '#ffd23a', '#ff9a3a'] };
    if (p.hit) f.spark = { at: m2.tick, x: o.x - toward * 1.5, y: mid[1] + 2, c: ['#ffffff', '#d83a2a', '#ff9a3a'] };
    add(o.y + 0.1, (g) => {
      m2eOrcDraw(g, o, p.o[0], p.o[1]);
      if (f.spark && !reduced) m2eSparks(g, f.spark.x, f.spark.y, m2.tick - f.spark.at, f.spark.c);
    }, o);
    return;
  }
  if (f.phase === 'fall') {
    if (t > M2E_FALL) { m2eLetGo(f); if (m2e.duels.get(a.key) === f) m2e.duels.delete(a.key); return; }
    const fade = t < 34 ? 1 : 1 - (t - 34) / (M2E_FALL - 34);
    add(o.y + 0.1, (g) => {
      if (t < 4) m2eOrcDraw(g, o, 'stagger', 0);
      else if (t < 9) m2eOrcDraw(g, o, 'fall', 0);
      else m2eOrcDraw(g, o, 'stand', 0, fade, 1);
      if (t < 6 && !reduced) m2eSparks(g, o.x, o.y - 9, t, ['#ffffff', '#d83a2a', '#ff9a3a']);
    }, o);
    return;
  }
  // Fading: the worker ended or left, and the orc melts away where it stood.
  if (t > 20) { m2eLetGo(f); if (m2e.duels.get(a.key) === f) m2e.duels.delete(a.key); if (o.duel === f) o.duel = null; return; }
  add(o.y + 0.1, (g) => m2eOrcDraw(g, o, 'stand', 0, 1 - t / 20), o);
}

// The orcs' part of each frame, in the depth sort.
m2.layers.items.push((add, tick, reduced) => {
  m2e.lit = [];
  const put = (z, draw, o) => {
    const K = M2E_ORC[o.kind];
    const g = m2G;
    add(z, () => draw(g), [o.x - K.W / 2, o.y - K.FY, o.x + K.W / 2, o.y + 1]);
  };
  for (const f of [...m2e.duels.values()]) m2eDuelFrame(f, put, reduced);
  for (const o of m2e.swarm) {
    m2eSwarmStep(o, reduced);
    if (o.duel) continue;
    // One a rider fights takes the pose his charges give it (scene2-rider-fight.js).
    if (o.rider && o.pose) { put(o.y + 0.1, (g) => m2eOrcDraw(g, o, o.pose[0], o.pose[1]), o); continue; }
    const roar = !o.moving && !o.torch && o.id % 3 === 0 && tick % 12 < 5;
    put(o.y + 0.1, (g) => m2eOrcDraw(g, o, o.moving ? 'walk' : roar ? 'attack' : 'stand', o.moving ? hdWalkFrame(tick + o.id, 1) : 0), o);
  }
  m2e.swarm = m2e.swarm.filter((o) => !(o.flee && (o.x < -10 || o.x > m2.W + 10 || o.y < -10 || o.y > m2.H + 26)));
});
// Torches glow, a warm pool round each flame, brighter at night.
m2.layers.light.push((g) => {
  if (!m2e.lit?.length) return;
  const dark = typeof m2Dark === 'function' ? m2Dark(m2.sky?.hour ?? 12)[0] : 0;
  g.globalAlpha = 0.18 + dark * 0.4;
  const glow = m2Glow(6, '#ff8a2a');
  for (const [x, y] of m2e.lit) g.drawImage(glow, x - 6, y - 6, 12, 12);
  g.globalAlpha = 1;
});
