#!/usr/bin/env node
// pr-sweep.mjs: every few hours, looks at every open, non-draft PR in github.repo and says who owns it and what it
// needs, so no PR sits behind with nobody working on it.
//
// Usage: pr-sweep.mjs --now                      sweep now, print the whole report, record the run
//        pr-sweep.mjs --watch [--every-hours N]   wait until the next sweep is due (orchestrator.prSweep.everyHours after
//                                                 the last), sweep; exit 0 with the report when a PR needs attention,
//                                                 keep waiting while all are OK, exit 2 after 24 quiet hours
//        pr-sweep.mjs own <pr> "<note>" [--owner <name>]   the orchestrator is driving <pr> (an agent, a merge, a wait)
//        pr-sweep.mjs release <pr>                          it no longer is
//        pr-sweep.mjs owners                                list the claims
//
// A PR's owners: a board ticket whose worker is live and working or busy; a board ticket the dispatcher holds
// (building, merge-asked, bundled) with progress under staleHours old, whatever its worker reads, since engine rounds
// read done or failed between rounds; a claim younger than ownerTtlHours; the merge queue holding it.
// Buckets: APPROVED BUT NOT MOVING (current head approved, not queued, idle approvedIdleHours+), NO OWNER, OWNED BUT
// STALE (idle staleHours+), else OK. Idle is the time since the newest of: PR update, push, check run, queue add or
// removal. PRs by reportOnlyAuthors are listed apart and never counted.
//
// Checks are read for the head the PR has now: a rollup read before a push is treated as still running, and a required
// check that has not reported yet counts as pending, so neither reads as ready.
// State in paths.sharedDir: pr-owners.json (claims) and pr-sweep-state.json (last run). Writes are tmp file + rename.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { policyFor } from './merge-policy.mjs';
import { boardUrl, orchestratorPaths, holder } from './orchestrator.mjs';

const H = 3.6e6;
const LIVE_STATES = new Set(['working', 'busy']);
const DISPATCHER_STATUSES = new Set(['building', 'merge-asked', 'bundled']);
const FAIL = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
const PENDING = new Set(['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED']);

// settings(cfg): everything a sweep reads from the config.
export function settings(cfg) {
  const s = cfg.orchestrator?.prSweep ?? {};
  const policy = policyFor(cfg, cfg.github.repo);
  return {
    repo: cfg.github.repo,
    base: cfg.github.baseBranch ?? 'main',
    human: cfg.human?.name ?? 'the human',
    reviewChecks: policy.reviewChecks,
    supportChecks: policy.reviewSupportChecks,
    fallbackRequired: policy.requiredChecks,
    everyHours: Number(s.everyHours ?? 6),
    ownerTtlH: Number(s.ownerTtlHours ?? 12),
    approvedIdleH: Number(s.approvedIdleHours ?? 2),
    staleH: Number(s.staleHours ?? 6),
    reportOnly: (s.reportOnlyAuthors ?? ['app/dependabot']).map((a) => a.toLowerCase()),
    ignoreActivity: (s.ignoreActivityChecks ?? []).map((r) => new RegExp(r)),
    owners: path.join(cfg.paths.sharedDir, 'pr-owners.json'),
    state: path.join(cfg.paths.sharedDir, 'pr-sweep-state.json'),
    approvals: cfg.orchestrator?.approvalsFile || path.join(cfg.paths.sharedDir, 'approvals.jsonl'),
    mergeRequests: path.join(cfg.paths.sharedDir, 'merge-requests'),
    board: boardUrl(cfg),
  };
}

const iso = (t) => new Date(t).toISOString();
const sha8 = (s) => String(s ?? '').slice(0, 8);
const hrs = (h) => (h === Infinity ? 'never' : `${h.toFixed(1)}h`);
// gh reports a check that has not finished with a zero time (0001-01-01), which must read as no time.
const ms = (s) => { const t = s ? Date.parse(s) : 0; return t > 0 ? t : 0; };

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// ---- claims: [{ pr, owner, since, note }] --------------------------------------------------------------------------
export function loadOwners(file) {
  const d = readJson(file, []);
  return Array.isArray(d) ? d.filter((e) => e && Number.isInteger(e.pr)) : [];
}

export function own(file, pr, note, owner, now = Date.now()) {
  const list = loadOwners(file).filter((e) => e.pr !== pr);
  list.push({ pr, owner, since: iso(now), note: note ?? '' });
  list.sort((a, b) => a.pr - b.pr);
  writeJsonAtomic(file, list);
}

