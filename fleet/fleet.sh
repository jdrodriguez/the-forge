#!/usr/bin/env bash
# fleet.sh: dispatch work to the other Claude accounts on this machine and manage those sessions.
set -euo pipefail

FLEET_HOME="${CLAUDE_FLEET_HOME:-$HOME}"
# FLEET_SOCK_DIR and FLEET_ADDR_WAIT let tests avoid the real /tmp/cc-socks and the 5 second wait.
# FLEET_USAGE_RETRY_WAIT does the same for the 2 seconds between a usage refresh that saved nothing and its repeat.
SOCK_DIR="${FLEET_SOCK_DIR:-/tmp/cc-socks}"
ADDR_WAIT="${FLEET_ADDR_WAIT:-5}"
case $ADDR_WAIT in '' | *[!0123456789]*) ADDR_WAIT=5 ;; esac
# Plan usage comes from 'claude -p /usage'. The CLI answers from its saved snapshot while that is under a minute old
# and shows a snapshot as last-known for up to an hour, so fleet.sh uses the same two limits.
USAGE_FRESH=60
USAGE_MAX_AGE=3600
USAGE_RETRY_WAIT="${FLEET_USAGE_RETRY_WAIT:-2}"
case $USAGE_RETRY_WAIT in '' | *[!0123456789]*) USAGE_RETRY_WAIT=2 ;; esac
# FLEET_USAGE_TIMEOUT is how many seconds one 'claude -p /usage' may take.
USAGE_TIMEOUT="${FLEET_USAGE_TIMEOUT:-20}"
case $USAGE_TIMEOUT in '' | *[!0123456789]*) USAGE_TIMEOUT=20 ;; esac
if [ "${#USAGE_TIMEOUT}" -gt 6 ] || [ -z "${USAGE_TIMEOUT//0/}" ]; then USAGE_TIMEOUT=20; fi
# FLEET_REFRESH_GRACE is how many more seconds a timed run gets while its account's sign-in refresh is in progress.
# Claude treats that lock as stale after 60 seconds, so waiting longer buys nothing.
REFRESH_GRACE="${FLEET_REFRESH_GRACE:-60}"
case $REFRESH_GRACE in '' | *[!0123456789]*) REFRESH_GRACE=60 ;; esac
if [ "${#REFRESH_GRACE}" -gt 6 ]; then REFRESH_GRACE=60; fi
# The CLI lists acceptEdits, auto, bypassPermissions, manual, dontAsk and plan. It still parses default.
VALID_MODES=(default acceptEdits auto bypassPermissions manual dontAsk plan)
VALID_EFFORTS=(low medium high xhigh max)
LABELS=()
TMPD=""
ERRF=""

warn() { printf 'fleet: %s\n' "$*" >&2; }
die() {
  warn "$*"
  exit 1
}
usage_err() {
  warn "$*"
  warn "run 'fleet.sh help' for usage"
  exit 2
}

usage() {
  cat <<'EOF'
fleet.sh: run Claude sessions on the other accounts on this machine.

Usage:
  fleet.sh accounts [--json]
  fleet.sh ps [--json] [--all]
  fleet.sh usage [--json]
  fleet.sh dispatch <label|auto> [--cwd DIR] [--name NAME] [--mode MODE]
                    [--agent NAME] [--model NAME] [--effort LEVEL]
                    [--max-workers N] [--force] [--allow-nested] [--no-report]
                    [--no-delegation-note] [--dry-run]
                    -- <prompt...>
  fleet.sh address <label> <id|name>
  fleet.sh logs <label> <id|name> [-n N]
  fleet.sh stop <label> <id|name>
  fleet.sh help

Accounts: label a is ~/.claude. Label X is ~/.claude-X for each folder whose name
ends in lowercase letters or digits and that holds a .claude.json. Labels are
lowercase. CLAUDE_FLEET_HOME sets the folder that holds them (default $HOME).

dispatch   Starts a background session on the account and prints
           {label, email, id, name, cwd, address} as JSON. 'auto' picks the signed-in
           account in this order: not at the worker cap, no spent 5-hour or weekly
           window, the most weekly headroom (see usage; an unknown figure counts as
           none), the fewest working background sessions (idle and done ones do not
           count), then b, c, any other extra account, then a. When no weekly figure
           can be read anywhere, headroom drops out of the order.
           Defaults: --cwd is the current directory (the home folder is refused),
           --mode is bypassPermissions, --name is fleet-<label>-<HHMMSS>-<pid>.
           MODE is one of default acceptEdits auto bypassPermissions manual dontAsk
           plan. --model NAME and --effort LEVEL (low medium high xhigh max) go to
           claude only when given. The launch is refused when the account already has
           --max-workers working background sessions (default 4, or FLEET_MAX_WORKERS);
           --force skips that check. Inside a background session dispatch is refused
           unless --allow-nested is given. Unless --no-delegation-note is given, the
           prompt gains a note telling the worker to send read-only leaf work to Codex
           or Grok through the repo's scripts/ext-agent.sh and to put questions for the
           human (human.name in the config) through inbox/ask-human.sh. Unless
           --no-report is given, the prompt ends with a request to report back to the
           calling session.
           --dry-run runs every check, then prints {dry_run, label, email, name, cwd, env,
           argv, prompt} as JSON and exits 0 without starting a session.
ps         Lists every account's sessions with the address to message each one.
           --all adds finished background sessions.
usage      Prints each account's remaining 5-hour and weekly plan usage with the local
           reset times, its working background sessions and the age of the figures.
           WEEK_LEFT is the weekly window with the least room left, whether it covers
           all models or one model; WEEK_WINDOW names it. The figures come from the
           snapshot that 'claude -p /usage' saves in the account's .claude.json. A
           snapshot under a minute old is used as is. A refresh that saves nothing new is
           repeated once. When the refresh fails (the usage endpoint is rate limited at
           times), a snapshot up to an hour old stands in and AGE shows how old it is.
           A dash means the figure is unknown.
           FLEET_USAGE_TIMEOUT sets how many seconds one refresh may take (default 20).
           A refresh that reaches it while the account's sign-in is being renewed gets up
           to FLEET_REFRESH_GRACE more seconds (default 60), so the new login is saved.
address    Prints the uds: address of a session.
logs       Prints the last N (default 40) lines of a background session's output,
           cleaned of terminal escape codes.
stop       Stops a background session.

<id|name> matches a session id, a sessionId prefix of 4 or more characters, or a name.
logs and stop apply to background sessions only. When claude itself fails, they print
'claude exited <code>' and exit 1.

Exit codes: 0 ok, 1 any other failure, 2 usage, 3 workspace not trusted, 4 bypassPermissions
disclaimer or auto-mode opt-in missing, 5 account not signed in, 6 worker cap reached,
7 nested dispatch refused.
EOF
}

