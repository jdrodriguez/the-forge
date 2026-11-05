# The dispatcher

The human starts work by adding the ready label (`agent-ready` by default) to a spec'd Linear ticket. A launchd job (macOS) or a systemd user timer (Linux) runs `dispatcher.mjs tick` every 20 minutes. Each tick hands ready tickets to fleet workers, merges their PRs when GitHub calls them clean, and moves the tickets to Verifying. Anything that needs the human goes to their inbox (`../inbox/ask-human.sh`).

A tick spends no Claude tokens. It is a plain Node script that reads Linear, GitHub and the fleet's session list, and with an empty queue it doesn't even query account usage. The tokens go to the workers, and the caps in the config bound those.

Every value below in `code` that names a setting lives in `agent-queue.config.json` (see the example at the repo root). Most are under `dispatcher`.

## Labels (the state machine, kept in Linear)

| Label (config key, default) | Meaning | Who sets it |
|---|---|---|
| `linear.labels.ready`, `agent-ready` | The ticket meets the queue bar in `../specdesk/SPECDESK.md`: the spec-floor sections, a Size label in `queueSizes`, a priority, a project, no open product question | the human, usually through the spec session |
| `linear.labels.building`, `agent-building` | Claimed, and a fleet worker is building it (the ticket also moves to In Progress) | the dispatcher |
| `linear.labels.stuck`, `agent-stuck` | The dispatcher gave up: the worker's session ended with nothing moving for `stallHours`, or the PR was closed. The human decides what happens next | the dispatcher |
| `linear.labels.needsHuman`, `needs-human` | An ask is open on the ticket | `ask-human.sh` |
| `linear.labels.mechanical`, `sentry-mechanical` | A Sentry fix whose PR the dispatcher merges once it is green (see Sentry merge paths) | your Sentry triage |
| `linear.labels.judgment`, `sentry-human-review` | A Sentry fix whose PR waits on the reviewer's GitHub approval before it merges | your Sentry triage, or the dispatcher when a mechanical fix turns out to need a human call |

After a merge, the dispatcher removes the building label and moves the ticket to Verifying. The human's verification flow takes it from there. To re-queue a stuck ticket, remove the stuck label and add the ready label.

## What a tick does

0. **Inbox upkeep.** `ask-human.sh sweep` posts any open ask that hasn't reached Slack and removes the needs-human label from answered ones.
1. **Check main.** For each commit it merged in the last day, a failed CI run on main trips the circuit breaker, unless a later main commit containing that merge passed the same workflow (a flake), waiting up to `flakeWaitMinutes` for one.
2. **Advance.** For each ticket this machine dispatched, it finds the PR by its branch (`github.branchTemplate`, `agent/{id}` by default):
   - merged: moves the ticket to Verifying;
   - closed: marks it stuck;
   - green (`mergeStateStatus` CLEAN, the `github.reviewCheck` check passed, no open review thread): squash-merges it after the pre-merge check. With a merge queue on the base branch, the merge call enqueues the PR, a queued PR is left to the queue, and the dispatcher deletes the branch once it reads merged. If the PR touches a path in `riskyPathPatterns`, it writes `merge-requests/<ID>.json` in `paths.sharedDir` for the orchestrator session instead, which reviews those paths, runs the pre-merge check and merges. Finished, green, built-to-spec work never waits on the human's merge button, since a worker waiting on a merge holds its slot. The orchestrator escalates to the human only for a trust boundary or a change beyond the ticket's spec;
   - not green yet: checks for progress instead of elapsed time. There is no time limit. Progress is a new commit on the branch, any PR activity, or the worker's session showing busy. Every `longRunNoticeHours` it posts an informational "still going" line to Slack. If nothing has moved for `stallHours` while the worker isn't busy, or the worker has been busy `spinHours` without a commit or PR change, the human gets one stall note and the ticket stays in the queue. While the ticket waits on the human's answer, it is never called stalled. Only a worker whose session is gone on two checks in a row, with nothing moving for `stallHours`, makes the ticket stuck.
