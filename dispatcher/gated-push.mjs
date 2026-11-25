#!/usr/bin/env node
// gated-push.mjs: runs the configured pre-push gates, then pushes. Queue workers call it for every push.
//
// Usage: node gated-push.mjs [git push arguments...]
//   Run it from the worktree, with run_in_background, as the whole Bash command. It prints what it runs and exits
//   with the push's exit code.
//
// The gates are push.gates in the config, each an argv array (format check and type check of the changed packages,
// typically). A slow pre-push hook that runs the whole test suite costs every push tens of minutes under load and fails
// on load-only timeouts in tests the push never touched, so tests gate in CI and the hook keeps the fast checks. When
// the gates here replace such a hook, push.env carries whatever tells the hook to stand down (SKIP_PREPUSH=1, say).
// A failing gate fails the push here, exactly as the hook would.
//
// Before any gate it asks git where the push would land (a dry run) and refuses a push to a protected branch
// (push.protectedBranches, default the base branch, main and master), so a worktree that tracks the base branch never
// pushes past the PR. A dry run that fails refuses the push too, since it says nothing about where the push lands.
import { execFileSync, spawnSync } from 'node:child_process';
import { loadConfig } from '../lib/config.mjs';

const cfg = loadConfig();
let root;
try {
  root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
} catch {
  console.error('gated-push: not inside a git work tree');
  process.exit(1);
}

const args = process.argv.slice(2);
const protectedRefs = [...new Set(cfg.push?.protectedBranches ?? [cfg.github?.baseBranch ?? 'main', 'main', 'master'])];
// --no-verify applies to the dry run only (a dry run still fires the pre-push hook); the real push below keeps it.
const dry = spawnSync('git', ['push', '--dry-run', '--no-verify', '--porcelain', ...args], { cwd: root, encoding: 'utf8' });
const dest = `${dry.stdout ?? ''}${dry.stderr ?? ''}`;
const landsOn = dest.split('\n').filter((l) => protectedRefs.some((b) => new RegExp(`:refs/heads/${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(l)));
if (landsOn.length) {
  console.log(`gated-push: REFUSED. This push would land on a protected branch:\n${landsOn.join('\n')}`);
  console.log(`gated-push: push your branch by name: node gated-push.mjs -u origin HEAD:refs/heads/<your branch>`);
  process.exit(1);
}
if (dry.status !== 0) {
  console.log(`gated-push: REFUSED. The dry run that checks where this push lands failed (exit ${dry.status}):\n${dest.trim()}`);
  process.exit(1);
}

for (const gate of cfg.push?.gates ?? []) {
  console.log(`gated-push: ${gate.join(' ')}`);
  const r = spawnSync(gate[0], gate.slice(1), { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`gated-push: ${gate.join(' ')} failed${r.error ? ` (${r.error.message})` : ''}; fix it and push again`);
    process.exit(1);
  }
}

console.log('gated-push: pushing; tests gate in CI');
const push = spawnSync('git', ['push', ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, ...(cfg.push?.env ?? {}) } });
process.exit(push.status ?? 1);
