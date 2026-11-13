// doctor.mjs: checks this computer against what the config says it needs. It runs version and
// sign-in status commands, reads files, and tries ssh with BatchMode. The one write is the engine check's own
// 10-minute cache (dispatcher/ext-worker.sh available). It never prints a token, a key or an account's email.
import fs from 'node:fs';
import path from 'node:path';
import { configPath, linearKey, loadConfig, ROOT } from '../config.mjs';
import { unknownKeys, undocumentedKeys } from './coverage.mjs';
import { ENGINES } from './answers.mjs';
import { caseOnly, claudeDir, claudeState, home, isTemporary, run, sameHost, thisHost, tilde, which } from './sh.mjs';
import { linkTargets, remoteWord } from './copy.mjs';

const PLACEHOLDERS = { 'github.repo': 'your-org/your-app', 'github.user': 'your-github-login', 'linear.workspace': 'your-workspace' };
const SIGNIN = {
  gh: 'gh auth login',
  codex: 'codex login (on a computer with no browser: codex login --device-auth)',
  grok: 'grok login (on a computer with no browser: grok login --device-auth)',
};

// A program counts only when its version call succeeds: one on PATH that cannot run (exit 126, say) is not working.
function tool(checks, name, args, fix) {
  const r = run(name, args);
  const first = (r.stdout || r.stderr).trim().split('\n')[0].slice(0, 80);
  checks.push(r.missing ? { name, ok: false, detail: 'not installed', fix }
    : r.ok ? { name, ok: true, detail: first }
      : { name, ok: false, detail: `installed, but ${name} ${args.join(' ')} failed (exit ${r.status ?? r.error?.code})`, fix });
  return r.ok;
}

function claudeSignedIn(label) {
  const env = { ...process.env };
  if (label === 'a') delete env.CLAUDE_CONFIG_DIR;
  else env.CLAUDE_CONFIG_DIR = claudeDir(label);
  const r = run('claude', ['auth', 'status', '--json'], { env });
  try {
    return JSON.parse(r.stdout).loggedIn === true;
  } catch {
    return false;
  }
}

function engineReady(engine) {
  // The Grok CLI installs to ~/.grok/bin, which is often not on PATH.
  const local = path.join(home(), '.grok/bin/grok');
  if (!which(engine) && !(engine === 'grok' && fs.existsSync(local))) return { ok: false, detail: 'not installed' };
  const ew = path.join(ROOT, 'dispatcher/ext-worker.sh');
  if (fs.existsSync(ew)) {
    const r = run('bash', [ew, 'available', engine], { timeout: 90_000, env: { ...process.env, AGENT_QUEUE_CONFIG: configPath() } });
    return { ok: r.ok, detail: (r.stdout || r.stderr).trim().split('\n').pop() || (r.ok ? 'ready' : 'unavailable') };
  }
  const signed = engine === 'codex' ? run('codex', ['login', 'status']).ok : fs.existsSync(path.join(home(), '.grok/auth.json'));
  return { ok: signed, detail: signed ? 'signed in' : 'not signed in' };
}

// The programs every computer needs. Pushes a check for each into checks. Returns whether Claude Code is there, and
// gh's status text (kept in memory to match the GitHub login, never printed).
export function toolChecks(checks) {
  let ghStatus = null;
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'node', ok: major >= 22, detail: process.version, fix: 'install Node 22 or newer (https://nodejs.org)' });
  tool(checks, 'git', ['--version'], 'install git (macOS: xcode-select --install)');
  tool(checks, 'jq', ['--version'], 'install jq (macOS: brew install jq; Linux: apt install jq)');
  tool(checks, 'curl', ['--version'], 'install curl');
  tool(checks, 'perl', ['-v'], 'install perl');
  if (tool(checks, 'gh', ['--version'], 'install the GitHub CLI (https://cli.github.com)')) {
    const st = run('gh', ['auth', 'status']);
    ghStatus = st.ok ? st.stdout + st.stderr : null;
    checks.push({ name: 'gh sign-in', ok: st.ok, detail: st.ok ? 'signed in' : 'not signed in', fix: SIGNIN.gh });
  }
  const hasClaude = tool(checks, 'claude', ['--version'], 'install Claude Code: curl -fsSL https://claude.ai/install.sh | bash');

  return { hasClaude, ghStatus };
}

// Whether an account has trusted the folder workers start in; fleet.sh refuses to dispatch into an untrusted one.
function trusted(label, ws) {
  try {
    return JSON.parse(fs.readFileSync(claudeState(label), 'utf8')).projects?.[ws]?.hasTrustDialogAccepted === true;
  } catch {
    return false;
  }
}

