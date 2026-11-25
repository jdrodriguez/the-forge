#!/bin/bash
# orchestrator-watch-guard.sh: a Claude Code Stop hook. In the session holding the driver lock it renews the lease, and
# blocks the stop once when that session's own watcher (orchestrator-watch.mjs) is not running. Every other session
# stops normally. Install it as a Stop hook in ~/.claude/settings.json (inbox/README.md).
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
node "$(cd -P "$(dirname "$src")" && pwd)/orchestrator.mjs" guard 2>/dev/null
exit 0
