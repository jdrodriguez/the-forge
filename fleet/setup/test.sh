#!/usr/bin/env bash
# test.sh: run the fleet setup scripts against temp folders and stubs, then print PASS/FAIL per check.
#
# Usage: fleet/setup/test.sh
# Needs jq and node. Never touches ~/.claude or ~/.claude-*: every path comes from a mktemp folder, through the
# CLAUDE_FLEET_* overrides for mirror-config-dir.sh and a fake HOME with stub claude and ssh for add-account.sh.
# Exits non-zero when a check fails.
# Run it under /bin/bash as well to cover macOS's bash 3.2, the one shell that shows the label locale trap.

set -euo pipefail

# Agent shells run in the C locale, where a [a-z] range stays ASCII. In a UTF-8 locale bash 3.2 also
# matches uppercase letters in that range, which is the trap the label checks in the scripts must not
# fall into. Bash 5 compares ranges as ASCII in every locale, so only /bin/bash can show the trap.
export LC_ALL=en_US.UTF-8

HERE="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIRROR="$HERE/mirror-config-dir.sh"
ADD="$HERE/add-account.sh"
AQ_ROOT="$(cd -P "$HERE/../.." && pwd)"

# The scripts must not inherit a caller's fleet or queue settings.
unset CLAUDE_FLEET_HOME CLAUDE_FLEET_PRIMARY AGENT_QUEUE_CONFIG AGENT_QUEUE_REMOTE_ROOT FLEET_REMOTE_PATH CLAUDE_CONFIG_DIR

PASSES=0
FAILS=0
OUT=""
RC=0

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "${TMP_BASE%/}/claude-fleet-test.XXXXXX")"
TMP_ROOT="$(cd -P "$TMP_ROOT" && pwd)"

cleanup() {
  if [[ "$1" -eq 0 && "$FAILS" -eq 0 ]]; then
    case "$TMP_ROOT" in
      */claude-fleet-test.*) rm -rf -- "$TMP_ROOT" ;;
    esac
  else
    printf 'Temp files kept for inspection: %s\n' "$TMP_ROOT"
  fi
}
trap 'cleanup $?' EXIT

