// codex-reset.mjs: the rules that decide when a free Codex rate-limit reset is spent, and run()'s ledger, spacing,
// host check and redeem call. Codex itself is never started: every test passes a fake app-server `call`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.CODEX_RESET_SRC ?? path.join(HERE, '..', 'codex-reset.mjs');
const { decide, run, readLimits } = await import(SRC);

const NOW = Date.parse('2026-11-09T23:00:00Z');
const H = 3_600_000;
const weekly = (used, inHours) => ({ weekly: true, used, resetsAt: NOW + inHours * H });
const fiveHour = (used, inHours) => ({ weekly: false, used, resetsAt: NOW + inHours * H });
const credit = (id, expiresInHours) => ({ id, expiresAt: expiresInHours == null ? null : NOW + expiresInHours * H, title: 'Full reset' });
const snap = (windows, credits) => ({ windows, credits, availableCount: credits.length, reached: null });

test('a weekly window at the trigger with its own reset far off spends the soonest-expiring reset', () => {
  const d = decide(snap([weekly(100, 60)], [credit('late', 500), credit('soon', 300)]), NOW);
  assert.equal(d.act, true);
  assert.equal(d.rule, 'spent');
  assert.equal(d.creditId, 'soon');
  assert.equal(d.key, `codex-reset-${NOW + 60 * H}-soon`);
});

test('a window whose own reset is near is left to reset by itself', () => {
  assert.equal(decide(snap([weekly(100, 6)], [credit('a', 300)]), NOW).act, false);
});

test('a five-hour window at the limit never spends a reset, since it refills within hours', () => {
  assert.equal(decide(snap([fiveHour(100, 3), weekly(40, 80)], [credit('a', 300)]), NOW).act, false);
});

test('a weekly window at 98% is not reset, since 2% of it is still usable', () => {
  assert.equal(decide(snap([weekly(98, 60)], [credit('a', 300)]), NOW).act, false);
});

test('below the trigger nothing is spent while no reset is about to expire', () => {
  const d = decide(snap([weekly(80, 60)], [credit('a', 300)]), NOW);
  assert.equal(d.act, false);
  assert.match(d.reason, /80%/);
});

test('a reset about to expire is spent once the week is half used, not before', () => {
  const d = decide(snap([weekly(55, 100)], [credit('a', 20)]), NOW);
  assert.equal(d.act, true);
  assert.equal(d.rule, 'expiring');
  assert.equal(decide(snap([weekly(30, 100)], [credit('a', 20)]), NOW).act, false);
});

test('no available reset, or one spent within minHoursBetweenResets, spends nothing', () => {
  assert.equal(decide(snap([weekly(100, 60)], []), NOW).act, false);
  const d = decide(snap([weekly(100, 60)], [credit('a', 300)]), NOW, {}, NOW - 5 * H);
  assert.equal(d.act, false);
  assert.match(d.reason, /minHoursBetweenResets/);
  assert.equal(decide(snap([weekly(100, 60)], [credit('a', 300)]), NOW, {}, NOW - 30 * H).act, true);
});

test('with only a count and no credit rows, the backend picks the credit', () => {
  const d = decide({ windows: [weekly(100, 60)], credits: [], availableCount: 1 }, NOW);
  assert.equal(d.act, true);
  assert.equal(d.creditId, null);
});

// A fake app-server: answers account/rateLimits/read from `limits` and records each consume.
function fakeCodex(limits, outcome = 'reset') {
  const consumed = [];
  const call = async (requests) => {
    const r = requests[0];
    if (r.method === 'account/rateLimits/read') return { 1: { result: limits } };
    if (r.method === 'account/rateLimitResetCredit/consume') {
      consumed.push(r.params);
      return { 1: { result: { outcome } } };
    }
    throw new Error(`unexpected ${r.method}`);
  };
  return { call, consumed };
}
const LIMITS = (usedPercent, resetsInHours, credits) => ({
  rateLimits: { planType: 'pro', primary: { usedPercent, windowDurationMins: 10080, resetsAt: Math.floor((NOW + resetsInHours * H) / 1000) },
    secondary: null, credits: { hasCredits: true, unlimited: false, balance: '100' }, rateLimitReachedType: null },
  rateLimitResetCredits: { availableCount: credits.length, credits: credits.map(([id, expH]) => ({ id, status: 'available', resetType: 'codexRateLimits',
    grantedAt: 1, expiresAt: Math.floor((NOW + expH * H) / 1000), title: 'Full reset' })) },
});
const CFG = { codexAutoReset: { enabled: true, host: 'host-a' } };
const tmpLedger = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-reset-')), 'ledger.json');

