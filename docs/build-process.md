# Build process: merge to verified Done

What happens to a ticket after its PR is built. Read it before you change a ticket's status by hand.

## The loop

1. A PR merges to the base branch. That deploys staging only. Whether real users can reach the new code depends on your release switch, such as a feature flag.
2. The ticket moves to Verifying (`linear.states.verifying`), through the tracker's merge automation or the queue's `merged-to-verifying.mjs`. Merging deploys code. It does not verify a ticket.
3. A verifier walks the ticket's `## Acceptance scenarios` against the deployed environment, as the persona each scenario names. It posts a `## Verify evidence` comment in the format `docs/ticket-spec.md` defines, with the same tracker API key that anything gating on evidence reads with.
4. Every scenario has to pass for the ticket to move to Done. A FAIL keeps the ticket in Verifying. The fix lands on that same ticket and re-verifies the same scenario set.
5. Releasing a feature to its users is a separate switch. Gate it on Done with evidence attached, and have the gate read the evidence table itself. A missing comment, a comment the expected author did not write, an unreadable comment, or any `FAIL` cell in the newest evidence comment should each refuse the release.

The queue stops at step 2. The dispatcher merges green PRs and moves the ticket to Verifying. `merged-to-verifying.mjs` leaves a ticket in Done only when its newest comment under `linear.verifyEvidenceHeading` came after the merge and has no FAIL cell. Verification is a separate session or a person, so it never blocks the build queue.

## Reopen rule

A defect that breaks one of a ticket's own acceptance scenarios means its Done was false. Move it back to Verifying, pull the release switch if the defect already reached users, and fix it on that ticket. The fix re-verifies the same scenario set.

File a new ticket only for new scope, work none of the original scenarios claimed to cover. The new ticket carries its own `## Acceptance scenarios`. It does not rewrite the old ticket's history.

## Where each piece lives

- The spec floor and the evidence comment format: `docs/ticket-spec.md`
- The Definition of Done and the banned stubs: `docs/no-tracer-bullets.md`
- The PR review loop, the round-cap triage and the post-merge sweeps: `docs/pr-review.md`
- Who writes specs and queues them: `specdesk/SPECDESK.md`
- The config keys: `docs/configuration.md`
