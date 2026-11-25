#!/bin/bash
# lease.sh renew [session] | status | expired [minutes]: the orchestrator lease, in inbox/orchestrator.mjs.
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
exec node "$(cd -P "$(dirname "$src")" && pwd)/orchestrator.mjs" "$@"
