#!/bin/bash
# orch.sh [label]: opens Claude Code in this terminal on one of the fleet's accounts, in workspaceCwd, and runs
# /forge-takeover, so that account becomes the orchestrator in one step. With no label it picks the signed-in account
# with the most weekly usage left (fleet.sh usage --json). Labels are the fleet's: a is ~/.claude, b is ~/.claude-b.
set -u
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
ROOT="$(cd -P "$(dirname "$src")/.." && pwd)"
label="${1:-}"
if [ -z "$label" ]; then
  label=$(bash "$ROOT/fleet/fleet.sh" usage --json 2>/dev/null | node -e '
let best = null;
for (const a of JSON.parse(require("fs").readFileSync(0, "utf8"))) {
  const w = a.usage?.weekly?.remaining_percentage;
  if (a.signed_in && typeof w === "number" && (!best || w > best.w)) best = { label: a.label, w };
}
if (best) console.log(best.label);' 2>/dev/null)
  [ -z "$label" ] && { echo "orch: no signed-in account with a known weekly figure; pass a label (see fleet.sh usage)"; exit 1; }
  echo "orch: using account $label (most weekly usage left)"
fi
cwd=$(node "$ROOT/lib/config.mjs" get workspaceCwd 2>/dev/null) || cwd=$HOME
cd "$cwd" || exit 1
if [ "$label" = a ]; then exec env -u CLAUDE_CONFIG_DIR claude "/forge-takeover"; fi
dir="$HOME/.claude-$label"
[ -d "$dir" ] || { echo "orch: no config folder $dir"; exit 1; }
exec env CLAUDE_CONFIG_DIR="$dir" claude "/forge-takeover"
