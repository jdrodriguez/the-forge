#!/usr/bin/env node
// A stub gh for the merge tests. It answers from fixture files in $FAKE and logs every call to $FAKE/calls.log:
//   pr-<n>.json        gh pr view <n> (the whole object; the caller picks its fields)
//   runs.json          gh run list           jobs-<id>.json  gh run view <id>
//   ci.yml             gh workflow view      queue.json      the mergeQueue query
//   threads-<n>.json   reviewThreads         entry-<n>.json  the entry check right after a merge
//   poll-<n>           one pullRequest JSON per line, served in turn to the queue watcher's polls (the last repeats)
//   ref-<n>            the SHA branch-<n> points at (default: PR n's head)
// gh pr merge appends <n> to $FAKE/enqueued and, with $FAKE/merge-marks-merged present, marks the PR MERGED. A direct
// enqueue appends "enqueue" or "jump". $FAKE/hook.cjs, when present, runs first with the arguments. runs-fail,
// jobs-fail, queue-fail and entry-fail make those reads fail.
const fs = require('node:fs');

const F = process.env.FAKE;
const args = process.argv.slice(2);
fs.appendFileSync(`${F}/calls.log`, `gh ${args.join(' ')}\n`);
if (fs.existsSync(`${F}/hook.cjs`)) require(`${F}/hook.cjs`)(args);
const read = (f, dflt) => (fs.existsSync(`${F}/${f}`) ? fs.readFileSync(`${F}/${f}`, 'utf8') : dflt);
const out = (s) => process.stdout.write(typeof s === 'string' ? s : JSON.stringify(s));
const fail = () => process.exit(1);

const [a, b, n] = args;
if (a === 'pr' && b === 'view') {
  // Only the --json fields asked for, and a field the fixture lacks fails the call, so a misspelled field fails a test.
  const s = read(`pr-${n}.json`);
  if (!s) fail();
  const p = JSON.parse(s);
  const fields = (args[args.indexOf('--json') + 1] ?? '').split(',').filter(Boolean);
  const missing = fields.filter((f) => !(f in p));
  if (missing.length) { process.stderr.write(`unknown field: ${missing.join(',')}\n`); fail(); }
  out(Object.fromEntries(fields.map((f) => [f, p[f]])));
}
else if (a === 'pr' && b === 'merge' && args.includes('--disable-auto')) out('');
else if (a === 'pr' && b === 'merge') {
  if (fs.existsSync(`${F}/merge-refuse-${n}`)) fail();
  fs.appendFileSync(`${F}/enqueued`, `${n}\n`);
  if (fs.existsSync(`${F}/merge-marks-merged`)) {
    const p = JSON.parse(read(`pr-${n}.json`));
    fs.writeFileSync(`${F}/pr-${n}.json`, JSON.stringify({ ...p, state: 'MERGED' }));
  }
}
else if (a === 'run' && b === 'list') { if (fs.existsSync(`${F}/runs-fail`)) fail(); out(read('runs.json', '[]')); }
else if (a === 'run' && b === 'view') { if (fs.existsSync(`${F}/jobs-fail`)) fail(); out(read(`jobs-${n}.json`, '{"jobs":[]}')); }
else if (a === 'workflow' && b === 'view') { const s = read('ci.yml'); if (s == null) fail(); out(s); }
else if (a === 'api' && b === 'graphql') {
  const q = (args.find((x) => x.startsWith('query=')) ?? '').slice(6);
  const pr = (q.match(/pullRequest\(number:(\d+)\)/) ?? [])[1];
  const wrap = (p) => out({ data: { repository: { pullRequest: p } } });
  if (q.includes('enqueuePullRequest')) {
    if (fs.existsSync(`${F}/enqueue-refuse`)) fail();
    fs.appendFileSync(`${F}/enqueued`, q.includes('jump:true') ? 'jump\n' : 'enqueue\n');
    out({ data: {} });
  } else if (q.includes('mergeQueue(branch')) { if (fs.existsSync(`${F}/queue-fail`)) fail(); out(read('queue.json', '{"data":{"repository":{"mergeQueue":{"entries":{"nodes":[]}}}}}')); }
  else if (q.includes('reviewThreads')) wrap(JSON.parse(read(`threads-${pr}.json`, '{"reviewThreads":{"nodes":[]}}')));
  else if (q.includes('timelineItems')) {
    const lines = read(`poll-${pr}`, '{"state":"MERGED","mergeQueueEntry":null,"timelineItems":{"nodes":[]}}').trim().split('\n');
    const i = Math.min(Number(read(`pollidx-${pr}`, '0')), lines.length - 1);
    fs.writeFileSync(`${F}/pollidx-${pr}`, String(i + 1));
    wrap(JSON.parse(lines[i]));
  } else if (pr) { if (fs.existsSync(`${F}/entry-fail`)) fail(); wrap(JSON.parse(read(`entry-${pr}.json`, '{"state":"OPEN","mergeQueueEntry":{"state":"QUEUED"}}'))); }
  else out({ data: {} });
}
else if (a === 'api' && /\/git\/ref\/heads\/branch-\d+$/.test(b)) {
  // A branch-<n> ref points at PR n's head, or at $FAKE/ref-<n> when that file holds another SHA.
  const num = b.match(/branch-(\d+)$/)[1];
  out({ object: { sha: read(`ref-${num}`, null)?.trim() ?? JSON.parse(read(`pr-${num}.json`, '{}')).headRefOid } });
}
else if (a === 'api') out('');
else out('[]');
