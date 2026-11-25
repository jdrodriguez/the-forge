---
name: forge-takeover
description: Make this session the queue's orchestrator, on any Claude account or app, and pick up the open work. Use only when the human types /forge-takeover or says to take over as orchestrator. Never run it on your own.
---

# Take over as orchestrator

Run `bash inbox/takeover.sh` from The Forge's folder (resolve this skill file's real path: the folder is two above it) and read all of its output. It moves the driver lock to this session, renews the lease, and prints the handoff note, the approved heads not yet merged, and whether your watcher runs.

Then, in order:
1. Start the watcher: `node inbox/orchestrator-watch.mjs` with Bash `run_in_background: true`, never `&`. Re-arm it every time it fires, for the rest of the session. The Stop hook holds the turn open while it is not running.
2. Load the `specdesk` skill.
3. Tell the human in five lines or fewer: which account and app this is, what is open, and what you do first. Then do it.

Keep the handoff note (`orchestrator.handoffFile`) current: rewrite it whenever the open work changes, with the time and your session ID on its first line.
