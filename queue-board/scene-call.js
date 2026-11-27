// scene-call.js: who is calling. When the herald (herald.mjs) sounds an alert it tells the board whose call the sound is
// for, and the board passes that at once to this page on its event stream (GET /api/events, music.mjs). The herald's
// status, which horn.js reads every 15 seconds (sound.herald.calls), holds the last ten minutes of calls as well, so a
// page opened after the sound still shows them, and so does a call that rang silent (muted, or a Zoom meeting).
// In the Middle-earth view (scene.js) a worker that called stands in a pool of light, its name glows and rings of
// sound go out from its head. A Claude app session that calls sends a Great Eagle, which flies down and perches on a
// crag at the road's edge in its machine's realm (scene-eagle.js). A call no worker or session stands for (a machine in
// trouble, a stuck ticket) sends a messenger of that realm's people onto its road, waving in the same light and rings.
// Each gets a name of its own on the road. The bar over the scene says what the newest call was. Gold is a call waiting on
// the owner, red is trouble (CI failing, stuck, a machine down, main red), green a merge. A call shows for five minutes, or
// until the owner clicks the worker, the eagle, the messenger or the bar; the bar, an eagle and a messenger also open what
// called (callOpen): the worker's session panel, the Claude app session itself, the machine's Fleet card, main's
// failing run, or Needs you. With reduced motion the light holds still and no rings go
// out. The light itself (callPool and callRings, in 32-bit) is scene-call-light.js. Uses scene.js's sc, scStage,
// scTags, scCanvas, scHead, scHit, SC_GLYPH, scReduced and scFrame, sprites.js's drawFigure, horn.js's 'board-sound'
// event, session.js's openPanel and page.html's applyView, dur, esc and $.
const CALL_MS = 5 * 60_000;
// Rings go out every one and a half seconds while a call is fresh, then every four.
const CALL_LOUD_MS = 20_000;
const CALL_GOLD = ['#ffd65a', '#2a1c00'];
const CALL_RED = ['#ff7a66', '#2a0800'];
const CALL_GREEN = ['#74e8a6', '#002a14'];
const CALL_TINT = { needs: CALL_GOLD, reminder: CALL_GOLD, ci: CALL_RED, trouble: CALL_RED, mainRed: CALL_RED, merge: CALL_GREEN, mainGreen: CALL_GREEN };
const callTint = (c) => CALL_TINT[c.kind] ?? CALL_GOLD;
const CALL_GONE = 'board-calls-gone';
// all: every call still showing, by id; lit: each calling worker's calls, newest first; envoys: this frame's messengers.
const calls = { all: new Map(), lit: new Map(), envoys: [], gone: new Set(), source: null, retry: null, bar: '' };
try { for (const id of JSON.parse(localStorage.getItem(CALL_GONE) || '[]')) calls.gone.add(id); } catch { /* none kept */ }

$('scene').querySelector('.sc-bar').insertAdjacentHTML('afterbegin', '<button type="button" class="sc-call" hidden></button>');
scStage.insertAdjacentHTML('beforeend', '<div class="sc-tags sc-envoys"></div>');
const callBar = $('scene').querySelector('.sc-call');
const callEnvoyTags = scStage.querySelector('.sc-envoys');
const callAge = (c) => Date.now() - c.at;
// A messenger's name, short enough to sit on the road; the bar and its tooltip say the whole of it.
const callShort = (s) => (s.length > 24 ? `${s.slice(0, 23).trimEnd()}…` : s);
const callRedraw = () => { if (sc.running && scReduced.matches) scFrame(); };

// Takes in calls from either source; one already here or already dismissed is skipped, so the two never double up.
function callTake(list) {
  if (!Array.isArray(list)) return;
  let added = false;
  for (const c of list) {
    if (!c?.id || calls.gone.has(c.id) || calls.all.has(c.id) || !(callAge(c) < CALL_MS)) continue;
    calls.all.set(c.id, c);
    added = true;
  }
  if (added) callRedraw();
}
window.addEventListener('board-sound', (e) => callTake(e.detail?.herald?.calls));

