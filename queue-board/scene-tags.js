// scene-tags.js: the HTML laid over the Middle-earth canvas (scene.js): a note over a realm whose machine is out of reach
// or paused, and its merges in the last 15 minutes, and each worker's name, which opens its session panel. The realms
// carry no titles (2026-11-07: the owner knows each one by sight). While main is red the
// page-wide "Orcs at the gates" banner (page.html) carries the details, so the scene shows only the attack. HTML keeps
// the text crisp at any scale. It also maps clicks on the canvas to figures. Only function declarations; scene.js,
// loaded next, calls them.

function scTagsBuild() {
  sc.tags.clear();
  // Realm notes are dark ink on a day sky and pale at night, following the scene's own clock (scenery.js skyAt).
  scTags.classList.toggle('sc-day', !sc.sky?.night);
  const realms = sc.realms.map((r) => {
    const m = r.m;
    const note = m.echo ? '' : !m.ok ? `${m.name} out of reach, last heard ${ago(m.fetchedAt)}` : m.paused ? `${m.name} paused` : '';
    const merged = (sc.recent || []).filter((t) => t.host === m.host).map((t) => `<small>${esc(t.label || t.id)} merged${t.nickname ? ` by ${esc(t.nickname)}` : ''}</small>`).join('');
    if (!note && !merged) return '';
    // Over the realm, its foot just above the highest peak (the Lonely Mountain, 58 rows over the ground), so it stays
    // with its realm however much sky the view adds on top.
    return `<div class="sc-realm" style="left:${((r.x0 + r.w / 2) / sc.W) * 100}%;top:${((sc.dy + GROUND_Y - 62) / sc.H) * 100}%">${note ? `<small>${esc(note)}</small>` : ''}${merged}</div>`;
  }).join('');
  const names = [...sc.actors.values()].map((a) => {
    const s = standing(a.t);
    return `<button class="sc-name" type="button" data-key="${esc(a.key)}" data-id="${esc(a.t.id)}" style="--c:${SC_SEV[s.sev] || 'var(--ink-3)'}"
      title="${esc([a.t.nickname, engineLine(a.t), a.t.label, s.long, a.t.title].filter(Boolean).join(' · '))}"><i></i>${aiMark(workerAi(a.t))}${esc(a.name)}${engineTag(a.t)}</button>`;
  }).join('');
  scTags.innerHTML = realms + names;
  scTags.querySelectorAll('.sc-name').forEach((el) => sc.tags.set(el.dataset.key, el));
  scMeasureTags();
  scPlaceTags();
}

// Each name's size in scene pixels, measured once per build (and again once the pixel font has loaded).
function scMeasureTags() {
  for (const el of sc.tags.values()) { el.sw = el.offsetWidth / sc.scale; el.sh = el.offsetHeight / sc.scale; }
}

// Each name sits over its figure's head (and bubble). Placed from the front of the scene back, a name that would cover
// one already placed moves up above it, and none runs off the scene's sides. A walker's name goes beside it on the road,
// where it covers no one at a station: on whichever side is clear of other names, or a line up if neither is.
function scPlaceTags() {
  // Measured again on every pass, before any name moves: the pixel font loads only once a name first uses it, after
  // document.fonts.ready has resolved, so a name measured at build kept its fallback font's narrower width and two names
  // could overlap (pass 2, 2026-11-27: Legolas and Arwen's).
  scMeasureTags();
  const placed = [];
  const list = [...sc.actors.values()].map((a) => ({ a, el: sc.tags.get(a.key) })).filter((p) => p.el)
    .map((p) => ({ ...p, y: p.a.y - scHead(p.a) - (SC_GLYPH[p.a.mood] ? 11 : 2) })).sort((p, q) => q.y - p.y);
  for (const p of list) {
    // A little margin over the measured size, which rounds to whole screen pixels.
    const w = (p.el.sw || 30) + 1;
    const h = (p.el.sh || 6) + 0.5;
    p.el.classList.toggle('sc-road', p.a.road);
    if (p.a.road) {
      const box = (right, y) => ({ x: right ? p.a.x + 5 + w / 2 : p.a.x - 5 - w / 2, y: y + h / 2, w, h });
      const clear = (b) => b.x - w / 2 > 0 && b.x + w / 2 < sc.W && !placed.some((o) => Math.abs(o.x - b.x) < (o.w + b.w) / 2 && b.y > o.y - o.h && b.y - b.h < o.y);
      let y = p.a.y - 9;
      let right = p.a.x < sc.W - 50;
      for (let tries = 0; tries < 3 && !clear(box(right, y)); tries += 1) {
        if (clear(box(!right, y))) { right = !right; break; }
        y -= h + 0.5;
      }
      placed.push(box(right, y));
      p.el.classList.toggle('sc-left', !right);
      p.el.style.left = `${((p.a.x + (right ? 5 : -5)) / sc.W) * 100}%`;
      p.el.style.top = `${((y + sc.dy) / sc.H) * 100}%`;
      continue;
    }
    const x = Math.min(Math.max(p.a.x, w / 2 + 1), sc.W - w / 2 - 1);
    let y = p.y;
    for (let tries = 0; tries < 8; tries += 1) {
      const hit = placed.find((o) => Math.abs(o.x - x) < (o.w + w) / 2 && y > o.y - o.h && y - h < o.y);
      if (!hit) break;
      y = hit.y - hit.h - 0.5;
    }
    placed.push({ x, y, w, h });
    p.el.style.left = `${(x / sc.W) * 100}%`;
    p.el.style.top = `${((y + sc.dy) / sc.H) * 100}%`;
  }
}

// Clicking a name or a figure opens its worker's session panel, as the Queue's View session does. scene.js calls this
// once its canvas exists, since this file loads first.
function scBindClicks() {
  document.fonts?.ready.then(() => { scMeasureTags(); scPlaceTags(); });
  scTags.addEventListener('click', (e) => {
    const b = e.target.closest('.sc-name');
    if (b && typeof openPanel === 'function') openPanel(b.dataset.id);
  });
  scCanvas.addEventListener('click', (e) => {
    const a = scHit(e);
    if (a && typeof openPanel === 'function') openPanel(a.t.id);
  });
  scCanvas.addEventListener('mousemove', (e) => { scCanvas.style.cursor = scHit(e) ? 'pointer' : ''; });
}
// The pointer maps to scene pixels through the canvas's box on screen, so it holds at any scale, with the stage scrolled
// sideways and with sky added above the scene (sc.dy). The frontmost figure wins; orcs don't count. A Ranger's box takes
// in its horse.
function scHit(e) {
  const box = scCanvas.getBoundingClientRect();
  const x = ((e.clientX - box.left) / box.width) * sc.W;
  const y = ((e.clientY - box.top) / box.height) * sc.H - sc.dy;
  let hit = null;
  for (const a of sc.actors.values()) {
    const top = a.y - scHead(a) - (SC_GLYPH[a.mood] ? 10 : 1);
    if (Math.abs(x - a.x) <= (a.mounted ? 10 : 5) && y >= top && y <= a.y + 1 && (!hit || a.y > hit.y)) hit = a;
  }
  return hit;
}
