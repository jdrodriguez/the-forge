// The engine tests' shared sandbox, built on sandbox.mjs: the real dispatcher.mjs and engine-*.mjs in a throwaway HOME,
// with stub fleet.sh, gh, ask-human.sh, ext-worker.sh and the queue board's ext-usage.mjs, and a stub Linear behind
// fetch. Every stub writes what it was asked into a file under HOME, so a test reads back the calls it cares about.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeBox, runIn, state } from './sandbox.mjs';

export const HEAD = 'abc1234567';
export const OLD = '2026-11-01T00:00:00Z';
export const SCEN = '## Acceptance scenarios\n1. Given a, when b, then c.';
export const BRANCH = 'agent/eng-9';

// Linear: ready tickets from $HOME/ready.json, labeled lists from $HOME/labeled-<label>.json. Each mutation goes to
// $HOME/mutations as {op, ...variables}. Any other fetch throws.
const PRELOAD = `
import os from 'node:os';
import fs from 'node:fs';
os.hostname = () => 'host-a.local';
const H = process.env.HOME;
const json = (data) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
const file = (f, d) => (fs.existsSync(H + '/' + f) ? JSON.parse(fs.readFileSync(H + '/' + f, 'utf8')) : d);
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
  if (query.includes('inverseRelations')) return json({ issues: { nodes: file('ready.json', []) } });
  if (query.includes('number:{in:$numbers}')) return json({ issues: { nodes: [] } });
  if (query.includes('issue(id:$id){ labels')) return json({ issue: { labels: { nodes: [{ name: 'agent-ready' }] } } });
  if (query.includes('identifier title url description')) {
    const n = variables.id.split('-')[1];
    return json({ issue: { id: 'uuid-' + n, identifier: variables.id, title: 'Ticket ' + n, url: 'https://linear.app/x/issue/' + variables.id, description: ${JSON.stringify(SCEN)} } });
  }
  if (query.includes('issue(id:$id){ id }')) return json({ issue: { id: 'uuid-' + variables.id.split('-')[1] } });
  if (query.includes('issues(')) return json({ issues: { nodes: file('labeled-' + variables.label + '.json', []).map((identifier) => ({ identifier })) } });
  throw new Error('unhandled query ' + query.slice(0, 80));
};
`;

// fleet.sh: ps lists $HOME/ps.json, usage prints $HOME/usage.json, dispatch saves each brief to $HOME/brief-<n>.
const FLEET = `#!/bin/sh
case "$1" in
  ps) cat "$HOME/ps.json" 2>/dev/null || echo '[]' ;;
  accounts) echo '[{"label":"b","signed_in":true}]' ;;
  usage) cat "$HOME/usage.json" ;;
  stop) echo "$@" >> "$HOME/fleet-stopped" ;;
  dispatch)
    n=$(ls "$HOME"/brief-* 2>/dev/null | wc -l | tr -d ' ')
    for last; do :; done
    printf '%s' "$last" > "$HOME/brief-$n"
    echo "{\\"label\\":\\"$2\\",\\"id\\":\\"w$n\\",\\"name\\":\\"queue-eng\\"}" ;;
esac
`;

