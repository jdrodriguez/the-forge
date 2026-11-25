// Platform labels: a ticket labeled with a key of dispatcher.platformLabels builds only on a machine of that platform,
// never on an engine, never bundled with a ticket that needs another, and its Sentry fix is left only to a Sentry
// machine of that platform. The label is read again at the claim and before any replacement, recovery or handoff. Runs the real dispatcher in capacity-sandbox.mjs, and in engine-sandbox.mjs for engines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { OLD, briefs, capBox, dispatches, ended, heartbeat, live, ready, run, state, tick } from './capacity-sandbox.mjs';
import { engineBox, issue, starts, tick as engineTick } from './engine-sandbox.mjs';

const HERE = process.platform;
const ELSEWHERE = HERE === 'darwin' ? 'linux' : 'darwin';

test('a ticket labeled for another platform waits for a machine of that platform; one labeled for this platform builds here', () => {
  const box = capBox({ dispatcher: { platformLabels: { 'needs-other': ELSEWHERE, 'needs-here': HERE } },
    readyList: [ready(11, { labels: ['needs-other'] }), ready(12, { labels: ['needs-here'] })] });
  const out = tick(box);
  assert.match(out, new RegExp(`ENG-11: needs a ${ELSEWHERE} machine \\(labeled needs-other\\), left for one`));
  assert.match(out, /ENG-12: dispatched/);
  assert.equal(dispatches(box).length, 1);
  assert.equal(heartbeat(box).platform, HERE, 'the heartbeat says which platform this machine is');
});

test('without platformLabels a label means nothing to the queue', () => {
  const box = capBox({ readyList: [ready(11, { labels: ['needs-other'] })] });
  tick(box);
  assert.equal(dispatches(box).length, 1);
});

test('a platform-labeled ticket never goes to an engine, even with no Claude room', () => {
  const box = engineBox({ ready: [issue(11, { labels: ['needs-here'] })] });
  const cfg = JSON.parse(fs.readFileSync(box.configFile, 'utf8'));
  cfg.dispatcher.platformLabels = { 'needs-here': HERE };
  fs.writeFileSync(box.configFile, JSON.stringify(cfg));
  const out = engineTick(box);
  assert.equal(starts(box).length, 0);
  assert.match(out, /not for an engine worker: it is labeled needs-here/);
});

test("a platform-labeled Sentry fix is left only to a live Sentry machine of its platform", () => {
  const sentryOn = (box, host, platform) => {
    fs.mkdirSync(path.join(box.shared, 'heartbeats'), { recursive: true });
    fs.writeFileSync(path.join(box.shared, 'heartbeats', `${host}.json`), JSON.stringify({ host, platform, at: new Date().toISOString(), paused: false }));
  };
  const hosts = { 'host-a': { maxWorkers: 2, maxLoadPerCore: 1000, minMemoryFreePercent: 0 }, 'host-b': { maxWorkers: 2, sentryWorkers: 1 } };
  const other = capBox({ dispatcher: { enabledHosts: ['host-a', 'host-b'], hosts, platformLabels: { 'needs-here': HERE } },
    readyList: [ready(11, { labels: ['sentry-triaged', 'needs-here'] })] });
  sentryOn(other, 'host-b', ELSEWHERE);
  assert.match(tick(other), /ENG-11: dispatched/, 'host-b is another platform, so this machine builds it');
  const same = capBox({ dispatcher: { enabledHosts: ['host-a', 'host-b'], hosts, platformLabels: { 'needs-here': HERE } },
    readyList: [ready(11, { labels: ['sentry-triaged', 'needs-here'] })] });
  sentryOn(same, 'host-b', HERE);
  assert.match(tick(same), /ENG-11: left for host-b's Sentry slot/);
});

// Two linked tickets in one project, so the queue would bundle them.
const pair = (leadLabels, mateLabels) => {
  const lead = { ...ready(11, { labels: leadLabels }), project: { id: 'P' } };
  const mate = { ...ready(12, { labels: mateLabels }), project: { id: 'P' }, relations: { nodes: [{ type: 'related', relatedIssue: { identifier: 'ENG-11' } }] } };
  return [lead, mate];
};

test('a bundle holds only tickets of one platform: a companion needing another platform builds on its own', () => {
  const mixed = capBox({ dispatcher: { bundle: { enabled: true }, platformLabels: { 'needs-here': HERE, 'needs-other': ELSEWHERE } },
    readyList: pair(['needs-here'], ['needs-other']) });
  tick(mixed);
  assert.deepEqual(dispatches(mixed).length, 1);
  assert.equal(state(mixed).tickets['ENG-11'].bundle, undefined, 'ENG-12 needs another platform, so it is not bundled in');
  const same = capBox({ dispatcher: { bundle: { enabled: true }, platformLabels: { 'needs-here': HERE } },
    readyList: pair(['needs-here'], ['needs-here']) });
  tick(same);
  assert.deepEqual(state(same).tickets['ENG-11'].bundle, ['ENG-12']);
});

test('a platform label added after the ready list was read still holds at the claim', () => {
  const box = capBox({ dispatcher: { platformLabels: { 'needs-other': ELSEWHERE } }, readyList: [ready(11)] });
  box.put('issue-labels.json', { 'ENG-11': ['agent-ready', 'needs-other'] });
  assert.match(tick(box), new RegExp(`ENG-11: now labeled needs-other, so it is left for a ${ELSEWHERE} machine`));
  assert.equal(dispatches(box).length, 0);
});

test('a replacement checks the platform label again: a ticket now labeled for another platform is not replaced here', () => {
  const box = capBox({ dispatcher: { platformLabels: { 'needs-other': ELSEWHERE } }, tickets: { 'ENG-9': live(9) }, ps: [ended(9, 'failed')] });
  box.put('labels.json', { 'ENG-9': ['needs-other'] });
  const out = tick(box) + tick(box);
  assert.match(out, new RegExp(`not replaced on host-a: it is labeled needs-other, which needs a ${ELSEWHERE} machine`));
  assert.equal(briefs(box).length, 0);
});

test('recovery of an ended worker with a conflicting PR checks the platform label before it starts a replacement', () => {
  const box = capBox({ dispatcher: { platformLabels: { 'needs-other': ELSEWHERE } }, tickets: { 'ENG-9': live(9, { prNumber: 9 }) },
    prs: { 9: { branch: 'agent/eng-9', merge: 'DIRTY' } }, ps: [ended(9)] });
  box.put('labels.json', { 'ENG-9': ['needs-other'] });
  const out = tick(box) + tick(box);
  assert.match(out, /not replaced on host-a: it is labeled needs-other/);
  assert.equal(briefs(box).length, 0);
});

test('a handoff by hand (redispatch) refuses a ticket labeled for another platform, and starts one labeled for this one', () => {
  const box = capBox({ dispatcher: { platformLabels: { 'needs-other': ELSEWHERE, 'needs-here': HERE } }, tickets: { 'ENG-9': live(9, { status: 'stuck', stuckAt: OLD }) } });
  box.put('labels.json', { 'ENG-9': ['needs-other'] });
  assert.match(run(box, ['redispatch', 'ENG-9']), /not replaced on host-a: it is labeled needs-other/);
  assert.equal(briefs(box).length, 0);
  box.put('labels.json', { 'ENG-9': ['needs-here'] });
  assert.match(run(box, ['redispatch', 'ENG-9']), /ENG-9: redispatched/);
  assert.equal(briefs(box).length, 1);
});
