#!/usr/bin/env node
// herald.mjs: the queue herald. It reads the board's snapshot every 20 seconds, works out what changed
// (herald-events.mjs) and, for each new event, plays its cue with afplay and posts a macOS notification titled
// "Middle-earth" saying who and what, with the Forge's icon. A click on one opens the thing it is about (herald-links.mjs):
// a worker's session panel on the board, a Claude app session in the app, a machine's Fleet card, main's failing run.
// A merge and main going green play their sound and post no banner. It needs no browser, so the owner hears the queue while working in anything else.
// sound.json (sound.mjs) is read every cycle: Mute silences every sound and leaves the notifications, each event's
// switch turns that event off entirely, and while a Zoom meeting runs here it stays silent too (autoMuteZoom). The
// first read after a start only takes note, so a restart never sounds a burst. When the board stops answering it keeps
// trying quietly, posts one notification after 5 minutes, and on its return takes a fresh baseline and says so.
// Every cycle it writes the status file (queueBoard.heraldStatusFile), which the board's sound control shows, with the calls of the
// last ten minutes. Before each cue it tells the board (POST /api/alert) with whose calls the cue is for, so a page
// playing music ducks it out of the way first and the Middle-earth view shows who is calling (scene-call.js); the cue
// never waits on the board for more than that warning's 400 ms, so it plays whether or not the board answers.
//   node herald.mjs                                    run (launchd runs it so: install-herald.sh)
//   node herald.mjs --base http://board-mac:8787       read the board from another Mac
//   node herald.mjs --interval 5                       read every 5 seconds
//   node herald.mjs --snapshot-file snap.json          read that file each cycle instead of the board (a test)
//   node herald.mjs --dry                              log what it would play and post, and do neither
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { step } from './herald-events.mjs';
import { boardUrl, eventUrl, SOUND_ONLY } from './herald-links.mjs';
import { readSettings, playAfterWarning, cueSeconds, zoomInMeeting, boardConfig, ALERT_LEAD_MS, CUES, STATUS_FILE } from './sound.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const { qb, paths } = boardConfig();
const BASE = opt('--base', process.env.HERALD_BASE || `http://127.0.0.1:${Number(qb.port ?? 8787)}`).replace(/\/$/, '');
const INTERVAL_MS = Math.max(1, Number(opt('--interval', process.env.HERALD_INTERVAL || 20))) * 1000;
const FILE = opt('--snapshot-file', null);
const DRY = args.includes('--dry');
const DOWN_NOTICE_MS = 5 * 60_000;
// At most this many cues play in one cycle and this many notifications post; the rest fold into one summary.
const MAX_CUES = 3;
const MAX_NOTES = 4;
// How long a call stays in the status file, and at most how many.
const CALLS_MS = 10 * 60_000;
const MAX_CALLS = 12;
const HOST = os.hostname().split('.')[0];

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
let state = null;
let downSince = null;
let downNoticed = false;
let lastEvent = null;
let calls = [];
let playing = null;