pass() {
  PASSES=$((PASSES + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  FAILS=$((FAILS + 1))
  printf 'FAIL  %s\n' "$1"
  if [[ $# -gt 1 ]]; then
    printf '      %s\n' "$2"
  fi
}

# check <description> <command...>: passes when the command succeeds.
check() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    pass "$desc"
  else
    fail "$desc"
  fi
}

check_eq() {
  if [[ "$2" == "$3" ]]; then
    pass "$1"
  else
    fail "$1" "expected [$2] but got [$3]"
  fi
}

# check_out <description> <text>: passes when the captured output contains the text.
check_out() {
  if [[ "$OUT" == *"$2"* ]]; then
    pass "$1"
  else
    fail "$1" "output lacks [$2]"
  fi
}

# check_no_out <description> <text>: passes when the captured output lacks the text.
check_no_out() {
  if [[ "$OUT" == *"$2"* ]]; then
    fail "$1" "output contains [$2]"
  else
    pass "$1"
  fi
}

# capture <command...>: keep combined output in OUT and the exit status in RC.
capture() {
  set +e
  OUT="$("$@" 2>&1)"
  RC=$?
  set -e
}

absent() {
  [[ ! -e "$1" && ! -L "$1" ]]
}

matches() {
  [[ "$1" =~ $2 ]]
}

# A stand-in for date: a fixed stamp when FIXED_DATE is set, the real date otherwise. It lets the
# tests force two moves into the same second.
write_date_stub() {
  cat >"$1/date" <<'STUB'
#!/bin/bash
# Test stub: a fixed timestamp when STUB_FIXED_DATE is set, the real date otherwise.
if [[ -n "${STUB_FIXED_DATE-}" && "$*" == "+%Y%m%d%H%M%S" ]]; then
  echo "$STUB_FIXED_DATE"
else
  exec /bin/date "$@"
fi
STUB
  chmod +x "$1/date"
}

count_matching() {
  local n=0 p
  for p in "$@"; do
    if [[ -e "$p" || -L "$p" ]]; then
      n=$((n + 1))
    fi
  done
  printf '%s\n' "$n"
}

# Listing of a tree that includes where each symlink points.
snapshot() {
  (
    cd "$1"
    find . | LC_ALL=C sort | while IFS= read -r p; do
      if [[ -L "$p" ]]; then
        printf '%s -> %s\n' "$p" "$(readlink "$p")"
      else
        printf '%s\n' "$p"
      fi
    done
  )
}

has_mode_700() {
  [[ -n "$(find "$1" -maxdepth 0 -perm 0700 -print)" ]]
}

# ---------------------------------------------------------------------------
# mirror-config-dir.sh
# ---------------------------------------------------------------------------

mirror() {
  PATH="$DATE_STUB:$PATH" STUB_FIXED_DATE="$FIXED_DATE" CLAUDE_FLEET_HOME="$FH" CLAUDE_FLEET_PRIMARY="$PRIMARY" \
    "$BASH" "$MIRROR" "$@"
}

test_mirror() {
  printf '\n== mirror-config-dir.sh ==\n'
  local t="$TMP_ROOT/mirror" name target other abs alias before after moved root
  FH="$t/home"
  PRIMARY="$FH/.claude"
  DATE_STUB="$t/date-stub"
  FIXED_DATE=""
  mkdir -p "$DATE_STUB"
  write_date_stub "$DATE_STUB"

  mkdir -p "$PRIMARY/agents" "$PRIMARY/skills/s1" "$PRIMARY/rules" "$PRIMARY/commands" "$PRIMARY/plugins" \
    "$PRIMARY/projects/k1" "$PRIMARY/projects/k2/memory" "$PRIMARY/sessions" \
    "$t/synced/hooks" "$t/synced/mem-k1" "$t/elsewhere"
  printf 'primary instructions\n' >"$PRIMARY/CLAUDE.md"
  printf '{"primary":true}\n' >"$PRIMARY/settings.json"
  printf 'k2 memory\n' >"$PRIMARY/projects/k2/memory/MEMORY.md"
  printf 'k1 memory\n' >"$t/synced/mem-k1/MEMORY.md"
  # An entry that is itself a symlink (a synced-folder layout) and a memory folder behind a symlink.
  ln -s "$t/synced/hooks" "$PRIMARY/hooks"
  ln -s "$t/synced/mem-k1" "$PRIMARY/projects/k1/memory"
  # Per-account files that must stay out of every mirror.
  printf 'secret\n' >"$PRIMARY/.credentials.json"
  printf 'history\n' >"$PRIMARY/history.jsonl"
  printf 'transcript\n' >"$PRIMARY/projects/k1/transcript.jsonl"
  ln -s "$t/missing" "$PRIMARY/keybindings.json"

  target="$FH/.claude-b"
  mkdir -p "$target/plugins"
  printf '{"target":true}\n' >"$target/settings.json"
  printf 'old plugin data\n' >"$target/plugins/marker"
  ln -s "$t/elsewhere" "$target/rules"

  capture mirror b
  check_eq "mirror: first run exits 0" "0" "$RC"
  for name in CLAUDE.md settings.json agents commands skills rules hooks plugins projects/k1/memory projects/k2/memory; do
    check_eq "mirror: $name links to the primary's path" "$PRIMARY/$name" "$(readlink "$target/$name")"
  done
  check_eq "mirror: summary counts the first run" "Summary: 7 linked, 0 ok, 1 relinked, 2 moved aside" \
    "$(printf '%s\n' "$OUT" | grep '^Summary')"
  check_eq "mirror: linked file reads through to the primary" "primary instructions" "$(cat "$target/CLAUDE.md")"
  check_eq "mirror: memory behind a symlink reads through" "k1 memory" "$(cat "$target/projects/k1/memory/MEMORY.md")"
  check_eq "mirror: memory folder reads through" "k2 memory" "$(cat "$target/projects/k2/memory/MEMORY.md")"
  check_eq "mirror: one settings.json copy moved aside" "1" "$(count_matching "$target"/settings.json.pre-mirror-*)"
  moved="$(echo "$target"/settings.json.pre-mirror-*)"
  check "mirror: the moved-aside name ends in a 14-digit timestamp" matches "${moved##*/}" '^settings\.json\.pre-mirror-[0-9]{14}$'
  check_eq "mirror: moved-aside settings.json keeps its content" '{"target":true}' \
    "$(cat "$target"/settings.json.pre-mirror-*)"
  check_eq "mirror: one plugins folder moved aside" "1" "$(count_matching "$target"/plugins.pre-mirror-*)"
  check_eq "mirror: moved-aside plugins folder keeps its content" "old plugin data" \
    "$(cat "$target"/plugins.pre-mirror-*/marker)"
  check_out "mirror: relinked entry reports its old target and where the old link went" \
    "rules (was $t/elsewhere, old link kept as rules.pre-mirror-"
  check "mirror: the old symlink target still exists" test -d "$t/elsewhere"
  check_eq "mirror: the old symlink survives as a .pre-mirror copy" "1" "$(count_matching "$target"/rules.pre-mirror-*)"
  check_eq "mirror: the moved-aside symlink still points at its old target" "$t/elsewhere" \
    "$(readlink "$target"/rules.pre-mirror-*)"
  for name in keybindings.json scripts output-styles templates .credentials.json history.jsonl sessions projects/k1/transcript.jsonl; do
    check "mirror: $name is not created in the target" absent "$target/$name"
  done
  check_out "mirror: broken symlink in the primary is skipped" "keybindings.json (broken symlink in the primary)"
  check_out "mirror: names the entries missing from the primary" "scripts output-styles templates"
  check_eq "mirror: primary settings.json is untouched" '{"primary":true}' "$(cat "$PRIMARY/settings.json")"
  check_eq "mirror: nothing is moved aside in the primary" "0" "$(count_matching "$PRIMARY"/*.pre-mirror-*)"
  check_out "mirror: prints the folder trust note" "folder trust"
  check_out "mirror: prints the MCP note" "claude mcp list"
  check_out "mirror: prints the connectors note" "claude.ai connectors"
  check_out "mirror: prints the credentials note" "credentials"

  capture mirror b
  check_eq "mirror: second run exits 0" "0" "$RC"
  check_eq "mirror: second run reports zero changes" "Summary: 0 linked, 10 ok, 0 relinked, 0 moved aside" \
    "$(printf '%s\n' "$OUT" | grep '^Summary')"
  check_eq "mirror: second run leaves one settings.json copy" "1" "$(count_matching "$target"/settings.json.pre-mirror-*)"
  check_eq "mirror: second run leaves one plugins copy" "1" "$(count_matching "$target"/plugins.pre-mirror-*)"
  check_eq "mirror: second run leaves one rules copy" "1" "$(count_matching "$target"/rules.pre-mirror-*)"

  other="$FH/.claude-f"
  mkdir -p "$other"
  printf 'one\n' >"$other/CLAUDE.md"
  FIXED_DATE=20200101000000
  capture mirror f
  rm "$other/CLAUDE.md"
  printf 'two\n' >"$other/CLAUDE.md"
  capture mirror f
  FIXED_DATE=""
  check_eq "mirror: two moves in one second keep both copies" "2" "$(count_matching "$other"/CLAUDE.md.pre-mirror-*)"
  check_eq "mirror: the first moved-aside copy keeps its name and content" "one" "$(cat "$other/CLAUDE.md.pre-mirror-20200101000000")"
  check_eq "mirror: the second moved-aside copy gets a new name" "two" "$(cat "$other/CLAUDE.md.pre-mirror-20200101000000-2")"

  other="$FH/.claude-c"
  capture mirror c --dry-run
  check_eq "mirror: dry run on a missing target exits 0" "0" "$RC"
  check "mirror: dry run does not create the target" absent "$other"
  check_out "mirror: dry run prints the planned links" "would link"
  check_out "mirror: dry run names the planned link target" "CLAUDE.md -> $PRIMARY/CLAUDE.md"
  check_eq "mirror: dry run summary counts every entry" \
    "Summary (dry run, nothing changed): 10 linked, 0 ok, 0 relinked, 0 moved aside" "$(printf '%s\n' "$OUT" | grep '^Summary')"

  other="$FH/.claude-d"
  mkdir -p "$other/plugins"
  printf '{"d":true}\n' >"$other/settings.json"
  ln -s "$t/elsewhere" "$other/rules"
  before="$(snapshot "$other")"
  capture mirror d --dry-run
  after="$(snapshot "$other")"
  check_eq "mirror: dry run on a populated target exits 0" "0" "$RC"
  check_eq "mirror: dry run changes nothing on a populated target" "$before" "$after"
  check_eq "mirror: dry run summary shows what would happen" \
    "Summary (dry run, nothing changed): 7 linked, 0 ok, 1 relinked, 2 moved aside" "$(printf '%s\n' "$OUT" | grep '^Summary')"

  abs="$t/abs-target"
  capture mirror "$abs"
  check_eq "mirror: absolute path target exits 0" "0" "$RC"
  check_eq "mirror: absolute path target is linked" "$PRIMARY/CLAUDE.md" "$(readlink "$abs/CLAUDE.md")"
  check "mirror: a created target has mode 700" has_mode_700 "$abs"
  mkdir "$t/mode-control"
  chmod 755 "$t/mode-control"
  if has_mode_700 "$t/mode-control"; then
    fail "mirror: the mode check rejects a 755 folder"
  else
    pass "mirror: the mode check rejects a 755 folder"
  fi

  before="$(snapshot "$PRIMARY")"
  alias="$t/alias-of-primary"
  ln -s "$PRIMARY" "$alias"
  capture mirror "$PRIMARY"
  check_eq "mirror: refuses the primary's own path" "1" "$RC"
  check_out "mirror: the refusal says why" "target is the primary config folder"
  capture mirror "$PRIMARY/"
  check_eq "mirror: refuses the primary with a trailing slash" "1" "$RC"
  capture mirror "$alias"
  check_eq "mirror: refuses a symlink that resolves to the primary" "1" "$RC"
  capture mirror a
  check_eq "mirror: refuses label a" "1" "$RC"
  capture mirror "$FH"
  check_eq "mirror: refuses a folder that contains the primary" "1" "$RC"
  capture mirror "$PRIMARY/sub"
  check_eq "mirror: refuses a folder inside the primary" "1" "$RC"
  check_eq "mirror: refusals leave the primary untouched" "$before" "$(snapshot "$PRIMARY")"

  for root in / // /// /. /./ /..; do
    capture mirror "$root" --dry-run
    check_eq "mirror: rejects $root as the filesystem root" "2" "$RC"
  done
  check_out "mirror: the root rejection says why" "target resolves to the filesystem root"

  # A symlinked projects folder would send every memory link through it into the primary's own memory.
  other="$FH/.claude-p"
  mkdir -p "$other"
  ln -s "$PRIMARY/projects" "$other/projects"
  before="$(snapshot "$PRIMARY")"
  after="$(snapshot "$other")"
  capture mirror p
  check_eq "mirror: refuses a target whose projects folder is a symlink" "1" "$RC"
  check_out "mirror: the projects refusal says why" "$other/projects is a symlink to $PRIMARY/projects"
  capture mirror p --dry-run
  check_eq "mirror: a dry run refuses it too" "1" "$RC"
  check_eq "mirror: the projects refusal leaves the primary untouched" "$before" "$(snapshot "$PRIMARY")"
  check_eq "mirror: the projects refusal leaves the target untouched" "$after" "$(snapshot "$other")"

  # A symlinked projects/<key> is skipped for the same reason; the other keys are still linked.
  other="$FH/.claude-q"
  mkdir -p "$other/projects"
  ln -s "$PRIMARY/projects/k2" "$other/projects/k2"
  capture mirror q
  check_eq "mirror: a symlinked projects/<key> does not stop the run" "0" "$RC"
  check_eq "mirror: reports the skipped projects/<key>" "1" \
    "$(printf '%s\n' "$OUT" | grep -c '^skipped  *projects/k2 (a symlink in the target)$')"
  check_eq "mirror: leaves the symlinked projects/<key> as it was" "$PRIMARY/projects/k2" "$(readlink "$other/projects/k2")"
  check_eq "mirror: the primary's own memory is untouched" "$before" "$(snapshot "$PRIMARY")"
  check_eq "mirror: still links the other projects' memory" "$PRIMARY/projects/k1/memory" "$(readlink "$other/projects/k1/memory")"

  capture mirror B
  check_eq "mirror: rejects an uppercase label" "2" "$RC"
  capture mirror "b!"
  check_eq "mirror: rejects a label with punctuation" "2" "$RC"
  capture mirror rel/path
  check_eq "mirror: rejects a relative path" "2" "$RC"
  capture mirror
  check_eq "mirror: rejects a missing target" "2" "$RC"
  capture mirror b --bogus
  check_eq "mirror: rejects an unknown option" "2" "$RC"
  capture env CLAUDE_FLEET_HOME="$FH" CLAUDE_FLEET_PRIMARY="$t/no-such-primary" "$BASH" "$MIRROR" b
  check_eq "mirror: fails when the primary folder is missing" "1" "$RC"
}

# ---------------------------------------------------------------------------
# add-account.sh
# ---------------------------------------------------------------------------

# A copy of the repo's pieces add-account.sh uses, under a home folder: the script itself, mirror-config-dir.sh,
# fleet.sh and the config loader. One copy plays this machine and one plays the other machine.
make_repo() { # repo folder
  mkdir -p "$1/fleet/setup" "$1/lib"
  cp "$ADD" "$MIRROR" "$1/fleet/setup/"
  cp "$AQ_ROOT/fleet/fleet.sh" "$1/fleet/fleet.sh"
  cp "$AQ_ROOT/lib/config.mjs" "$1/lib/config.mjs"
}

# A home folder whose primary account holds shared config to mirror.
make_home() { # home folder
  mkdir -p "$1/.claude/skills"
  printf 'primary instructions\n' >"$1/.claude/CLAUDE.md"
  printf '{"primary":true}\n' >"$1/.claude/settings.json"
}

# Stub claude: an account is signed in when its folder holds .stub-email, which a login writes (as STUB_LOGIN_AS
# when set, else the --email asked for). Every call is logged with its config folder. Stub ssh: logs the host and
# the command; with STUB_SSH_EXEC=1 it runs the command in a fresh shell whose HOME is STUB_REMOTE_HOME, as the
# other machine's login shell would, else it exits STUB_SSH_RC (default 0).
write_add_stubs() { # stub folder
  cat >"$1/claude" <<'STUB'
#!/bin/bash
dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
printf '%s\t%s\n' "$dir" "$*" >>"$STUB_LOG"
case "$*" in
  "auth status --json")
    if [[ -f "$dir/.stub-email" ]]; then
      jq -nc --arg e "$(cat "$dir/.stub-email")" '{loggedIn: true, authMethod: "claude.ai", email: $e, subscriptionType: "max"}'
    else
      echo '{"loggedIn": false}'
    fi
    ;;
  "auth login --email "*)
    mkdir -p "$dir"
    printf '%s' "${STUB_LOGIN_AS:-${4-}}" >"$dir/.stub-email"
    [[ -s "$dir/.claude.json" ]] || printf '{"oauthAccount": {}}\n' >"$dir/.claude.json"
    ;;
  "agents --json") echo '[]' ;;
  *) echo "stub claude: unhandled: $*" >&2; exit 64 ;;
