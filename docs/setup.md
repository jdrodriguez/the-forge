# Setting up The Forge

This guide takes you from nothing to a running queue on one to four computers. The short way is one command and an interview with Claude:

```bash
npx the-forge setup
```

`npm install -g the-forge` then `the-forge setup` also works. For the newest code on GitHub instead of the newest release, use `npx github:jdrodriguez/the-forge setup`, or clone the repository and run `node bin/the-forge.mjs setup --here` in the clone.

`setup` copies The Forge to `~/the-forge` and runs everything from there, then starts Claude Code on the `forge-setup` skill. The skill asks one question at a time and walks you through this guide, or you can follow it by hand. You do every sign-in yourself. `README.md` explains what The Forge does and lists the `the-forge` commands.

## What you need

| Thing | Why | Notes |
|---|---|---|
| One to four computers | They run the workers | Macs or Linux machines. The one that runs the board should stay on. An old laptop or a small Linux box works as an extra worker computer. |
| A Claude plan | Claude Code workers build the tickets | One is enough. Each extra plan is another account with its own limits, and the dispatcher spreads work across them. |
| Codex or Grok plans | Optional extra workers | A ChatGPT plan runs Codex; a SuperGrok plan runs Grok. They take small tickets when your Claude accounts are busy. |
| A GitHub repository | What the queue builds | With CI on pull requests. An AI review check (such as Claude Code Review) is optional. |
| A Linear workspace | Where tickets live | A personal API key, a few labels and two workflow states (below). |
| Slack | Optional | One private channel for questions and progress lines. Without it, questions wait in Linear. |
| Tailscale | Only with two or more computers | A private network between your computers that works from anywhere. Free for personal use. |

## What each computer runs

| Computers | The board's computer runs | Every other computer runs |
|---|---|---|
| 1 | the dispatcher, the board, the herald, the red-main watcher, and the workers | (none) |
| 2 to 4 | the same as above | its own dispatcher and its workers |

With one computer the board still draws four realms (Rivendell, the Shire, Erebor and Rohan) and spreads the workers across them. With two to four, each computer is one realm, in that order.

The herald needs a Mac. On a Linux board computer the board runs as a systemd service without it. Run the herald on a Mac with `queue-board/install-herald.sh --base http://<board>:8787`.

## Install the programs

Every computer needs Node 22 or newer, git, gh, jq, curl, perl and Claude Code. `the-forge doctor` lists what is missing.

| Program | macOS | Ubuntu Linux |
|---|---|---|
| Homebrew (macOS only) | see https://brew.sh | |
| Node 22+, jq, gh | `brew install node jq gh` | Node from https://nodejs.org/en/download; `sudo apt install git jq curl`; gh from https://github.com/cli/cli/blob/trunk/docs/install_linux.md |
| git | `xcode-select --install` | `sudo apt install git` |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | the same |
| Codex (optional) | `brew install --cask codex`, or `npm install -g @openai/codex` | `npm install -g @openai/codex` |
| Grok (optional) | `curl -fsSL https://x.ai/cli/install.sh \| bash` | the same |
| Tailscale | the app from https://tailscale.com/download | `curl -fsSL https://tailscale.com/install.sh \| sh` |

If a command has changed, check the source: Claude Code https://code.claude.com/docs/en/setup, Codex https://developers.openai.com/codex/cli, Grok https://x.ai/docs/build/overview, Tailscale https://tailscale.com/docs/install.

## Claude accounts

Each Claude account on a computer has its own config folder. Your main account, the one you use yourself, is `~/.claude` with the label `a`. Every other account gets a short label (`b`, `c`, `d`) and the folder `~/.claude-<label>`. With one account, it is both yours and the worker, so sign it in on every computer.

- Sign the main account in on each computer: run `claude` once, then `/login`. Over SSH, run `ssh -t <computer> claude auth login`, open the link it prints in this computer's browser, sign in, and paste the code back.
- Add every other account with `fleet/setup/add-account.sh here <label> <email>` on this computer, or `fleet/setup/add-account.sh <computer> <label> <email>` for another. It makes the folder, links it to the shared settings in `~/.claude`, starts the sign-in, and trusts your workspace folder.
- Workers start in the folder above your repository (`workspaceCwd`, default `~/dev`), which each account must have trusted once. For your main account, run `claude` once in that folder and accept the trust prompt. Doctor checks every worker account.
- Accept the bypass-permissions notice once on each computer: `claude --dangerously-skip-permissions`, accept, then `/exit`. In that mode a worker can run any command your user can (see Safety in `README.md`).

