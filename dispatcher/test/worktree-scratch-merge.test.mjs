// A tool's scratch worktree and pure merges: premerge-check.mjs keeps a reused scratch worktree,
// premerge-check, with a premerge-check.lock folder beside it, and leaves a detached --no-ff merge of origin/main into a
// PR head in it. The sweep never touches the scratch worktree or its lock, and a merge commit whose parents are all on
// a remote branch, with nothing beyond what they hold, is not work GitHub lacks. Real temp git repos throughout.
// WORKTREE_TEARDOWN_SRC points at another copy of the module.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.WORKTREE_TEARDOWN_SRC ?? path.join(HERE, '..', 'worktree-teardown.mjs');
const { classifyWorktree, sweepRepo, SCRATCH_WORKTREES } = await import(pathToFileURL(SRC).href);

Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (cwd, file, text = file) => {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
  return git(cwd, 'rev-parse', 'HEAD');
};

// A repo with a bare origin, main pushed, and a PR branch pushed: both sides of a premerge merge are on GitHub. The PR
// branch and main both edit shared.txt, in lines far apart, so git merges that file without a conflict.
function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-scratch-')));
  const origin = path.join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const repo = path.join(root, 'app');
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git(repo, 'checkout', '-q', '-b', 'main');
  commit(repo, 'shared.txt', 'a\nb\nc\nd\ne\nf\ng\nh\n');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'checkout', '-q', '-b', 'feature');
  commit(repo, 'shared.txt', 'A\nb\nc\nd\ne\nf\ng\nh\n');
  git(repo, 'push', '-q', 'origin', 'feature');
  git(repo, 'checkout', '-q', 'main');
  commit(repo, 'shared.txt', 'a\nb\nc\nd\ne\nf\ng\nH\n');
  commit(repo, 'main-only.txt');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'fetch', '-q', 'origin');
  return { root, repo };
}
// A detached worktree at the PR head with origin/main merged in, as premerge-check.mjs leaves its scratch worktree.
function premergeLike(repo, name, { evil = false } = {}) {
  const wt = path.join(repo, '.claude/worktrees', name);
  git(repo, 'worktree', 'add', '-q', '--detach', wt, 'origin/feature');
  git(wt, 'merge', '-q', '--no-edit', '--no-ff', 'origin/main');
  if (evil) {
    fs.appendFileSync(path.join(wt, 'shared.txt'), 'added in the merge\n');
    git(wt, 'commit', '-q', '--amend', '-a', '--no-edit');
  }
  return wt;
}
const atRisk = (repo, wt) => classifyWorktree(wt, { repo, dirs: [], fetch: false });

test('the default scratch name is the folder premerge-check.mjs uses for its scratch worktree', () => {
  const premerge = fs.readFileSync(path.join(path.dirname(SRC), 'premerge-check.mjs'), 'utf8');
  const name = premerge.match(/const SCRATCH = path\.join\([^\n]*'([^']+)'\);/)?.[1]?.split('/').at(-1);
  assert.ok(name, 'premerge-check.mjs names its scratch folder in const SCRATCH');
  assert.deepEqual(SCRATCH_WORKTREES, [name]);
  assert.match(premerge, /const lock = `\$\{SCRATCH\}\.lock`;/, 'its lock is <scratch>.lock');
});

test('the scratch worktree and its lock folder are kept by the sweep, never at risk, never removed or trashed', () => {
  const { root, repo } = setup();
  const wt = premergeLike(repo, 'premerge-check');
  fs.mkdirSync(path.join(repo, '.claude/worktrees/premerge-check.lock'));
  // A merge the person resolved by hand is real work anywhere else; in the scratch worktree it is still the tool's.
  fs.appendFileSync(path.join(wt, 'shared.txt'), 'resolved\n');
  git(wt, 'commit', '-q', '--amend', '-a', '--no-edit');
  const trashDir = path.join(root, 'Trash');
  const { results } = sweepRepo({ repo, prs: {}, dirs: [], fetch: false, trashDir });
  const by = Object.fromEntries(results.map((r) => [r.name, r]));
  for (const name of ['premerge-check', 'premerge-check.lock']) {
    assert.equal(by[name]?.action, 'kept', name);
    assert.equal(by[name].rule, 'scratch', name);
    assert.ok(!by[name].atRisk, name);
    assert.ok(fs.existsSync(path.join(repo, '.claude/worktrees', name)), name);
  }
  assert.match(by['premerge-check'].reason, /scratch worktree/);
  assert.match(by['premerge-check.lock'].reason, /scratch lock/);
  assert.ok(!fs.existsSync(trashDir), 'nothing went to the trash');
});

test('worktreeCleanup.scratchWorktrees names the scratch folders; one not on the list is judged like any worktree', () => {
  const { repo } = setup();
  const wt = premergeLike(repo, 'premerge-check', { evil: true });
  premergeLike(repo, 'tool-scratch', { evil: true });
  const rules = (scratch) => Object.fromEntries(sweepRepo({ repo, prs: {}, dirs: [], fetch: false, dryRun: true, scratch }).results.map((r) => [r.name, r]));
  const custom = rules(['tool-scratch']);
  assert.equal(custom['tool-scratch'].rule, 'scratch');
  assert.equal(custom['premerge-check'].rule, 'no-pr');
  assert.equal(custom['premerge-check'].atRisk, true);
  const none = rules([]);
  assert.equal(none['tool-scratch'].rule, 'no-pr');
  // A list that is not plain folder names falls back to the default.
  assert.equal(rules(['a/b'])['premerge-check'].rule, 'scratch');
  assert.ok(fs.existsSync(wt));
});

test('a pure merge of two saved commits, outside a scratch folder, is not at risk', () => {
  const { repo } = setup();
  const wt = premergeLike(repo, 'merged-main-in');
  assert.equal(git(wt, 'rev-list', '--count', 'HEAD', '--not', '--remotes'), '1', 'the merge itself is on no remote branch');
  const r = atRisk(repo, wt);
  assert.equal(r.rule, 'no-pr');
  assert.ok(!r.atRisk, r.reason);
  assert.equal(r.reason, 'no PR for its branch');
});

test('a merge that changes a file beyond what its parents hold is at risk', () => {
  const { repo } = setup();
  const wt = premergeLike(repo, 'evil-merge', { evil: true });
  const r = atRisk(repo, wt);
  assert.equal(r.atRisk, true);
  assert.match(r.reason, /1 commit\(s\) on no remote branch/);
});

test('a merge with a parent on no remote branch is at risk, counting that parent too', () => {
  const { repo } = setup();
  const wt = path.join(repo, '.claude/worktrees', 'local-parent');
  git(repo, 'worktree', 'add', '-q', '--detach', wt, 'origin/feature');
  commit(wt, 'local.txt');
  git(wt, 'merge', '-q', '--no-edit', '--no-ff', 'origin/main');
  const r = atRisk(repo, wt);
  assert.equal(r.atRisk, true);
  assert.match(r.reason, /2 commit\(s\) on no remote branch/);
});

test('an Agent tool worktree whose only unsaved commit is a pure merge is not asked about', () => {
  const { repo } = setup();
  const wt = premergeLike(repo, 'agent-0123456789abcdef0');
  const r = sweepRepo({ repo, prs: {}, dirs: [], fetch: false, dryRun: true }).results.find((x) => x.name === 'agent-0123456789abcdef0');
  assert.notEqual(r.rule, 'agent-unpushed', r.reason);
  assert.ok(!r.atRisk, r.reason);
  assert.ok(fs.existsSync(wt));
});
