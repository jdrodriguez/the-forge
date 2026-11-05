#!/usr/bin/env node
// hourly-check.mjs: at the top of each hour, looks across the agent queue for anything that needs attention, and
// exits with a report only when something new turns up.
//
// The orchestrator session runs this with Bash run_in_background, next to the inbox watcher, so it is woken only when
// there is something to act on. It spends no Claude tokens while everything is fine: it reads the queue board's
// snapshot (/api/snapshot on queueBoard.host and queueBoard.port), the base branch's CI and, when queueBoard.healthUrl
// is set, the /health of the environment that branch deploys to (staging).
//
// Usage: hourly-check.mjs            wait for each top of the hour; exit 0 with the new findings, or 2 after 24h quiet
//        hourly-check.mjs --once     check now, print every current finding, record them as reported
// Findings already reported stay quiet until they clear; a cleared finding that comes back is new again.
// State: <paths.stateDir>/queue-board/hourly-reported.json (per machine).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, ROOT } from '../lib/config.mjs';

const cfg = loadConfig();
const qb = cfg.queueBoard ?? {};
const HERE = os.hostname().split('.')[0];
// The board on this machine is read on loopback; one on another machine by its host name.
const BOARD_HOST = !qb.host || qb.host.toLowerCase() === HERE.toLowerCase() ? '127.0.0.1' : qb.host;
const SNAPSHOT = `http://${BOARD_HOST}:${Number(qb.port ?? 8787)}/api/snapshot`;
// The deployed environment's /health, which answers JSON with the commit it serves. null skips the comparison.
const STAGING_HEALTH = qb.healthUrl ?? null;
const REPO = cfg.github?.repo;
const BASE = cfg.github?.baseBranch ?? 'main';
const CI = cfg.github?.ciWorkflow ?? 'CI';
const HUMAN = cfg.human?.name ?? 'the human';
const STATE = path.join(cfg.paths.stateDir, 'queue-board', 'hourly-reported.json');
const TICK_STALE_MIN = 45;
const STAGING_BEHIND_H = 2;
const MAX_HOURS = 24;

const once = process.argv.includes('--once');
const hoursAgo = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3.6e6 : Infinity);
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

