#!/usr/bin/env node
// orchestrator.mjs: the driver lock, the lease, and the watcher's PID file, shared by takeover.sh, lease.sh, the Stop
// hook, the watcher and the supervisor.
//
// The driver lock (orchestrator.lockFile) names the one session that acts as orchestrator. The lease
// (<stateDir>/orchestrator-lease.json) is that session's heartbeat: renewed when it takes over, ends a turn, runs a
// merge or its watcher wakes. It never gates anything the driver does. The supervisor reads it to tell a working driver
// from an idle one.
//
// CLI (lease.sh runs it):
//   orchestrator.mjs renew [session]     renew the lease, only if the session (default $CLAUDE_CODE_SESSION_ID) holds the lock
//   orchestrator.mjs status              holder, renewed time, age, current or expired
//   orchestrator.mjs expired [minutes]   exit 0 when the lease is older than minutes (default orchestrator.leaseMinutes),
//                                        missing, or held by a session that lost the lock; exit 1 while it is current
//   orchestrator.mjs take <session>      move the lock to the session, logging the change to <lockFile>.log
//   orchestrator.mjs guard               the Stop hook: reads the hook's JSON on stdin (orchestrator-watch-guard.sh)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadConfig } from '../lib/config.mjs';

export function orchestratorPaths(cfg = loadConfig()) {
  const state = cfg.paths.stateDir;
  return {
    lock: cfg.orchestrator?.lockFile || path.join(state, 'orchestrator-session'),
    lease: path.join(state, 'orchestrator-lease.json'),
    watchPid: path.join(state, 'orchestrator-watch.pid'),
    leaseMinutes: Number(cfg.orchestrator?.leaseMinutes ?? 30),
  };
}

// The queue board's snapshot URL: loopback on the board's own machine, its host name from any other.
// FORGE_BOARD_URL replaces it, for tests.
export function boardUrl(cfg) {
  if (process.env.FORGE_BOARD_URL) return process.env.FORGE_BOARD_URL;
  const qb = cfg.queueBoard ?? {};
  const here = os.hostname().split('.')[0].toLowerCase();
  const host = !qb.host || qb.host.toLowerCase() === here ? '127.0.0.1' : qb.host;
  return `http://${host}:${Number(qb.port ?? 8787)}/api/snapshot`;
}

export const holder = (p) => { try { return fs.readFileSync(p.lock, 'utf8').split('\n')[0].trim(); } catch { return ''; } };

const writeAtomic = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
};

export function renew(p, session, now = Date.now()) {
  if (!session || holder(p) !== session) return false;
  writeAtomic(p.lease, `${JSON.stringify({ session, renewedAt: new Date(now).toISOString() })}\n`);
  return true;
}

// { session, renewedAt, ageMin } or null.
export function readLease(p, now = Date.now()) {
  try {
    const d = JSON.parse(fs.readFileSync(p.lease, 'utf8'));
    const t = Date.parse(d.renewedAt);
    if (!d.session || Number.isNaN(t)) return null;
    return { session: d.session, renewedAt: d.renewedAt, ageMin: Math.floor((now - t) / 60000) };
  } catch {
    return null;
  }
}

export function expired(p, minutes = p.leaseMinutes, now = Date.now()) {
  const l = readLease(p, now);
  return !l || l.session !== holder(p) || l.ageMin >= minutes;
}

export function status(p, now = Date.now()) {
  const lock = holder(p);
  const l = readLease(p, now);
  if (!l) return `lease: none (lock holder: ${lock || 'none'})`;
  const state = l.session !== lock ? `expired (lock moved to ${lock || 'none'})` : l.ageMin >= p.leaseMinutes ? 'expired' : 'current';
  return `lease: holder ${l.session}, renewed ${l.renewedAt}, age ${l.ageMin}m, ${state}`;
}

// take(p, session, who): returns the previous holder. The change is appended to <lock>.log.
export function take(p, session, who = '') {
  const prev = holder(p);
  if (prev !== session) {
    fs.mkdirSync(path.dirname(p.lock), { recursive: true });
    fs.appendFileSync(`${p.lock}.log`, `${new Date().toISOString()} ${prev || 'none'} -> ${session}${who ? ` (${who})` : ''}\n`);
    writeAtomic(p.lock, `${session}\n`);
  }
  return prev;
}

// The live watcher this session started, if any: the PID file names the session that started the watcher, and a
// watcher wakes only that session, so a watcher another session started does not count.
export function ownWatcher(p, session) {
  try {
    const d = JSON.parse(fs.readFileSync(p.watchPid, 'utf8'));
    if (d.session !== session) return null;
    process.kill(d.pid, 0);
    return d.pid;
  } catch {
    return null;
  }
}

// guard(p, input): the Stop hook's answer, or '' to let the stop through. Only the lock holder is held, and only once
// per stop (stop_hook_active), so a watcher that cannot start never traps the session.
export function guard(p, input) {
  const session = input?.session_id ?? '';
  if (!session || holder(p) !== session) return '';
  renew(p, session);
  if (input.stop_hook_active || ownWatcher(p, session)) return '';
  return JSON.stringify({
    decision: 'block',
    reason: `The orchestrator watcher is not running, so merge requests, questions, red main and dispatcher notices would go unseen. Start it now: run \`node ${path.join(ROOT, 'inbox/orchestrator-watch.mjs')}\` with Bash run_in_background (no &), then end the turn.`,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, arg] = process.argv.slice(2);
  const p = orchestratorPaths();
  if (cmd === 'renew') {
    renew(p, arg || process.env.CLAUDE_CODE_SESSION_ID || '');
  } else if (cmd === 'status') {
    console.log(status(p));
  } else if (cmd === 'expired') {
    const m = arg === undefined ? p.leaseMinutes : Number(arg);
    if (!Number.isInteger(m) || m < 0) { console.error('expired: minutes must be a whole number'); process.exit(2); }
    process.exit(expired(p, m) ? 0 : 1);
  } else if (cmd === 'take' && arg) {
    const prev = take(p, arg, `${os.userInfo().username}@${os.hostname().split('.')[0]}, ${process.env.CLAUDE_CODE_ENTRYPOINT ?? 'unknown app'}`);
    console.log(prev === arg ? `DRIVER: this session (${arg}) already holds the orchestrator role.` : `DRIVER: this session (${arg}) is now the orchestrator. Previous driver: ${prev || 'none'}.`);
  } else if (cmd === 'guard') {
    let input = {};
    try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* no input: let the stop through */ }
    const out = guard(p, input);
    if (out) console.log(out);
  } else {
    console.error('usage: orchestrator.mjs renew [session] | status | expired [minutes] | take <session> | guard');
    process.exit(2);
  }
}
