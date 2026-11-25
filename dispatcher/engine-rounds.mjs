// engine-rounds.mjs: what happens to an engine ticket after its round ends. dispatcher.mjs calls advanceTicket for an
// engine ticket whose PR is not green, and greenState for one whose PR is. A round that ended `done` with something a
// push can fix starts the next round with a note built from GitHub; a question goes to the human's inbox and the next
// round carries the answer; a plan limit hands the round to the other engine or puts the ticket back in the queue; a
// containment report stops the ticket for good. Loaded through engine-workers.mjs, inside the dispatcher's try/catch.
import fs from 'node:fs';
import path from 'node:path';
import { askRerun, roundWork } from './engine-round-note.mjs';
import { ENGINES, available, containedFile, engineAllowedHere, label, markBuilt, maxRounds, piiKinds, readRow, spawn, writeBrief } from './engine-workers.mjs';

const other = (e) => ENGINES.find((x) => x !== e);
const NOTE_LIMIT = 40_000;

function noteFor(c, id, t, pr, { round, lead, parts }) {
  const head = `Round ${round} of at most ${maxRounds(c)} on ${id} (\`${t.branch}\`${pr ? `, PR ${pr.url} at ${String(pr.headRefOid).slice(0, 10)}` : ''}). ${lead} Fix everything listed below, push to the same branch (never reset or force-push it), resolve each review thread you addressed, and exit.`;
  const text = [head, ...parts].join('\n\n');
  return text.length > NOTE_LIMIT ? `${text.slice(0, NOTE_LIMIT)}\n\n[cut: a round note is limited to ${NOTE_LIMIT} characters; read the rest on the PR]` : text;
}

function applyRound(c, id, t, out, { round, engine, summary, text }) {
  // A PR that went red while it waited on the orchestrator comes back to its engine; the merge request goes.
  if (t.status === 'merge-asked') {
    if (!c.DRY) c.clearMergeRequest(id);
    t.status = 'building';
    delete t.mergeAskedAt;
    delete t.riskySha;
  }
  Object.assign(t, { account: engine, engine, workerId: out.id, workerName: out.name ?? t.workerName, engineRegistry: out.registry ?? t.engineRegistry,
    engineWorktree: out.worktree ?? t.engineWorktree, engineStatus: 'busy', round, roundReason: summary, roundStartedAt: c.iso(), goneTicks: 0,
    lastProgressAt: c.iso(), lastOutputAt: c.iso(), lastRoundNote: String(text ?? '').slice(0, 20_000) });
  for (const k of ['roundStarting', 'stalledSince', 'startFailures']) delete t[k];
}

