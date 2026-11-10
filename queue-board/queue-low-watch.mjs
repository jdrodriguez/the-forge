#!/usr/bin/env node
// queue-low-watch.mjs: wakes the orchestrator session when the agent queue is running dry, meaning more worker slots
// are free than there are ready tickets that can start. Idle workers are wasted capacity, so the orchestrator should
// always be ahead on the tickets that need specs.
//
// The orchestrator session runs it with Bash run_in_background, next to the inbox watcher and the hourly check. It
// spends no Claude tokens while the queue is full: every 10 minutes it reads the queue board's snapshot (/api/snapshot
// on queueBoard.host and queueBoard.port) and counts, per machine, the slots the dispatcher could fill (enabled,
// not paused, under its load limit, with at least one signed-in account, or Codex or Grok, above the headroom floor)
// against the ready tickets that wait on no blocker. When slots outnumber startable tickets on two checks in a
// row, it exits with a report, so the orchestrator specs and queues the next batch. A slot held back only because every
// account on that machine is under the floor is reported apart, since more specs would not fill it.
//
// Usage: queue-low-watch.mjs                 poll every 10 minutes; exit 0 with the report, or 2 after 24h with the queue full
//        queue-low-watch.mjs --once          report the current state now and exit 0
//        queue-low-watch.mjs --cooldown 45   minutes after a report before the next one may fire (default 45)
// State: <paths.stateDir>/queue-board/queue-low.json (the last report's time, per machine).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';

// The config is read only when the watcher runs, so the tests can import capacity and report without one.
let cfg = null;
const config = () => (cfg ??= loadConfig());
// The board on this machine is read on loopback; one on another machine by its host name.
function snapshotUrl() {
  const qb = config().queueBoard ?? {};
  const here = os.hostname().split('.')[0];
  const host = !qb.host || qb.host.toLowerCase() === here.toLowerCase() ? '127.0.0.1' : qb.host;
  return `http://${host}:${Number(qb.port ?? 8787)}/api/snapshot`;
}
const stateFile = () => path.join(config().paths.stateDir, 'queue-board', 'queue-low.json');
const POLL_MS = 10 * 60_000;
const MAX_HOURS = 24;

const left = (w) => (w && typeof w.used === 'number' ? 100 - w.used : 100);

// The dispatcher's own rules, read from the snapshot: which slots it could fill now, and which tickets could start.
export function capacity(snap) {
  const floor = snap.config?.headroomFloorPercent ?? 30;
  const maxConcurrent = snap.config?.maxConcurrent ?? Infinity;
  const tickets = Array.isArray(snap.tickets) ? snap.tickets : Object.values(snap.tickets ?? {});
  const live = tickets.filter((t) => t.live && !t.sentry);
  const hosts = [];
  for (const m of snap.machines ?? []) {
    const name = m.name ?? m.host;
    if (!m.ok || !m.enabled || m.paused) continue;
    // Only a ticket still building holds a slot, as the dispatcher counts them, whichever account runs it (Claude, Codex
    // or Grok share the machine's pool); a PR waiting on the orchestrator's merge or parked on the reviewer's review
    // holds none.
    const used = live.filter((t) => t.host === m.host && t.status !== 'merge-asked' && !t.parked).length;
    const open = Math.max(0, (m.maxWorkers ?? 0) - used);
    if (!open) continue;
    const L = m.load;
    if (L && L.avg5 > L.cores * L.maxPerCore) { hosts.push({ name, open, free: 0, why: `load ${L.avg5.toFixed(0)} over its limit` }); continue; }
    const usable = (m.accounts ?? []).filter((a) => a.signedIn !== false && left(a.fiveHour) >= floor && left(a.weekly) >= floor);
    // Codex and Grok count as accounts here while the dispatcher has them on (m.engineAccounts), from the board's hourly
    // reading of their plans (snap.services); they take only the sizes the dispatcher gives them, which the report
    // doesn't split.
    const engines = (snap.services ?? []).filter((s) => (m.engineAccounts ?? []).includes(String(s.name).toLowerCase())
      && s.machines?.includes(name) && !s.error && !s.limited && left(s.fiveHour) >= floor && left(s.weekly ?? s.period) >= floor);
    if (!usable.length && !engines.length) {
      const acc = (m.accounts ?? []).map((a) => `${a.label} ${left(a.weekly)}% week, ${left(a.fiveHour)}% 5h`).join('; ');
      hosts.push({ name, open, free: 0, why: `no account above the ${floor}% floor (${acc || 'none signed in'})` });
      continue;
    }
    hosts.push({ name, open, free: open, why: null });
  }
  // Across machines a merge-asked ticket still counts against maxConcurrent; a parked one does not.
  const free = Math.min(hosts.reduce((n, h) => n + h.free, 0), Math.max(0, maxConcurrent - live.filter((t) => !t.parked).length));
  const ready = snap.ready ?? [];
  const startable = ready.filter((r) => !r.waitingOn && !r.sentry);
  const waiting = ready.filter((r) => r.waitingOn);
  return { free, hosts, startable, waiting, live: live.length, maxConcurrent };
}

export function report(c) {
  const byHost = c.hosts.reduce((n, h) => n + h.free, 0);
  const slots = c.hosts.filter((h) => h.free).map((h) => `${h.name} ${h.free}`).join(', ') + (c.free < byHost ? `; the ${c.maxConcurrent}-worker cap leaves ${c.free}` : '');
  const lines = [
    `Queue running dry: ${c.free} worker slot${c.free === 1 ? '' : 's'} free (${slots || 'none'}), ${c.startable.length} ticket${c.startable.length === 1 ? '' : 's'} can start${c.startable.length ? ` (${c.startable.map((r) => r.id).join(', ')})` : ''}. Spec and queue the next batch.`,
  ];
  if (c.waiting.length) lines.push(`Queued but waiting on a blocker: ${c.waiting.map((r) => `${r.id} (on ${r.waitingOn})`).join(', ')}.`);
  for (const h of c.hosts.filter((x) => x.why)) lines.push(`${h.name}: ${h.open} open slot${h.open === 1 ? '' : 's'} held back, ${h.why}.`);
  return lines.join('\n');
}

const dry = (c) => c.free > c.startable.length;

async function snapshot() {
  const res = await fetch(snapshotUrl(), { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`the queue board answered ${res.status}`);
  return res.json();
}

const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } };
const writeState = (s) => { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s)); };

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--once')) {
    const c = capacity(await snapshot());
    console.log(dry(c) ? report(c) : `Queue is fed: ${c.free} slot(s) free, ${c.startable.length} ticket(s) can start, ${c.live} running.`);
    return;
  }
  const i = args.indexOf('--cooldown');
  const cooldownMs = (i >= 0 ? Number(args[i + 1]) : 45) * 60_000;
  const started = Date.now();
  let streak = 0;
  for (;;) {
    let c = null;
    try {
      c = capacity(await snapshot());
    } catch (e) {
      console.error(`${new Date().toISOString()} ${e.message}; trying again in 10 minutes`);
    }
    streak = c && dry(c) ? streak + 1 : 0;
    const last = Date.parse(readState().lastReportAt ?? '') || 0;
    if (streak >= 2 && Date.now() - last >= cooldownMs) {
      writeState({ lastReportAt: new Date().toISOString() });
      console.log(report(c));
      return;
    }
    if (Date.now() - started > MAX_HOURS * 3.6e6) {
      console.log(`Queue stayed fed for ${MAX_HOURS}h. Re-arm the watcher.`);
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
