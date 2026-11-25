#!/usr/bin/env node
// config.mjs: the one config loader every component uses. The config is agent-queue.config.json at the repo root, or
// the file AGENT_QUEUE_CONFIG names. agent-queue.config.example.json documents every key.
//
// As a module:  import { loadConfig, linearKey, ROOT } from '../lib/config.mjs';
// As a CLI, for the shell scripts:
//   node lib/config.mjs get <dot.path>   prints one value (strings raw, anything else as JSON); exit 1 if unset
//   node lib/config.mjs env              prints AQ_<PATH>=value for every scalar, for `while read` loops in bash
//   node lib/config.mjs linear-key       prints the Linear API key (see linearKey below)
//   node lib/config.mjs doc              prints docs/configuration.md from the example config's Note keys
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = os.homedir();
export const expandHome = (p) => (typeof p === 'string' && (p === '~' || p.startsWith('~/')) ? path.join(HOME, p.slice(1)) : p);

export const configPath = () => process.env.AGENT_QUEUE_CONFIG || path.join(ROOT, 'agent-queue.config.json');

// Keys whose names end in Note, or are "//", are documentation and are dropped on load. Every string that starts
// with ~/ is expanded to the home folder.
const normalize = (v) => {
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'string') return expandHome(v);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => k !== '//' && !k.endsWith('Note')).map(([k, x]) => [k, normalize(x)]));
};

const DEFAULT_PATHS = { stateDir: '~/.agent-queue', sharedDir: '~/.agent-queue/shared' };

let cached = null;
export function loadConfig({ fresh = false } = {}) {
  if (cached && !fresh) return cached;
  const file = configPath();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`no config at ${file}; copy agent-queue.config.example.json there and fill it in`);
    throw e;
  }
  const cfg = normalize(JSON.parse(raw));
  cfg.paths = normalize({ ...DEFAULT_PATHS, ...(cfg.paths ?? {}) });
  cached = cfg;
  return cfg;
}

// The Linear API key, from the first source that has one: the LINEAR_API_KEY environment variable, the command in
// linear.apiKeyCommand (an argv array, for a secrets manager such as Doppler or 1Password), or the file in
// linear.apiKeyFile (default <stateDir>/linear-api-key, mode 600).
export function linearKey(cfg = loadConfig()) {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  const cmd = cfg.linear?.apiKeyCommand;
  if (Array.isArray(cmd) && cmd.length) {
    return execFileSync(cmd[0], cmd.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim();
  }
  const file = cfg.linear?.apiKeyFile || path.join(cfg.paths.stateDir, 'linear-api-key');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    throw new Error(`no Linear API key: set LINEAR_API_KEY, linear.apiKeyCommand, or put the key in ${file}`);
  }
}

export function get(cfg, dotted) {
  return dotted.split('.').reduce((v, k) => (v == null ? undefined : v[k]), cfg);
}

const snake = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
function flatten(v, prefix, out) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}_${snake(k)}` : snake(k), out);
  } else if (['string', 'number', 'boolean'].includes(typeof v)) {
    const s = String(typeof v === 'string' ? expandHome(v) : v);
    if (!s.includes('\n')) out.push(`AQ_${prefix}=${s}`);
  }
  return out;
}

// docs/configuration.md, generated from the example config's Note keys (a test keeps the two in step).
export function configDoc(exampleFile = path.join(ROOT, 'agent-queue.config.example.json')) {
  const ex = JSON.parse(fs.readFileSync(exampleFile, 'utf8'));
  const isNote = (k) => k === '//' || k.endsWith('Note');
  const show = (v) => {
    const s = JSON.stringify(v);
    return `\`${s.length > 70 ? `${s.slice(0, 67)}...` : s}\``.replaceAll('|', '\\|');
  };
  const cell = (s) => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const noteOf = (obj, k) => obj[`${k}Note`] ?? (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k]) ? obj[k][`${k}Note`] : undefined);
  const rows = (obj, prefix) => Object.keys(obj).filter((k) => !isNote(k))
    .map((k) => `| \`${prefix}${k}\` | ${show(stripDeep(obj[k]))} | ${cell(noteOf(obj, k))} |`);
  const stripDeep = (v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !isNote(k)).map(([k, x]) => [k, stripDeep(x)])) : v);
  const head = '| Key | Example | What it does |\n|---|---|---|';
  const top = Object.fromEntries(Object.entries(ex).filter(([k, v]) => isNote(k) || !(v && typeof v === 'object' && !Array.isArray(v))));
  const out = ['# Configuration', '',
    'Generated from `agent-queue.config.example.json` by `node lib/config.mjs doc`. To change this page, edit the example\'s `...Note` keys and regenerate. Every string that starts with `~/` is expanded to the home folder of the machine reading it.',
    '', ex['//'] ?? '', '', '## Top level', '', head, ...rows(top, '')];
  for (const [k, v] of Object.entries(ex)) {
    if (isNote(k) || !(v && typeof v === 'object' && !Array.isArray(v))) continue;
    out.push('', `## \`${k}\``, '', ...(ex[`${k}Note`] ? [ex[`${k}Note`], ''] : []), head, ...rows(v, `${k}.`));
  }
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'doc') {
    process.stdout.write(configDoc());
    process.exit(0);
  }
  try {
    const cfg = loadConfig();
    if (cmd === 'get' && arg) {
      const v = get(cfg, arg);
      if (v === undefined || v === null) process.exit(1);
      console.log(typeof v === 'string' ? expandHome(v) : JSON.stringify(v));
    } else if (cmd === 'env') {
      console.log([`AQ_ROOT=${ROOT}`, ...flatten(cfg, '', [])].join('\n'));
    } else if (cmd === 'linear-key') {
      console.log(linearKey(cfg));
    } else {
      console.error('usage: node lib/config.mjs get <dot.path> | env | linear-key | doc');
      process.exit(2);
    }
  } catch (e) {
    console.error(`config: ${e.message}`);
    process.exit(3);
  }
}