// Starts the next round on the ticket's engine, or on the other one when its own cannot run here. With neither, the
// ticket goes back to the queue. A limit handoff keeps the round number; every other spawn counts toward maxRounds, and
// a round due past it makes the ticket stuck (a `redispatch` by hand then gives it to a Claude worker).
async function startRound(c, st, m, id, t, { note, summary, keepRound = false, exclude = [], retry = false, pr = null }) {
  const round = keepRound ? (t.round ?? 1) : (t.round ?? 1) + 1;
  // A paused queue starts no worker, a round included, and changes no labels: the ticket waits as a green PR does.
  // While new work is held no round starts; a round already running finishes.
  if (c.newWorkHeld?.()) {
    t.note = `its next round is due (${summary}), held while new work is held`;
    c.log(`${id}: a round is due (${summary}), held while new work is held`);
    return 'held';
  }
  if (c.isPaused()) {
    t.note = `its next round is due (${summary}), held while the queue is paused`;
    c.log(`${id}: a round is due (${summary}), held while the queue is paused`);
    return 'held';
  }
  if (!keepRound && (t.round ?? 1) >= maxRounds(c)) {
    await c.markStuck(st, m, id, t, `${maxRounds(c)} engine rounds ran and it still needs another (${summary}); \`dispatcher.mjs redispatch ${id}\` hands it to a Claude worker`);
    return 'stuck';
  }
  const text = noteFor(c, id, t, pr, { round, lead: note.lead, parts: note.parts });
  // A round runs only while the engines are switched on, on an engine allowed here (engineAllowedHere), the same rule
  // a new ticket meets.
  const fb = c.cfg.externalBuilders?.fallback ?? {};
  const on = (e) => Boolean(fb.enabled) && engineAllowedHere(c, e);
  const engine = [t.engine, other(t.engine)].find((e) => e && on(e) && !exclude.includes(e) && available(c, st, e));
  if (!engine) {
    const why = `no engine can run its next round on ${c.HOST} (${!fb.enabled ? 'the engines are off' : exclude.length ? `${exclude.join(', ')} hit its limit` : 'ext-worker.sh available passed none'})`;
    return requeue(c, st, m, id, t, why);
  }
  const { issue } = await c.gql('query($id:String!){ issue(id:$id){ id identifier title url description } }', { id });
  if (piiKinds(c, `${issue.title ?? ''}\n${issue.description ?? ''}`).length) {
    await c.markStuck(st, m, id, t, 'its title or description now holds personal data, which must not go to a third-party model');
    return 'stuck';
  }
  // A round is a new session on this machine. On a full machine the ticket waits in the dispatcher's wake queue and
  // holds no slot until one is free; a ticket waiting on the orchestrator holds none to begin with.
  if (!c.mayWake(st, id, t, summary)) return 'held';
  c.noteStart?.(id, false);
  if (c.DRY) return c.log(`${id}: would start ${engine} round ${round} (${summary})`);
  const file = writeBrief(c, issue, t, { engine, round, note: text });
  // Journaled first: a run that ends mid-start adopts the spawn on the next tick instead of starting a second one.
  t.roundStarting = { at: c.iso(), round, engine, summary };
  c.saveState(st);
  markBuilt(c, id, { engine });
  let out;
  try {
    out = spawn(c, engine, id, t.branch, file, true);
  } catch (e) {
    t.startFailures = (t.startFailures ?? 0) + 1;
    c.log(`${id}: could not start ${engine} round ${round} (${c.errText(e)})`);
    c.saveState(st);
    if (t.startFailures >= 3) {
      delete t.roundStarting;
      await c.markStuck(st, m, id, t, `ext-worker.sh failed to start its next round 3 times (${c.errText(e).slice(0, 200)})`);
    }
    return 'failed';
  }
  applyRound(c, id, t, out, { round, engine, summary, text });
  c.noteStart?.(id, true);
  if (retry) t.engineRetries = (t.engineRetries ?? 0) + 1;
  c.saveState(st);
  c.log(`${id}: started ${engine} round ${round} as ${out.id}: ${summary}`);
  await c.effects(t, id, [[`comment round ${round} on ${id}`, () => c.comment(issue.id, `Agent dispatcher on ${c.HOST}: round ${round} for ${label(engine)} (${engine}/${out.id}): ${summary}.`)]]);
  c.saveState(st);
  return 'engine';
}

// The engine's clone is engine-written throughout: code, hooks, git config, dependencies. Nothing in it may run with the
// dispatcher's rights, so the dispatcher never adds or commits there, and its push turns every hook off. Only what the
// engine committed goes to origin. False when there is no clone to push from.
function pushEngineWork(c, t) {
  let real;
  try {
    real = fs.realpathSync(t.engineWorktree ?? path.join(c.WORKTREES, path.basename(t.branch)));
  } catch {
    return false;
  }
  const root = `${fs.realpathSync(c.WORKTREES)}${path.sep}`;
  if (!real.startsWith(root)) throw new Error(`its engine checkout ${real} is outside ${root}, so nothing is pushed from it`);
  c.run('git', ['-C', real, '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', 'push', '--no-verify', 'origin',
    `refs/heads/${t.branch}:refs/heads/${t.branch}`], { timeout: 180_000 });
  return true;
}

// Back to the queue: the engine's committed work pushed, the ready label on before the building one comes off, the
// branch kept, and this machine lets go of it. A refused push keeps the ticket here for the next tick.
async function requeue(c, st, m, id, t, why) {
  if (c.DRY) return c.log(`${id}: would put it back in the queue: ${why}`);
  try {
    const pushed = pushEngineWork(c, t);
    // The state entry goes; the shared record keeps that an engine built this branch, and the PR it opened.
    markBuilt(c, id, { engine: t.engine, prNumber: t.prNumber });
    const iid = await c.issueId(id);
    await c.addLabel(iid, m.label.ready);
    await c.removeLabel(iid, m.label.building);
    delete st.tickets[id];
    c.saveState(st);
    c.log(`${id}: ${why}, so it went back to the queue${pushed ? `; its work is pushed to ${t.branch}` : ''}`);
    await c.effects({}, id, [[`comment the requeue on ${id}`, () => c.comment(iid, `Agent dispatcher on ${c.HOST}: ${why}, so this ticket went back to the queue. The work the engine committed is on \`${t.branch}\`${t.pr ? ` (${t.pr})` : ''}, and the next worker continues from it; anything it left uncommitted stays in its checkout on ${c.HOST}.`)]]);
    await c.notify(`${id} back in the queue`, why, { id });
    return 'requeued';
  } catch (e) {
    t.note = `a round is due but it could not go back to the queue (${c.errText(e).slice(0, 120)})`;
    c.log(`${id}: could not put it back in the queue, trying next tick (${c.errText(e)})`);
    c.saveState(st);
    return 'failed';
  }
}

