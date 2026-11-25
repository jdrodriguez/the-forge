// engine-workers.mjs: Codex and Grok as queue accounts. dispatch() in dispatcher.mjs asks this file for the engine
// accounts this machine can run (accounts) and whether a ticket may go to one (skipReason), ranks them with the Claude
// accounts by weekly usage left, and starts the ticket here (startEngine) when an engine wins. Either kind takes one
// slot in the machine's pool (hosts.<name>.maxWorkers). The engine runs through ext-worker.sh, which holds it in its
// lockdown. One spawn is one round: the first builds, pushes and opens the PR, and each later one fixes what keeps the
// PR from green (engine-rounds.mjs). An engine-driven PR never merges through the dispatcher: once green it goes to the
// orchestrator like a risky-path PR (that rule lives in dispatcher.mjs, so it holds even when this file fails to load).
// dispatcher.mjs imports this file only inside a try/catch, and only while the engines are on or a ticket is
// engine-driven, so a throw here costs one log line. Every dispatcher helper comes in through `c` (the context), so
// claims, comments, asks and stuck marks work exactly as they do for Claude workers.
import fs from 'node:fs';
import path from 'node:path';

// Tie order between the engines: Grok first, then Codex.
export const ENGINES = ['grok', 'codex'];
const NAME = { codex: 'Codex', grok: 'Grok' };
export const label = (e) => NAME[e] ?? e;

export const fb = (c) => c.cfg.externalBuilders?.fallback ?? {};
export const maxRounds = (c) => fb(c).maxRounds ?? 5;
// An engine this machine may run: in fallback.engines and, when hosts.<this machine>.engines is set, in that list too
// (an empty list means none). Every place an engine is chosen asks this: the account rows, the next round, a limit
// handoff to the other engine.
export function engineAllowedHere(c, engine) {
  const host = c.cfg.hosts?.[c.HOST]?.engines;
  return (fb(c).engines ?? ENGINES).includes(engine) && (!Array.isArray(host) || host.includes(engine));
}
export const registryDir = (c) => path.join(c.LOCAL, 'engine-workers');
export const containedFile = (c, id) => path.join(c.SHARED, 'engine-contained', `${id}.json`);
// Every ticket an engine ever worked on, in the shared folder: which engines, and the PR it left. It outlives the
// ticket's state entry (a requeue deletes that), so whichever worker or machine takes the ticket next, its green PR
// still goes to the orchestrator, and the PR the engine opened is still found (engine-hooks.mjs reads it).
export const builtFile = (c, id) => path.join(c.SHARED, 'engine-built', `${id}.json`);
export function markBuilt(c, id, patch) {
  if (c.DRY) return;
  let cur = {};
  try {
    cur = JSON.parse(fs.readFileSync(builtFile(c, id), 'utf8'));
  } catch {
    // first engine on this ticket
  }
  const engines = [...new Set([...(cur.engines ?? []), ...(patch.engine ? [patch.engine] : [])])];
  fs.mkdirSync(path.dirname(builtFile(c, id)), { recursive: true });
  fs.writeFileSync(builtFile(c, id), `${JSON.stringify({ ...cur, id, engines, ...(patch.prNumber ? { prNumber: patch.prNumber } : {}), at: c.iso(), host: c.HOST }, null, 2)}\n`);
}
const template = (c) => (fb(c).brief ? path.resolve(c.ROOT, fb(c).brief) : path.join(c.DIR, 'engine-worker-brief.md'));

