// Sentry merge paths: a mechanical Sentry fix merges itself when green; a judgment one waits on the reviewer's review
// (requested once on GitHub, one ticket comment, one Slack DM), merges only on their approval of the current head, and
// their requested changes go to a worker. Runs the real dispatcher.mjs in a sandbox (sandbox.mjs) with stub fleet, gh
// and inbox, and stub Linear and Slack behind fetch, so nothing real is read, written or sent.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { EXAMPLE, makeBox } from './sandbox.mjs';

const HEAD = 'abc123';
const REPO = EXAMPLE.github.repo;
const REVIEWER = { name: 'Robin', github: 'robin-gh', slackUser: 'U_REVIEWER', fallbackChannel: 'C_QUEUE' };

// Linear: ENG-9's labels come from $HOME/labels.json, its description carries a "## Merge path" reason. Every mutation
// is appended to $HOME/mutations. Slack: each chat.postMessage body goes to $HOME/slack; $HOME/slack-error makes the
// first post to a user ID fail with that error.
const PRELOAD = `
import os from 'node:os';
import fs from 'node:fs';
os.hostname = () => 'host-a.local';
const H = process.env.HOME;
const json = (data) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
const labels = () => JSON.parse(fs.readFileSync(H + '/labels.json', 'utf8'));
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://slack.com/api/chat.postMessage')) {
    const body = JSON.parse(init.body);
    if (!init.headers.Authorization.startsWith('Bearer ')) throw new Error('no bearer');
    fs.appendFileSync(H + '/slack', JSON.stringify(body) + '\\n');
    if (fs.existsSync(H + '/slack-error') && body.channel.startsWith('U')) {
      return new Response(JSON.stringify({ ok: false, error: fs.readFileSync(H + '/slack-error', 'utf8').trim() }));
    }
    return new Response(JSON.stringify({ ok: true, channel: body.channel.startsWith('U') ? 'D-reviewer' : body.channel, ts: '1.2' }));
  }
  if (!String(url).includes('api.linear.app')) throw new Error('unexpected fetch ' + url);
  const { query, variables } = JSON.parse(init.body);
  if (query.includes('mutation')) {
    fs.appendFileSync(H + '/mutations', JSON.stringify(variables) + '\\n');
    if (query.includes('issueLabelCreate')) return json({ issueLabelCreate: { issueLabel: { id: 'L-' + variables.n } } });
    return json({ x: { success: true } });
  }
  if (query.includes('teams(')) return json({
    teams: { nodes: [{ id: 'team', states: { nodes: [{ id: 's-prog', name: 'In Progress' }, { id: 's-ver', name: 'Verifying' }] } }] },
    issueLabels: { nodes: ['agent-ready', 'agent-building', 'agent-stuck'].map((n) => ({ id: 'L-' + n, name: n })) } });
  if (query.includes('number:{in:$numbers}')) return json({ issues: { nodes: [{ identifier: 'ENG-9', labels: { nodes: labels().map((name) => ({ name })) } }] } });
  if (query.includes('issueLabels(')) return json({ issueLabels: { nodes: [{ id: 'L-sentry-mechanical', name: 'sentry-mechanical', parent: null }, { id: 'L-sentry-human-review', name: 'sentry-human-review', parent: null }] } });
  if (query.includes('title description')) return json({ issue: { title: 'Fix the account sync select', description: 'x\\n\\n## Merge path\\n\\n**Human review:** waits.\\nReason: the fix spans 2 packages (packages/api, packages/shared).\\n' } });
  if (query.includes('identifier title url description')) return json({ issue: { id: 'uuid-' + variables.id.split('-')[1], identifier: variables.id, title: 'Fix the account sync select', url: 'https://linear.app/x/issue/' + variables.id, description: '## Acceptance scenarios\\n1. Given a, when b, then c.' } });
  if (query.includes('issue(id:$id){ id }')) return json({ issue: { id: 'uuid-' + variables.id.split('-')[1] } });
  if (query.includes('inverseRelations')) return json({ issues: { nodes: [] } });
  if (query.includes('issues(')) return json({ issues: { nodes: [] } });
  throw new Error('unhandled query ' + query.slice(0, 80));
};
`;

