// merged-to-verifying.mjs, run as a subprocess with a stub gh first on PATH and fetch stubbed by a preload, so nothing
// reaches GitHub or Linear. Each case is one ticket in Done and the comments on it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
const VIEWER = '11111111-1111-1111-1111-111111111111';
const LISTED = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';
const SHA = 'a'.repeat(40);
const AFTER = '2026-11-25T11:00:00Z';
const table = (row) => `## Verify evidence\n\n| Scenario | Result | Evidence |\n| --- | --- | --- |\n${row}\n`;
const footer = `\n_Verified 2026-11-25T11:00:00Z on staging as owner against ${SHA}_`;
const PASS_ROW = '| 1. signs in | PASS | [shot](https://uploads.linear.app/x/y.png) |';
const FAIL_ROW = '| 1. signs in | FAIL | [s](https://uploads.linear.app/x) |';
const GOOD = table(PASS_ROW) + footer;

// run(comments, { authors, repo }): runs the helper on PR 1 (ENG-9001); returns { out, moved, ghArgs }.
function run(comments, { authors = [LISTED], repo } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2v-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const pr = { title: 'ENG-9001: a change', headRefName: 'agent/eng-9001', url: 'https://github.com/o/r/pull/1', mergedAt: '2026-11-25T10:00:00Z' };
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho "$@" > "${dir}/gh-args"\necho '${JSON.stringify(pr)}'\n`);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  const configFile = path.join(dir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ ...EXAMPLE, linear: { ...EXAMPLE.linear, verifyEvidenceAuthors: authors } }));
  const issue = { id: 'issue-1', state: { name: 'Done', type: 'completed' }, team: { states: { nodes: [{ id: 'st-verifying', name: 'Verifying' }] } }, comments: { nodes: comments } };
  const log = path.join(dir, 'mutations.log');
  fs.writeFileSync(path.join(dir, 'stub.mjs'), `import fs from 'node:fs';
globalThis.fetch = async (_url, opts) => {
  const { query } = JSON.parse(opts.body);
  let data;
  if (query.includes('viewer')) data = { viewer: { id: '${VIEWER}' } };
  else if (query.includes('issue(id')) data = { issue: ${JSON.stringify(issue)} };
  else { fs.appendFileSync('${log}', query.includes('issueUpdate') ? 'move\\n' : 'comment\\n'); data = {}; }
  return { json: async () => ({ data }) };
};`);
  const out = execFileSync(process.execPath, ['--import', path.join(dir, 'stub.mjs'), path.join(ROOT, 'inbox/merged-to-verifying.mjs'), '1', ...(repo ? [repo] : [])], {
    encoding: 'utf8',
    env: { PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, LINEAR_API_KEY: 'test', HOME: dir, AGENT_QUEUE_CONFIG: configFile, FORGE_SLEEP_SCALE: '0' },
  });
  const moved = fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('move');
  const ghArgs = fs.readFileSync(path.join(dir, 'gh-args'), 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { out, moved, ghArgs };
}
const c = (body, user, createdAt = AFTER) => ({ body, createdAt, user: user ? { id: user } : null });

test('passing evidence after the merge by the key user or a listed author leaves the ticket in Done', () => {
  assert.equal(run([c(GOOD, VIEWER)]).moved, false);
  assert.equal(run([c(GOOD, LISTED)]).moved, false);
});

test('evidence by an author not accepted moves it to Verifying', () => {
  assert.equal(run([c(GOOD, STRANGER)]).moved, true);
  assert.equal(run([c(GOOD, null)]).moved, true);
  assert.equal(run([c(GOOD, LISTED)], { authors: [] }).moved, true);
});

test('evidence without the footer, or with an environment not in linear.verifyEnvironments, moves it', () => {
  assert.equal(run([c(table(PASS_ROW), VIEWER)]).moved, true);
  assert.equal(run([c(table(PASS_ROW) + footer.replace('staging', 'laptop'), VIEWER)]).moved, true);
});

test('a row without an uploaded asset or with another result is malformed and moves it', () => {
  assert.equal(run([c(`${table('| 1. signs in | PASS | checked it, works |')}${footer}`, VIEWER)]).moved, true);
  assert.equal(run([c(`${table('| 1. signs in | PASS (mostly) | [s](https://uploads.linear.app/x) |')}${footer}`, VIEWER)]).moved, true);
});

test('a heading with no rows, or the heading quoted mid-comment, is not passing evidence', () => {
  assert.equal(run([c(`## Verify evidence\n\nlooks good${footer}`, VIEWER)]).moved, true);
  assert.equal(run([c(`Next step: post a\n${GOOD}`, VIEWER)]).moved, true);
});

test('a FAIL row moves it, and evidence from before the merge does not count', () => {
  assert.equal(run([c(table(FAIL_ROW) + footer, VIEWER)]).moved, true);
  assert.equal(run([c(GOOD, VIEWER, '2026-11-25T09:00:00Z')]).moved, true);
});

test('the newest accepted evidence wins', () => {
  const failing = table(FAIL_ROW) + footer;
  assert.equal(run([c(GOOD, VIEWER), c(failing, VIEWER, '2026-11-25T12:00:00Z')]).moved, true);
  assert.equal(run([c(GOOD, VIEWER), c(failing, STRANGER, '2026-11-25T12:00:00Z')]).moved, false);
});

test('reads the PR from the repo it is given, else github.repo', () => {
  assert.match(run([c(GOOD, VIEWER)]).ghArgs, /--repo your-org\/your-app/);
  assert.match(run([c(GOOD, VIEWER)], { repo: 'your-org/your-site' }).ghArgs, /--repo your-org\/your-site/);
});