// --- the registry ext-worker.sh writes, one file per ticket, overwritten by each spawn ---------------------------

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
// A row that says busy while its process is gone (a reboot ends every run without a final status) reads as failed, once
// the file is two minutes old, so the launcher's own last write is never raced. The board reads it the same way.
function effective(file, row) {
  if (row.status !== 'busy' || !row.pid || alive(row.pid)) return row;
  if (Date.now() - fs.statSync(file).mtimeMs < 120_000) return row;
  return { ...row, status: 'failed', report: row.report ?? 'its process ended without writing a final status (the machine may have restarted)' };
}
export function readRow(c, id) {
  const file = path.join(registryDir(c), `${id}.json`);
  try {
    return effective(file, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    return e.code === 'ENOENT' ? null : { unreadable: true };
  }
}

// The registry as rows shaped like `fleet.sh ps` rows, merged into the tick's worker list so workerState, progress and
// stall logic read an engine worker the way they read a Claude one.
export function rows(c) {
  let names = [];
  try {
    names = fs.readdirSync(registryDir(c)).filter((n) => /^[A-Z]+-\d+\.json$/.test(n));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return names.flatMap((n) => {
    const r = readRow(c, n.replace(/\.json$/, ''));
    return r && !r.unreadable ? [{ label: r.engine, id: r.id, name: r.name ?? null, pid: r.pid ?? null, status: r.status, kind: 'background', engine: r.engine, ticket: n.replace(/\.json$/, '') }] : [];
  });
}

// A claim a crashed run left behind: the run it started, if its registry row is newer than the claim.
export function adopt(c, id, t) {
  const r = readRow(c, id);
  if (r?.unreadable) throw new Error(`the registry row for ${id} is unreadable`);
  if (!r?.id || Date.parse(r.startedAt ?? 0) < Date.parse(t.claimedAt) - 5000) return null;
  Object.assign(t, { engine: r.engine, engineStatus: r.status, engineRegistry: path.join(registryDir(c), `${id}.json`), engineWorktree: r.worktree ?? null });
  return { label: r.engine, id: r.id, name: r.name ?? null };
}

// --- the engine accounts -----------------------------------------------------------------------------------------

const availability = new Map(); // one tick per process, so each engine is asked once per tick
// An engine this machine saw hit its plan limit sits out limitCooldownMinutes (60), whatever `available` says, so a
// ticket is never handed straight back to the engine that just stopped on it.
export function available(c, st, engine) {
  const hit = st.engineLimits?.[engine];
  if (hit && c.hoursSince(hit) * 60 < (fb(c).limitCooldownMinutes ?? 60)) return false;
  if (!availability.has(engine)) {
    let ok = false;
    try {
      c.run(c.EXT_WORKER, ['available', engine], { timeout: 60_000 });
      ok = true;
    } catch {
      ok = false;
    }
    availability.set(engine, ok);
  }
  return availability.get(engine);
}

// Each engine's plan usage, read once per tick with the queue board's own reader (queue-board/ext-usage.mjs), so the
// board shows the figures the dispatcher ranks by. It asks each CLI the way its usage screen does, and neither call
// starts a session or runs a model, so a reading spends none of the allowance it reports.
let plans = null;
const warned = new Set();
function readPlans(c) {
  if (plans) return plans;
  plans = {};
  try {
    const out = JSON.parse(c.run(process.execPath, [c.EXT_USAGE], { timeout: 90_000 }));
    for (const s of out.services ?? []) if (ENGINES.includes(String(s.name).toLowerCase())) plans[String(s.name).toLowerCase()] = s;
  } catch (e) {
    plans.error = c.errText(e).slice(0, 200);
  }
  return plans;
}
// A window from ext-usage.mjs ({used, resetsAt}) in the shape fleet.sh gives a Claude account's window.
const windowOf = (w) => (typeof w?.used === 'number' ? { remaining_percentage: Math.max(0, 100 - w.used), resets_at: w.resetsAt ?? null } : null);
// An engine's usage in the shape of a fleet.sh usage row's `usage`. Codex reports a weekly window, and a five-hour one
// on plans that have it; Grok one billing period, which stands in for the weekly window whatever its length, since it
// is the window that runs out. `limited` is Codex's own word that a limit is reached right now.
function usageOf(c, engine, st) {
  const p = readPlans(c);
  const s = p[engine];
  const weekly = windowOf(s?.weekly ?? s?.period);
  if (s && !s.error && weekly) {
    const usage = { available: true, five_hour: windowOf(s.fiveHour), weekly, limited: Boolean(s.limited) };
    return creditBacked(c, engine, usage, s.credits, st) ?? usage;
  }
  const why = s?.error ?? p.error ?? 'its reader gave no figures';
  if (!warned.has(engine)) c.log(`engine usage: could not read ${label(engine)}'s plan usage (${why}), so it ranks after every account with a reading`);
  warned.add(engine);
  return { available: false, five_hour: null, weekly: null, limited: false };
}

// An engine listed in fallback.creditBacked keeps taking tickets after its plan window is spent, since past the plan
// limit it draws the account's paid credits on its own. Such an engine reads as creditBackedPercent (default 50) of its
// week left and not limited whenever its real reading is under the floor or limited, so it stays a candidate. A
// reading with real headroom is left as it is. Off unless the engine is listed.
//
// The credit floor: each credit reading is appended to <stateDir>/engine-credits.jsonl. A credit-backed engine stops
// taking new tickets once its balance, less creditReservePerTicket for every ticket it is still building, would drop
// under creditFloor, so running tickets finish on the credits held back for them. An unreadable balance counts as no
// credits. creditCap is the most tickets the balance covers; pickAccount compares it with the engine's working count,
// which goes up with each ticket started in the same tick, so one tick never over-admits on one reading.
function creditBacked(c, engine, usage, balance, st) {
  if (!(fb(c).creditBacked ?? []).includes(engine)) return null;
  const floor = c.cfg.headroomFloorPercent ?? 10;
  const spent = usage.limited || usage.weekly.remaining_percentage < floor || (usage.five_hour && usage.five_hour.remaining_percentage < floor);
  if (!spent) return null;
  const creditFloor = fb(c).creditFloor ?? 10000;
  const reserve = fb(c).creditReservePerTicket ?? 2000;
  const building = Object.values(st?.tickets ?? {}).filter((t) => t.driver === 'engine' && t.engine === engine && ['claiming', 'building'].includes(t.status)).length;
  const rate = recordCredits(c, engine, balance);
  if (typeof balance !== 'number' || balance - reserve * (building + 1) < creditFloor) {
    if (!warned.has(`${engine}-floor`)) c.log(`engine credits: ${label(engine)} takes no new tickets on credits (balance ${balance ?? 'unknown'}, ${building} building with ${reserve} held back each, floor ${creditFloor}${rate})`);
    warned.add(`${engine}-floor`);
    return null;
  }
  const creditCap = reserve > 0 ? Math.floor((balance - creditFloor) / reserve) : null;
  return { available: true, five_hour: null, weekly: { remaining_percentage: fb(c).creditBackedPercent ?? 50, resets_at: usage.weekly.resets_at },
    limited: false, credits: true, creditCap };
}

// Appends one credit reading per tick and returns the burn rate over the last 24 hours as text for a log line.
function recordCredits(c, engine, balance) {
  if (typeof balance !== 'number' || c.DRY) return '';
  const file = path.join(c.LOCAL, 'engine-credits.jsonl');
  const now = Date.now();
  try {
    fs.appendFileSync(file, `${JSON.stringify({ at: new Date(now).toISOString(), engine, balance })}\n`);
  } catch {
    return '';
  }
  let first = null;
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.engine === engine && now - Date.parse(r.at) <= 24 * 3600_000) {
        first = r;
        break;
      }
    }
  } catch {
    return '';
  }
  if (!first) return '';
  const hours = (now - Date.parse(first.at)) / 3600_000;
  if (hours < 0.5) return '';
  return `; burning about ${Math.round((first.balance - balance) / hours)} credits an hour over the last ${Math.round(hours)}h`;
}

