#!/usr/bin/env node
// collect.mjs: prints this machine's agent-queue state as one JSON object, for board.mjs to read over SSH.
// Read-only and local: the dispatcher's state file and log, the fleet's session list, each account's saved plan
// usage, and the machine's load. It makes no network calls and never refreshes usage, so it can't crowd the
// dispatcher's own usage checks. It reads this machine's own config, so it finds this machine's paths.stateDir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadConfig, ROOT, HOME } from '../lib/config.mjs';

const cfg = loadConfig();
const dc = cfg.dispatcher ?? {};
const LOCAL = cfg.paths.stateDir;
const FLEET = path.join(ROOT, 'fleet/fleet.sh');
const HOST = os.hostname().split('.')[0];
const LIVE = ['building', 'merge-asked', 'claiming'];
// The fleet account whose config dir is ~/.claude; every other account lives in ~/.claude-<label>.
const PRIMARY = cfg.fleet?.primaryAccount ?? 'a';
const TEAM = cfg.linear?.team;
process.env.PATH = [path.join(HOME, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':');

const hostCfg = dc.hosts?.[HOST] ?? {};
const errors = [];
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

let state = null;
try {
  const raw = readText(path.join(LOCAL, 'state.json'));
  state = raw ? JSON.parse(raw) : null;
} catch (e) {
  errors.push(`state.json: ${e.message}`);
}

const log = (readText(path.join(LOCAL, 'dispatcher.log')) ?? '').trimEnd().split('\n').slice(-120);

// The workers the queue's tickets point at, every other live background worker (adhoc), and a count of the account's
// other running sessions.
let workers = [];
let adhoc = [];
let others = {};
try {
  const all = JSON.parse(execFileSync(FLEET, ['ps', '--json', '--all'], { encoding: 'utf8', timeout: 45_000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const wanted = new Set(Object.values(state?.tickets ?? {}).filter((t) => LIVE.includes(t.status) && t.workerId).map((t) => `${t.account}/${t.workerId}`));
  workers = all.filter((w) => wanted.has(`${w.label}/${w.id}`)).map((w) => ({ label: w.label, id: w.id, name: w.name, state: w.status || w.state || 'unknown' }));
  for (const w of all) {
    if (wanted.has(`${w.label}/${w.id}`) || !['busy', 'working', 'blocked'].includes(w.status || w.state)) continue;
    others[w.label] = (others[w.label] ?? 0) + 1;
  }
  adhoc = adhocWorkers(all);
} catch (e) {
  errors.push(`fleet ps: ${String(e.stderr || e.message).trim().slice(0, 200)}`);
}

// A background worker some session started with fleet.sh dispatch outside the queue, such as a rush ticket. Any
// worker a queue ticket ever pointed at is the queue's. A row with no process is left over from a restart and is
// skipped, and a finished worker drops off a day after its last activity.
function adhocWorkers(all) {
  const queued = new Set(Object.values(state?.tickets ?? {}).filter((t) => t.workerId).map((t) => `${t.account}/${t.workerId}`));
  const rows = all.filter((w) => w.kind === 'background' && w.pid && /^[0-9a-f]{8}$/.test(w.id ?? '') && !queued.has(`${w.label}/${w.id}`));
  const ticketRe = new RegExp(`\\b${TEAM}-(\\d+)\\b`, 'i');
  const ticketOf = (s) => (s?.match(ticketRe) ? `${TEAM}-${s.match(ticketRe)[1]}` : null);
  return rows.flatMap((w) => {
    const dir = acctDir(w.label);
    let reg = {};
    try { reg = JSON.parse(fs.readFileSync(path.join(dir, 'sessions', `${w.pid}.json`), 'utf8')); } catch {}
    const lastActivity = transcriptTime(dir, w.sessionId) ?? reg.updatedAt ?? null;
    const st = w.status || w.state || 'unknown';
    if (['idle', 'done'].includes(st) && lastActivity && Date.now() - lastActivity > 24 * 3.6e6) return [];
    const ticket = ticketOf(w.name);
    const branch = branchIn(w.cwd) ?? (ticket ? worktreeBranch(ticket) : null);
    return [{
      label: w.label,
      id: w.id,
      name: w.name ?? null,
      state: st,
      cwd: w.cwd ?? null,
      branch,
      ticket: ticketOf(branch) ?? ticket,
      startedAt: reg.startedAt ? new Date(reg.startedAt).toISOString() : null,
      lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
      stateSince: reg.statusUpdatedAt ? new Date(reg.statusUpdatedAt).toISOString() : null,
      // The dispatcher's own test for a worker that takes one of this machine's slots (outsideWorkers).
      takesSlot: !['idle', 'done'].includes(w.state || w.status),
    }];
  });
}

function acctDir(label) {
  return path.join(HOME, label === PRIMARY ? '.claude' : `.claude-${label}`);
}
// When the session's transcript last changed, as epoch ms.
function transcriptTime(dir, sessionId) {
  if (!sessionId) return null;
  const root = path.join(dir, 'projects');
  let best = null;
  for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    try { best = Math.max(best ?? 0, fs.statSync(path.join(root, d, `${sessionId}.jsonl`)).mtimeMs); } catch {}
  }
  return best;
}
function git(cwd, args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
// The branch checked out where the worker runs, unless that is the main checkout.
function branchIn(cwd) {
  const b = cwd ? git(cwd, ['branch', '--show-current']) : null;
  return b && !['main', 'master'].includes(b) ? b : null;
}
// A worker started in the workspace folder makes its own worktree, so look for the newest one on its ticket's branch.
function worktreeBranch(ticket) {
  if (!cfg.repoPath) return null;
  const out = git(cfg.repoPath, ['worktree', 'list', '--porcelain']);
  if (!out) return null;
  const re = new RegExp(`\\b${ticket}\\b`, 'i');
  const hits = out.split('\n\n').flatMap((block) => {
    const dir = block.match(/^worktree (.+)$/m)?.[1];
    const b = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    if (!dir || !b || !re.test(b)) return [];
    try { return [{ b, at: fs.statSync(dir).mtimeMs }]; } catch { return []; }
  });
  return hits.sort((x, y) => y.at - x.at)[0]?.b ?? null;
}

// Each account's email, plan and the usage it saved the last time something ran 'claude -p /usage'. Only those fields
// and the account and organization ids are read from .claude.json; the file also holds sign-in details. The ids leave
// only as key, a short hash of the pair, which tells the board when two labels (or two machines) hold the same account,
// such as two labels signed in to one Team seat, drawing on one set of limits.
const PLANS = { claude_max: 'Max', claude_team: 'Team', claude_pro: 'Pro', claude_enterprise: 'Enterprise' };
function labels() {
  const found = fs.readdirSync(HOME).filter((d) => /^\.claude-[a-z]$/.test(d)).map((d) => d.slice(-1));
  if (fs.existsSync(path.join(HOME, '.claude.json'))) found.unshift(PRIMARY);
  return hostCfg.accounts ? found.filter((l) => hostCfg.accounts.includes(l)) : found;
}
function readAccount(label, file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const me = j.oauthAccount?.accountUuid ?? null;
    const s = j.cachedUsageUtilization;
    const mine = s && !(s.accountUuid && me && s.accountUuid !== me);
    const win = (w) => (w ? { used: w.utilization ?? null, resetsAt: w.resets_at ?? null } : null);
    return {
      label,
      key: me ? createHash('sha256').update(`${me}:${j.oauthAccount.organizationUuid ?? ''}`).digest('hex').slice(0, 12) : null,
      email: j.oauthAccount?.emailAddress ?? null,
      plan: PLANS[j.oauthAccount?.organizationType] ?? j.oauthAccount?.organizationType ?? null,
      signedIn: Boolean(j.oauthAccount),
      usageAt: mine ? new Date(s.fetchedAtMs).toISOString() : null,
      fiveHour: mine ? win(s.utilization?.five_hour) : null,
      weekly: mine ? win(s.utilization?.seven_day) : null,
      otherSessions: others[label] ?? 0,
    };
  } catch (e) {
    return { label, error: e.code === 'ENOENT' ? 'not signed in here' : e.message };
  }
}
const accounts = labels().map((label) => readAccount(label, label === PRIMARY ? path.join(HOME, '.claude.json') : path.join(HOME, `.claude-${label}`, '.claude.json')));
// Claude accounts the board shows but the queue never uses, such as the human's own main account: each is a folder
// ~/.claude-board-<name>, which the fleet skips because of the hyphen. watch-usage.mjs keeps their saved usage fresh.
const watched = fs.readdirSync(HOME).filter((d) => /^\.claude-board-[a-z0-9]+$/.test(d) && fs.existsSync(path.join(HOME, d, '.claude.json')))
  .map((d) => ({ ...readAccount(d.slice('.claude-board-'.length), path.join(HOME, d, '.claude.json')), watchOnly: true }));

function memFree() {
  try {
    // By full path: the board's ssh PATH has no /usr/sbin, so a bare 'sysctl' failed and a remote Mac read as null.
    if (process.platform === 'darwin') return Number(execFileSync('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_level'], { encoding: 'utf8' }).trim());
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const kb = (key) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))[1]);
    return Math.round((kb('MemAvailable') / kb('MemTotal')) * 100);
  } catch {
    return null;
  }
}

