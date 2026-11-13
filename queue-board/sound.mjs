// sound.mjs: the board's sound settings and the one way to play a cue, shared by herald.mjs (which plays the alerts)
// and board.mjs (which serves /api/sound and plays the settings panel's Test buttons). The settings live in sound.json
// (queueBoard.soundFile, by default in paths.sharedDir, which the owner's file sync carries to every Mac), so Mute
// silences the herald on all of them. A missing or damaged file reads as the defaults: sound on, every event on, a reminder every 30 minutes, quiet during Zoom. The
// music's own volume (musicVolume) lives here too, for the header player (music.js); the herald ignores it.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { loadConfig, expandHome } from '../lib/config.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
// The board's config, or an empty one when there is no config file, so the tests and a bare checkout still load.
export function boardConfig() {
  try {
    const cfg = loadConfig();
    return { qb: cfg.queueBoard ?? {}, paths: cfg.paths };
  } catch {
    return { qb: {}, paths: { stateDir: expandHome('~/.agent-queue'), sharedDir: expandHome('~/.agent-queue/shared') } };
  }
}
const { qb, paths: PATHS } = boardConfig();
export const SETTINGS_FILE = qb.soundFile || path.join(PATHS.sharedDir, 'queue-board', 'sound.json');
export const STATUS_FILE = qb.heraldStatusFile || path.join(PATHS.stateDir, 'queue-board', 'herald-status.json');
export const EVENTS = ['needs', 'reminder', 'trouble', 'ci', 'merge', 'mainRed', 'mainGreen'];
export const DEFAULTS = Object.freeze({
  muted: false,
  volume: 70,
  musicVolume: 40,
  events: Object.freeze(Object.fromEntries(EVENTS.map((e) => [e, true]))),
  reminderMinutes: 30,
  autoMuteZoom: true,
});
// Every cue file under sounds/ and the event switch that governs it.
export const CUES = {
  needs: 'needs', reminder: 'reminder', trouble: 'trouble', ci: 'ci',
  'merge-rivendell': 'merge', 'merge-shire': 'merge', 'merge-erebor': 'merge', 'merge-rohan': 'merge',
  'main-red': 'mainRed', 'main-green': 'mainGreen',
};
const RANGE = { volume: [0, 100], musicVolume: [0, 100], reminderMinutes: [1, 240] };

const fresh = () => ({ ...DEFAULTS, events: { ...DEFAULTS.events } });
const isInt = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;

// Applies a partial update to settings and returns the result. Throws a plain message on any key this file does not
// know or any value of the wrong kind, so a bad request changes nothing.
export function applyUpdate(cur, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('expected a JSON object');
  const next = { ...cur, events: { ...cur.events } };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'muted' || k === 'autoMuteZoom') {
      if (typeof v !== 'boolean') throw new Error(`${k} must be true or false`);
      next[k] = v;
    } else if (Object.hasOwn(RANGE, k)) {
      if (!isInt(v, RANGE[k])) throw new Error(`${k} must be a whole number from ${RANGE[k][0]} to ${RANGE[k][1]}`);
      next[k] = v;
    } else if (k === 'events') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('events must be an object');
      for (const [e, on] of Object.entries(v)) {
        if (!EVENTS.includes(e)) throw new Error(`unknown event ${e}`);
        if (typeof on !== 'boolean') throw new Error(`events.${e} must be true or false`);
        next.events[e] = on;
      }
    } else {
      throw new Error(`unknown setting ${k}`);
    }
  }
  return next;
}

// The settings on disk, each field checked on its own: a field that is missing or wrong reads as its default.
export function readSettings() {
  const out = fresh();
  let raw;
  try { raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return out; }
  for (const k of ['muted', 'autoMuteZoom', 'volume', 'musicVolume', 'reminderMinutes']) {
    try { Object.assign(out, applyUpdate(out, { [k]: raw?.[k] })); } catch { /* keeps the default */ }
  }
  for (const e of EVENTS) {
    try { Object.assign(out, applyUpdate(out, { events: { [e]: raw?.events?.[e] } })); } catch { /* keeps the default */ }
  }
  return out;
}

export function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(`${SETTINGS_FILE}.tmp`, `${JSON.stringify(s, null, 2)}\n`);
  fs.renameSync(`${SETTINGS_FILE}.tmp`, SETTINGS_FILE);
}

// Plays one cue with afplay at volume (0 to 100) and returns the child, whose exit ends the sound. Callers that need
// to wait listen for its close event; the child is theirs to stop, by its PID.
export function play(cue, volume) {
  if (!Object.hasOwn(CUES, cue)) throw new Error(`unknown cue ${cue}`);
  const file = path.join(DIR, 'sounds', `${cue}.wav`);
  return spawn('/usr/bin/afplay', ['-v', (Math.max(0, Math.min(100, volume)) / 100).toFixed(2), file], { stdio: 'ignore' });
}

// A WAV file's length in seconds, from its header: the data chunk's size over the format chunk's bytes per second.
export function wavSeconds(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file} is not a WAV file`);
  let byteRate = 0;
  for (let at = 12; at + 8 <= b.length;) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(at + 16);
    if (id === 'data' && byteRate) return size / byteRate;
    at += 8 + size + (size % 2);
  }
  throw new Error(`${file} has no audio data`);
}
// Each cue's length, read once. A cue whose file can't be read counts as 3 seconds, so a warning still covers it.
const cueLengths = new Map();
export function cueSeconds(cue) {
  if (!cueLengths.has(cue)) {
    let s = 3;
    try { s = wavSeconds(path.join(DIR, 'sounds', `${cue}.wav`)); } catch { /* the default */ }
    cueLengths.set(cue, s);
  }
  return cueLengths.get(cue);
}

// Alerts come before the music (2026-11-06): each cue is announced to the board (announce(cue, seconds)), which tells
// every page playing music to duck out of its way, and plays ALERT_LEAD_MS later. The announcement gets that long and
// no more, so a board that is down, slow or broken never holds a cue back. player is play, or a stand-in in a test.
export const ALERT_LEAD_MS = 400;
export async function playAfterWarning(cue, volume, announce, player = play) {
  try {
    Promise.resolve(announce(cue, cueSeconds(cue))).catch(() => {});
  } catch { /* the cue plays anyway */ }
  await new Promise((resolve) => setTimeout(resolve, ALERT_LEAD_MS));
  return player(cue, volume);
}

// Whether a Zoom meeting is running on this Mac: Zoom starts its meeting process, CptHost, only for a meeting.
export function zoomInMeeting() {
  return new Promise((resolve) => {
    execFile('/usr/bin/pgrep', ['-x', 'CptHost'], { timeout: 5000 }, (err) => resolve(!err));
  });
}

// The herald's last report (herald.mjs writes it every cycle), or null when it has none. stale is set once it is
// over two minutes old, which means the herald is not running on this Mac.
export function readStatus() {
  try {
    const s = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    return { ...s, stale: !(Date.now() - Date.parse(s.at) < 120_000) };
  } catch {
    return null;
  }
}
