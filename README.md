# The Forge

The Forge is a spec desk and an agent queue for Claude Code. You write spec'd Linear tickets in one pinned Claude session and label them ready. A dispatcher on each of your machines claims them, hands each to a Claude Code background worker on one of several Claude accounts, and watches the worker build one pull request. When CI and the AI review are green, the dispatcher merges it and moves the ticket to Verifying. Questions come to you in Slack, one thread per question, and the worker that asked is woken with your answer.

It is plain Node and bash with no dependencies. A dispatcher tick spends no tokens; the tokens go to the workers.

The project was called agent-queue before it was called The Forge. File names, the config file (`agent-queue.config.json`), the launchd labels (`dev.agent-queue.*`) and the folder names keep the old name on purpose, so there is nothing to rename after you clone it.

## The loop

```mermaid
flowchart LR
  you([You]) -- ideas --> spec[Spec desk session<br/>specdesk/]
  spec -- "spec'd ticket + ready label" --> linear[(Linear)]
  linear -- "tick every 20 min" --> disp[Dispatcher<br/>dispatcher/]
  disp -- "fleet.sh dispatch" --> worker[Fleet worker<br/>on a Claude account]
  worker -- "branch, PR, CI, review rounds" --> gh[(GitHub)]
  gh -- "green" --> disp
  disp -- "merge, move to Verifying" --> linear
  worker -- "ask-human.sh ask" --> slack[(Slack thread)]
  slack -- "your reply" --> worker
  disp -- "reviewed paths" --> orch[Orchestrator session<br/>watchers in inbox/]
  orch -- "review + merge" --> gh
  you -- "verify on staging" --> linear
```

1. **Spec.** The spec desk session (`specdesk/`) talks ideas through with you, plans the PRs, and writes one ticket per PR with the spec floor (`docs/ticket-spec.md`): acceptance scenarios, adverse data, out of scope and decisions. It adds the ready label once the ticket meets the queue bar.
2. **Claim.** Every 20 minutes the dispatcher (`dispatcher/`) checks each ready ticket's mechanical bar (scenarios, size, priority), takes them by priority then age, and picks the Claude account with the most headroom that has a free slot. It can bundle up to three small linked tickets into one PR.
3. **Build.** The worker gets `dispatcher/worker-brief.md` with the ticket pasted in. It builds the full spec in its own worktree, pushes through the pre-push gates, opens the PR, and drives CI and the review rounds (`docs/pr-review.md`) until the PR is green.
4. **Ask.** When the worker hits a decision the ticket doesn't settle, it runs `inbox/ask-human.sh ask`. The question lands on the ticket and in your Slack channel. The worker keeps building whatever the question doesn't block, waits in the background, and is woken when you reply in the thread.
5. **Merge.** The dispatcher merges a green PR after checking it against current main (`dispatcher/premerge-check.mjs`). A PR that touches a reviewed path (migrations, workflows, auth, billing and the like) goes to your orchestrator session instead, which reviews and merges it. A red main holds every merge while an emergency worker fixes it (`dispatcher/main-watch.mjs`).
6. **Verify.** The ticket lands in Verifying. You (or your own verify session) walk its acceptance scenarios on staging and close it (`docs/build-process.md`).
7. **Learn.** A weekly sweep (`learning/`) ranks the failure types that keep repeating across agent-built work, so each one becomes a fix at the cheapest level that enforces it.

`docs/decisions.md` has the reasoning behind each of these rules.

## What's in the repo

| Folder | What it does |
|---|---|
| `agent-queue.config.example.json` | The one config. Every key is documented inline (the `...Note` keys). Copy it to `agent-queue.config.json`. |
| `lib/config.mjs` | Loads the config for every component, and prints values for the shell scripts. |
| `bin/the-forge.mjs`, `lib/setup/`, `skills/forge-setup/` | The `the-forge` command and the setup interview's skill (`docs/setup.md`). |
| `specdesk/` | The spec desk's standing brief (`SPECDESK.md`) and its Claude Code skill. |
| `dispatcher/` | The queue: `dispatcher.mjs` (the tick), `worker-brief.md`, `premerge-check.mjs`, `main-watch.mjs` (red-main responder), `gated-push.mjs`, `install.sh` (launchd or systemd). Its README has the full behavior. |
| `fleet/` | `fleet.sh`: start, list, read and stop Claude Code background sessions on several Claude accounts on one machine, with plan usage per account. Plus its skill and account setup. |
| `inbox/` | `ask-human.sh` (the inbox for questions, in Linear and Slack), the orchestrator's watchers (`inbox-watch.sh`, `merge-request-watch.sh`, `main-red-watch.sh`), and the merge helpers (`merge-approved.sh`, `merge-when-ready.sh`, `merged-to-verifying.mjs`). |
| `queue-board/` | The Forge's board: a web page that shows every machine's worker slots, tickets, PRs, asks and worktrees, drawn as Middle-earth in two views, with a herald that plays alert cues and posts notifications, an installable app and its own icon. Also `hourly-check.mjs`, which wakes the orchestrator only when something new needs attention. Its README has every feature. |
| `learning/` | The weekly failure sweep. |
| `scripts/` | `ext-agent.sh` (headless, read-only Codex and Grok calls) and `cross-review.sh` (a pre-push review by both). |
| `docs/` | The ticket spec floor, the PR review loop, the build-to-done loop, the no-stubs rule, memory hygiene, and the decisions. |

