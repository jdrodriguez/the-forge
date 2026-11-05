#!/usr/bin/env bash
# add-account.sh: adds a Claude account to this machine or another one, run entirely from this machine.
#
# Usage: add-account.sh <here|ssh-host> <label> <email>
#        add-account.sh status [ssh-host...]
#
#   label  [a-z0-9]+, so e means ~/.claude-e on that machine. Never a, which is that machine's own login.
#   email  the account to sign in. The script refuses to finish if a different one signs in.
#
# Here, a browser opens as usual. For another machine, Claude prints a link: open it in this machine's browser,
# sign in, and paste the code back into this terminal. That login is stored on the other machine in the
# account's folder, as .credentials.json with mode 600, because SSH can't reach its keychain.
# Credentials never travel through a synced folder, and this script never prints them.
#
# The steps, each checked before the next: link the account folder to the shared config in ~/.claude
# (mirror-config-dir.sh), sign in unless that email is signed in there already, check the email, then mark the
# workspace trusted the way the trust prompt does, because fleet.sh refuses an untrusted workspace. The workspace is
# workspaceCwd from the repo config (default ~/dev).
#
# Env: CLAUDE_FLEET_HOME        root of this machine's account folders (default $HOME)
#      AGENT_QUEUE_REMOTE_ROOT  where this repo is on the other machine: an absolute path, or one relative to its
#                               home folder (default: the same place under the home folder as here)
#      FLEET_REMOTE_PATH        folders put in front of PATH on the other machine, where a non-interactive SSH
#                               shell often lacks claude and jq (default /opt/homebrew/bin:/usr/local/bin:~/.local/bin)
set -u

# The repo root, from this file's real location (fleet/setup/add-account.sh). bash 3.2 has no readlink -f.
self=${BASH_SOURCE[0]}
while [ -L "$self" ]; do
  link=$(readlink "$self")
  case $link in
    /*) self=$link ;;
    *) case $self in */*) self=${self%/*}/$link ;; *) self=$link ;; esac ;;
  esac
done
case $self in */*) here_dir=${self%/*} ;; *) here_dir=. ;; esac
ROOT=$(cd -P -- "$here_dir/../.." && pwd -P) || exit 1
FLEET_HOME="${CLAUDE_FLEET_HOME:-$HOME}"

# A path as a word for the other machine's shell: one under this home folder stays under that machine's home folder.
# shellcheck disable=SC2016 # "$HOME" expands on the other machine
remote_word() { # path
  case $1 in
    "$HOME") printf '"$HOME"' ;;
    "$HOME"/*) printf '"$HOME"/%q' "${1#"$HOME"/}" ;;
    *) printf '%q' "$1" ;;
  esac
}

# shellcheck disable=SC2016 # "$HOME" expands on the other machine
if [ -n "${AGENT_QUEUE_REMOTE_ROOT:-}" ]; then
  case $AGENT_QUEUE_REMOTE_ROOT in
    /*) R_ROOT=$(printf '%q' "$AGENT_QUEUE_REMOTE_ROOT") ;;
    *) R_ROOT=$(printf '"$HOME"/%q' "$AGENT_QUEUE_REMOTE_ROOT") ;;
  esac
else
  R_ROOT=$(remote_word "$ROOT")
fi
# $HOME and $PATH expand on the other machine.
PATHS="export PATH=${FLEET_REMOTE_PATH:-/opt/homebrew/bin:/usr/local/bin:\$HOME/.local/bin}:\$PATH"

remote() { ssh -o ConnectTimeout=8 "$@"; }

if [ "${1:-}" = "status" ]; then
  shift
  echo "=== this machine"
  "$ROOT/fleet/fleet.sh" accounts
  for host in "$@"; do
    echo "=== $host (a keychain login, usually label a, reads as not signed in over SSH)"
    remote -o BatchMode=yes "$host" "$PATHS; $R_ROOT/fleet/fleet.sh accounts" || echo "could not reach $host"
  done
  exit 0
fi

host="${1:-}"; label="${2:-}"; email="${3:-}"
if [ -z "$host" ] || [ -z "$label" ] || [ -z "$email" ]; then
  sed -n 4,5p "$0" | sed 's/^# *//' >&2
  exit 2
fi
case "$label" in
  a | '' | *[!abcdefghijklmnopqrstuvwxyz0123456789]*) echo "Label must be lowercase letters or digits, and not a." >&2; exit 2 ;;
