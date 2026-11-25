// merge-approved.mjs, run as a subprocess against a copy of lib/ and inbox/ in a throwaway folder, with a stub gh and
// git first on PATH (fake-gh.cjs) and stub premerge-check, merged-to-verifying and lease scripts. Nothing reaches
// GitHub, Linear or a real checkout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const SITE = 'your-org/your-site';
const MERGED_POLL = '{"state":"MERGED","mergeQueueEntry":null,"timelineItems":{"nodes":[]}}';
const STALE_REMOVAL = { __typename: 'RemovedFromMergeQueueEvent', createdAt: '2020-01-01T00:00:00Z', reason: 'failed_checks' };
const FRESH = (reason) => JSON.stringify({ state: 'OPEN', mergeQueueEntry: null, timelineItems: { nodes: [{ __typename: 'RemovedFromMergeQueueEvent', createdAt: '2099-01-01T00:00:00Z', reason }] } });

function sandbox(merge = {}) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-approved-'));
  const root = path.join(t, 'forge');
  for (const d of ['lib', 'inbox']) fs.cpSync(path.join(ROOT, d), path.join(root, d), { recursive: true, filter: (s) => !s.includes(`${path.sep}test`) });
  fs.mkdirSync(path.join(root, 'dispatcher'));
  const fake = path.join(t, 'fake');
  const bin = path.join(t, 'bin');
  const state = path.join(t, 'state');
  const shared = path.join(t, 'shared');
  for (const d of [fake, bin, state, shared, path.join(t, 'repo')]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(ROOT, 'inbox/test/fake-gh.cjs')}" "$@"\n`);
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh
# git -C <repo> cat-file -e origin/main:<file> succeeds when <file> is a line of $FAKE/main-files; anything else is a no-op.
[ "$3" = cat-file ] && exec grep -qxF -- "\${5#origin/main:}" "$FAKE/main-files"
exit 0
`);
  for (const f of ['gh', 'git']) fs.chmodSync(path.join(bin, f), 0o755);
  fs.writeFileSync(path.join(fake, 'main-files'), 'migrations/20261122800000_main.sql\n');
  fs.writeFileSync(path.join(fake, 'calls.log'), '');
  fs.writeFileSync(path.join(root, 'dispatcher/premerge-check.mjs'), `import fs from 'node:fs';
const pr = process.argv[2];
fs.appendFileSync(process.env.FAKE + '/calls.log', 'premerge ' + pr + '\\n');
const fail = fs.existsSync(process.env.FAKE + '/premerge-fail-' + pr);
if (fs.existsSync(process.env.FAKE + '/premerge-takes-lock')) fs.writeFileSync('${state}/orchestrator-session', 'other-session\\n');
console.log(fail ? 'premerge-check: FAIL (fake)' : 'premerge-check: pass (fake)');
process.exit(fail ? 1 : 0);
`);
  fs.writeFileSync(path.join(root, 'inbox/merged-to-verifying.mjs'), `import fs from 'node:fs';
