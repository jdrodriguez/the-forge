Build Linear ticket {{ID}} in {{REPO_NAME}} as one pull request. The agent dispatcher assigned it to you. {{HUMAN}} labeled the ticket ready for the queue, which means it is spec'd and approved for an agent to build without anyone watching. The full ticket is pasted at the end.

## Setup

- Repo: {{REPO_PATH}} ({{REPO}} on GitHub). Work in your own worktree under {{WORKTREES}}/, cut from a freshly fetched origin/{{BASE}}.
- Branch: {{BRANCH}}. Use exactly this name, because the dispatcher finds your PR by it. If that branch or its PR already exists from an earlier attempt, read the PR and its threads first, and continue from them.
- PR title starts with "{{ID}}: ". You may push and open the PR. Never merge it, and never move the Linear ticket: the dispatcher merges green PRs and updates the ticket.
- Before you write code, take an inventory: the files and entry points the ticket touches, the sibling code that already solves the same shape, and anything the spec leaves open. Put it in the PR description. You can't write to Linear, so don't post it there.

## Build

- Build the full spec, with no stubs ({{ROOT}}/docs/no-tracer-bullets.md). Every acceptance scenario must run for real.
- Fill the PR body from the repo's pull request template, if it has one, and keep its sections.
- Fold related work in rather than splitting it off. A gap inside your ticket's feature that touches a few more files in the same route, service or component goes in this PR, listed in the PR body. When it needs {{HUMAN}}'s decision, recommend doing it in this PR. Recommend a follow-up ticket only for work in another area, for a different release, or for a risky change that deserves its own review and rollback: every extra PR costs CI runs and a review round, so a split needs a reason.
- Before the first push, run the repo's local checks and `{{ROOT}}/scripts/cross-review.sh` on the worktree.
- When a job in your PR's CI run fails, cancel the rest of that run right away (`gh run cancel <run id>`), then fix the failure and push. Don't wait for the other jobs to finish. Only ever cancel runs on your own PR branch, never a run on {{BASE}}.
- Never run the full test suite locally unless your ticket's spec asks for it. Run the tests your change touches, and let CI run everything else. The machine's memory and CPU are shared by every worker.
- Push through `{{GATED_PUSH}} [git push arguments]`, run as the whole Bash command with run_in_background. It runs the configured pre-push gates (format and type checks, typically) and then pushes. A failing gate fails the push: fix it and push again. Never use --no-verify. Before you push, run the tests for what you changed, since a red PR costs a full CI round.
- Then drive CI and the {{REVIEW_CHECK}} rounds yourself, following {{ROOT}}/docs/pr-review.md: batch fixes once per round, resolve threads, rebase only when the PR conflicts with {{BASE}} or needs something that landed there (being behind is not a reason), and triage at the 3-round cap as that file says.
- After every push, and whenever you are about to wait on CI, check the PR's mergeStateStatus (`gh pr view --json mergeStateStatus`). GitHub runs no PR checks while it reads DIRTY, so a CI watcher started then waits for checks that never come. When it reads DIRTY, merge origin/{{BASE}}, resolve the conflicts, and push before you wait. A pre-push hook can take a long time, and {{BASE}} often moves meanwhile, so check again after the push lands.

## When to stop

- You are done when all of these hold: the PR is open and not a draft, CI is green, the {{REVIEW_CHECK}} check is complete, and every review thread is resolved. Don't stop yet, though: the dispatcher merges green PRs only on its 20-minute ticks, and {{BASE}} often moves in between. Check the PR every 10 minutes (`gh pr view <n> --json state,mergeStateStatus`) until it reads MERGED. If it reads DIRTY, merge origin/{{BASE}}, resolve, push through the gated push, and wait for green again. Stop when it's merged, or after 3 hours of green with no merge (say so in your final message).
- If your inventory finds a blocking gap, or you hit a product decision the ticket doesn't settle, don't guess. Run `{{ROOT}}/inbox/ask-human.sh ask {{ID}} --type blocked` (or `--type decision`) `--ask "..." --recommend "..." --default "..."`. The question goes to {{HUMAN}}'s Slack. Then run exactly `{{ROOT}}/inbox/ask-human.sh wait {{ID}}` as the whole Bash command with run_in_background: true. Add no `&`, subshell, `nohup` or redirect: any of those detaches the wait and you are never woken. Keep building anything the question doesn't block. When {{HUMAN}} answers, the wait prints the answer and you are woken: continue from it. While the question is open the dispatcher never counts you as stalled.
- There is no time limit: take as long as the full spec needs, and never stop mid-work because of elapsed time. The dispatcher watches for progress (commits on your branch, PR activity, your session being busy), so push working commits to your branch as you reach checkpoints. If you are truly stuck, ask {{HUMAN}} as above instead of looping.

## Sentry fix tickets only

Skip this section unless the ticket has a `## Merge path` section, or Sentry triage wrote its description. Its merge path says how the PR merges once it is green. **Mechanical:** the dispatcher merges it. **Human review:** it waits on {{REVIEWER}}'s approval.

- If the build shows a mechanical ticket needs a human call after all, add one line to the PR body: `Merge path: human-review: <the reason in one sentence>`. For example, the fix turns out to need a behavior choice, a migration, a second package, or a reviewed path such as auth, billing or tenant code. The dispatcher reads that line, swaps the ticket's label to `{{JUDGMENT_LABEL}}`, and requests {{REVIEWER}}'s review. You can't write to Linear, so the line is how the swap happens. Never remove a line like it to get a PR merged.
- A human-review PR is done for you once it is green with every thread resolved. The dispatcher requests {{REVIEWER}}'s review and tells them on Slack. Don't request reviewers or message anyone yourself. If you are still watching the PR and {{REVIEWER}} requests changes, address each point, push once through the gated push, and reply on each review thread. Once your session has ended, the dispatcher starts a new worker with the review instead.

## Ticket {{ID}}: {{TITLE}}

{{URL}}

{{DESCRIPTION}}
