// Pure helpers for sweep.mjs: log cleaning, error-signature extraction,
// normalization and the failure-type catalog. No I/O here, so test/lib.test.mjs
// can check every rule against a real violation and a safe counterexample.

// The fix ladder, cheapest durable form first. Level numbers go up as the fix
// gets weaker; "move up a level" means toward a smaller number.
export const LADDER = {
  1: 'make it impossible (structure, types, generated defaults)',
  2: 'lint rule or test',
  3: 'hook or CI gate that fails early',
  4: 'worker-brief or skill step',
  5: 'doc rule',
  6: 'memory note (temporary)',
};

// learning.skipJobs: CI job names that fail only because something else did
// (an aggregate job, a fail-fast watcher, the review check). Case-insensitive.
export function compileSkipJobs(patterns = []) {
  return patterns.map((p) => new RegExp(p, 'i'));
}

export function stripLog(text) {
  return text
    .replace(/^﻿/, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .split('\n')
    .map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\r$/, ''));
}

// GitHub truncates long matrix names ("test-rest (rest, --filter=... blacksmith-4v..."),
// so cut at the first " (" and keep the matrix leg's first value as a qualifier.
export function jobBase(name) {
  const m = name.match(/^(.*?)\s+\((.*)$/);
  if (!m) return name.trim();
  const leg = m[2].split(',')[0].replace(/\)$/, '').trim();
  return /^\d+\/\d+$/.test(leg) ? m[1].trim() : `${m[1].trim()} [${leg}]`;
}

