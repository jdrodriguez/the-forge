// side-dock.js: the sidebar's foot and the maps' key. Loaded last; uses page.html's $ and esc, mobile.js's phoneMq and
// phoneMoreSet, scene.js's SC_LEGEND, horn.js's hornEl, sound and hornUi, sound-ui.js's soundPanelToggle and
// music.js's musicEl and music.
//   - The foot: how old the data is, shown only when it is stale (page.html's freshness fills it), then one sound
//     button. The button opens a small menu: Music (play or pause the owner's MP3s, music.js), Mute sounds (every alert,
//     horn.js) and Sound settings (the panel, sound-ui.js). The player and the mute control keep working where they
//     were built; this menu drives them, so each keeps its own state and saving. On a phone the same three sit in the
//     More sheet (sndItems), and the foot does not show.
//   - The key: a "?" in the corner of each map opens what each mark on the maps means, on a click, a tap or focus.
//     The legend shows nowhere else.
const dockMq = phoneMq;
const SND_ICON = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5.2h2.3L7.6 2.6v8.8L4.3 8.8H2z" fill="currentColor"/><path d="M9.6 4.6a3.4 3.4 0 0 1 0 4.8M11.2 3a5.6 5.6 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
const SND_MUTED = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5.2h2.3L7.6 2.6v8.8L4.3 8.8H2z" fill="currentColor"/><path d="M9.5 5.2l3 3.6M12.5 5.2l-3 3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const SND_PLAY = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5v9l7.5-4.5z" fill="currentColor"/></svg>';
const SND_GEAR = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1 4 10M10 4l1.1-1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

const dockFoot = document.createElement('div');
dockFoot.className = 'side-foot';
dockFoot.innerHTML = '<div class="side-stale" id="sideStale" hidden></div>';
$('nav').after(dockFoot);

// The sound button and its menu live inside horn.js's control, so the settings panel (also inside it) stays open when
// it is opened from the menu, and the menu's Mute and Settings items are horn.js's own buttons by their data-horn.
const sndBtn = document.createElement('button');
sndBtn.type = 'button';
sndBtn.className = 'snd';
sndBtn.setAttribute('aria-haspopup', 'menu');
sndBtn.setAttribute('aria-expanded', 'false');
const sndMenu = document.createElement('div');
sndMenu.className = 'snd-menu';
sndMenu.setAttribute('role', 'menu');
sndMenu.hidden = true;
hornEl.prepend(sndBtn, sndMenu);
hornEl.append(musicEl);

