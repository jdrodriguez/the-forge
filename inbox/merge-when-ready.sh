#!/bin/bash
# merge-when-ready.sh <pr>: waits up to 75 minutes for a PR to become mergeable (CLEAN or UNSTABLE with no check still
# pending, which needs green required checks and the review bot's approval), then merges it through merge-approved.sh.
# Prints why it stopped. With a review bot that re-reviews only on request, a push to a reviewed PR leaves the review
# check (github.reviewCheck) failed with "Re-review not requested" until github.rerunLabel is added, so it adds that
# label once when it sees that check and the label is absent. With rerunLabel unset it never adds one.
pr=$1
# The repo root, from this script's real path, and the config as AQ_* variables (lib/config.mjs env).
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
ROOT="$(cd -P "$(dirname "$src")/.." && pwd)"
ENV_LINES=$(node "$ROOT/lib/config.mjs" env) || { echo "could not read the config" >&2; exit 1; }
while IFS='=' read -r k v; do printf -v "$k" '%s' "$v"; done <<<"$ENV_LINES"
cd "$AQ_REPO_PATH" || exit 1
check=${AQ_GITHUB_REVIEW_CHECK:-}
rerun=${AQ_GITHUB_RERUN_LABEL:-}
relabeled=
for _ in $(seq 1 75); do
  state=$(gh pr view "$pr" --json state,mergeStateStatus -q '"\(.state) \(.mergeStateStatus)"' 2>/dev/null)
  case "$state" in
    MERGED*) echo "#$pr already merged"; exit 0 ;;
    CLOSED*) echo "#$pr is closed"; exit 1 ;;
    *DIRTY) echo "#$pr conflicts with main"; exit 1 ;;
    *CLEAN|*UNSTABLE)
      pending=$(gh pr checks "$pr" --json bucket -q '[.[] | select(.bucket == "pending")] | length' 2>/dev/null)
      [ "$pending" = "0" ] && exec "$ROOT/inbox/merge-approved.sh" "$pr" ;;
  esac
  if [ -z "$relabeled" ] && [ -n "$check" ] && [ -n "$rerun" ]; then
    read -r head labels < <(gh pr view "$pr" --json headRefOid,labels -q '"\(.headRefOid) \([.labels[].name] | join(","))"' 2>/dev/null)
    title=$(gh api "repos/$AQ_GITHUB_REPO/commits/$head/check-runs?check_name=$(node -p 'encodeURIComponent(process.argv[1])' "$check")" \
      -q '.check_runs | sort_by(.started_at) | last | .output.title // ""' 2>/dev/null)
    case "$title,$labels" in
      *"$rerun"*) ;;
      "Re-review not requested"*) gh pr edit "$pr" --add-label "$rerun" >/dev/null && relabeled=1 && echo "#$pr: added $rerun" ;;
    esac
  fi
  sleep 60
done
echo "#$pr not mergeable after 75 minutes: $state"
exit 1
