// scene2-notes.js: what the side view says in words over its realms (scene-tags.js), on the map from above (scene2.js),
// and its legend. A note over a realm whose machine is out of reach or paused, saying how long ago the board last heard
// from it ("the Shire out of reach, last heard 7m ago"), and one line for each merge there in the last 15 minutes ("ABC-123
// merged by Sam"). The map has no sky above its realms, so the note hangs at the realm's north edge, over its landmark,
// in the map's own tag look (the dark box and pixel font of the workers' names, a coloured square for what it says),
// and it moves down past any worker's name it would cover. HTML keeps the words crisp at any scale. The mist over such a
// realm is scene2-mist.js, the fireworks over a merge scene2-fireworks.js; both read m2.recent, which this file sets on
// every snapshot. The legend of what each bubble and pose means is the side view's own (SC_LEGEND), in the bar above
// the map that this file shares with the call bar (scene2-call.js): whichever loads first makes it (2026-11-09: bring
// everything to parity).

// The bar above the map, and the legend at its end.
const m2ntBar = $('map').querySelector('.m2-bar') ?? (() => {
  $('map').insertAdjacentHTML('afterbegin', '<div class="sc-bar m2-bar"></div>');
  return $('map').querySelector('.m2-bar');
})();
m2ntBar.insertAdjacentHTML('beforeend', `<span class="sc-legend">${SC_LEGEND
  .map(([k, v, c]) => `<span><b${c ? ` style="color:${c}"` : ''}>${k}</b> ${v}</span>`).join('')}</span>`);

// The notes wear the names' look (page.html's .sc-name), one box a line, stacked and centred, and take no clicks.
document.head.insertAdjacentHTML('beforeend', `<style>
.m2nt-note { position: absolute; transform: translate(-50%, 0); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none; }
.m2nt-note span { display: flex; align-items: center; gap: 4px; line-height: 1; color: #fff; background: rgb(18 16 28 / 0.74); border-radius: 3px; padding: 3px 5px 2px; white-space: nowrap; }
.m2nt-note i { width: 6px; height: 6px; border-radius: 1px; background: var(--c); flex: none; }
</style>`);
m2Stage.insertAdjacentHTML('beforeend', '<div class="sc-tags m2nt-notes"></div>');
const m2ntLayer = m2Stage.querySelector('.m2nt-notes');
const m2nt = { html: '', els: [] };

// The merges of the last 15 minutes (the side view's sc.recent), and each realm's note, made again on every snapshot.
function m2ntBuild() {
  m2.recent = typeof mergedTickets === 'function' ? mergedTickets().filter((t) => Date.now() - Date.parse(t.mergedAt) < 15 * 60000) : [];
  const line = (c, text) => `<span style="--c:${c}"><i></i>${esc(text)}</span>`;
  const notes = m2.realms.map((r, k) => {
    const m = r.m;
    const lines = [!m.ok ? line('var(--bad)', `${m.name} out of reach, last heard ${ago(m.fetchedAt)}`) : m.paused ? line('var(--warn)', `${m.name} paused`) : '',
      ...m2.recent.filter((t) => t.host === m.host).map((t) => line('var(--merged)', `${t.label || t.id} merged${t.nickname ? ` by ${t.nickname}` : ''}`))].join('');
    return lines ? `<div class="m2nt-note" data-k="${k}">${lines}</div>` : '';
  }).join('');
  if (notes !== m2nt.html) {
    m2ntLayer.innerHTML = m2nt.html = notes;
    m2nt.els = [...m2ntLayer.children].map((el) => ({ el, r: m2.realms[Number(el.dataset.k)] }));
  } else m2nt.els.forEach((n) => { n.r = m2.realms[Number(n.el.dataset.k)]; });
  m2ntMeasure();
}
// Each note's size in map units, measured once per build (and again once the pixel font has loaded).
function m2ntMeasure() {
  for (const n of m2nt.els) [n.w, n.h] = [n.el.offsetWidth / m2.scale, n.el.offsetHeight / m2.scale];
}

// Where each note goes: centred over its realm at its north edge, kept on the map. A note that would cover a worker's
// name (placed by scene2-tags.js, its bottom-centre at its left and top) moves down below that name and tries again.
function m2ntPlace() {
  if (!m2nt.els.length) return;
  const names = [...m2.tags.values()].filter((el) => el.style.left).map((el) => {
    const [x, y, w, h] = [(parseFloat(el.style.left) / 100) * m2.W, (parseFloat(el.style.top) / 100) * m2.H, el.sw || 30, el.sh || 6];
    return { x0: x - w / 2 - 1, x1: x + w / 2 + 1, y0: y - h - 1, y1: y + 1 };
  });
  for (const n of m2nt.els) {
    const { r, w = 40, h = 8 } = n;
    if (!r) continue;
    const x = Math.min(Math.max(r.x + r.w / 2, w / 2 + 1), m2.W - w / 2 - 1);
    let y = Math.max(1, r.y + 2);
    for (let tries = 0; tries < 8; tries += 1) {
      const hit = names.filter((b) => b.x0 < x + w / 2 && b.x1 > x - w / 2 && b.y0 < y + h && b.y1 > y);
      if (!hit.length) break;
      y = Math.max(...hit.map((b) => b.y1)) + 0.5;
    }
    y = Math.min(y, m2.H - h - 1);
    n.el.style.left = `${(x / m2.W) * 100}%`;
    n.el.style.top = `${(y / m2.H) * 100}%`;
  }
}
m2.syncs.push((s, relaid) => { m2ntBuild(); if (relaid) m2ntPlace(); });
// Placed every frame, after the names have moved (the frame before's places, a tenth of a second old).
m2.layers.light.push(() => m2ntPlace());
document.fonts?.ready.then(() => { if (m2.running) { m2ntMeasure(); m2ntPlace(); } });
