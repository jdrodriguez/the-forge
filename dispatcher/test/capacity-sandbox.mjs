// The capacity tests' shared sandbox, built on sandbox.mjs: the real dispatcher.mjs in a throwaway HOME, with stub
// fleet.sh, gh, sysctl and ask-human.sh, and a stub Linear behind fetch. The machine's load, cores and free memory come
// from FAKE_LOAD, FAKE_CORES and FAKE_FREE (a stub sysctl on macOS, a patched /proc/meminfo read on Linux), so the
// burst tests can set them per run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeBox, runIn, state } from './sandbox.mjs';

export const OLD = '2026-11-01T00:00:00Z';
export const HEAD = 'abc123';
const SCEN = '## Acceptance scenarios\n1. Given a, when b, then c.';

// Linear: ready tickets from $HOME/ready.json (less those $HOME/claimed-<ID> marks taken), each ticket's labels from
// $HOME/labels.json, a single issue's fresh labels from $HOME/issue-labels.json (default agent-ready), the label check's
// list from $HOME/label-check.json, the building list from $HOME/building.json. Every mutation goes to $HOME/mutations.
const PRELOAD = `
import os from 'node:os';
import fs from 'node:fs';
os.hostname = () => 'host-a.local';
os.loadavg = () => [0, Number(process.env.FAKE_LOAD ?? 0), 0];
os.cpus = () => Array.from({ length: Number(process.env.FAKE_CORES ?? 4) }, () => ({}));
const realRead = fs.readFileSync;
fs.readFileSync = (f, ...rest) => (f === '/proc/meminfo'
  ? 'MemTotal: 1000 kB\\nMemAvailable: ' + Number(process.env.FAKE_FREE ?? 80) * 10 + ' kB\\n' : realRead(f, ...rest));
const H = process.env.HOME;
const json = (data) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
const file = (f, d) => (fs.existsSync(H + '/' + f) ? JSON.parse(realRead(H + '/' + f, 'utf8')) : d);
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('api.linear.app')) throw new Error('unexpected fetch ' + url);
  const { query, variables } = JSON.parse(init.body);
  if (query.includes('mutation')) {
    const op = (query.match(/\\{\\s*(\\w+)\\(/) ?? [])[1];
    fs.appendFileSync(H + '/mutations', JSON.stringify({ op, ...variables }) + '\\n');
    return json({ x: { success: true } });
  }
  if (query.includes('teams(')) return json({
    teams: { nodes: [{ id: 'team', states: { nodes: [{ id: 's-prog', name: 'In Progress' }, { id: 's-ver', name: 'Verifying' }] } }] },
    issueLabels: { nodes: ['agent-ready', 'agent-building', 'agent-stuck'].map((n) => ({ id: 'L-' + n, name: n })) } });
  if (query.includes('number:{in:$numbers}')) {
    const labels = file('labels.json', {});
    return json({ issues: { nodes: variables.numbers.map((n) => ({ identifier: 'ENG-' + n, labels: { nodes: (labels['ENG-' + n] ?? []).map((name) => ({ name })) } })) } });
  }
  if (query.includes('issueLabels(')) return json({ issueLabels: { nodes: [{ id: 'L-mech', name: 'sentry-mechanical', parent: null }, { id: 'L-judg', name: 'sentry-human-review', parent: null }] } });
  if (query.includes('title description')) return json({ issue: { title: 'Fix the select', description: 'x\\n\\n## Merge path\\n\\nReason: it needs a human call.\\n' } });
  if (query.includes('identifier title url description')) return json({ issue: { id: 'uuid-' + variables.id.split('-')[1], identifier: variables.id, title: 'Ticket', url: 'https://linear.app/x/issue/' + variables.id, description: ${JSON.stringify(SCEN)},
    labels: { nodes: (file('labels.json', {})[variables.id] ?? []).map((name) => ({ name })) } } });
  if (query.includes('issue(id:$id){ id }')) return json({ issue: { id: 'uuid-' + variables.id.split('-')[1] } });
  if (query.includes('inverseRelations')) return json({ issues: { nodes: file('ready.json', []).filter((i) => !fs.existsSync(H + '/claimed-' + i.identifier)) } });
  if (query.includes('issue(id:$id){ labels')) return json({ issue: { labels: { nodes: (file('issue-labels.json', {})[variables.id] ?? ['agent-ready']).map((name) => ({ name })) } } });
  if (query.includes('labelCheck')) return json({ issues: { nodes: file('label-check.json', []) } });
  if (query.includes('orphanLabels')) return json({ issues: { nodes: file('orphan-labels.json', []) } });
  if (query.includes('issues(')) return json({ issues: { nodes: (variables.label === 'agent-building' ? file('building.json', []) : []).map((identifier) => ({ identifier })) } });
  throw new Error('unhandled query ' + query.slice(0, 80));
};
`;

