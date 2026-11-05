# Decisions and why

The standing decisions behind the workflow, distilled from the spec desk's decision log. Each entry is the rule, then the reason it exists. When you settle a new standing decision in your own spec session, append it to the Decisions section of `specdesk/SPECDESK.md` with the date, so it never has to be discussed again.

## How work enters the queue

**One pinned spec session, and one way in.** A single pinned Claude Code session (the spec desk) talks ideas through, reads the code a ticket will touch, writes the Linear tickets and queues them. Work reaches the build pipeline only through the ready label; everything else stays manual. A Claude project was ruled out for this role because it lacks the connectors, the repo and the skills a spec needs.

**Plan the PRs first, then write one ticket per PR.** A batch once went from 50 tickets to 15 tickets to 7 PRs, which means it should have been 7 tickets from the start. The ticket is the PR's spec. PR size is a judgment in both directions: slice thin when risk, timing, an open decision or parallel work earns it (a migration on a hot table, auth, billing, tenant boundaries, a part blocked on a decision), and keep parts together when splitting buys nothing (the same files, the same release, parts that would only chain with "blocked by"). State the reason either way. A ticket sliced thin on purpose carries a `Ships alone: <reason>` line so the dispatcher never bundles it.

**Consolidate before splitting.** Work that ships as one release, changes the same files, or would only chain goes in one ticket, even when that makes it Size L. A size cap had been splitting single features into chains of tickets that rewrote the same code one after another.

**Size is a label group, S, M and L.** Linear estimates were off on the team, and a label is easy for both the spec session and the dispatcher to read. L queues when it is one release; otherwise it is split along an independent seam.

**A ticket that finishes an earlier unmerged build is sized by the work left.** Its spec opens with "Existing work" naming the old branch, because the dispatcher always assigns a fresh branch.

**Every ticket meets the spec floor before it queues** (`docs/ticket-spec.md`): acceptance scenarios, adverse data, and out of scope / decisions. The two defect classes that kept shipping were behavior on empty or failed input that nobody specified, and features no user could reach from the entry point they would actually use. Neither shows up in a diff review. The dispatcher checks the mechanical part (scenarios, size, priority) and sends a ticket back with a comment when it fails.

**No stubs count as done** (`docs/no-tracer-bullets.md`). A thin slice that wires a path end to end while stubbing the rest was being marked done with the real work deferred to follow-ups. Splitting a big spec into smaller tickets is fine; each one is built completely for its scope.

## Order and limits

**Priority, then age.** "Blocked by" sets the order between dependent tickets, and a blocked ticket starts once its blocker is in Verifying or done. A new urgent ticket goes ahead of the waiting ones and never interrupts a running one.

**No daily dispatch cap.** Many small, quick PRs used a daily cap up early and the work stopped. Worker slots per machine, a cross-machine maximum and a headroom floor per account still bound the queue.

**An account needs headroom in both windows.** A worker only goes to an account with at least 30% left in its 5-hour and weekly windows, and the dispatcher spreads work away from the account the human's own sessions use, so the human never runs dry.

**Workers started outside the queue take slots too.** A rush ticket another session dispatched shares the machine's memory and CPU, so it counts against that machine's worker cap. An idle or finished session, or one with no process, takes none.

**A busy machine claims nothing.** Over its load or memory limit, a machine leaves every ticket ready for its next tick or another machine's.

## While a worker builds

**No time limit; progress decides.** An 8-hour time box made workers stop mid-work and made the dispatcher abandon PRs that later went green. Progress is a new commit, any PR activity, or the worker's session being busy. The human gets an informational line every 8 hours, one stall note after 3 hours with nothing moving (or 6 hours busy with no commit), and a ticket goes stuck only when its worker's session is gone and nothing has moved for 3 hours.

**Questions go to the human's Slack, never into a session.** Each question is its own Slack thread synced to the ticket, so a reply in the thread lands on the ticket as a comment. The worker waits in the background, keeps building whatever the question doesn't block, and is woken with the answer. A ticket waiting on an answer is never counted as stalled. Sessions the human isn't talking to route questions to this inbox for the same reason: a question held in a session nobody is watching stops the work.

**A dead session gets one replacement.** A reboot ends every worker on the machine. A worker whose session died is replaced once, continuing from its worktree and PR, before the ticket can go stuck. Two workers once sat "failed" for hours, holding their slots with no path forward.

