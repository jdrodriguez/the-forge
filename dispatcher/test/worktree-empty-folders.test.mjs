// Ignored folders that should not keep a merged worktree: an empty one a visual gate left deep in the tree, and a
// pr-reviews/ dump of a PR's review comments. An empty folder never keeps a checkout, a keep folder name with no slash
// matches at any depth, and a rebuildable name covers pr-reviews. A non-empty ignored folder
// that matches nothing still keeps it. Every case runs against real temp git repos; the kept-notes folder is a temp
// folder too. WORKTREE_TEARDOWN_SRC points at another copy of the module.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.WORKTREE_TEARDOWN_SRC ?? path.join(HERE, '..', 'worktree-teardown.mjs');
const { teardownWorktree, keptFolders, REBUILDABLE_IGNORED } = await import(pathToFileURL(SRC).href);

Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (cwd, file, text = file) => {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
  return git(cwd, 'rev-parse', 'HEAD');
};
const merged = (headRefOid) => ({ number: 1, state: 'MERGED', headRefOid });
const KEEP = ['.claude/notes', '.visual-gate-*'];

// A merged worktree whose .gitignore holds `ignore`, with `dirs` made empty and `files` written after the merge.
function mergedWorktree(name, ignore, { dirs = [], files = [] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-empty-')));
  const origin = path.join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const repo = path.join(root, 'app');
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git(repo, 'checkout', '-q', '-b', 'main');
  commit(repo, 'README.md');
  git(repo, 'push', '-q', 'origin', 'main');
  const wt = path.join(repo, '.claude/worktrees', name);
  git(repo, 'worktree', 'add', '-q', '-b', name, wt, 'origin/main');
  commit(wt, 'packages/app-ui/packages/web/index.ts');
  const head = commit(wt, '.gitignore', ignore.join('\n') + '\n');
  git(wt, 'push', '-q', 'origin', `HEAD:refs/heads/${name}`);
  for (const d of dirs) fs.mkdirSync(path.join(wt, d), { recursive: true });
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(wt, f)), { recursive: true });
    fs.writeFileSync(path.join(wt, f), f);
  }
  return { root, repo, wt, pr: merged(head), kept: path.join(root, 'kept') };
}
const run = (c, opts = {}) => teardownWorktree({ path: c.wt, repo: c.repo, pr: c.pr, dirs: [], keptDir: c.kept, keep: KEEP, ...opts });

test('an empty nested ignored folder does not keep a merged worktree', () => {
  const c = mergedWorktree('nested-empty', ['.visual-gate-*/'], { dirs: ['packages/app-ui/packages/web/.visual-gate-7456'] });
  const r = run(c);
  assert.equal(r.action, 'removed', r.reason);
  assert.ok(!fs.existsSync(c.wt));
  assert.ok(!fs.existsSync(c.kept), 'nothing to copy from an empty folder');
});

test('an ignored folder holding only empty folders is empty; one holding a file or a link is not', () => {
  const nested = mergedWorktree('only-dirs', ['scratch/'], { dirs: ['deep/scratch/a/b', 'deep/scratch/c'] });
  assert.equal(run(nested).action, 'removed');
  const file = mergedWorktree('with-file', ['scratch/'], { files: ['deep/scratch/a/b/plan.md'] });
  const r = run(file);
  assert.equal(r.rule, 'ignored', r.reason);
  assert.ok(r.reason.includes('deep/scratch/'), r.reason);
  const link = mergedWorktree('with-link', ['scratch/'], { dirs: ['deep/scratch/a'] });
  fs.symlinkSync(link.root, path.join(link.wt, 'deep/scratch/a/out'));
  assert.equal(run(link).rule, 'ignored', 'a symlink is content, never followed');
});

