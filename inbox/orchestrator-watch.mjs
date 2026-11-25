#!/usr/bin/env node
// orchestrator-watch.mjs: the one watcher the orchestrator session keeps armed. It runs the single-purpose watchers
// at once and exits with the first event any of them reports, so the session has one thing to re-arm:
//   inbox             inbox-watch.sh: a new question for the human
//   merge-requests    merge-request-watch.sh: a green PR the dispatcher handed over
//   red-main          main-red-watch.sh: main turned red or recovered
//   hourly-check      queue-board/hourly-check.mjs: something new across the queue
//   dispatcher-events dispatcher-events-watch.mjs: a dispatcher notice for the orchestrator
//   pr-sweep          pr-sweep.mjs --watch: an open PR with no owner, stale, or approved but idle
//
// Run it with Bash run_in_background, never with &. It prints "== <watcher>" and that watcher's output for each one
// that fired within a few seconds of the first, then exits 0. A watcher that exits 2 (24 quiet hours) is restarted,
// after a growing delay when it exits 2 within a minute of starting; one that fails ends the watch with "WATCHER <name>
// failed". While it runs, <stateDir>/orchestrator-watch.pid names its PID, start time and session, which the Stop hook
// (orchestrator-watch-guard.sh) reads, and its watchers' process groups. It renews the lease when it starts and when
// it fires. It stops only the processes it started: each watcher runs under watch-child.mjs, which ends it if this
// process is killed outright, and a start stops the watchers a dead predecessor left. In a Claude Code session it stops
// and says so when the lock is held by another session.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig } from '../lib/config.mjs';
import { alive, holder, orchestratorPaths, procStart, renew } from './orchestrator.mjs';

const p = orchestratorPaths(loadConfig());
const SESSION = process.env.CLAUDE_CODE_SESSION_ID || '';
const SETTLE_MS = 3000;
const node = (f, ...a) => ({ cmd: process.execPath, args: [path.join(ROOT, f), ...a] });
const bash = (f) => ({ cmd: 'bash', args: [path.join(ROOT, f)] });
// FORGE_WATCHERS (a JSON list of {name, cmd, args}) replaces the list, for tests.
const WATCHERS = process.env.FORGE_WATCHERS ? JSON.parse(process.env.FORGE_WATCHERS) : [
  { name: 'inbox', ...bash('inbox/inbox-watch.sh') },
  { name: 'merge-requests', ...bash('inbox/merge-request-watch.sh') },
  { name: 'red-main', ...bash('inbox/main-red-watch.sh') },
  { name: 'hourly-check', ...node('queue-board/hourly-check.mjs') },
  { name: 'dispatcher-events', ...node('inbox/dispatcher-events-watch.mjs') },
  { name: 'pr-sweep', ...node('inbox/pr-sweep.mjs', '--watch') },
];

const running = new Map();
const fired = [];
const backoff = {};
let settling = null;
const RESPAWN_MS = Number(process.env.FORGE_RESPAWN_MS ?? 5000);

// Watchers a predecessor killed outright left behind (watch-child.mjs normally ends them within seconds).
try {
  const old = JSON.parse(fs.readFileSync(p.watchPid, 'utf8'));
  if (!alive(old.pid, old.started)) {
    for (const c of old.children ?? []) if (alive(c.pid, c.started)) { try { process.kill(-c.pid, 'SIGTERM'); } catch { /* gone */ } }
  }
} catch { /* no PID file */ }

const STARTED = procStart(process.pid);
fs.mkdirSync(path.dirname(p.watchPid), { recursive: true });
const writePid = () => fs.writeFileSync(p.watchPid, `${JSON.stringify({ pid: process.pid, started: STARTED, session: SESSION, startedAt: new Date().toISOString(),
  children: [...running.values()].map((c) => ({ pid: c.pid, started: c.started })) })}\n`);
writePid();

// Each watcher runs in its own process group, so stopping it stops its children (a sleep, say) too.
function stopAll() {
  for (const child of running.values()) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } }
  running.clear();
  try { if (JSON.parse(fs.readFileSync(p.watchPid, 'utf8')).pid === process.pid) fs.rmSync(p.watchPid); } catch { /* gone */ }
}

function finish() {
  renew(p, SESSION);
  stopAll();
  for (const f of fired) process.stdout.write(`== ${f.name}\n${f.text.trimEnd()}\n`);
  process.exit(0);
}

function start(w) {
  const child = spawn(process.execPath, [path.join(ROOT, 'inbox/watch-child.mjs'), w.cmd, ...w.args], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.started = procStart(child.pid);
  const t0 = Date.now();
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  running.set(w.name, child);
  writePid();
  child.on('exit', (code, signal) => {
    if (running.get(w.name) !== child) return;
    running.delete(w.name);
    if (code === 2) {
      // A watcher that keeps exiting 2 at once would spin; wait 5 s, doubling to 5 minutes.
      backoff[w.name] = Date.now() - t0 < 60_000 ? Math.min((backoff[w.name] || RESPAWN_MS / 2) * 2, 300_000) : 0;
      if (!backoff[w.name]) return start(w);
      setTimeout(() => { if (!settling) start(w); }, backoff[w.name]).unref();
      return;
    }
    if (code === 0 && out.trim()) fired.push({ name: w.name, text: out });
    else fired.push({ name: w.name, text: `WATCHER ${w.name} failed (exit ${code ?? signal}): ${(err || out).trim().split('\n').slice(-5).join(' | ')}` });
    settling ??= setTimeout(finish, SETTLE_MS);
  });
}

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stopAll(); process.exit(1); });
renew(p, SESSION);
for (const w of WATCHERS) start(w);

// A session without the lock stops watching, so its watchers never mark an event seen that the driver needs.
if (SESSION) {
  setInterval(() => {
    const now = holder(p);
    if (now && now !== SESSION && !settling) {
      fired.push({ name: 'takeover', text: `the orchestrator lock is held by ${now}, not this session; the watcher stopped. Do not re-arm it.` });
      finish();
    }
  }, Number(process.env.FORGE_LOCK_POLL_MS ?? 30000));
}
