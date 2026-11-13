// setup-sandbox.mjs: a throwaway home and a PATH that holds only fakes and a few real basics, for the-forge's tests.
// launchctl, systemctl, loginctl, plutil, uname, claude, codex, grok, gh, tailscale, ssh and open are fakes that log
// each call, so no test can reach a real job, sign-in or other computer. Not a test file itself.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CLI = path.join(ROOT, 'bin/the-forge.mjs');
export const HOST = os.hostname().split('.')[0];

// Real programs the install scripts and the CLI use. Anything else is missing in the sandbox.
const REAL = ['bash', 'sh', 'sed', 'mkdir', 'dirname', 'basename', 'cat', 'rm', 'id', 'seq', 'sleep', 'tr', 'hostname',
  'chmod', 'cp', 'mv', 'ln', 'readlink', 'grep', 'head', 'tail', 'date', 'mktemp', 'env', 'tar', 'ls', 'touch', 'printf', 'test'];

const FAKES = {
  launchctl: `echo "launchctl $*" >> "$FAKE_LOG"
m="$FAKE_STATE/launchctl-$(echo "$*" | sed 's#.*/##; s#.*LaunchAgents/##; s#\\.plist$##')"
case "$1" in
  print) [ -f "$m" ] ;;
  bootstrap) touch "$FAKE_STATE/launchctl-$(basename "$3" .plist)" ;;
  bootout) rm -f "$m"; exit 0 ;;
  *) exit 0 ;;
esac`,
  plutil: 'exit 0',
  uname: 'echo "${FAKE_UNAME:-Darwin}"',
  systemctl: 'echo "systemctl $*" >> "$FAKE_LOG"; case "$*" in *is-active*) echo active ;; esac; exit 0',
  loginctl: 'echo yes',
  claude: `case "$*" in
  --version) echo "9.9.9 (Claude Code)" ;;
  "auth status --json") echo "{\\"loggedIn\\": \${FAKE_CLAUDE_SIGNED_IN:-true}}" ;;
  *) echo "claude $* cwd=$PWD" >> "$FAKE_LOG" ;;
esac`,
  codex: 'case "$*" in --version) echo "codex-cli 0.200.0" ;; "login status") exit 0 ;; esac',
  grok: 'echo "grok 1.0"',
  gh: 'case "$*" in --version) echo "gh version 2.0.0" ;; "auth status") echo "github.com"; echo "  Logged in to github.com account tester (keyring)" ;; esac',
  tailscale: 'exit 0',
  jq: 'echo "jq-1.7"',
  curl: 'echo "curl 8.0"',
  perl: 'echo "perl 5"',
  git: 'echo "git version 2.0.0"',
  open: 'echo "open $*" >> "$FAKE_LOG"',
  'xdg-open': 'echo "xdg-open $*" >> "$FAKE_LOG"',
};

// ssh runs its command here, in the other computer's home (FAKE_REMOTE_HOME), with stdin passed through.
const FAKE_SSH = `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const a = process.argv.slice(2);
while (a[0] && a[0].startsWith('-')) { const o = a.shift(); if (o === '-o' || o === '-p') a.shift(); }
const dest = a.shift();
const cmd = a.join(' ');
fs.appendFileSync(process.env.FAKE_LOG, 'ssh ' + dest + ' ' + cmd + '\\n');
if (process.env.FAKE_SSH_FAIL) process.exit(255);
const r = spawnSync('/bin/sh', ['-c', cmd], { stdio: 'inherit', env: { ...process.env, HOME: process.env.FAKE_REMOTE_HOME } });
process.exit(r.status ?? 1);
`;

