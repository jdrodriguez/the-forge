#!/bin/bash
# merge-approved.sh: merges approved PRs through inbox/merge-approved.mjs, which documents the commands and the gate.
src=$0
while [ -L "$src" ]; do d=$(cd -P "$(dirname "$src")" && pwd); src=$(readlink "$src"); case $src in /*) ;; *) src="$d/$src" ;; esac; done
exec node "$(cd -P "$(dirname "$src")" && pwd)/merge-approved.mjs" "$@"
