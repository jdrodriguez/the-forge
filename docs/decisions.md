# Decisions and why

The standing decisions behind the workflow: each rule, then why. When you settle a new one in your own spec session, add it with the date to the Decisions section of `specdesk/SPECDESK.md`.

## How work enters the queue

**One pinned spec session, one way in.** A single pinned Claude Code session (the spec desk) reads the code a ticket will touch, writes the Linear tickets and queues them. Work reaches the queue only through the ready label. A Claude project lacks the connectors, the repo and the skills for this job.

**Plan the PRs, then write one ticket per PR.** The ticket is the PR's spec. Slice thin when risk, timing, an open decision or parallel work earns it: a migration on a hot table, auth, billing, tenant boundaries, a part blocked on a decision. Keep parts together when splitting buys nothing: the same files, the same release, parts that would only chain with "blocked by". State the reason either way. A ticket sliced thin on purpose carries a `Ships alone: <reason>` line so the dispatcher never bundles it.

**Consolidate before splitting.** Work that ships as one release, changes the same files, or would only chain goes in one ticket, even at Size L. A size cap splits single features into chains of tickets that rewrite the same code.

**Size is a label group: S, M and L.** Linear estimates were unreliable, and a label is easy for both the spec session and the dispatcher to read. L queues when it is one release. Otherwise split it along an independent seam.

**A ticket that finishes an earlier unmerged build is sized by the work left.** Its spec opens with "Existing work" naming the old branch, because the dispatcher always assigns a fresh branch.

**Every ticket meets the spec floor before it queues** (`docs/ticket-spec.md`). The defects that kept shipping were unspecified behavior on empty or failed input, and features no user could reach. Neither shows in a diff review.

**No stubs count as done** (`docs/no-tracer-bullets.md`). Thin slices with the rest stubbed were being marked done and the real work deferred.

## Order and limits

**Priority, then age.** "Blocked by" orders dependent tickets. A blocked ticket starts once its blocker is in Verifying or done. A new urgent ticket goes ahead of waiting ones and never interrupts a running one.

**No daily dispatch cap.** Many small, quick PRs used up a daily cap early and the work stopped. Worker slots per machine, a cross-machine maximum and a headroom floor per account still bound the queue.

**An account needs headroom in both windows.** A worker only goes to an account with at least 30% left in its 5-hour and weekly windows. The dispatcher spreads work away from the account the human's own sessions use, so the human never runs dry.

**Workers started outside the queue take slots too.** They share the machine's memory and CPU. An idle or finished session, or one with no process, takes none.

**A busy machine claims nothing.** Over its load or memory limit, a machine leaves every ticket for its next tick or another machine.

## While a worker builds

**No time limit; progress decides.** A fixed time box made workers stop mid-work and abandoned PRs that later went green. Progress is a new commit, any PR activity, or the worker's session being busy. The human gets an informational line every 8 hours and one stall note after 3 hours with nothing moving (or 6 hours busy with no commit). A ticket goes stuck only when its worker's session is gone and nothing has moved for 3 hours.

**Questions go to the human's Slack, never into a session.** A question held in a session nobody is watching stops the work. Each question is its own Slack thread, and a reply there lands on the ticket as a comment and wakes the worker. A ticket waiting on an answer is never counted as stalled.

**A dead session gets one replacement.** A reboot ends every worker on the machine. A worker whose session died is replaced once, continuing from its worktree and PR, before the ticket can go stuck. Otherwise a dead worker holds its slot with no way forward.

**Fold related work in.** A gap inside the ticket's feature that touches a few more files in the same area goes in the same PR. A follow-up ticket needs a reason (another area, another release, a risky change that deserves its own review), because every extra PR costs a CI run and a review round.

**Tests gate in CI. The pre-push hook keeps the fast checks.** Running the suite in the hook took 40 to 60 minutes a push under load and failed on timeouts in tests the push never touched. The hook keeps format and type checks, workers run the tests their change touches, and CI runs everything. Workers never run the full suite locally, since every worker shares the machine.

**CI cost may grow with the amount of work, never per unit of work.** Extra CI runs on the same PR are cost to cut. This is the reason for bundling, folding work in, and cancelling a CI run as soon as one job fails.

## Merging

**Finished, green, built-to-spec work never waits on the human's merge button.** A worker waiting on a merge holds its slot. The dispatcher merges a green PR itself. One that touches a reviewed path (migrations, workflows, auth, billing, secrets, the schema) goes to the orchestrator session, which reviews those paths, runs the pre-merge check and merges. It escalates to the human only at a trust boundary (spending money, sending something outside the organization, data loss the spec didn't ask for) or for a change beyond the spec.

**Check a green PR against the main it will land on.** A PR's CI only tested it against the main of its last push, so two green PRs can break main together. Right before a merge, when main has moved, the dispatcher merges current main into the PR in a scratch worktree and type-checks what either side changed. It costs local CPU only, and the type-check runs even on small machines.

**A merge queue replaces main's full run once PRs run only related tests.** The queue's full run takes the place of main's push run, so CI still runs one full suite per merge. The dispatcher leaves a queued PR to the queue.

**Main never stays red.** Otherwise workers keep merging on top of it. A watcher reads main's CI every 3 minutes. When main turns red it alerts Slack, holds every queue merge, and starts an emergency worker beyond the worker cap to tell flake from real and fix forward or revert. The orchestrator is woken and drives the fix to merge.

**A flake on main pauses nothing.** A failure on a merge commit counts only once no later main commit containing that merge has passed the same workflow, after waiting up to 90 minutes for one. Pausing the queue for one flaky test costs hours.

**Two stuck tickets in a row, or a real failure on main after a merge, pause the queue.** The pause is a file, re-read before every merge and dispatch, so a running tick can't undo it. The human resumes it after checking the cause.

## After the merge

**Merging deploys staging only, and the queue stops at Verifying.** A verifier walks each ticket's acceptance scenarios on staging, and the ticket moves to Done only when every scenario passes (`docs/build-process.md`). Production is a separate promote a human starts. An agent never promotes production.

## Sentry fixes

**Two merge paths, by how much judgment the fix needs.** A mechanical fix merges itself when green: a real bug with a clear, local cause pinned to a file and line, Size S in one package, no migration, no reviewed path, no product choice, and a regression test that proves it. Everything else is a judgment fix. The PR requests a named human reviewer, the ticket records why, and the reviewer gets one Slack DM so it lands on their workload. Their requested changes go back to a worker automatically, and the PR merges only once they approve the current head and it is green. When in doubt, a Sentry fix is judgment. The reviewer DM is standing-approved and is the only automated message to anyone but the human.

**A Sentry lane that never blocks the main queue.** A machine can keep side slots for Sentry tickets, apart from its regular slots, that sit idle when there is no Sentry work. Other machines leave Sentry tickets to it while its heartbeat is fresh, and build them as usual when it is offline.

## Rules for every agent

**Kill processes by PID only.** A `pkill` by pattern can take down every matching process on a shared machine.

**No `bash -c` with inline scripts.** The desktop app stops to ask about a shell string it cannot inspect, even in bypass mode, and a background worker that stops to ask has stopped working. Write a script file and run it with plain arguments.

**Spread work across every subscription.** Each Claude account has its own limits, and Codex and Grok bill their own plans. The orchestrator keeps the context and the decisions. Builds go to fleet workers on other accounts, and read-only research and second opinions go to Codex or Grok, so no account runs dry while others sit idle.
