// the-forge init: one, two, three and four computers, and one Claude account. Each config it writes must load through
// lib/config.mjs and hold only keys the example and docs/configuration.md cover.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { unknownKeys, undocumentedKeys } from '../setup/coverage.mjs';
import { answers, HOST, ROOT, sandbox, writeAnswers } from './setup-sandbox.mjs';

function initCase(a) {
  const s = sandbox();
  const out = path.join(s.dir, 'agent-queue.config.json');
  const r = s.run(['init', '--answers', writeAnswers(s, a), '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const cfg = JSON.parse(fs.readFileSync(out, 'utf8'));
  // The loader accepts it: every component reads the config this way.
  const get = (k) => spawnSync(process.execPath, [path.join(ROOT, 'lib/config.mjs'), 'get', k],
    { encoding: 'utf8', env: { ...s.env(), AGENT_QUEUE_CONFIG: out } });
  assert.equal(get('human.name').stdout.trim(), 'Alex');
  assert.equal(get('repoPath').stdout.trim(), path.join(s.home, 'dev/example-app'));
  assert.deepEqual(unknownKeys(cfg), []);
  assert.deepEqual(undocumentedKeys(cfg), []);
  assert.ok(fs.existsSync(path.join(s.dir, 'forge-answers.json')), 'the answers are kept next to the config');
  return { cfg, s };
}

for (const n of [1, 2, 3, 4]) {
  test(`init writes a config for ${n} computer(s) that the loader accepts and the docs cover`, () => {
    const { cfg } = initCase(answers(n));
    const hosts = [HOST, 'box-two', 'box-three', 'box-four'].slice(0, n);
    assert.deepEqual(cfg.dispatcher.enabledHosts, hosts);
    assert.deepEqual(Object.keys(cfg.dispatcher.hosts), hosts);
    assert.equal(cfg.queueBoard.host, HOST);
    assert.equal(cfg.fleet.primaryAccount, 'a');
    // The main account (a) is not a worker here, so only b and c take tickets.
    for (const h of hosts) assert.deepEqual(cfg.dispatcher.hosts[h].accounts, ['b', 'c']);
    assert.equal(cfg.dispatcher.maxConcurrent, Object.values(cfg.dispatcher.hosts).reduce((t, h) => t + h.maxWorkers, 0));
    assert.deepEqual(Object.keys(cfg.queueBoard.ssh), hosts.slice(1));
    assert.deepEqual(Object.keys(cfg.learning.ssh), hosts.slice(1));
    assert.equal(cfg.queueBoard.remoteRoot.startsWith('~') || path.isAbsolute(cfg.queueBoard.remoteRoot), true);
    assert.equal('realms' in cfg.queueBoard, false, 'with no realms answer the board assigns them in host order');
    const engines = ['codex', 'grok'].filter((e) => answers(n).computers.some((c) => c[e]));
    assert.equal(cfg.dispatcher.externalBuilders.fallback.enabled, true);
    assert.deepEqual(cfg.dispatcher.externalBuilders.fallback.engines, engines);
    assert.deepEqual(cfg.premerge.checkCommand, ['npm', 'run', 'type-check']);
    assert.equal(cfg.slack.channel, null);
    assert.equal(cfg.reviewer, undefined);
    assert.deepEqual(cfg.learning.catalog, []);
  });
}

test('one Claude account is both main and worker on every computer, and the headroom floor stays', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
  for (const n of [1, 3]) {
    const a = answers(n, 1);
    for (const c of a.computers) Object.assign(c, { codex: false, grok: false });
    const { cfg } = initCase(a);
    for (const h of cfg.dispatcher.enabledHosts) assert.deepEqual(cfg.dispatcher.hosts[h].accounts, ['a']);
    assert.deepEqual(cfg.mainWatch.accounts, ['a']);
    assert.equal(cfg.dispatcher.headroomFloorPercent, ex.dispatcher.headroomFloorPercent);
    assert.equal(cfg.dispatcher.externalBuilders.fallback.enabled, false);
    assert.equal(cfg.queueBoard.extUsage, false);
  }
});

test('optional answers: Slack, weather, realms, names and a reviewer land in their keys', () => {
  const a = answers(4, 2, {
    slack: { domain: 'example', channel: 'C0123456789', channelName: '#queue' },
    weather: { latitude: 10.5, longitude: -20.25, timezone: 'UTC', place: 'Home' },
    realms: { [HOST]: 'shire', 'box-two': 'rivendell', 'box-three': 'rohan', 'box-four': 'erebor' },
    reviewer: { name: 'Sam', github: 'sam-example' },
  });
  a.computers[1].name = 'two';
  const { cfg } = initCase(a);
  assert.equal(cfg.slack.channel, 'C0123456789');
  assert.equal(cfg.queueBoard.weather.place, 'Home');
  assert.equal(cfg.queueBoard.realms['box-three'], 'rohan');
  assert.deepEqual(cfg.queueBoard.names, { 'box-two': 'two' });
  assert.equal(cfg.reviewer.github, 'sam-example');
});

test('init refuses answers it cannot build from, naming each problem, and writes nothing', () => {
  const s = sandbox();
  const out = path.join(s.dir, 'agent-queue.config.json');
  const bad = answers(2);
  delete bad.computers[1].ssh;
  bad.computers.push(...answers(4).computers.slice(1), { host: 'box-five', ssh: 'x@y' });
  bad.claudeAccounts[1].label = 'a';
  bad.linear.team = 'abc';
  delete bad.repository.check;
  bad.realms = { [HOST]: 'mordor' };
  const r = s.run(['init', '--answers', writeAnswers(s, bad), '--out', out]);
  assert.equal(r.status, 1);
  for (const m of [/1 to 4 computers/, /box-two needs ssh/, /label a belongs to the main account/, /linear\.team/, /repository\.check/, /realms\.\S+ must be one of/]) {
    assert.match(r.stderr, m);
  }
  assert.equal(fs.existsSync(out), false);
});

test('a second init keeps the old config as a backup', () => {
  const s = sandbox();
  const out = path.join(s.dir, 'agent-queue.config.json');
  const f = writeAnswers(s, answers(1));
  assert.equal(s.run(['init', '--answers', f, '--out', out]).status, 0);
  assert.equal(s.run(['init', '--answers', f, '--out', out]).status, 0);
  assert.equal(fs.readdirSync(s.dir).filter((x) => x.startsWith('agent-queue.config.json.bak-')).length, 1);
});

test('the pre-merge error pattern fits the check, and two or more computers bind the board to Tailscale', () => {
  const ts = answers(1);
  const tests = answers(2);
  tests.repository.check = ['npm', 'test'];
  assert.equal(initCase(ts).cfg.premerge.errorPattern, 'error TS\\d+');
  const { cfg } = initCase(tests);
  assert.equal(cfg.premerge.errorPattern, '\\S');
  assert.ok(new RegExp(cfg.premerge.errorPattern).test('FAIL src/a.test.js'));
  assert.deepEqual(cfg.queueBoard.bind, ['127.0.0.1', 'tailscale']);
  assert.deepEqual(initCase(answers(1)).cfg.queueBoard.bind, ['127.0.0.1']);
});

test('spreadRealms is written when this copy has the key, and refused with a reason when it does not', () => {
  const s = sandbox();
  const out = path.join(s.dir, 'agent-queue.config.json');
  const r = s.run(['init', '--answers', writeAnswers(s, answers(1, 1, { spreadRealms: true })), '--out', out]);
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
  if ('spreadRealms' in (ex.queueBoard ?? {})) {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).queueBoard.spreadRealms, true);
  } else {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no config key for queueBoard\.spreadRealms/);
    assert.equal(fs.existsSync(out), false);
  }
});

