# ext-worker-supervise.sh: sourced by ext-worker.sh. The supervisor of one round: it installs dependencies inside the
# sandbox, runs the engine there under a time box, then audits the run and writes the registry row's final status.

reg_set() { lib registry "$REG"; } # the patch comes on stdin
json_str() { "$HOST_NODE" -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))'; }

finish() { # <status> <exitCode> <report> [question]
  local q=null
  net_down
  # The run folder holds the copy of the CLI's auth file; the logs and the worktree stay.
  case "${RUN:-}" in "$EW"/runs/?*) rm -rf "$RUN" ;; esac
  [ -z "${4:-}" ] || q=$(printf '%s' "$4" | head -c 4000 | json_str)
  printf '{"status":"%s","exitCode":%s,"endedAt":"%s","report":%s,"question":%s}' "$1" "${2:-null}" "$(now)" "$(printf '%s' "$3" | head -c 4000 | json_str)" "$q" | reg_set
  echo "$(now) $1: $3"
  exit 0
}

engine_command() {
  if [ "$ENGINE" = codex ]; then
    local model; model=$(sed -n 's/^model = "\(.*\)"/\1/p' "$HOME/.codex/config.toml" 2>/dev/null | head -1)
    # Codex's own sandbox can't nest inside this one (macOS refuses a nested sandbox once the outer profile denies
    # anything), so it is off and this one holds the whole tree. The features switched off keep account connectors,
    # browsers and memories out of reach; --ignore-user-config alone left connectors reachable. Codex strips *TOKEN*
    # variables from commands by default, which would drop GH_TOKEN. Its default login shell runs macOS's path_helper,
    # which puts /usr/bin ahead of the command guard, so commands run in a plain shell.
    CMD=("$(codex_bin)" exec --skip-git-repo-check --ephemeral --ignore-user-config --dangerously-bypass-approvals-and-sandbox \
      --disable apps --disable plugins --disable remote_plugin --disable browser_use \
      --disable browser_use_external --disable browser_use_full_cdp_access \
      --disable computer_use --disable in_app_browser --disable in_app_local_automation \
      --disable hooks --disable memories --disable skill_mcp_dependency_install --disable network_proxy \
      ${model:+-m "$model"} -C "$WT" \
      -c 'web_search="disabled"' -c 'model_reasoning_effort="high"' -c 'allow_login_shell=false' \
      -c 'shell_environment_policy.inherit="all"' -c 'shell_environment_policy.ignore_default_excludes=true' \
      --json -o "$RUN_TMP/final.md" -)
    STDIN="$RUN/prompt.md"
  else
    local deny=() p
    # Grok's own rules over its in-process file tools, under the sandbox, which holds them either way.
    for p in "$HOME/.grok" "$HOME/.codex" "$HOME/.ssh" "$HOME/.claude" "$HOME/.config" "$HOME/.doppler" "$HOME/Library" \
      "$EW_STATE" "$EW_SHARED" "$EW_QUEUE_ROOT" "$MAIN/.git/hooks"; do
      deny+=(--deny "Read($p/**)" --deny "Grep($p/**)" --deny "Edit($p/**)" --deny "Write($p/**)")
    done
    for p in "$WT/.git" "$WT/.husky" "$WT/.claude" "$WT/.grok" "$WT/.codex"; do deny+=(--deny "Edit($p/**)" --deny "Write($p/**)"); done
    # --tools takes tool IDs; an unknown one leaves every tool on, so the stderr is checked for it after the run.
    CMD=("$(grok_bin)" --prompt-file "$RUN/prompt.md" \
      --tools run_terminal_cmd,read_file,search_replace,write,grep,list_dir,todo_write \
      --disallowed-tools Agent,task --deny MCPTool "${deny[@]}" \
      --allow "Write($WT/**)" --allow "Edit($WT/**)" --allow Bash \
      --permission-mode bypassPermissions --always-approve --disable-web-search --no-subagents \
      --max-turns 400 --output-format streaming-json --cwd "$WT" --reasoning-effort high)
    STDIN=/dev/null
  fi
}

