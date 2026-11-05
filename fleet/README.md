# Fleet: several Claude accounts on one machine

A machine can hold several Claude subscription accounts side by side, each in its own config folder that `CLAUDE_CONFIG_DIR` selects. `fleet.sh` starts background Claude sessions on any of them, lists what they run, reads their plan usage, and messages, reads and stops their sessions. The dispatcher hands every queue ticket to a worker through `fleet.sh dispatch`, so work spreads across every subscription and no single account runs dry.

## The account model

| Label | Config folder | Notes |
| --- | --- | --- |
| `a` | `~/.claude` | The human's own account, the default folder, and the Claude desktop app's account. Keep `fleet.primaryAccount` at `a`. |
| `b` | `~/.claude-b` | Selected with `CLAUDE_CONFIG_DIR=~/.claude-b` |
| `X` | `~/.claude-X` | Any `[a-z0-9]+` label whose folder holds a `.claude.json` file |

Labels are always lowercase, and label `a` always means `~/.claude`. Two labels can share one email (one email can hold a personal plan and a team seat). `CLAUDE_FLEET_HOME` moves the folder that holds the account folders (default `$HOME`). Sessions on different accounts cannot find each other by name, so they message each other by socket address; `fleet.sh address` prints it.

## Files

| File | Job |
| --- | --- |
| `fleet.sh` | The command: `accounts`, `ps`, `usage`, `dispatch`, `address`, `logs`, `stop`. `fleet.sh help` has the details. |
| `SKILL.md` | The `fleet` skill, which teaches a session when and how to use `fleet.sh` |
| `setup/add-account.sh` | Adds an account to this machine or, over SSH, to another one |
| `setup/mirror-config-dir.sh` | Links an extra account's folder to the shared config in `~/.claude` |
| `hooks/protect-main-checkout.sh` | A PreToolUse hook that keeps every session out of the repo's main checkout (with `protect-main-checkout-parse.pl`) |
| `test-fleet.sh`, `setup/test.sh`, `hooks/test-protect-main-checkout.sh` | The tests |

`fleet.sh` names the human from `human.name` in the repo config (`agent-queue.config.json`, or the file `AGENT_QUEUE_CONFIG` names) and points every worker at the repo's `scripts/ext-agent.sh`, `scripts/cross-review.sh` and `inbox/ask-human.sh`. It finds the repo from its own real location, so a symlink to it works. Without a readable config, or without `node`, it says "the human" and still dispatches. It needs `jq`, `perl` and `claude` on PATH.

## Set up a machine

