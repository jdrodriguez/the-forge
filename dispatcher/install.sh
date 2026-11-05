#!/usr/bin/env bash
# install.sh: installs or removes one of the queue's scheduled jobs on this machine: a launchd job on macOS, a systemd
# user timer on Linux (with linger on, so it ticks while nobody is logged in).
#   install.sh                         the dispatcher: dispatcher.mjs tick every 20 minutes (first tick in 20 minutes)
#   install.sh --main-watch            the red-main watcher: main-watch.mjs every 3 minutes (run it on one machine)
#   install.sh [--main-watch] --remove unload the job and delete its plist or units
# The dispatcher still does nothing on a host missing from dispatcher.enabledHosts in the config.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

JOB=dispatcher
REMOVE=
for a in "$@"; do
  case "$a" in
    --main-watch) JOB=main-watch ;;
    --remove) REMOVE=1 ;;
    *) echo "unknown option: $a" >&2; exit 64 ;;
  esac
done
if [ "$JOB" = dispatcher ]; then
  SCRIPT="$DIR/dispatcher.mjs"; ARGS="tick"; EVERY=1200; DESC="Agent queue dispatcher tick"
else
  SCRIPT="$DIR/main-watch.mjs"; ARGS=""; EVERY=180; DESC="Agent queue red-main watcher"
fi
LABEL="dev.agent-queue.$JOB"
UNIT="agent-queue-$JOB"

NODE="$(command -v node)" || { echo "node not found on PATH" >&2; exit 1; }
STATE_DIR="$("$NODE" "$ROOT/lib/config.mjs" get paths.stateDir)" || { echo "could not read the config; see agent-queue.config.example.json" >&2; exit 1; }
CONFIG="${AGENT_QUEUE_CONFIG:-$ROOT/agent-queue.config.json}"

if [ "$(uname)" = Linux ]; then
  UNITS="$HOME/.config/systemd/user"
  if [ -n "$REMOVE" ]; then
    systemctl --user disable --now "$UNIT.timer" 2>/dev/null || true
    rm -f "$UNITS/$UNIT.service" "$UNITS/$UNIT.timer"
    systemctl --user daemon-reload
    echo "removed $UNIT.timer"
    exit 0
  fi
  [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] || echo "warning: linger is off, so the timer stops at logout (sudo loginctl enable-linger $USER)" >&2
  mkdir -p "$STATE_DIR" "$UNITS"
  cat >"$UNITS/$UNIT.service" <<EOF
[Unit]
Description=$DESC

[Service]
Type=oneshot
# A tick starts fleet workers inside a background Claude daemon. systemd's default KillMode stops every process in
# the unit's cgroup when the tick exits, which killed that daemon seconds after each dispatch. Stop only the tick
# itself and leave the daemon and its workers running.
KillMode=process
WorkingDirectory=$HOME
Environment=HOME=$HOME
Environment=AGENT_QUEUE_CONFIG=$CONFIG
Environment=PATH=$(dirname "$NODE"):$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
ExecStart=$NODE $SCRIPT $ARGS
StandardOutput=append:$STATE_DIR/$JOB.systemd.out.log
StandardError=append:$STATE_DIR/$JOB.systemd.err.log
EOF
  cat >"$UNITS/$UNIT.timer" <<EOF
[Unit]
Description=$DESC, every $((EVERY / 60)) minutes

[Timer]
OnBootSec=$((EVERY / 60))min
OnUnitActiveSec=$((EVERY / 60))min
Unit=$UNIT.service

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT.timer"
  echo "installed $UNIT.timer using $NODE; run 'systemctl --user start $UNIT.service' to run it now"
  exit 0
fi

DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ -n "$REMOVE" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$DEST"
  echo "removed $LABEL"
  exit 0
fi

mkdir -p "$STATE_DIR" "$HOME/Library/LaunchAgents"
ARG_XML=""
[ -n "$ARGS" ] && ARG_XML="    <string>$ARGS</string>"
cat >"$DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- $DESC, every $EVERY seconds. Written by $DIR/install.sh; remove with install.sh $([ "$JOB" = main-watch ] && echo '--main-watch ')--remove.
     Pause the dispatcher without unloading it: node $DIR/dispatcher.mjs pause "reason". -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$SCRIPT</string>
$ARG_XML
  </array>
  <key>StartInterval</key>
  <integer>$EVERY</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>WorkingDirectory</key>
  <string>$HOME</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>AGENT_QUEUE_CONFIG</key>
    <string>$CONFIG</string>
    <key>PATH</key>
    <string>$(dirname "$NODE"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/$JOB.launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/$JOB.launchd.err.log</string>
</dict>
</plist>
EOF
plutil -lint "$DEST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "installed $LABEL using $NODE; run 'launchctl kickstart gui/$(id -u)/$LABEL' to run it now"
