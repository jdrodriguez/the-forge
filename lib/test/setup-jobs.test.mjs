// the-forge install, uninstall, start, stop, status, open, copy-to and update, against fake launchctl, systemctl and
// ssh in a throwaway home. The real install scripts run; only the service managers and the other computer are fakes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkAnswers } from '../setup/answers.mjs';
import { answers, HOST, lastingCopy, ROOT, sandbox } from './setup-sandbox.mjs';

const LABELS = ['dispatcher', 'main-watch', 'queue-board', 'queue-herald'].map((j) => `dev.agent-queue.${j}`);

test('install on a Mac board computer writes and loads the four launchd jobs from the lasting copy; uninstall removes them', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(1, 1));
  const r = s.run(['install'], {}, cli);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const agents = path.join(s.home, 'Library/LaunchAgents');
  for (const l of LABELS) {
    const plist = fs.readFileSync(path.join(agents, `${l}.plist`), 'utf8');
    assert.match(plist, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${l} points at the lasting copy`);
    assert.doesNotMatch(plist, /_npx/);
    assert.ok(s.calls().some((c) => c.startsWith('launchctl bootstrap') && c.endsWith(`${l}.plist`)), l);
  }
  const st = JSON.parse(fs.readFileSync(path.join(s.home, '.agent-queue/state.json'), 'utf8'));
  assert.deepEqual(st, { tickets: {}, dispatches: [], stuckStreak: 0 });

  const status = JSON.parse(s.run(['status', '--json'], {}, cli).stdout);
  assert.deepEqual(status.jobs.map((j) => [j.name, j.installed, j.running]),
    [['dispatcher', true, true], ['main-watch', true, true], ['board', true, true], ['herald', true, true]]);
  assert.equal(status.board.answering, false, 'no real board runs in the test');

  assert.equal(s.run(['stop'], {}, cli).status, 0);
  assert.equal(JSON.parse(s.run(['status', '--json'], {}, cli).stdout).jobs.filter((j) => j.running).length, 0);
  assert.equal(s.run(['start'], {}, cli).status, 0);
  assert.equal(JSON.parse(s.run(['status', '--json'], {}, cli).stdout).jobs.filter((j) => j.running).length, 4);

  const open = s.run(['open'], {}, cli);
  assert.match(open.stdout, new RegExp(`^http://127\\.0\\.0\\.1:${s.port}/$`, 'm'));
  assert.ok(s.calls().includes(`open http://127.0.0.1:${s.port}/`));

  assert.equal(s.run(['uninstall'], {}, cli).status, 0);
  for (const l of LABELS) assert.equal(fs.existsSync(path.join(agents, `${l}.plist`)), false, l);
});

test('install on a Linux board computer writes systemd units, the board as a service, and no herald', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(1, 1));
  const r = s.run(['install'], { FAKE_UNAME: 'Linux' }, cli);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const units = path.join(s.home, '.config/systemd/user');
  assert.deepEqual(fs.readdirSync(units).sort(), ['agent-queue-board.service', 'agent-queue-dispatcher.service', 'agent-queue-dispatcher.timer',
    'agent-queue-main-watch.service', 'agent-queue-main-watch.timer']);
  assert.match(fs.readFileSync(path.join(units, 'agent-queue-board.service'), 'utf8'), new RegExp(`ExecStart=.* ${root}/queue-board/board\\.mjs`));
  assert.match(r.stdout, /herald posts macOS notifications, so it is not installed on Linux/);
  assert.ok(s.calls().includes('systemctl --user restart agent-queue-board.service'), 'a reinstall runs the new code');
  assert.equal(s.run(['uninstall'], { FAKE_UNAME: 'Linux' }, cli).status, 0);
  assert.deepEqual(fs.readdirSync(units), []);
});

test('install --dry-run changes nothing, and a computer that is not in the config runs no jobs', async () => {
  const s = sandbox();
  const { cli } = await lastingCopy(s, answers(1, 1));
  const dry = s.run(['install', '--dry-run'], {}, cli);
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /would run: bash .*dispatcher\/install\.sh/);
  assert.equal(fs.existsSync(path.join(s.home, 'Library')), false);
  assert.deepEqual(s.calls(), []);
  const other = sandbox();
  const a = JSON.parse(JSON.stringify(answers(2, 2)).replaceAll(`"${HOST}"`, '"someone-else"'));
  const { cli: cli2 } = await lastingCopy(other, a);
  const r = other.run(['install'], {}, cli2);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is not in dispatcher\.enabledHosts and is not queueBoard\.host/);
});

