// migration-order.mjs: which of a PR's new migrations clash with the base branch, under premerge.migrations.
// policy "prefix" (the default): a new file whose prefix (its first prefixLength characters) the base branch already
// uses clashes, since the apply order between the two is undefined. policy "filename": only a file name the base branch
// already has clashes, for a migrator that applies any unapplied file whatever its prefix; an older unique name is fine.
// The dispatcher sends a clashing PR back to its worker to rename the file before the PR merges.
import path from 'node:path';

// added: the paths the PR adds. onBase: the file names in the base branch's migrations folder.
// Returns the PR's clashing files and the base branch's newest migration, for the note.
export function migrationClashes(added, onBase, { dir = 'migrations', pattern = '^\\d{14}_.*\\.sql$', prefixLength = 14, policy = 'prefix' } = {}) {
  const rx = new RegExp(pattern);
  const mine = added.filter((f) => path.dirname(f) === dir && rx.test(path.basename(f)));
  const base = onBase.filter((f) => rx.test(f)).sort();
  const newest = base.at(-1) ?? null;
  if (!mine.length || !newest) return { stale: [], newest };
  const key = policy === 'filename' ? (f) => f : (f) => f.slice(0, prefixLength);
  const taken = new Set(base.map(key));
  return { stale: mine.filter((f) => taken.has(key(path.basename(f)))), newest };
}

// What the worker is told. A new prefix after the base branch's newest one is always safe.
export function renameNote(id, stale, newest, { policy = 'prefix', prefixLength = 14, push = 'your gated push', baseBranch = 'main' } = {}) {
  const what = policy === 'filename' ? `the same file name as one ${baseBranch} already has` : `a prefix ${baseBranch} already uses`;
  return `From the agent dispatcher: ${id}'s PR is green, but its new migration has ${what} (${stale.join(', ')}), so it would clash once merged.

Merge origin/${baseBranch}, \`git mv\` each one to a new prefix after ${newest.slice(0, prefixLength)}, update every place in the PR that names the old file, rerun the migration tests, and push with ${push}. Change nothing else. The PR goes on to merge once CI is green on the new head.`;
}
