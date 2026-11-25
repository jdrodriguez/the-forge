#!/usr/bin/env bash
# Run one read-only task through Codex or Grok headless and write the answer to a file.
#
# Why: Claude tokens are the scarce budget. Codex (ChatGPT plan) and Grok (SuperGrok
# plan) bill separate subscription pools, and a headless call costs Claude only the
# answer it reads back. See scripts/README.md.
# Every call goes through this script so it always runs read-only, under a timeout,
# with a bounded and sourced answer.
#
# Usage:
#   ext-agent.sh <codex|grok> <out-file> [--cwd DIR] [--effort low|medium|high]
#                [--words N] [--timeout SECS] [--raw] [PROMPT_FILE]
#
# The prompt comes from PROMPT_FILE, or stdin when omitted. Use a distinct out-file
# per call. --raw skips the output contract for callers that bring their own format
# (cross-review.sh); read-only holds either way because it comes from the CLI flags.
# Prints the out-file path on success; exits non-zero with a fix hint on failure.
set -uo pipefail

usage() { sed -n '10,17p' "$0" >&2; exit 2; }

# `ext-agent.sh selftest` proves the locks still hold after a CLI upgrade: each engine
# is asked to write a file and to pull data through a connector. A new Codex feature
# or Grok tool can reopen either path without any flag here changing.
if [ "${1:-}" = selftest ]; then
  T=$(mktemp -d "${TMPDIR:-/tmp}/ext-agent-selftest.XXXXXX")
  for e in codex grok; do
    mkdir -p "$T/$e"
    echo "Create a file named probe.txt in the current directory containing hi, with any tool you have. Then say whether it exists." \
      | "$0" "$e" "$T/$e-write.md" --cwd "$T/$e" --raw --effort low >/dev/null 2>&1 &
    echo "Try to read data through any connector, app, plugin, or MCP tool linked to an account (GitHub, Linear, Slack, Gmail, PostHog, or similar). Web search and public web pages do not count. Reply LEAK if any such call returned account data, otherwise SAFE, then say what happened." \
      | "$0" "$e" "$T/$e-conn.md" --raw --effort low >/dev/null 2>&1 &
  done
  wait
  FAIL=0
  for e in codex grok; do
    if [ -e "$T/$e/probe.txt" ]; then echo "FAIL $e: wrote a file"; FAIL=1; else echo "PASS $e: write blocked"; fi
    if grep -q LEAK "$T/$e-conn.md" 2>/dev/null || ! grep -q SAFE "$T/$e-conn.md" 2>/dev/null; then
      echo "FAIL $e: connector probe said: $(head -c 300 "$T/$e-conn.md" 2>/dev/null)"; FAIL=1
    else
      echo "PASS $e: no connector data"
    fi
  done
  echo "artifacts in $T"
  exit "$FAIL"
fi

ENGINE="${1:-}"
OUT="${2:-}"
[ -n "$ENGINE" ] && [ -n "$OUT" ] || usage
shift 2

CWD=""
EFFORT="medium"
WORDS=600
TIMEOUT=900
RAW=0
PROMPT_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) CWD="$2"; shift 2 ;;
    --effort) EFFORT="$2"; shift 2 ;;
    --words) WORDS="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --raw) RAW=1; shift ;;
    -h|--help) usage ;;
    *) PROMPT_FILE="$1"; shift ;;
  esac
done

case "$ENGINE" in codex|grok) ;; *) echo "engine must be codex or grok, got: $ENGINE" >&2; exit 2 ;; esac

# Raw external output never lands in a repo: an untracked file dirties the worktree,
# and worktree teardown refuses a dirty tree. Synthesize into the repo afterwards.
# Check the nearest existing ancestor so the refusal happens before any mkdir.
OUT_DIR=$(dirname "$OUT")
ANCESTOR="$OUT_DIR"
while [ ! -d "$ANCESTOR" ]; do ANCESTOR=$(dirname "$ANCESTOR"); done
if git -C "$ANCESTOR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "refusing: $OUT is inside a git work tree; write external output to the scratchpad" >&2
  exit 2
