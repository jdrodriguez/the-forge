# Failure sweep

Once a week the sweep finds the failure types that keep repeating across agent-built work and ranks them, so each repeat can get a fix at the cheapest level that enforces it.

## Run it

```
node learning/sweep.mjs                    # last 7 days
node learning/sweep.mjs --days 14
node learning/sweep.mjs --since 2026-01-05T00:00:00Z
node learning/sweep.mjs --no-ssh --dry-run # print the report without writing history, the snapshot or a report; skips other machines
node --test learning/test/*.test.mjs       # the extractor tests
```

Run it from the repo root. Its paths come from the config. A warm run takes about a minute, a cold cache about three. It needs Node 22 and:

- `gh` logged in with read access to `github.repo`;
- a Linear key (`LINEAR_API_KEY`, `linear.apiKeyCommand` or `linear.apiKeyFile`, see `lib/config.mjs`) for the /verify source;
- ssh access to each host in `learning.ssh`, for the other machines' dispatcher logs.

A source that is missing or unreachable is skipped and named under "Source problems" in the report.

## What it reads

| Source | Where | Failure type id |
|---|---|---|
| CI failures, per job | `gh api .../actions/workflows/<workflow>/runs` (`learning.ciWorkflowFile`, or the workflow named `github.ciWorkflow`), then each failed or cancelled run's jobs (all attempts), then each failed job's log | catalog id (`typecheck`, `lint`, a `learning.catalog` id, ...) or `ci:<job>:<normalized signature>` |
| merge_group failures | same, run event `merge_group` | same ids, source `merge_group` |
| Red main | `<paths.stateDir>/main-watch.log` | `red-main:<job>` |
| Review findings | inline review comments by `learning.reviewBotLogin` on PRs updated in the window | `ccr:<rule id>` (rule names come from the tables in `learning.reviewRulesGlob`) |
| /verify FAILs and reopens | Linear comments on `linear.team` issues with `linear.verifyEvidenceHeading` FAIL rows or a `Reopened` heading | `verify:fail`, `verify:reopened` |
| Dispatcher give-ups | `stuck` and `stalled` lines in `<paths.stateDir>/dispatcher.log` on this machine and every host in `learning.ssh` | `dispatcher:<kind>:<reason>` |
| Corrections (optional) | the human's feedback memory files in `learning.correctionsGlob` | `correction:<file>` |

**CI.** A fail-fast watcher cancels a run once one job fails, so the sweep reads failed jobs inside both failed and cancelled runs. Jobs matching `learning.skipJobs` are skipped: they fail only because something else did. Each failed job gets one signature, the first of these found:

1. a vitest `FAIL` line
2. an unhandled rejection's error line
3. `error TS`
4. an ESLint rule
5. size-limit
6. a gate's own failure line (`file-size-gate: FAILED`, `jscpd-changed: NEW ...`)
7. a `##[error]` message
8. a network error
9. an `ERR_PNPM_*` wrapper
10. the last error-looking line

Signatures are normalized (shas, uuids, numbers, line numbers) so one cause groups together. GitHub truncates long matrix job names, so jobs group as `test-rest [rest]`, `test-rest [shared-db]` and so on.

**Review findings.** The parser reads a finding's first line in the form `**[Axis]** Severity: RULE-ID text`, for example `**[Testing]** Important: TST-21 New DAO method has no test`. A table row `| TST-21 | Rule name |` in a rules doc gives the report a readable name.

**Corrections.** Off unless `learning.correctionsGlob` is set. File times are useless here, because sync tools, editors and the memory-hygiene pass (`docs/memory-hygiene.md`) rewrite files. The sweep keeps a hash of each feedback memory's body in `cache/memory-hashes.json`. A file missing from the last snapshot is a new correction. A changed body is a repeat lesson and counts twice. The first run has no snapshot and uses frontmatter `modified:` dates. More than 15 changed files in one week reads as a cleanup pass and is not counted.

## Ranking

Score = CI minutes + estimated human minutes + 10 per distinct PR or ticket hit.

- CI minutes for a failed job are its own duration plus an even share of its run's wall time, since the run gets repeated.
- Human minutes: red main uses its measured red minutes. The rest are estimates: a /verify FAIL or reopen 30, a dispatcher give-up 30, a correction 15 (30 for a repeat), a review finding 10. Change them in `HUMAN` in `sweep.mjs`.

