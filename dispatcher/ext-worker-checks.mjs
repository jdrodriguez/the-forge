// ext-worker-checks.mjs: the checks ext-worker-lib.mjs runs on what goes into a run and what comes out of it, outside
// the sandbox: the secret scan of the brief, the RESULT line, the CLI's limit words, files the engine wrote, and the
// copy-back of the CLI's refreshed tokens. None of them prints a secret's value.
import fs from 'node:fs';
import path from 'node:path';

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

// --- files the engine wrote ------------------------------------------------------------------------------------

// The supervisor reads a file from the run's temp folder (the question, the final reply) with its own rights, outside
// the sandbox. A symlink or a hard link there could name a file the sandbox kept from the engine, so only a plain file
// with a single link is read, and only its first 64 KB.
export function safeCopy(src, dst, max = 65_536) {
  let st;
  try {
    st = fs.lstatSync(src);
  } catch {
    return false;
  }
  if (!st.isFile() || st.nlink !== 1) return false;
  const fd = fs.openSync(src, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const buf = Buffer.alloc(Math.min(st.size, max));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.writeFileSync(dst, buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

// --- the CLI's auth file --------------------------------------------------------------------------------------

// A run works on a copy of the CLI's auth file. When the CLI refreshed it, the refresh may have rotated the refresh
// token, so the tokens go back, but only from a round that ended clean (the supervisor skips failed ones), only when the
// copy names the same account and is newer, and only the token fields: everything else stays as the real file has it.
// The copy is engine-writable, so this cannot tell the CLI's own refresh from tokens the engine wrote there; the
// account check is the run copy's own claim. dispatcher/README.md lists this.
function authIdentity(engine, j) {
  if (engine === 'codex') return j?.tokens?.account_id ? { id: j.tokens.account_id, at: Date.parse(j.last_refresh ?? '') || 0 } : null;
  const keys = Object.keys(j ?? {});
  if (keys.length !== 1) return null;
  const e = j[keys[0]];
  return e?.user_id ? { id: `${keys[0]}|${e.user_id}`, at: Date.parse(e.expires_at ?? '') || 0 } : null;
}

const TOKEN_KEY = /token|expires|refresh/i;
const pickTokens = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => TOKEN_KEY.test(k)));

export function authSync(engine, runCopy, real) {
  let a;
  let b;
  try {
    const st = fs.lstatSync(runCopy);
    if (!st.isFile() || st.nlink !== 1) return "auth-sync: refused, the run's copy is not a plain file";
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
  let next;
  if (engine === 'codex') next = { ...b, tokens: { ...b.tokens, ...pickTokens(a.tokens), account_id: b.tokens.account_id }, last_refresh: a.last_refresh };
  else {
    const key = Object.keys(b)[0];
    next = { ...b, [key]: { ...b[key], ...pickTokens(a[key]), user_id: b[key].user_id } };
  }
  const tmp = `${real}.ext-worker.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, real);
  return 'auth-sync: copied the refreshed tokens back';
}

