# The Forge

The Forge is a spec desk and an agent queue for Claude Code. You write spec'd Linear tickets in one pinned Claude session and label them ready. A dispatcher on each of your machines hands each ticket to a Claude Code worker on one of several Claude accounts, and the worker builds one pull request. When CI and the AI review are green, the dispatcher merges it and moves the ticket to Verifying. Workers ask you questions in Slack and are woken by your reply.

It is plain Node and bash with no dependencies. A dispatcher tick spends no tokens.

The project used to be called agent-queue, and file names, the config file (`agent-queue.config.json`) and the launchd labels (`dev.agent-queue.*`) keep that name.

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

1. **Spec.** The spec desk session (`specdesk/`) talks ideas through with you and writes one ticket per PR to the spec floor (`docs/ticket-spec.md`). It adds the ready label once a ticket meets the queue bar.
2. **Claim.** Every 20 minutes the dispatcher (`dispatcher/`) checks each ready ticket, takes them by priority then age, and gives each to the Claude account with the most headroom and a free slot. It can bundle up to three small linked tickets into one PR.
3. **Build.** The worker gets `dispatcher/worker-brief.md` with the ticket pasted in. It builds the full spec in its own worktree, opens the PR, and drives CI and the review rounds (`docs/pr-review.md`) until the PR is green.
4. **Ask.** When the ticket doesn't settle a decision, the worker runs `inbox/ask-human.sh ask`. The question goes on the ticket and in your Slack channel, and the worker keeps building what it can until you reply.
5. **Merge.** The dispatcher checks a green PR against current main (`dispatcher/premerge-check.mjs`) and merges it. A PR that touches a reviewed path, such as migrations, workflows, auth or billing, goes to your orchestrator session to review and merge. A red main holds every merge while an emergency worker fixes it (`dispatcher/main-watch.mjs`).
6. **Verify.** You or your verify session walk the ticket's acceptance scenarios on staging and close it (`docs/build-process.md`).
7. **Learn.** A weekly sweep (`learning/`) ranks the failures that keep repeating.

`docs/decisions.md` has the reasons behind these rules.

## What's in the repo

| Path | What it does |
|---|---|
| `agent-queue.config.example.json` | The one config, with every key documented in its `...Note` keys. Copy it to `agent-queue.config.json`. |
| `lib/config.mjs` | Loads the config for every component and prints values for the shell scripts. |
| `bin/the-forge.mjs`, `lib/setup/`, `skills/forge-setup/` | The `the-forge` command and the setup interview's skill (`docs/setup.md`). |
| `specdesk/` | The spec desk's standing brief (`SPECDESK.md`) and its skill. |
| `dispatcher/` | The queue: `dispatcher.mjs` (the tick), `worker-brief.md`, `premerge-check.mjs`, `main-watch.mjs` (red-main responder), `gated-push.mjs`, `install.sh` (launchd or systemd). |
| `fleet/` | `fleet.sh`: start, list, read and stop Claude Code background sessions on several accounts on one machine, with plan usage per account. Plus its skill and account setup. |
| `inbox/` | `ask-human.sh` (questions, in Linear and Slack), the orchestrator's handoff (`takeover.sh`, the lease, the Stop hook, the supervisor), its watchers (`orchestrator-watch.mjs`, `pr-sweep.mjs`) and the merge helpers (`merge-approved.sh`, `merge-when-ready.sh`, `merged-to-verifying.mjs`). |
| `queue-board/` | The board (below), and `hourly-check.mjs`, which wakes the orchestrator only when something new needs it. |
| `learning/` | The weekly failure sweep. |
| `scripts/` | `ext-agent.sh` (headless, read-only Codex and Grok calls) and `cross-review.sh` (a pre-push review by both). |
| `docs/` | Setup, configuration, the ticket spec floor, the PR review loop, the build-to-done loop, the no-stubs rule, memory hygiene, the decisions, and how to write docs and comments here (`writing.md`). |

