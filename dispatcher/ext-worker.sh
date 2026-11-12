#!/usr/bin/env bash
# ext-worker.sh: runs Codex or Grok as a full queue worker, one round per spawn, under a lockdown this script builds
# and the engine can't change. The dispatcher runs it when Codex or Grok wins a ticket (engine-workers.mjs). The engine
# drives the whole PR: shell, network, git and gh, with write access to its own clone only.
#
# Usage:
#   ext-worker.sh start <codex|grok> <ABC-123> <branch> <brief-file> [--continue] [--timeout SECS]
#   ext-worker.sh stop <ABC-123>
#   ext-worker.sh available <codex|grok>
#   ext-worker.sh selftest [codex|grok] [--no-model]
#   ext-worker.sh sandbox-run <codex|grok> <worktree> -- <command...>    (the selftest's probe runner)
#
# start prints one JSON line {"engine","id","name","pid","worktree","registry"} and exits 0 once the supervisor runs.
# Exit codes: 2 refused (bad arguments, a secret-shaped brief, a live worker on the ticket, origin/<branch> exists
# without --continue, or a clone holding work without --continue); 3 the engine is unavailable; 4 git failed.
# Non-zero means nothing started and the registry was not touched. stop exits 0 even when nothing runs.
# available prints one line and exits 0 (usable) or 1 (with the reason); the answer is cached for 10 minutes.
#
# Paths and policy come from the config (ext-worker-lib.mjs config): repoPath, worktreesDir, paths.stateDir,
# github.baseBranch, premerge.installCommand, push.gates and dispatcher.externalBuilders.fallback.
# The registry, <stateDir>/engine-workers/<ABC-123>.json, is rewritten atomically:
#   {engine, id, name, pid, enginePid, worktree, branch, startedAt, status, exitCode, endedAt, question, report, logDir,
#    timeoutSeconds}
# pid is the supervisor's. status: busy while it runs (dependency install included), then done (the engine's last line
# was RESULT: DONE), blocked (it wrote $TMPDIR/ENGINE_QUESTION.md; `question` holds it), limit (the CLI's own output
# says its plan or rate limit is spent), or failed (`report` says why; "containment: ..." when the audit flagged the
# run, whose files are kept in logDir). Each round's files: <stateDir>/engine-workers/<ABC-123>/<spawn id>/.
#
# WHAT HOLDS THE ENGINE IN. One sandbox, written here, around the whole CLI process tree: sandbox-exec on macOS,
# bubblewrap on Linux. Neither CLI's own sandbox is used: macOS refuses a nested sandbox once the outer profile denies
# anything, so Codex's can't run inside this one, and Grok's warns and runs unprotected when it can't apply. Both of
# this script's fail closed: a profile that can't be applied starts nothing. ext-worker-selftest.sh proves each point.
#  - Reads of $HOME are refused except the engine's clone, the main checkout's .git, the toolchain, the caches and the
#    run folder, whose CLI home holds a copy of the auth file and nothing else. The real ~/.codex and ~/.grok are not
#    readable, nor are the main checkout's working files (its real .env), other repos, ~/.ssh, ~/.aws, ~/.config,
#    ~/.claude*, the queue's own state folder and checkout, and ~/Library.
#  - Writes are refused everywhere except the engine's clone (never its .git hooks, .git config, alternates, info or
#    hook folder), the run's temp dir and scratch home, the run's own CLI home and the package caches. The clone borrows
#    the main checkout's objects read-only, so the main .git, other worktrees' refs and the shared objects are read-only.
#  - Network: the sandbox can reach only this run's proxy (ext-worker-net.mjs, which runs outside it) and the loopback
#    ports in fallback.loopbackPorts. macOS: Seatbelt refuses every other outbound address. Linux: an empty network
#    namespace, with loopback listeners that forward to unix sockets outside. The proxy opens a connection only to
#    github.com, api.github.com, codeload.github.com, *.githubusercontent.com, registry.npmjs.org, the CLI's own API
#    hosts and fallback.extraHosts, on 443 or 80, and logs every decision.
#  - macOS also refuses every Mach service but a short list a build needs, which shuts the keychain (Codex verifies TLS
#    from a CA file instead), the pasteboard, LaunchServices and the window server; and AppleEvents, launchd jobs and
#    signals to processes outside the sandbox. Linux gets its own PID namespace and empty /tmp, /run/user and /dev/shm,
#    which hides the session bus and the keyring.
#  - The environment is env -i plus what a build needs: PATH (command guard first), a scratch HOME, TMPDIR, caches, git
#    identity, GH_TOKEN, and fallback.env (names that look like credentials are dropped). No *_API_KEY, other tokens or
#    SSH_AUTH_SOCK. Commands run in a non-login shell, since a login shell on macOS runs path_helper.
# WHAT LEAKS, and is not closed here:
#  - The CLI needs its auth file, and with one sandbox layer the engine's shell can read the run's copy too. It can only
#    send it to an allowlisted host, GitHub included. The audit fails a run whose commands or file tools name that file;
#    an obfuscated read passes.
#  - GH_TOKEN is fallback.ghTokenFile when it exists, otherwise whatever `gh auth token` gives. A personal token with
#    admin rights lets an engine merge, push the base branch, start workflows or push a workflow that reads repository
#    secrets. The command guard and the audit are the only checks between the engine and those. Use a narrower token.
#  - GitHub is reachable by design, so a push, a gist or a comment can carry data out.
#  - On macOS DNS lookups still leave the sandbox through mDNSResponder's socket, so a name can carry data. Linux has no
#    resolver inside at all.
#  - Anything the engine commits runs later with someone else's rights: in CI on its push, and wherever the branch's
#    code runs outside a sandbox. The audit fails a run whose branch touches workflows, hooks or agent settings, but only
#    after the push.
#  - The command guard (ext-worker-guard.sh) is a speed bump: an absolute path skips it. The audit reads the event
#    stream after the run, as text, so it catches attempts it can read, not ones it can't.
set -uo pipefail