need_tools() {
  local t
  command -v jq >/dev/null 2>&1 || die "jq is required (brew install jq)"
  command -v claude >/dev/null 2>&1 || die "claude is not on PATH"
  if [ -z "$TMPD" ]; then
    t=${TMPDIR:-/tmp}
    TMPD=$(mktemp -d "${t%/}/fleet.XXXXXX")
    ERRF=$TMPD/err
    trap 'rm -rf "$TMPD"' EXIT
  fi
}

# Checked before a launch, because a missing perl would otherwise fail after the session started.
need_perl() { command -v perl >/dev/null 2>&1 || die "perl is required (it ships with macOS)"; }

# Explicit classes, because under en_US.UTF-8 bash 3.2 lets [a-z] match B and e-acute.
is_uint() {
  case $1 in
    '' | *[!0123456789]*) return 1 ;;
  esac
  return 0
}

# A whole number from 1 to 999999. The length limit keeps the shell's integer tests in range.
valid_cap() {
  is_uint "$1" || return 1
  [ "${#1}" -le 6 ] || return 1
  [ -n "${1//0/}" ]
}

valid_suffix() {
  case $1 in
    '' | *[!abcdefghijklmnopqrstuvwxyz0123456789]*) return 1 ;;
  esac
  return 0
}

# The path goes into the worker's prompt, so it must be a plain absolute path to a .sock file.
valid_socket_path() {
  case $1 in
    /*.sock) ;;
    *) return 1 ;;
  esac
  case $1 in
    *[[:space:][:cntrl:]]*) return 1 ;;
  esac
  return 0
}

list_labels() {
  local d suffix
  printf 'a\n'
  for d in "$FLEET_HOME"/.claude-*; do
    [ -d "$d" ] || continue
    suffix=${d##*/.claude-}
    # Label a always means ~/.claude, so a ~/.claude-a folder adds nothing.
    [ "$suffix" != a ] || continue
    valid_suffix "$suffix" || continue
    [ -f "$d/.claude.json" ] || continue
    printf '%s\n' "$suffix"
  done
}

load_labels() {
  local l
  LABELS=()
  while IFS= read -r l; do
    LABELS+=("$l")
  done < <(list_labels)
}

label_exists() {
  local l
  for l in "${LABELS[@]}"; do
    if [ "$l" = "$1" ]; then return 0; fi
  done
  return 1
}

require_label() {
  load_labels
  if ! label_exists "$1"; then usage_err "unknown account '$1' (known: ${LABELS[*]}; labels are lowercase)"; fi
}

acct_dir() {
  if [ "$1" = a ]; then
    printf '%s/.claude' "$FLEET_HOME"
  else
    printf '%s/.claude-%s' "$FLEET_HOME" "$1"
  fi
}

# The shell prefix that selects an account, for the fix hints.
acct_env() {
  if [ "$1" = a ]; then
    printf 'env -u CLAUDE_CONFIG_DIR'
  else
    printf 'CLAUDE_CONFIG_DIR=%q' "$(acct_dir "$1")"
  fi
}

# Label a drops CLAUDE_CONFIG_DIR so the call also works from inside a b or c session.
run_claude() {
  local label=$1
  shift
  if [ "$label" = a ]; then
    env -u CLAUDE_CONFIG_DIR claude "$@" </dev/null
  else
    CLAUDE_CONFIG_DIR="$(acct_dir "$label")" claude "$@" </dev/null
  fi
}

auth_json() {
  local out
  out=$(run_claude "$1" auth status --json 2>/dev/null) || true
  if printf '%s' "$out" | jq -e 'type == "object"' >/dev/null 2>&1; then
    printf '%s' "$out"
  else
    printf '{}'
  fi
}

is_signed_in() {
  printf '%s' "$1" | jq -e '.loggedIn == true and .authMethod == "claude.ai"' >/dev/null 2>&1
}