1. Clone this repo, copy `agent-queue.config.example.json` to `agent-queue.config.json` and fill it in.
2. Install the skill once: `ln -s ~/dev/agent-queue/fleet ~/.claude/skills/fleet` (use your clone's path). Every mirrored account sees it through its `skills` link.
3. Add each extra account:

   ```bash
   fleet/setup/add-account.sh here b you+b@example.com
   fleet/setup/add-account.sh status          # every account on this machine
   ```

   It links `~/.claude-b` to the shared config, signs the account in (a browser opens) unless that email is signed in there already, refuses to go on when another email signed in, then marks the workspace (`workspaceCwd` in the config, default `~/dev`) trusted, since `fleet.sh dispatch` refuses an untrusted workspace. Label `a` is refused: it is the machine's own login.
4. Accept the bypass-permissions disclaimer once on the primary account (`claude --dangerously-skip-permissions`, accept, `/exit`). Mirrored accounts read the primary's `settings.json`, where that answer lives. `fleet.sh dispatch` defaults to `--mode bypassPermissions` because its sessions run unattended, so a worker can run any command and read any file your user can. Pass `--mode` (or set `dispatcher.permissionMode` for the queue) for a stricter mode, and run the fleet under a user and on a machine where that access is acceptable.

To add an account to another machine from this one, run `fleet/setup/add-account.sh <ssh-host> <label> <email>`. Claude prints a link: open it in this machine's browser, sign in, and paste the code back. The login is stored on that machine in the account's folder (`.credentials.json`, mode 600), because SSH can't reach its keychain. The other machine needs this repo at the same place under its home folder (or set `AGENT_QUEUE_REMOTE_ROOT`), and `FLEET_REMOTE_PATH` sets the folders put in front of its PATH (default `/opt/homebrew/bin:/usr/local/bin:~/.local/bin`). `add-account.sh status <host>...` lists that machine's accounts too.

## Keep the accounts' config in step

`setup/mirror-config-dir.sh <label>` links these entries of `~/.claude` into the account's folder when they exist: `CLAUDE.md`, `settings.json`, `keybindings.json`, `agents`, `commands`, `skills`, `rules`, `scripts`, `hooks`, `output-styles`, `plugins` and `templates`, plus every `projects/<key>/memory` folder. `--dry-run` prints the plan.

- Whatever is in the way moves to `<entry>.pre-mirror-<timestamp>`. Nothing is deleted. A second run reports `0 linked, N ok, 0 relinked, 0 moved aside`.
- It links only the memory folders the primary has when it runs, so run it again after the primary gains a project folder.
- It refuses a target that is the primary, contains it, sits inside it, is the filesystem root, or has a `projects` folder that is a symlink.
- `CLAUDE_FLEET_PRIMARY` names another primary folder.
- Not mirrored, so set up once per account: folder trust for any repo opened interactively, user MCP servers (`claude mcp list`), claude.ai connectors, and credentials.

## The main-checkout guard

Workers build in worktrees under `<repoPath>/<worktreesDir>`. The hook blocks Edit, Write, MultiEdit and NotebookEdit on files in the main checkout, Bash git commands that change it, and Bash writes into it through redirects, `tee`, `sed -i`, `cp`, `mv`, `touch` or `rm`. Its parser reads Bash the way bash does, so a `>` inside quotes or a heredoc body is text, and `cd` and shell variables are followed in order. A path it cannot resolve, or a command it cannot parse, is let through. The header of `hooks/protect-main-checkout.sh` lists every rule and known limit.

- What it protects comes from the config: `repoPath` (with none, the hook does nothing), `worktreesDir` (default `.claude/worktrees`, always writable) and `fleet.mainCheckoutWritableDirs` (folders under the checkout open to file writes and closed to git, for gitignored state such as a build skill's). `CLAUDE_PROTECTED_CHECKOUTS`, `CLAUDE_PROTECTED_WORKTREES` and `CLAUDE_PROTECTED_WRITABLE` (each colon-separated) override them.
- The escape hatch is for the human: `touch ~/.claude/allow-main-checkout-edits` in their own terminal, and remove it afterwards, or start a session with `CLAUDE_ALLOW_MAIN_CHECKOUT=1`. The hook blocks any call that mentions the hatch file.
- Register it once in the primary's `settings.json`, which every mirrored account shares, under `hooks.PreToolUse`:

  ```json
  {
    "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash",
    "hooks": [{ "type": "command", "command": "bash \"$HOME/dev/agent-queue/fleet/hooks/protect-main-checkout.sh\"" }]
  }
  ```

## Environment variables

| Variable | Used by | Effect |
| --- | --- | --- |
| `CLAUDE_FLEET_HOME` | all | Root of the account folders. Default `$HOME`. |
| `FLEET_MAX_WORKERS` | `fleet.sh` | Working background sessions one account may hold before `dispatch` refuses. Default 4. |
| `FLEET_USAGE_TIMEOUT` | `fleet.sh` | Seconds one `claude -p /usage` refresh may take. Default 20. |
| `FLEET_SOCK_DIR`, `FLEET_ADDR_WAIT`, `FLEET_USAGE_RETRY_WAIT` | `fleet.sh` | The socket folder (default `/tmp/cc-socks`), the seconds `dispatch` waits for an address (5) and between usage refreshes (2). The tests set them. |
| `AGENT_QUEUE_CONFIG` | all | The config file. Default `agent-queue.config.json` at the repo root. |
| `CLAUDE_FLEET_PRIMARY` | mirror | The primary account's folder. Default `$CLAUDE_FLEET_HOME/.claude`. |
| `AGENT_QUEUE_REMOTE_ROOT`, `FLEET_REMOTE_PATH` | add-account | Where the repo is on the other machine, and what goes first on its PATH. |
| `CLAUDE_PROTECTED_CHECKOUTS`, `CLAUDE_PROTECTED_WORKTREES`, `CLAUDE_PROTECTED_WRITABLE` | hook | Override `repoPath`, `worktreesDir` and `fleet.mainCheckoutWritableDirs`. |

## Tests

```bash
bash fleet/test-fleet.sh                       # runs fleet.sh under /bin/bash; FLEET_TEST_BASH picks another shell
bash fleet/setup/test.sh                       # mirror-config-dir.sh and add-account.sh
/bin/bash fleet/setup/test.sh                  # again under macOS's stock bash 3.2, for the label locale trap
bash fleet/hooks/test-protect-main-checkout.sh # PROTECT_TEST_BASH=/bin/bash runs the hook under bash 3.2
```

They need `jq`, `perl` and `node`; `test-fleet.sh` also uses `python3` or `nc` to make real sockets and `shellcheck` when it is installed. Each prints `PASS` or `FAIL` per check and exits non-zero when one fails. They run against `mktemp` folders, a fake `HOME` or `CLAUDE_FLEET_HOME`, a test config, and stubs for `claude` and `ssh` placed first on PATH, so they never read or change a real account, config or checkout.

## Facts that bite

- The desktop app holds one account, `a`, and bills its own sign-in, which can report other limits than account a's CLI login. Reach the other accounts from the phone app or claude.ai/code (one browser profile per account) when they run `claude remote-control`, or through the skill.
- Keep an orchestrator and its workers in the same permission mode. Otherwise messages between them wait for approval.
- Folder trust, MCP servers, connectors and credentials belong to each account. A folder trusted on `a` still needs trusting on `b`.
