// worktree-teardown.mjs: decides whether a git worktree can go, and removes it only when nothing in it can be lost.
// The dispatcher calls it when a ticket's PR merges or closes, and every worktreeCleanup.sweepHours over every worktree
// of the repos it builds (dispatcher.mjs teardownFinished and worktreeSweep). A worktree is removed only when all hold:
//   - git status --porcelain is empty (untracked files count);
//   - its PR is MERGED or CLOSED;
//   - HEAD is that PR's head commit or an ancestor of it (a squash merge leaves the branch's commits off the base
//     branch, but the PR head on GitHub keeps them), or HEAD has no commits beyond origin/<base>;
//   - no live process holds it: a lock whose pid is alive, or a process whose working folder is inside.
// Removal is `git worktree remove` without --force; a lock is lifted first only when its pid is dead. A lock with no
// pid in its reason (git's own "initializing" while `worktree add` runs) keeps the worktree. A folder in the worktrees
// folder that git no longer tracks (an orphan) is moved to the trash folder, never deleted. A folder there with its own
// .git directory is a standalone clone, which is how ext-worker.sh runs Codex and Grok, and is never touched.
// Every action returns { action: 'removed' | 'kept' | 'trashed' | 'gone', reason }, plus atRisk when the worktree holds
// work GitHub lacks and nothing is using it, transient when a later try may succeed (a live process), and would when a
// dry run held back a removal or a move.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEMP = ['/tmp/', '/private/tmp/', '/var/folders/', '/private/var/folders/', `${os.tmpdir()}/`];
// Tool caches a run inside a worktree leaves one level up (node_modules/.vite), not worktrees: never counted or trashed.
const NOT_WORKTREES = (name) => name === 'node_modules' || name.startsWith('.');
const ORPHAN_QUIET_MS = 60 * 60_000; // a folder touched within the hour may be a worktree being made right now
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
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const within = (p, dir) => p === dir || p.startsWith(`${dir}/`);

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

