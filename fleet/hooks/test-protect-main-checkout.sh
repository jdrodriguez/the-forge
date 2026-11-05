#!/usr/bin/env bash
# test-protect-main-checkout.sh: run the main-checkout hook against a temp checkout and print PASS/FAIL per case.
# Never touches a real checkout or reads a real config: CLAUDE_PROTECTED_CHECKOUTS, AGENT_QUEUE_CONFIG and HOME
# point into a mktemp folder.
# Env: PROTECT_HOOK (hook under test, default protect-main-checkout.sh next to this file),
#      PROTECT_TEST_BASH (shell that runs the hook, default bash; /bin/bash checks macOS's bash 3.2)
set -o pipefail

HOOK="${PROTECT_HOOK:-$(cd -P "$(dirname "$0")" && pwd -P)/protect-main-checkout.sh}"
HOOK_SHELL="${PROTECT_TEST_BASH:-bash}"
T="$(cd -P "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$T"' EXIT
R="$T/ws/app"
mkdir -p "$R/.claude/worktrees/wt1" "$R/config/rules" "$T/ws/other" "$T/home/.claude" "$T/links"
echo rule > "$R/config/rules/pr-review.md"
echo existing > "$R/existing.txt"
ln -s "$R/config/rules/pr-review.md" "$T/links/pr-review.md"
ln -s "$R/config" "$T/links/ms"
SCR="$T/scratch"
mkdir -p "$SCR" "$R/packages/app-ui/src/components/layout" "$R/.claude/builds/old-slug"
ln -s "$R" "$T/home/app-link"

PASSES=0
FAILS=0

# run <expected exit> <label> <cwd> <json tool_input> [tool name]
# The checkout is $R, its worktrees are under .claude/worktrees and .claude/builds is open to file writes. The
# config file named does not exist, so only the environment decides.
run() {
  local want="$1" label="$2" cwd="$3" tin="$4" tool="${5:-Bash}" got
  jq -nc --arg t "$tool" --arg c "$cwd" --argjson i "$tin" '{tool_name: $t, cwd: $c, tool_input: $i}' |
    env HOME="$T/home" AGENT_QUEUE_CONFIG="$T/no-config.json" CLAUDE_PROTECTED_CHECKOUTS="$R" CLAUDE_PROTECTED_WORKTREES= \
      CLAUDE_PROTECTED_WRITABLE=.claude/builds CLAUDE_ALLOW_MAIN_CHECKOUT= "$HOOK_SHELL" "$HOOK" >/dev/null 2>"$T/err"
  got=$?
  if [ "$got" = "$want" ]; then
    PASSES=$((PASSES + 1)); printf 'PASS  %s\n' "$label"
  else
    FAILS=$((FAILS + 1)); printf 'FAIL  %s (exit %s, wanted %s)\n' "$label" "$got" "$want"; sed 's/^/      /' "$T/err"
  fi
}
bash_in() { jq -nc --arg c "$1" '{command: $c}'; }
file_in() { jq -nc --arg f "$1" '{file_path: $f}'; }

# runh <expected exit> <label> <cwd>: run with the Bash command read verbatim from stdin. In it @R@ is
# the checkout, @W@ the workspace that holds it and @S@ a scratch folder outside it.
runh() {
  local c
  c="$(cat)"
  c="${c//@R@/"$R"}"
  c="${c//@W@/"$W"}"
  c="${c//@S@/"$SCR"}"
  run "$1" "$2" "$3" "$(bash_in "$c")"
}

W="$T/ws"
# Edit and Write
run 2 "Write a new file in the checkout" "$W" "$(file_in "$R/new.txt")" Write
run 2 "Edit an existing file in the checkout" "$W" "$(file_in "$R/existing.txt")" Edit
run 2 "Write a new file in a new nested folder" "$W" "$(file_in "$R/a/b/c.txt")" Write
run 2 "Edit through a relative path from the workspace" "$W" "$(file_in "app/existing.txt")" Edit
run 2 "Edit through a symlinked file" "$W" "$(file_in "$T/links/pr-review.md")" Edit
run 2 "Write through a symlinked folder" "$W" "$(file_in "$T/links/ms/rules/new.md")" Write
run 2 "Edit the checkout root's own CLAUDE.md" "$R" "$(file_in "CLAUDE.md")" Edit
run 2 "NotebookEdit in the checkout" "$W" "$(jq -nc --arg f "$R/n.ipynb" '{notebook_path: $f}')" NotebookEdit
run 0 "Write inside a worktree" "$W" "$(file_in "$R/.claude/worktrees/wt1/x.txt")" Write
run 0 "Edit relative inside a worktree" "$R/.claude/worktrees/wt1" "$(file_in "src/x.ts")" Edit
run 0 "Write outside the checkout" "$W" "$(file_in "$W/other/x.txt")" Write
run 0 "Read is never checked" "$W" "$(file_in "$R/existing.txt")" Read
run 2 "Write the escape-hatch file" "$W" "$(file_in "$T/home/.claude/allow-main-checkout-edits")" Write

# Bash git
run 2 "git -C checkout commit" "$W" "$(bash_in "git -C $R commit -m x")"
run 2 "git -C relative checkout stash push" "$W" "$(bash_in "git -C app stash push -m probe")"
run 2 "cd checkout then git checkout a branch" "$W" "$(bash_in "cd $R && git checkout -b foo")"
run 2 "session cwd in the checkout, git reset" "$R" "$(bash_in "git reset --hard HEAD~1")"
run 2 "env prefix before git commit" "$W" "$(bash_in "SKIP_PREPUSH=1 git -C $R commit -am x")"
run 2 "git pull without --ff-only" "$W" "$(bash_in "git -C $R pull")"
run 0 "git clean -n is a dry run" "$W" "$(bash_in "git -C $R clean -n")"
run 2 "second command in a chain" "$W" "$(bash_in "git -C $R fetch origin; git -C $R rebase origin/main")"
run 0 "git pull --ff-only" "$W" "$(bash_in "git -C $R pull --ff-only")"
run 0 "git merge --ff-only" "$W" "$(bash_in "git -C $R merge --ff-only origin/main")"
run 0 "git fetch" "$W" "$(bash_in "git -C $R fetch origin main --quiet")"
run 0 "git worktree add" "$W" "$(bash_in "git -C $R worktree add .claude/worktrees/x -b tech/x origin/main")"
run 0 "git branch -D" "$W" "$(bash_in "git -C $R branch -D tech/x")"
run 0 "git stash list" "$W" "$(bash_in "git -C $R stash list")"
run 0 "git status" "$R" "$(bash_in "git status --porcelain")"
run 0 "git commit inside a worktree" "$W" "$(bash_in "git -C $R/.claude/worktrees/wt1 commit -m x")"
run 0 "cd into a worktree then commit" "$W" "$(bash_in "cd $R/.claude/worktrees/wt1 && git commit -am x")"
run 0 "git words inside a quoted body" "$W" "$(bash_in "gh pr create --body 'run git commit later'")"

