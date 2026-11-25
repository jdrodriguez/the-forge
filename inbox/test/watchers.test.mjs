// The orchestrator's file watchers read the shared folder the dispatchers and main-watch.mjs write to. Each runs here
// against a throwaway config and exits on the first change it sees.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'watchers-'));
  const shared = path.join(home, 'shared');
  const stateDir = path.join(home, 'state');
  fs.mkdirSync(shared);
  const configFile = path.join(home, 'agent-queue.config.json');
  fs.writeFileSync(configFile, JSON.stringify({ ...EXAMPLE, paths: { stateDir, sharedDir: shared } }));
  return { home, shared, stateDir, configFile };
}
const run = (box, script) => spawnSync(path.join(ROOT, 'inbox', script), [],
  { env: { ...process.env, HOME: box.home, AGENT_QUEUE_CONFIG: box.configFile }, encoding: 'utf8', timeout: 20_000 });

test('main-red-watch.sh reports a red main once, then its recovery', () => {
  const box = sandbox();
  const red = { status: 'red', redSha: 'a1b2c3d4e5f6', redSince: '2026-11-05T10:00:00Z', redTitle: 'Add the panel', failing: ['test'],
    error: 'FAIL x.test.ts', responders: [{ label: 'b', id: 'w1' }], latestRun: 'https://github.com/x/actions/runs/1' };
  fs.writeFileSync(path.join(box.shared, 'main-state.json'), JSON.stringify(red));
  const r = run(box, 'main-red-watch.sh');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^RED a1b2c3d4e5 since 2026-11-05T10:00:00Z: Add the panel\n  failing: test\n  error: FAIL x\.test\.ts\n  responders: b\/w1\n/);
  assert.equal(fs.readFileSync(path.join(box.stateDir, 'main-red-seen'), 'utf8'), 'red a1b2c3d4e5f6');
  fs.writeFileSync(path.join(box.shared, 'main-state.json'), JSON.stringify({ status: 'green', greenSha: 'ffffffffffff' }));
  const g = run(box, 'main-red-watch.sh');
  assert.equal(g.status, 0, g.stderr);
  assert.equal(g.stdout, 'GREEN ffffffffff: main recovered from a1b2c3d4e5\n');
});

test('merge-request-watch.sh reports each new merge request once per head', () => {
  const box = sandbox();
  fs.mkdirSync(path.join(box.shared, 'merge-requests'));
  fs.writeFileSync(path.join(box.shared, 'merge-requests/ENG-7.json'), JSON.stringify({ id: 'ENG-7', pr: 70, head: '0123456789abcdef', host: 'host-a', risky: ['migrations/1_x.sql'] }));
  const r = run(box, 'merge-request-watch.sh');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'MERGE ENG-7 PR #70 head 0123456789 from host-a: migrations/1_x.sql\n');
  assert.equal(fs.readFileSync(path.join(box.stateDir, 'merge-requests-seen'), 'utf8'), 'ENG-7 0123456789abcdef\n');
});
