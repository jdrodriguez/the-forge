# ext-worker-sandbox.sh: sourced by ext-worker.sh. The engine's binaries and toolchain, its CLI home, and the one
# sandbox around its whole process tree: sandbox-exec (Seatbelt) on macOS, bubblewrap on Linux. See ext-worker.sh's
# header for what this holds in and what it does not. Written for bash 3.2 (macOS's /bin/bash): no associative arrays,
# and every array that may be empty is expanded as ${a[@]+"${a[@]}"}.

# --- binaries -------------------------------------------------------------------------------------------------

# The ChatGPT app's own CLI first when it has one, since a stale npm copy on PATH can fail on the current model.
codex_bin() {
  local c
  for c in "${CODEX_BIN:-}" "$(sed -n 's/^CODEX_CLI_PATH = "\(.*\)"/\1/p' "$HOME/.codex/config.toml" 2>/dev/null | head -1)" \
    /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex \
    "$HOME/.codex/packages/standalone/current/bin/codex" "$HOME/.local/bin/codex"; do
    if [ -n "$c" ] && [ -x "$c" ]; then abspath "$c"; echo; return; fi
  done
  c=$(command -v codex) && abspath "$c" && echo
}
grok_bin() {
  local c
  for c in "${GROK_BIN:-}" "$HOME/.grok/bin/grok"; do
    if [ -n "$c" ] && [ -x "$c" ]; then abspath "$c"; echo; return; fi
  done
  c=$(command -v grok) && abspath "$c" && echo
}
# Always the resolved path: inside the sandbox only the binary's real folder is mounted (~/.grok/bin and
# ~/.codex/packages/standalone/current are symlinks on some installs).
engine_bin() { if [ "$1" = codex ]; then codex_bin; else grok_bin; fi; }
cli_home() { case "$1" in codex) echo "$HOME/.codex" ;; grok) echo "$HOME/.grok" ;; esac; }
# The CLI binary's own folder, when it lives under $HOME (Grok always; Codex's npm or standalone install on Linux).
cli_bin_read() {
  local r; r=$(abspath "$(engine_bin "$1")")
  case "$r" in "$HOME"/*) dirname "$r" ;; esac
  case "$r" in "$HOME"/.codex/packages/*) dirname "$(dirname "$r")" ;; esac
}

# The engine's node, and the program premerge.installCommand names. Paths under $HOME join the read roots; system
# paths are readable already. NODE_MIN is the first release whose fetch honors HTTPS_PROXY (NODE_USE_ENV_PROXY).
NODE_MIN=22.22.1
TOOL_READ=()
under_home() { case "$1" in "$HOME"/*) TOOL_READ+=("$1") ;; esac; }
toolchain() {
  local c v best=""
  for c in /opt/homebrew/bin/node /usr/bin/node /usr/local/bin/node "$(command -v node 2>/dev/null)" "$HOME"/.nvm/versions/node/v2*/bin/node; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    v=$("$c" -e 'const a=process.versions.node.split(".").map(Number),b=process.argv[1].split(".").map(Number);process.stdout.write(String(a[0]>b[0]||(a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>=b[2])))))' "$NODE_MIN" 2>/dev/null)
    if [ "$v" = true ]; then best=$c; break; fi
  done
  [ -n "$best" ] || { TOOL_WHY="no node >= $NODE_MIN"; return 1; }
  NODE_DIR=$(dirname "$(abspath "$best")")
  TOOL_READ=()
  under_home "$(dirname "$NODE_DIR")"
  TOOL_DIR=""
  if [ ${#EW_INSTALL[@]} -gt 0 ]; then
    local p=${EW_INSTALL[0]} found=""
    case "$p" in
      */*) [ -x "$p" ] && found=$p ;;
      *) for c in "$NODE_DIR" /opt/homebrew/bin /usr/local/bin /usr/bin /bin "$HOME/.npm-global/bin" "$HOME/.local/share/pnpm" "$HOME/.local/bin"; do
           [ -x "$c/$p" ] && { found="$c/$p"; break; }
         done ;;
    esac
    [ -n "$found" ] || { TOOL_WHY="premerge.installCommand runs $p, which is not installed"; return 1; }
    TOOL_DIR=$(dirname "$found")
    under_home "$TOOL_DIR"
    under_home "$(dirname "$(dirname "$(abspath "$found")")")"
  fi
  ENGINE_PATH="$EW/shims:$NODE_DIR${TOOL_DIR:+:$TOOL_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
}

# --- the run's own folders --------------------------------------------------------------------------------------

# Each run gets its own CLI home ($RUN/cli-home): a copy of the auth file and nothing else. The real ~/.codex and
# ~/.grok are never readable inside: they hold config that can run code (hooks, MCP servers), and memories that reach
# the owner's own sessions. After the run the supervisor copies a refreshed auth file back, only for the same account.
prepare_cli_home() {
  local h="$RUN/cli-home" r; r=$(cli_home "$ENGINE")
  rm -rf "$h"; mkdir -p "$h"; chmod 700 "$h"
  cp -p "$r/auth.json" "$h/auth.json" || return 1
  if [ "$ENGINE" = grok ]; then printf '[cli]\nauto_update = false\n\n[ui]\nyolo = false\n' > "$h/config.toml"; fi
}

# start never copies a .env into an engine's clone; these are refused anyway, in case the engine writes one.
env_denies() {
  local wt=$1 p f
  for f in .env .env.local .env.production .env.staging .env.development; do echo "$wt/$f"; done
  for p in "$wt"/packages/* "$wt"/apps/*; do [ -d "$p" ] && echo "$p/.env" "$p/.env.local" "$p/.env.production"; done
}

setup_paths() { # <engine> <worktree> <run dir>
  ENGINE=$1; WT=$(abspath "$2"); mkdir -p "$3"; RUN=$(abspath "$3")
  RUN_TMP="$RUN/tmp"; RUN_HOME="$RUN/home"
  mkdir -p "$RUN_TMP" "$RUN_HOME" "$RUN/cli-home" "$RUN/net" "$EW/pkg-cache" "$EW/npm-cache" "$EW/corepack"
  HOOKS_DIR=$(sgit -C "$WT" config core.hooksPath 2>/dev/null || true)
}

# The clone's paths that run code on the next git command, inside the sandbox or out: its hooks, its config, its
# alternates and info, the repo's hook folder (core.hooksPath, or .husky).
protected_paths() {
  echo "$WT/.git/hooks" "$WT/.git/config" "$WT/.git/objects/info" "$WT/.git/info" "$WT/.husky"
  case "$HOOKS_DIR" in ""|/*|*..*) ;; *) echo "$WT/$HOOKS_DIR" ;; esac
}

# --- macOS: Seatbelt -------------------------------------------------------------------------------------------

MACH_ALLOW="com.apple.system.opendirectoryd.libinfo com.apple.system.opendirectoryd.membership com.apple.system.DirectoryService.libinfo_v1
  com.apple.PowerManagement.control com.apple.cfprefsd.daemon com.apple.cfprefsd.agent com.apple.bsd.dirhelper com.apple.networkd
  com.apple.ocspd com.apple.trustd com.apple.trustd.agent com.apple.TrustEvaluationAgent com.apple.SystemConfiguration.DNSConfiguration
  com.apple.SystemConfiguration.configd com.apple.analyticsd com.apple.analyticsd.messagetracer com.apple.appsleep com.apple.diagnosticd
  com.apple.espd com.apple.logd com.apple.logd.events com.apple.secinitd com.apple.system.logger com.apple.system.notification_center
  com.apple.xpc.activity.unmanaged com.apple.dnssd.service"

# The last matching rule wins, so each deny is followed by its narrower allows.
sbpl() {
  local p
  printf '(version 1)\n(allow default)\n'
  printf '(deny file-read-data (subpath "%s") (subpath "/Users/Shared") (subpath "/Volumes") (subpath "/private/tmp") (subpath "/private/var/folders"))\n' "$HOME"
  printf '(allow file-read-data (subpath "%s") (subpath "%s") (subpath "%s") (subpath "%s/shims") (subpath "%s/bin") (subpath "%s/pkg-cache") (subpath "%s/npm-cache") (subpath "%s/corepack")' \
    "$WT" "$MAIN/.git" "$RUN" "$EW" "$EW" "$EW" "$EW" "$EW"
  for p in ${TOOL_READ[@]+"${TOOL_READ[@]}"} $(cli_bin_read "$ENGINE"); do printf ' (subpath "%s")' "$p"; done
  printf ')\n(deny file-read-data'
  for p in $(env_denies "$WT"); do printf ' (literal "%s")' "$p"; done
  printf ')\n(deny file-write* (subpath "/"))\n'
  printf '(allow file-write* (subpath "%s") (subpath "%s") (subpath "%s") (subpath "%s/cli-home") (subpath "%s/pkg-cache") (subpath "%s/npm-cache") (subpath "%s/corepack")' \
    "$WT" "$RUN_TMP" "$RUN_HOME" "$RUN" "$EW" "$EW" "$EW"
  printf ' (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper") (literal "/dev/ptmx") (subpath "/dev/fd") (literal "/dev/tty")'
  # A pty's own end only, through the extension macOS issues when the process opens /dev/ptmx: a plain /dev/ttys rule
  # would let the engine open every other terminal session of the user.
  printf ')\n(allow file-read* file-write* file-ioctl (require-all (regex #"^/dev/ttys[0-9]+") (extension "com.apple.sandbox.pty")))'
  printf '\n(deny file-write*'
  for p in $(protected_paths); do printf ' (subpath "%s")' "$p"; done
  # The .git entry itself and the files that point git elsewhere: replacing .git, or writing commondir or gitdir, would
  # send the supervisor's own git commands (outside the sandbox) to a config the engine wrote.
  printf ' (literal "%s/.git") (literal "%s/.git/commondir") (literal "%s/.git/gitdir")' "$WT" "$WT" "$WT"
  printf ')\n'
  # Mach services: none but the ones a build needs. That shuts the keychain, the pasteboard, LaunchServices, the
  # window server and Accessibility.
  printf '(deny mach-lookup)\n(allow mach-lookup'
  for p in $MACH_ALLOW; do printf ' (global-name "%s")' "$p"; done
  printf ' (local-name "com.apple.cfprefsd.agent"))\n'
  printf '(deny job-creation)\n(deny lsopen)\n(deny appleevent-send)\n(deny signal)\n(allow signal (target same-sandbox))\n'
  printf '(deny network-outbound (remote ip "*:*"))\n(allow network-outbound'
  for p in $LOOPBACK_PORTS "$PROXY_PORT"; do printf ' (remote ip "localhost:%s")' "$p"; done
  # Unix sockets too, which an IP rule does not cover: Docker's, a database's, an agent's. Only the system resolver
  # (name lookups, a known leak in ext-worker.sh's header) and the system log stay open.
  printf ')\n(deny network-outbound (remote unix-socket))\n'
  printf '(allow network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")) (remote unix-socket (path-literal "/private/var/run/syslog")))\n'
}

# --- Linux: bubblewrap -----------------------------------------------------------------------------------------

# bwrap mounts later entries over earlier ones: the empty $HOME first, then the allowed paths back on top. It can't
# mount over a path that doesn't exist, so a missing one is skipped (a .git/commondir the engine creates is caught by
# the supervisor's clone check after the run). /run is an empty tmpfs: the read-only root still lets a process connect
# to a Unix socket, and /run holds Docker's, the system bus and the session buses. /var/run points into it. Ubuntu 24.04 and later stop unprivileged user
# namespaces through AppArmor, so bwrap needs a profile that grants it userns (dispatcher/README.md).
BW=()
bw_ro() { [ ! -e "$1" ] || BW+=(--ro-bind "$1" "$1"); }
bw_rw() { [ ! -e "$1" ] || BW+=(--bind "$1" "$1"); }
bwrap_args() {
  local p
  BW=(bwrap --die-with-parent --new-session --unshare-pid --unshare-ipc --unshare-uts --unshare-net --unshare-cgroup-try
    --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --tmpfs /var/tmp --tmpfs /dev/shm --tmpfs /run --tmpfs "$HOME")
  for p in ${TOOL_READ[@]+"${TOOL_READ[@]}"} $(cli_bin_read "$ENGINE") "$EW/shims" "$EW/bin" "$RUN"; do bw_ro "$p"; done
  bw_ro "$MAIN/.git"
  bw_rw "$WT"
  for p in $(protected_paths); do bw_ro "$p"; done
  for p in "$RUN_TMP" "$RUN_HOME" "$RUN/cli-home" "$EW/pkg-cache" "$EW/npm-cache" "$EW/corepack"; do bw_rw "$p"; done
  for p in $(env_denies "$WT"); do [ ! -f "$p" ] || BW+=(--ro-bind /dev/null "$p"); done
  BW+=(--chdir "$WT" --setenv EW_BRIDGE_PORTS "$LOOPBACK_PORTS" --setenv EW_NET_DIR "$RUN/net" --setenv EW_NODE "$NODE_DIR/node"
    --setenv EW_BIN "$EW/bin" --setenv EW_PROXY_PORT "$PROXY_PORT" -- "$EW/bin/netns-start")
}

# --- the network ----------------------------------------------------------------------------------------------

# The proxy (and on Linux the loopback forwarders) run outside the sandbox and stop by PID when the run ends.
NET_PIDS=()
net_up() { # <decision log>
  local allow p i
  allow="$ALLOWED_HOSTS $(engine_hosts "$ENGINE") $EW_EXTRA_HOSTS ${EXT_WORKER_EXTRA_HOSTS:-}"
  allow=$(echo $allow | tr ' ' ','); allow=${allow%,}
  if [ "$OS" = Darwin ]; then
    "$HOST_NODE" "$NET" proxy --listen "$PROXY_PORT" --allow "$allow" --log "$1" >/dev/null 2>&1 &
    NET_PIDS+=($!)
  else
    "$HOST_NODE" "$NET" proxy --listen "unix:$RUN/net/proxy.sock" --allow "$allow" --log "$1" >/dev/null 2>&1 &
    NET_PIDS+=($!)
    for p in $LOOPBACK_PORTS; do
      "$HOST_NODE" "$NET" forward --listen "unix:$RUN/net/tcp-$p.sock" --to "$p" >/dev/null 2>&1 &
      NET_PIDS+=($!)
    done
  fi
  for i in $(seq 1 50); do
    if [ "$OS" = Darwin ]; then nc -z 127.0.0.1 "$PROXY_PORT" 2>/dev/null && return 0
    else [ -S "$RUN/net/proxy.sock" ] && return 0; fi
    sleep 0.1
  done
  return 1
}
net_down() { local p; for p in ${NET_PIDS[@]+"${NET_PIDS[@]}"}; do kill "$p" 2>/dev/null; done; NET_PIDS=(); }

# --- the environment and the launch ---------------------------------------------------------------------------

# The engine's whole environment, NUL-separated: env -i plus what a build needs. GH_TOKEN is added at exec time from
# EW_GH_TOKEN, so it is never on a command line or in a file.
write_env() { # <file>
  local name email proxy="http://127.0.0.1:$PROXY_PORT" e
  name=$(git -C "$MAIN" config user.name 2>/dev/null || echo "Queue engine")
  email=$(git -C "$MAIN" config user.email 2>/dev/null || echo "queue-engine@localhost")
  {
    printf '%s\0' "PATH=$ENGINE_PATH" "HOME=$RUN_HOME" "LANG=en_US.UTF-8" "TMPDIR=$RUN_TMP" "SHELL=/bin/bash" "TERM=dumb" "NO_COLOR=1" \
      "USER=$(id -un)" "LOGNAME=$(id -un)" \
      "HTTPS_PROXY=$proxy" "HTTP_PROXY=$proxy" "https_proxy=$proxy" "http_proxy=$proxy" "NO_PROXY=localhost,127.0.0.1,::1" "no_proxy=localhost,127.0.0.1,::1" \
      "NODE_USE_ENV_PROXY=1" "NODE_OPTIONS=--disable-warning=UNDICI-EHPA" "npm_config_https_proxy=$proxy" "npm_config_proxy=$proxy" "SSL_CERT_FILE=$CA_FILE" \
      "XDG_CACHE_HOME=$RUN_HOME/.cache" "XDG_CONFIG_HOME=$RUN_HOME/.config" "XDG_DATA_HOME=$RUN_HOME/.local/share" \
      "npm_config_cache=$EW/npm-cache" "npm_config_store_dir=$EW/pkg-cache" "YARN_CACHE_FOLDER=$EW/pkg-cache/yarn" "COREPACK_HOME=$EW/corepack" \
      "COREPACK_ENABLE_DOWNLOAD_PROMPT=0" "TURBO_TELEMETRY_DISABLED=1" "NEXT_TELEMETRY_DISABLED=1" \
      "GH_PROMPT_DISABLED=1" "GH_NO_UPDATE_NOTIFIER=1" "GIT_TERMINAL_PROMPT=0" "GIT_CONFIG_NOSYSTEM=1" "GIT_CONFIG_GLOBAL=/dev/null" \
      "GIT_AUTHOR_NAME=$name" "GIT_AUTHOR_EMAIL=$email" "GIT_COMMITTER_NAME=$name" "GIT_COMMITTER_EMAIL=$email" \
      "GIT_CONFIG_COUNT=6" \
      "GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf" "GIT_CONFIG_VALUE_0=git@github.com:" \
      "GIT_CONFIG_KEY_1=credential.helper" "GIT_CONFIG_VALUE_1=" \
      "GIT_CONFIG_KEY_2=credential.https://github.com.helper" "GIT_CONFIG_VALUE_2=!gh auth git-credential" \
      "GIT_CONFIG_KEY_3=gc.auto" "GIT_CONFIG_VALUE_3=0" \
      "GIT_CONFIG_KEY_4=maintenance.auto" "GIT_CONFIG_VALUE_4=false" \
      "GIT_CONFIG_KEY_5=push.autoSetupRemote" "GIT_CONFIG_VALUE_5=true" \
      "ENGINE_TMP=$RUN_TMP" "ENGINE_QUESTION_FILE=$RUN_TMP/ENGINE_QUESTION.md"
    for e in ${EW_ENV[@]+"${EW_ENV[@]}"}; do printf '%s\0' "$e"; done
    if [ "$ENGINE" = codex ]; then printf '%s\0' "CODEX_HOME=$RUN/cli-home"
    else printf '%s\0' "SHELL=$EW/bin/shell/bash" "GROK_HOME=$RUN/cli-home" "GROK_MEMORY=0" "GROK_SUBAGENTS=0" "GROK_WEB_FETCH=0" "GROK_FEEDBACK_ENABLED=0"; fi
  } > "$1"
}

# run_locked <command...>: execs the command inside the sandbox with the scrubbed environment. Both paths fail closed:
# a profile that can't be applied starts nothing.
run_locked() {
  local envf="$RUN/env"
  write_env "$envf"
  local launcher=(perl -e 'my $f = shift; my $t = $ENV{EW_GH_TOKEN}; open(my $h, "<", $f) or die "env file: $!\n"; local $/ = "\0"; my %e; while (my $l = <$h>) { chomp $l; next unless length $l; my ($k, $v) = split /=/, $l, 2; $e{$k} = $v; } %ENV = %e; $ENV{GH_TOKEN} = $t if defined $t && length $t; exec { $ARGV[0] } @ARGV; die "cannot exec $ARGV[0]: $!\n";' "$envf")
  cd "$WT" || die "no worktree at $WT"
  if [ "$OS" = Darwin ]; then
    sbpl > "$RUN/outer.sb"
    exec "${launcher[@]}" /usr/bin/sandbox-exec -f "$RUN/outer.sb" "$@"
  else
    command -v bwrap >/dev/null || die "bwrap is not installed, so no engine runs here"
    bwrap_args
    exec "${launcher[@]}" "${BW[@]}" "$@"
  fi
}

# _locked <engine> <worktree> <run dir> <proxy port> <command...>: run_locked as a program the timeout can exec.
cmd_locked() {
  setup_paths "$1" "$2" "$3"; PROXY_PORT=$4; shift 4
  toolchain || die "$TOOL_WHY"
  run_locked "$@"
}

# macOS has no coreutils timeout; the child gets its own process group so a kill reaches every descendant. The timeout
# process is the one stop signals, so _timeout execs perl rather than running it as a child.
TIMEOUT_PERL='
  my $t = shift;
  my $pid = fork;
  die "fork failed: $!\n" unless defined $pid;
  if ($pid == 0) { setpgrp(0, 0); exec { $ARGV[0] } @ARGV; print STDERR "cannot exec $ARGV[0]: $!\n"; exit 127; }
  $SIG{ALRM} = sub { kill "TERM", -$pid; sleep 5; kill "KILL", -$pid; exit 142; };
  $SIG{$_} = sub { kill "TERM", -$pid; sleep 2; kill "KILL", -$pid; exit 143; } for qw(TERM INT HUP);
  alarm $t if $t > 0;
  waitpid($pid, 0);
  my $rc = ($? & 127) ? 128 + ($? & 127) : $? >> 8;
  # Whatever the engine left running in its process group ends with it, so nothing changes the clone after the audit.
  kill "TERM", -$pid; select(undef, undef, undef, 0.5); kill "KILL", -$pid;
  exit $rc;'