// The engine's question, relayed once per spawn; once the human answers, the next round starts with the answer.
async function blocked(c, st, m, id, t, row, pr) {
  const q = String(row.question ?? '').trim() || '(the engine stopped as blocked without saying what it needs)';
  const who = `${label(t.engine)} engine worker`;
  if (t.engineAsk?.worker !== row.id || (!t.engineAsk.sent && (t.engineAsk.tries ?? 0) < 3)) {
    const same = t.engineAsk?.worker === row.id;
    t.engineAsk = { worker: row.id, question: q.slice(0, 4000), at: same ? t.engineAsk.at : c.iso(), tries: (same ? t.engineAsk.tries ?? 0 : 0) + 1 };
    t.blockedSince ??= c.iso();
    t.note = `the ${who} stopped with a question for ${c.HUMAN}; the ticket waits for the answer`;
    c.saveState(st);
    c.log(`${id}: ${t.engine} stopped with a question, relayed to ${c.HUMAN}'s inbox`);
    const errors = t.effectErrors?.length ?? 0;
    await c.effects(t, id, [[`relay ${id}'s question to ${c.HUMAN}`, () => c.run(c.ASK, ['ask', id, '--type', 'blocked', '--from', `the ${who} on ${c.HOST}`,
      '--ask', `The ${who} building ${id} stopped with a question: ${q.slice(0, 3000)}`,
      '--recommend', `Answer in the thread. The answer goes to ${label(t.engine)}, a third-party model, so leave client data out of it`,
      '--default', 'the ticket waits'])]]);
    if (!c.DRY && (t.effectErrors?.length ?? 0) === errors) t.engineAsk.sent = c.iso();
    c.saveState(st);
    return true;
  }
  if (t.waiting) {
    t.note = `waiting on ${c.HUMAN}'s answer to the ${who}'s question`;
    return true;
  }
  let out;
  try {
    out = c.run(c.ASK, ['check', id], { timeout: 60_000 });
  } catch (e) {
    c.log(`${id}: could not read ${c.HUMAN}'s answer, trying next tick (${c.errText(e)})`);
    return true;
  }
  if (!/^ANSWERED/.test(out)) {
    t.note = `waiting on ${c.HUMAN}'s answer to the ${who}'s question`;
    return true;
  }
  const answer = out.replace(/^ANSWERED(?: \(label removed, no comment\))?\n?/, '').trim();
  delete t.blockedSince;
  await startRound(c, st, m, id, t, { pr, summary: `continue with ${c.HUMAN}'s answer to its question`, note: { lead: `Your last round stopped on a question, and ${c.HUMAN} has answered it.`,
    parts: [`## Your question\n\n${t.engineAsk.question}`, `## The answer\n\n${answer || '(The question was cleared without a written answer: use your best judgment, and say what you chose and why in the PR body.)'}`] } });
  return true;
}

async function failed(c, st, m, id, t, row, pr, report) {
  if (/^containment:/i.test(report)) {
    // The launcher's audit caught the engine doing something it must not: no round ever runs on this ticket again, on
    // any machine (the marker is in the shared folder), and the human gets the report and where the run's files are.
    t.engineContained = report.slice(0, 2000);
    c.saveState(st);
    c.log(`${id}: ALERT: ${t.engine}'s run tripped ext-worker.sh's containment: ${report.slice(0, 300)}`);
    const files = [row?.logDir && `run logs and audit ${row.logDir}`, (row?.worktree ?? t.engineWorktree) && `worktree ${row?.worktree ?? t.engineWorktree}`,
      t.engineRegistry && `registry ${t.engineRegistry}`, `briefs ${path.join(c.LOCAL, 'engine-briefs')}`].filter(Boolean).join(', ');
    if (!c.DRY) {
      fs.mkdirSync(path.dirname(containedFile(c, id)), { recursive: true });
      fs.writeFileSync(containedFile(c, id), `${JSON.stringify({ id, engine: t.engine, worker: t.workerId, report: report.slice(0, 4000), files, host: c.HOST, at: c.iso() }, null, 2)}\n`);
    }
    await c.markStuck(st, m, id, t, `its ${label(t.engine)} run tripped ext-worker.sh's containment (${report.slice(0, 300)})`, {
      ask: `The ${label(t.engine)} engine worker on ${id} tripped ext-worker.sh's containment: ${report.slice(0, 1500)}. No more engine rounds run on it. The run's files on ${c.HOST}: ${files}.`,
      recommend: "Read the run's files and the audit before anything else and decide whether the lockdown needs a fix; then hand the ticket to a Claude worker or rescope it, never back to an engine",
      fallback: `it stays ${c.L.stuck}, no engine touches it again, and the dispatcher leaves it alone`,
    });
    return true;
  }
  if ((t.engineRetries ?? 0) < 1) {
    await startRound(c, st, m, id, t, { pr, retry: true, summary: `retry after its run failed (${report.slice(0, 160)})`, note: { lead: 'Your last round failed before it finished.',
      parts: [`## How the last round ended\n\n${report.slice(0, 4000)}`, ...(t.lastRoundNote ? [`## What that round was doing\n\n${t.lastRoundNote.slice(0, 12_000)}`] : [])] } });
    return true;
  }
  await c.markStuck(st, m, id, t, `its ${label(t.engine)} run failed again after a retry (${report.slice(0, 300)})`);
  return true;
}

