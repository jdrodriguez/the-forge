// approvals.mjs: the approvals ledger, orchestrator.approvalsFile. Each line is one JSON record:
//   {"pr":12,"head":"<40-char sha>","repo":"owner/name","approvedAt":"<ISO>","by":"<session id>","note":"what was checked"}
// An approval covers only the exact head it names. When the PR merges, a line with "event":"merged" closes every
// approval of that PR. A line with no repo belongs to github.repo. Every ledger argument is { file, repo, defaultRepo }.
import fs from 'node:fs';
import path from 'node:path';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function readLedger({ file, repo, defaultRepo }) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.pr && (r.repo ?? defaultRepo) === repo) out.push(r);
    } catch { /* a torn line from a concurrent write */ }
  }
  return out;
}

const isMerged = (r) => r.merged === true || r.event === 'merged';

// approvalOf(ledger, pr, head): the newest approval of the PR (of that head, when given), or null.
export function approvalOf(ledger, pr, head) {
  let hit = null;
  for (const r of readLedger(ledger)) {
    if (String(r.pr) !== String(pr) || isMerged(r) || (head && r.head !== head)) continue;
    hit = r;
  }
  return hit && { ...hit, note: clean(hit.note) };
}

// approvedHeads(ledger, { days }): the newest approval of each PR not closed by a merge, from the last `days` days,
// with its age as "3h05m" or "2d4h".
export function approvedHeads(ledger, { days = 14, at = Date.now() } = {}) {
  const newest = new Map();
  for (const r of readLedger(ledger)) {
    newest.delete(String(r.pr));
    if (!isMerged(r) && r.head) newest.set(String(r.pr), r);
  }
  const out = [];
  for (const [pr, r] of newest) {
    const ms = at - Date.parse(r.approvedAt);
    if (!(ms >= 0) || ms > days * 864e5) continue;
    const m = Math.floor(ms / 6e4);
    const age = m >= 1440 ? `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
    out.push({ pr, head: r.head, age, by: clean(r.by), note: clean(r.note), approvedAt: r.approvedAt });
  }
  return out;
}

const append = (file, rec) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(rec)}\n`);
};

export function recordApproval(ledger, { pr, head, by, note }) {
  append(ledger.file, { pr: Number(pr), head, repo: ledger.repo, approvedAt: now(), by, note });
}

export function closeApprovals(ledger, { pr, head, by }) {
  append(ledger.file, { pr: Number(pr), head: head ?? null, repo: ledger.repo, event: 'merged', merged: true, at: now(), by });
}
