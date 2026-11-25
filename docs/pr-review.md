# PR review loop

What a worker does from its first push until its PR merges, and what the orchestrator session does when it supervises several PRs. Read it before opening or working any PR. The repo, base branch, review check and rerun label come from the config (`github.repo`, `github.baseBranch`, `github.reviewCheck`, `github.rerunLabel`), explained in `docs/configuration.md`.

## Own the loop to a terminal state

Once you open a PR, or dispatch workers that will, you own its monitoring until every PR reaches one of these states:

1. Merged, and the post-merge deploy of the pre-production environment verified.
2. Blocked on a product, security or scope decision you cannot make, asked clearly (a worker asks through `inbox/ask-human.sh`).
3. At the 3-round review cap, with the follow-up filed, the threads resolved, and a report made.

Going quiet after opening a PR is a defect. So is ending a turn with "let me know when CI finishes".

A merge deploys pre-production only. Nothing in this loop promotes to production. Production is a step a human starts on an explicit instruction. If you think production needs a deploy, say so and stop.

**Schedule the next check** with your wake-up mechanism (in Claude Code, `ScheduleWakeup`):

- 2 to 3 minutes after any push, always. The fast gates fail in the first 3 minutes.
- About 4 minutes while CI runs, once that window is clean.
- 15 to 20 minutes while only the review is pending.
- About 30 minutes while waiting on a human decision.

**Each check:**

- poll CI and the review check;
- fix clear findings and push once per round;
- reply to out-of-scope findings and escalate them;
- resolve stale threads;
- rebase only when needed (below);
- merge when the gate is green: the review check `COMPLETED`, every thread resolved, the build green.

## Read every source of feedback

`gh pr view --comments` misses inline review comments. Pull all three sources:

```bash
gh pr view <pr> --json reviews                                    # review summaries
gh api repos/<owner>/<repo>/pulls/<pr>/comments --paginate         # inline comments, resolved ones included
gh pr view <pr> --json comments                                    # issue-level comments
```

The REST endpoint returns resolved comments too and has no resolution state. For open threads only, use GraphQL:

```bash
gh api graphql -F n=<pr> -f query='query($n:Int!){repository(owner:"<owner>",name:"<repo>"){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved path line comments(first:1){nodes{databaseId body}}}}}}}' \
  -q '.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)'
```

Reply to a thread with `gh api repos/<owner>/<repo>/pulls/<pr>/comments/<comment_id>/replies -f body=...`. Resolve it with the `resolveReviewThread` mutation, passing the thread `id`.

**Pull all three sources again before every merge.** The review check (`github.reviewCheck`) reading `SKIPPED`, `CANCELLED` or `COMPLETED` says nothing about whether reviewers left findings. Other reviewers, such as a second model or a human, post inline threads that do not gate the check and do not show in `statusCheckRollup`. Never let the rollup stand in for reading the comments.

**Read CI against the newest run of each workflow.** A SHA collects check-runs from every superseded attempt, and `gh api .../commits/<sha>/check-runs` returns all of them, so a stale `failure` from a cancelled run looks like a live one. Judge only the newest run per workflow, or re-read once everything settles.

**Count check-runs across every page.** `gh api .../check-runs?per_page=100` paginates, and past 100 check-runs one page is a silent subset. Always `--paginate` and sum the pages.

## Before you start work

Create the branch from a freshly fetched base: `git fetch origin && git worktree add -b <branch> <path> origin/<baseBranch>`.

## Before the first push

1. Self-review the diff as a hostile reviewer would. Look for every class of issue the CI review finds: comments, type safety, dead scaffolding, siblings the change missed, forward-looking comments.
2. For a PR over 300 lines or one that adds a new abstraction, also get an independent review of the full diff: `scripts/cross-review.sh <worktree> [base-ref]` sends it to Codex and Grok. A Claude code-review subagent is the fallback.
3. Run every CI-only gate script your repo has (duplicate-code, unused-export, dependency-boundary and test-quality gates, for example). A green pre-push hook does not mean a green CI job. Run each against the same base CI uses: if CI diffs against the base branch tip, a merge-base run can pass locally and fail in CI.
4. Run the production build locally, before this push and every later one. Type-check, lint and tests do not catch deploy-time bugs. For a changed Dockerfile, `docker build` it, then `docker run --rm <image> id <user>` for every `USER` directive you added. A Dockerfile that builds can still fail to start, and the build log will not show it.

## Review rounds

The automated review is asynchronous. It reviews commit N while you are on N+1, so most findings from round 3 on are stale repeats of things already fixed.

**One push per round.** Every push to a ready PR re-runs CI. When findings land:

1. Wait for the round to finish (the review check completes), then read all open threads.
2. For each finding, read the file at HEAD first. If it is already fixed, the thread is stale: resolve it and make no commit for it.
3. Fix the rest together. Reply to and resolve each thread.
4. Check for a conflict with `gh pr view <pr> --json mergeable` and rebase if needed (below), as part of this batch.
5. Run your local quality gate once, make one commit and one push, then request the next round.

Never push per finding. It multiplies CI runs, and the next round re-flags what you already fixed because it read the older SHA.

**Requesting a re-review.** The first round runs on its own. After it, a push, a draft-to-ready flip or a reopen may start no review. In that setup, add the `github.rerunLabel` label (`gh pr edit <pr> --add-label <rerunLabel>`) to review the current head once. It works whether CI is running or done. If your review bot re-runs on every push, set `rerunLabel` to null and skip this. Never close and reopen a PR, or toggle draft and ready, to get a review. Neither reliably starts one, and a reopen during a CI run cancels that run and leaves an unrelated failure on the SHA.

