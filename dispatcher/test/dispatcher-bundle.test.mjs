// Bundling: the dispatcher gives up to bundle.maxTickets linked same-project S/M tickets one worker and one PR. Runs
// the real dispatcher.mjs in a sandbox (sandbox.mjs) with stub fleet, gh and inbox, and a stub Linear behind fetch, so
// nothing real is read or written.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeBox, runIn, state } from './sandbox.mjs';

// Five ready tickets. ENG-1 (project P, S) leads; ENG-2 (P, M) is blocked by ENG-1, which the bundle holds;
// ENG-3 is in another project; ENG-4 is in P but marked "Ships alone"; ENG-5 is in P with no link to ENG-1.
const PRELOAD = `
import os from 'node:os';
import fs from 'node:fs';
os.hostname = () => 'host-a.local';
const json = (data) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
const scen = '## Acceptance scenarios\\n1. Given a, when b, then c.';
const issue = (n, project, size, extra = {}) => ({
  id: 'uuid-' + n, identifier: 'ENG-' + n, title: 'Ticket ' + n, url: 'https://linear.app/x/issue/ENG-' + n, priority: 2,
  createdAt: '2026-11-0' + n + 'T00:00:00Z', description: scen, state: { id: 's-todo' }, project: { id: project },
  labels: { nodes: [{ name: 'agent-ready', parent: null }, { name: size, parent: { name: 'Size' } }] },
  inverseRelations: { nodes: [] }, ...extra });
const ready = () => fs.existsSync(process.env.HOME + '/claimed') ? [] : [
  issue(1, 'P', 'S'),
  issue(2, 'P', 'M', { inverseRelations: { nodes: [{ type: 'blocks', issue: { identifier: 'ENG-1', state: { name: 'Todo', type: 'unstarted' } } }] } }),
  issue(3, 'Q', 'S'),
  issue(4, 'P', 'S', { description: scen + '\\n## Out of scope / decisions\\n* Ships alone: a migration on a hot table.' }),
  issue(5, 'P', 'S'),
];
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('api.linear.app')) throw new Error('unexpected fetch ' + url);
  const { query, variables } = JSON.parse(init.body);
  if (query.includes('mutation')) {
    fs.appendFileSync(process.env.HOME + '/mutations', JSON.stringify(variables) + '\\n');
    return json({ x: { success: true } });
  }
  if (query.includes('teams(')) return json({
    teams: { nodes: [{ id: 'team', states: { nodes: [{ id: 's-prog', name: 'In Progress' }, { id: 's-ver', name: 'Verifying' }] } }] },
    issueLabels: { nodes: ['agent-ready', 'agent-building', 'agent-stuck'].map((n) => ({ id: 'L-' + n, name: n })) } });
  if (query.includes('inverseRelations')) return json({ issues: { nodes: ready() } });
  if (query.includes('issue(id:$id){ labels')) return json({ issue: { labels: { nodes: [{ name: 'agent-ready' }] } } });
  if (query.includes('issue(id:$id){ id }')) return json({ issue: { id: 'uuid-' + variables.id.split('-')[1] } });
  if (query.includes('issues(')) return json({ issues: { nodes: [] } });
  throw new Error('unhandled query ' + query.slice(0, 80));
};
`;

// dispatch saves each brief and answers with a new worker; ps reports every worker busy.
const FLEET = `#!/bin/sh
case "$1" in
  ps) echo '[]' ;;
  accounts) echo '[{"label":"b","signed_in":true}]' ;;
  usage) echo '[{"label":"b","signed_in":true,"working":0,"usage":{"available":true,"five_hour":null,"weekly":{"remaining_percentage":90}}}]' ;;
  dispatch)
    n=$(ls "$HOME"/brief-* 2>/dev/null | wc -l | tr -d ' ')
    for last; do :; done
    printf '%s' "$last" > "$HOME/brief-$n"
    touch "$HOME/claimed"
    echo "{\\"label\\":\\"b\\",\\"id\\":\\"w$n\\",\\"name\\":\\"queue-w$n\\"}" ;;
esac
`;

// gh: ENG-1's branch has PR 5, merged once $HOME/merged exists. Anything else answers an empty list.
const GH = `#!/usr/bin/env node
const fs = require('node:fs');
const a = process.argv.slice(2);
const merged = fs.existsSync(process.env.HOME + '/merged');
if (a[0] === 'pr' && a[1] === 'list') {
  const head = a[a.indexOf('--head') + 1];
  console.log(JSON.stringify(head === 'agent/eng-1' ? [{ number: 5, baseRefName: 'main', isCrossRepository: false, createdAt: new Date().toISOString() }] : []));
} else if (a[0] === 'pr' && a[1] === 'view') {
  console.log(JSON.stringify({ number: 5, url: 'https://github.com/x/pull/5', state: merged ? 'MERGED' : 'OPEN', isDraft: false,
    mergeStateStatus: 'BLOCKED', headRefOid: 'abc', headRefName: 'agent/eng-1', baseRefName: 'main', changedFiles: 1,
    mergeCommit: merged ? { oid: 'def' } : null, statusCheckRollup: [], updatedAt: '2026-11-05T00:00:00Z' }));
} else if (a[0] === 'api') {
  process.exit(1);
} else {
  console.log('[]');
}
`;