account_json() { # label auth-json
  jq -n --arg label "$1" --arg dir "$(acct_dir "$1")" --argjson auth "$2" '{
    label: $label,
    dir: $dir,
    email: ($auth.email // ""),
    subscriptionType: ($auth.subscriptionType // ""),
    signed_in: (($auth.loggedIn == true) and ($auth.authMethod == "claude.ai"))
  }'
}

table() { column -t -s $'\t'; }

# Address contract: uds: plus messagingSocketPath from sessions/<pid>.json, else the socket for that pid, else empty.
session_address() { # label pid
  local reg path
  if ! is_uint "$2"; then return 0; fi
  reg="$(acct_dir "$1")/sessions/$2.json"
  if [ -f "$reg" ]; then
    path=$(jq -r '.messagingSocketPath // empty' "$reg" 2>/dev/null) || path=""
    if [ -n "$path" ]; then printf 'uds:%s' "$path"; fi
  elif [ -S "$SOCK_DIR/$2.sock" ]; then
    printf 'uds:%s' "$SOCK_DIR/$2.sock"
  fi
  return 0
}

list_sessions() { # label [--all]; prints the JSON list
  local label=$1 out first
  shift
  if ! out=$(run_claude "$label" agents --json "$@" 2>"$ERRF"); then
    first=$(head -n 1 "$ERRF")
    warn "claude agents --json failed on account $label${first:+: $first}"
    return 1
  fi
  if ! printf '%s' "$out" | jq -e 'type == "array" and all(.[]; type == "object")' >/dev/null 2>&1; then
    warn "claude agents --json on account $label did not return a JSON list"
    return 1
  fi
  printf '%s' "$out"
}

# A background session is working unless its state is idle or done. Interactive sessions never count, and neither
# does a row with no process: that is a session left over from a restart, which claude agents still lists.
count_working() { # rows
  printf '%s' "$1" | jq '[.[] | select(.kind == "background" and .pid != null and ((.state // .status // "") | IN("idle", "done") | not))] | length'
}

# ps --json lists these fields and nothing else from a CLI row, plus label, email and address.
annotate_rows() { # label email rows
  local label=$1 email=$2 rows=$3 pid addr pairs="" map
  while IFS= read -r pid; do
    addr=$(session_address "$label" "$pid")
    if [ -n "$addr" ]; then pairs="$pairs$pid"$'\t'"$addr"$'\n'; fi
  done < <(printf '%s' "$rows" | jq -r '.[] | .pid // empty')
  map=$(printf '%s' "$pairs" | jq -Rn '[inputs | select(length > 0) | split("\t") | {(.[0]): .[1]}] | add // {}')
  printf '%s' "$rows" | jq -c --arg label "$label" --arg email "$email" --argjson map "$map" '
    map({label: $label, email: $email}
        + with_entries(select(.key | IN("id", "name", "kind", "status", "state", "cwd", "pid", "sessionId")))
        + {address: ($map[((.pid // "") | tostring)] // "")})'
}

# Resolves an id, a sessionId prefix of 4+ characters, or a name to exactly one session row.
resolve_session() { # label ref [--all]
  local label=$1 ref=$2 rows matches count
  shift 2
  if ! rows=$(list_sessions "$label" "$@"); then return 1; fi
  matches=$(printf '%s' "$rows" | jq -c --arg r "$ref" \
    '[.[] | select(.id == $r or .name == $r or (($r | length) >= 4 and ((.sessionId // "") | startswith($r))))]')
  count=$(printf '%s' "$matches" | jq 'length')
  if [ "$count" -eq 0 ]; then
    if [ $# -gt 0 ]; then
      warn "no session matches '$ref' on account $label (see: fleet.sh ps --all)"
    else
      warn "no live session matches '$ref' on account $label (finished ones are in: fleet.sh ps --all)"
    fi
    return 1
  fi
  if [ "$count" -gt 1 ]; then
    warn "'$ref' matches $count sessions on account $label, use an id or a longer sessionId prefix:"
    printf '%s' "$matches" | jq -r '.[] | "  \(.id // ((.sessionId // "-") | .[0:8]))  \(.name // "-")  \(.status // .state // "-")"' >&2
    return 1
  fi
  printf '%s' "$matches" | jq -c '.[0]'
}

background_id() { # row ref
  local id
  id=$(printf '%s' "$1" | jq -r '.id // empty')
  if [ -z "$id" ]; then
    warn "'$2' is an interactive session; logs and stop apply to background sessions only"
    return 1
  fi
  printf '%s' "$id"
}

# Strips escape sequences, keeps the last redraw of each line, squeezes blank lines, keeps the last N lines.
clean_text() { # N
  perl -e '
    my $n = shift @ARGV;
    local $/;
    my $s = <STDIN>;
    $s = "" unless defined $s;
    $s =~ s/\e\][^\a\e]*(?:\a|\e\\)?//g;
    $s =~ s/\e[PX^_][^\e]*(?:\e\\)?//g;
    $s =~ s/\e\[(\d*)C/" " x ($1 eq "" ? 1 : $1)/ge;
    $s =~ s/\e\[[0-?]*[ -\/]*[@-~]//g;
    $s =~ s/\e[()*+][0-9A-Za-z]//g;
    $s =~ s/\e[0-9=<>@-Zc\\-_]//g;
    $s =~ s/\r\n/\n/g;
    my @lines;
    my $blank = 0;
    for my $l (split /\n/, $s, -1) {
      $l =~ s/\r+$//;
      $l =~ s/.*\r//;
      $l =~ s/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]//g;
      $l =~ s/\s+$//;
      if ($l eq "") { next if $blank || !@lines; $blank = 1 } else { $blank = 0 }
      push @lines, $l;
    }
    pop @lines while @lines && $lines[-1] eq "";
    my $start = @lines > $n ? @lines - $n : 0;
    print "$_\n" for @lines[$start .. $#lines];
  ' "$1"
}

# Prints "<id><TAB><name>" from the "backgrounded · <id> · <name>" line.
parse_backgrounded() {
  perl -ne '
    if (/^\s*backgrounded\s+[^\w\s]+\s+(\S+)(?:\s+[^\w\s]+\s+(.*?))?\s*$/) { print "$1\t", (defined $2 ? $2 : ""), "\n"; exit }
    if (/^\s*backgrounded\b\W*([0-9A-Za-z][\w-]*)/) { print "$1\t\n"; exit }
  '
}

# ---------- plan usage ----------
# 'claude -p /usage' asks Anthropic for the account's usage windows and prints them as text. The CLI also saves its raw
# answer as cachedUsageUtilization in the account's .claude.json. fleet.sh reads that copy because it carries the
# reset times and the window kinds in a form a script can use. Only that key and the account id are read; the file
# also holds sign-in details and MCP settings.

# Where the CLI saves an account's state: <config dir>/.claude.json, and ~/.claude.json for ~/.claude.
config_file() {
  if [ "$1" = a ]; then
    printf '%s/.claude.json' "$FLEET_HOME"
  else
    printf '%s/.claude.json' "$(acct_dir "$1")"
  fi
}

# Like the CLI, drop a snapshot that was saved for another account (the folder was signed in again).
# shellcheck disable=SC2016 # the $names in the jq programs are jq variables
SNAPSHOT_JQ='
  objects
  | ((.oauthAccount | objects | .accountUuid) // null) as $me
  | ((.cachedUsageUtilization | objects) // null) as $s
  | if ($s.fetchedAtMs | type) != "number" or ($s.utilization | type) != "object" then empty
    elif $s.accountUuid != null and $me != null and $s.accountUuid != $me then empty
    else {fetched_ms: $s.fetchedAtMs, utilization: $s.utilization}
    end'

# Prints {fetched_ms, utilization} from the account's saved usage, or nothing. A file that does not parse is read
# again, up to three times, in case the CLI was writing it.
read_plan_usage() { # label
  local cfg out i
  cfg=$(config_file "$1")
  if [ ! -f "$cfg" ]; then return 0; fi
  for i in 1 2 3; do
    if out=$(jq -c "$SNAPSHOT_JQ" "$cfg" 2>/dev/null); then
      printf '%s' "$out"
      return 0
    fi
    if [ "$i" -lt 3 ]; then sleep 0.2; fi
  done
  return 0
}

# True when the account's saved usage is under USAGE_FRESH seconds old.
plan_usage_fresh() { # label
  read_plan_usage "$1" | jq -e --argjson fresh "$USAGE_FRESH" '(now - .fetched_ms / 1000) | (. >= 0 and . < $fresh)' >/dev/null 2>&1
}

# The time limit for run_claude_timed, as a perl program. Args: seconds, grace, lock path, then the command. At the
# limit it sends SIGTERM, then SIGKILL 5 seconds later, and exits 142, the code a timeout always had. While the lock
# path exists, claude is refreshing the account's sign-in: the server has already replaced the refresh token, and a
# claude killed before it saves the new one leaves the account signed out. So the limit waits
# for the lock to clear, for up to grace more seconds. Otherwise the exit code is claude's own.
# shellcheck disable=SC2016 # perl variables, not shell ones
TIMED_PERL='use POSIX ":sys_wait_h"; use Time::HiRes qw(time sleep);
my ($secs, $grace, $lock) = splice(@ARGV, 0, 3);
my $pid = fork; die "fork: $!\n" unless defined $pid;
if (!$pid) { exec @ARGV; exit 127 }
my ($status, $deadline) = (undef, time + $secs);
sub reaped { my $r = waitpid($pid, WNOHANG); $status = $? if $r == $pid; return $r == $pid || $r == -1 }
while (1) {
  if (reaped()) { exit(!defined $status ? 1 : $status & 127 ? 128 + ($status & 127) : $status >> 8) }
  my $now = time;
  if ($now >= $deadline && !(-e $lock && $now < $deadline + $grace)) {
    kill "TERM", $pid;
    for (1 .. 50) { last if reaped(); sleep 0.1 }
    kill "KILL", $pid;
    waitpid($pid, 0);
    exit 142;
  }
  sleep 0.1;
}'

# run_claude with a time limit that never cuts off a sign-in refresh (see TIMED_PERL).
run_claude_timed() { # label seconds args...
  local label=$1 secs=$2 lock
  shift 2
  lock="$(acct_dir "$label")/.oauth_refresh.lock"
  if [ "$label" = a ]; then
    env -u CLAUDE_CONFIG_DIR perl -e "$TIMED_PERL" "$secs" "$REFRESH_GRACE" "$lock" claude "$@" </dev/null
  else
    CLAUDE_CONFIG_DIR="$(acct_dir "$label")" perl -e "$TIMED_PERL" "$secs" "$REFRESH_GRACE" "$lock" claude "$@" </dev/null
  fi
}

# Runs 'claude -p /usage' on every given account at once, from the temp folder. --safe-mode skips hooks and plugins,
# which keeps each run near a second. The answer lands in the account's saved usage; the exit code and stderr stay in
# TMPD for plan_usage_json.
refresh_plan_usage() { # label...
  local l
  for l in "$@"; do
    rm -f "$TMPD/usage.$l.rc" "$TMPD/usage.$l.err"
    (
      rc=0
      cd -- "${TMPDIR:-/tmp}" 2>/dev/null || true
      run_claude_timed "$l" "$USAGE_TIMEOUT" -p /usage --safe-mode --no-session-persistence >/dev/null 2>"$TMPD/usage.$l.err" || rc=$?
      printf '%s' "$rc" >"$TMPD/usage.$l.rc"
    ) &
  done
  wait
}

# Input: nothing. Args: snap (the saved usage or null), err and rc (the refresh's stderr and exit code), timeout, fresh,
# max. A refresh that exits 0 yet leaves the saved usage older than fresh seconds got no usable answer from the usage
# endpoint (the CLI then prints the old figures without saying so), which counts as a failed refresh.
# Output: the account's usage, with the 5-hour window, the weekly window with the least room left, and every window.
# A window whose reset time has passed is dropped, the way the status line drops it.
# shellcheck disable=SC2016 # the $names in the jq programs are jq variables
PLAN_USAGE_JQ='
  def epoch: if type == "string"
    then (sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | try fromdateiso8601 catch null)
    else null end;
  def scope_name: (.scope | objects | ((.model | objects | .display_name) // (.surface | objects | .display_name))) // null;
  def win($group; $kind; $scope; $used; $resets):
    if ($used | type) == "number"
    then {group: $group, kind: $kind, scope: $scope, used_percentage: $used,
          remaining_percentage: ([100 - $used, 0] | max | . * 100 | round / 100), resets_at: ($resets | epoch)}
    else empty end;
  def clean: explode | map(if . < 32 or . == 127 then 32 else . end) | implode | gsub("\\s+"; " ") | sub("^ "; "") | sub(" $"; "");
  def failure:
    if ($rc | type) == "number" and $rc != 0 then
      ($err | split("\n") | map(clean | select(length > 0)) | ((first // "") | .[0:160])) as $t
      | if $rc == 142 then "timed out after \($timeout)s"
        elif $t != "" then $t
        else "claude exited \($rc)" end
    else "" end;
  def pick: if . == null then null else {used_percentage, remaining_percentage, resets_at} end;
  def unavailable($why):
    {available: false, fetched_at: null, age_seconds: null, refresh_error: $why,
     five_hour: null, weekly: null, windows: []};
  failure as $failed
  | ($snap | if . == null then null else now - (.fetched_ms / 1000) end) as $age
  | (if $failed != "" then $failed
     elif ($rc | type) == "number" and $age != null and $age >= $fresh then "the CLI saved no new answer"
     else "" end) as $why
  | if $snap == null or $age < 0 then unavailable(if $why != "" then $why else "no saved usage found" end)
    elif $age > $max then
      unavailable(if $why != "" then $why else "the saved usage is \($age / 60 | floor) minutes old" end)
    else
      $snap.utilization as $u
      | (if ($u.limits | type) == "array" and ($u.limits | length) > 0
         then [$u.limits[] | objects | win(.group // ""; .kind // ""; scope_name; .percent; .resets_at)]
         else [win("session"; "session"; null; $u.five_hour.utilization?; $u.five_hour.resets_at?),
               win("weekly"; "weekly_all"; null; $u.seven_day.utilization?; $u.seven_day.resets_at?),
               win("weekly"; "weekly_scoped"; "Opus"; $u.seven_day_opus.utilization?; $u.seven_day_opus.resets_at?),
               win("weekly"; "weekly_scoped"; "Sonnet"; $u.seven_day_sonnet.utilization?; $u.seven_day_sonnet.resets_at?)]
         end
         | map(select(.resets_at == null or .resets_at > now))) as $w
      | ($w | map(select(.group == "session")) | sort_by(-.used_percentage) | first) as $s
      | ($w | map(select(.group == "weekly")) | sort_by([-.used_percentage, (.kind != "weekly_all")]) | first) as $k
      | {available: true, fetched_at: ($snap.fetched_ms / 1000 | floor), age_seconds: ($age | floor),
         refresh_error: (if $why == "" then null else $why end),
         five_hour: ($s | pick),
         weekly: (if $k == null then null
                  else ($k | pick) + {window: (if $k.kind == "weekly_all" then "all models" else ($k.scope // "scoped") end)} end),
         windows: $w}
    end'

# Prints the account's usage as JSON, from the saved usage and the refresh that refresh_plan_usage left in TMPD.
plan_usage_json() { # label
  local snap errf rc=null
  snap=$(read_plan_usage "$1")
  errf=$TMPD/usage.$1.err
  if [ ! -f "$errf" ]; then errf=/dev/null; fi
  if [ -f "$TMPD/usage.$1.rc" ]; then rc=$(<"$TMPD/usage.$1.rc"); fi
  if ! is_uint "$rc"; then rc=null; fi
  jq -nc --argjson snap "${snap:-null}" --rawfile err "$errf" --argjson rc "$rc" \
    --argjson timeout "$USAGE_TIMEOUT" --argjson fresh "$USAGE_FRESH" --argjson max "$USAGE_MAX_AGE" "$PLAN_USAGE_JQ"
}

# True when the last refresh of the account exited 0 but left no saved answer younger than USAGE_FRESH.
refresh_saved_nothing() { # label
  [ "$(<"$TMPD/usage.$1.rc")" = 0 ] && ! plan_usage_fresh "$1"
}

# One JSON row per account, in the order given: sign-in, plan, working background sessions and plan usage. The usage
# of every signed-in account whose saved copy is older than USAGE_FRESH is refreshed first, all accounts at once.
# A refresh that saved nothing is repeated once, 2 seconds later, because the usage endpoint answers badly now and then.
account_rows() { # label...
  local l auth rows working usage signed=() stale=() again=()
  for l in "$@"; do
    auth=$(auth_json "$l")
    printf '%s' "$auth" >"$TMPD/auth.$l"
    if is_signed_in "$auth"; then signed+=("$l"); fi
  done
  if [ "${#signed[@]}" -gt 0 ]; then
    for l in "${signed[@]}"; do
      if ! plan_usage_fresh "$l"; then stale+=("$l"); fi
    done
  fi
  if [ "${#stale[@]}" -gt 0 ]; then
    refresh_plan_usage "${stale[@]}"
    for l in "${stale[@]}"; do
      if refresh_saved_nothing "$l"; then again+=("$l"); fi
    done
    if [ "${#again[@]}" -gt 0 ]; then
      sleep "$USAGE_RETRY_WAIT"
      refresh_plan_usage "${again[@]}"
    fi
  fi
  for l in "$@"; do
    auth=$(<"$TMPD/auth.$l")
    working=null
    usage=null
    if is_signed_in "$auth"; then
      if rows=$(list_sessions "$l"); then working=$(count_working "$rows"); fi
      usage=$(plan_usage_json "$l")
    fi
    account_json "$l" "$auth" | jq -c --argjson w "$working" --argjson u "$usage" 'del(.dir) + {working: $w, usage: $u}'
  done | jq -s '.'
}

cmd_accounts() {
  local json=0 label rows
  while [ $# -gt 0 ]; do
    case $1 in
      --json) json=1 ;;
      *) usage_err "accounts: unknown option '$1'" ;;
    esac
    shift
  done
  need_tools
  load_labels
  rows=$(for label in "${LABELS[@]}"; do account_json "$label" "$(auth_json "$label")"; done | jq -s '.')
  if [ "$json" = 1 ]; then
    printf '%s' "$rows" | jq .
  else
    printf '%s' "$rows" | jq -r '
      (["LABEL", "DIR", "EMAIL", "SUBSCRIPTION", "SIGNED_IN"],
       (.[] | [.label, .dir, (.email | if . == "" then "-" else . end),
               (.subscriptionType | if . == "" then "-" else . end), (.signed_in | tostring)]))
      | @tsv' | table
  fi
}

cmd_ps() {
  local json=0 all="" label merged
  while [ $# -gt 0 ]; do
    case $1 in
      --json) json=1 ;;
      --all) all="--all" ;;
      *) usage_err "ps: unknown option '$1'" ;;
    esac
    shift
  done
  need_tools
  load_labels
  merged=$(
    for label in "${LABELS[@]}"; do
      if ! rows=$(list_sessions "$label" ${all:+"$all"}); then continue; fi
      email=$(auth_json "$label" | jq -r '.email // ""')
      annotate_rows "$label" "$email" "$rows"
    done | jq -s 'add // []'
  )
  if [ "$json" = 1 ]; then
    printf '%s' "$merged" | jq .
  else
    # BSD column -t collapses empty cells and shifts the row, so every empty or null field prints as -.
    printf '%s' "$merged" | jq -r --arg home "$HOME" '
      def short:
        (if ($home | length) > 1 and (. == $home or startswith($home + "/")) then "~" + .[($home | length):] else . end)
        | if length > 40 then "..." + .[(length - 37):] else . end;
      def blank: if . == "" then null else . end;
      def dash: if . == null or . == "" then "-" else . end;
      (["LABEL", "ID", "NAME", "KIND", "STATUS", "CWD", "ADDRESS"],
       (.[] | [.label, .id, .name, .kind, ((.status | blank) // .state),
               (.cwd | blank | if . == null then . else short end), .address]
             | map(dash)))
      | @tsv' | table
  fi
}

JQ_AGE='def age: if . < 60 then "\(.)s" elif . < 3600 then "\(. / 60 | floor)m" else "\(. / 3600 | floor)h\(. % 3600 / 60 | floor)m" end;'

# One line per account that needs a warning: label, kind (signedout, unavailable or stale) and the message.
USAGE_NOTES_JQ='
  .[]
  | if (.signed_in | not) then [.label, "signedout", ""]
    elif (.usage.available | not) then [.label, "unavailable", "plan usage for account \(.label) is unavailable: \(.usage.refresh_error)"]
    elif .usage.refresh_error != null then
      [.label, "stale", "plan usage for account \(.label) is \(.usage.age_seconds | age) old because the refresh failed: \(.usage.refresh_error)"]
    else empty end
  | @tsv'

# BSD column -t collapses empty cells, so every unknown figure prints as a dash.
USAGE_TABLE_JQ='
  def pct: if . == null then "-" else "\(. + 0.5 | floor)%" end;
  def when: if . == null then "-" else strflocaltime("%m-%d %H:%M") end;
  (["LABEL", "PLAN", "5H_LEFT", "5H_RESETS", "WEEK_LEFT", "WEEK_RESETS", "WEEK_WINDOW", "WORKING", "AGE"],
   (.[] | [.label,
           (.subscriptionType | if . == "" then "-" else . end),
           (.usage.five_hour.remaining_percentage | pct),
           (.usage.five_hour.resets_at | when),
           (.usage.weekly.remaining_percentage | pct),
           (.usage.weekly.resets_at | when),
           (.usage.weekly.window // "-"),
           (.working | if . == null then "-" else tostring end),
           (.usage.age_seconds | if . == null then "-" else age end)]))
  | @tsv'

cmd_usage() {
  local json=0 rows l kind msg
  while [ $# -gt 0 ]; do
    case $1 in
      --json) json=1 ;;
      *) usage_err "usage: unknown option '$1'" ;;
    esac
    shift
  done
  need_tools
  need_perl
  load_labels
  rows=$(account_rows "${LABELS[@]}")
  while IFS=$'\t' read -r l kind msg; do
    if [ "$kind" = signedout ]; then
      warn "account $l is not signed in. Fix: run \`$(acct_env "$l") claude auth login\`"
    else
      warn "$msg"
    fi
  done < <(printf '%s' "$rows" | jq -r "$JQ_AGE $USAGE_NOTES_JQ")
  if [ "$json" = 1 ]; then
    printf '%s' "$rows" | jq .
  else
    printf '%s' "$rows" | jq -r "$JQ_AGE $USAGE_TABLE_JQ" | table
  fi
}

in_list() { # value item...
  local v=$1 i
  shift
  for i in "$@"; do
    if [ "$i" = "$v" ]; then return 0; fi
  done
  return 1
}

valid_mode() { in_list "$1" "${VALID_MODES[@]}"; }

valid_effort() { in_list "$1" "${VALID_EFFORTS[@]}"; }

# Sorts the signed-in accounts whose session list could be read. The first key that differs decides:
# an account at the worker cap comes last (cap 0 switches that off), then one with a spent 5-hour or weekly window,
# then the one with the most weekly headroom goes first (an unknown figure counts as none), then the one with the
# fewest working background sessions. The last key is the position in the order given: b, c, other extras, a.
# shellcheck disable=SC2016 # the $names in the jq programs are jq variables
PICK_JQ='
  to_entries
  | map(.value + {order: .key})
  | map(select(.signed_in and .working != null))
  | sort_by([
      ($cap > 0 and .working >= $cap),
      ((.usage.five_hour.used_percentage // 0) >= 100 or (.usage.weekly.used_percentage // 0) >= 100),
      (0 - (.usage.weekly.remaining_percentage // 0)),
      .working,
      .order
    ])
  | (.[0].label // empty)'

# The signed-in account that dispatch auto runs on; see PICK_JQ for the order. Prints its label.
pick_auto() { # cap: 0 for none
  local cap=$1 order=() l rows best
  for l in b c; do
    if label_exists "$l"; then order+=("$l"); fi
  done
  for l in "${LABELS[@]}"; do
    case $l in
      a | b | c) ;;
      *) order+=("$l") ;;
    esac
  done
  order+=(a)
  rows=$(account_rows "${order[@]}")
  best=$(printf '%s' "$rows" | jq -r --argjson cap "$cap" "$PICK_JQ")
  if [ -z "$best" ]; then
    warn "no signed-in account to dispatch to. Fix: run \`$(acct_env "${LABELS[1]:-a}") claude auth login\`"
    return 5
  fi
  if printf '%s' "$rows" | jq -e 'map(select(.signed_in and .working != null)) | any(.usage.weekly != null) | not' >/dev/null; then
    warn "no weekly usage figure could be read, so auto cannot compare headroom (see: fleet.sh usage)"
  fi
  printf '%s' "$best"
}

# Exits 6 when the account already has max working background sessions, and 1 when it cannot count them.
check_cap() { # label max
  local rows working
  if ! rows=$(list_sessions "$1"); then
    die "could not count the background sessions on account $1, so the worker cap was not checked; pass --force to launch anyway"
  fi
  working=$(count_working "$rows")
  if [ "$working" -ge "$2" ]; then
    warn "account $1 already has $working working background sessions (cap $2); wait for one to finish or pass --force"
    exit 6
  fi
}

# Maps a failed launch to an exit code and a one-line fix.
launch_failure() { # label cwd output exit-code
  local label=$1 cwd=$2 out=$3 rc=$4 lc aenv
  lc=$(printf '%s' "$out" | LC_ALL=C tr '[:upper:]' '[:lower:]')
  aenv=$(acct_env "$label")
  case $lc in
    *"workspace not trusted"*)
      warn "workspace not trusted on account $label. Fix: run \`$aenv claude\` once in $cwd and accept the trust prompt"
      exit 3
      ;;
    *"requires accepting the disclaimer"*)
      warn "account $label has not accepted the bypassPermissions disclaimer. Fix: run \`$aenv claude --dangerously-skip-permissions\` once, accept, then /exit"
      exit 4
      ;;
    *"auto mode requires opting in"*)
      warn "account $label has not opted in to auto mode. Fix: run \`$aenv claude --permission-mode auto\` once interactively"
      exit 4
      ;;
    *"not logged in"* | *"not signed in"* | *"auth login"* | *"authentication_error"* | *"invalid api key"* | *"token has expired"*)
      warn "account $label is not signed in. Fix: run \`$aenv claude auth login\`"
      exit 5
      ;;
  esac
  warn "claude --bg did not start a session on account $label (exit $rc):"
  printf '%s\n' "$out" >&2
  exit 1
}

# Waits up to ADDR_WAIT seconds for the new session to show up with a registry file or socket.
wait_for_address() { # label id
  local deadline rows pid addr=""
  deadline=$((SECONDS + ADDR_WAIT))
  while :; do
    if rows=$(list_sessions "$1" 2>/dev/null); then
      pid=$(printf '%s' "$rows" | jq -r --arg id "$2" \
        'first(.[] | select(.id == $id or ((.sessionId // "") | startswith($id))) | .pid) // empty')
      addr=$(session_address "$1" "$pid")
      if [ -n "$addr" ]; then break; fi
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then break; fi
    sleep 0.5
  done
  printf '%s' "$addr"
}

# The repo root: the folder above the one that really holds this file (fleet/fleet.sh). A skill folder symlinked
# into ~/.claude/skills, or a symlink to the file itself, still finds the repo. macOS's bash 3.2 has no readlink -f,
# so file links are followed one at a time, and cd -P resolves the folder links.
fleet_root() {
  local self=${BASH_SOURCE[0]} link dir
  while [ -L "$self" ]; do
    link=$(readlink "$self")
    case $link in
      /*) self=$link ;;
      *) case $self in */*) self=${self%/*}/$link ;; *) self=$link ;; esac ;;
    esac
  done
  case $self in */*) dir=${self%/*} ;; *) dir=. ;; esac
  (cd -P -- "${dir:-/}" && cd -P .. && pwd -P)
}

# The human the queue works for: human.name in the repo config. A copy of fleet.sh outside the repo, a missing
# config, a missing node or a name with control characters in it all give "the human", so dispatch still works.
human_name() { # root
  local name=""
  if [ -f "$1/lib/config.mjs" ] && command -v node >/dev/null 2>&1; then
    name=$(node "$1/lib/config.mjs" get human.name 2>/dev/null </dev/null) || name=""
  fi
  case $name in
    *[[:cntrl:]]*) name="" ;;
    *[![:space:]]*) ;;
    *) name="" ;;
  esac
  printf '%s' "${name:-the human}"
}

# The request to report back, or nothing (with a warning) when there is no usable reply address.
report_footer() { # human
  local sock=${CLAUDE_CODE_MESSAGING_SOCKET:-}
  if [ -z "$sock" ]; then
    warn "CLAUDE_CODE_MESSAGING_SOCKET is not set, so the prompt has no reply address"
  elif valid_socket_path "$sock"; then
    printf 'When you finish, or if you get blocked, send a short report with SendMessage to uds:%s, the session that dispatched you. Say what you did, link any PR, and name anything you need from %s.' "$sock" "$1"
  else
    warn "CLAUDE_CODE_MESSAGING_SOCKET is not an absolute path ending in .sock without whitespace or control characters, so the prompt has no reply address"
  fi
}

# Every worker is told it can hand read-only leaf work to Codex and Grok, so its own account's
# tokens go to the build itself. A narrow brief rarely prompts a worker to reach for them, so the
# dispatch states it each time. The script paths are the repo's own, written as shell words.
delegation_note() { # root human
  local ext cross ask
  ext=$(printf '%q' "$1/scripts/ext-agent.sh")
  cross=$(printf '%q' "$1/scripts/cross-review.sh")
  ask=$(printf '%q' "$1/inbox/ask-human.sh")
  printf '%s' "Save this account's tokens: send read-only leaf work (web and docs research, library or vendor facts, read-only questions about a repo, a second opinion on a plan or finding) to Codex or Grok first, through $ext <codex|grok> <out-file> [--cwd DIR] [--effort low|medium|high] [--words N] <prompt-file>. Run it with Bash run_in_background so you keep working. Codex suits questions that need code read in a repo (pass --cwd); Grok suits web, real-time and X questions. Put the out-file and prompt-file in your scratchpad, never inside a git worktree (the script refuses). Before a push, $cross <worktree> [base] runs both as adversarial reviewers. Keep writes, git, PRs, Linear and anything needing your session's context on Claude. Treat their answers as leads and check any claim you act on. Never put secrets or client data in their prompts. If a call fails, do the task yourself and say which CLI failed.

When you need a decision, an approval or an unblock from $2, do not stop and wait. Run $ask ask <ticket-id> --type decision|merge|blocked --ask \"...\" --recommend \"...\" --default \"what you will do with no answer\" (omit the ticket ID when the question is not about one), keep working on anything the question does not block, and run exactly $ask wait <ticket-id> as the whole Bash command with run_in_background: true so you are woken with the answer ($2 can reply from Slack). Add no &, subshell, nohup or redirect: any of those detaches the wait and you are never woken. Still report to your orchestrator as usual."
}

cmd_dispatch() {
  local want cwd="" name="" mode=bypassPermissions agent="" model="" effort="" report=1 delegation=1 prompt="" seen_sep=0
  local force=0 allow_nested=0 dry_run=0 max_workers=${FLEET_MAX_WORKERS:-4} cap_src=FLEET_MAX_WORKERS pick_cap
  local label auth email aenv out rc=0 clean parsed id bg_name addr home_p footer root human
  local args=()
  if [ $# -eq 0 ]; then usage_err "dispatch needs <label|auto>"; fi
  want=$1
  shift
  while [ $# -gt 0 ]; do
    case $1 in
      --cwd | --name | --mode | --agent | --model | --effort | --max-workers)
        if [ $# -lt 2 ]; then usage_err "dispatch: $1 needs a value"; fi
        case $1 in
          --cwd) cwd=$2 ;;
          --name) name=$2 ;;
          --mode) mode=$2 ;;
          --agent) agent=$2 ;;
          --model)
            case $2 in '' | -*) usage_err "dispatch: --model needs a model name that does not start with a dash" ;; esac
            model=$2
            ;;
          --effort)
            if ! valid_effort "$2"; then usage_err "invalid --effort '$2' (use one of: ${VALID_EFFORTS[*]})"; fi
            effort=$2
            ;;
          --max-workers)
            max_workers=$2
            cap_src=--max-workers
            ;;
        esac
        shift 2
        ;;
      --no-report)
        report=0
        shift
        ;;
      --no-delegation-note)
        delegation=0
        shift
        ;;
      --force)
        force=1
        shift
        ;;
      --allow-nested)
        allow_nested=1
        shift
        ;;
      --dry-run)
        dry_run=1
        shift
        ;;
      --)
        seen_sep=1
        shift
        break
        ;;
      *) usage_err "dispatch: unexpected argument '$1' (the prompt goes after --)" ;;
    esac
  done
  if [ "$seen_sep" != 1 ]; then usage_err "dispatch: put the prompt after --"; fi
  prompt=$(printf '%s' "$*")
  case $prompt in
    *[![:space:]]*) ;;
    *) usage_err "dispatch: the prompt is empty" ;;
  esac
  if ! valid_mode "$mode"; then usage_err "invalid --mode '$mode' (use one of: ${VALID_MODES[*]})"; fi
  case $name in -*) usage_err "dispatch: --name must not start with a dash" ;; esac
  if ! valid_cap "$max_workers"; then usage_err "dispatch: $cap_src must be a whole number from 1 to 999999 (got '$max_workers')"; fi
  if [ -z "$cwd" ]; then cwd=$PWD; fi
  case $cwd in
    \~) cwd=$HOME ;;
    \~/*) cwd=$HOME/${cwd#\~/} ;;
  esac
  if [ ! -d "$cwd" ]; then usage_err "dispatch: --cwd '$cwd' is not a directory"; fi
  cwd=$(cd -- "$cwd" && pwd -P)
  home_p=$(cd -- "$HOME" 2>/dev/null && pwd -P) || home_p=""
  if [ -n "$home_p" ] && [ "$cwd" = "$home_p" ]; then
    usage_err "dispatch: --cwd is the home folder; home-folder trust is never saved, so use a project folder"
  fi
  if [ -n "${CLAUDE_JOB_DIR:-}" ] && [ "$allow_nested" != 1 ]; then
    warn "dispatch: refusing to start a worker from inside a background session; pass --allow-nested if this worker really must fan out"
    exit 7
  fi

  need_tools
  need_perl
  load_labels
  if [ "$want" = auto ]; then
    pick_cap=$max_workers
    if [ "$force" = 1 ]; then pick_cap=0; fi
    label=$(pick_auto "$pick_cap") || exit $?
  elif label_exists "$want"; then
    label=$want
  else
    usage_err "unknown account '$want' (known: ${LABELS[*]} or auto; labels are lowercase)"
  fi
  auth=$(auth_json "$label")
  aenv=$(acct_env "$label")
  if ! is_signed_in "$auth"; then
    warn "account $label is not signed in. Fix: run \`$aenv claude auth login\`"
    exit 5
  fi
  email=$(printf '%s' "$auth" | jq -r '.email // ""')
  if [ "$force" != 1 ]; then check_cap "$label" "$max_workers"; fi
  if [ -z "$name" ]; then name="fleet-$label-$(date +%H%M%S)-$$"; fi

  if [ "$delegation" = 1 ] || [ "$report" = 1 ]; then
    root=$(fleet_root) || root=""
    human=$(human_name "$root")
  fi
  if [ "$delegation" = 1 ]; then prompt="$prompt"$'\n\n'"$(delegation_note "$root" "$human")"; fi
  if [ "$report" = 1 ]; then
    footer=$(report_footer "$human")
    if [ -n "$footer" ]; then prompt="$prompt"$'\n\n'"$footer"; fi
  fi

  args=(--bg -n "$name" --permission-mode "$mode")
  if [ -n "$agent" ]; then args+=(--agent "$agent"); fi
  if [ -n "$model" ]; then args+=(--model "$model"); fi
  if [ -n "$effort" ]; then args+=(--effort "$effort"); fi
  args+=(-- "$prompt")

  if [ "$dry_run" = 1 ]; then
    jq -n --arg label "$label" --arg email "$email" --arg name "$name" --arg cwd "$cwd" \
      --arg env "$aenv" --arg prompt "$prompt" \
      '{dry_run: true, label: $label, email: $email, name: $name, cwd: $cwd, env: $env, argv: $ARGS.positional, prompt: $prompt}' \
      --args -- "${args[@]:0:${#args[@]}-1}"
    exit 0
  fi

  out=$(cd "$cwd" && run_claude "$label" "${args[@]}" 2>&1) || rc=$?
  clean=$(printf '%s\n' "$out" | clean_text 100000)
  parsed=$(printf '%s\n' "$clean" | parse_backgrounded) || parsed=""
  if [ -z "$parsed" ]; then launch_failure "$label" "$cwd" "$clean" "$rc"; fi
  id=${parsed%%$'\t'*}
  bg_name=${parsed#*$'\t'}
  if [ -z "$bg_name" ]; then bg_name=$name; fi

  addr=$(wait_for_address "$label" "$id")
  if [ -z "$addr" ]; then warn "no address for session $id yet; try: fleet.sh address $label $id"; fi
  jq -n --arg label "$label" --arg email "$email" --arg id "$id" --arg name "$bg_name" \
    --arg cwd "$cwd" --arg address "$addr" \
    '{label: $label, email: $email, id: $id, name: $name, cwd: $cwd, address: $address}'
}

cmd_address() {
  local label row pid addr
  if [ $# -ne 2 ]; then usage_err "address needs <label> <id|name>"; fi
  need_tools
  label=$1
  require_label "$label"
  row=$(resolve_session "$label" "$2") || exit 1
  pid=$(printf '%s' "$row" | jq -r '.pid // empty')
  addr=$(session_address "$label" "$pid")
  if [ -z "$addr" ]; then die "session '$2' on account $label has no messaging address"; fi
  printf '%s\n' "$addr"
}

cmd_logs() {
  local label="" ref="" n=40 row id out rc=0
  while [ $# -gt 0 ]; do
    case $1 in
      -n)
        if [ $# -lt 2 ]; then usage_err "logs: -n needs a number"; fi
        n=$2
        shift 2
        ;;
      -*) usage_err "logs: unknown option '$1'" ;;
      *)
        if [ -z "$label" ]; then
          label=$1
        elif [ -z "$ref" ]; then
          ref=$1
        else
          usage_err "logs: too many arguments"
        fi
        shift
        ;;
    esac
  done
  if [ -z "$ref" ]; then usage_err "logs needs <label> <id|name>"; fi
  if ! is_uint "$n" || [ -z "${n//0/}" ]; then usage_err "logs: -n needs a positive number"; fi
  need_tools
  need_perl
  require_label "$label"
  row=$(resolve_session "$label" "$ref" --all) || exit 1
  id=$(background_id "$row" "$ref") || exit 1
  out=$(run_claude "$label" logs "$id" 2>&1) || rc=$?
  printf '%s\n' "$out" | clean_text "$n"
  # Exit 1 whatever claude returned, so a failure never reads as one of the documented codes 3 to 7.
  if [ "$rc" -ne 0 ]; then die "claude exited $rc"; fi
}

cmd_stop() {
  local label row id out rc=0
  if [ $# -ne 2 ]; then usage_err "stop needs <label> <id|name>"; fi
  need_tools
  label=$1
  require_label "$label"
  row=$(resolve_session "$label" "$2") || exit 1
  id=$(background_id "$row" "$2") || exit 1
  out=$(run_claude "$label" stop "$id" 2>&1) || rc=$?
  printf '%s\n' "$out"
  if [ "$rc" -ne 0 ]; then die "claude exited $rc"; fi
}

main() {
  local cmd=help
  if [ $# -gt 0 ]; then
    cmd=$1
    shift
  fi
  case $cmd in
    accounts) cmd_accounts "$@" ;;
    ps) cmd_ps "$@" ;;
    usage) cmd_usage "$@" ;;
    dispatch) cmd_dispatch "$@" ;;
    address) cmd_address "$@" ;;
    logs) cmd_logs "$@" ;;
    stop) cmd_stop "$@" ;;
    help | -h | --help) usage ;;
    *) usage_err "unknown command '$cmd'" ;;
  esac
}

main "$@"
