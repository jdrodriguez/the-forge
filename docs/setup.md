# Setting up The Forge

This guide takes you from nothing to a running queue on one, two, three or four computers. The short way is one
command and an interview with Claude:

```bash
npx the-forge setup
```

Until the package is published, run it from the repository instead (you need read access to it, and gh signed in):
`npx github:<owner>/the-forge setup`, or clone it and run `node bin/the-forge.mjs setup --here` in the clone.

`setup` copies The Forge to `~/the-forge`, checks which programs are missing, links its skills into Claude Code, and
starts Claude Code on the `forge-setup` skill. The skill asks one question at a time and walks you through the rest
of this guide. You can also follow this guide by hand. Either way, you do every sign-in yourself: the skill and this
guide name the command, and no part of The Forge asks for, stores or prints a password, token or key.

## What The Forge does

You write tickets in Linear with a Claude session (the spec desk). A dispatcher on each of your computers picks up
ready tickets every 20 minutes and hands each one to a Claude Code worker, which builds it into one pull request in
your repository. When CI and the review are green, the dispatcher merges it. A board in your browser draws the whole
queue as Middle-earth: each computer is a realm, each worker a figure at its station. `README.md` has the full loop.

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

With one computer the board still draws four realms (Rivendell, the Shire, Erebor and Rohan) and spreads the workers
across them as they take tickets. With two to four, each computer is one realm, in that order.

The herald plays sounds and posts notifications on a Mac. On a Linux board computer the board runs as a systemd
service and the herald is left out; run it on a Mac with `queue-board/install-herald.sh --base http://<board>:8787`.

## Install the programs

Every computer needs Node 22 or newer, git, gh, jq, curl, perl and Claude Code. `the-forge doctor` lists what is
missing.

| Program | macOS | Ubuntu Linux |
|---|---|---|
| Homebrew (macOS only) | see https://brew.sh | |
| Node 22+, jq, gh | `brew install node jq gh` | Node from https://nodejs.org/en/download; `sudo apt install git jq curl`; gh from https://github.com/cli/cli/blob/trunk/docs/install_linux.md |
| git | `xcode-select --install` | `sudo apt install git` |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | the same |
| Codex (optional) | `brew install --cask codex`, or `npm install -g @openai/codex` | `npm install -g @openai/codex` |
| Grok (optional) | `curl -fsSL https://x.ai/cli/install.sh \| bash` | the same |
| Tailscale | the app from https://tailscale.com/download | `curl -fsSL https://tailscale.com/install.sh \| sh` |

Sources: Claude Code https://code.claude.com/docs/en/setup, Codex https://developers.openai.com/codex/cli, Grok
https://x.ai/docs/build/overview, Tailscale https://tailscale.com/docs/install. Check them if a command has changed.

## Claude accounts

Each Claude account on a computer lives in its own config folder. Your main account, the one you use yourself, is
`~/.claude` and has the label `a`. Every other account gets a short label (`b`, `c`, `d`) and the folder
`~/.claude-<label>`. With one account, that account is both your own and the worker on every computer, so sign it in
on each one.

- Sign the main account in on each computer by running `claude` once and `/login`. Over SSH, run
  `ssh -t <computer> claude auth login`: it prints a link, you open it in this computer's browser, sign in, and paste
  the code back.
- Add every other account with `fleet/setup/add-account.sh here <label> <email>` on this computer, or
  `fleet/setup/add-account.sh <computer> <label> <email>` for another one. It makes the folder, links it to the
  shared settings in `~/.claude`, signs it in (you do the sign-in), and marks your workspace trusted.
- Workers start in the folder above your repository (`workspaceCwd`, default `~/dev`), and each account must have
  trusted it once. `add-account.sh` does that for the accounts it adds. For your main account, run `claude` once in
  that folder and accept the trust prompt. Doctor checks it for every worker account.
- Accept the bypass-permissions notice once on each computer: `claude --dangerously-skip-permissions`, accept, then
  `/exit`. Workers run unattended in that mode, so a worker can run any command your user can. Run the queue under a
  user and on a computer where that is acceptable, or set `dispatcher.permissionMode` to a stricter mode.

`fleet/README.md` has the details.

## Codex and Grok

