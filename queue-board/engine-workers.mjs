// engine-workers.mjs: the queue's engine workers. A dispatcher that has them runs Codex or Grok on a ticket as a full
// worker with no Claude session behind it (an ext-worker.sh that builds, pushes, opens the PR, then works one round per
// CI or review fix). Its state ticket says driver 'engine', the engine, the round, and the account as the engine's name;
// each such worker also keeps a registry file on its machine, <paths.stateDir>/engine-workers/<ABC-123>.json ({engine, id, name, pid, worktree, branch, startedAt, status,
// exitCode, endedAt, question, report}). collect.mjs reads those files on each machine (readEngineWorkers) and board.mjs
// turns an engine ticket into the board's worker fields (engineWorker). The dispatcher copies the same registry status
// into the ticket as engineStatus once a tick; the file is read first since the worker writes it the moment its state
// changes, and engineStatus stands in when the file cannot be read. A ticket the containment audit stopped (a synced
// marker, <paths.sharedDir>/engine-contained/<ID>.json) shows as failed.
// This repo's dispatcher runs no engine workers: it never writes driver 'engine' or the registry folder, so
// readEngineWorkers gives [] and engineWorker gives null for every ticket, and the board shows Claude workers only. They are builders, drawn as workers on the map;
// Saruman's stone counts only research calls (ext-runs.mjs), never them.
import fs from 'node:fs';
import path from 'node:path';

const ENGINES = ['codex', 'grok'];
// The registry's statuses as the board's worker states, in fleet.sh's words; limit is the engine's plan limit hit.
const STATES = { busy: 'busy', done: 'done', blocked: 'blocked', limit: 'limit', failed: 'failed' };

// This machine's engine workers from their registry files in dir, without their reports (a report can run long, and
// the PR carries the work). A worker's process is looked up here, on its own machine: a row that says busy while its
// process is gone reads as failed once the file is two minutes old, as the dispatcher reads it (so the launcher's own
// last write is never raced).
export function readEngineWorkers(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^[A-Z]+-\d+\.json$/.test(f)); } catch { return []; }
  return files.flatMap((f) => {
    let r;
    let age;
    try {
      r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      age = Date.now() - fs.statSync(path.join(dir, f)).mtimeMs;
    } catch { return []; }
    const dead = r.status === 'busy' && !(Number.isInteger(r.pid) && r.pid > 0 && alive(r.pid)) && age >= 120_000;
    return [{
      ticket: f.slice(0, -5),
      engine: ENGINES.includes(r.engine) ? r.engine : null,
      id: r.id ?? null,
      name: r.name ?? null,
      status: dead ? 'failed' : r.status ?? null,
      branch: r.branch ?? null,
      startedAt: r.startedAt ?? null,
      endedAt: r.endedAt ?? null,
      exitCode: r.exitCode ?? null,
      question: typeof r.question === 'string' ? r.question.slice(0, 400) : null,
    }];
  });
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// The worker fields for ticket t (id, on a machine whose readEngineWorkers gave regs) when the dispatcher runs it on an
// engine; null for a ticket a Claude worker drives. contained: the containment audit stopped it.
export function engineWorker(t, id, regs, contained = false) {
  if (t?.driver !== 'engine') return null;
  const r = (regs ?? []).find((e) => e.ticket === id && (!t.workerId || !e.id || e.id === t.workerId)) ?? null;
  // The dispatcher's engineStatus says missing when it found no registry row, unreadable when it could not parse one.
  const state = contained ? 'failed' : STATES[r?.status] ?? STATES[t.engineStatus] ?? (t.engineStatus === 'missing' ? 'gone' : 'unknown');
  return {
    contained: Boolean(contained),
    engine: ENGINES.includes(t.engine) ? t.engine : r?.engine ?? null,
    round: Number.isInteger(t.round) && t.round > 0 ? t.round : null,
    workerName: t.workerName ?? r?.name ?? null,
    workerState: state,
    blockedSince: t.blockedSince ?? (state === 'blocked' ? r?.endedAt ?? r?.startedAt ?? null : null),
    question: state === 'blocked' ? r?.question ?? null : null,
  };
}
