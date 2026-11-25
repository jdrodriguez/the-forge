#!/usr/bin/env node
// dispatcher.mjs: the agent queue. A launchd job (or systemd timer) runs `tick` every 20 minutes. Each tick:
//   1. checks main's CI on every commit it merged in the last day, and pauses itself on a failure;
//   2. advances the tickets this machine dispatched: merges a PR that is green at a checked commit, sends a
//      risky one (migrations, workflows, auth, billing and the like) to the orchestrator for review, marks one
//      stuck when its worker has ended and nothing moves;
//   3. tells the human's inbox when a worker sits blocked, waiting on input in its session;
//   4. claims Linear tickets labeled ready and hands each to a fleet worker, within the caps, bundling up to
//      bundle.maxTickets linked same-project tickets into one worker and one PR (config `dispatcher.bundle`);
//   5. on sentryTriage.host, starts a Sentry triage run when sentryTriage.enabled (a module you supply).
// Workers drive their own PRs to green (worker-brief.md). The dispatcher never writes code, and a tick makes no
// model calls: it reads Linear, GitHub and the fleet's session list. Each transition (started, PR opened, merged,
// needs a merge review, blocked, stuck, paused) shows a macOS notification, and `summary` prints the session-start line.
//
// Usage: node dispatcher.mjs tick [--dry-run] | status | summary | check ENG-123 | redispatch ENG-123 | wake ENG-123 | test-notify |
//        hold [reason] | release | pause [reason] | resume
// Config: agent-queue.config.json at the repo root (lib/config.mjs). State, log and the PAUSED flag (per machine):
// paths.stateDir. Files every machine reads (heartbeats, bundles, merge requests, main's state): paths.sharedDir.
// Linear is the shared truth: ready -> building -> Verifying or stuck.
//
// Safety rules this file keeps: a pause is a file, re-read before every merge and dispatch, so a running tick
// can never undo it; a transition is written to state before its side effects, so a failed comment or inbox
// call is logged once, never repeated every tick; a claim is journaled before Linear is touched, and an
// interrupted claim is reconciled against `fleet.sh ps` before anything is retried.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, linearKey, ROOT } from '../lib/config.mjs';
import { engineBuilt, engineDriven, makeEngineHooks } from './engine-hooks.mjs';

const HOME = os.homedir();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const conf = loadConfig();
const cfg = conf.dispatcher;
const LOCAL = conf.paths.stateDir;
const SHARED = conf.paths.sharedDir;
const STATE = path.join(LOCAL, 'state.json');
const PAUSED = path.join(LOCAL, 'PAUSED');
const STREAK_RESET = path.join(LOCAL, 'STREAK_RESET');
const LOG = path.join(LOCAL, 'dispatcher.log');
const LOCK = path.join(LOCAL, 'tick.lock');
const SLACK = conf.slack?.webhookFile ?? path.join(LOCAL, 'slack-webhook');
const SLACK_BOT = conf.slack?.botTokenFile ?? path.join(LOCAL, 'slack-bot-token'); // the queue's Slack bot (chat:write), used only for the reviewer DM
const FLEET = path.join(ROOT, 'fleet/fleet.sh');
const ASK = path.join(ROOT, 'inbox/ask-human.sh');
const HUMAN = conf.human?.name ?? 'the human';
const REPO = conf.github.repo;
const BASE = conf.github.baseBranch ?? 'main';
const REVIEW_CHECK = conf.github.reviewCheck ?? null;
const LINEAR_WS = conf.linear.workspace;
const TEAM = conf.linear.team;
const L = { ready: 'agent-ready', building: 'agent-building', stuck: 'agent-stuck', needsHuman: 'needs-human',
  sentry: 'sentry-triaged', mechanical: 'sentry-mechanical', judgment: 'sentry-human-review', ...(conf.linear.labels ?? {}) };
const STATES = { inProgress: 'In Progress', verifying: 'Verifying', ...(conf.linear.states ?? {}) };
const SIZE_GROUP = conf.linear.sizeLabelGroup ?? 'Size';
const PRIMARY = conf.fleet?.primaryAccount ?? 'a';
const WORKSPACE = conf.workspaceCwd;
const WORKTREES = path.join(conf.repoPath ?? '', conf.worktreesDir ?? '.claude/worktrees');
const ORCH = conf.orchestrator?.sessionName ?? 'Specdesk';
const REPO_NAME = REPO.split('/')[1];
const GATED_PUSH = `node ${path.join(DIR, 'gated-push.mjs')}`;
// Workers run unattended, and one that stops at a permission prompt has stalled, so fleet.sh's default mode is
// bypassPermissions. dispatcher.permissionMode overrides it for every worker this dispatcher starts.
const MODE_ARGS = cfg.permissionMode ? ['--mode', cfg.permissionMode] : [];
const branchFor = (id) => (conf.github.branchTemplate ?? 'agent/{id}').replaceAll('{id}', id.toLowerCase());
const DRY = process.argv.includes('--dry-run');
// `tick --dry-run --bundle` shows what bundling would do while the config still has it off.
const FORCE_BUNDLE = DRY && process.argv.includes('--bundle');
const HOST = os.hostname().split('.')[0];
const LIVE = ['building', 'merge-asked'];
const CLOSED_STATES = ['completed', 'canceled', 'duplicate'];
const RISKY = (cfg.riskyPathPatterns ?? []).map((rx) => new RegExp(rx, 'i'));
const hostCfg = cfg.hosts?.[HOST] ?? {}; // this machine's limits: maxWorkers, accounts, maxLoadPerCore, minMemoryFreePercent
// Codex and Grok as queue accounts (engine-workers.mjs): the launcher that holds them in its lockdown, and the board's
// plan-usage reader, which the dispatcher ranks them by.
const EXT_WORKER = path.join(DIR, 'ext-worker.sh');
const EXT_USAGE = path.join(ROOT, 'queue-board/ext-usage.mjs');

fs.mkdirSync(LOCAL, { recursive: true });

const iso = () => new Date().toISOString();
const hoursSince = (t) => (Date.now() - Date.parse(t)) / 3.6e6;
function log(msg) {
  const line = `${iso()} ${DRY ? '[dry-run] ' : ''}${msg}`;
  console.log(line);
  if (!DRY) fs.appendFileSync(LOG, `${line}\n`);
}
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, cwd: HOME, ...opts }).trim();
const errText = (e) => String(e?.stderr || e?.message || e).trim().slice(0, 400);

// --- external systems -------------------------------------------------------------------------------

let lkey;
async function gql(query, variables = {}) {
  // The environment first: over SSH a secrets manager may not reach the keychain, so a remote run passes the key in.
  lkey ??= linearKey(conf);
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: lkey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json();
  if (body.errors) throw new Error(`Linear: ${body.errors[0].message}`);
  return body.data;
}

let ghToken;
function gh(args) {
  ghToken ??= run('gh', ['auth', 'token', '--hostname', 'github.com', '--user', conf.github.user]);
  return run('gh', args, { env: { ...process.env, GH_TOKEN: ghToken } });
}

const addLabel = (i, l) => gql('mutation($i:String!,$l:String!){ issueAddLabel(id:$i, labelId:$l){ success } }', { i, l });
const removeLabel = (i, l) => gql('mutation($i:String!,$l:String!){ issueRemoveLabel(id:$i, labelId:$l){ success } }', { i, l });
const setState = (i, s) => gql('mutation($i:String!,$s:String!){ issueUpdate(id:$i, input:{stateId:$s}){ success } }', { i, s });
const comment = (i, b) => gql('mutation($i:String!,$b:String!){ commentCreate(input:{issueId:$i, body:$b}){ success } }', { i, b });
const issueId = async (identifier) => (await gql('query($id:String!){ issue(id:$id){ id } }', { id: identifier })).issue.id;

function askHuman(ticket, type, ask, recommend, fallback) {
  run(ASK, ['ask', ...(ticket ? [ticket] : []), '--type', type, '--ask', ask, '--recommend', recommend,
    '--default', fallback, '--from', `agent dispatcher on ${HOST}`]);
}

// A macOS notification per transition, so the human sees the queue move without asking. A Linux host has no desktop
// to show one on and relies on Slack. Progress events (started, PR opened, merged) also post to the queue's private
// Slack channel through the webhook in slack.webhookFile; questions reach that channel through ask-human.sh.
// Best effort: never throws.
async function notify(subtitle, text, { id = null, link = null, progress = false, orchestrator = false } = {}) {
  if (DRY) return;
  if (orchestrator) tellOrchestrator(subtitle, text, id, link);
  if (cfg.notify === false) return;
  if (process.platform === 'darwin') {
    try {
      run('osascript', ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title "Agent queue" subtitle (item 1 of argv)',
        '-e', 'end run', subtitle, text], { timeout: 10_000 });
    } catch (e) {
      log(`could not show a notification (${errText(e)})`);
    }
  }
  if (!progress || !fs.existsSync(SLACK)) return;
  const links = [id && `<https://linear.app/${LINEAR_WS}/issue/${id}|ticket>`, link && `<${link}|PR>`].filter(Boolean);
  try {
    const res = await fetch(fs.readFileSync(SLACK, 'utf8').trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*${subtitle}*: ${text}${links.length ? `  ${links.join(' · ')}` : ''}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 100)}`);
  } catch (e) {
    log(`could not post to Slack (${errText(e)})`);
  }
}

// Notices the orchestrator must act on (a ticket still going, an account signed out, an engine PR merged without
// review) also go to orchestrator.eventsDir (default <sharedDir>/orchestrator-events), one JSON file each, for the
// orchestrator's events watcher. Best effort: never throws.
const ORCH_EVENTS = conf.orchestrator?.eventsDir || path.join(SHARED, 'orchestrator-events');
function tellOrchestrator(subtitle, text, id, link) {
  try {
    fs.mkdirSync(ORCH_EVENTS, { recursive: true });
    const at = iso();
    const name = `${at.replace(/[:.]/g, '-')}-${HOST}-${(id ?? 'host').replace(/[^A-Za-z0-9-]/g, '')}.json`;
    fs.writeFileSync(path.join(ORCH_EVENTS, name), `${JSON.stringify({ at, host: HOST, id, subtitle, text, link })}\n`);
  } catch (e) {
    log(`could not write an orchestrator event (${errText(e)})`);
  }
}

// The command that opens a worker's session, for the blocked-worker ask. The primary account is the default config dir.
// An engine worker has no session to open, so its command prints its registry row, which names its logs and clone.
const attachCmd = (t) => (engineDriven(t) ? `cat ${t.engineRegistry ?? path.join(LOCAL, 'engine-workers', '<ticket>.json')}`
  : `${t.account === PRIMARY ? 'env -u CLAUDE_CONFIG_DIR' : `CLAUDE_CONFIG_DIR=~/.claude-${t.account}`} claude attach ${t.workerId}`);

// Side effects after a transition is recorded: each runs once, a failure is logged and kept on the ticket.
async function effects(t, id, steps) {
  for (const [what, fn] of steps) {
    if (DRY) {
      log(`would ${what}`);
      continue;
    }
    try {
      await fn();
    } catch (e) {
      (t.effectErrors ??= []).push(`${iso()} ${what}: ${errText(e)}`);
      log(`${id}: could not ${what} (${errText(e)})`);
    }
  }
}

// m.label is keyed by role (ready, building, stuck), so the Linear label names can be anything in the config.
async function teamMeta() {
  const roles = ['ready', 'building', 'stuck'];
  const d = await gql(`query($team:String!,$names:[String!]){
    teams(filter:{key:{eq:$team}}){ nodes{ id states{ nodes{ id name } } } }
    issueLabels(filter:{name:{in:$names}}){ nodes{ id name } } }`, { team: TEAM, names: roles.map((r) => L[r]) });
  const team = d.teams.nodes[0];
  const stateId = (name) => team.states.nodes.find((s) => s.name === name)?.id;
  const byName = Object.fromEntries(d.issueLabels.nodes.map((l) => [l.name, l.id]));
  const label = Object.fromEntries(roles.map((r) => [r, byName[L[r]]]));
  for (const r of roles) if (!label[r]) throw new Error(`Linear label ${L[r]} is missing`);
  return { inProgress: stateId(STATES.inProgress), verifying: stateId(STATES.verifying), label };
}

const labeled = async (label) => (await gql(`query($team:String!,$label:String!){ issues(first:100, filter:{team:{key:{eq:$team}},
  labels:{name:{eq:$label}}, state:{type:{nin:["completed","canceled","duplicate"]}}}){ nodes{ identifier } } }`,
{ team: TEAM, label })).issues.nodes.map((n) => n.identifier);
const building = () => labeled(L.building);

// Progress decides whether a ticket needs the human, never elapsed time: a worker may take as long as the work takes.
// Progress is a new commit on the branch, any PR activity, or the worker's session being busy.
const ACTIVE = ['busy', 'working'];
function workerState(workers, t) {
  if (!workers || !workers.some((w) => w.label === t.account)) return 'unknown'; // that account's list didn't come back
  const w = workers.find((x) => x.label === t.account && x.id === t.workerId);
  return w ? w.status || w.state || 'unknown' : 'gone';
}
function trackProgress(t, sha, prUpdatedAt, state) {
  const moved = (sha && sha !== t.lastSha) || (prUpdatedAt && prUpdatedAt !== t.lastPrUpdatedAt);
  if (sha) t.lastSha = sha;
  if (prUpdatedAt) t.lastPrUpdatedAt = prUpdatedAt;
  if (moved) t.lastOutputAt = iso();
  if (moved || ACTIVE.includes(state)) t.lastProgressAt = iso();
  t.lastOutputAt ??= t.dispatchedAt;
  t.lastProgressAt ??= t.dispatchedAt;
}
function branchSha(t) {
  try {
    return gh(['api', `repos/${REPO}/branches/${encodeURIComponent(t.branch)}`, '--jq', '.commit.sha']) || null;
  } catch {
    return null; // not pushed yet
  }
}

const fleetWorkers = () => JSON.parse(run(FLEET, ['ps', '--json', '--all'], { timeout: 60_000 }));
const fleetWorker = (name) => fleetWorkers().find((w) => w.name === name) ?? null;
// Stops a Claude worker's session and remembers it, so this run's slot count stops reading it as working.
function stopWorker(t) {
  run(FLEET, ['stop', t.account, t.workerId], { timeout: 60_000 });
  wakeRun.stopped.add(`${t.account}/${t.workerId}`);
}

// --- the hard limit and the wake queue ----------------------------------------------------------------
// Nothing automatic starts, respawns or wakes a worker session when that would put more working sessions on this
// machine than hosts.<name>.maxWorkers (plus its open burst slots), or than its sentryWorkers for a Sentry ticket. A
// ticket that needs to work again on a full machine (the reviewer's requested changes, a failed worker to replace, an
// engine round on a ticket waiting on the orchestrator, a parked PR gone red) waits in st.wakeQueue, first come first
// served, holding no slot, its worker neither replaced nor messaged. It wakes on the first tick a slot is free, ahead of
// any new ready ticket. `dispatcher.mjs wake ENG-123` pushes one ticket through over the limit, once: it writes a
// request to <sharedDir>/wake-requests, and the machine that holds the ticket honours it on its next tick and clears it.
const WAKE_REQUESTS = path.join(SHARED, 'wake-requests');
// This run's decisions: tickets granted a wake (each holds a slot for the rest of the run), the tickets that held a slot
// when the run reached them, the session list the count reads, and the override requests for tickets held here.
// attempted and started record the sessions this run tried to start and did start, so an override is spent only on a
// start it let through. reached holds the tickets whose PR was read this run; stopped the sessions this run stopped.
const wakeRun = { woken: new Set(), held: new Set(), asked: new Set(), reached: new Set(), attempted: new Set(), started: new Set(),
  stopped: new Set(), workers: null, overrides: new Map() };
const noteStart = (id, ok) => {
  wakeRun.attempted.add(id);
  if (ok) wakeRun.started.add(id);
};
// A Sentry ticket counts in this machine's Sentry slots; on a machine with none it counts in the regular pool.
const poolOf = (t) => (t?.sentry && (hostCfg.sentryWorkers ?? 0) > 0 ? 'sentry' : 'regular');
const baseMax = (pool) => (pool === 'sentry' ? hostCfg.sentryWorkers ?? 0 : hostCfg.maxWorkers ?? Infinity);
const poolMax = (pool) => baseMax(pool) + (pool === 'regular' ? burstSlots() : 0);
const slotWord = (pool) => (pool === 'sentry' ? 'Sentry slot' : 'slot');
const wakeEntry = (st, id) => (st.wakeQueue ?? []).find((w) => w.id === id) ?? null;
// A ticket holds a slot while it builds, unless it is parked on the reviewer or waits in the wake queue.
const holdsSlot = (st, id, t) => t?.status === 'building' && !t.parked && !wakeEntry(st, id);
// A working session, by fleet.sh's own rule: a background session with a process whose state is not idle or done. A
// row with no process is a session left over from a restart. An engine run works while it is busy.
const workingRow = (w) => w.kind === 'background' && Boolean(w.pid)
  && (w.engine ? w.status === 'busy' : !['idle', 'done'].includes(w.state || w.status));
const workerKey = (t) => (t?.workerId ? `${t.account}/${t.workerId}` : null);
// Which ticket each worker works for, a bundle's lead before its companions.
function workerOwners(st) {
  const owner = new Map();
  for (const [id, t] of Object.entries(st.tickets)) {
    const key = workerKey(t);
    if (key && (!owner.has(key) || st.tickets[owner.get(key)].status === 'bundled')) owner.set(key, id);
  }
  return owner;
}
// Slots in use in a pool: each ticket that holds a slot or was woken this run, each ticket waiting in the wake queue
// when `queued` (dispatch keeps those slots for them), and each working session none of those accounts for: a worker
// started outside the queue, the busy worker of a ticket waiting on a merge or on the reviewer, a stuck ticket's worker
// still running. A session counts in the pool of the ticket it works for, and in the regular pool when it works for
// none. `except` leaves out one ticket and its worker.
function poolUse(st, workers, pool, { except = null, queued = false } = {}) {
  const counted = new Set();
  let used = 0;
  for (const [id, t] of Object.entries(st.tickets)) {
    const key = workerKey(t);
    if (id === except) {
      if (key) counted.add(key);
      continue;
    }
    if (poolOf(t) !== pool) continue;
    if (holdsSlot(st, id, t) || wakeRun.woken.has(id) || (queued && wakeEntry(st, id) && LIVE.includes(t.status))) {
      used += 1;
      if (key) counted.add(key);
    }
  }
  const owner = workerOwners(st);
  for (const w of workers ?? []) {
    const key = `${w.label}/${w.id}`;
    if (!workingRow(w) || counted.has(key) || wakeRun.stopped.has(key)) continue;
    counted.add(key);
    const id = owner.get(key);
    if (poolOf(id ? st.tickets[id] : null) === pool) used += 1;
  }
  return used;
}
// The working sessions no slot accounts for, for the log and status: outside the queue, and working for a queue ticket
// that holds no slot.
function sessionsWithoutSlot(st, workers) {
  const owner = workerOwners(st);
  let outside = 0;
  let slotless = 0;
  for (const w of workers ?? []) {
    if (!workingRow(w) || wakeRun.stopped.has(`${w.label}/${w.id}`)) continue;
    const id = owner.get(`${w.label}/${w.id}`);
    if (!id) outside += 1;
    else if (!holdsSlot(st, id, st.tickets[id]) && !wakeRun.woken.has(id)) slotless += 1;
  }
  return { outside, slotless };
}
// This machine's sessions: the fleet's list, which throws when it can't be read, and the engines' runs.
async function sessionRows(st) {
  const rows = fleetWorkers();
  return engines.wanted(st) ? [...rows, ...await engines.call('reading the engine registry', [], (e, c) => e.rows(c))] : rows;
}

// Whether a ticket may start, respawn or wake a worker session now. Granted when its pool has a slot free counting the
// ticket as one (its own slot and worker left out), or, only when it has none, when an override for it is pending. A ticket that held no slot
// and was not waiting goes behind every ticket already waiting in its pool, so the queue stays first come first served.
// A refused ticket joins the wake queue, or keeps its place there; `join: false` (a command run by hand) only refuses.
// Once granted, it stays granted for the run.
function mayWake(st, id, t, reason, { join = true } = {}) {
  wakeRun.asked.add(id);
  if (wakeRun.woken.has(id)) return true;
  const pool = poolOf(t);
  const max = poolMax(pool);
  const entry = wakeEntry(st, id);
  const override = wakeRun.overrides.get(id);
  const used = wakeRun.workers ? poolUse(st, wakeRun.workers, pool, { except: id }) : null;
  // First come first served: a waiting ticket stays behind the ones that started waiting before it, and a ticket that
  // held no slot and was not waiting goes behind all of them.
  const queue = st.wakeQueue ?? [];
  const ahead = entry ? queue.slice(0, queue.indexOf(entry)) : wakeRun.held.has(id) ? [] : queue;
  // A waiter whose PR was read this run and that asked for nothing no longer needs a worker, so it blocks nobody.
  const finished = (w) => wakeRun.reached.has(w.id) && !wakeRun.asked.has(w.id);
  const behind = ahead.some((w) => w.id !== id && !wakeRun.woken.has(w.id) && !finished(w) && poolOf(st.tickets[w.id]) === pool);
  const waited = entry ? `${Math.round(hoursSince(entry.since) * 60)} minutes` : null;
  const burst = used !== null && used + 1 > baseMax(pool) ? `using a burst slot: ${burstState()?.reading}; ${used}/${baseMax(pool)} ${slotWord(pool)}s in use` : null;
  const fits = used !== null && !behind && used + 1 <= max;
  if (fits || override) {
    wakeRun.woken.add(id);
    if (entry) {
      st.wakeQueue = st.wakeQueue.filter((w) => w !== entry);
      // The wait was the machine's, so it never reads as the live worker's stall. A worker whose session has ended
      // keeps its clock, so a ticket nothing can move still goes stuck on time once it wakes.
      if ((wakeRun.workers ?? []).some((w) => w.label === t.account && w.id === t.workerId && w.pid)) t.lastProgressAt = iso();
      delete t.stalledSince;
    }
    if (!fits) {
      // Spent only once a start it let through succeeds, or once the ticket takes its slot back without one
      // (settleWakeOverrides).
      override.needed = true;
      log(`${id}: a wake override pushes it through over the limit (${used ?? 'unknown'}/${max} ${slotWord(pool)}s in use without it)${entry ? ` after ${waited} in the wake queue` : ''}: ${reason}`);
    } else if (entry && burst) log(`${id}: ${burst}, so it wakes after ${waited} in the wake queue: ${reason}`);
    else if (entry) log(`${id}: a ${slotWord(pool)} is free (${used}/${max} in use), so it wakes after ${waited} in the wake queue: ${reason}`);
    else if (burst) log(`${id}: ${burst}: ${reason}`);
    saveState(st);
    return true;
  }
  const closed = pool === 'regular' && burstState() && !burstSlots() ? `; ${burstText()}` : '';
  const full = used === null ? "this machine's working sessions could not be counted"
    : behind ? `a ticket ahead of it waits for the ${slotWord(pool)}` : `${used}/${max} ${slotWord(pool)}s in use${closed}`;
  if (!join) return false;
  if (entry) Object.assign(entry, { reason, pool });
  else {
    (st.wakeQueue ??= []).push({ id, since: iso(), reason, pool });
    log(`${id}: needs to work again (${reason}), but this machine is full (${full}), so it waits in the wake queue`);
  }
  t.note = `waiting for a free ${slotWord(pool)} (${full}): ${reason}`;
  saveState(st);
  return false;
}
// The wake queue keeps only live tickets that still hold no slot of their own.
function pruneWakeQueue(st) {
  if (!st.wakeQueue?.length) return;
  const keep = st.wakeQueue.filter((w) => LIVE.includes(st.tickets[w.id]?.status) && !st.tickets[w.id].parked);
  for (const w of st.wakeQueue.filter((x) => !keep.includes(x))) {
    const t = st.tickets[w.id];
    log(`${w.id}: left the wake queue (${!t ? 'no longer on this machine' : t.parked ? `waiting on ${RV}'s review` : t.status})`);
  }
  st.wakeQueue = keep;
}
function leaveWakeQueue(st, id, why) {
  const entry = wakeEntry(st, id);
  if (!entry) return;
  st.wakeQueue = st.wakeQueue.filter((w) => w !== entry);
  log(`${id}: left the wake queue, ${why}`);
}
// The override for one ticket, or null. A file the sync has only half written reads as none yet.
function readWakeRequest(id) {
  const file = path.join(WAKE_REQUESTS, `${id}.json`);
  try {
    return { ...JSON.parse(fs.readFileSync(file, 'utf8')), file, needed: false };
  } catch {
    return null;
  }
}
const TICKET_FILE = new RegExp(`^${TEAM}-\\d+\\.json$`);
// The overrides for tickets this machine holds. A request no machine takes within a day is dropped by whichever
// machine sees it first.
function loadWakeOverrides(st) {
  let names;
  try {
    names = fs.readdirSync(WAKE_REQUESTS).filter((n) => TICKET_FILE.test(n));
  } catch {
    return;
  }
  for (const id of names.map((n) => n.slice(0, -'.json'.length))) {
    const req = readWakeRequest(id);
    if (!req) continue;
    if (LIVE.includes(st.tickets[id]?.status)) wakeRun.overrides.set(id, req);
    else if (hoursSince(req.at) > (cfg.wakeRequestHours ?? 24)) {
      if (!DRY) fs.rmSync(req.file, { force: true });
      log(`${id}: dropped the wake override from ${req.at}, since no machine has held the ticket for ${cfg.wakeRequestHours ?? 24}h`);
    }
  }
}
// Runs once a run ends, whatever happened in it. An override is spent, and cleared, once it let a ticket past the limit
// and the session that needed it started, or the ticket took its slot back with no start. One whose start failed, or
// whose ticket still waits, stands for the next run. One for a ticket that does not wait for a slot is cleared unused.
function settleWakeOverrides(st) {
  for (const [id, o] of wakeRun.overrides) {
    const spent = o.needed && (wakeRun.started.has(id) || !wakeRun.attempted.has(id));
    if (!spent && (wakeEntry(st, id) || (o.needed && wakeRun.attempted.has(id)))) continue;
    if (!DRY) fs.rmSync(o.file, { force: true });
    if (!spent) log(`${id}: cleared the wake override unused, since it does not wait for a slot (${st.tickets[id]?.status ?? 'gone'})`);
  }
  wakeRun.overrides.clear();
}

// --- state, lock, pause ------------------------------------------------------------------------------

function loadState() {
  for (const file of [STATE, `${STATE}.bak`]) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw new Error(`${file} is unreadable (${e.message}); fix or remove it by hand`);
    }
  }
  return { tickets: {}, dispatches: [], stuckStreak: 0, fresh: true };
}
function saveState(st) {
  if (DRY) return;
  delete st.fresh;
  if (fs.existsSync(STATE)) fs.copyFileSync(STATE, `${STATE}.bak`);
  fs.writeFileSync(`${STATE}.tmp`, `${JSON.stringify(st, null, 2)}\n`);
  fs.renameSync(`${STATE}.tmp`, STATE);
}

const isPaused = () => fs.existsSync(PAUSED);
const pauseReason = () => (isPaused() ? fs.readFileSync(PAUSED, 'utf8').trim() : null);
// The hold: while <sharedDir>/HOLD exists (`dispatcher.mjs hold`, on any machine), no machine claims a new ready ticket
// and Sentry triage queues nothing new. dispatcher.holdNewWork true holds the one machine whose config says so. Unlike
// a pause, which also stops merges, everything already claimed carries on: PRs merge, workers are replaced and woken,
// and the wake queue drains.
const HOLD = path.join(SHARED, 'HOLD');
const newWorkHeld = () => cfg.holdNewWork === true || fs.existsSync(HOLD);
const holdWhere = () => (fs.existsSync(HOLD) ? 'on every machine (dispatcher.mjs hold)' : `on ${HOST} (dispatcher.holdNewWork)`);

function takeLock() {
  try {
    fs.mkdirSync(LOCK);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if (Date.now() - fs.statSync(LOCK).mtimeMs < 30 * 60_000) return false;
    fs.rmdirSync(LOCK);
    fs.mkdirSync(LOCK);
    return true;
  }
}

// The pause is written first, then the human is told. A failed notice is retried at the start of every tick.
async function trip(st, reason) {
  log(`circuit breaker: ${reason}`);
  if (DRY) return;
  if (!isPaused()) fs.writeFileSync(PAUSED, `${iso()} ${reason}\n`);
  st.pendingNotice = reason;
  saveState(st);
  await notify('Queue paused', reason);
  await sendPendingNotice(st);
}
async function sendPendingNotice(st) {
  if (!st.pendingNotice || DRY) return;
  try {
    askHuman(null, 'blocked', `The agent dispatcher paused itself: ${st.pendingNotice}`,
      `Check the cause, then run: node ${path.join(DIR, 'dispatcher.mjs')} resume`,
      'it stays paused, so no new dispatches and no merges');
    delete st.pendingNotice;
    saveState(st);
  } catch (e) {
    log(`could not reach the inbox about the pause, will retry next tick (${errText(e)})`);
  }
}

// The inbox's upkeep, once per tick (ask-human.sh sweep): post open asks that haven't reached Slack, and clear
// the needs-human label from answered ones, so a reply in the Slack thread closes the item without anyone touching Linear.
function inboxSweep() {
  if (DRY) return log('would sweep the inbox');
  try {
    for (const line of run(ASK, ['sweep'], { timeout: 180_000 }).split('\n').filter(Boolean)) log(`inbox: ${line}`);
  } catch (e) {
    log(`inbox sweep failed (${errText(e)})`);
  }
}

// --- 1. the merged commits' CI on main --------------------------------------------------------------

// Whether a later push to main that contains `sha` passed the named workflow. Errors read as "no", so a failure to
// check never hides a real break.
function laterGreenRun(workflow, sha) {
  try {
    const runs = JSON.parse(gh(['run', 'list', '--repo', REPO, '--branch', BASE, '--workflow', workflow, '--event', 'push',
      '--json', 'headSha,status,conclusion', '--limit', '15']));
    return runs.some((r) => r.headSha !== sha && r.status === 'completed' && r.conclusion === 'success'
      && ['ahead', 'identical'].includes(gh(['api', `repos/${REPO}/compare/${sha}...${r.headSha}`, '--jq', '.status']).trim()));
  } catch {
    return false;
  }
}

async function checkMerged(st) {
  for (const [id, t] of Object.entries(st.tickets)) {
    if (t.status !== 'merged' || t.ciChecked || !t.mergedSha) continue;
    let runs;
    try {
      // Only the runs the merge's push started. A nightly job that lands on this commit, or a manual run (a production
      // promote that refused a SHA, say), says nothing about the merge, and both had paused the queue.
      runs = JSON.parse(gh(['run', 'list', '--repo', REPO, '--commit', t.mergedSha, '--json', 'name,status,conclusion,event', '--limit', '100']))
        .filter((r) => r.event === 'push');
    } catch (e) {
      log(`${id}: could not read main's runs (${errText(e)})`);
      continue;
    }
    const failed = runs.filter((r) => r.status === 'completed' && ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion));
    if (failed.length) {
      // A flaky test fails one commit and passes the next (an e2e test did on one merge), and
      // pausing the whole queue for it costs hours. So a failure counts only once no later main commit containing
      // this merge has passed the same workflow, and only after waiting up to flakeWaitMinutes for one to run.
      const recovered = failed.every((r) => laterGreenRun(r.name, t.mergedSha));
      if (recovered) {
        log(`${id}: ${failed.map((r) => r.name).join(', ')} failed on the merge commit but passed on a later main commit that contains it, so it was flaky; not pausing`);
        t.ciChecked = true;
      } else if (hoursSince(t.mergedAt) * 60 < (cfg.flakeWaitMinutes ?? 90)) {
        log(`${id}: ${failed.map((r) => r.name).join(', ')} failed on the merge commit; waiting for a later main commit to show whether it is flaky`);
      } else {
        await trip(st, `checks failed on main after merging ${id}: ${failed.map((r) => r.name).join(', ')} (${t.pr})`);
        t.ciChecked = true;
      }
    } else if ((runs.length && runs.every((r) => r.status === 'completed')) || hoursSince(t.mergedAt) > 6) {
      t.ciChecked = true;
    }
    saveState(st);
  }
}

