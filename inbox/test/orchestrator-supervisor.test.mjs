// orchestrator-supervisor.mjs, in process, with a throwaway state folder and a fake fetch standing in for the board and
// Slack. Nothing reaches the network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { orchestratorPaths, renew, take } from '../orchestrator.mjs';
import { supervise } from '../orchestrator-supervisor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
const NOW = Date.parse('2026-01-01T12:00:00Z');
const ago = (m) => new Date(NOW - m * 60000).toISOString();
const TOKEN = 'xoxb-fake-token';

function box({ token = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-'));
  const stateDir = path.join(home, 'state');
  const sharedDir = path.join(home, 'shared');
  fs.mkdirSync(path.join(sharedDir, 'merge-requests'), { recursive: true });
  fs.mkdirSync(stateDir);
  if (token) fs.writeFileSync(path.join(stateDir, 'bot-token'), `${TOKEN}\n`);
  const cfg = { ...EXAMPLE, paths: { stateDir, sharedDir }, slack: { ...EXAMPLE.slack, botTokenFile: path.join(stateDir, 'bot-token') },
    orchestrator: { ...EXAMPLE.orchestrator, lockFile: null, approvalsFile: null, leaseMinutes: 30, supervisor: { waitMinutes: 30, cooldownMinutes: 60 } } };
  const p = orchestratorPaths(cfg);
  take(p, 'S1');
  const posts = [];
  let board = { tickets: [] };
  const fetchImpl = async (url, opts = {}) => {
    if (url.includes('slack.com')) { posts.push({ headers: opts.headers, body: JSON.parse(opts.body) }); return { ok: true, json: async () => (slackOk ? { ok: true } : { ok: false, error: 'ratelimited' }) }; }
    if (url.includes('/api/snapshot')) { if (!board) throw new Error('ECONNREFUSED'); return { ok: true, json: async () => board }; }
    throw new Error(`unexpected fetch ${url}`);
  };
  const closedPrs = new Set();
  let slackOk = true;
  const run = (now = NOW) => supervise({ cfg, now, fetchImpl, isOpen: (_repo, pr) => !closedPrs.has(String(pr)) });
  const log = () => fs.readFileSync(path.join(stateDir, 'orchestrator-supervisor.log'), 'utf8');
  return { cfg, p, posts, run, log, stateDir, sharedDir, closedPrs, setBoard: (b) => { board = b; }, setSlack: (ok) => { slackOk = ok; } };
}
const askedTicket = (id, pr, minutes, extra = {}) => ({ id, prNumber: pr, status: 'merge-asked', lastProgressAt: ago(minutes), pr: { ci: { overall: 'SUCCESS' } }, ...extra });

test('a current lease means no action', async () => {
  const b = box();
  renew(b.p, 'S1', NOW - 5 * 60000);
  assert.match(await b.run(), /^lease current, no action/);
  assert.equal(b.posts.length, 0);
});

test('an expired lease with nothing waiting 30 minutes or more means no action', async () => {
  const b = box();
  b.setBoard({ tickets: [askedTicket('ENG-7', 107, 10)] });
  assert.match(await b.run(), /^nothing waiting 30m\+ \(board ok\)/);
  assert.equal(b.posts.length, 0);
});

test('an expired lease with green work waiting pages once, names it, and never moves the lock', async () => {
  const b = box();
  b.setBoard({ tickets: [askedTicket('ENG-6', 106, 55), askedTicket('ENG-7', 107, 10), askedTicket('ENG-8', 108, 90, { waiting: true }), askedTicket('ENG-9', 109, 90, { pr: { ci: { overall: 'FAILURE' } } })] });
  assert.match(await b.run(), /^ACTED: paged #agent-queue\. 1 waiting: ENG-6 PR #106 green and merge-asked for 55m/);
  assert.equal(b.posts.length, 1);
  const { body, headers } = b.posts[0];
  assert.equal(body.channel, EXAMPLE.slack.channel);
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
  assert.match(body.text, /ENG-6 PR #106 green and merge-asked, waiting 55m/);
  assert.doesNotMatch(body.text, /ENG-7|ENG-8|ENG-9/);
  assert.match(body.text, /No session was started and the lock was not moved/);
  assert.match(body.text, /Lock holder: S1/);
  assert.equal(fs.readFileSync(b.p.lock, 'utf8'), 'S1\n');
  assert.ok(!b.log().includes(TOKEN), 'the token stays out of the log');
  assert.ok(!fs.readFileSync(path.join(b.stateDir, 'orchestrator-supervisor.json'), 'utf8').includes(TOKEN));
});

test('cooldown: no second page within cooldownMinutes, another after it', async () => {
  const b = box();
  b.setBoard({ tickets: [askedTicket('ENG-6', 106, 55)] });
  await b.run();
  assert.match(await b.run(NOW + 59 * 60000), /^cooldown: paged 59m ago/);
  assert.equal(b.posts.length, 1);
  await b.run(NOW + 61 * 60000);
  assert.equal(b.posts.length, 2);
});

test('the kill switch only logs', async () => {
  const b = box();
  b.setBoard({ tickets: [askedTicket('ENG-8', 108, 45)] });
  fs.writeFileSync(path.join(b.stateDir, 'supervisor.off'), '');
  assert.match(await b.run(), /^kill switch supervisor\.off set: would page\. 1 waiting: ENG-8/);
  assert.equal(b.posts.length, 0);
  assert.equal(fs.existsSync(path.join(b.stateDir, 'orchestrator-supervisor.json')), false);
});

test('with the board unreachable, merge request files stand in', async () => {
  const b = box();
  b.setBoard(null);
  fs.writeFileSync(path.join(b.sharedDir, 'merge-requests/ENG-9.json'), JSON.stringify({ id: 'ENG-9', pr: 109, at: ago(40) }));
  await b.run();
  assert.equal(b.posts.length, 1);
  assert.match(b.posts[0].body.text, /ENG-9 PR #109 merge request, waiting 40m/);
});

test('an approved head not merged counts; a merged line or a merged board ticket closes it', async () => {
  const b = box();
  b.setBoard({ tickets: [{ id: 'ENG-10', prNumber: 110, status: 'merged' }] });
  const ledger = path.join(b.sharedDir, 'approvals.jsonl');
  const line = (o) => `${JSON.stringify(o)}\n`;
  fs.writeFileSync(ledger, line({ pr: 110, head: 'a'.repeat(40), approvedAt: ago(40) }) + line({ pr: 111, head: 'b'.repeat(40), approvedAt: ago(40) })
    + line({ pr: 112, head: 'c'.repeat(40), approvedAt: ago(50) }) + line({ pr: 112, head: 'c'.repeat(40), event: 'merged', merged: true, at: ago(45) }));
  await b.run();
  assert.equal(b.posts.length, 1);
  assert.match(b.posts[0].body.text, /PR #111 approved at bbbbbbbbbb, not merged/);
  assert.doesNotMatch(b.posts[0].body.text, /#110|#112/);
});

test('with no bot token it logs that no page went out', async () => {
  const b = box({ token: false });
  b.setBoard({ tickets: [askedTicket('ENG-6', 106, 55)] });
  assert.match(await b.run(), /ACTED: no Slack bot token, page not sent/);
  assert.equal(b.posts.length, 0);
});

test('a page Slack refuses starts no cooldown, and an approval of a closed PR does not count', async () => {
  const b = box();
  b.setBoard({ tickets: [] });
  fs.writeFileSync(path.join(b.sharedDir, 'approvals.jsonl'), `${JSON.stringify({ pr: 120, head: 'e'.repeat(40), approvedAt: ago(40) })}\n${JSON.stringify({ pr: 121, head: 'f'.repeat(40), approvedAt: ago(40) })}\n`);
  b.closedPrs.add('121');
  b.setSlack(false);
  assert.match(await b.run(), /ACTED: Slack refused the page: ratelimited\. 1 waiting: PR #120/);
  b.setSlack(true);
  assert.match(await b.run(NOW + 5 * 60000), /ACTED: paged/);
  assert.equal(b.posts.length, 2);
  assert.doesNotMatch(b.posts[1].body.text, /#121/);
});
