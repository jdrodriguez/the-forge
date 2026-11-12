// engine-round-note.mjs: what an engine's next round has to fix, read from GitHub: each failing check with the end of
// its failed log, each unresolved review thread, a conflict with the base branch, a draft, or no PR at all. Also the one
// case no round can fix, a review check that only waits for a re-review request, which the dispatcher answers with
// github.rerunLabel instead of spending a round. Used by engine-rounds.mjs.

const FAILING = new Set(['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR', 'CANCELLED']);
const checkName = (x) => x.name ?? x.context;
const pendingCheck = (x) => (x.__typename === 'StatusContext' || x.context ? ['PENDING', 'EXPECTED'].includes(x.state) : x.status && x.status !== 'COMPLETED');
const supersededCancel = (x, all) => x.conclusion === 'CANCELLED' && all.some((o) => o !== x && checkName(o) === checkName(x) && o.conclusion !== 'CANCELLED');

// After a PR's first review round some review bots start no review on a push: the review check on the new head fails
// with "Re-review not requested" until github.rerunLabel asks for one. That failure has nothing to fix, and a round
// spent on it is a round lost.
function reviewNotRequested(c, check) {
  if (!c.conf.github.reviewCheck || !c.conf.github.rerunLabel || checkName(check) !== c.conf.github.reviewCheck) return false;
  const url = String(check.detailsUrl ?? '');
  const id = url.includes('/actions/runs/') ? null : url.match(/\/runs\/(\d+)/)?.[1];
  if (!id) return false;
  try {
    return /^Re-review not requested/.test(JSON.parse(c.gh(['api', `repos/${c.REPO}/check-runs/${id}`])).output?.title ?? '');
  } catch {
    return false;
  }
}

// Adds the rerun label for this head: once, then again after 45 minutes (only a finished CI run reads the label), three
// times at most. Past that the stall rules judge the ticket.
export function askRerun(c, st, id, t, pr) {
  const rerun = c.conf.github.rerunLabel;
  const same = t.rerunAsk?.sha === pr.headRefOid;
  const count = same ? t.rerunAsk.count : 0;
  if (same && c.hoursSince(t.rerunAsk.at) * 60 < 45) {
    t.note = 'asked for a review of this head, waiting for it to start';
    return true;
  }
  if (count >= 3) return false;
  if (c.DRY) return c.log(`${id}: would add ${rerun} to PR #${pr.number}`) ?? true;
  try {
    c.gh(['pr', 'edit', String(pr.number), '--repo', c.REPO, '--add-label', rerun]);
  } catch (e) {
    c.log(`${id}: could not add ${rerun} to PR #${pr.number}, trying next tick (${c.errText(e)})`);
    return true;
  }
  t.rerunAsk = { sha: pr.headRefOid, at: c.iso(), count: count + 1 };
  t.note = 'asked for a review of this head';
  c.saveState(st);
  c.log(`${id}: nothing is left to fix and its review check waits for a re-review request, so ${rerun} was added to PR #${pr.number} (ask ${count + 1} for ${String(pr.headRefOid).slice(0, 10)})`);
  return true;
}

// The last 80 lines of a failed GitHub Actions job's log, from the check's details link.
function failedLog(c, check) {
  const url = check.detailsUrl ?? check.targetUrl ?? '';
  const job = url.match(/\/actions\/runs\/(\d+)\/job\/(\d+)/);
  const runId = url.match(/\/actions\/runs\/(\d+)/);
  if (!runId) return null;
  try {
    const out = c.gh(['run', 'view', ...(job ? ['--job', job[2]] : [runId[1]]), '--log-failed', '--repo', c.REPO]);
    return out.split('\n').slice(-80).map((l) => (l.length > 400 ? `${l.slice(0, 400)} [line cut]` : l)).join('\n');
  } catch (e) {
    return `(the log could not be read: ${c.errText(e).slice(0, 160)})`;
  }
}
function openThreads(c, pr) {
  const [owner, name] = c.REPO.split('/');
  const d = JSON.parse(c.gh(['api', 'graphql', '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `n=${pr.number}`, '-f',
    'query=query($owner:String!,$name:String!,$n:Int!){ repository(owner:$owner,name:$name){ pullRequest(number:$n){ reviewThreads(first:100){ nodes{ id isResolved isOutdated path line originalLine comments(first:1){ nodes{ body author{ login } } } } } } } }']));
  return d.data.repository.pullRequest.reviewThreads.nodes.filter((n) => !n.isResolved);
}

// What the next round has to fix, or null when nothing a round can fix is known yet (checks still running, or a reason
// a push cannot change). The existing stall timings apply while it is null.
export function roundWork(c, id, t, pr) {
  const parts = [];
  const why = [];
  if (!pr) {
    parts.push(`## Open the PR\n\nThe last round ended without a pull request on \`${t.branch}\`. Commit and push your work, then open the PR against ${c.BASE} with a title starting "${id}: " and the sections of the repo's pull request template, if it has one.`);
    return { parts, why: ['open the PR'] };
  }
  const dirty = ['DIRTY', 'CONFLICTING'].includes(pr.mergeStateStatus);
  if (dirty) {
    parts.push(`## Conflict with ${c.BASE}\n\nThe PR conflicts with ${c.BASE} (merge state ${pr.mergeStateStatus}). Merge origin/${c.BASE} into \`${t.branch}\`, resolve every conflict, run the gates, and push. Never rebase or force-push.`);
    return { parts, why: [`resolve its conflict with ${c.BASE}`] };
  }
  const all = pr.statusCheckRollup ?? [];
  // Checks still running decide nothing yet: one round then fixes everything they find, including new review threads.
  if (all.some(pendingCheck)) return null;
  const failed = all.filter((x) => FAILING.has(x.conclusion || x.state) && !supersededCancel(x, all));
  const rerun = failed.filter((x) => reviewNotRequested(c, x));
  const failing = failed.filter((x) => !rerun.includes(x));
  for (const x of failing) {
    const tail = failedLog(c, x);
    parts.push(`## Failing check: ${checkName(x)} (${x.conclusion || x.state})\n\n${x.detailsUrl ?? x.targetUrl ?? ''}${tail ? `\n\nThe end of its failed log:\n\n\`\`\`\n${tail}\n\`\`\`` : ''}`);
  }
  if (failing.length) why.push(`fix ${failing.length} failing check(s): ${failing.map(checkName).join(', ')}`);
  const threads = openThreads(c, pr);
  if (threads.length) {
    parts.push(`## Unresolved review threads\n\nAddress each one, then resolve it (GraphQL resolveReviewThread with its thread id). Where you disagree, reply on the thread saying why, then resolve it.\n\n${threads.map((n) => {
      const first = n.comments.nodes[0];
      return `- \`${n.path ?? '(no file)'}${n.line ?? n.originalLine ? `:${n.line ?? n.originalLine}` : ''}\`${n.isOutdated ? ' (outdated)' : ''}, thread ${n.id}, by ${first?.author?.login ?? 'unknown'}\n${String(first?.body ?? '').trim().replace(/^/gm, '  > ')}`;
    }).join('\n')}`);
    why.push(`address ${threads.length} review thread(s)`);
  }
  if (pr.isDraft && (failing.length || threads.length || !parts.length)) {
    parts.push('## Draft\n\nThe PR is a draft. Once the rest is fixed, mark it ready for review (gh pr ready).');
    why.push('mark the PR ready for review');
  }
  // Only the unrequested review is left: the dispatcher asks for it, and no round runs.
  if (rerun.length && !parts.length) return { rerun: true };
  return parts.length ? { parts, why } : null;
}