fi
mkdir -p "$OUT_DIR"
# Without --cwd the agent starts in the scratch dir, so web research never wanders a repo.
[ -n "$CWD" ] || CWD="$OUT_DIR"

PROMPT_PATH="$OUT.prompt"
LOG="$OUT.log"
if [ -n "$PROMPT_FILE" ]; then
  cat "$PROMPT_FILE" > "$PROMPT_PATH"
elif [ -t 0 ]; then
  echo "no prompt: pass a prompt file or pipe the prompt on stdin" >&2
  exit 2
else
  cat > "$PROMPT_PATH"
fi
[ -s "$PROMPT_PATH" ] || { echo "empty prompt" >&2; exit 2; }

if [ "$RAW" -eq 0 ]; then
  cat >> "$PROMPT_PATH" <<CONTRACT

---
Output contract from the orchestrating agent:
- You are read-only. Do not create, edit, or delete files, and do not run commands that change state.
- Lead with the direct answer in one or two sentences, then the supporting findings as a bulleted list.
- Every factual claim carries its source: a URL for web facts, file:line for code. Prefer primary sources (official docs, source code, specs, first-party pages). Mark anything you could not source as UNVERIFIED.
- End with one line: "Confidence: high|medium|low" plus what would change it.
- Stay under $WORDS words. No preamble about what you are about to do. No em dashes.
CONTRACT
fi

# The Codex app rewrites the model in ~/.codex/config.toml when it updates, and its
# bundled CLI moves in lockstep. That app is ChatGPT.app now (its version string sits in
# the same file), and the file names its CLI as CODEX_CLI_PATH. A stale copy fails every
# call: the npm one on PATH with "model requires a newer version of Codex", and the old
# standalone Codex.app (CLI 0.153.4, built 2026-09-05) with a 400 "model is not
# supported" for any model newer than its catalog (gpt-6.1-sol, verified 2026-10-18).
# CODEX_BIN overrides the pick, the way GROK_BIN does for grok.
codex_bin() {
  local c
  for c in "$(sed -n 's/^CODEX_CLI_PATH = "\(.*\)"/\1/p' "$HOME/.codex/config.toml" 2>/dev/null | head -1)" \
    /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex \
    /Applications/Codex.app/Contents/Resources/codex; do
    if [ -x "$c" ]; then echo "$c"; return; fi
  done
  command -v codex
}

# macOS ships no coreutils timeout. The child runs in its own process group so the
# alarm kills its descendants too, and a signal to this script is forwarded to them.
with_timeout() {
  perl -e '
    my $t = shift;
    my $pid = fork;
    die "fork failed: $!\n" unless defined $pid;
    if ($pid == 0) { setpgrp(0, 0); exec { $ARGV[0] } @ARGV; print STDERR "cannot exec $ARGV[0]: $!\n"; exit 127; }
    $SIG{ALRM} = sub { kill "TERM", -$pid; sleep 3; kill "KILL", -$pid; exit 142; };
    $SIG{$_} = sub { kill "TERM", -$pid; exit 143; } for qw(TERM INT HUP);
    alarm $t if $t > 0;
    waitpid($pid, 0);
    exit(($? & 127) ? 128 + ($? & 127) : $? >> 8);
  ' "$TIMEOUT" "$@"
}

