// scene-saruman.js: Saruman, the seer of the Codex and Grok calls, in the Middle-earth view (scene.js). The owner's sessions
// hand read-only research to two outside AIs, Codex and Grok, through ext-agent.sh; the board counts the calls running on
// its own Mac every 15 seconds (ext-runs.mjs, snap.seer). While any runs, Saruman stands at his palantír on its dark stone
// pedestal at the far west end of the road (Isengard lies west), at the road's near edge, clear of every realm's
// stations, props and landmarks, the eagles' crags at the road's back edge and Gollum's places. He leans over the stone
// with his hands held over it and gazes into it, and now and then slowly lifts his head and turns it to look out of the
// scene. The stone glows in each engine's colour, (SAR_FALLBACK_TINT):
// Codex cold blue, Grok amber, and while both run the glow shifts slowly from one to the other with the
// other's colour in the arms of light turning inside it. The more calls run, the brighter the stone, the faster its arms
// turn, and the wider its light on his face, beard, hands and robe; at night it lights his face from below and casts a
// pool on the road. A subscription past 80% of its weekly limit (snap.services, the account signed in on the board's
// Mac) glows dimmer and redder, the more so the nearer it is to 100%. When no call has run for 25 seconds the stone dims
// and he turns and walks off the west edge; the pedestal stays, its stone dark. A tag beside him counts the calls
// ("Saruman · 5 Codex · 5 Grok"); clicking him or it opens the Fleet view. Walkers on the ground go round his pedestal
// (sc.path.extra). With reduced motion he simply stands at the stone while calls run, its glow steady. The art is
// sprites-saruman.js and sprites-saruman-stone.js. Uses scene.js's sc, scG, scStage, scCanvas, scHit and scReduced,
// scene-call.js's callEnvoyAt, and page.html's snap, applyView and esc.
const SAR_X = 7;
const SAR_Y = SCENE_H - 3;
const SAR_OUT = -7;
const SAR_STAY_MS = 25000;
// A count of calls older than this (the board stopped answering) counts as none.
const SAR_STALE_MS = 180000;
const SAR_SPEED = 0.3;
const SAR_FALLBACK_TINT = { codex: ['#3d6ea6', '#9fd4ff', '#eaf7ff'], grok: ['#9a5a1e', '#ffb35c', '#fff0cf'] };
const sar = { x: SAR_OUT, mode: 'away', seen: 0, glow: 0, started: false, key: '', now: null, last: null, tag: '' };

// What the snapshot says, worked out again when it changes: the calls running for each engine, and how far past 80% of
// its weekly limit each engine's subscription on this Mac is (0 to 1), from the account signed in on the board's own
// machine, or any account of that engine's when none is.
function sarRead() {
  const key = `${snap?.generatedAt}|${Math.floor(Date.now() / 30000)}`;
  if (sar.key === key) return sar.now;
  sar.key = key;
  const s = snap?.seer;
  const live = s && Date.now() - s.at < SAR_STALE_MS;
  const used = (name) => {
    const rows = (snap?.services ?? []).filter((v) => String(v.name).toLowerCase() === name && !v.error);
    const here = rows.filter((v) => v.machines?.includes(snap.servedBy));
    return Math.max(0, ...(here.length ? here : rows).map((v) => (v.limited ? 100 : (v.weekly ?? v.period)?.used ?? 0)));
  };
  sar.now = { codex: live ? s.codex?.length ?? 0 : 0, grok: live ? s.grok?.length ?? 0 : 0, use: { codex: used('codex'), grok: used('grok') } };
  return sar.now;
}
// An engine's [deep, glow, core] and its brightness (1 at 80% or under, down to 0.55 at 100%), redder past 80%.
function sarTint(name, use) {
  const base = SAR_FALLBACK_TINT[name];
  const f = Math.max(0, Math.min(1, (use - 80) / 20)) ** 0.6;
  if (!f) return { c: base, b: 1 };
  return { c: [hdMix(base[0], '#5c1610', 0.6 * f), hdMix(base[1], '#d0442c', 0.65 * f), hdMix(base[2], '#f08a70', 0.6 * f)], b: 1 - 0.45 * f };
}

