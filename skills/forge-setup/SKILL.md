---
name: forge-setup
description: Set up The Forge (the agent queue and its board) on one to four computers by interviewing the person. Use when the session was started by `the-forge setup`, when the person types /forge-setup, or when they ask to set up, add a computer to, or repair The Forge.
---

# Set up The Forge

You are setting up The Forge for a person who may never have seen it. `the-forge setup` started you in the lasting
copy (default `~/the-forge`). Every command below runs from that folder. Call the CLI as `node bin/the-forge.mjs`
(it is also linked as `the-forge` in `~/.local/bin`). `docs/setup.md` in this folder is the written guide to the same
ground: read it now, in full, before your first question. It has the install command for every program and the
format of the answers file.

## Rules for the whole session

- **Ask one question at a time.** Wait for the answer before the next. Offer the default when there is one.
- **Signing in is always the person's own step.** For Claude, Codex, Grok, GitHub, Tailscale and npm, name the exact
  command, ask them to run it in a terminal window of their own (a sign-in asks questions, opens a browser or wants a
  password, which this session cannot answer for them), and wait until they say it is done. Then check it (doctor,
  or the command's status form). Every sign-in command below is theirs to run.
- **Never ask for, read, print or store a password, token, key or webhook address.** Not in the answers file, not in a
  command you run, not in this conversation. The Linear key and the Slack files are saved by the person, with the
  commands in docs/setup.md, which read from the clipboard and print nothing. Never `cat` a file under
  `~/.agent-queue`.
- **Only `the-forge init` writes the config.** You write the answers file; init turns it into
  `agent-queue.config.json`. Never edit the config by hand. To change something, change the answers and run init again.
- **Tell the person before anything that installs a job or reaches another computer**, in one line, then do it.
- Plain words. The person may not know Tailscale, SSH or what a config folder is. Explain each in a sentence the
  first time it comes up.

## 1. The interview

Ask these, in this order, one at a time:

1. How many computers will run The Forge? (1 to 4. One is enough: the board still shows the whole map.)
2. How many Claude accounts do you have? (Each paid Claude plan is one account. One is enough.)
3. How many Codex accounts (ChatGPT plans), if any? (0 is fine.)
4. How many Grok accounts (SuperGrok plans), if any? (0 is fine.)
5. With more than one Claude account: which one is your main account, the one you use yourself? It lives in
   `~/.claude` and gets label `a`. The others get labels `b`, `c`, `d`, each in its own folder `~/.claude-<label>`.
6. With more than one Claude account: which accounts should build tickets (the workers)? The main one can be a
   worker too. With one account, say that it is both main and worker, and skip this question.

Then what the config needs, still one at a time:

7. For each computer: its short name (run `hostname -s` yourself for this computer; on another one, the person runs
   it there), whether it is a Mac or Linux, and for every computer but the board's, how this computer reaches it
   over SSH (`user@name`, or the Tailscale name once Tailscale is up; it can wait until step 3).
8. Which computer runs the board? (Default: this one. It must stay on.)
9. With more than one computer and more than one Claude account: which computers each account is signed in on.
   (Default: every worker account on every computer, the main account on this one.)
10. With Codex or Grok: which computers run each. One Codex or Grok sign-in serves one computer, so the count from
    questions 3 and 4 is how many computers get it.
11. Their name, as the queue should call them in prompts and messages.
12. The repository the queue builds: `owner/name` on GitHub, and where it is (or should be) cloned on each computer
    (default `~/dev/<name>`). Read the repo yourself to propose the rest, then confirm each with the person:
    the command that type-checks or tests it before a merge (`repository.check`, from its package.json, Makefile or
    the like), the install command (`repository.install`), the pre-push gates (`repository.gates`), the CI
    workflow's name (`repository.ciWorkflow`, from `.github/workflows`), and the AI review check if it has one
    (`repository.reviewCheck`; leave it out when there is none).
13. Their GitHub login, the account the queue merges as. When gh is signed in, run `gh api user -q .login` and confirm.
14. The Linear workspace (the slug in `https://linear.app/<workspace>/`) and the team key (the ticket prefix).
15. Optional: Slack (the workspace's subdomain and a channel ID). Without it, questions reach them in Linear only.
16. Optional: the place whose weather and daylight the map shows. Look it up yourself with
    `curl -s 'https://geocoding-api.open-meteo.com/v1/search?count=1&name=<place>'` and confirm the match. Store
    latitude, longitude, timezone and the place's name.
17. Optional: which realm each computer is drawn as (Rivendell, the Shire, Erebor, Rohan). Default: that order.

Write the answers to `forge-answers.json` in this folder, in the format docs/setup.md gives, show the person the file,
and run:

```bash
node bin/the-forge.mjs init --answers forge-answers.json
```

When init reports problems, ask only the question behind each one, fix the file, and run it again.

## 2. This computer

Run `node bin/the-forge.mjs doctor` and go down its MISS lines with the person. Install missing programs with the
commands in docs/setup.md (ask before each install). GitHub: they run `gh auth login`. Clone the repository if doctor
says it is missing: `gh repo clone <owner/name> <path>`.

## 3. Each other computer, in turn

For one computer, skip to step 4. Otherwise, for each other computer:

1. **Tailscale** on both computers, so they reach each other from anywhere. Install it (docs/setup.md), then the
   person signs in: the app on a Mac, `sudo tailscale up` on Linux (or over `ssh -t` once SSH works).
2. **SSH.** Turn on Remote Login on a Mac (System Settings, General, Sharing) or install `openssh-server` on Linux.
   On this computer, make a key if there is none (`ls ~/.ssh/id_ed25519.pub`, else `ssh-keygen -t ed25519`), then
   the person runs `ssh-copy-id <dest>` and types that computer's password themselves. Check:
   `ssh -o BatchMode=yes <dest> true`.
3. **Programs there:** node 22, git, gh, jq, curl and Claude Code. Check with `ssh <dest> 'node -v; git --version'`
   and install what is missing over `ssh -t <dest>` (ask first).
4. **The copy:** `node bin/the-forge.mjs copy-to <host>`. It copies this folder, the config and the answers to
   `queueBoard.remoteRoot` there and links the skills.
5. **GitHub there:** `ssh -t <dest> gh auth login` (on Linux add `--insecure-storage`, since there is no keychain
   over SSH). Clone the repository there at the same path.
6. **On Linux**, so the jobs run with nobody logged in: `ssh -t <dest> sudo loginctl enable-linger <user>`.
7. **The shared folder.** The dispatchers coordinate through `paths.sharedDir` (default `~/.agent-queue/shared`),
   which must stay the same on every computer. Set up Syncthing (or the person's own sync tool) as docs/setup.md
   says, then check it: create a file there on one computer and see it arrive on the other.

## 4. Claude accounts

- The main account (`a`) on this computer is the one running this session, so it is signed in. Accept the
  bypass-permissions notice once per computer: `claude --dangerously-skip-permissions`, accept, then `/exit`.
  Workers run unattended in that mode; say so plainly, and that `dispatcher.permissionMode` can make it stricter.
- Every other account on this computer: `fleet/setup/add-account.sh here <label> <their email for it>`. A browser
  opens; they sign in. On another computer: `fleet/setup/add-account.sh <dest> <label> <email>`: Claude prints a
  link, they open it here, sign in, and paste the code back.
- The main account on another computer, when the answers put it there: `ssh -t <dest> claude auth login`.
- Check with `fleet/fleet.sh accounts` here, and `fleet/setup/add-account.sh status <dest>` for each other computer.

## 5. Codex and Grok

On each computer the answers give them: install (docs/setup.md), then the person signs in: `codex login` and
`grok login` here, or with `--device-auth` over `ssh -t <dest>`. Doctor checks them.

## 6. Linear, Slack and the GitHub side

- The person makes a Linear personal API key (Linear, Settings, Security and access) and saves it with the
  clipboard command in docs/setup.md, on each computer. Or they set `linear.apiKeyCommand` in the answers for a
  secrets manager. Never see the key.
- In Linear the team needs the workflow states In Progress and Verifying, a label group Size with S, M and L, and the
  labels agent-ready, agent-building, agent-stuck and needs-human. Walk them through it, or use a Linear connector
  if this session has one.
- Slack, when they want it: the app, webhook and bot token steps in docs/setup.md; the person saves both files.
- GitHub: the repository needs CI on pull requests. An AI review check is optional.

## 7. Jobs

Install the jobs on this computer: `node bin/the-forge.mjs install`. On each other computer:
`ssh -t <dest> 'node ~/the-forge/bin/the-forge.mjs install'` (use its remoteRoot), or `copy-to <host> --install`.
`node bin/the-forge.mjs status` shows them.

## 8. Doctor until clean

Run `node bin/the-forge.mjs doctor` here and `ssh <dest> 'node ~/the-forge/bin/the-forge.mjs doctor'` on each other
computer. Fix each MISS line and run it again until every computer says it is ready. A `warn` line does not block.

## 9. One test ticket

1. `node bin/the-forge.mjs open` shows the board. With one computer it draws four realms; workers spread across
   them as they take work.
2. Help the person write one small ticket in Linear that follows `docs/ticket-spec.md` (size S, a priority, a
   project, acceptance scenarios), for example a one-line README change in their repository.
3. `node dispatcher/dispatcher.mjs check <ABC-123>` and fix what it reports. Then the person adds the agent-ready
   label (or you do, through the specdesk skill).
4. `node dispatcher/dispatcher.mjs tick --dry-run` shows what a tick would do. Run a real tick now rather than
   waiting 20 minutes: `launchctl kickstart gui/$(id -u)/dev.agent-queue.dispatcher` on a Mac,
   `systemctl --user start agent-queue-dispatcher.service` on Linux.
5. Watch the worker appear on the board, open its pull request, and go green.

## 10. Hand over

Tell them how the day-to-day works: a pinned Claude Code session named after `orchestrator.sessionName` (default
Specdesk) where they run `/specdesk` to write tickets, the watchers at the end of README.md's Set up section, and
`the-forge status`, `stop`, `start` and `update`. To add a computer later: add it to `forge-answers.json`, run init,
then do step 3 and step 7 for it and `copy-to` every other computer so they all have the new config.
