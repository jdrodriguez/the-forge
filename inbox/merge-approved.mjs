#!/usr/bin/env node
// merge-approved.mjs: merges PRs the orchestrator approved. merge-approved.sh runs it.
//
//   merge-approved.sh <pr>...                         gate each PR, merge or enqueue every one that passes, wait for all
//   merge-approved.sh --approve <pr> <head> "<note>"  record that <head> (full SHA) of <pr> is approved
//   merge-approved.sh --approved                      list approved heads not yet merged, with their age
//   merge-approved.sh --all-approved                  merge every open PR whose current head has an approval
//   merge-approved.sh --repo <owner/name> <any of the above>   the same in a repo listed in merge.repos
//
// Approvals live in orchestrator.approvalsFile, one JSON line each, tied to the exact head they name: a new push needs a
// new approval. Only the session in orchestrator.lockFile approves or merges, and the lock is read again right before
// each merge, so a takeover during a run stops it. Environment: QUEUE_PROBE_PR=<n> lets that one PR past a CI hold,
// MERGE_JUMP=1 sends the PRs to the front of the merge queue, FORGE_SLEEP_SCALE scales every wait (tests set 0).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig } from '../lib/config.mjs';
import { approvalOf, approvedHeads, closeApprovals, recordApproval } from './approvals.mjs';
import { ciHold, checkGate, isDriver, policyFor } from './merge-policy.mjs';

const cfg = loadConfig();
const SCALE = Number(process.env.FORGE_SLEEP_SCALE ?? 1);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms * SCALE);
const SID = process.env.CLAUDE_CODE_SESSION_ID || '';
const BY = SID || 'shell';
const LOCK = cfg.orchestrator?.lockFile || path.join(cfg.paths.stateDir, 'orchestrator-session');
const LEASE = path.join(ROOT, 'inbox', 'lease.sh');
const USAGE = 'usage: merge-approved.sh [--repo <owner/name>] <pr>... | --approve <pr> <head> "<note>" | --approved | --all-approved';

let args = process.argv.slice(2);
let REPO = cfg.github.repo;
if (args[0] === '--repo') {
  REPO = args[1] ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO)) { console.log(USAGE); process.exit(1); }
  args = args.slice(2);
}
const policy = policyFor(cfg, REPO);
if (!policy) {
  console.log(`STOP: ${REPO} is neither github.repo nor in merge.repos, so nothing says how its PRs are gated; nothing merged`);
  process.exit(1);
}
const [OWNER, NAME] = REPO.split('/');
const GQL_REPO = `owner:"${OWNER}",name:"${NAME}"`;
const BASE = cfg.github.baseBranch ?? 'main';

