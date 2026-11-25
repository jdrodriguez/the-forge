// codex-reset.mjs: spends the Codex account's free rate-limit resets so they are not wasted. OpenAI grants a Codex
// account occasional "Full reset" credits that expire about 30 days after they are granted. A reset refills the windows
// in use, so it is worth most when the weekly window is spent and its own reset is far off. Off unless
// dispatcher.codexAutoReset.enabled.
//
// Two rules, in order, and at most one reset per minHoursBetweenResets:
//   1. spent: a window is at weeklyTriggerPercent (100) and resets on its own more than minHoursToNaturalReset away.
//      Only a spent window counts, so no included usage is left on the table. Past the limit Codex draws the account's
//      paid credits on its own, so the gap until the next tick costs a few credits, not a stall.
//   2. use or lose: the soonest-expiring reset expires within expiringWithinHours and the weekly window is at
//      expiringMinWeeklyPercent or more, so a reset that would otherwise lapse still buys back real usage.
// The soonest-expiring reset is always the one spent.
//
// The dispatcher calls run() from its tick on codexAutoReset.host only (default the first of dispatcher.enabledHosts),
// since one Codex account serves every machine. Each redeem carries an idempotency key built from the window's natural
// reset time and the credit, so two callers racing on one window spend one credit. Codex is asked the way its own usage
// screen asks: `codex app-server`, account/rateLimits/read, then account/rateLimitResetCredit/consume. The CLI keeps its
// own sign-in, so no token passes through here. Every spend goes to <paths.stateDir>/codex-resets.json.
//
//   node codex-reset.mjs            prints what the rules decide now, and changes nothing
//   node codex-reset.mjs --apply    decides and, when the rules say so, spends the reset
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';

const HOME = os.homedir();
const TIMEOUT_MS = 25_000;
export const ledgerFile = (conf) => path.join(conf.paths.stateDir, 'codex-resets.json');
export const DEFAULTS = {
  weeklyTriggerPercent: 100,
  minHoursToNaturalReset: 12,
  expiringWithinHours: 48,
  expiringMinWeeklyPercent: 50,
  minHoursBetweenResets: 24,
};
const HOUR = 3_600_000;
const SHORT_WINDOW_MINS = 600; // the five-hour window and anything shorter; longer is the weekly one