// The engines this machine can run now, as rows shaped like `fleet.sh usage --json` rows, so the dispatcher ranks them
// with the Claude accounts in one pickAccount call. An engine is a candidate when engineAllowedHere passes it,
// `ext-worker.sh available` passes it here, and it has not hit its plan limit on this machine within
// limitCooldownMinutes. `working` counts its running tickets on this machine. The usage figures decide the rest.
export function accounts(c, st) {
  const here = ENGINES.filter((e) => engineAllowedHere(c, e) && available(c, st, e));
  return here.map((e) => ({ label: e, engine: e, signed_in: true, usage: usageOf(c, e, st),
    working: Object.values(st.tickets).filter((t) => t.driver === 'engine' && t.engine === e && ['claiming', 'building'].includes(t.status)).length }));
}

// Personal data in a ticket keeps it for Claude: the ticket text goes to a third-party model. Kinds only, never values.
const PII = [
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['phone', /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d){6,12}\b|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\(\d{3}\)\s?\d{3}[\s.-]?\d{4}\b/],
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/],
];
export function piiKinds(c, text) {
  const extra = (fb(c).withholdPatterns ?? []).map((p) => ['pattern', new RegExp(p, 'i')]);
  return [...new Set([...PII, ...extra].filter(([, rx]) => rx.test(String(text ?? ''))).map(([k]) => k))];
}