test('a non-empty nested .visual-gate-* folder is copied out and does not keep a merged worktree', () => {
  const c = mergedWorktree('nested-gate', ['.visual-gate-*/'], { files: ['packages/app-ui/packages/web/.visual-gate-7456/harness.tsx'] });
  assert.deepEqual(keptFolders(c.wt, KEEP), ['packages/app-ui/packages/web/.visual-gate-7456']);
  assert.deepEqual(keptFolders(c.wt, ['packages/web/.visual-gate-*']), [], 'a slash pattern matches only from the root');
  const r = run(c);
  assert.equal(r.action, 'removed', r.reason);
  const today = new Date().toLocaleDateString('en-CA');
  const copy = path.join(c.kept, 'app', 'nested-gate', today, 'packages/app-ui/packages/web/.visual-gate-7456/harness.tsx');
  assert.equal(fs.readFileSync(copy, 'utf8'), 'packages/app-ui/packages/web/.visual-gate-7456/harness.tsx');
  // The same folder with the old root-only pattern keeps the worktree.
  const old = mergedWorktree('nested-gate-old', ['.visual-gate-*/'], { files: ['packages/app-ui/packages/web/.visual-gate-1/h.tsx'] });
  assert.equal(run(old, { keep: ['.claude/notes', 'packages/web/.visual-gate-*'] }).rule, 'ignored');
});

test('an untracked nested .visual-gate-* folder is found from the untracked listing and copied', () => {
  const c = mergedWorktree('untracked-gate', ['dist/'], { files: ['web/.visual-gate-9/harness.tsx', 'web/.visual-gate-9/sub/shot.png'] });
  assert.deepEqual(keptFolders(c.wt, KEEP), ['web/.visual-gate-9']);
  assert.equal(run(c).action, 'removed');
  // A file beside it still keeps the worktree.
  const beside = mergedWorktree('untracked-beside', ['dist/'], { files: ['web/.visual-gate-9/h.tsx', 'web/notes.md'] });
  assert.equal(run(beside).rule, 'dirty');
});

test('a keep folder inside another keep folder is copied once, with the outer one', () => {
  const c = mergedWorktree('gate-in-gate', ['.visual-gate-*/'], { files: ['a/.visual-gate-1/x.tsx', 'a/.visual-gate-1/b/.visual-gate-2/y.tsx'] });
  assert.deepEqual(keptFolders(c.wt, KEEP), ['a/.visual-gate-1']);
  assert.equal(run(c).action, 'removed');
});

test('a pr-reviews folder does not keep a merged worktree once it is rebuildable', () => {
  const files = ['pr-reviews/pr_4877_review_1.json', 'pr-reviews/pr_4877_review_1.md'];
  const c = mergedWorktree('reviews', ['pr-reviews/'], { files });
  assert.equal(run(c, { rebuildable: [...REBUILDABLE_IGNORED, 'pr-reviews'] }).action, 'removed');
  const without = mergedWorktree('reviews-default', ['pr-reviews/'], { files });
  assert.equal(run(without).rule, 'ignored', 'without the entry it still keeps the worktree');
});

test('a non-empty ignored folder that matches nothing still keeps a merged worktree', () => {
  const c = mergedWorktree('scratch', ['scratch/', '.visual-gate-*/'], { files: ['scratch/plan.md'], dirs: ['web/.visual-gate-1'] });
  const r = run(c);
  assert.equal(r.action, 'kept');
  assert.equal(r.rule, 'ignored', r.reason);
  assert.ok(r.reason.includes('scratch/') && !r.reason.includes('visual-gate'), r.reason);
  assert.ok(fs.existsSync(c.wt));
});

test('an empty ignored folder beside a non-empty one under an untracked parent: git lists each, and only the empty one is dropped', () => {
  const c = mergedWorktree('git-quirk', ['.visual-gate-*/', 'scratch-*/'], {
    dirs: ['a/c/.visual-gate-2'], files: ['a/b/scratch-1/plan.md'] });
  const listed = git(c.wt, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory').split('\n');
  assert.ok(listed.includes('a/c/.visual-gate-2/') && listed.includes('a/b/scratch-1/'), listed.join(' '));
  const r = run(c);
  assert.equal(r.rule, 'ignored', r.reason);
  assert.ok(r.reason.includes('a/b/scratch-1/') && !r.reason.includes('visual-gate'), r.reason);
  // With the non-empty one a keep folder, both go: one copied, one empty.
  const k = mergedWorktree('git-quirk-kept', ['.visual-gate-*/'], { dirs: ['a/c/.visual-gate-2'], files: ['a/b/.visual-gate-1/h.tsx'] });
  assert.deepEqual(keptFolders(k.wt, KEEP), ['a/b/.visual-gate-1']);
  assert.equal(run(k).action, 'removed');
});
