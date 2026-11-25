# ext-worker-guard.sh: sourced by ext-worker.sh. Writes the command guard (a shim folder first on the engine's PATH),
# the engine's gated-push, and the helper programs the sandbox starts with.
#
# The guard is a speed bump. An engine can call /usr/bin/git or /opt/homebrew/bin/gh by its absolute path and skip it.
# What stands behind it is the scrubbed environment, the sandbox, the token's own scopes, and the after-run audit of
# the engine's event stream (ext-worker-audit.mjs), which fails a run that tried any of these.

# Rewritten on every start, so an edit can't outlive a run (the folder is read-only inside the sandbox anyway). Each shim
# finds the real binary on PATH after its own folder.
write_shims() {
  local d="$EW/shims" t="$EW/shims.new.$$" n
  rm -rf "$t"; mkdir -p "$t" "$EW/bin"
  cat > "$t/_real" <<'SH'
real_bin() {
  local n=$1 here dir IFS=:
  here=$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)
  for dir in $PATH; do
    [ "$dir" = "$here" ] && continue
    [ -x "$dir/$n" ] && { printf '%s\n' "$dir/$n"; return 0; }
  done
  return 1
}
refuse() { echo "ext-worker guard: refused: $*. Queue engines never do this; the orchestrator does after review." >&2; exit 126; }
SH
  # Secrets managers: an engine has no reason to run one, and no credential for one inside.
  for n in doppler op vault; do
    printf '#!/bin/bash\n. "$(dirname "$0")/_real"\nrefuse "the %s CLI"\n' "$n" > "$t/$n"
  done
  # A PR's merge endpoint and the base branch's ref are refused whatever the method; the base comes from the config.
  sed "s|@BASE@|$EW_BASE|g" > "$t/gh" <<'SH'
#!/bin/bash
. "$(dirname "$0")/_real"
args=" $* "
# The subcommand words, without flags or the value a flag takes (gh --repo o/r workflow run puts o/r first).
sub=""; skip=0
for a in "$@"; do
  if [ $skip = 1 ]; then skip=0; continue; fi
  case "$a" in
    -R|--repo|--hostname|-H|--header|-X|--method|-f|-F|--field|--raw-field|--jq|-q|--template|-t|--input|--cache|--preview|-p) skip=1 ;;
    -*) ;;
    *) sub="$sub $a" ;;
  esac
done
case "$sub" in
  *" pr merge"*) refuse "gh pr merge" ;;
  " workflow run"*|" workflow enable"*) refuse "gh workflow run" ;;
  " release"*) refuse "gh release" ;;
  " secret"*|" variable"*) refuse "gh secret and gh variable" ;;
  " ruleset"*|" repo edit"*|" repo delete"*|" repo rename"*|" repo archive"*) refuse "changing the repository" ;;
  " auth token"*|" auth refresh"*|" auth login"*|" auth logout"*|" auth setup-git"*|" auth switch"*) refuse "gh auth" ;;
esac
if [ "${sub# api}" != "$sub" ]; then
  case "$args" in
    */pulls/*/merge" "*|*/pulls/*/merge/*|*/pulls/*/merge\?*) refuse "gh api on a PR's merge endpoint" ;;
    *git/ref/heads/main" "*|*git/refs/heads/main" "*|*git/ref/heads/master" "*|*git/refs/heads/master" "*|*git/ref/heads/@BASE@" "*|*git/refs/heads/@BASE@" "*)
      refuse "gh api on the base branch's ref" ;;
  esac
  case "$args" in
    *merge*|*dispatches*|*/actions/*|*workflows*|*rulesets*|*protection*|*collaborators*|*/hooks*|*/keys*|*environments*|*/git/refs*)
      case "$args" in
        *" -X GET "*|*" --method GET "*|*" --method=GET "*) ;;
        *" -X "*|*" --method"*|*" -f "*|*" -F "*|*" --field"*|*" --raw-field"*|*" --input"*) refuse "gh api writes to merges, dispatches, workflows, refs or repository settings" ;;
      esac ;;
  esac
