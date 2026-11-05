// The Sentry triage hook: a triage module that throws, at import or when called, leaves the tick dispatching as usual,
// and the tick logs the triage error once. Runs the real dispatcher.mjs in a sandbox (sandbox.mjs) with stub fleet, gh
// and inbox, and a stub Linear behind fetch, so nothing real is read or written.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT, SRC, editConfig, makeBox, runIn } from './sandbox.mjs';

const PRELOAD = `
import os from 'node:os';
os.hostname = () => process.env.FAKE_HOST ?? 'host-a.local';
const json = (data) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('api.linear.app')) throw new Error('unexpected fetch ' + url);
  const { query, variables } = JSON.parse(init.body);
  if (query.includes('mutation')) return json({ x: { success: true } });
  if (query.includes('teams(')) return json({
    teams: { nodes: [{ id: 'team', states: { nodes: [{ id: 's-prog', name: 'In Progress' }, { id: 's-ver', name: 'Verifying' }] } }] },
    issueLabels: { nodes: ['agent-ready', 'agent-building', 'agent-stuck'].map((n) => ({ id: 'L-' + n, name: n })) } });
  if (query.includes('inverseRelations')) return json({ issues: { nodes: [{
    id: 'uuid-1', identifier: 'ENG-1', title: 'Fix the thing', url: 'https://linear.app/x/issue/ENG-1', priority: 2,
    createdAt: '2026-11-01T00:00:00Z', description: '## Acceptance scenarios\\n1. Given a, when b, then c.', state: { id: 's-todo' },
    labels: { nodes: [{ name: 'agent-ready', parent: null }, { name: 'S', parent: { name: 'Size' } }] }, inverseRelations: { nodes: [] } }] } });
  if (query.includes('issue(id:$id){ labels')) return json({ issue: { labels: { nodes: [{ name: 'agent-ready' }] } } });
  if (query.includes('issue(id:$id){ id }')) return json({ issue: { id: 'uuid-1' } });
  if (query.includes('issues(')) return json({ issues: { nodes: [] } });
  throw new Error('unhandled query ' + query.slice(0, 80));
};
`;

const FLEET = `#!/bin/sh
case "$1" in
  ps) echo '[]' ;;
  accounts) echo '[{"label":"b","signed_in":true}]' ;;
  usage) echo '[{"label":"b","signed_in":true,"working":0,"usage":{"available":true,"five_hour":null,"weekly":{"remaining_percentage":90}}}]' ;;
  dispatch) touch "$HOME/dispatched"; echo '{"label":"b","id":"w1","name":"queue-eng-1"}' ;;
esac
`;

const HOST = { maxWorkers: 4, maxLoadPerCore: 1000, minMemoryFreePercent: 0 };

function sandbox(triageSource) {
  const box = makeBox('dispatcher-hook', { preload: PRELOAD, fleet: FLEET, gh: '#!/bin/sh\necho fake\n',
    dispatcher: { enabledHosts: ['host-a'], hosts: { 'host-a': HOST }, sentryTriage: { enabled: true, host: 'host-a' } } });
  fs.writeFileSync(path.join(box.dir, 'sentry-triage.mjs'), triageSource);
  return box;
}

for (const [name, source] of [
  ['throws at import', "throw new Error('triage exploded at import');\n"],
  ['has a syntax error', 'export function kickFromTick( {\n'],
  ['throws when called', "export function kickFromTick() { throw new Error('triage exploded when called'); }\nexport function statusLine() { throw new Error('status exploded'); }\n"],
]) {
  test(`a triage module that ${name} leaves the tick dispatching, and logs once`, () => {
    const box = sandbox(source);
    const r = runIn(box, ['tick']);
    const out = r.stdout + r.stderr;
    assert.equal(r.status, 0, out);
    assert.ok(fs.existsSync(path.join(box.home, 'dispatched')), `the tick did not dispatch:\n${out}`);
    assert.match(out, /ENG-1: dispatched to b\/w1/);
    assert.doesNotMatch(out, /tick failed/);
    assert.equal(out.split('\n').filter((l) => /sentry triage/i.test(l)).length, 1, out);
    const log = fs.readFileSync(path.join(box.stateDir, 'dispatcher.log'), 'utf8');
    assert.equal(log.split('\n').filter((l) => /sentry triage/i.test(l)).length, 1);
    const st = runIn(box, ['status']);
    assert.equal(st.status, 0, st.stdout + st.stderr);
    assert.match(st.stdout, /sentry triage: status unavailable/);
  });
}

test('the hook stays off while sentryTriage.enabled is false, and on any host but sentryTriage.host', () => {
  const box = sandbox("throw new Error('must not load');\n");
  editConfig(box, (c) => ({ ...c, dispatcher: { ...c.dispatcher, sentryTriage: { ...c.dispatcher.sentryTriage, enabled: false } } }));
  const off = runIn(box, ['tick']);
  assert.equal(off.status, 0, off.stdout + off.stderr);
  assert.doesNotMatch(off.stdout + off.stderr, /sentry triage/i);
  assert.ok(fs.existsSync(path.join(box.home, 'dispatched')));

  const other = sandbox("throw new Error('must not load');\n");
  editConfig(other, (c) => ({ ...c, dispatcher: { ...c.dispatcher, enabledHosts: ['host-c'], hosts: { 'host-c': HOST } } }));
  const r = runIn(other, ['tick'], { FAKE_HOST: 'host-c.local' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /sentry triage/i);
  assert.ok(fs.existsSync(path.join(other.home, 'dispatched')));
});

test('the real dispatcher scripts and the config loader parse', () => {
  execFileSync(process.execPath, ['--check', SRC]);
  for (const f of ['dispatcher/premerge-check.mjs', 'dispatcher/main-watch.mjs', 'dispatcher/gated-push.mjs', 'lib/config.mjs', 'inbox/merged-to-verifying.mjs']) {
    execFileSync(process.execPath, ['--check', path.join(REPO_ROOT, f)]);
  }
});
