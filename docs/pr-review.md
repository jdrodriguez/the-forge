# PR Review Loop

The protocol a worker follows from the first push until its PR merges, and the one the orchestrator session follows when it supervises several PRs at once. Read it before opening or working any PR. The repo, base branch, review check and rerun label named below come from the config (`github.repo`, `github.baseBranch`, `github.reviewCheck`, `github.rerunLabel`); `docs/configuration.md` explains each.

## Terminal states

Once you open a PR (or dispatch workers that will), you own the monitoring loop until every PR reaches a terminal state. Going quiet after opening a PR and waiting for the human to ask "is CI done?" is a defect, and so is ending a turn with "let me know when CI finishes".

The only valid stop conditions:

1. The PR is merged and the post-merge deploy of the pre-production environment is verified.
2. The PR is blocked on a product, security or scope decision you cannot make, surfaced crisply (a worker asks through `inbox/ask-human.sh`).
3. The 3-round review cap is hit, the follow-up is filed, the threads are resolved, and you have reported.

A merge deploys the pre-production environment. Nothing in this loop promotes to production. Production is a separate step a human initiates, on an explicit instruction. If you believe production needs a deploy, surface it and stop.

**Drive, don't park.** Schedule the next check with your wake-up mechanism (in Claude Code, `ScheduleWakeup`). About 2 to 3 minutes after any push, with no exceptions: the fast gates fail in minutes 1 to 3, and a 4-minute first check has lost the race to a lint failure. After that window is clean, about 4 minutes while CI runs, about 15 to 20 minutes while only the review is pending, about 30 minutes when waiting on a human decision.

**Each tick:**

- poll CI and the review check;
- auto-fix clear findings and push once per round;
- reply to out-of-scope findings and escalate them;
- resolve stale threads;
- rebase only when the PR conflicts with the base branch or needs something that landed on it, never just because it is behind;
- merge when the gate is green: the review check `COMPLETED`, all threads resolved, the build green.

## Reading a PR's feedback

Standard `gh pr view --comments` misses inline code review comments. Pull all three sources:

```bash
gh pr view <pr> --json reviews                                    # review summaries
gh api repos/<owner>/<repo>/pulls/<pr>/comments --paginate         # inline comments, resolved ones included
gh pr view <pr> --json comments                                    # issue-level comments
```

The REST comments endpoint also returns resolved comments and carries no resolution state. For the open threads only, use GraphQL:

```bash
gh api graphql -F n=<pr> -f query='query($n:Int!){repository(owner:"<owner>",name:"<repo>"){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved path line comments(first:1){nodes{databaseId body}}}}}}}' \
  -q '.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)'
```

Reply to a thread with the REST replies endpoint (`gh api repos/<owner>/<repo>/pulls/<pr>/comments/<comment_id>/replies -f body=...`) and resolve it with the `resolveReviewThread` mutation, passing the thread `id`.

## Rebase only when the PR needs it

The base branch moves within minutes, so a PR is usually behind, and being behind is not a reason to rebase. A rebase costs a fresh CI run, and a force-push can go stale while a long pre-push hook runs. Rebase only when the PR conflicts with the base or needs something that landed on it. A gate that fails because of a change on the base counts as needing it. When you do rebase, rebase rather than merge-commit, to keep history linear.

1. **Before you start work.** Create the branch from a freshly fetched base: `git fetch origin && git worktree add -b <branch> <path> origin/<baseBranch>`.
2. **At the review cycle, only on a conflict or a real need.** Before each batch-respond commit, run `gh pr view <pr> --json mergeable`. If it says `CONFLICTING`, or the PR needs something from the base, run `git rebase origin/<baseBranch>` and force-push with lease as part of the same batch commit. Resolve conflicts in the worktree, re-run the local QA and the CI-only gates, then push.

Force-push rule: only ever `--force-with-lease`, never bare `--force`. The lease aborts if a reviewer or a co-agent pushed to the branch since your last fetch.

