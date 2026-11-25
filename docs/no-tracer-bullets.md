# No tracer bullets: build to full spec

Build a ticket's complete spec to working, verified behavior before calling it done. A thin slice, skeleton, scaffold or stub is never done. Never apply a `tracer-bullet` label to new work.

## What a stub looks like

A change is not done if any spec'd behavior is represented by:

- A function returning a hardcoded or empty placeholder (`return []`, `return null`, `return {}`) where the spec requires real computation or data
- `throw new Error('not implemented')`, `NotImplementedError`, or equivalent
- A service, handler or worker with zero call sites: no import, no route mount, no worker registration, no cron or enqueue
- An empty state, "Coming in Phase N" or "coming soon" placeholder standing in for the feature
- A `TODO` or `FIXME` covering a behavior the acceptance criteria require
- A migration or schema that lands without the code that reads or writes it
- A UI that renders but whose actions are no-ops or hit an unimplemented endpoint

## Definition of Done

A ticket is Done only when all of these hold:

1. **Every acceptance criterion is implemented.** The real behavior runs.
2. **Every acceptance scenario has a passing test at a real boundary, committed before the implementation.** Branches the scenario implies go in that test's rows.
3. **The feature is reachable in production.** Call sites exist, routes are mounted, workers are registered and actually enqueued or scheduled, env and config are wired. Compiling and passing an isolated unit test is not reachability.
4. **You verified it on the deployed pre-production environment.** The verifier walks the `## Acceptance scenarios` as each scenario's persona and posts a `## Verify evidence` comment (`docs/build-process.md`). Reading the diff, running it on localhost, or a passing test suite does not count.
5. **A stub scan passes on the diff.** Run your repo's script that greps the diff for the stubs above, before marking Done and before every push.

If you cannot meet all five, the ticket is not done. Say so and list what is missing. Never mark it Done and file a "widening" follow-up to finish the spec later.

Your repo's own docs may list concrete steps for its stack (backend works, frontend wired, buttons and forms live, error and loading states, end to end usable, a visual check at fixed widths). Meet that list too.

## When a spec is too big for one ticket

Split it into smaller tickets, each built to full spec for its own scope. The parent is Done only when every child is Done. Never ship a "Phase 1 tracer" that wires a thin path end to end while stubbing the rest. Scope down what a ticket covers, never how completely it covers it.

A thin slice that earns its own PR (a risky migration reviewed and rolled back alone, a part behind a different flag) is still complete for its scope. Its ticket says so with a `Ships alone:` line (`docs/ticket-spec.md`).