// gh: $HOME/prs.json maps a PR number to { branch, merge, state, reviews, threads, threadAuthor (default a bot) }. pr edit and pr merge go to $HOME/gh-log.
const GH = `#!/usr/bin/env node
const fs = require('node:fs');
const H = process.env.HOME;
const a = process.argv.slice(2);
const read = (f, d) => (fs.existsSync(H + '/' + f) ? fs.readFileSync(H + '/' + f, 'utf8') : d);
const prs = JSON.parse(read('prs.json', '{}'));
const view = (n) => { const p = prs[n]; return { number: Number(n), url: 'https://github.com/x/pull/' + n, title: p.title ?? 'ENG-' + n + ': x', state: p.state ?? 'OPEN', isDraft: Boolean(p.draft),
  mergeStateStatus: p.merge ?? 'CLEAN', headRefOid: '${HEAD}', headRefName: p.branch, baseRefName: 'main', changedFiles: 1, mergeCommit: null,
  statusCheckRollup: [{ name: 'Claude Code Review', conclusion: 'SUCCESS' }], updatedAt: '2026-11-01T00:00:00Z', body: 'Fix.', mergedAt: null }; };
if (a[0] === 'auth') console.log('fake-gh-token');
else if (a[0] === 'pr' && a[1] === 'list') {
  const branch = a[a.indexOf('--head') + 1];
  console.log(JSON.stringify(Object.entries(prs).filter(([, p]) => p.branch === branch).map(([n]) => ({ number: Number(n), baseRefName: 'main', isCrossRepository: false, createdAt: new Date().toISOString() }))));
} else if (a[0] === 'pr' && a[1] === 'view') console.log(JSON.stringify(view(a[2])));
else if (a[0] === 'pr') fs.appendFileSync(H + '/gh-log', a.join(' ') + '\\n');
else if (a[0] === 'api' && a[1] === 'graphql') {
  const q = a.find((x) => x.startsWith('query=')) ?? '';
  const open = prs[(a.find((x) => x.startsWith('n=')) ?? 'n=0').slice(2)]?.threads ?? 0;
  console.log(q.includes('reviewThreads') ? JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { totalCount: open, nodes: Array.from({ length: open }, () => ({ isResolved: false, comments: { nodes: [{ author: { login: prs[(a.find((x) => x.startsWith('n=')) ?? 'n=0').slice(2)]?.threadAuthor ?? 'review-bot[bot]' } }] } })) } } } } }) : 'null');
} else if (a[0] === 'api') {
  const p = a.find((x) => x.startsWith('repos/')) ?? '';
  const m = p.match(/pulls\\/(\\d+)\\/(files|reviews)(\\/\\d+\\/comments)?/);
  if (m && m[2] === 'files') {
    const files = prs[m[1]].files ?? ['src/x.ts'];
    console.log(a.some((x) => x.includes('"added"')) ? files.join('\\n') : files.map((f) => f + '\\t').join('\\n'));
  }
  else if (m && m[3]) console.log('');
  else if (m) console.log((prs[m[1]].reviews ?? []).map((x) => JSON.stringify(x)).join('\\n'));
  else if (/branches\\//.test(p)) console.log('${HEAD}');
  else if (/git\\/trees\\//.test(p)) console.log(read('base-migrations', ''));
  else process.exit(1);
} else console.log('[]');
`;