fs.appendFileSync(process.env.FAKE + '/calls.log', 'to-verifying ' + process.argv.slice(2).join(' ') + '\\n');
`);
  fs.writeFileSync(path.join(root, 'inbox/lease.sh'), 'echo "lease $*" >> "$FAKE/calls.log"\n');
  fs.writeFileSync(path.join(state, 'orchestrator-session'), 'test-driver\n');
  fs.writeFileSync(path.join(shared, 'main-state.json'), '{"status":"green"}');
  const cfg = { ...EXAMPLE, repoPath: path.join(t, 'repo'), paths: { stateDir: state, sharedDir: shared }, merge: { ...EXAMPLE.merge, ...merge } };
  const configFile = path.join(t, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(cfg));
  const box = {
    t, root, fake, state, shared, configFile, out: '', rc: null,
    approvals: path.join(shared, 'approvals.jsonl'),
    run(argv, { sid = 'test-driver', env = {} } = {}) {
      const r = spawnSync(process.execPath, [path.join(root, 'inbox/merge-approved.mjs'), ...argv], {
        encoding: 'utf8', timeout: 30_000,
        env: { PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: t, FAKE: fake, AGENT_QUEUE_CONFIG: configFile, FORGE_SLEEP_SCALE: '0', CLAUDE_CODE_SESSION_ID: sid, ...env },
      });
      box.out = `${r.stdout}${r.stderr}`;
      box.rc = r.status;
      return box;
    },
    // pr(n, head, edit): a green, clean, open PR fixture; edit adjusts it.
    pr(n, head, edit = (p) => p) {
      const p = { number: n, id: `PR_${n}`, state: 'OPEN', isDraft: false, title: `PR ${n}`, labels: [], headRefOid: head, headRefName: `branch-${n}`,
        isCrossRepository: false, mergeStateStatus: 'CLEAN', files: [{ path: 'src/x.ts' }], mergeCommit: { oid: 'c'.repeat(40) },
        statusCheckRollup: [{ name: 'build', conclusion: 'SUCCESS' }, { name: 'Claude Code Review', conclusion: 'SUCCESS' }] };
      box.write(`pr-${n}.json`, edit(p));
      return box;
    },
    approve(n, head, note = 'checked', repo) {
      fs.appendFileSync(box.approvals, `${JSON.stringify({ pr: n, head, approvedAt: new Date().toISOString(), by: 'old-session', note, ...(repo ? { repo } : {}) })}\n`);
    },
    poll(n, ...lines) { box.write(`poll-${n}`, lines.join('\n')); },
    write(f, v) { fs.writeFileSync(path.join(fake, f), typeof v === 'string' ? v : JSON.stringify(v)); },
    calls: () => fs.readFileSync(path.join(fake, 'calls.log'), 'utf8'),
    enqueued: () => (fs.existsSync(path.join(fake, 'enqueued')) ? fs.readFileSync(path.join(fake, 'enqueued'), 'utf8').trim().split('\n').join(' ') : ''),
    ledger: () => (fs.existsSync(box.approvals) ? fs.readFileSync(box.approvals, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []),
  };
  return box;
}
const has = (box, s) => assert.ok(box.out.includes(s), `expected ${JSON.stringify(s)} in:\n${box.out}`);
const lacks = (box, s) => assert.ok(!box.out.includes(s), `did not expect ${JSON.stringify(s)} in:\n${box.out}`);

test('only the driver approves or merges', () => {
  const box = sandbox().pr(1, A);
  box.run(['1'], { sid: 'someone-else' });
  assert.equal(box.rc, 1);
  has(box, 'not the orchestrator (driver is test-driver)');
  assert.ok(!box.calls().includes('pr merge'));
  box.run(['--approve', '1', A, 'note'], { sid: 'someone-else' });
  assert.equal(box.rc, 1);
  assert.deepEqual(box.ledger(), []);
  box.run(['--approved'], { sid: 'someone-else' });
  assert.equal(box.rc, 0, 'listing works from any session');
  box.run(['1'], { sid: '' });
  assert.equal(box.rc, 0, 'a shell outside Claude Code is the human');
});

test('an approval is recorded for the exact head, honored, and closed by the merge', () => {
  const box = sandbox().pr(101, A);
  box.run(['--approve', '101', A, 'checked the diff']);
  assert.equal(box.rc, 0, box.out);
  assert.deepEqual(box.ledger().map(({ pr, head, by, note, repo }) => ({ pr, head, by, note, repo })), [{ pr: 101, head: A, by: 'test-driver', note: 'checked the diff', repo: 'your-org/your-app' }]);
  box.run(['101']);
  assert.equal(box.rc, 0, box.out);
  has(box, 'approved at');
  has(box, 'checked the diff');
  has(box, 'MERGED #101');
  has(box, 'ALL MERGED');
  assert.equal(box.enqueued(), '101');
  assert.match(box.calls(), /premerge 101/);
  assert.match(box.calls(), /lease renew/);
  assert.match(box.calls(), /to-verifying 101 your-org\/your-app/);
  assert.match(box.calls(), /gh api -X DELETE repos\/your-org\/your-app\/git\/refs\/heads\/branch-101/);
  const last = box.ledger().at(-1);
  assert.equal(last.event, 'merged');
  assert.equal(last.head, A);
  box.run(['--approved']);
  lacks(box, '#101');
});

test('a merged line is not an approval', () => {
  const box = sandbox().pr(120, A);
  fs.writeFileSync(box.approvals, `${JSON.stringify({ pr: 120, head: A, event: 'merged', merged: true, at: '2026-01-01T00:00:00Z' })}\n`);
  box.run(['120']);
  has(box, 'no approval on file');
});

test('--approve refuses a head that is not current', () => {
  const box = sandbox().pr(102, B);
  box.run(['--approve', '102', A, 'old head']);
  assert.equal(box.rc, 1);
  has(box, `current head is ${B}`);
  assert.deepEqual(box.ledger(), []);
  box.run(['--approve', '102', 'abc', 'short']);
  has(box, 'usage: merge-approved.sh --approve');
});

test("an older head's approval does not cover a new head", () => {
  const box = sandbox().pr(103, B);
  box.approve(103, A);
  box.run(['103']);
  assert.equal(box.rc, 1);
  has(box, `approval on file is for head ${A.slice(0, 10)}`);
  has(box, `--approve 103 ${B}`);
  assert.ok(!box.calls().includes('premerge 103'));
  assert.equal(box.enqueued(), '');
});

test('with no approval on file a passing run records its head, and a stopped run records nothing', () => {
  const box = sandbox().pr(104, A);
  box.run(['104']);
  assert.equal(box.rc, 0, box.out);
  assert.equal(box.ledger()[0].head, A);
  assert.equal(box.ledger()[0].note, 'recorded by a merge run on this head');
  box.pr(106, A, (p) => ({ ...p, statusCheckRollup: [...p.statusCheckRollup, { name: 'test', status: 'IN_PROGRESS', conclusion: null }] }));
  box.run(['106']);
  has(box, 'STOP at #106: check(s) failing or pending: test');
  assert.ok(!box.ledger().some((r) => r.pr === 106), 'a held PR gets no approval line');
});

test('a failing pre-merge check stops an approved PR', () => {
  const box = sandbox().pr(105, A);
  box.approve(105, A);
  box.write('premerge-fail-105', '');
  box.run(['105']);
  assert.equal(box.rc, 1);
  has(box, 'pre-merge check did not pass');
  assert.equal(box.enqueued(), '');
});

test('--approved lists current and stale approvals; --all-approved merges only current ones', () => {
  const box = sandbox().pr(110, A).pr(111, B).pr(112, A, (p) => ({ ...p, state: 'MERGED' }));
  box.approve(110, A, 'current one');
  box.approve(111, A, 'stale one');
  box.approve(112, A, 'merged one');
  box.run(['--approved']);
  assert.equal(box.rc, 0);
  has(box, `#110 head ${A.slice(0, 10)} approved 0h00m ago by old-sess: current one [current head]`);
  has(box, `#111 head ${A.slice(0, 10)}`);
  has(box, `STALE: head is now ${B.slice(0, 10)}`);
  lacks(box, '#112');
  box.run(['--all-approved']);
  assert.equal(box.rc, 0, box.out);
  assert.equal(box.enqueued(), '110');
});

