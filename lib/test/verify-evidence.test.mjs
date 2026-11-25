// lib/verify-evidence.mjs: the evidence table, the footer and the newest-wins rule.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newestPassing, parseEvidence, passes } from '../verify-evidence.mjs';

const SHA = 'f'.repeat(40);
const body = (rows, foot = `_Verified 2026-01-01T00:00:00Z on staging as admin against ${SHA}_`) =>
  `## Verify evidence\n\n| Scenario | Result | Evidence |\n|---|---|---|\n${rows.join('\n')}\n\n${foot}`;
const ok = '| one | PASS | https://uploads.linear.app/a |';

test('a full table with the footer passes', () => {
  assert.deepEqual(parseEvidence(body([ok, ok])), { pass: 2, fail: 0, malformed: 0, footer: true });
  assert.equal(passes(parseEvidence(body([ok]))), true);
});

test('custom heading and environment names are honored', () => {
  const b = body([ok], `_Verified 2026-01-01T00:00:00Z on qa as admin against ${SHA}_`).replace('## Verify evidence', '## Evidence');
  assert.equal(passes(parseEvidence(b, { heading: '## Evidence', environments: ['qa'] })), true);
  assert.equal(passes(parseEvidence(b, { heading: '## Evidence' })), false);
  assert.equal(parseEvidence(b), null);
});

test('a short SHA, a trailing heading word, or no PASS row fails', () => {
  assert.equal(passes(parseEvidence(body([ok], '_Verified 2026-01-01T00:00:00Z on staging as admin against abc123_'))), false);
  assert.equal(parseEvidence(body([ok]).replace('evidence\n', 'evidence plan\n')), null);
  assert.equal(passes(parseEvidence(body([]))), false);
});

test('newestPassing needs an accepted author and a comment after the merge', () => {
  const comments = [{ body: body([ok]), createdAt: '2026-01-02T00:00:00Z', user: { id: 'u1' } }];
  const accepted = (c) => c.user?.id === 'u1';
  assert.equal(newestPassing(comments, { accepted, after: '2026-01-01T00:00:00Z' }), true);
  assert.equal(newestPassing(comments, { accepted, after: '2026-01-03T00:00:00Z' }), false);
  assert.equal(newestPassing(comments, { accepted: () => false, after: '2026-01-01T00:00:00Z' }), false);
  assert.equal(newestPassing(comments, { accepted, after: null }), false);
});