export function release(file, pr) {
  const before = loadOwners(file);
  const after = before.filter((e) => e.pr !== pr);
  writeJsonAtomic(file, after);
  return before.length - after.length;
}

// ---- approvals of github.repo by PR, from the ledger merge-approved.sh writes -------------------------------------
export function parseApprovals(text, repo) {
  const byPr = new Map();
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.repo && r.repo !== repo) continue;
    if (r.event || !Number.isInteger(r.pr) || typeof r.head !== 'string') continue;
    if (!byPr.has(r.pr)) byPr.set(r.pr, []);
    byPr.get(r.pr).push({ head: r.head, at: r.approvedAt ?? r.at ?? null });
  }
  return byPr;
}

// ---- checks on the head ------------------------------------------------------------------------------------------
// The review is read from s.reviewChecks: success when any passed, failure when one failed and none passed, missing
// when none reported.
export function readChecks(rollup, required, s) {
  const latest = new Map();
  for (const c of rollup ?? []) {
    const name = c.name ?? c.context;
    if (!name) continue;
    const result = c.__typename === 'StatusContext' ? c.state : c.status === 'COMPLETED' ? c.conclusion : 'PENDING';
    // A run that has not finished, or has no time, ranks newer than any finished one, so a queued re-run is never
    // hidden behind yesterday's pass.
    const t = (PENDING.has(result) ? 0 : ms(c.completedAt) || ms(c.startedAt)) || Infinity;
    const prev = latest.get(name);
    if (!prev || t >= prev.t) latest.set(name, { name, result, t });
  }
  const isReview = (n) => s.reviewChecks.includes(n);
  const reviews = s.reviewChecks.map((n) => latest.get(n)).filter(Boolean);
  const verdict = !s.reviewChecks.length ? 'success'
    : reviews.some((c) => c.result === 'SUCCESS') ? 'success'
      : reviews.some((c) => FAIL.has(c.result)) ? 'failure'
        : reviews.length ? 'pending' : 'missing';
  const req = new Set(required);
  const failing = [];
  const failingOther = [];
  const pending = [];
  let lastCheckAt = 0;
  for (const name of req) if (!isReview(name) && !latest.has(name)) pending.push(name);
  for (const c of latest.values()) {
    if (!s.ignoreActivity.some((rx) => rx.test(c.name)) && c.t !== Infinity) lastCheckAt = Math.max(lastCheckAt, c.t);
    if (isReview(c.name) || s.supportChecks.includes(c.name)) continue;
    if (FAIL.has(c.result)) (req.has(c.name) ? failing : failingOther).push(c.name);
    else if (PENDING.has(c.result)) pending.push(c.name);
  }
  return { failing, failingOther, pending, verdict, lastCheckAt };
}

// ---- reads -------------------------------------------------------------------------------------------------------
const PR_FIELDS = `number mergeable mergeStateStatus headRefOid
  mergeQueueEntry{state position enqueuedAt}
  reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved}}
  commits(last:1){nodes{commit{committedDate}}}
  pushes: timelineItems(itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT], last:1){nodes{... on HeadRefForcePushedEvent{createdAt}}}
  ejections: timelineItems(itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT], last:10){nodes{... on RemovedFromMergeQueueEvent{createdAt reason}}}
  queued: timelineItems(itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT], last:1){nodes{... on AddedToMergeQueueEvent{createdAt}}}`;

export function detailsQuery(repo, numbers) {
  const [owner, name] = repo.split('/');
  return `query{repository(owner:"${owner}",name:"${name}"){${numbers.map((n) => `p${n}: pullRequest(number:${n}){${PR_FIELDS}}`).join(' ')}}}`;
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }));
}

const fetchBoard = (url) => async () => {
  const res = await fetch(url, { headers: { 'x-board': 'read' }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`board answered ${res.status}`);
  return res.json();
};

function loadMergeRequests(dir, repo) {
  const byPr = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return byPr; }
  for (const f of files) {
    const r = readJson(path.join(dir, f), null);
    if (r && Number.isInteger(r.pr) && (!r.url || r.url.includes(`/${repo}/`))) byPr.set(r.pr, r);
  }
  return byPr;
}

const reportOnly = (pr, s) => s.reportOnly.includes(String(pr.author?.login ?? '').toLowerCase());

