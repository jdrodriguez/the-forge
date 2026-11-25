// Agent notes in a keep folder, Agent tool worktrees that never get a PR, a teardown that stopped partway, and the
// board's own read-only git scans, which must not read as a process holding a worktree. Also finishedOnGitHub, which
// settles a ticket this machine's state still calls live. Every
// case runs against real temp git repos; the kept-notes folder and the trash are temp folders too.
// WORKTREE_TEARDOWN_SRC points at another copy of the module.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.WORKTREE_TEARDOWN_SRC ?? path.join(HERE, '..', 'worktree-teardown.mjs');
const { teardownWorktree, sweepRepo, isScan, processDirs, finishedOnGitHub, keptFolders } = await import(pathToFileURL(SRC).href);

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
function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-gaps-')));
  const origin = path.join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const repo = path.join(root, 'app');
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git(repo, 'checkout', '-q', '-b', 'main');
  commit(repo, 'README.md');
  git(repo, 'push', '-q', 'origin', 'main');
  return { root, repo, kept: path.join(root, 'kept'), trash: path.join(root, 'Trash', 'orphaned-test') };
}
function worktree(repo, name, branch = name, push = true) {
  const wt = path.join(repo, '.claude/worktrees', name);
  git(repo, 'worktree', 'add', '-q', '-b', branch, wt, 'origin/main');
  const head = commit(wt, `${name}.txt`);
  if (push) git(wt, 'push', '-q', 'origin', `HEAD:refs/heads/${branch}`);
  return { wt, head };
}
const merged = (headRefOid, number = 1) => ({ number, state: 'MERGED', headRefOid });
const tracked = (repo, wt) => git(repo, 'worktree', 'list', '--porcelain').split('\n').includes(`worktree ${wt}`);
// Sets every file and folder in a worktree, and its git metadata, to `days` ago.
function age(wt, days) {
  const t = new Date(Date.now() - days * 86_400_000);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      fs.utimesSync(p, t, t);
    }
  };
  walk(wt);
  fs.utimesSync(wt, t, t);
  const gd = git(wt, 'rev-parse', '--absolute-git-dir');
  for (const f of ['HEAD', 'index', 'logs/HEAD']) if (fs.existsSync(path.join(gd, f))) fs.utimesSync(path.join(gd, f), t, t);
}
const today = new Date().toLocaleDateString('en-CA');

test('agent notes in .claude/notes are copied out, checked, and then a merged worktree goes', () => {
  const { repo, kept } = setup();
  const { wt, head } = worktree(repo, 'with-notes');
  fs.mkdirSync(path.join(wt, '.claude/notes/sub'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.claude/notes/HANDOFF.md'), 'what I learned');
  fs.writeFileSync(path.join(wt, '.claude/notes/sub/log.md'), 'more');
  const dry = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [], keptDir: kept, dryRun: true });
  assert.equal(dry.would, 'removed');
  assert.match(dry.reason, /would copy \.claude\/notes to .*kept\/app\/with-notes/);
  assert.ok(!fs.existsSync(kept), 'a dry run copies nothing');
  const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [], keptDir: kept });
  assert.equal(r.action, 'removed', r.reason);
  const dest = path.join(kept, 'app', 'with-notes', today, '.claude/notes');
  assert.equal(fs.readFileSync(path.join(dest, 'HANDOFF.md'), 'utf8'), 'what I learned');
  assert.equal(fs.readFileSync(path.join(dest, 'sub/log.md'), 'utf8'), 'more');
  assert.ok(!fs.existsSync(wt) && !tracked(repo, wt));
});

test('ignored notes, and a keep pattern with a glob, are copied too; a second copy the same day gets its own folder', () => {
  const { repo, kept } = setup();
  const { wt } = worktree(repo, 'ignored-notes');
  fs.writeFileSync(path.join(wt, '.gitignore'), '.claude/notes/\n.visual-gate-*/\n');
  git(wt, 'add', '.gitignore');
  git(wt, 'commit', '-q', '-m', 'ignore');
  git(wt, 'push', '-q', 'origin', 'HEAD:refs/heads/ignored-notes');
  for (const f of ['.claude/notes/a.md', 'web/.visual-gate-eng-1/harness.tsx']) {
    fs.mkdirSync(path.dirname(path.join(wt, f)), { recursive: true });
    fs.writeFileSync(path.join(wt, f), f);
  }
  const keep = ['.claude/notes', 'web/.visual-gate-*'];
  assert.deepEqual(keptFolders(wt, keep), ['.claude/notes', 'web/.visual-gate-eng-1']);
  fs.mkdirSync(path.join(kept, 'app', 'ignored-notes', today), { recursive: true });
  const r = teardownWorktree({ path: wt, repo, pr: merged(git(wt, 'rev-parse', 'HEAD')), dirs: [], keptDir: kept, keep });
  assert.equal(r.action, 'removed', r.reason);
  const dest = path.join(kept, 'app', 'ignored-notes', `${today}-2`);
  assert.equal(fs.readFileSync(path.join(dest, 'web/.visual-gate-eng-1/harness.tsx'), 'utf8'), 'web/.visual-gate-eng-1/harness.tsx');
  assert.ok(fs.existsSync(path.join(dest, '.claude/notes/a.md')));
});