`fleet/README.md` has the details.

## Codex and Grok

On each computer that should run Codex or Grok, install the CLI and sign in with `codex login` or `grok login` (over SSH, add `--device-auth`: `codex login --device-auth`, `grok login --device-auth`). An engine runs only on the computers your answers give it (`dispatcher.hosts.<name>.engines`). It gets only small tickets (sizes S and M by default), never Sentry tickets and never tickets labelled `claude-only`. `dispatcher/README.md` says what their sandbox does and does not protect.

## Two or more computers: Tailscale and SSH

The board's computer reads the others over SSH, and you set them up from it.

1. Install Tailscale on every computer and sign each in to the same account: the app on a Mac, `sudo tailscale up` on Linux. Each computer then has a Tailscale name that works from anywhere.
2. Turn on SSH on each other computer. On a Mac: System Settings, General, Sharing, Remote Login. On Linux: `sudo apt install openssh-server`.
3. On the board's computer, make a key if you have none (`ssh-keygen -t ed25519`), then copy it to each other computer with `ssh-copy-id <user>@<name>`. You type that computer's password once.
4. Check: `ssh -o BatchMode=yes <user>@<name> true` prints nothing and succeeds.
5. On a Linux computer, let its jobs run while nobody is logged in: `sudo loginctl enable-linger <user>`.
6. Sync the dispatchers' shared folder, `~/.agent-queue/shared` (`paths.sharedDir`), between all computers. Syncthing works: `brew install syncthing && brew services start syncthing` on a Mac, `sudo apt install syncthing && systemctl --user enable --now syncthing` on Linux. Open http://127.0.0.1:8384 on each computer, add the others as devices, and share the folder with them. With another sync tool, point `paths.sharedDir` at its folder.

## GitHub

Sign in with `gh auth login` on every computer, as the account the queue merges with. On Linux over SSH there is no keychain, so add `--insecure-storage`. Clone your repository on every computer at the same path (default `~/dev/<name>`): `gh repo clone <owner>/<name> ~/dev/<name>`.

## Linear

1. Make a personal API key: Linear, Settings, Security and access, Personal API keys.
2. Save it on each computer without it showing on screen. Run this in your own terminal (zsh or bash) and paste the key when asked:

   ```bash
   mkdir -p ~/.agent-queue && chmod 700 ~/.agent-queue && printf 'Paste the key, then Enter: ' && stty -echo && read -r k; stty echo; echo; (umask 077; printf '%s\n' "$k" > ~/.agent-queue/linear-api-key); unset k
   ```

   Or copy the file to another computer after running the `mkdir` above there: `scp -p ~/.agent-queue/linear-api-key <user>@<name>:.agent-queue/`. With a secrets manager, set `linear.apiKeyCommand` in the answers instead.
3. On your team, add the workflow states In Progress and Verifying, a label group named Size with the labels S, M and L, and the labels agent-ready, agent-building, agent-stuck and needs-human.

## Slack (optional)

