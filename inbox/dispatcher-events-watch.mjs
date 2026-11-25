#!/usr/bin/env node
// dispatcher-events-watch.mjs: wakes the orchestrator session when any machine's dispatcher leaves a notice it must
// act on (a long run, a PR waiting on its review, a signed-out account). Each notice is one JSON file in
// orchestrator.eventsDir, shared across machines: {"id": "ENG-12", "host": "...", "subtitle": "...", "text": "...",
// "link": "...", "at": "<ISO>"}.
//
// Prints one EVENT line per new file and exits 0, or exits 2 after 24 quiet hours. It checks once a minute, and
// remembers the files it reported in <stateDir>/orchestrator-events-seen. A notice over 2 days old is skipped, so a
// new machine does not replay history. orchestrator-watch.mjs runs it.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/config.mjs';

const cfg = loadConfig();
const DIR = cfg.orchestrator?.eventsDir || path.join(cfg.paths.sharedDir, 'orchestrator-events');
const SEEN = path.join(cfg.paths.stateDir, 'orchestrator-events-seen');
const SCALE = Number(process.env.FORGE_SLEEP_SCALE ?? 1);
const MAX_AGE_MS = 2 * 864e5;

function fresh() {
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort(); } catch { return []; }
  let seenText = '';
  try { seenText = fs.readFileSync(SEEN, 'utf8'); } catch { /* first run */ }
  const seen = new Set(seenText.split('\n').filter(Boolean));
  const out = [];
  for (const f of files) {
    if (seen.has(f)) continue;
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { continue; } // half-synced: next minute
    fs.mkdirSync(path.dirname(SEEN), { recursive: true });
    fs.appendFileSync(SEEN, `${f}\n`);
    if (!(Date.now() - Date.parse(r.at) < MAX_AGE_MS)) continue;
    out.push(`EVENT ${r.id ?? '-'} on ${r.host ?? '?'}: ${r.subtitle ?? ''}: ${r.text ?? ''}${r.link ? ` (${r.link})` : ''}`);
  }
  return out;
}

const end = Date.now() + 864e5 * SCALE;
for (;;) {
  const lines = fresh();
  if (lines.length) { console.log(lines.join('\n')); process.exit(0); }
  if (Date.now() >= end) process.exit(2);
  await new Promise((r) => setTimeout(r, 60_000 * SCALE));
}
