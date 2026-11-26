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
// Four more cases:
//   - a folder in worktreeCleanup.keepFolders (agent notes, .claude/notes) does not keep a checkout: it is copied to
//     <keptFoldersDir>/<repo>/<worktree>/<date>/ and checked there before the checkout goes;
//   - an Agent tool worktree (its folder name matches worktreeCleanup.agentWorktrees.pattern) never gets a PR. It goes
//     when it is clean, every commit is on a branch GitHub still has, and nothing in it changed for idleDays;
//   - a teardown that stopped partway leaves only deletions of tracked files. With the PR merged or closed and HEAD
//     saved, the removal is finished with --force;
//   - a read-only git run that the board or the dispatcher started inside a worktree (worktreeCleanup.scanners) is not
//     a process holding it.
// Two more: a tool's scratch worktree (worktreeCleanup.scratchWorktrees, premerge-check by default) and its
// <name>.lock are never swept, and a pure merge of saved commits is not work GitHub lacks.
// Every action returns { action: 'removed' | 'kept' | 'trashed' | 'gone', reason, rule }, plus atRisk when it holds
// work GitHub lacks and nothing is using it, transient when a later try may succeed (a live process), foreign for a folder
// that is not this repo's, and would when a dry run held back a removal or a move.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
// Folders that may hold an agent's notes: copied out, then the checkout may go. worktreeCleanup.keepFolders replaces it.
export const KEEP_FOLDERS = ['.claude/notes'];
export const KEPT_FOLDERS_DIR = path.join(os.homedir(), '.cache/forge/kept-notes');
// Claude Code's Agent tool names its worktrees agent-<hex>. worktreeCleanup.agentWorktrees overrides any key; remote is
// the remote whose branches count as saved.
export const AGENT_WORKTREES = { pattern: '^agent-[0-9a-f]{8,}$', idleDays: 7, remote: 'origin' };
// A process whose parent's command line holds one of these is the board's or the dispatcher's own scan.
export const SCANNERS = ['/queue-board/', '/dispatcher.mjs'];
// Scratch worktrees a tool keeps in the worktrees folder and reuses, by folder name. premerge-check.mjs keeps one named
// premerge-check, with a premerge-check.lock folder beside it, holding a detached merge of main into a PR head. The
// sweep never removes or trashes one, or its <name>.lock, and never counts it at risk. worktreeCleanup.scratchWorktrees
// replaces this list.
export const SCRATCH_WORKTREES = ['premerge-check'];
const READ_ONLY_GIT = new Set(['status', 'rev-parse', 'rev-list', 'log', 'ls-files', 'merge-base', 'cat-file', 'for-each-ref', 'show-ref', 'diff', 'diff-tree']);
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

// Whether a process is a read-only scan the board or the dispatcher runs (`git --no-optional-locks -C <worktree>
// status`): git with --no-optional-locks, a read-only subcommand, and a parent whose command line holds a scanner.
// Such a run takes no lock and writes nothing, so it never holds a worktree.
export function isScan(argv, parentCmd, scanners = SCANNERS) {
  if (path.basename(argv[0] ?? '') !== 'git' || !argv.includes('--no-optional-locks')) return false;
  let i = 1;
  while (i < argv.length && argv[i].startsWith('-')) i += ['-c', '-C', '--git-dir', '--work-tree', '--namespace'].includes(argv[i]) ? 2 : 1;
  const readOnly = READ_ONLY_GIT.has(argv[i]) || (argv[i] === 'worktree' && argv[i + 1] === 'list');
  return readOnly && (Array.isArray(scanners) ? scanners : SCANNERS).some((s) => s && String(parentCmd ?? '').includes(s));
}

