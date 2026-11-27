// music.js: the music player in the header, beside Mute (horn.js), in every view. It plays the owner's own Lord of
// the Rings soundtrack MP3s from the board's machine (music.mjs lists and serves them from the config's folder; the board only reads them) as one continuous
// mix: a shuffled order of every track, none played twice until all have played, then a new order, each track fading
// into the next over four seconds on two audio elements. The play button (its icon alone) starts and pauses it, Next skips ahead, and while it
// plays the header shows the track, its album and a thin line of how far it has got. Its loudness is the sound
// settings' Music volume (sound-ui.js), apart from the alerts. When the board is muted, or the herald keeps quiet for a
// Zoom meeting, it fades out and pauses, and on unmute it comes back only if it was playing. The order, the track and
// the place in it stay in localStorage, so a reload carries on; a browser that wants a click before sound resumes on
// the first click or key. One tab plays at a time: a tab that starts the music stops it in any other. Alerts come
// first: music-duck.js ducks it while each alert sounds. Its CSS sits in page.html beside the sound control's. Uses horn.js's sound, soundZoom and hornEl, sound-ui.js's soundPanel and
// page.html's esc.
const MUSIC_FADE = 4;
const MUSIC_KEY = 'board.music';
const MUSIC_LIST_MS = 10 * 60_000;
const music = { tracks: [], byId: new Map(), root: '', error: null, failed: false, order: [], pos: 0, at: 0, on: false, live: false,
  waiting: false, ctx: null, master: null, duck: null, decks: [], cur: 0, errors: 0, savedAt: 0, listAt: 0, holdTimer: null, html: '' };
const musicBus = typeof BroadcastChannel === 'function' ? new BroadcastChannel('board-music') : null;
const musicEl = document.createElement('div');
musicEl.className = 'music';
hornEl.before(musicEl);
const MU_PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6v8.8L10.2 6z" fill="currentColor"/></svg>';
const MU_PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 1.6h2.6v8.8H2.4zM7 1.6h2.6v8.8H7z" fill="currentColor"/></svg>';
const MU_NEXT = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.6 1.6v8.8L7.6 6zM8.2 1.6h2.2v8.8H8.2z" fill="currentColor"/></svg>';

