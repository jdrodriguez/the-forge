#!/usr/bin/env node
// board.mjs: the agent queue board. Serves page.html and /api/snapshot on the addresses in queueBoard.bind: 127.0.0.1,
// and this machine's Tailscale address when "tailscale" is listed, so the human's other machines and phone (with
// Tailscale on it) can open it.
// A snapshot joins collect.mjs from every queue machine (run over SSH) with the PRs on GitHub, the queue labels and
// open asks in Linear, the human's Linear inbox (linear-inbox.mjs) and every machine's git worktrees (worktrees.mjs, joined
// in worktree-state.mjs), and every machine's Claude app sessions (sessions.mjs). It refreshes only while someone has
// the page open, at most about once a minute, reads everything and changes nothing but its own Handled marks, and
// spends no Claude tokens.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadConfig, linearKey as readLinearKey, ROOT, HOME } from '../lib/config.mjs';
import { readInbox } from './linear-inbox.mjs';
import { engineWorker } from './engine-workers.mjs';
import { branchPrs, worktreeRows } from './worktree-state.mjs';
import { readSettings, writeSettings, applyUpdate, readStatus, playAfterWarning, CUES } from './sound.mjs';
import { musicList, musicFile, musicEvents, musicAlert, alertPages } from './music.mjs';
import { weatherNow } from './weather.mjs';
import { extRuns } from './ext-runs.mjs';
import { hostAllowed, certName, callerOf } from './host-ok.mjs';
import { realmKeys, realmTable } from './realms.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const dc = cfg.dispatcher ?? {};
const qb = cfg.queueBoard ?? {};
const PORT = Number(process.env.QUEUE_BOARD_PORT ?? qb.port ?? 8787);
const FRESH_MS = 45_000;
const LIVE = ['building', 'merge-asked', 'claiming'];
const HERE = os.hostname().split('.')[0];
// The dispatcher's launchd interval (StartInterval in dispatcher/agent-dispatcher.plist), for "next tick" on the page.
const TICK_MINUTES = 20;
// The fleet account whose config dir is ~/.claude; every other account lives in ~/.claude-<label>.
const PRIMARY = cfg.fleet?.primaryAccount ?? 'a';
const HUMAN = cfg.human?.name ?? 'human';
const ORCHESTRATOR = cfg.orchestrator?.sessionName ?? 'Specdesk';
const LABELS = { ready: 'agent-ready', building: 'agent-building', stuck: 'agent-stuck', needsHuman: 'needs-human', sentry: 'sentry-triaged', ...(cfg.linear?.labels ?? {}) };
// The status check that counts as the PR's review; null shows no review state.
const REVIEW_CHECK = cfg.github?.reviewCheck ?? null;
const REPO = cfg.github?.repo ?? '';
const STATE_DIR = cfg.paths.stateDir;
const SHARED = cfg.paths.sharedDir;
const tilde = (p) => (p === HOME || p.startsWith(`${HOME}/`) ? `~${p.slice(HOME.length)}` : p);
// Where this repo sits on the other machines (queueBoard.remoteRoot); by default the same place under their home. The
// config loader expands a leading ~/ to this machine's home, so a path under it goes back to ~/ for the remote shell.
const REMOTE_ROOT = tilde(qb.remoteRoot ?? ROOT);

// How to reach each queue machine (dispatcher.enabledHosts): its name on the page from queueBoard.names and its ssh
// destination from queueBoard.ssh, both the host name itself when unset. The one this runs on is read directly.
const MACHINES = (dc.enabledHosts ?? []).map((host) => ({
  host,
  name: qb.names?.[host] ?? host,
  ssh: qb.ssh?.[host] ?? host,
  root: host === HERE ? tilde(ROOT) : REMOTE_ROOT,
}));

// The Middle-earth realm each machine is drawn as (realms.mjs): queueBoard.realms, else the enabled hosts in order take
// Rivendell, the Shire, Erebor and Rohan. A host with no realm (a fifth machine) is drawn as Men under its own name.
const REALM_OF = realmKeys(dc.enabledHosts, qb.realms);
const REALMS = realmTable(dc.enabledHosts, qb.realms);

// The owner's place (queueBoard.weather) for the page's sky clock, which needs sunrise and sunset there; null when unset.
const PLACE = Number.isFinite(Number(qb.weather?.latitude)) && Number.isFinite(Number(qb.weather?.longitude)) && qb.weather?.latitude != null && qb.weather?.longitude != null
  ? { latitude: Number(qb.weather.latitude), longitude: Number(qb.weather.longitude), timezone: qb.weather.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone }
  : null;

process.env.PATH = [path.join(HOME, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':');
const execFileP = promisify(execFile);
const run = async (cmd, args, opts = {}) => (await execFileP(cmd, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 32 << 20, cwd: HOME, ...opts })).stdout.trim();
// Runs a command with text on stdin; resolves its stdout, rejects with its stderr.
function runInput(cmd, args, input, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: HOME, timeout });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(Object.assign(new Error(`exit ${code}`), { stderr: err }))));
    p.stdin.end(input);
  });
}
const errText = (e) => String(e?.stderr || e?.message || e).trim().split('\n').slice(-3).join(' ').slice(0, 300);
const hoursSince = (t) => (Date.now() - Date.parse(t)) / 3.6e6;
const ID = /^[A-Z]+-\d+$/;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Writes a file in the state folder, making the folder first.
const writeState = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

// --- machines ---------------------------------------------------------------------------------------------------

// Runs one of this folder's scripts on a queue machine: directly here, over ssh elsewhere. Arguments are checked by
// the callers to be letters, digits or a ticket id, so they pass through the remote shell unquoted.
const REMOTE_PATH = 'PATH=$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
// A path for the remote shell: a leading ~/ stays bare so that shell expands it, and the rest is quoted when it needs it.
const shq = (s) => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const remotePath = (p) => (p.startsWith('~/') ? `~/${shq(p.slice(2))}` : shq(p));
function onMachine(m, script, args = [], input = null) {
  const interp = script.endsWith('.py') ? 'python3' : 'node';
  if (m.host === HERE) {
    const argv = [path.join(DIR, script), ...args];
    return input == null ? run(interp === 'node' ? process.execPath : interp, argv) : runInput(interp, argv, input);
  }
  const ssh = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', m.ssh, `${REMOTE_PATH} ${interp} ${remotePath(`${REMOTE_ROOT}/queue-board/${script}`)} ${args.join(' ')}`];
  return input == null ? run('ssh', ssh) : runInput('ssh', ssh, input);
}

const lastGood = {};
async function collect(m) {
  try {
    const out = await onMachine(m, 'collect.mjs');
    lastGood[m.host] = { ...JSON.parse(out), fetchedAt: new Date().toISOString() };
    return { ...lastGood[m.host], name: m.name, root: m.root, ok: true };
  } catch (e) {
    return { ...(lastGood[m.host] ?? { host: m.host }), name: m.name, root: m.root, ok: false, error: errText(e) };
  }
}

