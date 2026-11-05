// node --test learning/test/*.test.mjs: each extractor is checked against a real violation
// (lines copied from real CI logs, package and ticket names made neutral) and a safe counterexample.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSignature, jobBase, classify, buildCatalog, compileSkipJobs, parseCcr, verifyFailRows, parseDispatcherGiveUps, parseMainWatch, normalize } from '../lib.mjs';

const sig = (text) => extractSignature(text.split('\n'));

test('jobBase handles GitHub-truncated matrix names', () => {
  assert.equal(jobBase('test-rest (rest, --filter=!@acme/api --filter=!@acme/shared --filter=!@acme/app-ui, blacksmith-4v...'), 'test-rest [rest]');
  assert.equal(jobBase('test-shared-db (4/5)'), 'test-shared-db');
  assert.equal(jobBase('devex-gates'), 'devex-gates');
});

test('vitest unhandled rejection names the error line and skips the vitest banner', () => {
  const s = sig(`⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
error: terminating connection due to administrator command
 ❯ ../../node_modules/.pnpm/pg@8.21.0/node_modules/pg/lib/client.js:646:17
This error originated in "src/lib/server/__tests__/db-read-write.integration.test.ts" test file.
 Test Files  117 passed (117)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @acme/shared@0.0.1 test:coverage: \`vitest run\`
##[error]Process completed with exit code 1.`);
  assert.match(s.sig, /^unhandled: error: terminating connection due to administrator command/);
  assert.equal(classify('test-shared-db', s.sig), 'pg-connection-terminated-in-tests');
});

test('a passing run with only a wrapper exit line is not a test failure', () => {
  const s = sig(` Test Files  117 passed (117)
##[error]Process completed with exit code 1.`);
  assert.notEqual(s.kind, 'test-fail');
  assert.notEqual(s.kind, 'unhandled');
});

test('size-limit failure is recognised under its pnpm wrapper', () => {
  const s = sig(`> size-limit
  JS initial entry (brotli) - 377 kB cap
  Size limit: 377 kB
  Size:       331.36 kB brotlied
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @acme/web@0.0.1 size: \`size-limit\`
##[error]Process completed with exit code 1.`);
  assert.equal(s.sig, 'size-limit: a bundle is over its cap');
  // Counterexample: the same pnpm wrapper on another script is not size-limit.
  assert.notEqual(sig(' ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @acme/shared@0.0.1 tenant:lint: `x`').sig, 'size-limit: a bundle is over its cap');
});

test('a pnpm wrapper names its script for any package scope', () => {
  assert.equal(sig(' ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @acme/shared@0.0.1 tenant:lint: `x`').sig, 'ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL tenant:lint:');
  assert.equal(sig(' ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  web@1.2.0 build: `vite build`').sig, 'ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL build:');
  // Counterexample: no package@version, so only the code.
  assert.equal(sig(' ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"').sig, 'ERR_PNPM_OUTDATED_LOCKFILE');
});

test('gate lines collapse to the gate name', () => {
  assert.equal(sig('jscpd-changed: NEW duplication detected. Extract the duplicated block').sig, 'jscpd-changed: failed');
  assert.equal(sig('##[error]file-size-gate: FAILED (HEAD vs 1731feb6c41f (merge-ref first parent (PR base tip))).').sig, 'file-size-gate: failed');
  // Counterexample: a passing gate's summary line.
  assert.notEqual(sig('knip-gate: no new dead code (44 known baseline issue(s) unchanged or reduced).').kind, 'gate');
});

test('typecheck and vitest FAIL lines', () => {
  assert.equal(sig("src/a.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.").kind, 'typecheck');
  const f = sig(' FAIL  src/e2e/checkout-journey.e2e.test.tsx > Checkout FE e2e > reload');
  assert.equal(f.kind, 'test-fail');
  assert.match(f.sig, /checkout-journey\.e2e\.test\.tsx/);
});

test('normalize folds shas, numbers and line numbers', () => {
  assert.equal(normalize('FAILED (HEAD vs 1731feb6c41f) at x.ts:12:5 after 1234ms'), normalize('FAILED (HEAD vs ae376b1b3498) at x.ts:99:1 after 88ms'));
});

