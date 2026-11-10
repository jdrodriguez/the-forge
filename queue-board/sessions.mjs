#!/usr/bin/env node
// sessions.mjs: prints this machine's Claude app sessions as JSON, for the queue board's Sessions view (sessions.js).
//   node sessions.mjs
// The Claude desktop app keeps one record per Code session (claude-code-sessions/**/local_*.json in its Application
// Support folder) and rewrites it as the session works. After each turn it adds a summary: a category (completed,
// review_ready, blocked), a one-line detail and, when the session needs the human, what it needs (needs_action). The
// record also says when they last opened the session (lastFocusedAt), when its last turn ended (lastTurnEdgeAt), the session
// that started it (spawnedFrom), the routine that ran it (scheduledTaskId) and any error. This reads the records of the
// last 14 days that aren't archived and gives each a state the view sorts by. Older ones are only counted, from a small
// cache of each file's archived flag by modification time, so a scan reads only the records that changed. It reads the
// app's files and changes none of them. A machine without the app prints none: true.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../lib/config.mjs';

const HOME = os.homedir();
const ROOT = path.join(HOME, 'Library/Application Support/Claude/claude-code-sessions');
const CACHE = path.join(loadConfig().paths.stateDir, 'queue-board-sessions-cache.json');
const DAY = 864e5;
const RECENT_DAYS = 14;
const QUIET_DAYS = 2;
// A turn whose last activity is this long after its start, with no summary yet, is still running...
const MID_TURN_MS = 5000;
// ...until it has been silent this long; then it stopped mid-turn, most likely on a prompt in the app.
const WORKING_MS = 10 * 60_000;
const now = Date.now();

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function files() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^local_.*\.json$/.test(e.name)) out.push(p);
    }
  };
  walk(ROOT);
  return out;
}

// What a session needs, from its record: still working, stopped mid-turn, needs the human, ready for their review,
// errored, finished since they last opened it, quiet (done and seen, nothing for two days), or done.
function stateOf(s) {
  const ps = s.postTurnSummary;
  const summarized = ps && s.postTurnSummaryFor === s.lastAssistantUuid;
  const midTurn = (s.lastActivityAt ?? 0) - (s.lastTurnEdgeAt ?? 0) > MID_TURN_MS && !summarized && s.lastTurnEdgeAt;
  if (midTurn) return now - s.lastActivityAt < WORKING_MS ? 'working' : 'stopped';
  if (ps?.needs_action) return 'needs';
  if (s.error) return 'error';
  if (ps?.status_category === 'review_ready') return 'review';
  if ((s.lastActivityAt ?? 0) > (s.lastFocusedAt ?? 0) + 60_000) return 'unseen';
  if (now - (s.lastActivityAt ?? 0) > QUIET_DAYS * DAY) return 'quiet';
  return 'done';
}

// What a row sends goes into the page's markup, and a session file is only as trustworthy as the machine it sits on.
// So a time goes out only if it is a number, and a PR link only if it is an https address.
const when = (t) => (Number.isFinite(t) ? t : null);
function row(s) {
  const ps = s.postTurnSummary ?? {};
  const prs = (s.prs ?? []).filter((p) => /^https:\/\//.test(p?.url ?? '')).slice(-3).map((p) => ({ url: p.url, number: p.prNumber, state: p.state }));
  return {
    id: s.sessionId,
    cli: s.cliSessionId ?? null,
    title: clip(s.title || 'Untitled session', 120),
    folder: s.cwd ?? s.originCwd ?? null,
    state: stateOf(s),
    createdAt: when(s.createdAt),
    activityAt: when(s.lastActivityAt),
    focusedAt: when(s.lastFocusedAt),
    userAt: when(s.latestUserFrameAt),
    ask: ps.needs_action ? clip(ps.needs_action, 400) : null,
    detail: clip(ps.status_detail, 160) || null,
    report: clip(s.lastTurnReport, 400) || null,
    error: s.error ? clip(s.error, 160) : null,
    routine: s.scheduledTaskId ?? null,
    // spawnedFrom.title is the side session's own first title, so the view looks the parent up by id.
    parent: s.spawnedFrom?.sessionId ?? null,
    remote: Boolean(s.remoteControlSpawn),
    starred: Boolean(s.isStarred),
    prs,
  };
}

if (!fs.existsSync(ROOT)) {
  console.log(JSON.stringify({ now: new Date(now).toISOString(), none: true }));
  process.exit(0);
}
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* the first scan reads every record */ }
const nextCache = {};
const rows = [];
let older = 0;
for (const file of files()) {
  const mtime = fs.statSync(file).mtimeMs;
  const old = now - mtime > RECENT_DAYS * DAY;
  if (old && cache[file]?.[0] === mtime) {
    nextCache[file] = cache[file];
    if (!cache[file][1]) older += 1;
    continue;
  }
  let s;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  const recent = now - (s.lastActivityAt ?? 0) < RECENT_DAYS * DAY;
  if (old) nextCache[file] = [mtime, Boolean(s.isArchived) || recent];
  if (s.isArchived) continue;
  if (recent) rows.push(row(s));
  else older += 1;
}
try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(nextCache)); } catch { /* the next scan just reads more */ }
rows.sort((a, b) => (b.activityAt ?? 0) - (a.activityAt ?? 0));
console.log(JSON.stringify({ now: new Date(now).toISOString(), days: RECENT_DAYS, quietDays: QUIET_DAYS, older, rows }));
