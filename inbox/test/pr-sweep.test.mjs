// pr-sweep.mjs. gh and the queue board are stubbed with fixtures: in process for the classification and watch tests,
// and as a fake gh on PATH plus a local HTTP board for the CLI test. Every case uses a throwaway config and folders.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { classifyAll, collect, dueAt, loadOwners, own, parseApprovals, release, render, settings, watch } from '../pr-sweep.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
const SCRIPT = path.join(ROOT, 'inbox/pr-sweep.mjs');
const VERDICT = 'Claude Code Review';
const H = 3.6e6;
const NOW = Date.parse('2026-11-23T20:00:00Z');
const ago = (h) => new Date(NOW - h * H).toISOString();
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

// A throwaway config, its folders, and the sweep settings it gives.
function tmpBox(prSweep = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-sweep-'));
  const stateDir = path.join(home, 'state');
  const sharedDir = path.join(home, 'shared');
  fs.mkdirSync(path.join(sharedDir, 'merge-requests'), { recursive: true });
  fs.mkdirSync(stateDir);
  const cfg = { ...EXAMPLE, human: { name: 'Alex' }, paths: { stateDir, sharedDir }, orchestrator: { ...EXAMPLE.orchestrator, approvalsFile: null, prSweep: { ...EXAMPLE.orchestrator.prSweep, ...prSweep } } };
  const configFile = path.join(home, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(cfg));
  return { home, configFile, s: settings(cfg) };
}

// A green, clean PR whose last activity was `idle` hours ago.
function pr(number, { idle = 1, author = 'someone', head = A, draft = false, checks, title } = {}) {
  return {
    number, title: title ?? `ENG-${number}: something`, author: { login: author }, isDraft: draft, headRefOid: head,
    mergeStateStatus: 'CLEAN', updatedAt: ago(idle), url: `https://github.com/your-org/your-app/pull/${number}`,
    statusCheckRollup: checks ?? [
      { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: ago(idle) },
      { __typename: 'StatusContext', context: VERDICT, state: 'SUCCESS', startedAt: ago(idle) },
    ],
  };
}

function detail(number, { idle = 1, head = A, state = 'CLEAN', threads = 0, queue = null, ejections = [] } = {}) {
  return {
    number, mergeable: state === 'DIRTY' ? 'CONFLICTING' : 'MERGEABLE', mergeStateStatus: state, headRefOid: head,
    mergeQueueEntry: queue, reviewThreads: { nodes: Array.from({ length: threads }, () => ({ isResolved: false })) },
    commits: { nodes: [{ commit: { committedDate: ago(idle) } }] }, pushes: { nodes: [] },
    ejections: { nodes: ejections }, queued: { nodes: [] },
  };
}

// An in-process gh: answers pr list, the rules read and the batched GraphQL query from fixtures, and logs each call.
function fakeGh(prs, details) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr') return prs;
    if (args[1] === 'graphql') {
      const nums = [...args[3].matchAll(/pullRequest\(number:(\d+)\)/g)].map((m) => Number(m[1]));
      return { data: { repository: Object.fromEntries(nums.map((n) => [`p${n}`, details[n] ?? detail(n)])) } };
    }
    if (args[1].includes('/rules/')) return [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'quality' }, { context: VERDICT }] } }];
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { gh, calls };
}

const ticket = (id, prNumber, extra = {}) => ({ id, prNumber, host: 'box-1', live: true, status: 'building', workerState: 'busy', account: 'b', workerId: 'w1', ...extra });

async function run({ prs, details = {}, tickets = [], owners = [], approvals = [], box = tmpBox(), board } = {}) {
  const { s } = box;
  fs.writeFileSync(s.owners, JSON.stringify(owners));
  fs.writeFileSync(s.approvals, approvals.map((a) => JSON.stringify(a)).join('\n'));
  const { gh, calls } = fakeGh(prs, details);
  const data = await collect(s, { gh, board: board ?? (async () => ({ tickets })) });
  const result = classifyAll(data, NOW, s);
  const byPr = Object.fromEntries(result.rows.map((r) => [r.number, r]));
  return { result, byPr, calls, report: render(result, NOW, s).report };
}

