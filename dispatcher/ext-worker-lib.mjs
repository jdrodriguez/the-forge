#!/usr/bin/env node
// ext-worker-lib.mjs: the checks and file writes ext-worker.sh runs outside the sandbox, around a Codex or Grok queue
// worker. None of them prints a secret's value: a check that finds one names what it found, never the value.
//
//   config                                   prints shell assignments ext-worker.sh evals: paths and policy from the config
//   registry <file>                          merges the JSON object on stdin into <file>, written atomically
//   prompt <brief> <worktree>                exits 1, listing what it found, when the brief holds something secret-shaped
//   stream <codex|grok> <stream> <wt> <out> [dir...]  audits the engine's event stream (ext-worker-audit.mjs) and writes
//                                            its final text to <out>; dirs are extra folders it may write
//   branch <worktree> <base>                 lists the branch's changes to paths that run code outside the sandbox
//   result <summary>                         reads the closing RESULT line
//   limit <log> <stream>                     exits 0 when the CLI's own output says it hit a plan or rate limit
//   auth-sync <engine> <run copy> <real>     copies a refreshed auth file back, only for the same account
//   push-shim <file>                         writes the engine's gated-push command (push.gates, then git push)
//   port                                     prints a free loopback port
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ROOT } from '../lib/config.mjs';
import { auditStream, branchHazards } from './ext-worker-audit.mjs';

// --- registry -------------------------------------------------------------------------------------------------

// A reader never sees half a file: the merge goes to a sibling temp file, then rename() swaps it in.
export function mergeRegistry(file, patch) {
  let cur = {};
  try {
    cur = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // first write, or a file a crash cut short
  }
  const next = { ...cur, ...patch };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return next;
}

// --- what the engine is sent ----------------------------------------------------------------------------------

const SECRET_SHAPES = [
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['an Anthropic or OpenAI key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['a Linear key', /\blin_(?:api|oauth)_[A-Za-z0-9]{20,}/],
  ['a Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
  ['a Doppler token', /\bdp\.(?:st|pt|sa|ct)\.[A-Za-z0-9._-]{20,}/],
  ['an AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['a Google key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['a database URL with a password', /\b(?:postgres(?:ql)?|redis|mysql):\/\/[^:\s/]+:[^@\s]+@(?!localhost|127\.0\.0\.1|\[::1\])/],
];
const SECRET_KEY = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|DSN|CREDENTIAL|DATABASE_URL|PRIVATE/i;

// The values behind secret-named keys in a .env file: the brief must not quote any of them.
export function envSecrets(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || !SECRET_KEY.test(m[1])) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= 12 && !/^(?:https?|postgres(?:ql)?|redis):\/\/(?:[^@/]*@)?(?:localhost|127\.0\.0\.1)/.test(value)) out.push({ key: m[1], value });
  }
  return out;
}

export function scanPrompt(text, secrets = []) {
  const found = SECRET_SHAPES.filter(([, rx]) => rx.test(text)).map(([what]) => what);
  for (const { key, value } of secrets) if (text.includes(value)) found.push(`the value of ${key} from a .env file`);
  return [...new Set(found)];
}

// The .env files in the worktree and the main checkout, at the root, under packages/ and apps/, plus premerge.copyFiles.
export function envFiles(roots, copyFiles = []) {
  const files = [];
  for (const root of roots.filter(Boolean)) {
    for (const f of ['.env', '.env.local', '.dev.vars', ...copyFiles]) files.push(path.join(root, f));
    for (const group of ['packages', 'apps']) {
      try {
        for (const pkg of fs.readdirSync(path.join(root, group))) files.push(path.join(root, group, pkg, '.env'));
      } catch {
        // no such folder
      }
    }
  }
  return [...new Set(files)].filter((f) => fs.existsSync(f));
}

// --- what the engine said -------------------------------------------------------------------------------------

// The last non-empty line decides. A run that ends without one was cut off, or forgot; either way nobody said it's done.
export function readResult(summary) {
  const last = summary.trimEnd().split('\n').filter((l) => l.trim()).at(-1) ?? '';
  const clean = last.replace(/^[\s*_`#>-]+/, '').replace(/[\s*_`]+$/, '');
  if (/^RESULT:\s*DONE\b/i.test(clean)) return { done: true, reason: null };
  const blocked = clean.match(/^RESULT:\s*BLOCKED\b[:\s-]*(.*)$/i);
  return { done: false, reason: blocked ? blocked[1] || 'no reason given' : 'it ended without a RESULT line' };
}