test('every passing PR is enqueued before the first poll, lowest new migration first', () => {
  const box = sandbox()
    .pr(201, A, (p) => ({ ...p, files: [{ path: 'migrations/20261122900002_b.sql' }] }))
    .pr(202, A)
    .pr(203, A, (p) => ({ ...p, files: [{ path: 'migrations/20261122900001_a.sql' }, { path: 'migrations/20261122900009_c.sql' }] }))
    .pr(204, A, (p) => ({ ...p, files: [{ path: 'migrations/20261122900003_d.sql' }] }))
    .pr(205, A, (p) => ({ ...p, files: [{ path: 'migrations/20261122800000_main.sql' }] }));
  box.run(['201', '202', '203', '204', '205']);
  assert.equal(box.rc, 0, box.out);
  assert.equal(box.enqueued(), '203 201 204 202 205', 'a file main already has is not a new migration');
  const calls = box.calls();
  assert.ok(calls.lastIndexOf('pr merge') < calls.indexOf('timelineItems'), 'all enqueued before polling');
});

test('a migration file name a PR ahead in the queue already adds stops the PR', () => {
  const box = sandbox().pr(206, A, (p) => ({ ...p, files: [{ path: 'migrations/20261122900005_x.sql' }] }));
  box.write('queue.json', { data: { repository: { mergeQueue: { entries: { nodes: [{ pullRequest: { number: 9, files: { nodes: [{ path: 'migrations/20261122900005_x.sql' }] } } }] } } } } });
  box.run(['206']);
  assert.equal(box.rc, 1);
  has(box, 'same file name as a PR ahead in the merge queue');
});

