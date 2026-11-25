# Ticket spec floor

Every buildable ticket carries three sections: `## Acceptance scenarios`, `## Adverse data`, and `## Out of scope / decisions`. A ticket has to meet this floor before it is queued. The Specdesk session writes tickets to it (`specdesk/SPECDESK.md`). `node dispatcher/dispatcher.mjs check <ID>` grades the mechanical part before the dispatcher claims a ticket.

A worker builds from the ticket alone, so anything the ticket leaves open is a guess the worker makes for you. The sections make the ticket settle the two guesses that go wrong most: behavior on empty or failed input, and whether a user can reach the feature at all.

## Fill in for your project

Name these once, in your own docs or the worker brief, so every scenario and evidence comment uses the same words:

- **Personas.** The roles a scenario can name, and how a verifier signs in as each one on the environment it walks. A persona nobody can sign in as makes its scenarios unverifiable.
- **Environments.** The names of the environments a ticket is verified on, for example `staging` and `production`. The evidence footer uses these names and no others.
- **Health URL.** For each environment, the URL that reports the commit SHA it serves. The footer's SHA comes from it.
- **Entry points.** The route, nav item or command a persona uses to reach the feature, written the way users meet it.

## `## Acceptance scenarios`

Numbered, persona-anchored, one scenario per line:

`Given [persona] at [route/entry point], when [action], then [user-observable outcome]`

The headline verb of the ticket title must appear in at least one scenario, or the literal outcome it names. A synonym does not count. For the title "Show project health score on the project dashboard", one scenario uses "show".

```
## Acceptance scenarios

1. Given a project manager at `/projects/:id`, when the project has a completed
   health check, then the page shows the health score as a number from 0 to 100
   with its band (Healthy, At risk, Critical).
2. Given a project manager at `/projects/:id`, when they click "Recalculate,"
   then the score updates in place within 5 seconds and the "last calculated"
   timestamp changes.
3. Given a contributor at `/projects/:id`, when the project has no health check
   yet, then the score panel shows "Not measured" instead of a blank space or a
   zero.
```

## `## Adverse data`

A table of behavior on empty, failed, zero and unconfigured input, for every number, grade or judgment the ticket renders. The mandated default is to render "Not measured". Fabricating a value is banned, and that includes zero standing in for missing data.

```
## Adverse data

| Input state | Behavior |
| --- | --- |
| Empty (no health check has run yet) | Render "Not measured." No score, no band, no recalculate spinner. |
| Failed (the scoring job errored) | Render "Not measured" plus a retry action. Never render a stale or fabricated number. |
| Zero (the project genuinely scores 0) | Render "0" with its band. Zero is a real result and renders distinctly from "Not measured." |
| Unconfigured (the workspace has not turned on health scoring) | Render "Not measured" and hide the recalculate button entirely. |
```

## `## Out of scope / decisions`

Explicit deferrals, plus any open product call the ticket raises. Every deferral names a real ticket number. Every open call names an owner.

A ticket sliced thin on purpose also carries a `Ships alone: <reason>` line here, so the dispatcher never bundles it (`specdesk/SPECDESK.md`, "Flow for each idea").

```
## Out of scope / decisions

- Deferred: a historical score-trend chart. Out of scope for this ticket,
  tracked in ENG-4301.
- Open: should the band show the underlying number to contributors, or only the
  band? Owner: the product owner. Decide before frontend build starts.
- Ships alone: the scoring job reads a table other work is migrating, so this
  change is reviewed and rolled back on its own.
```

## Where the floor is enforced

- **Specdesk** checks all three sections, the title-verb rule, the placement of a UI ticket, and that no product question is open, before it adds `agent-ready` (the queue bar in `specdesk/SPECDESK.md`).
- **`dispatcher.mjs check <ID>`** checks one ticket for an `## Acceptance scenarios` heading, a Size label and a priority. The dispatcher runs the same check on every `agent-ready` ticket before claiming it. A ticket that fails loses `agent-ready`, gets a comment saying why, and becomes an item in the human's inbox.
- **The worker** builds to the scenarios and exercises every one with a test (`docs/no-tracer-bullets.md`, Definition of Done).
- **The verifier** walks the scenarios on a deployed environment after merge and posts the evidence comment below (`docs/build-process.md`).