// The CLI's own words for a spent plan. Only the CLI's stderr and its error events count: a model that writes "rate
// limit" in its own text is not out of usage.
export const LIMIT = /usage limit|rate[ -]?limit|quota|429|too many requests|plan limit|exceeded your|credits? (?:exhausted|depleted)|out of credits|limit reached|reached your .*limit/i;

// --- the CLI's auth file --------------------------------------------------------------------------------------

// A run works on a copy of the CLI's auth file. When the CLI refreshed it, the refresh may have rotated the refresh
// token, so the copy goes back, but only when it is the same account and newer. Anything inside the sandbox could have
// rewritten the copy, and another account's tokens in the owner's own CLI would send their next session to that account.
function authIdentity(engine, j) {
  if (engine === 'codex') return j?.tokens?.account_id ? { id: j.tokens.account_id, at: Date.parse(j.last_refresh ?? '') || 0 } : null;
  const keys = Object.keys(j ?? {});
  if (keys.length !== 1) return null;
  const e = j[keys[0]];
  return e?.user_id ? { id: `${keys[0]}|${e.user_id}`, at: Date.parse(e.expires_at ?? '') || 0 } : null;
}

export function authSync(engine, runCopy, real) {
  let a;
  let b;
  try {
    a = JSON.parse(fs.readFileSync(runCopy, 'utf8'));
    b = JSON.parse(fs.readFileSync(real, 'utf8'));
  } catch {
    return 'auth-sync: skipped, a file is missing or not JSON';
  }
  const ia = authIdentity(engine, a);
  const ib = authIdentity(engine, b);
  if (!ia || !ib) return 'auth-sync: skipped, no account in one of the files';
  if (ia.id !== ib.id) return "auth-sync: refused, the run's copy names another account";
  if (ia.at <= ib.at) return 'auth-sync: nothing newer to copy back';
  const tmp = `${real}.ext-worker.${process.pid}`;
  fs.writeFileSync(tmp, fs.readFileSync(runCopy), { mode: 0o600 });
  fs.renameSync(tmp, real);
  return 'auth-sync: copied the refreshed auth file back';
}

// --- config for the shell -------------------------------------------------------------------------------------

export const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const shArr = (name, xs) => `${name}=(${xs.map(shq).join(' ')})`;
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
// Names that carry credentials never go into the engine's environment from config.
const SECRET_ENV = /TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|_KEY$|^AWS_|^DOPPLER_|^GH_|^GITHUB_|^SSH_/i;

// Everything ext-worker.sh needs from the config, as shell assignments. Paths are real paths, since the macOS sandbox
// matches real paths (a symlinked folder in the profile would match nothing).
export function shellConfig(conf) {
  const fb = conf.dispatcher?.externalBuilders?.fallback ?? {};
  const env = Object.entries(fb.env ?? {}).filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !SECRET_ENV.test(k)).map(([k, v]) => `${k}=${v}`);
  const ports = (fb.loopbackPorts ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
  const hosts = (fb.extraHosts ?? []).map(String).filter((h) => /^(?:\*\.)?[a-z0-9.-]+$/i.test(h));
  const install = Array.isArray(conf.premerge?.installCommand) ? conf.premerge.installCommand.map(String) : [];
  return [
    `EW_MAIN=${shq(real(conf.repoPath ?? ''))}`,
    `EW_WORKTREES_DIR=${shq(conf.worktreesDir ?? '.claude/worktrees')}`,
    `EW_STATE=${shq(real(conf.paths.stateDir))}`,
    `EW_SHARED=${shq(real(conf.paths.sharedDir))}`,
    `EW_QUEUE_ROOT=${shq(real(ROOT))}`,
    `EW_WORKSPACE=${shq(conf.workspaceCwd ? real(conf.workspaceCwd) : '')}`,
    `EW_BASE=${shq(conf.github?.baseBranch ?? 'main')}`,
    `EW_TIMEOUT=${shq(Number(fb.timeoutSeconds) > 0 ? Math.round(Number(fb.timeoutSeconds)) : 10800)}`,
    `EW_GH_TOKEN_FILE=${shq(fb.ghTokenFile ?? path.join(conf.paths.stateDir, 'engine-gh-token'))}`,
    `EW_LOOPBACK=${shq(ports.join(' '))}`,
    `EW_EXTRA_HOSTS=${shq(hosts.join(' '))}`,
    shArr('EW_INSTALL', install),
    shArr('EW_ENV', env),
  ].join('\n');
}