# Bash file writes
run 2 "redirect into the checkout" "$W" "$(bash_in "echo hi > $R/x.txt")"
run 2 "append redirect, relative" "$W" "$(bash_in "echo hi >> app/log.txt")"
run 2 "tee into the checkout" "$W" "$(bash_in "echo hi | tee -a $R/log.txt")"
run 2 "sed -i on a checkout file" "$W" "$(bash_in "sed -i '' s/a/b/ $R/existing.txt")"
run 2 "cp into the checkout" "$W" "$(bash_in "cp /tmp/a $R/b.txt")"
run 2 "mv into the checkout" "$W" "$(bash_in "mv $W/other/a $R/a")"
run 2 "rm a checkout file" "$W" "$(bash_in "rm -f $R/existing.txt")"
run 2 "touch the escape hatch" "$W" "$(bash_in "touch ~/.claude/allow-main-checkout-edits")"
run 0 "redirect out of the checkout" "$W" "$(bash_in "cat $R/existing.txt > /tmp/copy.txt")"
run 0 "stderr redirect only" "$W" "$(bash_in "ls $R 2>/dev/null")"
run 0 "cp out of the checkout" "$W" "$(bash_in "cp $R/existing.txt $W/other/")"
run 0 "rm inside a worktree" "$W" "$(bash_in "rm -rf $R/.claude/worktrees/wt1/build")"
run 0 "pnpm install in the checkout" "$R" "$(bash_in "pnpm install --frozen-lockfile")"

# False positives recorded from real sessions, replayed on the temp checkout. Each must pass.
runh 0 "corpus 2, C: cd \$_ after mkdir in a worktree, heredoc into a relative file" "$R" <<'CMD'
mkdir -p @R@/.claude/worktrees/wt1/packages/app-ui/src/eligibility && cd $_ && cat > eligibility-draft.ts <<'EOF'
import type { FilterPolicy } from '@app/shared';

// The threshold as a whole percent (blank for none) > 0.
export function toDraft(policy: FilterPolicy): string {
  return policy.agentNames.join('\n') + (policy.minDurationSeconds === null ? '' : '>0');
}
EOF
echo ok
CMD
runh 0 "corpus 3, A: > inside quoted jq filters and a sed script" "$R" <<'CMD'
cat @S@/bnxc9datz.output; gh api repos/your-org/your-app/pulls/3290/comments --jq '.[] | select(.in_reply_to_id==null and .created_at > "2026-10-19T02:10:00Z") | "\(.id) \(.path):\(.line)\n\(.body[0:1800])\n---"'; job=$(gh pr checks 3290 --json name,link --jq '.[] | select(.name=="build") | .link' | sed -E 's#.*/job/([0-9]+).*#\1#'); gh run view --job $job --log 2>/dev/null | grep -E "exceeded by|Size limit:|  Size:" | sed -E 's/^.{0,80}Z //' | head
CMD
runh 0 "corpus 4, A: jq 'length>0' with a here-string and >/dev/null" "$R" <<'CMD'
sleep 150; until s=$(gh pr checks 3290 --json name,bucket 2>/dev/null) && jq -e 'length>0 and all(.bucket!="pending")' <<<"$s" >/dev/null; do sleep 45; done; jq -r '.[] | select(.bucket!="pass" and .bucket!="skipping") | "\(.name): \(.bucket)"' <<<"$s"; echo DONE; gh api repos/your-org/your-app/pulls/3290/comments --jq '[.[] | select(.in_reply_to_id==null)] | length'
CMD
runh 0 "corpus 5, B: heredoc body with length>0 written to a scratch file" "$R" <<'CMD'
cat > @S@/wait-ci.sh <<'EOF'
#!/bin/bash
sleep 150
while true; do
  s=$(gh pr checks 3290 --repo your-org/your-app --json name,bucket 2>/dev/null)
  if [ -n "$s" ] && echo "$s" | jq -e 'length>0 and all(.bucket!="pending")' >/dev/null; then break; fi
  sleep 45
done
echo "$s" | jq -r '.[] | select(.bucket!="pass" and .bucket!="skipping") | "\(.name): \(.bucket)"'
EOF
chmod +x @S@/wait-ci.sh
CMD
runh 0 "corpus 6, C: redirects through a variable set to a scratch folder" "$R" <<'CMD'
mkdir -p @S@ && S=@S@ && render logs -r srv-x --type app --text worker.error --limit 500 --direction forward -o json --confirm > $S/w2_errors.json 2>$S/w2_errors.err; echo "exit=$?"; wc -c $S/w2_errors.json $S/w2_errors.err; head -c 1500 $S/w2_errors.json; echo; cat $S/w2_errors.err | head -5
CMD
runh 0 "corpus 7, C: git -C through a variable set to a worktree" "$R" <<'CMD'
WT=@R@/.claude/worktrees/wt1; git -C $WT rebase origin/main 2>&1 | tail -20; git -C $WT status --short | head -20
CMD
runh 0 "corpus 8, C: cp and heredocs through a variable set to a worktree folder" "$R" <<'CMD'
H=@R@/.claude/worktrees/wt1/packages/web/.visual-gate; mkdir -p $H/stubs && cp @R@/.claude/worktrees/wt1/packages/web/styles.css $H/styles.css && cat > $H/index.html <<'EOF'
<!doctype html>
<html lang="en" data-density="compact">
  <body><div id="root"></div><script type="module" src="/main.tsx"></script></body>
