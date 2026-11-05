#!/usr/bin/env bash
# ask-human.sh: the one inbox for anything waiting on the human the queue works for, kept in Linear.
#
# Every session, fleet worker and machine calls this instead of stopping to ask in its own
# conversation. An ask adds the needs-human label to a ticket and posts a fixed-format comment; the human
# works through a "Needs <name>" view in Linear, answers in a comment and removes the label. An ask
# that is not about a ticket gets its own issue in the linear.inboxProject project.
#
# Usage:
#   ask-human.sh ask [ENG-123] --type decision|merge|blocked --ask "question"
#                [--blocked-on "what is stuck"] [--recommend "your pick"]
#                [--default "what happens with no answer"] [--deadline "tomorrow 9am"] [--from "who is asking"]
#   ask-human.sh check ENG-123      prints ANSWERED with the answer, or WAITING with the age
#   ask-human.sh wait ENG-123 [--every SECS] [--max-hours H]
#                                   checks every 5 minutes until the ask is answered, then prints the answer;
#                                   a worker runs it in the background so it is woken when the human answers
#   ask-human.sh slack ENG-123      posts the open ask to the queue's Slack channel as a thread synced to the ticket
#   ask-human.sh sweep              for the dispatcher's tick: posts open asks not yet in Slack, and clears
#                                   the needs-human label from answered ones
#   ask-human.sh list               every open item: type, ticket, waiting, from, ask
#   ask-human.sh summary            one line for a SessionStart hook; silent when empty
#
# Needs: node (for the config and the Linear key, see lib/config.mjs), curl, jq. The key acts as the human, so
# Linear does not push-notify them about asks. Slack does: on a machine with the bot token (slack.botTokenFile),
# every ask is posted to slack.channel, and that Slack thread is synced to the ticket, so a reply in the thread
# lands on the ticket as a comment and counts as the answer. Prints the ticket URL after an ask.
set -euo pipefail

die() { printf 'ask-human: %s\n' "$1" >&2; exit "${2:-1}"; }