`dispatcher/`, `fleet/`, `inbox/`, `queue-board/`, `learning/` and `scripts/` each have a README with the full behavior.

## Set up

```bash
npx @jdrodriguez/the-forge setup
```

This copies The Forge to `~/the-forge`, links its skills into Claude Code, and starts an interview in Claude Code that sets up one to four computers. `docs/setup.md` is the full guide, including other ways to install.

You need Claude Code (one Claude account is enough), Node 22 or newer, git, gh, jq, curl, a GitHub repository with CI, and a Linear workspace. Slack, Codex and Grok are optional. You do every sign-in yourself. The Forge never asks for, stores or prints a password, token or key.

| Command | What it does |
|---|---|
| `the-forge setup` | Makes the lasting copy in `~/the-forge` (npm's cache and global folder get replaced), lists missing programs, links the skills, and starts the `forge-setup` skill. |
| `the-forge init --answers <file>` | Writes `agent-queue.config.json` from the interview's answers file. Nothing else writes the config. |
| `the-forge doctor` | Checks this computer: programs, sign-ins, each Claude account, Codex and Grok, Tailscale and SSH to the other computers, the Linear key, the config. |
| `the-forge install`, `uninstall` | This computer's scheduled jobs: the dispatcher everywhere, and the board, herald and red-main watcher on the board's computer (launchd on macOS, systemd on Linux). |
| `the-forge start`, `stop`, `status`, `open` | Load or unload the jobs, show them, open the board. |
| `the-forge update`, `copy-to <host>` | Refresh the lasting copy and reload the jobs. Copy it to another computer over SSH. |

Once it runs, open a Claude Code session, pin it, name it after `orchestrator.sessionName`, and run `/specdesk`. In it, start these watchers with Bash `run_in_background`, and re-arm each one after it wakes the session: `inbox/inbox-watch.sh`, `inbox/merge-request-watch.sh`, `inbox/main-red-watch.sh` and `queue-board/hourly-check.mjs`.

## The board

`queue-board/` is a read-only web page of the whole queue across your machines: worker slots, tickets, PRs, CI and review state, what needs you, your Linear inbox, your Claude app sessions and every git worktree. Each machine is drawn as a realm of Middle-earth and each worker as a pixel figure. A herald (`queue-board/install-herald.sh`) plays an alert and posts a macOS notification when something needs you or breaks. `queue-board/README.md` describes every view.

## Configuration

Everything specific to your team lives in `agent-queue.config.json`, and `docs/configuration.md`, generated from the example config's inline notes, explains every key. `AGENT_QUEUE_CONFIG=/path/to/config.json` points every component at another file. Shell scripts read the config with `node lib/config.mjs env`, which prints `AQ_<PATH>=value` lines (for example `AQ_LINEAR_TEAM`), or `node lib/config.mjs get <dot.path>` for one value.

## Tests

```bash
npm test
```

This runs the setup, dispatcher, inbox, learning and board tests with `node --test`, against throwaway homes and stubs. `.github/workflows/test.yml` runs it on every push.

```bash
npm run test:fleet
```

This runs the fleet's tests against a stub `claude`.

## Safety

- The dispatcher never writes code. A pause is a file the dispatcher re-reads before every merge and dispatch. Two stuck tickets in a row, or a real failure on main after a merge, pause it on their own.
- Workers run in Claude Code's `bypassPermissions` mode by default (`fleet.sh dispatch`), so they can run any command and read any file your user account can. Run the queue under a user and on a machine where that is acceptable, and use the main-checkout guard hook (`fleet/hooks/`). `dispatcher.permissionMode` sets a stricter mode, but workers may then stop at a prompt.
- Workers push and open PRs. Only the dispatcher or the orchestrator merges, and merging deploys staging at most. A human starts production.
- The config holds IDs and names, never secrets. Keep tokens in the state folder, a keychain or a secrets manager.

## License

MIT. See `LICENSE`.