// One step of his day: away, walking in, at the stone, or walking off. The stone lights over a second once he is at it
// and fades over a second when the calls end; he lingers at the dark stone 25 seconds after the last call, so a gap
// between calls doesn't send him off, then turns and goes. A page opened while calls run finds him already there.
function sarStep(n) {
  if (!snap) return;
  if (n > 0) Object.assign(sar, { seen: Date.now(), last: sar.now });
  const want = n > 0 || Date.now() - sar.seen < SAR_STAY_MS;
  if (!sar.started || scReduced.matches) {
    sar.started = true;
    Object.assign(sar, want ? { mode: 'gaze', x: SAR_X, glow: n > 0 ? 1 : 0 } : { mode: 'away', x: SAR_OUT, glow: 0 });
    return;
  }
  sar.glow = Math.max(0, Math.min(1, sar.glow + (n > 0 && sar.mode === 'gaze' ? 0.1 : -0.1)));
  if ((sar.mode === 'away' || sar.mode === 'go') && want) sar.mode = 'come';
  if (sar.mode === 'gaze' && !want && sar.glow <= 0) sar.mode = 'go';
  if (sar.mode === 'come') {
    sar.x = Math.min(SAR_X, sar.x + SAR_SPEED);
    if (sar.x >= SAR_X) sar.mode = 'gaze';
  } else if (sar.mode === 'go') {
    sar.x -= SAR_SPEED;
    if (sar.x <= SAR_OUT) Object.assign(sar, { mode: 'away', x: SAR_OUT });
  }
}
// His pose: walking (facing the way he goes), or at the stone with his head bowed into it, every 26 seconds lifting it
// and turning it slowly to look out of the scene for two and a half seconds.
function sarPose() {
  if (sar.mode === 'come' || sar.mode === 'go') return ['walk', hdWalkFrame(sc.tick, 3), sar.mode === 'go' ? -1 : 1];
  if (scReduced.matches) return ['gaze', 'down', 1];
  const t = (sc.tick + 97) % 260;
  return ['gaze', t < 6 || (t >= 31 && t < 37) ? 'level' : t < 31 ? 'front' : 'down', 1];
}
// The stone's look this frame, or null while it is dark: each engine's colour, the glow shifting between them every
// eight seconds while both run, resting on each and crossing quickly (with reduced motion, held on the one with more
// calls), how bright (by the number of calls, dimmed past 80%) and how far round its arms of light have turned (faster
// with more calls).
function sarLook(seen) {
  const now = seen.codex + seen.grok ? seen : sar.last;
  const n = now ? now.codex + now.grok : 0;
  if (!n || sar.glow <= 0) return null;
  const still = scReduced.matches;
  const level = n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
  const A = sarTint(now.codex ? 'codex' : 'grok', now.use[now.codex ? 'codex' : 'grok']);
  const B = now.codex && now.grok ? sarTint('grok', now.use.grok) : null;
  const w = !B ? 0 : still ? Number(now.grok > now.codex) : Math.max(0, Math.min(1, 0.5 - 1.6 * Math.cos((sc.tick * Math.PI) / 40)));
  const dim = B ? A.b + (B.b - A.b) * w : A.b;
  const turn = still ? 0 : Math.floor(sc.tick * [0, 0.3, 0.45, 0.65, 0.9][level]) % 16;
  const glowC = B ? hdMix(A.c[1], B.c[1], Math.round(w * 8) / 8) : A.c[1];
  return { a: A.c, b: B?.c ?? null, w, level, turn, glow: glowC, bright: [0, 0.62, 0.76, 0.9, 1][level] * dim * sar.glow };
}

// Him, his pedestal and the stone, depth-sorted at his feet in front of everyone on the road.
function sarItems(list) {
  const now = sarRead();
  sarStep(now.codex + now.grok);
  sar.look = sarLook(now);
  const g = scG;
  list.push({ z: SAR_Y, draw: () => {
    if (sar.mode !== 'away') {
      const [pose, k, face] = sarPose();
      const phase = scReduced.matches ? 0 : Math.floor(sc.tick / (pose === 'walk' ? 2 : 5)) % 12;
      drawSaruman(g, Math.round(sar.x * 4) / 4, SAR_Y, pose, k, phase, face);
      sar.pose = [pose, k];
    }
    drawSarPedestal(g, SAR_X + 6, SAR_Y);
    drawSarStone(g, SAR_X + 6, SAR_Y - SAR_STONE_UP, null);
  } });
}
// The light, after the night shade: the stone's halo, at night its pool on the road, its light on him, and the lit
// stone itself over the shade.
function sarLight(g) {
  const L = sar.look;
  sarTag();
  if (!L) return;
  const night = sc.glow?.night ?? (sc.sky.night ? 1 : 0);
  const [sx, sy] = [SAR_X + 6, SAR_Y - SAR_STONE_UP];
  drawSarHalo(g, sx, sy, 3 + L.level, 3 + L.level, L.glow, L.bright * (0.2 + 0.45 * night));
  if (night > 0) drawSarHalo(g, sx - 1.5, SAR_Y, 5 + L.level, 1.6 + 0.3 * L.level, L.glow, 0.45 * L.bright * night);
  if (sar.mode === 'gaze') drawSarLit(g, SAR_X, SAR_Y, 'gaze', sar.pose?.[1] ?? 'down', L.glow, L.bright * (0.3 + 0.5 * night));
  drawSarStone(g, sx, sy, L);
}

