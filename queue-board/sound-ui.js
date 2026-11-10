// sound-ui.js: the sound settings, a small panel that opens from the button beside Mute in the header (horn.js). It
// holds the alert volume, a switch per alert with a Test button that plays that cue on the board's machine, how often the
// reminder comes while something waits, the music's own volume (music.js), Zoom auto-mute and one line on whether the
// herald is running. Every change saves at once to sound.json through /api/sound, which the herald reads on its next cycle. An
// alert switched off neither sounds nor posts its notification; Mute silences the sounds and leaves the notifications.
// It also carries the CSS for the header control and this panel. Uses horn.js's sound, soundPost and hornUi, and
// page.html's esc and ago.
const SOUND_ROWS = [
  ['needs', 'Needs you', 'A worker or a session waits on you, or a PR waits on your merge', ['needs']],
  ['reminder', 'Reminder', 'While anything still waits on you', ['reminder']],
  ['trouble', 'Trouble', 'A ticket stuck, a machine out of reach or paused', ['trouble']],
  ['ci', 'CI failing', 'An orc attacks: a live PR fails its checks', ['ci']],
  ['merge', 'Merged', 'Each realm calls in its own voice', ['merge-rivendell', 'merge-shire', 'merge-erebor']],
  ['mainRed', 'Main red', 'The war horn, again every 15 minutes while red', ['main-red']],
  ['mainGreen', 'Main green again', 'A short victory call', ['main-green']],
];
const SOUND_TEST = { 'merge-rivendell': 'Rivendell', 'merge-shire': 'Shire', 'merge-erebor': 'Erebor' };

const soundStyle = document.createElement('style');
soundStyle.textContent = `
.horn { position: relative; }
.horn .horn-btns { display: flex; align-items: center; gap: 5px; }
.horn .horn-mute.is-muted { color: var(--bad); font-weight: 700; background: color-mix(in srgb, var(--bad) 14%, var(--raised)); border-color: color-mix(in srgb, var(--bad) 60%, var(--line-2)); }
.horn .horn-mute.is-zoom { color: var(--warn); font-weight: 700; background: color-mix(in srgb, var(--warn) 12%, var(--raised)); border-color: color-mix(in srgb, var(--warn) 55%, var(--line-2)); }
.horn .horn-mute.is-muted svg, .horn .horn-mute.is-zoom svg { width: 14px; height: 14px; }
.horn .horn-gear { padding: 0 6px; }
.horn .horn-gear.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 55%, var(--line-2)); }
.sound-panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; width: 340px; max-width: calc(100vw - 32px); padding: 12px 14px 10px;
  background: var(--raised); border: 1px solid var(--line-2); border-radius: 6px; box-shadow: 0 8px 28px rgb(0 0 0 / 0.22); color: var(--ink); font: 400 13px/1.35 var(--sans); }
.sound-panel[hidden] { display: none; }
.sound-panel h3 { margin: 0 0 8px; font: 600 12px/1 var(--display, var(--sans)); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2); }
.sound-panel .sp-vol { display: grid; grid-template-columns: 6.6em 1fr 3ch; align-items: center; gap: 10px; padding: 2px 0 10px; border-bottom: 1px solid var(--line); }
.sound-panel .sp-vol.sp-music { padding: 9px 0 8px; border-bottom: 0; }
.sound-panel input[type=range] { width: 100%; accent-color: var(--accent); }
.sound-panel .sp-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 7px 0; border-bottom: 1px solid var(--line); }
.sound-panel .sp-row:last-of-type { border-bottom: 0; }
.sound-panel .sp-name { font-weight: 600; }
.sound-panel .sp-hint { grid-column: 2 / -1; color: var(--ink-3); font-size: 12px; }
.sound-panel .sp-tests { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.sound-panel button.sp-test { height: 22px; padding: 0 7px; font: 500 11.5px/1 var(--sans); color: var(--ink-2); background: var(--panel); border: 1px solid var(--line-2); border-radius: 3px; cursor: pointer; }
.sound-panel button.sp-test:hover { color: var(--ink); background: var(--sunk); }
.sound-panel input[type=checkbox] { width: 15px; height: 15px; margin: 0; accent-color: var(--accent); }
.sound-panel input[type=number] { width: 4.5em; font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line-2); border-radius: 3px; padding: 1px 4px; }
.sound-panel .sp-every { color: var(--ink-2); font-size: 12px; white-space: nowrap; }
.sound-panel .sp-zoom { display: flex; align-items: center; gap: 10px; padding: 9px 0 7px; border-top: 1px solid var(--line-2); }
.sound-panel .sp-status { margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--ink-3); font-size: 12px; }
.sound-panel .sp-status.bad, .sound-panel .sp-err { color: var(--bad); }
.sound-panel .sp-err { font-size: 12px; padding-top: 6px; }
/* On a phone it is a sheet along the bottom of the screen. */
@media (max-width: 899px) { .sound-panel { position: fixed; top: auto; bottom: 16px; right: 16px; left: 16px; width: auto; max-width: none; max-height: calc(100dvh - 32px); overflow-y: auto; } }
`;
document.head.append(soundStyle);

const soundPanel = document.createElement('div');
soundPanel.className = 'sound-panel';
soundPanel.setAttribute('role', 'dialog');
soundPanel.setAttribute('aria-label', 'Sound settings');
soundPanel.hidden = true;
const soundPanelOpen = () => !soundPanel.hidden;