test('NO OWNER: no live worker and no pr-owners entry, a green PR needs its first orchestrator review', async () => {
  const { byPr, report } = await run({ prs: [pr(4801)] });
  assert.equal(byPr[4801].bucket, 'NO OWNER');
  assert.match(byPr[4801].actions.join(';'), /needs first orchestrator review/);
  assert.match(report, /NO OWNER \(1\)\n- #4801 ENG-4801/);
});

test('outside a dispatcher status, a board worker that is idle or failed is not an owner; working or busy is', async () => {
  const prs = [pr(1), pr(2), pr(3), pr(4)];
  const tickets = [
    ticket('ENG-1', 1, { status: 'adhoc', workerState: 'idle', waiting: true }),
    ticket('ENG-2', 2, { status: 'adhoc', workerState: 'failed' }),
    ticket('ENG-3', 3, { workerState: 'working' }),
    ticket('ENG-4', 4, { workerState: 'busy' }),
  ];
  const { byPr } = await run({ prs, tickets });
  assert.equal(byPr[1].bucket, 'NO OWNER');
  assert.match(byPr[1].actions.join(';'), /waits on Alex's answer/);
  assert.equal(byPr[2].bucket, 'NO OWNER');
  assert.match(byPr[2].actions.join(';'), /worker ended \(failed\): re-dispatch/);
  assert.equal(byPr[3].bucket, 'OK');
  assert.equal(byPr[4].bucket, 'OK');
});

test('a ticket the dispatcher holds (building, merge-asked, bundled) with progress under 6h is owned, whatever its worker reads', async () => {
  const prs = [pr(5), pr(6), pr(7), pr(8)];
  const tickets = [
    ticket('ENG-5', 5, { engine: 'grok', workerState: 'done', lastProgressAt: ago(1) }),
    ticket('ENG-6', 6, { engine: 'codex', workerState: 'failed', lastProgressAt: ago(5.5) }),
    ticket('ENG-7', 7, { status: 'merge-asked', live: false, workerState: null, lastProgressAt: ago(2) }),
    ticket('ENG-8', 8, { status: 'bundled', workerState: 'gone', lastProgressAt: ago(0.5) }),
  ];
  const { byPr } = await run({ prs, tickets });
  for (const n of [5, 6, 7, 8]) {
    assert.equal(byPr[n].bucket, 'OK', `#${n}`);
    assert.match(byPr[n].owners[0], new RegExp(`^dispatcher on box-1 \\(ENG-${n} `));
  }
});

test('a ticket the dispatcher holds with no progress for 6h+ is OWNED BUT STALE, even when the PR moved recently', async () => {
  const tickets = [ticket('ENG-9', 9, { engine: 'grok', status: 'building', workerState: 'done', lastProgressAt: ago(7) })];
  const { byPr } = await run({ prs: [pr(9, { idle: 0.5 })], details: { 9: detail(9, { idle: 0.5 }) }, tickets });
  assert.equal(byPr[9].bucket, 'OWNED BUT STALE');
  assert.match(byPr[9].actions.join(';'), /check on dispatcher on box-1 \(ENG-9 building, worker done, progress 7.0h ago\): nothing has moved in 7.0h/);
  assert.doesNotMatch(byPr[9].actions.join(';'), /re-dispatch/);
});

test('APPROVED BUT NOT MOVING: current head approved, DIRTY, idle 2h+, says merge main and re-queue', async () => {
  const { byPr, report } = await run({
    prs: [pr(4767, { idle: 3 })],
    details: { 4767: detail(4767, { idle: 3, state: 'DIRTY', ejections: [{ createdAt: ago(3), reason: 'merge_conflict' }] }) },
    tickets: [ticket('ENG-7262', 4767)], // even with a busy worker: approved and sitting is its own bucket
    approvals: [{ pr: 4767, head: A, approvedAt: ago(4) }],
  });
  assert.equal(byPr[4767].bucket, 'APPROVED BUT NOT MOVING');
  const act = byPr[4767].actions.join(';');
  assert.match(act, /merge main and re-queue \(approved head was aaaaaaaa\)/);
  assert.match(act, /ejected from the merge queue 1x, last for merge_conflict/);
  assert.match(report, /^APPROVED BUT NOT MOVING \(1\)$/m);
});

test('an approved, clean PR out of the queue for 2h+ is told to re-queue; one in the merge queue is OK', async () => {
  const { byPr } = await run({
    prs: [pr(10, { idle: 2.5 }), pr(11, { idle: 2.5 })],
    details: { 10: detail(10, { idle: 2.5 }), 11: detail(11, { idle: 2.5, queue: { state: 'QUEUED', position: 2 } }) },
    approvals: [{ pr: 10, head: A }, { pr: 11, head: A }],
  });
  assert.equal(byPr[10].bucket, 'APPROVED BUT NOT MOVING');
  assert.match(byPr[10].actions.join(';'), /re-queue: merge-approved.sh 10/);
  assert.equal(byPr[11].bucket, 'OK');
  assert.match(byPr[11].owners[0], /merge queue/);
});

test('approved head must equal the current head; merged events and other repos do not count', async () => {
  const approvals = [
    { pr: 20, head: B, approvedAt: ago(5) }, // an older head
    { pr: 21, head: A, event: 'merged', merged: true },
    { pr: 22, head: A, repo: 'your-org/your-site' },
  ];
  const { byPr } = await run({ prs: [pr(20, { idle: 3 }), pr(21, { idle: 3 }), pr(22, { idle: 3 })], details: { 20: detail(20, { idle: 3 }), 21: detail(21, { idle: 3 }), 22: detail(22, { idle: 3 }) }, approvals });
  for (const n of [20, 21, 22]) {
    assert.equal(byPr[n].approvedCurrent, false, `#${n}`);
    assert.equal(byPr[n].bucket, 'NO OWNER', `#${n}`);
  }
  assert.match(byPr[20].actions.join(';'), /review the delta since approved head bbbbbbbb/);
  const parsed = parseApprovals(`${approvals.map((a) => JSON.stringify(a)).join('\n')}\nnot json\n`, 'your-org/your-app');
  assert.deepEqual([...parsed.keys()], [20]);
});

test('OWNED BUT STALE: an owner but nothing changed for 6h+', async () => {
  const { byPr } = await run({ prs: [pr(30, { idle: 7 }), pr(31, { idle: 5 })], details: { 30: detail(30, { idle: 7 }), 31: detail(31, { idle: 5 }) }, tickets: [ticket('ENG-30', 30), ticket('ENG-31', 31)] });
  assert.equal(byPr[30].bucket, 'OWNED BUT STALE');
  assert.match(byPr[30].actions.join(';'), /check on worker b\/w1 on box-1 \(ENG-30\) busy: nothing has moved in 7.0h/);
  assert.equal(byPr[31].bucket, 'OK');
});

test('pr-owners.json: a fresh entry owns the PR, an entry 12h+ old does not', async () => {
  const owners = [
    { pr: 40, owner: 'orchestrator', since: ago(1), note: 'merge train' },
    { pr: 41, owner: 'orchestrator', since: ago(13), note: 'wait job' },
  ];
  const { byPr } = await run({ prs: [pr(40), pr(41)], owners });
  assert.equal(byPr[40].bucket, 'OK');
  assert.match(byPr[40].owners[0], /orchestrator: merge train/);
  assert.equal(byPr[41].bucket, 'NO OWNER');
  assert.equal(byPr[41].owners.length, 0);
  assert.match(byPr[41].actions.join(';'), /release the stale claim/);
});

test('a fresh claim resets the staleness clock: it counts from the later of the last activity and the claim', async () => {
  const owners = [
    { pr: 42, owner: 'orchestrator', since: ago(0.1), note: 'unstick agent' },
    { pr: 43, owner: 'orchestrator', since: ago(7), note: 'wait job' },
  ];
  const { byPr } = await run({ prs: [pr(42, { idle: 48 }), pr(43, { idle: 9 })], details: { 42: detail(42, { idle: 48 }), 43: detail(43, { idle: 9 }) }, owners });
  assert.equal(byPr[42].bucket, 'OK');
  assert.equal(byPr[43].bucket, 'OWNED BUT STALE');
  assert.match(byPr[43].actions.join(';'), /nothing has moved in 7.0h/);
});

test('reportOnlyAuthors PRs are listed apart, never bucketed, never queried; drafts are skipped', async () => {
  const prs = [pr(50, { author: 'teammate', idle: 30 }), pr(51, { author: 'app/dependabot', idle: 30 }), pr(52, { draft: true, idle: 30 }), pr(53)];
  const { result, calls, report } = await run({ prs, tickets: [ticket('ENG-53', 53)], box: tmpBox({ reportOnlyAuthors: ['app/dependabot', 'Teammate'] }) });
  assert.deepEqual(result.rows.map((r) => r.number), [53]);
  assert.deepEqual(result.apart.map((r) => r.number), [50, 51]);
  const query = calls.find((c) => c[1] === 'graphql')[3];
  assert.doesNotMatch(query, /number:(50|51|52)\)/);
  assert.equal(calls.filter((c) => c[1] === 'graphql').length, 1);
  assert.match(report, /0 need attention, 1 OK/);
  assert.match(report, /Report only \(2\): #50 CLEAN 30.0h idle, #51/);
});

test('actions: failing required check, failed verdict, unresolved threads, missing verdict', async () => {
  const failing = [
    { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: ago(1) },
    { __typename: 'StatusContext', context: VERDICT, state: 'FAILURE', startedAt: ago(1) },
  ];
  const noVerdict = [{ __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: ago(1) }];
  const { byPr } = await run({ prs: [pr(60, { checks: failing }), pr(61, { checks: noVerdict })], details: { 60: detail(60, { threads: 2 }) } });
  const act = byPr[60].actions.join(';');
  assert.match(act, /fix failing check quality/);
  assert.match(act, /address the review findings \(Claude Code Review failed on this head\)/);
  assert.match(act, /answer 2 unresolved threads/);
  assert.match(byPr[61].actions.join(';'), /no Claude Code Review on this head: re-request the review/);
});

test('a required check that has not reported keeps the PR from reading as ready', async () => {
  const verdictOnly = [{ __typename: 'StatusContext', context: VERDICT, state: 'SUCCESS', startedAt: ago(1) }];
  const { byPr } = await run({ prs: [pr(62, { checks: verdictOnly })] });
  assert.deepEqual(byPr[62].checks.pending, ['quality']);
  const act = byPr[62].actions.join(';');
  assert.match(act, /CI running/);
  assert.doesNotMatch(act, /needs first orchestrator review/);
});

test('checks read with an older head than the PR now has are not trusted as green', async () => {
  const { byPr } = await run({ prs: [pr(63, { head: A })], details: { 63: detail(63, { head: B }) } });
  assert.equal(byPr[63].head, B);
  assert.ok(byPr[63].checks.pending.length > 0);
  const act = byPr[63].actions.join(';');
  assert.match(act, /CI running/);
  assert.doesNotMatch(act, /needs first orchestrator review/);
});

test('a check named in ignoreActivityChecks is not activity', async () => {
  const checks = [
    { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: ago(8) },
    { __typename: 'StatusContext', context: VERDICT, state: 'SUCCESS', startedAt: ago(8) },
    { __typename: 'StatusContext', context: 'main-green', state: 'SUCCESS', startedAt: ago(0.1) },
  ];
  const { byPr } = await run({ prs: [pr(70, { idle: 8, checks })], details: { 70: detail(70, { idle: 8 }) }, tickets: [ticket('ENG-70', 70)], box: tmpBox({ ignoreActivityChecks: ['^main-green$'] }) });
  assert.equal(byPr[70].bucket, 'OWNED BUT STALE');
});

test('a board that does not answer is reported, and the sweep still runs', async () => {
  const { report, byPr } = await run({ prs: [pr(80)], board: async () => { throw new Error('ECONNREFUSED'); } });
  assert.match(report, /! the queue board isn't answering \(ECONNREFUSED\)/);
  assert.equal(byPr[80].bucket, 'NO OWNER');
});

test('dueAt: due now with no state or a future one, else 6h after the last run', () => {
  assert.equal(dueAt({}, 6, NOW), NOW);
  assert.equal(dueAt({ lastRun: 'garbage' }, 6, NOW), NOW);
  assert.equal(dueAt({ lastRun: ago(1) }, 6, NOW), NOW + 5 * H);
  assert.equal(dueAt({ lastRun: ago(7) }, 6, NOW), NOW - 1 * H);
  assert.equal(dueAt({ lastRun: new Date(NOW + 48 * H).toISOString() }, 6, NOW), NOW, 'a future lastRun counts as none');
});

// A fake clock: sleep advances it instantly. Every now() also counts toward a cap, so a watch loop that never sleeps
// (a broken due time) fails the test instead of spinning on microtasks forever.
function clock(start = NOW) {
  let t = start;
  let reads = 0;
  return {
    now: () => {
      if (++reads > 10_000) throw new Error('watch loop never slept: due-time logic is broken');
      return t;
    },
    sleep: async (ms) => { t += ms; },
  };
}

test('watch: a restarted watcher does not re-fire early, it sweeps 6h after the last run', async () => {
  const statePath = tmpBox().s.state;
  fs.writeFileSync(statePath, JSON.stringify({ lastRun: ago(1) }));
  const c = clock();
  const sweeps = [];
  const res = await watch({ everyHours: 6, statePath, now: c.now, sleep: c.sleep, sweepOnce: async () => { sweeps.push(c.now()); return { attention: 1, ok: 0, report: 'R' }; } });
  assert.deepEqual(sweeps, [NOW + 5 * H]);
  assert.deepEqual(res, { code: 0, out: 'R' });
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).lastRun, new Date(NOW + 5 * H).toISOString());
  // Restarted right after that event: nothing until 6h later.
  const sweeps2 = [];
  await watch({ everyHours: 6, statePath, now: c.now, sleep: c.sleep, sweepOnce: async () => { sweeps2.push(c.now()); return { attention: 1, ok: 0, report: 'R' }; } });
  assert.deepEqual(sweeps2, [NOW + 11 * H]);
});

test('watch: all OK keeps waiting and records each run, exits 2 after 24 quiet hours; --every-hours is honored', async () => {
  const statePath = tmpBox().s.state;
  const c = clock();
  const sweeps = [];
  const res = await watch({ everyHours: 6, statePath, now: c.now, sleep: c.sleep, sweepOnce: async () => { sweeps.push((c.now() - NOW) / H); return { attention: 0, ok: 3, report: 'quiet' }; } });
  assert.equal(res.code, 2);
  assert.deepEqual(sweeps, [0, 6, 12, 18]);
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).lastRun, new Date(NOW + 18 * H).toISOString());
  const c2 = clock();
  fs.rmSync(statePath);
  const sweeps2 = [];
  await watch({ everyHours: 8, statePath, now: c2.now, sleep: c2.sleep, sweepOnce: async () => { sweeps2.push((c2.now() - NOW) / H); return { attention: 0, ok: 1 }; } });
  assert.deepEqual(sweeps2, [0, 8, 16]);
});

