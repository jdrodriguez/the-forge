#!/bin/bash
# merge-approved.sh <pr>...: merges approved PRs, one at a time, in the order given. Before each merge it checks that
# main is not red (main-state.json), that the PR is still green and clean, and runs the pre-merge check against
# current main. It merges only on a pass, at the head SHA it checked, and stops at the first PR that does not pass.
# The repo root, from this script's real path, and the config as AQ_* variables (lib/config.mjs env).
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
ROOT="$(cd -P "$(dirname "$src")/.." && pwd)"
ENV_LINES=$(node "$ROOT/lib/config.mjs" env) || { echo "could not read the config" >&2; exit 1; }
while IFS='=' read -r k v; do printf -v "$k" '%s' "$v"; done <<<"$ENV_LINES"
cd "$AQ_REPO_PATH" || exit 1
fixes_label=${AQ_GITHUB_FIXES_MAIN_LABEL:-fixes-main}
owner=${AQ_GITHUB_REPO%%/*}
name=${AQ_GITHUB_REPO#*/}
for pr in "$@"; do
  # A red main holds every merge except the one that fixes it: a PR labeled github.fixesMainLabel, or a revert.
  if node -e 'const s=require(process.argv[1]); process.exit(s.status==="red"?0:1)' "$AQ_PATHS_SHARED_DIR/main-state.json" 2>/dev/null; then
    fixes=$(gh pr view "$pr" --json title,labels -q "[(.labels[].name == \"$fixes_label\"), (.title | startswith(\"Revert \\\"\"))] | any")
    if [ "$fixes" != true ]; then echo "STOP before #$pr: main is red"; exit 1; fi
    echo "main is red, but #$pr fixes it ($fixes_label label or a revert), so it may merge"
  fi
  # GitHub recomputes mergeability after main moves and reads UNKNOWN meanwhile; give it up to two minutes.
  for _ in 1 2 3 4 5 6 7 8; do
    read -r head state <<<"$(gh pr view "$pr" --json headRefOid,mergeStateStatus -q '"\(.headRefOid) \(.mergeStateStatus)"')"
    [ "$state" != UNKNOWN ] && break
    sleep 15
  done
  failing=$(gh pr checks "$pr" --json bucket -q '[.[]|select(.bucket=="fail" or .bucket=="pending")]|length')
  if [ "$state" != CLEAN ] && [ "$state" != UNSTABLE ]; then echo "STOP at #$pr: merge state $state"; exit 1; fi
  if [ "$failing" != 0 ]; then echo "STOP at #$pr: $failing check(s) failing or pending"; exit 1; fi
  out=$(node "$ROOT/dispatcher/premerge-check.mjs" "$pr" 2>&1); rc=$?
  echo "$out" | tail -1
  if [ $rc -ne 0 ]; then echo "STOP at #$pr: pre-merge check did not pass"; echo "$out" | tail -8; exit 1; fi
  # With a merge queue on main, gh refuses --delete-branch and a successful call only enqueues the PR. The branch is
  # deleted below once the PR reads MERGED (a queued branch cannot be deleted). Without a queue the PR is MERGED on
  # the first look below.
  if ! gh pr merge "$pr" --squash --match-head-commit "$head" >/dev/null 2>&1 && [ "$(gh pr view "$pr" --json state -q .state)" != MERGED ]; then
    echo "STOP at #$pr: merge refused"; exit 1
  fi
  # A queue runs its checks before landing. Wait up to 30 minutes. The PR's own entry can lag the enqueue, so
  # "not queued" counts as a drop only after the first minute.
  st=OPEN
  for i in $(seq 1 60); do
    read -r st queued <<<"$(gh api graphql -f query="query{repository(owner:\"$owner\",name:\"$name\"){pullRequest(number:$pr){state mergeQueueEntry{state}}}}" -q '.data.repository.pullRequest | "\(.state) \(.mergeQueueEntry.state // "none")"')"
    [ "$st" = MERGED ] && break
    if [ "$queued" = none ] && [ "$i" -gt 2 ]; then echo "STOP at #$pr: left the merge queue without merging"; exit 1; fi
    sleep 30
  done
  if [ "$st" != MERGED ]; then echo "STOP at #$pr: still in the merge queue after 30 minutes"; exit 1; fi
  branch=$(gh pr view "$pr" --json headRefName -q .headRefName)
  [ "$(git ls-remote --heads origin "$branch" | wc -l)" -gt 0 ] && gh api -X DELETE "repos/$AQ_GITHUB_REPO/git/refs/heads/$branch" >/dev/null 2>&1
  echo "MERGED #$pr as $(gh pr view "$pr" --json mergeCommit -q .mergeCommit.oid | cut -c1-10)"
  node "$ROOT/inbox/merged-to-verifying.mjs" "$pr" || echo "#$pr: could not check its ticket's Linear state"
done
echo "ALL MERGED"