// Swap in use, in MB. A Mac grows its swap files as it needs them, so its swap total says little; the board weighs swap
// used against RAM instead.
function swapUsedMb() {
  try {
    if (process.platform === 'darwin') {
      const used = execFileSync('/usr/sbin/sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' }).match(/used = ([\d.]+)M/);
      return used ? Math.round(Number(used[1])) : null;
    }
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const kb = (key) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))[1]);
    return Math.round((kb('SwapTotal') - kb('SwapFree')) / 1024);
  } catch {
    return null;
  }
}

// The process holding the most memory. On a Mac, top's MEM counts compressed pages too, which ps leaves out; on
// 2026-11-05 one Mac's fseventsd held 22 GB, 20 GB of it compressed, while ps showed 3.5 GB.
function topMemory() {
  try {
    if (process.platform === 'darwin') {
      const line = execFileSync('/usr/bin/top', ['-l', '1', '-o', 'mem', '-n', '1', '-stats', 'pid,mem,command'], { encoding: 'utf8', timeout: 10_000 }).trimEnd().split('\n').at(-1);
      const [, pid, size, unit, command] = line.match(/^(\d+)\s+([\d.]+)([KMG])[+-]?\s+(.+)$/) ?? [];
      return pid ? { pid: Number(pid), command: command.trim(), mb: Math.round(Number(size) * { K: 1 / 1024, M: 1, G: 1024 }[unit]) } : null;
    }
    const [pid, rss, command] = execFileSync('ps', ['-eo', 'pid=,rss=,comm=', '--sort=-rss'], { encoding: 'utf8' }).trim().split('\n')[0].trim().split(/\s+/);
    return { pid: Number(pid), command, mb: Math.round(Number(rss) / 1024) };
  } catch {
    return null;
  }
}