// The engine's push command, written into its guard folder (read-only inside the sandbox) on every start: it runs
// push.gates from the worktree root, then git push with push.env, the way gated-push.mjs does for a Claude worker.
// The repo's own gated-push.mjs can't run inside, since the agent-queue checkout and its config are unreadable there.
export function pushShim(conf) {
  const gates = (conf.push?.gates ?? []).filter((g) => Array.isArray(g) && g.length).map((g) => g.map(String));
  return `#!/usr/bin/env node
// gated-push: written by ext-worker.sh from push.gates and push.env. Runs each gate, then git push with your arguments.
const { execFileSync, spawnSync } = require('node:child_process');
const gates = ${JSON.stringify(gates)};
const env = ${JSON.stringify(conf.push?.env ?? {})};
let root;
try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { console.error('gated-push: not inside a git work tree'); process.exit(1); }
for (const g of gates) {
  console.log('gated-push: ' + g.join(' '));
  const r = spawnSync(g[0], g.slice(1), { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.log('gated-push: ' + g.join(' ') + ' failed; fix it and push again'); process.exit(1); }
}
console.log('gated-push: pushing; tests gate in CI');
const p = spawnSync('git', ['push', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
process.exit(p.status ?? 1);
`;
}

// --- subcommands ----------------------------------------------------------------------------------------------

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// The audit's view of where things are, from the config.
export function auditContext(conf, worktree, extra = []) {
  return { worktree: real(worktree), main: real(conf.repoPath ?? ''), workspace: conf.workspaceCwd ? real(conf.workspaceCwd) : null,
    home: real(os.homedir()), base: conf.github?.baseBranch ?? 'main', extra: extra.map(real),
    private: [real(conf.paths.stateDir), real(conf.paths.sharedDir), real(ROOT)] };
}

async function main([cmd, ...args]) {
  const read = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  if (cmd === 'registry') {
    mergeRegistry(args[0], JSON.parse(fs.readFileSync(0, 'utf8') || '{}'));
    return 0;
  }
  if (cmd === 'result') {
    const r = readResult(read(args[0]));
    if (!r.done) console.log(r.reason);
    return r.done ? 0 : 1;
  }
  if (cmd === 'limit') {
    const errs = read(args[0]).split('\n').filter((l) => !/rmcp/.test(l));
    for (const l of read(args[1]).split('\n')) if (/"type":"(?:error|turn\.failed)"/.test(l)) errs.push(l);
    return errs.some((l) => LIMIT.test(l)) ? 0 : 1;
  }
  if (cmd === 'auth-sync') {
    console.log(authSync(args[0], args[1], args[2]));
    return 0;
  }
  if (cmd === 'port') {
    console.log(await freePort());
    return 0;
  }
  if (cmd === 'branch') {
    const hits = branchHazards(args[0], args[1]);
    if (hits.length) console.log(hits.join('\n'));
    return hits.length ? 1 : 0;
  }
  const conf = loadConfig();
  if (cmd === 'config') {
    console.log(shellConfig(conf));
    return 0;
  }
  if (cmd === 'push-shim') {
    fs.writeFileSync(args[0], pushShim(conf), { mode: 0o755 });
    return 0;
  }
  if (cmd === 'prompt') {
    const secrets = envFiles([args[1], conf.repoPath], conf.premerge?.copyFiles ?? []).flatMap((f) => envSecrets(read(f)));
    const found = scanPrompt(read(args[0]), secrets);
    if (found.length) console.log(found.join('\n'));
    return found.length ? 1 : 0;
  }
  if (cmd === 'stream') {
    const [engine, stream, worktree, out, ...extra] = args;
    const r = auditStream(engine, read(stream), auditContext(conf, worktree, extra));
    fs.writeFileSync(out, r.summary ? `${r.summary}\n` : '');
    for (const v of r.violations) console.log(`violation: ${v}`);
    for (const n of r.notes) console.log(`note: ${n}`);
    for (const e of r.errors) console.log(`error: ${e}`);
    console.log(`commands: ${r.commands}`);
    console.log(`completed: ${r.completed ? 'yes' : 'no'}`);
    if (r.stop) console.log(`stop: ${r.stop}`);
    return 0;
  }
  console.error(`unknown command: ${cmd}`);
  return 2;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 2; });
}
