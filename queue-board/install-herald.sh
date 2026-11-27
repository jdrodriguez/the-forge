#!/usr/bin/env bash
# install-herald.sh: installs or removes the queue herald's launchd job (herald.mjs) on this Mac. The Mac that runs the
# board (queueBoard.host) runs it against its own board; another Mac can run one too, reading the board over the network.
#   install-herald.sh                                   install or restart it, reading the board on this Mac
#   install-herald.sh --base http://board-mac:8787      read the board on another Mac
#   install-herald.sh --interval 5                      read every 5 seconds (default 20)
#   install-herald.sh --remove                          stop it and delete its plist and its notifier app
#   install-herald.sh --staging-notifier                build only "Forge Herald Staging.app" (its own bundle id and
#                                                       name, in <paths.stateDir>/queue-board-staging), for trying a
#                                                       notifier change; the installed one and the launchd job are left
#                                                       alone. HERALD_NOTIFIER=<its forge-herald> makes a herald post
#                                                       through it.
# Run it from the checkout that should keep running: the job points at the herald.mjs next to this file.
# It also builds "Forge Herald.app" (herald-notifier.swift), the small app the herald posts its notifications through
# so they carry the Forge's icon. macOS asks once whether that app may post; until it is allowed, or on a Mac with no
# Swift compiler, the herald posts through osascript as before, with Script Editor's icon.
set -euo pipefail
# The real folder of this script, through any symlinks.
SRC="$0"
while [ -L "$SRC" ]; do
  T="$(readlink "$SRC")"
  case "$T" in /*) SRC="$T" ;; *) SRC="$(dirname "$SRC")/$T" ;; esac
done
DIR="$(cd "$(dirname "$SRC")" && pwd)"
ROOT="$(dirname "$DIR")"
LABEL=dev.agent-queue.queue-herald
BUNDLE_ID=dev.agent-queue.herald-notifier
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
INTERVAL=20
NODE="$(command -v node)" || { echo "node not found on PATH" >&2; exit 1; }
CONFIG="${AGENT_QUEUE_CONFIG:-$ROOT/agent-queue.config.json}"
case "$CONFIG" in /*) ;; *) CONFIG="$PWD/$CONFIG" ;; esac
cfg() { AGENT_QUEUE_CONFIG="$CONFIG" "$NODE" "$ROOT/lib/config.mjs" get "$1" 2>/dev/null || true; }
STATE_DIR="$(cfg paths.stateDir)"
STATE_DIR="${STATE_DIR:-$HOME/.agent-queue}"
APP="$(cfg queueBoard.heraldNotifierApp)"
APP="${APP:-$STATE_DIR/queue-board/Forge Herald.app}"
APP_NAME="Forge Herald"
STAGING=0
LOG="$STATE_DIR/queue-herald.log"
BASE="http://127.0.0.1:$(cfg queueBoard.port)"
BASE="${BASE%:}"
[ "$BASE" = "http://127.0.0.1" ] && BASE=http://127.0.0.1:8787

while [ $# -gt 0 ]; do
  case "$1" in
    --remove)
      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
      rm -f "$DEST"
      rm -rf "$APP"
      echo "removed $LABEL"
      exit 0 ;;
    --base) BASE="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --staging-notifier)
      STAGING=1
      APP="$STATE_DIR/queue-board-staging/Forge Herald Staging.app"
      APP_NAME="Forge Herald Staging"
      BUNDLE_ID=dev.agent-queue.herald-notifier-staging
      shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[[ "$BASE" =~ ^https?://[A-Za-z0-9.:-]+$ ]] || { echo "--base must look like http://host:port" >&2; exit 2; }
[[ "$INTERVAL" =~ ^[0-9]+$ ]] || { echo "--interval must be whole seconds" >&2; exit 2; }

build_notifier() {
  local bin="$APP/Contents/MacOS/forge-herald"
  command -v swiftc >/dev/null || { echo "no swiftc here, so notifications keep Script Editor's icon (xcode-select --install adds it)"; return 0; }
  if [ ! -x "$bin" ] || [ "$DIR/herald-notifier.swift" -nt "$bin" ] || [ "$DIR/icons/forge.icns" -nt "$bin" ]; then
    rm -rf "$APP"
    mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
    swiftc -O -swift-version 5 -o "$bin" "$DIR/herald-notifier.swift"
    [ -f "$DIR/icons/forge.icns" ] && cp "$DIR/icons/forge.icns" "$APP/Contents/Resources/forge.icns"
    cat >"$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleExecutable</key><string>forge-herald</string>
  <key>CFBundleIconFile</key><string>forge</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
    plutil -lint "$APP/Contents/Info.plist" >/dev/null
    codesign --force -s - "$APP" 2>/dev/null
    echo "built $APP"
  fi
  # macOS only knows the app once LaunchServices has opened it, so the question goes through open; asked from the bare
  # binary it is refused without a prompt.
  local status answer
  status="$("$bin" --status)"
  if [ "$status" = not-asked ]; then
    echo "macOS is asking whether $APP_NAME may post notifications: click Allow on the prompt (waiting up to 90s)"
    answer="$(mktemp)"
    open -g -n -W --stdout "$answer" --stderr "$answer" -a "$APP" --args --ask || true
    status="$(tail -1 "$answer")"
    rm -f "$answer"
  fi
  case "$status" in
    allowed) echo "$APP_NAME may post notifications, so they carry the Forge's icon" ;;
    *) echo "$APP_NAME may not post yet ($status), so the herald keeps posting through osascript. Turn it on in System Settings > Notifications > $APP_NAME > Allow notifications" ;;
  esac
}

if [ "$STAGING" = 1 ]; then
  build_notifier
  echo "try it: \"$APP/Contents/MacOS/forge-herald\" Middle-earth 'A test' 'Click to open the board' $BASE/#sec-needs"
  exit 0
fi

mkdir -p "$STATE_DIR" "$(dirname "$DEST")"
# Escapes a value for the right side of a sed s### command.
sedval() { printf '%s' "$1" | sed -e 's/[\\#&]/\\&/g'; }
sed -e "s#__NODE__#$(sedval "$NODE")#g" -e "s#__NODEDIR__#$(sedval "$(dirname "$NODE")")#g" -e "s#__HOME__#$(sedval "$HOME")#g" \
  -e "s#__DIR__#$(sedval "$DIR")#g" -e "s#__CONFIG__#$(sedval "$CONFIG")#g" -e "s#__LOG__#$(sedval "$LOG")#g" \
  -e "s#__BASE__#$(sedval "$BASE")#g" -e "s#__INTERVAL__#$INTERVAL#g" "$DIR/queue-herald.plist" >"$DEST"
plutil -lint "$DEST" >/dev/null
build_notifier
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout returns before the job is gone, and bootstrap fails with "Input/output error" until it is.
for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break; sleep 0.5; done
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "installed $LABEL reading $BASE every ${INTERVAL}s using $NODE; log in $LOG"