test('a failed copy of the notes keeps the worktree; notes outside a keep folder still keep it', () => {
  const { repo, root } = setup();
  const { wt, head } = worktree(repo, 'copy-fails');
  fs.mkdirSync(path.join(wt, '.claude/notes'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.claude/notes/a.md'), 'x');
  const blocker = path.join(root, 'not-a-folder');
  fs.writeFileSync(blocker, 'x');
  const r = teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [], keptDir: blocker });
  assert.equal(r.action, 'kept');
  assert.equal(r.rule, 'keep-copy');
  assert.ok(fs.existsSync(path.join(wt, '.claude/notes/a.md')));
  fs.writeFileSync(path.join(wt, 'scratch.md'), 'x');
  assert.equal(teardownWorktree({ path: wt, repo, pr: merged(head), dirs: [], keptDir: path.join(root, 'k') }).rule, 'dirty');
});

test('a teardown that stopped partway (only deleted tracked files) is finished once the PR is merged or closed', () => {
  const { repo } = setup();
  const { wt, head } = worktree(repo, 'half-gone');
  commit(wt, 'src/a.ts');
  commit(wt, 'src/b.ts');
  git(wt, 'push', '-q', 'origin', 'HEAD:refs/heads/half-gone');
  const prHead = git(wt, 'rev-parse', 'HEAD');
  fs.rmSync(path.join(wt, 'src'), { recursive: true });
  git(wt, 'rm', '-q', '--cached', 'README.md');
  fs.rmSync(path.join(wt, 'README.md'));
  assert.equal(teardownWorktree({ path: wt, repo, pr: null, dirs: [] }).rule, 'dirty', 'no PR: kept');
  assert.equal(teardownWorktree({ path: wt, repo, pr: { number: 1, state: 'OPEN', headRefOid: prHead }, dirs: [] }).rule, 'dirty', 'open PR: kept');
  const r = teardownWorktree({ path: wt, repo, pr: { number: 1, state: 'CLOSED', headRefOid: prHead }, dirs: [] });
  assert.equal(r.action, 'removed', r.reason);
  assert.equal(r.rule, 'finish-teardown');
  assert.match(r.reason, /only 3 deleted tracked file/);
  assert.ok(!fs.existsSync(wt) && !tracked(repo, wt));
  void head;
});

test('deletions plus anything else, or unpushed commits, still keep a worktree whose PR merged', () => {
  const { repo } = setup();
  const a = worktree(repo, 'del-and-new');
  fs.rmSync(path.join(a.wt, 'del-and-new.txt'));
  fs.writeFileSync(path.join(a.wt, 'new.txt'), 'x');
  assert.equal(teardownWorktree({ path: a.wt, repo, pr: merged(a.head), dirs: [] }).rule, 'dirty');
  const b = worktree(repo, 'del-and-ahead');
  commit(b.wt, 'local-only.txt');
  fs.rmSync(path.join(b.wt, 'README.md'));
  const r = teardownWorktree({ path: b.wt, repo, pr: merged(b.head), dirs: [] });
  assert.equal(r.rule, 'unpushed');
  assert.ok(fs.existsSync(path.join(b.wt, 'local-only.txt')));
});

