# The queue board

A web page that shows what the agent queue is doing on every queue machine: the worker slots (regular and Sentry), each ticket's machine, account, worker state, PR, CI and review state, how long it has run and when it last moved, what needs you, the ready queue, and what merged in the last 48 hours.

The page has four views, styled after Linear: **Inbox** (your unread Linear notifications), **Queue** (the worker slots, what needs you, what is building, the ready queue and recent merges), **Machines** (each machine's load, dispatch count, account usage and worktree count, plus Codex and Grok) and **Worktrees** (every machine's git worktrees and their state). `#inbox`, `#machines` and `#worktrees` open those views directly, and `#machines/<host>` or `#worktrees/<host>` opens one machine.

Open it at **http://127.0.0.1:8787** on the board's machine (`queueBoard.host`, `queueBoard.port`). With `"tailscale"` in `queueBoard.bind`, any device on your tailnet opens it at `http://<board host>:8787`, your phone too once the Tailscale app is on it.

## Configuration

The board reads the repo's one config (`lib/config.mjs`, so `agent-queue.config.json` or the file `AGENT_QUEUE_CONFIG` names). It uses `dispatcher.enabledHosts` and `dispatcher.hosts` (which machines, their slots and limits), `paths.stateDir` and `paths.sharedDir` (the dispatcher's state and the synced heartbeats), `linear.*` (team, labels, the API key), `github.repo`, `github.user` and `github.reviewCheck`, `human.name` and `reviewer.name` (in the page's text), `fleet.primaryAccount`, `repoPath`, `workspaceCwd` and `worktreesDir`. Its own section is `queueBoard`:

| Key | What it does |
|---|---|
| `host` | The machine that runs the board. `hourly-check.mjs` reads the board there. |
| `port` | The port (default 8787). `QUEUE_BOARD_PORT` wins over it. |
| `bind` | Addresses to listen on (default `["127.0.0.1"]`). `"tailscale"` adds this machine's Tailscale address once Tailscale is up. |
| `ssh` | `{"<host>": "user@host"}`: how to reach each other host. A missing host is reached by its own name. |
| `names` | `{"<host>": "short name"}`: the name the page shows. |
| `remoteRoot` | Where this repo sits on the other hosts. Default: the same path under each host's home. |
| `repoRoots` | Folders whose direct child repos the Worktrees view scans. Default: `workspaceCwd`. |
| `extUsage` | `false` hides the Codex and Grok card. |
| `healthUrl` | The deployed environment's `/health` for `hourly-check.mjs`; `null` skips that check. |

## How it works

- `board.mjs` runs on the board's machine under launchd (`dev.agent-queue.queue-board`, kept alive). It listens only on the addresses in `queueBoard.bind`. Keep the LAN out of that list: anyone who can reach the board can type into a worker's session.
- When the page asks for data and the last snapshot is over 45 seconds old, it builds a new one. Nobody looking means no work at all.
- A snapshot runs `collect.mjs` on each machine in `dispatcher.enabledHosts` (locally on the board's machine, over SSH on the others), then reads the live tickets' PRs from GitHub in one GraphQL call and the queue labels and open asks from Linear in one call. Over SSH it runs `node <remoteRoot>/queue-board/collect.mjs`, which loads that machine's own config, so each machine reports its own `paths.stateDir`. A non-interactive SSH shell does not load your profile, so on each remote host the config must sit at the default `<repo>/agent-queue.config.json`.
- `collect.mjs` reads the dispatcher's `state.json`, `PAUSED` and log, `fleet.sh ps`, each account's saved plan usage and the machine's load. It never runs `claude -p /usage`, so it can't crowd the dispatcher's own usage checks; the usage shown is as of the account's last refresh, and the page says how old it is.
- **Outside the queue** lists every other live background worker on the fleet's accounts: one some session started with `fleet.sh dispatch`, such as a rush ticket, with no queue ticket behind it. Nothing has to register it. `collect.mjs` takes every background session in `fleet.sh ps` that has a running process and that no queue ticket ever pointed at. It reads the worker's ticket from its branch or session name, its branch from where it runs (or the newest worktree on that ticket's branch when it started in the workspace folder), its start time from the session registry and its last activity from its transcript. The board then looks up its PR by branch and its title in Linear. The dispatcher counts a working one against its machine's `maxWorkers`, so the slot strip shows it in a slot, marked outside the queue. A finished one drops off a day after its last activity, and a blocked one shows under Needs you. View session and Open in terminal work the same as for a queue worker.
- **Bundles:** one worker and one PR can carry a lead ticket and its companions. A companion's state entry names its lead in `bundledInto`, so the board leaves it out of the list and shows it on the lead's entry instead: the slot and the card read "ENG-123 + ENG-124", and the card has a line per companion with its title. A bundle takes one slot, and its companions merge or go stuck with the lead, so they appear on the lead's row under Merged and Needs you too. `#session=<companion>` opens the lead's worker.
- **Merge queue:** a green PR in the base branch's merge queue shows "in merge queue" with its position (GitHub's `mergeQueueEntry`). It is in flight, so the board never flags it as stalled, and neither does `hourly-check.mjs`.
- **Daily cap:** with `dispatcher.maxDispatchesPerDay` null, each machine card shows only how many tickets it dispatched in the last 24 hours, and the worker slots (`dispatcher.hosts.<host>.maxWorkers`) bound the queue. With a cap set, the card shows a bar against it.
- **Sentry slot:** a machine with `dispatcher.hosts.<host>.sentryWorkers` keeps side slots for Sentry fix tickets (the `linear.labels.sentry` label), and the board counts them apart from the regular slots. A busy Sentry slot never makes the machine look over-full, and an idle one never shows as a free regular slot. In the slot strip the Sentry bay comes after the machine's regular bays, and the group label reads "linux 1/3, Sentry idle" (or busy, or offline). The header shows "Sentry slot idle" next to the building count. A ticket in the slot (`sentry: true` in that machine's `state.json`) carries a Sentry marker on its bay, card and merged row. Each machine card shows its heartbeat age, read from the synced `<paths.sharedDir>/heartbeats/<host>.json` here. When a Sentry host's heartbeat is over `dispatcher.sentryHeartbeatMinutes` old (45) or paused, its slot reads offline, its card says the other machines build Sentry tickets, and Needs you flags it when the machine still ticks. A Sentry ticket in the ready queue reads "for linux's Sentry slot" while that slot is live, so it shows as queued.
- **Reviewer waits:** a Sentry fix that waits on `reviewer.name`'s review, or on a worker addressing their requested changes, reads "waiting on <name>" and never counts as a worker that ended with nothing driving it.

It changes nothing anywhere and spends no Claude tokens. It uses the same Linear key (`linearKey` in `lib/config.mjs`) and GitHub login (`github.user`) as the dispatcher. When Linear or GitHub fails, the snapshot still comes back: the failed part lands in its `errors` (and under Needs you on the page), the ready list reads unknown, and the Inbox shows the error.

## Session panel

**View session** on a building card or a "Needs you" item opens that worker's session: its recent history and a box to message it.

- **History** comes from `history.mjs`, run on the worker's machine. It reads the session transcript (`<account dir>/projects/*/<session id>.jsonl`) from the end and lists user and worker messages, each tool call with its description and command, failed tool results and error notices. Successful tool output is left out. The panel refreshes every 10 seconds while open, and **Show earlier** reaches back 400 entries.
- **Sending** runs `send.py` on the worker's machine. It opens the session with `claude attach` in a pseudo-terminal, pastes the message, presses Enter and disconnects, so the message arrives as your own turn, the same as typing it after `claude attach`. An idle worker reads it at once; a busy one reads it at its next step. A worker blocked on a prompt is refused, since Enter would pick an option there; answer it with **Open in terminal**. The board log records each send (ticket, worker, length, outcome) but not the text.
- **Open in terminal** opens the worker's `claude attach` in a new iTerm window on the board's Mac, when the browser is on that Mac. From any other machine it copies the ssh command instead.
- The panel looks the worker up from the dispatcher's own state by ticket ID; the page never names a machine or account. Every route but `/healthz` answers only to this board's own host names (127.0.0.1, localhost, the machine's short hostname, the addresses in `bind`, and its Tailscale names when Tailscale is bound), and sending also needs a JSON body and the `X-Board: send` header, so another website can't trigger it.
- `#session=ENG-123` at the end of the board URL opens that ticket's panel directly.

## Inbox

The Inbox view shows your unread Linear notifications, so a mention or a reply doesn't wait until you ask a session about it. The board's Linear key is your own account, so Linear's `notifications` query returns your inbox. `linear-inbox.mjs` reads it in one GraphQL call (the newest 250 notifications, plus the newest 100 mentions, assignments and review requests so an older mention isn't pushed out), in the background at most every 20 minutes while the page is open. That costs about 1,900 of Linear's 3,000,000 hourly complexity points per read.

- **Mentions, replies and reviews**: someone mentioned you, replied to one of your comments, or asked for your review. The sidebar's Inbox badge counts these.
- **Assigned to you**: issues newly assigned to you.
- **Comments on issues you follow** and **Other updates** (status changes, due dates, PR checks): one row per issue with the newest notice and how many there are. The newest 40 issues of each travel in the snapshot; Linear has the rest.

Each item links to the comment in Linear, and **Copy for Claude** copies the notice and its link to paste into a session. The view only reads: a notice leaves it once you open or archive it in Linear and the next read comes round. Snoozed and archived notices are left out. A busy inbox holds hundreds of unread notices, most of them comments on followed issues and status changes, which is why the ones aimed at you come first.

## Worktrees

The Worktrees view lists every git worktree on each queue machine, so a cleanup can see what is safe to remove. `worktrees.mjs` runs on each machine and reads every repo directly under the folders in `queueBoard.repoRoots`. For each linked worktree (the main checkout is left out) it reads the branch, the last commit, how many tracked files have uncommitted changes, how many commits are on no remote branch, and which processes have their working folder inside it (`lsof` on a Mac, `/proc` on Linux). The board then looks up each branch's newest PR on GitHub, one GraphQL call per repository (`worktree-state.mjs`), and gives each worktree one state:

- **In use**: a process is working in it, or a live worker builds its branch.
- **PR open**, **Merged**, **PR closed**: its branch's newest PR.
- **Not pushed**: no PR, and it holds work that is nowhere else.
- **No PR**: no PR, and nothing in it that GitHub lacks.
- **Folder missing**: git still lists it but the folder is gone (`git worktree prune` clears these).

A merged or closed worktree with no uncommitted changes and no commits missing from GitHub counts as **safe to remove**. Commits on no remote branch still count as saved when the worktree's head is the PR's head, which is what a squash merge that deleted the branch leaves behind. Each machine lists the rest first and folds the safe ones into one **Show N safe to remove** line.

The scan runs in the background at most every 10 minutes while the page is open. It only reads: git runs with `--no-optional-locks`, so it never takes the index lock a worker needs, and with `core.preloadIndex=false`, which cut its CPU cost about six times on a Mac (about 0.1 seconds per worktree). Untracked files are not counted, since finding them cost about four times as much, and `git worktree remove` refuses a worktree that has any. Temporary worktrees in the system temp folders are left out.

## Codex and Grok

The last card in the Machines view shows the Codex and Grok plans. `ext-usage.mjs` asks each CLI the way its own usage screen does: Codex through `codex app-server` (`account/rateLimits/read`) and Grok through `grok agent stdio` (`_x.ai/billing`, plus `_x.ai/auth/info` for the account email). These are read-only billing calls. Neither starts a session or runs a model, so a reading spends none of the allowance it reports, and the CLIs keep their own sign-in. The board runs it on every machine once an hour, in the background, and merges machines signed in to the same account into one row. The machines can be on different accounts. A machine whose CLI is signed out or missing gets its own row with the error. Set `queueBoard.extUsage` to `false` to leave the card out.

## The hourly check

`hourly-check.mjs` looks across the queue at the top of each hour and exits with a report only when something new turns up, so the orchestrator session can run it with Bash `run_in_background` and be woken only when there is something to act on. It reads the board's snapshot (machines down, paused, not ticking, over their load or memory limit, signed-out accounts, ended or stalled or blocked or stuck workers, open asks, Linear and GitHub errors), the base branch's last completed `github.ciWorkflow` run, and, when `queueBoard.healthUrl` is set, whether that environment serves the branch head. A finding already reported stays quiet until it clears; one that comes back is new again. It records them in `<paths.stateDir>/queue-board/hourly-reported.json`.

```
node queue-board/hourly-check.mjs          # wait for each top of the hour; exit 0 with the new findings, or 2 after 24h quiet
node queue-board/hourly-check.mjs --once   # check now, print every current finding, record them as reported
```

## Commands

```
queue-board/install.sh             # install or restart the launchd job (on queueBoard.host only)
queue-board/install.sh --remove    # stop it and delete the job
curl -s http://127.0.0.1:8787/api/snapshot | jq   # the raw snapshot
tail <paths.stateDir>/queue-board.log             # its log
```

`install.sh` writes the job from `queue-board.plist` with this machine's paths, and passes the config it was run with (`AGENT_QUEUE_CONFIG`, else the repo's `agent-queue.config.json`) to the board. It is macOS only; on Linux run `node queue-board/board.mjs` under systemd or another service manager.

`page.html`, `session.js`, `inbox.js` and `worktrees.js` are read on every request, so page edits show on reload. `collect.mjs`, `history.mjs`, `send.py`, `ext-usage.mjs` and `worktrees.mjs` run fresh each time on each machine (keep every machine's checkout on the same commit). Edits to `board.mjs`, `linear-inbox.mjs` or `worktree-state.mjs` need `install.sh` again to restart it.
