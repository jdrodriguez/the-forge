// The worktree sweep in the dispatcher: a ticket this machine's state calls live, whose own PR GitHub shows merged, is
// judged as finished and the mismatch is logged; one matched only by a PR title stays live; an Agent tool worktree with commits on no
// remote is asked about at once, naming its branch, and only once. Runs the real dispatcher in capacity-sandbox.mjs with
// real git repos at repoPath.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { capBox, lines, tick } from './capacity-sandbox.mjs';

const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function sweepBox({ prNumber = null, agentWorktrees = null } = {}) {
  const probe = capBox();
  const root = fs.realpathSync(probe.home);
  const origin = path.join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const repo = path.join(root, 'app');
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git(repo, 'checkout', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'push', '-q', 'origin', 'main');
  // ENG-57's worktree: nothing beyond origin/main; its ticket waits on a merge here, merged elsewhere in ENG-50's bundle.
  const stale = path.join(repo, '.claude/worktrees/eng-57');
  git(repo, 'worktree', 'add', '-q', '-b', 'agent/eng-57', stale, 'origin/main');
  // An Agent tool worktree with a commit on no remote, untouched for a month.
  const agent = path.join(repo, '.claude/worktrees/agent-ab95bd8f5c32d2c61');
  git(repo, 'worktree', 'add', '-q', '-b', 'worktree-agent-ab95bd8f5c32d2c61', agent, 'origin/main');
  fs.writeFileSync(path.join(agent, 'work.txt'), 'w');
  git(agent, 'add', '.');
  git(agent, 'commit', '-q', '-m', 'work');
  const old = new Date(Date.now() - 30 * 86_400_000);
  for (const f of ['work.txt', 'README.md', '.git']) fs.utimesSync(path.join(agent, f), old, old);
  fs.utimesSync(agent, old, old);
  const gd = git(agent, 'rev-parse', '--absolute-git-dir');
  for (const f of ['HEAD', 'index', 'logs/HEAD']) fs.utimesSync(path.join(gd, f), old, old);
  const box = capBox({ config: { repoPath: repo }, dispatcher: { worktreeCleanup: { enabled: true, dryRun: false, sweepHours: 24, atRiskAskDays: 7,
    keptFoldersDir: path.join(root, 'kept'), ...(agentWorktrees ? { agentWorktrees } : {}) } },
  tickets: { 'ENG-57': { status: 'merge-asked', account: 'b', workerId: 'gone', branch: 'agent/eng-57', prNumber, claimedAt: '2026-11-24T00:00:00Z' } } });
  // The sweep's `gh pr list --state all` sees one merged bundle PR naming ENG-57; every other gh call goes to the sandbox's stub.
  const prList = JSON.stringify([{ number: 4705, state: 'MERGED', headRefName: 'agent/eng-50', headRefOid: 'f'.repeat(40),
    title: 'ENG-50, ENG-57: one bundle', createdAt: '2026-11-24T08:00:00Z' }]);
  fs.renameSync(path.join(box.bin, 'gh'), path.join(box.bin, 'gh-stub'));
  fs.writeFileSync(path.join(box.bin, 'gh'), `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'pr' && a[1] === 'list' && a.includes('--state') && a[a.indexOf('--state') + 1] === 'all') console.log(${JSON.stringify(prList)});
else process.stdout.write(require('node:child_process').execFileSync(__dirname + '/gh-stub', a, { encoding: 'utf8' }));
`, { mode: 0o755 });
  return { box, stale, agent };
}

test('a ticket live in local state whose own PR GitHub shows merged is judged as finished, and the mismatch is logged', () => {
  const { box, stale } = sweepBox({ prNumber: 4705 });
  const out = tick(box, GIT_ENV);
  assert.match(out, /ENG-57 is merge-asked in this machine's state, but its PR #4705 is merged on GitHub/);
  assert.ok(!fs.existsSync(stale), out);
});

test('a live ticket matched only by a merged PR title stays live (a title is free text), and the match is logged', () => {
  const { box, stale } = sweepBox();
  const out = tick(box, GIT_ENV);
  assert.match(out, /ENG-57 is merge-asked in this machine's state, and merged PR #4705 names it in its title; it stays live here/);
  assert.ok(fs.existsSync(stale), out);
});

test('an Agent tool worktree with commits on no remote is kept and asked about at once, naming its branch, once', () => {
  const { box, agent } = sweepBox();
  tick(box, GIT_ENV);
  assert.ok(fs.existsSync(path.join(agent, 'work.txt')));
  const asks = lines(box, 'asks').filter((l) => /agent-ab95bd8f5c32d2c61/.test(l));
  assert.equal(asks.length, 1, asks.join('\n'));
  assert.match(asks[0], /Agent tool worktree on worktree-agent-ab95bd8f5c32d2c61: 1 commit\(s\) on no branch GitHub has/);
  const memFile = path.join(box.stateDir, 'worktree-sweep.json');
  const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
  mem.lastRun = new Date(Date.now() - 25 * 3.6e6).toISOString();
  fs.writeFileSync(memFile, JSON.stringify(mem));
  tick(box, GIT_ENV);
  assert.equal(lines(box, 'asks').filter((l) => /agent-ab95bd8f5c32d2c61/.test(l)).length, 1, 'asked once');
});

test('a sweep notice (no remote of the Agent tool rule\'s name) is logged once, not every sweep', () => {
  const { box } = sweepBox({ agentWorktrees: { remote: 'upstream' } });
  const first = tick(box, GIT_ENV);
  const memFile = path.join(box.stateDir, 'worktree-sweep.json');
  const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
  mem.lastRun = new Date(Date.now() - 25 * 3.6e6).toISOString();
  fs.writeFileSync(memFile, JSON.stringify(mem));
  const second = tick(box, GIT_ENV);
  const line = /the Agent tool worktree rule is off: this repo has no remote named upstream/;
  assert.match(first, line);
  assert.doesNotMatch(second, line);
});