// What the cache keeps of a job log: every line that can carry a signature,
// with a little context, plus the tail. Small enough to keep, enough to re-extract.
export function excerpt(lines) {
  const keep = new Set();
  // High-signal markers only: generic "error" matches (pino logs, test names) crowd out the real line.
  const re = /^\s*FAIL\s|Failed Tests|error TS\d|⎯.*Unhandled|originated in "|ERR_PNPM_|##\[error\]|^> size-limit|Size limit|exceeded|^\s*[a-z][\w-]*(gate|lint|check|changed|guard)\b[^:]*:|ECONNREFUSED|ETIMEDOUT|ECONNRESET|heap out of memory|^\s+\d+:\d+\s+(error|warning)\s/;
  lines.forEach((l, i) => {
    if (re.test(l) && !/^\{"level":/.test(l)) for (let k = Math.max(0, i - 2); k <= Math.min(lines.length - 1, i + 8); k++) keep.add(k);
  });
  for (let k = Math.max(0, lines.length - 80); k < lines.length; k++) keep.add(k);
  return [...keep].sort((a, b) => a - b).slice(0, 1500).map((k) => lines[k].slice(0, 400));
}

// Collapse the parts of a message that change between occurrences of one cause.
export function normalize(sig) {
  return sig
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b[0-9a-f]{7,40}\b/g, '<sha>')
    .replace(/:\d+(:\d+)?\b/g, '')
    .replace(/\(\d+(,\d+)?\)/g, '')
    .replace(/\b\d+(\.\d+)?\s*(ms|s|m|MB|GB|KB)\b/g, '<n$2>')
    .replace(/\b\d{2,}\b/g, '<n>')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\/(home|Users)\/[^\s/]+\/[^\s]*?(packages|scripts|apps)\//g, '$2/')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

// One signature per failed job. Order matters: the most specific evidence wins,
// and wrapper errors (ERR_PNPM_*, "exit code 1") only count when nothing else exists.
export function extractSignature(lines) {
  const find = (re) => lines.findIndex((l) => re.test(l));
  const vitestFail = lines.find((l) => /^\s*FAIL\s+\S/.test(l) && !/Test Files/.test(l));
  if (vitestFail) {
    const m = vitestFail.trim().replace(/^FAIL\s+/, '').replace(/^\S+\s+(?=\S+\.(test|spec)\.)/, '');
    return { kind: 'test-fail', raw: vitestFail.trim(), sig: `FAIL ${m.split(' > ').slice(0, 2).join(' > ')}` };
  }
  const unh = lines.findLastIndex((l) => /⎯.*Unhandled (Rejection|Error)/.test(l));
  if (unh >= 0) {
    const errLine = lines.slice(unh + 1, unh + 8).find((l) => /\S/.test(l) && !/⎯|Vitest caught|This might cause|Resolve unhandled/.test(l));
    const origin = lines.find((l) => /This error originated in "/.test(l));
    const file = origin ? origin.match(/originated in "([^"]+)"/)[1] : '';
    return { kind: 'unhandled', raw: errLine?.trim() ?? '', sig: `unhandled: ${(errLine ?? '').trim()}${file ? ` [${file}]` : ''}` };
  }
  const ts = lines.find((l) => /error TS\d+/.test(l));
  if (ts) {
    const m = ts.match(/([^\s(]+\.tsx?)\(?.*?error (TS\d+): (.*)$/);
    return { kind: 'typecheck', raw: ts.trim(), sig: m ? `${m[2]} ${m[1]}: ${m[3]}` : ts.trim() };
  }
  const eslint = lines.findIndex((l) => /^\s+\d+:\d+\s+(error|warning)\s+/.test(l));
  if (eslint >= 0) {
    const rule = lines[eslint].trim().split(/\s{2,}/).pop();
    return { kind: 'lint', raw: lines[eslint].trim(), sig: `eslint ${rule}` };
  }
  if (lines.some((l) => /^> size-limit/.test(l.trim())) && lines.some((l) => /ERR_PNPM_\w+.* size:/.test(l))) {
    const over = lines.find((l) => /exceeded|over the limit|Size limit has/i.test(l));
    return { kind: 'gate', raw: over?.trim() ?? 'size-limit failed', sig: 'size-limit: a bundle is over its cap' };
  }
  const gate = lines.map((l) => l.replace(/^.*##\[error\]/, '')).find((l) => /^\s*([a-z][\w-]*(gate|lint|check|changed|guard))\b[^:]*:\s*(FAILED|NEW|FAIL\b|\d+ violation|violation|refus|blocked)/i.test(l));
  if (gate) {
    const name = gate.trim().match(/^([a-z][\w-]*)/i)[1];
    return { kind: 'gate', raw: gate.trim(), sig: `${name}: failed` };
  }
  const conn = lines.find((l) => /ECONNREFUSED|ETIMEDOUT|ECONNRESET|socket hang up/.test(l));
  const errLines = lines.filter((l) => /##\[error\]/.test(l)).map((l) => l.replace(/.*##\[error\]/, '').trim());
  const meaningful = errLines.find((l) => !/^Process completed with exit code/.test(l) && !/^The operation was canceled/.test(l));
  if (meaningful) return { kind: 'gh-error', raw: meaningful, sig: meaningful };
  if (conn) return { kind: 'network', raw: conn.trim(), sig: conn.trim().match(/(ECONNREFUSED|ETIMEDOUT|ECONNRESET|socket hang up)[^\s]*\s*\S*/)[0] };
  const pnpm = lines.find((l) => /ERR_PNPM_\w+/.test(l));
  if (pnpm) {
    const code = pnpm.match(/ERR_PNPM_\w+/)[0];
    // The workspace package and its script: "@scope/pkg@0.0.1 test:coverage" or "pkg@1.2.0 build".
    const script = pnpm.match(/(?:@[\w.-]+\/)?[\w.-]+@[\d.]+ ([\w:-]+)/);
    return { kind: 'pnpm', raw: pnpm.trim(), sig: `${code}${script ? ` ${script[1]}` : ''}` };
  }
  const exit = lines.findLast?.((l) => /##\[error\]Process completed with exit code/.test(l));
  // Last resort: the last non-empty line before the exit marker.
  const exitIdx = lines.findLastIndex((l) => /##\[error\]Process completed/.test(l));
  if (exitIdx > 0) {
    const prev = lines.slice(Math.max(0, exitIdx - 15), exitIdx).reverse().find((l) => /error|fail|✗|✖|×/i.test(l));
    if (prev) return { kind: 'tail', raw: prev.trim(), sig: prev.trim() };
  }
  return { kind: 'unknown', raw: exit ?? '', sig: 'no error line found' };
}

// The catalog: known failure types. `match` runs against `${jobBase} ${sig}`.
// `enforce` lists strings whose presence in an enforcement source counts as
// "enforced there". New types get added here when a sweep shows a repeat;
// repo-specific ones (a PR-body line your CI requires, say) go in learning.catalog.
export const CATALOG = [
  {
    id: 'pg-connection-terminated-in-tests',
    title: 'Postgres connection terminated mid-test (57P01, "terminating connection due to administrator command")',
    match: /terminating connection due to administrator command|57P01/i,
    enforce: ['57P01', 'administrator command'],
    recommend: 2,
    why: 'A test-infra flake that fails healthy PRs. Fix the teardown order or retry the pool error in the test harness, with a test that kills a backend mid-query.',
  },
  {
    id: 'ci-network-flake',
    title: 'Network error in CI (ECONNREFUSED, ETIMEDOUT, ECONNRESET)',
    match: /ECONNREFUSED|ETIMEDOUT|ECONNRESET|socket hang up/,
    enforce: ['ECONNREFUSED', 'wait-on', 'pg_isready'],
    recommend: 3,
    why: 'Usually a service not ready yet. A readiness wait in the workflow step fails early and cheaply.',
  },
  {
    id: 'typecheck',
    title: 'TypeScript error reached CI',
    match: /^\S+ TS\d+/,
    enforce: ['type-check', 'tsc --noEmit'],
    recommend: 3,
    why: 'A pre-push type-check on changed packages catches it before a CI run is spent.',
  },
  {
    id: 'lint',
    title: 'ESLint error reached CI',
    match: /^\S+ eslint /,
    enforce: ['eslint', 'lint-staged'],
    recommend: 3,
    why: 'lint-staged on commit catches it before push.',
  },
  {
    id: 'oom-heap',
    title: 'Test process ran out of memory',
    match: /heap out of memory|JavaScript heap|ERR_WORKER_OUT_OF_MEMORY|exit code 137/i,
    enforce: ['max-old-space-size'],
    recommend: 1,
    why: 'Shard size or a leaking suite; structural (shard count, isolate) beats raising the heap again.',
  },
];

// learning.catalog entries ({ id, title, match, flags?, enforce, recommend, why }, `match` a regex
// source) go ahead of the built-ins, since the first match wins.
export function buildCatalog(extra = []) {
  const own = extra.map((c) => {
    for (const k of ['id', 'title', 'match']) if (!c[k]) throw new Error(`learning.catalog entry ${c.id ?? '(no id)'} is missing ${k}`);
    let match;
    try {
      match = new RegExp(c.match, c.flags ?? 'i');
    } catch (e) {
      throw new Error(`learning.catalog entry ${c.id}: bad match pattern (${e.message})`);
    }
    return { enforce: [], recommend: 4, why: 'Look at the examples.', ...c, match };
  });
  return [...own, ...CATALOG];
}

export function classify(job, sig, catalog = CATALOG) {
  const hay = `${job} ${sig}`;
  const hit = catalog.find((c) => c.match.test(hay));
  if (hit) return hit.id;
  return `ci:${job}:${normalize(sig)}`;
}

// Review finding title line: **[Axis]** Severity: RULE-ID text
export function parseCcr(body) {
  const m = body.match(/^\*\*\[([^\]]+)\]\*\*\s*(\w+):\s*([A-Z]{2,5}-\d+)?\s*(.*)$/m);
  if (!m) return null;
  return { axis: m[1], severity: m[2], rule: m[3] ?? null, text: m[4].trim().slice(0, 200) };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The heading's words, without the leading #s: what a Linear text filter can search for.
export const headingText = (heading) => heading.replace(/^#+\s*/, '').trim();

// Rows of a verify evidence table (linear.verifyEvidenceHeading) whose result cell is FAIL.
export function verifyFailRows(body, heading = '## Verify evidence') {
  const level = heading.match(/^#+/)?.[0] ?? '##';
  const re = new RegExp(`^${escapeRe(level)}\\s+${headingText(heading).split(/\s+/).map(escapeRe).join('\\s+')}`, 'm');
  if (!re.test(body)) return [];
  return body
    .split('\n')
    .filter((l) => /^\s*\|/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((cells) => cells.includes('FAIL'))
    .map((cells) => cells.filter(Boolean)[0] ?? '');
}

export function parseMainWatch(text) {
  const events = [];
  for (const line of text.split('\n')) {
    const red = line.match(/^(\S+) main turned red at (\w+) \((.*?)\); failing (.*)$/);
    if (red) events.push({ at: red[1], kind: 'red', sha: red[2], title: red[3], failing: red[4] });
    const green = line.match(/^(\S+) main is green again at (\w+) after (\d+) min red/);
    if (green) events.push({ at: green[1], kind: 'green', sha: green[2], minutes: Number(green[3]) });
  }
  return events;
}

// Ticket IDs are <team key>-<number> (ENG-123); any team key parses.
export function parseDispatcherGiveUps(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^(\S+) ([A-Z][A-Z0-9]*-\d+): (stuck|stalled),? (.*)$/);
    if (m) {
      const reason = m[3] === 'stalled' ? 'worker busy with no commit or PR change' : (m[4].match(/merge state (\w+)/)?.[1] ? `PR stuck, merge state ${m[4].match(/merge state (\w+)/)[1]}` : 'stuck');
      out.push({ at: m[1], ticket: m[2], kind: m[3], reason, line: line.slice(0, 300) });
    }
  }
  return out;
}

// Rank score: minutes of cost (CI minutes plus estimated human minutes),
// with each distinct PR or ticket hit adding 10 so breadth outranks one long run.
export function score(t) {
  return Math.round((t.ciMinutes ?? 0) + (t.humanMinutes ?? 0) + 10 * (t.distinct ?? t.count));
}
