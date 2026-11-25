// Pre-merge freshness check (added after two PRs merged green one after the other and broke main's type-check
// together). A PR's CI tests it against the main of its last push, and GitHub reports it CLEAN without re-testing
// against the main it will land on. So right before a merge, when main has moved since that CI run, this merges current
// main into the PR in a reused scratch worktree and runs premerge.checkCommand (a type-check of what either side
// changed, typically). It costs local CPU only, no CI run. It catches type-level clashes; ones that only show at test
// time still reach CI.
//
// CLI: node premerge-check.mjs <pr-number>   (exit 0 pass or not stale, 1 fail, 2 could not check)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';

const conf = loadConfig();
const P = conf.premerge ?? {};
const REPO = conf.github.repo;
const BASE = conf.github.baseBranch ?? 'main';
const WORKFLOW = conf.github.ciWorkflow ?? 'CI';
const CHECKOUT = conf.repoPath;
const SCRATCH = path.join(CHECKOUT, conf.worktreesDir ?? '.claude/worktrees', 'premerge-check');

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
const gh = (args) => sh('gh', args);
const git = (args, cwd = SCRATCH) => sh('git', ['-C', cwd, ...args]);
// Fetches the base branch into origin/<base> (and any extra refs) over the SSH remote, falling back to HTTPS: during a
// GitHub incident SSH auth failed while HTTPS worked, and every check came back unchecked.
const fetchMain = (extra = [], cwd = SCRATCH) => {
  try {
    git(['fetch', '-q', 'origin', BASE, ...extra], cwd);
  } catch {
    git(['fetch', '-q', `https://github.com/${REPO}.git`, `+refs/heads/${BASE}:refs/remotes/origin/${BASE}`, ...extra], cwd);
  }
};
const tail = (s, n = 15) => String(s ?? '').trim().split('\n').slice(-n).join('\n');

// The main commit the PR's latest CI run tested against: main's newest commit before that run started.
export function ciBase(prNumber, headSha) {
  const head = JSON.parse(gh(['pr', 'view', String(prNumber), '--repo', REPO, '--json', 'headRefName'])).headRefName;
  const runs = JSON.parse(gh(['run', 'list', '--repo', REPO, '--workflow', WORKFLOW, '--branch', head, '--event', 'pull_request',
    '--json', 'headSha,createdAt', '--limit', '10']));
  const run = runs.find((r) => r.headSha === headSha);
  if (!run) return null;
  const sha = gh(['api', `repos/${REPO}/commits?sha=${BASE}&until=${encodeURIComponent(run.createdAt)}&per_page=1`, '--jq', '.[0].sha']);
  return sha || null;
}

function ensureScratch() {
  if (!fs.existsSync(path.join(SCRATCH, '.git'))) {
    fetchMain([], CHECKOUT);
    git(['worktree', 'add', '-q', '--detach', SCRATCH, `origin/${BASE}`], CHECKOUT);
    for (const f of P.copyFiles ?? []) {
      if (fs.existsSync(path.join(CHECKOUT, f))) fs.copyFileSync(path.join(CHECKOUT, f), path.join(SCRATCH, f));
    }
  }
}

// One check at a time per machine: they share the scratch worktree. A lock older than 40 minutes is taken over.
function withScratchLock(fn) {
  const lock = `${SCRATCH}.lock`;
  const until = Date.now() + 40 * 60_000;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() - fs.statSync(lock).mtimeMs > 40 * 60_000) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > until) throw new Error('timed out waiting for the pre-merge scratch worktree');
      execFileSync('sleep', ['10']);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