// collect(s, { gh, board }): everything one sweep needs. gh and board are injectable for tests.
export async function collect(s, { gh = ghJson, board = fetchBoard(s.board) } = {}) {
  const prs = gh(['pr', 'list', '--repo', s.repo, '--state', 'open', '--limit', '200', '--json',
    'number,title,author,isDraft,headRefOid,mergeStateStatus,statusCheckRollup,updatedAt,url']);
  const notes = [];
  let required = s.fallbackRequired;
  try {
    const rules = gh(['api', `repos/${s.repo}/rules/branches/${s.base}`]);
    const ctx = rules.filter((r) => r.type === 'required_status_checks').flatMap((r) => r.parameters?.required_status_checks ?? []).map((c) => c.context);
    if (ctx.length) required = ctx;
  } catch {
    notes.push(`couldn't read ${s.base}'s required checks; used merge.requiredChecks`);
  }
  const mine = prs.filter((pr) => !pr.isDraft && !reportOnly(pr, s)).map((pr) => pr.number);
  const details = new Map();
  for (let i = 0; i < mine.length; i += 20) {
    const res = gh(['api', 'graphql', '-f', `query=${detailsQuery(s.repo, mine.slice(i, i + 20))}`]);
    for (const d of Object.values(res?.data?.repository ?? {})) if (d?.number) details.set(d.number, d);
  }
  let snapshot = null;
  try {
    snapshot = await board();
  } catch (e) {
    notes.push(`the queue board isn't answering (${String(e.message).slice(0, 120)}), so no worker counts as an owner`);
  }
  let approvalsText = '';
  try { approvalsText = fs.readFileSync(s.approvals, 'utf8'); } catch { /* none yet */ }
  return { prs, details, required, snapshot, notes, owners: loadOwners(s.owners), approvals: parseApprovals(approvalsText, s.repo), mergeRequests: loadMergeRequests(s.mergeRequests, s.repo) };
}

// ---- classification ----------------------------------------------------------------------------------------------
function boardEntries(snapshot, n, repo) {
  const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : Object.values(snapshot?.tickets ?? {});
  return tickets.filter((t) => (t.prNumber ?? t.pr?.number) === n && t.status !== 'merged' && (!t.prUrl || t.prUrl.includes(`/${repo}/`)));
}

function workerName(t) {
  const who = t.engine ? `${t.engine} worker` : `worker ${t.account ?? '?'}/${t.workerId ?? '?'}`;
  return `${who} on ${t.host ?? t.machine} (${t.id})`;
}