test('watch: a run recorded elsewhere while it sleeps postpones the sweep', async () => {
  const statePath = tmpBox().s.state;
  fs.writeFileSync(statePath, JSON.stringify({ lastRun: ago(5) }));
  const c = clock();
  let slept = 0;
  const sleep = async (ms) => { await c.sleep(ms); if (++slept === 1) fs.writeFileSync(statePath, JSON.stringify({ lastRun: new Date(c.now()).toISOString() })); };
  const sweeps = [];
  await watch({ everyHours: 6, statePath, now: c.now, sleep, sweepOnce: async () => { sweeps.push((c.now() - NOW) / H); return { attention: 1, report: 'R' }; } });
  assert.deepEqual(sweeps, [6 + 1 / 6]); // the --now run 10 minutes in moved the next sweep to 6h after it
});

test('watch: three failed sweeps in a row end it with exit 1', async () => {
  const c = clock();
  const res = await watch({ everyHours: 6, statePath: tmpBox().s.state, now: c.now, sleep: c.sleep, sweepOnce: async () => { throw new Error('gh: HTTP 502'); } });
  assert.equal(res.code, 1);
  assert.match(res.out, /failed 3 times in a row: gh: HTTP 502/);
});

test('own and release keep pr-owners.json one entry per PR', () => {
  const file = tmpBox().s.owners;
  own(file, 4767, 'merge train', 'orchestrator', NOW);
  own(file, 4705, 'agent', 'orchestrator', NOW);
  own(file, 4767, 'wait job', 'orchestrator', NOW + H);
  assert.deepEqual(loadOwners(file).map((e) => [e.pr, e.note, e.since]), [[4705, 'agent', ago(0)], [4767, 'wait job', new Date(NOW + H).toISOString()]]);
  assert.equal(release(file, 4767), 1);
  assert.equal(release(file, 4767), 0);
  assert.deepEqual(loadOwners(file).map((e) => e.pr), [4705]);
});


