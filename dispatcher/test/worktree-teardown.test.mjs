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
// A former worktree of this repo: made with git worktree add, then its metadata in .git/worktrees removed, as a crash or
// a prune leaves it. Its .git file still points at that metadata.
function formerWorktree(repo, name) {
  const dir = path.join(repo, '.claude/worktrees', name);
  git(repo, 'worktree', 'add', '-q', '--detach', dir, 'origin/main');
  fs.rmSync(path.join(repo, '.git/worktrees', name), { recursive: true, force: true });
  return dir;
}

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

test('a former worktree git no longer tracks goes to the Trash; a scratch folder, a standalone clone and a fresh folder stay', () => {
  const { repo, trash } = setup();
  const base = path.join(repo, '.claude/worktrees');
  const orphan = formerWorktree(repo, 'stray');
  fs.writeFileSync(path.join(orphan, 'notes.txt'), 'left behind');
  const old = new Date(Date.now() - 2 * 3.6e6);
  for (const f of fs.readdirSync(orphan)) fs.utimesSync(path.join(orphan, f), old, old);
  fs.utimesSync(orphan, old, old);
  const clone = path.join(base, 'codex-clone');
  fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
  fs.utimesSync(clone, old, old);
  const fresh = path.join(base, 'just-made');
  fs.mkdirSync(fresh);

  const scratch = path.join(base, 'scratch');
  fs.mkdirSync(scratch);
  fs.utimesSync(scratch, old, old);
  const r = teardownWorktree({ path: orphan, repo, dirs: [], trashDir: trash });
  assert.equal(r.action, 'trashed', r.reason);
  const foreign = teardownWorktree({ path: scratch, repo, dirs: [], trashDir: trash });
  assert.equal(foreign.action, 'kept');
  assert.equal(foreign.foreign, true, 'a non-git scratch folder is reported and left');
  assert.ok(fs.existsSync(scratch));
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
  const orphan = formerWorktree(repo, 'stray');
  const old = new Date(Date.now() - 2 * 3.6e6);
  for (const f of fs.readdirSync(orphan)) fs.utimesSync(path.join(orphan, f), old, old);
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
  const orphan = formerWorktree(repo, 'stray');
  const old = new Date(Date.now() - 2 * 3.6e6);
  for (const f of fs.readdirSync(orphan)) fs.utimesSync(path.join(orphan, f), old, old);
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

test('a merged worktree holding an ignored .env is kept: git worktree remove would delete the only copy', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'withenv');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(wt, '.gitignore'), '.env\n');
  git(wt, 'add', '.gitignore');
  git(wt, 'commit', '-q', '-m', 'ignore');
  git(wt, 'push', '-q', 'origin', 'HEAD:refs/heads/withenv');
  fs.writeFileSync(path.join(wt, '.env'), 'SECRET=only-here');
  const r = teardownWorktree({ path: wt, repo, pr: merged(git(wt, 'rev-parse', 'HEAD')), dirs: [] });
  assert.equal(r.action, 'kept', r.reason);
  assert.match(r.reason, /ignored files git does not keep \(\.env\)/);
  assert.ok(fs.existsSync(path.join(wt, '.env')));
  void head;
});

test("the sweep never touches a worktree outside the worktrees folder, though its PR merged", () => {
  const { repo, root, trash } = setup();
  const outside = path.join(root, 'my-own-checkout');
  git(repo, 'worktree', 'add', '-q', '-b', 'mine', outside, 'origin/main');
  const head = commit(outside, 'mine.txt');
  git(outside, 'push', '-q', 'origin', 'HEAD:refs/heads/mine');
  const out = sweepRepo({ repo, prs: { mine: merged(head) }, trashDir: trash, dirs: [] });
  assert.equal(out.results.find((r) => r.path === outside), undefined, 'not even looked at');
  assert.ok(fs.existsSync(outside));
  assert.equal(spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'refs/heads/mine']).status, 0, 'its branch stays');
});

test('a protected ignored file anywhere in a merged worktree keeps it: a nested .env, a key, local settings', () => {
  for (const [file, ignore] of [['packages/api/.env.local', 'packages/\n'], ['certs/dev.pem', 'certs/\n'], ['.claude/settings.local.json', '.claude/\n']]) {
    const { repo } = setup();
    const name = `p-${file.replace(/\W/g, '')}`;
    const { wt } = worktree(repo, name);
    fs.writeFileSync(path.join(wt, '.gitignore'), ignore);
    git(wt, 'add', '.gitignore');
    git(wt, 'commit', '-q', '-m', 'ignore');
    git(wt, 'push', '-q', 'origin', `HEAD:refs/heads/${name}`);
    fs.mkdirSync(path.dirname(path.join(wt, file)), { recursive: true });
    fs.writeFileSync(path.join(wt, file), 'only here');
    const r = teardownWorktree({ path: wt, repo, pr: merged(git(wt, 'rev-parse', 'HEAD')), dirs: [] });
    assert.equal(r.action, 'kept', `${file}: ${r.reason}`);
    assert.ok(r.reason.includes(file.split('/')[0]), r.reason);
  }
});

