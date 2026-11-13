// Engine dispatch and the shared pool: which ready ticket goes to Codex or Grok, which stays for Claude, and how an
// engine ticket takes one slot in the machine's maxWorkers. Runs the real dispatcher in engine-sandbox.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CLAUDE_T, ENGINE_T, HEAD, NO_ROOM, OLD, ROOM, SCEN, claude, claudeBriefs, comments, engineBox, extBriefs, extCalls, issue, labelOps,
  lines, mutations, plans, starts, tick, ticket } from './engine-sandbox.mjs';
import { state } from './sandbox.mjs';

test('with the engines off, no engine starts, their usage is never read, and nothing is claimed without Claude room', () => {
  const box = engineBox({ fallback: { enabled: false }, ready: [issue(11)] });
  const out = tick(box);
  assert.match(out, /ENG-11: no account has a free worker slot and 30%\+ headroom, trying next tick/);
  assert.equal(extCalls(box).length, 0);
  assert.equal(lines(box, 'ext-usage-calls').length, 0);
  assert.equal(mutations(box).length, 0);
  assert.equal(state(box).tickets['ENG-11'], undefined);
});

test('with the engines on, an eligible S ticket is claimed and started on the engine with the most usage left', () => {
  const box = engineBox({ engines: ['codex', 'grok'], extUsage: plans({ codex: 20, grok: 40 }), ready: [issue(11, { title: 'Show the intake count' })] });
  const out = tick(box);
  assert.match(out, /ENG-11: dispatched to codex\/e0 as an engine worker, round 1 \(Codex had the most plan usage left of the accounts with room \(80% of its week\)\)/);
  const [s] = starts(box);
  assert.deepEqual(s.slice(0, 4), ['start', 'codex', 'ENG-11', 'agent/eng-11']);
  assert.ok(!s.includes('--continue'), 'a branch not on origin starts fresh');
  const t = ticket(box, 'ENG-11');
  assert.equal(t.status, 'building');
  assert.equal(t.driver, 'engine');
  assert.equal(t.engine, 'codex');
  assert.equal(t.account, 'codex');
  assert.equal(t.workerId, 'e0');
  assert.equal(t.round, 1);
  assert.deepEqual(labelOps(box), ['+L-agent-building', '-L-agent-ready']);
  assert.ok(mutations(box).some((x) => x.op === 'issueUpdate' && x.s === 's-prog'), 'moved to In Progress');
  const [b] = extBriefs(box);
  assert.match(b, /Build Linear ticket ENG-11 in your-app as one pull request\. You are Codex/);
  assert.match(b, /the human's agent dispatcher/);
  assert.match(b, /pushing to main/);
  assert.match(b, /pnpm format:check\n {4}pnpm type-check/);
  assert.match(b, /Show the intake count/);
  assert.doesNotMatch(b, /\{\{[A-Z_]+\}\}/, 'every placeholder is filled');
  const [c] = comments(box);
  assert.match(c, /a Codex engine worker \(codex\/e0\) is building this on `agent\/eng-11`/);
  assert.match(c, /waits for the orchestrator's review and merge/);
});

test('between the engines the one with more usage left wins, Grok wins a tie, and a spent 5-hour window or a limit rules one out', () => {
  const both = ['codex', 'grok'];
  const tie = engineBox({ engines: both, ready: [issue(11)] });
  tick(tie);
  assert.equal(starts(tie)[0][1], 'grok');
  const codexLeads = engineBox({ engines: both, extUsage: plans({ codex: 20, grok: 60 }), ready: [issue(11)] });
  tick(codexLeads);
  assert.equal(starts(codexLeads)[0][1], 'codex');
  const fiveHour = engineBox({ engines: both, extUsage: plans({ codex: 20, grok: 60, codexFiveHour: 95 }), ready: [issue(11)] });
  tick(fiveHour);
  assert.equal(starts(fiveHour)[0][1], 'grok', "Codex's 5-hour window is under the floor");
  const limited = engineBox({ engines: both, extUsage: plans({ codex: 20, grok: 60, codexLimited: true }), ready: [issue(11)] });
  tick(limited);
  assert.equal(starts(limited)[0][1], 'grok', 'Codex says its limit is reached');
});

test('personal data, Size L, a Sentry ticket, claude-only and a contained ticket are skipped for engines; the next eligible one starts', () => {
  const box = engineBox({ ready: [
    issue(11, { description: `${SCEN}\nWrite to someone.made.up@example.test about it.` }),
    issue(12, { title: 'Text (555) 555-0142 when it lands' }),
    issue(13, { size: 'L' }),
    issue(14, { labels: ['sentry-triaged'] }),
    issue(15),
    issue(16),
    issue(17, { labels: ['claude-only'] }),
  ] });
  fs.mkdirSync(path.join(box.shared, 'engine-contained'), { recursive: true });
  fs.writeFileSync(path.join(box.shared, 'engine-contained/ENG-15.json'), '{}');
  const out = tick(box);
  assert.match(out, /ENG-11: not for an engine worker: its title or description holds personal data \(email\)/);
  assert.match(out, /ENG-12: not for an engine worker: its title or description holds personal data \(phone\)/);
  assert.doesNotMatch(out, /someone\.made\.up@example\.test|555-0142/, 'the log names the kind, never the value');
  assert.match(out, /ENG-13: not for an engine worker: Size L is not one the engines take/);
  assert.match(out, /ENG-14: not for an engine worker: it is a Sentry fix/);
  assert.match(out, /ENG-15: not for an engine worker: an engine worker on it tripped ext-worker\.sh's containment before/);
  assert.match(out, /ENG-17: not for an engine worker: it is labeled claude-only/);
  assert.deepEqual(starts(box).map((s) => s[2]), ['ENG-16']);
  for (const n of [11, 12, 13, 14, 15, 17]) assert.equal(state(box).tickets[`ENG-${n}`], undefined, `ENG-${n} is not claimed`);
});

test('one pool: a busy engine ticket fills a pool of 1, and with Claude and engine tickets busy in a pool of 3 exactly one more starts', () => {
  const full = engineBox({ host: { maxWorkers: 1 }, usage: ROOM, ready: [issue(11)], tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'busy' } });
  assert.match(tick(full), /no slots for 1 ready: .*1\/1 on this machine/);
  assert.equal(starts(full).length, 0);
  assert.equal(claudeBriefs(full).length, 0);
  assert.equal(state(full).tickets['ENG-11'], undefined);

  const now = new Date().toISOString();
  const three = engineBox({ host: { maxWorkers: 3 }, usage: ROOM, ready: [issue(11), issue(12)], registry: { status: 'busy' },
    tickets: { 'ENG-8': { ...CLAUDE_T, lastOutputAt: now }, 'ENG-9': ENGINE_T },
    ps: [{ label: 'b', id: 'w-live', status: 'busy', kind: 'background', pid: 1 }] });
  const out = tick(three);
  assert.match(out, /ENG-11: dispatched to b\/w0/);
  assert.doesNotMatch(out, /ENG-12: dispatched/);
  assert.equal(starts(three).length, 0);
  assert.equal(state(three).tickets['ENG-12'], undefined);
});

test('the account with the most weekly usage left wins, Claude or engine; a ticket an engine may not take goes to Claude; no room means it waits', () => {
  const claudeLeads = engineBox({ usage: claude(90), ready: [issue(11)] });
  assert.match(tick(claudeLeads), /ENG-11: dispatched to b\/w0/);
  assert.equal(starts(claudeLeads).length, 0);
  assert.equal(ticket(claudeLeads, 'ENG-11').driver, undefined);

  const codexLeads = engineBox({ usage: claude(50), extUsage: plans({ codex: 20 }), ready: [issue(11)] });
  assert.match(tick(codexLeads), /ENG-11: dispatched to codex\/e0 as an engine worker/);
  assert.equal(claudeBriefs(codexLeads).length, 0);

  const notForEngine = engineBox({ usage: claude(50), extUsage: plans({ codex: 5 }), ready: [issue(11, { size: 'L' }), issue(12)] });
  const out = tick(notForEngine);
  assert.match(out, /ENG-11: dispatched to b\/w0/);
  assert.match(out, /ENG-12: dispatched to codex\/e0 as an engine worker/);
  assert.equal(ticket(notForEngine, 'ENG-11').driver, undefined);

  const none = engineBox({ usage: NO_ROOM, extUsage: plans({ codex: 95 }), ready: [issue(11, { size: 'L' }), issue(12)] });
  const waits = tick(none);
  assert.match(waits, /ENG-11: not for an engine worker: Size L is not one the engines take \(S, M\); no Claude account has a free worker slot/);
  assert.match(waits, /ENG-12: no account has a free worker slot and 30%\+ headroom, trying next tick/);
  assert.equal(starts(none).length, 0);
  assert.equal(claudeBriefs(none).length, 0);
  assert.equal(labelOps(none).length, 0, 'nothing is claimed');
});

test("an engine whose usage can't be read ranks after every account with a reading, and still takes work when nothing else has room", () => {
  const claudeFirst = engineBox({ usage: claude(35), extUsage: null, ready: [issue(11)] });
  assert.match(tick(claudeFirst), /ENG-11: dispatched to b\/w0/);
  assert.equal(starts(claudeFirst).length, 0);

  const engineLast = engineBox({ usage: NO_ROOM, extUsage: null, ready: [issue(11)] });
  const out = tick(engineLast);
  assert.match(out, /engine usage: could not read Codex's plan usage \(.*the usage reader gave no answer.*\), so it ranks after every account with a reading/);
  assert.match(out, /ENG-11: dispatched to codex\/e0 as an engine worker, round 1 \(no account with a usage reading had room, and Codex's usage could not be read\)/);
  assert.equal(lines(engineLast, 'ext-usage-calls').length, 1, 'one reading a tick');
});

test("an engine ticket waiting on the orchestrator's merge holds no slot", () => {
  const asked = { ...ENGINE_T, status: 'merge-asked', prNumber: 7, riskySha: HEAD, mergeAskedAt: OLD };
  const box = engineBox({ host: { maxWorkers: 1 }, usage: ROOM, ready: [issue(11)], registry: { status: 'done' }, pr: {}, tickets: { 'ENG-9': asked } });
  const out = tick(box);
  assert.equal(ticket(box).status, 'merge-asked');
  assert.match(out, /ENG-11: dispatched to b\/w0/);
});

test('an engine worker is never counted as a worker outside the queue', () => {
  const box = engineBox({ usage: ROOM, host: { maxWorkers: 2 }, tickets: { 'ENG-9': ENGINE_T }, registry: { status: 'busy' }, ready: [issue(11), issue(12)],
    ps: [{ label: 'b', id: 'idle-one', status: 'idle', kind: 'background', pid: 1 }] });
  const out = tick(box);
  assert.match(out, /ENG-11: dispatched to b\/w0/);
  assert.doesNotMatch(out, /ENG-12: dispatched/, 'the engine ticket and ENG-11 fill the pool of 2');
  assert.doesNotMatch(out, /outside the queue/);
  assert.equal(claudeBriefs(box).length, 1);
});