test('a clean, approved PR that GitHub reads as BLOCKED is not told to re-queue', async () => {
  const { byPr } = await run({ prs: [pr(64, { idle: 3 })], details: { 64: detail(64, { idle: 3, state: 'BLOCKED' }) }, approvals: [{ pr: 64, head: A }] });
  const act = byPr[64].actions.join(';');
  assert.match(act, /merge state BLOCKED: see what blocks it/);
  assert.doesNotMatch(act, /re-queue/);
});

test('a board ticket found by branch (pr.number, no prNumber) owns its PR, and a rerun with a zero end time reads as running', async () => {
  const { byPr } = await run({ prs: [pr(65)], tickets: [ticket('ENG-65', null, { pr: { number: 65 }, workerState: 'working' })] });
  assert.equal(byPr[65].bucket, 'OK');
  const rerun = [
    { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: ago(30), completedAt: ago(29) },
    { __typename: 'CheckRun', name: 'quality', status: 'IN_PROGRESS', conclusion: '', startedAt: ago(0.1), completedAt: '0001-01-01T00:00:00Z' },
    { __typename: 'StatusContext', context: VERDICT, state: 'SUCCESS', startedAt: ago(1) },
  ];
  const r = await run({ prs: [pr(66, { checks: rerun })] });
  assert.deepEqual(r.byPr[66].checks.pending, ['quality']);
});

