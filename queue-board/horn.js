// horn.js: the board's sound control, at the right end of the header in every view. The alerts themselves (the war horn
// when main turns red, the bell when something needs the owner, the realms' merge calls and the rest) come from the herald
// (herald.mjs), a service on the board's machine that plays them with afplay and posts macOS notifications, so they sound with
// no browser open and never twice; this page plays none of them. The control is one Mute toggle, which writes
// sound.json through /api/sound and so silences the herald on every Mac, and beside it a button that opens the sound
// settings (sound-ui.js). The toggle reads "Muted: Zoom" while the herald keeps quiet for a Zoom meeting, and the
// settings button carries a warning while the herald is not running. page.html's render() calls hornWatch() on every
// snapshot, which re-reads /api/sound so a change made on another device shows here too. Every change is announced as
// a 'board-sound' event, which sound-ui.js and music.js follow.
const SOUND_READ_MS = 15000;
const sound = { settings: null, herald: null, cues: [], error: null, readAt: 0, html: '' };

// The herald is quiet for a Zoom meeting only while its report is fresh.
const soundZoom = () => Boolean(sound.herald && !sound.herald.stale && sound.herald.autoMuted);
const soundHeraldDown = () => !sound.herald || sound.herald.stale;

function soundSet(body) {
  if (body.settings) sound.settings = body.settings;
  if (body.herald !== undefined) sound.herald = body.herald;
  if (body.cues) sound.cues = body.cues;
  sound.readAt = Date.now();
  hornUi();
  window.dispatchEvent(new CustomEvent('board-sound', { detail: sound }));
}

async function soundRead() {
  try {
    const r = await fetch('/api/sound', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    sound.error = null;
    soundSet(await r.json());
  } catch (e) {
    sound.error = `Could not read the sound settings: ${e.message}`;
    hornUi();
  }
}

// Saves a change (patch) or plays a test cue; the answer carries the settings as saved.
async function soundPost(patch, test = null) {
  try {
    const r = await fetch(`/api/sound${test ? `?test=${encodeURIComponent(test)}` : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Board': 'sound' }, body: JSON.stringify(patch ?? {}),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    sound.error = null;
    if (!test) soundSet(body);
    return true;
  } catch (e) {
    sound.error = `Could not ${test ? 'play it' : 'save that'}: ${e.message}`;
    hornUi();
    return false;
  }
}

// page.html's render() calls this on every new snapshot.
function hornWatch() {
  if (Date.now() - sound.readAt >= SOUND_READ_MS) soundRead();
}

// The control: its two buttons, rewritten as the state changes, and sound-ui.js's panel beside them.
const hornEl = document.createElement('div');
hornEl.className = 'horn';
const hornBtns = document.createElement('span');
hornBtns.className = 'horn-btns';
hornEl.append(hornBtns);
document.querySelector('header.bar').append(hornEl);
const HORN_PATH = '<path d="M1.5 6.2h2.2L10.8 2v10L3.7 7.8H1.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M3.2 7.8l.9 3.7h1.6l-.6-3.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>';
const HORN_ICON = `<svg viewBox="0 0 14 14" aria-hidden="true">${HORN_PATH}</svg>`;
// The same horn struck through, for muted.
const HORN_OFF = `<svg viewBox="0 0 14 14" aria-hidden="true">${HORN_PATH}<path d="M1 1.2 13 12.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const GEAR = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 4h10M2 10h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5" cy="4" r="1.7" fill="var(--raised)" stroke="currentColor" stroke-width="1.3"/><circle cx="9" cy="10" r="1.7" fill="var(--raised)" stroke="currentColor" stroke-width="1.3"/></svg>';

// Rewrites the control only when it changed, so a click in progress keeps its button.
function hornUi() {
  const s = sound.settings;
  const muted = Boolean(s?.muted);
  const zoom = !muted && s?.autoMuteZoom && soundZoom();
  // Alerts can't sound while the herald is down or can't read the board; the settings button says so.
  const down = s && (soundHeraldDown() || sound.herald.boardOk === false);
  const state = muted ? 'muted' : zoom ? 'zoom' : 'on';
  const label = { muted: 'Muted', zoom: 'Muted: Zoom', on: 'Mute' }[state];
  const title = {
    muted: 'Every alert sound is off on every Mac; notifications still post. Click to turn sound back on.',
    zoom: 'Silent while a Zoom meeting runs. Click to mute for good, or turn off Zoom auto-mute in the sound settings.',
    on: 'Alerts sound when an agent needs you, when something breaks and when work merges. Click to mute them on every Mac.',
  }[state];
  const html = `<button type="button" class="horn-mute is-${state}" data-horn="mute" aria-pressed="${muted}" title="${title}"${s ? '' : ' disabled'}>${state === 'on' ? HORN_ICON : HORN_OFF}<span>${label}</span></button>`
    + `<button type="button" class="horn-gear${down || sound.error ? ' warn' : ''}" data-horn="settings" aria-haspopup="dialog" aria-expanded="${Boolean(typeof soundPanelOpen === 'function' && soundPanelOpen())}"`
    + ` aria-label="Sound settings" title="${down ? 'Sound settings. The herald is not sounding alerts right now; open for why.' : 'Sound settings'}">${GEAR}</button>`;
  if (html !== sound.html) { hornBtns.innerHTML = html; sound.html = html; }
  if (typeof soundPanelSync === 'function') soundPanelSync();
}

hornEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-horn]');
  if (!b) return;
  if (b.dataset.horn === 'settings') {
    if (typeof soundPanelToggle === 'function') soundPanelToggle(b);
    return;
  }
  if (!sound.settings) return;
  const muted = !sound.settings.muted;
  // Shows the new state at once; the saved answer, or the next read on failure, settles it.
  sound.settings = { ...sound.settings, muted };
  hornUi();
  soundPost({ muted }).then((ok) => { if (!ok) soundRead(); });
});
hornUi();
soundRead();
