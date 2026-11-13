// A throwaway world for the real ext-worker.sh: a HOME (its real path, since the macOS sandbox matches real paths), a
// bare origin, the main checkout cloned from it, a config, fake auth files, and fake codex and grok binaries. Nothing
// real is read: no real CLI runs, and the GitHub token is a fixed string GitHub would reject.
//
// The fakes are node scripts. Inside the sandbox they see only the scrubbed environment, so the test steers them
// through the brief: a line "FAKE: question" makes the engine ask, "FAKE: escape" makes it try to read ~/.ssh and push
// to main, and anything else makes it write a file, commit it, and end with RESULT: DONE.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const EXT_WORKER = path.join(REPO_ROOT, 'dispatcher/ext-worker.sh');
export const EXAMPLE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'agent-queue.config.example.json'), 'utf8'));

// What both fakes do with the brief. `emit` writes one event in the CLI's own stream format.
const BODY = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sh = (cmd, args) => { emit.command(cmd + ' ' + args.join(' ')); return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); };
const done = (text) => { emit.text(text); finish(text); };
if (/^This is a (?:containment )?test of your (?:sandbox|tools)/m.test(prompt)) {
  // The selftest's probe briefs: try each numbered command with the shell, the way a model told to would.
  for (const m of prompt.matchAll(/^\d+\. (.+)$/gm)) { try { sh('sh', ['-c', m[1]]); } catch {} }
  done('Tried each one.\nRESULT: DONE');
} else if (/^FAKE: nested/m.test(prompt)) {
  // A nested repository with a tracked file, staged in the parent as a gitlink: git would enter it with its own config.
  sh('git', ['init', '-q', 'child']);
  fs.writeFileSync('child/x.txt', 'x\n');
  sh('git', ['-C', 'child', 'add', 'x.txt']);
  sh('git', ['-C', 'child', '-c', 'user.name=e', '-c', 'user.email=e@example.test', 'commit', '-q', '-m', 'x']);
  sh('git', ['add', 'child']);
  fs.writeFileSync('child/x.txt', 'dirty\n');
  done('Nested.\nRESULT: DONE');
} else if (/^FAKE: link-question/m.test(prompt)) {
  // A question file that is a link to a file outside the clone, for the supervisor to read with its own rights.
  fs.symlinkSync('/etc/hosts', process.env.ENGINE_QUESTION_FILE);
  done('Asked.\nRESULT: BLOCKED see the question');
} else if (/^FAKE: linger/m.test(prompt)) {
  // A process left running in the background after the engine exits, writing its PID where the test can read it.
  const child = require('node:child_process').spawn('sleep', ['300'], { stdio: 'ignore' });
  child.unref();
  fs.writeFileSync('linger.pid', String(child.pid));
  done('Left one running.\nRESULT: DONE');
} else if (/^FAKE: sleep/m.test(prompt)) {
  execFileSync('sleep', ['120']);
  done('Woke.\nRESULT: DONE');
} else if (/^FAKE: question/m.test(prompt)) {
  fs.writeFileSync(process.env.ENGINE_QUESTION_FILE, 'Question: which colour?\nDefault: blue\n');
  done('I asked.\nRESULT: BLOCKED which colour');
} else if (/^FAKE: escape/m.test(prompt)) {
  try { sh('cat', [process.env.ENGINE_HOME_HINT || '/nonexistent/.ssh/config']); } catch {}
  try { sh('git', ['push', 'origin', 'HEAD:main']); } catch {}
  done('Tried.\nRESULT: DONE');
} else {
  const n = fs.readdirSync('.').filter((f) => /^engine-round-\d+\.txt$/.test(f)).length + 1;
  const note = (prompt.match(/^Round \d+ of at most \d+[^\n]*/m) || ['round 1'])[0];
  fs.writeFileSync('engine-round-' + n + '.txt', note + '\n');
  emit.change('engine-round-' + n + '.txt');
  sh('git', ['add', 'engine-round-' + n + '.txt']);
  sh('git', ['commit', '-q', '-m', 'Round ' + n + ' from the fake engine']);
  const which = sh('sh', ['-c', 'command -v git']).trim();
  done('Committed round ' + n + ' (git is ' + which + ', HOME is ' + process.env.HOME + ').\nRESULT: DONE');
}
`;

const FAKE_CODEX = `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('codex-cli 0.167.0'); process.exit(0); }
if (a[0] === 'login') process.exit(0);
const out = a[a.indexOf('-o') + 1];
const prompt = require('node:fs').readFileSync(0, 'utf8');
const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const emit = {
  command: (c) => line({ type: 'item.started', item: { id: 'c', type: 'command_execution', command: '/bin/bash -c ' + JSON.stringify(c) } }),
  change: (p) => line({ type: 'item.completed', item: { id: 'f', type: 'file_change', changes: [{ path: p, kind: 'add' }] } }),
  text: (t) => line({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: t } }),
};
const finish = (t) => { require('node:fs').writeFileSync(out, t + '\\n'); line({ type: 'turn.completed' }); };
${BODY}`;

const FAKE_GROK = `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('grok 1.0.0'); process.exit(0); }
const prompt = require('node:fs').readFileSync(a[a.indexOf('--prompt-file') + 1], 'utf8');
const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const emit = {
  command: (c) => line({ type: 'tool_call', toolName: 'run_terminal_cmd', rawInput: { command: c } }),
  change: (p) => line({ type: 'tool_call', toolName: 'write', rawInput: { file_path: p } }),
  text: (t) => line({ type: 'text', data: t }),
};
const finish = () => line({ type: 'end', stopReason: 'end_turn' });
${BODY}`;

// Why the sandboxed tests can't run here, or false when they can: sandbox-exec on macOS, a working bwrap on Linux
// (Ubuntu's AppArmor stops bwrap until a profile grants it user namespaces).
export function noSandbox() {
  if (process.platform === 'darwin') return false;
  if (process.platform !== 'linux') return `no sandbox on ${process.platform}`;
  try {
    execFileSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', 'true'], { stdio: 'ignore' });
    return false;
  } catch {
    return 'bwrap is missing or cannot create a user namespace here';
  }
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The engine's side of a world in an existing home: a bare origin, the main checkout cloned from it, fake auth files and
// fake codex and grok binaries. Returns their paths and the environment ext-worker.sh needs to find them.
export function addEngineWorld(home) {
  const origin = path.join(home, 'origin.git');
  const main = path.join(home, 'dev/app');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  fs.mkdirSync(path.dirname(main), { recursive: true });
  execFileSync('git', ['clone', '-q', origin, main], { stdio: 'ignore' });
  git(main, 'config', 'user.name', 'Fixture');
  git(main, 'config', 'user.email', 'fixture@example.test');
  fs.writeFileSync(path.join(main, 'README.md'), '# app\n');
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'first');
  git(main, 'branch', '-M', 'main');
  git(main, 'push', '-q', 'origin', 'main');
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex/auth.json'), JSON.stringify({ tokens: { account_id: 'fake-account' }, last_refresh: '2026-01-01T00:00:00Z' }));
  fs.mkdirSync(path.join(home, '.grok'), { recursive: true });
  fs.writeFileSync(path.join(home, '.grok/auth.json'), JSON.stringify({ fake: { user_id: 'fake-user', expires_at: '2026-01-01T00:00:00Z' } }));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'codex'), FAKE_CODEX, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'grok'), FAKE_GROK, { mode: 0o755 });
  const env = { CODEX_BIN: path.join(bin, 'codex'), GROK_BIN: path.join(bin, 'grok'), EXT_WORKER_ROOT: path.join(home, '.cache/ew') };
  return { origin, main, bin, env };
}

// config: merged over the fixture's config at the top level; fallback: merged over externalBuilders.fallback.
export function engineWorld(name, { config = {}, fallback = {}, dispatcher = {} } = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`)));
  const { origin, main, bin, env: engineEnv } = addEngineWorld(home);
  const stateDir = path.join(home, '.agent-queue');
  fs.mkdirSync(stateDir);
  fs.writeFileSync(path.join(stateDir, 'engine-gh-token'), 'fake-token-for-tests\n', { mode: 0o600 });
  const cfg = {
    ...EXAMPLE, repoPath: main, workspaceCwd: path.join(home, 'dev'), worktreesDir: '.claude/worktrees',
    paths: { stateDir, sharedDir: path.join(stateDir, 'shared') },
    push: { gates: [], env: {} },
    premerge: { ...EXAMPLE.premerge, installCommand: ['node', '--version'], copyFiles: [] },
    dispatcher: { ...EXAMPLE.dispatcher, notify: false, ...dispatcher,
      externalBuilders: { fallback: { enabled: true, engines: ['codex', 'grok'], sizes: ['S', 'M'], maxRounds: 5, timeoutSeconds: 300, ...fallback } } },
    ...config,
  };
  const configFile = path.join(home, 'agent-queue.config.json');
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
  const env = { ...process.env, HOME: home, AGENT_QUEUE_CONFIG: configFile, ...engineEnv, LINEAR_API_KEY: 'fake-linear-key' };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return { home, origin, main, bin, stateDir, configFile, env, cfg, registry: path.join(stateDir, 'engine-workers'),
    worktree: (branch) => path.join(main, '.claude/worktrees', branch.split('/').pop()) };
}

export const readRow = (w, id) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(w.registry, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
};

// Waits for the ticket's registry row to leave busy, up to ms.
export async function waitRow(w, id, ms = 90_000) {
  const end = Date.now() + ms;
  for (;;) {
    const r = readRow(w, id);
    if (r && r.status !== 'busy') return r;
    if (Date.now() > end) return r;
    await new Promise((res) => { setTimeout(res, 250); });
  }
}

export const runExt = (w, args, opts = {}) => {
  try {
    return { status: 0, out: execFileSync(EXT_WORKER, args, { env: w.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, ...opts }) };
  } catch (e) {
    return { status: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};
