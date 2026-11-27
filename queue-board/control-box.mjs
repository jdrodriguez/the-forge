// control-box.mjs: the fixture for the Fleet levers' server tests (control.test.mjs, control-timers.test.mjs). A temp
// folder holds a copy of agent-queue.config.example.json with three machines set up, a shared folder with three
// heartbeats, and a snapshot that shows each machine's accounts. The pause runner is a stub that records its calls, so
// nothing reaches a machine. No test reads or writes a real config.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControl } from './control.mjs';
import { serialize } from './control-config.mjs';

const EXAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent-queue.config.example.json');
export const T0 = Date.parse('2026-11-19T22:10:00Z');
export const HOUR = 3.6e6;
export const HOSTS = ['main-mac', 'mini', 'linux-box'];

export function box({ snapshot = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-control-'));
  const root = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  const cfg = root.dispatcher;
  cfg.enabledHosts = [...HOSTS];
  cfg.hosts = {
    'main-mac': { maxWorkers: 5, sentryWorkers: 1, burstWorkers: 0, accounts: ['a', 'b', 'c', 'd', 'h'] },
    mini: { maxWorkers: 6, accounts: ['e', 'f', 'h'] },
    'linux-box': { maxWorkers: 6, sentryWorkers: 1, burstWorkers: 2, accounts: ['b', 'c', 'd', 'e', 'f', 'h'] },
  };
  Object.assign(cfg, { maxConcurrent: 36, headroomFloorPercent: 10, workerCap: 3, burnAccounts: ['c', 'a'], noFableAccounts: ['a', 'h'], model: 'opus' });
  for (const k of ['fableAccounts', 'burnUntil', 'holdNewWork', 'accountsOut']) delete cfg[k];
  const file = path.join(dir, 'agent-queue.config.json');
  fs.writeFileSync(file, serialize(root));
  const shared = path.join(dir, 'shared');
  fs.mkdirSync(path.join(shared, 'heartbeats'), { recursive: true });
  const beat = (host, wakeQueue = []) => fs.writeFileSync(path.join(shared, 'heartbeats', `${host}.json`),
    JSON.stringify({ host, at: new Date(T0).toISOString(), paused: false, room: false, wakeQueue, accountsWorking: [{ key: 'someone@example.com|max', label: 'b', working: 1 }] }));
  beat('main-mac');
  beat('mini');
  beat('linux-box', [{ id: 'ABC-7064', since: '2026-11-19T22:06:56Z', reason: 'merge state DIRTY, account someone@example.com full', pool: 'regular' }]);
  const snap = snapshot ?? { machines: [
    { host: 'main-mac', ok: true, paused: null, accounts: ['a', 'b', 'c', 'd', 'h'].map((label) => ({ label })), spareLabels: ['g'] },
    { host: 'mini', ok: true, paused: null, accounts: ['e', 'f', 'h'].map((label) => ({ label })), spareLabels: [] },
    { host: 'linux-box', ok: true, paused: null, accounts: ['b', 'c', 'd', 'e', 'f', 'h'].map((label) => ({ label })), spareLabels: [] }], tickets: [] };
  const clock = { t: T0 };
  const calls = [];
  const writes = [];
  const make = () => createControl({ configFile: file, sharedDir: shared, here: 'main-mac', by: 'Alex via the board', team: 'ABC', snapshot: () => snap,
    now: () => clock.t, runDispatcher: async (host, args) => { calls.push({ host, args }); return 'ok'; }, onWrite: (c) => writes.push(c) });
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return { dir, shared, file, root: read, cfg: () => read().dispatcher, text: () => fs.readFileSync(file, 'utf8'), snap, clock, calls, writes, control: make(), make,
    log: () => fs.readFileSync(path.join(shared, 'control-log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}

// Writes the dispatcher section back as another writer would.
export function overwrite(b, change) {
  const root = b.root();
  change(root.dispatcher);
  fs.writeFileSync(b.file, serialize(root));
}

export const refused = async (p, status, re) => {
  await assert.rejects(p, (e) => (e.status === status && re.test(e.message)) || assert.fail(`${e.status} ${e.message}`));
};
