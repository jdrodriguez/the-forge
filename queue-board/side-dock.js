// side-dock.js: the sidebar's foot and the maps' key. Loaded last; uses page.html's $, esc, ico, ago, ms, snap,
// failing, lastOk and sentryHost, mobile.js's phoneMq, phoneMoreSet, phoneMoreOpen and phoneMoreFill, scene.js's
// SC_LEGEND, horn.js's hornEl and sound, sound-ui.js's soundPanelToggle and music.js's musicEl and music.
//   - The foot, on a desktop window: how old the data is, the Sentry slots, then the music player and the sound
//     buttons in plain sight. Play starts and pauses the mix and Next skips ahead (music.js); Mute and Settings are
//     horn.js's. The buttons stay on one row, and the playing track, its album and how far it has got take the line
//     under them. Each control shows its state, so whether music is playing is always in view.
//   - On a phone the foot does not show: Music, Next track, Mute sounds and Sound settings sit in the More sheet
//     (sndItems), and the data's age in the header.
//   - The key: a "?" in the corner of each map opens what each mark on the maps means, on a click, a tap or focus.
const dockMq = phoneMq;
const SND_MUTED = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5.2h2.3L7.6 2.6v8.8L4.3 8.8H2z" fill="currentColor"/><path d="M9.5 5.2l3 3.6M12.5 5.2l-3 3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const SND_PLAY = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5v9l7.5-4.5z" fill="currentColor"/></svg>';
const SND_NEXT = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 2.5v9l6-4.5zM9.6 2.5h2v9h-2z" fill="currentColor"/></svg>';
const SND_GEAR = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1 4 10M10 4l1.1-1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

const dockFoot = document.createElement('div');
dockFoot.className = 'side-foot';
dockFoot.innerHTML = '<div class="side-fresh fresh" id="sideFresh"></div><div class="side-sentry" id="sideSentry" hidden></div>';
$('nav').after(dockFoot);
// The player travels with the sound buttons, so both land in the foot together and leave it together on a phone.
hornEl.append(musicEl);

// How old the data is, always, as before the redesign; red once the board can't be reached or the data is stale.
// page.html's freshness() calls this on every render and every 15 seconds.
function sideFootSync() {
  const el = $('sideFresh');
  const down = failing && Date.now() - lastOk > 90000;
  const stale = down || (snap && ms(snap.generatedAt) > STALE_MS);
  el.className = `side-fresh fresh ${stale ? 'stale' : snap?.refreshing ? 'busy' : 'live'}`;
  const text = down ? `Board unreachable, showing data from ${snap ? ago(snap.generatedAt) : 'never'}`
    : snap ? `Data from ${ago(snap.generatedAt)}${snap.refreshing ? ', refreshing' : ''}` : '';
  el.innerHTML = text ? `<span class="dot"></span><span>${esc(text)}</span>` : '';
  const s = $('sideSentry');
  const total = snap ? snap.machines.reduce((n, m) => n + (m.sentryWorkers || 0), 0) : 0;
  s.hidden = !total;
  if (!total) return;
  const used = snap.tickets.filter((t) => t.live && t.sentry && !t.parked && !t.waitingForSlot).length;
  const words = total === 1 ? `Sentry slot ${used ? 'busy' : sentryHost() ? 'idle' : 'offline'}` : `${used} of ${total} Sentry slots busy`;
  s.innerHTML = `${ico('sentry', used ? 'run' : 'todo')}<span>${esc(words)}</span>`;
}

// The phone's More sheet: Music, Next track while it plays, Mute sounds, Sound settings. Each says its state.
function sndState() {
  const muted = Boolean(sound.settings?.muted);
  const zoom = !muted && hornEl.querySelector('.horn-mute.is-zoom');
  return { muted, zoom: Boolean(zoom), playing: Boolean(music.on), tracks: music.tracks?.length > 0, warn: Boolean(hornEl.querySelector('.horn-gear.warn')) };
}
function sndItems() {
  const s = sndState();
  const it = (act, icon, text, state, extra = '') => `<a href="#" class="nav-item snd-item" role="menuitem" data-snd="${act}"${extra}>${icon}<span class="nav-t">${text}</span><span class="st">${state}</span></a>`;
  return it('music', SND_PLAY, 'Music', s.tracks ? (s.playing ? 'on' : 'off') : 'none', s.tracks ? '' : ' aria-disabled="true"')
    + (s.playing ? it('next', SND_NEXT, 'Next track', '') : '')
    + it('mute', SND_MUTED, 'Mute sounds', s.muted ? 'on' : s.zoom ? 'Zoom' : 'off')
    + it('settings', SND_GEAR, 'Sound settings', s.warn ? '<span class="dot bad" title="The herald is not sounding alerts"></span>' : '');
}
// Read on window, in the capture phase, so it runs before music.js's own resume on the document.
let sndResumed = false;
window.addEventListener('pointerdown', (e) => { sndResumed = Boolean(music.waiting && e.target.closest?.('[data-snd="music"]')); }, true);
window.addEventListener('keydown', (e) => { sndResumed = Boolean(music.waiting && e.target.closest?.('[data-snd="music"]')); }, true);
// Each item presses the real control, so the player and the mute keep their own state and saving.
function sndAct(act) {
  // Music the browser held back resumes on any press (music.js), so a press on Music that found it waiting has
  // already done what was asked; a toggle on top would stop it again.
  if (act === 'music' && !sndResumed) musicEl.querySelector('[data-mu="play"]:not(:disabled)')?.click();
  sndResumed = false;
  if (act === 'next') musicEl.querySelector('[data-mu="next"]')?.click();
  if (act === 'mute') hornEl.querySelector('.horn-btns [data-horn="mute"]:not(:disabled)')?.click();
  if (act === 'settings') soundPanelToggle();
}
// Registered after sound-ui.js's own click-outside rule, so Sound settings from the More sheet opens after it ran.
document.addEventListener('click', (e) => {
  const it = e.target.closest('[data-snd]');
  if (!it) return;
  e.preventDefault();
  if (it.getAttribute('aria-disabled') === 'true') return;
  if (it.dataset.snd === 'settings' && typeof phoneMoreSet === 'function') phoneMoreSet(false);
  sndAct(it.dataset.snd);
  if (typeof phoneMoreOpen === 'function' && phoneMoreOpen()) setTimeout(phoneMoreFill, 0);
});

// Desktop: the control sits at the sidebar's foot. Phone: it waits in the page, unseen but for its settings sheet.
function dockApply() {
  const docked = !dockMq.matches;
  document.documentElement.classList.toggle('docked', docked);
  if (docked && hornEl.parentElement !== dockFoot) dockFoot.append(hornEl);
  if (!docked && hornEl.parentElement !== document.body) document.body.append(hornEl);
  window.dispatchEvent(new Event('resize'));
}
dockMq.addEventListener('change', dockApply);
dockApply();
sideFootSync();

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
