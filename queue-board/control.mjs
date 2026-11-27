// control.mjs: the server half of the Fleet view's levers. GET /api/control answers what the levers are set to;
// POST /api/control takes one named operation (or a short batch) from control-ops.mjs, checks every field, applies it
// to the config's dispatcher section through control-config.mjs's guarded write, adds a dated line to the matching
// *Note field and a line to the change log. The page never sends config. board.mjs checks the Host header first (and
// QUEUE_BOARD_DRY refuses every POST there); this module wants the X-Board header and a JSON body.
//
// Three operations are not config: pausing or resuming a machine's dispatcher (`dispatcher.mjs pause|resume` run on
// that machine, control-runner.mjs), pushing a ticket through its machine's wake queue (the same shared file
// `dispatcher.mjs wake` writes), and the timers below.
//
// Timers: a change may carry an end time. The board checks every 30 seconds and puts the old value back once it is
// due, and catches up on start on any end time it missed while it was down. It puts it back only while the value is
// still what the change set: a value changed since some other way is left as it is and the log says so. Only the board
// runs timers, so one process writes the file. A burn's end time also goes into burnUntil, so the dispatcher stops
// that burn at the instant even if the board is down then.
import fs from 'node:fs';
import path from 'node:path';
import { readConfig, writeConfig, restoreConfig, appendNote, stamp, show, cleanWhy, cleanUntil, cleanBool, refuse, Refusal } from './control-config.mjs';
import { OPS } from './control-ops.mjs';
import { appendLog, appendLogs, restoreOf, readLog, newId, pendingTimers, latestChanges } from './control-log.mjs';
import { controlState, waitingTickets } from './control-state.mjs';

const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
// How a pause from the board starts its reason in the machine's PAUSED file (after the time).
const BOARD_PAUSE = 'from the board';

