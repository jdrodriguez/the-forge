// verify-evidence.mjs: reads a "## Verify evidence" comment the way docs/ticket-spec.md defines it. A comment counts
// only when it opens with the heading, its table has the scenario, result and evidence columns, every row's result is
// PASS or FAIL with an uploaded asset in the evidence cell, and it ends with the footer
// "_Verified <ISO> on <env> as <persona> against <40-char sha>_" naming one of linear.verifyEnvironments.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// parseEvidence(body, { heading, environments }): null when the body is not an evidence comment, else
// { pass, fail, malformed, footer }.
export function parseEvidence(body, { heading = '## Verify evidence', environments = ['staging', 'production'] } = {}) {
  const t = String(body ?? '').trimStart();
  const rest = t.slice(heading.length);
  if (!t.startsWith(heading) || !(rest === '' || /^[\r\n]/.test(rest))) return null;
  const envs = environments.map(escape).join('|');
  const footer = new RegExp(`^_Verified\\s+\\d{4}-\\d{2}-\\d{2}T[0-9:.]+Z?\\s+on (?:${envs}) as\\s+\\S.*\\s+against\\s+[0-9a-f]{40}_$`);
  const e = { pass: 0, fail: 0, malformed: 0, footer: false };
  let inTable = false;
  for (const raw of t.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) {
      if (line === '') inTable = false;
      else if (footer.test(line)) e.footer = true;
      continue;
    }
    let inner = line.slice(1);
    if (inner.endsWith('|')) inner = inner.slice(0, -1);
    const cells = inner.split('|').map((x) => x.trim());
    if (!inTable) {
      inTable = ['scenario', 'result', 'evidence'].every((h, i) => cells[i]?.toLowerCase() === h);
      continue;
    }
    if (cells.every((x) => /^:?-+:?$/.test(x))) continue;
    if (!/https:\/\/uploads\.linear\.app\/[^\s)\]]+/.test(cells[2] ?? '')) e.malformed += 1;
    else if (cells[1] === 'PASS') e.pass += 1;
    else if (cells[1] === 'FAIL') e.fail += 1;
    else e.malformed += 1;
  }
  return e;
}

// passes(e): a footer, at least one PASS row, and no FAIL or malformed row.
export const passes = (e) => Boolean(e) && e.footer && e.pass > 0 && e.fail === 0 && e.malformed === 0;

// newestPassing(comments, { accepted, heading, environments, after }): whether the newest evidence comment by an
// accepted author was written after `after` (an ISO time) and passes. Comments are { body, createdAt, user: { id } }.
export function newestPassing(comments, { accepted, after, ...opts }) {
  const newest = comments
    .filter((c) => accepted(c) && parseEvidence(c.body, opts))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!newest || !after || !(Date.parse(newest.createdAt) > Date.parse(after))) return false;
  return passes(parseEvidence(newest.body, opts));
}
