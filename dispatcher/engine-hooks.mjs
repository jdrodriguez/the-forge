// engine-hooks.mjs: the dispatcher's side of the engine workers, kept out of dispatcher.mjs. makeEngineHooks(helpers)
// takes the dispatcher's own helpers (one function returning them, read on first use) and gives back what the tick needs:
//   on() / wanted(st)             the engines are on (externalBuilders.fallback.enabled) / a tick needs the module
//   call(what, fallback, fn)      runs fn(module, ctx) with engine-workers.mjs loaded lazily; a throw is one log line
//   toOrchestrator(st, id, t, pr) a green engine PR goes to the orchestrator, never to the dispatcher's merge
//   mergedAlone(st, id, t, pr)    an engine PR that merged without the orchestrator: ALERT, stop the run, ask the human
//   leave(t)                      a ticket a Claude worker takes over drops its engine fields; engineHistory keeps them
//   guard(id, t)                  the brief note that keeps a Claude worker out of the engine's clone
// The two merge rules live here and in dispatcher.mjs, not in engine-workers.mjs, so they hold even when that file
// fails to load.
import path from 'node:path';

export const engineDriven = (t) => t?.driver === 'engine';
export const engineBuilt = (t) => Boolean(t?.engineHistory?.length);

export function makeEngineHooks(getHelpers) {
  let h = null;
  const d = () => (h ??= getHelpers());
  let mod = null;
  const on = () => Boolean(d().cfg.externalBuilders?.fallback?.enabled);
  const wanted = (st) => on() || Object.values(st.tickets).some(engineDriven);

  async function call(what, fallback, fn) {
    try {
      mod ??= await import(d().engineModule ?? './engine-workers.mjs');
      return await fn(mod, d().ctx());
    } catch (e) {
      d().log(`engine workers: ${what} failed, the tick goes on (${d().errText(e)})`);
      return fallback;
    }
  }

  async function toOrchestrator(st, id, t, pr, built = null) {
    const x = d();
    const review = built ?? `built and driven by ${t.engine}, no Claude review yet`;
    t.note = `green, waiting on the orchestrator's review and merge (${review})`;
    if (t.status === 'merge-asked' && t.riskySha === pr.headRefOid) return;
    let risky;
    try {
      risky = x.riskyPaths(pr);
    } catch (e) {
      risky = [`(the changed files could not be listed: ${x.errText(e).slice(0, 80)})`];
    }
    Object.assign(t, { status: 'merge-asked', mergeAskedAt: t.mergeAskedAt ?? x.iso(), riskySha: pr.headRefOid });
    x.saveState(st);
    x.log(`${id}: green, ${review}, sent to the orchestrator to review and merge`);
    const extra = engineDriven(t) ? { driver: 'engine', engine: t.engine, review } : { review };
    await x.effects(t, id, [[`request the orchestrator's merge of ${id}`, () => x.requestMerge(id, pr, risky, extra)]]);
    x.saveState(st);
  }

  // An engine PR merges only through the orchestrator, after merge-asked. One that shows MERGED while the dispatcher
  // never sent it there was merged by someone else, most likely the engine itself past ext-worker.sh's lockdown.
  async function mergedAlone(st, id, t, pr) {
    const x = d();
    t.mergedWithoutReview = x.iso();
    x.saveState(st);
    x.log(`${id}: ALERT: PR ${pr.url} was merged while ${t.engine} drove it and the dispatcher never sent it to the orchestrator, so ${t.engine} most likely merged it itself`);
    await x.notify(`${id} merged without review`, `${t.engine} most likely merged ${pr.url} itself, past its lockdown`, { id, link: pr.url, progress: true });
    await x.effects(t, id, [
      [`stop ${id}'s ${t.engine} run`, () => x.run(x.EXT_WORKER, ['stop', id], { timeout: 60_000 })],
      [`ask ${x.HUMAN} about ${id}'s unreviewed merge`, () => x.askHuman(id, 'blocked',
        `${id}'s PR ${pr.url} was merged while ${t.engine} drove it, and the dispatcher never sent it to the orchestrator, so ${t.engine} most likely merged it itself, past ext-worker.sh's lockdown (or someone merged it by hand). No Claude reviewed that code.`,
        `Review the merged diff now and revert it if it is wrong; read the run's files (${x.attachCmd(t)}) and fix the lockdown before the engines take more queue work`,
        'it stays merged and moves to Verifying; nothing is reverted')],
    ]);
    x.saveState(st);
  }

  function leave(t) {
    (t.engineHistory ??= []).push({ engine: t.engine, rounds: t.round ?? 1, until: d().iso() });
    for (const k of ['driver', 'engine', 'round', 'engineStatus', 'engineAsk', 'engineRetries', 'engineRegistry', 'engineWorktree',
      'roundReason', 'roundStartedAt', 'lastRoundNote', 'rerunAsk', 'roundStarting', 'startFailures', 'engineContained', 'blockedSince']) delete t[k];
  }

  const guard = (id, t) => `The previous worker on ${id} was ${t.engine}, an engine worker, and its checkout at ${t.engineWorktree ?? path.join(d().WORKTREES, path.basename(t.branch))} holds engine-written code, git hooks and dependencies. Never run anything in it (git, a package manager, node, a push) and never copy from it: cut your own worktree, under a different name, from origin/${t.branch}, and treat everything on that branch as unreviewed code.\n\n`;

  return { on, wanted, call, toOrchestrator, mergedAlone, leave, guard };
}