3. **Watch workers.** A worker whose session shows `blocked` (waiting on input) has stopped, and the stall check would only notice hours later. The first tick that sees it puts an ask in the human's inbox with the `claude attach` command for that session. It asks once per block and logs when the worker moves again. This step runs while the dispatcher is paused, too. A fleet account that signs out gets one ask the same way.
4. **Dispatch.** A machine with no room claims nothing: over `maxLoadPerCore` on its 5-minute load average, or under `minMemoryFreePercent`, it logs why and leaves every ticket ready for its next tick or another machine's. `hosts` sets each machine's `maxWorkers` and which fleet `accounts` it may use. `maxWorkers` counts every working fleet worker on the machine: the queue's own, plus any background worker another session started outside the queue. A worker that is idle or done, or a session row with no process, takes no slot. First it checks every ready ticket against the bar's mechanical part: a `## Acceptance scenarios` section, a Size label in `queueSizes`, and a priority. A ticket that fails loses the ready label, gets a comment saying why, and lands in the human's inbox. Then, within `maxConcurrent` (counted across machines through the building label) and `maxDispatchesPerDay` when one is set, it takes ready tickets by priority, then age. It skips tickets whose "blocked by" tickets aren't done or in Verifying. It picks the account with the most weekly headroom that has a free worker slot and at least `headroomFloorPercent` left in both its 5-hour and weekly windows. Then it claims the ticket and runs `fleet.sh dispatch` with `worker-brief.md`.
5. **Sentry triage**, when `sentryTriage.enabled` and this is `sentryTriage.host`: starts your triage module (see below).

**Bundling:** a lead ticket takes up to `bundle.maxTickets - 1` companions into its worker, branch and PR: other ready tickets in the same Linear project that are linked to the lead or to a companion already taken (same parent ticket, or a direct blocks or related link; a shared project alone is not enough), sized in `bundle.sizes`, with no open "blocked by" outside the bundle (a companion blocked by the lead is fine). Every extra PR costs CI runs and a review round. A ticket whose description has a `Ships alone: <reason>` line, which the spec session writes on a ticket it sliced thin on purpose, never bundles. The worker gets one brief with a bundle note and every ticket's section, gives each ticket its own commits, and titles the PR with every ID. The lead's state entry carries `bundle`; each companion's carries `bundledInto` and the status `bundled`, which nothing advances on its own: it moves to Verifying when the lead merges, to stuck when the lead goes stuck, and out of the queue when the lead's PR is closed under review. A question about a companion counts as the lead waiting. Each machine lists its live bundles in `paths.sharedDir/bundles/`, so `maxConcurrent` counts a bundle as one worker. `tick --dry-run --bundle` shows what bundling would do while it is off. Tests: `test/dispatcher-bundle.test.mjs`.

**Sentry slot:** a host with `hosts.<name>.sentryWorkers` keeps that many side worker slots for Sentry fix tickets, the ones labeled `linear.labels.sentry`. They sit apart from its `maxWorkers`: a Sentry ticket never takes a regular slot there, a regular ticket never takes a Sentry slot, and the slot sits idle when there is no Sentry work. Every machine writes `heartbeats/<host>.json` in `paths.sharedDir` each tick. While a Sentry host's heartbeat is under `sentryHeartbeatMinutes` old and unpaused, the other machines leave Sentry tickets to it ("left for <host>'s Sentry slot"); when it is offline or paused, they build Sentry tickets as usual, so a fix never waits on one machine. Bundles never mix Sentry and regular tickets. Tests: `test/dispatcher-sentry.test.mjs`.

**Sentry merge paths:** your Sentry triage gives each fix ticket a merge path: a label and a `## Merge path` section with the reason on a `Reason:` line. **Mechanical** needs all of these: the diagnosis pins the cause to a file and line with high confidence; the fix is Size S in one package; it needs no migration; none of its files match `riskyPathPatterns`; it needs no product or behavior choice; and a regression test can prove it. **Judgment** is everything else, including any fact the diagnosis left out.