usage() { sed -n '7,12p' "$0" >&2; exit 2; }
abspath() { perl -MCwd -e 'print Cwd::abs_path(shift) // ""' "$1"; }
SELF=$(abspath "$0")
HERE=$(dirname "$SELF")
LIB="$HERE/ext-worker-lib.mjs"
NET="$HERE/ext-worker-net.mjs"
OS=$(uname -s)
HOME=$(abspath "$HOME"); export HOME
HOST_NODE=$(command -v node || ls /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node 2>/dev/null | head -1)
lib() { "$HOST_NODE" "$LIB" "$@"; }
die() { echo "ext-worker: $*" >&2; exit "${EXIT:-2}"; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
reg_get() { "$HOST_NODE" -e 'try { const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]]; process.stdout.write(v == null ? "" : String(v)); } catch {}' "$1" "$2"; }

EW_INSTALL=(); EW_ENV=()
CONFIG_SH=$(lib config) || die "could not read the config"
eval "$CONFIG_SH"
MAIN=$EW_MAIN
[ -d "$MAIN/.git" ] || die "repoPath ($MAIN) is not a git checkout"
WT_ROOT="$MAIN/$EW_WORKTREES_DIR"
REG_DIR="${EXT_WORKER_REGISTRY_DIR:-$EW_STATE/engine-workers}"
mkdir -p "${EXT_WORKER_ROOT:-$HOME/.cache/agent-queue-ext-worker}"
EW=$(abspath "${EXT_WORKER_ROOT:-$HOME/.cache/agent-queue-ext-worker}")
CACHE_DIR=$EW_STATE
LOOPBACK_PORTS=$EW_LOOPBACK
# codeload.github.com serves a lockfile's git dependencies.
ALLOWED_HOSTS="github.com api.github.com codeload.github.com *.githubusercontent.com registry.npmjs.org"
CA_FILE=/etc/ssl/cert.pem; [ -f "$CA_FILE" ] || CA_FILE=/etc/ssl/certs/ca-certificates.crt
# Each CLI's own API hosts. The engine's shell can reach these too.
engine_hosts() { case "$1" in codex) echo "chatgpt.com *.chatgpt.com api.openai.com auth.openai.com" ;; grok) echo "*.grok.com *.x.ai" ;; esac; }

. "$HERE/ext-worker-sandbox.sh"
. "$HERE/ext-worker-guard.sh"
. "$HERE/ext-worker-supervise.sh"

# --- available ------------------------------------------------------------------------------------------------