esac
STUB
  cat >"$1/ssh" <<'STUB'
#!/bin/bash
tty=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) shift 2 ;;
    -t) tty=1; shift ;;
    -*) shift ;;
    *) break ;;
  esac
done
host="$1"
shift
printf '%s\t%s\t%s\n' "$host" "$tty" "$*" >>"$STUB_SSH_LOG"
if [[ "${STUB_SSH_EXEC:-0}" == 1 ]]; then
  exec env -u CLAUDE_FLEET_HOME -u AGENT_QUEUE_CONFIG -u CLAUDE_CONFIG_DIR HOME="$STUB_REMOTE_HOME" /bin/bash -c "$*"
fi
exit "${STUB_SSH_RC:-0}"
STUB
  chmod +x "$1/claude" "$1/ssh"
}

# add <args...>: run this machine's copy of add-account.sh with the fake home, the stubs and the test config.
add() {
  PATH="$STUBS:$PATH" HOME="$AH" AGENT_QUEUE_CONFIG="$ACONF" FLEET_REMOTE_PATH="$STUBS" \
    STUB_LOG="$ALOG" STUB_SSH_LOG="$SSH_LOG" STUB_REMOTE_HOME="$RH" "$BASH" "$AH/dev/aq/fleet/setup/add-account.sh" "$@"
}