test('init refuses a repository path whose parent is the home folder, an account on a host in another case, and a board with no Claude account', () => {
  const s = sandbox();
  const a = answers(2, 2);
  a.repository.path = '~/example-app';
  a.claudeAccounts[1].computers = [HOST.toUpperCase() === HOST ? HOST.toLowerCase() : HOST.toUpperCase(), 'box-two'];
  a.claudeAccounts[0].computers = ['box-two'];
  const r = s.run(['init', '--answers', writeAnswers(s, a), '--out', path.join(s.dir, 'c.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /repository\.path must be a folder at least two levels under the home folder/);
  assert.match(r.stderr, /names match letter case too/);
  assert.match(r.stderr, /no Claude account is signed in on .*, the board's computer/);
});

test('the red-main responder uses an account on the board, and the example\'s pre-merge defaults stay unless answered', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));
  const a = answers(2, 2);
  a.claudeAccounts[1].computers = ['box-two']; // the only worker is on the other computer
  a.computers[0].codex = true;
  const { cfg } = initCase(a);
  assert.deepEqual(cfg.mainWatch.accounts, ['a']);
  assert.deepEqual(cfg.premerge.migrations, ex.premerge.migrations);
  assert.deepEqual(cfg.premerge.buildOutputRoots, ex.premerge.buildOutputRoots);
  assert.deepEqual(cfg.premerge.copyFiles, ex.premerge.copyFiles);
  const b = answers(1, 1);
  b.repository.migrations = null;
  assert.equal(initCase(b).cfg.premerge.migrations, null);
});