test('an idle Agent tool worktree with every commit on GitHub goes with no PR; a recent one, or another name, stays', () => {
  const { repo } = setup();
  const idle = worktree(repo, 'agent-a3e3b808731ce3905', 'agent/eng-1-standby');
  const recent = worktree(repo, 'agent-0123456789abcdef0', 'worktree-agent-0123456789abcdef0');
  const other = worktree(repo, 'gameplan-map');
  age(idle.wt, 8);
  age(other.wt, 30);
  const { results } = sweepRepo({ repo, prs: {}, dirs: [], fetch: false });
  const by = Object.fromEntries(results.map((x) => [x.name, x]));
  assert.equal(by['agent-a3e3b808731ce3905'].action, 'removed', by['agent-a3e3b808731ce3905'].reason);
  assert.equal(by['agent-a3e3b808731ce3905'].rule, 'agent-idle');
  assert.equal(by['agent-0123456789abcdef0'].rule, 'agent-recent');
  assert.equal(by['gameplan-map'].rule, 'no-pr');
  assert.ok(!fs.existsSync(idle.wt) && fs.existsSync(recent.wt) && fs.existsSync(other.wt));
  const longer = sweepRepo({ repo, prs: {}, dirs: [], fetch: false, agent: { idleDays: 0 }, dryRun: true }).results.find((x) => x.name === 'agent-0123456789abcdef0');
  assert.equal(longer.would, 'removed', 'idleDays is configurable');
});

test('an Agent tool worktree with commits on no branch GitHub has is kept at risk, naming its branch, even past a stale ref', () => {
  const { repo } = setup();
  const local = worktree(repo, 'agent-ab95bd8f5c32d2c61', 'worktree-agent-ab95bd8f5c32d2c61', false);
  // Pushed, fetched, then deleted on the remote: the stale origin/<branch> ref here still holds the commit.
  const gone = worktree(repo, 'agent-ac79d15d0d0d3ff97', 'agent/eng-2-callbacks');
  git(repo, 'fetch', '-q', 'origin');
  git(path.join(path.dirname(repo), 'origin.git'), 'branch', '-D', 'agent/eng-2-callbacks');
  assert.ok(git(repo, 'branch', '-r').includes('origin/agent/eng-2-callbacks'), 'the stale tracking ref is still here');
  age(local.wt, 30);
  age(gone.wt, 30);
  const { results } = sweepRepo({ repo, prs: {}, dirs: [], fetch: false });
  for (const [name, branch] of [['agent-ab95bd8f5c32d2c61', 'worktree-agent-ab95bd8f5c32d2c61'], ['agent-ac79d15d0d0d3ff97', 'agent/eng-2-callbacks']]) {
    const r = results.find((x) => x.name === name);
    assert.equal(r.action, 'kept');
    assert.equal(r.rule, 'agent-unpushed');
    assert.equal(r.atRisk, true);
    assert.ok(r.reason.includes(branch), r.reason);
  }
  assert.ok(fs.existsSync(local.wt) && fs.existsSync(gone.wt));
});

test('an Agent tool worktree held by a process or a live ticket stays, however old', () => {
  const { repo } = setup();
  const held = worktree(repo, 'agent-1111111111111111a', 'agent/eng-3-a');
  const live = worktree(repo, 'agent-2222222222222222b', 'agent/eng-4-b');
  age(held.wt, 30);
  age(live.wt, 30);
  const { results } = sweepRepo({ repo, prs: {}, dirs: [held.wt], fetch: false, liveIds: ['ENG-4'] });
  assert.equal(results.find((x) => x.name === 'agent-1111111111111111a').rule, 'process');
  assert.equal(results.find((x) => x.name === 'agent-2222222222222222b').rule, 'live');
});

test("isScan: only a read-only git run with --no-optional-locks whose parent is the board's or the dispatcher's", () => {
  const board = '/usr/bin/node /home/u/sync/queue-board/board.mjs';
  const disp = 'node /home/u/forge/dispatcher/dispatcher.mjs tick';
  const scan = (args) => ['git', '--no-optional-locks', '-c', 'core.preloadIndex=false', '-C', '/w/x', ...args];
  assert.equal(isScan(scan(['status', '--porcelain']), board), true);
  assert.equal(isScan(['/usr/bin/git', '--no-optional-locks', '-C', '/w/x', 'rev-list', '--count', 'HEAD'], disp), true);
  assert.equal(isScan(scan(['worktree', 'list', '--porcelain']), board), true);
  assert.equal(isScan(scan(['worktree', 'remove', '/w/x']), board), false, 'worktree remove writes');
  assert.equal(isScan(scan(['commit', '-m', 'x']), board), false);
  assert.equal(isScan(['git', '-C', '/w/x', 'status'], board), false, 'without --no-optional-locks it may take the index lock');
  assert.equal(isScan(scan(['status']), '/bin/zsh -c claude'), false, "another parent's git run counts");
  assert.equal(isScan(['node', '--no-optional-locks', 'status'], board), false);
  assert.equal(isScan(scan(['status']), board, ['/elsewhere/']), false, 'scanners is configurable');
});