trusted() { # .claude.json folder-key: prints the trust flag the file holds for that folder
  jq -r --arg k "$2" '.projects[$k].hasTrustDialogAccepted // "unset"' "$1"
}

file_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then stat -f '%Lp' "$1"; else stat -c '%a' "$1"; fi
}

test_add_account() {
  printf '\n== add-account.sh ==\n'
  local t="$TMP_ROOT/add" line
  AH="$t/home"
  RH="$t/remote"
  STUBS="$t/stubs"
  ALOG="$t/claude.log"
  SSH_LOG="$t/ssh.log"
  ACONF="$t/config.json"
  mkdir -p "$STUBS"
  write_add_stubs "$STUBS"
  make_home "$AH"
  make_home "$RH"
  make_repo "$AH/dev/aq"
  make_repo "$RH/dev/aq"
  printf '{"workspaceCwd": "~/dev/ws"}\n' >"$ACONF"
  check_eq "add: the stub claude comes first on PATH" "$STUBS/claude" "$(PATH="$STUBS:$PATH" command -v claude)"

  # This machine, an account that is not signed in yet.
  capture add here e e@example.test
  check_eq "add here: exits 0" "0" "$RC"
  check_out "add here: says it finished" "Finished: e@example.test is account e on here."
  check_eq "add here: mirrors the shared config into the new folder" "$AH/.claude/CLAUDE.md" "$(readlink "$AH/.claude-e/CLAUDE.md")"
  check_eq "add here: signs in once, with the email asked for" "1" "$(grep -c $'\tauth login --email e@example.test$' "$ALOG")"
  check_eq "add here: signs in under the account's folder" "$AH/.claude-e" "$(grep $'\tauth login' "$ALOG" | cut -f1)"
  check_eq "add here: trusts the workspace from workspaceCwd, with ~ expanded" "true" "$(trusted "$AH/.claude-e/.claude.json" "$AH/dev/ws")"
  check "add here: creates the workspace folder" test -d "$AH/dev/ws"
  check_eq "add here: leaves .claude.json at mode 600" "600" "$(file_mode "$AH/.claude-e/.claude.json")"
  check_eq "add here: keeps what .claude.json held" "{}" "$(jq -c '.oauthAccount' "$AH/.claude-e/.claude.json")"
  check "add here: never calls ssh" absent "$SSH_LOG"
  check "add here: never touches the primary's sign-in" absent "$AH/.claude/.stub-email"

  # Signed in already: no second login, and the trust is set again.
  : >"$ALOG"
  capture add here e e@example.test
  check_eq "add here again: exits 0" "0" "$RC"
  check_eq "add here again: does not sign in again" "0" "$(grep -c 'auth login' "$ALOG" || true)"

  # The wrong account signs in.
  : >"$ALOG"
  STUB_LOGIN_AS=other@example.test capture add here f f@example.test
  check_eq "add here, another email signs in: exits 1" "1" "$RC"
  check_out "add here, another email signs in: says so" "Not signed in as f@example.test. Nothing else was done; run this again."
  check_eq "add here, another email signs in: nothing is trusted" "unset" "$(trusted "$AH/.claude-f/.claude.json" "$AH/dev/ws")"

  # No workspaceCwd in the config: ~/dev.
  printf '{}\n' >"$ACONF"
  capture add here g g@example.test
  check_eq "add here without workspaceCwd: exits 0" "0" "$RC"
  check_eq "add here without workspaceCwd: trusts ~/dev" "true" "$(trusted "$AH/.claude-g/.claude.json" "$AH/dev")"
  printf '{"workspaceCwd": "~/dev/ws"}\n' >"$ACONF"

  # Arguments are checked before anything runs.
  : >"$ALOG"
  # shellcheck disable=SC2016 # the $(id) is a literal that must be refused
  for line in "a|a@example.test" "B|b@example.test" "b!|b@example.test" "-x|b@example.test" "b|not-an-email" "b|x y@example.test" "b|a@b@example.test" "b|@example.test" "b|b@" "b|b@example.test;id" "b|b'@example.test" 'b|$(id)@example.test'; do
    capture add here "${line%%|*}" "${line#*|}"
    check_eq "add: rejects label and email '${line}' with exit 2" "2" "$RC"
  done
  capture add here e
  check_eq "add: a missing email exits 2" "2" "$RC"
  check_out "add: a missing argument prints the usage" "Usage: add-account.sh <here|ssh-host> <label> <email>"
  check_eq "add: rejected arguments never reach claude" "0" "$(wc -l <"$ALOG" | tr -d ' ')"

  # The other machine, run end to end through the ssh stub.
  : >"$ALOG"
  rm -f "$SSH_LOG"
  STUB_SSH_EXEC=1 capture add box r r@example.test
  check_eq "add remote: exits 0" "0" "$RC"
  check_out "add remote: says it finished" "Finished: r@example.test is account r on box."
  check_eq "add remote: mirrors on the other machine" "$RH/.claude/CLAUDE.md" "$(readlink "$RH/.claude-r/CLAUDE.md")"
  check_eq "add remote: trusts the other machine's workspace" "true" "$(trusted "$RH/.claude-r/.claude.json" "$RH/dev/ws")"
  check_eq "add remote: leaves .claude.json at mode 600 there" "600" "$(file_mode "$RH/.claude-r/.claude.json")"
  check "add remote: makes no account folder on this machine" absent "$AH/.claude-r"
  check_eq "add remote: the login runs with a terminal" "1" "$(awk -F'\t' '$2 == 1 && $3 ~ /auth login --email r@example.test/' "$SSH_LOG" | wc -l | tr -d ' ')"
  check_eq "add remote: every other call runs without one" "0" "$(awk -F'\t' '$2 == 1 && $3 !~ /auth login/' "$SSH_LOG" | wc -l | tr -d ' ')"
  check_eq "add remote: every call goes to the host" "box" "$(cut -f1 "$SSH_LOG" | sort -u)"
  # shellcheck disable=SC2016 # the literal "$HOME" is what the other machine's shell reads
  check_eq "add remote: the repo is named under the other machine's home" "1" \
    "$(grep -cF '"$HOME"/dev/aq/fleet/setup/mirror-config-dir.sh r >/dev/null' "$SSH_LOG")"
  check_eq "add remote: each call puts FLEET_REMOTE_PATH first on PATH" "$(wc -l <"$SSH_LOG" | tr -d ' ')" \
    "$(grep -cF "export PATH=$STUBS:\$PATH; " "$SSH_LOG")"
  check_eq "add remote: claude ran only on the other machine" "$RH/.claude-r" "$(cut -f1 "$ALOG" | sort -u)"

  # AGENT_QUEUE_REMOTE_ROOT names the repo there; a failing first call stops the run.
  rm -f "$SSH_LOG"
  AGENT_QUEUE_REMOTE_ROOT=/opt/agents/aq STUB_SSH_RC=1 capture add box s s@example.test
  check_eq "add remote, unreachable: exits 1" "1" "$RC"
  check_out "add remote, unreachable: says what failed" "Could not set up the account folder on box."
  check_eq "add remote, unreachable: stops after the first call" "1" "$(wc -l <"$SSH_LOG" | tr -d ' ')"
  check_eq "add remote: an absolute AGENT_QUEUE_REMOTE_ROOT is used as is" "1" \
    "$(grep -cF '/opt/agents/aq/fleet/setup/mirror-config-dir.sh s' "$SSH_LOG")"
  rm -f "$SSH_LOG"
  AGENT_QUEUE_REMOTE_ROOT=src/aq STUB_SSH_RC=1 capture add box s s@example.test
  # shellcheck disable=SC2016 # the literal "$HOME" is what the other machine's shell reads
  check_eq "add remote: a relative AGENT_QUEUE_REMOTE_ROOT is under the other machine's home" "1" \
    "$(grep -cF '"$HOME"/src/aq/fleet/setup/mirror-config-dir.sh s' "$SSH_LOG")"

  # status lists this machine's accounts, then each host's.
  rm -f "$SSH_LOG"
  STUB_SSH_RC=255 capture add status box
  check_eq "add status: exits 0 when a host is unreachable" "0" "$RC"
  check_out "add status: lists this machine's accounts" "e@example.test"
  check_out "add status: says a host could not be reached" "could not reach box"
  # shellcheck disable=SC2016 # the literal "$HOME" is what the other machine's shell reads
  check_eq "add status: runs the other machine's fleet.sh accounts" "1" "$(grep -cF '"$HOME"/dev/aq/fleet/fleet.sh accounts' "$SSH_LOG")"
}

test_environment() {
  printf '\n== test environment ==\n'
  if [[ "${BASH_VERSINFO[0]}" -lt 5 ]]; then
    check "environment: the locale lets [a-z] match an uppercase letter" "$BASH" -c '[[ B == [a-z] ]]'
  else
    printf 'SKIP  environment: bash %s compares [a-z] as ASCII, so the label trap needs /bin/bash\n' "$BASH_VERSION"
  fi
}

main() {
  test_environment
  test_mirror
  test_add_account
  printf '\nRESULT: %d passed, %d failed\n' "$PASSES" "$FAILS"
  [[ "$FAILS" -eq 0 ]]
}

main
