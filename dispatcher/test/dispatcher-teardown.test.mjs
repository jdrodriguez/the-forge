// Worktree teardown at merge: the tick after a ticket's PR merges stops its worker, removes its worktree through
// worktree-teardown.mjs and its session with `claude rm`, records that on the ticket and never repeats it; a worktree
// holding work is kept and asked about once; dryRun changes nothing. Runs the real dispatcher in capacity-sandbox.mjs
// with a real git repo at repoPath.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { capBox, lines, state, tick } from './capacity-sandbox.mjs';

const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// A repo with one worktree on ENG-5's branch, its commit pushed; PR 5 merged at that head. The sweep has run recently,
// so these ticks exercise only the teardown at merge.
function teardownBox({ dryRun = false, dirty = false, status = 'idle' } = {}) {
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
  const wt = path.join(repo, '.claude/worktrees/eng-5');
  git(repo, 'worktree', 'add', '-q', '-b', 'agent/eng-5', wt, 'origin/main');
  fs.writeFileSync(path.join(wt, 'fix.txt'), 'fix');
  git(wt, 'add', '.');
  git(wt, 'commit', '-q', '-m', 'fix');
  git(wt, 'push', '-q', 'origin', 'HEAD:refs/heads/agent/eng-5');
  if (dirty) fs.writeFileSync(path.join(wt, 'notes.txt'), 'unsaved');
  const box = capBox({ config: { repoPath: repo }, dispatcher: { worktreeCleanup: { enabled: true, dryRun, sweepHours: 24, atRiskAskDays: 7 } },
    tickets: { 'ENG-5': { status: 'merged', mergedAt: new Date().toISOString(), mergedSha: 'm', ciChecked: true, account: 'b', workerId: 'w5',
      branch: 'agent/eng-5', prNumber: 5, pr: 'https://github.com/x/pull/5' } },
    prs: { 5: { branch: 'agent/eng-5', state: 'MERGED' } },
    ps: [{ label: 'b', id: 'w5', name: 'queue-eng-5', kind: 'background', pid: 4242, status, state: status }] });
  fs.writeFileSync(path.join(box.stateDir, 'worktree-sweep.json'), JSON.stringify({ lastRun: new Date().toISOString() }));
  // The PR's head is the worktree's commit.
  const gh = fs.readFileSync(path.join(box.bin, 'gh'), 'utf8').replace("headRefOid: 'abc123'", `headRefOid: '${git(wt, 'rev-parse', 'HEAD')}'`);
  fs.writeFileSync(path.join(box.bin, 'gh'), gh);
  return { box, wt };
}
const ticket = (box) => state(box).tickets['ENG-5'];

test('a merged ticket: its worker is stopped, its worktree and its session removed, once', () => {
  const { box, wt } = teardownBox();
  tick(box, GIT_ENV);
  assert.deepEqual(lines(box, 'stopped'), ['b w5']);
  assert.ok(!fs.existsSync(wt));
  assert.match(lines(box, 'claude-calls').join('\n'), new RegExp(`${box.home}/\\.claude-b rm w5`));
  assert.equal(ticket(box).teardown.action, 'removed');
  assert.equal(ticket(box).teardown.session, 'removed');
  tick(box, GIT_ENV);
  assert.equal(lines(box, 'stopped').length, 1, 'never repeated');
  assert.equal(lines(box, 'claude-calls').length, 1);
});

test('a dry run changes nothing and records what it would do; turning dryRun off then acts', () => {
  const { box, wt } = teardownBox({ dryRun: true });
  const out = tick(box, GIT_ENV);
  assert.match(out, /ENG-5: worktree teardown: would be removed/);
  assert.ok(fs.existsSync(wt));
  assert.deepEqual(lines(box, 'stopped'), []);
  assert.equal(ticket(box).teardown.dryRun, true);
  const cfg = JSON.parse(fs.readFileSync(box.configFile, 'utf8'));
  cfg.dispatcher.worktreeCleanup.dryRun = false;
  fs.writeFileSync(box.configFile, JSON.stringify(cfg));
  tick(box, GIT_ENV);
  assert.ok(!fs.existsSync(wt));
});

test('a worktree holding uncommitted work is kept and the human is asked once', () => {
  const { box, wt } = teardownBox({ dirty: true });
  tick(box, GIT_ENV);
  assert.ok(fs.existsSync(wt));
  assert.equal(ticket(box).teardown.action, 'kept');
  assert.equal(lines(box, 'asks').filter((l) => /was kept, and its session too: 1 uncommitted or untracked path/.test(l)).length, 1);
  tick(box, GIT_ENV);
  assert.equal(lines(box, 'asks').filter((l) => /was kept, and its session too/.test(l)).length, 1);
});

test('a worker still busy after its PR merged is left alone until it stops', () => {
  const { box, wt } = teardownBox({ status: 'busy' });
  tick(box, GIT_ENV);
  assert.ok(fs.existsSync(wt));
  assert.deepEqual(lines(box, 'stopped'), []);
  assert.equal(ticket(box).teardown.retry, true);
});

test('a session whose worktree cannot be told apart is kept and asked about, never removed', () => {
  const { box, wt } = teardownBox();
  const repo = path.dirname(path.dirname(path.dirname(wt)));
  git(repo, 'worktree', 'add', '-q', '-b', 'other/eng-5-a', path.join(repo, '.claude/worktrees/eng-5-a'), 'origin/main');
  git(repo, 'worktree', 'add', '-q', '-b', 'other/eng-5-b', path.join(repo, '.claude/worktrees/eng-5-b'), 'origin/main');
  git(repo, 'worktree', 'remove', wt);
  tick(box, GIT_ENV);
  assert.equal(lines(box, 'claude-calls').length, 0, 'no claude rm');
  assert.equal(ticket(box).teardown.action, 'kept');
  assert.equal(lines(box, 'asks').filter((l) => /and its session too: its worktree could not be told apart/.test(l)).length, 1);
});