# The repo root, from this script's real path (it may be symlinked into ~/.claude/scripts).
src=$0
while [ -L "$src" ]; do
  d=$(cd -P "$(dirname "$src")" && pwd)
  src=$(readlink "$src")
  case $src in /*) ;; *) src="$d/$src" ;; esac
done
SELF="$(cd -P "$(dirname "$src")" && pwd)/$(basename "$src")"
ROOT="$(cd "$(dirname "$SELF")/.." && pwd)"

command -v jq >/dev/null || die "jq is missing (brew install jq)" 3
command -v node >/dev/null || die "node is missing" 3
ENV_LINES=$(node "$ROOT/lib/config.mjs" env) || die "could not read the config (see agent-queue.config.example.json)" 3
while IFS='=' read -r k v; do printf -v "$k" '%s' "$v"; done <<<"$ENV_LINES"

HUMAN=${AQ_HUMAN_NAME:-the human}
MARK="**Needs $HUMAN:"
LABEL=${AQ_LINEAR_LABELS_NEEDS_HUMAN:-needs-human}
INBOX_PROJECT=${AQ_LINEAR_INBOX_PROJECT:-$HUMAN Inbox}
TEAM_KEY=${ASK_HUMAN_TEAM:-${AQ_LINEAR_TEAM:-}}
SLACK_TOKEN_FILE=${ASK_HUMAN_SLACK_TOKEN_FILE:-${AQ_SLACK_BOT_TOKEN_FILE:-${AQ_PATHS_STATE_DIR:-$HOME/.agent-queue}/slack-bot-token}}
SLACK_CHANNEL=${ASK_HUMAN_SLACK_CHANNEL:-${AQ_SLACK_CHANNEL:-}}
SLACK_DOMAIN=${ASK_HUMAN_SLACK_DOMAIN:-${AQ_SLACK_DOMAIN:-}}
KEY=$(node "$ROOT/lib/config.mjs" linear-key 2>/dev/null) \
  || die "could not read the Linear API key; set LINEAR_API_KEY, linear.apiKeyCommand or linear.apiKeyFile" 3

gql() { # query-json -> data, dies on GraphQL errors
  local out
  out=$(curl -sS --max-time "${ASK_HUMAN_TIMEOUT:-20}" -X POST https://api.linear.app/graphql \
    -H "Authorization: $KEY" -H 'Content-Type: application/json' -d "$1") || die "Linear API unreachable"
  if jq -e '.errors' >/dev/null <<<"$out"; then die "Linear error: $(jq -c '.errors[0].message' <<<"$out")"; fi
  jq '.data' <<<"$out"
}

gql_jq() { # jq args -> data. bash 3.2, the only bash on a stock Mac, mangles a brace-and-comma jq program inside "$(...)".
  local q
  q=$(jq -nc "$@")
  gql "$q"
}

label_id() {
  gql_jq --arg l "$LABEL" '{query:"query($l:String!){ issueLabels(filter:{name:{eq:$l}}){nodes{id}} }", variables:{l:$l}}' | jq -r '.issueLabels.nodes[0].id // empty'
}

open_asks() { # the open tickets carrying the needs-human label, with the given fields
  gql_jq --arg l "$LABEL" --arg f "$1" '{query:("query($l:String!){ issues(first:100, filter:{labels:{name:{eq:$l}}, state:{type:{nin:[\"completed\",\"canceled\"]}}}){ nodes{ " + $f + " } } }"), variables:{l:$l}}'
}

age() { # ISO timestamp -> "3h", "2d"
  local then now s
  then=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${1%%.*}" +%s 2>/dev/null || date -u -d "$1" +%s)
  now=$(date -u +%s); s=$((now - then))
  if [ $s -lt 3600 ]; then echo "$((s / 60))m"; elif [ $s -lt 86400 ]; then echo "$((s / 3600))h"; else echo "$((s / 86400))d"; fi
}

cmd_ask() {
  local ticket="" type="" ask="" blocked="" rec="" dflt="" deadline="" from=""
  if [ $# -gt 0 ] && [[ $1 != --* ]]; then ticket=$1; shift; fi
  while [ $# -gt 0 ]; do
    case $1 in
      --type) type=$2; shift 2 ;;
      --ask) ask=$2; shift 2 ;;
      --blocked-on) blocked=$2; shift 2 ;;
      --recommend) rec=$2; shift 2 ;;
      --default) dflt=$2; shift 2 ;;
      --deadline) deadline=$2; shift 2 ;;
      --from) from=$2; shift 2 ;;
      *) die "unknown option $1" 2 ;;
    esac
  done
  [ -n "$ask" ] || die "--ask is required" 2
  case $type in
    decision) heading="Decision" ;;
    merge) heading="Approve merge" ;;
    blocked) heading="Blocked" ;;
    *) die "--type must be decision, merge or blocked" 2 ;;
  esac
  if [ -z "$from" ]; then
    from="${ASK_HUMAN_FROM:-$(hostname -s), $(basename "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"), $(basename "$PWD")}"
  fi

  local body="$MARK $heading** (from $from)"$'\n'
  [ -n "$blocked" ] && body+=$'\n'"**Blocked on:** $blocked"
  body+=$'\n'"**Question:** $ask"
  [ -n "$rec" ] && body+=$'\n'"**Recommend:** $rec"
  if [ -n "$dflt" ]; then
    if [ -n "$deadline" ]; then body+=$'\n'"**If no answer by $deadline:** $dflt"; else body+=$'\n'"**If no answer:** $dflt"; fi
  fi
  body+=$'\n\n'"_Answer in a comment, then remove the $LABEL label._"

  local lid issue_id url
  lid=$(label_id); [ -n "$lid" ] || die "label $LABEL not found in Linear"
  if [ -n "$ticket" ]; then
    local d
    d=$(gql_jq --arg id "$ticket" '{query:"query($id:String!){ issue(id:$id){ id url } }", variables:{id:$id}}')
    issue_id=$(jq -r '.issue.id // empty' <<<"$d"); url=$(jq -r '.issue.url // empty' <<<"$d")
    [ -n "$issue_id" ] || die "ticket $ticket not found" 2
    gql_jq --arg i "$issue_id" --arg l "$lid" '{query:"mutation($i:String!,$l:String!){ issueAddLabel(id:$i, labelId:$l){ success } }", variables:{i:$i,l:$l}}' >/dev/null
  else
    local meta team proj me title
    meta=$(gql_jq --arg k "$TEAM_KEY" --arg p "$INBOX_PROJECT" '{query:"query($k:String!,$p:String!){ viewer{id} teams(filter:{key:{eq:$k}}){nodes{id}} projects(filter:{name:{eq:$p}}){nodes{id}} }", variables:{k:$k,p:$p}}')
    team=$(jq -r '.teams.nodes[0].id // empty' <<<"$meta"); proj=$(jq -r '.projects.nodes[0].id // empty' <<<"$meta"); me=$(jq -r '.viewer.id' <<<"$meta")
    [ -n "$team" ] && [ -n "$proj" ] || die "team $TEAM_KEY or project $INBOX_PROJECT not found"
    title="[$heading] ${ask:0:90}"
    local c
    c=$(gql_jq --arg t "$team" --arg p "$proj" --arg l "$lid" --arg me "$me" --arg title "$title" \
      '{query:"mutation($t:String!,$p:String!,$l:String!,$me:String!,$title:String!){ issueCreate(input:{teamId:$t, projectId:$p, labelIds:[$l], assigneeId:$me, title:$title, description:\"Filed by ask-human.sh. The ask is in the first comment.\"}){ issue{ id url } } }", variables:{t:$t,p:$p,l:$l,me:$me,title:$title}}')
    issue_id=$(jq -r '.issueCreate.issue.id' <<<"$c"); url=$(jq -r '.issueCreate.issue.url' <<<"$c")
  fi
  gql_jq --arg i "$issue_id" --arg b "$body" '{query:"mutation($i:String!,$b:String!){ commentCreate(input:{issueId:$i, body:$b}){ success } }", variables:{i:$i,b:$b}}' >/dev/null
  # Best effort: an ask never fails over Slack, and the dispatcher's sweep posts anything missed here.
  if [ -s "$SLACK_TOKEN_FILE" ]; then (cmd_slack "$issue_id") >/dev/null 2>&1 || true; fi
  echo "$url"
  # stderr, so callers that read the URL from stdout are unaffected
  printf 'To be woken with the answer, run this as its own Bash command with run_in_background: true, with no &, subshell or redirect: %s wait %s\n' "$SELF" "${url#*/issue/}" | sed -E 's#(wait [A-Z0-9]+-[0-9]+)/.*#\1#' >&2
}