## Handling the review cycle

The automated review is asynchronous: it reviews commit N while you are on commit N+1, so most "new" findings on round 3 and later are stale recurrences of things already fixed. Burning half an hour of tokens per round is the failure mode.

**Check status is not the same as reviews posted. Read the threads before every merge.** The review check (`github.reviewCheck`) showing `SKIPPED`, `CANCELLED` or `COMPLETED` tells you nothing about whether reviewers left findings. Other reviewers (a second model-based reviewer, a human) post inline review threads that do not gate the check and are invisible in `statusCheckRollup`. Before any merge, pull the actual reviews with the three commands above. Merging on green CI while the review check read `SKIPPED` once dropped a real finding that a second reviewer had flagged inline: the check status had been treated as "no review". Never let the rollup stand in for reading the comments.

**Requesting a re-review.** The first review round runs on its own. After that round, a push, a draft-to-ready flip, or a reopen may start no review. When your setup works that way, add the label named in `github.rerunLabel` (`gh pr edit <pr> --add-label <rerunLabel>`) to review the current head once. The label works whether CI is still running or done. If your review bot re-runs on every push, set `rerunLabel` to null and skip this. Never close and reopen a PR or toggle draft and ready to get a review: neither reliably starts one, and reopening while a CI run is in flight cancels that run and leaves the SHA carrying a failure that has nothing to do with the code.

### Review rounds: one push per round

Every push to a ready PR re-runs CI. When review findings land:

1. Wait for the round to finish (the review check completes), then read **all** open threads.
2. Fix them together. Reply to and resolve each thread. A thread already fixed at HEAD gets resolved without a second fix.
3. Run your local quality gate once on the batch, push **once**, then request the next round (the rerun label).

Never push per finding, and never toggle a PR between draft and ready to re-trigger a review. In one month, commits per PR went from 4.6 to 11, and a single PR took 136 bot comments and 50 CI runs. Another was flipped back to ready 530 times in 30 hours, and each flip started a full review.

Two habits for reading CI:

1. **Read failures against the newest run of each workflow.** A SHA accumulates check-runs from every superseded attempt. `gh api .../commits/<sha>/check-runs` returns all of them, so a stale `failure` from a cancelled run looks identical to a live one. Scope the judgment to the newest run for that workflow, or re-read after everything settles.
2. **Count check-runs across every page.** `gh api .../check-runs?per_page=100` paginates. A PR with more than 100 check-runs silently returns a subset, so counting "axes passed" off one page can report zero when five passed. Always `--paginate` and sum across pages.

### The review-cycle protocol

1. **Run the comprehensive local QA pass before the first push.** Self-review the diff as a hostile reviewer would. For a PR that touches more than 300 lines or introduces a new abstraction, also run an independent review of the full diff before pushing: `scripts/cross-review.sh <worktree> [base-ref]` sends it to Codex and Grok, and a Claude code-review subagent is the fallback. The local pass should find every class of issue the CI review finds: comments, type safety, dead scaffolding, sibling-coverage gaps, forward-looking comments. It costs about three minutes and saves four to eight review rounds at about ten minutes each. It must also run every CI-only gate script your repo has (duplicate-code, unused-export, dependency-boundary and test-quality gates, say). Those are usually not in the pre-push hook, so a green hook does not imply a green CI job. Run each against the same base CI uses: if CI diffs against the base branch tip, a merge-base run can pass locally while CI fails on a clone whose counterpart changed on the base after you branched.

2. **Batch-respond per review cycle: one push per round, never one per finding.** When the review posts threads on commit N:
   - wait for the entire cycle to land (the review check completes);
   - read all open threads;
   - fix them together, resolve each one, run the quality gate once, then make one commit and one push.

   Pushing per finding produces a stale-recurrence pattern: round N+1 re-flags issues your round N commit already fixed, because the review was reading the older SHA. It also multiplies CI runs. Before the batch commit, check for a conflict (`gh pr view <pr> --json mergeable`). If the PR conflicts with the base or needs something from it, rebase onto `origin/<baseBranch>` and fold the `--force-with-lease` push into the same batch.

