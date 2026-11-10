// scene2-call-bar.js: the call bar over the map from above (scene2.js), the names of its messengers and eagles, and the
// live call stream, as the side view has them (scene-call.js). The bar says what the newest call was and how long ago,
// with how many more are showing; a click on it opens what called (the worker's session panel, or the Sessions view)
// and dismisses it. It shares its strip with the map's legend, which scene2-notes.js adds after the button. The strip
// keeps one height whether a call shows or not, since any move of the map's top edge lays the whole map out again
// (scene2.js's m2Sync: about a second, and every walker's way is dropped), so the button keeps its place in it, unseen
// while nothing calls. A messenger's name stands over its head and
// a landed eagle's beside its breast (scene2-eagle.js's m2eEagleTags), each a button in its call's colour, reachable
// from the keyboard, whose tooltip says every call it carries, kept clear of the workers' names; a click on one, as on
// the figure itself, opens what called and dismisses its calls. A dismissal holds on this device after a reload and in
// both views (scene-call.js's callDismiss). The stream (scene-call.js's callStream, GET /api/events) is open while
// either view of Middle-earth is, one for the page, so a call reaches the map the moment the herald sends it rather
// than at the next 15-second read of the sound settings. With reduced motion the map draws one still frame per
// snapshot, so a call coming or going draws it again here.

// The strip's layout. On a wide map the call sits at the left and the legend at the right, wrapping in what is left
// beside the call's share; on a narrow one (a phone) the call takes a line of its own over the
// legend, as the side view's bar does when it wraps. Either way the call's place is kept while nothing calls.
const m2eStyle = document.createElement('style');
m2eStyle.textContent = `
#map { container-type: inline-size; }
.m2-bar { flex-wrap: nowrap; }
.m2-bar .sc-call { flex: 1 1 0; min-width: min(32%, 24em); min-height: 1.3em; }
.m2-bar .sc-call.m2-quiet { visibility: hidden; }
.m2-bar .sc-legend { flex: 0 1 auto; min-width: 0; }
@container (max-width: 900px) { .m2-bar { flex-wrap: wrap; } .m2-bar .sc-call { flex-basis: 100%; } }`;
document.head.append(m2eStyle);
// The strip over the map, made by whichever of this file and scene2-notes.js runs first.
const m2eBarHost = $('map').querySelector('.m2-bar') ?? (() => {
  $('map').insertAdjacentHTML('afterbegin', '<div class="sc-bar m2-bar"></div>');
  return $('map').querySelector('.m2-bar');
})();
m2eBarHost.insertAdjacentHTML('afterbegin', '<button type="button" class="sc-call m2-quiet"></button>');
const m2eBar = m2eBarHost.querySelector('.sc-call');
m2Stage.insertAdjacentHTML('beforeend', '<div class="sc-tags m2-callers"></div>');
const m2eCallers = m2Stage.querySelector('.m2-callers');
const m2eAgo = (c) => (Date.now() - c.at < 60_000 ? 'just now' : `${dur(Date.now() - c.at)} ago`);

// The bar: the newest call in words and how long ago it came, with how many more are showing.
function m2eBarDraw() {
  const list = m2eShowing();
  const c = list[0];
  const more = list.length > 1 ? ` · ${list.length - 1} more` : '';
  const html = c ? `<i style="--call:${m2eTagTint(c)[0]}"></i><b>${esc(c.head)}</b><small>${m2eAgo(c)}${more}</small>` : '';
  if (html === m2eBar.dataset.html) return;
  m2eBar.dataset.html = html;
  m2eBar.classList.toggle('m2-quiet', !c);
  m2eBar.innerHTML = html;
  m2eBar.title = list.map((x) => `${x.head} (${m2eAgo(x)})`).join('\n');
}

// The workers' names as scene2-tags.js placed them (last frame), as boxes in map units: centre x, foot y, w and h.
const m2eTaken = () => [...m2.tags.values()].filter((el) => el.style.left).map((el) => ({
  x: (parseFloat(el.style.left) / 100) * m2.W, y: (parseFloat(el.style.top) / 100) * m2.H, w: el.sw || 30, h: el.sh || 6 }));
