#!/usr/bin/env bash
# Run an adversarial pre-push review of a diff through Codex and Grok in parallel.
#
# Why: a CI review bot runs several review axes and each round costs a push plus
# roughly ten minutes. Two independent model families reviewing the same diff locally
# catch most of what the bot would, before the push (docs/pr-review.md, "Before the
# first push").
#
# Usage:
#   cross-review.sh <worktree-path> [base-ref] [extra-context-file]
#
# Writes one file per reviewer into a scratch directory OUTSIDE the worktree and
# prints both. It never writes inside the worktree, because an untracked artifact
# there dirties the tree and worktree teardown refuses a dirty tree.
#
# House rules: the repo's own review rules (test conventions, architecture layers,
# banned patterns) go in a file as a plain list. The file is CROSS_REVIEW_RULES if
# set, else docs/review-rules.md inside the worktree if it exists. Their violations
# are reported as real findings. extra-context-file is appended after them, for what
# is specific to this one diff.
set -uo pipefail

WORKTREE="${1:?usage: cross-review.sh <worktree-path> [base-ref] [context-file]}"
BASE="${2:-origin/main}"
CONTEXT_FILE="${3:-}"

# ext-agent.sh sits next to this script. Resolve symlinks so it is found when this
# script is linked into a PATH folder.
SELF=$(readlink -f "$0" 2>/dev/null || echo "$0")
EXT="$(cd "$(dirname "$SELF")" && pwd)/ext-agent.sh"

# The inputs may be relative to the caller's directory, and the cd below changes it.
[ -n "$CONTEXT_FILE" ] && [ -f "$CONTEXT_FILE" ] && CONTEXT_FILE="$(cd "$(dirname "$CONTEXT_FILE")" && pwd)/$(basename "$CONTEXT_FILE")"
[ -n "${CROSS_REVIEW_RULES:-}" ] && [ -f "$CROSS_REVIEW_RULES" ] && CROSS_REVIEW_RULES="$(cd "$(dirname "$CROSS_REVIEW_RULES")" && pwd)/$(basename "$CROSS_REVIEW_RULES")"

cd "$WORKTREE" || { echo "no such worktree: $WORKTREE" >&2; exit 1; }
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "not a git worktree: $WORKTREE" >&2; exit 1; }
WORKTREE=$(pwd)

SCRATCH="${CROSS_REVIEW_DIR:-${TMPDIR:-/tmp}/cross-review}"
OUT="$SCRATCH/$(basename "$WORKTREE")-$(git rev-parse --short HEAD)"
mkdir -p "$OUT"

DIFF_FILE="$OUT/diff.patch"
git diff "$BASE"...HEAD > "$DIFF_FILE"
BYTES=$(wc -c < "$DIFF_FILE" | tr -d ' ')
if [ "$BYTES" -eq 0 ]; then
  echo "no diff against $BASE, nothing to review" >&2
  exit 1
fi
echo "reviewing $BYTES bytes of diff against $BASE"

EXTRA=""
[ -n "$CONTEXT_FILE" ] && [ -f "$CONTEXT_FILE" ] && EXTRA=$(cat "$CONTEXT_FILE")

RULES_FILE="${CROSS_REVIEW_RULES:-$WORKTREE/docs/review-rules.md}"
RULES=""
[ -f "$RULES_FILE" ] && RULES="House rules this repo enforces, so violations are real findings:
$(cat "$RULES_FILE")"

read -r -d '' PROMPT <<PROMPTEOF
You are an adversarial code reviewer.

Review the diff in $DIFF_FILE. Read the surrounding files for context before judging anything; the diff alone is not enough.

Report ONLY defects you can defend with a concrete failure scenario: specific inputs or state, leading to a specific wrong output, crash, or silent no-op. Rank most severe first. If you find nothing real, say so plainly rather than manufacturing nits.

$RULES

Look hardest at these, which codebases get wrong repeatedly:
- A guard that appears to block but sits behind a condition that is false on the common path.
- A fix applied at one call site while sibling call sites keep the old behavior.
- Window and boundary comparisons: a strict < where an inclusive <= is meant, silently dropping the current period.
- A persisted payload whose read side tightened without back-compat for rows written before the change.
- Copy or a status that asserts something wider than the data actually supports.

$EXTRA

Output as a numbered list. For each: file:line, one sentence stating the defect, then the concrete failure scenario. End with a one-line verdict: SAFE TO PUSH or BLOCK, and why.
PROMPTEOF

echo "$PROMPT" > "$OUT/prompt.txt"

# ext-agent.sh keeps both reviewers read-only (a reviewer that edits the worktree
# changes the code under review) and bounds each run with a timeout. --raw because
# the prompt above carries its own output format.
( "$EXT" codex "$OUT/codex.md" --cwd "$WORKTREE" --raw --effort high --timeout 1500 "$OUT/prompt.txt" >/dev/null 2>"$OUT/codex.err" ) &
CODEX_PID=$!
( "$EXT" grok "$OUT/grok.md" --cwd "$WORKTREE" --raw --effort high --timeout 1500 "$OUT/prompt.txt" >/dev/null 2>"$OUT/grok.err" ) &
GROK_PID=$!

wait $CODEX_PID; CODEX_STATUS=$?
wait $GROK_PID; GROK_STATUS=$?

echo
echo "================ CODEX ================"
cat "$OUT/codex.md" 2>/dev/null || echo "(no output)"
tail -3 "$OUT/codex.err" 2>/dev/null
echo
echo "================ GROK ================="
cat "$OUT/grok.md" 2>/dev/null || echo "(no output)"
tail -3 "$OUT/grok.err" 2>/dev/null
echo
echo "artifacts in $OUT"

# A reviewer that failed reviewed nothing, so `cross-review.sh && git push` must stop.
if [ "$CODEX_STATUS" -ne 0 ] || [ "$GROK_STATUS" -ne 0 ]; then
  echo "codex exit $CODEX_STATUS, grok exit $GROK_STATUS: rerun the failed reviewer before pushing" >&2
  exit 1
fi
