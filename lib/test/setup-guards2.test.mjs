// the-forge's guards, second set: a global npm install is never the lasting copy, update leaves a foreign folder
// alone, start leaves stale jobs stopped, stop, status and uninstall work with no config, a --dir link into the package,
// the accounts doctor checks, and the config path every job gets.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { answers, HOST, lastingCopy, ROOT, sandbox, writeAnswers } from './setup-sandbox.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('a global npm install copies itself to ~/the-forge, since npm replaces node_modules on every upgrade', () => {
  const s = sandbox();
  const env = { ...process.env, HOME: s.home, npm_config_cache: path.join(s.dir, 'npm-cache'), npm_config_update_notifier: 'false' };
  const pack = spawnSync('npm', ['pack', '--json', '--pack-destination', s.dir], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(pack.status, 0, pack.stderr);
  const prefix = path.join(s.dir, 'prefix');
  const tgz = path.join(s.dir, JSON.parse(pack.stdout)[0].filename);
  assert.equal(spawnSync('npm', ['install', '-g', '--offline', '--prefix', prefix, tgz], { encoding: 'utf8', env }).status, 0);
  const bin = path.join(prefix, 'bin/the-forge');
  const dry = spawnSync(bin, ['setup', '--dry-run', '--no-start'], { encoding: 'utf8', env: s.env() });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would copy \d+ files to ~\/the-forge, the lasting copy/);
  assert.doesNotMatch(dry.stdout, /node_modules/);
  const r = spawnSync(bin, ['setup', '--no-start'], { encoding: 'utf8', env: s.env() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readlinkSync(path.join(s.home, '.claude/skills/fleet')), path.join(s.home, 'the-forge/fleet'));
  const here = spawnSync(bin, ['setup', '--here', '--no-start'], { encoding: 'utf8', env: s.env() });
  assert.equal(here.status, 1);
  assert.match(here.stderr, /npm's cache/);
});

test('update refuses a folder that is not The Forge\'s before it pulls or copies anything', async () => {
  const s = sandbox();
  const { cli } = await lastingCopy(s, answers(1, 1));
  const app = path.join(s.home, 'dev/unrelated-app');
  fs.mkdirSync(path.join(app, '.git'), { recursive: true });
  fs.writeFileSync(path.join(app, 'package.json'), '{"name": "unrelated-app"}');
  const r = s.run(['update', '--dir', app], {}, cli);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is not a copy of The Forge/);
  assert.doesNotMatch(r.stdout, /git/);
  assert.deepEqual(fs.readdirSync(app).sort(), ['.git', 'package.json']);
});

function moveBoard(s, cli) {
  const a = answers(2, 2);
  Object.assign(a.computers[0], { board: false, ssh: 'tester@here' });
  a.computers[1].board = true;
  delete a.computers[1].ssh;
  a.claudeAccounts[0].computers = ['box-two'];
  assert.equal(s.run(['init', '--answers', writeAnswers(s, a, 'moved.json')], {}, cli).status, 0);
}

test('start brings back only the jobs the config gives this computer, after the board moved away', async () => {
  const s = sandbox();
  const { cli } = await lastingCopy(s, answers(2, 2));
  assert.equal(s.run(['install'], {}, cli).status, 0);
  moveBoard(s, cli);
  assert.equal(s.run(['stop'], {}, cli).status, 0);
  const r = s.run(['start'], {}, cli);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /left stopped: main-watch, board, herald, which this computer no longer runs/);
  const running = JSON.parse(s.run(['status', '--json'], {}, cli).stdout).jobs.filter((j) => j.running).map((j) => j.name);
  assert.deepEqual(running, ['dispatcher']);
});

test('stop, status and uninstall work from the installed job files when the config is gone', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(1, 1));
  assert.equal(s.run(['install'], {}, cli).status, 0);
  fs.rmSync(path.join(root, 'agent-queue.config.json'));
  const st = s.run(['status', '--json'], {}, cli);
  assert.equal(st.status, 0, st.stderr);
  const res = JSON.parse(st.stdout);
  assert.equal(res.config.ok, false);
  assert.match(res.config.error, /no config at/);
  assert.equal(res.jobs.filter((j) => j.running).length, 4);
  assert.equal(s.run(['stop'], {}, cli).status, 0);
  assert.equal(JSON.parse(s.run(['status', '--json'], {}, cli).stdout).jobs.filter((j) => j.running).length, 0);
  assert.equal(s.run(['start'], {}, cli).status, 1, 'start needs the config to know which jobs are this computer\'s');
  assert.equal(s.run(['uninstall'], {}, cli).status, 0);
  assert.deepEqual(fs.readdirSync(path.join(s.home, 'Library/LaunchAgents')), []);
  assert.equal(fs.existsSync(path.join(s.home, '.agent-queue/queue-board/Forge Herald.app')), false);
});

test('a --dir that is a link into the package is not copied into itself', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(1, 1));
  fs.mkdirSync(path.join(root, 'inner'));
  fs.symlinkSync(path.join(root, 'inner'), path.join(s.home, 'link'));
  const r = s.run(['setup', '--no-start', '--dir', path.join(s.home, 'link')], {}, cli);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(root, 'inner/bin/the-forge.mjs')));
  assert.equal(fs.existsSync(path.join(root, 'inner/inner')), false);
});

test('doctor checks the accounts the jobs really use: fallback accounts, every folder with no accounts key, and b for the red-main watcher by default', async () => {
  const s = sandbox();
  const { root, cli } = await lastingCopy(s, answers(1, 2));
  const file = path.join(root, 'agent-queue.config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const l of ['b', 'c', 'e']) {
    fs.mkdirSync(path.join(s.home, `.claude-${l}`), { recursive: true });
    fs.writeFileSync(path.join(s.home, `.claude-${l}/.claude.json`), '{}');
  }
  const accounts = () => JSON.parse(s.run(['doctor', '--json'], {}, cli).stdout).checks.filter((c) => c.name.startsWith('Claude account')).map((c) => c.name.slice(15));
  cfg.dispatcher.hosts[HOST].fallbackAccounts = ['c'];
  delete cfg.mainWatch.accounts;
  fs.writeFileSync(file, JSON.stringify(cfg));
  assert.deepEqual(accounts(), ['b', 'c']);
  delete cfg.dispatcher.hosts[HOST].accounts;
  fs.writeFileSync(file, JSON.stringify(cfg));
  assert.deepEqual(accounts(), ['a', 'b', 'c', 'e'], 'no accounts key: every account fleet.sh lists here (a always)');
});

for (const system of ['Darwin', 'Linux']) {
  test(`every job gets the config as an absolute path when AGENT_QUEUE_CONFIG is relative (${system})`, async () => {
    const s = sandbox();
    const { root, cli } = await lastingCopy(s, answers(1, 1));
    const env = s.env({ AGENT_QUEUE_CONFIG: 'the-forge/agent-queue.config.json', FAKE_UNAME: system });
    const r = spawnSync(process.execPath, [cli, 'install'], { cwd: s.home, encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const abs = path.join(root, 'agent-queue.config.json');
    const files = system === 'Darwin'
      ? ['dispatcher', 'main-watch', 'queue-board', 'queue-herald'].map((j) => path.join(s.home, `Library/LaunchAgents/dev.agent-queue.${j}.plist`))
      : ['dispatcher.service', 'main-watch.service', 'board.service'].map((u) => path.join(s.home, `.config/systemd/user/agent-queue-${u}`));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      assert.match(text, new RegExp(esc(abs)), f);
      assert.doesNotMatch(text, /[=>]the-forge\/agent-queue\.config\.json/, f);
    }
  });
}
