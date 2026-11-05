#!/usr/bin/env bash
# mirror-config-dir.sh: point one Claude config folder at the shared config in the primary account.
#
# Usage: mirror-config-dir.sh <label|absolute-path> [--dry-run]
#   label  [a-z0-9]+, mapped to $CLAUDE_FLEET_HOME/.claude-<label> (home defaults to $HOME)
#   path   any absolute folder; created with mode 700 when missing
#
# Env: CLAUDE_FLEET_HOME     root of the account folders (default $HOME)
#      CLAUDE_FLEET_PRIMARY  the primary account's folder (default $CLAUDE_FLEET_HOME/.claude)
#
# The shared entries and each project's memory become symlinks to the primary's paths.
# Whatever is in the way (a file, a folder or a different symlink) moves to
# <entry>.pre-mirror-<timestamp> first. Nothing is deleted.
# Exit codes: 0 done, 1 refused or failed, 2 usage error. Runs on macOS's stock bash 3.2.

set -euo pipefail

# Everything else (credentials, .claude.json, sessions, jobs, daemon, transcripts, caches,
# history) stays per account.
SHARED=(CLAUDE.md settings.json keybindings.json agents commands skills rules scripts hooks output-styles plugins templates)

usage() {
  cat <<'EOF'
Usage: mirror-config-dir.sh <label|absolute-path> [--dry-run]

Link a Claude config folder to the shared config in the primary account (~/.claude).
  label       [a-z0-9]+, mapped to ~/.claude-<label>
  path        absolute path of the folder to mirror into
  --dry-run   print every action and change nothing

Env: CLAUDE_FLEET_HOME (default $HOME), CLAUDE_FLEET_PRIMARY (default $CLAUDE_FLEET_HOME/.claude)
EOF
}

die() {
  printf 'mirror-config-dir: %s\n' "$*" >&2
  exit 1
}

usage_error() {
  printf 'mirror-config-dir: %s\n' "$*" >&2
  usage >&2
  exit 2
}

# The class is spelled out because a-z also matches uppercase and accented letters in some locales.
valid_label() {
  case "$1" in
    '' | *[!abcdefghijklmnopqrstuvwxyz0123456789]*) return 1 ;;
  esac
  return 0
}

# Physical path of a folder, or of a missing leaf under an existing parent.
resolve_path() {
  local p="${1%/}" parent
  # Stripping the slash from "/" leaves nothing, and the root is its own physical path.
  [[ -n "$p" ]] || p=/
  if [[ -d "$p" ]]; then
    (cd -P "$p" && pwd -P)
    return
  fi
  parent="$(dirname "$p")"
  if [[ -d "$parent" ]]; then
    printf '%s/%s\n' "$(cd -P "$parent" && pwd -P)" "${p##*/}"
  else
    printf '%s\n' "$p"
  fi
}

# First unused name: <base>, then <base>-2, <base>-3, ...
free_name() {
  local cand="$1" n=1
  while [[ -e "$cand" || -L "$cand" ]]; do
    n=$((n + 1))
    cand="$1-$n"
  done
  printf '%s\n' "$cand"
}

say() {
  printf '%-13s %s\n' "$1" "$2"
}

run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    return 0
  fi
  "$@"
}

# link_entry <name shown> <path in the primary> <link path in the target>
link_entry() {
  local shown="$1" src="$2" dst="$3" cur aside
  if [[ -L "$dst" ]]; then
    cur="$(readlink "$dst")"
    if [[ "$cur" == "$src" ]]; then
      say ok "$shown"
      N_OK=$((N_OK + 1))
    else
      aside="$(free_name "$dst.pre-mirror-$STAMP")"
      say "$V_RELINK" "$shown (was $cur, old link kept as ${aside##*/}) -> $src"
      run mv "$dst" "$aside"
      run ln -s "$src" "$dst"
      N_RELINKED=$((N_RELINKED + 1))
    fi
  elif [[ -e "$dst" ]]; then
    aside="$(free_name "$dst.pre-mirror-$STAMP")"
    say "$V_MOVE" "$shown (old copy kept as ${aside##*/}) -> $src"
    run mv "$dst" "$aside"
    run ln -s "$src" "$dst"
    N_MOVED=$((N_MOVED + 1))
  else
    say "$V_LINK" "$shown -> $src"
    run ln -s "$src" "$dst"
    N_LINKED=$((N_LINKED + 1))
  fi
}

DRY_RUN=0
TARGET_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*) usage_error "unknown option: $1" ;;
    *)
      [[ -z "$TARGET_ARG" ]] || usage_error "only one target allowed"
      TARGET_ARG="$1"
      ;;
  esac
  shift
done
[[ -n "$TARGET_ARG" ]] || usage_error "missing target"