// Codex and Grok plan usage from ext-usage.mjs on every machine. A reading starts both CLIs for a few seconds, so it
// runs in the background at most once an hour and the snapshot carries the last one. Machines signed in to the same
// account share a row; the machines can be signed in to different accounts. queueBoard.extUsage false turns it off.
const EXT_MS = 60 * 60_000;
const EXT_ON = qb.extUsage !== false;
const extUsage = {};
let extPending = null;
let extRead = !EXT_ON;
function refreshExt() {
  const due = EXT_ON ? MACHINES.filter((m) => !extUsage[m.host] || Date.now() - Date.parse(extUsage[m.host].tried) > EXT_MS) : [];
  if (!extPending && due.length) {
    extPending = Promise.all(due.map(async (m) => {
      const tried = new Date().toISOString();
      try {
        extUsage[m.host] = { ...JSON.parse(await onMachine(m, 'ext-usage.mjs')), tried };
      } catch (e) {
        extUsage[m.host] = { ...extUsage[m.host], tried, error: errText(e) };
      }
    })).finally(() => { extPending = null; extRead = true; });
  }
  return extPending;
}
// The saved usage of the Claude accounts the board only watches (collect.mjs's watched), refreshed by watch-usage.mjs on
// each machine that has one, every 15 minutes in the background. A refresh asks Anthropic for the windows and runs no model.
const WATCH_MS = 15 * 60_000;
const watchUsage = {};
let watchPending = null;
function refreshWatched() {
  const due = MACHINES.filter((m) => lastGood[m.host]?.watched?.length && (!watchUsage[m.host] || Date.now() - Date.parse(watchUsage[m.host].tried) > WATCH_MS));
  if (!watchPending && due.length) {
    watchPending = Promise.all(due.map(async (m) => {
      const tried = new Date().toISOString();
      try {
        watchUsage[m.host] = { ...JSON.parse(await onMachine(m, 'watch-usage.mjs')), tried };
      } catch (e) {
        watchUsage[m.host] = { tried, error: errText(e) };
      }
    })).finally(() => { watchPending = null; });
  }
}

function extRows() {
  const rows = new Map();
  for (const m of MACHINES) {
    const u = extUsage[m.host];
    if (u?.error && !u.services) rows.set(`run|${m.host}`, { name: 'Codex and Grok', machines: [m.name], error: u.error, at: u.tried });
    for (const s of u?.services ?? []) {
      const key = s.error ? `${s.name}|${m.host}` : `${s.name}|${s.account ?? `${s.plan}|${s.weekly?.resetsAt}`}`;
      const row = rows.get(key);
      if (!row) rows.set(key, { ...s, at: u.at, machines: [m.name] });
      else if (u.at > row.at) rows.set(key, { ...s, at: u.at, machines: [...row.machines, m.name] });
      else row.machines.push(m.name);
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || Boolean(a.error) - Boolean(b.error));
}

// Every machine's git worktrees (worktrees.mjs) and each branch's newest PR. A scan runs git status in every worktree
// (about 0.1s each, and a busy machine holds dozens), so it runs in the background at most every 10 minutes and the
// snapshot carries the last one.
const WT_MS = 10 * 60_000;
const wtScans = {};
let wtPrs = { prs: {}, errors: [] };
let wtPending = null;
let wtRead = false;
function refreshWorktrees() {
  const due = MACHINES.filter((m) => !wtScans[m.host] || Date.now() - Date.parse(wtScans[m.host].tried) > WT_MS);
  if (!wtPending && due.length) {
    wtPending = Promise.all(due.map(async (m) => {
      const tried = new Date().toISOString();
      try {
        wtScans[m.host] = { ...JSON.parse(await onMachine(m, 'worktrees.mjs')), tried };
      } catch (e) {
        wtScans[m.host] = { ...wtScans[m.host], tried, error: errText(e) };
      }
    }))
      .then(async () => { wtPrs = await branchPrs(gql, Object.values(wtScans)); })
      .finally(() => { wtPending = null; wtRead = true; });
  }
  return wtPending;
}

// Every machine's Claude app sessions (sessions.mjs), for the Sessions view: what each needs from the human. A scan
// takes about 0.3s, so it runs in the background at most once a minute and the snapshot carries the last one. A row the
// human marks handled stays hidden until its session does something new; the marks live here, keyed by machine and
// session, with the activity time they covered.
const SESS_MS = 60_000;
const HANDLED = path.join(STATE_DIR, 'queue-board-handled.json');
const sessScans = {};
let sessPending = null;
let sessRead = false;
let handled = {};
try { handled = JSON.parse(fs.readFileSync(HANDLED, 'utf8')); } catch { /* none marked yet */ }
function refreshSessions() {
  const due = MACHINES.filter((m) => !sessScans[m.host] || Date.now() - Date.parse(sessScans[m.host].tried) > SESS_MS);
  if (!sessPending && due.length) {
    sessPending = Promise.all(due.map(async (m) => {
      const tried = new Date().toISOString();
      try {
        sessScans[m.host] = { ...JSON.parse(await onMachine(m, 'sessions.mjs')), tried };
      } catch (e) {
        sessScans[m.host] = { ...sessScans[m.host], tried, error: errText(e) };
      }
    })).finally(() => { sessPending = null; sessRead = true; });
  }
  return sessPending;
}
const sessionsSnapshot = () => ({
  everyMinutes: SESS_MS / 60_000,
  handled,
  machines: MACHINES.filter((m) => !sessScans[m.host]?.none).map((m) => {
    const s = sessScans[m.host];
    return { host: m.host, name: m.name, at: s?.now ?? null, error: s?.error ?? null, older: s?.older ?? 0, days: s?.days ?? null, rows: s?.rows ?? null };
  }),
});
// Marks a session handled up to its latest activity, or clears the mark (at=0). Same header rule as /api/send.
async function markHandled(req, res, key, at) {
  if (req.headers['x-board'] !== 'handled') return send(res, 403, 'text/plain', 'missing header');
  if (!/^[\w-]+:local_[0-9a-f-]{36}$/.test(key ?? '') || !/^\d{1,15}$/.test(at ?? '')) return send(res, 400, 'text/plain', 'bad key or time');
  if (Number(at)) handled[key] = Number(at);
  else delete handled[key];
  writeState(HANDLED, JSON.stringify(handled));
  if (snap) snap = { ...snap, sessions: sessionsSnapshot() };
  return send(res, 200, 'application/json', JSON.stringify({ ok: true }));
}

// Sound (sound.mjs, sound.json): GET answers the settings, the cue names and the herald's last report (herald.mjs
// writes it; stale when the herald is not running here). POST with a JSON body changes the settings it names, every
// field checked; POST with ?test=<cue> plays that cue on this Mac at the set volume, muted or not, since the human
// clicked Test, after warning any page playing music the way the herald does. Same header rule as /api/send. One test
// plays at a time: a new one stops the last, by its PID.
let testing = null;
async function soundApi(req, res, test) {
  if (req.method === 'GET') return send(res, 200, 'application/json', JSON.stringify({ settings: readSettings(), cues: Object.keys(CUES), herald: readStatus() }));
  if (req.method !== 'POST') return send(res, 405, 'text/plain', 'GET or POST');
  if (req.headers['x-board'] !== 'sound' || !/^application\/json/.test(req.headers['content-type'] ?? '')) return send(res, 403, 'text/plain', 'missing header');
  if (test != null) {
    if (!Object.hasOwn(CUES, test)) return send(res, 400, 'application/json', JSON.stringify({ ok: false, error: `unknown cue ${test}` }));
    if (testing?.pid) { try { process.kill(testing.pid); } catch { /* already ended */ } }
    const child = await playAfterWarning(test, readSettings().volume, alertPages);
    // A test clicked during this one's warning started first; this one replaces it.
    if (testing?.pid) { try { process.kill(testing.pid); } catch { /* already ended */ } }
    testing = child;
    child.on('close', () => { if (testing === child) testing = null; });
    child.on('error', (e) => console.error(`${new Date().toISOString()} could not play ${test}: ${e.message}`));
    return send(res, 200, 'application/json', JSON.stringify({ ok: true, playing: test }));
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4000) return send(res, 413, 'text/plain', 'too long');
  }
  let next;
  try { next = applyUpdate(readSettings(), JSON.parse(body)); } catch (e) {
    return send(res, 400, 'application/json', JSON.stringify({ ok: false, error: e instanceof SyntaxError ? 'bad JSON' : e.message }));
  }
  writeSettings(next);
  return send(res, 200, 'application/json', JSON.stringify({ ok: true, settings: next, herald: readStatus() }));
}

