# Configuration

Generated from `agent-queue.config.example.json` by `node lib/config.mjs doc`; edit the example's `...Note` keys, then regenerate. Copy the example to `agent-queue.config.json` (gitignored), or point `AGENT_QUEUE_CONFIG` at another file. Every string that starts with `~/` is expanded to the home folder of the machine reading it.

Copy this file to agent-queue.config.json (gitignored) and fill it in. Keys ending in Note, and every "//" key, are documentation and are ignored on load. docs/configuration.md explains every key.

## Top level

| Key | Example | What it does |
|---|---|---|
| `repoPath` | `"~/dev/your-app"` | The local main checkout of the repo the queue builds. Workers cut their worktrees from it; the pre-merge check keeps its scratch worktree under it. |
| `workspaceCwd` | `"~/dev"` | The folder workers start in (fleet.sh dispatch --cwd). Usually the repo's parent, so a worker can see sibling repos. |
| `worktreesDir` | `".claude/worktrees"` | Where worktrees live, relative to repoPath. |

## `human`

| Key | Example | What it does |
|---|---|---|
| `human.name` | `"Alex"` | The person the queue works for. It appears in prompts, worker briefs, ticket comments and Slack lines ("ask Alex", "waiting on Alex's answer"). |

## `orchestrator`

| Key | Example | What it does |
|---|---|---|
| `orchestrator.sessionName` | `"Specdesk"` | The pinned Claude Code session that writes specs and watches the queue. Emergency responders message it by this name. |

## `paths`

| Key | Example | What it does |
|---|---|---|
| `paths.stateDir` | `"~/.agent-queue"` | Per machine: state.json, logs, the PAUSED flag, the tick lock, and the secret files (slack-webhook, slack-bot-token, linear-api-key). |
| `paths.sharedDir` | `"~/.agent-queue/shared"` | Shared across machines. Point it at a folder Syncthing or Dropbox keeps in sync when more than one machine runs the queue. Holds merge-requests/, heartbeats/, bundles/ and main-state.json. |

## `github`

| Key | Example | What it does |
|---|---|---|
| `github.repo` | `"your-org/your-app"` | owner/name of the repo the queue builds. |
| `github.user` | `"your-github-login"` | The gh account the dispatcher and the merge scripts act as (gh auth token --user). |
| `github.baseBranch` | `"main"` | The branch PRs target and the main watcher reads. |
| `github.ciWorkflow` | `"CI"` | The workflow name the pre-merge check and the main watcher read. |
| `github.reviewCheck` | `"Claude Code Review"` | The status check that must pass before a PR counts as green. Set it to null to skip the review check. |
| `github.rerunLabel` | `"review:rerun"` | merge-when-ready.sh adds this label once when the review check reads "Re-review not requested". Set it to null if your review bot re-runs on every push. |
| `github.fixesMainLabel` | `"fixes-main"` | A PR with this label (or a revert) may merge while main is red. |
| `github.branchTemplate` | `"agent/{id}"` | The branch a worker builds on. {id} is the lowercased ticket ID, so ENG-123 builds on agent/eng-123. |

## `linear`

| Key | Example | What it does |
|---|---|---|
| `linear.workspace` | `"your-workspace"` | The URL slug in https://linear.app/<workspace>/. |
| `linear.team` | `"ENG"` | The team key. It is also the ticket prefix (ENG-123). |
| `linear.apiKeyCommand` | `[]` | Optional argv that prints the Linear API key, for a secrets manager, e.g. ["doppler", "secrets", "get", "LINEAR_API_KEY", "--plain"]. The LINEAR_API_KEY environment variable wins over it; with neither, the key is read from apiKeyFile. |
| `linear.apiKeyFile` | `"~/.agent-queue/linear-api-key"` | The file holding the Linear API key when neither the environment nor apiKeyCommand gives one. Mode 600. |
| `linear.inboxProject` | `"Alex Inbox"` | The Linear project ask-human.sh files an ask into when the ask is not about a ticket. |
| `linear.sizeLabelGroup` | `"Size"` | The Linear label group whose child labels (S, M, L) size a ticket. |
| `linear.labels` | `{"ready":"agent-ready","building":"agent-building","stuck":"agent-s...` | ready, building and stuck are the queue's state machine. needsHuman marks a ticket with an open ask. sentry, mechanical and judgment drive the Sentry lane; leave them as they are if you have no Sentry triage. |
| `linear.states` | `{"inProgress":"In Progress","verifying":"Verifying"}` | Workflow state names on the team. A claimed ticket moves to inProgress; a merged one to verifying. |
| `linear.verifyEvidenceHeading` | `"## Verify evidence"` | merged-to-verifying.mjs leaves a ticket in Done only when its newest comment with this heading came after the merge and has no FAIL cell. |