</html>
EOF
cat > $H/stubs/useFlag.ts <<'EOF'
export function useFlag(): boolean {
  return (new URLSearchParams(window.location.search).get('caps') ?? '').length > 0;
}
EOF
ls -R $H
CMD
runh 0 "corpus 9, A: double quotes holding single quotes, \\\" and >All" "$R/packages/app-ui/src" <<'CMD'
grep -n -E "label: '|label=\"|aria-label=\"|All [a-z]+'|'All |>All " pages/reports/use-report-tabs.ts pages/reports/ReportFilterBar.tsx | head -40
CMD
runh 0 "corpus 10, A: awk 'NR>728'" "$R/packages/app-ui/src/components/layout" <<'CMD'
awk 'NR>728' nav-registry.ts | grep -n -E "^\s{4}(id|label): '" | paste - - | head -20
CMD
runh 0 "corpus 11, A: cd into the checkout, then > inside quoted jq and python -c" "$W/other" <<'CMD'
cd @R@ && gh pr view 3289 --json statusCheckRollup,mergeable,mergeStateStatus --jq '{mergeable,mergeStateStatus}' ; gh pr view 3289 --json statusCheckRollup | python3 -c "
import json,sys
d=json.load(sys.stdin)['statusCheckRollup']
by={}
for c in d:
    n=c.get('name') or c.get('context')
    t=c.get('completedAt') or c.get('startedAt') or ''
    if n not in by or t>by[n][0]:
        by[n]=(t,c.get('status') or c.get('state'),c.get('conclusion'))
print(len(by),'checks;', 'not green:')
"; ~/.claude/scripts/manage-pr-comments.sh list-unresolved 3289 2>&1 | head -30
CMD
runh 0 "corpus 12, B+D: cd to scratch, heredoc body with > and cd, later cd into the checkout" "$W/other" <<'CMD'
cd @S@ && cat > checks/pr_checks.py <<'EOF'
import json, subprocess, sys
pr = sys.argv[1]
by = {}
for c in json.loads(subprocess.run(["gh", "pr", "view", pr], capture_output=True, text=True).stdout or "[]"):
    t = c.get("completedAt") or ""
    if t > by.get("x", ("",))[0]:
        by["x"] = (t,)
# cd @R@ && git commit -am wip > @R@/log.txt
EOF
python3 checks/pr_checks.py 3289; cd @R@ && ~/.claude/scripts/manage-pr-comments.sh list-unresolved 3289 2>&1 | head -40
CMD
runh 0 "corpus 13, B: python heredoc, then sed -i '' with a script holding ~ and §" "$R" <<'CMD'
M=@S@/memory; python3 - "$M/feedback_example_note.md" <<'EOF'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('modified: 2026-10-13T17:50:05.434Z','modified: 2026-10-19T13:45:00.000Z')
if len(s) > 0: open(p,'w').write(s.rstrip()+'\n\n**Second correction.** He said "don\'t stop to ask".\n')
EOF
sed -i '' 's/^- \[Example note, second wording\](feedback_example_note.md) - .*/- [Example note](feedback_example_note.md) - moved to ~\/.claude\/CLAUDE.md § Example; corrected twice (10-13, 10-19)/' $M/MEMORY.md; head -1 $M/MEMORY.md
CMD
runh 0 "corpus 14, C: ~ inside a variable, cp to it" "$R" <<'CMD'
S=@S@; D=~/handoffs/builds/feature-v2; cp $S/1234-pr-body.md $S/1234-measure.txt $D/ && ls $D; head -40 $D/1234-pr-body.md; echo ...; cat $D/1234-measure.txt | head -30
CMD

# True positives the parser must keep blocking.
runh 2 "variable set to the checkout, redirect through it" "$W" <<'CMD'
S=@R@; echo x > $S/f
CMD
runh 2 "cd into the checkout, relative redirect" "$W" <<'CMD'
cd @R@ && echo x > out.txt
CMD
runh 2 "quoted > is text, the real redirect blocks" "$W" <<'CMD'
echo "a > b" > @R@/x
CMD
runh 2 "heredoc written into the checkout" "$W" <<'CMD'
cat > @R@/x.txt <<'EOF'
body
EOF
CMD
runh 2 "bash -c writing into the checkout" "$W" <<'CMD'
bash -c "echo x > @R@/y"
CMD
runh 2 "eval running git commit in the checkout" "$W" <<'CMD'
eval "git -C @R@ commit -m x"
CMD
runh 2 "subshell cd into the checkout, then git commit" "$W" <<'CMD'
(cd @R@ && git commit -m x)
CMD

# Passes the parser must allow.
runh 0 "subshell cd into a worktree does not leak out" "$W" <<'CMD'
(cd @R@/.claude/worktrees/wt1 && git commit -m x); git -C @R@ status
CMD
runh 0 "[[ a > b ]] compares strings" "$R" <<'CMD'
[[ a > b ]] && echo ok
CMD
runh 0 "\$(( 3 > 2 )) is arithmetic" "$R" <<'CMD'
echo $(( 3 > 2 ))
CMD
runh 2 "redirect right after ]] still writes" "$W" <<'CMD'
[[ a == a ]]>@R@/out
CMD
runh 0 "git -C an unknown variable" "$R" <<'CMD'
git -C $NOPE commit -m x
CMD
runh 0 "cd \$_ makes the folder unknown" "$R" <<'CMD'
cd $_ && echo x > f
CMD
runh 0 "heredoc into a worktree file" "$R" <<'CMD'
cat > @R@/.claude/worktrees/wt1/notes.md <<'EOF'
> quoted line: git -C @R@ commit -m x > @R@/x
EOF
CMD