function soundPanelBuild() {
  const rows = SOUND_ROWS.map(([key, name, hint, cues]) => `<label class="sp-row"><input type="checkbox" data-ev="${key}" aria-label="${esc(name)}">
    <span class="sp-name">${esc(name)}</span>
    <span class="sp-tests">${key === 'reminder' ? '<span class="sp-every">every <input type="number" min="1" max="240" step="1" data-sp="reminderMinutes" aria-label="Minutes between reminders"> min</span>' : ''}${cues
      .map((c) => `<button type="button" class="sp-test" data-test="${c}" aria-label="Play ${esc(SOUND_TEST[c] ? `the ${SOUND_TEST[c]} merge` : name)} now" title="Play it now on ${esc(boardName())}">${SOUND_TEST[c] ?? 'Test'}</button>`).join('')}</span>
    <span class="sp-hint">${esc(hint)}</span></label>`).join('');
  soundPanel.innerHTML = `<h3>Sound</h3>
    <div class="sp-vol"><span>Alert volume</span><input type="range" min="0" max="100" step="5" data-sp="volume" aria-label="Alert volume"><output></output></div>
    ${rows}
    <div class="sp-vol sp-music"><span>Music volume</span><input type="range" min="0" max="100" step="5" data-sp="musicVolume" aria-label="Music volume"><output></output></div>
    <label class="sp-zoom"><input type="checkbox" data-sp="autoMuteZoom" aria-label="Quiet while a Zoom meeting runs"><span>Quiet while a Zoom meeting runs</span></label>
    <div class="sp-status"></div><div class="sp-err" hidden></div>`;
}
soundPanelBuild();
hornEl.append(soundPanel);

// The herald's state in one line.
function soundHeraldLine() {
  const h = sound.herald;
  if (!h) return ['bad', 'The herald is not installed here, so no alert sounds. Install it with install-herald.sh.'];
  if (h.stale) return ['bad', `The herald stopped ${ago(h.at)}, so no alert sounds. Restart it with install-herald.sh.`];
  if (!h.boardOk) return ['bad', `The herald can't reach the board (since ${ago(h.boardDownSince)}).`];
  const quiet = sound.settings?.muted ? ', muted' : h.autoMuted ? ', quiet for Zoom' : '';
  const waits = h.waiting ? `, ${h.waiting} waiting on you` : '';
  return ['', `Herald running on ${h.host}${quiet}${waits}. Last alert: ${h.lastEvent ? `${h.lastEvent.head}, ${ago(h.lastEvent.at)}` : 'none yet'}.`];
}

// Puts the current settings into the panel, leaving alone a field that has focus so typing isn't overwritten.
function soundPanelSync() {
  const s = sound.settings;
  hornEl.querySelector('[data-horn="settings"]')?.setAttribute('aria-expanded', String(soundPanelOpen()));
  if (!s || soundPanel.hidden) return;
  const set = (el, prop, v) => { if (el && el !== document.activeElement) el[prop] = v; };
  for (const k of ['volume', 'musicVolume']) {
    const el = soundPanel.querySelector(`[data-sp="${k}"]`);
    set(el, 'value', s[k]);
    if (el !== document.activeElement) el.nextElementSibling.textContent = s[k];
  }
  set(soundPanel.querySelector('[data-sp="reminderMinutes"]'), 'value', s.reminderMinutes);
  set(soundPanel.querySelector('[data-sp="autoMuteZoom"]'), 'checked', s.autoMuteZoom);
  for (const el of soundPanel.querySelectorAll('[data-ev]')) set(el, 'checked', s.events[el.dataset.ev] !== false);
  const [cls, text] = soundHeraldLine();
  const line = soundPanel.querySelector('.sp-status');
  line.className = `sp-status ${cls}`;
  line.textContent = text;
  const err = soundPanel.querySelector('.sp-err');
  err.hidden = !sound.error;
  err.textContent = sound.error ?? '';
}

function soundPanelToggle() {
  soundPanel.hidden = !soundPanel.hidden;
  if (!soundPanel.hidden) soundRead();
  soundPanelSync();
}

soundPanel.addEventListener('click', (e) => {
  e.stopPropagation();
  const b = e.target.closest('[data-test]');
  if (b) {
    e.preventDefault();
    soundPost(null, b.dataset.test);
  }
});
soundPanel.addEventListener('input', (e) => {
  if (e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value;
});
soundPanel.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.ev) return soundPost({ events: { [el.dataset.ev]: el.checked } });
  if (el.dataset.sp === 'autoMuteZoom') return soundPost({ autoMuteZoom: el.checked });
  if (el.dataset.sp === 'volume' || el.dataset.sp === 'musicVolume') return soundPost({ [el.dataset.sp]: Number(el.value) });
  if (el.dataset.sp === 'reminderMinutes') {
    const n = Math.round(Number(el.value));
    if (!(n >= 1 && n <= 240)) { el.value = sound.settings.reminderMinutes; return null; }
    return soundPost({ reminderMinutes: n });
  }
  return null;
});
// A click outside or Escape closes it.
document.addEventListener('click', (e) => {
  if (!soundPanel.hidden && !hornEl.contains(e.target)) { soundPanel.hidden = true; soundPanelSync(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !soundPanel.hidden) { soundPanel.hidden = true; soundPanelSync(); hornEl.querySelector('[data-horn="settings"]')?.focus(); }
});