// A round a crashed run started: adopt it, or forget the journal so the round is decided afresh. Both the red and the
// green path run this first, so a green PR never goes to the orchestrator past a round nobody has read.
function reconcileStart(c, st, id, t, row) {
  if (!t.roundStarting) return;
  if (row?.id && row.id !== t.workerId && Date.parse(row.startedAt ?? 0) >= Date.parse(t.roundStarting.at) - 5000) {
    applyRound(c, id, t, row, t.roundStarting);
    c.log(`${id}: adopted ${row.engine} round ${t.round} (${row.id}), which an earlier run started`);
    c.saveState(st);
  } else delete t.roundStarting;
}

// Called for an engine ticket whose PR is not green, or a green one whose migration clashes with the base branch
// (renumber is the note for that). Returns true when it handled the ticket this tick, false to let the existing stall
// rules judge it.
export async function advanceTicket(c, st, m, id, t, { pr, renumber = null }) {
  const row = readRow(c, id);
  if (row?.unreadable) {
    t.note = `its engine registry row is unreadable; ${t.note ?? ''}`;
    c.log(`${id}: its engine registry row is unreadable, trying next tick`);
    return true;
  }
  reconcileStart(c, st, id, t, row);
  const mine = row?.id === t.workerId ? row : null;
  const status = mine?.status ?? 'missing';
  t.engineStatus = status;
  if (status === 'busy') {
    // A busy engine worker is never stalled: ext-worker.sh's time box ends it.
    delete t.stalledSince;
    t.note = `${label(t.engine)} round ${t.round ?? 1} running; ${t.note ?? ''}`;
    return true;
  }
  if (status === 'blocked') return blocked(c, st, m, id, t, mine, pr);
  if (status === 'limit') {
    (st.engineLimits ??= {})[t.engine] = c.iso();
    c.saveState(st);
    c.log(`${id}: ${t.engine} hit its plan or rate limit`);
    await startRound(c, st, m, id, t, { pr, keepRound: true, exclude: [t.engine], summary: `${t.engine} hit its plan limit, so the round continues`,
      note: { lead: `${label(t.engine)} stopped mid-round on its plan or rate limit before the work was finished. Continue its work from the worktree and branch instead of starting over.`,
        parts: t.lastRoundNote ? [`## What the stopped round was doing\n\n${t.lastRoundNote.slice(0, 12_000)}`] : [] } });
    return true;
  }
  if (status === 'failed' || status === 'missing') return failed(c, st, m, id, t, mine, pr, String(mine?.report ?? 'its run left no registry row').trim());
  if (status !== 'done') {
    c.log(`${id}: its engine registry says ${status}, which the dispatcher does not know; leaving it`);
    return true;
  }
  const work = roundWork(c, id, t, pr, { renumber });
  if (!work) return false;
  if (work.rerun) return askRerun(c, st, id, t, pr);
  await startRound(c, st, m, id, t, { pr, summary: work.why.join('; '), note: { lead: `Your last round ended and the PR is not ready to merge yet.`, parts: work.parts } });
  return true;
}

// A green engine PR: 'ready' sends it to the orchestrator; 'hold' keeps it while its run is busy or asked a question,
// and a containment report makes it stuck instead.
export async function greenState(c, st, m, id, t, pr) {
  const row = readRow(c, id);
  if (!row?.unreadable) reconcileStart(c, st, id, t, row);
  const mine = row && !row.unreadable && row.id === t.workerId ? row : null;
  t.engineStatus = mine?.status ?? (row?.unreadable ? 'unreadable' : 'missing');
  if (row?.unreadable || mine?.status === 'busy') {
    t.note = `green, waiting for its ${label(t.engine)} round to end before the orchestrator's review`;
    return 'hold';
  }
  if (mine?.status === 'blocked') {
    await blocked(c, st, m, id, t, mine, pr);
    return 'hold';
  }
  if (mine?.status === 'failed' && /^containment:/i.test(String(mine.report ?? '').trim())) {
    await failed(c, st, m, id, t, mine, pr, String(mine.report).trim());
    return 'hold';
  }
  return 'ready';
}