// --- GitHub -----------------------------------------------------------------------------------------------------

let ghToken;
async function gql(query) {
  ghToken ??= await run('gh', ['auth', 'token', '--hostname', 'github.com', ...(cfg.github?.user ? ['--user', cfg.github.user] : [])]);
  const out = await run('gh', ['api', 'graphql', '-H', 'Accept: application/vnd.github.merge-info-preview+json', '-f', `query=${query}`],
    { env: { ...process.env, GH_TOKEN: ghToken } });
  return JSON.parse(out).data;
}

const PR_FIELDS = `number url title state isDraft mergeStateStatus updatedAt headRefName mergeQueueEntry{ state position }
  commits(last:1){ nodes{ commit{ oid committedDate statusCheckRollup{ state contexts(first:100){ nodes{ __typename
    ... on CheckRun{ name status conclusion title startedAt } ... on StatusContext{ context state } } } } } } }
  reviewThreads(first:100){ totalCount nodes{ isResolved } }`;

const PASS = ['SUCCESS', 'NEUTRAL', 'SKIPPED'];
const FAIL = ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'];
// The review's own checks (github.reviewCheck, and any other check queueBoard.reviewChecks matches, such as the jobs
// that run or re-request the review) are the review, which the snapshot reports as `review`. The CI lists leave them
// out, so "CI failing" and an orc on the map mean a CI job failed.
const REVIEW_CHECKS = qb.reviewChecks ? new RegExp(qb.reviewChecks) : null;
const isReviewCheck = (name) => name === REVIEW_CHECK || Boolean(REVIEW_CHECKS?.test(name));
// The review check can conclude FAILURE with one of these titles while the head has no review yet: after each push
// until a re-review is requested, or while CI is red. Such a failure reads as a missing review, so it puts no orc on a
// PR whose CI is running fine.
const REVIEW_NOT_STARTED = (qb.reviewNotStartedTitles ?? ['^Re-review not requested', '^Review not run', '^CI not green']).map((s) => new RegExp(s));
function shapePr(pr) {
  const commit = pr.commits.nodes[0]?.commit;
  const all = (commit?.statusCheckRollup?.contexts.nodes ?? []).map((c) => ({
    name: c.name ?? c.context,
    result: c.__typename === 'CheckRun' ? (c.status === 'COMPLETED' ? c.conclusion : 'RUNNING') : c.state,
    title: c.title ?? '',
    startedAt: c.startedAt ?? '',
  }));
  // A push and a PR edit seconds apart start two runs of a workflow that cancels its older run, and GitHub keeps both
  // on the commit. Only the newer one counts, as it does for GitHub's merge check, so a cancelled run beside another
  // run of the same check is dropped. Otherwise a PR reads as failing a check its newer run passed.
  const checks = all
    .filter((c) => !(c.result === 'CANCELLED' && all.some((o) => o !== c && o.name === c.name && o.result !== 'CANCELLED')))
    .map((c) => ({ ...c, result: PASS.includes(c.result) ? 'pass' : FAIL.includes(c.result) ? 'fail' : 'running' }));
  const ci = checks.filter((c) => !isReviewCheck(c.name));
  const ccr = REVIEW_CHECK ? checks.filter((c) => c.name === REVIEW_CHECK).sort((x, y) => y.startedAt.localeCompare(x.startedAt))[0] : null;
  return {
    number: pr.number,
    url: pr.url,
    title: pr.title,
    state: pr.state,
    draft: pr.isDraft,
    mergeState: pr.mergeStateStatus,
    updatedAt: pr.updatedAt,
    lastCommitAt: commit?.committedDate ?? null,
    ci: {
      overall: commit?.statusCheckRollup?.state ?? null,
      pass: ci.filter((c) => c.result === 'pass').length,
      fail: ci.filter((c) => c.result === 'fail').map((c) => c.name),
      running: ci.filter((c) => c.result === 'running').map((c) => c.name),
    },
    review: !REVIEW_CHECK ? null : !ccr || (ccr.result === 'fail' && REVIEW_NOT_STARTED.some((re) => re.test(ccr.title))) ? 'missing' : ccr.result,
    // The base branch's merge queue: a queued PR is in flight, landing once the queue's checks pass.
    mergeQueue: pr.mergeQueueEntry ? { state: pr.mergeQueueEntry.state, position: pr.mergeQueueEntry.position } : null,
    openThreads: pr.reviewThreads.nodes.filter((n) => !n.isResolved).length,
  };
}

async function prs(tickets) {
  const [owner, name] = REPO.split('/');
  const parts = tickets.map((t, i) => (t.prNumber
    ? `p${i}: pullRequest(number:${Number(t.prNumber)}){ ${PR_FIELDS} }`
    : `b${i}: pullRequests(headRefName:${JSON.stringify(t.branch)}, first:3, orderBy:{field:CREATED_AT, direction:DESC}){ nodes{ ${PR_FIELDS} } }
       r${i}: ref(qualifiedName:${JSON.stringify(`refs/heads/${t.branch}`)}){ target{ ... on Commit{ committedDate } } }`));
  if (!parts.length) return {};
  const data = await gql(`query{ repository(owner:${JSON.stringify(owner)}, name:${JSON.stringify(name)}){ ${parts.join('\n')} } }`);
  const repo = data.repository;
  const out = {};
  tickets.forEach((t, i) => {
    const pr = t.prNumber ? repo[`p${i}`] : repo[`b${i}`]?.nodes[0];
    out[t.id] = { pr: pr ? shapePr(pr) : null, branchCommitAt: repo[`r${i}`]?.target?.committedDate ?? null };
  });
  return out;
}

// --- Linear -----------------------------------------------------------------------------------------------------

let linearKey;
async function linear(query, variables = {}) {
  linearKey ??= readLinearKey(cfg);
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: linearKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json();
  if (body.errors) throw new Error(`Linear: ${body.errors[0].message}`);
  return body.data;
}

// The human's Linear inbox, read in the background at most every 20 minutes; the snapshot carries the last read.
const INBOX_MS = 20 * 60_000;
let inbox = null;
let inboxPending = null;
function refreshInbox() {
  if (!inboxPending && (!inbox || Date.now() - Date.parse(inbox.tried) > INBOX_MS)) {
    const tried = new Date().toISOString();
    inboxPending = readInbox(linear, cfg.linear?.workspace)
      .then((v) => { inbox = { ...v, tried, at: tried }; })
      .catch((e) => { inbox = { ...inbox, tried, error: errText(e) }; })
      .finally(() => { inboxPending = null; });
  }
  return inboxPending;
}