// --- 2. advance the tickets this machine dispatched -------------------------------------------------

// The PR is found once by branch, checked to be this repo into main, and pinned by number after that. A reopened ticket
// reuses its branch name, so only a PR opened after this claim counts: a reopened ticket's old merged PR once read as
// the rebuild's PR and the ticket went to Verifying 20 minutes into the build.
function findPr(t, id) {
  // A ticket an engine worked on and put back in the queue: its PR was opened before this claim, so the search below
  // would skip it. The shared record names it; it is taken while it is still open.
  const carried = !t.prNumber && engines.marked(id)?.prNumber;
  if (carried) {
    const p = JSON.parse(gh(['pr', 'view', String(carried), '--repo', REPO, '--json', 'state,headRefName']));
    if (p.state === 'OPEN' && p.headRefName === t.branch) t.prNumber = carried;
  }
  if (!t.prNumber) {
    const list = JSON.parse(gh(['pr', 'list', '--repo', REPO, '--head', t.branch, '--state', 'all', '--json', 'number,baseRefName,isCrossRepository,createdAt']));
    const since = Date.parse(t.claimedAt ?? t.dispatchedAt ?? 0);
    const mine = list.filter((p) => p.baseRefName === BASE && !p.isCrossRepository && Date.parse(p.createdAt) >= since);
    if (mine.length > 1) throw new Error(`${mine.length} PRs on ${t.branch}; pin one by setting prNumber in state.json`);
    if (!mine.length) return null;
    t.prNumber = mine[0].number;
  }
  const pr = JSON.parse(gh(['pr', 'view', String(t.prNumber), '--repo', REPO, '--json',
    'number,url,state,isDraft,mergeStateStatus,headRefOid,headRefName,baseRefName,changedFiles,mergeCommit,statusCheckRollup,updatedAt,body']));
  if (pr.headRefName !== t.branch || pr.baseRefName !== BASE) throw new Error(`PR #${pr.number} is ${pr.headRefName} -> ${pr.baseRefName}, expected ${t.branch} -> ${BASE} (${id})`);
  return pr;
}

// Green means GitHub calls it mergeable, the AI review check (github.reviewCheck) passed, and no review thread is open.
function greenReason(pr) {
  if (pr.isDraft) return 'draft';
  if (!['CLEAN', 'HAS_HOOKS'].includes(pr.mergeStateStatus)) return `merge state ${pr.mergeStateStatus}`;
  if (REVIEW_CHECK) {
    const review = (pr.statusCheckRollup ?? []).find((c) => (c.name ?? c.context) === REVIEW_CHECK);
    if (!review || (review.conclusion ?? review.state) !== 'SUCCESS') return `${REVIEW_CHECK} not passed`;
  }
  return openThreads(pr);
}
function openThreads(pr) {
  const [owner, name] = REPO.split('/');
  const threads = JSON.parse(gh(['api', 'graphql', '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `n=${pr.number}`, '-f',
    'query=query($owner:String!,$name:String!,$n:Int!){ repository(owner:$owner,name:$name){ pullRequest(number:$n){ reviewThreads(first:100){ totalCount nodes{ isResolved } } } } }']));
  const rt = threads.data.repository.pullRequest.reviewThreads;
  if (rt.totalCount > rt.nodes.length) return 'more than 100 review threads';
  const open = rt.nodes.filter((n) => !n.isResolved).length;
  return open ? `${open} unresolved review thread(s)` : null;
}

// Every changed path and rename source, paginated. A count short of changedFiles is treated as risky.
// The PR's entry in the base branch's merge queue, or null when it is not queued (or the queue cannot be read).
function queueEntry(number) {
  try {
    const [owner, name] = REPO.split('/');
    const out = gh(['api', 'graphql', '-f', `query=query{repository(owner:"${owner}",name:"${name}"){pullRequest(number:${Number(number)}){mergeQueueEntry{state position}}}}`,
      '--jq', '.data.repository.pullRequest.mergeQueueEntry']);
    return out && out !== 'null' ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}

function riskyPaths(pr) {
  const out = gh(['api', `repos/${REPO}/pulls/${pr.number}/files`, '--paginate', '--jq', '.[] | "\\(.filename)\\t\\(.previous_filename // "")"']);
  const rows = out ? out.split('\n') : [];
  const paths = rows.flatMap((r) => r.split('\t')).filter(Boolean);
  if (rows.length < pr.changedFiles) return [`(only ${rows.length} of ${pr.changedFiles} files could be read)`];
  return [...new Set(paths.filter((p) => RISKY.some((rx) => rx.test(p))))];
}

const MERGE_REQUESTS = path.join(SHARED, 'merge-requests');
// extra: an engine-built PR's request also says who built it and that no Claude has reviewed it (driver, engine, review).
function requestMerge(id, pr, risky, extra = {}) {
  if (DRY) return log(`would request the orchestrator's merge of ${id}`);
  fs.mkdirSync(MERGE_REQUESTS, { recursive: true });
  fs.writeFileSync(path.join(MERGE_REQUESTS, `${id}.json`), `${JSON.stringify({
    id, pr: pr.number, url: pr.url, head: pr.headRefOid, risky, host: HOST, at: iso(), ...extra,
  }, null, 2)}\n`);
}
const clearMergeRequest = (id) => fs.rmSync(path.join(MERGE_REQUESTS, `${id}.json`), { force: true });

// Sentry fix tickets (Sentry triage labels them linear.labels.sentry) get their own worker slots on a host that
// offers hosts.<name>.sentryWorkers, apart from its maxWorkers: a side worker for Sentry work that never takes a
// regular slot and sits idle when there is none. Every machine writes a heartbeat to the synced
// heartbeats folder each tick. While a Sentry host's heartbeat is fresh and unpaused, the other machines leave Sentry
// tickets to it; when it is offline or paused, they build them as usual, so a fix never waits on one machine.
const HEARTBEATS = path.join(SHARED, 'heartbeats');
const isSentry = (issue) => issue.labels.nodes.some((l) => l.name === L.sentry);
// The heartbeat also carries this machine's wake queue, so `wake` on any machine can say where a ticket waits, its
// worktree count (the folders in the worktrees folder of every repo the sweep covers), and, while workerReservePercent
// is set, its working sessions per Claude account, for the other machines' reserve.
async function writeHeartbeat(st) {
  if (DRY) return;
  fs.mkdirSync(HEARTBEATS, { recursive: true });
  const wakeQueue = (st.wakeQueue ?? []).map(({ id, since, reason, pool }) => ({ id, since, reason, pool }));
  const beat = { host: HOST, at: iso(), paused: isPaused(), held: newWorkHeld(), wakeQueue, worktrees: await worktreeCount(),
    ...(reserving() ? { accountsWorking: accountsWorkingHere() } : {}) };
  fs.writeFileSync(path.join(HEARTBEATS, `${HOST}.json`), `${JSON.stringify(beat)}\n`);
}
// This machine's working sessions per Claude account. An unreadable fleet usage reports none, which only makes the
// other machines' projection less cautious for one tick.
function accountsWorkingHere() {
  try {
    return JSON.parse(run(FLEET, ['usage', '--json'], { timeout: 180_000 })).filter((a) => a.signed_in && a.working)
      .map((a) => ({ key: accountKey(a), label: a.label, working: a.working }));
  } catch {
    return [];
  }
}
// The other enabled machines' heartbeats under maxMinutes old.
function otherHeartbeats(maxMinutes = cfg.heartbeatFreshMinutes ?? 60) {
  return cfg.enabledHosts.filter((h) => h !== HOST).flatMap((host) => {
    try {
      const beat = JSON.parse(fs.readFileSync(path.join(HEARTBEATS, `${host}.json`), 'utf8'));
      return hoursSince(beat.at) * 60 < maxMinutes ? [beat] : [];
    } catch {
      return []; // no heartbeat yet
    }
  });
}
function liveSentryHost() {
  for (const host of cfg.enabledHosts) {
    if (host === HOST || !(cfg.hosts?.[host]?.sentryWorkers > 0)) continue;
    try {
      const beat = JSON.parse(fs.readFileSync(path.join(HEARTBEATS, `${host}.json`), 'utf8'));
      if (!beat.paused && hoursSince(beat.at) * 60 < (cfg.sentryHeartbeatMinutes ?? 45)) return host;
    } catch {
      // No heartbeat yet reads as offline.
    }
  }
  return null;
}

// A bundle is a lead ticket plus companions that ride on the lead's worker, branch and PR (every
// extra PR costs CI runs and a review round). The lead's state entry carries `bundle`; each companion's carries
// `bundledInto` and the status 'bundled', which no loop advances on its own: the lead settles it. Each machine writes
// its live bundles to the synced bundles folder, so every machine counts a bundle as one worker against maxConcurrent.
const BUNDLES = path.join(SHARED, 'bundles');
function writeBundle(lead, companions) {
  if (DRY) return;
  fs.mkdirSync(BUNDLES, { recursive: true });
  fs.writeFileSync(path.join(BUNDLES, `${lead}.json`), `${JSON.stringify({ lead, companions, host: HOST, at: iso() })}\n`);
}
const clearBundle = (lead) => !DRY && fs.rmSync(path.join(BUNDLES, `${lead}.json`), { force: true });
function bundledCompanions() {
  let files = [];
  try {
    files = fs.readdirSync(BUNDLES).filter((f) => f.endsWith('.json'));
  } catch {
    return new Set();
  }
  return new Set(files.flatMap((f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(BUNDLES, f), 'utf8')).companions ?? [];
    } catch {
      return [];
    }
  }));
}
const sizeOf = (issue) => issue.labels.nodes.find((l) => l.parent?.name === SIZE_GROUP)?.name;
// Specdesk marks a ticket sliced thin on purpose with "Ships alone: <reason>" in its decisions; it never bundles.
const shipsAlone = (issue) => /^\s*[*-]?\s*\**Ships alone\b/im.test(issue.description ?? '');
const openBlockers = (issue) => issue.inverseRelations.nodes.filter((r) => r.type === 'blocks'
  && !CLOSED_STATES.includes(r.issue.state.type) && r.issue.state.name !== 'Verifying');

