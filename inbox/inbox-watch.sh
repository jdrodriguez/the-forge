#!/usr/bin/env bash
# inbox-watch.sh: waits for a new item in the human's inbox (ask-human.sh), then prints it and exits.
#
# The always-on orchestrator session runs this with Bash run_in_background, so the session is woken the moment a
# worker, the dispatcher or another session asks the human something. The session then brings the question to them
# with a recommendation, posts their answer as the threaded reply on the ticket (which the asker's
# `ask-human.sh wait` picks up), and starts this again. It costs no Claude tokens while it waits: it only runs
# `ask-human.sh list`.
#
# Usage: inbox-watch.sh [--every SECS] [--max-hours H]
#   Items already open when it starts are the baseline and are not reported again. A new item is any open line
#   (type, ticket, ask) that wasn't in the baseline. Exits 0 with the new lines, or 2 after --max-hours (default 24)
#   with nothing new, so the session can restart it.
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
EVERY=120
MAX_HOURS=24
while [ $# -gt 0 ]; do
  case "$1" in
    --every) EVERY="$2"; shift 2 ;;
    --max-hours) MAX_HOURS="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done

# One key per open item: type, ticket and the start of the ask, without the age column that changes every minute.
keys() { "$DIR/ask-human.sh" list 2>/dev/null | sed -E 's/ +[0-9]+[mhd] +/  /' | cut -c1-200 | sort -u; }

base="$(keys)" || base=""
end=$(( $(date +%s) + MAX_HOURS * 3600 ))
while [ "$(date +%s)" -lt "$end" ]; do
  sleep "$EVERY"
  now="$(keys)" || continue
  new="$(comm -13 <(printf '%s\n' "$base") <(printf '%s\n' "$now") | grep -v '^$')"
  # The needs-human label lingers until the dispatcher's next sweep, so an ask answered moments ago can still be
  # listed. Report only items whose ask `check` says is still waiting.
  if [ -n "$new" ]; then
    waiting=""
    while IFS= read -r line; do
      t="$(printf '%s' "$line" | grep -oE '[A-Z]+-[0-9]+' | head -1)"
      [ -n "$t" ] && "$DIR/ask-human.sh" check "$t" 2>/dev/null | head -1 | grep -q '^ANSWERED' && continue
      waiting="$waiting$line"$'\n'
    done <<< "$new"
    new="$(printf '%s' "$waiting" | grep -v '^$')"
  fi
  if [ -n "$new" ]; then
    echo "NEW in the inbox ($(date '+%F %H:%M')):"
    printf '%s\n' "$new"
    exit 0
  fi
  # Answered items drop out; keep the baseline current so a re-ask on the same ticket counts as new.
  base="$now"
done
echo "no new asks in ${MAX_HOURS}h"
exit 2