One Codex or Grok sign-in serves one computer. On each computer that should run them: install the CLI, then sign in
with `codex login` and `grok login`. Init writes each computer's choice as `dispatcher.hosts.<name>.engines`, so an
engine runs only on the computers the answers give it, even where its CLI happens to be signed in. Over SSH, use `codex login --device-auth` and `grok login --device-auth`. The
dispatcher gives them only small tickets (sizes S and M by default), never Sentry tickets and never tickets labelled
`claude-only`. `dispatcher/README.md` says what their sandbox does and does not protect.

## Two or more computers: Tailscale and SSH

The board's computer reads the others over SSH, and you set them up from it.

1. Install Tailscale on every computer and sign each in to the same account: the app on a Mac, `sudo tailscale up` on
   Linux. Each computer then has a Tailscale name that works from anywhere.
2. Turn on SSH on each other computer: on a Mac, System Settings, General, Sharing, Remote Login; on Linux,
   `sudo apt install openssh-server`.
3. On the board's computer, make a key if you have none (`ssh-keygen -t ed25519`), then copy it to each other
   computer: `ssh-copy-id <user>@<name>`. You type that computer's password once.
4. Check: `ssh -o BatchMode=yes <user>@<name> true` prints nothing and succeeds.
5. On a Linux computer, let its jobs run while nobody is logged in: `sudo loginctl enable-linger <user>`.
6. Keep one shared folder the same on every computer. The dispatchers coordinate through `~/.agent-queue/shared`
   (`paths.sharedDir`: merge requests, heartbeats, bundles and the state of main), so it must sync between them.
   Syncthing does this peer to peer over Tailscale: `brew install syncthing && brew services start syncthing` on a
   Mac, `sudo apt install syncthing && systemctl --user enable --now syncthing` on Linux. Open its page at
   http://127.0.0.1:8384 on each computer, add the other computers as devices, and share that folder with them.
   Any tool that keeps a folder identical works; point `paths.sharedDir` at its folder if it is somewhere else.

## GitHub

Sign in with `gh auth login` on every computer, as the account the queue merges with. On Linux over SSH there is no
keychain, so add `--insecure-storage`. Clone your repository on every computer at the same path (default
`~/dev/<name>`): `gh repo clone <owner>/<name> ~/dev/<name>`.

## Linear

1. Make a personal API key: Linear, Settings, Security and access, Personal API keys.
2. Save it on each computer without it showing on screen. Run this in your own terminal and paste the key when asked:

   ```bash
   mkdir -p ~/.agent-queue && chmod 700 ~/.agent-queue && printf 'Paste the key, then Enter: ' && stty -echo && read -r k; stty echo; echo; (umask 077; printf '%s\n' "$k" > ~/.agent-queue/linear-api-key); unset k
   ```

   It works in zsh and bash. `stty -echo` keeps the key off the screen while you paste it.

   Or copy the file to another computer over SSH: `scp -p ~/.agent-queue/linear-api-key <user>@<name>:.agent-queue/`
   (after the `mkdir` above there). With a secrets manager, set `linear.apiKeyCommand` in the answers instead.
3. On your team: the workflow states In Progress and Verifying, a label group named Size with the labels S, M and L,
   and the labels agent-ready, agent-building, agent-stuck and needs-human.

## Slack (optional)