// Two tickets belong together when they share a parent ticket or are linked to each other directly (blocks, related).
// A shared project alone is not enough: a broad project holds unrelated work, and project-only bundling once would
// have put an admin tool's edits into an unrelated messaging PR.
const linkedIds = (issue) => [
  ...(issue.relations?.nodes ?? []).map((r) => r.relatedIssue?.identifier),
  ...(issue.inverseRelations?.nodes ?? []).map((r) => r.issue?.identifier),
].filter(Boolean);
const linked = (a, b) => (a.parent?.identifier && a.parent.identifier === b.parent?.identifier)
  || linkedIds(a).includes(b.identifier) || linkedIds(b).includes(a.identifier);

// The companions a lead takes: other ready tickets in its project, linked to the lead or to a companion already taken,
// of a bundle size, not marked Ships alone, with no open blocker outside the bundle, in queue order, up to
// bundle.maxTickets in all.
function pickCompanions(lead, ready, taken) {
  const b = cfg.bundle ?? {};
  const sizes = b.sizes ?? ['S', 'M'];
  if (!(b.enabled || FORCE_BUNDLE) || !lead.project?.id || !sizes.includes(sizeOf(lead)) || shipsAlone(lead)) return [];
  const picked = [];
  for (const c of ready) {
    if (picked.length >= (b.maxTickets ?? 3) - 1) break;
    if (c === lead || taken.has(c.identifier) || c.project?.id !== lead.project.id || !sizes.includes(sizeOf(c)) || shipsAlone(c)) continue;
    if (![lead, ...picked].some((x) => linked(c, x)) || isSentry(c) !== isSentry(lead)) continue;
    const inBundle = new Set([lead.identifier, ...picked.map((p) => p.identifier)]);
    if (openBlockers(c).some((r) => !inBundle.has(r.issue.identifier))) continue;
    picked.push(c);
  }
  return picked;
}

// A bundle's companions follow their lead: to Verifying when it merges, to agent-stuck when it is stuck, and out of
// the queue when its PR is closed under review.
async function settleCompanions(st, m, id, t, how, { pr = null, reason = '' } = {}) {
  if (!t.bundle?.length) return;
  clearBundle(id);
  for (const cid of t.bundle) {
    const c = st.tickets[cid];
    if (c?.status !== 'bundled') continue;
    let ciid;
    try {
      ciid = await issueId(cid);
    } catch (e) {
      log(`${cid}: could not look up the ticket to settle it with ${id}, trying next tick (${errText(e)})`);
      continue;
    }
    if (how === 'merged') {
      // ciChecked: the lead's merge commit is this ticket's too, and checkMerged watches it once, on the lead.
      Object.assign(c, { status: 'merged', mergedAt: iso(), mergedSha: pr?.mergeCommit?.oid ?? null, ciChecked: true });
      saveState(st);
      log(`${cid}: merged with ${id}`);
      await effects(c, cid, [
        [`remove agent-building from ${cid}`, () => removeLabel(ciid, m.label.building)],
        [`move ${cid} to Verifying`, () => setState(ciid, m.verifying)],
        [`comment the merge on ${cid}`, () => comment(ciid, `Merged ${pr.url} together with ${id} (agent dispatcher on ${HOST}). Moved to ${STATES.verifying}.`)],
      ]);
    } else if (how === 'stuck') {
      Object.assign(c, { status: 'stuck', stuckAt: iso(), reason: `its bundle lead ${id} is stuck: ${reason}` });
      saveState(st);
      log(`${cid}: stuck with ${id}`);
      await effects(c, cid, [
        [`label ${cid} agent-stuck`, () => addLabel(ciid, m.label.stuck)],
        [`remove agent-building from ${cid}`, () => removeLabel(ciid, m.label.building)],
        [`comment why ${cid} is stuck`, () => comment(ciid, `Agent dispatcher gave up on this ticket's bundle with ${id}: ${reason}. Labeled ${L.stuck}; see ${id} for the PR and the question to ${HUMAN}.`)],
      ]);
    } else {
      Object.assign(c, { status: 'closed', closedAt: iso() });
      saveState(st);
      await effects(c, cid, [[`remove agent-building from ${cid}`, () => removeLabel(ciid, m.label.building)]]);
    }
    saveState(st);
  }
}

// A green PR merges only once it is known to work with the main it lands on (premerge-check.mjs, 2026-11-04). When
// main has moved since its CI ran, this merges current main into it locally and type-checks, on every machine. A fail
// updates the PR branch with main, so CI re-runs, goes red and the worker fixes the clash. A check that could not run
// (no CI run found, or the type-check was killed, as earlyoom does on a small box) holds the merge to the next tick.
async function freshEnough(id, t, pr) {
  // While main is red (main-watch.mjs, every 3 minutes, synced to every machine), no queue PR merges: piling onto a
  // red main hides the next break, and every pre-merge check would fail on main's own error. The responder's fix PR
  // is not a queue ticket, so it is never held here. A state file older than 15 minutes is ignored.
  let mainState = null;
  try {
    mainState = JSON.parse(fs.readFileSync(path.join(SHARED, 'main-state.json'), 'utf8'));
  } catch { /* no watcher state yet */ }
  if (mainState?.status === 'red' && hoursSince(mainState.updatedAt) < 0.25) {
    t.note = `green, held while main is red (since ${String(mainState.redSha).slice(0, 10)})`;
    log(`${id}: green, holding the merge while main is red`);
    return false;
  }
  let r;
  try {
    const { premergeCheck } = await import('./premerge-check.mjs');
    r = premergeCheck(pr.number, pr.headRefOid, { log });
  } catch (e) {
    log(`${id}: pre-merge check could not run, trying next tick (${errText(e)})`);
    return false;
  }
  if (!r.stale) return true;
  if (r.ok) {
    log(`${id}: pre-merge check passed against main ${r.main.slice(0, 8)}`);
    return true;
  }
  if (r.unchecked) {
    t.note = `green, pre-merge check could not run (${r.reason})`;
    log(`${id}: pre-merge check could not run (${r.reason}), trying next tick`);
    return false;
  }
  t.note = `pre-merge check failed: ${r.reason}`;
  log(`${id}: pre-merge check failed: ${r.reason}\n${r.output ?? ''}`);
  try {
    gh(['api', '-X', 'PUT', `repos/${REPO}/pulls/${pr.number}/update-branch`, '-f', `expected_head_sha=${pr.headRefOid}`]);
    log(`${id}: updated PR #${pr.number} with main so CI re-runs and shows the clash`);
    await comment(await issueId(id), `Agent dispatcher on ${HOST}: held the merge. Merging current main into this PR fails: ${r.reason}. The PR branch was updated with main, so its CI re-runs and shows the error; the worker fixes it there.\n\n\`\`\`\n${(r.output ?? '').slice(0, 1500)}\n\`\`\``);
  } catch (e) {
    log(`${id}: could not update the branch or comment (${errText(e)})`);
  }
  return false;
}

// --- Sentry merge paths: mechanical merges itself, judgment waits on the reviewer -------------------------------

// Sentry triage labels each fix mechanical or judgment (linear.labels) and writes the reason in the spec's
// "## Merge path". A mechanical PR merges when green, as any queue PR. A judgment PR gets the reviewer (config
// `reviewer`) as its GitHub reviewer, one ticket comment and one Slack DM, and merges only once the reviewer's latest
// review approves the current head. A Sentry ticket with neither label (triaged before the merge path existed) counts
// as judgment. Without branch protection GitHub's reviewDecision stays empty, and a review bot may post APPROVED
// reviews of its own, so the gate reads the reviewer's reviews by login instead.
const REVIEWER = { name: 'the reviewer', github: '', slackUser: '', fallbackChannel: conf.slack?.channel ?? '', ...(conf.reviewer ?? {}) };
const RV = REVIEWER.name;
const MERGE_LABELS = { mechanical: L.mechanical, judgment: L.judgment };
const ESCALATION = /^[ \t>*_-]*Merge path:\s*human-review\b[\s:.,()-]*(.*)$/im;

// The Sentry and merge-path labels of the given open tickets, in one query.
async function sentryLabelsOf(ids) {
  if (!ids.length) return {};
  const numbers = ids.map((x) => Number(x.split('-')[1])).filter(Number.isInteger);
  const d = await gql(`query($team:String!,$numbers:[Float!]){ issues(first:100, filter:{team:{key:{eq:$team}}, number:{in:$numbers}}){
    nodes{ identifier labels{ nodes{ name } } } } }`, { team: TEAM, numbers });
  const wanted = new Set(ids);
  return Object.fromEntries(d.issues.nodes.filter((n) => wanted.has(n.identifier)).map((n) => [n.identifier, n.labels.nodes.map((l) => l.name)]));
}

// Judgment unless every Sentry ticket in the PR is labeled mechanical. Non-Sentry tickets have no merge path.
function mergePathOf(id, t, labels) {
  const members = [id, ...(t.bundle ?? [])].map((x) => labels[x] ?? []);
  const sentry = members.some((l) => l.includes(L.sentry) || l.includes(MERGE_LABELS.judgment) || l.includes(MERGE_LABELS.mechanical));
  if (!sentry) return null;
  if (t.reviewer?.escalated || members.some((l) => l.includes(MERGE_LABELS.judgment))) return 'judgment';
  return members.every((l) => !l.includes(L.sentry) || l.includes(MERGE_LABELS.mechanical)) ? 'mechanical' : 'judgment';
}

let mergeLabelIdCache = null;
async function mergeLabelIds() {
  if (mergeLabelIdCache) return mergeLabelIdCache;
  const d = await gql(`query{ issueLabels(first:10, filter:{name:{in:["${MERGE_LABELS.mechanical}","${MERGE_LABELS.judgment}"]}}){ nodes{ id name parent{ name } } } }`);
  const ids = Object.fromEntries(d.issueLabels.nodes.filter((l) => !l.parent).map((l) => [l.name, l.id]));
  if (!ids[MERGE_LABELS.judgment]) {
    ids[MERGE_LABELS.judgment] = (await gql('mutation($n:String!,$d:String!){ issueLabelCreate(input:{name:$n, color:"#7c3aed", description:$d}){ issueLabel{ id } } }',
      { n: MERGE_LABELS.judgment, d: `Sentry fix: needs a human call, its PR waits on ${RV}'s review` })).issueLabelCreate.issueLabel.id;
  }
  mergeLabelIdCache = ids;
  return ids;
}

// A mechanical ticket turned judgment: the worker said so in the PR body, or its green PR touches reviewed paths.
// The label swap runs once; the escalation itself is kept in state, so the PR waits on the reviewer even if the swap failed.
async function escalate(st, id, t, reason) {
  if (t.reviewer?.escalated) return;
  (t.reviewer ??= {}).escalated = reason;
  saveState(st);
  log(`${id}: treated as judgment, so it waits on ${RV}'s review: ${reason}`);
  if (DRY) return;
  try {
    const ids = await mergeLabelIds();
    for (const x of [id, ...(t.bundle ?? [])]) {
      const iid = await issueId(x);
      if (ids[MERGE_LABELS.mechanical]) await removeLabel(iid, ids[MERGE_LABELS.mechanical]).catch(() => {});
      await addLabel(iid, ids[MERGE_LABELS.judgment]);
    }
  } catch (e) {
    (t.effectErrors ??= []).push(`${iso()} swap ${id} to ${MERGE_LABELS.judgment}: ${errText(e)}`);
    log(`${id}: could not swap its label to ${MERGE_LABELS.judgment} (${errText(e)})`);
  }
}

// One-time side effect with its own record in t.reviewer[key]. A failure the effect calls definite (it surely did not
// happen) is retried on later ticks, up to `tries`; an ambiguous one (a timeout, where it may have happened) is not,
// so a restart or a flaky network never sends the reviewer a second request, comment or DM.
async function reviewerOnce(st, id, t, key, what, fn, { tries = 3, idempotent = false } = {}) {
  const j = (t.reviewer ??= {});
  const rec = j[key] ?? {};
  if (rec.done || (rec.tries ?? 0) >= tries) return Boolean(rec.done);
  // Still marked in flight from a run that ended mid-call: it may have happened, so a comment or DM is never resent.
  if (rec.inFlight && !idempotent) return false;
  if (DRY) {
    log(`would ${what}`);
    return false;
  }
  j[key] = { ...rec, tries: (rec.tries ?? 0) + 1, at: iso(), inFlight: true };
  saveState(st);
  try {
    const extra = await fn();
    Object.assign(j[key], { done: iso() }, extra && typeof extra === 'object' ? extra : {});
    delete j[key].inFlight;
    saveState(st);
    return true;
  } catch (e) {
    // Retried only when it surely did not happen (the service refused it), or when repeating it is harmless.
    if (idempotent || e.definite === true) delete j[key].inFlight;
    (t.effectErrors ??= []).push(`${iso()} ${what}: ${errText(e)}`);
    log(`${id}: could not ${what}${j[key].inFlight ? ', and it may have happened, so it is not retried' : ''} (${errText(e)})`);
    saveState(st);
    return false;
  }
}

async function slackPost(channel, text) {
  let token;
  try {
    token = fs.readFileSync(SLACK_BOT, 'utf8').trim();
  } catch {
    throw Object.assign(new Error(`no Slack bot token at ${SLACK_BOT}`), { definite: true });
  }
  let res;
  try {
    res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw Object.assign(new Error(`Slack did not answer (${e.message})`), { definite: false });
  }
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!body.ok) throw Object.assign(new Error(`Slack refused the post: ${body.error}`), { slackError: body.error, definite: true });
  return body.channel;
}

// The reviewer's DM. Slack's chat.postMessage docs: with chat:write, a user ID as `channel` posts to that user's DM with the
// app (its App Home Messages tab); im:write is only needed for conversations.open. When the app's Messages tab is off
// Slack answers messages_tab_disabled, and channel_not_found when the app may not DM that user. Either one falls back
// to a post in the fallback channel that mentions them.
async function dmReviewer(text) {
  try {
    return { channel: await slackPost(REVIEWER.slackUser, text), via: 'dm' };
  } catch (e) {
    if (!['messages_tab_disabled', 'channel_not_found', 'cannot_dm_bot', 'not_allowed_token_type'].includes(e.slackError)) throw e;
    log(`${RV}'s DM was refused (${e.slackError}), posting in the fallback channel instead`);
    return { channel: await slackPost(REVIEWER.fallbackChannel, `<@${REVIEWER.slackUser}> ${text}`), via: 'agent-queue', dmError: e.slackError };
  }
}

