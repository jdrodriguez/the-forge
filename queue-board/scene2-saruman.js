// scene2-saruman.js: Saruman, the seer of the Codex and Grok calls, on the map from above (scene2.js), as the side view
// has him (scene-saruman.js). The owner's sessions hand read-only research to Codex and Grok; the board counts the calls
// running on its own Mac (snap.seer). Saruman stands on the top of Orthanc (plan.places.orthancTop) beside his palantir
// on its black stand. When calls start he walks back to the stone if he was pacing, turns to it and gazes into it, and
// the stone lights over a second, glowing in its engine's colour, the same as the side view's
// stone (M2E_STONE): Codex cold blue, Grok amber, and while both run it shifts slowly between them. The more calls, the
// brighter the stone, the faster its arms of light turn and the wider its light on him; at night it lights his face and
// beard from below and the lit stone shines over the night's shade. A subscription past 80% of its weekly limit
// (snap.services, the account signed in on the board's own Mac) glows dimmer and redder, the more so the nearer it is to
// 100% (scene-saruman.js sarTint). Every 26 seconds he lifts his head from the stone and turns it to look out over the
// map. When the calls end the stone fades over a second and he lingers at the dark stone 25 seconds, so a gap between
// calls doesn't send him off, then turns from it and paces across Orthanc's flat top between its four horns (the tower
// art's, scene2-isengard-orthanc.js), turning at each end, as the side view's dims and then departs (2026-11-09:
// parity). He is v1's own figure (sprites-saruman.js) at the map's 1.3 times. If Saruman also walks the map as a worker
// outside the queue, the figure on the tower stands aside for him and only the stone shows. With reduced motion he stands
// at the stone while calls run (and 25 seconds after), its glow steady. His tag and the click that opens the Machines
// view are scene2-saruman-tag.js.

const M2E_SAR_STAY = 25000;
const m2eSar = { key: '', top: null, seen: 0, last: null, x: 0, dir: 1, mode: 'pace', glow: 0, started: false, rkey: '', now: null, look: null };
const M2E_STONE = { codex: ['#3d6ea6', '#9fd4ff', '#eaf7ff'], grok: ['#9a5a1e', '#ffb35c', '#fff0cf'] };
const M2E_SAR_K = typeof M2V_K === 'number' ? M2V_K : 1.6;

// The tower's flat top for this layout (plan.places.orthancTop, the centre of the top Orthanc's art builds with four
// horns round it), and the depth he sorts at: just in front of the tower, which meets the ground below the top.
function m2eSarTop() {
  if (m2eSar.key === m2.key) return m2eSar.top;
  const P = m2.plan.places;
  const t = P.orthancTop;
  const below = typeof M2_ORTH !== 'undefined' ? M2_ORTH.body + M2_ORTH.top / 2 : 28;
  const top = t ? { x: t.x, y: t.y, z: t.y + below + 0.2 } : null;
  // He starts at his place by the stone, inside the walk he paces.
  Object.assign(m2eSar, { key: m2.key, top, x: (top?.x ?? 0) - 3 * M2E_SAR_K });
  return top;
}
// What the snapshot says, read again when it changes (and every 30 seconds): the calls running for each engine, and how
// far into its weekly limit each engine's subscription on this Mac is, from the account signed in on the board's own
// machine, or any account of that engine's when none is (the side view's sarRead).
function m2eSarRead() {
  const s0 = m2.snap ?? snap;
  const key = `${s0?.generatedAt}|${Math.floor(Date.now() / 30000)}`;
  if (m2eSar.rkey === key && m2eSar.now) return m2eSar.now;
  m2eSar.rkey = key;
  const s = s0?.seer;
  const live = s && Date.now() - s.at < 180000;
  const used = (name) => {
    const rows = (s0?.services ?? []).filter((v) => String(v.name).toLowerCase() === name && !v.error);
    const here = rows.filter((v) => v.machines?.includes(s0.servedBy));
    return Math.max(0, ...(here.length ? here : rows).map((v) => (v.limited ? 100 : (v.weekly ?? v.period)?.used ?? 0)));
  };
  m2eSar.now = { codex: live ? s.codex?.length ?? 0 : 0, grok: live ? s.grok?.length ?? 0 : 0, use: { codex: used('codex'), grok: used('grok') } };
  return m2eSar.now;
}
// An engine's [deep, glow, core] and brightness by its plan's use (the side view's own sarTint).
const m2eSarTint = (name, use) => (typeof sarTint === 'function' ? sarTint(name, use) : { c: M2E_STONE[name], b: 1 });

