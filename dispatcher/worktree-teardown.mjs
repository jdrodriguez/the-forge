// worktree-teardown.mjs: decides whether a git worktree, or an engine's standalone clone, can go, and removes it only
// when nothing in it can be lost. The dispatcher calls it when a ticket's PR merges or closes, and every
// worktreeCleanup.sweepHours over the worktrees folder of every repo it builds (dispatcher.mjs teardownFinished and
// worktreeSweep). A worktree is removed only when all hold:
//   - `git status --porcelain --untracked-files=all` is empty, and no rebase, merge, cherry-pick or revert is in progress;
//   - every ignored file sits under a rebuildable folder (worktreeCleanup.rebuildableIgnored) or is an unchanged copy
//     of the main checkout's file at the same path (queue worktrees get a copy of the root .env);
//   - its PR is MERGED or CLOSED;
//   - HEAD is that PR's head commit or an ancestor of it (a squash merge leaves the branch's commits off the base
//     branch, but the PR head on GitHub keeps them), or HEAD has no commits beyond origin/<base>;
//   - no live process holds it: a lock whose pid is alive, or a process whose working folder is inside.
// Only worktrees inside the repo's worktrees folder are touched, compared by real, case-folded path; one a person made
// elsewhere is never removed. Removal is `git worktree remove` without --force; a lock is lifted first only when its
// pid is dead, and a lock with no pid in its reason keeps the worktree. In the worktrees folder, a folder that was a
// worktree of this repo (its .git file points at worktree metadata of this repo that is gone) is moved to the trash,
// never deleted; any other folder that is not a worktree is reported and left alone. A standalone clone (how
// ext-worker.sh runs Codex and Grok) goes to the trash only under the same rules as a worktree, with worktreeCleanup.clones
// "on"; "dry-run" (the default) only says what it would do.
// Every action returns { action: 'removed' | 'kept' | 'trashed' | 'gone', reason, rule }, plus atRisk when it holds
// work GitHub lacks and nothing is using it, transient when a later try may succeed (a live process), foreign for a folder
// that is not this repo's, and would when a dry run held back a removal or a move.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Tool caches a run inside a worktree leaves one level up (node_modules/.vite), not worktrees: never counted or trashed.
const NOT_WORKTREES = (name) => name === 'node_modules' || name.startsWith('.');
const ORPHAN_QUIET_MS = 60 * 60_000; // a folder touched within the hour may be a worktree being made right now
const MTIME_CAP = 2000; // entries read when looking for the newest change inside a folder
// Ignored files and folders that a build or an install makes again. Any other ignored file keeps a worktree.
// worktreeCleanup.rebuildableIgnored replaces this list; an empty or invalid one falls back to it.
export const REBUILDABLE_IGNORED = ['node_modules', 'dist', 'build', 'out', '.turbo', '.next', '.nuxt', '.svelte-kit', '.output', 'coverage',
  '.nyc_output', '.cache', '.parcel-cache', '.vite', '.eslintcache', '*.tsbuildinfo', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.venv', 'target', '.gradle', '.DS_Store'];
const rebuildableList = (list) => (Array.isArray(list) && list.length && list.every((x) => typeof x === 'string' && x) ? list : REBUILDABLE_IGNORED);
const globRx = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]')}$`);
// The clone modes worktreeCleanup.clones takes.
export const CLONE_MODES = ['off', 'dry-run', 'on'];
// Read-only git runs take no optional locks, so a worker in the worktree never finds its index locked by us.
const git = (cwd, args, timeout = 120_000) => execFileSync('git', ['--no-optional-locks', '-c', 'core.preloadIndex=false', '-C', cwd, ...args],
  { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 << 20 }).trim();