// The reviews on a PR, oldest first, and the inline comments of one review.
function readReviews(n) {
  const out = gh(['api', `repos/${REPO}/pulls/${n}/reviews?per_page=100`, '--paginate', '--jq', '.[] | {id, state, body, commit_id, submitted_at, login: .user.login}']);
  return out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
}
function reviewComments(n, reviewId) {
  const out = gh(['api', `repos/${REPO}/pulls/${n}/reviews/${reviewId}/comments?per_page=100`, '--paginate', '--jq', '.[] | {path, line: (.line // .original_line), body}']);
  return out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const quote = (text) => String(text ?? '').trim().replace(/^/gm, '> ');
function changesNote(id, pr, review, comments) {
  const inline = comments.map((c) => `- \`${c.path}${c.line ? `:${c.line}` : ''}\`\n${quote(c.body).replace(/^/gm, '  ')}`).join('\n');
  const text = `${RV} reviewed PR #${pr.number} for ${id} (${pr.url}) and requested changes. Address every point below: change the code where the review is right, and where you disagree, explain why in your reply. Then push once through ${GATED_PUSH}, reply on each review thread saying what changed, and drive the PR back to green. Do not merge; the dispatcher merges once ${RV} approves. Continue from the existing branch and PR (its worktree under ${WORKTREES}/ may hold unpushed commits; check it first).\n\n${RV}'s review:\n${quote(review.body) || '> (no summary comment)'}\n${inline ? `\nInline comments:\n${inline}\n` : ''}`;
  return `${text.slice(0, 8000)}\n\n`;
}

// The reviewer's latest deciding review (APPROVED or CHANGES_REQUESTED) on the PR, or undefined.
const reviewerLatest = (n) => readReviews(n).filter((r) => r.login?.toLowerCase() === String(REVIEWER.github).toLowerCase()
  && ['APPROVED', 'CHANGES_REQUESTED'].includes(r.state)).at(-1);

// The judgment path for one open, non-draft PR. Returns 'approved' when the reviewer's latest review approves the
// current head, 'changes' when their latest review on the current head requests changes (routed to a worker here), or
// 'waiting'.
async function reviewerReview(st, id, t, pr, workers, why) {
  const j = (t.reviewer ??= {});
  const title = t.title ?? id;
  await reviewerOnce(st, id, t, 'requested', `request ${REVIEWER.github}'s review on PR #${pr.number}`,
    () => gh(['pr', 'edit', String(pr.number), '--repo', REPO, '--add-reviewer', REVIEWER.github]), { idempotent: true });
  if (!j.commented?.done) {
    await reviewerOnce(st, id, t, 'commented', `comment the review request on ${id}`, async () => {
      const iid = await issueId(id).catch((e) => { throw Object.assign(e, { definite: true }); });
      try {
        await comment(iid, `Agent dispatcher on ${HOST}: ${pr.url} needs ${RV}'s review before it merges. Why: ${why}. ${RV} is requested as the PR's reviewer and was sent a Slack message. The PR merges once they approve it and it is green; if they request changes, a worker addresses them and the PR goes back to them.`);
      } catch (e) {
        if (/^Linear: /.test(e.message)) e.definite = true; // Linear answered with an error, so nothing was posted
        throw e;
      }
    });
  }
  if (!j.dm?.done) {
    await reviewerOnce(st, id, t, 'dm', `send ${RV} a Slack message about ${id}`, async () => dmReviewer(
      `${id} (${title}) has a PR waiting on your review: ${pr.url}. It is a Sentry fix the agent queue flagged for a human call, and it merges once you approve it.`));
  }

  const latest = reviewerLatest(pr.number);
  if (latest?.state === 'APPROVED' && latest.commit_id === pr.headRefOid) return 'approved';

  if (latest?.state === 'CHANGES_REQUESTED' && latest.commit_id === pr.headRefOid) {
    // The changes put a parked ticket back to work: on a full machine it waits in the wake queue, holding no slot, and
    // its worker is neither replaced nor messaged until it wakes.
    if (!wakeRun.held.has(id) && !mayWake(st, id, t, `${RV} requested changes on PR #${pr.number}`)) return 'changes';
    j.handledReviews ??= [];
    if (j.handledReviews.includes(latest.id)) {
      t.note = `${RV} requested changes; a worker is addressing them`;
      return 'changes';
    }
    // A replacement already started for this review by a run that ended before recording it: adopt it.
    if (j.routing?.review === latest.id) {
      let started = null;
      try {
        started = fleetWorkers().find((w) => w.name === workerName(id) && !(w.label === j.routing.fromAccount && w.id === j.routing.fromWorker)) ?? null;
      } catch (e) {
        log(`${id}: could not list fleet workers to check ${RV}'s review round (${errText(e)})`);
        t.note = `${RV} requested changes; checking for its worker`;
        return 'changes';
      }
      if (started) {
        Object.assign(t, { account: started.label, workerId: started.id, workerName: started.name, goneTicks: 0, lastProgressAt: iso(), lastOutputAt: iso() });
        j.handledReviews.push(latest.id);
        delete j.routing;
        t.note = `${RV} requested changes; a worker is addressing them`;
        saveState(st);
        log(`${id}: adopted worker ${started.label}/${started.id} for ${RV}'s requested changes`);
        return 'changes';
      }
    }
    // Only a worker known to have ended is replaced. An unreadable fleet list reads as "unknown", which waits.
    const state = workerState(workers, t);
    if (!['gone', 'done', 'failed', 'idle', 'stopped'].includes(state)) {
      t.note = `${RV} requested changes; its worker ${t.account}/${t.workerId} is ${state}`;
      log(`${id}: ${RV} requested changes; its worker is ${state}, so no second worker`);
      return 'changes';
    }
    if (DRY) {
      log(`would start a worker on ${id} to address ${RV}'s requested changes`);
      return 'changes';
    }
    // A replacement is a new session, so a ticket that kept its slot still needs room for it.
    if (!mayWake(st, id, t, `a worker for ${RV}'s requested changes on PR #${pr.number}`)) return 'changes';
    let note;
    try {
      note = changesNote(id, pr, latest, reviewComments(pr.number, latest.id));
    } catch (e) {
      log(`${id}: could not read ${RV}'s review comments, trying next tick (${errText(e)})`);
      t.note = `${RV} requested changes; reading the review`;
      return 'changes';
    }
    // Journal the round before dispatching, so a run that ends mid-dispatch adopts the worker instead of starting another.
    j.routing = { review: latest.id, fromAccount: t.account, fromWorker: t.workerId, at: iso() };
    saveState(st);
    let out = null;
    try {
      out = await replaceWorker(st, id, t, { note, why: `${RV} requested changes on ${pr.url}` });
    } catch (e) {
      log(`${id}: starting a worker for ${RV}'s changes failed; the next tick adopts it if it started (${errText(e)})`);
      t.note = `${RV} requested changes; checking whether its worker started`;
      return 'changes';
    }
    if (!out) {
      delete j.routing; // no account had room, so nothing started
      t.note = `${RV} requested changes; waiting for an account with room for a worker`;
      saveState(st);
      return 'changes';
    }
    j.handledReviews.push(latest.id);
    delete j.routing;
    j.changesAt = iso();
    t.note = `${RV} requested changes; a worker is addressing them`;
    saveState(st);
    return 'changes';
  }

  // A push after their review: ask them again, once per head, so GitHub tells them there is something new to look at.
  if (latest && latest.commit_id !== pr.headRefOid && j.rerequestedFor !== pr.headRefOid && !DRY) {
    j.rerequestedFor = pr.headRefOid;
    saveState(st);
    try {
      gh(['pr', 'edit', String(pr.number), '--repo', REPO, '--add-reviewer', REVIEWER.github]);
      log(`${id}: new commits since ${RV}'s last review, asked them to review again`);
    } catch (e) {
      log(`${id}: could not re-request ${RV}'s review (${errText(e)})`);
    }
  }
  return 'waiting';
}

// Parks a ticket whose green PR waits only on the reviewer: it keeps its PR and its worker, and each tick goes on
// watching the review, but its slot is free for the next ticket. since is when it first waited.
function park(id, t, since) {
  t.parked = since ?? iso();
  // Waiting on the reviewer is never a stall, so a stall mark left from before it parked goes.
  delete t.stalledSince;
  if (!since) log(`${id}: waiting on ${RV}'s review, so it gives up its ${slotWord(poolOf(t))} until they answer`);
}

// The reason a judgment PR waits on the reviewer, for the ticket comment: the worker's escalation, then the spec's
// "## Merge path" reason, then the no-label default.
async function judgmentWhy(id, t, labels) {
  if (t.reviewer?.escalated && t.title) return t.reviewer.escalated;
  if (t.reviewer?.why && t.title) return t.reviewer.why;
  const why = await readJudgmentWhy(id, t, labels);
  if (!t.reviewer?.escalated) (t.reviewer ??= {}).why = why;
  return why;
}
async function readJudgmentWhy(id, t, labels) {
  try {
    const { issue } = await gql('query($id:String!){ issue(id:$id){ title description } }', { id });
    t.title ??= issue.title;
    if (t.reviewer?.escalated) return t.reviewer.escalated;
    const m = (issue.description ?? '').match(/^##\s*Merge path\s*\n[\s\S]*?^Reason:\s*(.+?)\.?\s*$/im);
    if (m) return m[1];
  } catch (e) {
    log(`${id}: could not read its merge-path reason (${errText(e)})`);
  }
  if (t.reviewer?.escalated) return t.reviewer.escalated;
  return (labels[id] ?? []).includes(MERGE_LABELS.judgment) ? 'Sentry triage marked it as needing a human call'
    : 'it is a Sentry fix with no merge-path verdict from triage, so it counts as a judgment call';
}

// A stuck ticket's PR can still be merged by hand later (one merged while status listed it as stuck for days). Re-read each stuck PR at most hourly and record a merge. Linear is left alone: whoever merged it
// already moved the ticket on, and the merge's CI is long settled.
async function settleStuck(st) {
  for (const [id, t] of Object.entries(st.tickets)) {
    if (t.status !== 'stuck' || !t.prNumber || (t.stuckCheckedAt && hoursSince(t.stuckCheckedAt) < 1)) continue;
    t.stuckCheckedAt = iso();
    try {
      const pr = JSON.parse(gh(['pr', 'view', String(t.prNumber), '--repo', REPO, '--json', 'state,mergedAt,mergeCommit,url']));
      if (pr.state === 'MERGED') {
        clearMergeRequest(id);
        Object.assign(t, { status: 'merged', mergedAt: pr.mergedAt, mergedSha: pr.mergeCommit?.oid ?? null, ciChecked: true,
          note: 'merged outside the dispatcher after it was stuck' });
        log(`${id}: its stuck PR ${pr.url} was merged outside the dispatcher; recorded as merged`);
        clearBundle(id);
        for (const cid of t.bundle ?? []) {
          const c = st.tickets[cid];
          if (['bundled', 'stuck'].includes(c?.status)) Object.assign(c, { status: 'merged', mergedAt: pr.mergedAt, ciChecked: true, note: `merged with ${id} outside the dispatcher` });
        }
      }
    } catch (e) {
      log(`${id}: could not re-read its stuck PR (${errText(e)})`);
    }
    saveState(st);
  }
}

async function finishMerged(st, m, id, t, pr) {
  clearMergeRequest(id);
  Object.assign(t, { status: 'merged', mergedAt: iso(), mergedSha: pr.mergeCommit?.oid ?? null });
  st.stuckStreak = 0;
  saveState(st);
  log(`${id}: merged ${pr.url}`);
  await notify(`${id} merged`, `Moved to ${STATES.verifying}`, { id, link: pr.url, progress: true });
  const iid = await issueId(id);
  await effects(t, id, [
    [`remove agent-building from ${id}`, () => removeLabel(iid, m.label.building)],
    [`move ${id} to Verifying`, () => setState(iid, m.verifying)],
    [`comment the merge on ${id}`, () => comment(iid, `Merged ${pr.url} (agent dispatcher on ${HOST}). Moved to ${STATES.verifying}.`)],
  ]);
  saveState(st);
  // The merge no longer passes --delete-branch (the merge queue refuses it), so the branch goes here. One the repo
  // already deleted is fine.
  if (!DRY && t.branch) {
    try {
      gh(['api', '-X', 'DELETE', `repos/${REPO}/git/refs/heads/${t.branch}`]);
    } catch (e) {
      if (!/Reference does not exist|Not Found|422|404/i.test(errText(e))) log(`${id}: could not delete ${t.branch} (${errText(e)})`);
    }
  }
  await settleCompanions(st, m, id, t, 'merged', { pr });
}

// ask: an engine containment stop replaces the usual question with its own (ask, recommend, fallback).
async function markStuck(st, m, id, t, reason, ask = null) {
  Object.assign(t, { status: 'stuck', stuckAt: iso(), reason });
  st.stuckStreak = (st.stuckStreak ?? 0) + 1;
  saveState(st);
  log(`${id}: stuck, ${reason}`);
  const withBundle = t.bundle?.length ? `${id} (bundled with ${t.bundle.join(', ')})` : id;
  await notify(`${withBundle} is stuck`, reason);
  const iid = await issueId(id);
  await effects(t, id, [
    // An engine run still going would keep pushing to a ticket nobody watches any more.
    ...(engineDriven(t) ? [[`stop ${id}'s ${t.engine} run`, () => run(EXT_WORKER, ['stop', id], { timeout: 60_000 })]] : []),
    [`label ${id} agent-stuck`, () => addLabel(iid, m.label.stuck)],
    [`remove agent-building from ${id}`, () => removeLabel(iid, m.label.building)],
    [`comment why ${id} is stuck`, () => comment(iid, `Agent dispatcher gave up: ${reason}. Labeled ${L.stuck}. Worker ${t.account}/${t.workerId} ${engineDriven(t) ? 'was stopped' : 'may still be running'}.`)],
    [`ask ${HUMAN} about ${id}`, () => askHuman(id, 'blocked', ask?.ask ?? `${withBundle} is stuck: ${reason}. Re-queue it, take it over, or rescope it?`,
      ask?.recommend ?? `Read the PR and its threads; if the spec holds, remove ${L.stuck} and add ${L.ready} to re-queue`,
      ask?.fallback ?? `it stays ${L.stuck} and the dispatcher leaves it alone`)],
  ]);
  saveState(st);
  await settleCompanions(st, m, id, t, 'stuck', { reason });
  if (st.stuckStreak >= cfg.stuckInARowTrips) await trip(st, `${st.stuckStreak} tickets in a row got stuck (latest ${id})`);
}

async function advance(st, m, workers) {
  if (!Object.values(st.tickets).some((t) => LIVE.includes(t.status))) return;
  const waiting = new Set(await labeled(L.needsHuman));
  const liveIds = Object.entries(st.tickets).filter(([, t]) => LIVE.includes(t.status)).flatMap(([id, t]) => [id, ...(t.bundle ?? [])]);
  let sentryLabels = {};
  try {
    sentryLabels = await sentryLabelsOf(liveIds);
  } catch (e) {
    // Unknown labels must never let a judgment PR merge: hold every Sentry merge this tick.
    sentryLabels = null;
    log(`could not read the Sentry merge-path labels, so no queue PR merges this tick (${errText(e)})`);
  }
  // Tickets in the wake queue come last, in the order they started waiting: by then every other ticket has freed the
  // slot it frees this tick, and the first to wait is the first to take a free slot.
  const waitingIds = (st.wakeQueue ?? []).map((w) => w.id).filter((x) => st.tickets[x]);
  for (const id of [...Object.keys(st.tickets).filter((x) => !waitingIds.includes(x)), ...waitingIds]) {
    const t = st.tickets[id];
    if (!t || !LIVE.includes(t.status)) continue;
    if (holdsSlot(st, id, t)) wakeRun.held.add(id);
    // A green PR waiting only on the reviewer is parked (park). Each tick decides afresh, so requested changes or a red
    // check take its slot back, through the wake queue on a full machine. An unreadable PR keeps it parked.
    const parkedAt = t.parked;
    delete t.parked;
    const keepParked = () => {
      if (parkedAt) t.parked = parkedAt;
    };
    // A question about a companion holds the bundle's one worker, so it counts as waiting on the lead too.
    t.waiting = waiting.has(id) || (t.bundle ?? []).some((c) => waiting.has(c));
    let pr;
    const hadPr = Boolean(t.prNumber);
    try {
      pr = findPr(t, id);
    } catch (e) {
      log(`${id}: could not read its PR, trying next tick (${errText(e)})`);
      keepParked();
      // A waiter holds a slot against new claims, so one whose PR stays unreadable leaves the queue after
      // wakeQueueMaxReadFailures ticks in a row, and the human hears once.
      const entry = wakeEntry(st, id);
      if (entry && (entry.readFailures = (entry.readFailures ?? 0) + 1) >= (cfg.wakeQueueMaxReadFailures ?? 6)) {
        leaveWakeQueue(st, id, `its PR could not be read on ${entry.readFailures} ticks in a row`);
        await effects(t, id, [[`tell ${HUMAN} ${id} left the wake queue`, () => askHuman(id, 'blocked',
          `${id} left ${HOST}'s wake queue: its PR could not be read on ${entry.readFailures} ticks in a row (${errText(e).slice(0, 200)}).`,
          `Check the PR and the GitHub access on ${HOST}; the ticket rejoins the queue when it next needs a worker`, 'it stays out of the wake queue')]]);
      }
      saveState(st);
      continue;
    }
    if (pr) t.pr = pr.url;
    const state = workerState(workers, t);
    trackProgress(t, pr?.headRefOid ?? branchSha(t), pr?.updatedAt, state);
    saveState(st);
    if (pr && !hadPr) {
      log(`${id}: PR opened ${pr.url}`);
      await notify(`${id} opened a PR`, `PR #${pr.number}`, { id, link: pr.url, progress: true });
    }

    if (pr?.state === 'MERGED') {
      if (engineDriven(t) && t.status !== 'merge-asked' && !t.mergedWithoutReview) await engines.mergedAlone(st, id, t, pr);
      await finishMerged(st, m, id, t, pr);
      continue;
    }
    if (pr?.state === 'CLOSED') {
      if (t.status === 'merge-asked') {
        Object.assign(t, { status: 'closed', closedAt: iso() });
        clearMergeRequest(id);
        saveState(st);
        log(`${id}: PR closed while waiting on its merge review, left closed`);
        const iid = await issueId(id);
        await effects(t, id, [[`remove agent-building from ${id}`, () => removeLabel(iid, m.label.building)]]);
        saveState(st);
        await settleCompanions(st, m, id, t, 'closed');
      } else {
        await markStuck(st, m, id, t, `PR ${pr.url} was closed without merging`);
      }
      continue;
    }

    // The Sentry merge path. A judgment PR (or a mechanical one the worker escalated in its PR body) gets the
    // reviewer's review once it is open and out of draft, and merges only on their approval. A ticket already sent to the
    // orchestrator stays with it.
    let path = null;
    let verdict = null;
    if (pr) {
      // Labels unread: a known judgment PR keeps waiting on the reviewer, and every other green PR is held, since a label
      // may have changed to judgment since the last read.
      if (sentryLabels === null) path = t.sentryPath === 'judgment' ? 'judgment' : 'unknown';
      else path = mergePathOf(id, t, sentryLabels);
      if (path) t.sentryPath = path;
      if (path === 'judgment' && t.status === 'merge-asked') {
        // Asked of the orchestrator before the merge path existed: a judgment PR is the reviewer's to approve.
        if (!DRY) clearMergeRequest(id);
        t.status = 'building';
        log(`${id}: a judgment Sentry PR, so it moves from the orchestrator's merge review to ${RV}'s`);
      }
      const flagged = pr.body?.match(ESCALATION);
      if (path === 'mechanical' && flagged) {
        await escalate(st, id, t, `the worker flagged it in the PR body: ${flagged[1].trim().replace(/\.$/, '') || 'no reason given'}`);
        path = 'judgment';
        t.sentryPath = path;
      }
      if (path === 'judgment' && !pr.isDraft) {
        try {
          verdict = await reviewerReview(st, id, t, pr, workers, await judgmentWhy(id, t, sentryLabels ?? {}));
        } catch (e) {
          log(`${id}: could not read ${RV}'s review state, trying next tick (${errText(e)})`);
          keepParked();
          saveState(st);
          continue;
        }
        saveState(st);
        // The reviewer's requested changes are with a worker: that is never a stall.
        if (verdict === 'changes') continue;
      }
    }

    let notGreen = pr ? null : 'no PR yet';
    if (pr) {
      try {
        notGreen = greenReason(pr);
      } catch (e) {
        log(`${id}: could not check PR #${pr.number}, trying next tick (${errText(e)})`);
        keepParked();
        continue;
      }
    }
    t.note = notGreen ? `not green: ${notGreen}` : 'green';
    wakeRun.reached.add(id);
    // A green PR needs no worker, so a ticket that waited for a slot stops waiting.
    // An engine-built PR never merges through this file, whatever its merge path or reviewed paths: once green, and once
    // its round has ended, it goes to the orchestrator the way a risky-path PR does. That includes a PR an engine built
    // and a Claude worker finished, since the engine's code has had no review.
    if (!notGreen && pr) {
      let clash = { stale: [] };
      try {
        clash = await migrationClash(id, pr);
      } catch (e) {
        if (t.migrationCheckFailedSha !== pr.headRefOid) {
          t.migrationCheckFailedSha = pr.headRefOid;
          log(`${id}: could not check the PR's migrations (${errText(e)})`);
        }
      }
      // An engine has no session to type into: its next round carries the note, once its current round has ended.
      if (clash.stale.length && engineDriven(t)) {
        t.note = `green, its new migration clashes with ${BASE}, so its next round renames it`;
        await engines.call(`renaming ${id}'s migration`, true, (e, c) => e.advanceTicket(c, st, m, id, t, { pr, renumber: clash.note }));
        saveState(st);
        continue;
      }
      if (clash.stale.length) {
        const sent = t.renumberSha === pr.headRefOid;
        // Typing the note wakes the worker's session, which takes a slot even while the ticket waits on a merge.
        if (!sent && !mayWake(st, id, t, `rename its migration that clashes with ${BASE}`)) continue;
        const why = sent ? null : tellWorker(t, clash.note);
        if (!why) {
          t.note = `green, sent back to rename its migration that clashes with ${BASE}`;
          if (!sent) {
            t.renumberSha = pr.headRefOid;
            log(`${id}: ${clash.stale.join(', ')} clashes with ${BASE}, sent worker ${t.account}/${t.workerId} back to rename it`);
            saveState(st);
          }
          continue;
        }
        log(`${id}: ${clash.stale.join(', ')} clashes with ${BASE}, and worker ${t.account}/${t.workerId} could not be told (${why})`);
      }
    }
    // A green PR needs no worker, so a ticket that waited for a slot stops waiting.
    if (!notGreen) leaveWakeQueue(st, id, 'its PR is green');
    if (!notGreen && engineDriven(t)) {
      const ready = await engines.call(`checking ${id}'s engine run`, 'hold', (e, c) => e.greenState(c, st, m, id, t, pr));
      if (ready === 'ready' && t.status !== 'stuck') await engines.toOrchestrator(st, id, t, pr);
      saveState(st);
      continue;
    }
    const mark = engineDriven(t) ? null : engines.marked(id);
    if (!notGreen && (engineBuilt(t) || mark)) {
      const by = [...new Set([...(t.engineHistory ?? []).map((x) => x.engine), ...(mark?.engines ?? [])])].join(', ');
      await engines.toOrchestrator(st, id, t, pr, `built by ${by} and finished by a Claude worker, no orchestrator review of the engine's code yet`);
      continue;
    }
    // A ticket that held no slot as this tick began (parked on the reviewer, or waiting in the wake queue) and now has
    // work to do takes a slot back only when one is free; until then it waits in the wake queue, and the stall rules
    // leave it alone: no replacement, no round, no stall note, never stuck for the wait.
    // A ticket sent to the orchestrator whose PR then needs a worker again (a conflict, a review thread, a draft) goes
    // back to building with its merge request withdrawn, so the stall rules give the fix to its worker or a new one.
    // Pending checks or a merge-queue run leave it merge-asked; once green again it is sent to the orchestrator afresh.
    // greenReason stops at a BLOCKED merge state without reading the threads, so those are read here.
    let blockedThreads = null;
    if (notGreen === 'merge state BLOCKED' && t.status === 'merge-asked' && !engineDriven(t)) {
      try {
        blockedThreads = openThreads(pr);
      } catch (e) {
        log(`${id}: could not read PR #${pr.number}'s review threads (${errText(e)})`);
      }
      if (blockedThreads) notGreen = `${notGreen}, ${blockedThreads}`;
    }
    if (notGreen && t.status === 'merge-asked' && !engineDriven(t) && (notGreen === 'draft' || /^merge state (DIRTY|CONFLICTING)$/.test(notGreen) || /unresolved review thread/.test(notGreen))) {
      log(`${id}: its PR needs work again (${notGreen}), so its merge request is withdrawn and it is building again`);
      t.status = 'building';
      for (const k of ['riskySha', 'mergeAskedAt']) delete t[k];
      if (!DRY) clearMergeRequest(id);
      saveState(st);
    }
    if (notGreen && t.status === 'building' && !wakeRun.held.has(id) && !mayWake(st, id, t, notGreen)) continue;
    if (notGreen && engineDriven(t)) {
      // An engine's next round, question, limit or failure (engine-rounds.mjs). A module that fails to load holds the
      // ticket for the tick instead of letting the stall rules judge a worker they can't see.
      const handled = await engines.call(`advancing ${id}`, true, (e, c) => e.advanceTicket(c, st, m, id, t, { pr }));
      saveState(st);
      if (handled || t.status !== 'building') continue;
    }
    if (!notGreen && path === 'unknown') {
      t.note = 'green, held: the Sentry merge-path labels could not be read';
      continue;
    }
    if (!notGreen && path === 'judgment' && verdict !== 'approved') {
      // Waiting on the reviewer is never a stall, the same as waiting on the human's answer.
      t.note = `waiting on ${RV}'s review`;
      if (verdict === 'waiting') park(id, t, parkedAt);
      continue;
    }
    if (!notGreen) {
      // An approved judgment PR has had the reviewer's review, so its reviewed paths need no second one.
      let risky = [];
      if (path !== 'judgment') {
        try {
          risky = riskyPaths(pr);
        } catch (e) {
          log(`${id}: could not list PR #${pr.number}'s files, trying next tick (${errText(e)})`);
          continue;
        }
      }
      // A green PR that touches reviewed paths goes to the orchestrator session for review and merge, so a finished,
      // green, built-to-spec PR never waits on the human's merge button (a worker waiting on a merge holds its slot).
      // The request file lands in the shared merge-requests folder, which the orchestrator watches. It escalates to
      // the human only for a trust boundary or a change beyond the ticket's spec.
      if (risky.length && path === 'mechanical') {
        // A mechanical fix that touches reviewed paths is a judgment call: the reviewer reviews it instead of the orchestrator.
        await escalate(st, id, t, `its PR touches reviewed paths (${risky.slice(0, 5).join(', ')})`);
        t.sentryPath = 'judgment';
        try {
          verdict = await reviewerReview(st, id, t, pr, workers, t.reviewer.escalated);
        } catch (e) {
          log(`${id}: could not read ${RV}'s review state, trying next tick (${errText(e)})`);
          keepParked();
        }
        saveState(st);
        if (verdict !== 'approved') {
          if (verdict !== 'changes') {
            t.note = `waiting on ${RV}'s review`;
            if (verdict === 'waiting') park(id, t, parkedAt);
          }
          continue;
        }
      } else if (risky.length) {
        t.note = 'green, waiting on the orchestrator\'s review and merge';
        if (t.status !== 'merge-asked' || t.riskySha !== pr.headRefOid) {
          Object.assign(t, { status: 'merge-asked', mergeAskedAt: t.mergeAskedAt ?? iso(), riskySha: pr.headRefOid });
          saveState(st);
          log(`${id}: green but touches ${risky.length} reviewed path(s), sent to the orchestrator to review and merge`);
          await effects(t, id, [[`request the orchestrator's merge of ${id}`, () => requestMerge(id, pr, risky)]]);
          saveState(st);
        }
        continue;
      }
      if (t.status === 'merge-asked') continue; // The orchestrator merges an asked PR, even if a later push looks safe.
      if (isPaused()) {
        t.note = 'green, held while the queue is paused';
        log(`${id}: green, not merging while paused`);
        continue;
      }
      // With a merge queue on the base branch, `gh pr merge` enqueues the PR and the queue lands it after its
      // merge_group run; a queued PR is left to the queue, and the tick that sees it MERGED finishes it.
      const queued = queueEntry(pr.number);
      if (queued) {
        t.note = `green, in the merge queue (${queued.state.toLowerCase()}, position ${queued.position})`;
        continue;
      }
      if (DRY) {
        log(`would squash-merge ${pr.url} at ${pr.headRefOid.slice(0, 8)}`);
        continue;
      }
      if (!(await freshEnough(id, t, pr))) continue;
      if (path === 'judgment') {
        // The pre-merge check can take minutes: re-read the reviewer's verdict so a review they changed meanwhile wins.
        let still;
        try {
          still = reviewerLatest(pr.number);
        } catch (e) {
          log(`${id}: could not re-read ${RV}'s review before merging, trying next tick (${errText(e)})`);
          continue;
        }
        if (still?.state !== 'APPROVED' || still.commit_id !== pr.headRefOid) {
          log(`${id}: ${RV}'s approval no longer holds on ${pr.headRefOid.slice(0, 8)}, not merging`);
          continue;
        }
      }
      try {
        // No --delete-branch: gh refuses it while the merge queue is on. finishMerged deletes the branch.
        gh(['pr', 'merge', String(pr.number), '--repo', REPO, '--squash', '--match-head-commit', pr.headRefOid]);
      } catch (e) {
        log(`${id}: merge refused, trying next tick (${errText(e)})`);
        continue;
      }
      const after = findPr(t, id);
      if (after.state === 'MERGED') await finishMerged(st, m, id, t, after);
      else if (queueEntry(pr.number)) log(`${id}: added to the merge queue`);
      else log(`${id}: merge did not complete (state ${after.state}), trying next tick`);
      continue;
    }

    if (t.waiting) t.note = `waiting on your answer; ${t.note}`;
    log(`${id}: not green yet (${notGreen}), ${Math.round(hoursSince(t.dispatchedAt) * 10) / 10}h in, last progress ${Math.round(hoursSince(t.lastProgressAt) * 10) / 10}h ago, worker ${state}`);
    if (t.status === 'building') await checkStall(st, m, id, t, pr, notGreen, state);
  }
  // A waiting ticket whose PR was read and that asked for no worker this tick (an engine ticket waiting on the
  // orchestrator whose next round is no longer due, say) no longer needs one, so it stops holding a place.
  for (const w of [...(st.wakeQueue ?? [])]) {
    if (wakeRun.reached.has(w.id) && !wakeRun.asked.has(w.id)) leaveWakeQueue(st, w.id, 'it no longer needs a worker');
  }
}

// What an ended Claude worker's PR still needs from a worker: a conflict with the base branch, unresolved review
// threads, or both; null for anything else (checks still running, a failing check, no PR), which keeps the stall
// rules. greenReason stops at a BLOCKED merge state without reading the threads, so a BLOCKED or conflicting PR is asked.
function prNeedsWorker(id, pr, notGreen) {
  if (!pr) return null;
  const dirty = ['DIRTY', 'CONFLICTING'].includes(pr.mergeStateStatus);
  let threads = /review thread/.test(notGreen ?? '') ? notGreen : null;
  if (!threads && (dirty || pr.mergeStateStatus === 'BLOCKED')) {
    try {
      threads = openThreads(pr);
    } catch (e) {
      log(`${id}: could not read PR #${pr.number}'s review threads (${errText(e)})`);
    }
  }
  if (!dirty && !threads) return null;
  return { dirty, threads, what: [dirty ? `PR #${pr.number} conflicting with ${BASE}` : null, threads].filter(Boolean).join(' and ') };
}
const fixNote = (id, t, pr, fix) => `Your previous worker on ${id} ended, but its PR ${pr.url} cannot merge yet: ${fix.what}. Continue its work instead of starting over: the worktree for ${t.branch} under ${WORKTREES}/ may hold commits that were never pushed, so check it first and push them.${fix.dirty ? ` Merge origin/${BASE} into the branch (no rebase, no force-push) and resolve every conflict keeping both sides: what ${BASE} changed and what this ticket adds. Run the checks the conflicted files touch before you push.` : ''}${fix.threads ? ' Read every unresolved review thread on the PR, fix the code where the finding is right, reply on each thread saying what changed or why it stays, and resolve it.' : ''} Push once through ${GATED_PUSH} and drive the PR to green. Then carry on with the brief below.\n\n`;

// Never fails a ticket for taking long. A long run gets an informational post every longRunNoticeHours; a ticket
// that stops moving gets one note to the human and stays in the queue; only a worker that is gone, with nothing
// moving for stallHours, makes the ticket stuck. Waiting on the human's answer is never a stall.
async function checkStall(st, m, id, t, pr, notGreen, state) {
  const where = pr ? `PR ${pr.url}` : `branch ${t.branch}`;
  const idle = hoursSince(t.lastProgressAt);
  // A worker the fleet reports as failed has ended too (a machine's daemon was killed under two workers once, and
  // they sat in "failed", holding their slots, with no path to stuck).
  t.goneTicks = ['gone', 'done', 'failed'].includes(state) ? (t.goneTicks ?? 0) + 1 : 0;
  // With no PR, or a PR that conflicts with main, nothing can move once the worker has ended, so two ticks of an
  // ended worker are enough. Waiting stallHours there once kept a machine's two slots idle for 3h.
  // A PR without conflicts keeps the full wait, since its CI and review can still go green after the worker ends.
  const deadEnd = !pr || ['DIRTY', 'CONFLICTING'].includes(pr.mergeStateStatus);
  // "failed" means the session itself died (a reboot or a killed daemon), not that the worker gave up, so its ticket
  // gets one replacement worker before it can go stuck. "done" and "gone" keep going straight to stuck.
  const budget = (t.redispatches ?? 0) < (cfg.maxRedispatches ?? 1);
  if (t.goneTicks >= 2 && state === 'failed' && budget) {
    // On a full machine the replacement waits in the wake queue, and the ticket is never made stuck for it.
    if (!mayWake(st, id, t, `its worker ${t.account}/${t.workerId} failed`)) return;
    try {
      if (await replaceWorker(st, id, t)) return;
      log(`${id}: its worker failed and no account has room for a replacement`);
    } catch (e) {
      log(`${id}: could not replace its failed worker (${errText(e)})`);
    }
  }
  // A Claude worker that ended ("done" or "gone") with its PR conflicting with the base branch or holding unresolved
  // review threads gets a replacement from the same maxRedispatches budget, told to merge the base branch and fix the
  // threads. Engine tickets get rounds for this instead (engine-rounds.mjs).
  if (t.goneTicks >= 2 && state !== 'failed' && budget && !engineDriven(t)) {
    const fix = prNeedsWorker(id, pr, notGreen);
    if (fix) {
      const why = `its worker ${t.account}/${t.workerId} ended with ${fix.what}`;
      if (!mayWake(st, id, t, why)) return;
      try {
        if (await replaceWorker(st, id, t, { note: fixNote(id, t, pr, fix), say: `the previous worker ended with ${fix.what} on ${pr.url}`, charge: true })) return;
        log(`${id}: ${why} and no account has room for a replacement, trying next tick`);
      } catch (e) {
        log(`${id}: could not replace its ended worker, trying next tick (${errText(e)})`);
      }
      // The budget still holds a replacement, so a start that failed this tick is retried, never made stuck.
      t.note = `${why}; waiting to start its replacement`;
      return;
    }
  }
  if (t.goneTicks >= 2 && (deadEnd || idle > cfg.stallHours)) {
    return markStuck(st, m, id, t, `its worker ${t.account}/${t.workerId} has ended and ${where} has not moved in ${Math.round(idle)}h (${notGreen})`);
  }
  const elapsed = hoursSince(t.dispatchedAt);
  const runs = Math.floor(elapsed / cfg.longRunNoticeHours);
  if (runs > (t.longRunNotices ?? 0)) {
    t.longRunNotices = runs;
    saveState(st);
    await notify(`${id} still going`, `${Math.round(elapsed)}h in, worker ${state}, ${notGreen}`, { id, link: pr?.url, progress: true, orchestrator: true });
  }
  if (t.waiting) return;
  const quiet = hoursSince(t.lastOutputAt);
  const stalled = idle > cfg.stallHours ? `nothing has moved for ${Math.round(idle)}h and its worker is ${state}`
    : ACTIVE.includes(state) && quiet > cfg.spinHours ? `its worker has been busy for ${Math.round(quiet)}h without a commit or PR change`
      : null;
  if (!stalled) {
    if (t.stalledSince) {
      delete t.stalledSince;
      saveState(st);
      log(`${id}: moving again`);
    }
    return;
  }
  if (t.stalledSince) return;
  t.stalledSince = iso();
  saveState(st);
  log(`${id}: stalled, ${stalled}`);
  await notify(`${id} stalled`, stalled);
  await effects(t, id, [[`tell ${HUMAN} ${id} stalled`, () => askHuman(id, 'blocked', `${id} has stalled: ${stalled}. ${where}: ${notGreen}.`,
    `Open the worker's session and nudge it: ${attachCmd(t)}`, 'the ticket stays in the queue and the dispatcher keeps watching it')]]);
  saveState(st);
}

// --- worktree teardown -------------------------------------------------------------------------------------------
// When a ticket's PR merges or closes, the next tick stops its worker, removes its worktree through
// worktree-teardown.mjs (which removes only what holds nothing GitHub lacks) and then the session with `claude rm`.
// Every worktreeCleanup.sweepHours the same module sweeps every worktree of the repos the queue builds. Kept work asks
// the human: at teardown at once, in the sweep after atRiskAskDays. dryRun logs what it would do and changes nothing.
// Neither runs while the dispatcher is paused, and both catch their own errors so a failure never stops the tick.
const WT_CFG = { enabled: true, dryRun: true, sweepHours: 24, atRiskAskDays: 7, trashDir: null, repos: [], ...(cfg.worktreeCleanup ?? {}) };
const SWEEP_STATE = path.join(LOCAL, 'worktree-sweep.json');
const TEARDOWN_TRIES = 3; // ticks a live process may hold the worktree after its worker stops, before the human is asked
let wtModule = null;
const wtMod = async () => (wtModule ??= await import('./worktree-teardown.mjs'));
const wtDry = () => DRY || WT_CFG.dryRun;
const trashDir = async () => (await wtMod()).trashDirFor(WT_CFG.trashDir);
// The checkouts the sweep covers: repoPath, then each worktreeCleanup.repos entry ({ path, github, base }).
const cleanupRepos = () => [{ path: conf.repoPath, github: REPO, base: BASE }, ...WT_CFG.repos.map((r) => ({ base: BASE, ...r }))]
  .filter((r) => r.path && fs.existsSync(r.path));
const claudeEnv = (label) => {
  const env = { ...process.env };
  if (label === PRIMARY) delete env.CLAUDE_CONFIG_DIR;
  else env.CLAUDE_CONFIG_DIR = path.join(HOME, `.claude-${label}`);
  return env;
};

async function teardownFinished(st, workers) {
  if (!WT_CFG.enabled || isPaused() || !conf.repoPath) return;
  // A record from a dry run is done again once dryRun is off. Tickets finished over two weeks ago are left to the sweep.
  const due = Object.entries(st.tickets).filter(([, t]) => ['merged', 'closed'].includes(t.status) && !t.bundledInto
    && (!t.teardown || t.teardown.retry || (t.teardown.dryRun && !wtDry())) && hoursSince(t.mergedAt ?? t.closedAt) < 14 * 24).slice(0, 10);
  if (!due.length) return;
  // Unknown worker states could mean stopping or removing a session still at work, so wait for a tick that has them.
  if (!workers) return log('worktree teardown waits: the fleet list did not come back this tick');
  let wt;
  let dirs;
  try {
    wt = await wtMod();
    dirs = wt.processDirs();
  } catch (e) {
    return log(`worktree teardown skipped this tick (${errText(e)})`);
  }
  for (const [id, t] of due) {
    try {
      await teardownTicket(wt, id, t, workers, dirs, st);
    } catch (e) {
      log(`${id}: worktree teardown failed, trying next tick (${errText(e)})`);
    }
    saveState(st);
  }
}

async function teardownTicket(wt, id, t, workers, dirs, st) {
  const dry = wtDry();
  const rec = { at: iso(), ...(dry ? { dryRun: true } : {}) };
  // Codex and Grok build in a standalone clone that ext-worker.sh made and owns, with no fleet session.
  if (engineDriven(t)) {
    t.teardown = { ...rec, skipped: `${t.engine ?? 'engine'} run, its clone belongs to ext-worker.sh` };
    return;
  }
  const state = workerState(workers, t);
  const w = workers.find((x) => x.label === t.account && x.id === t.workerId);
  // A worker still at work with a live process is never stopped under it: its teardown waits, and after
  // TEARDOWN_TRIES ticks the human is asked. A row with no process is a leftover session, so `claude rm` clears it below.
  if (w?.pid && ACTIVE.includes(state)) {
    const tries = (t.teardown?.tries ?? 0) + 1;
    const reason = `its worker ${t.account}/${t.workerId} is still ${state}`;
    t.teardown = { ...rec, tries, retry: tries < TEARDOWN_TRIES, reason };
    if (tries < TEARDOWN_TRIES) return;
    log(`${id}: worktree teardown: kept, ${reason} after ${tries} ticks`);
    if (dry) return log(`${id}: would ask ${HUMAN} about its worker still at work after its PR ${t.status}`);
    try {
      askHuman(id, 'blocked', `${id}'s PR ${t.status}, but ${reason}, so its worktree and session on ${HOST} were left alone.`,
        `Attach (${attachCmd(t)}) and see what it is doing; stop it when it is done, then remove its worktree`, 'keep it');
      t.teardown.asked = iso();
    } catch (e) {
      log(`${id}: could not ask about its worker (${errText(e)})`);
    }
    return;
  }
  if (w?.pid && !['gone', 'done', 'failed'].includes(state)) {
    if (dry) log(`${id}: would stop worker ${t.account}/${t.workerId} (${state})`);
    else {
      try {
        run(FLEET, ['stop', t.account, t.workerId], { timeout: 60_000 });
        log(`${id}: stopped worker ${t.account}/${t.workerId} after its PR ${t.status}`);
      } catch (e) {
        log(`${id}: could not stop worker ${t.account}/${t.workerId} (${errText(e)})`);
      }
    }
  }
  const pr = t.prNumber ? JSON.parse(gh(['pr', 'view', String(t.prNumber), '--repo', REPO, '--json', 'number,state,headRefOid'])) : null;
  // A worktree on a live ticket's branch, or naming a live ticket, is never this ticket's to remove.
  const live = Object.entries(st.tickets).filter(([x, o]) => x !== id && ['claiming', 'bundled', ...LIVE].includes(o.status));
  const liveBranches = new Set(live.map(([, o]) => o.branch).filter(Boolean));
  const liveRx = live.map(([x]) => new RegExp(`${x}(?!\\d)`, 'i'));
  const listed = wt.listWorktrees(conf.repoPath).filter((x) => !(x.branch && liveBranches.has(x.branch) && x.branch !== t.branch)
    && !liveRx.some((rx) => rx.test(`${path.basename(x.path)} ${x.branch ?? ''}`)));
  // A worker often names its local branch unlike the one it pushes, so the worktree is the one on the ticket's branch,
  // else the one at the PR's head, else the only one naming the ticket.
  const idRx = new RegExp(`${id}(?!\\d)`, 'i');
  const named = listed.filter((x) => idRx.test(`${path.basename(x.path)} ${x.branch ?? ''}`));
  const entry = (t.branch && listed.find((x) => x.branch === t.branch)) || (pr?.headRefOid && listed.find((x) => x.head === pr.headRefOid))
    || (named.length === 1 ? named[0] : null);
  const res = entry ? wt.teardownWorktree({ path: entry.path, repo: conf.repoPath, base: BASE, pr, dirs, listed, dryRun: dry, trashDir: await trashDir() })
    : { action: 'gone', reason: `no worktree on ${t.branch ?? 'its branch'} on ${HOST}` };
  const tries = (t.teardown?.tries ?? 0) + 1;
  log(`${id}: worktree teardown: ${res.would ? `would be ${res.would}` : res.action}${entry ? ` ${entry.path}` : ''} (${res.reason})`);
  if (res.action === 'kept' && res.transient && tries < TEARDOWN_TRIES) {
    t.teardown = { ...rec, tries, retry: true, worktree: entry?.path ?? null, reason: res.reason };
    return;
  }
  let session = null;
  if (['removed', 'gone'].includes(res.would ?? res.action) && w) {
    if (dry) session = 'would remove';
    else {
      try {
        run('claude', ['rm', t.workerId], { env: claudeEnv(t.account), timeout: 60_000 });
        session = 'removed';
      } catch (e) {
        session = `not removed (${errText(e)})`;
      }
      log(`${id}: session ${t.account}/${t.workerId} ${session}`);
    }
  }
  t.teardown = { ...rec, tries, worktree: entry?.path ?? null, action: res.action, ...(res.would ? { would: res.would } : {}), reason: res.reason, ...(session ? { session } : {}) };
  if (res.action !== 'kept' || res.would) return;
  const ask = `${id}'s PR ${t.status}, but its worktree ${entry.path} on ${HOST} was kept: ${res.reason}.`;
  const recommend = `Look at it (git -C ${entry.path} status; git -C ${entry.path} log --oneline origin/${BASE}..HEAD), save anything worth keeping, then git worktree remove it`;
  if (dry) return log(`${id}: would ask ${HUMAN}: ${ask}`);
  try {
    askHuman(id, 'blocked', ask, recommend, 'keep it');
    t.teardown.asked = iso();
  } catch (e) {
    log(`${id}: could not ask about its kept worktree (${errText(e)})`);
  }
}

// The sweep, at most once per sweepHours on each machine (the timestamp is local, in worktree-sweep.json). A worktree
// whose ticket is live here, or that a process holds, is left alone; one holding work GitHub lacks is at risk and kept,
// and when one has been at risk over atRiskAskDays, one ask names them all. When every repo's sweep fails, the next
// tick tries again; when only some fail, those wait for the next sweep.
async function worktreeSweep(st) {
  const repos = cleanupRepos();
  if (!WT_CFG.enabled || isPaused() || !repos.length) return;
  let mem = {};
  try {
    mem = JSON.parse(fs.readFileSync(SWEEP_STATE, 'utf8'));
  } catch { /* first sweep on this machine */ }
  const dry = wtDry();
  // A dry sweep's time never delays the first live one.
  if (mem.lastRun && hoursSince(mem.lastRun) < WT_CFG.sweepHours && !(mem.dryRun && !dry)) return;
  const atRisk = {};
  let failed = 0;
  let wt;
  try {
    wt = await wtMod();
  } catch (e) {
    return log(`worktree sweep failed, trying next tick (${errText(e)})`);
  }
  const live = Object.entries(st.tickets).filter(([, t]) => ['claiming', 'bundled', ...LIVE].includes(t.status));
  for (const repo of repos) {
    const label = `worktree sweep (${path.basename(repo.path)})`;
    try {
      const prs = {};
      const list = JSON.parse(gh(['pr', 'list', '--repo', repo.github, '--state', 'all', '--limit', '1000', '--json', 'number,state,headRefName,headRefOid']));
      for (const p of list) if (!prs[p.headRefName] || p.number > prs[p.headRefName].number) prs[p.headRefName] = p;
      const out = wt.sweepRepo({ repo: repo.path, base: repo.base, worktreesDir: conf.worktreesDir ?? '.claude/worktrees', prs, dryRun: dry,
        trashDir: await trashDir(), liveBranches: new Set(live.map(([, t]) => t.branch).filter(Boolean)), liveIds: live.map(([id]) => id) });
      if (out.error) {
        failed += 1;
        log(`${label}: ${out.error}`);
        continue;
      }
      const n = (what) => out.results.filter((r) => (r.would ?? r.action) === what).length;
      const atRiskNow = out.results.filter((r) => r.atRisk);
      log(`${label}${dry ? ' (dry run, nothing changed)' : ''}: ${n('removed')} ${dry ? 'would be ' : ''}removed, ${n('trashed')} orphan(s) ${dry ? 'would be ' : ''}trashed, ${atRiskNow.length} at risk, ${n('kept') - atRiskNow.length} kept, of ${out.results.length}`);
      for (const r of out.results) if (r.would || r.action !== 'kept' || r.atRisk) log(`  ${r.would ? `would be ${r.would}` : r.action}${r.atRisk ? ' AT RISK' : ''}: ${r.name} [${r.branch ?? '-'}] ${r.reason}`);
      for (const r of atRiskNow) atRisk[r.path] = { since: mem.atRisk?.[r.path]?.since ?? iso(), asked: mem.atRisk?.[r.path]?.asked ?? null, reason: r.reason };
    } catch (e) {
      failed += 1;
      log(`${label} failed, trying next tick (${errText(e)})`);
      // Its at-risk record carries over, so a worktree already asked about is not asked about again.
      for (const [p, a] of Object.entries(mem.atRisk ?? {})) if (p.startsWith(`${repo.path}/`)) atRisk[p] = a;
    }
  }
  if (failed === repos.length) return;
  const overdue = Object.entries(atRisk).filter(([, a]) => !a.asked && hoursSince(a.since) > WT_CFG.atRiskAskDays * 24);
  if (overdue.length) {
    const ask = `${overdue.length} worktree(s) on ${HOST} have held work GitHub lacks for over ${WT_CFG.atRiskAskDays} days, with no live ticket or process: ${overdue.map(([p, a]) => `${p} (${a.reason})`).join('; ')}`.slice(0, 1500);
    if (dry) log(`would ask ${HUMAN}: ${ask}`);
    else {
      try {
        askHuman(null, 'blocked', ask, `Look at each (git -C <path> status; git -C <path> log --oneline origin/${BASE}..HEAD), save what matters, then remove it`, 'keep it');
        for (const [, a] of overdue) a.asked = iso();
      } catch (e) {
        log(`worktree sweep: could not ask about the at-risk worktrees (${errText(e)})`);
      }
    }
  }
  if (!DRY) {
    try {
      fs.writeFileSync(SWEEP_STATE, `${JSON.stringify({ host: HOST, lastRun: iso(), dryRun: dry, atRisk }, null, 2)}\n`);
    } catch (e) {
      log(`worktree sweep: could not save its state (${errText(e)})`);
    }
  }
}

// The folders in the worktrees folder of every repo the sweep covers, for the heartbeat. null when none can be counted.
async function worktreeCount() {
  let total = null;
  for (const r of cleanupRepos()) {
    try {
      total = (total ?? 0) + (await wtMod()).countWorktrees(r.path, conf.worktreesDir ?? '.claude/worktrees');
    } catch {
      // One repo that cannot be counted leaves the others' count.
    }
  }
  return total;
}

// --- migration clashes ---------------------------------------------------------------------------------------------
// A green PR whose new migration clashes with the base branch (migration-order.mjs, premerge.migrations.policy) goes
// back to its worker to rename the file before it merges or goes to the orchestrator. One note per PR head; the
// worker's push brings a new head and a new check. A check that cannot run leaves the PR on its old path, where the
// pre-merge check stops it.
async function migrationClash(id, pr) {
  const mig = conf.premerge?.migrations;
  if (!mig?.dir) return { stale: [] };
  const added = gh(['api', `repos/${REPO}/pulls/${pr.number}/files`, '--paginate', '--jq', '.[] | select(.status == "added") | .filename']);
  const mine = added ? added.split('\n').filter(Boolean) : [];
  if (!mine.some((f) => f.startsWith(`${mig.dir}/`))) return { stale: [] };
  const { migrationClashes, renameNote } = await import('./migration-order.mjs');
  const onBase = gh(['api', `repos/${REPO}/git/trees/${BASE}:${mig.dir}`, '--jq', '.tree[].path']);
  const r = migrationClashes(mine, onBase ? onBase.split('\n').filter(Boolean) : [], mig);
  return r.stale.length ? { ...r, note: renameNote(id, r.stale, r.newest, { ...mig, push: GATED_PUSH, baseBranch: BASE }) } : r;
}

// Types a note into a live worker's session on this machine, the way the queue board does (queue-board/send.py).
// Returns why it could not, or null once it is delivered.
const SEND_PY = path.join(ROOT, 'queue-board/send.py');
function tellWorker(t, text) {
  if (DRY) {
    log(`would tell worker ${t.account}/${t.workerId}: ${text.slice(0, 120)}`);
    return null;
  }
  try {
    const out = JSON.parse(run('python3', [SEND_PY, t.account, t.workerId], { input: text, stdio: ['pipe', 'pipe', 'pipe'], timeout: 90_000 }));
    return out.ok ? null : (out.error || 'not delivered');
  } catch (e) {
    return errText(e);
  }
}

// --- 3. watch the workers ---------------------------------------------------------------------------

// A worker blocked on input in its session has stopped, and the stall check would only notice it hours later.
// The human hears once per block; the mark clears when the worker moves again. Runs while paused, too.
async function watchWorkers(st, workers) {
  // An engine worker that reads blocked has asked a question and exited; engine-rounds.mjs relays it.
  const live = Object.entries(st.tickets).filter(([, t]) => t.status === 'building' && t.workerId && !engineDriven(t));
  if (!live.length || !workers) return;
  for (const [id, t] of live) {
    const w = workers.find((x) => x.label === t.account && x.id === t.workerId);
    if ((w?.status || w?.state) !== 'blocked') {
      if (t.blockedSince) {
        delete t.blockedSince;
        saveState(st);
        log(`${id}: worker ${t.account}/${t.workerId} is moving again`);
      }
      continue;
    }
    if (t.blockedSince) continue;
    t.blockedSince = iso();
    saveState(st);
    log(`${id}: worker ${t.account}/${t.workerId} is blocked, waiting on input`);
    await notify(`${id}'s worker is blocked`, 'It is waiting on input in its session');
    await effects(t, id, [[`tell ${HUMAN} ${id}'s worker is blocked`, () => askHuman(id, 'blocked',
      `The worker building ${id} (${t.account}/${t.workerId}) is waiting on input in its session and has stopped working.`,
      `Open its session and answer it: ${attachCmd(t)}`,
      'it stays blocked; the ticket stays in the queue')]]);
    saveState(st);
  }
}

// A signed-out account would otherwise just stop getting work. The human hears once per sign-out; the mark clears
// when it signs back in. Only the accounts this machine may use count.
async function watchSignIns(st) {
  let accounts;
  try {
    accounts = JSON.parse(run(FLEET, ['accounts', '--json'], { timeout: 60_000 }));
  } catch (e) {
    return log(`could not read the fleet's accounts (${errText(e)})`);
  }
  st.signedOut ??= {};
  // An account taken off this machine's lists stops being watched, so forget any sign-out it left behind.
  for (const label of Object.keys(st.signedOut)) {
    if (!usedHere(label)) {
      delete st.signedOut[label];
      saveState(st);
      log(`account ${label} is no longer used on ${HOST}, so its sign-out is dropped`);
    }
  }
  for (const a of accounts) {
    if (!usedHere(a.label)) continue;
    if (a.signed_in) {
      if (st.signedOut[a.label]) {
        delete st.signedOut[a.label];
        saveState(st);
        log(`account ${a.label} is signed in again`);
      }
      continue;
    }
    if (st.signedOut[a.label]) continue;
    st.signedOut[a.label] = iso();
    saveState(st);
    log(`account ${a.label} (${a.email ?? 'unknown'}) on ${HOST} is signed out, so it gets no work`);
    await notify(`Account ${a.label} signed out`, `${a.email ?? 'unknown'} on ${HOST} gets no work until it signs back in`, { progress: true, orchestrator: true });
    if (DRY) continue;
    try {
      askHuman(null, 'blocked', `Fleet account ${a.label} (${a.email ?? 'unknown'}) on ${HOST} is signed out, so it gets no queue work.`,
        `Sign it back in: ${path.join(ROOT, 'fleet/setup/add-account.sh')} <here or machine name> ${a.label} ${a.email ?? '<email>'}`,
        'the queue keeps running on the other accounts');
    } catch (e) {
      log(`could not tell ${HUMAN} account ${a.label} is signed out (${errText(e)})`);
    }
  }
}

// --- 4. dispatch ready tickets ----------------------------------------------------------------------

// Percent of memory free: macOS's memory pressure level, or MemAvailable over MemTotal on Linux.
function memoryFreePercent() {
  if (process.platform === 'darwin') return Number(run('sysctl', ['-n', 'kern.memorystatus_level']));
  const info = fs.readFileSync('/proc/meminfo', 'utf8');
  const kb = (key) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))[1]);
  return Math.round((kb('MemAvailable') / kb('MemTotal')) * 100);
}