test('a queued re-run with no start time ranks newer than an older pass', async () => {
  const checks = [
    { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: ago(30), completedAt: ago(29) },
    { __typename: 'CheckRun', name: 'quality', status: 'QUEUED', conclusion: null, startedAt: null, completedAt: null },
    { __typename: 'StatusContext', context: VERDICT, state: 'SUCCESS', startedAt: ago(1) },
  ];
  const { byPr } = await run({ prs: [pr(67, { checks })], approvals: [{ pr: 67, head: A }] });
  assert.deepEqual(byPr[67].checks.pending, ['quality']);
  assert.doesNotMatch(byPr[67].actions.join(';'), /re-queue/);
});

test('a PR the detail read missed, or one with over 100 threads, is never ready', async () => {
  const fake = fakeGh([pr(68)], {});
  const gh = (args) => (args[1] === 'graphql' ? { data: { repository: {} } } : fake.gh(args));
  const box = tmpBox();
  fs.writeFileSync(box.s.owners, '[]');
  const data = await collect(box.s, { gh, board: async () => ({ tickets: [] }) });
  const row = classifyAll(data, NOW, box.s).rows[0];
  assert.match(row.actions.join(';'), /its details could not be read/);
  assert.doesNotMatch(row.actions.join(';'), /needs first orchestrator review/);
  const many = { ...detail(69), reviewThreads: { pageInfo: { hasNextPage: true }, nodes: [] } };
  const { byPr, report } = await run({ prs: [pr(69)], details: { 69: many } });
  assert.match(byPr[69].actions.join(';'), /over 100 review threads/);
  assert.doesNotMatch(byPr[69].actions.join(';'), /needs first orchestrator review/);
  assert.match(report, /over 100 open threads/);
});

