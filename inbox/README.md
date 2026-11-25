# inbox

The orchestrator session's tools: the human's inbox for questions, the watchers that wake the session, and the merge helpers.

| File | What it does |
|---|---|
| `ask-human.sh` | Files a question for the human in Linear and Slack; its `wait` command blocks until the answer comes. |
| `orchestrator-watch.mjs` | The one watcher the orchestrator keeps armed. It runs the watchers below at once and exits with the first event. |
| `inbox-watch.sh`, `merge-request-watch.sh`, `main-red-watch.sh`, `dispatcher-events-watch.mjs`, `pr-sweep.mjs --watch` | The single-purpose watchers. Each exits on the first new thing it sees, or with 2 after 24 quiet hours. |
| `takeover.sh`, `orch.sh` | Hand the orchestrator role to a session (below). |
| `orchestrator.mjs`, `lease.sh`, `orchestrator-watch-guard.sh` | The driver lock, the lease, and the Stop hook. |
| `orchestrator-supervisor.mjs`, `install-supervisor.sh` | Pages the human when work waits and nobody drives. |
| `merge-approved.sh` | Merges approved PRs (below). Runs `merge-approved.mjs`, with its rules in `merge-policy.mjs` and the ledger in `approvals.mjs`. |
| `merge-when-ready.sh <pr>` | Waits up to 75 minutes for a PR to turn mergeable, then runs `merge-approved.sh` on it. |
| `merged-to-verifying.mjs <pr> [owner/name]` | Moves a merged PR's tickets from Done to Verifying unless passing verify evidence came after the merge. |

## The orchestrator

One session drives at a time: the one whose ID is in the driver lock (`orchestrator.lockFile`). Only the human picks it. Nothing moves the lock on its own.

**Taking over.** In the session the human picks, type `/forge-takeover` (the skill in `skills/forge-takeover`). It runs `takeover.sh`, which moves the lock, renews the lease, and prints the handoff note (`orchestrator.handoffFile`), the approved heads not yet merged, and whether this session's watcher runs. From a terminal, `inbox/orch.sh [label]` opens Claude Code on a fleet account and runs the takeover. With no label it picks the signed-in account with the most weekly usage left.

**The watcher.** The driver keeps `node inbox/orchestrator-watch.mjs` running with Bash `run_in_background`, and re-arms it each time it fires. It runs the inbox, merge-request, red-main, hourly-check, dispatcher-events and PR-sweep watchers at once. When the lock moves to another session it stops and says so, so the old driver's watchers never take events the new one needs. Dispatcher notices are JSON files in `orchestrator.eventsDir`: `{"id", "host", "subtitle", "text", "link", "at"}`.

**The Stop hook.** Add `inbox/orchestrator-watch-guard.sh` as a Stop hook in `~/.claude/settings.json`, with the path of your copy (`~/the-forge` for a standard setup):

```json
{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "bash <your copy of The Forge>/inbox/orchestrator-watch-guard.sh" }] }] } }
```

In the lock holder's session it renews the lease and blocks the stop once when the session's own watcher is not running. A watcher another session started does not count, since it wakes only that session. Every other session stops normally.

**The lease** (beside the lock in `paths.sharedDir`) is the driver's heartbeat, renewed on takeover, at the end of each turn, during merge runs, and when the watcher fires. `lease.sh status` shows it. It never stops the driver from acting.

**The supervisor.** `inbox/install-supervisor.sh` installs `orchestrator-supervisor.mjs` on one machine (launchd or systemd, every `orchestrator.supervisor.everyMinutes`). When the lease is older than `orchestrator.leaseMinutes` and a green merge-asked PR or an approved head has waited `waitMinutes`, it posts one page to `slack.channel`, then one more at each of `repageMinutes` after the first (60 and 240 by default), then nothing until a driver renews the lease. A page Slack refuses or rate limits is retried after 5 minutes, doubling to an hour. An approved PR that gh reads as merged or closed does not count. It never starts a session or moves the lock. `touch <paths.stateDir>/supervisor.off` silences it. Each run logs one line to `<paths.stateDir>/orchestrator-supervisor.log`.