// This machine's 5-minute load, its cores and its limits, the one reader machineBusy and burstState share.
function machineLoad() {
  return { perCore: hostCfg.maxLoadPerCore ?? cfg.maxLoadPerCore, minFree: hostCfg.minMemoryFreePercent ?? cfg.minMemoryFreePercent,
    cores: os.cpus().length, load: os.loadavg()[1] };
}

// A machine with no room claims nothing. The ticket stays agent-ready in Linear for its next tick or another machine's.
function machineBusy() {
  const { perCore, minFree, cores, load } = machineLoad();
  if (perCore && load > perCore * cores) return `load ${Math.round(load)} is over its limit of ${Math.round(perCore * cores)} on ${cores} cores`;
  if (minFree) {
    const free = memoryFreePercent();
    if (free < minFree) return `only ${free}% of memory is free, under its limit of ${minFree}%`;
  }
  return null;
}

// Burst slots: hosts.<name>.burstWorkers (default 0) extra regular slots, open while the machine has real headroom: its
// 5-minute load under burstLoadPerCore per core (the host's, else the top-level one, else half of maxLoadPerCore) and at
// least burstMinMemoryFreePercent of memory free (the host's, else the top-level one, else twice minMemoryFreePercent).
// Then the regular pool's limit is maxWorkers + burstWorkers for new dispatches, wakes and redispatch by hand. The
// Sentry pool has no burst, and a drained machine (maxWorkers 0) opens none, however calm it is. Read once per run.
let burstMemo;
const round1 = (n) => Math.round(n * 10) / 10;
function burstState() {
  if (burstMemo !== undefined) return burstMemo;
  const extra = hostCfg.burstWorkers ?? 0;
  if (!(extra > 0) || hostCfg.maxWorkers === 0) return (burstMemo = null);
  const { perCore, minFree, cores, load } = machineLoad();
  const burstPerCore = hostCfg.burstLoadPerCore ?? cfg.burstLoadPerCore ?? (perCore ? perCore / 2 : 0.75);
  const burstFree = hostCfg.burstMinMemoryFreePercent ?? cfg.burstMinMemoryFreePercent ?? (minFree ? minFree * 2 : 40);
  let free = null;
  try {
    free = memoryFreePercent();
  } catch {
    // Unreadable memory opens no burst slot.
  }
  const under = burstPerCore * cores;
  const reading = `load ${round1(load)} of ${perCore ? round1(perCore * cores) : `${cores} cores`}, ${free ?? 'unknown'}% memory free`;
  const why = !(load < under) ? `load ${round1(load)} is not under ${round1(under)}`
    : !(free >= burstFree) ? `${free ?? 'unknown'}% of memory free is under ${burstFree}%` : null;
  return (burstMemo = { extra, slots: why ? 0 : extra, reading, why, under: round1(under), burstFree });
}
const burstSlots = () => burstState()?.slots ?? 0;
// For status and the log: this machine's burst state, or '' when it has no burst slots.
function burstText() {
  const b = burstState();
  if (!b) return '';
  return b.slots ? `burst open: ${b.slots} extra slot${b.slots === 1 ? '' : 's'} (${b.reading}; opens under load ${b.under} with ${b.burstFree}%+ memory free)`
    : `burst closed: ${b.why} (${b.reading})`;
}