write_prompt() {
  local hosts ports
  hosts=$(echo $ALLOWED_HOSTS $EW_EXTRA_HOSTS | sed 's/ /, /g')
  ports=${LOOPBACK_PORTS:-none}
  {
    cat "$LOGDIR/brief.md"
    cat <<EOF

--- THIS MACHINE (written by ext-worker.sh) ---
Worktree: $WT (branch $BRANCH). TMPDIR: $RUN_TMP. HOME is a scratch folder for this run.
To ask a question, write it to $RUN_TMP/ENGINE_QUESTION.md and stop.
Push with: gated-push origin $BRANCH (it is on your PATH; it runs the repo's pre-push gates, then pushes).
Blocked here, so don't try: reading outside this worktree and the toolchain; any network except $hosts through the proxy already set in HTTPS_PROXY; loopback ports other than these: $ports; secrets managers; merging; workflow runs; releases; pushes to $EW_BASE; force pushes; --no-verify. Tests that open their own local server may not run here, and CI runs them.
EOF
    [ "$ENGINE" = codex ] || echo "Your terminal tool refuses a command with \$VARIABLE expansion or \$(...) in this headless mode. Put such a command in a script under $RUN_TMP and run it with: bash <that file>."
    echo "The last line of your reply must be RESULT: DONE, or RESULT: BLOCKED <why>."
  } > "$RUN/prompt.md"
}

# A narrower token (fallback.ghTokenFile, mode 600) wins over gh's own sign-in when the file exists.
gh_token() {
  local f="${EXT_WORKER_GH_TOKEN_FILE:-$EW_GH_TOKEN_FILE}"
  if [ -s "$f" ]; then tr -d ' \n' < "$f"; return; fi
  gh auth token 2>/dev/null
}

git_guard_sig() { (cd "$WT" && find $(protected_paths | sed "s|$WT/||g") -type f 2>/dev/null | sort | xargs cksum 2>/dev/null); }

cmd_supervise() {
  ENGINE=$1; TID=$2; SID=$3; BRANCH=$4; local wt=$5; TIMEOUT=$6; RUN=$7; LOGDIR=$8
  REG="$REG_DIR/$TID.json"
  local i; for i in $(seq 1 100); do [ "$(reg_get "$REG" id)" = "$SID" ] && break; sleep 0.1; done
  [ "$(reg_get "$REG" id)" = "$SID" ] || { echo "the registry row is not this spawn's; exiting"; exit 0; }
  setup_paths "$ENGINE" "$wt" "$RUN"
  ENGINE_PID=""
  trap 'echo "stop requested"; [ -z "$ENGINE_PID" ] || kill -TERM "$ENGINE_PID" 2>/dev/null; sleep 3; finish failed null "stopped"' TERM INT HUP
  toolchain || finish failed null "$TOOL_WHY"
  write_shims || finish failed null "could not write the command guard"
  prepare_cli_home || finish failed null "could not copy $ENGINE's auth file into the run"
  PROXY_PORT=$(lib port)
  net_up "$LOGDIR/net.jsonl" || finish failed null "the network proxy did not start"

  if [ ${#EW_INSTALL[@]} -gt 0 ]; then
    echo "$(now) installing dependencies in $WT: ${EW_INSTALL[*]}"
    env -u EW_GH_TOKEN "$SELF" _timeout 1800 "$SELF" _locked "$ENGINE" "$WT" "$RUN" "$PROXY_PORT" "${EW_INSTALL[@]}" > "$LOGDIR/install.log" 2>&1 &
    ENGINE_PID=$!
    wait "$ENGINE_PID" || finish failed null "install: $(grep -v '^[[:space:]]*$' "$LOGDIR/install.log" | tail -3 | tr '\n' ' ' | cut -c1-600)"
    ENGINE_PID=""
  fi

  write_prompt
  local head0 branch0 guard0
  head0=$(git -C "$WT" rev-parse HEAD); branch0=$(git -C "$WT" symbolic-ref -q --short HEAD || echo detached)
  guard0=$(git_guard_sig)
  rm -f "$RUN_TMP/ENGINE_QUESTION.md" "$RUN_TMP/final.md"
  CMD=(); STDIN=/dev/null; engine_command
  EW_GH_TOKEN=$(gh_token); export EW_GH_TOKEN
  [ -n "$EW_GH_TOKEN" ] || finish failed null "no GitHub token (fallback.ghTokenFile or gh auth token), so the engine could not push"
  echo "$(now) starting $ENGINE for $TID, spawn $SID"
  "$SELF" _timeout "$TIMEOUT" "$SELF" _locked "$ENGINE" "$WT" "$RUN" "$PROXY_PORT" "${CMD[@]}" < "$STDIN" > "$LOGDIR/stream.jsonl" 2> "$LOGDIR/stderr.log" &
  ENGINE_PID=$!
  printf '{"enginePid":%s}' "$ENGINE_PID" | reg_set
  wait "$ENGINE_PID"; local rc=$?
  ENGINE_PID=""
  unset EW_GH_TOKEN
  net_down
  echo "$(now) $ENGINE exited $rc"
  lib auth-sync "$ENGINE" "$RUN/cli-home/auth.json" "$(cli_home "$ENGINE")/auth.json" > "$LOGDIR/auth-sync.txt" 2>&1

  # --- what happened ---
  lib stream "$ENGINE" "$LOGDIR/stream.jsonl" "$WT" "$LOGDIR/summary.md" "$RUN_TMP" > "$LOGDIR/audit.txt" 2>&1
  [ "$ENGINE" != codex ] || [ ! -s "$RUN_TMP/final.md" ] || cp "$RUN_TMP/final.md" "$LOGDIR/summary.md"
  local flags=() l hazards
  while IFS= read -r l; do flags+=("${l#violation: }"); done < <(grep '^violation: ' "$LOGDIR/audit.txt")
  if [ "$ENGINE" = grok ] && grep -q 'name no tool' "$LOGDIR/stderr.log" 2>/dev/null; then
    flags+=("grok did not recognize a name in --tools, so tools outside the allowlist were on")
  fi
  hazards=$(lib branch "$WT" "origin/$EW_BASE") || flags+=("the branch changes files that run outside the sandbox: $(tr '\n' ' ' <<<"$hazards")")
  [ "$guard0" = "$(git_guard_sig)" ] || flags+=("the clone's git hooks, config or hook folder changed during the run")
  [ ${#flags[@]} -eq 0 ] || finish failed "$rc" "containment: $(printf '%s; ' "${flags[@]}" | cut -c1-3500)files kept in $LOGDIR"
  [ "$rc" -ne 142 ] || finish failed "$rc" "timed out after ${TIMEOUT}s; the worktree is left as it was"
  [ "$rc" -ne 143 ] || finish failed "$rc" "stopped"
  if [ "$rc" -ne 0 ] && lib limit "$LOGDIR/stderr.log" "$LOGDIR/stream.jsonl"; then
    finish limit "$rc" "$ENGINE hit its plan or rate limit: $(grep -v rmcp "$LOGDIR/stderr.log" | tail -2 | tr '\n' ' ' | cut -c1-300)"
  fi
  local branch1; branch1=$(git -C "$WT" symbolic-ref -q --short HEAD || echo detached)
  [ "$branch1" = "$branch0" ] || finish failed "$rc" "the worktree moved from $branch0 to $branch1"
  if [ -s "$RUN_TMP/ENGINE_QUESTION.md" ]; then
    cp "$RUN_TMP/ENGINE_QUESTION.md" "$LOGDIR/question.md"
    finish blocked "$rc" "$ENGINE asked a question and stopped" "$(cat "$RUN_TMP/ENGINE_QUESTION.md")"
  fi
  [ "$rc" -eq 0 ] || finish failed "$rc" "$ENGINE exited $rc: $(grep -v rmcp "$LOGDIR/stderr.log" | tail -3 | tr '\n' ' ' | cut -c1-400) $(grep '^error: ' "$LOGDIR/audit.txt" | tail -2 | tr '\n' ' ' | cut -c1-300)"
  local why; why=$(lib result "$LOGDIR/summary.md")
  [ -n "$why" ] || finish done 0 "$ENGINE finished the round; HEAD ${head0:0:10} -> $(git -C "$WT" rev-parse --short=10 HEAD)"
  case "$why" in
    "it ended without a RESULT line") finish failed 0 "$ENGINE ended without a RESULT line" ;;
    *) finish blocked 0 "$ENGINE said it was blocked" "$why" ;;
  esac
}