test('readLimits reads the weekly window, the available credits and the paid balance', async () => {
  const s = await readLimits(fakeCodex(LIMITS(70, 50, [['a', 100]])).call);
  assert.deepEqual(s.windows, [{ weekly: true, used: 70, resetsAt: Math.floor((NOW + 50 * H) / 1000) * 1000 }]);
  assert.equal(s.credits[0].id, 'a');
  assert.equal(s.paidCredits, '100');
});

test('run spends the reset, writes the ledger and notifies; a second tick inside the spacing spends nothing', async () => {
  const ledgerFile = tmpLedger();
  const codex = fakeCodex(LIMITS(100, 60, [['b', 500], ['a', 200]]));
  const notes = [];
  const out = await run({ cfg: CFG, host: 'host-a', now: NOW, call: codex.call, ledger: ledgerFile, notify: async (s, t) => notes.push(t) });
  assert.equal(out.reset, true);
  assert.deepEqual(codex.consumed, [{ idempotencyKey: `codex-reset-${Math.floor((NOW + 60 * H) / 1000) * 1000}-a`, creditId: 'a' }]);
  assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).resets[0].outcome, 'reset');
  assert.match(notes[0], /1 left/);
  const again = await run({ cfg: CFG, host: 'host-a', now: NOW + H, call: codex.call, ledger: ledgerFile });
  assert.equal(again.reset, false);
  assert.equal(codex.consumed.length, 1);
});

test('run on another host, while disabled, or as a dry run never redeems', async () => {
  const codex = fakeCodex(LIMITS(100, 60, [['a', 200]]));
  const ledgerFile = tmpLedger();
  assert.equal((await run({ cfg: CFG, host: 'host-b', now: NOW, call: codex.call, ledger: ledgerFile })).checked, false);
  assert.equal((await run({ cfg: { codexAutoReset: { ...CFG.codexAutoReset, enabled: false } }, host: 'host-a', now: NOW, call: codex.call, ledger: ledgerFile })).checked, false);
  const dry = await run({ cfg: CFG, host: 'host-a', dry: true, now: NOW, call: codex.call, ledger: ledgerFile });
  assert.equal(dry.decision.act, true);
  assert.equal(codex.consumed.length, 0);
  assert.equal(fs.existsSync(ledgerFile), false);
});

test('a redeem that finds nothing to reset is recorded but does not start the spacing clock', async () => {
  const ledgerFile = tmpLedger();
  const codex = fakeCodex(LIMITS(100, 60, [['a', 200]]), 'nothingToReset');
  const out = await run({ cfg: CFG, host: 'host-a', now: NOW, call: codex.call, ledger: ledgerFile });
  assert.equal(out.reset, false);
  assert.equal(out.outcome, 'nothingToReset');
  const next = await run({ cfg: CFG, host: 'host-a', now: NOW + H, call: fakeCodex(LIMITS(100, 59, [['a', 199]])).call, ledger: ledgerFile });
  assert.equal(next.reset, true);
});

test('a Codex that cannot be read is logged and spends nothing', async () => {
  const logs = [];
  const out = await run({ cfg: CFG, host: 'host-a', now: NOW, call: async () => { throw new Error('codex is not installed here'); }, ledger: tmpLedger(), log: (m) => logs.push(m) });
  assert.equal(out.reset, false);
  assert.match(logs[0], /could not read Codex usage/);
});