const ok = (cwd, args) => {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
};
const errText = (e) => String(e?.stderr || e?.message || e).trim().split('\n').at(-1).slice(0, 200);
// Real paths, case-folded on macOS, whose default file system ignores case and where realpath keeps the case it was
// given: ~/Dev and ~/dev are one folder.
export const key = (p) => {
  let r;
  try {
    r = fs.realpathSync.native(p);
  } catch {
    r = path.resolve(p);
  }
  return process.platform === 'darwin' ? r.toLowerCase() : r;
};
const within = (p, dir) => p === dir || p.startsWith(`${dir}/`);
// A rebase, merge, cherry-pick or revert in progress holds work that status does not show.
function opInProgress(dir) {
  for (const name of ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
    try {
      if (fs.existsSync(path.resolve(dir, git(dir, ['rev-parse', '--git-path', name])))) return name;
    } catch { /* unreadable reads as none */ }
  }
  return null;
}

// The repo's linked worktrees (the main checkout is left out), from `git worktree list --porcelain`.
export function listWorktrees(repo) {
  return git(repo, ['worktree', 'list', '--porcelain']).split(/\n\n+/).slice(1).flatMap((block) => {
    const dir = block.match(/^worktree (.+)$/m)?.[1];
    if (!dir) return [];
    const lock = block.match(/^locked(?: (.*))?$/m);
    return [{
      path: dir,
      head: block.match(/^HEAD (\w+)$/m)?.[1] ?? null,
      branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null,
      locked: Boolean(lock),
      lockReason: lock?.[1] ?? '',
      prunable: /^prunable\b/m.test(block),
    }];
  });
}

// Claude Code locks an agent's worktree with a reason naming the pid ("... (pid 12345)").
export const lockPid = (reason) => {
  const m = /\bpid[\s:=]*(\d+)/i.exec(reason ?? '');
  return m ? Number(m[1]) : null;
};
export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // alive, owned by someone else
  }
}

// Every working folder a process of this user holds, real paths. Throws when it can't tell, and the caller then
// removes nothing: an unknown is never read as "unused".
export function processDirs() {
  if (process.platform === 'linux') {
    return fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).flatMap((pid) => {
      try {
        return [fs.readlinkSync(`/proc/${pid}/cwd`)];
      } catch {
        return [];
      }
    });
  }
  // lsof hangs on a process stuck in an uninterruptible wait, so it asks only about the others. A process that enters
  // such a wait after the ps read can still hold lsof, so a timed-out read is tried once more with a fresh list. A
  // stuck process's working folder can't be read, so the absolute paths in its command line stand in for it.
  let procs;
  let out = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 2 && out === null; attempt++) {
    procs = execFileSync('/bin/ps', ['-U', String(os.userInfo().uid), '-o', 'pid=,stat=,args='], { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 << 20 })
      .split('\n').map((l) => l.trim().match(/^(\d+)\s+(\S+)\s*(.*)$/)).filter(Boolean);
    const pids = procs.filter((m) => !m[2].startsWith('U') && Number(m[1]) !== process.pid).map((m) => m[1]);
    if (!pids.length) out = '';
    else {
      try {
        out = execFileSync('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fn'], { encoding: 'utf8', timeout: 20_000, maxBuffer: 32 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        // lsof exits 1 when a process vanished while it looked; what it printed is still good. A killed run's partial
        // output is not.
        if (e.stdout && !e.signal && e.code !== 'ETIMEDOUT') out = e.stdout;
        else lastErr = e;
      }
    }
  }
  if (out === null) throw new Error(`lsof: ${errText(lastErr)}`);
  const stuck = procs.filter((m) => m[2].startsWith('U'));
  const stuckPaths = stuck.flatMap((m) => m[3].split(/\s+/).filter((a) => a.startsWith('/') && a.length > 1));
  return [...out.split('\n').filter((l) => l.startsWith('n')).map((l) => l.slice(1)), ...stuckPaths];
}

// The folders in <repo>/<worktreesDir>.
export function countWorktrees(repo, worktreesDir = '.claude/worktrees') {
  try {
    return fs.readdirSync(path.join(repo, worktreesDir), { withFileTypes: true }).filter((d) => d.isDirectory() && !NOT_WORKTREES(d.name)).length;
  } catch {
    return 0;
  }
}