const gh = (a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).trim();
const tryGh = (a) => { try { return gh(a); } catch { return null; } };
const json = (a) => { const s = tryGh(a); try { return s ? JSON.parse(s) : null; } catch { return null; } };
const view = (pr, fields) => json(['pr', 'view', String(pr), '--repo', REPO, '--json', fields]);
const gql = (query) => json(['api', 'graphql', '-f', `query=${query}`]);
const git = (a) => execFileSync('git', ['-C', cfg.repoPath, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const renewLease = () => { if (fs.existsSync(LEASE)) spawnSync('bash', [LEASE, 'renew'], { stdio: 'ignore' }); };
const short = (s) => String(s ?? '').slice(0, 10);
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const ledger = { file: cfg.orchestrator?.approvalsFile || path.join(cfg.paths.sharedDir, 'approvals.jsonl'), repo: REPO, defaultRepo: cfg.github.repo };

// --approved: list approved heads not yet merged. With numbersOnly, the open, non-draft PRs at their approved head.
function showApproved(numbersOnly) {
  const out = [];
  for (const a of approvedHeads(ledger)) {
    const p = view(a.pr, 'state,headRefOid,isDraft');
    if (p && p.state !== 'OPEN') continue;
    if (numbersOnly) {
      if (!p) console.log(`#${a.pr}: could not read it (gh failed), left out`);
      if (p && p.headRefOid === a.head && !p.isDraft) out.push(String(a.pr));
      continue;
    }
    const where = !p ? 'state unknown, gh failed'
      : p.headRefOid !== a.head ? `STALE: head is now ${short(p.headRefOid)}; review it and record it with --approve`
        : p.isDraft ? 'current head, but a draft (held)' : 'current head';
    out.push(`#${a.pr} head ${short(a.head)} approved ${a.age} ago by ${String(a.by).slice(0, 8)}: ${a.note} [${where}]`);
  }
  return out;
}

if (args[0] === '--approved') {
  console.log(`Approved heads not yet merged (${ledger.file}${REPO !== cfg.github.repo ? `, ${REPO}` : ''}):`);
  const lines = showApproved(false);
  console.log(lines.length ? lines.join('\n') : 'none');
  process.exit(0);
}

const driver = () => isDriver(LOCK, SID);
const lockHolder = () => { try { return fs.readFileSync(LOCK, 'utf8').split('\n')[0]; } catch { return 'unknown'; } };
if (!driver()) {
  console.log(`STOP: this session is not the orchestrator (driver is ${lockHolder()}). Run the takeover first if you were moved here.`);
  process.exit(1);
}
renewLease();

if (args[0] === '--approve') {
  const [, raw, head, note] = args;
  if (!/^\d+$/.test(raw ?? '') || !/^[0-9a-f]{40}$/.test(head ?? '') || !note) {
    console.log('usage: merge-approved.sh --approve <pr> <full 40-character head sha> "<note: what you checked>"');
    process.exit(1);
  }
  const pr = String(Number(raw));
  const p = view(pr, 'state,headRefOid');
  if (p?.state !== 'OPEN') { console.log(`STOP: #${pr} is ${p?.state ?? 'unreadable'}, not open; nothing recorded`); process.exit(1); }
  if (p.headRefOid !== head) { console.log(`STOP: #${pr}'s current head is ${p.headRefOid}, not ${head}; review the current head and approve that`); process.exit(1); }
  if (!driver()) { console.log(`STOP: this session lost the orchestrator lock (driver is now ${lockHolder()}); nothing recorded`); process.exit(1); }
  recordApproval(ledger, { pr, head, by: BY, note });
  console.log(`APPROVED #${pr} at head ${short(head)}, recorded in ${ledger.file}`);
  process.exit(0);
}

if (args[0] === '--all-approved') {
  args = showApproved(true);
  if (!args.length) { console.log('No open PR has an approval for its current head.'); process.exit(0); }
  console.log(`Approved at their current heads: ${args.map((n) => `#${n}`).join(' ')}`);
}
if (!args.length) { console.log(USAGE); process.exit(1); }

const isFix = (p) => (p.labels ?? []).some((l) => l.name === (cfg.github.fixesMainLabel ?? 'fixes-main')) || String(p.title).startsWith('Revert "');
const mainRed = () => { try { return JSON.parse(fs.readFileSync(path.join(cfg.paths.sharedDir, 'main-state.json'), 'utf8')).status === 'red'; } catch { return false; } };

// The PR's migration files that the base branch does not have yet (github.repo only, with premerge.migrations set).
const MIG = REPO === cfg.github.repo ? cfg.premerge?.migrations : null;
function newMigrations(p) {
  if (!MIG?.dir) return [];
  const rx = new RegExp(MIG.pattern ?? '.');
  return (p.files ?? []).map((f) => f.path)
    .filter((f) => f.startsWith(`${MIG.dir}/`) && rx.test(path.basename(f)))
    .filter((f) => { try { git(['cat-file', '-e', `origin/${BASE}:${f}`]); return false; } catch { return true; } });
}

function afterMerge(pr) {
  const p = view(pr, 'headRefOid,headRefName,isCrossRepository,mergeCommit') ?? {};
  // Delete the branch only while it still points at the merged head, so a branch recreated under the same name stays.
  const ref = p.headRefName && !p.isCrossRepository ? json(['api', `repos/${REPO}/git/ref/heads/${p.headRefName}`]) : null;
  if (ref?.object?.sha && ref.object.sha === p.headRefOid) tryGh(['api', '-X', 'DELETE', `repos/${REPO}/git/refs/heads/${p.headRefName}`]);
  console.log(`MERGED #${pr}${REPO !== cfg.github.repo ? ` in ${REPO}` : ''} as ${short(p.mergeCommit?.oid)}`);
  try { closeApprovals(ledger, { pr, head: p.headRefOid, by: BY }); } catch (e) { console.log(`#${pr}: could not close its approvals in ${ledger.file} (${e.message})`); }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'inbox', 'merged-to-verifying.mjs'), String(pr), REPO], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) console.log(`#${pr}: could not check its ticket's Linear state`);
}