- A mechanical PR merges when green, like any queue PR. If it turns out to touch a reviewed path, it goes to the reviewer instead of the orchestrator. The same happens when its worker writes `Merge path: human-review: <reason>` in the PR body (`worker-brief.md`), since workers can't write to Linear. In both cases the dispatcher swaps the label.
- For a judgment PR that is open and not a draft, the dispatcher does three things once each, recorded in `state.json` under the ticket's `reviewer` entry: it requests `reviewer.github` as reviewer (`gh pr edit --add-reviewer`), comments the PR link and the reason on the ticket, and DMs `reviewer.slackUser` through the queue's Slack bot.
- The DM goes to the reviewer's user ID with `chat.postMessage`. With `chat:write`, a `U…` ID as `channel` posts to the user's DM with the app (its App Home Messages tab). If the app's Messages tab is off, Slack answers `messages_tab_disabled`, and the dispatcher falls back to `reviewer.fallbackChannel` with a mention. Slack timeouts are never retried, so the reviewer never gets two messages.
- A judgment PR merges only when the reviewer's latest review approves the current head and the PR is green. Without branch protection, GitHub's `reviewDecision` stays empty and a review bot may post APPROVED reviews of its own, so the gate reads the reviewer's reviews by login. When commits land after their last review, they are asked again once for the new head.
- While it waits, the note reads "waiting on <reviewer>'s review", and it is never counted as stalled.
- When their latest review requests changes on the current head and the ticket's worker has ended, one replacement worker starts on the same branch. Its brief quotes the review and inline comments, and tells it to push once and reply on each thread. A worker that is still live is left to handle it. Each review gets at most one worker, and a review round does not use up `maxRedispatches`.
- A Sentry ticket with neither label counts as judgment.

Tests: `test/dispatcher-reviewer.test.mjs`.

**Sentry triage module:** this repo ships no triage. If you write one, put it next to `dispatcher.mjs` (or point `sentryTriage.module` at it). It exports `kickFromTick({ cfg, dry, log })`, which should start its run in its own detached process so the tick never waits on it, and `statusLine(cfg)`, which `status` prints. It is loaded lazily, so a throw or a syntax error in it is one line in `dispatcher.log` and never stops a tick. Tests: `test/dispatcher-hook.test.mjs`.

**Circuit breaker:** `stuckInARowTrips` stuck tickets in a row, or a real failure on main after a merge, pauses the dispatcher (no dispatches, no merges) and puts the reason in the human's inbox.

**Red main responder:** `main-watch.mjs` runs every 3 minutes on one machine (`./install.sh --main-watch`). It reads the base branch's CI on GitHub. When main turns red, it posts to Slack (the progress webhook) with the failing jobs and first error, shows a macOS notification, writes `main-state.json` in `paths.sharedDir`, and starts an emergency fleet worker beyond the worker cap (`mainWatch.accounts`, `mainWatch.maxWorkers`). That worker is briefed to tell flake from real, then fix forward or revert, merge its own fix unless it touches reviewed paths, and report to the orchestrator. While `main-state.json` says red (and is under 15 minutes old), every dispatcher holds queue merges. If main stays red, it alerts again every `mainWatch.realertMinutes`, and starts a second responder if the first one ended (up to `mainWatch.maxResponders`). When main turns green, it posts the all-clear. The orchestrator session runs `../inbox/main-red-watch.sh` so it is woken on red and on recovery. Log: `paths.stateDir/main-watch.log`.

**Pre-merge check:** before it merges a green PR, the dispatcher checks it against the main it will land on (`premerge-check.mjs`). A PR's CI only tested it against the main of its last push, and two PRs that were each green can break main together. When main has moved since that CI run, it merges current main into the PR in a reused scratch worktree (`<repoPath>/<worktreesDir>/premerge-check`), refuses a migration prefix that two PRs both took (`premerge.migrations`), lints changed workflows with actionlint when it is installed, then runs `premerge.checkCommand`. A pass merges. A real error (output matching `premerge.errorPattern`) doesn't: the PR branch is updated with main, so its CI re-runs and shows the clash to the worker, and the ticket gets a comment. A check that couldn't finish (the compile was killed, or no CI run was found) holds the merge for a tick. This costs local CPU only, no CI run. For a hand merge, run `node premerge-check.mjs <pr>` first, or use `../inbox/merge-approved.sh`.

**Dead sessions:** a worker the fleet reports as `failed` (its session died, as every worker does when a machine reboots) gets one replacement worker after two ticks, told to continue from the old worktree and PR. Only after that (`maxRedispatches`, default 1) can the ticket go stuck. A worker that ends as `done` or disappears goes straight to the stuck rule.

**Pushing:** workers push through `gated-push.mjs`, which runs `push.gates` (format and type checks, typically) and then `git push` with `push.env`. Tests gate in CI; the hook's slow test step is what this replaces.

## Staying in the loop

