// The checks ext-worker.sh runs outside the sandbox: the after-run audit of the engine's commands and tool calls, what
// the branch carries, the secret scan of the brief, the RESULT line, the auth file's copy-back, the shell view of the
// config and the engine's gated push, and the proxy's allowlist. Plain functions, with invented data only.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { auditStream, branchHazards, commandViolations, pushViolation } from '../ext-worker-audit.mjs';
import { authSync, envSecrets, pushShim, readResult, scanPrompt, shellConfig } from '../ext-worker-lib.mjs';
import { hostAllowed } from '../ext-worker-net.mjs';

const HOME = '/home/alex';
const WT = `${HOME}/dev/app/.claude/worktrees/eng-1`;
const ctx = { worktree: WT, main: `${HOME}/dev/app`, workspace: `${HOME}/dev`, home: HOME, base: 'develop',
  private: [`${HOME}/.agent-queue`, `${HOME}/agent-queue`], extra: [`${HOME}/.cache/ew/runs/x/tmp`] };
const flags = (c) => commandViolations(c, ctx);

test('the audit flags every escape: credentials, secrets managers, merges, workflow runs, the base branch, other repos, the queue', () => {
  const escapes = {
    'cat ~/.ssh/id_ed25519': /reached for ~\/\.ssh/,
    [`cat ${HOME}/.aws/credentials`]: /reached for ~\/\.aws/,
    'doppler secrets download': /ran doppler/,
    'sh -c doppler me': /ran doppler/,
    'gh pr merge 7 --squash': /merged a PR through gh/,
    'gh workflow run deploy.yml': /started a workflow/,
    'gh auth token': /read the gh token/,
    'gh api -X POST repos/o/r/merges -f base=main': /merged or dispatched/,
    'git push origin HEAD:develop': /pushed to develop/,
    'git push origin refs/heads/main': /pushed to main/,
    'git push --force origin x': /force-pushed/,
    'git push origin +x': /force-pushed a refspec/,
    'git push --no-verify origin x': /no-verify/,
    [`cat ${HOME}/dev/other-repo/.env`]: /outside its worktree into .*other-repo/,
    [`cat ${HOME}/dev/app/.env`]: /outside its worktree into .*app\/\.env/,
    [`cat ${HOME}/.agent-queue/state.json`]: /the queue's own files/,
    'cat $CODEX_HOME/auth.json': /auth file/,
    'security find-generic-password -s x -w': /keychain/,
    'osascript -e "tell app"': /leave the sandbox/,
  };
  for (const [c, rx] of Object.entries(escapes)) assert.match(flags(c).join(' | '), rx, c);
});

test('the audit leaves normal work alone: the worktree, its temp folder, pushes of its own branch, gh reads', () => {
  for (const c of ['git status', 'npm test', `cat ${WT}/src/x.ts`, `ls ${HOME}/dev/app/.git/objects`, `cat ${HOME}/.cache/ew/runs/x/tmp/note.md`,
    'git push origin agent/eng-1', 'gated-push origin agent/eng-1', 'gh pr view --json state', 'gh run rerun 1 --failed', 'git log --oneline',
    `ls ${HOME}/dev`]) {
    assert.deepEqual(flags(c), [], c);
  }
  assert.equal(pushViolation('git push origin agent/eng-1 # not main'), null, 'a comment after the refspec is not a target');
});

test("the audit reads each CLI's own stream: Codex command items and file changes, Grok tool calls and its tool allowlist", () => {
  const codex = [
    { type: 'item.started', item: { type: 'command_execution', command: '/bin/bash -lc "cat ~/.ssh/config"' } },
    { type: 'item.completed', item: { type: 'file_change', changes: [{ path: '../../../../../.bashrc' }, { path: 'src/ok.ts' }] } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Done.\nRESULT: DONE' } },
    { type: 'turn.completed' },
  ].map((x) => JSON.stringify(x)).join('\n');
  const r = auditStream('codex', `${codex}\n{"partial`, ctx);
  assert.equal(r.completed, true);
  assert.equal(r.summary, 'Done.\nRESULT: DONE');
  assert.match(r.violations.join(' | '), /reached for ~\/\.ssh/);
  assert.match(r.violations.join(' | '), /edited a file outside its worktree: \.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.bashrc/);
  assert.doesNotMatch(r.violations.join(' | '), /ok\.ts/);
  const grok = [
    { type: 'tool_call', toolName: 'read_file', rawInput: { file_path: `${HOME}/.grok/auth.json` } },
    { type: 'tool_call', toolName: 'web_fetch', rawInput: { url: 'https://example.com' } },
    { type: 'tool_call', toolName: 'write', rawInput: { file_path: '/tmp/x' } },
    { type: 'text', data: 'RESULT: DONE' }, { type: 'end', stopReason: 'end_turn' },
  ].map((x) => JSON.stringify(x)).join('\n');
  const g = auditStream('grok', grok, ctx);
  assert.equal(g.completed, true);
  assert.match(g.violations.join(' | '), /reached for ~\/\.grok with read_file/);
  assert.match(g.violations.join(' | '), /outside its allowlist: web_fetch/);
  assert.match(g.violations.join(' | '), /tried to write outside its worktree: \/tmp\/x/);
});

test('the branch audit names files that run outside the sandbox, committed or not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-branch-'));
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'base');
  git('branch', 'base');
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github/workflows/ci.yml'), 'on: push\n');
  fs.writeFileSync(path.join(dir, 'src.ts'), 'x\n');
  git('add', '.github', 'src.ts');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', 'work');
  fs.writeFileSync(path.join(dir, '.mcp.json'), '{}');
  assert.deepEqual(branchHazards(dir, 'base').sort(), ['.github/workflows/ci.yml', '.mcp.json']);
});