// --- the order and where it is ----------------------------------------------------------------------------------
// Storage can be missing or refuse (a private window, blocked site data); the music still plays, it just won't carry over.
function musicStore(value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(MUSIC_KEY)) ?? {};
    localStorage.setItem(MUSIC_KEY, JSON.stringify(value));
  } catch { /* plays on without remembering */ }
  return {};
}
function musicSave() {
  music.savedAt = Date.now();
  const d = musicDeck();
  // Until a loaded track has its metadata, its place is the one it will seek to.
  const at = d.id && d.id === music.order[music.pos] ? (d.el.readyState ? d.el.currentTime : d.at) : music.at;
  musicStore({ order: music.order, pos: music.pos, at, on: music.on });
}
// Takes the saved order and place, which another tab may have moved on since this one last played. Answers whether
// the music was on.
function musicRestore() {
  const s = musicStore();
  if (Array.isArray(s.order) && s.order.every((x) => typeof x === 'string')) {
    music.order = s.order;
    music.pos = Number.isInteger(s.pos) && s.pos >= 0 && s.pos < s.order.length ? s.pos : 0;
    music.at = Number(s.at) > 0 ? Number(s.at) : 0;
  }
  return s.on === true;
}
function musicShuffle(ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Every track has played: a new order, which never opens with the track that just ended.
function musicReshuffle() {
  const last = music.order.at(-1);
  music.order = musicShuffle(music.tracks.map((t) => t.id));
  if (music.order.length > 1 && music.order[0] === last) [music.order[0], music.order[1]] = [music.order[1], music.order[0]];
  music.pos = 0;
}
// Keeps the order across a rescan: a track that left drops out, and a new one (a new album) joins somewhere still to
// come, so it plays in this round.
function musicMerge() {
  const cur = music.order[music.pos];
  const order = music.order.filter((id) => music.byId.has(id) || id === cur);
  const known = new Set(order);
  const pos = Math.max(0, order.indexOf(cur));
  for (const id of musicShuffle(music.tracks.map((t) => t.id).filter((x) => !known.has(x)))) {
    order.splice(order.length ? pos + 1 + Math.floor(Math.random() * (order.length - pos)) : 0, 0, id);
  }
  music.order = order;
  music.pos = Math.max(0, order.indexOf(cur));
}
async function musicList() {
  music.listAt = Date.now();
  try {
    const r = await fetch('/api/music', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    Object.assign(music, { tracks: body.tracks, root: body.root, error: body.error, byId: new Map(body.tracks.map((t) => [t.id, t])) });
    musicMerge();
  } catch (e) {
    music.error = `could not list the music: ${e.message}`;
  }
  musicApply();
}

// --- playback: two decks, each an audio element through its own gain into a master gain at the music volume, then a
// duck gain that music-duck.js lowers while an alert sounds -----------------------------------------------------------
const musicDeck = () => music.decks[music.cur];
const musicLevel = () => (sound.settings?.musicVolume ?? 40) / 100;
// Quiet while the board is muted, while the herald keeps quiet for Zoom, and until the settings have been read.
const musicQuiet = () => !sound.settings || sound.settings.muted || Boolean(sound.settings.autoMuteZoom && soundZoom());
for (let i = 0; i < 2; i += 1) {
  const d = { el: new Audio(), id: null, at: 0, gain: null, stopTimer: null };
  d.el.preload = 'auto';
  d.el.addEventListener('timeupdate', () => musicTick(d));
  d.el.addEventListener('ended', () => { if (d === musicDeck() && music.live) musicNext(0); });
  d.el.addEventListener('playing', () => { if (d === musicDeck()) Object.assign(music, { errors: 0, failed: false }); });
  d.el.addEventListener('error', () => musicFail(d));
  music.decks.push(d);
}
// Built on the first play, inside the click, so the browser lets it sound.
function musicGraph() {
  if (music.ctx) return;
  music.ctx = new AudioContext();
  music.master = music.ctx.createGain();
  music.master.gain.value = 0;
  music.duck = music.ctx.createGain();
  music.master.connect(music.duck).connect(music.ctx.destination);
  for (const d of music.decks) {
    d.gain = music.ctx.createGain();
    music.ctx.createMediaElementSource(d.el).connect(d.gain).connect(music.master);
  }
}
function musicRamp(param, to, secs, from = param.value) {
  const t = music.ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(from, t);
  param.linearRampToValueAtTime(to, t + Math.max(secs, 0.02));
}
function musicLoad(d, id, at) {
  clearTimeout(d.stopTimer);
  Object.assign(d, { id, at: at > 1 ? at : 0 });
  d.el.src = `/music/${id}`;
  if (d.gain) musicRamp(d.gain.gain, 1, 0.02);
  if (!d.at) return;
  d.el.addEventListener('loadedmetadata', () => {
    if (d.id === id) d.el.currentTime = Math.min(at, Math.max(0, d.el.duration - MUSIC_FADE - 2));
  }, { once: true });
}
// Empties a deck, so it holds no file and no connection to the board.
const musicClear = (d) => { d.el.pause(); d.el.removeAttribute('src'); d.el.load(); d.id = null; };

function musicStart() {
  musicGraph();
  clearTimeout(music.holdTimer);
  const d = musicDeck();
  if (d.id !== music.order[music.pos]) musicLoad(d, music.order[music.pos], music.at);
  music.at = 0;
  music.ctx.resume().catch(() => {});
  Object.assign(music, { live: true, waiting: false });
  d.el.play().catch((e) => { if (e.name === 'NotAllowedError') musicWait(); });
  musicRamp(music.master.gain, musicLevel(), 1.5);
  // A browser that wants a click before any sound leaves the audio suspended.
  setTimeout(() => { if (music.live && music.ctx.state !== 'running') musicWait(); }, 800);
  musicBus?.postMessage('play');
  musicMeta();
}
function musicWait() {
  Object.assign(music, { live: false, waiting: true });
  for (const d of music.decks) d.el.pause();
  musicUi();
}
// Fades out over secs, then pauses. save is false when another tab took over, so this one leaves its record alone.
function musicHold(secs, save = true) {
  music.live = false;
  musicRamp(music.master.gain, 0, secs);
  clearTimeout(music.holdTimer);
  music.holdTimer = setTimeout(() => {
    for (const d of music.decks) if (d === musicDeck()) d.el.pause(); else musicClear(d);
    music.ctx.suspend().catch(() => {});
    if (save) musicSave();
  }, secs * 1000 + 100);
}
// Moves to the next track in the order, fading over fade seconds when playing.
function musicNext(fade) {
  if (!music.order.length) return;
  music.pos += 1;
  if (music.pos >= music.order.length) musicReshuffle();
  const from = musicDeck();
  music.cur = 1 - music.cur;
  const to = musicDeck();
  musicLoad(to, music.order[music.pos], 0);
  if (music.live) {
    musicRamp(to.gain.gain, 1, fade, fade ? 0 : 1);
    to.el.play().catch(() => {});
    musicRamp(from.gain.gain, 0, fade || 0.05);
    clearTimeout(from.stopTimer);
    from.stopTimer = setTimeout(() => { if (from !== musicDeck()) musicClear(from); }, (fade || 0.05) * 1000 + 300);
  } else if (from.id) musicClear(from);
  musicSave();
  musicUi();
  musicMeta();
}
// A file that won't play (gone, or unreadable) is skipped and the list read again; five in a row stop the music, and
// the button says so.
function musicFail(d) {
  if (d !== musicDeck() || !d.id) return;
  music.errors += 1;
  if (music.errors === 1) musicList();
  if (music.errors < 5) return musicNext(0);
  Object.assign(music, { failed: true, on: false, waiting: false });
  if (music.live) musicHold(0.1);
  return musicUi();
}
function musicTick(d) {
  if (d !== musicDeck()) return;
  musicBar();
  const { currentTime: t, duration: len } = d.el;
  if (!music.live) return;
  if (len > MUSIC_FADE * 3 && len - t <= MUSIC_FADE) musicNext(MUSIC_FADE);
  else if (Date.now() - music.savedAt > 5000) musicSave();
  if (Date.now() - music.listAt > MUSIC_LIST_MS) musicList();
}
// What should happen now, from Music, the board's mute and the herald's Zoom quiet.
function musicApply() {
  const want = music.on && !musicQuiet() && music.order.length > 0;
  if (want && !music.live) musicStart();
  else if (!want && music.live) musicHold(music.on ? 1.5 : 0.6);
  else if (music.live) musicRamp(music.master.gain, musicLevel(), 0.3);
  musicUi();
}
function musicSetOn(on) {
  if (on && !music.on) { musicRestore(); musicMerge(); }
  music.on = on;
  if (!on) music.waiting = false;
  musicApply();
  musicSave();
}

// --- the control ------------------------------------------------------------------------------------------------
function musicBar() {
  const d = musicDeck();
  const bar = musicEl.querySelector('.mu-bar b');
  if (bar && d.el.duration) bar.style.width = `${((100 * d.el.currentTime) / d.el.duration).toFixed(1)}%`;
}
function musicUi() {
  if (typeof musicAlerts === 'function') musicAlerts(music.on);
  const t = music.byId.get(music.order[music.pos]);
  const state = !music.tracks.length ? 'none' : music.waiting ? 'wait' : music.on && musicQuiet() ? 'held' : music.on ? 'on' : 'off';
  const tip = {
    none: music.error ? `No music: ${music.error}.` : music.root ? `No MP3s in ${music.root}.` : 'Reading the music list.',
    wait: 'This browser wants a click first: click anywhere to carry on with the music.',
    held: 'Paused while the board is muted; it plays again when you unmute. Click to stop it.',
    on: 'Pause the music.',
    off: music.failed ? 'The last few tracks would not play. Click to try again.' : 'Play the soundtrack, shuffled.',
  }[state];
  const now = t && ['on', 'held', 'wait'].includes(state)
    ? `<button type="button" class="mu-next" data-mu="next" aria-label="Next track" title="Next track">${MU_NEXT}</button>`
      + `<span class="mu-now" title="${esc(t.title)}${t.album ? `, ${esc(t.album)}` : ''}"><span class="mu-t">${esc(t.title)}</span>`
      + `<span class="mu-a">${esc(t.album)}</span><i class="mu-bar"><b></b></i></span>`
    : '';
  const html = `<button type="button" class="mu-play is-${state}" data-mu="play" aria-pressed="${music.on}" aria-label="Music" title="${esc(tip)}"${state === 'none' ? ' disabled' : ''}>`
    + `${music.on && state !== 'wait' ? MU_PAUSE : MU_PLAY}</button>${now}`;
  if (html !== music.html) { musicEl.innerHTML = html; music.html = html; musicEl.dataset.state = state; }
  musicBar();
}
// The Mac's media keys and its now-playing panel drive the player through its own state.
function musicMeta() {
  const t = music.byId.get(music.order[music.pos]);
  if (t && 'mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, album: t.album });
}
for (const [action, fn] of [['play', () => musicSetOn(true)], ['pause', () => musicSetOn(false)], ['nexttrack', () => musicNext(music.live ? 1 : 0)]]) {
  try { navigator.mediaSession?.setActionHandler(action, fn); } catch { /* not offered here */ }
}

musicEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mu]');
  if (!b) return;
  if (b.dataset.mu === 'next') {
    musicNext(music.live ? 1 : 0);
    if (music.waiting) musicApply();
  } else musicSetOn(!(music.on && (music.live || musicQuiet())));
});
// A click or key anywhere else carries on music the browser held back.
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, (e) => { if (music.waiting && !musicEl.contains(e.target)) musicApply(); }, true);
}
window.addEventListener('board-sound', musicApply);
soundPanel.addEventListener('input', (e) => {
  if (e.target.dataset.sp === 'musicVolume' && music.live) musicRamp(music.master.gain, Number(e.target.value) / 100, 0.1);
});
addEventListener('pagehide', () => { if (music.on) musicSave(); });
musicBus?.addEventListener('message', (e) => {
  if (e.data === 'who' && music.on) musicBus.postMessage('here');
  if (e.data !== 'play' || !music.on) return;
  Object.assign(music, { on: false, waiting: false });
  if (music.live) musicHold(0.6, false);
  musicUi();
});

// On load: the saved order and place, then the list; music that was on carries on unless another tab has it.
const musicWasOn = musicRestore();
musicUi();
musicList().then(() => {
  if (!musicWasOn) return;
  let other = false;
  const hear = (e) => { if (e.data === 'here') other = true; };
  musicBus?.addEventListener('message', hear);
  musicBus?.postMessage('who');
  setTimeout(() => { musicBus?.removeEventListener('message', hear); if (!other) musicSetOn(true); }, 300);
});
