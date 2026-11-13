// sh.mjs: small helpers the-forge's commands share: running a program, finding one on PATH, and the paths of the
// lasting copy. Nothing here prints a secret: run() captures output, and callers decide what to show.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Runs a program without a shell. Returns { ok, status, stdout, stderr, missing }. missing is true when the program
// is not on PATH, so a check can say "not installed" instead of "failed".
export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  const missing = r.error?.code === 'ENOENT';
  return { ok: r.status === 0, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', missing, error: r.error };
}

// Runs a program with the terminal attached, for steps the person watches or answers.
export function runLive(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return { ok: r.status === 0, status: r.status, missing: r.error?.code === 'ENOENT' };
}

export function which(name, envPath = process.env.PATH ?? '') {
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, name);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      if (fs.statSync(p).isFile()) return p;
    } catch { /* not here */ }
  }
  return null;
}

export const home = () => os.homedir();
export const thisHost = () => os.hostname().split('.')[0];
// The dispatcher and the board match host names exactly, letter case included, so every check here does too.
export const sameHost = (a, b) => a != null && a === b;
// The same name in another letter case: worth a hint, since it still fails.
export const caseOnly = (a, b) => a != null && b != null && a !== b && a.toLowerCase() === b.toLowerCase();

export const expand = (p) => (typeof p === 'string' && (p === '~' || p.startsWith('~/')) ? path.join(home(), p.slice(1)) : p);
// A path under the home folder written as ~/..., so the config reads the same on every computer.
export const tilde = (p) => {
  const h = home();
  return p === h ? '~' : p.startsWith(`${h}${path.sep}`) ? `~/${p.slice(h.length + 1)}` : p;
};

export const DEFAULT_COPY = '~/the-forge';

// A copy that npx unpacked lives in npm's cache, which npm may clean at any time. launchd and systemd jobs must never
// point there.
export const isTemporary = (dir) => /[\\/]_npx[\\/]|[\\/]\.npm[\\/]|[\\/]npm-cache[\\/]/.test(dir);

// The account folder for a Claude account label on this computer: a is ~/.claude, any other is ~/.claude-<label>.
export const claudeDir = (label) => path.join(home(), label === 'a' ? '.claude' : `.claude-${label}`);
// Where Claude Code keeps an account's state, folder trust included: ~/.claude.json for a, <folder>/.claude.json else.
export const claudeState = (label) => (label === 'a' ? path.join(home(), '.claude.json') : path.join(claudeDir(label), '.claude.json'));

export const say = (s = '') => process.stdout.write(`${s}\n`);
export const warn = (s) => process.stderr.write(`${s}\n`);