test('a brief with a secret-shaped value, or a .env value, is refused; one without is not; the RESULT line decides done', () => {
  assert.deepEqual(scanPrompt(`Use ${'ghp_'}${'a'.repeat(36)} to push`), ['a GitHub token']);
  const secrets = envSecrets('API_KEY="abcdefghijklmnop"\nDATABASE_URL=postgres://u:p@localhost/db\nNAME=just-a-name-value\n');
  assert.deepEqual(secrets.map((s) => s.key), ['API_KEY']);
  assert.deepEqual(scanPrompt('the key is abcdefghijklmnop', secrets), ['the value of API_KEY from a .env file']);
  assert.deepEqual(scanPrompt('Build ENG-1: show the count.', secrets), []);
  assert.deepEqual(readResult('work\n**RESULT: DONE**\n'), { done: true, reason: null });
  assert.deepEqual(readResult('RESULT: BLOCKED which colour?'), { done: false, reason: 'which colour?' });
  assert.deepEqual(readResult('I stopped.'), { done: false, reason: 'it ended without a RESULT line' });
});

test("a refreshed auth file goes back only for the same account and only when it is newer", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-auth-'));
  const put = (f, acct, at) => fs.writeFileSync(path.join(dir, f), JSON.stringify({ tokens: { account_id: acct }, last_refresh: at }));
  put('real.json', 'acct-1', '2026-01-01T00:00:00Z');
  put('run.json', 'acct-2', '2026-02-01T00:00:00Z');
  assert.match(authSync('codex', path.join(dir, 'run.json'), path.join(dir, 'real.json')), /refused/);
  put('run.json', 'acct-1', '2025-12-01T00:00:00Z');
  assert.match(authSync('codex', path.join(dir, 'run.json'), path.join(dir, 'real.json')), /nothing newer/);
  put('run.json', 'acct-1', '2026-02-01T00:00:00Z');
  assert.match(authSync('codex', path.join(dir, 'run.json'), path.join(dir, 'real.json')), /copied/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'real.json'), 'utf8')).last_refresh, '2026-02-01T00:00:00Z');
});

test('the shell view of the config quotes every value and drops env names that look like credentials', () => {
  const out = shellConfig({ repoPath: "/tmp/it's here", worktreesDir: '.wt', paths: { stateDir: '/tmp/s', sharedDir: '/tmp/s/shared' }, github: { baseBranch: 'develop' },
    premerge: { installCommand: ['pnpm', 'install', '--frozen-lockfile'] },
    dispatcher: { externalBuilders: { fallback: { timeoutSeconds: 60, loopbackPorts: [5432, 'x', 70000], extraHosts: ['pypi.org', 'bad host'],
      env: { CI: '1', GITHUB_TOKEN: 'x', MY_SECRET: 'x', SERVICE_API_KEY: 'x', 'bad-name': 'x' } } } } });
  const vars = spawnSync('bash', ['-c', `${out}\nprintf '%s|' "$EW_MAIN" "$EW_BASE" "$EW_TIMEOUT" "$EW_LOOPBACK" "$EW_EXTRA_HOSTS" "\${#EW_INSTALL[@]}" "\${EW_ENV[@]}"`], { encoding: 'utf8' }).stdout;
  assert.equal(vars, "/tmp/it's here|develop|60|5432|pypi.org|3|CI=1|");
});

test("the engine's gated push runs push.gates, stops on a failing one, then pushes with push.env", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-push-'));
  const bare = path.join(dir, 'origin.git');
  const wt = path.join(dir, 'wt');
  execFileSync('git', ['init', '-q', '--bare', bare]);
  execFileSync('git', ['init', '-q', '-b', 'feature', wt]);
  execFileSync('git', ['-C', wt, '-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'x']);
  execFileSync('git', ['-C', wt, 'remote', 'add', 'origin', bare]);
  const shim = path.join(dir, 'gated-push');
  const write = (gates) => fs.writeFileSync(shim, pushShim({ push: { gates, env: { PUSH_MARK: '1' } } }), { mode: 0o755 });
  write([['node', '-e', 'process.exit(3)']]);
  assert.equal(spawnSync(shim, ['origin', 'feature'], { cwd: wt, encoding: 'utf8' }).status, 1);
  assert.equal(execFileSync('git', ['-C', bare, 'branch', '--list', 'feature'], { encoding: 'utf8' }).trim(), '');
  write([['node', '-e', 'process.exit(0)']]);
  const ok = spawnSync(shim, ['origin', 'feature'], { cwd: wt, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(execFileSync('git', ['-C', bare, 'branch', '--list', 'feature'], { encoding: 'utf8' }), /feature/);
});

test("the proxy's allowlist matches a host exactly or a subdomain of a *. entry, nothing else", () => {
  const allow = ['github.com', '*.githubusercontent.com'];
  assert.equal(hostAllowed('github.com', allow), true);
  assert.equal(hostAllowed('GitHub.com.', allow), true);
  assert.equal(hostAllowed('raw.githubusercontent.com', allow), true);
  assert.equal(hostAllowed('githubusercontent.com', allow), false);
  assert.equal(hostAllowed('evilgithub.com', allow), false);
  assert.equal(hostAllowed('github.com.evil.test', allow), false);
});