available_check() {
  local e=$1 b; b=$(engine_bin "$e") || true
  [ -n "$b" ] && [ -x "$b" ] || { echo "$e is not installed here"; return 1; }
  if [ "$e" = codex ]; then
    local v; v=$("$b" --version 2>/dev/null | sed -n 's/^codex-cli 0\.\([0-9]*\).*/\1/p')
    [ -n "$v" ] && [ "$v" -ge 166 ] || { echo "codex at $b is $("$b" --version 2>/dev/null); this needs 0.166 or later"; return 1; }
    "$b" login status >/dev/null 2>&1 || { echo "codex is not signed in (run: codex login)"; return 1; }
  else
    [ -s "$(cli_home grok)/auth.json" ] || { echo "grok is not signed in (run: grok login)"; return 1; }
  fi
  toolchain || { echo "$TOOL_WHY"; return 1; }
  [ "$OS" = Darwin ] || command -v bwrap >/dev/null || { echo "bwrap is not installed"; return 1; }
  # The real profile, around the CLI itself.
  local t; mkdir -p "$EW" "$WT_ROOT"; t=$(mktemp -d "$EW/avail.XXXXXX")
  if ! EXT_WORKER_RUN="$t" "$SELF" sandbox-run "$e" "$WT_ROOT" -- "$b" --version > "$t.out" 2>&1; then
    echo "the sandbox does not start $e here: $(tail -1 "$t.out" | cut -c1-200)"; rm -rf "$t" "$t.out"; return 1
  fi
  rm -rf "$t" "$t.out"
  echo "ok: $e can run as a queue worker on $(hostname -s)"
}

cmd_available() {
  local e=${1:-}; case "$e" in codex|grok) ;; *) usage ;; esac
  local cache="$CACHE_DIR/ext-worker-available-$e.txt" line rc mtime=0
  mkdir -p "$CACHE_DIR"
  if [ -f "$cache" ]; then if [ "$OS" = Darwin ]; then mtime=$(stat -f %m "$cache"); else mtime=$(stat -c %Y "$cache"); fi; fi
  # EXT_WORKER_NO_CACHE=1 (the selftest) checks afresh, and the fresh answer replaces the cached one.
  if [ -z "${EXT_WORKER_NO_CACHE:-}" ] && [ $(( $(date +%s) - mtime )) -lt 600 ]; then
    rc=$(sed -n 's/^rc=//p' "$cache"); line=$(sed -n 's/^line=//p' "$cache")
    echo "$line"; return "${rc:-1}"
  fi
  line=$(available_check "$e"); rc=$?
  printf 'rc=%s\nline=%s\n' "$rc" "$line" > "$cache.$$" && mv "$cache.$$" "$cache"
  echo "$line"; return "$rc"
}

# --- start ----------------------------------------------------------------------------------------------------

pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# An engine works in its own clone, which borrows the main checkout's objects read-only through objects/info/alternates
# and writes only its own .git. A linked worktree would share the main .git's refs and objects, so an engine could move
# another worker's branch or replace an object another checkout reads. Remove a clone with rm -rf.
is_engine_clone() {
  [ -d "$1/.git" ] && [ ! -f "$1/.git" ] && grep -qxF "$MAIN/.git/objects" "$1/.git/objects/info/alternates" 2>/dev/null
}
clone_for() { # <path>: on the base branch, fetched fresh from origin
  local url hooks; url=$(git -C "$MAIN" remote get-url origin) || return 1
  hooks=$(git -C "$MAIN" config core.hooksPath 2>/dev/null || true)
  git clone -q --shared --no-checkout --single-branch --branch "$EW_BASE" "$MAIN" "$1" || return 1
  git -C "$1" remote set-url origin "$url" || return 1
  [ -z "$hooks" ] || git -C "$1" config core.hooksPath "$hooks" || return 1
  git -C "$1" fetch -q origin "$EW_BASE" && git -C "$1" checkout -q -B "$EW_BASE" "origin/$EW_BASE"
}