Make a Slack app for your workspace (https://api.slack.com/apps). Turn on Incoming Webhooks and add one for your channel. Under OAuth and Permissions, add the bot scope `chat:write`, install the app, and invite it to the channel. Save the webhook address as `~/.agent-queue/slack-webhook` and the bot token as `~/.agent-queue/slack-bot-token`, with the same command as the Linear key and the file name changed. The channel ID is at the bottom of the channel's details.

## The answers file

The interview writes `~/the-forge/forge-answers.json`, and `the-forge init --answers forge-answers.json` turns it into `agent-queue.config.json`. To change the config, edit the answers and run init again. It keeps the old config as a backup. The file holds names and addresses, never a secret. This example has two computers, two Claude accounts, and Codex on the first:

```json
{
  "person": { "name": "Alex" },
  "computers": [
    { "host": "studio", "system": "macos", "board": true, "codex": true },
    { "host": "tower", "system": "linux", "ssh": "alex@tower", "grok": false }
  ],
  "claudeAccounts": [
    { "label": "a", "main": true, "worker": false, "computers": ["studio"] },
    { "label": "b", "worker": true, "computers": ["studio", "tower"] }
  ],
  "repository": {
    "github": "example-org/example-app", "githubUser": "alex-example", "path": "~/dev/example-app",
    "check": ["npm", "run", "type-check"], "install": ["npm", "ci"], "gates": [["npm", "run", "lint"]],
    "ciWorkflow": "CI", "reviewCheck": null
  },
  "linear": { "workspace": "example", "team": "ABC" },
  "slack": { "domain": "example", "channel": "C0123456789", "channelName": "#forge" },
  "weather": { "latitude": 40.0, "longitude": -75.0, "timezone": "America/New_York", "place": "Home" }
}
```

| Field | Meaning |
|---|---|
| `computers[]` | 1 to 4. `host` is what `hostname -s` prints there. `system` is `macos` or `linux`. Exactly one has `board: true`. Every other one needs `ssh`, how the board's computer reaches it. `codex` and `grok` say whether that computer runs them. `maxWorkers` (optional) caps its workers; the default is two per account and engine there, at most 4. `name` (optional) is a short name for the board. |
| `claudeAccounts[]` | One per Claude account. The main one has `label: "a"` and `main: true`. `worker` (default true) says whether it builds tickets. `computers` lists where it is signed in (default: all). With one account, it is main and worker on every computer. |
| `repository` | `github` (owner/name), `githubUser` (the login the queue merges as), `path` (written `~/...`, at least two levels under the home folder, the same on every computer), `check` (the command the pre-merge check runs, required), and optionally `install`, `gates` (commands run before every push), `errorPattern`, `ciWorkflow` (default CI), `reviewCheck` (default none), `baseBranch` (default main), `copyFiles`, `buildOutputRoots`, `migrations`. |
| `linear` | `workspace`, `team` (the ticket prefix), and optionally `inboxProject` and `apiKeyCommand`. |
| `slack`, `weather`, `realms`, `reviewer`, `spreadRealms`, `copyDir` | Optional. `realms` maps a host to `rivendell`, `shire`, `erebor` or `rohan`. `copyDir` is where the copy lives on every computer (default `~/the-forge`). |

`errorPattern` decides which failing pre-merge checks are real failures. A killed or timed-out run is always held a tick instead. The default is the TypeScript compiler's `error TS\d+` when `check` runs tsc or a type-check, and any output at all otherwise.

With two or more computers, init binds the board to its Tailscale address too, so the other computers and your phone on the tailnet can open it.

`docs/configuration.md` explains every key of the config init writes.

## One computer

Answer 1 computer. Doctor checks this computer only. `the-forge install` puts the dispatcher, the red-main watcher, the board and the herald here. `the-forge open` shows four realms.

## Two, three or four computers

Pick the computer that stays on for the board. For each other computer, once Tailscale and SSH work:

```bash
the-forge copy-to <host>                                   # the copy, the config and the skill links
ssh -t <user>@<name> 'node ~/the-forge/bin/the-forge.mjs install'
```

Every computer keeps its own copy at the same place (`queueBoard.remoteRoot`, default `~/the-forge`). Run `the-forge doctor` on the board's computer, which also checks SSH and the copy on every other one, then on each other computer: `ssh <user>@<name> 'node ~/the-forge/bin/the-forge.mjs doctor'`.

## Start, check and the first ticket

```bash
the-forge install    # this computer's jobs
the-forge doctor     # until it says the computer is ready
the-forge status     # each job, the board, and whether the dispatcher is paused
the-forge open       # the board
```

Write one small ticket in Linear that meets `docs/ticket-spec.md` (size S, a priority, a project, acceptance scenarios). Run `node dispatcher/dispatcher.mjs check ABC-1`, add the agent-ready label, and start a tick now: `launchctl kickstart gui/$(id -u)/dev.agent-queue.dispatcher` on a Mac, `systemctl --user start agent-queue-dispatcher.service` on Linux. A worker appears on the board and opens a pull request.

For daily use, pin a Claude Code session named Specdesk (`orchestrator.sessionName`) and run `/specdesk` in it. The end of README.md's Set up section lists the watchers it keeps.

## Later

- **Add a computer:** add it to `forge-answers.json`, run `the-forge init --answers forge-answers.json`, set up Tailscale and SSH for it, run `the-forge copy-to <host> --install`, then `copy-to` every other computer so each has the new config.
- **Update:** `npx the-forge@latest update --all` refreshes `~/the-forge` here and on every other computer and reloads the jobs. After a global install, run `npm install -g the-forge` then `the-forge update --all`. A copy that is a git clone pulls instead. Your config and answers stay.
- **Stop for a while:** `the-forge stop` unloads this computer's jobs and `the-forge start` brings them back. To hold the whole queue, run `node dispatcher/dispatcher.mjs pause "reason"`, and `resume` later.
- **Remove:** `the-forge uninstall` on each computer, then delete `~/the-forge` and `~/.agent-queue`.
