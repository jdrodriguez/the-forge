// The sweep's at-risk ask: premerge-check.mjs's scratch worktree and its lock are never at risk or asked about, and an
// at-risk worktree's age counts from the first sweep that saw it at its current HEAD, so a reused path with a new
// commit starts over. The ask gives each worktree its own age. Runs the real dispatcher in capacity-sandbox.mjs with
// real git repos at repoPath.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { capBox, lines, tick } from './capacity-sandbox.mjs';

const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (cwd, file) => {
  fs.writeFileSync(path.join(cwd, file), file);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
  return git(cwd, 'rev-parse', 'HEAD');
};
const DAY = 86_400_000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();

// A checkout with: premerge-check (a detached merge of origin/main into a pushed PR branch, amended so it holds a
// change neither side has) and premerge-check.lock beside it; stale-work, a worktree with a commit on no remote branch;
// and asked-before, another, already asked about in a record saved without a head. memFor adds stale-work's record.
function ageBox(memFor) {
  const probe = capBox();
  const root = fs.realpathSync(probe.home);
  const origin = path.join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const repo = path.join(root, 'app');
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git(repo, 'checkout', '-q', '-b', 'main');
  commit(repo, 'README.md');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'checkout', '-q', '-b', 'pr-branch');
  commit(repo, 'pr.txt');
  git(repo, 'push', '-q', 'origin', 'pr-branch');
  git(repo, 'checkout', '-q', 'main');
  commit(repo, 'main.txt');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'fetch', '-q', 'origin');
  const wts = path.join(repo, '.claude/worktrees');
  const scratch = path.join(wts, 'premerge-check');
  git(repo, 'worktree', 'add', '-q', '--detach', scratch, 'origin/pr-branch');
  git(scratch, 'merge', '-q', '--no-edit', '--no-ff', 'origin/main');
  fs.appendFileSync(path.join(scratch, 'main.txt'), 'resolved by hand\n');
  git(scratch, 'commit', '-q', '--amend', '-a', '--no-edit');
  fs.mkdirSync(`${scratch}.lock`);
  const stale = path.join(wts, 'stale-work');
  git(repo, 'worktree', 'add', '-q', '-b', 'stale-work', stale, 'origin/main');
  const staleHead = commit(stale, 'work.txt');
  const asked = path.join(wts, 'asked-before');
  git(repo, 'worktree', 'add', '-q', '-b', 'asked-before', asked, 'origin/main');
  commit(asked, 'other.txt');
  const box = capBox({ config: { repoPath: repo }, dispatcher: { worktreeCleanup: { enabled: true, dryRun: false, sweepHours: 24, atRiskAskDays: 7,
    keptFoldersDir: path.join(root, 'kept') } } });
  fs.renameSync(path.join(box.bin, 'gh'), path.join(box.bin, 'gh-stub'));
  fs.writeFileSync(path.join(box.bin, 'gh'), `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'pr' && a[1] === 'list' && a.includes('--state') && a[a.indexOf('--state') + 1] === 'all') console.log('[]');
else process.stdout.write(require('node:child_process').execFileSync(__dirname + '/gh-stub', a, { encoding: 'utf8' }));
`, { mode: 0o755 });
  fs.writeFileSync(path.join(box.stateDir, 'worktree-sweep.json'), JSON.stringify({ lastRun: ago(2), atRisk: {
    [scratch]: { since: ago(10), asked: null, head: git(scratch, 'rev-parse', 'HEAD'), reason: '1 commit(s) on no remote branch', rule: 'no-pr' },
    [asked]: { since: ago(20), asked: ago(12), reason: 'no PR, and 1 commit(s) on no remote branch', rule: 'no-pr' },
    ...memFor({ stale, staleHead }),
  } }));
  return { box, scratch, stale, staleHead, asked };
}
const sweepAsks = (box) => lines(box, 'asks').filter((l) => /worktree\(s\) on/.test(l));

test('the scratch worktree and its lock are never at risk or asked about, and a moved HEAD restarts the age', () => {
  // stale-work was at risk 10 days ago, at a commit since replaced: its work now is today's.
  const { box, scratch, stale, staleHead, asked } = ageBox(({ stale: s }) => ({ [s]: { since: ago(10), asked: null, head: 'e'.repeat(40), reason: 'old', rule: 'no-pr' } }));
  const out = tick(box, GIT_ENV);
  assert.deepEqual(sweepAsks(box), [], out);
  const mem = JSON.parse(fs.readFileSync(path.join(box.stateDir, 'worktree-sweep.json'), 'utf8'));
  assert.ok(!(scratch in mem.atRisk), 'the scratch worktree is not at risk');
  assert.ok(!(`${scratch}.lock` in mem.atRisk), 'nor its lock');
  assert.ok(Date.now() - Date.parse(mem.atRisk[stale].since) < 60 * 60_000, 'stale-work starts over at its new HEAD');
  assert.equal(mem.atRisk[stale].head, staleHead);
  assert.ok(mem.atRisk[asked].asked, 'asked-before is not asked about again');
  assert.ok(Date.now() - Date.parse(mem.atRisk[asked].since) > 19 * DAY);
  assert.doesNotMatch(out, /AT RISK: premerge-check/);
  assert.ok(fs.existsSync(scratch) && fs.existsSync(`${scratch}.lock`));
});

test('the ask gives each worktree its own age, from the first sweep that saw it at its current HEAD', () => {
  const { box } = ageBox(({ stale, staleHead }) => ({ [stale]: { since: ago(10), asked: null, head: staleHead, reason: 'old', rule: 'no-pr' } }));
  const out = tick(box, GIT_ENV);
  const said = sweepAsks(box);
  assert.equal(said.length, 1, out);
  assert.match(said[0], /1 worktree\(s\) on host-a hold work GitHub lacks/);
  assert.match(said[0], /stale-work \(no PR, and 1 commit\(s\) on no remote branch; at risk 10 days\)/);
  assert.doesNotMatch(said[0], /over 7 days/);
  assert.doesNotMatch(said[0], /premerge-check/);
});