// Each finding: a stable key (for "already reported") and one line for the report.
async function findings() {
  const out = [];
  const add = (key, line) => out.push({ key, line });
  let snap;
  try {
    snap = await getJson(SNAPSHOT);
  } catch (e) {
    add('board:down', `The queue board isn't answering (${e.message}). Restart it: ${ROOT}/queue-board/install.sh`);
    return out;
  }
  const machines = Array.isArray(snap.machines) ? snap.machines : Object.values(snap.machines ?? {});
  for (const m of machines) {
    const n = m.name ?? m.host;
    if (!m.ok || m.error) { add(`machine:down:${n}`, `${n}: the board can't read it (${m.error ?? 'no data'}).`); continue; }
    if (m.paused) add(`machine:paused:${n}`, `${n}: the dispatcher is paused (${m.paused}).`);
    if (m.enabled && hoursAgo(m.lastTick) * 60 > TICK_STALE_MIN) add(`machine:notick:${n}`, `${n}: no dispatcher tick for ${Math.round(hoursAgo(m.lastTick) * 60)} minutes.`);
    if (m.lastError) add(`machine:error:${n}:${String(m.lastError).slice(0, 40)}`, `${n}: dispatcher error: ${String(m.lastError).slice(0, 160)}`);
    const L = m.load;
    if (L && L.avg5 > L.cores * L.maxPerCore) add(`machine:load:${n}`, `${n}: load ${L.avg5.toFixed(0)} is over its limit of ${L.cores * L.maxPerCore}, so it claims no new tickets.`);
    if (m.memFreePercent != null && m.minMemFreePercent && m.memFreePercent < m.minMemFreePercent) add(`machine:mem:${n}`, `${n}: only ${m.memFreePercent}% of memory free.`);
    for (const a of m.signedOut ?? []) add(`machine:signedout:${n}:${a}`, `${n}: account ${a} is signed out.`);
  }
  const tickets = Array.isArray(snap.tickets) ? snap.tickets : Object.values(snap.tickets ?? {});
  for (const t of tickets) {
    const where = `${t.id} on ${t.machine ?? t.host}${t.prNumber ? ` (PR #${t.prNumber})` : ''}`;
    if (t.live && ['failed', 'done', 'gone'].includes(t.workerState)) {
      add(`ticket:ended:${t.id}:${t.workerId}`, `${where}: its worker is ${t.workerState} and nothing is working on it (${t.note ?? 'no note'}).`);
    }
    // A green PR in the base branch's merge queue is in flight, not stalled.
    if (t.stalledSince && !t.pr?.mergeQueue) add(`ticket:stalled:${t.id}`, `${where}: stalled since ${t.stalledSince.slice(11, 16)}Z (${t.note ?? ''}).`);
    if (t.blockedSince) add(`ticket:blocked:${t.id}`, `${where}: its worker is waiting on input since ${t.blockedSince.slice(11, 16)}Z. Attach: ${t.attach ?? ''}`);
    // A machine's state keeps "stuck" after the human re-queues the ticket; Linear's stuck label is current.
    const stillStuck = !snap.labeledStuck || snap.labeledStuck.includes(t.id);
    if (t.status === 'stuck' && stillStuck) add(`ticket:stuck:${t.id}`, `${where}: stuck. ${t.reason ?? ''}`.slice(0, 260));
  }
  for (const id of snap.labeledStuck ?? []) {
    // A bundle's companion goes stuck with its lead and shows on the lead's entry.
    if (!tickets.some((t) => t.status === 'stuck' && (t.id === id || t.bundle?.some((b) => b.id === id)))) add(`ticket:stucklabel:${id}`, `${id}: carries ${snap.config?.labels?.stuck ?? 'the stuck label'} in Linear.`);
  }
  for (const a of snap.asks ?? []) {
    const id = a.ticket ?? a.id ?? a.identifier ?? '?';
    add(`ask:${id}:${a.type ?? ''}`, `${id}: waiting on ${HUMAN} (${a.type ?? 'question'}): ${String(a.ask ?? a.question ?? a.title ?? '').slice(0, 160)}`);
  }
  for (const [k, v] of Object.entries(snap.errors ?? {})) add(`board:error:${k}`, `The board couldn't collect ${k}: ${String(v).slice(0, 160)}`);

  try {
    const run = JSON.parse(gh(['run', 'list', '--repo', REPO, '--branch', BASE, '--workflow', CI, '--status', 'completed', '--limit', '1', '--json', 'headSha,conclusion,displayTitle']))[0];
    if (run && !['success', 'cancelled', 'skipped'].includes(run.conclusion)) {
      add(`main:ci:${run.headSha}`, `${BASE}'s CI ${run.conclusion} on ${run.headSha.slice(0, 10)} (${run.displayTitle.slice(0, 70)}).${STAGING_HEALTH ? " Staging won't deploy past it." : ''}`);
    }
  } catch { add('main:ci:unknown', `Couldn't read ${BASE}'s CI (gh failed).`); }
  if (!STAGING_HEALTH) return out;
  try {
    const head = JSON.parse(gh(['api', `repos/${REPO}/commits/${BASE}`, '--jq', '{sha: .sha, date: .commit.committer.date}']));
    const staging = (await getJson(STAGING_HEALTH)).commit;
    if (staging && staging !== head.sha && hoursAgo(head.date) > STAGING_BEHIND_H) {
      add(`staging:behind:${head.sha}`, `Staging serves ${String(staging).slice(0, 10)} but ${BASE}'s head ${head.sha.slice(0, 10)} is ${hoursAgo(head.date).toFixed(1)}h old. A check on ${BASE} may be blocking the deploy.`);
    }
  } catch { add('staging:unknown', `Couldn't compare staging with ${BASE}.`); }
  return out;

}

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const saveState = (s) => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); };

async function check(reportAll) {
  const now = await findings();
  const prev = loadState();
  const next = {};
  for (const f of now) next[f.key] = prev[f.key] ?? new Date().toISOString();
  saveState(next);
  return reportAll ? now : now.filter((f) => !prev[f.key]);
}

function print(list, total) {
  console.log(`Queue check ${new Date().toISOString().slice(0, 16)}Z: ${list.length} new, ${total} open in all`);
  for (const f of list) console.log(`- ${f.line}`);
}

if (once) {
  const all = await check(true);
  print(all, all.length);
  process.exit(0);
}
const end = Date.now() + MAX_HOURS * 3.6e6;
while (Date.now() < end) {
  const d = new Date();
  const wait = (60 - d.getMinutes()) * 60_000 - d.getSeconds() * 1000 + 30_000;
  await new Promise((r) => setTimeout(r, wait));
  const fresh = await check(false);
  if (fresh.length) {
    print(fresh, Object.keys(loadState()).length);
    process.exit(0);
  }
}
console.log(`no new queue findings in ${MAX_HOURS}h`);
process.exit(2);
