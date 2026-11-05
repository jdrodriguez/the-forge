#!/usr/bin/env node
// Record a fix for a failure type in history.json (under learning.outDir), so the
// next sweep knows a fix is in flight (no new draft) or landed (judge it week over week).
//   node learning/record.mjs inflight <type-id> --ticket ENG-123 --level 2 --note "what the fix does"
//   node learning/record.mjs landed   <type-id> --level 4 --note "what changed" [--where path-or-PR] [--at ISO]
//   node learning/record.mjs drop     <type-id>      (the ticket was canceled; the type is open again)
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, expandHome } from '../lib/config.mjs';

const cfg = loadConfig();
const OUT = expandHome(cfg.learning?.outDir) || path.join(cfg.paths.stateDir, 'learning');
const file = path.join(OUT, 'history.json');
const [cmd, id, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
if (!['inflight', 'landed', 'drop'].includes(cmd) || !id) {
  console.error('usage: record.mjs inflight|landed|drop <type-id> [--ticket ID] [--level N] [--note TEXT] [--where X] [--at ISO]');
  process.exit(2);
}
const h = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { weeks: [], fixes: {} };
h.inFlight ??= {};
if (cmd === 'inflight') {
  if (!opt('--ticket')) { console.error('--ticket is required'); process.exit(2); }
  h.inFlight[id] = { ticket: opt('--ticket'), level: Number(opt('--level') ?? 0) || null, note: opt('--note') ?? '', filedAt: new Date().toISOString() };
} else if (cmd === 'landed') {
  if (!opt('--level')) { console.error('--level is required'); process.exit(2); }
  h.fixes[id] = { level: Number(opt('--level')), note: opt('--note') ?? '', landedAt: opt('--at') ?? new Date().toISOString(), where: opt('--where') ?? h.inFlight[id]?.ticket ?? '' };
  delete h.inFlight[id];
} else {
  delete h.inFlight[id];
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(file, JSON.stringify(h, null, 2));
console.log(`${cmd} ${id}`);
