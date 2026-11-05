#!/usr/bin/env bash
# install.sh: installs or removes the agent queue board's launchd job on this Mac. Run it on queueBoard.host only; one
# board covers every queue machine.
#   install.sh           fill in this Mac's paths and start the board (queueBoard.bind on queueBoard.port)
#   install.sh --remove  stop the board and delete its plist
set -euo pipefail
# The real folder of this script, through any symlinks.
SRC="$0"
while [ -L "$SRC" ]; do
  T="$(readlink "$SRC")"
  case "$T" in /*) SRC="$T" ;; *) SRC="$(dirname "$SRC")/$T" ;; esac
done
DIR="$(cd "$(dirname "$SRC")" && pwd)"
ROOT="$(dirname "$DIR")"
LABEL=dev.agent-queue.queue-board
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$(uname -s)" != Darwin ]; then
  echo "install.sh sets up a launchd job, so it runs on macOS only; elsewhere run node $DIR/board.mjs under your own service manager" >&2
  exit 1
fi

if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$DEST"
  echo "removed $LABEL"
  exit 0
fi

NODE="$(command -v node)" || { echo "node not found on PATH" >&2; exit 1; }
CONFIG="${AGENT_QUEUE_CONFIG:-$ROOT/agent-queue.config.json}"
case "$CONFIG" in /*) ;; *) CONFIG="$PWD/$CONFIG" ;; esac
STATE_DIR="$(AGENT_QUEUE_CONFIG="$CONFIG" "$NODE" "$ROOT/lib/config.mjs" get paths.stateDir)"
BOARD_HOST="$(AGENT_QUEUE_CONFIG="$CONFIG" "$NODE" "$ROOT/lib/config.mjs" get queueBoard.host || true)"
if [ -n "$BOARD_HOST" ] && [ "$(printf %s "$BOARD_HOST" | tr '[:upper:]' '[:lower:]')" != "$(hostname -s | tr '[:upper:]' '[:lower:]')" ]; then
  echo "note: queueBoard.host is $BOARD_HOST and this is $(hostname -s); hourly-check.mjs looks for the board on $BOARD_HOST" >&2
fi
LOG="$STATE_DIR/queue-board.log"
mkdir -p "$STATE_DIR" "$(dirname "$DEST")"
# Escapes a value for the right side of a sed s### command.
sedval() { printf '%s' "$1" | sed -e 's/[\\#&]/\\&/g'; }
sed -e "s#__NODE__#$(sedval "$NODE")#g" -e "s#__NODEDIR__#$(sedval "$(dirname "$NODE")")#g" -e "s#__HOME__#$(sedval "$HOME")#g" \
  -e "s#__DIR__#$(sedval "$DIR")#g" -e "s#__CONFIG__#$(sedval "$CONFIG")#g" -e "s#__LOG__#$(sedval "$LOG")#g" \
  "$DIR/queue-board.plist" >"$DEST"
plutil -lint "$DEST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout returns before the job is gone, and bootstrap fails with "Input/output error" until it is.
for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break; sleep 0.5; done
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "installed $LABEL using $NODE and $CONFIG; log in $LOG"
