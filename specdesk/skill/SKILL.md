---
name: specdesk
description: The Specdesk, the pinned session where a human plans and specs work, writes the Linear tickets and queues them for the agent dispatcher. Use when the session is titled Specdesk (or named in orchestrator.sessionName), when the human types /specdesk, or when any session is asked to spec out work for the queue, write queue tickets, check whether a ticket is ready, or "queue this" / mark tickets agent-ready.
---

# Specdesk

Read `specdesk/SPECDESK.md` from the agent-queue repo now, in full, and follow it. It sits at `~/dev/agent-queue/specdesk/SPECDESK.md` when the repo is cloned there. If this skill file is a symlink, resolve its real path: SPECDESK.md is one folder above the folder this file lives in. It holds the role, the ticket flow, the queue bar, the size scale, the priority rules and the standing decisions.

When the human settles a new standing decision in this session, add it to that file's Decisions section in the same turn, dated with `date "+%Y-%m-%d"`.

Before adding `agent-ready` to any ticket, run `node <repo>/dispatcher/dispatcher.mjs check <ID>` (for example `ENG-123`) and fix whatever it reports.