# Redirection forms
runh 2 "redirect attached to the word" "$W" <<'CMD'
echo x>@R@/log
CMD
runh 2 "&> into the checkout" "$W" <<'CMD'
echo x &> @R@/log
CMD
runh 2 ">| into the checkout" "$W" <<'CMD'
echo x >| @R@/log
CMD
runh 2 "2>> into the checkout" "$W" <<'CMD'
echo x 2>> @R@/log
CMD
runh 2 ">&word with a file name" "$W" <<'CMD'
echo x >& @R@/log
CMD
runh 0 "descriptor duplication with the folder in the checkout" "$R" <<'CMD'
echo x >&2; echo y 2>&1 1>&2 3>&-
CMD
runh 2 "quoted target with a space" "$W" <<'CMD'
echo x > "@R@/a b.txt"
CMD
runh 2 "redirect on a { } group" "$W" <<'CMD'
{ echo a; echo b; } > @R@/x
CMD
runh 2 "redirect after done" "$W" <<'CMD'
while read -r l; do echo "$l"; done < @W@/other/in > @R@/out
CMD
runh 2 "[ is a command, so > in it is a redirect" "$W" <<'CMD'
[ a > @R@/b ]
CMD
runh 2 "redirect on a command whose name is unknown" "$W" <<'CMD'
$CMD > @R@/x
CMD

# Quoting, comments and substitutions
runh 0 "redirect inside a comment" "$R" <<'CMD'
echo ok # > @R@/x; git reset --hard
CMD
runh 0 "\$'...' text holding >" "$R" <<'CMD'
echo $'a > b\'c' > @W@/other/x
CMD
runh 0 "parameter expansion holding a quoted brace" "$R" <<'CMD'
echo "${x:-'a}'}" > @W@/other/x
CMD
runh 0 "git words inside a here-string" "$R" <<'CMD'
cat <<<"git reset --hard; echo > @R@/x"
CMD
runh 2 "line continuation inside a git command" "$W" <<'CMD'
git -C @R@ \
  commit -m x
CMD
runh 2 "command substitution runs git" "$W" <<'CMD'
echo "$(git -C @R@ stash)"
CMD
runh 2 "backquote substitution runs git" "$W" <<'CMD'
echo `git -C @R@ stash`
CMD
runh 2 "assignment from a substitution that rebases" "$W" <<'CMD'
x=$(cd @R@ && git rebase main)
CMD
runh 2 "write inside a process substitution" "$W" <<'CMD'
echo x | tee >(cat > @R@/x) >/dev/null
CMD
runh 0 "process substitution is not a write" "$R" <<'CMD'
diff <(git -C @R@ show HEAD:a) @W@/other/b > @W@/other/d
CMD
runh 2 "unquoted heredoc body runs its substitutions" "$R" <<'CMD'
cat <<EOF
$(git reset --hard)
EOF
CMD
runh 0 "quoted heredoc body is data" "$R" <<'CMD'
cat <<'EOF'
$(git reset --hard)
EOF
CMD
runh 0 "<<- heredoc with tab-indented terminator" "$R" <<'CMD'
cat <<-'EOF' > @W@/other/x
	git reset --hard > @R@/x
	EOF
CMD
runh 0 "unterminated quote fails open" "$R" <<'CMD'
echo 'oops; git commit -m x
CMD

# Folder and variable tracking
runh 2 "{ } group keeps its cd" "$W" <<'CMD'
{ cd @R@; } && git commit -m x
CMD
runh 2 "pushd into the checkout" "$W" <<'CMD'
pushd @R@ && git commit -m x
CMD
runh 0 "popd makes the folder unknown" "$R" <<'CMD'
popd; git commit -m x
CMD
runh 0 "cd - makes the folder unknown" "$W" <<'CMD'
cd @R@; cd -; git commit -m x
CMD
runh 0 "cd alone goes home" "$R" <<'CMD'
cd && git commit -m x
CMD
runh 0 "relative git -C while the folder is unknown" "$R" <<'CMD'
cd $X; git -C sub commit -m x
CMD
runh 2 "export then redirect" "$W" <<'CMD'
export D=@R@; echo x > $D/f
CMD
runh 2 "double-quoted value with a space" "$W" <<'CMD'
D="@R@/sub dir"; echo x > "$D/f"
CMD
runh 2 "braced variable" "$W" <<'CMD'
D=@R@; echo x > ${D}/f
CMD
runh 2 "\$PWD follows cd" "$W" <<'CMD'
cd @R@ && echo x > $PWD/f
CMD
runh 2 "~ through a symlink into the checkout" "$W" <<'CMD'
echo x > ~/app-link/f
CMD
runh 0 "prefix assignment does not persist" "$W" <<'CMD'
X=@R@ true; echo x > $X/f
CMD
runh 0 "reassigned from a substitution" "$W" <<'CMD'
D=@R@; D=$(pwd); echo x > $D/f
CMD
runh 0 "\${...} with an operator is not resolved" "$W" <<'CMD'
echo x > ${D:-@R@}/f
CMD
runh 0 "read makes its variable unknown" "$W" <<'CMD'
D=@R@; read -r D; echo x > $D/f
CMD
runh 0 "for loop variable over a substitution is unknown" "$W" <<'CMD'
f=@R@; for f in $(ls); do echo x > $f/out; done
CMD
runh 2 "for loop body is checked" "$W" <<'CMD'
for f in a b; do git -C @R@ add "$f"; done
CMD
runh 2 "for loop over a literal list checks each value" "$W" <<'CMD'
for f in a b; do echo x > @R@/$f; done
CMD
runh 0 "for loop over worktree names stays allowed" "$R" <<'CMD'
for wt in wt1; do git -C .claude/worktrees/$wt rebase origin/main; done
CMD
runh 2 "for loop whose second value is the checkout" "$W" <<'CMD'
for d in @R@/.claude/worktrees/wt1 @R@; do git -C "$d" commit -m x; done
CMD
runh 2 "if branch is checked" "$W" <<'CMD'
if true; then echo x > @R@/f; fi
CMD
runh 2 "case branch is checked" "$W" <<'CMD'
case x in x) git -C @R@ commit -m x;; *) echo "a > b";; esac
CMD
runh 0 "arithmetic for loop" "$R" <<'CMD'
for ((i=0; i<3; i++)); do echo $i; done
CMD
runh 2 "function body is checked" "$W" <<'CMD'
f() { git -C @R@ commit -m x; }; f
CMD
runh 0 "a cd inside a function body does not leak out" "$W" <<'CMD'
f() { cd @R@; }; git commit -m x
CMD