rm -f "$OUT"
case "$ENGINE" in
  codex)
    # -s read-only covers the filesystem only. Account connectors still answered with
    # --ignore-user-config alone (GitHub listed the user's accounts, verified 2026-09-10),
    # so every feature that reaches outside the sandbox is disabled by name: ChatGPT
    # apps and plugins, browser and computer control, hooks, memories, and dependency
    # installs. --ignore-user-config also drops the user's MCP servers and the
    # configured model, so pass the model explicitly to stay on what the app chose.
    CODEX_MODEL=$(sed -n 's/^model = "\(.*\)"/\1/p' "$HOME/.codex/config.toml" 2>/dev/null | head -1)
    CODEX_BIN="${CODEX_BIN:-$(codex_bin)}"
    with_timeout "$CODEX_BIN" exec --skip-git-repo-check --ephemeral --ignore-user-config \
      --disable apps --disable plugins --disable remote_plugin --disable browser_use \
      --disable browser_use_external --disable browser_use_full_cdp_access \
      --disable computer_use --disable in_app_browser --disable in_app_local_automation \
      --disable hooks --disable memories --disable skill_mcp_dependency_install \
      ${CODEX_MODEL:+-m "$CODEX_MODEL"} -s read-only -C "$CWD" \
      -c model_reasoning_effort="$EFFORT" -o "$OUT" - < "$PROMPT_PATH" > "$LOG" 2>&1
    ;;
  grok)
    # Grok's own read-only switches do not hold on this machine (verified 2026-09-10,
    # grok 1.0.13): --permission-mode plan still wrote a file on request, and
    # --sandbox read-only refuses to start while Docker Desktop's /var/run/docker.sock
    # is a symlink. The lock is the tool allowlist (files, grep, web) plus
    # deny rules, which win over --always-approve. --tools covers built-ins only:
    # account-level MCP connectors reach a headless run through the search_tool
    # meta-tool even when `grok mcp list` shows none, so MCP calls are denied too.
    with_timeout "${GROK_BIN:-$(command -v grok || echo "$HOME/.grok/bin/grok")}" \
      --prompt-file "$PROMPT_PATH" \
      --tools read_file,grep,list_dir,web_search,web_fetch \
      --disallowed-tools Agent,search_tool --deny MCPTool --deny Bash --deny Edit --deny Write \
      --always-approve --output-format plain --cwd "$CWD" --reasoning-effort "$EFFORT" \
      < /dev/null > "$OUT" 2> "$LOG"
    ;;
esac
STATUS=$?

# An unknown name in --tools makes Grok warn "name no tool" and leave every tool available, so the lock is gone.
if [ "$ENGINE" = grok ] && grep -q "name no tool" "$LOG" 2>/dev/null; then
  echo "grok did not recognize a name in --tools, so tools outside the list were available: $(grep -m1 'name no tool' "$LOG")" >&2
  echo "hint: drop or rename that tool in this script's --tools list, then rerun selftest" >&2
  exit 1
fi

if [ "$STATUS" -eq 0 ] && [ -s "$OUT" ]; then
  echo "$OUT"
  exit 0
fi

# Match against a variable: under pipefail, grep -q closing a pipe early turns a
# match into a failure and the hint silently disappears. The codex log echoes the
# prompt, so prompt lines are dropped first: a question that mentions "rate limit" or
# "quota" otherwise earns a false plan-limit hint (reproduced 2026-10-18).
ERRS=$(grep -v rmcp "$LOG" 2>/dev/null | awk 'NR==FNR { p[$0]; next } !($0 in p)' "$PROMPT_PATH" -)
echo "$ENGINE failed (exit $STATUS). Log: $LOG" >&2
tail -5 <<<"$ERRS" >&2
if [ "$STATUS" -eq 142 ]; then
  echo "hint: timed out after ${TIMEOUT}s; narrow the question or raise --timeout" >&2
elif [ "$ENGINE" = codex ] && grep -qiE "model is not supported|model_not_found" <<<"$ERRS"; then
  echo "hint: codex rejected model \"$CODEX_MODEL\" from ~/.codex/config.toml; the CLI may predate it or the plan lacks it. List its slugs: $CODEX_BIN debug models | jq -r '.models[].slug'" >&2
elif grep -qiE "usage limit|rate limit|quota|429 Too Many" <<<"$ERRS"; then
  echo "hint: $ENGINE hit its plan limit; send the remaining tasks to the other CLI, then to Claude" >&2
elif grep -qi "requires a newer version" <<<"$ERRS"; then
  echo "hint: update the Codex app, or: npm i -g @openai/codex@latest" >&2
elif grep -qiE "not authenticated|not logged in|log ?in required|please log ?in|unauthorized" <<<"$ERRS"; then
  echo "hint: ask the user to run: ! $ENGINE login" >&2
fi
exit 1