## Set up

One command copies The Forge to `~/the-forge`, links its skills into Claude Code, and starts an interview in Claude Code that sets up one to four computers:

```bash
npx the-forge setup
```

Until the package is published, run it from this repository (`npx github:<owner>/the-forge setup`), or clone it and run `node bin/the-forge.mjs setup --here` in the clone. `docs/setup.md` is the same ground as a written guide for someone who has never seen this system: what to buy or reuse, the programs each computer needs, Claude accounts and how several live on one computer, Codex, Grok, Tailscale, SSH, GitHub, Linear and Slack, what each computer runs, and how to add a computer later.

You need Claude Code (one Claude account is enough), Node 22 or newer, git, gh, jq, curl, a GitHub repository with CI, and a Linear workspace. Slack, Codex and Grok are optional. You do every sign-in yourself; no part of The Forge asks for, stores or prints a password, token or key.

| Command | What it does |
|---|---|
| `the-forge setup` | Makes the lasting copy (a copy npx unpacked sits in npm's cache, which can be cleaned at any time), lists missing programs, links the skills, and starts the `forge-setup` skill. |
| `the-forge init --answers <file>` | Writes `agent-queue.config.json` from the interview's answers file. The only thing that writes the config. |
| `the-forge doctor` | Checks this computer: programs, sign-ins, each Claude account, Codex and Grok, Tailscale and SSH to the other computers, the Linear key, the config. |
| `the-forge install`, `uninstall` | This computer's scheduled jobs: the dispatcher everywhere, and the board, herald and red-main watcher on the board's computer (launchd on macOS, systemd on Linux). |
| `the-forge start`, `stop`, `status`, `open` | Load or unload the jobs, show them, open the board. |
| `the-forge update`, `copy-to <host>` | Refresh the lasting copy and reload the jobs; copy it to another computer over SSH. |

Once it runs, open a Claude Code session, pin it, name it after `orchestrator.sessionName`, and run `/specdesk`. In it, start the watchers with Bash `run_in_background` so the session is woken when something needs it: `inbox/inbox-watch.sh`, `inbox/merge-request-watch.sh`, `inbox/main-red-watch.sh` and `queue-board/hourly-check.mjs`. Re-arm each one after it wakes the session.

## The board

`queue-board/` is the part of The Forge you look at. It is a web page that shows the whole queue across your machines: worker slots, tickets, PRs, CI and review state, what needs you, your Linear inbox, your Claude app sessions and every git worktree. Each machine is drawn as a realm of Middle-earth and each worker as a pixel figure acting out where its ticket stands, in two views: a side view and a map from above. A herald (`queue-board/install-herald.sh`) plays an alert cue and posts a macOS notification when something needs you or breaks, and the page can play your own music between alerts. The page installs as an app in Chrome and has its own icon. It is read-only and spends no Claude tokens. `queue-board/README.md` describes every view and every config key under `queueBoard`.

## Configuration

Everything specific to your team lives in `agent-queue.config.json`: repo paths and the GitHub repo, the Linear team (which is also the ticket prefix), label and state names, Slack IDs, the reviewer for judgment-path fixes, machine hostnames and per-host worker counts, fleet account labels, the human's name used in prompts, and model names. The example documents every key inline. `AGENT_QUEUE_CONFIG=/path/to/config.json` points every component at another file.

Shell scripts read the config through `node lib/config.mjs env`, which prints `AQ_<PATH>=value` lines (for example `AQ_LINEAR_TEAM`), or `node lib/config.mjs get <dot.path>` for one value.

## Tests

```bash
npm test
```

That runs the setup, dispatcher, inbox, learning and board tests with `node --test`, all against throwaway homes and stubs; nothing real is read or written. A GitHub Actions workflow (`.github/workflows/test.yml`) runs it on every push.

```bash
npm run test:fleet
```

That runs the fleet's test suite against a stub `claude`.

## Safety

- The dispatcher never writes code. A pause is a file the dispatcher re-reads before every merge and dispatch. Two stuck tickets in a row, or a real failure on main after a merge, pause it on their own.
- Workers run with Claude Code's `bypassPermissions` mode by default (`fleet.sh dispatch`), because they run unattended and a worker that stops at a permission prompt has stalled. In that mode a worker can run any command your user account can, and read any file it can. Run the queue under a user and on a machine where that is acceptable, keep tokens in a secrets manager or keychain where you can, and use the main-checkout guard hook (`fleet/hooks/`). `dispatcher.permissionMode` sets a stricter mode for every queue worker, at the cost of workers that may stop and wait.
- Workers push and open PRs; only the dispatcher or the orchestrator merges. Merging deploys staging at most: production stays a step a human starts.
- Keep tokens in the state folder or a secrets manager. The config holds IDs and names, never secrets.

No license has been chosen yet.
