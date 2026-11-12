// ext-worker-audit.mjs: reads what a Codex or Grok queue worker tried, after its run, from the CLI's own event stream,
// and what its branch carries. ext-worker-lib.mjs runs these outside the sandbox. A finding fails the run with a
// "containment:" report, and the dispatcher keeps engines off that ticket for good.
//
// The audit runs after the fact. The sandbox has already refused what it could; the audit is there to catch an engine
// that tried, so a run that reached for credentials never counts as a good round. It reads command lines and tool
// inputs as text, so an obfuscated command (a path built from pieces, base64, a script written then run) passes it.
//
// ctx, for every check: { worktree, main, workspace, home, private: [paths], extra: [paths] }
//   main      the repo's main checkout (config repoPath). Only its .git is readable inside.
//   workspace the folder that holds the repos (config workspaceCwd). A path under it that is not this worktree or the
//             main checkout's .git belongs to another repo or to the main checkout's working files.
//   private   the queue's own folders (stateDir, sharedDir, the agent-queue checkout). An engine has no reason to name them.
//   extra     folders besides the worktree an engine may write (its temp dir).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Credential stores no engine has a reason to read. Each is refused by the sandbox; naming one still fails the run.
const CREDENTIAL_PATHS = [
  ['~/.ssh', '\\.ssh\\b'], ['~/.aws', '\\.aws\\b'], ['~/.doppler', '\\.doppler\\b'], ['~/.config/doppler', '\\.config/doppler'],
  ['~/.config/gh', '\\.config/gh\\b'], ['~/.claude', '\\.claude(?:-[A-Za-z0-9]+)?(?:/|\\.json|\\b)'], ['~/Library/Keychains', 'Library/Keychains'],
  ['~/.codex', '\\.codex\\b'], ['~/.grok', '\\.grok\\b'], ['~/.netrc', '\\.netrc\\b'], ['~/.gnupg', '\\.gnupg\\b'],
  ['~/.kube', '\\.kube\\b'], ['~/.docker', '\\.docker/config'], ['~/.npmrc', '\\.npmrc\\b'],
];

