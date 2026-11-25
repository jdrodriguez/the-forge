#!/bin/bash
# takeover.sh [session]: makes the session that runs it the orchestrator, on any Claude account and in any app. The
# forge-takeover skill runs it. It moves the driver lock (orchestrator.lockFile) to the session, renews the lease, and
# prints the handoff note, the approved heads not yet merged, and whether this session's watcher is running. Only the
# human decides which session drives: nothing runs this on its own.
set -u
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
INBOX="$(cd -P "$(dirname "$src")" && pwd)"
ROOT="$(cd "$INBOX/.." && pwd)"
me="${1:-${CLAUDE_CODE_SESSION_ID:-}}"
if [ -z "$me" ]; then
  echo "takeover: no session id. CLAUDE_CODE_SESSION_ID is not set in this shell; pass the id as the first argument."
  exit 1
fi
node "$INBOX/orchestrator.mjs" take "$me" || exit 1
node "$INBOX/orchestrator.mjs" renew "$me"
echo "LEASE: $(node "$INBOX/orchestrator.mjs" status)"
echo "Account email for this session: ${CLAUDE_CODE_USER_EMAIL:-unknown (a terminal session does not report it)}"
echo

note=$(node "$ROOT/lib/config.mjs" get orchestrator.handoffFile 2>/dev/null) || note="$(node "$ROOT/lib/config.mjs" get paths.sharedDir)/ORCHESTRATOR.md"
if [ -f "$note" ]; then
  echo "===== $note"
  cat "$note"
else
  echo "===== no handoff note at $note yet; start one with what is in flight"
fi
echo

# Approvals are tied to a PR head, so a new driver merges what the last one approved without reviewing it again. A
# STALE line means the PR moved past its approved head and needs a new review.
echo "===== approved heads not yet merged (merge the current ones with: merge-approved.sh --all-approved)"
bash "$INBOX/merge-approved.sh" --approved
echo

pid=$(node "$INBOX/orchestrator.mjs" watcher "$me")
case "$pid" in
  *mine) echo "WATCHER: this session's watcher is running (PID ${pid% *})." ;;
  *other) echo "WATCHER: a watcher another session started is running (PID ${pid% *}). It wakes only that session, so arm your own." ;;
  *) echo "WATCHER: none running." ;;
esac
echo "NEXT: run 'node $INBOX/orchestrator-watch.mjs' with Bash run_in_background (never &), then work the handoff note."