const findReal = (name) => {
  for (const d of ['/bin', '/usr/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin', '/usr/local/bin']) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// Makes a sandbox. omit leaves fakes out (to test "not installed"); bare leaves out every fake.
export function sandbox({ omit = [], bare = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-')));
  const s = { dir, home: path.join(dir, 'home'), remote: path.join(dir, 'remote-home'), bin: path.join(dir, 'bin'),
    state: path.join(dir, 'state'), log: path.join(dir, 'calls.log') };
  for (const d of [s.home, s.remote, s.bin, s.state]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(s.log, '');
  fs.symlinkSync(process.execPath, path.join(s.bin, 'node'));
  for (const name of REAL) {
    const p = findReal(name);
    if (p) fs.symlinkSync(p, path.join(s.bin, name));
  }
  if (!bare) {
    for (const [name, body] of Object.entries(FAKES)) {
      if (omit.includes(name)) continue;
      fs.writeFileSync(path.join(s.bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    }
    if (!omit.includes('ssh')) fs.writeFileSync(path.join(s.bin, 'ssh'), FAKE_SSH, { mode: 0o755 });
  } else {
    for (const name of ['git', 'jq', 'curl', 'perl']) fs.rmSync(path.join(s.bin, name), { force: true });
  }
  s.env = (extra = {}) => ({ HOME: s.home, PATH: s.bin, FAKE_LOG: s.log, FAKE_STATE: s.state, FAKE_REMOTE_HOME: s.remote,
    TMPDIR: os.tmpdir(), LANG: 'C', USER: 'tester',
    // A spare port, so no test ever reads a board that really runs on this computer.
    QUEUE_BOARD_PORT: '8797', ...extra });
  s.run = (args, extra = {}, cli = CLI) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: s.env(extra), timeout: 60_000 });
  s.calls = () => fs.readFileSync(s.log, 'utf8').split('\n').filter(Boolean);
  return s;
}

// Answers for n computers (1 to 4) and the given number of Claude accounts. The first computer is this one, so
// install and doctor find themselves in the config. Every value is invented.
export function answers(n, accounts = 3, extra = {}) {
  const hosts = [HOST, 'box-two', 'box-three', 'box-four'].slice(0, n);
  const computers = hosts.map((host, i) => ({ host, system: i === 1 ? 'linux' : 'macos', board: i === 0,
    ...(i ? { ssh: `tester@${host}` } : {}), codex: i === 0 || i === 2, grok: i === 1 }));
  const labels = ['a', 'b', 'c', 'd'].slice(0, accounts);
  const claudeAccounts = accounts === 1
    ? [{ label: 'a', main: true }]
    : labels.map((label, i) => ({ label, main: i === 0, worker: i > 0, computers: i === 0 ? [HOST] : hosts }));
  return { person: { name: 'Alex' }, computers, claudeAccounts,
    repository: { github: 'example-org/example-app', githubUser: 'tester', path: '~/dev/example-app', check: ['npm', 'run', 'type-check'] },
    linear: { workspace: 'example', team: 'ABC' }, ...extra };
}

export function writeAnswers(s, a, name = 'answers.json') {
  const f = path.join(s.dir, name);
  fs.writeFileSync(f, JSON.stringify(a, null, 2));
  return f;
}

// A copy of this repo where npx would unpack it: inside npm's cache, which isTemporary() recognizes.
export async function npxCopy(s) {
  const { copyPackage } = await import('../setup/copy.mjs');
  const dir = path.join(s.dir, '.npm/_npx/0123abcd/node_modules/the-forge');
  copyPackage(ROOT, dir);
  return dir;
}

// A lasting copy at ~/the-forge in the sandbox, made by setup from an npx copy, with a config from answers a.
export async function lastingCopy(s, a) {
  const npx = await npxCopy(s);
  const r = s.run(['setup', '--no-start'], {}, path.join(npx, 'bin/the-forge.mjs'));
  if (r.status !== 0) throw new Error(r.stderr);
  const root = path.join(s.home, 'the-forge');
  const cli = path.join(root, 'bin/the-forge.mjs');
  const i = s.run(['init', '--answers', writeAnswers(s, a)], {}, cli);
  if (i.status !== 0) throw new Error(i.stderr);
  return { root, cli };
}