// Why a ready ticket is not for an engine worker, or null.
export function skipReason(c, issue) {
  const sizes = fb(c).sizes ?? ['S', 'M'];
  const size = c.sizeOf(issue);
  if (!sizes.includes(size)) return `Size ${size ?? 'unknown'} is not one the engines take (${sizes.join(', ')})`;
  if (c.isSentry(issue)) return 'it is a Sentry fix, which waits for a Claude worker';
  // A ticket that needs access the sandbox withholds (production logs, a database outside localhost, a secrets
  // manager) is labeled claude-only by whoever specs it.
  const only = fb(c).claudeOnlyLabel ?? 'claude-only';
  if ((issue.labels?.nodes ?? []).some((l) => l.name === only)) return `it is labeled ${only}: it needs access an engine sandbox does not have`;
  const kinds = piiKinds(c, `${issue.title ?? ''}\n${issue.description ?? ''}`);
  if (kinds.length) return `its title or description holds personal data (${kinds.join(', ')}), and an engine worker is a third-party model`;
  if (fs.existsSync(containedFile(c, issue.identifier))) return "an engine worker on it tripped ext-worker.sh's containment before";
  return null;
}

// --- briefs and spawns -------------------------------------------------------------------------------------------

const FIELDS = ['ID', 'BRANCH', 'TITLE', 'URL', 'DESCRIPTION', 'ENGINE', 'ROUND_NOTE'];
// The config placeholders first (c.fillConfig, the same values a Claude worker's brief gets), then one pass over the
// ticket fields, so a description or round note that happens to hold "{{ID}}" is never filled in again.
export function writeBrief(c, issue, t, { engine, round, note }) {
  const values = { ID: issue.identifier, BRANCH: t.branch, TITLE: issue.title, URL: issue.url, ENGINE: label(engine),
    DESCRIPTION: issue.description || '(The ticket has no description. Stop as blocked and ask what to build.)', ROUND_NOTE: note ?? '' };
  const text = c.fillConfig(fs.readFileSync(template(c), 'utf8'))
    .replace(new RegExp(`\\{\\{(${FIELDS.join('|')})\\}\\}`, 'g'), (_, k) => values[k]);
  const dir = path.join(c.LOCAL, 'engine-briefs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${issue.identifier}-round-${round}-${engine}-${c.iso().replace(/[:.]/g, '')}.md`);
  fs.writeFileSync(file, text);
  return file;
}
export function spawn(c, engine, id, branch, file, cont) {
  const timeout = fb(c).timeoutSeconds;
  const out = c.run(c.EXT_WORKER, ['start', engine, id, branch, file, ...(cont ? ['--continue'] : []), ...(timeout ? ['--timeout', String(timeout)] : [])], { timeout: 180_000 });
  const r = JSON.parse(out.split('\n').filter(Boolean).at(-1));
  if (!r?.id) throw new Error('ext-worker.sh start printed no worker id');
  return r;
}
const continueNote = (branch) => `An earlier worker already pushed work to \`${branch}\`, possibly on another machine. Continue from it instead of starting over: read its PR and the PR's review threads first if one exists, and never reset or force-push the branch.`;
const branchOnOrigin = (c, branch) => {
  try {
    c.gh(['api', `repos/${c.REPO}/git/ref/heads/${branch}`, '--jq', '.object.sha']);
    return true;
  } catch {
    return false;
  }
};

// Why the engine won the ticket, for the log line and the Linear comment.
const because = (acct) => (acct.usage?.available
  ? `${label(acct.engine)} had the most plan usage left of the accounts with room (${Math.round(acct.usage.weekly.remaining_percentage)}% of its week)`
  : `no account with a usage reading had room, and ${label(acct.engine)}'s usage could not be read`);

// Starts one ticket on the engine account the dispatcher picked (acct, a row from accounts()). The dispatcher has already
// checked its blockers, its slot, that the ticket may go to an engine, and that the ready label is still on it. Returns
// 'started', 'dry', 'failed' (the claim was reconciled) or 'paused'. The dispatcher takes a pool slot for 'started' and
// 'dry', and stops offering this engine for the rest of the tick after 'failed'.
export async function startEngine(c, st, m, issue, acct) {
  const { engine } = acct;
  const id = issue.identifier;
  const branch = c.branchFor(id);
  if (!fs.existsSync(c.EXT_WORKER) || !fs.existsSync(template(c))) {
    c.log(`${id}: ${engine} won it, but ${c.EXT_WORKER} or ${template(c)} is missing, so nothing starts`);
    return 'failed';
  }
  if (c.DRY) {
    c.log(`would start ${engine} on ${id} as an engine worker on ${branch} (${because(acct)})`);
    return 'dry';
  }
  if (c.isPaused()) {
    c.log('paused mid-tick, stopping dispatch');
    return 'paused';
  }
  // The claim is the same as a Claude worker's: journaled first, then the labels and the state. An engine ticket is
  // never bundled.
  const t = { status: 'claiming', claimedAt: c.iso(), branch, priorStateId: issue.state.id, driver: 'engine', engine, round: 1, title: issue.title };
  st.tickets[id] = t;
  c.saveState(st);
  let out;
  try {
    const cont = branchOnOrigin(c, branch);
    const file = writeBrief(c, issue, t, { engine, round: 1, note: cont ? continueNote(branch) : '' });
    await c.addLabel(issue.id, m.label.building);
    await c.removeLabel(issue.id, m.label.ready);
    await c.setState(issue.id, m.inProgress);
    markBuilt(c, id, { engine });
    out = spawn(c, engine, id, branch, file, cont);
  } catch (e) {
    c.log(`${id}: claim or engine start failed, reconciling (${c.errText(e)})`);
    await c.reconcileClaims(st, m);
    // The launcher may have started its supervisor before the call failed (a timeout, say): reconciling then adopted
    // the run from its registry row, and the ticket is building on this engine.
    if (st.tickets[id]?.status === 'building') {
      c.log(`${id}: its ${engine} run had started, so it was adopted and keeps the ticket`);
      return 'started';
    }
    return 'failed';
  }
  Object.assign(t, { status: 'building', dispatchedAt: c.iso(), account: engine, workerId: out.id, workerName: out.name ?? null,
    engineRegistry: out.registry ?? path.join(registryDir(c), `${id}.json`), engineWorktree: out.worktree ?? null, engineStatus: 'busy' });
  st.dispatches.push(c.iso());
  c.saveState(st);
  c.log(`${id}: dispatched to ${engine}/${out.id} as an engine worker, round 1 (${because(acct)})`);
  await c.notify(`${id} started`, `${issue.title} (${label(engine)} builds it; its PR waits for the orchestrator's review before merge)`, { id, progress: true });
  await c.effects(t, id, [[`comment the dispatch on ${id}`, () => c.comment(issue.id, `Agent dispatcher on ${c.HOST}: ${because(acct)}, so a ${label(engine)} engine worker (${engine}/${out.id}) is building this on \`${branch}\` in rounds, at most ${maxRounds(c)}: the first builds it and opens the PR, each later one fixes failing checks, review threads or a conflict. Its PR never merges itself: once green it waits for the orchestrator's review and merge, since no Claude has reviewed the engine's code. Questions go to ${c.HUMAN}'s Slack.`)]]);
  c.saveState(st);
  return 'started';
}

export { advanceTicket, greenState } from './engine-rounds.mjs';