const sandbox = (bundle = { enabled: true, maxTickets: 3, sizes: ['S', 'M'] }) => makeBox('dispatcher-bundle', { preload: PRELOAD, fleet: FLEET, gh: GH,
  dispatcher: { bundle, enabledHosts: ['host-a'], hosts: { 'host-a': { maxWorkers: 4, maxLoadPerCore: 1000, minMemoryFreePercent: 0 } } } });
const briefs = (home) => fs.readdirSync(home).filter((f) => f.startsWith('brief-')).sort().map((f) => fs.readFileSync(path.join(home, f), 'utf8'));

test('a lead takes its linked same-project S/M companions into one worker; other projects, Ships alone and unlinked tickets stay solo', () => {
  const box = sandbox();
  const r = runIn(box, ['tick']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, /ENG-1: dispatched to b\/w0 \(bundled with ENG-2\)/);
  assert.match(out, /ENG-3: dispatched to b\/w1\n/);
  assert.match(out, /ENG-4: dispatched to b\/w2\n/);
  assert.match(out, /ENG-5: dispatched to b\/w3\n/);
  assert.doesNotMatch(out, /ENG-2: dispatched/);

  const st = state(box);
  assert.deepEqual(st.tickets['ENG-1'].bundle, ['ENG-2']);
  assert.equal(st.tickets['ENG-1'].status, 'building');
  assert.equal(st.tickets['ENG-2'].status, 'bundled');
  assert.equal(st.tickets['ENG-2'].bundledInto, 'ENG-1');
  assert.equal(st.tickets['ENG-2'].workerId, 'w0');
  assert.equal(st.tickets['ENG-4'].bundle, undefined);
  const file = JSON.parse(fs.readFileSync(path.join(box.shared, 'bundles/ENG-1.json'), 'utf8'));
  assert.deepEqual(file.companions, ['ENG-2']);

  const [lead, solo3] = briefs(box.home);
  assert.match(lead, /^This is a bundle\./);
  assert.match(lead, /Build Linear tickets ENG-1, ENG-2 in your-app as one pull request\./);
  assert.match(lead, /PR title starts with "ENG-1, ENG-2: "/);
  assert.match(lead, /## Ticket ENG-1: Ticket 1/);
  assert.match(lead, /## Ticket ENG-2: Ticket 2/);
  assert.match(lead, /Branch: agent\/eng-1/);
  assert.doesNotMatch(solo3, /This is a bundle/);
  assert.match(solo3, /Build Linear ticket ENG-3 in your-app as one pull request\./);

  // Both bundle members were claimed in Linear: agent-building on, agent-ready off, In Progress.
  const muts = fs.readFileSync(path.join(box.home, 'mutations'), 'utf8');
  for (const id of ['uuid-1', 'uuid-2']) {
    assert.match(muts, new RegExp(`"i":"${id}","l":"L-agent-building"`));
    assert.match(muts, new RegExp(`"i":"${id}","l":"L-agent-ready"`));
    assert.match(muts, new RegExp(`"i":"${id}","s":"s-prog"`));
  }

  const s = runIn(box, ['status']);
  assert.match(s.stdout, /ENG-2\s+bundled .*\(rides on ENG-1\)/);
  assert.match(s.stdout, /ENG-1\s+building .*\(\+ ENG-2\)/);
});

test("the lead's merge moves its companions to Verifying and clears the bundle file", () => {
  const box = sandbox();
  assert.equal(runIn(box, ['tick']).status, 0);
  fs.writeFileSync(path.join(box.home, 'merged'), '');
  fs.rmSync(path.join(box.home, 'mutations'));
  const r = runIn(box, ['tick']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, /ENG-1: merged https:\/\/github.com\/x\/pull\/5/);
  assert.match(out, /ENG-2: merged with ENG-1/);
  const st = state(box);
  assert.equal(st.tickets['ENG-2'].status, 'merged');
  assert.equal(st.tickets['ENG-2'].ciChecked, true);
  assert.ok(!fs.existsSync(path.join(box.shared, 'bundles/ENG-1.json')));
  const muts = fs.readFileSync(path.join(box.home, 'mutations'), 'utf8');
  assert.match(muts, /"i":"uuid-2","s":"s-ver"/);
  assert.match(muts, /Merged https:\/\/github.com\/x\/pull\/5 together with ENG-1/);
});

test('with bundling off, every ticket gets its own worker', () => {
  const box = sandbox({ enabled: false });
  const r = runIn(box, ['tick']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, /ENG-1: dispatched to b\/w0\n/);
  assert.doesNotMatch(out, /bundled with/);
  assert.equal(state(box).tickets['ENG-1'].bundle, undefined);
});
