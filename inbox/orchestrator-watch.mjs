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
// that fired within a few seconds of the first, then exits 0. A watcher that exits 2 (24 quiet hours) is restarted; one
// that fails ends the watch with "WATCHER <name> failed". While it runs, <stateDir>/orchestrator-watch.pid names its PID
// and the session that started it, which the Stop hook (orchestrator-watch-guard.sh) reads. It renews the lease when
// it starts and when it fires. It stops only the processes it started.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig } from '../lib/config.mjs';
import { orchestratorPaths, renew } from './orchestrator.mjs';

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
let settling = null;

fs.mkdirSync(path.dirname(p.watchPid), { recursive: true });
fs.writeFileSync(p.watchPid, `${JSON.stringify({ pid: process.pid, session: SESSION, startedAt: new Date().toISOString() })}\n`);

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
  const child = spawn(w.cmd, w.args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  running.set(w.name, child);
  child.on('exit', (code, signal) => {
    if (running.get(w.name) !== child) return;
    running.delete(w.name);
    if (code === 2) return start(w);
    if (code === 0 && out.trim()) fired.push({ name: w.name, text: out });
    else fired.push({ name: w.name, text: `WATCHER ${w.name} failed (exit ${code ?? signal}): ${(err || out).trim().split('\n').slice(-5).join(' | ')}` });
    settling ??= setTimeout(finish, SETTLE_MS);
  });
}

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stopAll(); process.exit(1); });
renew(p, SESSION);
for (const w of WATCHERS) start(w);