// gh: with $HOME/pr.json, PR 7 on agent/eng-9 (pr.json overrides its fields); without it, no PR. Threads come from
// $HOME/threads.json, failed job logs from $HOME/log-<job>.txt, a check run from $HOME/check-run.json. pr edit, pr
// merge, run view and branch deletes go to $HOME/gh-log.
const GH = `#!/usr/bin/env node
const fs = require('node:fs');
const H = process.env.HOME;
const a = process.argv.slice(2);
const read = (f, d) => (fs.existsSync(H + '/' + f) ? fs.readFileSync(H + '/' + f, 'utf8') : d);
const log = () => fs.appendFileSync(H + '/gh-log', a.join(' ') + '\\n');
const pr = () => ({ number: 7, url: 'https://github.com/your-org/your-app/pull/7', state: 'OPEN', isDraft: false, mergeStateStatus: 'CLEAN',
  headRefOid: '${HEAD}', headRefName: '${BRANCH}', baseRefName: 'main', changedFiles: 1, mergeCommit: null, updatedAt: '2026-11-01T00:00:00Z', body: 'Fix.',
  statusCheckRollup: [{ __typename: 'CheckRun', name: 'Claude Code Review', status: 'COMPLETED', conclusion: 'SUCCESS' }], ...JSON.parse(read('pr.json', '{}')) });
if (a[0] === 'auth') console.log('fake-gh-token');
else if (a[0] === 'pr' && a[1] === 'list') {
  const mine = a[a.indexOf('--head') + 1] === '${BRANCH}' && fs.existsSync(H + '/pr.json');
  console.log(mine ? JSON.stringify([{ number: 7, baseRefName: 'main', isCrossRepository: false, createdAt: new Date().toISOString() }]) : '[]');
} else if (a[0] === 'pr' && a[1] === 'view') console.log(JSON.stringify(pr()));
else if (a[0] === 'pr' && (a[1] === 'edit' || a[1] === 'merge')) log();
else if (a[0] === 'run' && a[1] === 'view') {
  log();
  process.stdout.write(read('log-' + a[a.indexOf('--job') + 1] + '.txt', ''));
} else if (a[0] === 'api' && a.includes('DELETE')) log();
else if (a[0] === 'api' && a[1] === 'graphql') {
  const q = a.find((x) => x.startsWith('query='));
  const nodes = JSON.parse(read('threads.json', '[]'));
  console.log(q.includes('reviewThreads') ? JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { totalCount: nodes.length, nodes } } } } }) : 'null');
} else if (a[0] === 'api') {
  const p = a.find((x) => x.startsWith('repos/')) ?? '';
  if (/pulls\\/7\\/files/.test(p)) console.log('src/x.ts\\t');
  else if (/check-runs\\/\\d+/.test(p)) console.log(read('check-run.json', '{}'));
  else if (/branches\\//.test(p)) console.log('${HEAD}');
  else if (/git\\/ref\\/heads\\//.test(p)) { if (read('remote-branches', '').split('\\n').includes(p.split('heads/')[1])) console.log('${HEAD}'); else process.exit(1); }
  else process.exit(1);
} else console.log('[]');
`;

