// scene2-tags.js: the HTML over the map from above (scene2.js): each worker's name, which opens its session panel, as
// the side view's do (scene-tags.js), and the clicks on the canvas that find the figure under the pointer. HTML keeps
// the names crisp at any scale; they wear the side view's look (page.html's .sc-name). A click on a worker that called,
// or on its name, also dismisses its calls, and one on an eagle or a messenger opens what called (scene2-call-bar.js),
// as in the side view (scene-call.js).

function m2TagsBuild() {
  m2.tags.clear();
  m2Tags.innerHTML = [...m2.actors.values()].map((a) => {
    const s = standing(a.t);
    return `<button class="sc-name" type="button" data-key="${esc(a.key)}" data-id="${esc(a.t.id)}" style="--c:${SC_SEV[s.sev] || 'var(--ink-3)'}"
      title="${esc([a.t.nickname, engineLine(a.t), a.t.label, s.long, a.t.title].filter(Boolean).join(' · '))}"><i></i>${aiMark(workerAi(a.t))}${esc(a.name)}${engineTag(a.t)}</button>`;
  }).join('');
  m2Tags.querySelectorAll('.sc-name').forEach((el) => m2.tags.set(el.dataset.key, el));
  m2MeasureTags();
  m2PlaceTags();
}
// Each name's size in scene units, measured once per build (and again once the pixel font has loaded).
function m2MeasureTags() {
  for (const el of m2.tags.values()) { el.sw = el.offsetWidth / m2.scale; el.sh = el.offsetHeight / m2.scale; }
}
// Each name sits over its figure's head (and bubble). Placed from the front of the map back, a name that would cover
// one already placed tries the nearest free place: nudged sideways first (so neighbours' names sit side by side, never
// in a tower), then a row up or down, then both; none runs off the map's sides or top.
function m2PlaceTags() {
  const placed = [];
  const list = [...m2.actors.values()].map((a) => ({ a, el: m2.tags.get(a.key) })).filter((p) => p.el)
    .map((p) => ({ ...p, y: p.a.y - m2Head(p.a) - (SC_GLYPH[p.a.mood] ? 11 : 2) })).sort((p, q) => q.y - p.y || p.a.x - q.a.x);
  const free = (x, y, w, h) => !placed.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 0.5 && y > o.y - o.h - 0.5 && y - h < o.y + 0.5);
  for (const p of list) {
    const w = p.el.sw || 30;
    const h = p.el.sh || 6;
    const clampX = (x) => Math.min(Math.max(x, w / 2 + 3), m2.W - w / 2 - 3);
    const y0 = Math.max(h + 1, p.y);
    let best = null;
    for (const [dx, dy] of M2_TAG_TRIES) {
      const [x, y] = [clampX(p.a.x + dx * (w / 2 + 1)), Math.max(h + 1, y0 + dy * (h + 0.5))];
      if (free(x, y, w, h)) { best = [x, y]; break; }
    }
    const [x, y] = best ?? [clampX(p.a.x), y0];
    placed.push({ x, y, w, h });
    p.el.style.left = `${(x / m2.W) * 100}%`;
    p.el.style.top = `${(y / m2.H) * 100}%`;
  }
}
// The places a name tries, in half its width sideways and its height up or down, nearest first.
const M2_TAG_TRIES = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1], [0, 1], [-2, -1], [2, -1], [-1, 1], [1, 1], [0, -2], [-3, 0], [3, 0]];
// The pointer maps to map units through the canvas's box on screen, so it holds at any scale and scrolled sideways.
function m2At(e) {
  const box = m2View.getBoundingClientRect();
  return { x: ((e.clientX - box.left) / box.width) * m2.W, y: ((e.clientY - box.top) / box.height) * m2.H };
}
// The frontmost figure under it wins. A mounted rider's box takes in his horse, as the side view's does
// (scene-tags.js's scHit): v1's horse at the map's size, 13 units either side in profile, 6 coming toward you or going
// away.
function m2Hit(e) {
  const { x, y } = m2At(e);
  let hit = null;
  for (const a of m2.actors.values()) {
    const top = a.y - m2Head(a) - (SC_GLYPH[a.mood] ? 10 : 1);
    const half = a.rr?.mounted ? (a.face === 'left' || a.face === 'right' ? 13 : 6) : 5;
    if (Math.abs(x - a.x) <= half && y >= top && y <= a.y + 1 && (!hit || a.y > hit.y)) hit = a;
  }
  return hit;
}
document.fonts?.ready.then(() => { if (m2.running) { m2MeasureTags(); m2PlaceTags(); } });
m2Tags.addEventListener('click', (e) => {
  const b = e.target.closest('.sc-name');
  if (!b) return;
  if (typeof openPanel === 'function') openPanel(b.dataset.id);
  if (typeof m2eDismissWorker === 'function') m2eDismissWorker(b.dataset.key);
});
// The caller with no worker here under the pointer: an eagle, landed or flying in (scene2-eagle.js), or a messenger
// (scene2-call.js).
function m2EagleUnder(e) {
  const { x, y } = m2At(e);
  return (typeof m2eEagleAt === 'function' ? m2eEagleAt(x, y) : null) ?? (typeof m2eEnvoyAt === 'function' ? m2eEnvoyAt(x, y) : null);
}
// A worker opens its panel and its calls go; else an eagle or a messenger opens what called.
m2View.addEventListener('click', (e) => {
  const a = m2Hit(e);
  if (a) {
    if (typeof openPanel === 'function') openPanel(a.t.id);
    if (typeof m2eDismissWorker === 'function') m2eDismissWorker(a.key);
    return;
  }
  const v = m2EagleUnder(e);
  if (v && typeof m2eCallerOpen === 'function') m2eCallerOpen(v);
});
m2View.addEventListener('mousemove', (e) => { m2View.style.cursor = m2Hit(e) || m2EagleUnder(e) ? 'pointer' : ''; });