The check cannot tell a good scenario from a bad one. Reading the scenarios stays the job of whoever writes and reviews the ticket.

## The evidence comment

The verifier posts this comment on the ticket after walking the scenarios on a deployed environment. A walk on production posts the same comment and counts the same way.

- **Header:** `## Verify evidence`, literal, on its own line. It must be followed by a newline or the end of the comment. Leading whitespace or blank lines before it are fine. A heading with more text on the same line (`## Verify evidence-gathering plan`), or the phrase mentioned mid-sentence, does not count. The queue reads the heading from `linear.verifyEvidenceHeading`. Keep that the one owner of the string: anything that matches on it reads it from there instead of re-typing it.
- **Table:** one row per scenario, columns in the order scenario, result, evidence. Header cell wording and casing carry no meaning: parsers read them case-insensitively and trimmed. The scenario cell carries enough of the scenario's text to read on its own, never a bare row number.
- **Result cell:** exactly `PASS` or `FAIL`, uppercase, alone in the cell. `pass`, `PASSED` and `PASS (with caveats)` count as unreadable evidence.
- **Evidence cell:** a link to a screenshot or recording hosted by the tracker. With Linear, `fileUpload` returns the URL and an upload target, and the file bytes must be PUT there before the link is posted. A cell with only prose is a malformed row. Commentary is allowed; only the link has to be there.
- **Footer:** `_Verified <ISO> on <env> as <persona> against <sha>_`, literal format. `<env>` is one of your environment names, the one the scenarios were walked on. `<sha>` is the full 40-character commit SHA that environment's health URL reports. Never abbreviate it.

Only the header line and the footer line are literal.

```
## Verify evidence

| scenario | result | evidence |
| --- | --- | --- |
| 1: manager sees the score once a health check completes | PASS | [recording](https://uploads.linear.app/…) |
| 2: recalculate updates the score in place | PASS | [recording](https://uploads.linear.app/…) |
| 3: contributor sees "Not measured" before a health check exists | FAIL | [recording](https://uploads.linear.app/…) · observed: contributor role cannot reach /projects/:id, blocked by a route guard |

_Verified 2026-08-31T14:32:00Z on staging as project manager against a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f80912_
```

A single FAIL keeps the ticket in Verifying. The fix targets the failing scenario, then re-verifies every scenario in the set, since a fix can break one that passed.

A ticket can carry several `## Verify evidence` comments. The newest by creation time counts. A fresh PASS supersedes an older FAIL, and a fresh FAIL supersedes an older PASS.

## Who may author evidence

Recommendation: accept evidence only from the tracker identity the queue's API key authenticates as, since anyone in the workspace can type a well-formed table. Treat comments by anyone else as non-evidence, and apply "newest wins" only within that set, so a forged comment posted after a real one cannot supersede it.

The key holder can still author evidence for their own release. A dedicated automation account nobody signs in as closes that. Moving the key to a different account invalidates every evidence comment the old account posted, which shows up as a refusal. Re-verify the affected tickets, or rotate the key within the same account.

## Reopen rule

A defect that breaks one of a ticket's own acceptance scenarios reopens that ticket. The fix re-verifies the same scenario set. A new ticket is only for new scope, and carries its own `## Acceptance scenarios` (`docs/build-process.md`).

## Exempting a ticket from evidence

Some tickets have nothing to walk, such as a documentation change. If a label lets a ticket skip the evidence check, treat it as a real bypass with three rules:

- Only the person accountable for the product applies it.
- It never goes on without a comment on the ticket saying why the ticket is exempt from `## Verify evidence`.
- Whatever sweeps for Done tickets without evidence reports the exempt count on every run.

Unless something checks who applied the label, these rules rest on discipline alone.
