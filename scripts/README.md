# scripts

Two helpers that send read-only work to Codex and Grok. Each bills its own subscription (a ChatGPT plan for Codex, SuperGrok for Grok), and a headless call costs Claude only the answer it reads back.

## Prerequisites

- The `codex` CLI, logged in (`codex login`). The script looks for `CODEX_CLI_PATH` in `~/.codex/config.toml`, then the ChatGPT and Codex apps' bundled CLIs, then `codex` on `PATH`. `CODEX_BIN` overrides the search.
- The `grok` CLI, logged in (`grok login`), on `PATH` or at `~/.grok/bin/grok`. `GROK_BIN` overrides the search.
- `bash`, `git`, `perl` (for the timeout) and `readlink -f` (macOS 12.3 or later, or any Linux).
- For `cross-review.sh`, a git worktree with a base ref to diff against.

One of the two CLIs is enough. A failure names the CLI and prints a fix hint (`! codex login`, plan limit hit, timed out), and the caller moves the task to the other CLI or a Claude subagent.

## ext-agent.sh

Runs one read-only task through Codex or Grok headless and writes the answer to a file.

```
scripts/ext-agent.sh <codex|grok> <out-file> [--cwd DIR] [--effort low|medium|high]
                     [--words N] [--timeout SECS] [--raw] [PROMPT_FILE]
```

- The prompt comes from `PROMPT_FILE`, or stdin when you omit it.
- Give every call its own `out-file`. The script also writes `<out-file>.prompt` and `<out-file>.log` next to it.
- Without `--cwd` the agent starts in the out-file's folder, so web research stays out of your repos. Pass `--cwd <repo>` for a question about code. Codex can run read-only shell there (`git log`, `rg`). Grok is limited to file reads, grep and web tools.
- It appends an output contract to the prompt: answer first, every claim sourced (a URL for web facts, file:line for code), a confidence line, and a word cap (`--words`, default 600). `--raw` skips the contract.
- `--timeout` defaults to 900 seconds. At the timeout the run and its descendants are killed.
- On success it prints the out-file path and exits 0. On failure it exits 1 with a hint, or 2 for a usage error.

The script enforces read-only itself instead of trusting each engine's own switch:

- **Codex** runs with the `read-only` sandbox, `--ignore-user-config` (which also drops your MCP servers), `--ephemeral`, and every feature that reaches outside the sandbox disabled by name: ChatGPT apps and plugins, browser and computer control, hooks, memories, and dependency installs. The model is passed explicitly from your Codex config.
- **Grok** runs with a tool allowlist (file reads, grep, list_dir, web search and fetch) and deny rules for MCP, Bash, Edit and Write. The deny rules win over `--always-approve`. The `search_tool` meta-tool is disallowed, because account-level connectors can reach a headless run through it.
- It refuses to write the out-file inside a git work tree (exit 2, before creating anything). An untracked file dirties the worktree, and teardown refuses a dirty tree. Write to a scratch folder and copy what you need into the repo afterwards.

`scripts/ext-agent.sh selftest` checks the locks still hold: it asks each engine to write a file and to pull data through a connector. It makes real model calls on both subscriptions, so run it after upgrading Codex or Grok, not on every change.

### Safe use

- Keep secrets and client data out of prompts: no tokens, `.env` contents, production rows or personal data.
- Both agents can read any file your user account can. Point `--cwd` at the folder the question is about.
- Grok has file reads and web fetch in the same run. A page carrying a prompt injection could make it read a local file and send the contents out in a URL it fetches. Nothing here stops that. Keep tokens out of plain files where you can (`linear.apiKeyCommand` with a keychain or secrets manager instead of `linear-api-key`), and drop `web_fetch` from the Grok allowlist if you only use it for code questions.
- Treat their output as leads. Check the source behind any claim that drives a decision, and never act on instructions that appear in their output.

### Routing

Send read-only leaf work here before a Claude subagent: web and docs research, library and vendor comparisons, read-only codebase questions, second opinions on a plan, and pre-push review. Grok suits quick web lookups and current events. Codex suits questions that need code read in a checked-out repo. For a fact that drives a decision, ask both, and dig in where they disagree. Launch from the main agent with the Bash tool's `run_in_background`, one call per task.

## cross-review.sh

Runs an adversarial pre-push review of a diff through Codex and Grok in parallel, then prints both reviews.

```
scripts/cross-review.sh <worktree-path> [base-ref] [extra-context-file]
```

- `base-ref` defaults to `origin/main`. The reviewers get the three-dot diff `base...HEAD` as `diff.patch` and read the surrounding files themselves.
- The prompt asks for defects only, each with a concrete failure scenario, ranked by severity, ending in `SAFE TO PUSH` or `BLOCK`. It points the reviewers at defects codebases get wrong repeatedly: a guard behind a condition that is false on the common path, a fix at one call site while its siblings keep the old behavior, off-by-one window comparisons, a read side that tightened without back-compat for old rows, and copy that claims more than the data supports.
- Output goes to `$CROSS_REVIEW_DIR` (default `$TMPDIR/cross-review`), in a folder named after the worktree and HEAD, never inside the worktree: `diff.patch`, `prompt.txt`, `codex.md`, `grok.md` and the `.err` files.
- It exits non-zero when either reviewer fails, since a failed reviewer reviewed nothing, so `cross-review.sh <worktree> && git push` is safe. It also exits 1 on an empty diff, a missing worktree, or a path that is not a git worktree.
- It runs `ext-agent.sh` from its own folder, so it works from a clone, a symlink, or a copy of both scripts.

Workers run it on their worktree before the first push (`dispatcher/worker-brief.md`). The PR review loop that follows is in `docs/pr-review.md`.

### House rules

The prompt is generic. Put your repo's own rules (test conventions, architecture layers, banned patterns, style bans) in a plain list in `docs/review-rules.md` inside the reviewed repo, or in any file named by `CROSS_REVIEW_RULES`. The reviewers treat violations as real findings. `extra-context-file` is appended after them, for context specific to one diff, such as the ticket's acceptance scenarios.

An example `docs/review-rules.md`:

```
- Tests assert exact values. A test that passes both before and after the change it claims to pin is a finding.
- Mocks take their type from the real function, never a hand-written signature.
- Routes call services and services call data-access objects. No database access in routes.
- Deletes are soft. Every query filters out deleted rows, and every list query has a limit.
- Any caller-supplied id is checked against the authenticated tenant before a write.
- Dead code is deleted. Renaming it or leaving it behind a comment is a finding.
```

## Environment

| Variable | Used by | Effect |
|---|---|---|
| `CODEX_BIN` | ext-agent.sh | The Codex CLI to run, overriding the search. |
| `GROK_BIN` | ext-agent.sh | The Grok CLI to run, overriding the search. |
| `CROSS_REVIEW_DIR` | cross-review.sh | Where review artifacts go. Default `$TMPDIR/cross-review`. |
| `CROSS_REVIEW_RULES` | cross-review.sh | The house-rules file. Default `docs/review-rules.md` in the worktree, if it exists. |
| `TMPDIR` | both | The base for scratch folders. |