// His tag, HTML over the canvas like the eagles' names: on the road beside his pedestal, or over his head when a name
// is already there.
scStage.insertAdjacentHTML('beforeend', '<div class="sc-tags sc-seer"></div>');
const sarTags = scStage.querySelector('.sc-seer');
function sarTag() {
  const now = sar.now;
  const show = now && sar.mode === 'gaze' && now.codex + now.grok > 0;
  if (!show) { if (sar.tag) sarTags.innerHTML = sar.tag = ''; return; }
  // His tag counts the calls under each engine's mark (ai-marks.js); the tooltip keeps the words.
  const text = [esc('Saruman'), now.codex && `${now.codex} ${aiMark('codex')}`, now.grok && `${now.grok} ${aiMark('grok')}`].filter(Boolean).join(' · ');
  const title = `The palantír: ${[now.codex && `${now.codex} Codex`, now.grok && `${now.grok} Grok`].filter(Boolean).join(' and ')} call${now.codex + now.grok > 1 ? 's' : ''} running on ${snap.servedBy}`
    + `\nCodex ${now.use.codex}% and Grok ${now.use.grok}% of the week used. Click for the Fleet view.`;
  const html = `<button class="sc-name" type="button" data-seer title="${esc(title)}"><i></i>${text}</button>`;
  if (html !== sar.tag || sar.tagScale !== sc.scale) {
    sarTags.innerHTML = sar.tag = html;
    sar.tagScale = sc.scale;
    const el = sarTags.firstChild;
    [sar.tagW, sar.tagH] = [el.offsetWidth / sc.scale, el.offsetHeight / sc.scale];
  }
  const el = sarTags.firstChild;
  if (sar.look && el.style.getPropertyValue('--c') !== sar.look.glow) el.style.setProperty('--c', sar.look.glow);
  const [w, h] = [sar.tagW, sar.tagH];
  const side = [SAR_X + 9, SAR_Y - 5];
  const over = [Math.max(w / 2 + 1, SAR_X + 2), SAR_Y - 17];
  // Whether another name sits beside his pedestal, looked at once a second.
  if (sc.tick % 10 === 0 || sar.taken === undefined) sar.taken = [...scStage.querySelectorAll('.sc-tags:not(.sc-seer) .sc-name')].some((o) => {
    const b = o.getBoundingClientRect();
    const s = scStage.getBoundingClientRect();
    const [x0, y0] = [((b.left - s.left) / s.width) * sc.W, ((b.top - s.top) / s.height) * sc.H - sc.dy];
    return x0 < side[0] + w && x0 + b.width / sc.scale > side[0] && y0 < side[1] + h / 2 && y0 + b.height / sc.scale > side[1] - h / 2;
  });
  el.className = sar.taken ? 'sc-name' : 'sc-name sc-road';
  const [tx, ty] = sar.taken ? over : side;
  el.style.left = `${(tx / sc.W) * 100}%`;
  el.style.top = `${((ty + sc.dy) / sc.H) * 100}%`;
}

// Whether a pointer event falls on him or his pedestal while he is there, and opening the Fleet view.
function sarAt(e) {
  if (sar.mode === 'away') return false;
  const box = scCanvas.getBoundingClientRect();
  const x = ((e.clientX - box.left) / box.width) * sc.W;
  const y = ((e.clientY - box.top) / box.height) * sc.H - sc.dy;
  return x >= sar.x - 4 && x <= SAR_X + 8.5 && y >= SAR_Y - 17 && y <= SAR_Y + 1;
}
function sarOpen() {
  history.pushState(null, '', '#fleet');
  applyView(true);
}
sarTags.addEventListener('click', (e) => { if (e.target.closest('[data-seer]')) sarOpen(); });
scCanvas.addEventListener('click', (e) => { if (!scHit(e) && !(typeof callEnvoyAt === 'function' && callEnvoyAt(e)) && sarAt(e)) sarOpen(); });
scCanvas.addEventListener('mousemove', (e) => { if (sarAt(e)) scCanvas.style.cursor = 'pointer'; });

if (typeof drawSaruman === 'function' && typeof drawSarStone === 'function') {
  sc.layers.items.push(sarItems);
  sc.layers.light.push(sarLight);
  // Walkers on the ground go round his pedestal and him, as well as whatever else is already there (the eagles' crags).
  const before = sc.path?.extra;
  if (sc.path) sc.path.extra = (r) => [...(before?.(r) ?? []), ...(r.x0 < SAR_X + 9 ? [[SAR_X - 4, SAR_Y - 4, SAR_X + 9, SAR_Y + 0.5]] : [])];
}