function deniedRules(ctx) {
  const home = ctx.home;
  const homeForms = (rel) => `(?:${esc(home)}|~|\\$HOME|\\$\\{HOME\\})/${rel}`;
  const rules = CREDENTIAL_PATHS.map(([name, rel]) => [name, new RegExp(homeForms(rel))]);
  for (const p of ctx.private ?? []) {
    if (!p) continue;
    const rel = p.startsWith(`${home}/`) ? p.slice(home.length + 1) : null;
    rules.push([`the queue's own files (${rel ? `~/${rel}` : p})`, new RegExp(`${rel ? homeForms(esc(rel)) : esc(p)}(?:/|\\b|$)`)]);
  }
  // The run's own copy of the CLI's auth file lives in its run folder. Listing the folder is harmless (an engine did it
  // hunting for node); naming the file in it, or globbing it, is not.
  rules.push(["the CLI's auth file", /(?:cli-home|\$\{?(?:CODEX|GROK)_HOME\}?)\/(?:[^\s'";|&]*auth\.json|\*)/]);
  return rules;
}

// A path under the workspace that is not this worktree, the main checkout's .git, or a folder the engine may write.
function otherRepoPath(text, ctx) {
  const { home, worktree, main, workspace } = ctx;
  if (!workspace) return null;
  const rel = workspace.startsWith(`${home}/`) ? workspace.slice(home.length + 1) : null;
  const head = rel ? `(?:${esc(home)}|~|\\$HOME|\\$\\{HOME\\})/${esc(rel)}` : esc(workspace);
  const rx = new RegExp(`${head}(?:/[^\\s'"\`;|&)]*)?`, 'g');
  const ok = [worktree, `${main}/.git`, ...(ctx.extra ?? [])].filter(Boolean);
  const parents = new Set([workspace]);
  for (let p = main; p && p.startsWith(workspace) && p !== workspace; p = path.dirname(p)) parents.add(path.dirname(p));
  for (const m of text.matchAll(rx)) {
    const p = m[0].replace(/^~|^\$\{?HOME\}?/, home).replace(/\/+$/, '');
    if (ok.some((r) => p === r || p.startsWith(`${r}/`))) continue;
    if (parents.has(p)) continue;
    return p;
  }
  return null;
}

// Where a command name can start: the line's start, after a separator or quote, or after a word that runs one. The
// word must follow a space or the line's start: \b never matches before "-c", so `sh -c doppler` would pass.
const AT_COMMAND = String.raw`(?:^|[;&|(\x60{'"]\s*|(?:^|\s)(?:exec|env|xargs|sudo|command|nohup|time|then|do|-c|-lc)\s+)`;
const COMMAND_RULES = [
  ['ran doppler', new RegExp(`${AT_COMMAND}(?:\\S*/)?doppler(?:\\s|$|['"])`)],
  ['merged a PR through gh', /\bgh\s+(?:-\S+\s+)*pr\s+merge\b/],
  ['started a workflow through gh', /\bgh\s+(?:-\S+\s+)*workflow\s+(?:run|enable)\b/],
  ['used gh release', /\bgh\s+(?:-\S+\s+)*release\s+(?:create|upload|edit|delete)\b/],
  ['used gh secret or variable', /\bgh\s+(?:-\S+\s+)*(?:secret|variable)\b/],
  ['read the gh token', /\bgh\s+(?:-\S+\s+)*auth\s+(?:token|refresh|login|logout|switch|setup-git)\b/],
  ['changed the repo through gh', /\bgh\s+(?:-\S+\s+)*(?:repo\s+(?:edit|delete|rename|archive)|ruleset|api\s+[^\n]*\b(?:rulesets|collaborators|branches\/[^\s/]+\/protection)\b)/],
  ['merged through the GraphQL API', /\b(?:mergePullRequest|enablePullRequestAutoMerge|mergeBranch|updateRef|deleteRef)\b/],
  ['merged or dispatched through the GitHub API', /\b(?:gh\s+api|curl|wget|http)\b[^\n]*(?:\/merges?\b|\/dispatches\b|\/actions\/workflows\b|\/pulls\/\d+\/merge\b|\/git\/refs\/heads\/(?:main|master)\b)/],
  ['read the keychain', /\bsecurity\s+(?:find-(?:generic|internet)-password|dump-keychain|export|unlock-keychain)\b/],
  ['tried to leave the sandbox through launchd, LaunchServices or AppleEvents', /\b(?:launchctl\s+(?:submit|load|bootstrap|start|kickstart)|osascript|open\s+-[a-zA-Z]*a\b|open\s+\S+\.(?:app|command)\b)/],
  ['tried to leave the sandbox through systemd or the session bus', /\b(?:systemd-run|systemctl\s+--user\s+(?:start|enable|link)|dbus-send|busctl|gdbus)\b/],
];

// A push names the base branch as its target (main, HEAD:main, refs/heads/main, :main) or forces. Each command line of
// a script is read on its own, so a `git push` on one line and `main` in a comment two lines down don't combine.
export function pushViolation(line, base = 'main') {
  const m = line.match(/\bgit\s+(?:-[Cc]\s+\S+\s+|--?[\w-]+(?:=\S+)?\s+)*push\b(.*)$/);
  if (!m) return null;
  const rest = m[1].replace(/\s(?:&&|\|\||;|\||#).*$/, '');
  const words = rest.split(/\s+/).map((w) => w.replace(/^['"]+|['"]+$/g, '')).filter(Boolean);
  if (words.some((w) => /^(?:-f|--force|--force-with-lease(?:=.*)?|--force-if-includes|--mirror|--all|--delete|-d|--prune)$/.test(w))) return 'force-pushed, deleted or pushed every branch';
  if (words.includes('--no-verify')) return 'pushed with --no-verify';
  const bases = new Set(['main', 'master', base]);
  for (const w of words.filter((x) => !x.startsWith('-'))) {
    if (w.startsWith('+')) return 'force-pushed a refspec';
    const dst = (w.includes(':') ? w.split(':').pop() : w).replace(/^refs\/heads\//, '');
    if (bases.has(dst)) return `pushed to ${dst}`;
  }
  return null;
}

export function commandViolations(command, ctx) {
  const out = [];
  for (const [what, rx] of COMMAND_RULES) if (rx.test(command)) out.push(what);
  for (const [name, rx] of deniedRules(ctx)) if (rx.test(command)) out.push(`reached for ${name}`);
  const other = otherRepoPath(command, ctx);
  if (other) out.push(`reached outside its worktree into ${other}`);
  for (const line of command.split('\n')) {
    const p = pushViolation(line, ctx.base);
    if (p) out.push(p);
  }
  return out;
}

function pathViolations(p, ctx) {
  if (!p) return [];
  const out = [];
  for (const [name, rx] of deniedRules(ctx)) if (rx.test(p)) out.push(`reached for ${name}`);
  const other = otherRepoPath(p, ctx);
  if (other) out.push(`reached outside its worktree into ${other}`);
  return out;
}

const asText = (v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''));
const within = (p, roots) => roots.some((r) => p === r || p.startsWith(`${r}/`));
const writable = (ctx) => [ctx.worktree, ...(ctx.extra ?? [])];

// Codex: every shell command is an item with its command line; a refused one still shows in the stream.
function auditCodex(lines, ctx) {
  const r = { violations: [], notes: [], summary: '', completed: false, errors: [], commands: 0 };
  for (const ev of lines) {
    if (ev?.type === 'turn.completed') r.completed = true;
    if (ev?.type === 'error' || ev?.type === 'turn.failed') r.errors.push(asText(ev.message ?? ev.error?.message ?? JSON.stringify(ev)).slice(0, 300));
    const item = ev?.item;
    if (!item) continue;
    if (item.type === 'command_execution' && ev.type === 'item.started') {
      r.commands += 1;
      for (const v of commandViolations(asText(item.command), ctx)) r.violations.push(`${v}: ${asText(item.command).slice(0, 160)}`);
    }
    if (item.type === 'command_execution' && ev.type === 'item.completed' && /ext-worker guard: refused/.test(item.aggregated_output ?? '')) {
      r.notes.push(`the command guard refused: ${asText(item.command).slice(0, 160)}`);
    }
    if (item.type === 'file_change') {
      for (const c of item.changes ?? []) {
        const full = path.resolve(ctx.worktree, c.path ?? '');
        if (!within(full, writable(ctx))) r.violations.push(`edited a file outside its worktree: ${c.path}`);
      }
    }
    if (item.type === 'agent_message' && ev.type === 'item.completed') r.summary = item.text ?? r.summary;
  }
  return r;
}

const GROK_SHELL = new Set(['run_terminal_command', 'run_terminal_cmd', 'Bash', 'Shell']);
const GROK_ALLOWED = new Set([...GROK_SHELL, 'read_file', 'list_dir', 'grep', 'search_replace', 'write', 'todo_write']);

// Grok: a tool call carries its raw input; a tool outside the allowlist means --tools stopped doing what it says.
function auditGrok(lines, ctx) {
  const r = { violations: [], notes: [], summary: '', completed: false, errors: [], commands: 0, stop: null };
  for (const ev of lines) {
    if (ev.type === 'text') r.summary += ev.data ?? '';
    else if (ev.type === 'end') {
      r.stop = ev.stopReason ?? null;
      r.completed = r.stop === 'end_turn';
    } else if (ev.type === 'error') r.errors.push(asText(ev.message ?? ev.data ?? JSON.stringify(ev)).slice(0, 300));
    else if (ev.type === 'tool_call') {
      const name = ev.toolName ?? ev.kind ?? 'unknown';
      const input = ev.rawInput ?? {};
      if (!GROK_ALLOWED.has(name)) r.violations.push(`used a tool outside its allowlist: ${name}`);
      if (GROK_SHELL.has(name)) {
        r.commands += 1;
        for (const v of commandViolations(asText(input.command), ctx)) r.violations.push(`${v}: ${asText(input.command).slice(0, 160)}`);
      } else {
        const p = String(input.file_path ?? input.target_file ?? input.path ?? input.directory ?? '');
        for (const v of pathViolations(p, ctx)) r.violations.push(`${v} with ${name}: ${p}`);
        if (/^(?:write|search_replace)$/.test(name) && p && !within(path.resolve(ctx.worktree, p), writable(ctx))) {
          r.violations.push(`tried to write outside its worktree: ${p}`);
        }
      }
    } else if (ev.type === 'tool_call_update' && /ext-worker guard: refused/.test(JSON.stringify(ev.content ?? ''))) {
      r.notes.push('the command guard refused a command');
    }
  }
  r.summary = r.summary.trim();
  return r;
}

export function auditStream(engine, text, ctx) {
  const lines = [];
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try {
      lines.push(JSON.parse(l));
    } catch {
      // a partial last line from a killed run
    }
  }
  const r = engine === 'codex' ? auditCodex(lines, ctx) : auditGrok(lines, ctx);
  r.violations = [...new Set(r.violations)];
  return r;
}

// Files that run with someone else's rights: CI with the repo's secrets, git hooks on the next commit outside the
// sandbox, and the settings of whichever agent session next opens this worktree. The audit names them after the run;
// by then the branch may already be pushed, which is why the dispatcher stops every round on that ticket.
export const RUNS_ELSEWHERE = /^(?:\.github\/workflows\/|\.github\/actions\/|\.husky\/|\.claude\/settings(?:\.local)?\.json$|\.claude\/hooks\/|\.mcp\.json$|\.grok\/|\.codex\/|\.cursor\/|\.vscode\/tasks\.json$|\.gitlab-ci\.yml$|\.circleci\/)/;

export function branchHazards(worktree, base) {
  const git = (...a) => execFileSync('git', ['-C', worktree, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
  let files = [];
  try {
    files = git('diff', '--name-only', `${base}...HEAD`).split('\n');
  } catch {
    // no merge base: nothing committed to compare
  }
  try {
    files.push(...git('status', '--porcelain=v1', '--untracked-files=all').split('\n').map((l) => l.slice(3)));
  } catch {
    // not a work tree any more; the caller reports that
  }
  return [...new Set(files.filter((f) => f && RUNS_ELSEWHERE.test(f)))];
}