// The names of this frame's messengers and landed eagles, made again only when one comes, goes or changes (so a name
// the keyboard is on keeps its focus), then placed each frame: a messenger's over its head, nudged as scene2-tags.js
// nudges a worker's; an eagle's beside its breast on the side away from its realm's other crag if it fits there, else
// on the other side, else over its head.
function m2eCallerTags() {
  const list = [...m2eCall.envoys.map((e) => ({ key: e.key, calls: e.calls, name: e.name, x: e.x, top: e.y - m2Head(e) - 2 })),
    ...m2eEagleTags()];
  const sig = list.map((v) => `${v.key}|${v.name}|${v.calls.map((c) => c.id).join()}`).join('\n');
  if (sig !== m2eCallers.dataset.sig) {
    m2eCallers.dataset.sig = sig;
    m2eCallers.innerHTML = list.map((v) => {
      const [tint, ink] = m2eTagTint(v.calls[0]);
      return `<button class="sc-name sc-calling" type="button" data-envoy="${esc(v.key)}" style="--call:${tint};--call-ink:${ink}"
        title="${esc(v.calls.map((c) => c.head).join(' · '))}">${esc(v.name)}</button>`;
    }).join('');
    m2eMeasure();
  }
  const placed = m2eTaken();
  const free = (b) => b.x - b.w / 2 > 0 && b.x + b.w / 2 < m2.W && b.y - b.h > 0
    && !placed.some((o) => Math.abs(o.x - b.x) < (o.w + b.w) / 2 + 0.5 && b.y > o.y - o.h - 0.5 && b.y - b.h < o.y + 0.5);
  for (const el of m2eCallers.children) {
    const v = list.find((q) => q.key === el.dataset.envoy);
    if (!v) continue;
    const [w, h] = [el.sw || 30, el.sh || 6];
    // Beside an eagle the anchor is the name's near end on the breast line, its box its whole width out from there.
    const sides = v.out ? [[v.out, v.tail], [-v.out, v.head]] : [];
    const side = sides.map(([s, off]) => ({ s, ax: v.x + s * off, b: { x: v.x + s * (off + w / 2), y: v.y + h / 2, w, h } }))
      .find((q) => free(q.b));
    let b = side?.b;
    if (!side) {
      const clampX = (x) => Math.min(Math.max(x, w / 2 + 1), m2.W - w / 2 - 1);
      const y0 = Math.max(h + 1, v.top);
      const tries = M2_TAG_TRIES.map(([dx, dy]) => ({ x: clampX(v.x + dx * (w / 2 + 1)), y: Math.max(h + 1, y0 + dy * (h + 0.5)),
        w, h }));
      b = tries.find(free) ?? tries[0];
    }
    placed.push(b);
    el.classList.toggle('sc-road', Boolean(side));
    el.classList.toggle('sc-left', side?.s < 0);
    el.style.left = `${((side ? side.ax : b.x) / m2.W) * 100}%`;
    el.style.top = `${((side ? v.y : b.y) / m2.H) * 100}%`;
  }
}
function m2eMeasure() {
  for (const el of m2eCallers.children) { el.sw = el.offsetWidth / m2.scale; el.sh = el.offsetHeight / m2.scale; }
}
document.fonts?.ready.then(m2eMeasure);

// The owner has seen these: they go, in both views and after a reload, and a still map is drawn again.
function m2eDismiss(list) {
  if (typeof callDismiss === 'function') callDismiss(list);
  else for (const c of list) window.m2eFakeCalls?.delete(c.id);
  m2eBarDraw();
  if (m2.running && m2Reduced.matches) m2Frame();
}
// A worker's calls, when its figure or name is clicked (scene2-tags.js opens its panel).
function m2eDismissWorker(key) {
  const list = m2eCall.lit.get(key);
  if (list) m2eDismiss(list);
}
// A caller with no worker here (an eagle or a messenger) opens what called, as the bar does, and its calls go.
function m2eCallerOpen(v) {
  if (!v?.calls?.length) return;
  if (typeof callOpen === 'function') callOpen(v.calls[0]);
  m2eDismiss(v.calls);
}
// The messenger under the pointer (map units), as its caller.
const m2eEnvoyAt = (x, y) => m2eCall.envoys.find((e) => Math.abs(x - e.x) <= 5 && y >= e.y - m2Head(e) - 1 && y <= e.y + 1)
  ?? null;
// A messenger or an eagle by its caller's key, from its name's click; an eagle flying home has no call left.
function m2eCallerByKey(k) {
  const b = m2eBirds.get(k);
  return m2eCall.envoys.find((e) => e.key === k) ?? (b && b.state !== 'leave' ? b : null);
}
m2eCallers.addEventListener('click', (e) => {
  const b = e.target.closest('[data-envoy]');
  if (b) m2eCallerOpen(m2eCallerByKey(b.dataset.envoy));
});
m2eBar.addEventListener('click', () => {
  const c = m2eShowing()[0];
  if (c) m2eCallerOpen({ calls: [c] });
});
// Each frame, after the light: the names and the bar.
m2.layers.light.push(() => { m2eCallerTags(); m2eBarDraw(); });

// The stream, from scene2.js's mapShow: open while the map or the side view shows (the side view's sceneShow opens and
// closes it for its own).
function m2eStream(on) {
  if (typeof callStream === 'function') callStream(on || (typeof sc === 'object' && sc.running));
}
// Every second while the map shows: the bar's "how long ago", a still map drawn again when the calls showing change,
// and a stream the browser gave up on opened again once it has been gone six seconds (scene-call.js's own retry, five
// seconds after the failure, reopens it only while the side view runs, and closes one opened before it otherwise).
setInterval(() => {
  if (!m2.running) return;
  if (typeof calls === 'object') {
    if (calls.source) m2eCall.lost = 0;
    else if (!m2eCall.lost) m2eCall.lost = Date.now();
    else if (Date.now() - m2eCall.lost > 6000) { m2eCall.lost = 0; m2eStream(true); }
  }
  m2eBarDraw();
  if (m2Reduced.matches && m2eShowing().map((c) => c.id).join() !== m2eCall.sig) m2Frame();
}, 1000);