test('a learning.catalog entry wins over the built-ins; a bad pattern fails loudly', () => {
  const catalog = buildCatalog([{ id: 'pr-body-missing-line', title: 'PR body has no "Fix:" line', match: 'regression-proof|"Fix:"', enforce: ['Fix: yes'] }]);
  assert.equal(classify('pr-checks', 'regression-proof: FAILED, no "Fix:" line', catalog), 'pr-body-missing-line');
  assert.equal(catalog.find((c) => c.id === 'pr-body-missing-line').recommend, 4);
  // Counterexample: without the entry the same line is an uncatalogued CI type, and built-ins still match.
  assert.match(classify('pr-checks', 'regression-proof: FAILED, no "Fix:" line'), /^ci:pr-checks:/);
  assert.equal(classify('build', 'TS2322 src/a.ts: x', catalog), 'typecheck');
  assert.throws(() => buildCatalog([{ id: 'x', title: 'x', match: '(' }]), /learning\.catalog entry x: bad match pattern/);
  assert.throws(() => buildCatalog([{ id: 'x', title: 'x' }]), /missing match/);
});

test('skipJobs patterns match job names case-insensitively', () => {
  const skip = compileSkipJobs(['^quality$', '^Claude Code Review']);
  assert.ok(skip.some((re) => re.test('claude code review / review')));
  assert.ok(!skip.some((re) => re.test('quality-gates')));
});

test('review finding title parses its rule id', () => {
  const f = parseCcr('**[Testing]** Important: TST-21 New public DAO method on a tenant-scoped table has no test');
  assert.deepEqual([f.axis, f.severity, f.rule], ['Testing', 'Important', 'TST-21']);
  assert.equal(parseCcr('## :robot: Claude Code Review\n\nNo issues found'), null);
});

test('verify evidence: FAIL rows only, PASS-only tables give none', () => {
  const body = `## Verify evidence

| scenario | result | evidence |
| --- | --- | --- |
| 1. Given a phone | PASS | [t](https://uploads.linear.app/a) |
| 2. Given the settings page | FAIL | [t](https://uploads.linear.app/b) |`;
  assert.deepEqual(verifyFailRows(body), ['2. Given the settings page']);
  assert.deepEqual(verifyFailRows(body.replace('FAIL', 'PASS')), []);
  assert.deepEqual(verifyFailRows('| x | FAIL | y |'), []); // no heading, so it is no evidence table
  // A configured heading (linear.verifyEvidenceHeading) replaces the default.
  const custom = body.replace('## Verify evidence', '### QA results');
  assert.deepEqual(verifyFailRows(custom, '### QA results'), ['2. Given the settings page']);
  assert.deepEqual(verifyFailRows(custom), []);
  assert.deepEqual(verifyFailRows(body, '### QA results'), []);
});

test('dispatcher give-ups and main-watch events', () => {
  const g = parseDispatcherGiveUps(`2026-11-05T00:57:21.024Z ENG-5913: stuck, its worker d/61d7e092 has ended and PR https://x/pull/3721 has not moved in 3h (merge state BLOCKED)
2026-11-05T07:11:06.325Z ENG-5913: stalled, its worker has been busy for 9h without a commit or PR change
2026-11-05T06:52:32.842Z ENG-5913: redispatched to d/6eb166a4 (was stuck)`);
  assert.deepEqual(g.map((x) => x.reason), ['PR stuck, merge state BLOCKED', 'worker busy with no commit or PR change']);
  assert.deepEqual(parseDispatcherGiveUps('2026-11-05T00:57:21.024Z OPS2-7: stuck, x').map((x) => x.ticket), ['OPS2-7']);
  const m = parseMainWatch(`2026-11-05T00:39:01.198Z main turned red at e8a4d4d453 (ENG-6213: A PR's CI run stops); failing test-rest (rest, x)
2026-11-05T01:18:43.148Z main is green again at 4f0c3f6f7f after 71 min red`);
  assert.deepEqual(m.map((x) => x.kind), ['red', 'green']);
  assert.equal(m[1].minutes, 71);
});

test('the cached excerpt keeps the signature a full log gives', async () => {
  const { excerpt } = await import('../lib.mjs');
  const noise = Array.from({ length: 5000 }, (_, i) => `{"level":50,"msg":"Error ${i}"}`);
  const full = [...noise, ' FAIL  src/mcp/__tests__/tool-directory-review.test.ts > MCP tool descriptions > x', ...noise, '      Tests  1 failed | 2026 passed (2027)', ...Array(3000).fill('  ✅ creates a FAILURE that names the way'), '##[error]Process completed with exit code 1.'];
  assert.equal(extractSignature(excerpt(full)).sig, extractSignature(full).sig);
});