test('an orphan whose top folder is old but whose files changed within the hour is kept', () => {
  const { repo, trash } = setup();
  const orphan = formerWorktree(repo, 'busy');
  for (const f of fs.readdirSync(orphan)) fs.utimesSync(path.join(orphan, f), new Date(Date.now() - 2 * 3.6e6), new Date(Date.now() - 2 * 3.6e6));
  fs.mkdirSync(path.join(orphan, 'deep'), { recursive: true });
  fs.writeFileSync(path.join(orphan, 'deep', 'fresh.txt'), 'just written');
  const old = new Date(Date.now() - 2 * 3.6e6);
  fs.utimesSync(path.join(orphan, 'deep'), old, old);
  fs.utimesSync(orphan, old, old);
  const r = teardownWorktree({ path: orphan, repo, dirs: [], trashDir: trash });
  assert.equal(r.action, 'kept');
  assert.match(r.reason, /changed within the hour/);
});

test('an orphan on another volume is copied to the trash, then removed', async () => {
  const { root } = setup();
  const { moveToTrash } = await import(pathToFileURL(SRC).href);
  const orphan = path.join(root, 'stray');
  fs.mkdirSync(orphan);
  fs.writeFileSync(path.join(orphan, 'a.txt'), 'a');
  const exdev = () => { throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' }); };
  const to = moveToTrash(orphan, path.join(root, 'Trash', 'dated'), exdev);
  assert.ok(!fs.existsSync(orphan));
  assert.equal(fs.readFileSync(path.join(to, 'a.txt'), 'utf8'), 'a');
});

// Cleanup hardening: how a path is compared, what counts as work, and the standalone clone rule.
const ageAll = (dir) => {
  const old = new Date(Date.now() - 2 * 3.6e6);
  for (const f of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, f), old, old);
  fs.utimesSync(dir, old, old);
};

test('untracked files a config hides from status, and a merge in progress, keep a merged worktree', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'hidden');
  git(wt, 'config', 'status.showUntrackedFiles', 'no');
  fs.writeFileSync(path.join(wt, 'notes.txt'), 'not committed');
  const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [] });
  assert.equal(r.action, 'kept');
  assert.equal(r.rule, 'dirty');
  fs.rmSync(path.join(wt, 'notes.txt'));
  fs.writeFileSync(path.join(git(wt, 'rev-parse', '--absolute-git-dir'), 'MERGE_HEAD'), `${head}\n`);
  const m = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [] });
  assert.equal(m.action, 'kept');
  assert.equal(m.rule, 'in-progress');
});

test('ignored build output does not keep a worktree; any other ignored file or a nested repo does; an empty list means the default', () => {
  const make = (name, files) => {
    const { repo } = setup();
    const { wt } = worktree(repo, name);
    fs.writeFileSync(path.join(wt, '.gitignore'), 'node_modules/\ndist/\n*.tsbuildinfo\nscratch/\ngenerated/\n');
    git(wt, 'add', '.gitignore');
    git(wt, 'commit', '-q', '-m', 'ignore');
    git(wt, 'push', '-q', 'origin', `HEAD:refs/heads/${name}`);
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(wt, f)), { recursive: true });
      fs.writeFileSync(path.join(wt, f), 'x');
    }
    return { repo, wt, pr: merged(git(wt, 'rev-parse', 'HEAD')) };
  };
  const built = make('built', ['node_modules/a/index.js', 'packages/api/dist/x.js', 'tsconfig.tsbuildinfo']);
  assert.equal(teardownWorktree({ path: built.wt, repo: built.repo, pr: built.pr, dirs: [] }).action, 'removed');
  const notes = make('notes', ['scratch/plan.md']);
  const kept = teardownWorktree({ path: notes.wt, repo: notes.repo, pr: notes.pr, dirs: [] });
  assert.equal(kept.rule, 'ignored', kept.reason);
  const nested = make('nested', []);
  execFileSync('git', ['init', '-q', path.join(nested.wt, 'vendor-repo')]);
  assert.equal(teardownWorktree({ path: nested.wt, repo: nested.repo, pr: nested.pr, dirs: [] }).action, 'kept', 'a nested repo keeps it');
  const empty = make('empty', ['node_modules/a/index.js']);
  assert.equal(teardownWorktree({ path: empty.wt, repo: empty.repo, pr: empty.pr, dirs: [], rebuildable: [] }).action, 'removed', 'an empty list falls back to the default');
  const custom = make('custom', ['generated/x.js']);
  assert.equal(teardownWorktree({ path: custom.wt, repo: custom.repo, pr: custom.pr, dirs: [], rebuildable: ['generated'] }).action, 'removed');
});