cmd_slack() { # posts the ticket's open ask to Slack as a thread synced to the ticket; a no-op once it is there
  [ $# -eq 1 ] || die "usage: ask-human.sh slack ENG-123" 2
  [ -s "$SLACK_TOKEN_FILE" ] || die "no Slack bot token at $SLACK_TOKEN_FILE on this machine" 3
  [ -n "$SLACK_CHANNEL" ] && [ -n "$SLACK_DOMAIN" ] || die "slack.channel and slack.domain must be set in the config" 3
  local d text resp ts url
  d=$(gql_jq --arg id "$1" '{query:"query($id:String!){ issue(id:$id){ id identifier title url comments(first:100){nodes{body createdAt}} attachments(first:50){nodes{url createdAt}} } }", variables:{id:$id}}')
  [ "$(jq -r '.issue.id // empty' <<<"$d")" ] || die "ticket $1 not found" 2
  text=$(jq -r --arg m "$MARK" --arg ch "$SLACK_CHANNEL" '
    .issue as $i
    | ([$i.comments.nodes[] | select(.body | startswith($m))] | sort_by(.createdAt) | last) as $ask
    | if $ask == null then "NO_ASK"
      elif any($i.attachments.nodes[]; (.url | contains("/archives/" + $ch + "/")) and .createdAt > $ask.createdAt) then "IN_SLACK"
      else "<\($i.url)|\($i.identifier)> \($i.title)\n" + ($ask.body | split("\n\n_Answer in")[0] | gsub("\\*\\*"; "*"))
        + "\n_Reply in this thread to answer. Your reply lands on the ticket as a comment._" end' <<<"$d")
  case $text in
    NO_ASK) die "no open ask on $1" 2 ;;
    IN_SLACK) echo "already in Slack"; return 0 ;;
  esac
  local payload
  payload=$(jq -nc --arg c "$SLACK_CHANNEL" --arg t "$text" '{channel:$c, text:$t, unfurl_links:false, unfurl_media:false}')
  resp=$(curl -sS --max-time 20 -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $(cat "$SLACK_TOKEN_FILE")" -H 'Content-Type: application/json; charset=utf-8' \
    -d "$payload") \
    || die "Slack unreachable"
  [ "$(jq -r .ok <<<"$resp")" = true ] || die "Slack error: $(jq -r .error <<<"$resp")"
  ts=$(jq -r .ts <<<"$resp")
  url="https://$SLACK_DOMAIN.slack.com/archives/$SLACK_CHANNEL/p${ts//./}"
  gql_jq --arg i "$(jq -r .issue.id <<<"$d")" --arg u "$url" --arg title "Needs $HUMAN thread" '{query:"mutation($i:String!,$u:String!,$title:String!){ attachmentLinkSlack(issueId:$i, url:$u, title:$title, syncToCommentThread:true){ success } }", variables:{i:$i,u:$u,title:$title}}' >/dev/null
  echo "$url"
}

cmd_wait() { # checks until the ask is answered, then prints the answer; meant for Bash run_in_background
  [ $# -ge 1 ] || die "usage: ask-human.sh wait ENG-123 [--every SECS] [--max-hours H]" 2
  local id=$1 every=300 max=24 r start
  shift
  while [ $# -gt 0 ]; do
    case $1 in
      --every) every=$2; shift 2 ;;
      --max-hours) max=$2; shift 2 ;;
      *) die "unknown option $1" 2 ;;
    esac
  done
  start=$(date +%s)
  while :; do
    r=$( (cmd_check "$id") 2>&1 ) || r="check failed, retrying: $r"
    case $r in
      ANSWERED*) printf '%s\n' "$r"; return 0 ;;
      "NO ASK"*) printf '%s\n' "$r"; return 2 ;;
    esac
    if [ $(($(date +%s) - start)) -ge $((max * 3600)) ]; then printf 'Still not answered after %sh: %s\n' "$max" "$r"; return 1; fi
    sleep "$every"
  done
}