// fleet.sh: ps lists $HOME/ps.json, usage prints $HOME/usage.json, accounts $HOME/accounts.json. stop goes to
// $HOME/stopped, or fails with $HOME/stop-fails. dispatch saves each brief to $HOME/brief-<n>, appends
// { label, model, cap } to $HOME/dispatches, marks its ticket claimed and answers with a new worker.
const FLEET = `#!/usr/bin/env node
const fs = require('node:fs');
const H = process.env.HOME;
const a = process.argv.slice(2);
const arg = (f) => a[a.indexOf(f) + 1];
if (a[0] === 'ps') process.stdout.write(fs.existsSync(H + '/ps.json') ? fs.readFileSync(H + '/ps.json', 'utf8') : '[]');
else if (a[0] === 'accounts') process.stdout.write(fs.existsSync(H + '/accounts.json') ? fs.readFileSync(H + '/accounts.json', 'utf8') : '[{"label":"b","signed_in":true}]');
else if (a[0] === 'stop') {
  if (fs.existsSync(H + '/stop-fails')) { console.error('could not stop it'); process.exit(1); }
  fs.appendFileSync(H + '/stopped', a.slice(1).join(' ') + '\\n');
}
else if (a[0] === 'usage') process.stdout.write(fs.readFileSync(H + '/usage.json', 'utf8'));
else if (a[0] === 'dispatch') {
  const n = fs.readdirSync(H).filter((f) => f.startsWith('brief-')).length;
  fs.writeFileSync(H + '/brief-' + n, a[a.length - 1]);
  fs.appendFileSync(H + '/dispatches', JSON.stringify({ label: a[1], model: arg('--model'), cap: arg('--max-workers') }) + '\\n');
  fs.writeFileSync(H + '/claimed-' + arg('--name').replace('queue-eng', 'ENG'), '');
  console.log(JSON.stringify({ label: a[1], id: 'w' + n, name: arg('--name') }));
}
`;

// A fleet.sh usage row. all is the percent of the week left on every model, fable the Fable allowance left (null for
// none), plan the subscription type the reserve reads.
export function acct({ label = 'b', all = 90, fable = null, plan = 'max', working = 0, email = `${label}@example.com` } = {}) {
  const windows = [{ group: 'weekly', kind: 'weekly_all', scope: null, remaining_percentage: all, used_percentage: 100 - all },
    ...(fable == null ? [] : [{ group: 'weekly', kind: 'weekly_scoped', scope: 'Fable', remaining_percentage: fable, used_percentage: 100 - fable }])];
  const tight = windows.reduce((x, y) => (y.remaining_percentage < x.remaining_percentage ? y : x));
  return { label, email, subscriptionType: plan, signed_in: true, working, usage: { available: true, five_hour: null, windows,
    weekly: { remaining_percentage: tight.remaining_percentage } } };
}

export const live = (n, extra = {}) => ({ status: 'building', branch: `agent/eng-${n}`, claimedAt: OLD, dispatchedAt: OLD, lastProgressAt: OLD,
  lastOutputAt: OLD, account: 'b', workerId: `w-${n}`, workerName: `queue-eng-${n}`, ...extra });
