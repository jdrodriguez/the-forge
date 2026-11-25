// merge-policy.mjs: the rules merge-approved.mjs applies. policyFor reads the merge section of the config, checkGate
// decides whether a PR's checks let it merge, ciHold decides whether the merge queue is held, and isDriver reads the
// orchestrator lock.
import fs from 'node:fs';

const DEFAULTS = { mode: 'queue', ciHold: true, requiredChecks: [], ignoreChecks: [], reviewSupportChecks: [], reviewGateBlocks: false, adminMerge: false, resolvedThreads: false };

// policyFor(cfg, repo): the merge policy of github.repo or of a merge.repos entry, or null for any other repo. An entry
// takes merge's top-level keys for whatever it leaves out. reviewChecks defaults to [github.reviewCheck].
export function policyFor(cfg, repo) {
  const m = cfg.merge ?? {};
  const top = Object.fromEntries(Object.keys(DEFAULTS).filter((k) => m[k] !== undefined && m[k] !== null).map((k) => [k, m[k]]));
  const entry = repo === cfg.github.repo ? {} : m.repos?.[repo];
  if (!entry) return null;
  const reviewChecks = entry.reviewChecks ?? m.reviewChecks ?? (cfg.github.reviewCheck ? [cfg.github.reviewCheck] : []);
  return { ...DEFAULTS, ...top, ...entry, reviewChecks };
}

// isDriver(lockFile, sessionId): a shell outside Claude Code (no session id) is the human, and no lock file means no
// takeover has happened yet; otherwise the session id must be a line of the lock file. A lock that exists but cannot
// be read refuses every session. The lock keeps cooperating sessions from both merging; it is not access control.
export function isDriver(lockFile, sessionId) {
  if (!sessionId) return true;
  let text;
  try { text = fs.readFileSync(lockFile, 'utf8'); } catch (e) { return e.code === 'ENOENT'; }
  return text.split('\n').some((l) => l.trim() === sessionId);
}

const nameOf = (c) => c.name ?? c.context ?? '';
const resultOf = (c) => c.conclusion || c.state || '';
const OK = ['SUCCESS', 'SKIPPED', 'NEUTRAL'];

// checkGate(pr, policy): null when the PR may merge, else why not. pr carries mergeStateStatus and statusCheckRollup
// (gh pr view --json). Throws when the policy cannot be applied (a bad ignoreChecks regex), which the caller treats as
// a stop.
export function checkGate(pr, policy) {
  const states = ['CLEAN', 'HAS_HOOKS', 'UNSTABLE', ...(policy.reviewGateBlocks ? ['BLOCKED'] : [])];
  if (!states.includes(pr.mergeStateStatus)) return `merge state ${pr.mergeStateStatus}`;
  const ignored = policy.ignoreChecks.map((rx) => new RegExp(rx));
  const all = (pr.statusCheckRollup ?? []).filter((c) => !ignored.some((rx) => rx.test(nameOf(c))));
  const passed = (n) => all.some((c) => nameOf(c) === n && resultOf(c) === 'SUCCESS');
  for (const n of policy.requiredChecks) if (!passed(n)) return `${n} not passed`;
  const reviewed = policy.reviewChecks.some(passed);
  if (policy.reviewChecks.length && !reviewed) return `review not passed (${policy.reviewChecks.join(' or ')})`;
  // A cancelled run with a later run of the same check is superseded. A review support check (one that requests or
  // stamps the review) does not count once a review check passed.
  const superseded = (c) => resultOf(c) === 'CANCELLED' && all.some((o) => o !== c && nameOf(o) === nameOf(c) && resultOf(o) !== 'CANCELLED');
  const support = (c) => reviewed && policy.reviewSupportChecks.includes(nameOf(c));
  const alternateReview = (c) => reviewed && policy.reviewChecks.includes(nameOf(c));
  const bad = all.filter((c) => !OK.includes(resultOf(c)) && !superseded(c) && !support(c) && !alternateReview(c));
  return bad.length ? `check(s) failing or pending: ${[...new Set(bad.map(nameOf))].join(', ')}` : null;
}

