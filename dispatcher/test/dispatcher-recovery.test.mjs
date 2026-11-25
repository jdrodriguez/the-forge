// Recovery: an ended worker whose PR conflicts or holds open review threads gets a replacement (two sightings, within
// maxRedispatches, through the wake queue); a replacement never starts while the old session could not be stopped; a
// ticket sent to the orchestrator whose PR needs work again goes back to building; a green PR whose new migration
// clashes with the base branch goes back to its worker; notices the orchestrator must act on land in the shared events
// folder. Runs the real dispatcher in capacity-sandbox.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { OLD, briefs, busy, capBox, ended, lines, live, queueIds, run, state, tick } from './capacity-sandbox.mjs';

const told = (box) => lines(box, 'told').map((l) => JSON.parse(l));
const events = (box) => {
  const dir = path.join(box.shared, 'orchestrator-events');
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
};

test('an ended worker whose PR conflicts with the base branch gets one replacement on its second sighting, told to merge it', () => {
  const box = capBox({ tickets: { 'ENG-9': live(9, { prNumber: 9 }) }, prs: { 9: { branch: 'agent/eng-9', merge: 'DIRTY' } }, ps: [ended(9)] });
  tick(box);
  assert.equal(briefs(box).length, 0, 'one sighting is not enough');
  const out = tick(box);
  assert.equal(briefs(box).length, 1, out);
  assert.match(briefs(box)[0], /^Your previous worker on ENG-9 ended, but its PR https:\/\/github\.com\/x\/pull\/9 cannot merge yet: PR #9 conflicting with main\. .*Merge origin\/main into the branch/);
  const t = state(box).tickets['ENG-9'];
  assert.equal(t.redispatches, 1, 'it uses the maxRedispatches budget');
  assert.equal(t.status, 'building');
  // The budget is spent: the next ended worker on a dead-end PR makes the ticket stuck.
  box.put('ps.json', [{ ...ended(9), id: 'w0' }]);
  tick(box);
  tick(box);
  assert.equal(briefs(box).length, 1);
  assert.equal(state(box).tickets['ENG-9'].status, 'stuck');
});

test('an ended worker whose BLOCKED PR holds unresolved review threads gets a replacement told to address them', () => {
  const box = capBox({ tickets: { 'ENG-9': live(9, { prNumber: 9, goneTicks: 1 }) }, prs: { 9: { branch: 'agent/eng-9', merge: 'BLOCKED', threads: 2 } }, ps: [ended(9)] });
  tick(box);
  assert.equal(briefs(box).length, 1);
  assert.match(briefs(box)[0], /cannot merge yet: 2 unresolved review thread\(s\)\. .*reply on each thread/);
});

test('an ended worker with a failing check and no conflict keeps the stall rules: no replacement', () => {
  const box = capBox({ tickets: { 'ENG-9': live(9, { prNumber: 9, goneTicks: 1 }) }, prs: { 9: { branch: 'agent/eng-9', merge: 'BLOCKED' } }, ps: [ended(9)] });
  tick(box);
  assert.equal(briefs(box).length, 0);
});

test('a replacement stops the old session first when it still has a process, and never starts when the stop fails', () => {
  const stuck = live(9, { status: 'stuck', stuckAt: OLD });
  const idleWithPid = { ...ended(9, 'idle'), pid: 109 };
  const ok = capBox({ tickets: { 'ENG-9': stuck }, ps: [idleWithPid] });
  assert.match(run(ok, ['redispatch', 'ENG-9']), /ENG-9: redispatched to b\/w0/);
  assert.deepEqual(lines(ok, 'stopped'), ['b w-9']);
  const refused = capBox({ tickets: { 'ENG-9': stuck }, ps: [idleWithPid] });
  refused.put('stop-fails', '');
  const r = run(refused, ['redispatch', 'ENG-9']);
  assert.match(r, /could not stop its old worker b\/w-9 before replacing it/);
  assert.equal(briefs(refused).length, 0);
  assert.equal(state(refused).tickets['ENG-9'].status, 'stuck');
});

test('a ticket sent to the orchestrator whose PR then conflicts goes back to building, and waits for a slot on a full machine', () => {
  const asked = live(9, { status: 'merge-asked', riskySha: 'abc123', mergeAskedAt: OLD, prNumber: 9 });
  const box = capBox({ host: { maxWorkers: 1 }, tickets: { 'ENG-1': live(1), 'ENG-9': asked },
    prs: { 1: { branch: 'agent/eng-1', merge: 'BLOCKED' }, 9: { branch: 'agent/eng-9', merge: 'DIRTY' } }, ps: [busy(1), ended(9)] });
  fs.mkdirSync(path.join(box.shared, 'merge-requests'), { recursive: true });
  fs.writeFileSync(path.join(box.shared, 'merge-requests/ENG-9.json'), '{}');
  const out = tick(box);
  assert.match(out, /ENG-9: its PR needs work again \(merge state DIRTY\), so its merge request is withdrawn and it is building again/);
  assert.match(out, /ENG-9: needs to work again \(merge state DIRTY\), but this machine is full \(1\/1 slots in use\)/);
  assert.equal(state(box).tickets['ENG-9'].status, 'building');
  assert.deepEqual(queueIds(box), ['ENG-9']);
  assert.ok(!fs.existsSync(path.join(box.shared, 'merge-requests/ENG-9.json')));
});

// premerge.migrations in the example: dir migrations, 14-character prefix, policy prefix.
const MIG = (policy) => ({ premerge: { migrations: { dir: 'migrations', pattern: '^\\d{14}_.*\\.sql$', prefixLength: 14, policy } } });

test('a green PR whose new migration takes a prefix the base branch uses goes back to its worker, once per head', () => {
  const box = capBox({ config: MIG('prefix'), tickets: { 'ENG-9': live(9, { prNumber: 9 }) },
    prs: { 9: { branch: 'agent/eng-9', files: ['migrations/20261101000000_mine.sql'] } }, ps: [{ ...busy(9), status: 'idle', state: 'done' }] });
  box.put('base-migrations', '20261101000000_theirs.sql\n20261102000000_later.sql\n');
  const out = tick(box);
  assert.match(out, /ENG-9: migrations\/20261101000000_mine\.sql clashes with main, sent worker b\/w-9 back to rename it/);
  assert.equal(told(box).length, 1);
  assert.equal(told(box)[0].to, 'b/w-9');
  assert.match(told(box)[0].text, /rename|new prefix after 20261102000000/);
  tick(box);
  assert.equal(told(box).length, 1, 'one note per PR head');
});

test('with policy filename, an older unique migration name merges on; only an exact name the base branch has goes back', () => {
  const older = capBox({ config: MIG('filename'), tickets: { 'ENG-9': live(9, { prNumber: 9 }) },
    prs: { 9: { branch: 'agent/eng-9', files: ['migrations/20261101000000_mine.sql'] } } });
  older.put('base-migrations', '20261101000000_theirs.sql\n20261102000000_later.sql\n');
  assert.doesNotMatch(tick(older), /clashes with main/);
  const same = capBox({ config: MIG('filename'), tickets: { 'ENG-9': live(9, { prNumber: 9 }) },
    prs: { 9: { branch: 'agent/eng-9', files: ['migrations/20261101000000_theirs.sql'] } } });
  same.put('base-migrations', '20261101000000_theirs.sql\n');
  assert.match(tick(same), /clashes with main, sent worker/);
});

test('a long run and a signed-out account each leave an event for the orchestrator', () => {
  const box = capBox({ dispatcher: { longRunNoticeHours: 1 }, tickets: { 'ENG-9': live(9) }, prs: { 9: { branch: 'agent/eng-9', merge: 'BLOCKED' } }, ps: [busy(9)] });
  box.put('accounts.json', [{ label: 'b', signed_in: false, email: 'b@example.com' }]);
  tick(box);
  const subjects = events(box).map((e) => e.subtitle).sort();
  assert.deepEqual(subjects, ['Account b signed out', 'ENG-9 still going']);
  assert.equal(events(box).find((e) => e.id === 'ENG-9').host, 'host-a');
});

test('the heartbeat counts the worktrees of the repos the sweep covers', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  fs.mkdirSync(path.join(repo, '.claude/worktrees/a'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.claude/worktrees/b'));
  const box = capBox({ config: { repoPath: repo }, dispatcher: { worktreeCleanup: { enabled: false } } });
  tick(box);
  assert.equal(JSON.parse(fs.readFileSync(path.join(box.shared, 'heartbeats/host-a.json'), 'utf8')).worktrees, 2);
});

test('a ticket sent to the orchestrator whose BLOCKED PR has unresolved threads goes back to building', () => {
  const asked = live(9, { status: 'merge-asked', riskySha: 'abc123', mergeAskedAt: OLD, prNumber: 9 });
  const box = capBox({ tickets: { 'ENG-9': asked }, prs: { 9: { branch: 'agent/eng-9', merge: 'BLOCKED', threads: 1 } }, ps: [busy(9)] });
  assert.match(tick(box), /ENG-9: its PR needs work again \(merge state BLOCKED, 1 unresolved review thread\(s\)\)/);
  assert.equal(state(box).tickets['ENG-9'].status, 'building');
});

test('an ended worker on a conflicting PR waits when its replacement cannot start, and is never made stuck for it', () => {
  const box = capBox({ tickets: { 'ENG-9': live(9, { prNumber: 9, goneTicks: 1 }) }, prs: { 9: { branch: 'agent/eng-9', merge: 'DIRTY' } }, ps: [ended(9)], usage: [] });
  tick(box);
  tick(box);
  assert.equal(state(box).tickets['ENG-9'].status, 'building');
  assert.match(state(box).tickets['ENG-9'].note, /waiting to start its replacement/);
});