// Where orphans go: a dated folder under trashRoot, or under the system trash (~/.Trash on macOS, the freedesktop
// trash on Linux).
export function trashDirFor(trashRoot = null, date = new Date().toLocaleDateString('en-CA')) {
  const name = `agent-queue-worktrees-orphaned-${date}`;
  if (trashRoot) return path.join(trashRoot, name);
  return process.platform === 'darwin' ? path.join(os.homedir(), '.Trash', name) : path.join(os.homedir(), '.local/share/Trash/files', name);
}

// The newest modification time in a folder, reading at most MTIME_CAP entries, so a folder whose top is old but whose
// files changed recently reads as recent.
function newestMtime(dir) {
  let newest = fs.statSync(dir).mtimeMs;
  let seen = 0;
  const stack = [dir];
  while (stack.length && seen < MTIME_CAP) {
    let ents;
    try {
      ents = fs.readdirSync(stack.pop(), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (++seen > MTIME_CAP) break;
      const p = path.join(e.parentPath ?? e.path, e.name);
      try {
        newest = Math.max(newest, fs.lstatSync(p).mtimeMs);
      } catch { /* gone meanwhile */ }
      if (e.isDirectory() && !e.isSymbolicLink()) stack.push(p);
    }
  }
  return newest;
}

// The ignored entries in a checkout that may hold the only copy of something: every ignored file or folder not under a
// rebuildable one, less a file identical to the main checkout's file at the same path. git collapses an ignored folder
// to one entry, which counts by its own name.
function unsafeIgnored(dir, repo, rebuildable) {
  const rx = rebuildableList(rebuildable).filter((g) => !g.includes('/')).map(globRx);
  const same = (f) => {
    try {
      return fs.statSync(path.join(dir, f)).isFile() && fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(repo, f)));
    } catch {
      return false;
    }
  };
  const listed = git(dir, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory']).split('\n').filter(Boolean);
  // git also lists each parent folder of an ignored entry; a folder that only holds other listed entries is not one.
  const leaves = listed.filter((f) => !(f.endsWith('/') && listed.some((o) => o !== f && o.startsWith(f))));
  // A pattern with a slash names a path from the checkout's root (that path, or anything under it); one without names any
  // single part of a path.
  const pathRx = rebuildableList(rebuildable).filter((g) => g.includes('/')).map((g) => globRx(g.replace(/\/$/, '')));
  const rebuilt = (f) => {
    const parts = f.replace(/\/$/, '').split('/');
    if (parts.some((seg) => rx.some((r) => r.test(seg)))) return true;
    return parts.some((_, i) => pathRx.some((r) => r.test(parts.slice(0, i + 1).join('/'))));
  };
  return leaves.filter((f) => !rebuilt(f) && !same(f));
}
// What a checkout still holds that git or GitHub lacks, or null: changes, an operation in progress, ignored files.
function localWork(dir, repo, rebuildable) {
  const status = git(dir, ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none']);
  if (status) {
    const n = status.split('\n').length;
    return { rule: 'dirty', reason: `${n} uncommitted or untracked path(s), first: ${status.split('\n')[0].trim().slice(0, 80)}` };
  }
  const op = opInProgress(dir);
  if (op) return { rule: 'in-progress', reason: `a ${op.replace(/_HEAD$|-merge$|-apply$/, '').toLowerCase().replace('_', '-')} is in progress` };
  const ignored = unsafeIgnored(dir, repo, rebuildable);
  if (ignored.length) return { rule: 'ignored', reason: `ignored files git does not keep (${ignored.slice(0, 3).join(', ')}${ignored.length > 3 ? ', ...' : ''}); save them, then remove it` };
  return null;
}
// Whether HEAD's work is on GitHub: in the PR's head, or nothing beyond origin/<base>.
function headSaved(dir, head, pr, base) {
  const prHead = pr?.headRefOid;
  const inPrHead = Boolean(prHead) && (head === prHead || ok(dir, ['merge-base', '--is-ancestor', head, prHead]));
  const baseRef = `refs/remotes/origin/${base}`;
  const onBase = ok(dir, ['rev-parse', '--verify', '-q', baseRef]) && git(dir, ['rev-list', '--count', `${baseRef}..HEAD`]) === '0';
  return { inPrHead, onBase };
}
// Whether a clone is one ext-worker.sh made from this repo: its objects/info/alternates names this repo's objects folder.
function engineClone(dir, repo) {
  try {
    const objects = key(path.join(repo, '.git/objects'));
    return fs.readFileSync(path.join(dir, '.git/objects/info/alternates'), 'utf8').split('\n').some((l) => l.trim() && key(l.trim()) === objects);
  } catch {
    return false;
  }
}
// Whether a folder in the worktrees folder was a worktree of this repo whose metadata is gone: its .git file names a
// gitdir under this repo's worktrees metadata that no longer exists.
function formerWorktree(dir, repo) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, '.git'), 'utf8');
  } catch {
    return false;
  }
  const gitdir = text.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
  if (!gitdir) return false;
  let common;
  try {
    common = path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir']));
  } catch {
    return false;
  }
  return within(key(path.resolve(dir, gitdir)), key(path.join(common, 'worktrees'))) && !fs.existsSync(path.resolve(dir, gitdir));
}