cmd_start() {
  local engine=${1:-} id=${2:-} branch=${3:-} brief=${4:-}
  [ -n "$engine" ] && [ -n "$id" ] && [ -n "$branch" ] && [ -n "$brief" ] || usage
  shift 4
  local cont=0 timeout=$EW_TIMEOUT
  while [ $# -gt 0 ]; do
    case "$1" in
      --continue) cont=1; shift ;;
      --timeout) timeout=${2:-}; shift 2 ;;
      *) die "unknown argument: $1" ;;
    esac
  done
  case "$engine" in codex|grok) ;; *) die "engine must be codex or grok, got: $engine" ;; esac
  id=$(printf '%s' "$id" | tr '[:lower:]' '[:upper:]')
  [[ "$id" =~ ^[A-Z]+-[0-9]+$ ]] || die "ticket must look like ABC-123, got: $id"
  [[ "$branch" =~ ^[A-Za-z0-9._/-]+$ ]] && [[ "$branch" != *..* ]] && [[ "$branch" != */ ]] || die "unsupported branch name: $branch"
  case "$branch" in main|master|HEAD|"$EW_BASE") die "refusing to work on $branch" ;; esac
  [[ "${branch##*/}" =~ ^[A-Za-z0-9._-]+$ ]] || die "unsupported worktree name: ${branch##*/}"
  case "$timeout" in ''|*[!0-9]*) die "--timeout must be a number of seconds" ;; esac
  [ -s "$brief" ] || die "no brief at $brief"
  local found; found=$(lib prompt "$brief" "$MAIN") || {
    echo "ext-worker: refusing: the brief looks like it holds a secret:" >&2; sed 's/^/  /' <<<"$found" >&2; exit 2; }

  local reg="$REG_DIR/$id.json"
  if [ -f "$reg" ] && [ "$(reg_get "$reg" status)" = busy ] && pid_alive "$(reg_get "$reg" pid)"; then
    die "$id already has a live worker (pid $(reg_get "$reg" pid)); stop it first"
  fi
  local why; why=$(cmd_available "$engine") || { echo "ext-worker: $engine is unavailable: $why" >&2; exit 3; }

  local wt="$WT_ROOT/${branch##*/}" remote=0
  EXIT=4
  mkdir -p "$WT_ROOT"
  if [ -e "$wt" ]; then
    is_engine_clone "$wt" || EXIT=2 die "$wt exists and is not an engine clone"
    local cur; cur=$(git -C "$wt" symbolic-ref -q --short HEAD || echo detached)
    [ "$cur" = "$branch" ] || EXIT=2 die "$wt is on $cur, not $branch"
    git -C "$wt" fetch -q origin "$EW_BASE" || die "git fetch origin $EW_BASE failed"
  else
    clone_for "$wt" || die "could not clone $MAIN into $wt"
  fi
  if git -C "$wt" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    remote=1
    git -C "$wt" fetch -q origin "+refs/heads/$branch:refs/remotes/origin/$branch" || die "git fetch origin $branch failed"
  fi
  [ $cont = 1 ] || [ $remote = 0 ] || EXIT=2 die "origin/$branch exists; pass --continue to build on it"
  if [ "$(git -C "$wt" symbolic-ref -q --short HEAD 2>/dev/null)" != "$branch" ]; then
    local base="origin/$EW_BASE"; [ $remote = 0 ] || base="origin/$branch"
    git -C "$wt" checkout -q -B "$branch" "$base" || die "could not check out $branch from $base"
    [ $remote = 0 ] || git -C "$wt" branch -q --set-upstream-to="origin/$branch" "$branch"
  elif [ $cont = 0 ]; then
    if [ -n "$(git -C "$wt" status --porcelain)" ] || [ -n "$(git -C "$wt" rev-list "origin/$EW_BASE..HEAD" 2>/dev/null)" ]; then
      EXIT=2 die "$wt holds work beyond origin/$EW_BASE; pass --continue to keep it"
    fi
    git -C "$wt" reset -q --hard "origin/$EW_BASE" || die "could not reset $wt to origin/$EW_BASE"
  elif [ $remote = 1 ] && [ -z "$(git -C "$wt" status --porcelain)" ] && git -C "$wt" merge-base --is-ancestor HEAD "origin/$branch"; then
    git -C "$wt" merge -q --ff-only "origin/$branch" || die "could not fast-forward $wt to origin/$branch"
  fi
  EXIT=2

  local sid name logdir run spid
  sid=$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
  name="queue-$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]')"
  logdir="$REG_DIR/$id/$sid"; run="$EW/runs/$id-$sid"
  mkdir -p "$logdir" "$run"; chmod 700 "$logdir"
  cp "$brief" "$logdir/brief.md"
  # The supervisor detaches into its own session so it outlives the dispatcher tick that started it, and waits for its
  # registry row before doing anything.
  spid=$(perl -MPOSIX=setsid -e '
    my $log = shift; my $pid = fork; die "fork: $!\n" unless defined $pid;
    if ($pid == 0) { setsid(); open(STDIN, "<", "/dev/null"); open(STDOUT, ">>", $log); open(STDERR, ">&", \*STDOUT); exec { $ARGV[0] } @ARGV; exit 127; }
    print "$pid\n";' "$logdir/supervisor.log" "$SELF" _supervise "$engine" "$id" "$sid" "$branch" "$wt" "$timeout" "$run" "$logdir")
  [ -n "$spid" ] || die "could not start the supervisor"
  printf '{"engine":"%s","id":"%s","name":"%s","pid":%s,"enginePid":null,"worktree":"%s","branch":"%s","startedAt":"%s","status":"busy","exitCode":null,"endedAt":null,"question":null,"report":null,"logDir":"%s","timeoutSeconds":%s}' \
    "$engine" "$sid" "$name" "$spid" "$wt" "$branch" "$(now)" "$logdir" "$timeout" > "$logdir/registry.json.tmp"
  mkdir -p "$REG_DIR"; mv "$logdir/registry.json.tmp" "$reg"
  printf '{"engine":"%s","id":"%s","name":"%s","pid":%s,"worktree":"%s","registry":"%s"}\n' "$engine" "$sid" "$name" "$spid" "$wt" "$reg"
}

