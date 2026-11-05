#!/usr/bin/env node
// ext-usage.mjs: prints the plan usage of the Codex and Grok subscriptions signed in on this machine as JSON, for the
// queue board.
//   node ext-usage.mjs
// Each CLI is asked the way its own usage screen asks: Codex through `codex app-server` (account/rateLimits/read) and
// Grok through `grok agent stdio` (_x.ai/billing). Both are read-only calls to the provider's billing service; neither
// starts a session or runs a model, so a check spends none of the allowance it reports. The CLIs keep their own sign-in,
// so no token passes through here.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const TIMEOUT_MS = 25_000;
// launchd and ssh start this with a short PATH, so the usual install folders are added, and node's own folder for an
// npm-installed codex.
const DIRS = [path.dirname(process.execPath), ...(process.env.PATH ?? '').split(':'), path.join(HOME, '.npm-global/bin'),
  path.join(HOME, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
const ENV = { ...process.env, PATH: [...new Set(DIRS.filter(Boolean))].join(':') };
const executable = (c) => { try { fs.accessSync(c, fs.constants.X_OK); return fs.statSync(c).isFile(); } catch { return false; } };
// The same Codex that scripts/ext-agent.sh runs: the path set in Codex's config, then the desktop app's copy, then PATH.

function codexBin() {
  let configured = null;
  try { configured = fs.readFileSync(path.join(HOME, '.codex/config.toml'), 'utf8').match(/^CODEX_CLI_PATH = "(.*)"/m)?.[1]; } catch {}
  return [configured, '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/Codex.app/Contents/Resources/codex', ...DIRS.map((d) => path.join(d, 'codex'))].find((c) => c && executable(c)) ?? 'codex';
}
const CODEX_PLANS = { plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu' };

// Starts a JSON-RPC peer over stdio, sends the requests in order once `first` answers, and resolves every answer by id.
function rpc(cmd, args, first, rest) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: os.tmpdir(), env: ENV, stdio: ['pipe', 'pipe', 'pipe'] });
    const answers = {};
    const want = [first, ...rest].map((r) => r.id);
    let buf = '', err = '';
    const finish = (error) => { clearTimeout(timer); p.kill(); resolve({ answers, error }); };
    const timer = setTimeout(() => finish(`no answer in ${TIMEOUT_MS / 1000}s`), TIMEOUT_MS);
    const send = (o) => p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`);
    p.on('error', (e) => finish(e.code === 'ENOENT' ? `${path.basename(cmd)} is not installed here` : e.message));
    p.on('close', () => finish(err.trim().split('\n').at(-1) || 'exited early'));
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.stdout.on('data', (d) => {
      buf += d;
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (!want.includes(m.id)) continue;
        answers[m.id] = m;
        if (m.id === first.id) rest.forEach(send);
        if (want.every((id) => answers[id])) finish(null);
      }
    });
    send(first);
  });
}

const iso = (secs) => (secs ? new Date(secs * 1000).toISOString() : null);

async function codex() {
  const { answers, error } = await rpc(codexBin(), ['app-server'],
    { id: 1, method: 'initialize', params: { clientInfo: { name: 'queue-board', version: '1' } } },
    [{ method: 'initialized' }, { id: 2, method: 'account/rateLimits/read' }, { id: 3, method: 'account/read', params: { refreshToken: false } }]);
  const r = answers[2]?.result?.rateLimits;
  if (!r) return { name: 'Codex', error: answers[2]?.error?.message ?? error ?? 'no usage in the answer' };
  const acct = answers[3]?.result?.account;
  const out = { name: 'Codex', account: acct?.email ?? null, plan: CODEX_PLANS[r.planType] ?? r.planType ?? null, fiveHour: null, weekly: null };
  // The plan decides which windows exist; a window is placed by its length.
  for (const w of [r.primary, r.secondary].filter(Boolean)) {
    const win = { used: w.usedPercent ?? null, resetsAt: iso(w.resetsAt) };
    if (w.windowDurationMins <= 600) out.fiveHour = win;
    else out.weekly = win;
  }
  if (r.credits && !r.credits.unlimited && r.credits.hasCredits) out.credits = Math.floor(Number(r.credits.balance));
  const resets = answers[2].result.rateLimitResetCredits?.credits?.filter((c) => c.status === 'available') ?? [];
  if (resets.length) out.freeResets = resets.length;
  if (r.rateLimitReachedType) out.limited = r.rateLimitReachedType;
  return out;
}

async function grok() {
  const bin = process.env.GROK_BIN ?? [path.join(HOME, '.grok/bin/grok'), ...DIRS.map((d) => path.join(d, 'grok'))].find(executable) ?? 'grok';
  const { answers, error } = await rpc(bin, ['agent', '--no-leader', 'stdio'],
    { id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } },
    [{ id: 2, method: '_x.ai/billing', params: {} }, { id: 3, method: '_x.ai/auth/info', params: {} }]);
  const r = answers[2]?.result;
  if (!r?.config) return { name: 'Grok', error: answers[2]?.error?.message ?? error ?? 'no usage in the answer' };
  const c = r.config;
  const period = c.currentPeriod ?? {};
  const win = { used: c.creditUsagePercent ?? null, resetsAt: period.end ?? c.billingPeriodEnd ?? null };
  const weekly = !period.type || /WEEK/.test(period.type);
  // Only the email is taken from the sign-in details.
  const out = { name: 'Grok', account: answers[3]?.result?.email ?? null, plan: r.subscription_tier ?? null, fiveHour: null, weekly: weekly ? win : null };
  if (!weekly) out.period = { ...win, type: period.type.replace('USAGE_PERIOD_TYPE_', '').toLowerCase() };
  if (c.onDemandCap?.val) out.onDemand = { used: c.onDemandUsed?.val ?? 0, cap: c.onDemandCap.val };
  if (c.prepaidBalance?.val) out.prepaid = c.prepaidBalance.val;
  return out;
}

const services = await Promise.all([codex(), grok()]);
console.log(JSON.stringify({ host: os.hostname().split('.')[0], at: new Date().toISOString(), services }));