const runs = (...r) => JSON.stringify(r.map(([id, conclusion, status = 'completed']) => ({ databaseId: id, status, conclusion, headBranch: `gh-readonly-queue/main/pr-${id}-x`, createdAt: '2026-01-01T00:00:00Z' })));
const jobs = (box, id, list) => box.write(`jobs-${id}.json`, { jobs: Object.entries(list).map(([name, conclusion]) => ({ name, conclusion })) });

test('the CI hold: two runs failing on the same job hold the queue, except a fix, a revert, or the probe', () => {
  const box = sandbox();
  box.write('runs.json', runs([9, 'cancelled'], [8, '', 'in_progress'], [7, 'failure'], [6, 'failure'], [5, 'success']));
  jobs(box, 7, { lint: 'success', 'test-api (2/2)': 'failure' });
  jobs(box, 6, { lint: 'failure', 'test-api (2/2)': 'failure' });
  box.pr(301, A).pr(302, A, (p) => ({ ...p, labels: [{ name: 'fixes-main' }] })).pr(303, A, (p) => ({ ...p, title: 'Revert "something"' })).pr(304, A);
  box.run(['301', '302', '303', '304'], { env: { QUEUE_PROBE_PR: '304' } });
  assert.equal(box.rc, 1);
  has(box, "failed on job 'test-api (2/2)'");
  has(box, '(7 and 6)');
  has(box, 'PAUSED before #301');
  has(box, '#304 goes in as the one probe');
  assert.equal(box.enqueued(), '302 303 304');
});

test('the CI hold counts root failures only, lifts when a later run passes the job, and is off with ciHold false', () => {
  const box = sandbox();
  box.write('ci.yml', 'name: CI\njobs:\n  test-api:\n    runs-on: x\n  test-web:\n    runs-on: x\n  quality:\n    needs:\n      [\n        test-api,\n        test-web, # the rollup\n      ]\n');
  box.write('runs.json', runs([7, 'failure'], [6, 'failure']));
  jobs(box, 7, { 'test-web (1/1)': 'failure', quality: 'failure' });
  jobs(box, 6, { 'test-api (2/2)': 'failure', quality: 'failure' });
  box.pr(306, A).run(['306']);
  lacks(box, 'PAUSED');
  jobs(box, 7, { 'test-api (2/2)': 'failure', quality: 'failure' });
  box.pr(307, A).run(['307']);
  has(box, "PAUSED before #307: the merge queue's last two runs (7 and 6) failed on job 'test-api (2/2)'");

  const lifted = sandbox();
  lifted.write('runs.json', runs([8, 'failure'], [7, 'failure'], [6, 'failure']));
  jobs(lifted, 8, { lint: 'failure', 'test-api (2/2)': 'success' });
  jobs(lifted, 7, { 'test-api (2/2)': 'failure' });
  jobs(lifted, 6, { 'test-api (2/2)': 'failure' });
  lifted.pr(308, A).run(['308']);
  lacks(lifted, 'PAUSED');
  assert.equal(lifted.enqueued(), '308');

  const off = sandbox({ ciHold: false });
  off.write('runs.json', runs([7, 'failure'], [6, 'failure']));
  jobs(off, 7, { x: 'failure' });
  jobs(off, 6, { x: 'failure' });
  off.pr(309, A).run(['309']);
  lacks(off, 'PAUSED');
  assert.ok(!off.calls().includes('run view'));
});