// The CI workflow's jobs, each with its transitive needs, from its YAML: { closure: {id: [ids]}, nameToId }.
export function ciNeeds(yaml) {
  const direct = {};
  const nameToId = {};
  let inJobs = false;
  let job = null;
  let collecting = false;
  let buf = '';
  const flush = () => { if (job && collecting) direct[job] = buf.match(/[A-Za-z0-9_-]+/g) ?? []; buf = ''; collecting = false; };
  for (const raw of String(yaml ?? '').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs || !line.trim()) continue;
    if (/^\S/.test(line)) { flush(); inJobs = false; job = null; continue; }
    let m;
    if ((m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/))) { flush(); job = m[1]; continue; }
    if (!job) continue;
    if (collecting) { if (/^ {0,4}\S/.test(line)) flush(); else { buf += ` ${line}`; continue; } }
    if ((m = line.match(/^ {4}needs:\s*(.*)$/))) { buf = m[1]; collecting = true; continue; }
    if ((m = line.match(/^ {4}name:\s*(.+)$/)) && !m[1].includes('${{')) nameToId[m[1].trim().replace(/^["']|["']$/g, '')] = job;
  }
  flush();
  const closure = {};
  const deps = (id, seen = new Set()) => { for (const d of direct[id] ?? []) if (!seen.has(d)) { seen.add(d); deps(d, seen); } return seen; };
  for (const id of Object.keys(direct)) closure[id] = [...deps(id)];
  return { closure, nameToId };
}

// rootFailures(failed, needs): drops a failed job when another failed job in the same run is one it needs, so a rollup
// job that fails because a real job did never counts on its own.
export function rootFailures(failed, { closure, nameToId }) {
  const idOf = (n) => nameToId[n] ?? nameToId[n.replace(/ \(.*\)$/, '')] ?? n.replace(/ \(.*\)$/, '');
  const ids = failed.map(idOf);
  return failed.filter((_, i) => !ids.some((o, j) => j !== i && o !== ids[i] && (closure[ids[i]] ?? []).includes(o)));
}

// ciHold({ gh, ghText, repo, workflow, base }): when the two most recent finished merge-queue runs failed on the same
// root job, and no newer run passed it, returns { job, runs }; else null. Cancelled and unfinished runs are skipped: a
// cancelled run is a rebuilt group. gh(args) returns parsed JSON or null; ghText(args) returns text or null.
export function ciHold({ gh, ghText, repo, workflow, base }) {
  const needs = ciNeeds(ghText(['workflow', 'view', workflow, '--repo', repo, '--ref', base, '--yaml']) ?? '');
  const runs = (gh(['run', 'list', '--repo', repo, '--workflow', workflow, '--event', 'merge_group', '--limit', '30', '--json', 'databaseId,status,conclusion']) ?? [])
    .filter((r) => r.status === 'completed' && ['success', 'failure'].includes(r.conclusion));
  let prev = null;
  const newerPassed = new Set();
  for (const [i, r] of runs.entries()) {
    if (r.conclusion === 'success' || i >= 8) break;
    const jobs = gh(['run', 'view', String(r.databaseId), '--repo', repo, '--json', 'jobs'])?.jobs ?? [];
    const failed = rootFailures(jobs.filter((j) => j.conclusion === 'failure').map((j) => j.name), needs);
    const passed = jobs.filter((j) => j.conclusion === 'success').map((j) => j.name);
    if (prev) {
      const job = prev.failed.find((j) => failed.includes(j) && !newerPassed.has(j));
      if (job) return { job, runs: `${prev.id} and ${r.databaseId}` };
      prev.passed.forEach((j) => newerPassed.add(j));
    }
    prev = { id: r.databaseId, failed, passed };
  }
  return null;
}