// configFile: the config the levers write. sharedDir: paths.sharedDir (heartbeats, wake-requests). logFile: the change
// log. by: who the notes and the log name ("Alex via the board"). team: the Linear team key a ticket ID starts with.
export function createControl({ configFile, sharedDir, logFile = path.join(sharedDir, 'control-log.jsonl'), here, by = 'the board', team = null,
  snapshot = () => null, onWrite = () => {}, runDispatcher, now = () => Date.now() }) {
  const dir = sharedDir;
  const BY = by;
  const TICKET = team ? new RegExp(`^${team.replace(/[^A-Za-z0-9]/g, '')}-\\d+$`) : /^[A-Z][A-Z0-9]*-\d+$/;
  const machine = (h) => snapshot()?.machines?.find((m) => m.host === h) ?? null;
  const ctx = () => ({
    now: now(),
    labelsOn: (h) => machine(h)?.accounts?.map((a) => a.label) ?? null,
    spareOn: (h) => machine(h)?.spareLabels ?? null,
    paused: (h) => (machine(h)?.ok ? Boolean(machine(h).paused) : null),
  });
  const run = runDispatcher;
  const iso = () => new Date(now()).toISOString();

  // One change at a time, so two clicks never read the same config and the second overwrite the first.
  let chain = Promise.resolve();
  const serial = (fn) => {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  };

  // "; was 5" for a number set (the house style); a switch or a value that was unset says nothing more.
  const noteLine = (at, said, why, from, until, revertTo) => {
    const was = from === null || typeof from === 'boolean' ? '' : `; was ${show(from)}`;
    const back = until ? `${was ? ',' : ';'} back to ${show(revertTo)} at ${stamp(until)} unless changed before` : '';
    return `${stamp(at)}, ${BY}: ${said}${why ? ` (${why})` : ''}${was}${back}.`;
  };

  // Applies config operations in one guarded write. Each gets its own log line; a running timer on the same value
  // passes to the new change (so "for the window" still ends where it was going to), unless the change sets its own
  // end time or goes back to the value the timer would restore.
  function applyOps(list, { until, why, undoOf = null }) {
    const before = readConfig(configFile);
    const cfg = before.cfg;
    const c = ctx();
    const log = readLog(logFile);
    const timers = new Map(pendingTimers(log).map((t) => [t.target, t]));
    const done = [];
    for (const b of list) {
      const def = Object.hasOwn(OPS, b?.op) ? OPS[b.op] : null;
      if (!def) refuse(`unknown operation ${show(b?.op)}`);
      const a = def.args(b, cfg, c);
      const v = def.value(b, cfg, a);
      const target = def.target(a);
      const from = def.read(cfg, a, c);
      if (b.expect !== undefined && !same(b.expect, from)) refuse(`it is ${show(from)} now, not ${show(b.expect)}; the page shows it again`, 409, { current: from });
      if (same(from, v)) {
        if (list.length === 1) refuse(`it is ${show(v)} already`, 409, { current: from });
        continue;
      }
      def.guard?.(cfg, a, v);
      const pending = timers.get(target);
      const revertTo = pending ? restoreOf(pending) : from;
      const ends = same(v, revertTo) ? null : (until ?? pending?.until ?? null);
      c.until = ends;
      const detail = def.write(cfg, a, v, c);
      const said = def.says(a, from, v, detail, cfg);
      const at = iso();
      appendNote(cfg, def.note(a), noteLine(at, said, why, from, ends, revertTo));
      const entry = { id: newId(now()), at, kind: 'change', by: BY, op: b.op, args: a, target, from, to: v, says: said, ...(why ? { why } : {}),
        ...(ends ? { until: ends, revertTo } : {}), ...(undoOf ? { undoOf } : {}) };
      done.push({ entry, pending });
      timers.delete(target);
      if (ends) timers.set(target, entry);
    }
    if (!done.length) refuse('nothing to change: every value is set that way already', 409);
    const { standard } = writeConfig(configFile, before);
    const lines = done.flatMap(({ entry, pending }) => [
      ...(pending ? [{ id: newId(now()), at: entry.at, kind: 'superseded', ref: pending.id, target: entry.target, next: entry.id }] : []),
      standard ? entry : { ...entry, reformatted: true }]);
    try {
      appendLogs(logFile, lines);
    } catch (e) {
      // The log holds the end times, so a change it could not record is taken back out of the config.
      restoreConfig(configFile, before);
      throw e;
    }
    onWrite(cfg);
    return done.map((d) => d.entry);
  }

  // Puts a timed change's old value back: its end time came, or End now was pressed.
  async function endTimer(t, reason) {
    const def = OPS[t.op] ?? null;
    const at = iso();
    const skip = (why) => appendLog(logFile, { id: newId(now()), at, kind: 'skipped', ref: t.id, target: t.target, op: t.op, args: t.args, reason: why });
    if (t.op === 'pause') {
      if (ctx().paused(t.args.host) === false) return skip('the machine was already running again');
      const m = machine(t.args.host);
      if (m?.ok && !String(m.paused ?? '').replace(/^\S+Z /, '').startsWith(BOARD_PAUSE)) return skip('it was paused again some other way since, so it stays paused');
      await run(t.args.host, ['resume']);
      return appendLog(logFile, { id: newId(now()), at, kind: 'revert', ref: t.id, target: t.target, op: t.op, args: t.args, from: true, to: false, reason });
    }
    const before = readConfig(configFile);
    const cfg = before.cfg;
    const c = { ...ctx(), until: null };
    const current = def.read(cfg, t.args, c);
    if (!same(current, t.to)) return skip(`it was ${show(current)} by then, not ${show(t.to)}, so nothing was put back`);
    try {
      def.guard?.(cfg, t.args, t.revertTo);
    } catch (e) {
      if (e instanceof Refusal) return skip(e.message);
      throw e;
    }
    const detail = def.write(cfg, t.args, t.revertTo, c);
    const said = def.says(t.args, t.to, t.revertTo, detail, cfg);
    appendNote(cfg, def.note(t.args), `${stamp(at)}, the board: ${said}, ${reason} (set at ~${t.at.slice(11, 16)}Z to last until ${stamp(t.until)}).`);
    writeConfig(configFile, before);
    appendLog(logFile, { id: newId(now()), at, kind: 'revert', ref: t.id, target: t.target, op: t.op, args: t.args, from: t.to, to: t.revertTo, says: said, reason });
    onWrite(cfg);
  }

  // Every end time that is due, oldest first. One the board missed while it was down says so.
  async function dueTimers() {
    for (const t of pendingTimers(readLog(logFile)).filter((x) => Date.parse(x.until) <= now())) {
      const late = now() - Date.parse(t.until) > 90_000;
      try {
        await endTimer(t, late ? 'caught up: its end time passed while the board was not running' : 'its end time came');
      } catch (e) {
        console.error(`${iso()} control: could not end ${t.target} (${t.id}), trying again in 30 seconds: ${String(e.message).slice(0, 200)}`);
      }
    }
  }

  // Pausing a machine's dispatcher (its PAUSED file: no dispatches and no merges there) through its own CLI.
  async function pauseOp(b, until, why) {
    const cfg = readConfig(configFile).cfg;
    if (typeof b.host !== 'string' || !cfg.enabledHosts.includes(b.host)) refuse(`unknown machine ${show(b.host)}`);
    const v = cleanBool(b.value);
    const target = `pause:${b.host}`;
    const from = ctx().paused(b.host);
    if (from === v) refuse(`${b.host} is ${v ? 'paused' : 'running'} already`, 409, { current: from });
    const pending = pendingTimers(readLog(logFile)).find((t) => t.target === target);
    const ends = v ? (until ?? pending?.until ?? null) : null;
    const reason = `${BOARD_PAUSE}${why ? `: ${why.replace(/[^\w .,:;()/+-]/g, '')}` : ''}${ends ? `, until ${stamp(ends)}` : ''}`;
    const out = await run(b.host, v ? ['pause', reason] : ['resume']);
    const at = iso();
    const entry = { id: newId(now()), at, kind: 'change', by: BY, op: 'pause', args: { host: b.host }, target, from: from ?? !v, to: v,
      says: v ? `${b.host} dispatcher paused: no dispatches and no merges there until it resumes` : `${b.host} dispatcher resumed`, ...(why ? { why } : {}),
      ...(ends ? { until: ends, revertTo: false } : {}) };
    try {
      appendLogs(logFile, [...(pending ? [{ id: newId(now()), at, kind: 'superseded', ref: pending.id, target }] : []), entry]);
    } catch (e) {
      // A pause the log does not know about would never end by itself, so it is taken back.
      if (v) await run(b.host, ['resume']).catch(() => {});
      throw e;
    }
    onWrite(null);
    return [{ ...entry, output: String(out ?? '').trim().slice(-300) }];
  }

  // `dispatcher.mjs wake <ID>`'s shared request: the machine holding the ticket lets its next wake through over the
  // limit, once. Only a ticket some machine lists as waiting for a slot can be pushed from here.
  function wakeOp(b) {
    if (typeof b.ticket !== 'string' || !TICKET.test(b.ticket)) refuse(`ticket must look like ${team ?? 'ABC'}-123`);
    const w = waitingTickets(dir, snapshot(), TICKET).find((x) => x.id === b.ticket);
    if (!w) refuse(`${b.ticket} is not waiting for a slot on any machine`, 409);
    const reqDir = path.join(dir, 'wake-requests');
    fs.mkdirSync(reqDir, { recursive: true });
    const at = iso();
    fs.writeFileSync(path.join(reqDir, `${b.ticket}.json`), `${JSON.stringify({ id: b.ticket, at, from: here, by: 'the board' })}\n`);
    return [appendLog(logFile, { id: newId(now()), at, kind: 'wake', by: BY, target: `wake:${b.ticket}`, ticket: b.ticket, host: w.host,
      says: `${b.ticket} pushed through on ${w.host}: its next tick wakes it over the limit, once` })];
  }

  // Undo (back to the value before that change), End now, Keep (drop the end time) and a new end time, each only for
  // the newest change on its value.
  async function timerOp(b) {
    const log = readLog(logFile);
    const e = log.find((x) => x.kind === 'change' && x.id === b.id);
    if (!e) refuse('no such change');
    if (latestChanges(log).get(e.target)?.id !== e.id) refuse('a later change has set this value since', 409);
    const timer = pendingTimers(log).find((t) => t.target === e.target);
    if (b.op === 'undo') {
      if (e.op === 'pause') return pauseOp({ host: e.args.host, value: e.from }, null, 'undo');
      return applyOps([{ op: e.op, ...e.args, value: e.from, expect: e.to }], { until: null, why: 'undo', undoOf: e.id });
    }
    if (!timer && b.op !== 'until') refuse('this change has no end time', 409);
    if (b.op === 'end') return endTimer(timer, 'ended early from the board').then(() => []);
    const until = b.op === 'until' ? cleanUntil(b.until, now()) : null;
    if (b.op === 'until' && !until) refuse('until is required');
    if (b.op === 'until' && e.op === 'pause' && !e.to) refuse('only a pause can end by itself');
    const def = OPS[e.op];
    if (def?.onUntil) {
      const before = readConfig(configFile);
      if (!same(def.read(before.cfg, e.args, ctx()), e.to)) refuse('the value has changed since', 409);
      def.onUntil(before.cfg, e.args, until);
      appendNote(before.cfg, def.note(e.args), `${stamp(iso())}, ${BY}: ${until ? `the end time of "${e.says}" set to ${stamp(until)}` : `"${e.says}" kept, with no end time`}.`);
      writeConfig(configFile, before);
      onWrite(before.cfg);
    }
    const kind = b.op === 'keep' ? 'keep' : 'until';
    return [appendLog(logFile, { id: newId(now()), at: iso(), kind, ref: e.id, target: e.target, by: BY,
      ...(until ? { until, revertTo: timer ? restoreOf(timer) : e.from } : {}) })];
  }

  async function perform(body) {
    const why = cleanWhy(body.why);
    const until = cleanUntil(body.until, now());
    if (Array.isArray(body.batch)) {
      if (!body.batch.length || body.batch.length > 6) refuse('a batch holds 1 to 6 operations');
      return applyOps(body.batch, { until, why });
    }
    if (['undo', 'end', 'keep', 'until'].includes(body.op)) return timerOp(body);
    if (body.op === 'pause') return pauseOp(body, until, why);
    if (body.op === 'wake') return wakeOp(body);
    return applyOps([body], { until, why });
  }

  const state = () => controlState({ cfg: readConfig(configFile).cfg, dir, log: readLog(logFile), snap: snapshot(), ctx: ctx(), here, ticket: TICKET });

  async function handle(req, res, send) {
    const json = (code, v) => send(res, code, 'application/json', JSON.stringify(v));
    if (req.method === 'GET') return json(200, state());
    if (req.method !== 'POST') return send(res, 405, 'text/plain', 'GET or POST');
    if (req.headers['x-board'] !== 'control' || !/^application\/json/.test(req.headers['content-type'] ?? '')) return send(res, 403, 'text/plain', 'missing header');
    let text = '';
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 8000) return send(res, 413, 'text/plain', 'too long');
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { ok: false, error: 'bad JSON' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { ok: false, error: 'the body must be one JSON object' });
    try {
      const entries = await serial(() => perform(body));
      return json(200, { ok: true, entries, state: state() });
    } catch (e) {
      if (e instanceof Refusal) return json(e.status, { ok: false, error: e.message, ...(e.current !== undefined ? { current: e.current } : {}) });
      if (e.code === 'CHANGED') return json(409, { ok: false, error: e.message });
      console.error(`${iso()} control: ${String(e.stack ?? e).slice(0, 600)}`);
      return json(500, { ok: false, error: String(e.message ?? e).slice(0, 300) });
    }
  }

  let timer = null;
  const start = (everyMs = 30_000) => {
    serial(dueTimers);
    timer = setInterval(() => serial(dueTimers), everyMs);
    timer.unref?.();
  };
  const stop = () => clearInterval(timer);
  return { handle, state, start, stop, perform: (body) => serial(() => perform(body)), dueTimers: () => serial(dueTimers), logFile };
}