// One verdict for the worktree at wtPath: remove, keep, orphan (trash it) or gone.
// pr is the newest PR for its branch ({ number, state, headRefOid }) or null; dirs is processDirs(); listed is
// listWorktrees(repo), passed in when the caller already has it.
export function classifyWorktree(wtPath, { repo, base = 'main', pr = null, dirs, listed = null, fetch = true, rebuildable = REBUILDABLE_IGNORED } = {}) {
  if (!fs.existsSync(wtPath)) return { verdict: 'gone', rule: 'gone', reason: 'the folder is already gone' };
  const here = key(wtPath);
  const entries = listed ?? listWorktrees(repo);
  const entry = entries.find((w) => key(w.path) === here);
  // lsof and /proc report real paths, compared the same way.
  const used = dirs.some((d) => within(key(d), here));
  if (!entry) {
    if (fs.lstatSync(path.join(wtPath, '.git'), { throwIfNoEntry: false })?.isDirectory()) {
      // An engine clone borrows this repo's objects through objects/info/alternates (ext-worker-clone.sh); any other
      // clone is not this repo's to touch.
      if (!engineClone(wtPath, repo)) return { verdict: 'keep', foreign: true, rule: 'foreign', reason: "a clone that does not borrow this repo's objects; left alone" };
      return { verdict: 'keep', clone: true, rule: 'clone', reason: 'a standalone clone (how ext-worker.sh runs Codex and Grok), not a worktree' };
    }
    if (entries.some((w) => within(key(w.path), here) && key(w.path) !== here)) return { verdict: 'keep', rule: 'contains-worktree', reason: 'a tracked worktree sits inside it' };
    if (used) return { verdict: 'keep', transient: true, rule: 'process', reason: 'not a tracked worktree, but a process has its working folder inside' };
    if (!formerWorktree(wtPath, repo)) return { verdict: 'keep', foreign: true, rule: 'foreign', reason: 'not a worktree of this repo (no .git file pointing at its worktree metadata); left alone' };
    if (Date.now() - newestMtime(wtPath) < ORPHAN_QUIET_MS) return { verdict: 'keep', transient: true, rule: 'recent', reason: 'not a tracked worktree, but changed within the hour' };
    return { verdict: 'orphan', rule: 'orphan', reason: 'a former worktree of this repo that git no longer tracks' };
  }
  const meta = { branch: entry.branch, head: entry.head };
  let unlock = false;
  if (entry.locked) {
    const pid = lockPid(entry.lockReason);
    if (!pid) return { ...meta, verdict: 'keep', rule: 'locked', reason: `locked (${entry.lockReason || 'no reason given'}) with no pid to check` };
    if (pidAlive(pid)) return { ...meta, verdict: 'keep', transient: true, rule: 'locked', reason: `locked by live pid ${pid}` };
    unlock = true;
  }
  if (used) return { ...meta, verdict: 'keep', transient: true, rule: 'process', reason: 'a process has its working folder inside' };
  const head = git(wtPath, ['rev-parse', 'HEAD']);
  const onlyHere = Number(git(wtPath, ['rev-list', '--count', 'HEAD', '--not', '--remotes']));
  const openPr = pr?.state === 'OPEN';
  // git worktree remove deletes ignored files too, and untracked ones a person's config hides from status.
  const work = localWork(wtPath, repo, rebuildable);
  if (work) return { ...meta, verdict: 'keep', atRisk: !openPr, rule: work.rule, reason: work.reason };
  if (!pr) return { ...meta, verdict: 'keep', atRisk: onlyHere > 0, rule: 'no-pr', reason: onlyHere ? `no PR, and ${onlyHere} commit(s) on no remote branch` : 'no PR for its branch' };
  if (openPr) return { ...meta, verdict: 'keep', rule: 'pr-open', reason: `PR #${pr.number} is open` };
  if (!['MERGED', 'CLOSED'].includes(pr.state)) return { ...meta, verdict: 'keep', rule: 'pr-open', reason: `PR #${pr.number} is ${pr.state}` };
  const prHead = pr.headRefOid;
  // The PR head is on GitHub as refs/pull/<n>/head even after the branch is deleted; fetch it when it isn't here
  // (never on a dry run, which writes nothing, not even FETCH_HEAD).
  if (fetch && prHead && head !== prHead && !ok(wtPath, ['cat-file', '-e', `${prHead}^{commit}`]) && pr.number) {
    try {
      execFileSync('git', ['-C', wtPath, 'fetch', '-q', 'origin', `refs/pull/${pr.number}/head`], { timeout: 120_000, stdio: 'ignore' });
    } catch { /* judged on what is here */ }
  }
  const { inPrHead, onBase } = headSaved(wtPath, head, pr, base);
  if (!inPrHead && !onBase) {
    const extra = prHead && ok(wtPath, ['cat-file', '-e', `${prHead}^{commit}`]) ? git(wtPath, ['rev-list', '--count', `${prHead}..HEAD`]) : '?';
    return { ...meta, verdict: 'keep', atRisk: true, rule: 'unpushed', reason: `${extra} commit(s) past PR #${pr.number}'s head that are not on origin/${base}` };
  }
  return { ...meta, verdict: 'remove', rule: 'remove', unlock, reason: `PR #${pr.number} ${pr.state.toLowerCase()}, ${inPrHead ? 'HEAD is in its head' : `HEAD has nothing beyond origin/${base}`}` };
}

