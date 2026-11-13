// scene2-call.js: who is calling, on the map from above (scene2.js), from the side view's calls (scene-call.js's
// calls.all: the herald's calls of the last five minutes, which that file keeps whichever view is open). A worker on
// the map that called stands in a pool of light, rings of sound go out from its head and its name glows in the call's
// colour. A Claude app session that calls (who.session) sends a Great Eagle to its machine's realm (scene2-eagle.js):
// it stands in the pool and sends out the rings only once it has landed. A realm takes two eagles at most; any more
// sessions calling there fold into the older one, whose name then counts them ("Orchestrator +1") and whose click takes all
// their calls. A call no worker or session stands for (a machine paused or out of reach, a stuck ticket) sends a
// messenger of that realm's people, as in the side view: on the map it stands on the realm's own stretch of road,
// between the eagles' crags, facing you and waving in the same pool and rings, with the machine's or the ticket's name
// over it; one per caller, three to a realm at most, the oldest caller first (m2eEnvoySpots says where). Main's calls,
// a merge with no worker and an ask no worker carries show only in the bar over the map (scene2-call-bar.js, which also
// holds the names of the messengers and eagles and the clicks). Gold is a call waiting on the owner, red trouble, green a
// merge, as in the side view. Rings go out every one and a half seconds while a call is twenty seconds old at most,
// then every four. A call goes when its five minutes end or the owner dismisses it, in either view. With reduced motion the
// light holds still and no rings go out. A test page with no scene-call.js may set window.m2eFakeCalls to a Map of
// calls.

const M2E_CALL_MS = 5 * 60_000;
const M2E_LOUD_MS = 20_000;
const M2E_GOLD = ['#ffd65a', '#fff2b0'];
const M2E_TINT = { needs: M2E_GOLD, reminder: M2E_GOLD, ci: ['#ff7a66', '#ffd0c4'], trouble: ['#ff7a66', '#ffd0c4'], mainRed: ['#ff7a66', '#ffd0c4'],
  merge: ['#74e8a6', '#d4ffe6'], mainGreen: ['#74e8a6', '#d4ffe6'] };
const m2eTint = (c) => M2E_TINT[c?.kind] ?? M2E_GOLD;
// A name tag's glow and ink, the side view's own (scene-call.js's callTint) where it is loaded.
const m2eTagTint = (c) => (typeof callTint === 'function' ? callTint(c) : [m2eTint(c)[0], '#2a1c00']);
// lit: each calling worker's calls, newest first; birds: this frame's eagle callers (two to a realm, the rest folded
// into the first); foldNow: the callers folded this frame, and folded those of the frame before (scene2-eagle.js);
// envoys: this frame's messengers; spots: where they stand, per layout; sig: the calls showing at the last frame; lost:
// when the call stream was first seen gone (scene2-call-bar.js).
const m2eCall = { lit: new Map(), birds: [], folded: new Set(), foldNow: new Set(), envoys: [], spots: { key: '', by: new Map() },
  sig: '', lost: 0 };
const m2eCallSource = () => (typeof calls !== 'undefined' ? calls.all : window.m2eFakeCalls) ?? new Map();
// The calls still showing, newest first.
const m2eShowing = () => [...m2eCallSource().values()].filter((c) => Date.now() - c.at < M2E_CALL_MS).sort((p, q) => q.at - p.at);
// A messenger's or an eagle's name, short enough to stand over it; its tooltip says the whole of every call.
const m2eShort = (s) => (s.length > 24 ? `${s.slice(0, 23).trimEnd()}…` : s);