const enqueuedAt = {};
const batchMigrations = [];
let hold = null;

// gate(pr): 'queued' when it went into the merge queue, 'merged' when it merged (now or before), 'held' otherwise,
// with the reason printed.
function gate(pr) {
  if (!/^\d+$/.test(pr)) { console.log(`STOP: '${pr}' is not a PR number`); return 'held'; }
  pr = String(Number(pr));
  let p = view(pr, 'state,isDraft,title,labels');
  if (!p) { console.log(`STOP at #${pr}: could not read it (gh failed)`); return 'held'; }
  if (p.state === 'MERGED') { console.log(`MERGED #${pr} already`); afterMerge(pr); return 'merged'; }
  if (p.state !== 'OPEN') { console.log(`STOP at #${pr}: it is ${p.state}, not open`); return 'held'; }
  if (p.isDraft) { console.log(`STOP before #${pr}: it is a draft, held out of merging`); return 'held'; }
  if (REPO === cfg.github.repo && mainRed()) {
    if (!isFix(p)) { console.log(`STOP before #${pr}: main is red`); return 'held'; }
    console.log(`main is red, but #${pr} fixes it (${cfg.github.fixesMainLabel ?? 'fixes-main'} label or a revert), so it may merge`);
  }
  if (hold) {
    if (process.env.QUEUE_PROBE_PR === pr) {
      console.log(`the merge queue is held on '${hold.job}'; #${pr} goes in as the one probe (QUEUE_PROBE_PR), to give the hold a later run to read`);
    } else if (!isFix(p)) {
      console.log(`PAUSED before #${pr}: the merge queue's last two runs (${hold.runs}) failed on job '${hold.job}'. Not enqueued; nothing goes in until a later merge-queue run passes that job. A fixes-main PR or a revert still goes in.`);
      return 'held';
    } else {
      console.log(`the merge queue is held on '${hold.job}', but #${pr} fixes main, so it goes in`);
    }
  }
  // GitHub recomputes mergeability after main moves and reads UNKNOWN meanwhile; give it up to two minutes.
  for (let i = 0; i < 8; i++) {
    renewLease();
    p = view(pr, 'id,headRefOid,mergeStateStatus,statusCheckRollup,files,title,labels');
    if (!p) { console.log(`STOP at #${pr}: could not read it (gh failed)`); return 'held'; }
    if (p.mergeStateStatus !== 'UNKNOWN') break;
    sleep(15000);
  }
  const head = p.headRefOid;
  const appr = approvalOf(ledger, pr, head);
  if (appr) {
    console.log(`#${pr}: head ${short(head)} approved at ${appr.approvedAt} by ${String(appr.by).slice(0, 8)}: ${appr.note}`);
  } else {
    const older = approvalOf(ledger, pr);
    if (older) {
      console.log(`STOP at #${pr}: the approval on file is for head ${short(older.head)} (${older.approvedAt}), but the current head is ${short(head)}. Review the new commits, then: merge-approved.sh${REPO !== cfg.github.repo ? ` --repo ${REPO}` : ''} --approve ${pr} ${head} "<what you checked>"`);
      return 'held';
    }
  }
  let why;
  try { why = checkGate(p, policy); } catch (e) { why = `the check gate could not be evaluated (${e.message})`; }
  if (why) { console.log(`STOP at #${pr}: ${why}`); return 'held'; }
  if (policy.resolvedThreads) {
    const r = gql(`query{repository(${GQL_REPO}){pullRequest(number:${pr}){reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved}}}}}`);
    const threads = r?.data?.repository?.pullRequest?.reviewThreads;
    if (threads?.pageInfo?.hasNextPage) { console.log(`STOP at #${pr}: over 100 review threads; check them by hand`); return 'held'; }
    const open = threads?.nodes ? threads.nodes.filter((t) => !t.isResolved).length : null;
    if (open !== 0) { console.log(`STOP at #${pr}: ${open ?? 'an unknown number of (gh failed)'} unresolved review thread(s)`); return 'held'; }
  }
  if (REPO === cfg.github.repo) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'dispatcher', 'premerge-check.mjs'), pr], { encoding: 'utf8' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n');
    console.log(out.at(-1));
    if (r.status !== 0) { console.log(`STOP at #${pr}: pre-merge check did not pass`); console.log(out.slice(-8).join('\n')); return 'held'; }
  }
  // Two PRs that pass alone can clash once both land: a migration whose prefix (premerge.migrations.prefixLength) a PR
  // ahead in the merge queue, or one enqueued earlier in this run, already uses is held.
  const mine = newMigrations(p);
  if (mine.length && policy.mode === 'queue') {
    const q = gql(`query{repository(${GQL_REPO}){mergeQueue(branch:"${BASE}"){entries(first:30){nodes{pullRequest{number files(first:100){nodes{path}}}}}}}}`);
    const ahead = (q?.data?.repository?.mergeQueue?.entries?.nodes ?? [])
      .filter((n) => String(n.pullRequest.number) !== pr).flatMap((n) => n.pullRequest.files.nodes.map((f) => f.path))
      .filter((f) => f.startsWith(`${MIG.dir}/`));
    const prefix = (f) => path.basename(f).slice(0, MIG.prefixLength ?? path.basename(f).length);
    const taken = new Set([...ahead, ...batchMigrations].map(prefix));
    const clash = mine.find((m) => taken.has(prefix(m)));
    if (clash) { console.log(`STOP at #${pr}: new migration ${clash} has the same prefix as one a PR ahead in the merge queue adds; renumber it`); return 'held'; }
  }
  if (!driver()) { console.log(`STOP before #${pr}: this session lost the orchestrator lock during the run (driver is now ${lockHolder()}); not merged`); return 'held'; }
  // A merge run on a PR with no approval on file is the driver's approval, recorded once the gate has passed.
  if (!appr) {
    recordApproval(ledger, { pr, head, by: BY, note: 'recorded by a merge run on this head' });
    console.log(`#${pr}: no approval on file; recorded head ${short(head)} as approved by this run`);
  }
  const admin = policy.adminMerge ? ['--admin'] : [];
  const merge = () => tryGh(['pr', 'merge', pr, '--repo', REPO, '--squash', '--match-head-commit', head, ...admin]) !== null;
  const enqueue = (jump) => tryGh(['api', 'graphql', '-f', `query=mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,${jump ? 'jump:true,' : ''}expectedHeadOid:$oid}){mergeQueueEntry{position}}}`, '-f', `id=${p.id}`, '-f', `oid=${head}`]) !== null;
  const stateNow = () => view(pr, 'state')?.state;

  if (policy.mode === 'direct') {
    if (!merge() && stateNow() !== 'MERGED') { console.log(`STOP at #${pr}: merge refused`); return 'held'; }
    for (let i = 0; i < 6 && stateNow() !== 'MERGED'; i++) sleep(5000);
    if (stateNow() !== 'MERGED') { console.log(`STOP at #${pr}: the merge was accepted but the PR does not read MERGED yet; check it`); return 'held'; }
    afterMerge(pr);
    return 'merged';
  }
  // Only a removal event newer than this moment counts as this run's ejection (10 seconds of slack for clock skew).
  enqueuedAt[pr] = new Date(Date.now() - 10000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (process.env.MERGE_JUMP) {
    if (!enqueue(true)) { console.log(`STOP at #${pr}: the jump to the front of the merge queue was refused`); return 'held'; }
    console.log(`#${pr} sent to the front of the merge queue at head ${short(head)}`);
    batchMigrations.push(...mine);
    return 'queued';
  }
  if (!merge() && stateNow() !== 'MERGED') { console.log(`STOP at #${pr}: merge refused`); return 'held'; }
  // gh answers success without enqueuing when auto-merge is already on, so the entry is checked, and a PR that has
  // none is put in the queue directly. A repo with no merge queue reads MERGED here.
  const e = gql(`query{repository(${GQL_REPO}){pullRequest(number:${pr}){state mergeQueueEntry{state}}}}`)?.data?.repository?.pullRequest;
  if (e?.state === 'MERGED') { console.log(`#${pr} merged at head ${short(head)}`); return 'queued'; }
  if (!e?.mergeQueueEntry?.state) {
    // Auto-merge left on would land a later, unapproved push, so it is turned off when the PR does not go in.
    const refuse = (why) => { tryGh(['pr', 'merge', pr, '--repo', REPO, '--disable-auto']); console.log(`STOP at #${pr}: ${why}; auto-merge turned off`); return 'held'; };
    if (!driver()) return refuse(`this session lost the orchestrator lock during the run (driver is now ${lockHolder()})`);
    if (!enqueue(false)) return refuse('gh reported the merge accepted, but the PR has no merge queue entry and a direct enqueue was refused');
    console.log(`#${pr} had no queue entry after gh pr merge (auto-merge already on?); enqueued directly at head ${short(head)}`);
  } else {
    console.log(`#${pr} enqueued at head ${short(head)}`);
  }
  batchMigrations.push(...mine);
  return 'queued';
}