// The owner has seen these: they go, and stay gone on this device after a reload. An id ends in when its call came, so only
// the ids still young enough to show are kept.
function callDismiss(list) {
  for (const c of list) { calls.gone.add(c.id); calls.all.delete(c.id); }
  const keep = [...calls.gone].filter((id) => Date.now() - Number(id.split('@').pop()) < CALL_MS);
  calls.gone = new Set(keep);
  try { localStorage.setItem(CALL_GONE, JSON.stringify(keep)); } catch { /* this tab only */ }
  callRedraw();
}
// Opens what a call came from, the same place a click on the herald's notification goes (herald-links.mjs): a worker's
// session panel; a Claude app session in the Claude app when it runs on this Mac, its panel on the board otherwise
// (session.js openAppSession); a machine's Fleet card; main's failing run on GitHub; and Needs you for an ask no
// worker carries or a reminder. A merge or main going green has nothing to open.
function callOpen(c) {
  const w = c.who;
  const go = (hash) => { history.pushState(null, '', hash); applyView(true); };
  if (w?.id && typeof openPanel === 'function') return openPanel(w.id);
  if (w?.session && typeof openAppSession === 'function') return openAppSession(`app:${w.host}:${w.session}`);
  if (w?.host) return go(`#fleet/${encodeURIComponent(w.host)}`);
  if (c.kind === 'mainRed') {
    const run = /^https:\/\/github\.com\//.test(snap?.main?.run ?? '') ? snap.main.run : null;
    if (run) window.open(run, '_blank', 'noopener');
    return;
  }
  if (['needs', 'reminder'].includes(c.kind)) { go('#queue'); $('sec-needs')?.scrollIntoView({ block: 'start' }); }
}

// The live event stream, open while the view is. The browser retries a dropped stream itself; one it gave up on opens
// again a little later.
function callStream(open) {
  if (open && !calls.source) {
    calls.source = new EventSource('/api/events');
    calls.source.addEventListener('alert', (e) => {
      try { callTake(JSON.parse(e.data).calls); } catch { /* not a call */ }
    });
    calls.source.addEventListener('error', () => {
      if (calls.source?.readyState !== EventSource.CLOSED) return;
      calls.source = null;
      clearTimeout(calls.retry);
      calls.retry = setTimeout(() => callStream(sc.running), 5000);
    });
  } else if (!open && calls.source) {
    calls.source.close();
    calls.source = null;
  }
}

// Which worker each call lights this frame, and which calls send an eagle or a messenger. A worker in the scene stands
// for its own calls. A session sends an eagle (scene-eagle.js's sync places it, two at most to a realm, folding any
// more into the oldest), a machine or a ticket with no worker here its realm's messenger, one per caller, at most
// three to a realm, along the road from the realm's left edge, oldest first. Main's calls, a merge with no worker and
// an ask no worker carries show only in the bar. Without the eagle (its files not loaded) a session sends a messenger.
function callResolve() {
  calls.lit.clear();
  const envoys = new Map();
  for (const c of [...calls.all.values()].sort((p, q) => q.at - p.at)) {
    if (callAge(c) >= CALL_MS) { calls.all.delete(c.id); continue; }
    const w = drawWho(c.who); // the realm its worker sits in (realm-view.js)
    if (!w?.host) continue;
    const a = w.id && sc.actors.get(`${w.host}/${w.id}`);
    if (a) { calls.lit.set(a.key, [...(calls.lit.get(a.key) ?? []), c]); continue; }
    const r = sc.realms.find((x) => x.m.host === w.host);
    if (!r || c.kind === 'merge') continue;
    const key = `${w.host}|${w.session ?? w.id ?? ''}`;
    envoys.set(key, { key, realm: r, calls: [...(envoys.get(key)?.calls ?? []), c] });
  }
  calls.envoys = [];
  const birds = [];
  const bird = (e) => Boolean(sc.eagle && e.calls[0].who.session);
  for (const r of sc.realms) {
    const all = [...envoys.values()].filter((e) => e.realm === r).sort((p, q) => p.calls.at(-1).at - q.calls.at(-1).at)
      .map((e) => ({ ...e, name: callShort(e.calls[0].who.name || r.m.name) }));
    all.filter((e) => !bird(e)).slice(0, 3).forEach((e, i) => calls.envoys.push({ ...e, x: r.x0 + 14 + i * 20, y: ROAD_Y + 14 }));
    birds.push(...all.filter(bird));
  }
  sc.eagle?.sync(birds);
}

// The z-sorted part, from scene.js's scFrame: the pools under calling workers, and the messengers with theirs. The
// eagles add their own (scene-eagle.js).
function callItems(items) {
  callResolve();
  const g = scG;
  const still = scReduced.matches;
  for (const [key, list] of calls.lit) {
    const a = sc.actors.get(key);
    items.push({ z: (a.z ?? a.y) - 0.01, draw: () => callPool(g, Math.round(a.x), Math.round(a.y), list[0], still, sc.tick) });
  }
  for (const e of calls.envoys) {
    items.push({ z: e.y, draw: () => {
      callPool(g, e.x, e.y, e.calls[0], still, sc.tick);
      drawFigure(g, e.realm.kind, e.name, e.x, e.y, 'ask', still ? 0 : Math.floor(sc.tick / 4) % 2);
    } });
  }
}