// One verdict for the worktree at wtPath: remove, keep, orphan (trash it) or gone.
// pr is the newest PR for its branch ({ number, state, headRefOid }) or null; dirs is processDirs(); listed is
// listWorktrees(repo), passed in when the caller already has it.
export function classifyWorktree(wtPath, { repo, base = 'main', pr = null, dirs, listed = null, fetch = true } = {}) {
  if (!fs.existsSync(wtPath)) return { verdict: 'gone', reason: 'the folder is already gone' };
  const here = real(wtPath);
  const entries = listed ?? listWorktrees(repo);
  const entry = entries.find((w) => real(w.path) === here);
  // lsof and /proc report real paths, so dirs compare against the real path (macOS temp folders sit under /private).
  const used = dirs.some((d) => within(d, here));
  if (!entry) {
    if (fs.statSync(path.join(wtPath, '.git'), { throwIfNoEntry: false })?.isDirectory()) {
      return { verdict: 'keep', reason: 'a standalone clone (how ext-worker.sh runs Codex and Grok), not a worktree' };
    }
    if (entries.some((w) => within(real(w.path), here) && real(w.path) !== here)) return { verdict: 'keep', reason: 'a tracked worktree sits inside it' };
    if (used) return { verdict: 'keep', transient: true, reason: 'not a tracked worktree, but a process has its working folder inside' };
    if (Date.now() - fs.statSync(wtPath).mtimeMs < ORPHAN_QUIET_MS) return { verdict: 'keep', transient: true, reason: 'not a tracked worktree, but changed within the hour' };
    return { verdict: 'orphan', reason: 'git no longer tracks it as a worktree' };
  }
  const meta = { branch: entry.branch, head: entry.head };
  let unlock = false;
  if (entry.locked) {
    const pid = lockPid(entry.lockReason);
    if (!pid) return { ...meta, verdict: 'keep', reason: `locked (${entry.lockReason || 'no reason given'}) with no pid to check` };
    if (pidAlive(pid)) return { ...meta, verdict: 'keep', transient: true, reason: `locked by live pid ${pid}` };
    unlock = true;
  }
  if (used) return { ...meta, verdict: 'keep', transient: true, reason: 'a process has its working folder inside' };
  const status = git(wtPath, ['status', '--porcelain']);
  const head = git(wtPath, ['rev-parse', 'HEAD']);
  const onlyHere = Number(git(wtPath, ['rev-list', '--count', 'HEAD', '--not', '--remotes']));
  const openPr = pr?.state === 'OPEN';
  if (status) {
    const n = status.split('\n').length;
    return { ...meta, verdict: 'keep', atRisk: !openPr, reason: `${n} uncommitted or untracked path(s), first: ${status.split('\n')[0].trim().slice(0, 80)}` };
  }
  if (!pr) return { ...meta, verdict: 'keep', atRisk: onlyHere > 0, reason: onlyHere ? `no PR, and ${onlyHere} commit(s) on no remote branch` : 'no PR for its branch' };
  if (openPr) return { ...meta, verdict: 'keep', reason: `PR #${pr.number} is open` };
  if (!['MERGED', 'CLOSED'].includes(pr.state)) return { ...meta, verdict: 'keep', reason: `PR #${pr.number} is ${pr.state}` };
  const prHead = pr.headRefOid;
  // The PR head is on GitHub as refs/pull/<n>/head even after the branch is deleted; fetch it when it isn't here
  // (never on a dry run, which writes nothing, not even FETCH_HEAD).
  if (fetch && prHead && head !== prHead && !ok(wtPath, ['cat-file', '-e', `${prHead}^{commit}`]) && pr.number) {
    try {
      execFileSync('git', ['-C', wtPath, 'fetch', '-q', 'origin', `refs/pull/${pr.number}/head`], { timeout: 120_000, stdio: 'ignore' });
    } catch { /* judged on what is here */ }
  }
  const inPrHead = Boolean(prHead) && (head === prHead || ok(wtPath, ['merge-base', '--is-ancestor', head, prHead]));
  const baseRef = `refs/remotes/origin/${base}`;
  const onBase = ok(wtPath, ['rev-parse', '--verify', '-q', baseRef]) && git(wtPath, ['rev-list', '--count', `${baseRef}..HEAD`]) === '0';
  if (!inPrHead && !onBase) {
    const extra = prHead && ok(wtPath, ['cat-file', '-e', `${prHead}^{commit}`]) ? git(wtPath, ['rev-list', '--count', `${prHead}..HEAD`]) : '?';
    return { ...meta, verdict: 'keep', atRisk: true, reason: `${extra} commit(s) past PR #${pr.number}'s head that are not on origin/${base}` };
  }
  return { ...meta, verdict: 'remove', unlock, reason: `PR #${pr.number} ${pr.state.toLowerCase()}, ${inPrHead ? 'HEAD is in its head' : `HEAD has nothing beyond origin/${base}`}` };
}

function moveToTrash(wtPath, trashDir) {
  fs.mkdirSync(trashDir, { recursive: true });
  // A freedesktop trash lists an item only with its .trashinfo; one for the dated folder is enough to restore from.
  if (process.platform === 'linux' && trashDir.includes('/Trash/files/')) {
    const info = path.join(path.dirname(path.dirname(trashDir)), 'info', `${path.basename(trashDir)}.trashinfo`);
    if (!fs.existsSync(info)) {
      fs.mkdirSync(path.dirname(info), { recursive: true });
      fs.writeFileSync(info, `[Trash Info]\nPath=${path.dirname(wtPath)}\nDeletionDate=${new Date().toISOString().slice(0, 19)}\n`);
    }
  }
  let to = path.join(trashDir, path.basename(wtPath));
  for (let i = 2; fs.existsSync(to); i++) to = path.join(trashDir, `${path.basename(wtPath)}-${i}`);
  fs.renameSync(wtPath, to);
  return to;
}

