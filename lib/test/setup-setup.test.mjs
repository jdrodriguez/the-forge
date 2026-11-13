// the-forge setup and the package: setup run from an npx copy makes the lasting copy, links the skills and starts the
// skill; the packed tarball installs into an empty prefix and every command's help works from it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { npxCopy, ROOT, sandbox } from './setup-sandbox.mjs';

const COMMANDS = ['setup', 'init', 'doctor', 'install', 'uninstall', 'start', 'stop', 'status', 'open', 'update', 'copy-to'];

test('setup from an npx copy installs the lasting copy, links the skills and starts the forge-setup skill', async () => {
  const s = sandbox();
  const npx = await npxCopy(s);
  const r = s.run(['setup'], {}, path.join(npx, 'bin/the-forge.mjs'));
  assert.equal(r.status, 0, r.stderr);
  const root = path.join(s.home, 'the-forge');
  for (const f of ['bin/the-forge.mjs', 'dispatcher/dispatcher.mjs', 'skills/forge-setup/SKILL.md', 'agent-queue.config.example.json']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  assert.ok(fs.statSync(path.join(root, 'bin/the-forge.mjs')).mode & 0o100, 'the command stays executable');
  const links = {
    '.claude/skills/forge-setup': 'skills/forge-setup', '.claude/skills/specdesk': 'specdesk/skill', '.claude/skills/fleet': 'fleet',
    '.claude/scripts/ask-human.sh': 'inbox/ask-human.sh', '.local/bin/the-forge': 'bin/the-forge.mjs',
  };
  for (const [link, target] of Object.entries(links)) assert.equal(fs.readlinkSync(path.join(s.home, link)), path.join(root, target), link);
  assert.ok(s.calls().includes(`claude /forge-setup cwd=${root}`), s.calls().join('\n'));
  // Run again from the lasting copy: nothing to copy, the links are already right.
  const again = s.run(['setup', '--no-start'], {}, path.join(root, 'bin/the-forge.mjs'));
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /the lasting copy is ~\/the-forge/);
  assert.match(again.stdout, /ok: ~\/.claude\/skills\/fleet/);
});

test('setup leaves a link or folder that is not its own, and keeps the config of an existing copy', async () => {
  const s = sandbox();
  fs.mkdirSync(path.join(s.home, '.claude/skills/fleet'), { recursive: true });
  fs.mkdirSync(path.join(s.home, 'the-forge'), { recursive: true });
  fs.writeFileSync(path.join(s.home, 'the-forge/agent-queue.config.json'), '{"mine": true}');
  const npx = await npxCopy(s);
  const r = s.run(['setup', '--no-start'], {}, path.join(npx, 'bin/the-forge.mjs'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /left ~\/.claude\/skills\/fleet: it is a real file or folder/);
  assert.ok(fs.statSync(path.join(s.home, '.claude/skills/fleet')).isDirectory());
  assert.equal(fs.readFileSync(path.join(s.home, 'the-forge/agent-queue.config.json'), 'utf8'), '{"mine": true}');
});

test('setup without Claude Code says how to install it; --dry-run changes nothing', async () => {
  const s = sandbox({ omit: ['claude'] });
  const npx = await npxCopy(s);
  const dry = s.run(['setup', '--dry-run'], {}, path.join(npx, 'bin/the-forge.mjs'));
  assert.equal(dry.status, 1);
  assert.match(dry.stdout, /would copy \d+ files to ~\/the-forge/);
  assert.match(dry.stdout, /missing: claude \(not installed\)/);
  assert.equal(fs.existsSync(path.join(s.home, 'the-forge')), false);
  assert.equal(fs.existsSync(path.join(s.home, '.claude')), false);
  const r = s.run(['setup'], {}, path.join(npx, 'bin/the-forge.mjs'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Claude Code is not installed[\s\S]*claude\.ai\/install\.sh[\s\S]*setup --here/);
});

test('install refuses to point jobs at an npx copy', async () => {
  const s = sandbox();
  const npx = await npxCopy(s);
  const r = s.run(['install'], {}, path.join(npx, 'bin/the-forge.mjs'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /npm's cache/);
  assert.deepEqual(s.calls(), []);
});

test('npm pack, then the tarball installed into an empty prefix: --help and every command --help work', () => {
  const s = sandbox();
  const env = { ...process.env, HOME: s.home, npm_config_cache: path.join(s.dir, 'npm-cache'), npm_config_update_notifier: 'false' };
  const pack = spawnSync('npm', ['pack', '--json', '--pack-destination', s.dir], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(pack.status, 0, pack.stderr);
  const { filename, files } = JSON.parse(pack.stdout)[0];
  const packed = files.map((f) => f.path);
  for (const f of ['bin/the-forge.mjs', 'lib/setup/answers.mjs', 'skills/forge-setup/SKILL.md', 'docs/setup.md', 'agent-queue.config.example.json']) {
    assert.ok(packed.includes(f), `${f} is in the package`);
  }
  assert.ok(!packed.some((f) => f.startsWith('.claude/') || f === 'agent-queue.config.json'), 'no worktrees or personal config');
  const prefix = path.join(s.dir, 'prefix');
  const inst = spawnSync('npm', ['install', '-g', '--offline', '--prefix', prefix, path.join(s.dir, filename)], { encoding: 'utf8', env });
  assert.equal(inst.status, 0, inst.stderr);
  const bin = path.join(prefix, 'bin/the-forge');
  const help = spawnSync(bin, ['--help'], { encoding: 'utf8', env: s.env() });
  assert.equal(help.status, 0, help.stderr);
  for (const c of COMMANDS) assert.match(help.stdout, new RegExp(`^  ${c} `, 'm'));
  for (const c of COMMANDS) {
    const r = spawnSync(bin, [c, '--help'], { encoding: 'utf8', env: s.env() });
    assert.equal(r.status, 0, `${c} --help: ${r.stderr}`);
    assert.match(r.stdout, new RegExp(`^Usage: the-forge ${c}`), c);
  }
});
