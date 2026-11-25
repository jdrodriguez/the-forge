// Platform labels: a ticket labeled with a key of dispatcher.platformLabels builds only on a machine of that platform,
// never on an engine, never bundled with a ticket that needs another, and its Sentry fix is left only to a Sentry
// machine of that platform. Runs the real dispatcher in capacity-sandbox.mjs, and in engine-sandbox.mjs for engines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { capBox, dispatches, heartbeat, ready, tick } from './capacity-sandbox.mjs';
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