**The PR sweep.** `pr-sweep.mjs --now` reports every open PR now: approved but not moving, no owner, or owned but stale, each with what to do next. `pr-sweep.mjs own <pr> "<note>"` records that the orchestrator is driving a PR, and `release <pr>` ends that. `orchestrator.prSweep` holds the thresholds.

## Merging approved PRs

```
merge-approved.sh <pr>...                          gate each PR, merge or enqueue every one that passes, wait for all
merge-approved.sh --approve <pr> <head> "<note>"   record that <head> (the full SHA) of <pr> is approved
merge-approved.sh --approved                       list approved heads not yet merged, flagging stale ones
merge-approved.sh --all-approved                   merge every open PR whose current head is approved
merge-approved.sh --repo <owner/name> ...          any of the above in a repo listed in merge.repos
```

**Approvals.** An approval names one PR head and is kept in `orchestrator.approvalsFile`, so it survives a handover to another session or machine. A push makes it stale: `--approved` shows `STALE` with the new head, and a merge run stops until the new head is approved. Running the script on a PR with no approval on file is the approval: the head is recorded once the gate passes. An approval stays open until the PR's merge closes it.

**The driver lock.** Only the session named in `orchestrator.lockFile` may approve or merge. The lock is read again right before each merge, so a takeover during a 30-minute run stops it. A process without `CLAUDE_CODE_SESSION_ID` skips the lock: that is how a person's shell, a script or CI runs it.

**The gate.** For each PR, in order: not a draft; main green, unless the PR is a fix (it carries `github.fixesMainLabel`, or its title starts with `github.fixTitlePrefix` when that is set); the merge queue not held (below); no approval on file for an older head; merge state `CLEAN`, `HAS_HOOKS` or `UNSTABLE`; at least one check reported on the head and the newest run of every check passing; and one of `merge.reviewChecks` passed with none failed. Then, for `github.repo` only, `dispatcher/premerge-check.mjs` against current main. A read that fails holds the PR: a missing or unreadable `main-state.json`, merge-queue runs or entries gh could not read, or a gate that cannot be evaluated. PRs are tried in the order given and the run stops at the first that does not pass, since a later PR may be stacked on it. With no review check configured, no review is required and every run prints a warning. `merge` in `docs/configuration.md` has every setting.

**Queue mode** (`merge.mode: "queue"`). Every PR that passes goes into GitHub's merge queue in one pass, those adding a migration first in ascending order, and the run then waits up to 30 minutes for all of them. The enqueue is verified: when gh reports success but the PR has no queue entry, it is enqueued directly. While waiting, a live entry is never an ejection, a cancelled merge-group run is a rebuild, and only a removal newer than this run's enqueue counts. A removal for a conflict says the PR needs a merge of main. `MERGE_JUMP=1` sends the PRs to the front of the queue.

**The CI hold** (`merge.ciHold`). When the queue's last two finished runs failed on the same job, nothing more goes in until a later run passes it. A rollup job that fails only because a job it needs failed does not count. A fix still goes in, and `QUEUE_PROBE_PR=<n>` lets one approved PR in to give the hold a new run to read.

**Direct mode** (`merge.mode: "direct"`, the usual setting for a `merge.repos` entry) squash-merges at the checked head, with `--admin` when the entry sets `adminMerge`.

After a merge the branch is deleted, the ledger gets a merged line, and `merged-to-verifying.mjs` runs. It keeps a ticket in Done only when its newest evidence comment, by the Linear key's user or one of `linear.verifyEvidenceAuthors`, came after the merge and has the footer, at least one PASS row, and no FAIL or malformed row (`lib/verify-evidence.mjs`).

Exit status is 0 when every PR merged, 1 otherwise, with a closing `ALL MERGED` or `NOT MERGED:` line.
