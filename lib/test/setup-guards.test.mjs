// the-forge's guards: per-computer engines, a folder that is not The Forge's, state the dispatcher can recover, ssh
// destinations, relative config paths, jobs left from an earlier config, repository paths, Note keys, one account
// across computers, reviewer defaults, a program that cannot run, and a malformed config.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkAnswers } from '../setup/answers.mjs';
import { unknownKeys, undocumentedKeys } from '../setup/coverage.mjs';
import { answers, HOST, lastingCopy, npxCopy, ROOT, sandbox, writeAnswers } from './setup-sandbox.mjs';

function init(a) {
  const s = sandbox();
  const out = path.join(s.dir, 'c.json');
  const r = s.run(['init', '--answers', writeAnswers(s, a), '--out', out]);
  return { r, cfg: r.status === 0 ? JSON.parse(fs.readFileSync(out, 'utf8')) : null };
}
const errorsOf = (a) => checkAnswers(a).errors;

test('init writes each computer\'s engines from its Codex and Grok answers: one, both, or none', () => {
  const a = answers(4, 2);
  Object.assign(a.computers[0], { codex: true, grok: true });
  Object.assign(a.computers[1], { codex: false, grok: true });
  Object.assign(a.computers[2], { codex: true, grok: false });
  Object.assign(a.computers[3], { codex: false, grok: false });
  const { cfg } = init(a);
  const engines = Object.fromEntries(Object.entries(cfg.dispatcher.hosts).map(([h, v]) => [h, v.engines]));
  assert.deepEqual(engines, { [HOST]: ['codex', 'grok'], 'box-two': ['grok'], 'box-three': ['codex'], 'box-four': [] });
  assert.deepEqual(cfg.dispatcher.externalBuilders.fallback.engines, ['codex', 'grok']);
  const none = answers(1, 1);
  none.computers[0].codex = false;
  const off = init(none).cfg;
  assert.deepEqual(off.dispatcher.hosts[HOST].engines, []);
  assert.equal(off.dispatcher.externalBuilders.fallback.enabled, false);
});

test('setup refuses a folder that holds someone else\'s files, and leaves them as they were', async () => {
  const s = sandbox();
  const project = path.join(s.home, 'dev/existing-project');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'README.md'), 'mine\n');
  fs.writeFileSync(path.join(project, 'package.json'), '{"name": "something-else"}');
  const npx = await npxCopy(s);
  const r = s.run(['setup', '--no-start', '--dir', project], {}, path.join(npx, 'bin/the-forge.mjs'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already holds files and is not a copy of The Forge/);
  assert.equal(fs.readFileSync(path.join(project, 'README.md'), 'utf8'), 'mine\n');
  assert.deepEqual(fs.readdirSync(project).sort(), ['README.md', 'package.json']);
});

test('install seeds an empty state only when neither state.json nor its backup exists', async () => {
  const s = sandbox();
  const { cli } = await lastingCopy(s, answers(1, 1));
  const dir = path.join(s.home, '.agent-queue');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json.bak'), '{"tickets": {"ABC-1": {}}}');
  assert.equal(s.run(['install'], {}, cli).status, 0);
  assert.equal(fs.existsSync(path.join(dir, 'state.json')), false, 'the dispatcher recovers from the backup');
});

test('an ssh answer that could be read as an option, or holds a space, is refused', () => {
  for (const ssh of ['-oProxyCommand=touch /tmp/x', 'a b@c']) {
    const a = answers(2, 2);
    a.computers[1].ssh = ssh;
    assert.ok(errorsOf(a).some((e) => /ssh must be user@host or an alias, with no spaces and not starting with -/.test(e)), ssh);
  }
});

test('jobs get the config as an absolute path when AGENT_QUEUE_CONFIG is relative', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(1, 1));
  const r = spawnSync(process.execPath, [cli, 'install'], { cwd: s.home, encoding: 'utf8', env: s.env({ AGENT_QUEUE_CONFIG: 'the-forge/agent-queue.config.json' }) });
  assert.equal(r.status, 0, r.stderr);
  const plist = fs.readFileSync(path.join(s.home, 'Library/LaunchAgents/dev.agent-queue.queue-board.plist'), 'utf8');
  assert.match(plist, new RegExp(`<string>${path.join(root, 'agent-queue.config.json').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</string>`));
});

