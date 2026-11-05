#!/usr/bin/env node
// history.mjs: prints the recent history of one worker session on this machine as JSON, for the queue board.
//   node history.mjs <account label> <worker id> [count]
// Reads the session's transcript (<account dir>/projects/*/<session id>.jsonl) from its tail and keeps what a person
// follows: user and assistant text, each tool call with a one-line summary, failed tool results and error notices.
// Successful tool output is left out; it is long and can hold values a worker printed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../lib/config.mjs';

const [label, worker, countArg] = process.argv.slice(2);
if (!/^[a-z]$/.test(label ?? '') || !/^[0-9a-f]{8}$/.test(worker ?? '')) {
  console.error('usage: history.mjs <account label> <worker id> [count]');
  process.exit(2);
}
const count = Math.min(Math.max(Number(countArg) || 120, 1), 400);
const HOME = os.homedir();
// The fleet account whose config dir is ~/.claude; every other account lives in ~/.claude-<label>.
const PRIMARY = loadConfig().fleet?.primaryAccount ?? 'a';
const acctDir = label === PRIMARY ? path.join(HOME, '.claude') : path.join(HOME, `.claude-${label}`);

const TAIL_BYTES = 6 * 1024 * 1024;

function findTranscript() {
  const root = path.join(acctDir, 'projects');
  let best = null;
  for (const dir of fs.readdirSync(root)) {
    let names;
    try { names = fs.readdirSync(path.join(root, dir)); } catch { continue; }
    for (const n of names) {
      if (!n.startsWith(worker) || !n.endsWith('.jsonl')) continue;
      const file = path.join(root, dir, n);
      const st = fs.statSync(file);
      if (!best || st.mtimeMs > best.st.mtimeMs) best = { file, st };
    }
  }
  return best;
}

function tailLines(file, size) {
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    if (len < size) lines.shift();
    return { lines, truncated: len < size };
  } finally {
    fs.closeSync(fd);
  }
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}...` : s);
const stripReminders = (s) => s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '');

function toolEvent(at, b) {
  const i = b.input ?? {};
  const first = [i.description, i.file_path, i.path, i.pattern, i.url, i.query, i.subject, i.to, i.skill, i.title]
    .find((v) => typeof v === 'string' && v.trim());
  const ev = { t: 'tool', at, name: b.name, label: clip(String(first ?? ''), 200) };
  if (b.name === 'Bash' && i.command) ev.detail = clip(i.command, 400);
  else if (b.name === 'SendMessage' && i.message) ev.detail = clip(typeof i.message === 'string' ? i.message : JSON.stringify(i.message), 400);
  else if (b.name === 'Agent' && i.prompt) ev.detail = clip(i.prompt, 300);
  return ev;
}

const found = findTranscript();
if (!found) {
  console.log(JSON.stringify({ ok: false, error: `no transcript for ${label}/${worker} on ${os.hostname()}` }));
  process.exit(0);
}
const { lines, truncated } = tailLines(found.file, found.st.size);
const events = [];
for (const line of lines) {
  if (!line) continue;
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.isSidechain) continue;
  const at = e.timestamp ?? null;
  if (e.type === 'user' && e.message?.role === 'user') {
    const c = e.message.content;
    if (Array.isArray(c)) {
      for (const b of c) {
        if (b?.type === 'tool_result' && b.is_error) events.push({ t: 'error', at, text: clip(textOf(b.content).trim(), 600) });
      }
    }
    if (e.isMeta || e.isCompactSummary) continue;
    const text = stripReminders(textOf(c));
    if (text) events.push({ t: 'user', at, text: clip(text, 4000) });
  } else if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
    for (const b of e.message.content) {
      if (b?.type === 'text' && b.text?.trim()) events.push({ t: 'assistant', at, text: clip(b.text.trim(), 6000) });
      else if (b?.type === 'tool_use') events.push(toolEvent(at, b));
    }
  } else if (e.type === 'system' && typeof e.content === 'string' && (['error', 'warning'].includes(e.level) || /error|compact/i.test(e.subtype ?? ''))) {
    events.push({ t: 'system', at, text: clip(stripReminders(e.content), 600) });
  }
}

console.log(JSON.stringify({
  ok: true,
  sessionId: path.basename(found.file, '.jsonl'),
  updatedAt: new Date(found.st.mtimeMs).toISOString(),
  sizeBytes: found.st.size,
  earlier: truncated || events.length > count,
  events: events.slice(-count),
}));