async function readSnapshot() {
  if (FILE) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const res = await fetch(`${BASE}/api/snapshot`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// A notification goes out through the herald's own app (herald-notifier.swift, built by install-herald.sh), so it
// carries the Forge's icon. Where that app is missing, not allowed yet or fails, it goes out through osascript instead,
// from Script Editor's identity. Either way the text goes in as arguments, never
// into a script, so nothing in a title can break out of it.
// HERALD_NOTIFIER points a herald at another build of it (install-herald.sh --staging-notifier).
const NOTIFIER = process.env.HERALD_NOTIFIER || path.join(qb.heraldNotifierApp || path.join(paths.stateDir, 'queue-board', 'Forge Herald.app'), 'Contents/MacOS/forge-herald');
const run = (file, argv) => new Promise((resolve) => { execFile(file, argv, { timeout: 10_000 }, (err, _out, stderr) => resolve(err ? String(stderr || err.message).trim().split('\n')[0] : null)); });
let notifierDown = null;
// The link goes in as a fourth argument, which the notifier opens on a click; through osascript a click opens nothing.
async function notify(head, body, url = null) {
  if (DRY) return log(`would post: ${head} | ${body}${url ? ` | opens ${url}` : ''}`);
  if (fs.existsSync(NOTIFIER)) {
    const failed = await run(NOTIFIER, ['Middle-earth', head, body || head, ...(url ? [url] : [])]);
    if (!failed) { notifierDown = null; return; }
    if (failed !== notifierDown) log(`Forge Herald could not post, so notifications go through osascript: ${failed}`);
    notifierDown = failed;
  }
  const failed = await run('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title "Middle-earth" subtitle (item 1 of argv)',
    '-e', 'end run', head, body || head]);
  if (failed) log(`could not post a notification: ${failed}`);
}

// Tells the board a cue of this many seconds is about to play, and whose calls it is for. Only a caller on the board's
// own Mac may.
function warnBoard(cue, seconds, mine) {
  return fetch(`${BASE}/api/alert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Board': 'alert' },
    body: JSON.stringify({ cue, seconds, calls: mine }), signal: AbortSignal.timeout(ALERT_LEAD_MS),
  });
}

// Plays cues one after another, each after its warning to the board, and resolves when the last ends. Each cue goes
// with the calls of the events that rang it.
async function playAll(cues, volume, fresh) {
  for (const cue of cues) {
    const mine = fresh.filter((c) => c.cue === cue).slice(0, 6);
    if (DRY) { log(`would warn the board and play: ${cue} for ${mine.map((c) => c.head).join('; ')}`); continue; }
    const child = await playAfterWarning(cue, volume, (c, seconds) => warnBoard(c, seconds, mine));
    playing = child;
    await new Promise((resolve) => {
      child.on('close', resolve);
      child.on('error', (e) => { log(`could not play ${cue}: ${e.message}`); resolve(); });
    });
    playing = null;
  }
}

// Where a click on a notification goes: worked out from the latest snapshot's board address and repo.
let links = { board: boardUrl(null, BASE, HOST), here: HOST };
async function announce(events, settings, silent) {
  const on = events.filter((e) => settings.events[e.kind] !== false);
  if (!on.length) return;
  for (const e of on) log(`${e.kind}: ${e.head}${silent ? ` (silent: ${silent})` : ''}`);
  const at = Date.now();
  lastEvent = { at: new Date(at).toISOString(), kind: on[0].kind, head: on[0].head };
  // Each call is named by its event and when it came, so the board's push and the status file name it the same.
  const fresh = on.map((e) => ({ id: `${e.key}@${at}`, at, kind: e.kind, cue: e.cue, head: e.head, who: e.who ?? null }));
  calls = [...fresh, ...calls.filter((c) => at - c.at < CALLS_MS)].slice(0, MAX_CALLS);
  const banners = on.filter((e) => !SOUND_ONLY.has(e.kind));
  const shown = banners.slice(0, MAX_NOTES);
  for (const e of shown) await notify(e.head, e.body, eventUrl(e, links));
  if (banners.length > shown.length) {
    await notify(`And ${banners.length - shown.length} more`, banners.slice(MAX_NOTES).map((e) => e.head).join('; ').slice(0, 220), links.board && `${links.board}#sec-needs`);
  }
  if (silent) return;
  const cues = [...new Set(on.map((e) => e.cue))].slice(0, MAX_CUES);
  await playAll(cues, settings.volume, fresh);
}

function writeStatus(fields) {
  const now = Date.now();
  const s = { at: new Date(now).toISOString(), host: HOST, pid: process.pid, base: FILE ? `file:${FILE}` : BASE, intervalSeconds: INTERVAL_MS / 1000, lastEvent,
    calls: calls.filter((c) => now - c.at < CALLS_MS), ...fields };
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(`${STATUS_FILE}.tmp`, JSON.stringify(s));
    fs.renameSync(`${STATUS_FILE}.tmp`, STATUS_FILE);
  } catch (e) {
    log(`could not write the status file: ${e.message}`);
  }
}

async function cycle() {
  const settings = readSettings();
  const zoom = process.platform === 'darwin' ? await zoomInMeeting() : false;
  const autoMuted = settings.autoMuteZoom && zoom;
  const silent = settings.muted ? 'muted' : autoMuted ? 'Zoom meeting' : null;
  let snap;
  try {
    snap = await readSnapshot();
  } catch (e) {
    const now = Date.now();
    downSince ??= now;
    if (!downNoticed && now - downSince >= DOWN_NOTICE_MS) {
      downNoticed = true;
      log(`board unreachable since ${new Date(downSince).toISOString()}: ${e.message}`);
      await notify('The queue board is not answering', `${BASE} has not answered for 5 minutes. The herald keeps trying.`, links.board);
    }
    writeStatus({ boardOk: false, boardDownSince: new Date(downSince).toISOString(), zoom, muted: settings.muted, autoMuted, waiting: null });
    return;
  }
  // Back after a long outage: what changed meanwhile is old news, so start from a fresh baseline and say what waits.
  links = { board: boardUrl(snap, BASE, HOST), here: HOST, repo: snap.board?.repo };
  const back = downNoticed;
  if (back) state = null;
  downSince = null;
  downNoticed = false;
  const out = step(state, snap, Date.now(), { reminderMinutes: settings.reminderMinutes });
  const first = !state;
  state = out.state;
  if (first) {
    const n = Object.keys(state.firstSeen).length;
    log(`${back ? 'board is back' : 'first read'}: ${n} waiting on the owner, main ${state.main.status}`);
    if (back) await notify('The queue board is back', n ? `${n} ${n === 1 ? 'thing waits' : 'things wait'} on you.` : 'Nothing waits on you.', links.board && `${links.board}#sec-needs`);
  }
  writeStatus({ boardOk: true, boardDownSince: null, zoom, muted: settings.muted, autoMuted, waiting: first ? Object.keys(state.firstSeen).length : out.waiting });
  await announce(out.events, settings, silent);
}

// One cycle at a time: the next read is scheduled when this one, and any cue it plays, has finished.
async function loop() {
  try {
    await cycle();
  } catch (e) {
    log(`cycle failed: ${e.stack?.split('\n').slice(0, 2).join(' ') ?? e}`);
  }
  setTimeout(loop, INTERVAL_MS);
}

// launchd stops it with SIGTERM; a cue still playing stops with it.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (playing?.pid) { try { process.kill(playing.pid); } catch { /* already ended */ } }
    process.exit(0);
  });
}
// Each cue's length, read from its file once at start, goes with its warning.
for (const cue of Object.keys(CUES)) cueSeconds(cue);
log(`herald started on ${HOST}, reading ${FILE ? FILE : BASE} every ${INTERVAL_MS / 1000}s${DRY ? ', dry run' : ''}`);
loop();