// One step of his day: pacing, walking back to the stone, or at it. The stone lights over a second once he is at it and
// fades over a second when the calls end; he stays 25 seconds after the last call, then goes back to his pacing. A page
// opened while calls run finds him already at the lit stone.
function m2eSarStep(n, home, reduced) {
  const S = m2eSar;
  if (n > 0) Object.assign(S, { seen: Date.now(), last: S.now });
  const want = n > 0 || Date.now() - S.seen < M2E_SAR_STAY;
  if (!S.started || reduced) {
    S.started = true;
    Object.assign(S, want ? { mode: 'gaze', x: home, glow: n > 0 ? 1 : 0 } : { mode: 'pace' });
    if (reduced && !want) S.x = home;
    return;
  }
  if (want && S.mode === 'pace') S.mode = 'come';
  if (S.mode === 'come') {
    S.dir = home > S.x ? 1 : -1;
    S.x += S.dir * Math.min(0.2, Math.abs(home - S.x));
    if (Math.abs(home - S.x) < 0.01) S.mode = 'gaze';
  }
  S.glow = Math.max(0, Math.min(1, S.glow + (n > 0 && S.mode === 'gaze' ? 0.1 : -0.1)));
  if (S.mode === 'gaze' && !want && S.glow <= 0) Object.assign(S, { mode: 'pace', dir: -1 });
  if (S.mode === 'pace') {
    // Pacing west of the stone, turning at each end to face back into the walk, so wherever he is he heads into it and
    // never turns round on the spot.
    S.x += S.dir * 0.1;
    if (S.x > home + 1) S.dir = -1;
    else if (S.x < home - 5) S.dir = 1;
  }
}
// His pose: walking (facing the way he goes), or at the stone with his head bowed into it, every 26 seconds lifting it
// and turning it slowly to look out over the map for two and a half seconds (the side view's sarPose).
function m2eSarPose(tick, reduced) {
  const S = m2eSar;
  // With reduced motion nobody walks: he stands by the dark stone, his head up.
  if (reduced) return ['gaze', S.mode === 'gaze' ? 'down' : 'level', 1];
  if (S.mode !== 'gaze') return ['walk', hdWalkFrame(tick, 2), S.dir > 0 ? 1 : -1];
  const t = (tick + 97) % 260;
  return ['gaze', t < 6 || (t >= 31 && t < 37) ? 'level' : t < 31 ? 'front' : 'down', 1];
}
// The stone's look this tick, or null while it is dark: each engine's colour (tinted by its plan's use), the glow
// shifting between them every eight seconds while both run (held on the one with more calls with reduced motion), how
// bright, and how far round its arms of light have turned.
function m2eSarLook(tick, reduced) {
  const S = m2eSar;
  const now = S.now && S.now.codex + S.now.grok ? S.now : S.last;
  const n = now ? now.codex + now.grok : 0;
  if (!n || S.glow <= 0) return null;
  const level = n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
  const A = m2eSarTint(now.codex ? 'codex' : 'grok', now.use[now.codex ? 'codex' : 'grok']);
  const B = now.codex && now.grok ? m2eSarTint('grok', now.use.grok) : null;
  const w = !B ? 0 : reduced ? Number(now.grok > now.codex) : Math.max(0, Math.min(1, 0.5 - 1.6 * Math.cos((tick * Math.PI) / 40)));
  const dim = B ? A.b + (B.b - A.b) * w : A.b;
  const T = B ? A.c.map((c, k) => hdMix(c, B.c[k], w)) : A.c;
  return { a: A.c, b: B?.c ?? null, w, level, n, T, dim, turn: reduced ? 0 : Math.floor(tick * [0, 0.3, 0.45, 0.65, 0.9][level]) % 16,
    glow: B ? hdMix(A.c[1], B.c[1], Math.round(w * 8) / 8) : A.c[1], bright: [0, 0.62, 0.76, 0.9, 1][level] * dim * S.glow };
}

