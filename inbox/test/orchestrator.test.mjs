// The handoff tools: the lease and lock (orchestrator.mjs), the Stop hook, takeover.sh, the combined watcher, the
// dispatcher events watcher and orch.sh. Each case runs against a throwaway config and home.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { expired, guard, orchestratorPaths, readLease, renew, status, take } from '../orchestrator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
const MIN = 60000;

function sandbox(orchestrator = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-'));
  const stateDir = path.join(home, 'state');
  const sharedDir = path.join(home, 'shared');
  fs.mkdirSync(stateDir);
  fs.mkdirSync(sharedDir);
  const cfg = { ...EXAMPLE, workspaceCwd: home, paths: { stateDir, sharedDir }, orchestrator: { ...EXAMPLE.orchestrator, ...orchestrator } };
  const configFile = path.join(home, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(cfg));
  const p = orchestratorPaths({ ...cfg, orchestrator: { ...cfg.orchestrator, leaseMinutes: 30 } });
  const env = (extra = {}) => ({ PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, AGENT_QUEUE_CONFIG: configFile, ...extra });
  return { home, stateDir, sharedDir, cfg, configFile, p, env };
}

test('the lease: only the lock holder renews it, and it expires by age or when the lock moves', () => {
  const { p } = sandbox();
  const now = Date.parse('2026-01-01T12:00:00Z');
  assert.equal(expired(p, 30, now), true, 'no lease counts as expired');
  take(p, 'S1');
  assert.equal(renew(p, 'S2', now), false, 'another session writes nothing');
  assert.equal(readLease(p, now), null);
  assert.equal(renew(p, '', now), false);
  assert.equal(renew(p, 'S1', now), true);
  assert.equal(expired(p, 30, now), false);
  assert.match(status(p, now), /holder S1, renewed .*, age 0m, current/);
  assert.equal(expired(p, 30, now + 29 * MIN), false);
  assert.equal(expired(p, 30, now + 31 * MIN), true);
  assert.equal(expired(p, 60, now + 31 * MIN), false);
  assert.match(status(p, now + 31 * MIN), /age 31m, expired/);
  take(p, 'S2');
  assert.equal(expired(p, 30, now), true, 'a lease held by a session that lost the lock is expired');
  assert.match(status(p, now), /lock moved to S2/);
  assert.match(fs.readFileSync(`${p.lock}.log`, 'utf8'), / S1 -> S2/);
});

test('the Stop hook: holds the lock holder only, once per stop, unless its own watcher runs', () => {
  const { p } = sandbox();
  take(p, 'new-session');
  const live = spawn('sleep', ['30']);
  try {
    fs.writeFileSync(p.watchPid, JSON.stringify({ pid: live.pid, session: 'old-session' }));
    assert.match(guard(p, { session_id: 'new-session' }), /"decision":"block"/, "the previous orchestrator's watcher does not count");
    assert.equal(guard(p, { session_id: 'other-session' }), '', 'a session without the lock stops normally');
    assert.equal(guard(p, { session_id: 'new-session', stop_hook_active: true }), '', 'never blocks twice in a row');
    fs.writeFileSync(p.watchPid, JSON.stringify({ pid: live.pid, session: 'new-session' }));
    assert.equal(guard(p, { session_id: 'new-session' }), '', 'its own live watcher lets it stop');
    fs.writeFileSync(p.watchPid, JSON.stringify({ pid: 999999, session: 'new-session' }));
    assert.match(guard(p, { session_id: 'new-session' }), /orchestrator-watch\.mjs/, 'a dead watcher blocks, naming the command');
    assert.equal(readLease(p).session, 'new-session', 'a stop by the holder renews the lease');
  } finally {
    live.kill();
  }
});

