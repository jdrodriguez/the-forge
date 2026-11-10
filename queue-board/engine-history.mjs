#!/usr/bin/env node
// engine-history.mjs: prints the recent history of one Codex or Grok queue worker on this machine as JSON, in the shape
// history.mjs gives a Claude worker's session, so the board's session panel shows either the same way: a Codex worker
// is a worker like any other, and its panel should not say "No session on record".
//   node engine-history.mjs <ABC-123> [count]
// A dispatcher with engine workers keeps each round of a ticket in its own folder,
// <paths.stateDir>/engine-workers/<ID>/<run id>/: brief.md (what it was asked), stream.jsonl (the engine's own event
// stream: `codex exec --json` items, or Grok's text and tool_call events), and question.md when it stopped to ask. The
// rounds are read oldest first, each opening with its brief, with a marker between them. Neither stream carries times,
// so an event has none except a round's start (when its brief was written); updatedAt is the newest stream's last write.
// Commands and edits show as tool rows with a one-line summary; command output is left out (long, and it can hold values
// a worker printed), except the tail of a failed command.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../lib/config.mjs';

const [id, countArg] = process.argv.slice(2);
if (!/^[A-Z]+-\d+$/.test(id ?? '')) {
  console.error('usage: engine-history.mjs <ABC-123> [count]');
  process.exit(2);
}
const count = Math.min(Math.max(Number(countArg) || 150, 1), 400);
const DIR = path.join(loadConfig().paths.stateDir, 'engine-workers');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}...` : s);
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
// A shell command as its engine logged it, without the shell wrapper Codex puts round it.
const bare = (c) => String(Array.isArray(c) ? c.join(' ') : c ?? '').replace(/^\/bin\/(?:ba|z)?sh -l?c '([\s\S]*)'$/, (_, x) => x.replace(/'"'"'/g, "'"));

let registry = {};
try { registry = JSON.parse(read(path.join(DIR, `${id}.json`)) || '{}'); } catch { registry = {}; }
const runs = (() => {
  try {
    return fs.readdirSync(path.join(DIR, id), { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => {
        const dir = path.join(DIR, id, d.name);
        // A round starts when its brief is written; the folder's own birth time is not kept on every filesystem.
        const st = (() => { try { return fs.statSync(path.join(dir, 'brief.md')); } catch { return fs.statSync(dir); } })();
        return { dir, at: st.mtime };
      })
      .sort((a, b) => a.at - b.at);
  } catch { return []; }
})();
if (!runs.length) {
  console.log(JSON.stringify({ ok: false, error: `no ${registry.engine ?? 'engine'} run on record for ${id} on ${os.hostname()}` }));
  process.exit(0);
}

function codexEvents(lines, out) {
  for (const e of lines) {
    const it = e.item ?? {};
    const done = e.type === 'item.completed';
    if (e.type === 'error' || e.type === 'turn.failed') out.push({ t: 'error', at: null, text: clip(String(e.message ?? e.error?.message ?? ''), 600) });
    else if (it.type === 'command_execution' && e.type === 'item.started') out.push({ t: 'tool', at: null, name: 'Shell', label: '', detail: clip(bare(it.command), 400) });
    else if (it.type === 'command_execution' && done && it.exit_code) {
      out.push({ t: 'error', at: null, text: clip(`exit ${it.exit_code}: ${String(it.aggregated_output ?? '').trim().split('\n').slice(-4).join('\n')}`, 600) });
    } else if (it.type === 'agent_message' && done && it.text?.trim()) out.push({ t: 'assistant', at: null, text: clip(it.text.trim(), 6000) });
    else if (it.type === 'file_change' && done) out.push({ t: 'tool', at: null, name: 'Edit', label: clip((it.changes ?? []).map((c) => `${c.kind ?? 'edit'} ${c.path}`).join(', '), 200) });
  }
}
function grokEvents(lines, out) {
  let text = '';
  const flush = () => { if (text.trim()) out.push({ t: 'assistant', at: null, text: clip(text.trim(), 6000) }); text = ''; };
  for (const e of lines) {
    if (e.type === 'text') { text += e.data ?? ''; continue; }
    flush();
    if (e.type === 'error') out.push({ t: 'error', at: null, text: clip(String(e.message ?? e.data ?? ''), 600) });
    else if (e.type === 'tool_call') {
      const i = e.rawInput ?? {};
      const shell = i.command != null;
      out.push({ t: 'tool', at: null, name: shell ? 'Shell' : e.toolName ?? e.kind ?? 'tool',
        label: shell ? '' : clip(String(i.file_path ?? i.target_file ?? i.path ?? i.directory ?? i.pattern ?? ''), 200), ...(shell ? { detail: clip(bare(i.command), 400) } : {}) });
    }
  }
  flush();
}

const events = [];
runs.forEach((r, i) => {
  if (i) events.push({ t: 'system', at: null, text: `Fix round ${i + 1}` });
  const brief = read(path.join(r.dir, 'brief.md')).trim();
  if (brief) events.push({ t: 'user', at: r.at.toISOString(), text: clip(brief, 4000) });
  const lines = read(path.join(r.dir, 'stream.jsonl')).split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  (registry.engine === 'grok' || lines.some((e) => e.type === 'tool_call' || e.type === 'text') ? grokEvents : codexEvents)(lines, events);
});
const last = runs.at(-1);
const question = read(path.join(last.dir, 'question.md')).trim();
if (question && registry.status === 'blocked') events.push({ t: 'system', at: null, text: clip(question, 2000) });
const streamAt = (() => { try { return fs.statSync(path.join(last.dir, 'stream.jsonl')).mtime; } catch { return last.at; } })();

console.log(JSON.stringify({
  ok: true,
  sessionId: `${registry.engine ?? 'engine'}:${path.basename(last.dir)}`,
  updatedAt: streamAt.toISOString(),
  earlier: events.length > count,
  events: events.slice(-count),
}));