- **Notifications.** Every transition shows a macOS notification titled "Agent queue": started, PR opened, merged, sent for merge review, worker blocked, stuck, paused. Set `dispatcher.notify` to false to turn them off.
- **Slack.** One private channel gets two feeds, both from one Slack app.
  - Progress (started, PR opened, merged) comes from the dispatcher through the app's incoming webhook, whose URL lives in `slack.webhookFile`. `dispatcher.mjs test-notify` checks it.
  - Questions come from `ask-human.sh`. It posts each ask with the app's bot token (`slack.botTokenFile`) and links that Slack thread to the ticket as a Linear synced thread. The human answers by replying in the thread. Linear copies the reply onto the ticket as a comment, `ask-human.sh check` reads it as the answer, and the next tick's sweep removes the needs-human label. On a machine without the token, another machine's sweep posts the ask within 20 minutes.
  - Synced threads in a private channel need Linear's Slack app in the channel, as well as your own app.
- **Waiting on an answer.** A worker that asks runs `ask-human.sh wait ENG-123` as the whole Bash command with `run_in_background` and keeps building whatever the question doesn't block. An `&`, subshell or redirect detaches the wait and the worker is never woken, so `ask` prints the exact command on stderr. The wait checks every 5 minutes and wakes the worker with the answer.
- **Session start.** `dispatcher.mjs summary` prints a `[Queue]` block: what is running, each ticket's PR and why it isn't green yet, and anything merged or stuck in the last day. It reads local state only, so it costs nothing and never waits on the network. Wire it into a SessionStart hook.
- **Linear.** A saved view listing the ready, building and stuck labels shows the queue. Each ticket gets a dispatcher comment when it starts and when it merges.
- **Watching a worker.** `dispatcher.mjs status` gives each ticket's account and worker ID. Open the session with `CLAUDE_CONFIG_DIR=~/.claude-<label> claude attach <id>` (account a: `env -u CLAUDE_CONFIG_DIR claude attach <id>`).

## Commands

```
node dispatcher.mjs status
node dispatcher.mjs summary            # the session-start block, local state only
node dispatcher.mjs check ENG-123      # would the queue take this ticket? changes nothing
node dispatcher.mjs redispatch ENG-123 # new worker for a building or stuck ticket whose worker ended; continues from its worktree and PR
node dispatcher.mjs test-notify        # one macOS notification and one Slack post
node dispatcher.mjs tick --dry-run     # shows what it would do, changes nothing
node dispatcher.mjs pause "reason"
node dispatcher.mjs resume             # also resets the stuck streak
./install.sh [--main-watch] [--remove] # the scheduled jobs
node main-watch.mjs --dry-run          # what the red-main watcher would do now
node premerge-check.mjs <pr>           # the pre-merge check, by hand
```

## Files

- **In the repo:** `dispatcher.mjs`, `premerge-check.mjs`, `main-watch.mjs`, `gated-push.mjs`, `worker-brief.md` (the template every worker gets; `{{...}}` placeholders are filled from the config and the ticket), `install.sh`.
- **Per machine (`paths.stateDir`):** `state.json` (this machine's in-flight tickets), `dispatcher.log`, `main-watch.log`, `PAUSED`, and the secret files.
- **Shared (`paths.sharedDir`):** `merge-requests/`, `heartbeats/`, `bundles/`, `main-state.json`. Keep it in a folder Syncthing or Dropbox syncs when several machines run the queue.

## Limits in this version

- Only hosts in `enabledHosts` run ticks. The claim goes through Linear labels and re-reads them just before claiming, but two machines ticking at the same moment could still both claim one ticket. Their jobs load at different times, which staggers them.
- The circuit breaker and the daily dispatch count are per machine, because the state file is.
- Tickets are watched only by the machine that dispatched them, because the state file is per machine.
- Worktree teardown after a merge is left to you.
- When a ticket gets stuck, its worker may still be running. Stop it with `fleet.sh stop` if needed.

## Tests

```
node --test test/*.test.mjs
```

Every test runs the real `dispatcher.mjs` in a throwaway HOME (`test/sandbox.mjs`) with stub `fleet.sh`, `gh` and `ask-human.sh`, and a stub Linear and Slack behind `fetch`. Nothing real is read or written. `DISPATCHER_SRC=/path/to/other/dispatcher.mjs` points the tests at another copy, to prove an edit before it goes live.