test('orchestrator-watch-guard.sh answers through the config', () => {
  const box = sandbox();
  take(box.p, 'S1');
  const r = spawnSync('bash', [path.join(ROOT, 'inbox/orchestrator-watch-guard.sh')], { input: JSON.stringify({ session_id: 'S1' }), env: box.env(), encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /"decision":"block"/);
  const other = spawnSync('bash', [path.join(ROOT, 'inbox/orchestrator-watch-guard.sh')], { input: '{"session_id":"S9"}', env: box.env(), encoding: 'utf8' });
  assert.equal(other.stdout, '');
});

test('takeover.sh moves the lock, renews the lease, and prints the handoff note, approvals and watcher state', () => {
  const box = sandbox();
  take(box.p, 'old');
  fs.writeFileSync(path.join(box.sharedDir, 'ORCHESTRATOR.md'), 'Open now: PR #12 waits on review\n');
  const r = spawnSync('bash', [path.join(ROOT, 'inbox/takeover.sh')], { env: box.env({ CLAUDE_CODE_SESSION_ID: 'new' }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /DRIVER: this session \(new\) is now the orchestrator\. Previous driver: old\./);
  assert.match(r.stdout, /LEASE: lease: holder new, .*current/);
  assert.match(r.stdout, /Open now: PR #12 waits on review/);
  assert.match(r.stdout, /approved heads not yet merged[\s\S]*none/);
  assert.match(r.stdout, /WATCHER: none running\./);
  assert.equal(fs.readFileSync(box.p.lock, 'utf8'), 'new\n');
  const again = spawnSync('bash', [path.join(ROOT, 'inbox/takeover.sh'), 'new'], { env: box.env(), encoding: 'utf8' });
  assert.match(again.stdout, /already holds the orchestrator role/);
  const none = spawnSync('bash', [path.join(ROOT, 'inbox/takeover.sh')], { env: box.env(), encoding: 'utf8' });
  assert.equal(none.status, 1);
  assert.match(none.stdout, /no session id/);
});

test('orchestrator-watch.mjs exits with the first watcher that fires, restarts a quiet one, and reports a failure', () => {
  const box = sandbox();
  take(box.p, 'S1');
  const marker = path.join(box.home, 'quiet-runs');
  const watchers = [
    { name: 'quiet', cmd: 'bash', args: ['-c', `echo x >> ${marker}; [ $(wc -l < ${marker}) -ge 2 ] && sleep 30; exit 2`] },
    { name: 'fires', cmd: 'bash', args: ['-c', 'sleep 0.5; echo "MERGE ENG-7 PR #70"'] },
    { name: 'slow', cmd: 'sleep', args: ['30'] },
  ];
  const r = spawnSync(process.execPath, [path.join(ROOT, 'inbox/orchestrator-watch.mjs')], { env: box.env({ FORGE_WATCHERS: JSON.stringify(watchers), CLAUDE_CODE_SESSION_ID: 'S1' }), encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '== fires\nMERGE ENG-7 PR #70\n');
  assert.ok(fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean).length >= 2, 'the quiet watcher was restarted');
  assert.equal(fs.existsSync(box.p.watchPid), false, 'the PID file is removed on exit');
  assert.equal(readLease(box.p).session, 'S1');
  const bad = spawnSync(process.execPath, [path.join(ROOT, 'inbox/orchestrator-watch.mjs')], { env: box.env({ FORGE_WATCHERS: JSON.stringify([{ name: 'broken', cmd: 'bash', args: ['-c', 'echo oops >&2; exit 1'] }]) }), encoding: 'utf8', timeout: 20000 });
  assert.match(bad.stdout, /== broken\nWATCHER broken failed \(exit 1\): oops/);
});

test('orchestrator-watch.mjs writes the PID file with the session that started it', async () => {
  const box = sandbox();
  const child = spawn(process.execPath, [path.join(ROOT, 'inbox/orchestrator-watch.mjs')], { env: box.env({ FORGE_WATCHERS: JSON.stringify([{ name: 's', cmd: 'sleep', args: ['30'] }]), CLAUDE_CODE_SESSION_ID: 'S7' }) });
  try {
    for (let i = 0; i < 50 && !fs.existsSync(box.p.watchPid); i++) await new Promise((r) => setTimeout(r, 100));
    const d = JSON.parse(fs.readFileSync(box.p.watchPid, 'utf8'));
    assert.equal(d.session, 'S7');
    assert.equal(d.pid, child.pid);
  } finally {
    child.kill('SIGTERM');
  }
});

test('dispatcher-events-watch.mjs reports each new notice once, skips old ones, and exits 2 when quiet', () => {
  const box = sandbox({ eventsDir: null });
  const dir = path.join(box.sharedDir, 'orchestrator-events');
  fs.mkdirSync(dir);
  const write = (f, at, extra = {}) => fs.writeFileSync(path.join(dir, f), JSON.stringify({ id: 'ENG-5', host: 'box', subtitle: 'still going', text: '8h in', at, ...extra }));
  write('1.json', new Date().toISOString(), { link: 'https://example.test/pr/5' });
  write('0.json', '2020-01-01T00:00:00Z');
  const run = () => spawnSync(process.execPath, [path.join(ROOT, 'inbox/dispatcher-events-watch.mjs')], { env: box.env({ FORGE_SLEEP_SCALE: '0.00001' }), encoding: 'utf8', timeout: 20000 });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'EVENT ENG-5 on box: still going: 8h in (https://example.test/pr/5)\n');
  assert.equal(run().status, 2, 'nothing new: quiet');
  const custom = sandbox({ eventsDir: path.join(os.tmpdir(), `events-${process.pid}-${Date.now()}`) });
  fs.mkdirSync(custom.cfg.orchestrator.eventsDir);
  fs.writeFileSync(path.join(custom.cfg.orchestrator.eventsDir, 'a.json'), JSON.stringify({ id: 'ENG-6', host: 'h', subtitle: 's', text: 't', at: new Date().toISOString() }));
  const c = spawnSync(process.execPath, [path.join(ROOT, 'inbox/dispatcher-events-watch.mjs')], { env: custom.env(), encoding: 'utf8', timeout: 20000 });
  assert.match(c.stdout, /EVENT ENG-6 on h/);
});

test('orch.sh opens Claude Code on the signed-in account with the most weekly usage left, in workspaceCwd', () => {
  const box = sandbox();
  const root = path.join(box.home, 'forge');
  fs.cpSync(path.join(ROOT, 'lib'), path.join(root, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'inbox'));
  fs.mkdirSync(path.join(root, 'fleet'));
  fs.copyFileSync(path.join(ROOT, 'inbox/orch.sh'), path.join(root, 'inbox/orch.sh'));
  fs.writeFileSync(path.join(root, 'fleet/fleet.sh'), `echo '${JSON.stringify([
    { label: 'a', signed_in: true, usage: { weekly: { remaining_percentage: 40 } } },
    { label: 'b', signed_in: true, usage: { weekly: { remaining_percentage: 75 } } },
    { label: 'c', signed_in: false, usage: { weekly: { remaining_percentage: 99 } } },
  ])}'\n`);
  const bin = path.join(box.home, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "claude $* dir=\${CLAUDE_CONFIG_DIR:-default} cwd=$(pwd)"\n`);
  fs.chmodSync(path.join(bin, 'claude'), 0o755);
  fs.mkdirSync(path.join(box.home, '.claude-b'));
  const env = box.env({ PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin` });
  const r = spawnSync('bash', [path.join(root, 'inbox/orch.sh')], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /using account b/);
  assert.match(r.stdout, new RegExp(`claude /forge-takeover dir=${box.home}/.claude-b cwd=(/private)?${box.home}`));
  const a = spawnSync('bash', [path.join(root, 'inbox/orch.sh'), 'a'], { env: { ...env, CLAUDE_CONFIG_DIR: '/x' }, encoding: 'utf8' });
  assert.match(a.stdout, /claude \/forge-takeover dir=default/);
  const missing = spawnSync('bash', [path.join(root, 'inbox/orch.sh'), 'z'], { env, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /no config folder/);
});

test('orchestrator-watch.mjs stops and says so when the lock moves to another session', () => {
  const box = sandbox();
  take(box.p, 'S1');
  const mover = { name: 'mover', cmd: process.execPath, args: ['-e', `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(box.p.lock)}, 'S2\\n'), 300); setTimeout(() => {}, 30000)`] };
  const r = spawnSync(process.execPath, [path.join(ROOT, 'inbox/orchestrator-watch.mjs')], { env: box.env({ FORGE_WATCHERS: JSON.stringify([mover]), CLAUDE_CODE_SESSION_ID: 'S1', FORGE_LOCK_POLL_MS: '100' }), encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /== takeover\nthis session lost the orchestrator lock to S2; the watcher stopped/);
});
