// Worktree teardown: worktree-teardown.mjs removes a worktree only when nothing in it can be lost, moves
// orphan folders to a Trash folder, and changes nothing on a dry run. Every case runs against real temp git repos with
// real worktrees (a bare origin, a clone, worktrees under .claude/worktrees); nothing outside the temp folder is read
// or written, and the Trash is a temp folder too. WORKTREE_TEARDOWN_SRC points at another copy of the module.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.WORKTREE_TEARDOWN_SRC ?? path.join(HERE, '..', 'worktree-teardown.mjs');
const { classifyWorktree, teardownWorktree, sweepRepo, listWorktrees, processDirs, countWorktrees } = await import(pathToFileURL(SRC).href);

// The module's git runs inherit this environment: no user or system config, a fixed identity.
Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (cwd, file, text = file) => {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
  return git(cwd, 'rev-parse', 'HEAD');
};

function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-teardown-')));
  const origin = path.join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const repo = path.join(root, 'app');
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git(repo, 'checkout', '-q', '-b', 'main');
  commit(repo, 'README.md');
  git(repo, 'push', '-q', 'origin', 'main');
  return { root, repo, trash: path.join(root, 'Trash', 'agent-queue-worktrees-orphaned-test') };
}
// A worktree on a new branch cut from origin/main, with one commit pushed to its branch.
function worktree(repo, name) {
  const wt = path.join(repo, '.claude/worktrees', name);
  git(repo, 'worktree', 'add', '-q', '-b', name, wt, 'origin/main');
  const head = commit(wt, `${name}.txt`);
  git(wt, 'push', '-q', 'origin', `HEAD:refs/heads/${name}`);
  return { wt, head };
}
const merged = (headRefOid, number = 1) => ({ number, state: 'MERGED', headRefOid });
const tracked = (repo, wt) => listWorktrees(repo).some((w) => w.path === wt);

test('a clean squash-merged worktree (HEAD is the PR head) is removed, with its local branch', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'squashed');
  // The squash lands one new commit on main, so the branch commit itself never reaches origin/main.
  git(repo, 'merge', '-q', '--squash', 'squashed');
  git(repo, 'commit', '-q', '-m', 'squash');
  git(repo, 'push', '-q', 'origin', 'main');
  const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [] });
  assert.equal(r.action, 'removed', r.reason);
  assert.ok(!fs.existsSync(wt));
  assert.ok(!tracked(repo, wt));
  assert.equal(spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'refs/heads/squashed']).status, 1, 'the local branch is gone');
});

test('a clean merged worktree with nothing beyond origin/main is removed', () => {
  const { repo } = setup();
  const { wt } = worktree(repo, 'fastforward');
  git(wt, 'push', '-q', 'origin', 'HEAD:main');
  git(repo, 'fetch', '-q', 'origin');
  // A PR head this clone has never seen: origin/main alone shows the work is saved.
  const r = teardownWorktree({ path: wt, repo, pr: merged('0'.repeat(40)), dirs: [] });
  assert.equal(r.action, 'removed', r.reason);
  assert.match(r.reason, /nothing beyond origin\/main/);
});

test('a dirty worktree is kept and at risk, untracked files included', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'dirty');
  fs.writeFileSync(path.join(wt, 'scratch.txt'), 'not committed');
  const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [] });
  assert.equal(r.action, 'kept');
  assert.equal(r.atRisk, true);
  assert.match(r.reason, /uncommitted or untracked/);
  assert.ok(fs.existsSync(path.join(wt, 'scratch.txt')));
});

test('a commit beyond the merged PR head that is on no remote keeps the worktree', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'ahead');
  commit(wt, 'later.txt');
  const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [] });
  assert.equal(r.action, 'kept');
  assert.equal(r.atRisk, true);
  assert.match(r.reason, /1 commit\(s\) past PR #1's head/);
  assert.ok(tracked(repo, wt));
});

test('a HEAD behind the PR head (an ancestor of it) counts as saved', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'behind');
  const prHead = commit(wt, 'more.txt');
  git(wt, 'push', '-q', 'origin', 'HEAD:refs/heads/behind');
  git(wt, 'reset', '-q', '--hard', head);
  assert.equal(teardownWorktree({ path: wt, repo, pr: merged(prHead), dirs: [] }).action, 'removed');
});

test('an open PR, or no PR, keeps the worktree', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'open');
  assert.equal(teardownWorktree({ path: wt, repo, pr: { number: 2, state: 'OPEN', headRefOid: head }, dirs: [] }).action, 'kept');
  const none = teardownWorktree({ path: wt, repo, pr: null, dirs: [] });
  assert.equal(none.action, 'kept');
  assert.equal(none.atRisk, undefined, 'its one commit is on origin, so nothing is at risk');
  assert.ok(tracked(repo, wt));
});

