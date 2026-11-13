# ext-worker-clone.sh: sourced by ext-worker.sh. The engine's clone, and the checks that keep the supervisor's own git
# commands (which run outside the sandbox, with your rights) from running anything the engine wrote.
#
# An engine works in its own clone, which borrows the main checkout's objects read-only through objects/info/alternates
# and writes only its own .git. A linked worktree would share the main .git's refs and objects, so an engine could move
# another worker's branch or replace an object another checkout reads. Remove a clone with rm -rf.
#
# The clone's baseline is a checksum of the files that make git run programs: .git/config, .git/hooks, .git/info,
# .git/objects/info, .husky and core.hooksPath. It is recorded outside the sandbox (<stateDir>/engine-clones/) each
# time this script itself has set the clone up, and it is checked, with the clone's layout, before the dependency
# install, after it, and after the engine's run. A clone that fails either check gets no git command from here, and the
# round ends with a containment report. The sandbox refuses these writes on macOS; on Linux bubblewrap can't protect a
# path that doesn't exist yet, and this is what catches that.

# git outside the sandbox on an engine's clone: no global or system config (an attribute the engine wrote could pick a
# filter defined there), and fsmonitor, hooks and external diff off. ngit is the same for commands that reach origin,
# which need your credential helper from the global config and run no filters.
sgit() { GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git -c core.attributesFile=/dev/null -c core.fsmonitor=false -c core.hooksPath=/dev/null -c diff.external= "$@"; }
ngit() { git -c core.fsmonitor=false -c core.hooksPath=/dev/null "$@"; }

is_engine_clone() { [ -d "$1/.git" ] && [ ! -L "$1/.git" ] && grep -qxF "$MAIN/.git/objects" "$1/.git/objects/info/alternates" 2>/dev/null; }
# .git a real folder, with no commondir or gitdir sending git to another config.
clone_layout_ok() { [ -d "$1/.git" ] && [ ! -L "$1/.git" ] && [ ! -e "$1/.git/commondir" ] && [ ! -e "$1/.git/gitdir" ]; }
clone_sig() { # <clone>: run only after clone_layout_ok
  local hooks p list=".git/hooks .git/config .git/objects/info .git/info .husky"
  hooks=$(sgit -C "$1" config core.hooksPath 2>/dev/null || true)
  case "$hooks" in ""|/*|*..*) ;; *) list="$list $hooks" ;; esac
  (cd "$1" && for p in $list; do [ ! -e "$p" ] || find "$p" -type f; done | sort | xargs cksum 2>/dev/null)
}
baseline_file() { echo "$EW_STATE/engine-clones/$(basename "$1").sig"; }
record_baseline() { mkdir -p "$EW_STATE/engine-clones" && clone_sig "$1" > "$(baseline_file "$1")"; }
# The clone is as this script last left it: its layout, then its baseline. A clone with no baseline fails.
clone_intact() { clone_layout_ok "$1" && [ -f "$(baseline_file "$1")" ] && [ "$(clone_sig "$1")" = "$(cat "$(baseline_file "$1")")" ]; }

clone_for() { # <path>: on the base branch, fetched fresh from origin
  local url hooks; url=$(git -C "$MAIN" remote get-url origin) || return 1
  hooks=$(git -C "$MAIN" config core.hooksPath 2>/dev/null || true)
  git clone -q --shared --no-checkout --single-branch --branch "$EW_BASE" "$MAIN" "$1" || return 1
  git -C "$1" remote set-url origin "$url" || return 1
  [ -z "$hooks" ] || git -C "$1" config core.hooksPath "$hooks" || return 1
  ngit -C "$1" fetch -q origin "$EW_BASE" && sgit -C "$1" checkout -q -B "$EW_BASE" "origin/$EW_BASE" && record_baseline "$1"
}

# prepare_clone <clone> <branch> <cont>: the clone on <branch>, ready for a round. Dies (EXIT 2 refused, 4 git failed)
# when it can't be. A clone that fails clone_intact is left untouched: the supervisor reports it before anything runs.
prepare_clone() {
  local wt=$1 branch=$2 cont=$3 remote=0 cur
  EXIT=4
  if [ -e "$wt" ]; then
    is_engine_clone "$wt" || EXIT=2 die "$wt exists and is not an engine clone"
    clone_intact "$wt" || { echo "ext-worker: $wt changed since this script last set it up; the round will report it" >&2; EXIT=2; return 0; }
    cur=$(sgit -C "$wt" symbolic-ref -q --short HEAD || echo detached)
    [ "$cur" = "$branch" ] || EXIT=2 die "$wt is on $cur, not $branch"
    ngit -C "$wt" fetch -q origin "$EW_BASE" || die "git fetch origin $EW_BASE failed"
  else
    clone_for "$wt" || die "could not clone $MAIN into $wt"
  fi
  if ngit -C "$wt" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    remote=1
    ngit -C "$wt" fetch -q origin "+refs/heads/$branch:refs/remotes/origin/$branch" || die "git fetch origin $branch failed"
  fi
  [ "$cont" = 1 ] || [ $remote = 0 ] || EXIT=2 die "origin/$branch exists; pass --continue to build on it"
  if [ "$(sgit -C "$wt" symbolic-ref -q --short HEAD 2>/dev/null)" != "$branch" ]; then
    local base="origin/$EW_BASE"; [ $remote = 0 ] || base="origin/$branch"
    sgit -C "$wt" checkout -q -B "$branch" "$base" || die "could not check out $branch from $base"
    [ $remote = 0 ] || sgit -C "$wt" branch -q --set-upstream-to="origin/$branch" "$branch"
  elif [ "$cont" = 0 ]; then
    if [ -n "$(sgit -C "$wt" status --porcelain)" ] || [ -n "$(sgit -C "$wt" rev-list "origin/$EW_BASE..HEAD" 2>/dev/null)" ]; then
      EXIT=2 die "$wt holds work beyond origin/$EW_BASE; pass --continue to keep it"
    fi
    sgit -C "$wt" reset -q --hard "origin/$EW_BASE" || die "could not reset $wt to origin/$EW_BASE"
  elif [ $remote = 1 ] && [ -z "$(sgit -C "$wt" status --porcelain)" ] && sgit -C "$wt" merge-base --is-ancestor HEAD "origin/$branch"; then
    sgit -C "$wt" merge -q --ff-only "origin/$branch" || die "could not fast-forward $wt to origin/$branch"
  fi
  # This script's own checkout may change tracked hook files (.husky), so the baseline is taken again here.
  record_baseline "$wt" || die "could not record $wt's baseline"
  EXIT=2
}