const titles = {}; // identifier -> { title, url, state }, kept for tickets that left the queue labels
// ask-human.sh opens each ask's comment with this mark, then the ask's type in bold.
const MARK = `**Needs ${HUMAN}:`;
async function queueIssues(extraIds) {
  const missing = extraIds.filter((id) => ID.test(id) && !titles[id]).slice(0, 40);
  const extra = missing.map((id, i) => `m${i}: issue(id:${JSON.stringify(id)}){ identifier title url state{ name } }`).join('\n');
  const data = await linear(`query($team:String!, $queue:[String!], $asked:String!){
    queue: issues(first:150, filter:{team:{key:{eq:$team}}, labels:{some:{name:{in:$queue}}},
      state:{type:{nin:["completed","canceled","duplicate"]}}}){ nodes{ identifier title url priority createdAt state{ name } labels{ nodes{ name } } } }
    asks: issues(first:50, filter:{labels:{some:{name:{eq:$asked}}}, state:{type:{nin:["completed","canceled"]}}}){
      nodes{ identifier title url comments(first:100){ nodes{ body createdAt } } } }
    ${extra}
  }`, { team: cfg.linear?.team, queue: [LABELS.ready, LABELS.building, LABELS.stuck], asked: LABELS.needsHuman });
  for (const n of data.queue.nodes) titles[n.identifier] = { title: n.title, url: n.url, state: n.state.name };
  missing.forEach((id, i) => {
    const n = data[`m${i}`];
    if (n) titles[id] = { title: n.title, url: n.url, state: n.state.name };
  });
  const field = (body, label) => body.match(new RegExp(`\\*\\*${label}:\\*\\* ([^\\n]*)`))?.[1] ?? null;
  const asks = data.asks.nodes.flatMap((n) => {
    const a = n.comments.nodes.filter((c) => c.body.startsWith(MARK)).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).at(-1);
    if (!a) return [];
    return [{
      id: n.identifier,
      title: n.title,
      url: n.url,
      type: a.body.match(new RegExp(`Needs ${reEsc(HUMAN)}: ([^*]+)\\*\\*`))?.[1]?.trim() ?? 'Ask',
      from: a.body.match(/\(from ([^)]*)\)/)?.[1] ?? null,
      question: field(a.body, 'Question'),
      blockedOn: field(a.body, 'Blocked on'),
      recommend: field(a.body, 'Recommend'),
      createdAt: a.createdAt,
    }];
  }).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const labeled = (l) => data.queue.nodes.filter((n) => n.labels.nodes.some((x) => x.name === l));
  return {
    asks,
    ready: labeled(LABELS.ready).map((n) => ({ id: n.identifier, title: n.title, url: n.url, priority: n.priority, createdAt: n.createdAt,
      sentry: n.labels.nodes.some((x) => x.name === LABELS.sentry) }))
      .sort((x, y) => (x.priority || 5) - (y.priority || 5) || x.createdAt.localeCompare(y.createdAt)),
    building: labeled(LABELS.building).map((n) => n.identifier),
    stuck: labeled(LABELS.stuck).map((n) => n.identifier),
  };
}

// --- snapshot ---------------------------------------------------------------------------------------------------

// A worker on another machine is attached over ssh. A non-interactive ssh shell has no ~/.local/bin on PATH, so
// claude is named by its full path there.
// remote: true gives the ssh form even for this machine's own workers, for a viewer on another machine.
const attachCmd = (t, m, { remote = false } = {}) => {
  const env = t.account === PRIMARY ? 'env -u CLAUDE_CONFIG_DIR' : `CLAUDE_CONFIG_DIR=~/.claude-${t.account}`;
  if (m.host === HERE && !remote) return `${env} claude attach ${t.workerId}`;
  const ssh = MACHINES.find((x) => x.host === m.host).ssh;
  return `ssh -t ${ssh} '${env} ~/.local/bin/claude attach ${t.workerId}'`;
};

// The newest "X: waiting on Y" line per ticket from the last hour of any machine's log.
function waitingOn(machines) {
  const out = {};
  for (const m of machines) {
    for (const line of m.log ?? []) {
      const hit = line.match(/^(\S+) ([A-Z]+-\d+): waiting on (.+)$/);
      if (hit && hoursSince(hit[1]) < 1 && (!out[hit[2]] || out[hit[2]].at < hit[1])) out[hit[2]] = { at: hit[1], on: hit[3] };
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.on]));
}

// Each machine's heartbeat ({at, paused, sentryRoom}), as the shared folder's sync delivered it here. The dispatchers
// read the same files: while a Sentry host's heartbeat is under sentryHeartbeatMinutes old and unpaused, the other
// machines leave Sentry tickets to its slot. sentryRoom is null from a dispatcher that does not write it, which counts as
// room. A missing or unreadable file is null, which the dispatchers read as offline.
// The Sentry hosts in the order a Sentry ticket goes down them, as the dispatcher reads them: every enabled host with a
// Sentry slot, in enabledHosts order.
function sentryOrder() {
  return (dc.enabledHosts ?? []).filter((h) => dc.hosts?.[h]?.sentryWorkers > 0);
}
function heartbeats() {
  return Object.fromEntries(MACHINES.map((m) => {
    try {
      const beat = JSON.parse(fs.readFileSync(path.join(SHARED, 'heartbeats', `${m.host}.json`), 'utf8'));
      return [m.host, { at: beat.at, paused: Boolean(beat.paused), sentryRoom: typeof beat.sentryRoom === 'boolean' ? beat.sentryRoom : null }];
    } catch {
      return [m.host, null];
    }
  }));
}