// The queue's Codex and Grok workers on this machine (engine-workers.mjs), loaded on its own so a machine whose copy of
// that file is missing still reports everything else. A dispatcher that runs no engine workers leaves the folder
// absent, which reads as none.
let engines = [];
try {
  engines = (await import('./engine-workers.mjs')).readEngineWorkers(path.join(LOCAL, 'engine-workers'));
} catch (e) {
  errors.push(`engine workers: ${e.message}`);
}

const paused = readText(path.join(LOCAL, 'PAUSED'));
console.log(JSON.stringify({
  host: HOST,
  now: new Date().toISOString(),
  enabled: (dc.enabledHosts ?? []).includes(HOST),
  paused: paused ? paused.trim() : null,
  maxWorkers: hostCfg.maxWorkers ?? dc.workerCap,
  sentryWorkers: hostCfg.sentryWorkers ?? 0,
  // The engines the dispatcher may give a ticket here as accounts in this machine's pool, beside the Claude ones, while
  // they are on. A dispatcher with no engine workers (no dispatcher.externalBuilders) gives none.
  engineAccounts: dc.externalBuilders?.fallback?.enabled ? dc.externalBuilders.fallback.engines ?? ['codex', 'grok'] : [],
  maxDispatchesPerDay: dc.maxDispatchesPerDay,
  load: { cores: os.cpus().length, avg5: os.loadavg()[1], maxPerCore: hostCfg.maxLoadPerCore ?? dc.maxLoadPerCore },
  memFreePercent: memFree(),
  minMemFreePercent: hostCfg.minMemoryFreePercent ?? dc.minMemoryFreePercent,
  ramMb: Math.round(os.totalmem() / 1048576),
  swapUsedMb: swapUsedMb(),
  topMemory: topMemory(),
  state,
  workers,
  adhoc,
  engines,
  accounts,
  watched,
  log,
  errors,
}));
