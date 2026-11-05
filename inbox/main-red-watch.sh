#!/bin/bash
# main-red-watch.sh: wakes the orchestrator session when main turns red or recovers. Run it with Bash
# run_in_background (no &) and re-arm it after each wake. It reads <paths.sharedDir>/main-state.json, which
# main-watch.mjs (every 3 minutes, on one machine) keeps current, and exits with one line per change:
#   RED <sha> ...    main turned red (new streak), with the failing jobs, first error and responder
#   GREEN <sha> ...  main recovered from a red this watcher reported
# It remembers what it reported in <paths.stateDir>/main-red-seen so a re-arm doesn't repeat itself, and exits 2
# after 24 hours with nothing new.
# The repo root, from this script's real path, and the config as AQ_* variables (lib/config.mjs env).
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
ROOT="$(cd -P "$(dirname "$src")/.." && pwd)"
ENV_LINES=$(node "$ROOT/lib/config.mjs" env) || { echo "could not read the config" >&2; exit 1; }
while IFS='=' read -r k v; do printf -v "$k" '%s' "$v"; done <<<"$ENV_LINES"
state=$AQ_PATHS_SHARED_DIR/main-state.json
seen=$AQ_PATHS_STATE_DIR/main-red-seen
mkdir -p "$AQ_PATHS_STATE_DIR"
end=$(( $(date +%s) + 86400 ))
while [ "$(date +%s)" -lt "$end" ]; do
  if [ -f "$state" ]; then
    line=$(node -e '
      const fs = require("fs");
      const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      let seen = ""; try { seen = fs.readFileSync(process.argv[2], "utf8").trim(); } catch {}
      if (s.status === "red" && seen !== `red ${s.redSha}`) {
        const r = (s.responders || []).map((x) => `${x.label}/${x.id}`).join(", ") || "none";
        console.log(`RED ${String(s.redSha).slice(0, 10)} since ${s.redSince}: ${s.redTitle}\n  failing: ${(s.failing || []).join(", ")}\n  error: ${s.error || "-"}\n  responders: ${r}\n  run: ${s.latestRun}`);
      } else if (s.status === "green" && seen.startsWith("red ")) {
        console.log(`GREEN ${String(s.greenSha).slice(0, 10)}: main recovered from ${seen.slice(4, 14)}`);
      }' "$state" "$seen" 2>/dev/null)
    if [ -n "$line" ]; then
      case "$line" in
        RED*) node -e 'const s=require(process.argv[1]); process.stdout.write(`red ${s.redSha}`)' "$state" > "$seen" ;;
        GREEN*) echo "green" > "$seen" ;;
      esac
      echo "$line"
      exit 0
    fi
  fi
  sleep 60
done
exit 2