"Recurring" means 2 or more distinct PRs or tickets. The same failure across one PR's reruns counts once toward that.

## The fix ladder

Prefer the lowest number that works:

1. Make it impossible (structure, types, generated defaults)
2. Lint rule or test
3. Hook or CI gate that fails early
4. Worker-brief or skill step
5. Doc rule
6. Memory note, temporary

For each type the report lists where it is enforced today, by searching for the type's key strings in:

- the built repo's ESLint config (2), `.github/workflows` and `.husky` (3), PR template (4) and `CLAUDE.md` (5);
- `~/.claude/settings.json` (3) and `~/.claude/CLAUDE.md` (5);
- this repo's `dispatcher/worker-brief.md` and `specdesk/SPECDESK.md` (4);
- anything in `learning.enforcementSources`, such as a hooks folder.

Built-in types and their strings are in `CATALOG` in `lib.mjs`. Add your own to `learning.catalog` when a new repeat deserves a stable name. Config entries are checked first.

## Did the fix hold?

`history.json` keeps every week's counts, the fixes that landed (`fixes`) and the fixes in flight (`inFlight`). Record them with `record.mjs`:

```
node learning/record.mjs inflight <type-id> --ticket ENG-123 --level 2 --note "what the fix does"
node learning/record.mjs landed   <type-id> --level 4 --note "what changed" --where <file or ticket>
node learning/record.mjs drop     <type-id>
```

When a type has a landed fix and its count did not drop from the week before, the report lists it under "Fixes that did not hold" and recommends one level lower. Types with a fix in flight drop out of "Needs a fix drafted". For a fresh fix the report shows how many of this week's events came after it landed.

## The weekly routine

Schedule a weekly Claude Code routine, Monday morning say. It runs the sweep, reads the report, and drafts fixes for up to 5 of the "Needs a fix drafted" types following the Specdesk flow: worker-brief and SPECDESK edits directly, repo fixes as tickets with the spec floor, Size, priority and project, never the ready label. It records them with `record.mjs` and sends the human one inbox item with `inbox/ask-human.sh`. A scheduled routine runs in ask mode, so every command it runs must be in the permission allow list or it hangs on the first prompt.

`linear.mjs` is the routine's Linear access, with the same key sources as the sweep:

```
node learning/linear.mjs search <term>        # open and recent issues on linear.team
node learning/linear.mjs marker <type-id>     # issues already filed for this failure type
node learning/linear.mjs projects
node learning/linear.mjs create <draft.json>  # files in learning.draftState with the Size label; never queues it
```

## Config

The `learning` section of `agent-queue.config.json`: `outDir`, `ciWorkflowFile`, `skipJobs`, `reviewBotLogin`, `reviewRulesGlob`, `correctionsGlob`, `ssh`, `catalog`, `enforcementSources`, `draftState`. `docs/configuration.md` explains each. The sweep and `linear.mjs` also read `github.repo`, `github.ciWorkflow`, `repoPath`, `paths.stateDir`, `human.name`, `linear.workspace`, `linear.team`, `linear.verifyEvidenceHeading`, `linear.sizeLabelGroup`, `linear.labels.ready` and `dispatcher.queueSizes`.

## Files

- `sweep.mjs`: the sweep. `lib.mjs`: pure helpers (signature extraction, normalization, catalog, parsers). `test/lib.test.mjs`: each extractor against a real log excerpt and a safe counterexample.
- `record.mjs`, `linear.mjs`: helpers for the routine.

Under `learning.outDir` (default `<paths.stateDir>/learning`, never inside the repo):

- `reports/<date>.md` and `.json`: the weekly reports. `history.json`: the running history.
- `cache/runs/<run id>.json`: a run's job list. `cache/jobs/<job id>.v3.txt.gz`: a gzipped excerpt of a failed job's log (the lines that can carry a signature, plus the tail), so a better extractor can re-read old jobs without refetching. The suffix is the excerpt version. Entries older than 21 days are pruned on each run.

## Known limits

- /verify FAILs group into one type. The routine reads the scenario text and comment before drafting; the sweep does not sub-cluster them.
- Only one CI workflow is read.
- The review source reads inline review comments only, so a finding that appears only in the summary comment is missed.
- Corrections are keyed by file name, so two matched files with the same name in different folders count as one.