test('a review still running after CI finished gets a next step', async () => {
  const checks = [
    { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: ago(1) },
    { __typename: 'CheckRun', name: VERDICT, status: 'IN_PROGRESS', conclusion: null, startedAt: ago(0.2) },
  ];
  const { byPr } = await run({ prs: [pr(71, { checks })] });
  assert.equal(byPr[71].checks.verdict, 'pending');
  assert.match(byPr[71].actions.join(';'), /review running/);
});

// ---- the CLI, with a fake gh on PATH and the board on a local port ----------------------------------------------
const execFileP = promisify(execFile);

function fakeGhBin(dir, prs, details) {
  fs.writeFileSync(path.join(dir, 'prs.json'), JSON.stringify(prs));
  fs.writeFileSync(path.join(dir, 'details.json'), JSON.stringify(details));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), `#!${process.execPath}
const fs = require('fs'), path = require('path');
const dir = ${JSON.stringify(dir)};
const a = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'calls.log'), a[0] + ' ' + a[1] + '\\n');
if (a[0] === 'pr') process.stdout.write(fs.readFileSync(path.join(dir, 'prs.json')));
else if (a[1] === 'graphql') {
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'details.json'), 'utf8'));
  const nums = [...a[3].matchAll(/pullRequest\\(number:(\\d+)\\)/g)].map((m) => m[1]);
  process.stdout.write(JSON.stringify({ data: { repository: Object.fromEntries(nums.map((n) => ['p' + n, d[n]])) } }));
} else process.exit(1);
`, { mode: 0o755 });
  return bin;
}