FLEET_HOME="${CLAUDE_FLEET_HOME:-$HOME}"
PRIMARY="${CLAUDE_FLEET_PRIMARY:-$FLEET_HOME/.claude}"
PRIMARY="${PRIMARY%/}"
case "$PRIMARY" in
  /*) ;;
  *) die "the primary folder must be an absolute path: $PRIMARY" ;;
esac
[[ -d "$PRIMARY" ]] || die "primary config folder not found: $PRIMARY"

if [[ "$TARGET_ARG" == /* ]]; then
  TARGET="${TARGET_ARG%/}"
else
  valid_label "$TARGET_ARG" || usage_error "label must match [a-z0-9]+ or be an absolute path: $TARGET_ARG"
  if [[ "$TARGET_ARG" == a ]]; then
    TARGET="$FLEET_HOME/.claude"
  else
    TARGET="$FLEET_HOME/.claude-$TARGET_ARG"
  fi
fi
[[ -n "$TARGET" ]] || usage_error "target resolves to the filesystem root"

# Compare physical paths so a symlink or a trailing slash cannot slip the primary through.
PRIMARY_REAL="$(resolve_path "$PRIMARY")"
TARGET_REAL="$(resolve_path "$TARGET")"
[[ "$TARGET_REAL" != / ]] || usage_error "target resolves to the filesystem root"
[[ "$TARGET_REAL" != "$PRIMARY_REAL" ]] || die "target is the primary config folder ($PRIMARY_REAL); nothing to mirror"
case "$PRIMARY_REAL/" in
  "$TARGET_REAL"/*) die "target $TARGET_REAL contains the primary config folder" ;;
esac
case "$TARGET_REAL/" in
  "$PRIMARY_REAL"/*) die "target $TARGET_REAL is inside the primary config folder" ;;
esac

# A symlinked projects folder would send every memory link below through it, into whatever it points at.
if [[ -L "$TARGET/projects" ]]; then
  die "$TARGET/projects is a symlink to $(readlink "$TARGET/projects"); replace it with a real folder and run again"
fi

STAMP="$(date +%Y%m%d%H%M%S)"
N_LINKED=0
N_OK=0
N_RELINKED=0
N_MOVED=0
ABSENT=""
if [[ "$DRY_RUN" == 1 ]]; then
  V_LINK="would link"
  V_RELINK="would relink"
  V_MOVE="would move"
  V_MKDIR="would create"
  SUMMARY_TAG=" (dry run, nothing changed)"
else
  V_LINK="linked"
  V_RELINK="relinked"
  V_MOVE="moved"
  V_MKDIR="created"
  SUMMARY_TAG=""
fi

say primary "$PRIMARY"
say target "$TARGET"

if [[ ! -d "$TARGET" ]]; then
  if [[ -e "$TARGET" || -L "$TARGET" ]]; then
    die "target exists and is not a folder: $TARGET"
  fi
  say "$V_MKDIR" "$TARGET (mode 700)"
  run mkdir -m 700 -p "$TARGET"
fi

for name in "${SHARED[@]}"; do
  src="$PRIMARY/$name"
  if [[ -L "$src" && ! -e "$src" ]]; then
    say skipped "$name (broken symlink in the primary)"
  elif [[ -e "$src" ]]; then
    link_entry "$name" "$src" "$TARGET/$name"
  else
    ABSENT="$ABSENT $name"
  fi
done

# A directory or a symlink to one, per project key; unmatched globs stay literal and are skipped.
for mem in "$PRIMARY"/projects/*/memory; do
  key="${mem#"$PRIMARY"/projects/}"
  key="${key%/memory}"
  if [[ -L "$mem" && ! -e "$mem" ]]; then
    say skipped "projects/$key/memory (broken symlink in the primary)"
    continue
  fi
  [[ -e "$mem" ]] || continue
  if [[ -L "$TARGET/projects/$key" ]]; then
    say skipped "projects/$key (a symlink in the target)"
    continue
  fi
  if [[ ! -d "$TARGET/projects/$key" ]]; then
    say "$V_MKDIR" "$TARGET/projects/$key/"
    run mkdir -p "$TARGET/projects/$key"
  fi
  link_entry "projects/$key/memory" "$mem" "$TARGET/projects/$key/memory"
done

printf '\nSummary%s: %d linked, %d ok, %d relinked, %d moved aside\n' \
  "$SUMMARY_TAG" "$N_LINKED" "$N_OK" "$N_RELINKED" "$N_MOVED"
if [[ -n "$ABSENT" ]]; then
  printf 'Not in the primary, so not mirrored:%s\n' "$ABSENT"
fi

cat <<EOF

Not mirrored (set these up once per account):
  folder trust          run CLAUDE_CONFIG_DIR=$TARGET claude once in each repo
  user MCP servers      check with CLAUDE_CONFIG_DIR=$TARGET claude mcp list
  claude.ai connectors  enabled per account on claude.ai
  credentials           sign in with CLAUDE_CONFIG_DIR=$TARGET claude auth login
EOF