// The glowing part, from scFrame after the night shade and before the bubbles: the rings of sound from each caller's
// and each eagle's head, then the names, the messengers' and eagles' names and the bar.
function callLight(g) {
  const still = scReduced.matches;
  for (const [key, list] of calls.lit) {
    const a = sc.actors.get(key);
    if (!still) callRings(g, Math.round(a.x), Math.round(a.y) - scHead(a) + 3, list[0], sc.tick + a.seed);
  }
  for (const e of calls.envoys) if (!still) callRings(g, e.x, e.y - figureTop(e.realm.kind) + 3, e.calls[0], sc.tick);
  sc.eagle?.light(g, still);
  callTags();
}

// The calling workers' names glow in their call's colour; the messengers and the perched eagles get names of their
// own, a messenger's beside it on the road and an eagle's beside its breast (scene-eagle.js's tags; side -1 puts a
// name to the left of its point, over centres it above its point).
function callTags() {
  for (const [key, el] of sc.tags) {
    const c = calls.lit.get(key)?.[0];
    el.classList.toggle('sc-calling', Boolean(c));
    if (c) { el.style.setProperty('--call', callTint(c)[0]); el.style.setProperty('--call-ink', callTint(c)[1]); }
  }
  const list = [...calls.envoys.map((e) => ({ ...e, x: e.x + 5, y: e.y - 9 })), ...(sc.eagle?.tags() ?? [])];
  const html = list.map((e) => `<button class="sc-name${e.over ? '' : ' sc-road'}${e.side < 0 ? ' sc-left' : ''} sc-calling" type="button" data-envoy="${esc(e.key)}"
    style="--call:${callTint(e.calls[0])[0]};--call-ink:${callTint(e.calls[0])[1]};left:${(e.x / sc.W) * 100}%;top:${((e.y + sc.dy) / sc.H) * 100}%"
    title="${esc(e.calls.map((c) => c.head).join(' · '))}">${esc(e.name)}</button>`).join('');
  if (html !== callEnvoyTags.dataset.html) { callEnvoyTags.innerHTML = html; callEnvoyTags.dataset.html = html; }
  callBarDraw();
}

// The bar: the newest call in words and how long ago it came, with how many more are showing.
function callBarDraw() {
  const list = [...calls.all.values()].sort((p, q) => q.at - p.at);
  const c = list[0];
  const age = (x) => (callAge(x) < 60_000 ? 'just now' : `${dur(callAge(x))} ago`);
  const html = c ? `<i style="--call:${callTint(c)[0]}"></i><b>${esc(c.head)}</b><small>${age(c)}${list.length > 1 ? ` · ${list.length - 1} more` : ''}</small>` : '';
  if (html === calls.bar) return;
  calls.bar = html;
  callBar.hidden = !c;
  callBar.innerHTML = html;
  callBar.title = list.map((x) => `${x.head} (${age(x)})`).join('\n');
}

// A click on a calling worker or its name dismisses its calls (scene-tags.js opens its panel). The bar, an eagle and a
// messenger open what called and dismiss it.
function callEnvoyAt(e) {
  const box = scCanvas.getBoundingClientRect();
  const x = ((e.clientX - box.left) / box.width) * sc.W;
  const y = ((e.clientY - box.top) / box.height) * sc.H - sc.dy;
  return calls.envoys.find((v) => Math.abs(x - v.x) <= 5 && y >= v.y - figureTop(v.realm.kind) - 1 && y <= v.y + 1) ?? sc.eagle?.at(x, y);
}
function callEnvoyOpen(v) {
  if (!v) return;
  callOpen(v.calls[0]);
  callDismiss(v.calls);
}
scTags.addEventListener('click', (e) => {
  const b = e.target.closest('.sc-name');
  if (b && calls.lit.has(b.dataset.key)) callDismiss(calls.lit.get(b.dataset.key));
});
callEnvoyTags.addEventListener('click', (e) => {
  const b = e.target.closest('[data-envoy]');
  if (b) callEnvoyOpen(calls.envoys.find((v) => v.key === b.dataset.envoy) ?? sc.eagle?.byKey(b.dataset.envoy));
});
scCanvas.addEventListener('click', (e) => {
  const a = scHit(e);
  if (a) { if (calls.lit.has(a.key)) callDismiss(calls.lit.get(a.key)); return; }
  callEnvoyOpen(callEnvoyAt(e));
});
scCanvas.addEventListener('mousemove', (e) => { if (!scHit(e) && callEnvoyAt(e)) scCanvas.style.cursor = 'pointer'; });
callBar.addEventListener('click', () => {
  const c = [...calls.all.values()].sort((p, q) => q.at - p.at)[0];
  if (!c) return;
  callOpen(c);
  callDismiss([c]);
});

sc.call = { items: callItems, light: callLight, stream: callStream };