// ext-worker.sh: every call goes to $HOME/ext-calls. available passes an engine with $HOME/avail-<engine>. With
// $HOME/start-fails, start refuses (exit 2); with $HOME/start-throws-after-row, it writes the row and then fails. Otherwise
// start copies
// the brief to $HOME/ext-brief-<n>, writes a busy registry row and prints the launcher's JSON line.
const EXT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const H = process.env.HOME;
const a = process.argv.slice(2);
fs.appendFileSync(H + '/ext-calls', JSON.stringify(a) + '\\n');
const reg = path.join(H, '.agent-queue/engine-workers');
if (a[0] === 'available') process.exit(fs.existsSync(H + '/avail-' + a[1]) ? 0 : 1);
if (a[0] === 'start' && fs.existsSync(H + '/start-fails')) { console.error('ext-worker: ' + H + '/wt exists and is not an engine clone'); process.exit(2); }
const throwAfterRow = a[0] === 'start' && fs.existsSync(H + '/start-throws-after-row');
if (a[0] === 'start') {
  const [, engine, id, branch, brief] = a;
  const n = fs.readdirSync(H).filter((f) => f.startsWith('ext-brief-')).length;
  fs.copyFileSync(brief, H + '/ext-brief-' + n);
  const row = { engine, id: 'e' + n, name: 'engine-' + id.toLowerCase(), pid: null, worktree: H + '/wt/' + branch.split('/').pop(), branch,
    startedAt: new Date().toISOString(), status: 'busy', exitCode: null, endedAt: null, question: null, report: null, logDir: reg + '/' + id + '/e' + n };
  fs.mkdirSync(reg, { recursive: true });
  fs.writeFileSync(path.join(reg, id + '.json'), JSON.stringify(row));
  if (throwAfterRow) { console.error('the caller timed out after the supervisor started'); process.exit(1); }
  console.log(JSON.stringify({ engine, id: row.id, name: row.name, pid: null, worktree: row.worktree, registry: path.join(reg, id + '.json') }));
}
`;

// The queue board's ext-usage.mjs: prints $HOME/ext-usage.json and fails without it. Each call is counted.
const EXT_USAGE = `import fs from 'node:fs';
const H = process.env.HOME;
fs.appendFileSync(H + '/ext-usage-calls', 'x\\n');
if (!fs.existsSync(H + '/ext-usage.json')) { console.error('the usage reader gave no answer'); process.exit(1); }
process.stdout.write(fs.readFileSync(H + '/ext-usage.json', 'utf8'));
`;

// ask-human.sh: ask appends its argv to $HOME/asks; check prints $HOME/answer, or WAITING without it.
const ASK = `#!/usr/bin/env node
const fs = require('node:fs');
const H = process.env.HOME;
const a = process.argv.slice(2);
if (a[0] === 'ask') fs.appendFileSync(H + '/asks', JSON.stringify(a) + '\\n');
else if (a[0] === 'check') console.log(fs.existsSync(H + '/answer') ? fs.readFileSync(H + '/answer', 'utf8') : 'WAITING since 2026-11-01T00:00:00Z');
`;

// A fleet.sh usage row for Claude account b with the given percent of its week left. The example's floor is 30%.
export const claude = (weeklyLeft) => [{ label: 'b', signed_in: true, working: 0, usage: { available: true, five_hour: null, weekly: { remaining_percentage: weeklyLeft } } }];
export const ROOM = claude(90);
export const NO_ROOM = claude(10);

// What ext-usage.mjs prints, from the percent of each engine's week used.
export const plans = ({ codex = 40, grok = 40, codexFiveHour = 10, codexLimited = false } = {}) => ({ host: 'host-a', at: new Date().toISOString(), services: [
  { name: 'Codex', fiveHour: { used: codexFiveHour, resetsAt: null }, weekly: { used: codex, resetsAt: null }, ...(codexLimited ? { limited: 'rate_limit' } : {}) },
  { name: 'Grok', fiveHour: null, weekly: { used: grok, resetsAt: null } },
] });

// A ready Linear ticket. Queue order follows n (createdAt), since every ticket has the same priority.
export const issue = (n, { size = 'S', labels = [], title = `Ticket ${n}`, description = SCEN } = {}) => ({
  id: `uuid-${n}`, identifier: `ENG-${n}`, title, url: `https://linear.app/x/issue/ENG-${n}`, priority: 2,
  createdAt: new Date(Date.UTC(2026, 9, 1) + n * 3.6e6).toISOString(), description, state: { id: 's-todo' }, project: { id: `P${n}` }, parent: null,
  labels: { nodes: [{ name: 'agent-ready', parent: null }, { name: size, parent: { name: 'Size' } }, ...labels.map((name) => ({ name, parent: null }))] },
  relations: { nodes: [] }, inverseRelations: { nodes: [] } });

// ENG-9, an engine ticket Codex built in round 1.
export const ENGINE_T = { status: 'building', driver: 'engine', engine: 'codex', account: 'codex', workerId: 'e-old', workerName: 'engine-eng-9',
  round: 1, branch: BRANCH, claimedAt: OLD, dispatchedAt: OLD, lastProgressAt: OLD, lastOutputAt: OLD, title: 'Ticket 9' };
// ENG-8, a Claude ticket whose worker is busy.
export const CLAUDE_T = { status: 'building', account: 'b', workerId: 'w-live', workerName: 'queue-eng-8', branch: 'agent/eng-8',
  claimedAt: OLD, dispatchedAt: OLD, lastProgressAt: OLD, lastOutputAt: OLD };

const FALLBACK = { enabled: true, engines: ['codex', 'grok'], sizes: ['S', 'M'], maxRounds: 5 };