3. **Distinguish fresh findings from stale ones.** Before fixing anything, read the actual file at HEAD for the issue. If it is already fixed, the thread is stale: resolve it (`resolveReviewThread`) and move on. Do not make a commit "to address" something already addressed.

4. **Cap the cycle at 3 rounds, then triage what is left by severity.** Round 3 is the last round where you push fixes and wait for a fresh review pass. At the cap, split what is left by severity instead of filing everything as a follow-up:
   - **Correctness and spec findings** (a wrong behavior, a missed edge case, anything the review flags against the ticket's `## Acceptance scenarios`) get fixed in this PR before merge, regardless of round. These are the findings the gate exists to catch, and hitting the round cap is no license to ship a ticket known to be wrong.
   - **Genuine nits and out-of-scope items** (naming preferences, a refactor bigger than this PR's scope, a "consider also doing X" outside this ticket) become tickets, filed and scheduled into the current cycle rather than dropped into an unbounded backlog. Name the specific next PR or sprint slot.

   Post a PR comment naming the triage split, resolve the threads, and merge once the correctness and spec fixes are in and CI is green. Merging past a stuck or pending review check with admin rights is for a stuck check with the quality jobs green, never over a red one, and only after this triage is done.

5. **Watch for the review bot's stale-thread patterns.** Common triggers:
   - A test added in commit N-1, and the bot still flags "missing test" on commit N.
   - A forward-looking comment ("follow-up in slice X") stripped in commit N-1, and the bot still flags the phrasing on commit N.
   - A function migrated in commit N-1, and the bot still flags the un-migrated form on commit N.

   When you see these, resolve as stale rather than re-fix.

**Structural alternative considered:** the right long-term fix is a local pre-push hook that runs the same reviewer prompts the CI review runs. Until that exists, the independent local review before the first push is the closest manual equivalent.

## Orchestrating several PRs

When N workers each build one PR (a wave of tickets, or an audit backlog cleared one bundle per worker), the single-PR protocol above is not enough. These extensions are non-negotiable:

1. **The orchestrator owns the merge. Workers never merge.** A worker pushes, opens the PR, runs the review cycle to settlement, and stops. In this repo the dispatcher merges a green PR, and hands a green PR that touches a risky path (`dispatcher.riskyPathPatterns`) to the orchestrator session, which reads it and merges. This gives one control point for the deploy verification, the ticket update, and the post-merge watch. The alternative, workers merging themselves, produced PRs merged before the review even ran, one of which dropped four real findings 40 seconds after they were posted.

2. **"Review completed" means the review check shows status `COMPLETED`, not "CI is green."** The review runs as a separate workflow alongside CI and finishes later. Workers merged on green CI while the review was still `IN_PROGRESS`. Prompts must poll `gh pr view <pr> --json statusCheckRollup` for the review check specifically, because `gh pr checks --watch` exits when CI is green regardless of the review's state.

3. **3-cap with severity triage.** When a worker's third review round still surfaces findings, it triages by severity as above: fix correctness and spec findings before stopping, regardless of round; file only genuine nits and out-of-scope items as a follow-up, linked in a PR comment with the threads resolved. The worker then stops and reports. The orchestrator merges separately. Expect a fourth round to land after the cap: the third round's commit triggers CI, and the review of it can post findings the worker never saw. The orchestrator catches those at merge time and triages them the same way.

4. **Pre-push production-build verification is part of the worker's standing checklist.** Type-check, lint and tests catch logic bugs. They do not catch deploy-time bugs. A bundle that skipped the local production build shipped a `USER` directive against a base image that has no such user, and production was down for 14 hours across 12 consecutive deploys before anyone checked. For Dockerfile changes specifically: `docker build` the touched Dockerfile locally, then `docker run --rm <image> id <user>` for every `USER` directive added. A Dockerfile that builds cleanly may still fail to run, and startup failures look identical to success in build logs.

5. **Workers do not write to the tracker unless the brief says they can.** In the default setup a worker has no tracker access, and the orchestrator and dispatcher post ticket comments and file follow-up tickets after merge. Prompts forbid tracker comments and issue filing from a worker so it does not burn its tool budget on a path that is blocked. If a tracker write endpoint rate-limits at sustained throughput, retry after about 30 seconds.

**Wave structure.** Define disjoint file zones before dispatching a wave. Bundle tickets that touch the same files into a single worker rather than racing two workers on the same file. During a wave the orchestrator polls PR state on each worker's completion, gates and merges per PR (review completed, threads resolved, production build green), watches the post-merge deploy on the new base commit, and reports a wave summary before dispatching the next. This is a continuous loop. After dispatch and after the triage report, schedule the next check, re-enter, advance every open PR, and reschedule until each reaches a terminal state (merged and deployed, blocked on a human decision, or at the 3-round cap with its follow-up filed). A turn that ends with "let me know when CI is done" is the defect: the orchestrator owns the wake-up.

**Deploy gate after merge.** Every merge redeploys every deployable service in the repo. Verify that each service's latest deploy succeeded, passing the service name explicitly where the CLI shows only the linked one. If any service failed, file a revert PR before merging the next PR of the wave.

**Done sweep after merge.** After each merge wave, sweep for tickets the wave itself moved to Done without a `## Verify evidence` comment having landed first (`docs/ticket-spec.md`). No code review gate can see that. Read the sweep's output before acting, then bounce each reported ticket back to Verifying with a comment, never blind.

**Worktree teardown is the orchestrator's job.** Leaving worktrees behind produces a graveyard of merged branches, orphan agent refs, locks held by dead PIDs, and abandoned uncommitted drafts. After each PR merges, from the main checkout: `git worktree unlock <p> 2>/dev/null; git worktree remove -f <p>; git branch -D <branch>` (merged means the commits are on the base, so nothing is lost). Run a standing sweep at session start and after every merge wave. Hard rules: never force-remove a worktree whose lock PID is still alive (`ps -p <pid>`), and never remove a dirty worktree without preserving its uncommitted changes first. Upstream of teardown, workers pin their branch to the ticket at creation (`github.branchTemplate`) instead of pushing a second branch beside the runtime's auto-named one, anchor every git mutation and file write to their own worktree root, and stop only with a clean tree. An abandoned uncommitted draft is work the next cleanup silently drops.

## Learn from the review

After all reviewer threads are addressed and resolved, run a short retrospective. Review-loop tokens are paid for once, and the lesson is paid for forever if it is not captured. Answer each question in one or two sentences:

1. **What did the reviewer catch that I should have caught?** For each fixed comment, ask whether the issue was derivable from rules you already had access to (the repo's rules docs, your notes, sibling files) or was new knowledge. If the former, why did the pre-push self-review miss it?
2. **Is this a pattern or a one-off?** A typo or a missed import is a one-off. A class of mistake ("I copied the original pattern without auditing it", "I established a convention in one file but did not apply it to touched siblings") is a pattern worth recording.
3. **Was there a workflow gap?** If a step missing from the quality gate, the self-review checklist or the worker brief would have caught it, flag the gap.

Then offer the human the relevant updates. For a real pattern, propose a written rule that leads with the rule, then the specific incident, then when it applies. For a workflow gap, propose a focused edit to the rules doc or the gate. For a one-off, acknowledge briefly and move on. Do not manufacture lessons that are not there.

The bar for recording is "this will recur on future PRs", and "the bot found something I fixed" does not meet it. Recording low-signal lessons crowds out high-signal ones.
