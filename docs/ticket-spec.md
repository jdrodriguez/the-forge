# Ticket Spec Floor

Every buildable ticket carries three sections: `## Acceptance scenarios`, `## Adverse data`, and `## Out of scope / decisions`. This is the floor a ticket has to meet before it is queued for a worker. The Specdesk session writes tickets to it (`specdesk/SPECDESK.md`), and `node dispatcher/dispatcher.mjs check <ID>` grades the mechanical part of it before the dispatcher claims a ticket (see "Where the floor is enforced").

## Why this floor exists

An audit of shipped tickets found two dominant defect classes. Behavior on empty, failed, zero, or unconfigured input was never specified, so an agent guessed and usually guessed wrong. And a feature was built and tested but no persona could actually reach it from the entry point they would use in practice. Both classes pass type-check, lint, and a happy-path test. Neither is caught by reading the diff. The three sections below make the ticket answer both questions before an agent starts building.

A worker builds from the ticket alone and nobody is watching. Anything the ticket leaves open is a guess the worker makes for you.

## Fill in for your project

The floor leaves four things for you to name once, in your own docs or in the worker brief, so every scenario and every evidence comment uses the same words:

- **Personas.** The roles a scenario can name, and how a verifier signs in as each one on the environment it walks. A persona nobody can sign in as makes every scenario that names it unverifiable.
- **Environments.** The names of the environments a ticket is verified on (for example `staging` and `production`). The evidence footer uses these names and no others.
- **Health URL.** For each environment, the URL that reports the commit SHA the environment is serving. The footer's SHA comes from it.
- **Entry points.** The route, nav item, or command a persona uses to reach the feature, written the way users meet it.

## `## Acceptance scenarios`

Numbered, persona-anchored, one scenario per line:

`Given [persona] at [route/entry point], when [action], then [user-observable outcome]`

The ticket title's own headline verb has to appear in at least one scenario. If the title is "Show project health score on the project dashboard," one scenario uses "show," or the literal outcome it names. A synonym standing in for it does not satisfy this.

**Worked example.** Ticket: "Show project health score on the project dashboard."

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

A table covering behavior on empty, failed, zero, and unconfigured input, for every rendered number, grade, or judgment the ticket introduces. The mandated default is rendering "Not measured." Fabricating a value, including using zero as a stand-in for missing data, is banned.

**Worked example**, same ticket:

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

Explicit deferrals, plus any open product call the ticket surfaces. Every deferral names a real ticket number, and every open call names an owner. An untracked deferral disappears silently, and an unowned question never gets answered.

A ticket that was sliced thin on purpose also carries a line here, `Ships alone: <reason>`, so the dispatcher never bundles it with its neighbors (see `specdesk/SPECDESK.md`, "Flow for each idea").

**Worked example**, same ticket:

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

- **Specdesk** checks all three sections, the title-verb rule, the placement of a UI ticket, and the absence of an open product question before it adds `agent-ready` (the queue bar in `specdesk/SPECDESK.md`).
- **`dispatcher.mjs check <ID>`** runs the mechanical part on one ticket: an `## Acceptance scenarios` heading, a Size label, and a priority. The dispatcher runs the same check on every `agent-ready` ticket before it claims one. A ticket that fails loses `agent-ready`, gets a comment saying why, and becomes an item in the human's inbox.
- **The worker** builds to the scenarios, and every scenario is exercised by a test (`docs/no-tracer-bullets.md`, Definition of Done).
- **The verifier** walks the scenarios against a deployed environment after merge and posts the evidence comment below (`docs/build-process.md`).

The check is mechanical on purpose. It cannot tell a good scenario from a bad one, so reading the scenarios stays the job of whoever writes and reviews the ticket.

## The evidence comment contract

The verifier posts this comment on the ticket when it finishes walking the scenarios against a deployed environment. A walk on production posts the same comment and counts the same way:

