#!/bin/bash
# dispatcher-events-watch.sh: wakes the orchestrator session when any machine's dispatcher sends a notice it must act
# on: a ticket still going after longRunNoticeHours, a fleet account signed out, an engine PR merged without review.
# Every dispatcher writes one JSON file per notice to <paths.sharedDir>/orchestrator-events/. Run with Bash
# run_in_background (no &) and re-arm after each wake. Prints one line per new event, remembering what it reported in
# <paths.stateDir>/orchestrator-events-seen. Events older than 2 days are ignored, so a fresh machine does not replay
# history. Exits 2 after 24 hours.
# The repo root, from this script's real path, and the config as AQ_* variables (lib/config.mjs env).
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
ROOT="$(cd -P "$(dirname "$src")/.." && pwd)"
ENV_LINES=$(node "$ROOT/lib/config.mjs" env) || { echo "could not read the config" >&2; exit 1; }
while IFS='=' read -r k v; do printf -v "$k" '%s' "$v"; done <<<"$ENV_LINES"
dir=$AQ_PATHS_SHARED_DIR/orchestrator-events
seen=$AQ_PATHS_STATE_DIR/orchestrator-events-seen
mkdir -p "$AQ_PATHS_STATE_DIR"
touch "$seen"
end=$(( $(date +%s) + 86400 ))
while [ "$(date +%s)" -lt "$end" ]; do
  if [ -d "$dir" ]; then
    out=$(node -e '
      const fs = require("fs"), path = require("path");
      const [dir, seenFile] = process.argv.slice(1);
      const seen = new Set(fs.readFileSync(seenFile, "utf8").split("\n").filter(Boolean));
      const cutoff = Date.now() - 2 * 86400 * 1000;
      const fresh = [];
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
        if (seen.has(f)) continue;
        try {
          const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
          fs.appendFileSync(seenFile, f + "\n");
          if (Date.parse(r.at) < cutoff) continue;
          fresh.push(r);
        } catch {}
      }
      for (const r of fresh) console.log(`EVENT ${r.id ?? "-"} on ${r.host}: ${r.subtitle}: ${r.text}${r.link ? ` (${r.link})` : ""}`);
    ' "$dir" "$seen" 2>/dev/null)
    if [ -n "$out" ]; then echo "$out"; exit 0; fi
  fi
  sleep 60
done
exit 2