// One verdict for a standalone clone in the worktrees folder: trash or keep, under the worktree rules. prs maps a branch to
// its newest PR; liveBranches and liveIds name the tickets still live, whose clones are never touched.
export function classifyClone(dir, { repo, base = 'main', prs = {}, dirs, liveBranches = new Set(), liveIds = [], rebuildable = REBUILDABLE_IGNORED } = {}) {
  if (dirs.some((d) => within(key(d), key(dir)))) return { verdict: 'keep', transient: true, rule: 'process', reason: 'a process has its working folder inside' };
  let branch;
  try {
    branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch (e) {
    return { verdict: 'keep', rule: 'error', reason: `could not read its branch (${errText(e)})` };
  }
  const liveId = liveIds.map((x) => x.toUpperCase()).find((x) => `${branch} ${path.basename(dir)}`.toUpperCase().includes(x));
  if (liveBranches.has(branch) || liveId) return { verdict: 'keep', branch, rule: 'live', reason: `its ticket${liveId ? ` ${liveId}` : ''} is live` };
  const pr = prs[branch] ?? null;
  if (!pr) return { verdict: 'keep', branch, rule: 'no-pr', reason: `no PR for ${branch}` };
  if (!['MERGED', 'CLOSED'].includes(pr.state)) return { verdict: 'keep', branch, rule: 'pr-open', reason: `PR #${pr.number} is ${pr.state.toLowerCase()}` };
  const work = localWork(dir, repo, rebuildable);
  if (work) return { verdict: 'keep', branch, atRisk: true, rule: work.rule, reason: work.reason };
  const { inPrHead, onBase } = headSaved(dir, git(dir, ['rev-parse', 'HEAD']), pr, base);
  if (!inPrHead && !onBase) return { verdict: 'keep', branch, atRisk: true, rule: 'unpushed', reason: `HEAD has commits beyond PR #${pr.number}'s head that are not on origin/${base}` };
  return { verdict: 'trash', branch, rule: 'trash', reason: `PR #${pr.number} ${pr.state.toLowerCase()}, nothing in it beyond GitHub` };
}

// Moves a folder into the dated trash folder. Across volumes a rename fails (EXDEV), so it copies, then removes.
export function moveToTrash(wtPath, trashDir, rename = fs.renameSync) {
  fs.mkdirSync(trashDir, { recursive: true });
  // A freedesktop trash lists an item only with its .trashinfo. The dated folder's Path is where it restores to: beside
  // the orphans it holds.
  if (process.platform === 'linux' && trashDir.includes('/Trash/files/')) {
    const info = path.join(path.dirname(path.dirname(trashDir)), 'info', `${path.basename(trashDir)}.trashinfo`);
    if (!fs.existsSync(info)) {
      fs.mkdirSync(path.dirname(info), { recursive: true });
      fs.writeFileSync(info, `[Trash Info]\nPath=${encodeURI(path.join(path.dirname(wtPath), path.basename(trashDir)))}\nDeletionDate=${new Date().toISOString().slice(0, 19)}\n`);
    }
  }
  let to = path.join(trashDir, path.basename(wtPath));
  for (let i = 2; fs.existsSync(to); i++) to = path.join(trashDir, `${path.basename(wtPath)}-${i}`);
  try {
    rename(wtPath, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.cpSync(wtPath, to, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
    fs.rmSync(wtPath, { recursive: true });
  }
  return to;
}

// Classifies, then acts: removes, trashes an orphan, or keeps. dryRun acts on nothing and says what it would do.
export function teardownWorktree({ path: wtPath, repo, base = 'main', pr = null, dirs, listed = null, dryRun = false, trashDir = trashDirFor(), deleteBranch = true,
  rebuildable = REBUILDABLE_IGNORED, clones = 'dry-run', prs = {}, liveBranches = new Set(), liveIds = [] }) {
  let c;
  try {
    c = classifyWorktree(wtPath, { repo, base, pr, dirs, listed, fetch: !dryRun, rebuildable });
    if (c.clone) {
      if (!CLONE_MODES.includes(clones) || clones === 'off') return { action: 'kept', clone: true, rule: 'clones-off', reason: `${c.reason}; clone cleanup is off` };
      c = { ...classifyClone(wtPath, { repo, base, prs, dirs, liveBranches, liveIds, rebuildable }), clone: true };
    }
  } catch (e) {
    return { action: 'kept', rule: 'error', reason: `could not inspect it (${errText(e)})` };
  }
  const extra = { rule: c.rule, ...(c.atRisk ? { atRisk: true } : {}), ...(c.transient ? { transient: true } : {}), ...(c.foreign ? { foreign: true } : {}),
    ...(c.clone ? { clone: true } : {}), ...(c.branch && c.clone ? { branch: c.branch } : {}) };
  if (c.verdict === 'gone') return { action: 'gone', reason: c.reason, ...extra };
  if (c.verdict === 'keep') return { action: 'kept', reason: c.reason, ...extra };
  if (c.verdict === 'orphan' || c.verdict === 'trash') {
    // A clone moves only with clones "on", whatever dryRun says.
    if (dryRun || (c.clone && clones !== 'on')) return { action: 'kept', would: 'trashed', reason: `dry run: would move to ${trashDir} (${c.reason})`, ...extra };
    try {
      return { action: 'trashed', reason: `${c.reason}; moved to ${moveToTrash(wtPath, trashDir)}`, ...extra };
    } catch (e) {
      return { action: 'kept', reason: `the move to the trash failed (${errText(e)})`, ...extra };
    }
  }
  if (dryRun) return { action: 'kept', would: 'removed', reason: `dry run: would remove (${c.reason})`, ...extra };
  try {
    const main = path.dirname(path.resolve(wtPath, git(wtPath, ['rev-parse', '--git-common-dir'])));
    const mutate = (args) => execFileSync('git', ['-C', main, ...args], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (c.unlock) mutate(['worktree', 'unlock', wtPath]);
    mutate(['worktree', 'remove', wtPath]);
    c.main = main;
  } catch (e) {
    return { action: 'kept', rule: 'error', reason: `git worktree remove refused (${errText(e)})` };
  }
  const mutate = (args) => execFileSync('git', ['-C', c.main, ...args], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
  let branchNote = '';
  if (deleteBranch && pr?.state === 'MERGED' && c.branch) {
    try {
      mutate(['branch', '-D', c.branch]);
      branchNote = ', local branch deleted';
    } catch (e) {
      branchNote = `, local branch kept (${errText(e)})`;
    }
  }
  return { action: 'removed', rule: 'remove', reason: `${c.reason}${c.unlock ? ', dead-pid lock lifted' : ''}${branchNote}` };
}

// The sweep over one repo: every linked worktree (a temporary one outside the repo, as a duplicate-code check or a
// session scratchpad makes, is left out) and every orphan folder in <repo>/<worktreesDir>. prs maps a branch to its
// newest PR (matched by local branch name, else by head commit); a branch in liveBranches, or one naming a ticket in
// liveIds, is never touched.
export function sweepRepo({ repo, base = 'main', worktreesDir = '.claude/worktrees', prs = {}, liveBranches = new Set(), liveIds = [], dryRun = false,
  trashDir = trashDirFor(), fetch = true, dirs = null, rebuildable = REBUILDABLE_IGNORED, clones = 'dry-run' }) {
  try {
    dirs ??= processDirs();
  } catch (e) {
    return { error: `could not list process folders (${errText(e)}); nothing touched`, results: [] };
  }
  if (fetch && !dryRun) {
    try {
      execFileSync('git', ['-C', repo, 'fetch', '-q', 'origin', base], { timeout: 180_000, stdio: 'ignore' });
    } catch { /* judged against the origin/<base> already here */ }
  }
  const folder = path.join(repo, worktreesDir);
  const folderReal = key(folder);
  const listed = listWorktrees(repo);
  const results = [];
  const ids = liveIds.map((id) => id.toUpperCase());
  // A worker often pushes HEAD to a branch named unlike its local one, so a PR whose head is this HEAD counts as its PR.
  const byHead = new Map(Object.values(prs).filter((p) => p.headRefOid).map((p) => [p.headRefOid, p]));
  for (const w of listed) {
    // Only worktrees in the worktrees folder: one a person made elsewhere is theirs.
    if (!within(key(w.path), folderReal) || key(w.path) === folderReal) continue;
    const row = { path: w.path, name: path.basename(w.path), branch: w.branch };
    const liveId = w.branch && ids.find((id) => w.branch.toUpperCase().includes(id));
    if (w.branch && (liveBranches.has(w.branch) || liveId)) {
      results.push({ ...row, action: 'kept', rule: 'live', reason: `its ticket${liveId ? ` ${liveId}` : ''} is live` });
      continue;
    }
    const pr = (w.branch && prs[w.branch]) || (w.head && byHead.get(w.head)) || null;
    results.push({ ...row, ...teardownWorktree({ path: w.path, repo, base, pr, dirs, listed, dryRun, trashDir, rebuildable }) });
  }
  const tracked = new Set(listed.map((w) => key(w.path)));
  let folders = [];
  try {
    folders = fs.readdirSync(folder, { withFileTypes: true }).filter((d) => d.isDirectory() && !NOT_WORKTREES(d.name)).map((d) => path.join(folder, d.name));
  } catch { /* no worktrees folder */ }
  for (const f of folders) {
    if (tracked.has(key(f))) continue;
    results.push({ path: f, name: path.basename(f), branch: null,
      ...teardownWorktree({ path: f, repo, base, dirs, listed, dryRun, trashDir, rebuildable, clones, prs, liveBranches, liveIds }) });
  }
  return { results };
}