// Sorts the calls showing into the workers they light, the sessions sending eagles and the callers sending messengers.
function m2eCallResolve() {
  m2eCall.lit.clear();
  const callers = new Map();
  const list = m2eShowing();
  m2eCall.sig = list.map((c) => c.id).join();
  for (const c of list) {
    const w = drawWho(c.who); // the realm its worker sits in (realm-view.js)
    if (!w?.host) continue;
    const a = w.id && m2.actors.get(`${w.host}/${w.id}`);
    if (a) { m2eCall.lit.set(a.key, [...(m2eCall.lit.get(a.key) ?? []), c]); continue; }
    const r = m2.realms.find((x) => x.m.host === w.host);
    if (!r || c.kind === 'merge') continue;
    const key = `${w.host}|${w.session ?? w.id ?? ''}`;
    callers.set(key, { key, realm: r, bird: Boolean(w.session), calls: [...(callers.get(key)?.calls ?? []), c] });
  }
  m2eCall.birds = [];
  m2eCall.envoys = [];
  const folded = new Set();
  for (const r of m2.realms) {
    const all = [...callers.values()].filter((e) => e.realm === r).sort((p, q) => p.calls.at(-1).at - q.calls.at(-1).at)
      .map((e) => ({ ...e, name: m2eShort(e.calls[0].who.name || r.m.name) }));
    // Two eagles to a realm, the oldest callers first; the rest fold into the first, its name counting them.
    const birds = all.filter((e) => e.bird);
    const two = birds.slice(0, 2).map((e) => ({ ...e, more: 0 }));
    if (two[0] && birds.length > 2) {
      const rest = birds.slice(2);
      rest.forEach((e) => folded.add(e.key));
      Object.assign(two[0], { more: rest.length, calls: [...two[0].calls, ...rest.flatMap((e) => e.calls)] });
    }
    m2eCall.birds.push(...two);
    const spots = m2eEnvoySpots(r);
    all.filter((e) => !e.bird).slice(0, spots.length).forEach((e, i) => {
      m2eCall.envoys.push({ ...e, kind: r.kind, x: spots[i].x, y: spots[i].y, seed: pxHash(e.key) % 97 });
    });
  }
  m2eCall.foldNow = folded;
}

// Where a realm's messengers stand: on its own stretch of road, the first nearest its middle and the next to either
// side, 13 units apart, on ground a body may stand on (scene2-path.js's open cells). Each stands on the road's far edge
// where it can (behind its middle line, clear of the names over the front row of stations, which sit along its near
// edge), else on its middle line. The first places tried keep clear of the eagles' crags at the road's two ends and of
// the front row's columns; where fewer than three fit, then only of the crags, then anywhere on the road. Worked out
// once per layout.
function m2eEnvoySpots(r) {
  if (m2eCall.spots.key !== m2.key) m2eCall.spots = { key: m2.key, by: new Map() };
  const by = m2eCall.spots.by;
  if (by.has(r)) return by.get(r);
  const P = m2.paths?.cells?.();
  const open = (x, y) => !P || [-3, 0, 3].every((dx) => P.open[m2mCellOf(P, x + dx, y)] && P.wide[m2mCellOf(P, x + dx, y)]);
  const crags = typeof m2eCragAt === 'function' ? [0, 1].map((s) => m2eCragAt(r, s).x) : [r.ux0, r.ux1];
  const front = m2.stations.filter((s) => s.realm === r && s.y < r.roadY + 50).map((s) => s.x);
  const mid = (crags[0] + crags[1]) / 2;
  const xs = [];
  for (let x = Math.ceil(r.ux0) + 5; x <= r.ux1 - 5; x += 1) xs.push(x);
  xs.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
  const out = [];
  for (const [nearCrag, nearDesk] of [[false, false], [false, true], [true, true]]) {
    for (const x of xs) {
      if (out.length >= 3 || out.some((p) => Math.abs(p.x - x) < 13)) continue;
      if (!nearCrag && crags.some((c) => Math.abs(c - x) < 19)) continue;
      if (!nearDesk && front.some((c) => Math.abs(c - x) < 11)) continue;
      const y = [r.roadY - 3, r.roadY].map(Math.round).find((v) => open(x, v));
      if (y !== undefined) out.push({ x, y });
    }
  }
  by.set(r, out);
  return out;
}

