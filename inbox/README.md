# inbox

The orchestrator session's tools: the human's inbox for questions, the watchers that wake the session, and the merge helpers.

| File | What it does |
|---|---|
| `ask-human.sh` | Files a question for the human in Linear and Slack; its `wait` command blocks until the answer comes. |
| `inbox-watch.sh`, `merge-request-watch.sh`, `main-red-watch.sh` | Watchers the session runs in the background. Each exits on the first new thing it sees. |
| `merge-approved.sh` | Merges approved PRs (below). Runs `merge-approved.mjs`, with its rules in `merge-policy.mjs` and the ledger in `approvals.mjs`. |
| `merge-when-ready.sh <pr>` | Waits up to 75 minutes for a PR to turn mergeable, then runs `merge-approved.sh` on it. |
| `merged-to-verifying.mjs <pr> [owner/name]` | Moves a merged PR's tickets from Done to Verifying unless passing verify evidence came after the merge. |

## Merging approved PRs

```
merge-approved.sh <pr>...                          gate each PR, merge or enqueue every one that passes, wait for all
merge-approved.sh --approve <pr> <head> "<note>"   record that <head> (the full SHA) of <pr> is approved
merge-approved.sh --approved                       list approved heads not yet merged, flagging stale ones
merge-approved.sh --all-approved                   merge every open PR whose current head is approved
merge-approved.sh --repo <owner/name> ...          any of the above in a repo listed in merge.repos
```

**Approvals.** An approval names one PR head and is kept in `orchestrator.approvalsFile`, so it survives a handover to another session or machine. A push makes it stale: `--approved` shows `STALE` with the new head, and a merge run stops until the new head is approved. A merge run on a PR with no approval on file records the head once the gate passes.

**The driver lock.** Only the session named in `orchestrator.lockFile` may approve or merge. The lock is read again right before each merge, so a takeover during a 30-minute run stops it. A shell outside Claude Code counts as the human.

**The gate.** For each PR, in order: not a draft; main not red, unless the PR carries `github.fixesMainLabel` or is a revert; the merge queue not held (below); its current head approved; merge state `CLEAN`, `HAS_HOOKS` or `UNSTABLE`; every reported check passing; and one of `merge.reviewChecks` passed. Then, for `github.repo` only, `dispatcher/premerge-check.mjs` against current main. Anything that fails, including a gate that cannot be evaluated, stops that PR and the run goes on to the next. `merge` in `docs/configuration.md` has every setting.

**Queue mode** (`merge.mode: "queue"`). Every PR that passes goes into GitHub's merge queue in one pass, those adding a migration first in ascending order, and the run then waits up to 30 minutes for all of them. The enqueue is verified: when gh reports success but the PR has no queue entry, it is enqueued directly. While waiting, a live entry is never an ejection, a cancelled merge-group run is a rebuild, and only a removal newer than this run's enqueue counts. A removal for a conflict says the PR needs a merge of main. `MERGE_JUMP=1` sends the PRs to the front of the queue.

**The CI hold** (`merge.ciHold`). When the queue's last two finished runs failed on the same job, nothing more goes in until a later run passes it. A rollup job that fails only because a job it needs failed does not count. A fix or revert still goes in, and `QUEUE_PROBE_PR=<n>` lets one approved PR in to give the hold a new run to read.

**Direct mode** (`merge.mode: "direct"`, the usual setting for a `merge.repos` entry) squash-merges at the checked head, with `--admin` when the entry sets `adminMerge`.

After a merge the branch is deleted, the ledger gets a merged line, and `merged-to-verifying.mjs` runs. It keeps a ticket in Done only when its newest evidence comment, by the Linear key's user or one of `linear.verifyEvidenceAuthors`, came after the merge and has the footer, at least one PASS row, and no FAIL or malformed row (`lib/verify-evidence.mjs`).

Exit status is 0 when every PR merged, 1 otherwise, with a closing `ALL MERGED` or `NOT MERGED:` line.