test('queue watching: stale removals, live entries and rebuilt groups are not ejections', () => {
  const box = sandbox().pr(401, A).pr(402, A).pr(403, A);
  const stale = JSON.stringify({ state: 'OPEN', mergeQueueEntry: null, timelineItems: { nodes: [STALE_REMOVAL] } });
  box.poll(401, stale, stale, stale, stale, MERGED_POLL);
  const live = (s) => JSON.stringify({ state: 'OPEN', mergeQueueEntry: { state: s }, timelineItems: { nodes: [STALE_REMOVAL] } });
  box.poll(402, live('AWAITING_CHECKS'), live('AWAITING_CHECKS'), MERGED_POLL);
  box.poll(403, live('QUEUED'), live('QUEUED'), MERGED_POLL);
  box.write('runs.json', JSON.stringify([
    { databaseId: 42, status: 'in_progress', conclusion: '', headBranch: 'gh-readonly-queue/main/pr-402-abc', createdAt: '2099-01-01T00:00:00Z' },
    { databaseId: 43, status: 'completed', conclusion: 'cancelled', headBranch: 'gh-readonly-queue/main/pr-403-abc', createdAt: '2099-01-01T00:00:00Z' },
  ]));
  box.run(['401', '402', '403']);
  assert.equal(box.rc, 0, box.out);
  has(box, "predates this run's enqueue");
  has(box, 'merge-group CI in_progress (run 42); not an ejection');
  has(box, 'rebuilt: merge-group run 43 was cancelled');
  lacks(box, 'STOP');
});

test('queue watching: a fresh removal is an ejection, a conflict names the fix, and one ejection leaves the rest', () => {
  const box = sandbox().pr(404, A).pr(405, A).pr(406, A).pr(407, A);
  box.poll(404, FRESH('failed_checks'));
  box.poll(405, FRESH('merge_conflict'));
  box.poll(406, JSON.stringify({ state: 'OPEN', mergeQueueEntry: null, timelineItems: { nodes: [{ __typename: 'AddedToMergeQueueEvent', createdAt: '2020-01-01T00:00:00Z' }] } }));
  box.write('runs.json', JSON.stringify([{ databaseId: 44, status: 'completed', conclusion: 'failure', headBranch: 'gh-readonly-queue/main/pr-404-abc', createdAt: '2099-01-01T00:00:00Z' }]));
  box.run(['404', '405', '406', '407']);
  assert.equal(box.rc, 1);
  has(box, 'STOP at #404: ejected');
  has(box, 'gh run view 44 --log-failed');
  has(box, '#405 needs a merge of main');
  has(box, "no removal event newer than this run's enqueue");
  has(box, 'MERGED #407');
  has(box, 'NOT MERGED: #404 #405 #406; merged: #407');
});

test('an accepted merge with no queue entry is enqueued directly, and a refused direct enqueue stops', () => {
  const box = sandbox().pr(410, A).pr(411, A);
  box.write('entry-410.json', { state: 'OPEN', mergeQueueEntry: null });
  box.run(['410']);
  assert.equal(box.rc, 0, box.out);
  has(box, 'enqueued directly');
  assert.equal(box.enqueued(), '410 enqueue');
  box.write('entry-411.json', { state: 'OPEN', mergeQueueEntry: null });
  box.write('enqueue-refuse', '');
  box.run(['411']);
  has(box, 'STOP at #411: gh reported the merge accepted, but the PR has no merge queue entry');
});

test('MERGE_JUMP sends the PR to the front of the queue', () => {
  const box = sandbox().pr(412, A);
  box.run(['412'], { env: { MERGE_JUMP: '1' } });
  assert.equal(box.rc, 0, box.out);
  assert.equal(box.enqueued(), 'jump');
});

