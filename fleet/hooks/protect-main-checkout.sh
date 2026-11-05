#!/usr/bin/env bash
# protect-main-checkout.sh: PreToolUse hook that keeps Claude sessions out of the repo's main checkout.
#
# Every account mirrors the shared ~/.claude/settings.json (fleet/setup/mirror-config-dir.sh), so every session
# runs this. Branch work belongs in a worktree under <checkout>/<worktreesDir>. The main checkout stays clean so
# it can fast-forward, and every worker cuts its worktree from a current main.
#
# Blocks (exit 2, reason on stderr):
#   Edit, Write, MultiEdit, NotebookEdit on a path inside a protected checkout
#   Bash git that changes a protected checkout: add am apply checkout cherry-pick clean commit merge mv
#     pull rebase reset restore revert rm stash switch, run there, through -C, or through GIT_DIR or
#     GIT_WORK_TREE (set on the command, assigned earlier or exported). Forms that change nothing pass:
#     --help and -h, merge and pull --ff-only, stash list and show, commit --dry-run, add, mv and rm with
#     -n or --dry-run, clean -n or --dry-run, and apply --check, --stat, --numstat or --summary without
#     --index, --cached, --3way or --apply.
#   Bash writes into a protected checkout through >, >>, >|, &>, tee, sed -i, cp, mv (either end), touch
#     or rm
#   Any mention of the escape-hatch file name, in any letter case
# Paths are compared without regard to letter case, as macOS's file system ignores it.
# Allowed: everything under each worktree folder, and file writes under each writable folder, which should be
# one the checkout's .gitignore ignores (a build skill's state folder, say). Git run from inside a writable
# folder acts on the checkout itself, so it is still blocked.
# Known limits, by design or left as they are:
#   git config passes. git pull --ff-only passes by design, since a sync job fast-forwards the same way.
#   Programs that write files themselves (python, perl, node and the like) and sed's w command pass.
#   Commands joined by && or || are checked in order whatever the outcome, so false && cd /tmp; git reset
#     --hard passes and false && cd <checkout>; echo x > file blocks.
#   Any mention of the hatch name blocks by design, even a search such as rg allow-main-checkout-edits.
#   An exit caused by a signal (143 after SIGTERM, for example) is never 2, so it never blocks.
# Escape hatch, for the human only: touch ~/.claude/allow-main-checkout-edits in their own terminal,
# or start the session with CLAUDE_ALLOW_MAIN_CHECKOUT=1.
# What is protected comes from the repo config (agent-queue.config.json at the repo root, or the file
# AGENT_QUEUE_CONFIG names): repoPath, worktreesDir and fleet.mainCheckoutWritableDirs. With no repoPath the
# hook protects nothing. Env, each one overriding the config:
#   CLAUDE_PROTECTED_CHECKOUTS  colon-separated roots
#   CLAUDE_PROTECTED_WORKTREES  colon-separated worktree folders under each root (default .claude/worktrees)
#   CLAUDE_PROTECTED_WRITABLE   colon-separated writable folders under each root (default none)
#
# The decision comes from protect-main-checkout-parse.pl next to this file, which parses Bash commands
# the way bash does: quoted text and heredoc bodies are data, variables and cd are followed in order,
# and a path it cannot resolve is skipped. This file only prints the reason.
# Fails open (exit 0) when perl or the parser is missing or fails, so a broken machine never locks
# every session out.

[ "${CLAUDE_ALLOW_MAIN_CHECKOUT:-}" = 1 ] && exit 0
[ -e "$HOME/.claude/allow-main-checkout-edits" ] && exit 0

# This file's real folder, so a symlink to the hook still finds the parser and the repo config. bash 3.2 has no
# readlink -f.
self="${BASH_SOURCE[0]}"
while [ -L "$self" ]; do
  link="$(readlink "$self")"
  case "$link" in
    /*) self="$link" ;;
    *) case "$self" in */*) self="${self%/*}/$link" ;; *) self="$link" ;; esac ;;
  esac
done
case "$self" in
  */*) here="${self%/*}" ;;
  *) here=. ;;
esac

# The words the messages use, from the repo config when jq can read it: the human's name, the first worktree
# folder and the base branch.
message_words() {
  local cfg="${AGENT_QUEUE_CONFIG:-}" out=""
  if [ -z "$cfg" ]; then cfg="$(cd -P "$here/../.." 2>/dev/null && pwd -P)/agent-queue.config.json"; fi
  if [ -f "$cfg" ] && command -v jq >/dev/null 2>&1; then
    out="$(jq -r '(.human.name, .worktreesDir, .github.baseBranch) | (. // "") | tostring | gsub("[[:cntrl:]]"; "")' "$cfg" 2>/dev/null)" || out=""
  fi
  { IFS= read -r WHO; IFS= read -r WT; IFS= read -r BASE; } <<<"$out"
  [ -n "${WHO//[[:space:]]/}" ] || WHO="the human"
  [ -z "${CLAUDE_PROTECTED_WORKTREES:-}" ] || WT="${CLAUDE_PROTECTED_WORKTREES%%:*}"
  [ -n "$WT" ] || WT=".claude/worktrees"
  [ -n "$BASE" ] || BASE=main
}

deny() {
  message_words
  printf 'Blocked: %s.\n' "$1" >&2
  printf 'The main checkout at %s stays clean so it can fast-forward and workers cut their worktrees from it.\n' "$2" >&2
  printf 'Do branch work in a worktree: git -C %s worktree add %s/<slug> -b <branch> origin/%s\n' "$2" "$WT" "$BASE" >&2
  printf 'Only %s can lift this guard. If %s asked for this exact change, stop and ask; do not work around it.\n' "$WHO" "$WHO" >&2
  exit 2
}

deny_hatch() {
  message_words
  printf 'Blocked: only %s may create the main-checkout escape hatch, from their own terminal. Ask %s.\n' "$WHO" "$WHO" >&2
  exit 2
}

# The parser reads the hook input on stdin and prints "hatch", or "deny<TAB><root><TAB><what>",
# or nothing when the call may run.
verdict="$(perl "$here/protect-main-checkout-parse.pl" 2>/dev/null)" || exit 0
case "$verdict" in
  hatch) deny_hatch ;;
  deny$'\t'*$'\t'*)
    rest="${verdict#deny$'\t'}"
    deny "${rest#*$'\t'}" "${rest%%$'\t'*}"
    ;;
esac
exit 0