// gh: PR 7 on agent/eng-9, green, head ${HEAD}. $HOME/reviews.json and $HOME/review-comments.json hold the
// reviews; $HOME/files the changed paths; $HOME/body the PR body. pr edit and pr merge are logged to $HOME/gh-log.
const GH = `#!/usr/bin/env node
const fs = require('node:fs');
const H = process.env.HOME;
const a = process.argv.slice(2);
const read = (f, d) => (fs.existsSync(H + '/' + f) ? fs.readFileSync(H + '/' + f, 'utf8') : d);
const merged = fs.existsSync(H + '/merged');
const lines = (arr) => console.log(arr.map((x) => JSON.stringify(x)).join('\\n'));
if (a[0] === 'auth') console.log('fake-gh-token');
else if (a[0] === 'pr' && a[1] === 'list') console.log(JSON.stringify([{ number: 7, baseRefName: 'main', isCrossRepository: false, createdAt: new Date().toISOString() }]));
else if (a[0] === 'pr' && a[1] === 'view') {
  console.log(JSON.stringify({ number: 7, url: 'https://github.com/x/pull/7', state: merged ? 'MERGED' : 'OPEN', isDraft: false,
    mergeStateStatus: 'CLEAN', headRefOid: '${HEAD}', headRefName: 'agent/eng-9', baseRefName: 'main', changedFiles: read('files', 'packages/shared/src/dao/x.ts').split('\\n').filter(Boolean).length,
    mergeCommit: merged ? { oid: 'def' } : null, statusCheckRollup: [{ name: 'Claude Code Review', conclusion: 'SUCCESS' }], updatedAt: '2026-11-05T00:00:00Z',
    body: read('body', '## Summary\\nFix.'), mergedAt: merged ? new Date().toISOString() : null }));
} else if (a[0] === 'pr' && (a[1] === 'edit' || a[1] === 'merge')) {
  fs.appendFileSync(H + '/gh-log', a.join(' ') + '\\n');
  if (a[1] === 'merge') fs.writeFileSync(H + '/merged', '');
} else if (a[0] === 'api' && a[1] === 'graphql') {
  const q = a.find((x) => x.startsWith('query='));
  if (q.includes('reviewThreads')) console.log(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { totalCount: 0, nodes: [] } } } } }));
  else console.log('null');
} else if (a[0] === 'api') {
  const p = a.find((x) => x.startsWith('repos/')) ?? '';
  if (/pulls\\/7\\/files/.test(p)) console.log(read('files', 'packages/shared/src/dao/x.ts').split('\\n').filter(Boolean).map((f) => f + '\\t').join('\\n'));
  else if (/pulls\\/7\\/reviews\\/\\d+\\/comments/.test(p)) lines(JSON.parse(read('review-comments.json', '[]')));
  else if (/pulls\\/7\\/reviews/.test(p)) lines(JSON.parse(read('reviews.json', '[]')));
  else if (/branches\\//.test(p)) console.log('${HEAD}');
  else if (a.includes('DELETE')) console.log('');
  else process.exit(1);
} else console.log('[]');
`;

// fleet: ps lists $HOME/ps.json; dispatch saves each brief and answers with a new worker.
const FLEET = `#!/bin/sh
case "$1" in
  ps) cat "$HOME/ps.json" 2>/dev/null || echo '[]' ;;
  accounts) echo '[{"label":"b","signed_in":true}]' ;;
  usage) echo '[{"label":"b","signed_in":true,"working":0,"usage":{"available":true,"five_hour":null,"weekly":{"remaining_percentage":90}}}]' ;;
  dispatch)
    n=$(ls "$HOME"/brief-* 2>/dev/null | wc -l | tr -d ' ')
    for last; do :; done
    printf '%s' "$last" > "$HOME/brief-$n"
    echo "{\\"label\\":\\"b\\",\\"id\\":\\"w$n\\",\\"name\\":\\"queue-eng-9\\"}" ;;
esac
`;

