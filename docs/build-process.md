# Build Process: Merge to Verified Done

The one-page statement of the loop a ticket runs through after its PR is built. Read it before touching a ticket's status by hand.

## The loop

1. A PR merges to the base branch. This deploys the pre-production environment (staging) only. Whether the new code is reachable by real users depends on your release switch, such as a feature flag flipped later.
2. The tracker's merge automation, or the queue's `merged-to-verifying.mjs`, moves the ticket to the Verifying state (`linear.states.verifying`). Merging deploys code. It does not verify a ticket.
3. A verifier walks the ticket's `## Acceptance scenarios` (`docs/ticket-spec.md`) against the deployed environment, acting as the persona each scenario names. It posts a `## Verify evidence` comment: one row per scenario with a PASS or FAIL result and a link to the artifact (screenshot or recording), footed with `_Verified <ISO> on <env> as <persona> against <sha>_` (the environment walked, and the commit SHA its health URL served). It posts with the same tracker API key that anything gating on evidence reads with, so the evidence is bound to one identity.
4. Every scenario has to pass for the ticket to move to Done. A FAIL keeps the ticket in Verifying, gets fixed on that same ticket, and re-verifies the same scenario set.
5. Releasing a feature to its users is a separate switch. Gate that switch on Done with evidence attached, and have the gate read the evidence table itself. A missing comment, a comment the expected author did not write, an unreadable comment, or any `FAIL` cell in the newest evidence comment should each refuse the release.

The queue itself stops at step 2: the dispatcher merges green PRs and moves the ticket to Verifying (`linear.states.verifying`), and `merged-to-verifying.mjs` leaves a ticket in Done only when its newest comment under `linear.verifyEvidenceHeading` came after the merge and has no FAIL cell. Verification is a separate session or a person, so the evidence step never blocks the build queue.

## Reopen rule

A defect that breaks one of a ticket's own acceptance scenarios means that ticket's Done was false. Reopen it (move it back to Verifying, and pull the release switch if the defect already reached users) and fix it on that ticket. The fix re-verifies the same scenario set it broke.

File a new ticket only when the work is genuinely new scope, something none of the original ticket's scenarios claimed to cover. That new ticket carries its own `## Acceptance scenarios` and updates the spec going forward. It does not rewrite the old ticket's history.

## Where each piece lives

- Ticket spec floor and the evidence comment contract: `docs/ticket-spec.md`
- The build-side half of this loop (Definition of Done, banned stubs): `docs/no-tracer-bullets.md`
- The PR review loop, the severity triage at the round cap, and the post-merge sweeps: `docs/pr-review.md`
- Who writes specs and queues them: `specdesk/SPECDESK.md`
- The config keys named above: `docs/configuration.md`