**Fold related work in.** A gap inside the ticket's feature that touches a few more files in the same area goes in the same PR. A follow-up ticket needs a reason (another area, a different release, a risky change that deserves its own review), because every extra PR costs a CI run and a review round.

**Tests gate in CI; the pre-push hook keeps the fast checks.** Running the test suite in the hook cost 40 to 60 minutes a push under load and failed on timeouts in tests the push never touched. The hook keeps format and type checks, workers run the tests their change touches, and CI runs everything. Workers never run the full suite locally, since every worker shares the machine.

**CI cost may grow with the amount of work, never per unit of work.** Extra CI runs per PR count as the same work, so they are cost to cut. This is the reason behind bundling, folding work in, and cancelling a run as soon as one job fails.

## Merging

**Finished, green, built-to-spec work never waits on the human's merge button.** A worker waiting on a merge holds its slot. The dispatcher merges a green PR itself. A green PR that touches a reviewed path (migrations, workflows, auth, billing, secrets, the schema) goes to the orchestrator session, which reviews those paths, runs the pre-merge check and merges. It escalates to the human only at a trust boundary (spending money, sending something outside the organization, data loss the spec didn't ask for) or for a change beyond the ticket's spec.

**Check a green PR against the main it will land on.** Two PRs that were each green broke main's type-check together, because a PR's CI only tested it against the main of its last push. Right before a merge, when main has moved, the dispatcher merges current main into the PR in a scratch worktree and type-checks what either side changed. It costs local CPU only. Skipping the type-check on a small machine was ruled out: type checking is too important to drop.

**A merge queue replaces main's full run once PRs run only related tests.** An earlier ruling against a merge queue assumed every PR already ran the full suite, which made the queue's run an extra one. Once PRs ran only the tests related to their change, the queue's full run took the place of main's push run, so CI still runs one full suite per merge. The dispatcher leaves a queued PR to the queue.

**Main never stays red.** Main once sat red for about an hour before anyone noticed, while workers kept merging on top of it. A watcher reads main's CI every 3 minutes. When main turns red it alerts Slack, holds every queue merge, and starts an emergency worker beyond the worker cap to tell flake from real and fix forward or revert. The orchestrator is woken and drives the fix to merge.

**A flake on main pauses nothing.** A failure on a merge commit counts only once no later main commit containing that merge has passed the same workflow, after waiting up to 90 minutes for one. Pausing the whole queue for one flaky test cost hours.

**Two stuck tickets in a row, or a real failure on main after a merge, pause the queue.** The pause is a file, re-read before every merge and dispatch, so a running tick can never undo it. The human resumes it after checking the cause.

## After the merge

**Merging deploys staging only, and the queue stops at Verifying.** The human's own verify session walks each ticket's acceptance scenarios on staging and posts the evidence; a ticket moves to Done only when every scenario passes. Production is a separate promote that a human starts. An agent never promotes production on its own.

**A defect that breaks one of a ticket's own scenarios reopens that ticket.** Its Done was false, so the fix lands on it and re-verifies the same scenario set. A new ticket is only for scope none of the original scenarios claimed to cover.

## Sentry fixes

**Two merge paths, decided by how much judgment the fix needs.** A mechanical fix (a real bug with a clear, local cause pinned to a file and line, Size S in one package, no migration, no reviewed path, no product choice, and a regression test that proves it) merges itself when green. Everything else is a judgment fix: the PR requests a named human reviewer, the ticket records why, and the reviewer gets one Slack DM so it lands on their workload. Their requested changes go back to a worker automatically, and the PR merges only once they approve the current head and it is green. When in doubt, a Sentry fix is judgment. The reviewer DM is standing-approved and is the only automated message to anyone other than the human.

**A Sentry lane that never blocks the main queue.** A machine can keep side slots for Sentry tickets, apart from its regular slots, that sit idle when there is no Sentry work. Other machines leave Sentry tickets to it while its heartbeat is fresh, and build them as usual when it is offline, so a fix never waits on one machine.

## Operating rules for every agent

**Kill processes by PID only.** One `pkill` by pattern once took down 135 processes on a shared machine.

**No `bash -c` with inline scripts.** The desktop app stops to ask about a shell string it cannot inspect, even in bypass mode, and a background worker that stops to ask has stopped working. Write a script file and run it with plain arguments.

**Spread work across every subscription.** Each Claude account has its own limits, and Codex and Grok bill their own plans. The orchestrator keeps the context and the decisions; builds go to fleet workers on other accounts, and read-only research and second opinions go to Codex or Grok, so no single account runs dry while the others sit idle.