test("an unchanged copy of the main checkout's .env does not keep a worktree; a changed one does", () => {
  const { repo } = setup();
  fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n');
  git(repo, 'add', '.gitignore');
  git(repo, 'commit', '-q', '-m', 'ignore env');
  git(repo, 'push', '-q', 'origin', 'main');
  fs.writeFileSync(path.join(repo, '.env'), 'A=1\n');
  const same = worktree(repo, 'same');
  fs.writeFileSync(path.join(same.wt, '.env'), 'A=1\n');
  assert.equal(teardownWorktree({ path: same.wt, repo, pr: merged(same.head), dirs: [] }).action, 'removed');
  const changed = worktree(repo, 'changed');
  fs.writeFileSync(path.join(changed.wt, '.env'), 'A=2\n');
  assert.equal(teardownWorktree({ path: changed.wt, repo, pr: merged(changed.head), dirs: [] }).rule, 'ignored');
});

test('a tracked worktree reached through a symlinked or differently cased path is never read as an orphan', () => {
  const { root, repo, trash } = setup();
  const { wt, head } = worktree(repo, 'linked');
  fs.writeFileSync(path.join(wt, 'notes.txt'), 'work');
  const link = path.join(root, 'link');
  fs.symlinkSync(repo, link);
  const out = sweepRepo({ repo: link, prs: { linked: merged(head) }, trashDir: trash, dirs: [] });
  const row = out.results.find((r) => r.name === 'linked');
  assert.equal(row.action, 'kept');
  assert.equal(row.rule, 'dirty');
  assert.ok(fs.existsSync(path.join(wt, 'notes.txt')));
  if (process.platform === 'darwin') {
    const upper = path.join(root, path.basename(repo).toUpperCase());
    const r = teardownWorktree({ path: path.join(upper, '.claude/worktrees/linked'), repo: upper, pr: merged(head), dirs: [], trashDir: trash });
    assert.equal(r.action, 'kept', r.reason);
    assert.notEqual(r.rule, 'foreign');
    assert.ok(fs.existsSync(path.join(wt, 'notes.txt')));
  }
});

// A standalone clone in the worktrees folder, as ext-worker.sh makes for an engine: its own .git, its branch pushed.
function clone(repo, name, branch = name) {
  const dir = path.join(repo, '.claude/worktrees', name);
  execFileSync('git', ['clone', '-q', git(repo, 'remote', 'get-url', 'origin'), dir], { stdio: 'ignore' });
  git(dir, 'checkout', '-q', '-b', branch);
  const head = commit(dir, `${name}.txt`);
  git(dir, 'push', '-q', 'origin', `HEAD:refs/heads/${branch}`);
  ageAll(dir);
  return { dir, head };
}

test('a merged engine clone goes to the trash only with clones "on"; "dry-run" says so and "off" leaves it', () => {
  const { repo, trash } = setup();
  const c = clone(repo, 'eng-9-codex', 'agent/eng-9');
  const prs = { 'agent/eng-9': merged(c.head) };
  const dry = sweepRepo({ repo, prs, trashDir: trash, dirs: [] }).results.find((r) => r.name === 'eng-9-codex');
  assert.equal(dry.would, 'trashed', dry.reason);
  assert.ok(fs.existsSync(c.dir));
  const off = sweepRepo({ repo, prs, trashDir: trash, dirs: [], clones: 'off' }).results.find((r) => r.name === 'eng-9-codex');
  assert.equal(off.rule, 'clones-off');
  const live = sweepRepo({ repo, prs, trashDir: trash, dirs: [], clones: 'on', liveIds: ['ENG-9'] }).results.find((r) => r.name === 'eng-9-codex');
  assert.equal(live.rule, 'live');
  const used = sweepRepo({ repo, prs, trashDir: trash, dirs: [c.dir], clones: 'on' }).results.find((r) => r.name === 'eng-9-codex');
  assert.equal(used.rule, 'process');
  const on = sweepRepo({ repo, prs, trashDir: trash, dirs: [], clones: 'on' }).results.find((r) => r.name === 'eng-9-codex');
  assert.equal(on.action, 'trashed', on.reason);
  assert.ok(!fs.existsSync(c.dir));
  assert.ok(fs.existsSync(path.join(trash, 'eng-9-codex', 'eng-9-codex.txt')), 'moved, never deleted');
});

test('an engine clone with an open PR, local changes or unpushed commits is kept, whatever the mode', () => {
  const { repo, trash } = setup();
  const open = clone(repo, 'open', 'agent/eng-1');
  const dirty = clone(repo, 'dirty', 'agent/eng-2');
  fs.writeFileSync(path.join(dirty.dir, 'wip.txt'), 'x');
  const ahead = clone(repo, 'ahead', 'agent/eng-3');
  commit(ahead.dir, 'more.txt');
  ageAll(ahead.dir);
  const prs = { 'agent/eng-1': { number: 1, state: 'OPEN', headRefOid: open.head }, 'agent/eng-2': merged(dirty.head, 2), 'agent/eng-3': merged(ahead.head, 3) };
  const rules = Object.fromEntries(sweepRepo({ repo, prs, trashDir: trash, dirs: [], clones: 'on' }).results.map((r) => [r.name, r.rule]));
  assert.deepEqual([rules.open, rules.dirty, rules.ahead], ['pr-open', 'dirty', 'unpushed']);
  assert.ok(fs.existsSync(open.dir) && fs.existsSync(dirty.dir) && fs.existsSync(ahead.dir));
});
