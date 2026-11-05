#!/bin/bash
# merge-request-watch.sh: wakes the orchestrator session when a dispatcher hands it a green PR to review and merge
# (finished, green, built-to-spec work never waits on the human's merge button). Every dispatcher writes
# <paths.sharedDir>/merge-requests/<ID>.json for a green PR that touches reviewed paths. Run with Bash
# run_in_background (no &) and re-arm after each wake. Prints one line per new request (id, PR, head, host, reviewed
# paths), remembering what it reported in <paths.stateDir>/merge-requests-seen. Exits 2 after 24 hours.
# The repo root, from this script's real path, and the config as AQ_* variables (lib/config.mjs env).
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
ROOT="$(cd -P "$(dirname "$src")/.." && pwd)"
ENV_LINES=$(node "$ROOT/lib/config.mjs" env) || { echo "could not read the config" >&2; exit 1; }
while IFS='=' read -r k v; do printf -v "$k" '%s' "$v"; done <<<"$ENV_LINES"
dir=$AQ_PATHS_SHARED_DIR/merge-requests
seen=$AQ_PATHS_STATE_DIR/merge-requests-seen
mkdir -p "$AQ_PATHS_STATE_DIR"
touch "$seen"
end=$(( $(date +%s) + 86400 ))
while [ "$(date +%s)" -lt "$end" ]; do
  if [ -d "$dir" ]; then
    out=$(node -e '
      const fs = require("fs"), path = require("path");
      const [dir, seenFile] = process.argv.slice(1);
      const seen = new Set(fs.readFileSync(seenFile, "utf8").split("\n").filter(Boolean));
      const fresh = [];
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
          const key = `${r.id} ${r.head}`;
          if (seen.has(key)) continue;
          fresh.push(r);
          fs.appendFileSync(seenFile, key + "\n");
        } catch {}
      }
      for (const r of fresh) console.log(`MERGE ${r.id} PR #${r.pr} head ${String(r.head).slice(0, 10)} from ${r.host}: ${(r.risky || []).slice(0, 5).join(", ")}`);
    ' "$dir" "$seen" 2>/dev/null)
    if [ -n "$out" ]; then echo "$out"; exit 0; fi
  fi
  sleep 60
done
exit 2