# git
runh 2 "git -C applied in turn" "$T" <<'CMD'
git -C @W@ -C app commit -m x
CMD
runh 2 "git --git-dir and --work-tree" "$W" <<'CMD'
git --git-dir=@R@/.git --work-tree=@R@ commit -m x
CMD
runh 2 "git -c before -C" "$W" <<'CMD'
git -c core.editor=true -C @R@ rebase --continue
CMD
runh 2 "GIT_DIR and GIT_WORK_TREE prefix" "$W" <<'CMD'
GIT_DIR=@R@/.git GIT_WORK_TREE=@R@ git checkout main
CMD
runh 2 "env wrapper" "$W" <<'CMD'
env GIT_TRACE=1 git -C @R@ commit -m x
CMD
runh 2 "command wrapper" "$W" <<'CMD'
command git -C @R@ commit -m x
CMD
runh 2 "timeout wrapper" "$W" <<'CMD'
timeout 60 git -C @R@ pull
CMD
runh 0 "git stash show" "$W" <<'CMD'
git -C @R@ stash show -p
CMD

# sed, tee, cp, rm
runh 2 "sed -i edits every file operand" "$W" <<'CMD'
sed -i.bak 's/a/b/' @W@/other/f @R@/existing.txt
CMD
runh 0 "sed -i script is not a path" "$R" <<'CMD'
sed -i '' 's/a/b/' @W@/other/f
CMD
runh 0 "sed without -i only reads" "$R" <<'CMD'
sed 's/a/b/' existing.txt > @W@/other/out
CMD
runh 2 "tee writes every file operand" "$W" <<'CMD'
echo x | tee @W@/other/a @R@/b
CMD
runh 2 "cp -t into the checkout" "$W" <<'CMD'
cp -t @R@ @W@/other/a
CMD
runh 2 "brace expansion copy in the checkout" "$R" <<'CMD'
cp existing.txt{,.bak}
CMD
runh 2 "rm a glob in the checkout" "$W" <<'CMD'
rm -f @R@/*.txt
CMD
runh 0 "rm a glob inside a worktree" "$W" <<'CMD'
rm -rf @R@/.claude/worktrees/wt1/*
CMD
runh 2 "rm a glob over the checkout's .claude folder" "$W" <<'CMD'
rm -rf @R@/.claude/*
CMD
runh 0 "a glob followed by .. is skipped (fails open)" "$W" <<'CMD'
rm -rf @R@/.claude/worktrees/w*/../../x
CMD

# Child shells and eval
runh 2 "sh -c" "$W" <<'CMD'
sh -c "cd @R@ && git commit -m x"
CMD
runh 2 "bash -lc in single quotes" "$W" <<'CMD'
bash -lc 'git -C @R@ reset --hard'
CMD
runh 0 "bash -c inside a worktree" "$R" <<'CMD'
bash -c 'cd @R@/.claude/worktrees/wt1 && git commit -m x'
CMD
runh 2 "bash -c sees a variable set before it" "$W" <<'CMD'
export D=@R@; bash -c 'echo x > $D/f'
CMD
runh 2 "nested bash -c" "$W" <<'CMD'
bash -c "bash -c 'git -C @R@ commit -m x'"
CMD
runh 2 "heredoc piped into bash" "$W" <<'CMD'
bash <<'EOF'
git -C @R@ commit -m x
EOF
CMD
runh 2 "eval through a variable" "$W" <<'CMD'
C="git -C @R@ commit -m x"; eval "$C"
CMD
runh 2 "cd inside eval persists" "$W" <<'CMD'
eval "cd @R@"; git commit -m x
CMD
# shellcheck disable=SC2088 # a literal ~/ in a tool argument, which the hook expands
run 2 "Write through ~ and a symlinked folder" "$W" "$(file_in "~/app-link/new.txt")" Write

