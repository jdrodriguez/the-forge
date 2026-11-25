#!/usr/bin/env bash
# install-supervisor.sh [--remove]: installs or removes the orchestrator supervisor (orchestrator-supervisor.mjs) on
# this machine, every orchestrator.supervisor.everyMinutes (default 5): a launchd job on macOS, a systemd user timer on
# Linux. Install it on the machine the orchestrator session runs on, since it reads that machine's lease.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
REMOVE=
for a in "$@"; do
  case "$a" in
    --remove) REMOVE=1 ;;
    *) echo "unknown option: $a" >&2; exit 64 ;;
  esac
done
LABEL=dev.agent-queue.orchestrator-supervisor
UNIT=agent-queue-orchestrator-supervisor
DESC="The Forge orchestrator supervisor"
NODE="$(command -v node)" || { echo "node not found on PATH" >&2; exit 1; }
STATE_DIR="$("$NODE" "$ROOT/lib/config.mjs" get paths.stateDir)" || { echo "could not read the config; see agent-queue.config.example.json" >&2; exit 1; }
MIN="$("$NODE" "$ROOT/lib/config.mjs" get orchestrator.supervisor.everyMinutes 2>/dev/null || echo 5)"
case $MIN in '' | *[!0-9]* | 0) MIN=5 ;; esac
CONFIG="${AGENT_QUEUE_CONFIG:-$ROOT/agent-queue.config.json}"
PATHS="$(dirname "$NODE"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if [ "$(uname)" = Linux ]; then
  UNITS="$HOME/.config/systemd/user"
  if [ -n "$REMOVE" ]; then
    systemctl --user disable --now "$UNIT.timer" 2>/dev/null || true
    rm -f "$UNITS/$UNIT.service" "$UNITS/$UNIT.timer"
    systemctl --user daemon-reload
    echo "removed $UNIT.timer"
    exit 0
  fi
  mkdir -p "$STATE_DIR" "$UNITS"
  cat >"$UNITS/$UNIT.service" <<EOF
[Unit]
Description=$DESC

[Service]
Type=oneshot
WorkingDirectory=$HOME
Environment=HOME=$HOME
Environment=AGENT_QUEUE_CONFIG=$CONFIG
Environment=PATH=$PATHS
ExecStart=$NODE $DIR/orchestrator-supervisor.mjs
StandardOutput=append:$STATE_DIR/orchestrator-supervisor.systemd.log
StandardError=append:$STATE_DIR/orchestrator-supervisor.systemd.log
EOF
  cat >"$UNITS/$UNIT.timer" <<EOF
[Unit]
Description=$DESC, every $MIN minutes

[Timer]
OnBootSec=${MIN}min
OnUnitActiveSec=${MIN}min
Unit=$UNIT.service

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT.timer"
  echo "installed $UNIT.timer, every $MIN minutes"
  exit 0
fi

DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ -n "$REMOVE" ]; then
  rm -f "$DEST"
  echo "removed $LABEL"
  exit 0
fi
mkdir -p "$STATE_DIR" "$HOME/Library/LaunchAgents"
cat >"$DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- $DESC, every $MIN minutes. Written by $DIR/install-supervisor.sh; remove with install-supervisor.sh --remove. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/orchestrator-supervisor.mjs</string>
  </array>
  <key>StartInterval</key>
  <integer>$((MIN * 60))</integer>
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
    <string>$PATHS</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/orchestrator-supervisor.launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/orchestrator-supervisor.launchd.log</string>
</dict>
</plist>
EOF
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "installed $LABEL, every $MIN minutes"