fi
exec "$(real_bin gh)" "$@"
SH
  # The base branch comes from the config (github.baseBranch); main and master are refused whatever it is.
  sed "s|@BASE@|$EW_BASE|g" > "$t/git" <<'SH'
#!/bin/bash
. "$(dirname "$0")/_real"
# A dry run pushes nothing, so it may skip the hooks: gated-push asks where a push lands with one.
dry=0; seen=0
for a in "$@"; do
  if [ $seen = 0 ]; then [ "$a" = push ] && seen=1; continue; fi
  case "$a" in -n|--dry-run) dry=1 ;; esac
done
seen=0
for a in "$@"; do
  if [ $seen = 0 ]; then [ "$a" = push ] && seen=1; continue; fi
  case "$a" in
    -f|--force|--force-with-lease|--force-with-lease=*|--force-if-includes|--mirror|--all|--delete|-d|--prune) refuse "git push $a" ;;
    --no-verify) [ $dry = 1 ] || refuse "git push --no-verify" ;;
    +*) refuse "a force refspec ($a)" ;;
    main|master|@BASE@|*:main|*:master|*:@BASE@|refs/heads/main|refs/heads/master|refs/heads/@BASE@|*:refs/heads/main|*:refs/heads/master|*:refs/heads/@BASE@) refuse "pushing to the base branch" ;;
  esac
done
exec "$(real_bin git)" "$@"
SH
  # The brief pushes through gated-push (push.gates, then git push). The agent-queue checkout is unreadable inside, so
  # the command is written here from the config.
  lib push-shim "$t/gated-push" || return 1
  chmod 755 "$t"/doppler "$t"/op "$t"/vault "$t"/gh "$t"/git "$t"/gated-push
  rm -rf "$d.old"; [ ! -d "$d" ] || mv "$d" "$d.old"; mv "$t" "$d"; rm -rf "$d.old"
  # Linux: the sandbox has its own empty network namespace, and this carries loopback ports out to unix sockets.
  cp "$NET" "$EW/bin/net.mjs.$$" && mv "$EW/bin/net.mjs.$$" "$EW/bin/net.mjs"
  cat > "$EW/bin/netns-start.$$" <<'SH'
#!/bin/bash
# ext-worker: first process inside the Linux sandbox. Starts the loopback bridge, then becomes the engine.
maps=(); for p in $EW_BRIDGE_PORTS; do maps+=(--map "$p=unix:$EW_NET_DIR/tcp-$p.sock"); done
env -u NODE_USE_ENV_PROXY "$EW_NODE" "$EW_BIN/net.mjs" bridge --map "$EW_PROXY_PORT=unix:$EW_NET_DIR/proxy.sock" ${maps[@]+"${maps[@]}"} &
for i in $(seq 1 50); do (exec 3<>/dev/tcp/127.0.0.1/"$EW_PROXY_PORT") 2>/dev/null && break; sleep 0.1; done
unset EW_BRIDGE_PORTS EW_NET_DIR EW_NODE EW_BIN EW_PROXY_PORT
exec "$@"
SH
  chmod 755 "$EW/bin/netns-start.$$"; mv "$EW/bin/netns-start.$$" "$EW/bin/netns-start"
  # Grok runs each terminal command through $SHELL as a login shell, and on macOS /etc/profile runs path_helper, which
  # puts /usr/local/bin and /usr/bin ahead of the command guard and of the right node. Named bash so Grok quotes for bash.
  mkdir -p "$EW/bin/shell"
  printf '#!/bin/bash\nexec /bin/bash --noprofile --norc "$@"\n' > "$EW/bin/shell/bash.$$"
  chmod 755 "$EW/bin/shell/bash.$$"; mv "$EW/bin/shell/bash.$$" "$EW/bin/shell/bash"
}