# .claude/builds/ is a writable folder here (CLAUDE_PROTECTED_WRITABLE), as a gitignored one would be, so file
# writes there pass. Its siblings, a .. escape out of it and git run from inside it (which acts on the checkout
# itself) still block.
run 0 "Write under .claude/builds" "$R" "$(file_in "$R/.claude/builds/slug/graph.json")" Write
runh 0 "redirect under .claude/builds" "$W" <<'CMD'
echo '{}' > @R@/.claude/builds/slug/graph.json
CMD
runh 0 "mkdir -p then cat > graph.json under .claude/builds, from the repo root" "$R" <<'CMD'
mkdir -p .claude/builds/content-v1-followups && cat > .claude/builds/content-v1-followups/graph.json <<'EOF'
{ "prd": "ENG-4790", "cap": 3, "nodes": [] }
EOF
CMD
runh 0 "jq rewrite to a .tmp, then mv over graph.json" "$R" <<'CMD'
G=.claude/builds/content-v1-followups/graph.json && jq '.cap=4' $G > $G.tmp && mv $G.tmp $G
CMD
runh 0 "rm an old build folder" "$W" <<'CMD'
rm -rf @R@/.claude/builds/old-slug
CMD
runh 0 "rm a glob of build folders" "$W" <<'CMD'
rm -rf @R@/.claude/builds/*
CMD
run 2 "Write a sibling of .claude/builds: .claude/settings.json" "$W" "$(file_in "$R/.claude/settings.json")" Write
runh 2 "redirect into .claude/settings.json" "$W" <<'CMD'
echo '{}' > @R@/.claude/settings.json
CMD
runh 2 "redirect into a folder that only starts with builds" "$W" <<'CMD'
echo x > @R@/.claude/builds-old/x.txt
CMD
run 2 "Write through a .. escape out of .claude/builds" "$W" "$(file_in "$R/.claude/builds/../x.txt")" Write
runh 2 "redirect through a .. escape out of .claude/builds" "$W" <<'CMD'
echo x > @R@/.claude/builds/../x.txt
CMD
runh 2 "git run from inside .claude/builds acts on the checkout" "$W" <<'CMD'
cd @R@/.claude/builds/old-slug && git checkout -b foo
CMD
runh 2 "git -C into .claude/builds" "$W" <<'CMD'
git -C @R@/.claude/builds commit -m x
CMD

# Review round: each counterexample from the parser review, and each fix.
# Bounded work: the later git reset is still reached, except past the evaluation budget.
run 2 "a variable doubled 24 times stays bounded" "$R" "$(bash_in "$(perl -e 'print q{x=a; }, q{x=$x$x; } x 24, q{git reset --hard}')")"
run 2 "40,000 letters in \$(( )) are scanned once" "$R" "$(bash_in "$(perl -e 'print q{echo $((}, q{a} x 40000, q{)); git reset --hard}')")"
run 2 "40,000 [ characters in a path are scanned once" "$R" "$(bash_in "$(perl -e 'print q{rm }, q{[} x 40000, q{; git reset --hard}')")"
runh 2 "an index assignment and \${NAME} still lex as before" "$W" <<'CMD'
D=@R@; a[1]=x; b[2]+=y; echo x > ${D}/f
CMD
run 0 "five nested 32-word loops stop at the evaluation budget and pass" "$R" "$(bash_in "$(perl -e 'my $w = join q{ }, (q{a}) x 32; print map({ qq{for v$_ in $w; do } } 1 .. 5), q{:}, q{; done} x 5, q{; git reset --hard}')")"
# Letter case: macOS's file system ignores it.
run 2 "Write through another letter case of the checkout" "$W" "$(file_in "$W/APP/existing.txt")" Write
run 2 "Edit through another letter case of a folder inside" "$W" "$(file_in "$R/CONFIG/rules/pr-review.md")" Edit
runh 2 "redirect through another letter case" "$W" <<'CMD'
echo x > @W@/APP/new.txt
CMD
runh 0 "a worktree through another letter case stays allowed" "$W" <<'CMD'
echo x > @R@/.claude/WORKTREES/wt1/x.txt
CMD
runh 2 "the hatch name in another letter case" "$W" <<'CMD'
touch ~/.claude/Allow-Main-Checkout-Edits
CMD
# mv takes its sources out of the checkout; touch writes.
runh 2 "mv a file out of the checkout" "$W" <<'CMD'
mv @R@/existing.txt /tmp/existing.txt
CMD
runh 2 "mv -t with a source in the checkout" "$W" <<'CMD'
mv -t /tmp @R@/existing.txt
CMD
runh 0 "mv a file out of a worktree" "$W" <<'CMD'
mv @R@/.claude/worktrees/wt1/a.txt /tmp/a.txt
CMD
run 0 "rm a symlink into the checkout removes only the link" "$W" "$(bash_in "rm $T/links/pr-review.md")"
runh 0 "mv a symlink to the checkout moves only the link" "$W" <<'CMD'
mv ~/app-link /tmp/app-link
CMD
runh 2 "rm -rf through a symlink with a trailing slash" "$W" <<'CMD'
rm -rf ~/app-link/
CMD
runh 2 "rm a file inside a symlinked folder" "$W" <<'CMD'
rm ~/app-link/existing.txt
CMD
runh 2 "touch a new file in the checkout" "$W" <<'CMD'
touch @R@/new
CMD
runh 0 "touch -t takes a stamp, not a file" "$R" <<'CMD'
touch -t 202601010000 @W@/other/stamp.txt
CMD
# GIT_DIR and GIT_WORK_TREE set before the git command.
runh 2 "exported GIT_DIR and GIT_WORK_TREE" "$SCR" <<'CMD'
export GIT_DIR=@R@/.git GIT_WORK_TREE=@R@; git reset --hard
CMD
runh 2 "GIT_WORK_TREE assigned earlier" "$SCR" <<'CMD'
GIT_WORK_TREE=@R@; git status; git checkout -- .
CMD
runh 0 "exported GIT_DIR and GIT_WORK_TREE for a worktree" "$SCR" <<'CMD'
export GIT_DIR=@R@/.claude/worktrees/wt1/.git GIT_WORK_TREE=@R@/.claude/worktrees/wt1; git reset --hard
CMD
# Pipelines and background jobs run in subshells.
runh 2 "cd in a pipeline does not persist" "$R" <<'CMD'
cd /tmp | cat; git reset --hard
CMD
runh 2 "cd in the last pipeline element does not persist" "$R" <<'CMD'
echo | cd /tmp; git reset --hard
CMD
runh 2 "cd in a background job does not persist" "$R" <<'CMD'
cd /tmp & git reset --hard
CMD
runh 0 "a variable set in a pipeline does not persist" "$W" <<'CMD'
D=@R@ | cat; echo x > $D/f
CMD
runh 2 "a write in a background job still blocks" "$W" <<'CMD'
echo x > @R@/f &
CMD
# Heredoc terminators and syntax errors.
runh 2 "a \$'...' heredoc terminator is decoded" "$R" <<'CMD'
cat <<$'E\x4fF'
text
EOF
git reset --hard
CMD
runh 2 "a syntax error on a later line still checks the lines before it" "$R" <<'CMD'
git reset --hard
echo 'unterminated
CMD
runh 0 "a syntax error on the same line stops the whole line" "$R" <<'CMD'
git reset --hard; echo 'unterminated
CMD
# Functions run when they are called.
runh 0 "a function that is never called" "$R" <<'CMD'
cleanup() { git reset --hard; }; echo ok
CMD
runh 2 "a function that is called" "$R" <<'CMD'
cleanup() { git reset --hard; }; cleanup
CMD
runh 0 "a function that calls itself stops" "$R" <<'CMD'
f() { f; }; f
CMD
runh 0 "a cd inside a called function persists" "$R" <<'CMD'
f() { cd /tmp; }; f; git reset --hard
CMD
runh 0 "a function named git runs instead of git" "$R" <<'CMD'
git() { echo "would run git $*"; }; git reset --hard
CMD
runh 2 "unset -f drops the function" "$R" <<'CMD'
git() { echo hi; }; unset -f git; git reset --hard
CMD
runh 2 "command runs the program, not the function" "$R" <<'CMD'
git() { echo hi; }; command git reset --hard
CMD
# git forms that change nothing.
runh 0 "git commit --help" "$R" <<'CMD'
git commit --help
CMD
runh 0 "git reset -h" "$R" <<'CMD'
git reset -h
CMD
runh 0 "git --help commit" "$R" <<'CMD'
git --help commit
CMD
runh 0 "git clean -nd" "$R" <<'CMD'
git clean -nd
CMD
runh 0 "git clean --dry-run -x" "$R" <<'CMD'
git clean --dry-run -x
CMD
runh 2 "git clean -fd" "$R" <<'CMD'
git clean -fd
CMD
runh 2 "git clean -fen: n is the pattern for -e" "$R" <<'CMD'
git clean -fen
CMD
runh 0 "git apply --check" "$R" <<'CMD'
git apply --check /tmp/change.patch
CMD
runh 0 "git apply --stat and --numstat" "$R" <<'CMD'
git apply --stat --numstat /tmp/change.patch
CMD
runh 2 "git apply --check --index" "$R" <<'CMD'
git apply --check --index /tmp/change.patch
CMD
runh 2 "git apply --stat --apply" "$R" <<'CMD'
git apply --stat --apply /tmp/change.patch
CMD
runh 2 "git apply" "$R" <<'CMD'
git apply /tmp/change.patch
CMD
runh 0 "git add -n" "$R" <<'CMD'
git add -n .
CMD
runh 0 "git add --dry-run -A" "$R" <<'CMD'
git add --dry-run -A
CMD
runh 0 "git mv -n" "$R" <<'CMD'
git mv -n a b
CMD
runh 0 "git rm --dry-run -r" "$R" <<'CMD'
git rm --dry-run -r x
CMD
runh 0 "git commit --dry-run" "$R" <<'CMD'
git commit --dry-run
CMD
runh 2 "git commit -n skips hooks and still commits" "$R" <<'CMD'
git commit -n -m x
CMD
runh 2 "git add -- -n adds a file named -n" "$R" <<'CMD'
git add -- -n
CMD
# Documented limits: these behave as listed in the hook's header.
runh 0 "documented limit: python writing a file" "$R" <<'CMD'
python3 -c "open('x', 'w').write('x')"
CMD
runh 0 "documented limit: sed's w command" "$R" <<'CMD'
sed -n 'w out.txt' existing.txt
CMD
runh 0 "documented limit: git config" "$R" <<'CMD'
git config user.name X
CMD
runh 0 "documented limit: a cd after false && still counts" "$R" <<'CMD'
false && cd /tmp; git reset --hard
CMD
runh 2 "documented limit: a cd into the checkout after false && still counts" "$SCR" <<'CMD'
false && cd @R@; echo x > unrelated.txt
CMD
runh 2 "documented limit: any mention of the hatch name blocks" "$W" <<'CMD'
rg allow-main-checkout-edits .
CMD

# The repo config: what is protected comes from repoPath, worktreesDir and fleet.mainCheckoutWritableDirs when the
# environment does not say. runc runs with a config and no CLAUDE_PROTECTED_* variable.
# runc <expected exit> <label> <config json> <cwd> <json tool_input> [tool name] [hook]
runc() {
  local want="$1" label="$2" conf="$3" cwd="$4" tin="$5" tool="${6:-Bash}" hook="${7:-$HOOK}" got
  printf '%s\n' "$conf" >"$T/config.json"
  jq -nc --arg t "$tool" --arg c "$cwd" --argjson i "$tin" '{tool_name: $t, cwd: $c, tool_input: $i}' |
    env -u CLAUDE_PROTECTED_CHECKOUTS -u CLAUDE_PROTECTED_WORKTREES -u CLAUDE_PROTECTED_WRITABLE HOME="$T/home" \
      AGENT_QUEUE_CONFIG="$T/config.json" CLAUDE_ALLOW_MAIN_CHECKOUT= "$HOOK_SHELL" "$hook" >/dev/null 2>"$T/err"
  got=$?
  if [ "$got" = "$want" ]; then
    PASSES=$((PASSES + 1)); printf 'PASS  config: %s\n' "$label"
  else
    FAILS=$((FAILS + 1)); printf 'FAIL  config: %s (exit %s, wanted %s)\n' "$label" "$got" "$want"; sed 's/^/      /' "$T/err"
  fi
}
# err_has <label> <text>: the last run's stderr holds the text.
err_has() {
  if grep -qF -- "$2" "$T/err"; then
    PASSES=$((PASSES + 1)); printf 'PASS  %s\n' "$1"
  else
    FAILS=$((FAILS + 1)); printf 'FAIL  %s (stderr lacks: %s)\n' "$1" "$2"; sed 's/^/      /' "$T/err"
  fi
}
C_ROOT="$(jq -nc --arg r "$R" '{repoPath: $r}')"
runc 2 "repoPath protects the checkout" "$C_ROOT" "$W" "$(file_in "$R/new.txt")" Write
runc 0 "repoPath leaves the default worktree folder open" "$C_ROOT" "$W" "$(file_in "$R/.claude/worktrees/wt1/x.txt")" Write
runc 2 "no writable folder is open unless the config names one" "$C_ROOT" "$W" "$(file_in "$R/.claude/builds/slug/graph.json")" Write
runc 2 "repoPath blocks git in the checkout" "$C_ROOT" "$R" "$(bash_in "git reset --hard")"
runc 0 "repoPath leaves paths outside the checkout alone" "$C_ROOT" "$W" "$(file_in "$W/other/x.txt")" Write
runc 2 "repoPath with ~ is under HOME, through a symlink" '{"repoPath": "~/app-link"}' "$W" "$(file_in "$R/new.txt")" Write
runc 2 "a repoPath of two roots split by a colon protects both" "$(jq -nc --arg r "$W/other:$R" '{repoPath: $r}')" "$W" "$(file_in "$R/new.txt")" Write
C_WT="$(jq -nc --arg r "$R" '{repoPath: $r, worktreesDir: "wt/"}')"
mkdir -p "$R/wt/one"
runc 0 "worktreesDir opens its own folder" "$C_WT" "$W" "$(file_in "$R/wt/one/x.txt")" Write
runc 0 "worktreesDir opens git in its folder" "$C_WT" "$W" "$(bash_in "git -C $R/wt/one commit -m x")"
runc 2 "worktreesDir closes the default folder" "$C_WT" "$W" "$(file_in "$R/.claude/worktrees/wt1/x.txt")" Write
runc 2 "worktreesDir does not open a folder that only starts with its name" "$C_WT" "$W" "$(file_in "$R/wt-old/x.txt")" Write
C_WR="$(jq -nc --arg r "$R" '{repoPath: $r, fleet: {mainCheckoutWritableDirs: [".claude/builds", "./tmp/", "..", "/abs", ".", "", 7]}}')"
runc 0 "a writable folder takes file writes" "$C_WR" "$W" "$(file_in "$R/.claude/builds/slug/graph.json")" Write
runc 0 "a writable folder written as ./tmp/ is read as tmp" "$C_WR" "$W" "$(file_in "$R/tmp/x.txt")" Write
runc 2 "git run from inside a writable folder still blocks" "$C_WR" "$W" "$(bash_in "cd $R/.claude/builds/old-slug && git checkout -b foo")"
runc 2 "the entries .., /abs, ., an empty one and a number open nothing" "$C_WR" "$W" "$(file_in "$R/existing.txt")" Edit
runc 2 "a writable entry of . does not open the whole checkout" "$C_WR" "$W" "$(file_in "$R/new.txt")" Write
runc 0 "with no repoPath nothing is protected" '{}' "$W" "$(file_in "$R/new.txt")" Write
runc 0 "with no repoPath even the hatch name passes" '{}' "$W" "$(bash_in "touch ~/.claude/allow-main-checkout-edits")"
runc 0 "a relative repoPath protects nothing" '{"repoPath": "dev/app"}' "$W" "$(file_in "$R/new.txt")" Write
runc 0 "a config that does not parse protects nothing" '{not json' "$W" "$(file_in "$R/new.txt")" Write
runc 2 "the hatch name blocks once a checkout is protected" "$C_ROOT" "$W" "$(bash_in "touch ~/.claude/allow-main-checkout-edits")"
got=$(jq -nc --arg f "$R/new.txt" --arg c "$W" '{tool_name: "Write", cwd: $c, tool_input: {file_path: $f}}' |
  env HOME="$T/home" AGENT_QUEUE_CONFIG="$T/config.json" CLAUDE_PROTECTED_CHECKOUTS="$W/other" "$HOOK_SHELL" "$HOOK" >/dev/null 2>&1; echo $?)
if [ "$got" = 0 ]; then PASSES=$((PASSES + 1)); echo "PASS  config: CLAUDE_PROTECTED_CHECKOUTS wins over repoPath"; else FAILS=$((FAILS + 1)); echo "FAIL  config: CLAUDE_PROTECTED_CHECKOUTS wins over repoPath (exit $got)"; fi

# The messages name the human, the worktree folder and the base branch from the config.
runc 2 "a block from the config" "$(jq -nc --arg r "$R" '{repoPath: $r, worktreesDir: "wt", human: {name: "Alex Example"}, github: {baseBranch: "trunk"}}')" "$W" "$(file_in "$R/new.txt")" Write
err_has "message: names what was blocked" "Blocked: Write on $R/new.txt."
err_has "message: names the human from human.name" "Only Alex Example can lift this guard. If Alex Example asked for this exact change, stop and ask"
err_has "message: the worktree command uses worktreesDir and the base branch" "git -C $R worktree add wt/<slug> -b <branch> origin/trunk"
runc 2 "a hatch block from the config" "$(jq -nc --arg r "$R" '{repoPath: $r, human: {name: "Alex Example"}}')" "$W" "$(bash_in "touch ~/.claude/allow-main-checkout-edits")"
err_has "message: the hatch block names the human" "Blocked: only Alex Example may create the main-checkout escape hatch, from their own terminal. Ask Alex Example."
run 2 "a block with no config" "$W" "$(file_in "$R/new.txt")" Write
err_has "message: with no config it says the human" "Only the human can lift this guard."
err_has "message: with no config the worktree command uses the defaults" "git -C $R worktree add .claude/worktrees/<slug> -b <branch> origin/main"

# The repo's own config, found from the hook's real location: a copy of the hook in a repo of its own, run
# directly and through a symlink to the hook file.
mkdir -p "$T/repo/fleet/hooks"
cp "$(dirname "$HOOK")/protect-main-checkout.sh" "$(dirname "$HOOK")/protect-main-checkout-parse.pl" "$T/repo/fleet/hooks/"
jq -nc --arg r "$R" '{repoPath: $r, human: {name: "Repo Human"}}' >"$T/repo/agent-queue.config.json"
ln -s "$T/repo/fleet/hooks/protect-main-checkout.sh" "$T/links/hook.sh"
for hook in "$T/repo/fleet/hooks/protect-main-checkout.sh" "$T/links/hook.sh"; do
  printf '{"tool_name": "Write", "cwd": "%s", "tool_input": {"file_path": "%s/new.txt"}}\n' "$W" "$R" |
    env -u AGENT_QUEUE_CONFIG -u CLAUDE_PROTECTED_CHECKOUTS -u CLAUDE_PROTECTED_WORKTREES -u CLAUDE_PROTECTED_WRITABLE \
      HOME="$T/home" "$HOOK_SHELL" "$hook" >/dev/null 2>"$T/err"
  got=$?
  if [ "$got" = 2 ]; then PASSES=$((PASSES + 1)); echo "PASS  repo config: $hook blocks the checkout"; else FAILS=$((FAILS + 1)); echo "FAIL  repo config: $hook blocks the checkout (exit $got)"; fi
  err_has "repo config: $hook names the human from the repo's config" "Only Repo Human can lift this guard."
done

# Escape hatch
touch "$T/home/.claude/allow-main-checkout-edits"
run 0 "hatch file present allows a Write" "$W" "$(file_in "$R/new.txt")" Write
rm -f "$T/home/.claude/allow-main-checkout-edits"
got=$(jq -nc --arg f "$R/new.txt" --arg c "$W" '{tool_name: "Write", cwd: $c, tool_input: {file_path: $f}}' |
  env HOME="$T/home" AGENT_QUEUE_CONFIG="$T/no-config.json" CLAUDE_PROTECTED_CHECKOUTS="$R" CLAUDE_ALLOW_MAIN_CHECKOUT=1 "$HOOK_SHELL" "$HOOK" >/dev/null 2>&1; echo $?)
if [ "$got" = 0 ]; then PASSES=$((PASSES + 1)); echo "PASS  CLAUDE_ALLOW_MAIN_CHECKOUT=1 allows a Write"; else FAILS=$((FAILS + 1)); echo "FAIL  CLAUDE_ALLOW_MAIN_CHECKOUT=1 allows a Write (exit $got)"; fi

echo
echo "RESULT: $PASSES passed, $FAILS failed"
[ "$FAILS" = 0 ]