// Classifies, then acts: removes, trashes an orphan, or keeps. dryRun acts on nothing and says what it would do.
export function teardownWorktree({ path: wtPath, repo, base = 'main', pr = null, dirs, listed = null, dryRun = false, trashDir = trashDirFor(), deleteBranch = true }) {
  let c;
  try {
    c = classifyWorktree(wtPath, { repo, base, pr, dirs, listed, fetch: !dryRun });
  } catch (e) {
    return { action: 'kept', reason: `could not inspect it (${errText(e)})` };
  }
  const extra = { ...(c.atRisk ? { atRisk: true } : {}), ...(c.transient ? { transient: true } : {}) };
  if (c.verdict === 'gone') return { action: 'gone', reason: c.reason };
  if (c.verdict === 'keep') return { action: 'kept', reason: c.reason, ...extra };
  if (c.verdict === 'orphan') {
    if (dryRun) return { action: 'kept', would: 'trashed', reason: `dry run: would move to ${trashDir} (${c.reason})` };
    try {
      return { action: 'trashed', reason: `${c.reason}; moved to ${moveToTrash(wtPath, trashDir)}` };
    } catch (e) {
      return { action: 'kept', reason: `orphan, but the move to the trash failed (${errText(e)})` };
    }
  }
  if (dryRun) return { action: 'kept', would: 'removed', reason: `dry run: would remove (${c.reason})` };
  const main = path.dirname(path.resolve(wtPath, git(wtPath, ['rev-parse', '--git-common-dir'])));
  const mutate = (args) => execFileSync('git', ['-C', main, ...args], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    if (c.unlock) mutate(['worktree', 'unlock', wtPath]);
    mutate(['worktree', 'remove', wtPath]);
  } catch (e) {
    return { action: 'kept', reason: `git worktree remove refused (${errText(e)})` };
  }
  let branchNote = '';
  if (deleteBranch && pr?.state === 'MERGED' && c.branch) {
    try {
      mutate(['branch', '-D', c.branch]);
      branchNote = ', local branch deleted';
    } catch (e) {
      branchNote = `, local branch kept (${errText(e)})`;
    }
  }
  return { action: 'removed', reason: `${c.reason}${c.unlock ? ', dead-pid lock lifted' : ''}${branchNote}` };
}

// The sweep over one repo: every linked worktree (a temporary one outside the repo, as a duplicate-code check or a
// session scratchpad makes, is left out) and every orphan folder in <repo>/<worktreesDir>. prs maps a branch to its
// newest PR (matched by local branch name, else by head commit); a branch in liveBranches, or one naming a ticket in
// liveIds, is never touched.
export function sweepRepo({ repo, base = 'main', worktreesDir = '.claude/worktrees', prs = {}, liveBranches = new Set(), liveIds = [], dryRun = false,
  trashDir = trashDirFor(), fetch = true, dirs = null }) {
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
  const repoReal = real(repo);
  const listed = listWorktrees(repo);
  const results = [];
  const ids = liveIds.map((id) => id.toUpperCase());
  // A worker often pushes HEAD to a branch named unlike its local one, so a PR whose head is this HEAD counts as its PR.
  const byHead = new Map(Object.values(prs).filter((p) => p.headRefOid).map((p) => [p.headRefOid, p]));
  for (const w of listed) {
    if (!within(real(w.path), repoReal) && TEMP.some((t) => `${w.path}/`.startsWith(t))) continue;
    const row = { path: w.path, name: path.basename(w.path), branch: w.branch };
    const liveId = w.branch && ids.find((id) => w.branch.toUpperCase().includes(id));
    if (w.branch && (liveBranches.has(w.branch) || liveId)) {
      results.push({ ...row, action: 'kept', reason: `its ticket${liveId ? ` ${liveId}` : ''} is live` });
      continue;
    }
    const pr = (w.branch && prs[w.branch]) || (w.head && byHead.get(w.head)) || null;
    results.push({ ...row, ...teardownWorktree({ path: w.path, repo, base, pr, dirs, listed, dryRun, trashDir }) });
  }
  const tracked = new Set(listed.map((w) => real(w.path)));
  const folder = path.join(repo, worktreesDir);
  let folders = [];
  try {
    folders = fs.readdirSync(folder, { withFileTypes: true }).filter((d) => d.isDirectory() && !NOT_WORKTREES(d.name)).map((d) => path.join(folder, d.name));
  } catch { /* no worktrees folder */ }
  for (const f of folders) {
    if (tracked.has(real(f))) continue;
    results.push({ path: f, name: path.basename(f), branch: null, ...teardownWorktree({ path: f, repo, base, dirs, listed, dryRun, trashDir }) });
  }
  return { results };
}