// hosts.<host>.fallbackAccounts get queue work only when no regular account can take it, which in practice means
// the regular ones are under headroomFloorPercent.
const fallbackAccounts = hostCfg.fallbackAccounts ?? [];
const usedHere = (label) => fallbackAccounts.includes(label) || !hostCfg.accounts || hostCfg.accounts.includes(label);

// Fable is a sub-limit inside an account's week. Once it is spent the account still runs other models, so the weekly
// headroom that decides whether an account takes a worker leaves the Fable-only window out, and workerModel decides
// separately whether that worker runs on Fable. fleet.sh usage --json reports `weekly` as the tightest weekly window,
// which would read a spent Fable allowance as a spent week. An engine row has no windows.
const isFableWindow = (w) => w.kind === 'weekly_scoped' && w.scope === 'Fable';
function weeklyLeft(u) {
  const ws = (u?.windows ?? []).filter((w) => w.group === 'weekly' && !isFableWindow(w));
  if (ws.length) return Math.min(...ws.map((w) => w.remaining_percentage ?? -1));
  // A reading whose only weekly window is Fable's says nothing about the week: unknown, so no worker goes there on it.
  return u?.weekly?.window === 'Fable' ? null : (u?.weekly?.remaining_percentage ?? -1);
}
const fableWindow = (u) => (u?.windows ?? []).find(isFableWindow) ?? null;

// burnAccounts: accounts used up first, for usage that would otherwise be lost (a plan about to end, a weekly reset
// about to wipe it). A burn account wins every ticket while it has burnFloorPercent left, ahead of the engines and the
// other accounts. burnUntil[label] ends one account's burn at that instant; from then on it is ranked like any other.
const isBurn = (label) => (cfg.burnAccounts ?? []).includes(label)
  && !(cfg.burnUntil?.[label] && Date.now() >= Date.parse(cfg.burnUntil[label]));
// The model switches are separate from the burn. fableAccounts run Fable while it is allowed, burned or not.
// noFableAccounts never run Fable, and win over both fableAccounts and model "fable".
const noFable = (label) => (cfg.noFableAccounts ?? []).includes(label);
const fableOn = (label) => (cfg.fableAccounts ?? []).includes(label);
// workerCapByAccount: the most working sessions one account may hold on a machine, in place of workerCap (0 included).
const capOf = (label) => (Number.isInteger(cfg.workerCapByAccount?.[label]) ? cfg.workerCapByAccount[label] : cfg.workerCap);
// A new worker may run Fable while its account has fableFloorPercent of its Fable allowance left and at least
// fableMinWeeklyLeftPercent of its week: a Fable reset refunds only the Fable allowance, so it pays in full only when
// that allowance is spent before the rest of the week.
function fableAllowed(acct) {
  if (noFable(acct?.label)) return false;
  const left = fableWindow(acct?.usage)?.remaining_percentage ?? null;
  if (left == null || left < (cfg.fableFloorPercent ?? cfg.headroomFloorPercent)) return false;
  return weeklyLeft(acct?.usage) >= (cfg.fableMinWeeklyLeftPercent ?? 50);
}
// With model "fable", a worker runs Fable while fableAllowed, and modelFallback once it is not. A burn account and an
// account in fableAccounts run Fable while it is allowed, whatever model says.
function workerModel(acct) {
  if (cfg.model !== 'fable' && !isBurn(acct?.label) && !fableOn(acct?.label)) return cfg.model;
  const fallback = cfg.model === 'fable' ? (cfg.modelFallback ?? 'opus') : cfg.model;
  return fableAllowed(acct) ? 'fable' : fallback;
}
// The model for one Claude worker. A ticket whose Size is in modelBySize runs on that model (S on Sonnet, say). A
// bundle and a replacement worker pass no size and get the regular model, so a ticket the smaller model could not
// finish is not handed to it again. A burn account or one in fableAccounts runs Fable while it may, Size S included.
function modelFor(acct, { size = null } = {}) {
  if ((isBurn(acct?.label) || fableOn(acct?.label)) && fableAllowed(acct)) return 'fable';
  const sized = size && cfg.modelBySize?.[size];
  // A size mapped to Fable keeps the Fable rules.
  if (sized && (sized !== 'fable' || fableAllowed(acct))) return sized;
  return workerModel(acct);
}

// workerReservePercent ({ <subscriptionType>: percent }): usage promised to running workers. Each working session
// reserves that share of its account's week, counted across every machine: this one's from fleet.sh usage, the others'
// from their heartbeats. An account takes a new worker only while its weekly usage left, less what its running workers
// and the new one reserve, stays at the floor, and accounts are ranked by that projected figure, so one tick's tickets
// spread across accounts. One email can hold two plans, so an account is keyed by email and plan. Engines reserve nothing.
const accountKey = (a) => `${a.email ?? a.label}|${a.subscriptionType ?? ''}`;
const reserveFor = (a) => (a?.subscriptionType ? (cfg.workerReservePercent?.[a.subscriptionType] ?? 0) : 0);
const reserving = () => Object.values(cfg.workerReservePercent ?? {}).some((p) => p > 0);
function workingElsewhere() {
  const counts = new Map();
  if (!reserving()) return counts;
  for (const beat of otherHeartbeats()) {
    for (const w of beat.accountsWorking ?? []) counts.set(w.key, (counts.get(w.key) ?? 0) + (w.working ?? 0));
  }
  return counts;
}

// The account a new worker runs on, or null. A burn account with room goes first. Otherwise the one with the most weekly
// usage left (after the reserve) among those with at least headroomFloorPercent left in both windows and fewer working
// sessions than its cap. `engines` are engine-workers.mjs's rows for Codex and Grok, in the same shape and ranked by the
// same figures, with two differences. An engine whose plan usage could not be read is still a candidate, ranked after
// every account with a reading: its own limit stop and limitCooldownMinutes keep a spent engine off. And on an exact tie
// an engine goes first (Grok, then Codex), since it is listed first. Callers that start a Claude worker pass no engines.
function pickAccount(accounts, engines = []) {
  const floor = cfg.headroomFloorPercent;
  const elsewhere = workingElsewhere();
  const fleetWorking = (a) => (a.working ?? 0) + (elsewhere.get(accountKey(a)) ?? 0);
  // Weekly usage left once the running workers and `extra` more have taken their reserve.
  // An unknown week (weeklyLeft null) reads as no room, the same as an account whose usage could not be read.
  const projected = (a, extra = 0) => (weeklyLeft(a.usage) ?? -1) - reserveFor(a) * (fleetWorking(a) + extra);
  // A plan with no 5-hour window reports five_hour as null once its usage is known; that is no limit, not an empty
  // one. The weekly window is still required.
  const fiveHourOk = (u, min = floor) => u.five_hour == null || (u.five_hour.remaining_percentage ?? -1) >= min;
  const roomy = (a) => fiveHourOk(a.usage) && projected(a, 1) >= floor;
  const usable = (a) => a.signed_in && a.working < capOf(a.label) && a.usage?.available && roomy(a);
  const engineUsable = (a) => a.working < capOf(a.label) && !a.usage?.limited && (!a.usage?.available || roomy(a));
  const left = (a) => (a.usage?.available ? projected(a) : -1);
  // Spread usage away from the primary account, which the human's own sessions use. The sort is stable, so a tie keeps
  // the engines' place ahead of the Claude accounts.
  const best = (pool) => pool.sort((x, y) => (x.label === PRIMARY) - (y.label === PRIMARY) || left(y) - left(x))[0] ?? null;
  // A burn account that runs Fable goes first only while its new worker may run Fable; one in noFableAccounts burns
  // its whole week on other models. Among burn accounts the one with the most projected usage left wins, the primary
  // account included: listing it there is a choice to burn it.
  const burnFloor = cfg.burnFloorPercent ?? 2;
  const burnable = (a) => isBurn(a.label) && usedHere(a.label) && a.signed_in && a.working < capOf(a.label) && a.usage?.available
    && (noFable(a.label) || fableAllowed(a)) && fiveHourOk(a.usage, burnFloor) && projected(a, 1) >= burnFloor;
  const burn = accounts.filter(burnable).sort((x, y) => left(y) - left(x))[0] ?? null;
  if (burn) return burn;
  const regular = accounts.filter((a) => usedHere(a.label) && !fallbackAccounts.includes(a.label) && usable(a));
  return best([...engines.filter(engineUsable), ...regular]) ?? best(accounts.filter((a) => fallbackAccounts.includes(a.label) && usable(a)));
}

// The worker brief's config placeholders, filled once before the ticket placeholders.
const fillConfig = (text) => text
  .replaceAll('{{HUMAN}}', HUMAN)
  .replaceAll('{{REPO}}', REPO)
  .replaceAll('{{REPO_NAME}}', REPO_NAME)
  .replaceAll('{{REPO_PATH}}', conf.repoPath ?? '')
  .replaceAll('{{WORKTREES}}', WORKTREES)
  .replaceAll('{{BASE}}', BASE)
  .replaceAll('{{ROOT}}', ROOT)
  .replaceAll('{{GATED_PUSH}}', GATED_PUSH)
  .replaceAll('{{REVIEW_CHECK}}', REVIEW_CHECK ?? 'the AI review check')
  .replaceAll('{{REVIEWER}}', RV)
  .replaceAll('{{JUDGMENT_LABEL}}', L.judgment)
  .replaceAll('{{GATES}}', GATES)
  .replaceAll('{{MAX_ROUNDS}}', String(cfg.externalBuilders?.fallback?.maxRounds ?? 5));
// The repo's own checks, for the engine brief: push.gates, then premerge.checkCommand when it differs.
const GATES = (() => {
  const list = [...(conf.push?.gates ?? [])];
  const check = conf.premerge?.checkCommand;
  if (Array.isArray(check) && check.length && !list.some((g) => g.join(' ') === check.join(' '))) list.push(check);
  return list.length ? list.map((g) => `    ${g.join(' ').replaceAll('{base}', `origin/${BASE}`)}`).join('\n') : '    (none configured: run the checks the repo documents)';
})();