// gh auth status lists each signed-in login as "account <login>". GitHub logins ignore letter case.
const ghHas = (status, user) => status.split('\n').some((l) => {
  const m = l.match(/\baccount (\S+)/);
  return m && m[1].toLowerCase() === user.toLowerCase();
});

function configChecks(checks, cfg, host, hasClaude, ghStatus) {
  const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  const unknown = unknownKeys(raw);
  const undocumented = undocumentedKeys(raw);
  checks.push({ name: 'config keys', ok: !unknown.length && !undocumented.length,
    detail: unknown.length || undocumented.length ? `not in the example or the docs: ${[...new Set([...unknown, ...undocumented])].join(', ')}` : 'every key is in the example',
    fix: 'fix or remove those keys (docs/configuration.md lists every key)' });
  const left = Object.entries(PLACEHOLDERS).filter(([k, v]) => k.split('.').reduce((o, p) => o?.[p], cfg) === v).map(([k]) => k);
  checks.push({ name: 'config values', ok: !left.length, detail: left.length ? `still the example's: ${left.join(', ')}` : 'filled in', fix: 'run the-forge init with your answers' });
  const user = cfg.github?.user;
  if (ghStatus && user) {
    const has = ghHas(ghStatus, user);
    checks.push({ name: 'gh account', ok: has, detail: has ? `${user} is signed in` : `${user} (github.user) is not among gh's accounts`, fix: `gh auth login, as ${user}` });
  }
  const D = cfg.dispatcher ?? {};
  const enabled = D.enabledHosts ?? [];
  if (!Array.isArray(enabled)) throw new Error('dispatcher.enabledHosts is not a list');
  const known = enabled.some((h) => sameHost(h, host));
  const near = enabled.find((h) => caseOnly(h, host));
  checks.push({ name: 'this computer', ok: known,
    detail: known ? `${host} is in dispatcher.enabledHosts` : near ? `the config says ${near}, but hostname -s prints ${host}; the letter case must match` : `${host} is not in dispatcher.enabledHosts`,
    fix: near ? `write the host as ${host} in the answers and run init again` : 'add this computer (hostname -s) to the answers and run init again' });
  const repo = cfg.repoPath;
  const isRepo = repo && fs.existsSync(path.join(repo, '.git'));
  checks.push({ name: 'repository', ok: Boolean(isRepo), detail: isRepo ? repo : `no git checkout at ${repo}`, fix: `gh repo clone ${cfg.github?.repo} ${repo}` });
  linearCheck(checks, cfg);

  // The accounts this computer's jobs use: its workers, and on the board's computer the red-main responder's.
  const mine = D.hosts?.[host] ?? {};
  const isBoard = sameHost(cfg.queueBoard?.host, host);
  const labels = [...new Set([...(mine.accounts ?? []), ...(isBoard ? cfg.mainWatch?.accounts ?? [] : [])])];
  for (const label of hasClaude ? labels : []) {
    const ok = claudeSignedIn(label);
    const folder = label === 'a' ? '~/.claude' : `~/.claude-${label}`;
    checks.push({ name: `Claude account ${label}`, ok, detail: ok ? `signed in (${folder})` : `not signed in (${folder})`,
      fix: label === 'a' ? 'claude, then /login' : `fleet/setup/add-account.sh here ${label} <the account's email>` });
    const ws = cfg.workspaceCwd;
    if (ok && ws) {
      const t = trusted(label, ws);
      const env = label === 'a' ? '' : `CLAUDE_CONFIG_DIR=${folder} `;
      checks.push({ name: `trust ${label}`, ok: t, detail: t ? `trusts ${tilde(ws)}` : `has not trusted ${tilde(ws)}, where workers start`,
        fix: `cd ${tilde(ws)} && ${env}claude, accept the trust prompt, then /exit` });
    }
  }
  // The engines this computer runs: fallback.engines, narrowed by its own hosts.<name>.engines when it has one.
  const fb = D.externalBuilders?.fallback;
  const allowed = fb?.engines ?? ENGINES;
  for (const e of fb?.enabled ? ENGINES.filter((x) => allowed.includes(x) && (mine.engines ?? allowed).includes(x)) : []) {
    const r = engineReady(e);
    checks.push({ name: e, ok: r.ok, detail: r.detail, fix: `install ${e} and sign in: ${SIGNIN[e]}` });
  }

  const others = enabled.filter((h) => !sameHost(h, host));
  if (others.length) {
    const ts = run('tailscale', ['status']);
    const tsApp = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
    const tsOk = ts.ok || (ts.missing && fs.existsSync(tsApp) && run(tsApp, ['status']).ok);
    checks.push({ name: 'Tailscale', ok: tsOk, detail: tsOk ? 'connected' : ts.missing && !fs.existsSync(tsApp) ? 'not installed' : 'not connected',
      fix: 'install Tailscale (https://tailscale.com/download) and sign in: macOS, open the app; Linux, sudo tailscale up' });
  }
  for (const h of isBoard ? others : []) {
    const dest = cfg.queueBoard?.ssh?.[h] ?? h;
    // -- ends ssh's options, so a destination can never be read as one.
    const r = run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '--', dest, 'true'], { timeout: 20_000 });
    checks.push({ name: `ssh ${h}`, ok: r.ok, detail: r.ok ? `reached ${dest}` : `could not reach ${dest} without a password`,
      fix: `ssh-copy-id ${dest} (after ssh-keygen -t ed25519 if you have no key)` });
    if (!r.ok) continue;
    const rr = tilde(cfg.queueBoard?.remoteRoot ?? ROOT);
    const word = remoteWord(rr);
    const c = run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '--', dest, `test -f ${word}/bin/the-forge.mjs && test -f ${word}/agent-queue.config.json`], { timeout: 20_000 });
    checks.push({ name: `copy on ${h}`, ok: c.ok, detail: c.ok ? `${rr} is there` : `no copy with a config at ${rr}`, fix: `the-forge copy-to ${h}` });
  }
}