function sandbox({ labels, reviews = [], comments = [], ps = [], files = null, body = null, slackError = null, stateExtra = {} }) {
  const box = makeBox('dispatcher-reviewer', { preload: PRELOAD, fleet: FLEET, gh: GH, config: { reviewer: REVIEWER },
    dispatcher: { enabledHosts: ['host-a'], bundle: { enabled: false }, hosts: { 'host-a': { maxWorkers: 4, maxLoadPerCore: 1000, minMemoryFreePercent: 0 } } } });
  const { home, dir } = box;
  fs.writeFileSync(path.join(dir, 'premerge-check.mjs'), 'export const premergeCheck = () => ({ stale: false });\n');
  fs.mkdirSync(box.stateDir, { recursive: true });
  fs.writeFileSync(path.join(box.stateDir, 'slack-bot-token'), 'fake-bot-token\n');
  const old = '2026-11-01T00:00:00Z';
  fs.writeFileSync(path.join(box.stateDir, 'state.json'), JSON.stringify({ stuckStreak: 0, dispatches: [], tickets: {
    'ENG-9': { status: 'building', branch: 'agent/eng-9', claimedAt: old, dispatchedAt: old, lastProgressAt: old, lastOutputAt: old,
      account: 'b', workerId: 'w-old', workerName: 'queue-eng-9', sentry: true, ...stateExtra },
  } }));
  const put = (f, v) => fs.writeFileSync(path.join(home, f), typeof v === 'string' ? v : JSON.stringify(v));
  put('labels.json', labels);
  put('reviews.json', reviews);
  put('review-comments.json', comments);
  put('ps.json', ps);
  if (files) put('files', files.join('\n'));
  if (body) put('body', body);
  if (slackError) put('slack-error', slackError);
  return { ...box, put };
}

