// The config loader: notes stripped, ~ expanded, the shell view, the Linear key sources, and docs/configuration.md
// kept in step with the example's Note keys.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'lib/config.mjs');
const EXAMPLE = path.join(ROOT, 'agent-queue.config.example.json');

const cli = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, LINEAR_API_KEY: '', ...env } });
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));

test('docs/configuration.md matches the example config (regenerate with: node lib/config.mjs doc > docs/configuration.md)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs/configuration.md'), 'utf8'), cli(['doc']).stdout);
});

test('every key in the example has documentation in a Note', () => {
  const undocumented = cli(['doc']).stdout.split('\n').filter((l) => /^\| `/.test(l) && /\| {2}\|$/.test(l));
  assert.deepEqual(undocumented, []);
});

test('notes are stripped, ~ is expanded everywhere, and env prints one AQ_ line per scalar', () => {
  const h = home();
  const r = cli(['get', 'slack.botTokenFile'], { HOME: h, AGENT_QUEUE_CONFIG: EXAMPLE });
  assert.equal(r.stdout.trim(), path.join(h, '.agent-queue/slack-bot-token'));
  assert.equal(cli(['get', 'human.nameNote'], { HOME: h, AGENT_QUEUE_CONFIG: EXAMPLE }).status, 1);
  const env = cli(['env'], { HOME: h, AGENT_QUEUE_CONFIG: EXAMPLE }).stdout.split('\n');
  assert.ok(env.includes('AQ_LINEAR_LABELS_NEEDS_HUMAN=needs-human'));
  assert.ok(env.includes(`AQ_PATHS_SHARED_DIR=${path.join(h, '.agent-queue/shared')}`));
  assert.ok(env.includes(`AQ_ROOT=${ROOT}`));
  assert.ok(env.every((l) => l === '' || /^AQ_[A-Z0-9_]+=/.test(l)), env.find((l) => !/^AQ_[A-Z0-9_]+=/.test(l)));
});

test('the Linear key comes from the environment, then apiKeyCommand, then apiKeyFile', () => {
  const h = home();
  const cfgFile = path.join(h, 'c.json');
  const base = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  fs.writeFileSync(path.join(h, 'key'), 'from-file\n');
  fs.writeFileSync(cfgFile, JSON.stringify({ ...base, linear: { ...base.linear, apiKeyCommand: [], apiKeyFile: path.join(h, 'key') } }));
  assert.equal(cli(['linear-key'], { HOME: h, AGENT_QUEUE_CONFIG: cfgFile }).stdout.trim(), 'from-file');
  fs.writeFileSync(cfgFile, JSON.stringify({ ...base, linear: { ...base.linear, apiKeyCommand: ['echo', 'from-command'], apiKeyFile: path.join(h, 'key') } }));
  assert.equal(cli(['linear-key'], { HOME: h, AGENT_QUEUE_CONFIG: cfgFile }).stdout.trim(), 'from-command');
  assert.equal(cli(['linear-key'], { HOME: h, AGENT_QUEUE_CONFIG: cfgFile, LINEAR_API_KEY: 'from-env' }).stdout.trim(), 'from-env');
  const missing = cli(['get', 'human.name'], { HOME: h, AGENT_QUEUE_CONFIG: path.join(h, 'nope.json') });
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /no config at .*nope\.json; copy agent-queue\.config\.example\.json/);
});