// A pool of light under a caller at (x, y), w units across: a soft dithered ellipse in the call's colour.
function m2ePool(g, x, y, w, c, k) {
  g.globalAlpha = 0.5 * k;
  g.drawImage(m2Glow(10, m2eTint(c)[0]), x - w / 2, y - w * 0.22, w, w * 0.44);
  g.globalAlpha = 0.45 * k;
  g.drawImage(m2Glow(6, m2eTint(c)[1]), x - w / 4, y - w * 0.1, w / 2, w * 0.2);
  g.globalAlpha = 1;
}
// Rings of sound going out from a caller's head at (x, y): an ellipse that grows and fades over three seconds, a new
// one every one and a half seconds while the call is fresh (two showing at once), then every four (one, then a pause),
// as the side view's slow (scene-call-light.js's callRings).
function m2eRings(g, x, y, c, tick, still) {
  if (still) return;
  const col = m2eTint(c)[1];
  const every = Date.now() - c.at < M2E_LOUD_MS ? 15 : 40;
  for (let age = tick % every; age < 30; age += every) {
    const r = 2 + age * 0.45;
    g.globalAlpha = Math.max(0, 1 - age / 30);
    g.strokeStyle = col;
    g.lineWidth = 0.5;
    g.beginPath();
    g.ellipse(Math.round(x * 4) / 4, Math.round(y * 4) / 4, r, r * 0.6, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
  }
  g.globalAlpha = 1;
}

// Pools under calling workers and messengers, on the ground under everything that stands.
m2.layers.ground.push((g, tick, reduced) => {
  m2eCallResolve();
  const k = reduced ? 1 : 0.85 + 0.15 * Math.sin(tick * 0.25);
  for (const [key, list] of m2eCall.lit) {
    const a = m2.actors.get(key);
    if (a) m2ePool(g, a.x, a.y, 24, list[0], k);
  }
  for (const e of m2eCall.envoys) m2ePool(g, e.x, e.y, 24, e.calls[0], k);
});
// The messengers, in the depth sort at their feet, facing you and waving (v1's ask, as the side view's wave).
m2.layers.items.push((add, tick, reduced) => {
  for (const e of m2eCall.envoys) {
    e.posed = { pose: 'ask', frame: reduced ? 0 : Math.floor(tick / 4) % 2, face: 'down' };
    add(e.y, () => m2DrawActor(m2G, e), [e.x - 6, e.y - 21, e.x + 6, e.y + 1]);
  }
});
// After the night's shade: the messengers stamped again as the workers are at night (scene2-glow.js), then the rings
// from every caller's head, and the calling workers' names lit in their call's colour.
m2.layers.light.push((g, tick, reduced) => {
  const dark = typeof m2GlowDark === 'function' ? m2GlowDark() : 0;
  if (dark >= 0.05 && typeof m2DrawActorLit === 'function') for (const e of m2eCall.envoys) m2DrawActorLit(g, e, dark * 0.5);
  for (const [key, list] of m2eCall.lit) {
    const a = m2.actors.get(key);
    if (!a) continue;
    m2ePool(g, a.x, a.y, 18, list[0], 0.35);
    m2eRings(g, a.x, a.y - m2Head(a) - 1, list[0], tick + a.seed, reduced);
  }
  for (const e of m2eCall.envoys) {
    m2ePool(g, e.x, e.y, 18, e.calls[0], 0.35);
    m2eRings(g, e.x, e.y - m2Head(e) - 1, e.calls[0], tick + e.seed, reduced);
  }
  for (const [key, el] of m2.tags) {
    const c = m2eCall.lit.get(key)?.[0];
    el.classList.toggle('sc-calling', Boolean(c));
    if (c) { el.style.setProperty('--call', m2eTagTint(c)[0]); el.style.setProperty('--call-ink', m2eTagTint(c)[1]); }
  }
});