test('a worktree locked by a live pid is kept; one locked by a dead pid is unlocked and removed', () => {
  const { repo } = setup();
  const live = worktree(repo, 'live-lock');
  git(repo, 'worktree', 'lock', '--reason', `claude agent agent-1 (pid ${process.pid})`, live.wt);
  const kept = teardownWorktree({ path: live.wt, repo, pr: merged(live.head), dirs: [] });
  assert.equal(kept.action, 'kept');
  assert.equal(kept.transient, true);
  assert.match(kept.reason, new RegExp(`live pid ${process.pid}`));

  const dead = worktree(repo, 'dead-lock');
  const gonePid = spawnSync('true').pid; // exited before the lock is read
  git(repo, 'worktree', 'lock', '--reason', `claude agent agent-2 (pid ${gonePid})`, dead.wt);
  const r = teardownWorktree({ path: dead.wt, repo, pr: merged(dead.head), dirs: [] });
  assert.equal(r.action, 'removed', r.reason);
  assert.match(r.reason, /dead-pid lock lifted/);
  assert.ok(!fs.existsSync(dead.wt));
});

test('a lock with no pid in its reason keeps the worktree', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'initializing');
  git(repo, 'worktree', 'lock', '--reason', 'initializing', wt);
  const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [] });
  assert.equal(r.action, 'kept');
  assert.match(r.reason, /no pid to check/);
});

test('a live process with its working folder inside keeps the worktree', async () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'busy');
  const child = spawn('sleep', ['30'], { cwd: path.join(wt), stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 300));
    const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: processDirs() });
    assert.equal(r.action, 'kept');
    assert.equal(r.transient, true);
    assert.match(r.reason, /process has its working folder inside/);
  } finally {
    process.kill(child.pid); // the one process this test started, by pid
  }
});

test('an orphan folder git no longer tracks goes to the Trash; a standalone clone and a fresh folder stay', () => {
  const { repo, trash } = setup();
  const base = path.join(repo, '.claude/worktrees');
  const orphan = path.join(base, 'stray');
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, 'notes.txt'), 'left behind');
  const old = new Date(Date.now() - 2 * 3.6e6);
  fs.utimesSync(orphan, old, old);
  const clone = path.join(base, 'codex-clone');
  fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
  fs.utimesSync(clone, old, old);
  const fresh = path.join(base, 'just-made');
  fs.mkdirSync(fresh);

  const r = teardownWorktree({ path: orphan, repo, dirs: [], trashDir: trash });
  assert.equal(r.action, 'trashed', r.reason);
  assert.ok(!fs.existsSync(orphan));
  assert.equal(fs.readFileSync(path.join(trash, 'stray', 'notes.txt'), 'utf8'), 'left behind');
  assert.equal(teardownWorktree({ path: clone, repo, dirs: [], trashDir: trash }).action, 'kept');
  assert.equal(teardownWorktree({ path: fresh, repo, dirs: [], trashDir: trash }).action, 'kept');
  assert.ok(fs.existsSync(clone) && fs.existsSync(fresh));
});

test('a dry run sweep changes nothing and says what it would do', () => {
  const { repo, trash } = setup();
  const done = worktree(repo, 'done');
  const live = worktree(repo, 'ENG-77-live');
  const orphan = path.join(repo, '.claude/worktrees', 'stray');
  fs.mkdirSync(orphan);
  const old = new Date(Date.now() - 2 * 3.6e6);
  fs.utimesSync(orphan, old, old);
  const before = git(repo, 'worktree', 'list', '--porcelain');
  const branchesBefore = git(repo, 'branch', '--list');

  const out = sweepRepo({ repo, prs: { done: merged(done.head), 'ENG-77-live': merged(live.head, 2) }, liveIds: ['ENG-77'], dryRun: true, trashDir: trash });
  assert.equal(out.error, undefined);
  const by = Object.fromEntries(out.results.map((r) => [r.name, r]));
  assert.equal(by.done.action, 'kept');
  assert.equal(by.done.would, 'removed');
  assert.equal(by.stray.would, 'trashed');
  assert.match(by['ENG-77-live'].reason, /ENG-77 is live/);
  assert.equal(git(repo, 'worktree', 'list', '--porcelain'), before);
  assert.equal(git(repo, 'branch', '--list'), branchesBefore);
  assert.ok(fs.existsSync(done.wt) && fs.existsSync(orphan));
  assert.ok(!fs.existsSync(trash));
  assert.equal(countWorktrees(repo), 3);
});

test('a real sweep removes the safe worktree, trashes the orphan and keeps a live branch', () => {
  const { repo, trash } = setup();
  const done = worktree(repo, 'done');
  const live = worktree(repo, 'live-branch');
  const orphan = path.join(repo, '.claude/worktrees', 'stray');
  fs.mkdirSync(orphan);
  const old = new Date(Date.now() - 2 * 3.6e6);
  fs.utimesSync(orphan, old, old);
  const out = sweepRepo({ repo, prs: { done: merged(done.head), 'live-branch': merged(live.head, 2) }, liveBranches: new Set(['live-branch']), trashDir: trash });
  const by = Object.fromEntries(out.results.map((r) => [r.name, r]));
  assert.equal(by.done.action, 'removed', by.done.reason);
  assert.equal(by.stray.action, 'trashed', by.stray.reason);
  assert.equal(by['live-branch'].action, 'kept');
  assert.ok(fs.existsSync(live.wt));
  assert.equal(countWorktrees(repo), 1);
});

test('classifyWorktree reports a missing folder as gone', () => {
  const { repo } = setup();
  assert.equal(classifyWorktree(path.join(repo, '.claude/worktrees/nope'), { repo, dirs: [] }).verdict, 'gone');
});