cmd_sweep() { # for the dispatcher's tick: clear the needs-human label from answered asks, post unposted ones to Slack
  local lid ids id r
  lid=$(label_id)
  ids=$(open_asks identifier | jq -r '.issues.nodes[].identifier')
  for id in $ids; do
    r=$( (cmd_check "$id") 2>&1 ) || { echo "$id: could not check ($r)"; continue; }
    case $r in
      ANSWERED*)
        if (gql_jq --arg i "$id" --arg l "$lid" '{query:"mutation($i:String!,$l:String!){ issueRemoveLabel(id:$i, labelId:$l){ success } }", variables:{i:$i,l:$l}}' >/dev/null); then
          echo "$id: answered, $LABEL removed"
        fi ;;
      WAITING*)
        if [ -s "$SLACK_TOKEN_FILE" ]; then
          if r=$( (cmd_slack "$id") 2>&1 ); then [ "$r" = "already in Slack" ] || echo "$id: posted to Slack $r"; else echo "$id: could not post to Slack ($r)"; fi
        fi ;;
    esac
  done
}

cmd_check() {
  [ $# -eq 1 ] || die "usage: ask-human.sh check ENG-123" 2
  local d
  d=$(gql_jq --arg id "$1" '{query:"query($id:String!){ issue(id:$id){ identifier labels{nodes{name}} comments(first:100){nodes{body createdAt}} } }", variables:{id:$id}}')
  [ "$(jq -r '.issue.identifier // empty' <<<"$d")" ] || die "ticket $1 not found" 2
  jq -r --arg m "$MARK" --arg label "$LABEL" '
    .issue as $i
    | ($i.labels.nodes | map(.name) | index($label)) as $open
    | ($i.comments.nodes | sort_by(.createdAt)) as $cs
    | ([$cs[] | select(.body | startswith($m))] | last) as $ask
    | if $ask == null then "NO ASK on \($i.identifier)"
      else
        # Linear opens a synced Slack thread with its own note; that note is not an answer.
        ([$cs[] | select(.createdAt > $ask.createdAt and (.body | startswith($m) | not)
          and (.body | startswith("This comment thread is synced") | not))]) as $answers
        | if ($answers | length) > 0 then "ANSWERED\n" + ($answers | map(.body) | join("\n---\n"))
          elif $open == null then "ANSWERED (label removed, no comment)"
          else "WAITING since \($ask.createdAt)" end
      end' <<<"$d"
}

cmd_list() {
  local d
  d=$(open_asks 'identifier url comments(first:100){nodes{body createdAt}}')
  jq -r --arg m "$MARK" '
    .issues.nodes[]
    | . as $i
    | ([$i.comments.nodes[] | select(.body | startswith($m))] | sort_by(.createdAt) | last) as $a
    | select($a != null)
    | [ ($a.body | ltrimstr($m) | capture("^ (?<t>[^*]+)\\*\\*").t),
        $i.identifier,
        $a.createdAt,
        ($a.body | capture("\\(from (?<f>[^)]*)\\)").f // "?"),
        ($a.body | capture("\\*\\*Question:\\*\\* (?<q>[^\n]*)").q // "") ]
    | @tsv' <<<"$d" | sort -t$'\t' -k3 | while IFS=$'\t' read -r type id created from question; do
      printf '%-14s %-10s %-5s %-34.34s %s\n' "$type" "$id" "$(age "$created")" "$from" "${question:0:80}"
    done
}

cmd_summary() { # one line for a SessionStart hook; silent when the inbox is empty
  local rows n oldest
  rows=$(cmd_list)
  [ -n "$rows" ] || return 0
  n=$(printf '%s\n' "$rows" | wc -l | tr -d ' ')
  oldest=$(printf '%s\n' "$rows" | head -1 | awk '{for (i = 1; i <= NF; i++) if ($i ~ /^[A-Z][A-Z0-9]*-[0-9]+$/) { print $(i + 1); exit }}')
  echo "[Inbox] $n item(s) waiting on $HUMAN in Linear's \"Needs $HUMAN\" view (oldest $oldest). ask-human.sh list shows them."
}

case "${1:-}" in
  ask) shift; cmd_ask "$@" ;;
  check) shift; cmd_check "$@" ;;
  wait) shift; cmd_wait "$@" ;;
  slack) shift; cmd_slack "$@" ;;
  sweep) shift; cmd_sweep ;;
  list) shift; cmd_list ;;
  summary) ASK_HUMAN_TIMEOUT=4 cmd_summary ;;
  *) sed -n '2,26p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
