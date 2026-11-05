// The dispatcher tests' shared sandbox: a throwaway HOME holding a copy of the repo's layout (lib/config.mjs,
// dispatcher/, a stub fleet/fleet.sh, a stub inbox/ask-human.sh) and a config built from the example config, plus a
// stub gh on PATH and a fake LINEAR_API_KEY. Each test supplies a preload that stubs Linear behind fetch, so nothing
// real is read or written. DISPATCHER_SRC points the tests at another copy of dispatcher.mjs (to prove an edit before
// it goes live).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const SRC = process.env.DISPATCHER_SRC ?? path.join(REPO_ROOT, 'dispatcher/dispatcher.mjs');
export const EXAMPLE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'agent-queue.config.example.json'), 'utf8'));

const ASK = '#!/bin/sh\necho "$@" >> "$HOME/asks"\n';

// dispatcher: keys merged over the example's dispatcher section; config: top-level sections merged over the example.
export function makeBox(name, { preload, fleet, gh = '#!/bin/sh\necho "[]"\n', dispatcher = {}, config = {} }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  const root = path.join(home, 'agent-queue');
  const dir = path.join(root, 'dispatcher');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, 'lib'));
  fs.copyFileSync(path.join(REPO_ROOT, 'lib/config.mjs'), path.join(root, 'lib/config.mjs'));
  fs.copyFileSync(SRC, path.join(dir, 'dispatcher.mjs'));
  fs.copyFileSync(path.join(REPO_ROOT, 'dispatcher/worker-brief.md'), path.join(dir, 'worker-brief.md'));
  const cfg = { ...EXAMPLE, ...config, dispatcher: { ...EXAMPLE.dispatcher, notify: false, ...dispatcher } };
  const configFile = path.join(root, 'agent-queue.config.json');
  fs.writeFileSync(configFile, JSON.stringify(cfg));
  fs.mkdirSync(path.join(root, 'fleet'));
  fs.writeFileSync(path.join(root, 'fleet/fleet.sh'), fleet, { mode: 0o755 });
  fs.mkdirSync(path.join(root, 'inbox'));
  fs.writeFileSync(path.join(root, 'inbox/ask-human.sh'), ASK, { mode: 0o755 });
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), gh, { mode: 0o755 });
  fs.writeFileSync(path.join(home, 'preload.mjs'), preload);
  return { home, root, dir, bin, configFile, stateDir: path.join(home, '.agent-queue'), shared: path.join(home, '.agent-queue/shared') };
}

// Rewrites the sandbox's config: fn gets the current config and returns the new one.
export function editConfig(box, fn) {
  fs.writeFileSync(box.configFile, JSON.stringify(fn(JSON.parse(fs.readFileSync(box.configFile, 'utf8')))));
}

export const runIn = (box, args, env = {}) => spawnSync(process.execPath, ['--import', path.join(box.home, 'preload.mjs'), path.join(box.dir, 'dispatcher.mjs'), ...args],
  { env: { ...process.env, HOME: box.home, PATH: `${box.bin}:${process.env.PATH}`, AGENT_QUEUE_CONFIG: box.configFile, LINEAR_API_KEY: 'fake-linear-key', ...env },
    encoding: 'utf8', timeout: 60_000 });

export const state = (box) => JSON.parse(fs.readFileSync(path.join(box.stateDir, 'state.json'), 'utf8'));