test('CLI: --now prints the report and records the run; own and release edit the claims', async () => {
  const box = tmpBox({ reportOnlyAuthors: ['teammate'] });
  const now = Date.now();
  const recent = new Date(now - 3 * H).toISOString();
  const prs = [pr(90), pr(91), pr(92, { author: 'teammate' })].map((p) => ({ ...p, updatedAt: recent }));
  const details = { 90: { ...detail(90), commits: { nodes: [{ commit: { committedDate: recent } }] } }, 91: { ...detail(91), commits: { nodes: [{ commit: { committedDate: recent } }] } } };
  const bin = fakeGhBin(box.home, prs, details);
  const server = http.createServer((req, res) => {
    assert.equal(req.headers['x-board'], 'read');
    res.end(JSON.stringify({ tickets: [ticket('ENG-91', 91)] }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { ...process.env, HOME: box.home, AGENT_QUEUE_CONFIG: box.configFile, PATH: `${bin}:${process.env.PATH}`, FORGE_BOARD_URL: `http://127.0.0.1:${server.address().port}/api/snapshot` };
  try {
    const { stdout } = await execFileP(process.execPath, [SCRIPT, '--now'], { env });
    assert.match(stdout, /1 need attention, 1 OK/);
    assert.match(stdout, /NO OWNER \(1\)\n- #90 ENG-90 \[CLEAN\] owner: none/);
    assert.match(stdout, /! couldn't read main's required checks/);
    assert.match(stdout, /Report only \(1\): #92/);
    assert.ok(Date.parse(JSON.parse(fs.readFileSync(box.s.state, 'utf8')).lastRun) >= now);
    assert.deepEqual(fs.readFileSync(path.join(box.home, 'calls.log'), 'utf8').trim().split('\n'), ['pr list', 'api repos/your-org/your-app/rules/branches/main', 'api graphql']);
    await execFileP(process.execPath, [SCRIPT, 'own', '90', 'merge train', '--owner', 'test-orch'], { env });
    assert.deepEqual(loadOwners(box.s.owners).map((e) => [e.pr, e.owner, e.note]), [[90, 'test-orch', 'merge train']]);
    const second = await execFileP(process.execPath, [SCRIPT, '--now'], { env });
    assert.match(second.stdout, /0 need attention, 2 OK/);
    await execFileP(process.execPath, [SCRIPT, 'release', '90'], { env });
    assert.deepEqual(loadOwners(box.s.owners), []);
  } finally {
    server.close();
  }
});