export function engineBox({ engines = ['codex'], fallback = {}, usage = NO_ROOM, extUsage = plans(), host = {}, tickets = {}, ready = null,
  registry = null, pr = null, threads = null, ps = [] } = {}) {
  const box = makeBox('dispatcher-engine', { preload: PRELOAD, fleet: FLEET, gh: GH, config: { human: { name: 'the human' } },
    dispatcher: { enabledHosts: ['host-a'], bundle: { enabled: false }, externalBuilders: { fallback: { ...FALLBACK, ...fallback } },
      hosts: { 'host-a': { maxWorkers: 4, maxLoadPerCore: 1000, minMemoryFreePercent: 0, ...host } } } });
  fs.writeFileSync(path.join(box.dir, 'ext-worker.sh'), EXT, { mode: 0o755 });
  fs.mkdirSync(path.join(box.root, 'queue-board'));
  fs.writeFileSync(path.join(box.root, 'queue-board/ext-usage.mjs'), EXT_USAGE);
  fs.writeFileSync(path.join(box.root, 'inbox/ask-human.sh'), ASK, { mode: 0o755 });
  fs.mkdirSync(box.stateDir, { recursive: true });
  fs.writeFileSync(path.join(box.stateDir, 'state.json'), JSON.stringify({ stuckStreak: 0, dispatches: [], tickets }));
  box.put = (f, v) => fs.writeFileSync(path.join(box.home, f), typeof v === 'string' ? v : JSON.stringify(v));
  for (const e of engines) box.put(`avail-${e}`, '');
  box.put('usage.json', usage);
  if (extUsage) box.put('ext-usage.json', extUsage);
  box.put('ps.json', ps);
  if (ready) box.put('ready.json', ready);
  if (pr) box.put('pr.json', pr);
  if (threads) box.put('threads.json', threads);
  if (registry) setRow(box, registry);
  return box;
}

export const rowFile = (box, id = 'ENG-9') => path.join(box.stateDir, 'engine-workers', `${id}.json`);
export function setRow(box, row, id = 'ENG-9') {
  fs.mkdirSync(path.dirname(rowFile(box, id)), { recursive: true });
  fs.writeFileSync(rowFile(box, id), JSON.stringify({ engine: 'codex', id: 'e-old', name: 'engine-eng-9', pid: null, branch: BRANCH,
    worktree: `${box.home}/wt/eng-9`, startedAt: OLD, status: 'done', exitCode: 0, endedAt: OLD, question: null, report: null,
    logDir: path.join(box.stateDir, 'engine-workers', id, 'e-old'), ...row }));
}

export function run(box, args = ['tick']) {
  const r = runIn(box, args);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout + r.stderr;
}
export const tick = (box) => run(box, ['tick']);

export const lines = (box, f) => (fs.existsSync(path.join(box.home, f)) ? fs.readFileSync(path.join(box.home, f), 'utf8').split('\n').filter(Boolean) : []);
const jsonLines = (box, f) => lines(box, f).map((l) => JSON.parse(l));
export const ticket = (box, id = 'ENG-9') => state(box).tickets[id];
export const extCalls = (box) => jsonLines(box, 'ext-calls');
export const starts = (box) => extCalls(box).filter((a) => a[0] === 'start');
const homeFiles = (box, prefix) => fs.readdirSync(box.home).filter((f) => f.startsWith(prefix)).sort().map((f) => fs.readFileSync(path.join(box.home, f), 'utf8'));
export const extBriefs = (box) => homeFiles(box, 'ext-brief-');
export const claudeBriefs = (box) => homeFiles(box, 'brief-');
export const mutations = (box) => jsonLines(box, 'mutations');
export const comments = (box) => mutations(box).filter((m) => m.op === 'commentCreate').map((m) => m.b);
// Label changes in order, as +<label id> for an add and -<label id> for a removal.
export const labelOps = (box) => mutations(box).filter((m) => m.l).map((m) => `${m.op === 'issueAddLabel' ? '+' : '-'}${m.l}`);
export const asks = (box) => jsonLines(box, 'asks');
export const argOf = (argv, flag) => argv[argv.indexOf(flag) + 1];
export const mergeRequest = (box, id = 'ENG-9') => {
  const f = path.join(box.shared, 'merge-requests', `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
export const merges = (box) => lines(box, 'gh-log').filter((l) => l.startsWith('pr merge'));