// PRs that add a migration go first, in ascending order of their lowest new migration, so a lower prefix never waits
// behind a higher one; the rest keep the order given.
function orderPrs(prs) {
  if (!MIG?.dir || prs.length < 2) return prs;
  try { git(['fetch', '-q', 'origin', BASE]); } catch { /* order by what is known */ }
  const keyed = prs.map((pr, i) => {
    const first = newMigrations(view(pr, 'files') ?? {}).map((m) => path.basename(m)).sort()[0];
    return { pr, k: first ? `0 ${first}` : `1 ${String(i).padStart(6, '0')}` };
  });
  return [...new Set(keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)).map((x) => x.pr))];
}

renewLease();
if (!process.env.MERGE_JUMP && policy.mode === 'queue') {
  args = orderPrs(args);
  if (args.length > 1) console.log(`Enqueue order: ${args.map((n) => `#${n}`).join(' ')}`);
}
if (policy.mode === 'queue' && policy.ciHold) {
  hold = ciHold({ gh: json, ghText: tryGh, repo: REPO, workflow: cfg.github.ciWorkflow ?? 'CI', base: BASE });
  if (hold) console.log(`MERGE QUEUE PAUSED: the last two merge-queue runs (${hold.runs}) failed on job '${hold.job}'. Only a fixes-main PR or a revert goes in until a later merge-queue run passes it.`);
}

let pending = [];
const merged = [];
const stopped = [];
for (const pr of args) {
  renewLease();
  const r = gate(pr);
  (r === 'queued' ? pending : r === 'merged' ? merged : stopped).push(pr);
}

// Watching the queue. A live entry is never an ejection, whatever its merge-group CI shows (a cancelled run means GitHub
// rebuilt the group). With no entry, only a removal event newer than this run's enqueue is an ejection. The PR's own
// entry can lag the enqueue, so "not queued" with no fresh event counts as a drop only after the first minute, and
// only after four polls in a row with no event. The wait is 30 minutes after the last enqueue.
const seen = {};
const sayOnce = (pr, msg) => { if (seen[pr] !== msg) { seen[pr] = msg; console.log(`#${pr}: ${msg}`); } };
const unknown = {};
const WF = cfg.github.ciWorkflow ?? 'CI';
for (let i = 1; i <= 60 && pending.length; i++) {
  renewLease();
  const runs = (json(['run', 'list', '--repo', REPO, '--workflow', WF, '--event', 'merge_group', '--limit', '40', '--json', 'databaseId,status,conclusion,headBranch,createdAt']) ?? [])
    .map((r) => ({ ...r, pr: (String(r.headBranch ?? '').match(/\/pr-(\d+)-/) ?? [])[1] }));
  const still = [];
  for (const pr of pending) {
    const q = gql(`query{repository(${GQL_REPO}){pullRequest(number:${pr}){state mergeQueueEntry{state} timelineItems(last:1,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT]){nodes{__typename ... on AddedToMergeQueueEvent{createdAt} ... on RemovedFromMergeQueueEvent{createdAt reason}}}}}}`)?.data?.repository?.pullRequest;
    if (!q) { sayOnce(pr, 'could not read its queue state this poll (gh failed); trying again'); still.push(pr); continue; }
    const enq = enqueuedAt[pr] ?? now();
    const run = runs.find((r) => r.pr === pr && r.createdAt >= enq);
    if (q.state === 'MERGED') { afterMerge(pr); merged.push(pr); continue; }
    const entry = q.mergeQueueEntry?.state;
    const ev = q.timelineItems?.nodes?.[0] ?? {};
    if (entry) {
      unknown[pr] = 0;
      if (!run) sayOnce(pr, `live entry (${entry}), no merge-group run yet`);
      else if (run.status !== 'completed') sayOnce(pr, `live entry (${entry}), merge-group CI ${run.status} (run ${run.databaseId}); not an ejection`);
      else if (run.conclusion === 'cancelled') sayOnce(pr, `rebuilt: merge-group run ${run.databaseId} was cancelled and the entry is still live (${entry}); waiting for the new group`);
      else if (run.conclusion === 'failure') sayOnce(pr, `live entry (${entry}), but its merge-group run ${run.databaseId} failed; GitHub should remove it shortly`);
      else sayOnce(pr, `live entry (${entry}), merge-group run ${run.databaseId} ${run.conclusion}; landing`);
      still.push(pr);
      continue;
    }
    const removed = ev.__typename === 'RemovedFromMergeQueueEvent';
    if (removed && ev.createdAt >= enq) {
      if (/^merged$/i.test(ev.reason ?? '')) { sayOnce(pr, `removed from the queue as merged at ${ev.createdAt}; waiting for the PR to read MERGED`); still.push(pr); continue; }
      if (/conflict/i.test(ev.reason ?? '')) {
        console.log(`STOP at #${pr}: ejected, GitHub removed it from the merge queue for a merge conflict (${ev.reason} at ${ev.createdAt}). #${pr} needs a merge of main.`);
      } else {
        console.log(`STOP at #${pr}: ejected, GitHub removed it from the merge queue (${ev.reason} at ${ev.createdAt}, after this run's enqueue)${run ? `; merge-group run ${run.databaseId} is ${run.status}/${run.conclusion}, failing jobs: gh run view ${run.databaseId} --log-failed` : ''}`);
      }
      stopped.push(pr);
      continue;
    }
    if (i <= 2) { still.push(pr); continue; }
    unknown[pr] = (unknown[pr] ?? 0) + 1;
    sayOnce(pr, removed
      ? `not in the queue; its newest removal (${ev.reason} at ${ev.createdAt}) predates this run's enqueue (${enq}), so it is a stale event and ignored`
      : 'not in the queue and no removal event yet');
    if (unknown[pr] >= 4) {
      console.log(`STOP at #${pr}: left the merge queue without merging (no removal event newer than this run's enqueue after two minutes)`);
      stopped.push(pr);
      continue;
    }
    still.push(pr);
  }
  pending = still;
  if (pending.length) sleep(30000);
}
for (const pr of pending) { console.log(`STOP at #${pr}: still in the merge queue after 30 minutes`); stopped.push(pr); }

if (!stopped.length) { console.log('ALL MERGED'); process.exit(0); }
console.log(`NOT MERGED: ${stopped.map((n) => `#${n}`).join(' ')}${merged.length ? `; merged: ${merged.map((n) => `#${n}`).join(' ')}` : ''}`);
process.exit(1);