export const busy = (n) => ({ label: 'b', id: `w-${n}`, name: `queue-eng-${n}`, status: 'busy', state: 'working', kind: 'background', pid: 100 + n });
export const ended = (n, st = 'done') => ({ label: 'b', id: `w-${n}`, name: `queue-eng-${n}`, state: st, status: st, kind: 'background' });
export const ready = (n, { size = 'S', labels = [] } = {}) => ({ id: `uuid-${n}`, identifier: `ENG-${n}`, title: `Ticket ${n}`, url: `https://linear.app/x/issue/ENG-${n}`,
  priority: 2, createdAt: new Date(Date.UTC(2026, 9, 1) + n * 3.6e6).toISOString(), description: SCEN, state: { id: 's-todo' }, project: { id: `P${n}` },
  parent: null, relations: { nodes: [] }, inverseRelations: { nodes: [] },
  labels: { nodes: [{ name: 'agent-ready', parent: null }, { name: size, parent: { name: 'Size' } }, ...labels.map((name) => ({ name, parent: null }))] } });

// host: keys over this machine's hosts entry; dispatcher: keys over the dispatcher section.
// The queue board's send.py: records who was told what, and says it was delivered.
const SEND = `import json, os, sys
msg = sys.stdin.read()
with open(os.path.expanduser('~/told'), 'a') as f:
    f.write(json.dumps({'to': sys.argv[1] + '/' + sys.argv[2], 'text': msg}) + '\\n')
print(json.dumps({'ok': True}))
`;

// host: keys over this machine's hosts entry; dispatcher: keys over the dispatcher section; config: top-level sections.
export function capBox({ host = {}, dispatcher = {}, config = {}, tickets = {}, wakeQueue = null, prs = {}, labels = {}, ps = [], usage = [acct()], readyList = [] } = {}) {
  const box = makeBox('dispatcher-capacity', { preload: PRELOAD, fleet: FLEET, gh: GH, config,
    dispatcher: { enabledHosts: ['host-a'], bundle: { enabled: false }, maxConcurrent: 20,
      hosts: { 'host-a': { maxWorkers: 2, maxLoadPerCore: 1000, minMemoryFreePercent: 0, ...host } }, ...dispatcher } });
  fs.mkdirSync(path.join(box.root, 'queue-board'));
  fs.writeFileSync(path.join(box.root, 'queue-board/send.py'), SEND);
  fs.writeFileSync(path.join(box.bin, 'sysctl'), '#!/bin/sh\necho "${FAKE_FREE:-80}"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(box.bin, 'claude'), '#!/bin/sh\necho "$CLAUDE_CONFIG_DIR $@" >> "$HOME/claude-calls"\n', { mode: 0o755 });
  fs.mkdirSync(box.stateDir, { recursive: true });
  fs.writeFileSync(path.join(box.stateDir, 'state.json'), JSON.stringify({ stuckStreak: 0, dispatches: [], tickets, ...(wakeQueue ? { wakeQueue } : {}) }));
  box.put = (f, v) => fs.writeFileSync(path.join(box.home, f), typeof v === 'string' ? v : JSON.stringify(v));
  box.put('prs.json', prs);
  box.put('labels.json', labels);
  box.put('ps.json', ps);
  box.put('usage.json', usage);
  box.put('ready.json', readyList);
  return box;
}

export function run(box, args = ['tick'], env = {}) {
  const r = runIn(box, args, env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout + r.stderr;
}
export const tick = (box, env = {}) => run(box, ['tick'], env);
export const lines = (box, f) => (fs.existsSync(path.join(box.home, f)) ? fs.readFileSync(path.join(box.home, f), 'utf8').split('\n').filter(Boolean) : []);
export const dispatches = (box) => lines(box, 'dispatches').map((l) => JSON.parse(l));
export const briefs = (box) => fs.readdirSync(box.home).filter((f) => f.startsWith('brief-')).sort().map((f) => fs.readFileSync(path.join(box.home, f), 'utf8'));
export const queueIds = (box) => (state(box).wakeQueue ?? []).map((w) => w.id);
export const heartbeat = (box, host = 'host-a') => JSON.parse(fs.readFileSync(path.join(box.shared, 'heartbeats', `${host}.json`), 'utf8'));
export function editState(box, fn) {
  const s = state(box);
  fn(s);
  fs.writeFileSync(path.join(box.stateDir, 'state.json'), JSON.stringify(s));
}
export { state };