Make a Slack app for your workspace (https://api.slack.com/apps). Turn on Incoming Webhooks and add one for your
channel. Under OAuth and Permissions, add the bot scope `chat:write`, install the app, and invite it to the channel.
Save the webhook address as `~/.agent-queue/slack-webhook` and the bot token as `~/.agent-queue/slack-bot-token`
with the same command as the Linear key (change the file name at its end). The channel ID is at the bottom of the channel's details.

## The answers file

The interview writes `~/the-forge/forge-answers.json`, and `the-forge init --answers forge-answers.json` turns it
into `agent-queue.config.json`. Init is the only thing that writes the config, so to change anything, change the
answers and run init again (it keeps the old config as a backup). The file holds names and addresses, never a secret.
Two computers, two Claude accounts, Codex on the first:

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
| `computers[]` | 1 to 4. `host` is what `hostname -s` prints there. `system` is `macos` or `linux`. Exactly one has `board: true` (with one computer, it is that one). Every other one needs `ssh`, how the board's computer reaches it. `codex` and `grok` say whether that computer runs them. `maxWorkers` (optional) caps its workers; the default is two per account and engine there, at most 4. `name` (optional) is a short name for the board. |
| `claudeAccounts[]` | One per Claude account. The main one has `label: "a"` and `main: true`. `worker` (default true) says whether it builds tickets. `computers` lists where it is signed in (default: all). With one account, it is main and worker on every computer. |
| `repository` | `github` (owner/name), `githubUser` (the login the queue merges as), `path` (written `~/...`, at least two levels under the home folder, the same on every computer), `check` (the command the pre-merge check runs, required), and optionally `install`, `gates` (commands run before every push), `errorPattern`, `ciWorkflow` (default CI), `reviewCheck` (default none), `baseBranch` (default main), `copyFiles`, `buildOutputRoots`, `migrations`. |
| `linear` | `workspace`, `team` (the ticket prefix), and optionally `inboxProject` and `apiKeyCommand`. |
| `slack`, `weather`, `realms`, `reviewer`, `spreadRealms` | Optional. `realms` maps a host to `rivendell`, `shire`, `erebor` or `rohan`. `copyDir` (optional) is where the copy lives on every computer (default `~/the-forge`). |

`errorPattern` decides which failing pre-merge checks are real failures (a killed or timed-out run is always held a
tick instead). Its default is the TypeScript compiler's `error TS\d+` when `check` runs tsc or a type-check, and any
output at all otherwise. With two or more computers, init also binds the board to its Tailscale address, so the other
computers and your phone on the tailnet can open it.

`docs/configuration.md` explains every key of the config init writes.

## One computer

Answer 1 computer. Doctor checks this computer only. `the-forge install` puts the dispatcher, the red-main watcher,
the board and the herald here. `the-forge open` shows four realms.

## Two, three or four computers

Pick the computer that stays on for the board. For each other computer, after Tailscale and SSH work:

```bash
the-forge copy-to <host>                                   # the copy, the config and the skill links
ssh -t <user>@<name> 'node ~/the-forge/bin/the-forge.mjs install'
```

Every computer keeps its own copy at the same place (`queueBoard.remoteRoot`, default `~/the-forge`), because its
jobs run from it and the board runs scripts there over SSH. Run `the-forge doctor` on the board's computer: it also
checks SSH and the copy on every other one. Then run doctor on each other computer:
`ssh <user>@<name> 'node ~/the-forge/bin/the-forge.mjs doctor'`.

## Start, check and the first ticket

```bash
the-forge install    # this computer's jobs
the-forge doctor     # until it says the computer is ready
the-forge status     # each job, the board, and whether the dispatcher is paused
the-forge open       # the board
```

Then write one small ticket in Linear that meets `docs/ticket-spec.md` (size S, a priority, a project, acceptance
scenarios), run `node dispatcher/dispatcher.mjs check ABC-1`, add the agent-ready label, and start a tick without
waiting: `launchctl kickstart gui/$(id -u)/dev.agent-queue.dispatcher` on a Mac,
`systemctl --user start agent-queue-dispatcher.service` on Linux. A worker appears on the board and opens a pull
request. For daily use, pin a Claude Code session named Specdesk (`orchestrator.sessionName`) and run `/specdesk` in
it; the end of README.md's Set up section lists the watchers it keeps.

## Later

- **Add a computer:** add it to `forge-answers.json`, run `the-forge init --answers forge-answers.json`, set up
  Tailscale and SSH for it, then `the-forge copy-to <host> --install`, and `copy-to` every other computer so each has
  the new config.
- **Update:** `npx the-forge@latest update --all` refreshes `~/the-forge` here and on every other computer and
  reloads the jobs. A copy that is a git clone pulls instead. Your config and answers stay.
- **Stop for a while:** `the-forge stop` unloads this computer's jobs; `the-forge start` brings them back. To hold the
  whole queue, `node dispatcher/dispatcher.mjs pause "reason"`, and `resume` later.
- **Remove:** `the-forge uninstall` on each computer, then delete `~/the-forge` and `~/.agent-queue`.