const tick = (box) => {
  const r = spawnSync(process.execPath, ['--import', path.join(box.home, 'preload.mjs'), path.join(box.dir, 'dispatcher.mjs'), 'tick'],
    { env: { ...process.env, HOME: box.home, PATH: `${box.bin}:${process.env.PATH}`, AGENT_QUEUE_CONFIG: box.configFile, LINEAR_API_KEY: 'fake-linear-key' }, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout + r.stderr;
};
const readLines = (home, f) => (fs.existsSync(path.join(home, f)) ? fs.readFileSync(path.join(home, f), 'utf8').split('\n').filter(Boolean) : []);
const state = (home) => JSON.parse(fs.readFileSync(path.join(home, '.agent-queue/state.json'), 'utf8')).tickets['ENG-9'];
const briefs = (home) => fs.readdirSync(home).filter((f) => f.startsWith('brief-')).sort().map((f) => fs.readFileSync(path.join(home, f), 'utf8'));
const reviewComments = (home) => readLines(home, 'mutations').map((l) => JSON.parse(l)).filter((m) => typeof m.b === 'string' && /needs Robin's review/.test(m.b));
const JUDGMENT = ['sentry-triaged', 'sentry-human-review', 'S'];
const OLD_DONE = { label: 'b', id: 'w-old', name: 'queue-eng-9', status: 'done', kind: 'background' };
const MECHANICAL = ['sentry-triaged', 'sentry-mechanical', 'S'];
const reviewOf = (state, commit, id = 11) => ({ id, state, body: state === 'APPROVED' ? 'Looks right.' : 'Please guard the empty account list before the select.', commit_id: commit, submitted_at: `2026-11-05T1${id % 10}:00:00Z`, login: REVIEWER.github });

test('1: a judgment ticket with a green PR gets the reviewer requested, one ticket comment and one Slack DM, and is not merged', () => {
  // The claude bot's own APPROVED review must not count as the reviewer's; the worker is gone and nothing has moved for days.
  const box = sandbox({ labels: JUDGMENT, reviews: [{ ...reviewOf('APPROVED', HEAD), login: 'claude' }] });
  const out = tick(box);
  tick(box);
  tick(box);
  const gh = readLines(box.home, 'gh-log');
  assert.deepEqual(gh, [`pr edit 7 --repo ${REPO} --add-reviewer ${REVIEWER.github}`]);
  const comments = reviewComments(box.home);
  assert.equal(comments.length, 1);
  assert.match(comments[0].b, /https:\/\/github.com\/x\/pull\/7 needs Robin's review before it merges\. Why: the fix spans 2 packages \(packages\/api, packages\/shared\)\./);
  const slack = readLines(box.home, 'slack').map((l) => JSON.parse(l));
  assert.equal(slack.length, 1);
  assert.equal(slack[0].channel, REVIEWER.slackUser);
  assert.match(slack[0].text, /^ENG-9 \(Fix the account sync select\) has a PR waiting on your review: https:\/\/github.com\/x\/pull\/7\./);
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
  const t = state(box.home);
  assert.equal(t.status, 'building', 'waiting on the reviewer is never a stall');
  assert.equal(t.note, "waiting on Robin's review");
  assert.ok(t.reviewer.requested.done && t.reviewer.commented.done && t.reviewer.dm.done);
  assert.equal(t.reviewer.dm.via, 'dm');
  assert.doesNotMatch(out, /stuck|stalled/);
  assert.equal(readLines(box.home, 'asks').filter((l) => l.startsWith('ask ')).length, 0);
  assert.ok(!fs.existsSync(path.join(box.shared, 'merge-requests/ENG-9.json')));
});

test("2: the same PR merges once the reviewer's latest review approves the current head", () => {
  const box = sandbox({ labels: JUDGMENT, reviews: [reviewOf('CHANGES_REQUESTED', 'older', 11), reviewOf('APPROVED', HEAD, 12)] });
  const out = tick(box);
  assert.match(out, /ENG-9: merged https:\/\/github.com\/x\/pull\/7/);
  assert.ok(readLines(box.home, 'gh-log').some((l) => l.startsWith('pr merge 7 ')));
  assert.equal(state(box.home).status, 'merged');
});

test('2b: an approval of an older commit does not merge, and the reviewer is asked again once for the new head', () => {
  const box = sandbox({ labels: JUDGMENT, reviews: [reviewOf('APPROVED', 'older', 12)] });
  tick(box);
  tick(box);
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
  assert.equal(readLines(box.home, 'gh-log').filter((l) => l.includes(`--add-reviewer ${REVIEWER.github}`)).length, 2, 'the first request plus one re-request for the new head');
});

test('3: changes requested with the worker gone start one replacement worker whose brief quotes the review, only once', () => {
  const box = sandbox({ labels: JUDGMENT, reviews: [reviewOf('CHANGES_REQUESTED', HEAD, 13)], ps: [OLD_DONE],
    comments: [{ path: 'packages/shared/src/dao/x.ts', line: 42, body: 'This still throws on an empty list.' }] });
  const out = tick(box);
  tick(box);
  const b = briefs(box.home);
  assert.equal(b.length, 1, out);
  assert.match(b[0], /Robin reviewed PR #7 for ENG-9/);
  assert.match(b[0], /> Please guard the empty account list before the select\./);
  assert.match(b[0], /`packages\/shared\/src\/dao\/x\.ts:42`\n\s+> This still throws on an empty list\./);
  assert.match(b[0], /reply on each review thread/);
  assert.match(b[0], /Build Linear ticket ENG-9 in your-app/);
  const t = state(box.home);
  assert.equal(t.workerId, 'w0');
  assert.deepEqual(t.reviewer.handledReviews, [13]);
  assert.equal(t.redispatches ?? 0, 0, 'a review round does not use up the failed-worker redispatch');
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
});

test('3b: changes requested while the worker is still live start no second worker', () => {
  const box = sandbox({ labels: JUDGMENT, reviews: [reviewOf('CHANGES_REQUESTED', HEAD, 14)],
    ps: [{ label: 'b', id: 'w-old', name: 'queue-eng-9', status: 'busy', kind: 'background', pid: 1 }] });
  tick(box);
  assert.equal(briefs(box.home).length, 0);
  assert.match(state(box.home).note, /Robin requested changes; its worker b\/w-old is busy/);
});

test('4: a mechanical ticket with a green PR merges with no review request and no Slack message', () => {
  const box = sandbox({ labels: MECHANICAL });
  const out = tick(box);
  assert.match(out, /ENG-9: merged/);
  assert.deepEqual(readLines(box.home, 'gh-log').filter((l) => l.startsWith('pr edit')), []);
  assert.equal(readLines(box.home, 'slack').length, 0);
  assert.equal(reviewComments(box.home).length, 0);
});

test('5: a Sentry ticket with no merge-path label is treated as judgment', () => {
  const box = sandbox({ labels: ['sentry-triaged', 'S'] });
  tick(box);
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
  assert.equal(readLines(box.home, 'gh-log').length, 1);
  assert.equal(readLines(box.home, 'slack').length, 1);
  assert.equal(state(box.home).note, "waiting on Robin's review");
});

test('a ticket outside Sentry merges as before, with no review request', () => {
  const box = sandbox({ labels: [] });
  assert.match(tick(box), /ENG-9: merged/);
  assert.equal(readLines(box.home, 'slack').length, 0);
});

test('a mechanical PR that touches a reviewed path goes to the reviewer instead of the orchestrator, and its label is swapped', () => {
  const box = sandbox({ labels: MECHANICAL, files: ['packages/api/src/services/auth.service.ts'] });
  const out = tick(box);
  assert.match(out, /treated as judgment, so it waits on Robin's review: its PR touches reviewed paths \(packages\/api\/src\/services\/auth\.service\.ts\)/);
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
  assert.ok(!fs.existsSync(path.join(box.shared, 'merge-requests/ENG-9.json')));
  assert.equal(state(box.home).status, 'building');
  assert.equal(readLines(box.home, 'slack').length, 1);
  const muts = readLines(box.home, 'mutations').join('\n');
  assert.match(muts, /"i":"uuid-9","l":"L-sentry-mechanical"/);
  assert.match(muts, /"i":"uuid-9","l":"L-sentry-human-review"/);
  assert.match(reviewComments(box.home)[0].b, /Why: its PR touches reviewed paths/);
});

test("a mechanical PR whose worker wrote the escalation line waits on the reviewer with the worker's reason", () => {
  const box = sandbox({ labels: MECHANICAL, body: '## Summary\nFix.\n\nMerge path: human-review: the fix needs a choice about empty accounts.\n' });
  tick(box);
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
  assert.match(reviewComments(box.home)[0].b, /Why: the worker flagged it in the PR body: the fix needs a choice about empty accounts\./);
  assert.equal(state(box.home).sentryPath, 'judgment');
});

test("when the app's Messages tab is off, the DM falls back to the queue channel with a mention, once", () => {
  const box = sandbox({ labels: JUDGMENT, slackError: 'messages_tab_disabled' });
  tick(box);
  tick(box);
  const slack = readLines(box.home, 'slack').map((l) => JSON.parse(l));
  assert.deepEqual(slack.map((s) => s.channel), [REVIEWER.slackUser, REVIEWER.fallbackChannel]);
  assert.match(slack[1].text, new RegExp(`^<@${REVIEWER.slackUser}> ENG-9 `));
  assert.equal(state(box.home).reviewer.dm.via, 'agent-queue');
});

test('when the merge-path labels cannot be read, a green PR is held, never merged', () => {
  const box = sandbox({ labels: MECHANICAL, stateExtra: { sentryPath: 'mechanical' } });
  fs.writeFileSync(path.join(box.home, 'preload.mjs'), fs.readFileSync(path.join(box.home, 'preload.mjs'), 'utf8')
    .replace("if (query.includes('number:{in:$numbers}'))", "if (query.includes('number:{in:$numbers}')) throw new Error('Linear down'); if (false)"));
  const out = tick(box);
  assert.match(out, /could not read the Sentry merge-path labels, so no queue PR merges this tick/);
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
  assert.equal(state(box.home).note, 'green, held: the Sentry merge-path labels could not be read');
});

test("3c: an unreadable fleet list never starts a worker for the reviewer's changes", () => {
  const box = sandbox({ labels: JUDGMENT, reviews: [reviewOf('CHANGES_REQUESTED', HEAD, 15)] });
  fs.writeFileSync(path.join(box.home, 'ps.json'), 'not json');
  tick(box);
  assert.equal(briefs(box.home).length, 0);
  assert.match(state(box.home).note, /its worker b\/w-old is unknown/);
});

test('3d: a replacement a crashed run started for a review is adopted, never started twice', () => {
  const box = sandbox({ labels: JUDGMENT, reviews: [reviewOf('CHANGES_REQUESTED', HEAD, 16)],
    ps: [OLD_DONE, { label: 'b', id: 'w-new', name: 'queue-eng-9', status: 'busy', kind: 'background', pid: 2 }],
    stateExtra: { reviewer: { requested: { done: 'x' }, commented: { done: 'x' }, dm: { done: 'x' }, routing: { review: 16, fromAccount: 'b', fromWorker: 'w-old' } } } });
  const out = tick(box);
  assert.match(out, /adopted worker b\/w-new for Robin's requested changes/);
  assert.equal(briefs(box.home).length, 0);
  const t = state(box.home);
  assert.equal(t.workerId, 'w-new');
  assert.deepEqual(t.reviewer.handledReviews, [16]);
});

test('a comment or DM cut off mid-call by a crash is never sent again', () => {
  const box = sandbox({ labels: JUDGMENT, stateExtra: { reviewer: { requested: { done: 'x' }, commented: { tries: 1, inFlight: true }, dm: { tries: 1, inFlight: true } } } });
  tick(box);
  assert.equal(reviewComments(box.home).length, 0);
  assert.equal(readLines(box.home, 'slack').length, 0);
});

test('the reviewer changing their approval to requested changes during the pre-merge check stops the merge', () => {
  const box = sandbox({ labels: JUDGMENT, reviews: [reviewOf('APPROVED', HEAD, 17)] });
  // The pre-merge check is where minutes pass; the reviewer's new review lands then.
  fs.writeFileSync(path.join(box.dir, 'premerge-check.mjs'), `import fs from 'node:fs';
export const premergeCheck = () => { fs.writeFileSync(process.env.HOME + '/reviews.json', JSON.stringify(${JSON.stringify([reviewOf('APPROVED', HEAD, 17), reviewOf('CHANGES_REQUESTED', HEAD, 18)])})); return { stale: false }; };
`);
  const out = tick(box);
  assert.match(out, /Robin's approval no longer holds/);
  assert.ok(!fs.existsSync(path.join(box.home, 'merged')));
});

test("a judgment PR already sent to the orchestrator moves to the reviewer's review", () => {
  const box = sandbox({ labels: JUDGMENT, stateExtra: { status: 'merge-asked', riskySha: HEAD } });
  fs.mkdirSync(path.join(box.shared, 'merge-requests'), { recursive: true });
  fs.writeFileSync(path.join(box.shared, 'merge-requests/ENG-9.json'), '{}');
  tick(box);
  assert.ok(!fs.existsSync(path.join(box.shared, 'merge-requests/ENG-9.json')));
  const t = state(box.home);
  assert.equal(t.status, 'building');
  assert.equal(t.note, "waiting on Robin's review");
  assert.equal(readLines(box.home, 'slack').length, 1);
});