// Saruman and his stone, in the depth sort just in front of the tower: v1's own (sprites-saruman.js's drawSaruman, and
// sprites-saruman-stone.js's pedestal and stone) at M2V_K times v1's size, his stone on its pedestal beside him to the
// east, drawn dark here; the lit stone is drawn over the night's shade below.
m2.layers.items.push((add, tick, reduced) => {
  if (!m2.plan) return;
  const top = m2eSarTop();
  if (!top) return;
  const S = m2eSar;
  const K = M2E_SAR_K;
  const v1 = typeof drawSaruman === 'function' && typeof SC_RES !== 'undefined';
  // He gazes from 6 v1 units west of the stone, as v1 has him; the pair stands centred on the platform.
  const home = top.x - 3 * K;
  const stone = { x: home + 6 * K, y: top.y - 0.6 };
  S.home = home;
  S.feet = stone.y;
  S.stone = { x: stone.x, y: stone.y - (v1 ? SAR_STONE_UP * K : 15) };
  const now = m2eSarRead();
  m2eSarStep(now.codex + now.grok, home, reduced);
  S.look = m2eSarLook(tick, reduced);
  const pose = m2eSarPose(tick, reduced);
  S.pose = pose;
  // Only Saruman himself walking the map as a wanderer outside the queue sends the figure on the tower aside; a queue or
  // engine worker that happens to bear the name never does.
  S.away = [...m2.actors.values()].some((a) => a.t?.adhoc && /saruman/i.test(a.name));
  add(top.z, () => {
    const g = m2G;
    const q = (v) => Math.round(v * 4) / 4;
    if (!v1) return;
    const phase = reduced ? 0 : Math.floor(tick / (pose[0] === 'walk' ? 2 : 5)) % 12;
    g.save();
    g.imageSmoothingEnabled = false;
    g.translate(q(S.x), q(stone.y));
    g.scale(K, K);
    if (!S.away) drawSaruman(g, 0, 0, pose[0], pose[1], phase, pose[2]);
    g.restore();
    g.save();
    g.imageSmoothingEnabled = false;
    g.translate(q(stone.x), q(stone.y));
    g.scale(K, K);
    drawSarPedestal(g, 0, 0);
    drawSarStone(g, 0, -SAR_STONE_UP, null);
    g.restore();
  }, [top.x - 10, top.y - 32, top.x + 12, top.y + 8]);
});
// The stone's light, after the night's shade: a glow round it and over him, brighter and wider the more calls run and
// dimmer as a plan nears its limit; at night its light on his face, beard and hands; and the lit stone itself.
m2.layers.light.push((g, tick) => {
  const S = m2eSar;
  const L = S.look;
  if (!S.top || !L || !S.stone) return;
  const n = L.n;
  const r = 3.5 + Math.min(4, n * 0.8);
  const k = L.dim * S.glow;
  const st = S.stone;
  g.globalAlpha = (0.3 + Math.min(0.25, n * 0.05) + 0.06 * Math.sin(tick * 0.25)) * k;
  // Round the stone, and up over his face and beard as he looks down into it.
  g.drawImage(m2Glow(8, L.T[1]), st.x - r, st.y - r, r * 2, r * 2);
  g.globalAlpha = (0.16 + Math.min(0.12, n * 0.03)) * k;
  g.drawImage(m2Glow(6, L.T[1]), st.x - 6, st.y - 9, 7, 7);
  g.globalAlpha = 0.5 * k;
  g.drawImage(m2Glow(3, L.T[2]), st.x - 1.5, st.y - 1.5, 3, 3);
  g.globalAlpha = 1;
  if (typeof drawSarLit !== 'function') return;
  const night = typeof m2Dark === 'function' ? m2Dark(m2.sky?.hour ?? 12)[0] : 0;
  const q = (v) => Math.round(v * 4) / 4;
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(q(S.x), q(S.feet));
  g.scale(M2E_SAR_K, M2E_SAR_K);
  if (S.mode === 'gaze' && !S.away) drawSarLit(g, 0, 0, 'gaze', S.pose?.[1] ?? 'down', L.glow, L.bright * (0.3 + 0.5 * night));
  g.restore();
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(q(st.x), q(S.feet));
  g.scale(M2E_SAR_K, M2E_SAR_K);
  g.globalAlpha = Math.min(1, S.glow * 1.5);
  drawSarStone(g, 0, -SAR_STONE_UP, L);
  g.restore();
});