// Build output is gitignored, so `git clean` keeps it, and a previous check's stale dist can shadow this tree's modules
// (a leftover dist/x.d.ts once hid x/index.d.ts). Clears every package's dist and tsbuildinfo under each root; a build
// cache restores what still matches. Only package folders: a stray file in a root (Finder's .DS_Store, say) made rmSync
// of <file>/dist throw ENOTDIR and held every merge.
export function clearBuildOutput(scratch, roots) {
  for (const root of roots) {
    const dir = path.join(scratch, root);
    if (!fs.existsSync(dir)) continue;
    for (const pkg of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
      fs.rmSync(path.join(dir, pkg, 'dist'), { recursive: true, force: true });
      for (const f of fs.readdirSync(path.join(dir, pkg))) {
        if (f.endsWith('.tsbuildinfo')) fs.rmSync(path.join(dir, pkg, f), { force: true });
      }
    }
  }
}

// Returns { stale: false } when main has not moved since the PR's CI ran, else { stale: true, ok, reason, output }.
export function premergeCheck(prNumber, headSha, opts = {}) {
  return withScratchLock(() => runCheck(prNumber, headSha, opts));
}

function runCheck(prNumber, headSha, { log = () => {} } = {}) {
  const base = ciBase(prNumber, headSha);
  if (!base) return { stale: true, ok: false, unchecked: true, reason: `no CI run found for head ${headSha.slice(0, 8)}` };
  const main = gh(['api', `repos/${REPO}/commits/${BASE}`, '--jq', '.sha']);
  if (main === base) return { stale: false };
  ensureScratch();
  fetchMain([`refs/pull/${prNumber}/head`]);
  git(['checkout', '-q', '--detach', '--force', headSha]);
  git(['reset', '-q', '--hard', headSha]);
  git(['clean', '-fdq']);
  clearBuildOutput(SCRATCH, P.buildOutputRoots ?? []);
  try {
    git(['-c', 'user.name=premerge-check', '-c', 'user.email=premerge@localhost', 'merge', '-q', '--no-edit', '--no-ff', `origin/${BASE}`]);
  } catch (e) {
    try { git(['merge', '--abort']); } catch { /* nothing to abort */ }
    return { stale: true, ok: false, reason: 'current main does not merge into the PR cleanly', output: tail(e.stderr || e.stdout) };
  }
  // Two PRs can each pick the same migration prefix and pass alone (two once took the same timestamp on the same
  // day). Merged, the apply order between them is undefined, so a shared prefix fails the check.
  // Main already carries older shared prefixes, so only a prefix shared by more files than on main counts. With
  // migrations.policy "filename" the migrator applies any unapplied file whatever its prefix, so only a file name main
  // already has clashes, and that shows as a merge conflict above.
  const mig = P.migrations;
  if (mig?.dir && mig.policy !== 'filename' && fs.existsSync(path.join(SCRATCH, mig.dir))) {
    const rx = new RegExp(mig.pattern ?? '^\\d{14}_.*\\.sql$');
    const n = mig.prefixLength ?? 14;
    const isMigration = (f) => rx.test(f);
    const merged = Object.groupBy(fs.readdirSync(path.join(SCRATCH, mig.dir)).filter(isMigration), (f) => f.slice(0, n));
    const onMain = Object.groupBy(git(['ls-tree', '--name-only', `origin/${BASE}`, `${mig.dir}/`]).split('\n')
      .map((p) => p.slice(mig.dir.length + 1)).filter(isMigration), (f) => f.slice(0, n));
    const dupes = Object.entries(merged).filter(([p, files]) => files.length > 1 && files.length > (onMain[p]?.length ?? 0));
    if (dupes.length) {
      return { stale: true, ok: false, reason: 'migration prefix shared with main', output: dupes.map(([p, f]) => `${p}: ${f.join(', ')}`).join('\n') };
    }
  }
  const lint = P.actionlint === false ? null : lintWorkflows(main, log);
  if (lint) return { stale: true, ok: false, reason: `a workflow is invalid once merged with main ${main.slice(0, 8)}`, output: lint };
  log(`pre-merge check: PR #${prNumber} merged with main ${main.slice(0, 8)} (CI saw ${base.slice(0, 8)}), checking`);
  const check = (P.checkCommand ?? ['pnpm', 'type-check']).map((a) => a.replaceAll('{base}', base));
  try {
    if (P.installCommand?.length) sh(P.installCommand[0], P.installCommand.slice(1), { cwd: SCRATCH, timeout: 600_000 });
    sh(check[0], check.slice(1), { cwd: SCRATCH, timeout: 1_200_000, env: { ...process.env, CI: 'true' } });
  } catch (e) {
    const output = tail(`${e.stdout ?? ''}\n${e.stderr ?? ''}`);
    // A compile killed for memory (an OOM killer's SIGTERM, the kernel's SIGKILL) or by the timeout proves nothing
    // about the code, so it reports could-not-check and the merge waits a tick. Only real errors (output matching
    // premerge.errorPattern) are a fail.
    if (e.signal || [137, 143].includes(e.status) || !new RegExp(P.errorPattern ?? 'error TS\\d+').test(output)) {
      return { stale: true, ok: false, unchecked: true, reason: `type-check did not finish (${e.signal ?? `exit ${e.status}`})`, output };
    }
    return { stale: true, ok: false, reason: `type-check failed with current main ${main.slice(0, 8)}`, output };
  }
  return { stale: true, ok: true, base, main };
}