test('copy-to puts the copy, config and links on the other computer; --install installs its jobs there', async () => {
  const s = sandbox();
  const { cli } = await lastingCopy(s, answers(2, 2));
  const r = s.run(['copy-to', 'box-two', '--install'], {}, cli);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const there = path.join(s.remote, 'the-forge');
  for (const f of ['bin/the-forge.mjs', 'agent-queue.config.json', 'forge-answers.json', 'dispatcher/install.sh']) assert.ok(fs.existsSync(path.join(there, f)), f);
  assert.equal(fs.readlinkSync(path.join(s.remote, '.claude/skills/fleet')), path.join(there, 'fleet'));
  // That computer is box-two, but the fake ssh runs here, under this host name, so it installs this host's jobs into
  // the other home: enough to show install ran from the copy there.
  assert.ok(fs.existsSync(path.join(s.remote, 'Library/LaunchAgents/dev.agent-queue.dispatcher.plist')));
  // Every ssh call ends ssh's options before the destination.
  assert.ok(s.calls().every((c) => !c.startsWith('ssh') || c.startsWith('ssh -- tester@box-two ')), s.calls().join('\n'));
  assert.equal(s.run(['copy-to', 'box-two'], { FAKE_SSH_FAIL: '1' }, cli).status, 1);
});

test('update refreshes the lasting copy from a newer package, keeps the config, and reloads installed jobs', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(1, 1));
  assert.equal(s.run(['install'], {}, cli).status, 0);
  const config = fs.readFileSync(path.join(root, 'agent-queue.config.json'), 'utf8');
  fs.writeFileSync(path.join(root, 'README.md'), 'old\n');
  const npx = path.join(s.dir, '.npm/_npx/0123abcd/node_modules/the-forge');
  const before = s.calls().length;
  const r = s.run(['update'], {}, path.join(npx, 'bin/the-forge.mjs'));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /refreshed \d+ files in ~\/the-forge; your config and answers were kept/);
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(root, 'agent-queue.config.json'), 'utf8'), config);
  assert.ok(s.calls().slice(before).some((c) => c.startsWith('launchctl bootstrap')), 'the jobs were reloaded');
  const self = s.run(['update'], {}, cli);
  assert.equal(self.status, 1);
  assert.match(self.stderr, /npx @jdrodriguez\/the-forge@latest update/);
});

test('the answers example in docs/setup.md is valid', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/setup.md'), 'utf8');
  const json = doc.match(/```json\n([\s\S]*?)```/)[1];
  assert.deepEqual(checkAnswers(JSON.parse(json)).errors, []);
});

test('a computer that stops being the board loses its board jobs on the next install', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(2, 2));
  assert.equal(s.run(['install'], {}, cli).status, 0);
  const a = answers(2, 2);
  a.computers[0].board = false;
  a.computers[0].ssh = 'tester@here';
  a.computers[1].board = true;
  delete a.computers[1].ssh;
  const f = path.join(s.dir, 'moved.json');
  fs.writeFileSync(f, JSON.stringify(a));
  assert.equal(s.run(['init', '--answers', f], {}, cli).status, 0);
  const r = s.run(['install'], {}, cli);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no longer runs main-watch, board, herald/);
  const agents = fs.readdirSync(path.join(s.home, 'Library/LaunchAgents'));
  assert.deepEqual(agents, ['dev.agent-queue.dispatcher.plist']);
  assert.equal(s.run(['uninstall'], {}, cli).status, 0);
  assert.deepEqual(fs.readdirSync(path.join(s.home, 'Library/LaunchAgents')), []);
  assert.ok(root);
});

test('setup into a folder inside the package does not copy the copy into itself; copy-to refuses another config file', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(2, 2));
  const inner = path.join(root, 'lasting');
  const r = s.run(['setup', '--no-start', '--dir', inner], {}, cli);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(inner, 'bin/the-forge.mjs')));
  assert.equal(fs.existsSync(path.join(inner, 'lasting')), false);
  const c = s.run(['copy-to', 'box-two'], { AGENT_QUEUE_CONFIG: path.join(s.dir, 'elsewhere.json') }, cli);
  assert.equal(c.status, 1);
  assert.match(c.stderr, /AGENT_QUEUE_CONFIG points at/);
});

test('a computer taken out of the config loses the jobs an earlier config put there', async () => {
  const s = sandbox();
  const { cli } = await lastingCopy(s, answers(1, 1));
  assert.equal(s.run(['install'], {}, cli).status, 0);
  const a = JSON.parse(JSON.stringify(answers(1, 1)).replaceAll(`"${HOST}"`, '"another-box"'));
  const f = path.join(s.dir, 'gone.json');
  fs.writeFileSync(f, JSON.stringify(a));
  assert.equal(s.run(['init', '--answers', f], {}, cli).status, 0);
  const r = s.run(['install'], {}, cli);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /removing the jobs an earlier config put here: dispatcher, main-watch, board, herald/);
  assert.deepEqual(fs.readdirSync(path.join(s.home, 'Library/LaunchAgents')), []);
});