## `slack`

| Key | Example | What it does |
|---|---|---|
| `slack.domain` | `"your-workspace"` | The subdomain in https://<domain>.slack.com, used to build thread links. |
| `slack.channel` | `"C0000000000"` | The channel ID asks and progress lines go to. Keep the channel private: it carries ticket titles. |
| `slack.channelName` | `"#agent-queue"` | The channel's display name, used in docs and prompts. |
| `slack.webhookFile` | `"~/.agent-queue/slack-webhook"` | An incoming-webhook URL for progress lines (started, PR opened, merged). Mode 600. Missing means no progress posts. |
| `slack.botTokenFile` | `"~/.agent-queue/slack-bot-token"` | A bot token with chat:write, for asks and the reviewer DM. Mode 600. Missing means asks stay in Linear until a machine that has it sweeps them. |

## `reviewer`

| Key | Example | What it does |
|---|---|---|
| `reviewer.name` | `"Sam"` | How prompts, notes and ticket comments name the reviewer. |
| `reviewer.github` | `"sam-github-login"` | Their GitHub login: requested as reviewer, and the only login whose review counts for a judgment PR. |
| `reviewer.slackUser` | `"U0000000000"` | Their Slack user ID, for the one DM per PR. |
| `reviewer.fallbackChannel` | `"C0000000000"` | Where the DM goes, with a mention, when Slack refuses it (the app's Messages tab is off). |

## `fleet`

| Key | Example | What it does |
|---|---|---|
| `fleet.primaryAccount` | `"a"` | The account whose config dir is ~/.claude, which the human's own sessions use. The dispatcher spreads work away from it. fleet.sh always gives ~/.claude the label a, so keep this at "a". |
| `fleet.mainCheckoutWritableDirs` | `[]` | Folders under repoPath that fleet/hooks/protect-main-checkout.sh leaves open to file writes (git run from inside them stays blocked), e.g. [".claude/builds"] for a build skill's state. Name only folders the repo's .gitignore ignores. The worktree folder (worktreesDir) is always open. |

## `dispatcher`

| Key | Example | What it does |
|---|---|---|
| `dispatcher.enabledHosts` | `["main-mac"]` | Short hostnames (hostname -s) that run ticks. A host missing here does nothing. |
| `dispatcher.hosts` | `{"main-mac":{"maxWorkers":4,"accounts":["a","b","c"],"fallbackAccou...` | Per machine: maxWorkers caps working fleet workers there (queue and outside ones). accounts limits which fleet accounts it may use; fallbackAccounts get work only when no regular account can take it. maxLoadPerCore and minMemoryFreePercent override the defaults below. sentryWorkers are side slots kept for Sentry tickets. |
| `dispatcher.maxConcurrent` | `8` | Workers across all machines, counted through the building label. A bundle counts as one. |
| `dispatcher.maxDispatchesPerDay` | `null` | null means no daily cap; worker slots and maxConcurrent still bound the queue. |
| `dispatcher.maxLoadPerCore` | `1.5` | A machine whose 5-minute load average is over this times its core count claims nothing that tick. |
| `dispatcher.minMemoryFreePercent` | `20` | A machine with less memory free than this claims nothing that tick (macOS memory pressure level, or MemAvailable on Linux). |
| `dispatcher.headroomFloorPercent` | `30` | An account needs at least this much left in both its 5-hour and weekly windows to get work. |
| `dispatcher.workerCap` | `8` | fleet.sh --max-workers for each dispatch: working background sessions one account may hold. |
| `dispatcher.stallHours` | `3` | Hours with nothing moving (no commit, no PR activity, worker not busy) before the human gets one stall note. A ticket goes stuck only when its worker has also ended. |
| `dispatcher.spinHours` | `6` | Hours a worker may stay busy without a commit or PR change before it counts as stalled. |
| `dispatcher.longRunNoticeHours` | `8` | An informational "still going" Slack line every this many hours of a ticket's build. |
| `dispatcher.stuckInARowTrips` | `2` | This many stuck tickets in a row pause the dispatcher. |
| `dispatcher.maxRedispatches` | `1` | Replacement workers a ticket gets when its worker's session dies (a reboot, say) before it can go stuck. |
| `dispatcher.flakeWaitMinutes` | `90` | How long a failure on a merge commit waits for a later main commit to pass the same workflow before it pauses the queue. |
| `dispatcher.model` | `"opus"` | The model every queue worker runs (fleet.sh dispatch --model). |
| `dispatcher.effort` | `"high"` | The reasoning effort every queue worker runs at (low, medium, high, xhigh, max). |
| `dispatcher.permissionMode` | `null` | The Claude Code permission mode for queue workers and the red-main responder (fleet.sh dispatch --mode). null keeps fleet.sh's default, bypassPermissions: workers run unattended, and one that stops at a permission prompt has stalled. In that mode a worker can run any command your user can, so run the queue under a user and on a machine where that is acceptable. A stricter mode (auto, acceptEdits) trades that for workers that may stop and wait. |
| `dispatcher.notify` | `true` | macOS notifications per transition. Linux hosts rely on Slack. |
| `dispatcher.queueSizes` | `["S","M","L"]` | Size labels the queue takes. A ready ticket with another size is sent back. |
| `dispatcher.riskyPathPatterns` | `["^migrations/","^\\.github/","^\\.husky/","dockerfile","auth","ses...` | Matched case-insensitively against every changed path and rename source. A green PR touching one goes to the orchestrator session for review and merge (shared merge-requests/). |
| `dispatcher.bundle` | `{"enabled":true,"maxTickets":3,"sizes":["S","M"]}` | Up to maxTickets linked agent-ready tickets from one project, of a size in sizes, ride on one worker and one PR. A ticket whose description has a 'Ships alone: <reason>' line never bundles. |
| `dispatcher.sentryHeartbeatMinutes` | `45` | While a host with sentryWorkers wrote its heartbeat (sharedDir/heartbeats) under this many minutes ago and is unpaused, other machines leave Sentry tickets to it. |
| `dispatcher.sentryTriage` | `{"enabled":false,"host":"main-mac","module":"sentry-triage.mjs"}` | An optional triage module you write (this repo ships none), loaded from dispatcher/ on host only, behind enabled. It exports kickFromTick({ cfg, dry, log }), which should start its run in a detached process, and statusLine(cfg). It labels the tickets it queues with linear.labels.sentry plus mechanical or judgment. A throw or syntax error in it is one log line and never stops a tick. |
| `dispatcher.externalBuilders` | `{"fallback":{"enabled":false,"engines":["codex","grok"],"sizes":["S...` | Codex and Grok as queue workers (dispatcher/README.md, "Codex and Grok as queue workers"). All settings are under fallback: enabled (off by default), engines, sizes, maxRounds, timeoutSeconds, limitCooldownMinutes, loopbackPorts, extraHosts, env, ghTokenFile, claudeOnlyLabel, withholdPatterns and brief; each has its own Note in the example config. An engine takes a slot in hosts.<name>.maxWorkers like a Claude worker, is ranked with the Claude accounts by weekly usage left, never takes a Sentry ticket or a claudeOnlyLabel ticket, and its PR always goes to the orchestrator for review and merge. It reuses premerge.installCommand for its dependencies and push.gates for its gated push. |

## `push`

| Key | Example | What it does |
|---|---|---|
| `push.gates` | `[["pnpm","format:check"],["pnpm","type-check"]]` | Commands gated-push.mjs runs in the worktree before pushing, each an argv array. A failing gate fails the push. |
| `push.env` | `{}` | Extra environment for the git push itself, e.g. {"SKIP_PREPUSH": "1"} when gates above replace a slow pre-push hook. |

## `premerge`

| Key | Example | What it does |
|---|---|---|
| `premerge.installCommand` | `["pnpm","install","--frozen-lockfile","--prefer-offline"]` | Runs in the scratch worktree before the check. null or [] skips it. |
| `premerge.checkCommand` | `["pnpm","type-check"]` | Runs in the scratch worktree after current main is merged into the PR. {base} is replaced with the main commit the PR's CI ran against, for a check that only covers what changed since. |
| `premerge.errorPattern` | `"error TS\\d+"` | A failing check counts as a real failure only when its output matches this. Anything else (killed, timed out) holds the merge a tick instead. |
| `premerge.copyFiles` | `[".env"]` | Files copied from repoPath into the scratch worktree when it is first made (gitignored files the check needs). |
| `premerge.buildOutputRoots` | `["packages"]` | Each package under these folders has its dist/ and *.tsbuildinfo cleared before the check, so a previous check's output never shadows this tree. |
| `premerge.migrations` | `{"dir":"migrations","pattern":"^\\d{14}_.*\\.sql$","prefixLength":14}` | Two PRs that each pick the same migration prefix pass alone and clash once merged. Set to null if your migrations have no ordered prefix. |
| `premerge.actionlint` | `true` | When the merged workflows differ from main's, lint both with actionlint (if installed) and fail on findings main does not have. false skips it. |

## `mainWatch`

| Key | Example | What it does |
|---|---|---|
| `mainWatch.accounts` | `["b","c"]` | Fleet accounts an emergency responder may run on. |
| `mainWatch.model` | `"opus"` | The model the emergency responder runs. |
| `mainWatch.maxWorkers` | `12` | fleet.sh --max-workers for the responder, set high so it starts beyond the regular worker cap. |
| `mainWatch.realertMinutes` | `30` | While main stays red, alert again every this many minutes. |
| `mainWatch.maxResponders` | `2` | Responders started per red streak (a second one only when the first has ended). |
| `mainWatch.ignoreJobs` | `[]` | CI job names to leave out of the failing-jobs list (an aggregate job that only reports the others, say). |

## `queueBoard`

| Key | Example | What it does |
|---|---|---|
| `queueBoard.host` | `"main-mac"` | The short hostname (hostname -s) of the machine that runs the board. One board covers every queue machine. hourly-check.mjs reads the board on loopback there, and by this name from any other machine. Leave it null to mean the machine the script runs on. |
| `queueBoard.port` | `8787` | The board's port. The QUEUE_BOARD_PORT environment variable wins over it. |
| `queueBoard.bind` | `["127.0.0.1"]` | Addresses the board listens on. Literal addresses are bound at start; the word "tailscale" binds this machine's Tailscale address (tailscale ip -4) once Tailscale is up, so your other devices on the tailnet can open the board. With it the board also answers at the machine's HTTPS name once you run tailscale serve (queue-board/README.md, "Over HTTPS, for a phone"). Keep it off the LAN and 0.0.0.0: anyone who can reach the board can type into a worker's session. |
| `queueBoard.ssh` | `{"linux-box":"you@linux-box"}` | How the board reaches each other host in dispatcher.enabledHosts: an ssh destination (an alias from ~/.ssh/config works). A host missing here is reached by its own name. The board's own host is read directly; its entry, if any, only builds the copyable ssh attach command for a viewer on another machine. Needs key-based login (BatchMode). |
| `queueBoard.names` | `{"main-mac":"main","linux-box":"linux"}` | Short names the page shows for each host. A host missing here shows its hostname. |
| `queueBoard.remoteRoot` | `null` | Where this repo is checked out on the other hosts. The board runs node <remoteRoot>/queue-board/collect.mjs (and history.mjs, worktrees.mjs, ext-usage.mjs, send.py) there over ssh, and those read that host's own agent-queue.config.json, so each host finds its own paths.stateDir. A path that starts with ~/, or sits under the board machine's home, is taken relative to each host's own home. null means the same place as this checkout on the board's host. |
| `queueBoard.repoRoots` | `["~/dev"]` | Folders whose direct child git repos the Worktrees view scans on every host. Include the folder that holds repoPath. Defaults to workspaceCwd. |
| `queueBoard.extUsage` | `true` | Show the Codex and Grok plan usage of every host (ext-usage.mjs asks each CLI's read-only billing call once an hour). false turns it off when you have neither CLI. |
| `queueBoard.healthUrl` | `null` | A URL on the environment your base branch deploys to (staging), answering JSON with a commit field. hourly-check.mjs reports when it serves an older commit than the branch head for over 2 hours. null skips that check, e.g. "https://api.staging.example.com/health". |
| `queueBoard.realms` | `{"main-mac":"rivendell","linux-box":"erebor"}` | The Middle-earth realm each host is drawn as on the map: "rivendell" (elves), "shire" (hobbits) or "erebor" (dwarves). A host with no entry is a machine of Rohan. Leave the key out and the first three hosts in dispatcher.enabledHosts get Rivendell, the Shire and Erebor in that order. |
| `queueBoard.nicknames` | `{"rivendell":["Elrond","Galadriel","Legolas","Arwen","Thranduil","H...` | Name pools for the workers the board shows. A live worker takes the least recently given free name from the first pool that fits: adhoc for a worker started outside the queue, sentry for a Sentry-slot worker, then a pool keyed by its host name, then by its realm (realms above), then other. When every name in a pool is in use, names get a number ("Frodo 2"). Leave the key out and workers show without names. |
| `queueBoard.reviewChecks` | `null` | Optional regex source for checks that belong to the review besides github.reviewCheck (a job that runs or re-requests it, say), e.g. "^(request-review\|claude-review\\b)". The board leaves them out of a PR's CI counts. null leaves out only github.reviewCheck. |
| `queueBoard.reviewNotStartedTitles` | `["^Re-review not requested","^Review not run","^CI not green"]` | Regex sources for the titles a failed github.reviewCheck carries when no review has run on the head yet. Such a failure shows as a missing review instead of a failing one. [] counts every failure as failing. |
| `queueBoard.soundFile` | `null` | The sound settings file (mute, volume, per-event switches, music volume). null means <paths.sharedDir>/queue-board/sound.json, in the shared folder so Mute reaches every Mac. A missing file reads as the defaults. |
| `queueBoard.heraldStatusFile` | `null` | Where the herald (herald.mjs) writes its last report, which the board's sound panel shows. null means <paths.stateDir>/queue-board/herald-status.json. |
| `queueBoard.heraldNotifierApp` | `null` | Where install-herald.sh builds the herald's notification app (bundle id dev.agent-queue.herald-notifier). null means <paths.stateDir>/queue-board/Forge Herald.app. |
| `queueBoard.musicDir` | `"~/Music"` | The folder of MP3s the header player lists and streams. The QUEUE_BOARD_MUSIC environment variable wins over it. The files stay where they are; nothing is copied. |
| `queueBoard.weather` | `null` | The place whose real weather and daylight the map shows, from Open-Meteo's free API (no key): { "latitude": 40.0, "longitude": -75.0, "timezone": "America/New_York", "place": "Home" } is an example shape. timezone defaults to the board machine's, place is a label. null means no weather: the scene stays dry and the sky clock uses the board machine's time zone. |

## `learning`

| Key | Example | What it does |
|---|---|---|
| `learning.outDir` | `null` | Where the sweep keeps reports/, history.json and cache/. null means <paths.stateDir>/learning. Keep it outside the repo: it holds run data. |
| `learning.ciWorkflowFile` | `null` | The workflow file the CI source reads, e.g. "ci.yml". null finds the workflow named github.ciWorkflow through the Actions API. |
| `learning.skipJobs` | `["^Claude Code Review"]` | Regexes (case-insensitive) for CI job names the CI source leaves out: aggregate or watcher jobs that fail only because another job did, and the review check's job, whose findings the review source counts on their own. |
| `learning.reviewBotLogin` | `"github-actions[bot]"` | The GitHub login whose inline PR review comments count as review findings. A finding's first line reads **[Axis]** Severity: RULE-ID text. |
| `learning.reviewRulesGlob` | `null` | Optional glob under repoPath, e.g. "docs/standards/*.md", for markdown tables of review rules (\| TST-21 \| Rule name \|). The report names a rule with them. null shows rule IDs only. |
| `learning.correctionsGlob` | `null` | Optional glob for the human's feedback memory files, e.g. "~/.claude/projects/<project>/memory/feedback_*.md". Each new or changed file counts as a correction. null turns the source off. |
| `learning.ssh` | `{}` | Other machines whose dispatcher.log the sweep reads, as {"<short hostname>": "user@host"}, e.g. {"linux-box": "you@linux-box"}. The log is read from the same stateDir under the remote home. The local machine is always read from disk; --no-ssh skips these. |
| `learning.catalog` | `[{"id":"pr-body-missing-line","title":"PR body has no machine-read ...` | Failure types of your own, checked before the built-in ones (typecheck, lint, network flake, Postgres connection terminated, out of memory). match is a regex source run against "<job> <signature>" (flags default to i); enforce lists strings whose presence in an enforcement source counts as enforced there; recommend is a fix-ladder level 1 to 6. The example is a PR-template line CI requires; replace it with the line your PR check requires, or set [] if you have none. |
| `learning.enforcementSources` | `[{"path":"~/.claude/hooks","level":3,"pattern":"\\.(sh\|mjs\|js\|py)$"}]` | Extra files or folders searched for a type's enforce strings, each with its fix-ladder level. pattern filters a folder's files (default: every file not starting with a dot). Always searched: repoPath's ESLint config (2), .github/workflows and .husky (3), the PR template (4), its CLAUDE.md (5), ~/.claude/settings.json (3), dispatcher/worker-brief.md and specdesk/SPECDESK.md (4), ~/.claude/CLAUDE.md (5). |
| `learning.draftState` | `"Backlog"` | The workflow state learning/linear.mjs create files a drafted fix ticket in. It never adds the ready label. |
