// worktree-state.mjs: the queue board's Worktrees view. Joins each machine's worktrees (worktrees.mjs) with the newest
// PR for each branch on GitHub and with the live workers, and gives every worktree one state:
//   active   a process has its working folder in it, or a live worker builds its branch
//   open     its branch has an open PR
//   merged   its PR merged
//   closed   its PR was closed without merging
//   local    no PR, and it holds work that is nowhere else (uncommitted changes, or commits on no remote branch)
//   nopr     no PR, and nothing in it that GitHub lacks
//   missing  git still lists it, but its folder is gone (git worktree prune clears these)
// A merged or closed worktree that holds nothing GitHub lacks is marked removable.

const PR_FIELDS = 'number url title state isDraft headRefOid';

// The newest PR for every branch, one GraphQL call per repository, so a repository the token can't read fails alone.
export async function branchPrs(gql, scans) {
  const bySlug = new Map();
  for (const s of scans) {
    for (const r of s?.repos ?? []) {
      if (!r.slug) continue;
      const set = bySlug.get(r.slug) ?? new Set();
      for (const w of r.worktrees) if (w.branch) set.add(w.branch);
      bySlug.set(r.slug, set);
    }
  }
  const prs = {};
  const errors = [];
  await Promise.all([...bySlug].map(async ([slug, set]) => {
    const [owner, name] = slug.split('/');
    const branches = [...set];
    for (let i = 0; i < branches.length; i += 100) {
      const chunk = branches.slice(i, i + 100);
      const parts = chunk.map((b, j) => `b${j}: pullRequests(headRefName:${JSON.stringify(b)}, first:1, orderBy:{field:CREATED_AT, direction:DESC}){ nodes{ ${PR_FIELDS} } }`);
      try {
        const repo = (await gql(`query{ repository(owner:${JSON.stringify(owner)}, name:${JSON.stringify(name)}){ ${parts.join('\n')} } }`)).repository;
        chunk.forEach((b, j) => { prs[`${slug}|${b}`] = repo[`b${j}`].nodes[0] ?? null; });
      } catch (e) {
        errors.push(`${slug}: ${String(e?.stderr || e?.message || e).trim().split('\n').at(-1).slice(0, 200)}`);
      }
    }
  }));
  return { prs, errors };
}

// One machine's worktrees with their state. live is that machine's live tickets from the snapshot.
export function worktreeRows(scan, prs, live) {
  return (scan.repos ?? []).flatMap((r) => r.worktrees.map((w) => {
    const key = `${r.slug}|${w.branch}`;
    const pr = prs[key] ?? null;
    const inside = (dir) => dir && (dir === w.path || dir.startsWith(`${w.path}/`));
    const workers = live.filter((t) => (w.branch && t.branch === w.branch) || inside(t.cwd)).map((t) => t.label);
    // After a squash merge deletes the branch, its commits are on no remote branch, but they are the PR's own.
    const onlyHere = w.onlyHere && !(pr && pr.headRefOid === w.head) ? w.onlyHere : 0;
    const unsaved = Boolean(w.changed || onlyHere);
    const state = w.missing ? 'missing'
      : workers.length || w.procs.length ? 'active'
        : pr?.state === 'OPEN' ? 'open'
          : pr?.state === 'MERGED' ? 'merged'
            : pr?.state === 'CLOSED' ? 'closed'
              : unsaved ? 'local' : 'nopr';
    return {
      repo: r.name,
      name: w.name,
      path: w.path,
      branch: w.branch,
      head: w.head?.slice(0, 10) ?? null,
      locked: w.locked,
      lastCommitAt: w.lastCommitAt ?? null,
      changed: w.changed ?? 0,
      onlyHere,
      procs: w.procs,
      workers,
      pr: pr ? { number: pr.number, url: pr.url, title: pr.title, state: pr.state, draft: pr.isDraft } : null,
      prChecked: !w.branch || !r.slug || Object.hasOwn(prs, key),
      state,
      removable: ['merged', 'closed'].includes(state) && !unsaved,
      error: w.error ?? null,
    };
  }));
}
