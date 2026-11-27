// control-log.mjs: the Fleet view's change log, control-log.jsonl in paths.sharedDir unless queueBoard.controlLog
// names another file. Only the board writes it. One JSON line per event, newest last, and never an email or a secret:
// accounts appear by their letter.
//
// Kinds: "change" (a value set from the page; with `until` it reverts by itself), "revert" (a timed change put back,
// by its end time or "End now"), "keep" (its timer dropped, the value kept), "superseded" (a later change on the
// same value took its timer over), "skipped" (an end time reached after the value had changed some other way, so
// nothing was put back), "until" (an end time added to a change afterwards), "wake" (a ticket pushed through over
// its machine's limit) and "refused" is never logged: a refused request changes nothing.
//
// The pending timers are not kept anywhere else: they are what the log says, so nothing can drift out of step.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const newId = (now = Date.now()) => `c${now.toString(36)}${randomBytes(3).toString('hex')}`;

export function appendLog(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return entry;
}
// Several entries in one write, so a failed write leaves none of them.
export function appendLogs(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, entries.map((e) => `${JSON.stringify(e)}\n`).join(''));
}

// The value a timer puts back. A change from an unset value stores revertTo null, which `??` would skip.
export const restoreOf = (t) => (Object.hasOwn(t, 'revertTo') ? t.revertTo : t.from);

// The last `max` entries, oldest first. A line a sync tool has only half written, or any other bad line, is skipped.
export function readLog(file, max = 4000) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').filter(Boolean).slice(-max).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

const ENDS = new Set(['revert', 'keep', 'superseded', 'skipped']);
// The timers still running, one per target at most: the newest change on a target that set (or took over) an end time
// and that nothing has ended since. An "until" entry adds or moves the end time of the change it names.
export function pendingTimers(entries) {
  const byId = new Map();
  const timers = new Map();
  for (const e of entries) {
    if (e.kind === 'change') {
      byId.set(e.id, e);
      // A change without an end time leaves a running timer alone: control.mjs either hands the timer to the new change
      // (which then carries `until`) or ends it with a "superseded" line.
      if (e.until) timers.set(e.target, e);
    } else if (ENDS.has(e.kind)) {
      const t = timers.get(e.target);
      if (t && t.id === e.ref) timers.delete(e.target);
    } else if (e.kind === 'until') {
      const c = byId.get(e.ref);
      if (c) timers.set(c.target, { ...c, until: e.until, revertTo: Object.hasOwn(e, 'revertTo') ? e.revertTo : restoreOf(c) });
    }
  }
  return [...timers.values()].sort((a, b) => Date.parse(a.until) - Date.parse(b.until));
}

// The newest change on each target, so "Undo" and "Ends..." act only on the change that set the value shown now.
export function latestChanges(entries) {
  const out = new Map();
  for (const e of entries) if (e.kind === 'change') out.set(e.target, e);
  return out;
}