export function classifyPr(pr, ctx, now, s) {
  const { details, required, snapshot, owners, approvals, mergeRequests } = ctx;
  // A PR the detail read did not return is unknown, and unknown is never ready.
  const unread = !details.has(pr.number);
  const d = details.get(pr.number) ?? {};
  const head = d.headRefOid ?? pr.headRefOid;
  const state = d.mergeStateStatus && d.mergeStateStatus !== 'UNKNOWN' ? d.mergeStateStatus : pr.mergeStateStatus ?? 'UNKNOWN';
  // The rollup comes from the list read and the head from the later GraphQL read. After a push between the two, the
  // rollup describes the old commit, so it says nothing about this head.
  const checks = pr.headRefOid && d.headRefOid && pr.headRefOid !== d.headRefOid
    ? { failing: [], failingOther: [], pending: ['checks for the new head'], verdict: 'pending', lastCheckAt: 0 }
    : readChecks(pr.statusCheckRollup, required, s);
  const threads = d.reviewThreads?.pageInfo?.hasNextPage ? Infinity : (d.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length;
  const inQueue = !!d.mergeQueueEntry;
  const lastPush = Math.max(ms(d.commits?.nodes?.[0]?.commit?.committedDate), ms(d.pushes?.nodes?.[0]?.createdAt));
  const ejections = (d.ejections?.nodes ?? []).filter((e) => e?.createdAt);
  const lastEject = ejections.at(-1);
  const activity = Math.max(ms(pr.updatedAt), lastPush, checks.lastCheckAt, ms(d.queued?.nodes?.[0]?.createdAt), ms(lastEject?.createdAt));
  const idleH = activity ? (now - activity) / H : Infinity;
  const pushH = lastPush ? (now - lastPush) / H : Infinity;
  const approved = approvals.get(pr.number) ?? [];
  const approvedCurrent = approved.some((a) => a.head === head);
  const lastApproved = approved.at(-1);
  const idRx = new RegExp(`\\b[A-Z][A-Z0-9]+-\\d+\\b`);
  const ticket = (pr.title.match(idRx) ?? [])[0] ?? mergeRequests.get(pr.number)?.id ?? boardEntries(snapshot, pr.number, s.repo)[0]?.id ?? '';

  const ownerList = [];
  const staleOwners = [];
  const hints = [];
  const seen = new Set();
  for (const t of boardEntries(snapshot, pr.number, s.repo)) {
    const key = `${t.host ?? t.machine}:${t.id}:${t.workerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (t.live && LIVE_STATES.has(t.workerState)) ownerList.push(`${workerName(t)} ${t.workerState}`);
    else if (DISPATCHER_STATUSES.has(t.status)) {
      const progressH = (now - ms(t.lastProgressAt ?? t.lastOutputAt ?? t.dispatchedAt ?? t.claimedAt)) / H;
      const who = `dispatcher on ${t.host ?? t.machine} (${t.id} ${t.status}, worker ${t.workerState ?? 'none'}, progress ${hrs(progressH)} ago)`;
      (progressH < s.staleH ? ownerList : staleOwners).push({ who, progressH });
    } else if (t.live && t.workerState === 'idle') hints.push({ kind: 'idle', waiting: Boolean(t.waiting), text: `${workerName(t)} is idle${t.waiting ? `, waiting on ${s.human}` : ''}`, t });
    else if (t.live) hints.push({ kind: 'ended', text: `${workerName(t)} ended (${t.workerState ?? 'unknown'})`, t });
    else if (t.status === 'stuck') hints.push({ kind: 'stuck', text: `${t.id} stuck on ${t.host ?? t.machine}`, t });
  }
  let claimH = Infinity; // a fresh claim resets the staleness clock
  for (const e of owners.filter((o) => o.pr === pr.number)) {
    const ageH = (now - ms(e.since)) / H;
    if (ms(e.since) && ageH < s.ownerTtlH) {
      ownerList.push(`${e.owner}: ${e.note} (claimed ${hrs(ageH)} ago)`);
      claimH = Math.min(claimH, Math.max(0, ageH));
    } else hints.push({ kind: 'stale-owner', text: `claim "${e.owner}: ${e.note}" is ${hrs(ageH)} old`, e });
  }
  if (inQueue) ownerList.push(`merge queue (${String(d.mergeQueueEntry.state ?? '').toLowerCase()}, position ${d.mergeQueueEntry.position ?? '?'})`);

  let bucket = 'OK';
  let staleFor = Math.min(idleH, claimH);
  if (approvedCurrent && !inQueue && idleH >= s.approvedIdleH) bucket = 'APPROVED BUT NOT MOVING';
  else if (!ownerList.length && !staleOwners.length) bucket = 'NO OWNER';
  else if (!ownerList.length) {
    bucket = 'OWNED BUT STALE';
    staleFor = Math.min(...staleOwners.map((o) => o.progressH));
  } else if (staleFor >= s.staleH) bucket = 'OWNED BUT STALE';

  const ownerNames = [...ownerList, ...staleOwners].map((o) => (typeof o === 'string' ? o : o.who));
  const row = { number: pr.number, title: pr.title, ticket, state, head, checks, threads, unread, inQueue, ejections, lastEject, approvedCurrent, lastApproved, idleH, pushH, staleFor, owners: ownerNames, hints, bucket };
  row.actions = bucket === 'OK' ? [] : actionsFor(row, mergeRequests.get(pr.number), now, s);
  return row;
}

export function actionsFor(r, mergeRequest, now, s) {
  const a = [];
  const review = s.reviewChecks.join(' or ') || 'the review';
  if (r.state === 'DIRTY') a.push(r.approvedCurrent ? `merge main and re-queue (approved head was ${sha8(r.head)})` : 'merge main to clear the conflict');
  if (!r.inQueue && r.ejections.length) a.push(`ejected from the merge queue ${r.ejections.length}x, last for ${r.lastEject.reason ?? '?'} ${hrs((now - ms(r.lastEject.createdAt)) / H)} ago`);
  if (r.checks.failing.length) a.push(`fix failing check ${r.checks.failing.slice(0, 4).join(', ')}`);
  if (r.checks.verdict === 'failure') a.push(`address the review findings (${review} failed on this head)`);
  if (r.unread) a.push('its details could not be read (gh): check it by hand');
  if (r.threads === Infinity) a.push('over 100 review threads: check them by hand');
  else if (r.threads) a.push(`answer ${r.threads} unresolved thread${r.threads === 1 ? '' : 's'}`);
  const ciDone = !r.checks.pending.length;
  if (r.checks.verdict === 'missing' && ciDone) a.push(`no ${review} on this head: re-request the review`);
  if (!r.checks.failing.length && r.checks.failingOther.length) a.push(`non-required check failing: ${r.checks.failingOther.slice(0, 3).join(', ')}`);
  const clean = !r.unread && r.state !== 'DIRTY' && !r.checks.failing.length && r.checks.verdict === 'success' && !r.threads;
  const mergeable = ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(r.state);
  if (clean && ciDone && !mergeable) a.push(`merge state ${r.state}: see what blocks it before queueing`);
  else if (clean && ciDone) {
    if (r.approvedCurrent) a.push(`re-queue: merge-approved.sh ${r.number}`);
    else if (r.lastApproved) a.push(`review the delta since approved head ${sha8(r.lastApproved.head)}, approve the current head, queue it`);
    else if (mergeRequest) a.push(`needs first orchestrator review (the dispatcher handed it over at ${sha8(mergeRequest.head)})`);
    else a.push('needs first orchestrator review');
  }
  if (!ciDone && !a.length) a.push(`CI running (${r.checks.pending.length} pending): check back after it finishes`);
  if (ciDone && r.checks.verdict === 'pending' && !a.length) a.push('review running: check back after it finishes');
  for (const h of r.hints) {
    if (h.kind === 'idle' && h.waiting) a.push(`${h.t.id}'s worker waits on ${s.human}'s answer: answer it or take the PR over`);
    else if (h.kind === 'ended') a.push(`${h.t.id}'s worker ended (${h.t.workerState}): re-dispatch or take it over`);
    else if (h.kind === 'stuck') a.push(`${h.t.id} is stuck: re-queue it or take it over`);
    else if (h.kind === 'stale-owner') a.push(`renew (pr-sweep.mjs own ${r.number}) or release the stale claim`);
  }
  if (r.bucket === 'OWNED BUT STALE') a.push(`check on ${r.owners[0]}: nothing has moved in ${hrs(r.staleFor)}`);
  return [...new Set(a)];
}

export function classifyAll(data, now, s) {
  const rows = [];
  const apart = [];
  for (const pr of data.prs) {
    if (pr.isDraft) continue;
    if (reportOnly(pr, s)) apart.push({ number: pr.number, title: pr.title, state: pr.mergeStateStatus, idleH: ms(pr.updatedAt) ? (now - ms(pr.updatedAt)) / H : Infinity });
    else rows.push(classifyPr(pr, data, now, s));
  }
  return { rows, apart, notes: data.notes ?? [] };
}

const BUCKETS = ['APPROVED BUT NOT MOVING', 'NO OWNER', 'OWNED BUT STALE'];

function line(r) {
  const owner = r.owners.length ? r.owners.join('; ') : `none${r.hints.length ? ` (${r.hints.map((h) => h.text).join('; ')})` : ''}`;
  const threads = r.threads === Infinity ? 'over 100' : r.threads;
  const appr = r.approvedCurrent ? 'current head approved' : r.lastApproved ? `approved head ${sha8(r.lastApproved.head)} is not current` : 'never approved';
  return `- #${r.number}${r.ticket ? ` ${r.ticket}` : ''} [${r.state}] owner: ${owner} | push ${hrs(r.pushH)} ago, activity ${hrs(r.idleH)} ago | review ${r.checks.verdict}, ${threads} open thread${r.threads === 1 ? '' : 's'}, ${appr} -> ${r.actions.join('; ')}`;
}

export function render(result, now, s) {
  const { rows, apart, notes } = result;
  const bad = rows.filter((r) => r.bucket !== 'OK');
  const ok = rows.length - bad.length;
  const out = [`PR sweep ${iso(now).slice(0, 16)}Z (${s.repo}): ${bad.length} need attention, ${ok} OK`];
  for (const n of notes) out.push(`! ${n}`);
  for (const b of BUCKETS) {
    const list = bad.filter((r) => r.bucket === b).sort((x, y) => y.idleH - x.idleH);
    if (!list.length) continue;
    out.push(`${b} (${list.length})`);
    for (const r of list) out.push(line(r));
  }
  out.push(`OK: ${ok}`);
  if (apart.length) out.push(`Report only (${apart.length}): ${apart.map((p) => `#${p.number} ${p.state} ${hrs(p.idleH)} idle`).join(', ')}`);
  return { report: out.join('\n'), attention: bad.length, ok };
}

export async function sweep(s, deps = {}, now = Date.now()) {
  return render(classifyAll(await collect(s, deps), now, s), now, s);
}

// ---- due time and the watch loop ---------------------------------------------------------------------------------
export function dueAt(state, everyHours, now) {
  const last = ms(state?.lastRun);
  if (!last || last > now) return now; // a lastRun in the future (clock skew) counts as none
  return last + everyHours * H;
}

// watch(...): { code, out }. sleep and now are injectable so tests run on a fake clock.
export async function watch({ everyHours = 6, statePath, sweepOnce, now = Date.now, sleep = (t) => new Promise((r) => setTimeout(r, t)), quietMs = 24 * H }) {
  const start = now();
  let failures = 0;
  for (;;) {
    if (now() - start >= quietMs) return { code: 2, out: `no PR needing attention in ${Math.round(quietMs / H)}h` };
    const due = dueAt(readJson(statePath, {}), everyHours, now());
    if (now() < due) {
      // Wake at least every 10 minutes to re-read the state, so a --now run elsewhere postpones this one.
      await sleep(Math.max(1, Math.min(due - now(), 10 * 60_000, start + quietMs - now())));
      continue;
    }
    let res;
    try {
      res = await sweepOnce();
      failures = 0;
    } catch (e) {
      if (++failures >= 3) return { code: 1, out: `pr-sweep failed 3 times in a row: ${String(e.message).slice(0, 200)}` };
      await sleep(15 * 60_000);
      continue;
    }
    writeJsonAtomic(statePath, { lastRun: iso(now()), attention: res.attention, ok: res.ok });
    if (res.attention > 0) return { code: 0, out: res.report };
  }
}

// ---- CLI ---------------------------------------------------------------------------------------------------------
async function main(argv) {
  const cfg = loadConfig();
  const s = settings(cfg);
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const prArg = () => {
    const n = Number(argv[1]);
    if (!Number.isInteger(n) || n <= 0) {
      console.error(`usage: pr-sweep.mjs ${argv[0]} <pr>${argv[0] === 'own' ? ' "<note>" [--owner <name>]' : ''}`);
      process.exit(1);
    }
    return n;
  };
  const ownerName = () => flag('--owner') ?? (holder(orchestratorPaths(cfg)) ? `orchestrator ${holder(orchestratorPaths(cfg)).slice(0, 8)}` : 'orchestrator');
  if (argv[0] === 'own') {
    const n = prArg();
    own(s.owners, n, argv[2] && !argv[2].startsWith('--') ? argv[2] : '', ownerName());
    console.log(`#${n} owned by ${ownerName()} for ${s.ownerTtlH}h (renew with own, end with release)`);
    return 0;
  }
  if (argv[0] === 'release') {
    const n = prArg();
    console.log(release(s.owners, n) ? `#${n} released` : `#${n} had no claim`);
    return 0;
  }
  if (argv[0] === 'owners') {
    for (const e of loadOwners(s.owners)) console.log(`#${e.pr} ${e.owner} since ${e.since}: ${e.note}`);
    return 0;
  }
  if (argv.includes('--now')) {
    const res = await sweep(s);
    writeJsonAtomic(s.state, { lastRun: iso(Date.now()), attention: res.attention, ok: res.ok });
    console.log(res.report);
    return 0;
  }
  if (argv.includes('--watch')) {
    const every = Number(flag('--every-hours') ?? s.everyHours);
    if (!(every > 0)) { console.error('--every-hours needs a positive number'); return 1; }
    const res = await watch({ everyHours: every, statePath: s.state, sweepOnce: () => sweep(s) });
    (res.code === 1 ? console.error : console.log)(res.out);
    return res.code;
  }
  console.error('usage: pr-sweep.mjs --now | --watch [--every-hours N] | own <pr> "<note>" [--owner <name>] | release <pr> | owners');
  return 1;
}

// exitCode, not exit(): a large report piped to another process is written in full before node exits.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