// The worker brief for one ticket, or for a bundle: the lead first, then its companions. A bundle gets one header,
// a note on building the tickets together, and one ticket section per ticket.
function brief(issues, branch) {
  const [lead] = issues;
  const fill = (text, issue) => text
    .replaceAll('{{ID}}', issue.identifier)
    .replaceAll('{{BRANCH}}', branch)
    .replaceAll('{{TITLE}}', issue.title)
    .replaceAll('{{URL}}', issue.url)
    .replaceAll('{{DESCRIPTION}}', issue.description || `(The ticket has no description. Ask ${HUMAN} before building.)`);
  const template = fillConfig(fs.readFileSync(path.join(DIR, 'worker-brief.md'), 'utf8'));
  if (issues.length === 1) return fill(template, lead);
  const at = template.search(/^## Ticket \{\{ID\}\}/m);
  const head = at < 0 ? template : template.slice(0, at);
  const section = at < 0 ? '## Ticket {{ID}}: {{TITLE}}\n\n{{URL}}\n\n{{DESCRIPTION}}\n' : template.slice(at);
  const ids = issues.map((i) => i.identifier);
  const list = ids.join(', ');
  const note = `This is a bundle. The agent dispatcher gave you ${issues.length} tickets from one Linear project, ${list}, to build together as one pull request, because every extra PR costs CI runs and a review round. Where the brief below says ${lead.identifier}, it means the whole bundle, except in ask-human commands. Build every ticket's full spec: each ticket's acceptance scenarios must run. Give each ticket its own commits, each subject starting with that ticket's ID. The PR title starts with "${list}: ". The PR body keeps every section of the repo's pull request template once for the whole PR, and adds one short section per ticket for what it changed. A question about one ticket goes to ask-human.sh with that ticket's own ID, in both the ask and the wait command. If one ticket turns out not to belong in this PR (a decision that blocks only it, or a risky change that deserves its own review), ask about it with its ID and keep building the others.\n\n`;
  const header = fill(head, lead)
    .replace(`Build Linear ticket ${lead.identifier} in ${REPO_NAME} as one pull request.`, `Build Linear tickets ${list} in ${REPO_NAME} as one pull request.`)
    .replace(`PR title starts with "${lead.identifier}: "`, `PR title starts with "${list}: "`);
  return note + header + issues.map((i) => fill(section, i)).join('\n');
}

const workerName = (id) => `queue-${id.toLowerCase()}`;

// A claim interrupted by a crash or an ambiguous dispatch error: adopt the worker if it exists, else undo.
async function reconcileClaims(st, m) {
  for (const [id, t] of Object.entries(st.tickets)) {
    if (t.status !== 'claiming') continue;
    let worker;
    try {
      // An engine claim's worker is the run in its registry row; the fleet's session list never shows it.
      worker = engineDriven(t) ? await engines.call(`reading ${id}'s engine claim`, 'unknown', (e, c) => e.adopt(c, id, t)) : fleetWorker(workerName(t.bundledInto ?? id));
      if (worker === 'unknown') throw new Error('its engine registry could not be read');
    } catch (e) {
      log(`${id}: could not list its workers to reconcile its claim (${errText(e)})`);
      continue;
    }
    if (worker) {
      const ids = { account: worker.label, workerId: worker.id, workerName: worker.name, dispatchedAt: t.dispatchedAt ?? t.claimedAt };
      if (t.bundledInto) {
        Object.assign(t, { ...ids, status: 'bundled' });
      } else {
        Object.assign(t, { ...ids, status: 'building' });
        st.dispatches.push(t.claimedAt);
        if (t.bundle?.length) writeBundle(id, t.bundle);
      }
      saveState(st);
      log(`${id}: interrupted claim reconciled, worker ${worker.label}/${worker.id} is running`);
      continue;
    }
    if (DRY) {
      log(`would undo the interrupted claim on ${id}`);
      continue;
    }
    const iid = await issueId(id);
    await effects(t, id, [
      [`put agent-ready back on ${id}`, () => addLabel(iid, m.label.ready)],
      [`remove agent-building from ${id}`, () => removeLabel(iid, m.label.building)],
      ...(t.priorStateId ? [[`restore ${id}'s state`, () => setState(iid, t.priorStateId)]] : []),
    ]);
    delete st.tickets[id];
    saveState(st);
    log(`${id}: interrupted claim undone, back in the queue`);
  }
}

// The queue bar's mechanical half (Specdesk's SPECDESK.md has the whole bar): the spec floor's scenarios, a Size the
// queue takes, and a priority. `check ENG-123` runs it on one ticket.
function readyProblems(issue) {
  const problems = [];
  if (!/^##\s*Acceptance scenarios/im.test(issue.description ?? '')) problems.push('no "## Acceptance scenarios" section');
  const size = issue.labels.nodes.find((l) => l.parent?.name === SIZE_GROUP)?.name;
  if (!size) problems.push(`no ${SIZE_GROUP} label (${cfg.queueSizes.join(' or ')})`);
  else if (!cfg.queueSizes.includes(size)) problems.push(`${SIZE_GROUP} ${size} is too big for one worker, so split it`);
  if (!issue.priority) problems.push('no priority');
  return problems;
}

// A ticket under the bar goes back to the human instead of to a worker. The label comes off first, so a failed comment
// or inbox call can never repeat on the next tick.
async function sendBack(m, issue, problems) {
  const id = issue.identifier;
  const why = problems.join('; ');
  log(`${id}: not queued, ${why}`);
  if (DRY) return;
  try {
    await removeLabel(issue.id, m.label.ready);
  } catch (e) {
    return log(`${id}: could not remove agent-ready, trying next tick (${errText(e)})`);
  }
  await effects({}, id, [
    [`comment why ${id} was not queued`, () => comment(issue.id, `Not queued (agent dispatcher on ${HOST}): ${why}. The queue takes a ticket that meets the spec floor (the agent queue's \`docs/ticket-spec.md\`), carries a ${SIZE_GROUP} label of ${cfg.queueSizes.join(' or ')}, and has a priority. Fix it, then add ${L.ready} again.`)],
    [`ask ${HUMAN} about ${id}`, () => askHuman(id, 'blocked', `${id} was sent back from the agent queue: ${why}.`,
      `Finish its spec in ${ORCH}, then add ${L.ready} again`, 'it stays out of the queue')],
  ]);
  await notify(`${id} sent back`, why);
}

async function dispatch(st, m) {
  if (isPaused()) return log(`paused (${pauseReason()}), not dispatching`);
  st.dispatches = (st.dispatches ?? []).filter((d) => hoursSince(d) < 24);

  const q = await gql(`query($team:String!,$ready:String!){ issues(first:100, filter:{team:{key:{eq:$team}},
    labels:{name:{eq:$ready}}, state:{type:{nin:["completed","canceled","duplicate"]}}}){ nodes{
      id identifier title url priority createdAt description state{ id } project{ id } parent{ identifier }
      labels{ nodes{ name parent{ name } } }
      relations(first:50){ nodes{ type relatedIssue{ identifier } } }
      inverseRelations(first:100){ nodes{ type issue{ identifier state{ name type } } } } } } }`, { team: TEAM, ready: L.ready });
  const rank = (p) => (p === 0 ? 5 : p);
  const ready = [];
  // Held: nothing is claimed, and no ticket is sent back either, since the hold says nothing about the ticket.
  if (newWorkHeld()) return log(`${q.issues.nodes.length} ready, none claimed: new work is held ${holdWhere()}; work already claimed carries on`);
  for (const i of q.issues.nodes) {
    if (i.labels.nodes.some((l) => [L.building, L.stuck].includes(l.name)) || st.tickets[i.identifier]) continue;
    const problems = readyProblems(i);
    if (problems.length) await sendBack(m, i, problems);
    else ready.push(i);
  }
  ready.sort((a, b) => rank(a.priority) - rank(b.priority) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (!ready.length) return log('queue empty');

  const busy = machineBusy();
  if (busy) return log(`${ready.length} ready, none claimed: this machine is busy, ${busy}`);

  // A bundle is one worker: its companions carry agent-building too, so they are left out of the count. A ticket parked
  // on the reviewer or waiting in the wake queue holds no slot and leaves the cross-machine count too.
  const companions = bundledCompanions();
  const active = (await building()).filter((id) => !companions.has(id) && !st.tickets[id]?.parked && !wakeEntry(st, id)).length;
  const sentrySlots = hostCfg.sentryWorkers ?? 0;
  const sentryHost = sentrySlots > 0 ? null : liveSentryHost();
  let rows;
  try {
    rows = await sessionRows(st);
  } catch (e) {
    return log(`${ready.length} ready, none claimed: could not count this machine's other fleet workers (${errText(e)})`);
  }
  // The slots in use (poolUse): every ticket that holds one, every ticket in the wake queue (kept for it, ahead of any
  // new ticket), and every working session no slot accounts for.
  const local = poolUse(st, rows, 'regular', { queued: true });
  let room = poolMax('regular') - local;
  let sentryRoom = sentrySlots - poolUse(st, rows, 'sentry', { queued: true });
  const { outside, slotless } = sessionsWithoutSlot(st, rows);
  const waitingHere = (st.wakeQueue ?? []).length;
  // maxDispatchesPerDay is optional: with many small, quick PRs a daily cap runs out fast and the work stops.
  // Worker slots and maxConcurrent still bound the queue.
  const dailyCap = cfg.maxDispatchesPerDay ?? Infinity;
  let slots = Math.min(cfg.maxConcurrent - active, dailyCap - st.dispatches.length, Math.max(room, 0) + Math.max(sentryRoom, 0));
  if (slots <= 0) return log(`no slots for ${ready.length} ready: ${active}/${cfg.maxConcurrent} building across machines, ${local}/${hostCfg.maxWorkers ?? 'no limit'} on this machine${burstState() ? ` (${burstText()})` : ''}${sentrySlots ? `, Sentry slot ${sentrySlots - sentryRoom}/${sentrySlots}` : ''}${outside ? ` (${outside} outside the queue)` : ''}${slotless ? ` (${slotless} working without a slot)` : ''}${waitingHere ? ` (${waitingHere} waiting for a slot)` : ''}, ${st.dispatches.length}${Number.isFinite(dailyCap) ? `/${dailyCap}` : ''} dispatched today`);

  let accounts = null;
  let engineRows = null; // Codex and Grok as account rows, read when the first ticket an engine may take comes up
  const taken = new Set(); // companions this tick bundled, so they are never dispatched on their own as well
  for (const issue of ready) {
    if (slots <= 0) break;
    if (taken.has(issue.identifier)) continue;
    const blockers = openBlockers(issue);
    if (blockers.length) {
      log(`${issue.identifier}: waiting on ${blockers.map((b) => b.issue.identifier).join(', ')}`);
      continue;
    }
    if (isSentry(issue) && sentryHost) {
      log(`${issue.identifier}: left for ${sentryHost}'s Sentry slot`);
      continue;
    }
    const useSentrySlot = isSentry(issue) && sentrySlots > 0;
    if (useSentrySlot ? sentryRoom <= 0 : room <= 0) continue;
    // A ticket takes one of the open burst slots once the regular ones are all in use.
    const inBurst = !useSentrySlot && room <= burstSlots() ? `, using a burst slot: ${burstState().reading}` : '';
    accounts ??= JSON.parse(run(FLEET, ['usage', '--json'], { timeout: 180_000 }));
    // Every account with room is a candidate, Claude, Codex or Grok, ranked by weekly usage left. Codex and Grok take
    // part only while the engines are on and the ticket is one an engine may take (engine-workers.mjs skipReason).
    const notForEngine = !engines.on() ? 'the engines are off'
      : await engines.call(`checking ${issue.identifier} for an engine`, 'the engine module could not be read', (e, c) => e.skipReason(c, issue));
    if (!notForEngine) engineRows ??= await engines.call('reading the engine accounts', [], (e, c) => e.accounts(c, st));
    let acct = pickAccount(accounts, notForEngine ? [] : engineRows);
    if (!acct) {
      // A ticket only Claude may take waits, and the next one may still go to an engine with room.
      if (engines.on() && notForEngine && (engineRows === null || pickAccount([], engineRows))) {
        log(`${issue.identifier}: not for an engine worker: ${notForEngine}; no Claude account has a free worker slot and ${cfg.headroomFloorPercent}%+ headroom, trying next tick`);
        continue;
      }
      log(`${issue.identifier}: no account has a free worker slot and ${cfg.headroomFloorPercent}%+ headroom, trying next tick`);
      break;
    }
    const id = issue.identifier;
    const branch = branchFor(id);
    // Another machine may have claimed it since the list was read. This narrows that race; staggered ticks do the rest.
    const now = await gql('query($id:String!){ issue(id:$id){ labels{ nodes{ name } } } }', { id });
    if (!now.issue.labels.nodes.some((l) => l.name === L.ready)) {
      log(`${id}: another machine claimed it first`);
      continue;
    }
    // An engine ticket takes one slot in the same pool as a Claude one, and is never bundled. An engine that fails to
    // start is not offered again this tick, so one broken launcher can't churn the queue, and the ticket is offered at
    // once to the next account with room: a start that fails for a reason tied to the ticket (a Claude worktree where
    // the engine's clone would go, say) would otherwise lose it to the same engine every tick.
    let started = false;
    while (acct?.engine) {
      const out = await engines.call(`starting ${acct.engine} on ${id}`, 'failed', (e, c) => e.startEngine(c, st, m, issue, acct));
      if (out === 'paused') return;
      if (out !== 'failed') {
        if (inBurst) log(`${id}: its ${acct.engine} worker runs here${inBurst}`);
        slots -= 1;
        room -= 1;
        acct.working += 1;
        started = true;
        break;
      }
      engineRows = engineRows.filter((x) => x !== acct);
      // Offered again only when the failed start left no claim behind; a claim still journaled waits for the next tick.
      if (st.tickets[id]) {
        log(`${id}: its engine start failed and its claim is still recorded, so it waits for the next tick`);
        started = true;
        break;
      }
      acct = pickAccount(accounts, notForEngine ? [] : engineRows);
      if (acct) log(`${id}: its engine failed to start, so it goes to ${acct.label} instead`);
    }
    if (started) continue;
    if (!acct) {
      log(`${id}: its engine failed to start and no other account has a free worker slot and ${cfg.headroomFloorPercent}%+ headroom, trying next tick`);
      continue;
    }
    const mates = [];
    for (const c of pickCompanions(issue, ready, taken)) {
      const cur = await gql('query($id:String!){ issue(id:$id){ labels{ nodes{ name } } } }', { id: c.identifier });
      if (cur.issue.labels.nodes.some((l) => l.name === L.ready)) mates.push(c);
    }
    for (const c of mates) taken.add(c.identifier);
    const members = [issue, ...mates];
    const bundleIds = mates.map((c) => c.identifier);
    const withMates = bundleIds.length ? ` (bundled with ${bundleIds.join(', ')})` : '';
    const model = modelFor(acct, { size: mates.length ? null : sizeOf(issue) });
    slots -= 1;
    if (useSentrySlot) sentryRoom -= 1;
    else room -= 1;
    acct.working += 1;
    if (DRY) {
      log(`would dispatch ${id}${withMates} to account ${acct.label} on ${branch}${useSentrySlot ? ' in the Sentry slot' : ''}, on ${model}${inBurst}`);
      continue;
    }
    if (isPaused()) return log('paused mid-tick, stopping dispatch');

    // Journal the claim before touching Linear, so a crash anywhere below is reconciled next tick.
    const t = { status: 'claiming', claimedAt: iso(), branch, priorStateId: issue.state.id,
      ...(bundleIds.length ? { bundle: bundleIds } : {}), ...(useSentrySlot ? { sentry: true } : {}) };
    st.tickets[id] = t;
    for (const c of mates) st.tickets[c.identifier] = { status: 'claiming', claimedAt: iso(), branch, priorStateId: c.state.id, bundledInto: id };
    saveState(st);
    let out = null;
    try {
      for (const member of members) {
        await addLabel(member.id, m.label.building);
        await removeLabel(member.id, m.label.ready);
        await setState(member.id, m.inProgress);
      }
      out = JSON.parse(run(FLEET, ['dispatch', acct.label, '--cwd', WORKSPACE,
        '--model', model, '--effort', cfg.effort, '--name', workerName(id), '--max-workers', String(capOf(acct.label)),
        ...MODE_ARGS, '--no-report', '--', brief(members, branch)],
      { timeout: 180_000 }));
    } catch (e) {
      log(`${id}: claim or dispatch failed, reconciling (${errText(e)})`);
      await reconcileClaims(st, m);
      continue;
    }
    Object.assign(t, { status: 'building', dispatchedAt: iso(), account: out.label, workerId: out.id, workerName: out.name, model });
    for (const c of mates) Object.assign(st.tickets[c.identifier], { status: 'bundled', dispatchedAt: iso(), account: out.label, workerId: out.id, workerName: out.name });
    if (bundleIds.length) writeBundle(id, bundleIds);
    st.dispatches.push(iso());
    saveState(st);
    log(`${id}: dispatched to ${out.label}/${out.id}${withMates}${useSentrySlot ? ' in the Sentry slot' : ''}${inBurst}`);
    await notify(`${id} started`, `Worker ${out.label}/${out.id}: ${issue.title}${withMates}`, { id, progress: true });
    for (const c of mates) {
      await effects(st.tickets[c.identifier], c.identifier, [[`comment the bundle on ${c.identifier}`, () => comment(c.id,
        `Agent dispatcher on ${HOST}: bundled into ${id}. Fleet worker ${out.label}/${out.id} (${out.name}) builds this ticket together with ${[id, ...bundleIds.filter((x) => x !== c.identifier)].join(', ')} as one PR on \`${branch}\`. It moves to ${STATES.verifying} when that PR merges. Questions go to ${HUMAN}'s Slack.`)]]);
    }
    await effects(t, id, [[`comment the dispatch on ${id}`, () => comment(issue.id,
      `Agent dispatcher on ${HOST}: fleet worker ${out.label}/${out.id} (${out.name}) is building this${withMates} as one PR on \`${branch}\` with ${model}. No time limit; the dispatcher watches for progress. Questions go to ${HUMAN}'s Slack.`)]]);
    saveState(st);
  }
}

// Starts a new worker on a ticket whose worker ended before finishing (a reboot ends every fleet worker). The new worker continues from the old one's worktree and PR instead of
// starting over, and a ticket already marked stuck for it goes back to building. Returns null when no account has room.
// `say` is the reason in the ticket comment for a replacement that is neither a review round nor a plain failed
// worker. `charge` says whether it uses up the maxRedispatches budget; by default only the plain failed-worker
// replacement and a redispatch by hand do.
async function replaceWorker(st, id, t, { note: lead = null, why = null, say = null, charge = null } = {}) {
  if (DRY) {
    log(`${id}: would start a replacement worker on ${t.branch}`);
    return { dry: true };
  }
  // Every caller asks first; this holds the line for one that doesn't. A ticket with no room waits in the wake queue.
  if (!mayWake(st, id, t, why ?? say ?? 'a replacement worker')) return null;
  noteStart(id, false);
  const members = [];
  for (const x of [id, ...(t.bundle ?? [])]) members.push((await gql('query($id:String!){ issue(id:$id){ id identifier title url description } }', { id: x })).issue);
  const [issue] = members;
  const acct = pickAccount(JSON.parse(run(FLEET, ['usage', '--json'], { timeout: 180_000 })));
  if (!acct) return null;
  const model = modelFor(acct);
  // The old session goes before the new one starts, unless it has already ended: a replaced worker left in its session
  // could wake again later, on the same branch as its replacement and in no slot. One that could not be stopped may
  // still be running, so nothing starts on its branch; the caller logs it and the next tick tries again.
  const old = !engineDriven(t) && t.workerId ? (wakeRun.workers ?? []).find((w) => w.label === t.account && w.id === t.workerId && w.pid) : null;
  if (old && !wakeRun.stopped.has(workerKey(t))) {
    try {
      stopWorker(t);
    } catch (e) {
      throw new Error(`could not stop its old worker ${t.account}/${t.workerId} before replacing it (${errText(e)})`);
    }
  }
  // An engine ticket a Claude worker takes over (a redispatch by hand, or the round cap that made it stuck): the engine's
  // clone is engine-written throughout, so the worker is told to cut its own worktree from the branch instead.
  const fromEngine = engineDriven(t);
  const note = fromEngine
    ? `${engines.guard(id, t)}Continue the work on ${id} from origin/${t.branch} instead of starting over. If a PR exists, read its failing checks and review findings and fix them. Then carry on with the brief below.\n\n`
    : `Your previous worker on ${id} ended before finishing (its session stopped, for example when this machine rebooted). Continue its work instead of starting over: the worktree for ${t.branch} under ${WORKTREES}/ may hold commits that were never pushed, so check it first and push them. If a PR exists, read its failing checks and review findings and fix them. Then carry on with the brief below.\n\n`;
  const out = JSON.parse(run(FLEET, ['dispatch', acct.label, '--cwd', WORKSPACE,
    '--model', model, '--effort', cfg.effort, '--name', workerName(id), '--max-workers', String(capOf(acct.label)),
    ...MODE_ARGS, '--no-report', '--', (lead ?? note) + brief(members, t.branch)], { timeout: 180_000 }));
  noteStart(id, true);
  if (fromEngine) {
    engines.leave(t);
    if (t.status === 'merge-asked') clearMergeRequest(id);
  }
  const wasStuck = t.status === 'stuck';
  // lastOutputAt too: the spin check measures a busy worker's quiet time from it, and the old worker's last commit
  // made every replacement read as stalled on its first tick.
  Object.assign(t, { status: 'building', account: out.label, workerId: out.id, workerName: out.name, model, goneTicks: 0,
    lastProgressAt: iso(), lastOutputAt: iso(), redispatchedAt: iso(), redispatches: (t.redispatches ?? 0) + ((charge ?? !(why || say)) ? 1 : 0) });
  for (const k of ['stalledSince', 'stuckAt', 'reason']) delete t[k];
  saveState(st);
  log(`${id}: redispatched to ${out.label}/${out.id}${wasStuck ? ' (was stuck)' : ''}`);
  if (wasStuck) {
    const m = await teamMeta();
    await addLabel(issue.id, m.label.building);
    await removeLabel(issue.id, m.label.stuck);
  }
  // Companions follow the new worker, back out of stuck when the bundle went stuck with its lead.
  for (const mate of members.slice(1)) {
    const c = st.tickets[mate.identifier];
    if (!c || !['bundled', 'stuck'].includes(c.status)) continue;
    const back = c.status === 'stuck';
    Object.assign(c, { status: 'bundled', account: out.label, workerId: out.id, workerName: out.name });
    delete c.stuckAt;
    delete c.reason;
    if (back) {
      const m = await teamMeta();
      await addLabel(mate.id, m.label.building);
      await removeLabel(mate.id, m.label.stuck);
    }
  }
  if (t.bundle?.length) writeBundle(id, t.bundle);
  saveState(st);
  await comment(issue.id, say
    ? `Agent dispatcher on ${HOST}: ${say}, so fleet worker ${out.label}/${out.id} continues on \`${t.branch}\` from its worktree and PR.`
    : why
    ? `Agent dispatcher on ${HOST}: ${why}, so fleet worker ${out.label}/${out.id} addresses them on \`${t.branch}\` and pushes to the same PR.`
    : `Agent dispatcher on ${HOST}: the previous worker ended before finishing, so fleet worker ${out.label}/${out.id} continues on \`${t.branch}\` from its worktree and PR.`);
  return out;
}

async function redispatch(id) {
  if (!takeLock()) return console.log('a tick is running; try again in a minute');
  try {
    const st = loadState();
    const t = st.tickets[id];
    if (!['building', 'stuck', ...(engineDriven(t) ? ['merge-asked'] : [])].includes(t?.status)) return console.log(`${id} is not building or stuck on ${HOST} (status ${t?.status ?? 'none'})`);
    // An engine run still going would share the branch with the Claude worker that takes the ticket over.
    const run1 = engineDriven(t) ? (await engines.call('reading the engine registry', [], (e, c) => e.rows(c))).find((r) => r.ticket === id && r.id === t.workerId) : null;
    if (run1?.status === 'busy') return console.log(`${id}: its ${t.engine} run ${t.workerId} is still busy; stop it first with ext-worker.sh stop ${id}`);
    const w = fleetWorkers().find((x) => x.label === t.account && x.id === t.workerId);
    if (w && ACTIVE.includes(w.status || w.state)) return console.log(`${id}: its worker ${t.account}/${t.workerId} is still ${w.status || w.state}`);
    if (!(await roomByHand(st, id, t, 'a redispatch by hand'))) return;
    let out;
    try {
      out = await replaceWorker(st, id, t);
    } catch (e) {
      return console.log(`${id}: nothing started: ${errText(e)}`);
    }
    console.log(out ? `${id}: redispatched to ${out.label}/${out.id}` : `no account has a free worker slot and ${cfg.headroomFloorPercent}%+ headroom`);
    // An override is spent only by a start: one that started nothing stands for the next try.
    const o = wakeRun.overrides.get(id);
    if (out && o?.needed) {
      fs.rmSync(o.file, { force: true });
      console.log(`${id}: its wake override let it through over the limit, and is cleared`);
    }
  } finally {
    fs.rmdirSync(LOCK);
  }
}

// A redispatch starts a session too, so it keeps the machine's limit. A pending wake override for the ticket lets one
// through, once. It only refuses: the ticket does not join the wake queue for an action no tick would repeat.
async function roomByHand(st, id, t, what) {
  try {
    wakeRun.workers = await sessionRows(st);
  } catch (e) {
    console.log(`${id}: this machine's working sessions could not be counted (${errText(e)}), so nothing started`);
    return false;
  }
  for (const [x, other] of Object.entries(st.tickets)) if (holdsSlot(st, x, other)) wakeRun.held.add(x);
  const req = readWakeRequest(id);
  if (req) wakeRun.overrides.set(id, req);
  if (mayWake(st, id, t, what, { join: false })) return true;
  const pool = poolOf(t);
  console.log(`${id}: nothing started, since ${what} would put ${HOST} over its limit (${poolUse(st, wakeRun.workers, pool, { except: id })}/${poolMax(pool)} ${slotWord(pool)}s in use without it${pool === 'regular' && burstState() ? `; ${burstText()}` : ''}). Run \`node ${path.join(DIR, 'dispatcher.mjs')} wake ${id}\` first to let it through once.`);
  return false;
}

// `wake ENG-123`: the ticket's next wake goes through over its machine's limit, once. Any machine records it in the
// shared wake-requests folder, and the machine that holds the ticket honours it on its next tick and clears it.
function wakeCmd(id) {
  fs.mkdirSync(WAKE_REQUESTS, { recursive: true });
  fs.writeFileSync(path.join(WAKE_REQUESTS, `${id}.json`), `${JSON.stringify({ id, at: iso(), from: HOST })}\n`);
  log(`${id}: wake override recorded on ${HOST}`);
  const local = fs.existsSync(STATE) ? loadState() : { tickets: {} };
  const t = local.tickets[id];
  const entry = wakeEntry(local, id);
  const next = (host, last) => `${host}'s next tick${last ? ` (the last at ${last})` : ''}`;
  if (LIVE.includes(t?.status)) {
    return console.log(entry
      ? `${id} waits in ${HOST}'s wake queue since ${entry.since} (${entry.reason}). Override recorded: ${next(HOST, local.lastTick)} wakes it over the limit, once, and clears the request.`
      : `${id} is ${t.status} on ${HOST} and does not wait for a slot. Override recorded: if it needs to wake on ${next(HOST, local.lastTick)}, it goes through over the limit; if not, that tick clears the request.`);
  }
  for (const host of cfg.enabledHosts.filter((h) => h !== HOST)) {
    let beat;
    try {
      beat = JSON.parse(fs.readFileSync(path.join(HEARTBEATS, `${host}.json`), 'utf8'));
    } catch {
      continue;
    }
    const w = (beat.wakeQueue ?? []).find((x) => x.id === id);
    if (w) return console.log(`${id} waits in ${host}'s wake queue since ${w.since} (${w.reason}), as of its heartbeat at ${beat.at}. Override recorded in ${WAKE_REQUESTS}: ${next(host, beat.at)} wakes it over the limit, once, and clears the request.`);
  }
  console.log(`${id} is not live on ${HOST}, and no other machine's heartbeat lists it in a wake queue. Override recorded in ${WAKE_REQUESTS}: the machine that holds the ticket honours it on its next tick if the ticket needs to wake, and a request no machine takes is dropped after a day.`);
}

// --- Sentry triage -------------------------------------------------------------------------------------

// Sentry triage is a module you supply (dispatcher.sentryTriage.module, default sentry-triage.mjs next to this file;
// the repo ships none). It runs on sentryTriage.host only, behind sentryTriage.enabled, and its kickFromTick should
// start the run in its own detached process. It is loaded here and nowhere at the top, so a syntax error or a throw in
// it is one log line and never stops a tick. It exports kickFromTick({ cfg, dry, log }) and statusLine(cfg), and labels
// the tickets it queues with linear.labels.sentry plus mechanical or judgment, which the Sentry slot and the merge
// paths above read.
const triageModule = () => pathToFileURL(path.resolve(DIR, cfg.sentryTriage?.module ?? 'sentry-triage.mjs')).href;
async function sentryTriage() {
  if (HOST !== cfg.sentryTriage?.host || !cfg.sentryTriage?.enabled) return;
  if (newWorkHeld()) return log(`sentry triage skipped: new work is held ${holdWhere()}`);
  try {
    (await import(triageModule())).kickFromTick({ cfg: conf, dry: DRY, log });
  } catch (e) {
    log(`sentry triage failed, the tick goes on (${errText(e)})`);
  }
}

// --- engine workers ------------------------------------------------------------------------------------

// Codex and Grok as queue accounts. The logic is in engine-workers.mjs and engine-rounds.mjs, loaded on first use and
// only while the engines are on (externalBuilders.fallback.enabled) or a ticket is engine-driven, so a syntax error or a
// throw there costs one log line. The context hands them the dispatcher's own helpers, so an engine ticket is claimed,
// commented on, asked about and marked stuck exactly the way a Claude ticket is.
const engines = makeEngineHooks(() => ({
  cfg, log, errText, iso, saveState, effects, notify, run, askHuman, attachCmd, riskyPaths, requestMerge, EXT_WORKER, HUMAN, WORKTREES, SHARED,
  ctx: () => ({ cfg, conf, DIR, ROOT, LOCAL, SHARED, HOST, DRY, REPO, BASE, HUMAN, L, EXT_WORKER, EXT_USAGE, ASK, WORKTREES,
    log, run, gh, gql, iso, hoursSince, errText, saveState, isPaused, notify, effects, comment, issueId, addLabel, removeLabel, setState,
    markStuck, reconcileClaims, clearMergeRequest, isSentry, sizeOf, branchFor, fillConfig, mayWake, newWorkHeld, noteStart }),
}));

// --- commands ------------------------------------------------------------------------------------------

async function tick() {
  if (!cfg.enabledHosts.includes(HOST)) return log(`host ${HOST} is not in enabledHosts, nothing to do`);
  if (!DRY && !takeLock()) return log('the previous tick is still running');
  let st = null;
  try {
    st = loadState();
    if (fs.existsSync(STREAK_RESET) && !DRY) {
      st.stuckStreak = 0;
      fs.rmSync(STREAK_RESET);
    }
    const m = await teamMeta();
    if (st.fresh) {
      const orphans = await building();
      if (orphans.length && !isPaused()) {
        await trip(st, `no state file on ${HOST}, but ${orphans.join(', ')} carry ${L.building}. Check which machine owns them before resuming`);
      }
    }
    await sendPendingNotice(st);
    inboxSweep();
    await reconcileClaims(st, m);
    await checkMerged(st);
    await settleStuck(st);
    let workers = null;
    try {
      workers = fleetWorkers();
    } catch (e) {
      log(`could not list fleet workers, so worker states are unknown this tick (${errText(e)})`);
    }
    // Engine workers' registry rows join the list shaped like fleet rows, so progress and stall logic read them the same.
    if (workers && engines.wanted(st)) workers = [...workers, ...await engines.call('reading the engine registry', [], (e, c) => e.rows(c))];
    // The wake queue's slot counts read this list. It is null when the fleet can't be read, and then nothing wakes.
    wakeRun.workers = workers;
    loadWakeOverrides(st);
    pruneWakeQueue(st);
    await advance(st, m, workers);
    pruneWakeQueue(st);
    await teardownFinished(st, workers);
    await watchWorkers(st, workers);
    await watchSignIns(st);
    await dispatch(st, m);
    await sentryTriage();
    await worktreeSweep(st);
    await writeHeartbeat(st);
    st.lastTick = iso();
    delete st.lastError;
  } catch (e) {
    log(`tick failed: ${e.message}`);
    process.exitCode = 1;
    if (st) st.lastError = `${iso()} ${e.message}`;
    else if (!DRY && !isPaused()) fs.writeFileSync(PAUSED, `${iso()} state could not be loaded: ${e.message}\n`);
  } finally {
    if (st) {
      settleWakeOverrides(st);
      saveState(st);
    }
    if (!DRY) fs.rmdirSync(LOCK);
  }
}

async function status() {
  const st = loadState();
  const day = (st.dispatches ?? []).filter((d) => hoursSince(d) < 24).length;
  console.log(`host ${HOST} (${cfg.enabledHosts.includes(HOST) ? 'enabled' : 'not enabled'}), ${isPaused() ? `PAUSED: ${pauseReason()}` : 'running'}${newWorkHeld() ? `; new work HELD ${holdWhere()}, claimed work carries on` : ''}`);
  console.log(`last tick ${st.lastTick ?? 'never'}${st.lastError ? `, last error ${st.lastError}` : ''}; dispatched ${day}${cfg.maxDispatchesPerDay ? `/${cfg.maxDispatchesPerDay}` : ''} in 24h; stuck streak ${st.stuckStreak ?? 0}${st.pendingNotice ? '; pause notice not yet delivered' : ''}`);
  if (cfg.sentryTriage?.enabled) {
    try {
      console.log((await import(triageModule())).statusLine(conf));
    } catch (e) {
      console.log(`sentry triage: status unavailable (${errText(e)})`);
    }
  }
  const q = await gql(`query($team:String!,$ready:String!){ issues(first:100, filter:{team:{key:{eq:$team}}, labels:{name:{eq:$ready}},
    state:{type:{nin:["completed","canceled","duplicate"]}}}){ nodes{ identifier } } }`, { team: TEAM, ready: L.ready });
  console.log(`queue: ${q.issues.nodes.length} ${L.ready}${q.issues.nodes.length ? ` (${q.issues.nodes.map((n) => n.identifier).join(', ')})` : ''}`);
  // The slots counted the way the tick counts them, and the tickets waiting for one here and on the other machines.
  try {
    const rows = await sessionRows(st);
    const { outside, slotless } = sessionsWithoutSlot(st, rows);
    console.log(`slots on ${HOST}: ${poolUse(st, rows, 'regular', { queued: true })}/${hostCfg.maxWorkers ?? 'no limit'} in use${burstState() ? ` (${burstText()})` : ''}${hostCfg.sentryWorkers ? `, Sentry ${poolUse(st, rows, 'sentry', { queued: true })}/${hostCfg.sentryWorkers}` : ''}${outside ? `; ${outside} working outside the queue` : ''}${slotless ? `; ${slotless} working without a slot` : ''}`);
  } catch (e) {
    console.log(`slots on ${HOST}: could not count its working sessions (${errText(e)})`);
  }
  const waitLine = (list) => list.map((w) => `${w.id}${w.pool === 'sentry' ? ' (Sentry slot)' : ''} for ${Math.round(hoursSince(w.since) * 60)} min: ${w.reason}`).join('; ');
  console.log(`wake queue on ${HOST}: ${st.wakeQueue?.length ? waitLine(st.wakeQueue) : 'empty'}`);
  for (const beat of otherHeartbeats(24 * 60)) {
    if (beat.wakeQueue?.length) console.log(`wake queue on ${beat.host} (heartbeat ${beat.at}): ${waitLine(beat.wakeQueue)}`);
  }
  let overrides = [];
  try {
    overrides = fs.readdirSync(WAKE_REQUESTS).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -'.json'.length));
  } catch {
    // No override has been recorded yet.
  }
  if (overrides.length) console.log(`wake overrides pending: ${overrides.join(', ')}`);
  for (const [id, t] of Object.entries(st.tickets)) {
    const last = t.mergedAt ?? t.stuckAt ?? t.closedAt ?? t.dispatchedAt ?? t.claimedAt;
    if (!LIVE.includes(t.status) && !['claiming', 'bundled'].includes(t.status) && hoursSince(last) > 7 * 24) continue;
    const errs = t.effectErrors?.length ? `  [${t.effectErrors.length} side effect(s) failed]` : '';
    const bundle = t.bundledInto ? `  (rides on ${t.bundledInto})` : t.bundle?.length ? `  (+ ${t.bundle.join(', ')})` : '';
    if (t.status === 'bundled' && !LIVE.includes(st.tickets[t.bundledInto]?.status) && st.tickets[t.bundledInto]?.status !== 'claiming') continue;
    const eng = engineDriven(t) ? `  (${t.engine} round ${t.round ?? 1}, ${t.engineStatus ?? 'unknown'})` : '';
    const waits = wakeEntry(st, id) ? '  (waiting for a slot)' : t.parked ? `  (parked on ${RV}'s review)` : '';
    console.log(`  ${id.padEnd(10)} ${t.status.padEnd(12)} ${t.account ?? '-'}/${t.workerId ?? '-'}  ${t.pr ?? t.branch}${bundle}${eng}${waits}${t.reason ? `  (${t.reason})` : ''}${errs}`);
  }
}

// The session-start line: what is running and what changed in the last day. Local state only, so it never waits on
// the network, and it prints nothing on a machine with no queue activity.
function summary() {
  if (!fs.existsSync(STATE)) return;
  const st = loadState();
  const live = Object.entries(st.tickets).filter(([, t]) => LIVE.includes(t.status) || t.status === 'claiming');
  const recent = Object.entries(st.tickets).filter(([, t]) => ['merged', 'stuck'].includes(t.status) && hoursSince(t.mergedAt ?? t.stuckAt) < 24);
  if (!live.length && !recent.length && !isPaused()) return;
  const ago = st.lastTick ? `${Math.round((Date.now() - Date.parse(st.lastTick)) / 60_000)} min ago` : 'never';
  console.log(`[Queue] ${isPaused() ? `PAUSED (${pauseReason()})` : `${live.length} running`}${newWorkHeld() ? ', new work held' : ''}${st.wakeQueue?.length ? `, ${st.wakeQueue.length} waiting for a slot` : ''}, last check ${ago}. dispatcher.mjs status has more.`);
  for (const [id, t] of live) {
    const where = t.prNumber ? `PR #${t.prNumber}, ${t.note ?? t.status}` : 'building, no PR yet';
    const hours = `${hoursSince(t.dispatchedAt ?? t.claimedAt).toFixed(1)}h in${t.lastProgressAt ? `, last progress ${hoursSince(t.lastProgressAt).toFixed(1)}h ago` : ''}${t.stalledSince ? ', STALLED' : ''}`;
    console.log(`  ${id}  ${where}${t.blockedSince ? ', WORKER BLOCKED on input' : ''}  (${hours})`);
  }
  for (const [id, t] of recent) {
    console.log(`  ${id}  ${t.status === 'merged' ? `merged ${hoursSince(t.mergedAt).toFixed(1)}h ago, now in Verifying` : `stuck: ${t.reason}`}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2).filter((a) => a !== '--dry-run');
if (cmd === 'tick') await tick();
else if (cmd === 'status') await status();
else if (cmd === 'summary') summary();
else if (cmd === 'check') {
  if (!rest[0]) {
    console.log(`usage: node dispatcher.mjs check ${TEAM}-123`);
    process.exitCode = 2;
  } else {
    const { issue } = await gql(`query($id:String!){ issue(id:$id){ identifier title priority description
      labels{ nodes{ name parent{ name } } } } }`, { id: rest[0] });
    const problems = readyProblems(issue);
    console.log(problems.length ? `${issue.identifier} is not ready: ${problems.join('; ')}` : `${issue.identifier} passes the queue's mechanical checks (scenarios, size, priority)`);
    if (problems.length) process.exitCode = 1;
  }
}
else if (cmd === 'test-notify') {
  await notify('Test', `Agent queue notifications from ${HOST} work`, { progress: true });
  console.log(`macOS notification sent; Slack ${fs.existsSync(SLACK) ? 'posted (anything else is in dispatcher.log)' : `skipped, no webhook at ${SLACK}`}`);
}
else if (cmd === 'redispatch') {
  if (rest[0]) await redispatch(rest[0]);
  else {
    console.log(`usage: node dispatcher.mjs redispatch ${TEAM}-123`);
    process.exitCode = 2;
  }
}
else if (cmd === 'wake') {
  if (new RegExp(`^${TEAM}-\\d+$`).test(rest[0] ?? '')) wakeCmd(rest[0]);
  else {
    console.log(`usage: node dispatcher.mjs wake ${TEAM}-123`);
    process.exitCode = 2;
  }
}
else if (cmd === 'hold') {
  fs.mkdirSync(SHARED, { recursive: true });
  fs.writeFileSync(HOLD, `${iso()} ${HOST} ${rest.join(' ') || 'held by hand'}\n`);
  log(`new work held on every machine: ${rest.join(' ') || 'held by hand'}`);
} else if (cmd === 'release') {
  fs.rmSync(HOLD, { force: true });
  log('new work released on every machine');
} else if (cmd === 'pause') {
  fs.writeFileSync(PAUSED, `${iso()} ${rest.join(' ') || 'paused by hand'}\n`);
  log(`paused: ${rest.join(' ') || 'paused by hand'}`);
} else if (cmd === 'resume') {
  fs.rmSync(PAUSED, { force: true });
  fs.writeFileSync(STREAK_RESET, `${iso()}\n`);
  log('resumed; the stuck streak resets on the next tick');
} else {
  console.log(`usage: node dispatcher.mjs tick [--dry-run] | status | summary | check ${TEAM}-123 | redispatch ${TEAM}-123 | wake ${TEAM}-123 | test-notify | hold [reason] | release | pause [reason] | resume`);
  process.exitCode = 2;
}