# --- stop -----------------------------------------------------------------------------------------------------

# By PID only, after checking the PID still runs this ticket's supervisor. The supervisor's trap stops the engine's
# process group and writes the row; if it is gone already, the engine's timeout wrapper gets the TERM directly.
cmd_stop() {
  local id=${1:-}; [ -n "$id" ] || usage
  id=$(printf '%s' "$id" | tr '[:lower:]' '[:upper:]')
  local reg="$REG_DIR/$id.json" spid epid i
  [ -f "$reg" ] || { echo "ext-worker: no worker for $id"; return 0; }
  [ "$(reg_get "$reg" status)" = busy ] || { echo "ext-worker: $id is not running ($(reg_get "$reg" status))"; return 0; }
  spid=$(reg_get "$reg" pid); epid=$(reg_get "$reg" enginePid)
  if pid_alive "$spid" && ps -o command= -p "$spid" 2>/dev/null | grep -q -- "_supervise [a-z]* $id "; then
    kill -TERM "$spid" 2>/dev/null
    for i in $(seq 1 60); do pid_alive "$spid" || break; sleep 0.25; done
    ! pid_alive "$spid" || kill -KILL "$spid" 2>/dev/null
  fi
  if pid_alive "$epid" && ps -o command= -p "$epid" 2>/dev/null | grep -q -- "_locked [a-z]* "; then kill -TERM "$epid" 2>/dev/null; fi
  [ "$(reg_get "$reg" status)" != busy ] || printf '{"status":"failed","report":"stopped","endedAt":"%s"}' "$(now)" | lib registry "$reg"
  echo "ext-worker: stopped $id"
}

# --- sandbox-run (the selftest's probe runner) ----------------------------------------------------------------

cmd_sandbox_run() {
  local engine=${1:-} wt=${2:-}
  [ -n "$engine" ] && [ -n "$wt" ] || usage
  shift 2; [ "${1:-}" != -- ] || shift
  case "$engine" in codex|grok) ;; *) usage ;; esac
  wt=$(abspath "$wt")
  case "$wt" in "$WT_ROOT"|"$WT_ROOT"/*) ;; *) die "$wt is not under $WT_ROOT" ;; esac
  setup_paths "$engine" "$wt" "${EXT_WORKER_RUN:-$EW/runs/sandbox-run-$$}"
  [ -s "$RUN/cli-home/auth.json" ] || prepare_cli_home || die "could not copy $engine's auth file"
  toolchain || die "$TOOL_WHY"
  write_shims || die "could not write the command guard"
  PROXY_PORT=$(lib port)
  net_up "$RUN/net.jsonl" || die "the network proxy did not start"
  if [ -z "${EXT_WORKER_RUN:-}" ]; then trap 'net_down; rm -rf "$RUN"' EXIT; else trap net_down EXIT; fi
  ( run_locked "$@" )
}

case "${1:-}" in
  start) shift; cmd_start "$@" ;;
  stop) shift; cmd_stop "$@" ;;
  available) shift; cmd_available "$@" ;;
  selftest) shift; exec "$HERE/ext-worker-selftest.sh" "$@" ;;
  sandbox-run) shift; cmd_sandbox_run "$@" ;;
  _supervise) shift; cmd_supervise "$@" ;;
  _locked) shift; cmd_locked "$@" ;;
  _bin) shift; engine_bin "${1:-}" ;;
  _timeout) shift; exec perl -e "$TIMEOUT_PERL" "$@" ;;
  _clone) shift; clone_for "$@" ;;
  *) usage ;;
esac