// The Codex the queue board runs: the path set in Codex's config, then the desktop app's copy, then PATH.
export function codexBin() {
  const dirs = [path.dirname(process.execPath), ...(process.env.PATH ?? '').split(':'), path.join(HOME, '.npm-global/bin'),
    path.join(HOME, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  let configured = null;
  try {
    configured = fs.readFileSync(path.join(HOME, '.codex/config.toml'), 'utf8').match(/^CODEX_CLI_PATH = "(.*)"/m)?.[1];
  } catch {}
  const exe = (c) => {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return fs.statSync(c).isFile();
    } catch {
      return false;
    }
  };
  return [configured, '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/Codex.app/Contents/Resources/codex', ...dirs.map((d) => path.join(d, 'codex'))].find((c) => c && exe(c)) ?? 'codex';
}

// One app-server conversation: initialize, then the given requests in order, each answered by id.
export function appServer(requests, bin = codexBin()) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['app-server'], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    const answers = {};
    let buf = '';
    let err = '';
    let done = false;
    const finish = (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      p.kill();
      e ? reject(new Error(e)) : resolve(answers);
    };
    const timer = setTimeout(() => finish(`codex app-server gave no answer in ${TIMEOUT_MS / 1000}s`), TIMEOUT_MS);
    const send = (o) => p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`);
    p.on('error', (e) => finish(e.code === 'ENOENT' ? 'codex is not installed here' : e.message));
    p.on('close', () => finish(err.trim().split('\n').at(-1) || 'codex app-server exited early'));
    p.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    p.stdout.on('data', (d) => {
      buf += d;
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m.id === 0) {
          send({ method: 'initialized' });
          requests.forEach((r, n) => send({ id: n + 1, ...r }));
        } else if (Number.isInteger(m.id) && m.id > 0) {
          answers[m.id] = m;
          if (requests.every((_, n) => answers[n + 1])) finish(null);
        }
      }
    });
    send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'agent-dispatcher', version: '1' } } });
  });
}

// The account's windows and reset credits, shaped for decide().
export async function readLimits(call = appServer) {
  const a = await call([{ method: 'account/rateLimits/read' }]);
  const r = a[1]?.result;
  if (!r?.rateLimits) throw new Error(a[1]?.error?.message ?? 'no rate limits in the answer');
  const s = r.rateLimits;
  const windows = [s.primary, s.secondary].filter(Boolean).map((w) => ({
    weekly: (w.windowDurationMins ?? 0) > SHORT_WINDOW_MINS,
    used: w.usedPercent ?? 0,
    resetsAt: w.resetsAt ? w.resetsAt * 1000 : null,
  }));
  const summary = r.rateLimitResetCredits ?? { availableCount: 0, credits: [] };
  const credits = (summary.credits ?? [])
    .filter((c) => c.status === 'available' && c.resetType === 'codexRateLimits')
    .map((c) => ({ id: c.id, expiresAt: c.expiresAt ? c.expiresAt * 1000 : null, title: c.title ?? null }));
  return { plan: s.planType ?? null, reached: s.rateLimitReachedType ?? null, windows, credits,
    availableCount: summary.availableCount ?? credits.length, paidCredits: s.credits?.balance ?? null };
}

const hoursUntil = (ms, now) => (ms == null ? Infinity : (ms - now) / HOUR);
const round = (n) => Math.round(n * 10) / 10;

// Pure: what the rules say for this snapshot. { act: true, creditId, key, rule, reason } or { act: false, reason }.
export function decide(snap, now, opts = {}, lastResetAt = null) {
  const o = { ...DEFAULTS, ...opts };
  if (!snap.availableCount) return { act: false, reason: 'no free reset is available' };
  if (lastResetAt && hoursUntil(now, lastResetAt) < o.minHoursBetweenResets) {
    return { act: false, reason: `a reset was spent ${round(hoursUntil(now, lastResetAt))}h ago, under minHoursBetweenResets (${o.minHoursBetweenResets}h)` };
  }
  // Soonest expiry first; a credit that never expires goes last. With no detail rows, the backend picks (creditId null).
  const credit = [...snap.credits].sort((x, y) => (x.expiresAt ?? Infinity) - (y.expiresAt ?? Infinity))[0] ?? null;
  const weekly = snap.windows.find((w) => w.weekly) ?? null;
  const key = (w) => `codex-reset-${w?.resetsAt ?? 'unknown'}-${credit?.id ?? 'next'}`;

  const spent = snap.windows
    .filter((w) => w.used >= o.weeklyTriggerPercent && hoursUntil(w.resetsAt, now) > o.minHoursToNaturalReset)
    .sort((x, y) => y.weekly - x.weekly)[0];
  if (spent) {
    return { act: true, creditId: credit?.id ?? null, key: key(spent), rule: 'spent',
      reason: `the ${spent.weekly ? 'weekly' : 'five-hour'} window is at ${spent.used}% and resets on its own in ${round(hoursUntil(spent.resetsAt, now))}h` };
  }
  const expiring = credit && hoursUntil(credit.expiresAt, now) <= o.expiringWithinHours;
  if (expiring && weekly && weekly.used >= o.expiringMinWeeklyPercent) {
    return { act: true, creditId: credit.id, key: key(weekly), rule: 'expiring',
      reason: `a reset expires in ${round(hoursUntil(credit.expiresAt, now))}h and the weekly window is at ${weekly.used}%` };
  }
  const top = [...snap.windows].sort((x, y) => y.used - x.used)[0];
  const state = top ? `the fullest window is at ${top.used}%, resetting in ${round(hoursUntil(top.resetsAt, now))}h` : 'no usage windows reported';
  const soonest = credit?.expiresAt ? `; the next reset expires in ${round(hoursUntil(credit.expiresAt, now))}h` : '';
  return { act: false, reason: `${state}${soonest}` };
}

export async function consume(creditId, key, call = appServer) {
  const a = await call([{ method: 'account/rateLimitResetCredit/consume', params: { idempotencyKey: key, ...(creditId ? { creditId } : {}) } }]);
  const outcome = a[1]?.result?.outcome;
  if (!outcome) throw new Error(a[1]?.error?.message ?? 'no outcome in the answer');
  return outcome; // reset | nothingToReset | noCredit | alreadyRedeemed
}

function readLedger(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { resets: [] };
  }
}
function writeLedger(file, ledger) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

// The host that spends resets: codexAutoReset.host, else the first of dispatcher.enabledHosts.
export const resetHost = (cfg) => cfg.codexAutoReset?.host ?? cfg.enabledHosts?.[0] ?? null;

// The dispatcher's entry. cfg is the dispatcher section. Returns { checked, reset, outcome?, decision? }; never throws
// for the tick's sake.
export async function run({ cfg, host, ledger: file, dry = false, log = () => {}, notify = async () => {}, now = Date.now(), call = appServer }) {
  const c = cfg.codexAutoReset;
  if (!c?.enabled || host !== resetHost(cfg)) return { checked: false, reset: false };
  const ledger = readLedger(file);
  let snap;
  try {
    snap = await readLimits(call);
  } catch (e) {
    log(`codex auto-reset: could not read Codex usage, nothing spent (${e.message})`);
    return { checked: false, reset: false };
  }
  const last = ledger.resets.filter((r) => r.outcome === 'reset').at(-1)?.at ?? null;
  const d = decide(snap, now, c, last ? Date.parse(last) : null);
  if (!d.act) return { checked: true, reset: false, decision: d };
  if (dry) {
    log(`codex auto-reset: would spend a free reset (${d.reason}), dry run`);
    return { checked: true, reset: false, decision: d };
  }
  let outcome;
  try {
    outcome = await consume(d.creditId, d.key, call);
  } catch (e) {
    log(`codex auto-reset: the redeem call failed, nothing known spent (${e.message})`);
    return { checked: true, reset: false, decision: d };
  }
  ledger.resets.push({ at: new Date(now).toISOString(), host, rule: d.rule, reason: d.reason, creditId: d.creditId, key: d.key, outcome });
  writeLedger(file, ledger);
  const left = Math.max(0, snap.availableCount - (outcome === 'reset' ? 1 : 0));
  log(`codex auto-reset: ${outcome} (${d.reason}); ${left} free reset(s) left`);
  if (outcome === 'reset') await notify('Codex limit reset', `Spent a free Codex reset: ${d.reason}. ${left} left.`);
  return { checked: true, reset: outcome === 'reset', outcome, decision: d };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const conf = loadConfig();
  const cfg = conf.dispatcher ?? {};
  if (process.argv.includes('--apply')) {
    // The same path the tick takes: the host and enabled checks, the ledger and its spacing rule.
    console.log(JSON.stringify(await run({ cfg, host: os.hostname().split('.')[0], ledger: ledgerFile(conf), log: console.log }), null, 2));
  } else {
    const snap = await readLimits();
    const last = readLedger(ledgerFile(conf)).resets.filter((r) => r.outcome === 'reset').at(-1)?.at ?? null;
    const d = decide(snap, Date.now(), cfg.codexAutoReset ?? {}, last ? Date.parse(last) : null);
    const when = (ms) => ms && new Date(ms).toISOString();
    console.log(JSON.stringify({ snapshot: { ...snap, windows: snap.windows.map((w) => ({ ...w, resetsAt: when(w.resetsAt) })),
      credits: snap.credits.map((x) => ({ ...x, expiresAt: when(x.expiresAt) })) }, decision: d }, null, 2));
  }
}