// Two PRs that each edit a workflow can merge clean as text and still break it: one PR renamed a job after another,
// merged once the first PR's CI had run, added a job that needs the old name. GitHub rejects a workflow with an
// unknown `needs`, so every run, main's included, would fail at startup, and the type-check
// below never reads YAML. When the merged tree's workflows differ from main's, this runs actionlint on both and
// returns the findings main's own workflows don't have, or null. No actionlint on this machine skips the step.
function lintWorkflows(main, log) {
  try {
    git(['diff', '--quiet', main, 'HEAD', '--', '.github/workflows']);
    return null;
  } catch { /* the merged workflows differ from main's */ }
  let bin;
  try {
    bin = sh('which', ['actionlint']);
  } catch {
    log('pre-merge check: actionlint is not installed here, so the merged workflows are not linted');
    return null;
  }
  const config = path.join(SCRATCH, '.github/actionlint.yaml');
  const findings = (dir) => {
    const wf = path.join(dir, '.github/workflows');
    const files = fs.readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join(wf, f));
    let out;
    try {
      out = sh(bin, ['-format', '{{json .}}', ...(fs.existsSync(config) ? ['-config-file', config] : []), ...files]);
    } catch (e) {
      out = e.stdout ?? ''; // actionlint exits 1 when it has findings
    }
    return new Set(JSON.parse(out || '[]').map((x) => `${path.basename(x.filepath)}: ${x.message}`));
  };
  const mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'premerge-main-workflows-'));
  try {
    const tarball = execFileSync('git', ['-C', SCRATCH, 'archive', main, '.github/workflows'], { maxBuffer: 64 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', mainDir], { input: tarball });
    const onMain = findings(mainDir);
    const added = [...findings(SCRATCH)].filter((f) => !onMain.has(f));
    return added.length ? added.join('\n') : null;
  } finally {
    fs.rmSync(mainDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const n = process.argv[2];
  if (!n) {
    console.log('usage: node premerge-check.mjs <pr-number>');
    process.exit(2);
  }
  const headSha = JSON.parse(gh(['pr', 'view', n, '--repo', REPO, '--json', 'headRefOid'])).headRefOid;
  const r = premergeCheck(n, headSha, { log: console.log });
  if (!r.stale) console.log(`PR #${n}: main has not moved since its CI ran, nothing to check`);
  else if (r.ok) console.log(`PR #${n}: PASS, type-checks with current main ${r.main.slice(0, 8)} (CI saw ${r.base.slice(0, 8)})`);
  else console.log(`PR #${n}: ${r.unchecked ? 'COULD NOT CHECK' : 'FAIL'}: ${r.reason}${r.output ? `\n${r.output}` : ''}`);
  process.exit(!r.stale || r.ok ? 0 : r.unchecked ? 2 : 1);
}