**Stale-thread patterns.** Resolve these as stale instead of fixing again:

- A test added in commit N-1, and the bot still flags "missing test" on commit N.
- A forward-looking comment ("follow-up in slice X") removed in N-1, and the bot still flags it on N.
- A function migrated in N-1, and the bot still flags the old form on N.

**Cap at 3 rounds, then triage by severity.** Round 3 is the last round where you push fixes and wait for a fresh review. What is left after it splits two ways:

- **Correctness and spec findings** (a wrong behavior, a missed edge case, anything flagged against the ticket's `## Acceptance scenarios`) get fixed in this PR before merge, whatever the round.
- **Nits and out-of-scope items** (naming preferences, a refactor bigger than this PR, "consider also doing X") become tickets scheduled into the current cycle. Name the next PR or sprint slot they go in.

Post a PR comment naming the split, resolve the threads, and merge once the correctness and spec fixes are in and CI is green. Merging past a review check with admin rights is only for a stuck check with the quality jobs green, never over a red one, and only after this triage.

## Rebase only when the PR needs it

The base branch moves within minutes, so a PR is usually behind. Being behind is not a reason to rebase: a rebase costs a fresh CI run, and a force-push can go stale while a long pre-push hook runs.

Rebase only when `gh pr view <pr> --json mergeable` says `CONFLICTING`, or the PR needs something that landed on the base. A gate that fails because of a change on the base counts. Then:

1. `git rebase origin/<baseBranch>`. Rebase, never merge-commit, to keep history linear.
2. Resolve conflicts in the worktree, and re-run the local QA and the CI-only gates.
3. Push with `--force-with-lease`, never bare `--force`, in the same batch as that round's fixes. The lease aborts if someone else pushed to the branch since your last fetch.

## Orchestrating several PRs

When several workers each build one PR, these rules apply on top of the ones above.

1. **Workers never merge.** A worker pushes, opens the PR, runs the review rounds to settlement, and stops. The dispatcher merges a green PR. A green PR that touches a risky path (`dispatcher.riskyPathPatterns`) goes to the orchestrator session, which reads it and merges.
2. **"Review completed" means the review check's status is `COMPLETED`.** Green CI is not enough, because the review runs as a separate workflow and finishes later. Worker prompts must poll `gh pr view <pr> --json statusCheckRollup` for the review check itself. `gh pr checks --watch` exits when CI is green, whatever the review's state.
3. **Workers triage at the cap and stop.** At its third round a worker fixes correctness and spec findings, files only nits and out-of-scope items as a follow-up linked in a PR comment, resolves the threads, stops and reports. Expect a fourth round to land after the cap, from the review of the third round's commit. The orchestrator triages those the same way at merge time.
4. **Workers do not write to the tracker unless the brief allows it.** By default a worker has no tracker access, and worker prompts forbid tracker comments and issue filing. The orchestrator and dispatcher post ticket comments and file follow-ups after merge. If a tracker write rate-limits, retry after about 30 seconds.

**Waves.** Define disjoint file zones before dispatching a wave. Give tickets that touch the same files to one worker. As each worker finishes, poll its PR, gate and merge it (review completed, threads resolved, production build green), and watch the post-merge deploy on the new base commit. Report a wave summary before dispatching the next. After each dispatch and each triage report, schedule the next check and keep advancing every open PR until each reaches a terminal state.

**Deploy gate.** Every merge redeploys every deployable service in the repo. Check that each service's latest deploy succeeded, naming the service explicitly where the CLI shows only the linked one. If one failed, open a revert PR before merging the next PR of the wave.

**Done sweep.** After each wave, sweep for tickets the wave moved to Done without a `## Verify evidence` comment landing first (`docs/ticket-spec.md`). Read the sweep's output, then move each reported ticket back to Verifying with a comment.

**Worktree teardown.** After each PR merges, from the main checkout run `git worktree unlock <p> 2>/dev/null; git worktree remove -f <p>; git branch -D <branch>`. The commits are on the base, so nothing is lost. Also run a sweep at session start and after every wave. Never force-remove a worktree whose lock PID is still alive (`ps -p <pid>`), and never remove a dirty worktree without saving its uncommitted changes first.

Workers make teardown safe: they name their branch from the ticket at creation (`github.branchTemplate`) instead of pushing a second branch beside an auto-named one, anchor every git mutation and file write to their own worktree root, and stop only with a clean tree.

## Learn from the review

Once every thread is resolved, answer each question in a sentence or two:

1. **What did the reviewer catch that I should have?** For each fixed comment, was it derivable from rules you already had (the repo's rules docs, your notes, sibling files)? If so, why did your self-review miss it?
2. **Pattern or one-off?** A typo or a missed import is a one-off. A class of mistake, such as copying a pattern without checking it or not applying a new convention to touched siblings, is a pattern.
3. **Was there a workflow gap?** Would a step in the quality gate, the self-review checklist or the worker brief have caught it?

Then offer the human updates. For a pattern, propose a written rule: the rule, the incident, and when it applies. For a workflow gap, propose an edit to the rules doc or the gate. For a one-off, say so and move on. Record a lesson only if it will recur on future PRs.
