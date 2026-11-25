#!/usr/bin/env node
// orchestrator-supervisor.mjs: pages the human in Slack when work has waited on the orchestrator and no session is
// driving. It never starts a session and never moves the driver lock: only the human picks the orchestrator.
// install-supervisor.sh runs it every orchestrator.supervisor.everyMinutes on the orchestrator's machine, outside any
// session, so it keeps working when the driver's account hits a limit.
//
// Each run, in order:
//   1. The lease is current (orchestrator.leaseMinutes): log "lease current" and stop.
//   2. Count what has waited waitMinutes or more: a board ticket in merge-asked whose PR is green and that is not
//      waiting on the human (its age from its merge request's "at"), and an approved head in the ledger with no
//      merged line after it. With the board unreachable, the merge request files stand in. None: log and stop.
//   3. <stateDir>/supervisor.off exists: log what it would have done and stop.
//   4. Paged within cooldownMinutes: log "cooldown" and stop.
//   5. Post one page to slack.channel with the bot token in slack.botTokenFile, naming what waits and who holds the lock.
// One line per run goes to <stateDir>/orchestrator-supervisor.log; the last page is in orchestrator-supervisor.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { boardUrl, expired, holder, orchestratorPaths, status } from './orchestrator.mjs';

const ts = (s) => { const t = Date.parse(s); return Number.isNaN(t) ? null : t; };

// waiting(cfg, board, now): [{ minutes, text }] for work waiting waitMinutes or more, oldest first.
export function waiting(cfg, board, now, waitMin) {
  const shared = cfg.paths.sharedDir;
  const mr = new Map();
  let files = [];
  try { files = fs.readdirSync(path.join(shared, 'merge-requests')).filter((f) => f.endsWith('.json')); } catch { /* none */ }
  for (const f of files) {
    try {
      const full = path.join(shared, 'merge-requests', f);
      const r = JSON.parse(fs.readFileSync(full, 'utf8'));
      mr.set(String(r.id), { since: ts(r.at) ?? fs.statSync(full).mtimeMs, pr: r.pr });
    } catch { /* half-synced */ }
  }
  const items = new Map();
  const closed = new Set();
  if (board) {
    for (const t of board.tickets ?? []) {
      const num = t.prNumber;
      if (t.status === 'merged') closed.add(String(num));
      if (t.status !== 'merge-asked' || t.waiting) continue;
      if (t.pr?.ci?.overall !== 'SUCCESS') continue;
      const since = mr.get(String(t.id))?.since ?? ts(t.lastProgressAt) ?? ts(t.dispatchedAt);
      if (since) items.set(String(num ?? t.id), { since, text: `${t.id} PR #${num} green and merge-asked` });
    }
  } else {
    for (const [id, r] of mr) items.set(String(r.pr ?? id), { since: r.since, text: `${id} PR #${r.pr} merge request` });
  }
  const ledger = cfg.orchestrator?.approvalsFile || path.join(shared, 'approvals.jsonl');
  let text = '';
  try { text = fs.readFileSync(ledger, 'utf8'); } catch { /* none */ }
  const latest = new Map();
  for (const line of text.split('\n')) {
    try {
      const r = JSON.parse(line);
      if (r?.pr != null) latest.set(`${r.repo ?? cfg.github.repo}#${r.pr}`, r);
    } catch { /* blank or torn */ }
  }
  for (const [key, r] of latest) {
    const pr = String(r.pr);
    const sameRepo = (r.repo ?? cfg.github.repo) === cfg.github.repo;
    if (r.merged === true || r.event === 'merged' || (sameRepo && closed.has(pr))) continue;
    const since = ts(r.approvedAt ?? r.at);
    if (!since) continue;
    const id = sameRepo ? pr : key;
    const prev = items.get(id);
    if (!prev || since < prev.since) items.set(id, { since, text: `PR ${sameRepo ? `#${pr}` : key} approved at ${String(r.head ?? '').slice(0, 10) || 'unknown head'}, not merged` });
  }
  return [...items.values()].sort((a, b) => a.since - b.since)
    .map((i) => ({ minutes: Math.floor((now - i.since) / 60000), text: i.text })).filter((i) => i.minutes >= waitMin);
}

// supervise({ cfg, now, fetchImpl }): one run. Returns the line it logged.
export async function supervise({ cfg = loadConfig(), now = Date.now(), fetchImpl = fetch } = {}) {
  const p = orchestratorPaths(cfg);
  const sup = cfg.orchestrator?.supervisor ?? {};
  const waitMin = Number(sup.waitMinutes ?? 30);
  const cooldownMin = Number(sup.cooldownMinutes ?? 60);
  const state = cfg.paths.stateDir;
  const logFile = path.join(state, 'orchestrator-supervisor.log');
  const stateFile = path.join(state, 'orchestrator-supervisor.json');
  fs.mkdirSync(state, { recursive: true });
  const log = (msg) => { fs.appendFileSync(logFile, `${new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z')} ${msg}\n`); return msg; };
  const lease = status(p, now);
  if (!expired(p, p.leaseMinutes, now)) return log(`lease current, no action. ${lease}`);

  let board = null;
  try {
    const r = await fetchImpl(boardUrl(cfg), { headers: { 'x-board': 'read' }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) board = await r.json();
  } catch { /* unreachable: merge requests stand in */ }
  const items = waiting(cfg, board, now, waitMin);
  if (!items.length) return log(`nothing waiting ${waitMin}m+ (board ${board ? 'ok' : 'unreachable'}), no action. ${lease}`);
  const summary = items.map((i) => `${i.text} for ${i.minutes}m`).join('; ');
  if (fs.existsSync(path.join(state, 'supervisor.off'))) return log(`kill switch supervisor.off set: would page. ${items.length} waiting: ${summary}. ${lease}`);
  let last = 0;
  try { last = JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastActionAt; } catch { /* never paged */ }
  const since = Math.floor((now - (Date.parse(last) || 0)) / 60000);
  if (since < cooldownMin) return log(`cooldown: paged ${since}m ago. Still ${items.length} waiting: ${summary}. ${lease}`);

  const lock = holder(p) || 'none';
  const text = [`*Orchestrator idle.* ${lease} Lock holder: ${lock}.`, `*Waiting on the orchestrator (${items.length}):*`,
    ...items.map((i) => `- ${i.text}, waiting ${i.minutes}m`),
    `No session was started and the lock was not moved (host ${os.hostname().split('.')[0]}). To keep it, wake the lock holder; to change it, run /forge-takeover in the session you choose.`,
    `Next page no sooner than ${cooldownMin} minutes. To stop the supervisor: touch ${path.join(state, 'supervisor.off')}`].join('\n');
  let paged;
  let token = '';
  try { token = fs.readFileSync(cfg.slack?.botTokenFile || path.join(state, 'slack-bot-token'), 'utf8').trim(); } catch { /* none */ }
  if (!token) paged = 'no Slack bot token, page not sent';
  else {
    try {
      const r = await fetchImpl('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: cfg.slack.channel, text, unfurl_links: false, unfurl_media: false }),
        signal: AbortSignal.timeout(20_000),
      });
      const d = await r.json();
      paged = d.ok ? `paged ${cfg.slack.channelName ?? cfg.slack.channel}` : `Slack refused the page: ${d.error}`;
    } catch {
      paged = 'Slack unreachable';
    }
  }
  fs.writeFileSync(stateFile, JSON.stringify({ lastActionAt: new Date(now).toISOString(), paged, waiting: summary }));
  return log(`ACTED: ${paged}. ${items.length} waiting: ${summary}. ${lease}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(await supervise());
}