- Header, literal: `## Verify evidence`, on its own line. The character after the heading is end-of-string or a newline; leading whitespace or blank lines before it are tolerated. A heading with trailing text on the same line (`## Verify evidence-gathering plan`) or the phrase merely mentioned mid-sentence does not count. The queue reads the heading from `linear.verifyEvidenceHeading` in the config, so keep one owner for the string and read it from there rather than re-typing it where something needs to match on it.
- A table with one row per scenario, columns in the order scenario, result, evidence. Header-cell wording and casing carry no meaning: anything that parses the table reads header cells case-insensitively and trims whitespace. Only the `## Verify evidence` header line and the footer line are literal. The scenario cell carries enough of the scenario's own text to stay readable on its own, since the comment outlives the ticket description it was written against, and a bare row number goes unreadable the moment the scenarios get edited or renumbered.
- Footer, literal format: `_Verified <ISO> on <env> as <persona> against <sha>_`, where `<env>` is one of your environment names (the environment the scenarios were walked on, and no other word) and `<sha>` is the full 40-character commit SHA that environment serves, as its health URL reports it. An abbreviated SHA is ambiguous and gets more so as the repo grows, and the full SHA costs nothing to obtain.
- The result cell is strict: exactly `PASS` or `FAIL`, uppercase, alone in the cell. `pass`, `PASSED`, and `PASS (with caveats)` all count as unreadable evidence rather than a silent PASS.
- The evidence cell carries a link to an artifact (a screenshot or recording) hosted by the tracker. A cell holding prose counts as a malformed row, the same as a decorated result cell does. The reason is that a sentence in the evidence column is free to type and points at nothing. With Linear, an asset URL is minted by Linear's own `fileUpload` mutation, so the row is backed by bytes somebody actually put in the workspace. The cell can carry a link plus commentary; only the link has to be there.

**Worked example:**

```
## Verify evidence

| scenario | result | evidence |
| --- | --- | --- |
| 1: manager sees the score once a health check completes | PASS | [recording](https://uploads.linear.app/…) |
| 2: recalculate updates the score in place | PASS | [recording](https://uploads.linear.app/…) |
| 3: contributor sees "Not measured" before a health check exists | FAIL | [recording](https://uploads.linear.app/…) · observed: contributor role cannot reach /projects/:id, blocked by a route guard |

_Verified 2026-08-31T14:32:00Z on staging as project manager against a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f80912_
```

A single FAIL keeps the ticket in Verifying. The fix targets the failing scenario and re-verifies every scenario in the set, since a fix can regress one that passed before it.

A ticket can carry more than one `## Verify evidence` comment over its life, and the newest one by creation time is the one that counts. A stale FAIL from an earlier run does not outlive the fresh PASS that supersedes it, and a fresh FAIL correctly supersedes an older PASS if a regression shows up on re-verify.

## Who should author an evidence comment

Recommendation: only the tracker identity that the queue's API key authenticates as. Treat comments written by anyone else as non-evidence, however well formed, and let "newest wins" apply within that set so a forged comment posted after a real one cannot supersede it.

The reason is that every rule above governs the shape of a comment, and shape is something any workspace member can type. Without the author binding, a hand-written table is indistinguishable from a real verification run, which leaves the contract a formatting convention instead of a control. The verifier posts with the same key the reader checks against, so binding the author costs a real run nothing.

Two consequences to plan for. Binding to the key holder means that person can still author evidence for their own release; a dedicated automation account that nobody signs in as closes that. And rotating the key onto a different account invalidates every evidence comment the old account posted, which shows up as a refusal rather than a silent pass. Re-verify the affected tickets, or rotate within the same account.

## Reopen rule

Reopen a ticket when a defect breaks one of its own acceptance scenarios. Its Done was false, and the fix re-verifies the same scenario set it broke. File a new ticket only for genuinely new scope, work none of the original scenarios claimed to cover. The new ticket carries its own `## Acceptance scenarios` and updates the spec from there.

## Exempting a ticket from evidence

Some tickets have nothing a verifier can walk (a pure documentation change, say). If you let a label skip the evidence check, treat it as a real bypass and give it three rules:

- Only the person accountable for the product applies it.
- The label never goes on without a comment on the ticket stating why it is exempt from carrying `## Verify evidence`.
- Whatever sweeps for Done tickets without evidence reports the exempt count on every run, so an exemption stays visible instead of disappearing into a quiet label.

Unless something checks who applied the label, all three rules are enforced by discipline alone.
