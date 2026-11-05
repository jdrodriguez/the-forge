# No Tracer Bullets: Build to Full Spec, Done Means Done

**The rule:** when we pick up a PRD or ticket, we implement its complete spec to working, verified behavior before calling it done. We do not ship a thin slice, skeleton, scaffold, or stub and mark the spec done. We do it right the first time.

"Tracer bullet" is retired from the vocabulary and the workflow. The methodology is not used for new work.

## What a tracer or stub looks like (banned as "done")

A change is NOT done if any spec'd behavior is represented by:

- A function returning a hardcoded or empty placeholder (`return []`, `return null`, `return {}`) where the spec requires real computation or data
- `throw new Error('not implemented')`, `NotImplementedError`, or equivalent
- A service, handler or worker with **zero call sites**: defined but never wired (no import, no route mount, no worker registration, no cron or enqueue)
- An empty-state, "Coming in Phase N" or "coming soon" placeholder standing in for the feature
- A `TODO` or `FIXME` covering a behavior the ticket's acceptance criteria require
- A migration or schema that lands without the code that reads or writes it
- A UI that renders but whose actions are no-ops or hit an unimplemented endpoint

## Definition of Done (the gate)

A ticket or PRD is Done only when ALL of the following hold:

1. **Every acceptance criterion is functionally implemented.** The real behavior runs.
2. **Every acceptance scenario is exercised by a passing test at a real boundary, written and committed before the implementation.** Branches the scenario implies go in that test's rows.
3. **The feature is reachable in production.** Call sites exist, routes are mounted, workers are registered and actually enqueued or scheduled, env and config are wired. "It compiles" and "the isolated unit test passes" are not reachability.
4. **You verified it by running it on the deployed pre-production environment.** The verifier walks the ticket's `## Acceptance scenarios` (`docs/ticket-spec.md`) against the deployed environment, as the persona each scenario names, and posts a `## Verify evidence` comment with a PASS or FAIL row per scenario (`docs/build-process.md`). Observed real behavior on that environment is what satisfies this point. Reading the diff, running it on localhost, or trusting a passing test suite does not.
5. **A stub scan passes on the diff.** Run whatever script your repo uses to grep the diff for the stub tells above (the banned list is its spec) before marking Done and before every push.

If you cannot satisfy all five, the ticket is **not done**. Say so plainly and list what is missing. Do NOT mark Done and file a "widening" follow-up to finish the spec later: that is the exact pattern this rule kills.

Your repo's own docs can instantiate this gate with concrete steps for its stack (backend works, frontend wired, buttons and forms live, error and loading states, end to end usable, a visual check at fixed widths). When working in that repo, satisfy that list too. This file is the principle behind it.

## When a PRD is too big for one unit

Splitting is fine. Phasing by tracer is not. The difference:

- **Allowed:** break the PRD into multiple smaller tickets, *each of which is itself built to full spec for its own scope*. The parent PRD is Done only when every child is Done. A child's scope is narrower than the PRD, but within that scope nothing is stubbed.
- **Banned:** a "Phase 1 tracer" that wires a thin path end to end while stubbing the rest, shipped as Done with the real work deferred to "widening" tickets.

Rule of thumb: scope down *what* a ticket covers; never scope down *how completely* it covers it.

A thin slice that earns its own PR (a risky migration reviewed and rolled back alone, a part behind a different flag) is still complete for its scope, and its ticket says so with a `Ships alone:` line (`docs/ticket-spec.md`). Never queue a thin first slice with the rest left for later.

Never apply a `tracer-bullet` label to new work.
