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

for (const gate of cfg.push?.gates ?? []) {
  console.log(`gated-push: ${gate.join(' ')}`);
  const r = spawnSync(gate[0], gate.slice(1), { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`gated-push: ${gate.join(' ')} failed${r.error ? ` (${r.error.message})` : ''}; fix it and push again`);
    process.exit(1);
  }
}

console.log('gated-push: pushing; tests gate in CI');
const push = spawnSync('git', ['push', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: { ...process.env, ...(cfg.push?.env ?? {}) } });
process.exit(push.status ?? 1);