test('holds: a draft, a red main (except a fix), a conflict', () => {
  const box = sandbox().pr(501, A, (p) => ({ ...p, isDraft: true }));
  box.run(['501']);
  has(box, 'it is a draft');
  fs.writeFileSync(path.join(box.shared, 'main-state.json'), '{"status":"red"}');
  box.pr(502, A).pr(503, A, (p) => ({ ...p, labels: [{ name: 'fixes-main' }] }));
  box.run(['502', '503']);
  has(box, 'STOP before #502: main is red');
  assert.equal(box.enqueued(), '503');
  fs.writeFileSync(path.join(box.shared, 'main-state.json'), '{"status":"green"}');
  box.pr(505, A, (p) => ({ ...p, mergeStateStatus: 'DIRTY' })).run(['505']);
  has(box, 'STOP at #505: merge state DIRTY');
});

test('review checks: any configured name counts, support checks are forgiven once it passed, a failed review stops', () => {
  const box = sandbox({ reviewChecks: ['Claude Code Review', 'Claude Code Review verdict'], reviewSupportChecks: ['request-review'] });
  box.pr(507, A, (p) => ({ ...p, statusCheckRollup: [{ name: 'build', conclusion: 'SUCCESS' }, { name: 'Claude Code Review', conclusion: 'FAILURE' }, { name: 'Claude Code Review verdict', conclusion: 'SUCCESS' }, { name: 'request-review', conclusion: 'FAILURE' }] }));
  box.run(['507']);
  assert.equal(box.rc, 0, box.out);
  assert.equal(box.enqueued(), '507');
  box.pr(508, A, (p) => ({ ...p, statusCheckRollup: [{ name: 'build', conclusion: 'SUCCESS' }, { name: 'Claude Code Review verdict', conclusion: 'FAILURE' }, { name: 'request-review', conclusion: 'FAILURE' }] }));
  box.run(['508']);
  has(box, 'STOP at #508: review not passed (Claude Code Review or Claude Code Review verdict)');
  box.pr(509, A, (p) => ({ ...p, statusCheckRollup: [{ name: 'build', conclusion: 'SUCCESS' }] }));
  box.run(['509']);
  has(box, 'STOP at #509: review not passed');
});

test('the driver lock is read again right before the enqueue', () => {
  const box = sandbox().pr(510, A);
  box.write('premerge-takes-lock', '');
  box.run(['510']);
  assert.equal(box.rc, 1);
  has(box, 'lost the orchestrator lock during the run (driver is now other-session)');
  assert.equal(box.enqueued(), '');
});

test('runs without lease.sh', () => {
  const box = sandbox().pr(601, A);
  fs.rmSync(path.join(box.root, 'inbox/lease.sh'));
  box.run(['601']);
  assert.equal(box.rc, 0, box.out);
  assert.ok(!box.calls().includes('lease'));
});

test('merge.mode direct squash-merges github.repo at its head and waits for MERGED', () => {
  const box = sandbox({ mode: 'direct' }).pr(620, A);
  box.write('merge-marks-merged', '');
  box.run(['620']);
  assert.equal(box.rc, 0, box.out);
  assert.match(box.calls(), new RegExp(`gh pr merge 620 --repo your-org/your-app --squash --match-head-commit ${A}\\n`));
  assert.ok(!box.calls().includes('timelineItems'), 'no queue wait');
  has(box, 'MERGED #620');
});

// --repo: the example's merge.repos entry for your-org/your-site (direct, review check "review", required "quality",
// ignores "^Preview: ", resolved threads), with BLOCKED accepted and --admin for these cases.
const site = (edit = (p) => p) => {
  const box = sandbox({ repos: { [SITE]: { ...EXAMPLE.merge.repos[SITE], reviewGateBlocks: true, adminMerge: true } } });
  box.write('merge-marks-merged', '');
  box.site = (n, head, e = (p) => p) => box.pr(n, head, (p) => e(edit({ ...p, mergeStateStatus: 'BLOCKED',
    statusCheckRollup: [{ name: 'quality', conclusion: 'SUCCESS' }, { name: 'review', conclusion: 'CANCELLED' }, { name: 'review', conclusion: 'SUCCESS' }, { name: 'Preview: site', conclusion: 'FAILURE' }] })));
  return box;
};