test("processDirs leaves out a live read-only scan the board started in a worktree, and counts the same run from anyone else", async () => {
  const { root, repo } = setup();
  const { wt } = worktree(repo, 'scanned');
  // A real git run that waits: cat-file --batch reads stdin until it closes. The parent is a script in a queue-board
  // folder, as the board's scans are.
  const parentDir = path.join(root, 'queue-board');
  fs.mkdirSync(parentDir);
  const script = path.join(parentDir, 'scan.mjs');
  fs.writeFileSync(script, `import { spawn } from 'node:child_process';
const c = spawn('git', ['--no-optional-locks', '-C', process.argv[2], 'cat-file', '--batch'], { stdio: ['pipe', 'ignore', 'ignore'] });
console.log(c.pid);
setTimeout(() => {}, 60_000);
`);
  const other = path.join(root, 'other.mjs');
  fs.writeFileSync(other, fs.readFileSync(script));
  const start = (file) => new Promise((resolve) => {
    const p = spawn(process.execPath, [file, wt], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.once('data', (d) => resolve({ p, child: Number(String(d).trim()) }));
  });
  const real = fs.realpathSync(wt);
  const inside = (dirs) => dirs.some((d) => d === real || d.startsWith(`${real}/`));
  const a = await start(script);
  try {
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(inside(processDirs({ scanners: ['/queue-board/'] })), false, "the board's scan is left out");
    assert.equal(inside(processDirs({ scanners: ['/not-this/'] })), true, 'with no scanner matching, it counts');
  } finally {
    process.kill(a.child);
    a.p.kill();
  }
  const b = await start(other);
  try {
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(inside(processDirs({ scanners: ['/queue-board/'] })), true, "a scan from a parent that is not a scanner counts");
  } finally {
    process.kill(b.child);
    b.p.kill();
  }
});

test('finishedOnGitHub: by PR number, then branch, then a PR title naming the ticket; open or unmatched stays live', () => {
  const prs = [
    { number: 4705, state: 'MERGED', headRefName: 'agent/eng-6750-agent', title: 'ENG-6750, ENG-6757: Talk ships to TestFlight' },
    { number: 4800, state: 'OPEN', headRefName: 'agent/eng-7000-agent', title: 'ENG-7000: open work' },
    { number: 4801, state: 'CLOSED', headRefName: 'agent/eng-7001-agent', title: 'ENG-7001: closed' },
    { number: 4802, state: 'MERGED', headRefName: 'agent/eng-7002-x', title: 'ENG-7002: merged' },
  ];
  const out = finishedOnGitHub([
    { id: 'ENG-6757', branch: 'agent/eng-6757-agent' },
    { id: 'ENG-7000', branch: 'agent/eng-7000-agent' },
    { id: 'ENG-7001', branch: 'agent/eng-7001-agent' },
    { id: 'ENG-7002', branch: null, prNumber: 4802 },
    { id: 'ENG-675', branch: 'agent/eng-675-agent' },
    { id: 'ENG-9999', branch: 'agent/eng-9999-agent' },
  ], prs);
  assert.deepEqual(out.map((t) => [t.id, t.pr.number]), [['ENG-6757', 4705], ['ENG-7001', 4801], ['ENG-7002', 4802]]);
});

test('finishedOnGitHub: a ticket built again counts only a PR opened since its claim, by branch or title; its own prNumber always', () => {
  const prs = [
    { number: 4745, state: 'MERGED', headRefName: 'agent/eng-6754-agent', title: 'ENG-6754: first attempt', createdAt: '2026-11-22T08:15:12Z' },
    { number: 4900, state: 'MERGED', headRefName: 'agent/eng-7400-agent', title: 'ENG-7400: first attempt', createdAt: '2026-11-20T00:00:00Z' },
  ];
  const since = '2026-11-25T16:26:37Z';
  assert.deepEqual(finishedOnGitHub([{ id: 'ENG-6754', branch: 'agent/eng-6754-agent', since }, { id: 'ENG-7400', branch: 'x', since }], prs), []);
  assert.deepEqual(finishedOnGitHub([{ id: 'ENG-6754', branch: 'agent/eng-6754-agent', prNumber: 4745, since }], prs).map((t) => t.pr.number), [4745]);
  assert.deepEqual(finishedOnGitHub([{ id: 'ENG-6754', branch: 'agent/eng-6754-agent', since: '2026-11-21T00:00:00Z' }], prs).map((t) => t.pr.number), [4745]);
});