test('status and stop find the jobs an earlier config left here, after the board moved', async () => {
  const s = sandbox();
  const { cli } = await lastingCopy(s, answers(2, 2));
  assert.equal(s.run(['install'], {}, cli).status, 0);
  const a = answers(2, 2);
  Object.assign(a.computers[0], { board: false, ssh: 'tester@here' });
  a.computers[1].board = true;
  delete a.computers[1].ssh;
  a.claudeAccounts[0].computers = ['box-two'];
  const f = path.join(s.dir, 'moved.json');
  fs.writeFileSync(f, JSON.stringify(a));
  assert.equal(s.run(['init', '--answers', f], {}, cli).status, 0);
  const st = JSON.parse(s.run(['status', '--json'], {}, cli).stdout);
  assert.deepEqual(st.jobs.map((j) => [j.name, j.running, Boolean(j.stale)]),
    [['dispatcher', true, false], ['main-watch', true, true], ['board', true, true], ['herald', true, true]]);
  assert.equal(s.run(['stop'], {}, cli).status, 0);
  assert.equal(JSON.parse(s.run(['status', '--json'], {}, cli).stdout).jobs.filter((j) => j.running).length, 0);
});

test('a repository path is normalised, and one whose parent is the home folder is refused', () => {
  const a = answers(1, 1);
  a.repository.path = '~/dev/./work/../example-app/';
  assert.deepEqual(errorsOf(a), []);
  assert.equal(checkAnswers(a).answers.repository.path, '~/dev/example-app');
  for (const p of ['~/dev/../app', '~/app', '/abs/dev/app']) {
    const b = answers(1, 1);
    b.repository.path = p;
    assert.ok(errorsOf(b).some((e) => e.startsWith('repository.path')), p);
  }
});

test('a config copied from the example, Notes and all, has no unknown or undocumented keys', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
  assert.deepEqual(unknownKeys(ex), []);
  assert.deepEqual(undocumentedKeys(ex), []);
});

test('one Claude account is main and worker on every computer, even when the answers list only one', () => {
  const a = answers(2, 1);
  a.claudeAccounts[0].computers = [HOST];
  const { cfg } = init(a);
  assert.deepEqual(cfg.dispatcher.hosts['box-two'].accounts, ['a']);
  assert.deepEqual(cfg.dispatcher.hosts[HOST].accounts, ['a']);
});

test('a reviewer gets the person\'s own values, never the example\'s placeholders', () => {
  const withSlack = init(answers(1, 1, { reviewer: { name: 'Sam' }, slack: { domain: 'example', channel: 'C0123456789' } })).cfg;
  assert.deepEqual(withSlack.reviewer, { name: 'Sam', github: 'tester', slackUser: null, fallbackChannel: 'C0123456789' });
  const noSlack = init(answers(1, 1, { reviewer: { name: 'Sam', github: 'sam-example' } })).cfg;
  assert.equal(noSlack.reviewer.fallbackChannel, null);
});

test('doctor counts a program that is on PATH but cannot run as missing', () => {
  const s = sandbox({ omit: ['jq'] });
  fs.writeFileSync(path.join(s.bin, 'jq'), '#!/bin/sh\nexit 126\n', { mode: 0o755 });
  const r = s.run(['doctor', '--json'], { AGENT_QUEUE_CONFIG: path.join(s.dir, 'none.json') });
  const jq = JSON.parse(r.stdout).checks.find((c) => c.name === 'jq');
  assert.equal(jq.ok, false);
  assert.match(jq.detail, /installed, but jq --version failed \(exit 126\)/);
});

test('doctor --json reports a malformed config as a failed check and still prints JSON', () => {
  const s = sandbox();
  const f = path.join(s.dir, 'bad.json');
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
  fs.writeFileSync(f, JSON.stringify({ ...ex, dispatcher: { ...ex.dispatcher, enabledHosts: 'not-a-list' } }));
  const r = s.run(['doctor', '--json'], { AGENT_QUEUE_CONFIG: f });
  assert.equal(r.status, 1);
  const shape = JSON.parse(r.stdout).checks.find((c) => c.name === 'config shape');
  assert.match(shape.detail, /dispatcher\.enabledHosts is not a list/);
});