// Nicknames: the board shows each live worker under a Middle-earth name from the pools in queueBoard.nicknames, keyed by
// realm (rivendell, shire, erebor, rohan), or by host, with sentry for Sentry-slot workers, adhoc for workers some session
// started outside the queue (the wanderers), and other for a machine with no realm. A name the dispatcher already gave a
// ticket (its nickname) wins. A board-given name stays with its entry while the entry shows, and the least recently given
// free name goes out next. <stateDir>/queue-board-names.json keeps them across restarts.
const NAMES_FILE = path.join(STATE_DIR, 'queue-board-names.json');
const names = (() => {
  try { return JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')); } catch { return { given: {}, lastGiven: {} }; }
})();
function nameWorkers(tickets) {
  const pools = qb.nicknames;
  if (!pools) return;
  const key = (t) => `${t.host}/${t.id}`;
  const before = JSON.stringify(names);
  const shown = new Set(tickets.map(key));
  for (const k of Object.keys(names.given)) if (!shown.has(k)) delete names.given[k];
  const live = tickets.filter((t) => t.live).sort((a, b) => (a.dispatchedAt || '').localeCompare(b.dispatchedAt || ''));
  const taken = new Set(live.map((t) => t.nickname ?? names.given[key(t)]).filter(Boolean));
  for (const t of live) {
    if (t.nickname || names.given[key(t)]) continue;
    // A Codex or Grok worker takes its realm's names like any worker.
    const pool = (t.adhoc && pools.adhoc) || (t.sentry && pools.sentry) || pools[t.host] || pools[REALM_OF[t.host]] || pools.other;
    if (!pool?.length) continue;
    const free = pool.filter((n) => !taken.has(n)).sort((a, b) => (names.lastGiven[a] ?? '').localeCompare(names.lastGiven[b] ?? ''));
    // A pool with every name in use (more live workers than names) numbers its least recently given name.
    let name = free[0];
    for (let i = 2; !name; i++) name = pool.map((n) => `${n} ${i}`).find((n) => !taken.has(n));
    names.given[key(t)] = name;
    names.lastGiven[name] = new Date().toISOString();
    taken.add(name);
  }
  for (const t of tickets) t.nickname ??= names.given[key(t)] ?? null;
  if (JSON.stringify(names) === before) return;
  try {
    writeState(`${NAMES_FILE}.tmp`, JSON.stringify(names, null, 2));
    fs.renameSync(`${NAMES_FILE}.tmp`, NAMES_FILE);
  } catch (e) {
    console.error(`${new Date().toISOString()} could not save worker names: ${errText(e)}`);
  }
}

// The base branch's CI as the dispatcher's main-watch.mjs last saw it (within seconds of a red run or a recovery, and
// every few minutes as a backstop). Like the dispatchers, the board calls a missing, unreadable or over 15 minutes old
// file unknown. The Middle-earth view and horn.js read it.
function mainState() {
  const unknown = { status: 'unknown', since: null, sha: null, title: null, failing: [], error: null, run: null, updatedAt: null };
  try {
    const s = JSON.parse(fs.readFileSync(path.join(SHARED, 'main-state.json'), 'utf8'));
    if (!['red', 'green'].includes(s.status) || !(Date.now() - Date.parse(s.updatedAt) < 15 * 60_000)) return { ...unknown, updatedAt: s.updatedAt ?? null };
    if (s.status === 'green') return { ...unknown, status: 'green', sha: s.greenSha ?? null, updatedAt: s.updatedAt };
    return { status: 'red', since: s.redSince ?? null, sha: s.redSha ?? null, title: s.redTitle ?? null, failing: s.failing ?? [], error: s.error ?? null,
      run: s.latestRun ?? null, updatedAt: s.updatedAt };
  } catch {
    return unknown;
  }
}

async function build() {
  const ext = refreshExt();
  refreshWatched();
  const inboxRead = refreshInbox();
  const wt = refreshWorktrees();
  const sessions = refreshSessions();
  const machines = await Promise.all(MACHINES.map(collect));
  const tickets = [];
  for (const m of machines) {
    const all = m.state?.tickets ?? {};
    for (const [id, t] of Object.entries(all)) {
      // A bundle is one worker and one PR for a lead ticket and its companions. A companion's entry names its lead in
      // bundledInto and settles with it, so it shows on the lead's entry instead of its own.
      if (t.bundledInto && all[t.bundledInto]) continue;
      const when = t.mergedAt ?? t.stuckAt ?? t.closedAt ?? t.dispatchedAt ?? t.claimedAt;
      const live = LIVE.includes(t.status);
      if (!live && !(t.status === 'merged' && hoursSince(when) < 48) && !(['stuck', 'closed'].includes(t.status) && hoursSince(when) < 7 * 24)) continue;
      const w = m.workers?.find((x) => x.label === t.account && x.id === t.workerId);
      const acct = m.accounts?.find((a) => a.label === t.account);
      // Codex or Grok working the ticket on its own (engine-workers.mjs): no Claude session to attach to or read. A
      // dispatcher that runs no engine workers never sets driver 'engine', so this is null for every ticket then.
      const ew = engineWorker(t, id, m.engines, t.driver === 'engine' && fs.existsSync(path.join(SHARED, 'engine-contained', `${id}.json`)));
      const bundle = (t.bundle ?? []).map((cid) => ({ id: cid, status: all[cid]?.status ?? null }));
      tickets.push({
        id,
        ticket: id,
        label: [id, ...bundle.map((b) => b.id)].join(' + '),
        bundle,
        host: m.host,
        machine: m.name,
        live,
        status: t.status,
        // Dispatched into the machine's Sentry slot (hosts.<name>.sentryWorkers), apart from its regular slots.
        sentry: Boolean(t.sentry),
        // When its green PR started waiting on the reviewer, from a dispatcher that parks such a ticket; a parked ticket
        // holds no slot.
        parked: t.parked ?? null,
        // The worker's Middle-earth name from the dispatcher, if it gives one; nameWorkers fills the rest. A bundle's
        // companions show on their lead.
        nickname: t.nickname ?? null,
        // The engine that writes the code: for a Claude worker the builder it hands its writing to, and for an engine
        // worker (driver 'engine') the worker itself, with its round (1 the build, then one per fix).
        engine: ew ? ew.engine : t.engine ?? null,
        driver: ew ? 'engine' : null,
        contained: ew?.contained ?? false,
        round: ew?.round ?? null,
        workerName: ew?.workerName ?? null,
        question: ew?.question ?? null,
        account: t.account ?? null,
        accountEmail: ew ? null : acct?.email ?? null,
        accountPlan: ew ? null : acct?.plan ?? null,
        workerId: t.workerId ?? null,
        workerState: live ? (ew ? ew.workerState : w?.state ?? (m.ok ? 'gone' : 'unknown')) : null,
        attach: !ew && t.workerId ? attachCmd(t, m) : null,
        branch: t.branch,
        prNumber: t.prNumber ?? null,
        prUrl: t.pr ?? null,
        note: t.note ?? null,
        reason: t.reason ?? null,
        waiting: Boolean(t.waiting),
        claimedAt: t.claimedAt ?? null,
        dispatchedAt: t.dispatchedAt ?? null,
        lastProgressAt: t.lastProgressAt ?? null,
        lastOutputAt: t.lastOutputAt ?? null,
        stalledSince: t.stalledSince ?? null,
        blockedSince: t.blockedSince ?? ew?.blockedSince ?? null,
        mergedAt: t.mergedAt ?? null,
        stuckAt: t.stuckAt ?? null,
        closedAt: t.closedAt ?? null,
        effectErrors: t.effectErrors?.length ?? 0,
      });
    }
  }

  // Fleet workers some session started outside the queue, such as a rush ticket. Each gets an id no other entry uses,
  // so the session panel and Open in terminal reach exactly that worker; label is what the page shows.
  const used = new Set(tickets.map((t) => t.id));
  for (const m of machines) {
    for (const w of m.adhoc ?? []) {
      const base = w.ticket ?? w.name ?? w.id;
      const id = used.has(base) ? `${base}-${w.id}` : base;
      used.add(id);
      const acct = m.accounts?.find((a) => a.label === w.label);
      tickets.push({
        id,
        ticket: w.ticket,
        label: w.ticket ?? w.name ?? w.id,
        name: w.name,
        adhoc: true,
        host: m.host,
        machine: m.name,
        live: true,
        status: 'adhoc',
        account: w.label,
        accountEmail: acct?.email ?? null,
        accountPlan: acct?.plan ?? null,
        workerId: w.id,
        workerState: w.state,
        takesSlot: Boolean(w.takesSlot),
        attach: attachCmd({ account: w.label, workerId: w.id }, m),
        branch: w.branch,
        cwd: w.cwd,
        prNumber: null,
        dispatchedAt: w.startedAt,
        lastProgressAt: w.lastActivityAt,
        blockedSince: w.state === 'blocked' ? w.stateSince : null,
      });
    }
  }

  nameWorkers(tickets);
  const errors = {};
  const liveTickets = tickets.filter((t) => t.live && (t.prNumber || t.branch));
  // Live entries first: queueIssues looks up at most 40 unknown titles per snapshot.
  const ids = [...tickets.filter((t) => t.live), ...tickets.filter((t) => !t.live)].flatMap((t) => [t.ticket, ...(t.bundle ?? []).map((b) => b.id)]).filter(Boolean);
  const [gh, lin] = await Promise.allSettled([prs(liveTickets), queueIssues([...new Set(ids)])]);
  if (gh.status === 'fulfilled') {
    for (const t of liveTickets) Object.assign(t, gh.value[t.id] ?? {});
  } else errors.github = errText(gh.reason);
  if (lin.status === 'rejected') errors.linear = errText(lin.reason);
  const named = (id) => ({ title: titles[id]?.title ?? null, url: titles[id]?.url ?? null, linearState: titles[id]?.state ?? null });
  for (const t of tickets) {
    Object.assign(t, named(t.ticket));
    t.bundle = t.bundle?.map((b) => ({ ...b, ...named(b.id) }));
  }

  const waits = waitingOn(machines);
  const beats = heartbeats();
  const q = lin.status === 'fulfilled' ? lin.value : null;
  // Only the first snapshot waits for a Codex and Grok reading, an inbox read and a worktree scan; later ones show the last.
  if (!extRead) await ext;
  if (!inbox) await inboxRead;
  if (!wtRead) await wt;
  if (!sessRead) await sessions;
  return {
    generatedAt: new Date().toISOString(),
    servedBy: HERE,
    // The real weather at the owner's place (queueBoard.weather), for the Middle-earth view (weather.mjs); null until
    // the first answer.
    weather: weatherNow(),
    // The Codex and Grok calls running on this machine (ext-runs.mjs), for Saruman at his palantir.
    seer: extRuns(),
    // maxDispatchesPerDay null means no daily cap; the worker slots bound the queue then. The names, labels, realms and
    // the board's own host are for the page's own text and map.
    config: { maxConcurrent: dc.maxConcurrent, maxDispatchesPerDay: dc.maxDispatchesPerDay ?? null, stallHours: dc.stallHours, spinHours: dc.spinHours, headroomFloorPercent: dc.headroomFloorPercent, tickMinutes: TICK_MINUTES,
      sentryHeartbeatMinutes: dc.sentryHeartbeatMinutes ?? 45, sentryCascade: sentryOrder(), human: HUMAN, orchestrator: ORCHESTRATOR, reviewer: cfg.reviewer?.name ?? null,
      repo: REPO.split('/')[1] ?? REPO, boardHost: HERE, realms: REALMS, place: PLACE, repoDir: tilde(ROOT),
      addAccountScript: path.join(ROOT, 'fleet/setup/add-account.sh'), workspaceFolder: cfg.workspaceCwd ? path.basename(cfg.workspaceCwd) : null,
      labels: { ready: LABELS.ready, building: LABELS.building, stuck: LABELS.stuck, sentry: LABELS.sentry, needsHuman: LABELS.needsHuman } },
    machines: machines.map((m) => ({
      host: m.host,
      name: m.name,
      root: m.root,
      ok: m.ok,
      error: m.error ?? null,
      fetchedAt: m.fetchedAt ?? null,
      enabled: m.enabled ?? null,
      paused: m.paused ?? null,
      lastTick: m.state?.lastTick ?? null,
      lastError: m.state?.lastError ?? null,
      stuckStreak: m.state?.stuckStreak ?? 0,
      maxWorkers: m.maxWorkers ?? null,
      sentryWorkers: m.sentryWorkers ?? 0,
      engineAccounts: m.engineAccounts ?? [],
      heartbeat: beats[m.host],
      dispatchedToday: (m.state?.dispatches ?? []).filter((d) => hoursSince(d) < 24).length,
      maxDispatchesPerDay: m.maxDispatchesPerDay ?? dc.maxDispatchesPerDay ?? null,
      load: m.load ?? null,
      memFreePercent: m.memFreePercent ?? null,
      minMemFreePercent: m.minMemFreePercent ?? null,
      ramMb: m.ramMb ?? null,
      swapUsedMb: m.swapUsedMb ?? null,
      topMemory: m.topMemory ?? null,
      // The dispatcher's own sign-in check (fleet.sh accounts, each tick) marks an account signed out; the profile file
      // collect.mjs reads keeps the account's email after its login is gone, so it alone reads a lost login as signed in.
      accounts: (m.accounts ?? []).map((a) => (m.state?.signedOut?.[a.label] ? { ...a, signedIn: false, signedOutAt: m.state.signedOut[a.label] } : a)),
      signedOut: Object.keys(m.state?.signedOut ?? {}),
      // A watched account whose last refresh failed carries why, so the board can say its reading is going stale.
      watched: (m.watched ?? []).map((a) => {
        const u = watchUsage[m.host];
        const error = u?.error ?? u?.accounts?.[a.label]?.error;
        return error ? { ...a, refreshError: error } : a;
      }),
      log: (m.log ?? []).slice(-40),
      collectErrors: m.errors ?? [],
    })),
    services: extRows(),
    tickets,
    ready: q ? q.ready.map((r) => ({ ...r, waitingOn: waits[r.id] ?? null })) : null,
    asks: q?.asks ?? null,
    labeledBuilding: q?.building ?? null,
    labeledStuck: q?.stuck ?? null,
    inbox,
    worktrees: {
      repo: REPO.split('/')[1] ?? REPO,
      everyMinutes: WT_MS / 60_000,
      prErrors: wtPrs.errors,
      machines: MACHINES.map((m) => {
        const s = wtScans[m.host];
        const live = tickets.filter((t) => t.live && t.host === m.host);
        return { host: m.host, name: m.name, at: s?.now ?? null, error: s?.error ?? null, rows: s?.repos ? worktreeRows(s, wtPrs.prs, live) : null };
      }),
    },
    sessions: sessionsSnapshot(),
    main: mainState(),
    errors,
  };
}

let snap = null;
let pending = null;
function refresh() {
  if (!pending && (!snap || Date.now() - Date.parse(snap.generatedAt) > FRESH_MS)) {
    pending = build()
      .then((s) => { snap = s; })
      .catch((e) => { console.error(`${new Date().toISOString()} refresh failed: ${errText(e)}`); })
      .finally(() => { pending = null; });
  }
  return pending;
}

// --- server -----------------------------------------------------------------------------------------------------

// Opens a live worker's session in a new iTerm window on this Mac. Only a browser on this Mac gets the window (a
// click from another machine would open it out of sight), so any other caller gets the ssh command to copy instead.
// A browser here reaches the board from loopback or from one of the board's own addresses. Over the HTTPS address
// every request reaches the board from this machine, so the caller is read with callerOf (host-ok.mjs).
// The custom header makes a cross-origin page's request fail its CORS preflight, so only this page can trigger it.
// The command comes from the dispatcher's own state, and its two variable parts are checked before it runs.
let tailscaleIp = null;
async function openSession(req, res, id) {
  if (req.headers['x-board'] !== 'open') return send(res, 403, 'text/plain', 'missing header');
  const t = snap?.tickets.find((x) => x.id === id && x.live);
  if (!t || !/^[a-z]$/.test(t.account ?? '') || !/^[0-9a-f]{8}$/.test(t.workerId ?? '')) {
    return send(res, 404, 'application/json', JSON.stringify({ error: `no live worker for ${id}` }));
  }
  const from = caller(req);
  if (from !== '127.0.0.1' && from !== tailscaleIp && !BIND.includes(from)) {
    return send(res, 409, 'application/json', JSON.stringify({ cmd: attachCmd(t, t, { remote: true }) }));
  }
  const script = ['on run argv', 'tell application "iTerm"', 'activate', 'set w to (create window with default profile)',
    'tell current session of w to write text (item 1 of argv)', 'end tell', 'end run'];
  await run('osascript', [...script.flatMap((l) => ['-e', l]), attachCmd(t, t)], { timeout: 20_000 });
  return send(res, 200, 'application/json', JSON.stringify({ opened: true }));
}

// A live worker's session history, read from its transcript on its machine (history.mjs). Cached for a few seconds
// so several open pages don't each ssh in.
const histCache = {};
async function workerFor(id) {
  if (!snap) await refresh();
  // A bundle's companion opens its lead's worker.
  const t = snap?.tickets.find((x) => (x.id === id || x.bundle?.some((b) => b.id === id)) && x.workerId);
  if (!t || !/^[a-z]$/.test(t.account ?? '') || !/^[0-9a-f]{8}$/.test(t.workerId ?? '')) return null;
  const m = MACHINES.find((x) => x.host === t.host);
  return m ? { t, m } : null;
}
// A Claude app session (id app:<host>:<session id>, from the Sessions view) is read the same way: the app runs its
// sessions on the primary account, and its record names the transcript (cli).
function appSessionFor(id) {
  const [, host, sid] = String(id).match(/^app:([\w-]+):(local_[0-9a-f-]{36})$/) ?? [];
  const r = sessScans[host]?.rows?.find((x) => x.id === sid);
  const m = MACHINES.find((x) => x.host === host);
  return r && m && /^[0-9a-f]{8}/.test(r.cli ?? '') ? { t: { account: PRIMARY, workerId: r.cli.slice(0, 8) }, m } : null;
}
// A Codex or Grok queue worker has no Claude session; its runs are read from its machine instead (engine-history.mjs).
async function engineFor(id) {
  if (!snap) await refresh();
  const t = snap?.tickets.find((x) => (x.id === id || x.bundle?.some((b) => b.id === id)) && x.driver === 'engine');
  const m = t && /^[A-Z]+-\d+$/.test(t.id) && MACHINES.find((x) => x.host === t.host);
  return m ? { t, m } : null;
}
async function history(res, id, n) {
  const app = String(id).startsWith('app:');
  const w = app ? appSessionFor(id) : await workerFor(id);
  const e = !w && !app ? await engineFor(id) : null;
  if (!w && !e) return send(res, 404, 'application/json', JSON.stringify({ ok: false, error: `no session on record for ${id}` }));
  const count = Math.min(Math.max(Number(n) || 150, 1), 400);
  const key = `${id}/${w ? w.t.workerId : 'engine'}/${count}`;
  if (!histCache[key] || Date.now() - histCache[key].at > 8000) {
    const read = w ? onMachine(w.m, 'history.mjs', [w.t.account, w.t.workerId, String(count)]) : onMachine(e.m, 'engine-history.mjs', [e.t.id, String(count)]);
    histCache[key] = { at: Date.now(), p: read.then(JSON.parse) };
  }
  try {
    return send(res, 200, 'application/json', JSON.stringify(await histCache[key].p));
  } catch (e) {
    delete histCache[key];
    return send(res, 502, 'application/json', JSON.stringify({ ok: false, error: errText(e) }));
  }
}

// Types the human's message into a live worker's session (send.py, on the worker's machine). Same header rule as
// /api/open. One send at a time per worker, so two messages can't interleave in its input box.
const sending = new Set();
async function sendMessage(req, res, id) {
  if (req.headers['x-board'] !== 'send' || !/^application\/json/.test(req.headers['content-type'] ?? '')) return send(res, 403, 'text/plain', 'missing header');
  const w = await workerFor(id);
  if (!w || !w.t.live) return send(res, 404, 'application/json', JSON.stringify({ ok: false, error: `no live worker for ${id}` }));
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) return send(res, 413, 'text/plain', 'too long');
  }
  let text;
  try { text = String(JSON.parse(body).text ?? ''); } catch { return send(res, 400, 'text/plain', 'bad JSON'); }
  if (!text.trim()) return send(res, 400, 'application/json', JSON.stringify({ ok: false, error: 'empty message' }));
  const key = `${w.t.host}/${w.t.account}/${w.t.workerId}`;
  if (sending.has(key)) return send(res, 409, 'application/json', JSON.stringify({ ok: false, error: 'a message to this worker is still being sent' }));
  sending.add(key);
  try {
    const out = JSON.parse(await onMachine(w.m, 'send.py', [w.t.account, w.t.workerId], text));
    console.log(`${new Date().toISOString()} message to ${id} (${key}), ${text.length} chars: ${out.ok ? (out.delivered ? 'delivered' : 'queued') : out.error}`);
    for (const k of Object.keys(histCache)) if (k.startsWith(`${id}/`)) delete histCache[k];
    return send(res, out.ok ? 200 : 409, 'application/json', JSON.stringify(out));
  } catch (e) {
    return send(res, 502, 'application/json', JSON.stringify({ ok: false, error: errText(e) }));
  } finally {
    sending.delete(key);
  }
}