test('--repo: a green PR in another repo merges directly with --admin at its head', () => {
  const box = site();
  box.site(701, A);
  box.run(['--repo', SITE, '--approve', '701', A, 'checked the preview']);
  assert.equal(box.rc, 0, box.out);
  assert.equal(box.ledger()[0].repo, SITE);
  box.run(['--repo', SITE, '701']);
  assert.equal(box.rc, 0, box.out);
  has(box, 'approved at');
  assert.match(box.calls(), new RegExp(`gh pr merge 701 --repo ${SITE} --squash --match-head-commit ${A} --admin`));
  assert.ok(!box.calls().includes('premerge'), 'no pre-merge check outside github.repo');
  has(box, `MERGED #701 in ${SITE}`);
  has(box, 'ALL MERGED');
  assert.equal(box.ledger().at(-1).event, 'merged');
  assert.match(box.calls(), new RegExp(`to-verifying 701 ${SITE}`));
});

test('--repo: a failed required check, a pending review, an open thread or a conflict stops it', () => {
  const box = site();
  box.site(702, A, (p) => ({ ...p, statusCheckRollup: [{ name: 'quality', conclusion: 'FAILURE' }, ...p.statusCheckRollup.slice(1)] })).run(['--repo', SITE, '702']);
  has(box, 'STOP at #702: quality not passed');
  box.site(703, A, (p) => ({ ...p, statusCheckRollup: [{ name: 'quality', conclusion: 'SUCCESS' }, { name: 'review', status: 'IN_PROGRESS', conclusion: null }] })).run(['--repo', SITE, '703']);
  has(box, 'STOP at #703: review not passed');
  box.site(704, A);
  box.write('threads-704.json', { reviewThreads: { nodes: [{ isResolved: false }] } });
  box.run(['--repo', SITE, '704']);
  has(box, 'STOP at #704: 1 unresolved review thread(s)');
  box.site(705, A, (p) => ({ ...p, mergeStateStatus: 'DIRTY' })).run(['--repo', SITE, '705']);
  has(box, 'STOP at #705: merge state DIRTY');
  assert.equal(box.enqueued(), '');
});

test('--repo: approvals stay with their repo, and an unknown or malformed repo is refused', () => {
  const box = site();
  box.site(706, B);
  box.approve(706, A, 'an app PR with the same number');
  box.run(['--repo', SITE, '--approve', '706', B, 'the site check']);
  box.run(['--approved']);
  has(box, 'an app PR with the same number');
  lacks(box, 'the site check');
  box.run(['--repo', SITE, '--approved']);
  has(box, 'the site check');
  lacks(box, 'an app PR with the same number');
  box.site(707, B);
  box.approve(707, A, 'an app PR with the same number');
  box.run(['--repo', SITE, '707']);
  has(box, 'no approval on file');
  assert.equal(box.rc, 0, box.out);
  box.run(['--repo', 'your-org/elsewhere', '1']);
  assert.equal(box.rc, 1);
  has(box, 'neither github.repo nor in merge.repos');
  box.run(['--repo', 'nonsense', '1']);
  has(box, 'usage: merge-approved.sh [--repo');
});

test('--repo: a gate that cannot be evaluated stops the merge', () => {
  const box = sandbox({ repos: { [SITE]: { ...EXAMPLE.merge.repos[SITE], ignoreChecks: ['('] } } });
  box.pr(708, A, (p) => ({ ...p, statusCheckRollup: [{ name: 'quality', conclusion: 'SUCCESS' }, { name: 'review', conclusion: 'SUCCESS' }] }));
  box.run(['--repo', SITE, '708']);
  assert.equal(box.rc, 1);
  has(box, 'STOP at #708: the check gate could not be evaluated');
  assert.equal(box.enqueued(), '');
});

test('--repo: the driver lock is read again right before the merge', () => {
  const box = site();
  box.site(709, A);
  box.write('hook.cjs', `module.exports = (a) => { if (a[0] === 'api' && a[1] === 'graphql') require('fs').writeFileSync('${box.state}/orchestrator-session', 'other-session\\n'); };`);
  box.run(['--repo', SITE, '709']);
  assert.equal(box.rc, 1);
  has(box, 'lost the orchestrator lock');
  assert.equal(box.enqueued(), '');
});
