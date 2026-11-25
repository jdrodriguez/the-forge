// An API answer that is a gateway error page ("upstream connect error ...", HTTP 503, not JSON) is read once more, and
// when it stays bad only the tick step that needed it is skipped, with a log line, and no new ticket is claimed that
// tick. A gh JSON read gets the same. Runs the real dispatcher in capacity-sandbox.mjs, with its stub Linear wrapped to
// answer with the gateway page as $GATEWAY says.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { capBox, lines } from './capacity-sandbox.mjs';
import { runIn } from './sandbox.mjs';

const PAGE = 'upstream connect error or disconnect/reset before headers. reset reason: connection failure';
// GATEWAY: "once" the first Linear call; "teams" every team read; "labelcheck" the label check; "claim" the issue id
// lookup (reconcileClaims); "ready" the ready-queue read (dispatch). Each Linear call is counted in $HOME/linear-calls.
const WRAP = `
const gatewayInner = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const q = JSON.parse(init.body).query;
  fs.appendFileSync(process.env.HOME + '/linear-calls', q.replace(/\\s+/g, ' ').slice(0, 60) + '\\n');
  const n = fs.readFileSync(process.env.HOME + '/linear-calls', 'utf8').split('\\n').filter(Boolean).length;
  const mode = process.env.GATEWAY;
  const hit = (mode === 'once' && n === 1) || (mode === 'teams' && q.includes('teams(')) || (mode === 'labelcheck' && q.includes('labelCheck'))
    || (mode === 'claim' && q.includes('issue(id:$id){ id }')) || (mode === 'ready' && q.includes('inverseRelations'));
  if (hit) return new Response(${JSON.stringify(PAGE)}, { status: 503, headers: { 'Content-Type': 'text/plain' } });
  return gatewayInner(url, init);
};
`;
function box({ tickets = {}, ghPage = false } = {}) {
  const b = capBox({ tickets });
  fs.appendFileSync(path.join(b.home, 'preload.mjs'), WRAP);
  if (ghPage) {
    fs.renameSync(path.join(b.bin, 'gh'), path.join(b.bin, 'gh-stub'));
    fs.writeFileSync(path.join(b.bin, 'gh'), `#!/usr/bin/env node
const a = process.argv.slice(2);
const fs = require('node:fs');
if (a[0] === 'pr' && a[1] === 'view') {
  fs.appendFileSync(process.env.HOME + '/gh-views', 'x\\n');
  console.log(${JSON.stringify(PAGE)});
} else process.stdout.write(require('node:child_process').execFileSync(__dirname + '/gh-stub', a, { encoding: 'utf8' }));
`, { mode: 0o755 });
  }
  return b;
}
const tick = (b, gateway) => {
  const r = runIn(b, ['tick'], { GATEWAY: gateway, DISPATCHER_API_RETRY_MS: '10' });
  return { status: r.status, out: r.stdout + r.stderr };
};

test('one gateway page from Linear is read again, and the tick goes on as usual', () => {
  const b = box();
  const { status, out } = tick(b, 'once');
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /tick failed|skipped this tick|not valid JSON/);
  const calls = lines(b, 'linear-calls');
  assert.equal(calls[0], calls[1], 'the same query was sent again');
});

test('a step that catches its own errors logs the gateway answer plainly, and the tick goes on', () => {
  const b = box();
  const { status, out } = tick(b, 'labelcheck');
  assert.equal(status, 0, out);
  assert.match(out, /label check could not run \(Linear answered HTTP 503 with no JSON \("upstream connect error/);
  assert.doesNotMatch(out, /tick failed|not valid JSON/);
});

test('a step whose Linear read stays a gateway page is skipped with a clear line; the tick goes on and claims nothing new', () => {
  const b = box({ tickets: { 'ENG-8': { status: 'claiming', claimedAt: new Date(Date.now() - 3600_000).toISOString(), branch: 'agent/eng-8' } } });
  const { status, out } = tick(b, 'claim');
  assert.equal(status, 0, out);
  assert.match(out, /reconcileClaims skipped this tick: Linear answered HTTP 503 with no JSON \("upstream connect error/);
  assert.match(out, /no new claims this tick: reconcileClaims could not reach an API/);
  assert.doesNotMatch(out, /tick failed|not valid JSON/);
  assert.ok(fs.existsSync(path.join(b.shared, 'heartbeats/host-a.json')), 'the steps after it still ran');
});

test('dispatch whose ready-queue read stays a gateway page is skipped, and the steps after it run', () => {
  const b = box();
  const { status, out } = tick(b, 'ready');
  assert.equal(status, 0, out);
  assert.match(out, /dispatch skipped this tick: Linear answered HTTP 503 with no JSON/);
  assert.doesNotMatch(out, /tick failed|not valid JSON/);
  assert.ok(fs.existsSync(path.join(b.shared, 'heartbeats/host-a.json')));
});

test('when the read every step needs stays a gateway page, the tick stops with a clear line, not a JSON parse error', () => {
  const b = box();
  const { out } = tick(b, 'teams');
  assert.match(out, /tick failed: Linear answered HTTP 503 with no JSON \("upstream connect error/);
  assert.doesNotMatch(out, /not valid JSON|Unexpected token/);
});

test('a gh JSON read that stays a gateway page is read once more, then fails only that ticket for this tick', () => {
  const b = box({ ghPage: true, tickets: { 'ENG-9': { status: 'merge-asked', prNumber: 9, pr: 'https://github.com/x/pull/9', branch: 'agent/eng-9',
    claimedAt: new Date().toISOString(), account: 'b', workerId: 'w9' } } });
  const { status, out } = tick(b, 'none');
  assert.equal(status, 0, out);
  assert.match(out, /gh pr view answered with no JSON \("upstream connect error/);
  assert.doesNotMatch(out, /tick failed|not valid JSON/);
  assert.equal(lines(b, 'gh-views').length % 2, 0, 'each read was tried twice');
  assert.ok(lines(b, 'gh-views').length >= 2);
});