// What each item says now: music on or off (or none to play), sound on or muted, and a mark on Settings when the herald
// is not sounding alerts.
function sndState() {
  const muted = Boolean(sound.settings?.muted);
  const zoom = !muted && hornEl.querySelector('.horn-mute.is-zoom');
  const tracks = music.tracks?.length > 0;
  return { muted, zoom: Boolean(zoom), playing: Boolean(music.on), tracks, warn: Boolean(hornEl.querySelector('.horn-gear.warn')) };
}
// The three items, for the sidebar's menu and the phone's More sheet.
function sndItems(tag = 'button') {
  const s = sndState();
  const it = (act, icon, text, state, extra = '') => `<${tag} ${tag === 'a' ? 'href="#"' : 'type="button"'} class="${tag === 'a' ? 'nav-item snd-item' : 'snd-item'}" role="menuitem" data-snd="${act}"${extra}>${icon}<span class="nav-t">${text}</span><span class="st">${state}</span></${tag}>`;
  return it('music', SND_PLAY, 'Music', s.tracks ? (s.playing ? 'on' : 'off') : 'none', s.tracks ? '' : ' aria-disabled="true"')
    + it('mute', SND_MUTED, 'Mute sounds', s.muted ? 'on' : s.zoom ? 'Zoom' : 'off')
    + `${tag === 'button' ? '<hr>' : ''}${it('settings', SND_GEAR, 'Sound settings', s.warn ? '<span class="dot bad" title="The herald is not sounding alerts"></span>' : '')}`;
}
// Each is rewritten only when it changes, so a click in progress keeps its target.
function sndMenuFill() {
  const html = sndItems();
  if (sndMenu.dataset.html !== html) { sndMenu.innerHTML = html; sndMenu.dataset.html = html; }
}
function sndSync() {
  const s = sndState();
  const icon = s.muted || s.zoom ? SND_MUTED : SND_ICON;
  if (sndBtn.dataset.icon !== icon) { sndBtn.innerHTML = icon; sndBtn.dataset.icon = icon; }
  sndBtn.classList.toggle('playing', s.playing);
  sndBtn.classList.toggle('warn', s.warn);
  sndBtn.setAttribute('aria-label', `Sound: ${s.muted ? 'muted' : 'on'}${s.playing ? ', music playing' : ''}`);
  sndBtn.title = sndBtn.getAttribute('aria-label');
  if (!sndMenu.hidden) sndMenuFill();
}
function sndMenuSet(open) {
  sndMenu.hidden = !open;
  sndBtn.setAttribute('aria-expanded', String(open));
  if (open) sndMenuFill();
}
// Read on window, in the capture phase, so it runs before music.js's own resume on the document.
let sndResumed = false;
window.addEventListener('pointerdown', (e) => { sndResumed = Boolean(music.waiting && e.target.closest?.('[data-snd="music"]')); }, true);
window.addEventListener('keydown', (e) => { sndResumed = Boolean(music.waiting && e.target.closest?.('[data-snd="music"]')); }, true);
function sndAct(act) {
  // Music the browser held back resumes on any press (music.js), so a press on Music that found it waiting has
  // already done what was asked; a toggle on top would stop it again.
  if (act === 'music' && !sndResumed) musicEl.querySelector('[data-mu="play"]:not(:disabled)')?.click();
  sndResumed = false;
  if (act === 'mute') hornEl.querySelector('.horn-btns [data-horn="mute"]:not(:disabled)')?.click();
  if (act === 'settings') soundPanelToggle();
  setTimeout(sndSync, 0);
}
sndBtn.addEventListener('click', () => sndMenuSet(sndMenu.hidden));
// Registered after sound-ui.js's own click-outside rule, so Sound settings from the More sheet opens after it ran.
document.addEventListener('click', (e) => {
  const it = e.target.closest('[data-snd]');
  if (it) {
    e.preventDefault();
    if (it.getAttribute('aria-disabled') === 'true') return;
    if (it.dataset.snd === 'settings') { sndMenuSet(false); if (typeof phoneMoreSet === 'function') phoneMoreSet(false); }
    sndAct(it.dataset.snd);
    if (typeof phoneMoreOpen === 'function' && phoneMoreOpen()) phoneMoreFill();
    return;
  }
  if (!sndMenu.hidden && !hornEl.contains(e.target)) sndMenuSet(false);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sndMenu.hidden) { sndMenuSet(false); sndBtn.focus(); } });
// horn.js and music.js redraw their own controls as their state changes; the button follows.
const sndWatch = new MutationObserver(sndSync);
for (const el of [hornBtns, musicEl]) sndWatch.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'disabled'] });

// Desktop: the control sits at the sidebar's foot. Phone: it waits in the page, unseen but for its settings sheet.
function dockApply() {
  const docked = !dockMq.matches;
  document.documentElement.classList.toggle('docked', docked);
  if (docked && hornEl.parentElement !== dockFoot) dockFoot.append(hornEl);
  if (!docked && hornEl.parentElement !== document.body) document.body.append(hornEl);
  if (!docked) sndMenuSet(false);
  window.dispatchEvent(new Event('resize'));
}
dockMq.addEventListener('change', dockApply);
dockApply();
sndSync();

// The maps' key: a "?" in each map's corner, and the list it opens beside it.
const keyPop = document.createElement('div');
keyPop.className = 'legend-pop';
keyPop.id = 'legendPop';
keyPop.setAttribute('role', 'region');
keyPop.setAttribute('aria-label', 'Key to the map');
keyPop.hidden = true;
keyPop.innerHTML = `<dl>${SC_LEGEND.map(([k, v, c]) => `<dt${c ? ` style="color:${c}"` : ''}>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
document.body.append(keyPop);
const keyBtns = ['view-scene', 'view-map'].map((id) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'me-key';
  b.textContent = '?';
  b.setAttribute('aria-label', 'Key to the map');
  b.setAttribute('aria-controls', 'legendPop');
  b.setAttribute('aria-expanded', 'false');
  $(id).append(b);
  return b;
});
function keySet(btn) {
  keyPop.hidden = !btn;
  keyBtns.forEach((b) => b.setAttribute('aria-expanded', String(b === btn)));
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  keyPop.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
  keyPop.style.bottom = `${Math.max(8, Math.round(innerHeight - r.top + 8))}px`;
}
keyBtns.forEach((b) => b.addEventListener('click', () => keySet(keyPop.hidden ? b : null)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !keyPop.hidden) keySet(null); });
document.addEventListener('pointerdown', (e) => { if (!keyPop.hidden && !keyPop.contains(e.target) && !keyBtns.some((b) => b.contains(e.target))) keySet(null); });
window.addEventListener('hashchange', () => keySet(null));