esac
# The email goes into commands on the other machine, so it is held to the characters an address uses.
case "$email" in
  *@*@* | @* | *@ | *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._%+@-]*)
    echo "That does not look like an email address: $email" >&2; exit 2 ;;
  *@*) ;;
  *) echo "That does not look like an email address: $email" >&2; exit 2 ;;
esac

ws=""
if [ -f "$ROOT/lib/config.mjs" ] && command -v node >/dev/null 2>&1; then
  ws=$(node "$ROOT/lib/config.mjs" get workspaceCwd 2>/dev/null </dev/null) || ws=""
fi
case $ws in /*) ;; *) ws="$HOME/dev" ;; esac

echo "Adding $email as account $label on $host."
if [ "$host" = "here" ]; then
  dir="$FLEET_HOME/.claude-$label"
  check() { CLAUDE_CONFIG_DIR="$dir" claude auth status --json 2>/dev/null </dev/null | jq -e --arg e "$email" '.loggedIn == true and .email == $e' >/dev/null; }
  "$ROOT/fleet/setup/mirror-config-dir.sh" "$label" >/dev/null || { echo "Could not set up the account folder." >&2; exit 1; }
  check || CLAUDE_CONFIG_DIR="$dir" claude auth login --email "$email"
  check || { echo "Not signed in as $email. Nothing else was done; run this again." >&2; exit 1; }
  f="$dir/.claude.json"
  { mkdir -p "$ws" && jq --arg ws "$ws" '.projects[$ws].hasTrustDialogAccepted = true' "$f" >"$f.tmp" && mv "$f.tmp" "$f" && chmod 600 "$f"; } ||
    { echo "Signed in, but could not mark the workspace trusted." >&2; exit 1; }
else
  # Runs on the other machine. The label and the email were checked above, so they need no quoting there.
  R_DIR="\"\$HOME\"/.claude-$label"
  R_WS=$(remote_word "$ws")
  STEP_MIRROR="$R_ROOT/fleet/setup/mirror-config-dir.sh $label >/dev/null"
  STEP_LOGIN="CLAUDE_CONFIG_DIR=$R_DIR claude auth login --email $email"
  # shellcheck disable=SC2016 # $e is a jq variable
  STEP_CHECK="CLAUDE_CONFIG_DIR=$R_DIR claude auth status --json 2>/dev/null </dev/null | jq -e --arg e $email '.loggedIn == true and .email == \$e' >/dev/null"
  # shellcheck disable=SC2016 # $ws, $F and $W expand on the other machine, and $ws in the jq program is a jq variable
  STEP_TRUST="W=$R_WS && F=$R_DIR/.claude.json && mkdir -p \"\$W\" && jq --arg ws \"\$W\" '.projects[\$ws].hasTrustDialogAccepted = true' \"\$F\" > \"\$F.tmp\" && mv \"\$F.tmp\" \"\$F\" && chmod 600 \"\$F\""
  remote -o BatchMode=yes "$host" "$PATHS; $STEP_MIRROR" || { echo "Could not set up the account folder on $host." >&2; exit 1; }
  remote -o BatchMode=yes "$host" "$PATHS; $STEP_CHECK" || {
    echo; echo "Open the link below in this machine's browser, sign in as $email, then paste the code here."
    remote -t "$host" "$PATHS; $STEP_LOGIN"
  }
  remote -o BatchMode=yes "$host" "$PATHS; $STEP_CHECK" || { echo "Not signed in as $email on $host. Nothing else was done; run this again." >&2; exit 1; }
  remote -o BatchMode=yes "$host" "$PATHS; $STEP_TRUST" || { echo "Signed in, but could not mark the workspace trusted on $host." >&2; exit 1; }
fi
echo; echo "Finished: $email is account $label on $host. Tell Claude it's done."