// Every route but /healthz answers only to the names this board is reached by (host-ok.mjs has the rule). A page on
// another site that points its own domain at this address (DNS rebinding) sends its own name, so it gets nothing.
// tsName is this machine's ts.net name: `tailscale serve` hands on HTTPS requests under it with no port.
const ME = HERE.toLowerCase();
// The addresses to listen on: literal addresses, and "tailscale" for this machine's Tailscale address. Keep the board
// off the LAN: anyone who can reach it can type into a worker's session.
const BIND = qb.bind ?? ['127.0.0.1'];
const TAILSCALE = BIND.includes('tailscale');
let tsName = null;
const hostOk = (req) => hostAllowed(req.headers.host, { port: PORT, me: ME, bind: BIND, tailscaleIp, tsName });
// Who sent a request: its socket's address, or the one the HTTPS proxy names when it comes from this machine itself.
const caller = (req) => callerOf(req, { port: PORT, own: [tailscaleIp, ...BIND] });

// In the order page.html loads them, so a test page built from this list loads them the same way.
const PAGE_SCRIPTS = ['/mobile.js', '/ai-marks.js', '/session.js', '/inbox.js', '/worktrees.js', '/gollum-data.js', '/sessions.js', '/sprites.js', '/sprites-gear.js', '/sprites-gear-stations.js', '/sprites-hd.js', '/sprites-hd-folk.js', '/sprites-qd.js', '/sprites-wanderers.js', '/sprites-wanderers-folk.js', '/sprites-wanderers-gear.js', '/sprites-captains.js', '/sprites-work.js', '/sprites-horse.js', '/sprites-horse-art.js', '/sprites-horse-post.js', '/sprites-chores.js', '/sprites-rohan.js', '/realm-art-kit.js', '/realm-art.js', '/machines-accounts.js', '/machines.js', '/gollum-view.js', '/scenery-sun.js', '/scenery.js', '/scenery-qd.js', '/scenery-sky.js', '/scenery-sky-qd.js', '/scenery-land.js', '/scenery-land-qd.js', '/scenery-rohan.js', '/scenery-rohan-stables.js', '/scenery-falls.js', '/scenery-erebor.js', '/scenery-lights.js', '/scenery-props.js', '/scenery-props-hd.js', '/scenery-props-qd.js', '/scenery-farm.js', '/scenery-rohan-props.js', '/scenery-hoard.js', '/scenery-elves.js', '/scenery-heal.js', '/scenery-shire.js', '/scene-tags.js', '/scene.js', '/scene-path.js', '/scene-weather.js', '/scene-weather-fall.js', '/scenery-weather.js', '/scenery-storm.js', '/scenery-snow.js', '/scene-wind.js', '/scene-glow.js', '/scene-work.js', '/scene-jobs.js', '/scene-farm.js', '/scene-hoard.js', '/scene-elves.js', '/scene-wild.js', '/scene-rohan.js', '/scene-rohan-horses.js', '/scene-duel.js', '/scene-orcs.js', '/scene-ride.js', '/scene-tower.js', '/scene-call.js', '/scene-call-light.js', '/sprites-eagle.js', '/sprites-eagle-fly.js', '/scene-eagle.js', '/sprites-gollum.js', '/scene-gollum.js', '/scene-gollum-tag.js', '/sprites-saruman.js', '/sprites-saruman-stone.js', '/scene-saruman.js', '/scene2.js', '/scene2-plan.js', '/scene2-plan-realms.js', '/scene2-core-places.js', '/scene2-plan-south.js', '/scene2-tiles.js', '/scene2-build.js', '/scene2-trees.js', '/scene2-rivendell.js', '/scene2-rivendell-trees.js', '/scene2-rivendell-house.js', '/scene2-rivendell-garden.js', '/scene2-shire.js', '/scene2-shire-hill.js', '/scene2-shire-holes.js', '/scene2-shire-oak.js', '/scene2-shire-props.js', '/scene2-shire-pen.js', '/scene2-shire-mill.js', '/scene2-shire-front.js', '/scene2-shire-fill.js', '/scene2-erebor.js', '/scene2-erebor-gate.js', '/scene2-erebor-river.js', '/scene2-erebor-works.js', '/scene2-erebor-yard.js', '/scene2-rohan.js', '/scene2-edoras.js', '/scene2-edoras-stable.js', '/scene2-edoras-gondor.js', '/scene2-stations.js', '/scene2-station-art.js', '/scene2-rohan-shield.js', '/scene2-elf.js', '/scene2-folk.js', '/scene2-body-kit.js', '/scene2-body-parts.js', '/scene2-body-head.js', '/scene2-tool.js', '/scene2-body-elf.js', '/scene2-body-man.js', '/scene2-body-hobbit.js', '/scene2-body-dwarf.js', '/scene2-body-wizard.js', '/scene2-body-captains.js', '/scene2-body-ent.js', '/scene2-body-wild.js', '/scene2-body-v1.js', '/scene2-move.js', '/scene2-path.js', '/scene2-life-fx.js', '/scene2-jobs.js', '/scene2-life.js', '/scene2-life-road.js', '/scene2-haul.js', '/scene2-haul-jobs.js', '/scene2-stock.js', '/scene2-stock-art.js', '/scene2-chores.js', '/scene2-rohan-banner.js', '/scene2-archery.js', '/scene2-life-beasts.js', '/scene2-horse-art.js', '/scene2-horse.js', '/scene2-rider.js', '/scene2-rider-draw.js', '/scene2-rider-v1.js', '/scene2-fx.js', '/scene2-orc-art.js', '/scene2-orc-body.js', '/scene2-duel.js', '/scene2-orcs.js', '/scene2-orc-draw.js', '/scene2-war.js', '/scene2-rider-fight.js', '/scene2-rider-bug.js', '/scene2-life-deer.js', '/scene2-eye.js', '/scene2-eagle-art.js', '/scene2-call.js', '/scene2-eagle.js', '/scene2-call-bar.js', '/scene2-gollum-art.js', '/scene2-gollum.js', '/scene2-gollum-lairs.js', '/scene2-foes-v1.js', '/scene2-saruman.js', '/scene2-weather.js', '/scene2-wind.js', '/scene2-weather-fall.js', '/scene2-glow.js', '/scene2-tags.js', '/scene2-notes.js', '/scene2-mist.js', '/scene2-fireworks.js', '/scene2-saruman-tag.js', '/scene2-lands.js', '/scene2-land-peaks.js', '/scene2-land-peaks-draw.js', '/scene2-places.js', '/scene2-land-eriador.js', '/scene2-land-eriador-bree.js', '/scene2-land-eriador-trolls.js', '/scene2-land-eriador-willow.js', '/scene2-land-vale.js', '/scene2-land-vale-beorn.js', '/scene2-land-vale-wild.js', '/scene2-land-lake.js', '/scene2-land-lake-town.js', '/scene2-moria.js', '/scene2-moria-east.js', '/scene2-lorien.js', '/scene2-world.js', '/scene2-gondor.js', '/scene2-mordor.js', '/scene2-mordor-gate.js', '/scene2-mordor-doom.js', '/scene2-helm.js', '/scene2-helm-caves.js', '/scene2-isengard-orthanc.js', '/scene2-isengard.js', '/scene2-gondor-city.js', '/scene2-gondor-citybuild.js', '/scene2-gondor-osgiliath.js', '/scene2-gondor-fields.js', '/scene2-gondor-river.js', '/scene2-gondor-sea.js', '/scene2-gondor-ithilien.js', '/horn.js', '/sound-ui.js', '/music.js', '/music-duck.js'];
// What makes the board installable as an app: the manifest, the service worker and the icons, each by exact path.
const APP_FILES = {
  '/manifest.webmanifest': 'application/manifest+json',
  '/sw.js': 'text/javascript; charset=utf-8',
  '/mobile.css': 'text/css; charset=utf-8',
  '/mobile-views.css': 'text/css; charset=utf-8',
  '/icons/icon.svg': 'image/svg+xml',
  '/icons/icon-192.png': 'image/png',
  '/icons/icon-512.png': 'image/png',
  '/icons/maskable-512.png': 'image/png',
  '/icons/apple-touch-icon.png': 'image/png',
};
async function handle(req, res) {
  const url = new URL(req.url, 'http://board');
  if (url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok');
  if (!hostOk(req)) return send(res, 421, 'text/plain', 'unknown host');
  if (req.method === 'POST' && url.pathname === '/api/open') return openSession(req, res, url.searchParams.get('id'));
  if (req.method === 'POST' && url.pathname === '/api/send') return sendMessage(req, res, url.searchParams.get('id'));
  if (req.method === 'POST' && url.pathname === '/api/alert') return musicAlert(req, res, caller(req));
  if (req.method === 'POST' && url.pathname === '/api/handled') return markHandled(req, res, url.searchParams.get('key'), url.searchParams.get('at'));
  if (url.pathname === '/api/sound') return soundApi(req, res, url.searchParams.get('test'));
  if (req.method !== 'GET') return send(res, 405, 'text/plain', 'GET only');
  if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(DIR, 'page.html')));
  // The map from above (v2) grows by many small files while it is built, so any scene2-*.js in this folder is served
  // without a restart; page.html still decides which ones load.
  const map2 = /^\/scene2-[a-z0-9-]+\.js$/.test(url.pathname) && fs.existsSync(path.join(DIR, url.pathname.slice(1)));
  if (PAGE_SCRIPTS.includes(url.pathname) || map2) return send(res, 200, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(DIR, url.pathname.slice(1))));
  if (Object.hasOwn(APP_FILES, url.pathname)) return send(res, 200, APP_FILES[url.pathname], fs.readFileSync(path.join(DIR, url.pathname.slice(1))));
  if (url.pathname === '/api/history') return history(res, url.searchParams.get('id'), url.searchParams.get('n'));
  // The owner's own MP3s for the header player (music.mjs, from the folder in config): the list, one file by its id,
  // and the alert warnings.
  if (url.pathname === '/api/events') return musicEvents(req, res);
  if (url.pathname === '/api/music') return send(res, 200, 'application/json', JSON.stringify(musicList()));
  if (url.pathname.startsWith('/music/')) return musicFile(req, res, url.pathname.slice('/music/'.length));
  if (url.pathname === '/api/snapshot') {
    if (!snap) await refresh();
    else refresh();
    if (!snap) return send(res, 503, 'application/json', JSON.stringify({ error: 'the first snapshot failed; see the board log' }));
    return send(res, 200, 'application/json', JSON.stringify({ ...snap, refreshing: Boolean(pending) }));
  }
  return send(res, 404, 'text/plain', 'not found');
}
function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function listen(address) {
  const server = http.createServer((req, res) => handle(req, res).catch((e) => send(res, 500, 'text/plain', errText(e))));
  server.on('error', (e) => console.error(`${new Date().toISOString()} ${address}:${PORT} ${e.message}`));
  server.listen(PORT, address, () => console.log(`${new Date().toISOString()} listening on http://${address}:${PORT}`));
}

// Each literal address at once; the Tailscale address once Tailscale is up, checked every minute until it is.
for (const address of BIND) if (address !== 'tailscale') listen(address);
async function listenTailscale() {
  try {
    const ip = (await run('tailscale', ['ip', '-4'], { timeout: 10_000 })).split('\n')[0];
    if (!/^100\./.test(ip)) throw new Error(`unexpected address ${ip}`);
    tailscaleIp = ip;
    listen(ip);
  } catch (e) {
    console.error(`${new Date().toISOString()} no Tailscale address yet (${errText(e)}), trying again in a minute`);
    setTimeout(listenTailscale, 60_000);
  }
}
// The HTTPS name comes from Tailscale too. It is there once the tailnet has HTTPS on, so a miss is asked again: in a
// minute while Tailscale is down, every ten once it answers without one.
async function readTsName() {
  let up = false;
  try {
    tsName = certName(JSON.parse(await run('tailscale', ['status', '--json'], { timeout: 10_000 })));
    up = true;
  } catch { /* Tailscale is not up yet */ }
  if (!tsName) setTimeout(readTsName, up ? 600_000 : 60_000);
}
if (TAILSCALE) { listenTailscale(); readTsName(); }
