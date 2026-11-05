#!/usr/bin/env node
// worktrees.mjs: prints the git worktrees on this machine as JSON, for the queue board's Worktrees view.
//   node worktrees.mjs
// It reads every git repo directly under each folder in queueBoard.repoRoots (default: the workspace folder), and lists
// each repo's linked worktrees (the main checkout is left out): the branch and commit, how many tracked files have
// uncommitted changes, how many commits exist only here (on no remote branch), and which running processes have their
// working folder inside it. Read-only: git runs with --no-optional-locks, so it never takes the index lock a worker in
// that worktree may need. Untracked files are not counted: finding them walks every folder and cost about four times
// as much on a large monorepo, and `git worktree remove` refuses a worktree that has any. Temporary worktrees under the
// system temp folders (a duplicate-code check makes one) are left out.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, expandHome, HOME } from '../lib/config.mjs';

const HOST = os.hostname().split('.')[0];
const cfg = loadConfig();
const WORKSPACE = cfg.workspaceCwd ?? (cfg.repoPath ? path.dirname(cfg.repoPath) : HOME);
const ROOTS = (cfg.queueBoard?.repoRoots ?? [WORKSPACE]).map(expandHome);
// Where the fleet and Claude Code make a repo's worktrees, relative to the repo.
const WT_DIR = cfg.worktreesDir ?? '.claude/worktrees';
const TEMP = ['/tmp/', '/private/tmp/', '/var/folders/', '/private/var/folders/', `${os.tmpdir()}/`];
const execFileP = promisify(execFile);
const errors = [];
const errText = (e) => String(e?.stderr || e?.message || e).trim().split('\n').at(-1).slice(0, 200);

// Git's threaded index preload made status cost six times the CPU on a Mac (11s of system time over 20 worktrees of a
// large monorepo, against 1.8s without it), so it is turned off; one worktree still takes about 0.1s.
const git = async (cwd, args) => (await execFileP('git', ['--no-optional-locks', '-c', 'core.preloadIndex=false', '-C', cwd, ...args],
  { encoding: 'utf8', timeout: 20_000, maxBuffer: 16 << 20 })).stdout.trim();

// Runs fn over items, n at a time.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// The main checkouts: folders with a .git directory (a linked worktree has a .git file instead).
function repoDirs() {
  return ROOTS.flatMap((root) => {
    try {
      return fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name))
        .filter((dir) => fs.statSync(path.join(dir, '.git'), { throwIfNoEntry: false })?.isDirectory());
    } catch {
      return [];
    }
  });
}

// Every process's working folder and command name, for this user.
async function processDirs() {
  if (process.platform === 'linux') {
    return fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).flatMap((pid) => {
      try {
        return [{ cwd: fs.readlinkSync(`/proc/${pid}/cwd`), cmd: fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() }];
      } catch {
        return [];
      }
    });
  }
  let out;
  try {
    out = (await execFileP('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-u', os.userInfo().username, '-Fcn'], { encoding: 'utf8', timeout: 20_000, maxBuffer: 16 << 20 })).stdout;
  } catch (e) {
    // lsof exits 1 when some process vanished while it looked; what it printed is still good.
    out = e.stdout ?? '';
    if (!out) errors.push(`lsof: ${errText(e)}`);
  }
  const procs = [];
  let cmd = null;
  for (const line of out.split('\n')) {
    if (line[0] === 'p') cmd = null;
    else if (line[0] === 'c') cmd = line.slice(1);
    else if (line[0] === 'n') procs.push({ cwd: line.slice(1), cmd });
  }
  return procs;
}

function parseList(out) {
  return out.split('\n\n').slice(1).flatMap((block) => {
    const dir = block.match(/^worktree (.+)$/m)?.[1];
    if (!dir || TEMP.some((t) => `${dir}/`.startsWith(t))) return [];
    return [{
      path: dir,
      head: block.match(/^HEAD (\w+)$/m)?.[1] ?? null,
      branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null,
      locked: /^locked\b/m.test(block),
      prunable: /^prunable\b/m.test(block),
    }];
  });
}

// Claude Code's executable is named by its version (2.1.318). sleep and caffeinate only run under another process.
const procName = (cmd) => (/^\d+\.\d+\.\d+$/.test(cmd ?? '') ? 'claude' : cmd);
const HELPERS = new Set(['sleep', 'caffeinate']);
// A worktree's name: its folder under the repo's worktreesDir (where the fleet and Claude Code make them), else
// its path under the workspace folder, else its full path. Two worktrees can share a folder name when one sits inside
// another.
function displayName(w, repo) {
  const base = path.join(repo, WT_DIR);

  if (w.path.startsWith(`${base}/`)) return path.relative(base, w.path);
  if (w.path.startsWith(`${WORKSPACE}/`)) return path.relative(WORKSPACE, w.path);
  return w.path.replace(HOME, '~');
}
async function inspect(w, repo, procs) {
  const inside = procs.filter((p) => p.cwd === w.path || p.cwd.startsWith(`${w.path}/`));
  const row = {
    name: displayName(w, repo),
    path: w.path,
    branch: w.branch,
    head: w.head,
    locked: w.locked,
    missing: w.prunable || !fs.existsSync(w.path),
    procs: [...new Set(inside.map((p) => procName(p.cmd)).filter((c) => c && !HELPERS.has(c)))].sort(),
  };
  if (row.missing) return row;
  const [status, last, only] = await Promise.allSettled([
    git(w.path, ['status', '--porcelain', '--untracked-files=no']),
    git(w.path, ['log', '-1', '--format=%cI']),
    git(w.path, ['rev-list', '--count', 'HEAD', '--not', '--remotes']),
  ]);
  if (status.status === 'fulfilled') row.changed = status.value ? status.value.split('\n').length : 0;
  else row.error = errText(status.reason);
  row.lastCommitAt = last.status === 'fulfilled' ? last.value || null : null;
  row.onlyHere = only.status === 'fulfilled' ? Number(only.value) : null;
  return row;
}

const procs = await processDirs();
const repos = (await pool(repoDirs(), 4, async (dir) => {
  try {
    const list = parseList(await git(dir, ['worktree', 'list', '--porcelain']));
    if (!list.length) return null;
    const remote = await git(dir, ['remote', 'get-url', 'origin']).catch(() => '');
    return {
      name: path.basename(dir),
      slug: remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1] ?? null,
      worktrees: await pool(list, 4, (w) => inspect(w, dir, procs)),
    };
  } catch (e) {
    errors.push(`${path.basename(dir)}: ${errText(e)}`);
    return null;
  }
})).filter(Boolean);

console.log(JSON.stringify({ host: HOST, now: new Date().toISOString(), repos, errors }));
