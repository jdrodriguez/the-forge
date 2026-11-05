// The Sentry slot: a host with hosts.<name>.sentryWorkers keeps that many side workers for Sentry fix tickets (labeled
// linear.labels.sentry), apart from its maxWorkers. Other machines leave Sentry tickets to it while its heartbeat is
// fresh, and build them as usual when it is offline. Runs the real dispatcher.mjs in a sandbox (sandbox.mjs) with stub
// fleet, gh and inbox, and a stub Linear behind fetch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeBox, runIn, state } from './sandbox.mjs';

// ENG-1 and ENG-2 are regular tickets in different projects; ENG-3 is a Sentry fix ticket.
const PRELOAD = `
import os from 'node:os';
import fs from 'node:fs';
os.hostname = () => process.env.FAKE_HOST ?? 'host-a.local';
const json = (data) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
const issue = (n, project, extraLabels = []) => ({
  id: 'uuid-' + n, identifier: 'ENG-' + n, title: 'Ticket ' + n, url: 'https://linear.app/x/issue/ENG-' + n, priority: 2,
  createdAt: '2026-11-0' + n + 'T00:00:00Z', description: '## Acceptance scenarios\\n1. Given a, when b, then c.', state: { id: 's-todo' },
  project: { id: project }, parent: null, relations: { nodes: [] }, inverseRelations: { nodes: [] },
  labels: { nodes: [{ name: 'agent-ready', parent: null }, { name: 'S', parent: { name: 'Size' } }, ...extraLabels.map((name) => ({ name, parent: null }))] } });
const ready = () => fs.existsSync(process.env.HOME + '/claimed') ? [] : [issue(1, 'P'), issue(2, 'Q'), issue(3, 'B', ['sentry-triaged'])];
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('api.linear.app')) throw new Error('unexpected fetch ' + url);
  const { query, variables } = JSON.parse(init.body);
  if (query.includes('mutation')) return json({ x: { success: true } });
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

const sandbox = (hosts, enabledHosts = Object.keys(hosts)) => makeBox('dispatcher-sentry', { preload: PRELOAD, fleet: FLEET,
  dispatcher: { enabledHosts, hosts, bundle: { enabled: false } } });
const loose = { maxLoadPerCore: 1000, minMemoryFreePercent: 0 };

test('the Sentry host fills its regular slot with a regular ticket and its Sentry slot with the Sentry ticket', () => {
  const box = sandbox({ 'host-a': { maxWorkers: 1, sentryWorkers: 1, ...loose } });
  const r = runIn(box, ['tick']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, /ENG-1: dispatched to b\/w0\n/);
  assert.match(out, /ENG-3: dispatched to b\/w1 in the Sentry slot/);
  assert.doesNotMatch(out, /ENG-2: dispatched/);
  const st = state(box);
  assert.equal(st.tickets['ENG-3'].sentry, true);
  assert.equal(st.tickets['ENG-1'].sentry, undefined);
  const beat = JSON.parse(fs.readFileSync(path.join(box.shared, 'heartbeats/host-a.json'), 'utf8'));
  assert.equal(beat.host, 'host-a');
  assert.equal(beat.paused, false);
});

test('a Sentry ticket never takes a regular slot on the Sentry host, and a regular ticket never takes the Sentry slot', () => {
  const box = sandbox({ 'host-a': { maxWorkers: 0, sentryWorkers: 1, ...loose } });
  const r = runIn(box, ['tick']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, /ENG-3: dispatched to b\/w0 in the Sentry slot/);
  assert.doesNotMatch(out, /ENG-1: dispatched|ENG-2: dispatched/);
});

test('another machine leaves Sentry tickets to a live Sentry host, and builds them when that host is offline', () => {
  const hosts = { 'host-a': { maxWorkers: 4, ...loose }, 'host-b': { maxWorkers: 3, sentryWorkers: 1, ...loose } };
  const live = sandbox(hosts);
  fs.mkdirSync(path.join(live.shared, 'heartbeats'), { recursive: true });
  fs.writeFileSync(path.join(live.shared, 'heartbeats/host-b.json'), JSON.stringify({ host: 'host-b', at: new Date().toISOString(), paused: false }));
  const r = runIn(live, ['tick']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, /ENG-3: left for host-b's Sentry slot/);
  assert.match(out, /ENG-1: dispatched/);
  assert.doesNotMatch(out, /ENG-3: dispatched/);

  const offline = sandbox(hosts);
  fs.mkdirSync(path.join(offline.shared, 'heartbeats'), { recursive: true });
  fs.writeFileSync(path.join(offline.shared, 'heartbeats/host-b.json'), JSON.stringify({ host: 'host-b', at: '2026-11-05T00:00:00Z', paused: false }));
  const o = runIn(offline, ['tick']);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  assert.match(o.stdout + o.stderr, /ENG-3: dispatched to b\/w\d+\n/);
});

test('with no Sentry host configured, Sentry tickets dispatch like any other', () => {
  const box = sandbox({ 'host-a': { maxWorkers: 4, ...loose } });
  const r = runIn(box, ['tick']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  for (const n of [1, 2, 3]) assert.match(out, new RegExp(`ENG-${n}: dispatched to b/w\\d+\\n`));
});