function linearCheck(checks, cfg) {
  let keyOk = false;
  let keyDetail = 'not found';
  const keyFile = cfg.linear?.apiKeyFile || path.join(cfg.paths.stateDir, 'linear-api-key');
  let fix = `save a Linear personal API key (Linear: Settings > Security & access) in ${keyFile} with mode 600 (docs/setup.md, Linear), or set linear.apiKeyCommand`;
  try {
    keyOk = linearKey(cfg).length > 0;
    keyDetail = keyOk ? 'found' : 'empty';
    if (keyOk && !process.env.LINEAR_API_KEY && !cfg.linear?.apiKeyCommand?.length && (fs.statSync(keyFile).mode & 0o077)) {
      keyOk = false;
      keyDetail = `found, but ${keyFile} is readable by other users`;
      fix = `chmod 600 ${keyFile}`;
    }
  } catch { /* reported below */ }
  checks.push({ name: 'Linear key', ok: keyOk, detail: keyDetail, fix });
}

// Returns { ok, host, checks: [{ name, ok, detail, fix, warn }] }. A check with warn: true never fails the run.
export function doctor() {
  const checks = [];
  const host = thisHost();
  const { hasClaude, ghStatus } = toolChecks(checks);

  let cfg = null;
  try {
    cfg = loadConfig({ fresh: true });
    checks.push({ name: 'config', ok: true, detail: configPath() });
  } catch (e) {
    checks.push({ name: 'config', ok: false, detail: e.message.split(';')[0], fix: 'run the-forge init --answers <file> (the forge-setup skill writes the file)' });
  }
  if (cfg) {
    // A config written by hand can have any shape; doctor reports a broken one instead of stopping.
    try {
      configChecks(checks, cfg, host, hasClaude, ghStatus);
    } catch (e) {
      checks.push({ name: 'config shape', ok: false, detail: `could not check the config: ${e.message}`, fix: 'run the-forge init --answers <file> again' });
    }
  }

  checks.push({ name: 'lasting copy', ok: !isTemporary(ROOT), detail: ROOT, fix: 'run the-forge setup, which copies The Forge to ~/the-forge' });
  for (const [link, target] of linkTargets(ROOT)) {
    let ok = false;
    let cur = null;
    try { ok = fs.realpathSync(link) === fs.realpathSync(target); } catch { /* missing */ }
    try { cur = fs.readlinkSync(link); } catch { /* not a link */ }
    const real = !cur && fs.existsSync(link);
    checks.push({ name: `link ${path.basename(link)}`, ok,
      detail: ok ? 'linked' : cur ? `${link} points at ${cur}` : real ? `${link} is a real file or folder` : `${link} is missing`,
      fix: real ? `move ${link} aside, then the-forge setup --here --no-start`
        : `the-forge setup --here --no-start${cur ? ' --force-links' : ''}` });
  }
  return { ok: checks.every((c) => c.ok || c.warn), host, checks };
}

export function printDoctor(res) {
  for (const c of res.checks) {
    const mark = c.ok ? 'ok  ' : c.warn ? 'warn' : 'MISS';
    process.stdout.write(`${mark}  ${c.name}: ${c.detail}${c.ok ? '' : `\n      fix: ${c.fix}`}\n`);
  }
  process.stdout.write(res.ok ? `\nThis computer (${res.host}) is ready.\n` : `\nSome things are missing on ${res.host}. Fix each MISS line, then run the-forge doctor again.\n`);
}