// Every working folder a process of this user holds, real paths, less the read-only scans isScan names. Throws when it
// can't tell, and the caller then removes nothing: an unknown is never read as "unused".
export function processDirs({ scanners = SCANNERS } = {}) {
  if (process.platform === 'linux') {
    const cmd = (pid) => {
      try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
      } catch {
        return [];
      }
    };
    return fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).flatMap((pid) => {
      try {
        const argv = cmd(pid);
        if (argv[0] && path.basename(argv[0]) === 'git') {
          const ppid = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\)\s*/s, '').split(/\s+/)[1];
          if (isScan(argv, cmd(ppid).join(' '), scanners)) return [];
        }
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
    // -ww: a command line is never cut to the terminal's width.
    procs = execFileSync('/bin/ps', ['-ww', '-U', String(os.userInfo().uid), '-o', 'pid=,ppid=,stat=,args='], { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 << 20 })
      .split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)).filter(Boolean).map((m) => [m[0], m[1], m[3], m[4], m[2]]);
    const argsOf = new Map(procs.map((m) => [m[1], m[3]]));
    const pids = procs.filter((m) => !m[2].startsWith('U') && Number(m[1]) !== process.pid && !isScan(m[3].split(/\s+/), argsOf.get(m[4]), scanners)).map((m) => m[1]);
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
function newestMtime(dir, skip = new Set(), cap = MTIME_CAP) {
  let newest = fs.statSync(dir).mtimeMs;
  let seen = 0;
  const stack = [dir];
  while (stack.length && seen < cap) {
    let ents;
    try {
      ents = fs.readdirSync(stack.pop(), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (++seen > cap) break;
      const p = path.join(e.parentPath ?? e.path, e.name);
      try {
        newest = Math.max(newest, fs.lstatSync(p).mtimeMs);
      } catch { /* gone meanwhile */ }
      if (e.isDirectory() && !e.isSymbolicLink() && !skip.has(e.name)) stack.push(p);
    }
  }
  return newest;
}

// A test for paths: a pattern with a slash names a path from the checkout's root (that path, or anything under it); one
// without names any single part of a path.
// rootOnly reads every pattern as a path from the root.
export function pathMatcher(list, { rootOnly = false } = {}) {
  const rx = rootOnly ? [] : list.filter((g) => !g.includes('/')).map(globRx);
  const pathRx = list.filter((g) => rootOnly || g.includes('/')).map((g) => globRx(g.replace(/\/$/, '')));
  return (f) => {
    const parts = f.replace(/\/$/, '').split('/');
    if (parts.some((seg) => rx.some((r) => r.test(seg)))) return true;
    return parts.some((_, i) => pathRx.some((r) => r.test(parts.slice(0, i + 1).join('/'))));
  };
}
// Each keep pattern is a path from the root with a glob only in its last part, and no '..'; any other list means the default.
const keepList = (list) => (Array.isArray(list) && list.every((x) => typeof x === 'string' && x && !x.startsWith('/') && !x.split('/').includes('..')
  && !/[*?]/.test(path.dirname(x.replace(/\/$/, '')))) ? list : KEEP_FOLDERS);
// The entries of `git status --porcelain=v1 -z`, as { xy, path }. -z gives raw paths: no quoting, and a rename's source
// comes as its own entry, which is skipped.
function statusEntries(dir) {
  const out = execFileSync('git', ['--no-optional-locks', '-c', 'core.preloadIndex=false', '-C', dir, 'status', '--porcelain=v1', '-z',
    '--untracked-files=all', '--ignore-submodules=none'], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 << 20 });
  const parts = out.split('\0');
  const entries = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    const xy = parts[i].slice(0, 2);
    entries.push({ xy, path: parts[i].slice(3) });
    if (/[RC]/.test(xy)) i++;
  }
  return entries;
}
// Whether a path is one of folders or inside one.
const inside = (folders) => (f) => folders.some((d) => f.replace(/\/$/, '') === d || f.startsWith(`${d}/`));
const WALK_CAP = 5000; // files read under one collapsed ignored folder before it simply counts as unsafe
// The keep folders a checkout holds with something in them, as paths from its root. A keepFolders pattern is a path from
// the root, with a glob only in its last part (packages/web/.visual-gate-*).
export function keptFolders(dir, keep = KEEP_FOLDERS) {
  const found = [];
  for (const pat of keepList(keep).map((g) => g.replace(/\/$/, ''))) {
    const parent = path.dirname(pat);
    let names = [path.basename(pat)];
    if (/[*?]/.test(names[0])) {
      try {
        names = fs.readdirSync(path.join(dir, parent)).filter((n) => globRx(names[0]).test(n));
      } catch {
        names = [];
      }
    }
    for (const n of names) {
      const rel = parent === '.' ? n : `${parent}/${n}`;
      const st = fs.lstatSync(path.join(dir, rel), { throwIfNoEntry: false });
      if (st?.isDirectory() && fs.readdirSync(path.join(dir, rel)).length) found.push(rel);
    }
  }
  return [...new Set(found)].sort();
}
// The ignored entries in a checkout that may hold the only copy of something: every ignored file or folder not under a
// rebuildable one or a keep folder, less a file identical to the main checkout's file at the same path. git collapses an
// ignored folder to one entry, which counts by its own name; one that holds a keep folder is read file by file instead,
// so the keep folder is left out and everything beside it still counts.
function unsafeIgnored(dir, repo, rebuildable, folders = []) {
  const kept = inside(folders);
  const same = (f) => {
    try {
      // A regular file on both sides, never through a symlink.
      return fs.lstatSync(path.join(dir, f)).isFile() && fs.lstatSync(path.join(repo, f)).isFile()
        && fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(repo, f)));
    } catch {
      return false;
    }
  };
  const listed = git(dir, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory']).split('\n').filter(Boolean);
  // git also lists each parent folder of an ignored entry; a folder that only holds other listed entries is not one.
  const leaves = listed.filter((f) => !(f.endsWith('/') && listed.some((o) => o !== f && o.startsWith(f))));
  const rebuilt = pathMatcher(rebuildableList(rebuildable));
  const unsafe = [];
  for (const f of leaves) {
    if (rebuilt(f) || kept(f) || same(f)) continue;
    if (!(f.endsWith('/') && folders.some((d) => d.startsWith(f)))) {
      unsafe.push(f);
      continue;
    }
    // A collapsed folder holding a keep folder: walk it, leaving the keep folders out.
    const stack = [f.replace(/\/$/, '')];
    let seen = 0;
    while (stack.length) {
      const rel = stack.pop();
      for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const r = `${rel}/${e.name}`;
        if (kept(r) || rebuilt(r)) continue;
        if (++seen > WALK_CAP) {
          unsafe.push(f);
          stack.length = 0;
          break;
        }
        if (e.isDirectory() && !e.isSymbolicLink()) stack.push(r);
        else if (!same(r)) unsafe.push(r);
      }
    }
  }
  return [...new Set(unsafe)];
}
// What a checkout still holds that git or GitHub lacks, or null: changes, an operation in progress, ignored files.
// Untracked or ignored files inside a keep folder don't count (they are copied out first); tracked changes there do. A
// status that is only deletions of tracked files returns rule 'deleted-only': HEAD holds those files, so the caller may
// finish a teardown that stopped partway.
function localWork(dir, repo, rebuildable, keep = KEEP_FOLDERS) {
  const folders = keptFolders(dir, keep);
  const kept = inside(folders);
  const entries = statusEntries(dir).filter((e) => !(e.xy === '??' && kept(e.path)));
  const op = opInProgress(dir);
  if (op) return { rule: 'in-progress', reason: `a ${op.replace(/_HEAD$|-merge$|-apply$/, '').toLowerCase().replace('_', '-')} is in progress` };
  const deletedOnly = entries.length > 0 && entries.every((e) => [' D', 'D '].includes(e.xy));
  if (entries.length && !deletedOnly) {
    return { rule: 'dirty', reason: `${entries.length} uncommitted or untracked path(s), first: ${`${entries[0].xy} ${entries[0].path}`.trim().slice(0, 80)}` };
  }
  const ignored = unsafeIgnored(dir, repo, rebuildable, folders);
  if (ignored.length) return { rule: 'ignored', reason: `ignored files git does not keep (${ignored.slice(0, 3).join(', ')}${ignored.length > 3 ? ', ...' : ''}); save them, then remove it` };
  if (deletedOnly) return { rule: 'deleted-only', deletedOnly: true, reason: `only ${entries.length} deleted tracked file(s), as a teardown that stopped partway leaves` };
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
// The remote-tracking refs of branches the remote still has at a commit we hold: a ref whose remote tip equals ours, or
// whose remote tip descends from ours. A commit reachable from one of these is on GitHub. null when the remote can't be
// read. ls-remote writes nothing, so a dry run may call it.
export function savedRemoteRefs(repo, remote = 'origin') {
  let heads;
  try {
    heads = new Map(git(repo, ['ls-remote', '--heads', remote], 60_000).split('\n').filter(Boolean)
      .map((l) => l.split('\t')).map(([sha, ref]) => [ref.replace(/^refs\/heads\//, ''), sha]));
  } catch {
    return null;
  }
  const local = git(repo, ['for-each-ref', '--format=%(objectname) %(refname)', `refs/remotes/${remote}`]).split('\n').filter(Boolean)
    .map((l) => l.split(' ')).map(([sha, ref]) => ({ sha, ref, name: ref.slice(`refs/remotes/${remote}/`.length) }));
  return local.filter(({ sha, name }) => {
    const there = heads.get(name);
    if (!there) return false;
    return there === sha || (ok(repo, ['cat-file', '-e', `${there}^{commit}`]) && ok(repo, ['merge-base', '--is-ancestor', sha, there]));
  }).map((r) => r.ref);
}
// Commits in HEAD, or anywhere in this worktree's HEAD reflog (a commit left behind on a detached HEAD), that none of refs
// holds. Removing a worktree deletes its reflog, so a commit only the reflog reaches counts as unsaved.
function unsavedCount(dir, refs) {
  // Both the old and the new commit of every entry in logs/HEAD: a pruned entry can leave a commit only as the next
  // entry's old one.
  let logged = [];
  try {
    const text = fs.readFileSync(path.join(git(dir, ['rev-parse', '--absolute-git-dir']), 'logs/HEAD'), 'utf8');
    logged = text.split('\n').flatMap((l) => l.split(' ').slice(0, 2)).filter((h) => /^[0-9a-f]{40,64}$/.test(h) && !/^0+$/.test(h));
  } catch { /* no reflog */ }
  const listed = execFileSync('git', ['--no-optional-locks', '-C', dir, 'rev-list', '--parents', '--stdin', 'HEAD'],
    { encoding: 'utf8', input: [...new Set(logged)].concat(refs.map((r) => `^${r}`)).join('\n'), timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 << 20 });
  return workCount(dir, listed);
}
// Commits only here that hold work, from `rev-list --parents` output: every listed commit except a pure merge. A pure
// merge has two or more parents, none of them listed (so each is on a saved ref), and no change beyond what its parents
// hold (`diff-tree --cc` prints nothing, as for any merge git made without a conflict). premerge-check.mjs makes one when
// it merges main into a PR head; both sides are on GitHub, so removing it loses nothing.
function workCount(dir, listed) {
  const rows = listed.split('\n').filter(Boolean).map((l) => l.split(' '));
  const here = new Set(rows.map(([sha]) => sha));
  return rows.filter(([sha, ...parents]) => !(parents.length > 1 && parents.every((p) => !here.has(p)) && git(dir, ['diff-tree', '--cc', '--no-commit-id', sha]) === '')).length;
}
// Days since anything in a worktree changed: its files (node_modules left out) and its git metadata (HEAD, index, reflog).
function idleDays(dir) {
  let newest = newestMtime(dir, new Set(['node_modules']), 50_000);
  try {
    const gd = git(dir, ['rev-parse', '--absolute-git-dir']);
    for (const f of ['HEAD', 'index', 'logs/HEAD']) newest = Math.max(newest, fs.statSync(path.join(gd, f), { throwIfNoEntry: false })?.mtimeMs ?? 0);
  } catch { /* the folder's own times stand */ }
  return (Date.now() - newest) / 86_400_000;
}
// Folder names the sweep leaves alone: each scratch worktree and its <name>.lock. A list that is not plain names falls
// back to SCRATCH_WORKTREES; an empty list exempts nothing.
const scratchSet = (list) => {
  const names = Array.isArray(list) && list.every((x) => typeof x === 'string' && x && !x.includes('/')) ? list : SCRATCH_WORKTREES;
  return new Set(names.flatMap((n) => [n, `${n}.lock`]));
};
const agentRule = (cfg) => {
  const c = { ...AGENT_WORKTREES, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
  if (cfg === false || c.enabled === false) return null;
  const idleDays = Number.isFinite(c.idleDays) && c.idleDays >= 0 ? c.idleDays : AGENT_WORKTREES.idleDays;
  const remote = typeof c.remote === 'string' && /^[\w.-]+$/.test(c.remote) ? c.remote : AGENT_WORKTREES.remote;
  try {
    return { rx: new RegExp(c.pattern), idleDays, remote };
  } catch {
    return { rx: new RegExp(AGENT_WORKTREES.pattern), idleDays, remote };
  }
};

// One verdict for the worktree at wtPath: remove, keep, orphan (trash it) or gone.
// pr is the newest PR for its branch ({ number, state, headRefOid }) or null; dirs is processDirs(); listed is
// listWorktrees(repo), passed in when the caller already has it. savedRefs is savedRemoteRefs(repo), which the Agent
// tool rule needs; without it an Agent tool worktree with no PR is kept.
export function classifyWorktree(wtPath, { repo, base = 'main', pr = null, dirs, listed = null, fetch = true, rebuildable = REBUILDABLE_IGNORED,
  keep = KEEP_FOLDERS, agent = AGENT_WORKTREES, savedRefs = null } = {}) {
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
    return { verdict: 'orphan', rule: 'orphan', reason: 'a former worktree of this repo that git no longer tracks', keep: keptFolders(wtPath, keep) };
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
  const onlyHere = workCount(wtPath, git(wtPath, ['rev-list', '--parents', 'HEAD', '--not', '--remotes']));
  const openPr = pr?.state === 'OPEN';
  const finished = ['MERGED', 'CLOSED'].includes(pr?.state);
  // git worktree remove deletes ignored files too, and untracked ones a person's config hides from status. Only
  // deletions of tracked files, with the PR finished, is a teardown that stopped partway: HEAD still holds them.
  const work = localWork(wtPath, repo, rebuildable, keep);
  if (work && !(work.deletedOnly && finished)) {
    return { ...meta, verdict: 'keep', atRisk: !openPr, rule: work.deletedOnly ? 'dirty' : work.rule, reason: work.reason };
  }
  const force = Boolean(work?.deletedOnly);
  const kept = keptFolders(wtPath, keep);
  if (!pr) {
    const rule = agentRule(agent);
    if (rule?.rx.test(path.basename(wtPath))) {
      const on = meta.branch ?? 'a detached HEAD';
      if (!savedRefs) return { ...meta, verdict: 'keep', rule: 'agent-unknown', reason: `Agent tool worktree on ${on}; the branches on remote ${rule.remote} could not be read` };
      const unsaved = unsavedCount(wtPath, savedRefs);
      if (unsaved) return { ...meta, verdict: 'keep', atRisk: true, rule: 'agent-unpushed', reason: `Agent tool worktree on ${on}: ${unsaved} commit(s) on no branch GitHub has` };
      const idle = idleDays(wtPath);
      if (idle < rule.idleDays) return { ...meta, verdict: 'keep', rule: 'agent-recent', reason: `Agent tool worktree on ${on}, changed ${idle.toFixed(1)} day(s) ago; it may go after ${rule.idleDays}` };
      return { ...meta, verdict: 'remove', rule: 'agent-idle', unlock, keep: kept,
        reason: `Agent tool worktree on ${on} with no PR, every commit on a branch GitHub has, untouched ${Math.floor(idle)} days` };
    }
    return { ...meta, verdict: 'keep', atRisk: onlyHere > 0, rule: 'no-pr', reason: onlyHere ? `no PR, and ${onlyHere} commit(s) on no remote branch` : 'no PR for its branch' };
  }
  if (openPr) return { ...meta, verdict: 'keep', rule: 'pr-open', reason: `PR #${pr.number} is open` };
  if (!finished) return { ...meta, verdict: 'keep', rule: 'pr-open', reason: `PR #${pr.number} is ${pr.state}` };
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
  return { ...meta, verdict: 'remove', rule: force ? 'finish-teardown' : 'remove', unlock, force, keep: kept,
    reason: `PR #${pr.number} ${pr.state.toLowerCase()}, ${inPrHead ? 'HEAD is in its head' : `HEAD has nothing beyond origin/${base}`}${force ? `; ${work.reason}` : ''}` };
}

// One verdict for a standalone clone in the worktrees folder: trash or keep, under the worktree rules. prs maps a branch to
// its newest PR; liveBranches and liveIds name the tickets still live, whose clones are never touched.
export function classifyClone(dir, { repo, base = 'main', prs = {}, dirs, liveBranches = new Set(), liveIds = [], rebuildable = REBUILDABLE_IGNORED,
  keep = KEEP_FOLDERS } = {}) {
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
  const work = localWork(dir, repo, rebuildable, keep);
  // A clone moves to the trash whole, so deletions of tracked files lose nothing either.
  if (work && !work.deletedOnly) return { verdict: 'keep', branch, atRisk: true, rule: work.rule, reason: work.reason };
  const { inPrHead, onBase } = headSaved(dir, git(dir, ['rev-parse', 'HEAD']), pr, base);
  if (!inPrHead && !onBase) return { verdict: 'keep', branch, atRisk: true, rule: 'unpushed', reason: `HEAD has commits beyond PR #${pr.number}'s head that are not on origin/${base}` };
  return { verdict: 'trash', branch, rule: 'trash', keep: keptFolders(dir, keep), reason: `PR #${pr.number} ${pr.state.toLowerCase()}, nothing in it beyond GitHub` };
}

// Where a path lands once every part of it that exists is resolved: the real path of its nearest existing folder, then
// the rest. A destination is judged by this before anything is made.
function landsAt(p) {
  let head = path.resolve(p);
  const rest = [];
  while (!fs.existsSync(head) && path.dirname(head) !== head) {
    rest.unshift(path.basename(head));
    head = path.dirname(head);
  }
  return path.join(key(head), ...rest);
}
const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// Copies a checkout's keep folders to <root>/<repo name>/<checkout name>/<date>/ (a -2, -3 suffix when that exists) and
// checks every file by its SHA-256. A symlink stays a link only when it points inside its keep folder; one pointing
// outside is copied as its target's content when that is a file, and skipped with a note otherwise. Returns
// { dest, notes }; throws when the destination resolves inside the checkout or a copy does not match.
export function copyKeptFolders(dir, repo, folders, root = KEPT_FOLDERS_DIR, date = new Date().toLocaleDateString('en-CA')) {
  const base = path.join(String(root).replace(/^~(?=\/|$)/, os.homedir()), path.basename(repo), path.basename(dir));
  let dest = path.join(base, date);
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(base, `${date}-${i}`);
  // The copies must land outside the checkout, followed through any symlink on the way: checked before mkdir, and
  // again after, in case a link appeared meanwhile.
  if (within(landsAt(dest), key(dir))) throw new Error(`${dest} resolves inside the checkout`);
  fs.mkdirSync(dest, { recursive: true });
  if (within(key(dest), key(dir))) throw new Error(`${dest} resolves inside the checkout`);
  const notes = [];
  const copyFile = (src, dst, st) => {
    fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL);
    fs.utimesSync(dst, st.atime, st.mtime);
    if (sha256(src) !== sha256(dst)) throw new Error(`the copy of ${path.relative(dir, src)} in ${dst} does not match`);
  };
  for (const rel of folders) {
    const top = key(path.join(dir, rel));
    const walk = (from, to) => {
      fs.mkdirSync(to, { recursive: true });
      for (const e of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, e.name);
        const dst = path.join(to, e.name);
        const shown = path.relative(dir, src);
        const st = fs.lstatSync(src);
        if (st.isDirectory()) walk(src, dst);
        else if (st.isSymbolicLink()) {
          const link = fs.readlinkSync(src);
          if (within(key(path.resolve(path.dirname(src), link)), top)) {
            fs.symlinkSync(link, dst);
            if (fs.readlinkSync(dst) !== link) throw new Error(`the copy of the link ${shown} does not match`);
            continue;
          }
          const target = fs.statSync(src, { throwIfNoEntry: false });
          if (target?.isFile()) {
            copyFile(src, dst, target);
            notes.push(`${shown} pointed outside ${rel}, so its target's content was copied`);
          } else notes.push(`${shown} skipped: a link to ${link}, outside ${rel}`);
        } else if (st.isFile()) copyFile(src, dst, st);
        else notes.push(`${shown} skipped: not a file`);
      }
    };
    walk(path.join(dir, rel), path.join(dest, rel));
  }
  return { dest, notes };
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

// Classifies, then acts: removes, trashes an orphan, or keeps. dryRun acts on nothing and says what it would do. Keep
// folders are copied out before anything goes; a failed copy keeps the checkout. recheck, when given, returns a fresh
// processDirs(): a removal that needs --force, a move to the trash, or an Agent tool removal is judged again with it
// right before it happens, and anything that changed since keeps the checkout.
export function teardownWorktree({ path: wtPath, repo, base = 'main', pr = null, dirs, listed = null, dryRun = false, trashDir = trashDirFor(), deleteBranch = true,
  rebuildable = REBUILDABLE_IGNORED, clones = 'dry-run', prs = {}, liveBranches = new Set(), liveIds = [], keep = KEEP_FOLDERS, keptDir = KEPT_FOLDERS_DIR,
  agent = AGENT_WORKTREES, savedRefs = null, recheck = null }) {
  const judge = (procs, fetch) => {
    const v = classifyWorktree(wtPath, { repo, base, pr, dirs: procs, listed, fetch, rebuildable, keep, agent, savedRefs });
    if (!v.clone) return v;
    if (!CLONE_MODES.includes(clones) || clones === 'off') return { ...v, clonesOff: true };
    return { ...classifyClone(wtPath, { repo, base, prs, dirs: procs, liveBranches, liveIds, rebuildable, keep }), clone: true };
  };
  let c;
  try {
    c = judge(dirs, !dryRun);
    if (c.clonesOff) return { action: 'kept', clone: true, rule: 'clones-off', reason: `${c.reason}; clone cleanup is off` };
  } catch (e) {
    return { action: 'kept', rule: 'error', reason: `could not inspect it (${errText(e)})` };
  }
  const extra = { rule: c.rule, ...(c.atRisk ? { atRisk: true } : {}), ...(c.transient ? { transient: true } : {}), ...(c.foreign ? { foreign: true } : {}),
    ...(c.clone ? { clone: true } : {}), ...(c.branch && c.clone ? { branch: c.branch } : {}) };
  if (c.verdict === 'gone') return { action: 'gone', reason: c.reason, ...extra };
  if (c.verdict === 'keep') return { action: 'kept', reason: c.reason, ...extra };
  const keepNote = c.keep?.length ? `copy ${c.keep.join(', ')} to ${path.join(String(keptDir), path.basename(repo), path.basename(wtPath))}/<date>, then ` : '';
  // Held back (a dry run, or a clone without clones "on"): nothing is copied either.
  const held = dryRun || (c.clone && clones !== 'on');
  const forced = c.verdict === 'remove' && (c.force || c.keep?.length);
  // git worktree remove refuses a worktree with submodules unless forced, and a submodule's own ignored files are never
  // read here, so a forced removal leaves one alone.
  if (forced && (fs.existsSync(path.join(wtPath, '.gitmodules')) || ok(wtPath, ['cat-file', '-e', 'HEAD:.gitmodules']))) {
    return { action: 'kept', reason: `it has submodules, which a forced removal would delete unread (${c.reason})`, ...extra, rule: 'submodules' };
  }
  // The copies must outlive the checkout.
  if (c.keep?.length && within(key(String(keptDir).replace(/^~(?=\/|$)/, os.homedir())), key(wtPath))) {
    return { action: 'kept', reason: `keptFoldersDir ${keptDir} is inside the checkout, so its copies would go with it`, ...extra, rule: 'keep-copy' };
  }
  let copied = '';
  if (!held && c.keep?.length) {
    try {
      const { dest, notes } = copyKeptFolders(wtPath, repo, c.keep, keptDir);
      copied = `; ${c.keep.join(', ')} copied to ${dest}${notes.length ? ` (${notes.slice(0, 3).join('; ')}${notes.length > 3 ? '; ...' : ''})` : ''}`;
    } catch (e) {
      return { action: 'kept', reason: `copying ${c.keep.join(', ')} out failed (${errText(e)})`, ...extra, rule: 'keep-copy' };
    }
  }
  // Judged again right before the change: a process that came in, or a file written, during the network reads or the copy.
  const changed = () => {
    if (held || !recheck || !(forced || c.verdict !== 'remove' || c.rule === 'agent-idle')) return null;
    try {
      const again = judge(recheck(), false);
      return again.verdict === c.verdict && again.rule === c.rule ? null : `${again.reason}${copied}`;
    } catch (e) {
      return `could not judge it again (${errText(e)})${copied}`;
    }
  };
  const moved = changed();
  if (moved) return { action: 'kept', transient: true, reason: `it changed since it was judged: ${moved}`, ...extra, rule: 'changed' };
  if (c.verdict === 'orphan' || c.verdict === 'trash') {
    if (held) return { action: 'kept', would: 'trashed', reason: `dry run: would ${keepNote}move to ${trashDir} (${c.reason})`, ...extra };
    try {
      return { action: 'trashed', reason: `${c.reason}; moved to ${moveToTrash(wtPath, trashDir)}${copied}`, ...extra };
    } catch (e) {
      return { action: 'kept', reason: `the move to the trash failed (${errText(e)})`, ...extra };
    }
  }
  if (dryRun) return { action: 'kept', would: 'removed', reason: `dry run: would ${keepNote}remove (${c.reason})`, ...extra };
  try {
    const main = path.dirname(path.resolve(wtPath, git(wtPath, ['rev-parse', '--git-common-dir'])));
    const mutate = (args) => execFileSync('git', ['-C', main, ...args], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (c.unlock) mutate(['worktree', 'unlock', wtPath]);
    // --force only when what blocks a plain remove was checked above: deletions HEAD holds, keep folders copied out.
    mutate(['worktree', 'remove', ...(forced ? ['--force'] : []), wtPath]);
    c.main = main;
  } catch (e) {
    return { action: 'kept', rule: 'error', reason: `git worktree remove refused (${errText(e)})${copied}` };
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
  return { action: 'removed', rule: c.rule, reason: `${c.reason}${c.unlock ? ', dead-pid lock lifted' : ''}${branchNote}${copied}` };
}

// Tickets whose PR GitHub shows MERGED or CLOSED, from a list of { id, branch, prNumber, since } and the repo's PRs
// ({ number, state, headRefName, title, createdAt, isCrossRepository }). A ticket's PR is its prNumber, else the newest
// PR from its branch, else the newest merged PR whose title names it (a bundle's PR names every ticket in it). A PR from
// a fork never counts, since anyone can open one with any branch name or title. With since (when the ticket was
// claimed), a branch or title match counts only for a PR opened at or after it: a ticket built again reuses its branch
// name, and an earlier attempt's merged PR is not this build's. Each comes back with that pr and by: 'number', 'branch'
// or 'title'. A title is free text, so a caller treats a title match as weaker than the other two.
export function finishedOnGitHub(tickets, prList) {
  const newest = (xs) => [...xs].sort((a, b) => b.number - a.number)[0];
  const own = prList.filter((p) => !p.isCrossRepository);
  return tickets.flatMap((t) => {
    const idRx = new RegExp(`(^|[^A-Za-z0-9])${t.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9])`, 'i');
    const since = t.since ? Date.parse(t.since) : null;
    const fresh = (p) => since === null || Number.isNaN(since) || (p.createdAt && Date.parse(p.createdAt) >= since);
    const byNumber = t.prNumber && own.find((p) => p.number === t.prNumber);
    const byBranch = !byNumber && t.branch && newest(own.filter((p) => p.headRefName === t.branch && fresh(p)));
    const byTitle = !byNumber && !byBranch && newest(own.filter((p) => p.state === 'MERGED' && idRx.test(p.title ?? '') && fresh(p)));
    const pr = byNumber || byBranch || byTitle;
    const by = byNumber ? 'number' : byBranch ? 'branch' : 'title';
    return pr && ['MERGED', 'CLOSED'].includes(pr.state) ? [{ ...t, pr, by }] : [];
  });
}

// The sweep over one repo: every linked worktree (a temporary one outside the repo, as a duplicate-code check or a
// session scratchpad makes, is left out) and every orphan folder in <repo>/<worktreesDir>. prs maps a branch to its
// newest PR (matched by local branch name, else by head commit); a branch in liveBranches, or one naming a ticket in
// liveIds, is never touched.
export function sweepRepo({ repo, base = 'main', worktreesDir = '.claude/worktrees', prs = {}, liveBranches = new Set(), liveIds = [], dryRun = false,
  trashDir = trashDirFor(), fetch = true, dirs = null, rebuildable = REBUILDABLE_IGNORED, clones = 'dry-run', keep = KEEP_FOLDERS, keptDir = KEPT_FOLDERS_DIR,
  agent = AGENT_WORKTREES, scanners = SCANNERS, scratch = SCRATCH_WORKTREES }) {
  // A given dirs (a test's) is reused for the re-check; otherwise the processes are read again.
  const recheck = dirs ? () => dirs : () => processDirs({ scanners });
  try {
    dirs ??= processDirs({ scanners });
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
  // The branches the remote has, read once and only when an Agent tool worktree needs them. A repo with no remote of that
  // name turns the rule off, and the sweep says so in notices.
  const rule = agentRule(agent);
  const notices = [];
  let remoteThere = true;
  if (rule) {
    try {
      remoteThere = git(repo, ['remote']).split('\n').includes(rule.remote);
    } catch {
      remoteThere = false;
    }
    if (!remoteThere) notices.push(`the Agent tool worktree rule is off: this repo has no remote named ${rule.remote} (worktreeCleanup.agentWorktrees.remote)`);
  }
  let saved;
  const savedRefs = () => (saved === undefined ? (saved = remoteThere ? savedRemoteRefs(repo, rule.remote) : null) : saved);
  const scratchNames = scratchSet(scratch);
  const scratchRow = (name) => ({ action: 'kept', rule: 'scratch',
    reason: `a tool's scratch ${name.endsWith('.lock') ? 'lock' : 'worktree'} (worktreeCleanup.scratchWorktrees); never swept` });
  for (const w of listed) {
    // Only worktrees in the worktrees folder: one a person made elsewhere is theirs.
    if (!within(key(w.path), folderReal) || key(w.path) === folderReal) continue;
    const row = { path: w.path, name: path.basename(w.path), branch: w.branch, head: w.head };
    if (scratchNames.has(row.name)) {
      results.push({ ...row, ...scratchRow(row.name) });
      continue;
    }
    const liveId = w.branch && ids.find((id) => w.branch.toUpperCase().includes(id));
    if (w.branch && (liveBranches.has(w.branch) || liveId)) {
      results.push({ ...row, action: 'kept', rule: 'live', reason: `its ticket${liveId ? ` ${liveId}` : ''} is live` });
      continue;
    }
    const pr = (w.branch && prs[w.branch]) || (w.head && byHead.get(w.head)) || null;
    const agentRefs = !pr && rule?.rx.test(row.name) ? savedRefs() : null;
    results.push({ ...row, ...teardownWorktree({ path: w.path, repo, base, pr, dirs, listed, dryRun, trashDir, rebuildable, keep, keptDir, agent, savedRefs: agentRefs, recheck }) });
  }
  const tracked = new Set(listed.map((w) => key(w.path)));
  let folders = [];
  try {
    folders = fs.readdirSync(folder, { withFileTypes: true }).filter((d) => d.isDirectory() && !NOT_WORKTREES(d.name)).map((d) => path.join(folder, d.name));
  } catch { /* no worktrees folder */ }
  for (const f of folders) {
    if (tracked.has(key(f))) continue;
    if (scratchNames.has(path.basename(f))) {
      results.push({ path: f, name: path.basename(f), branch: null, ...scratchRow(path.basename(f)) });
      continue;
    }
    results.push({ path: f, name: path.basename(f), branch: null,
      ...teardownWorktree({ path: f, repo, base, dirs, listed, dryRun, trashDir, rebuildable, clones, prs, liveBranches, liveIds, keep, keptDir, agent, recheck }) });
  }
  return { results, notices };
}
