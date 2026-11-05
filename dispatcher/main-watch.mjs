// main-watch.mjs: keeps main from staying red. Once main sat red for about an hour before anyone noticed, while
// workers kept merging on top of it.
//
// A LaunchAgent (or systemd timer) on one machine runs this every 3 minutes (install.sh --main-watch). It reads the
// base branch's CI runs on GitHub and acts on them:
//   - main turns red: posts to Slack and a macOS notification, writes main-state.json (in paths.sharedDir, so every
//     dispatcher holds feature merges while main is red), and starts an emergency fleet worker in a slot beyond
//     the worker cap, briefed to tell flake from real and fix forward or revert.
//   - main stays red: alerts again every 30 minutes, and starts a second responder if the first one ended.
//   - main turns green: posts the all-clear with how long it was red.
//
// Usage: node main-watch.mjs [--dry-run]   (prints what it would do, posts and dispatches nothing)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ROOT } from '../lib/config.mjs';

const conf = loadConfig();
const W = conf.mainWatch ?? {};
const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = conf.github.repo;
const BASE = conf.github.baseBranch ?? 'main';
const WORKFLOW = conf.github.ciWorkflow ?? 'CI';
const HUMAN = conf.human?.name ?? 'the human';
const ORCH = conf.orchestrator?.sessionName ?? 'Specdesk';
const WORKTREES = path.join(conf.repoPath, conf.worktreesDir ?? '.claude/worktrees');
const STATE = path.join(conf.paths.sharedDir, 'main-state.json');
const LOG = path.join(conf.paths.stateDir, 'main-watch.log');
const SLACK = conf.slack?.webhookFile ?? path.join(conf.paths.stateDir, 'slack-webhook');
const FLEET = path.join(ROOT, 'fleet/fleet.sh');
const DRY = process.argv.includes('--dry-run');
const REALERT_MIN = W.realertMinutes ?? 30;
const MAX_RESPONDERS = W.maxResponders ?? 2;
const ACCOUNTS = W.accounts ?? ['b']; // regular accounts, never a fallback one
const IGNORE_JOBS = new Set(W.ignoreJobs ?? []);

fs.mkdirSync(conf.paths.sharedDir, { recursive: true });
fs.mkdirSync(conf.paths.stateDir, { recursive: true });

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
const gh = (args) => sh('gh', args);
const iso = () => new Date().toISOString();
const minutesSince = (t) => Math.round((Date.now() - Date.parse(t)) / 60_000);
const log = (msg) => {
  const line = `${iso()} ${msg}`;
  console.log(line);
  if (!DRY) fs.appendFileSync(LOG, `${line}\n`);
};
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { status: 'unknown' }; } };
const saveState = (s) => { if (!DRY) fs.writeFileSync(STATE, `${JSON.stringify({ ...s, updatedAt: iso() }, null, 2)}\n`); };

async function slack(text) {
  if (DRY) return log(`would post to Slack: ${text}`);
  if (!fs.existsSync(SLACK)) return log('no Slack webhook, skipped the post');
  try {
    const res = await fetch(fs.readFileSync(SLACK, 'utf8').trim(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    log(`could not post to Slack (${e.message})`);
  }
}

function notifyMac(text) {
  if (DRY || process.platform !== 'darwin') return;
  try {
    sh('osascript', ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title "Main is red" sound name "Basso"', '-e', 'end run', text]);
  } catch { /* a missed banner is not worth failing the run */ }
}

// A rerun puts a finished run back in progress, which would drop a red run out of the list and read main as green
// at the commit before it (a false all-clear, once). Until the rerun finishes, the run keeps the result of
// its previous attempt.
function withRerunsSettled(runs) {
  return runs.map((r) => {
    if (r.status === 'completed' || !(r.attempt > 1)) return r;
    try {
      const prev = gh(['api', `repos/${REPO}/actions/runs/${r.databaseId}/attempts/${r.attempt - 1}`, '-q', '.conclusion']);
      return prev ? { ...r, status: 'completed', conclusion: prev } : r;
    } catch {
      return r;
    }
  });
}

// The current streak: newest completed (not cancelled) CI runs on main, back to the last success.
function readMain() {
  const runs = withRerunsSettled(JSON.parse(gh(['run', 'list', '--repo', REPO, '--branch', BASE, '--event', 'push', '--workflow', WORKFLOW, '--limit', '30',
    '--json', 'databaseId,headSha,status,conclusion,createdAt,displayTitle,url,attempt'])));
  const done = runs.filter((r) => r.status === 'completed' && r.conclusion !== 'cancelled');
  if (!done.length) return { status: 'unknown' };
  if (done[0].conclusion === 'success') return { status: 'green', latest: done[0] };
  const streak = [];
  for (const r of done) {
    if (r.conclusion === 'success') break;
    streak.push(r);
  }
  return { status: 'red', latest: done[0], first: streak[streak.length - 1], streakRuns: streak.length };
}

// The failing jobs and the first telling error line of a failed run.
function diagnose(run) {
  let jobs = [];
  let error = '';
  try {
    jobs = JSON.parse(gh(['run', 'view', String(run.databaseId), '--repo', REPO, '--json', 'jobs'])).jobs
      .filter((j) => j.conclusion === 'failure' && !IGNORE_JOBS.has(j.name)).map((j) => j.name.slice(0, 60));
  } catch { /* keep going without the job list */ }
  try {
    const out = sh('gh', ['run', 'view', String(run.databaseId), '--repo', REPO, '--log-failed'], { timeout: 120_000 });
    // Strip ANSI colors, then take the most telling pattern first: a passing test's stderr carries "Error: " lines
    // that would otherwise beat the real FAIL line.
    const lines = out.split('\n').map((l) => l.replace(/^.*?Z /, '').replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '').trim());
    for (const re of [/error TS\d+|heap out of memory|Size limit/, /^FAIL /, /AssertionError|waitFor: .* not met/, /^Error: /, /ELIFECYCLE/]) {
      const hit = lines.find((l) => re.test(l));
      if (hit) { error = hit.slice(0, 240); break; }
    }
  } catch { /* logs may not be ready yet */ }
  return { jobs, error };
}

function workerAlive(w) {
  if (!w) return false;
  try {
    const all = JSON.parse(sh(FLEET, ['ps', '--json', '--all'], { timeout: 60_000 }));
    const found = all.find((x) => x.label === w.label && x.id === w.id);
    return Boolean(found) && ['busy', 'working', 'idle', 'blocked'].includes(found.status || found.state);
  } catch {
    return true; // unknown counts as alive, so a flaky ps never double-dispatches
  }
}

function pickAccount() {
  const usage = JSON.parse(sh(FLEET, ['usage', '--json'], { timeout: 180_000 }));
  const ok = usage.filter((a) => ACCOUNTS.includes(a.label) && a.signed_in && a.usage?.available !== false)
    .sort((x, y) => (y.usage?.weekly?.remaining_percentage ?? 0) - (x.usage?.weekly?.remaining_percentage ?? 0));
  return ok[0]?.label ?? null;
}

function brief(main, diag) {
  const sha = main.first.headSha.slice(0, 10);
  return `${BASE} is red, and nothing matters more until it is green again. You are the emergency responder: ${HUMAN} has said ${BASE} must never stay red for long.

What is known:
- First red commit on ${BASE}: ${sha}, "${main.first.displayTitle}". Its CI run: ${main.first.url}
- Newest red run: ${main.latest.url} (${main.streakRuns} red run(s) in a row)
- Failing jobs: ${diag.jobs.join(', ') || 'see the run'}
- First error line: ${diag.error || 'read the run log'}
While main is red, every dispatcher holds feature merges, so the queue is stalled until you finish.

What to do, in order, quickly:
1. Decide flake or real. Read the failing jobs. If the failure is one flaky test, a timeout or e2e flake in a test the breaking range doesn't touch, rerun the failed jobs once with \`gh run rerun <run-id> --failed --repo ${REPO}\` and watch. If it passes, that's the outcome: report the flaky test to ${ORCH} so it gets a ticket, and stop.
2. If it's real, find the cause: the first red commit and the PR it came from (\`gh pr list --search <sha> --state merged\`). Often it's two PRs that were each green but clash once merged.
3. Fix it with the smallest change that makes ${BASE} green. Usually that's fix-forward. Revert the offending PR only when a fix isn't clear within about 20 minutes, and never delete a merged migration, since migrations are immutable. Work in a worktree under \`${WORKTREES}/\` on branch \`main-red-${sha}\`. Open the PR titled with the breaking PR's ticket id, and add the label \`${conf.github.fixesMainLabel ?? 'fixes-main'}\` (create it if missing). Push with \`node ${path.join(DIR, 'gated-push.mjs')}\`.
4. Before merging, check whether someone else already fixed ${BASE}: if it is green, close your PR and stop. Otherwise run \`node ${path.join(DIR, 'premerge-check.mjs')} <pr>\`. Once CI is green and the check passes, merge it yourself (\`gh pr merge <pr> --squash --delete-branch --match-head-commit <sha>\`), unless it touches migrations, auth, .github or other reviewed paths. In that case, message the orchestrator and let it merge.
5. Message the orchestrator, the session named "${ORCH}" on this machine, at each step: diagnosis, PR opened, merged. It merges anything you can't.
6. Stop when ${BASE}'s CI is green. Remove your worktree.

Rules: kill processes by PID only, never with pkill or killall. No \`bash -c\` with inline scripts. Keep tokens and .env contents out of anything you write. Never promote or deploy to production.`;
}

async function dispatchResponder(main, diag, state) {
  if (DRY) return log(`would dispatch a responder for ${main.first.headSha.slice(0, 10)}`);
  const label = pickAccount();
  if (!label) {
    log('no account available for a responder');
    return null;
  }
  const out = JSON.parse(sh(FLEET, ['dispatch', label, '--cwd', conf.workspaceCwd, '--model', W.model ?? 'opus',
    '--name', `main-red-${main.first.headSha.slice(0, 8)}-${(state.responders?.length ?? 0) + 1}`, '--max-workers', String(W.maxWorkers ?? 12), '--no-report', '--',
    brief(main, diag)], { timeout: 180_000 }));
  log(`dispatched responder ${out.label}/${out.id}`);
  return { label: out.label, id: out.id, name: out.name, at: iso() };
}

export async function tick(given) {
const state = loadState();
let main = given;
if (!main) {
  try {
    main = readMain();
  } catch (e) {
    log(`could not read main's CI (${e.message})`);
    return;
  }
}
if (DRY) log(`main is ${main.status}${main.first ? ` since ${main.first.headSha.slice(0, 10)}` : ''}`);

if (main.status === 'green') {
  if (state.status === 'red') {
    const mins = minutesSince(state.redSince);
    log(`main is green again at ${main.latest.headSha.slice(0, 10)} after ${mins} min red`);
    await slack(`:large_green_circle: *main is green again* at \`${main.latest.headSha.slice(0, 10)}\` after ${mins} min red. Feature merges resume.`);
  }
  saveState({ status: 'green', greenSha: main.latest.headSha, lastRedSha: state.redSha ?? state.lastRedSha ?? null });
} else if (main.status === 'red') {
  const sha = main.first.headSha;
  const fresh = state.status !== 'red' || state.redSha !== sha;
  if (fresh) {
    const diag = diagnose(main.latest);
    const next = { status: 'red', redSha: sha, redTitle: main.first.displayTitle, redSince: main.first.createdAt, latestRun: main.latest.url,
      failing: diag.jobs, error: diag.error, lastAlertAt: iso(), responders: [] };
    const r = await dispatchResponder(main, diag, next);
    if (r) next.responders.push(r);
    saveState(next);
    const who = r ? `Emergency responder ${r.label}/${r.id} is on it.` : 'No responder could start; needs a hand.';
    log(`main turned red at ${sha.slice(0, 10)} (${main.first.displayTitle}); failing ${diag.jobs.join(', ')}`);
    notifyMac(`${main.first.displayTitle.slice(0, 80)}: ${diag.jobs.join(', ')}`);
    await slack(`:red_circle: *main is red* since \`${sha.slice(0, 10)}\` (${main.first.displayTitle.slice(0, 100)}). Failing: ${diag.jobs.join(', ') || 'see run'}. ${diag.error ? `First error: \`${diag.error.slice(0, 160)}\`. ` : ''}${who} Feature merges are held until it is green. <${main.latest.url}|run>`);
  } else {
    const mins = minutesSince(state.redSince);
    const last = state.responders?.[state.responders.length - 1];
    if (!workerAlive(last) && (state.responders?.length ?? 0) < MAX_RESPONDERS) {
      const r = await dispatchResponder(main, diagnose(main.latest), state);
      if (r) {
        state.responders = [...(state.responders ?? []), r];
        await slack(`:red_circle: main still red after ${mins} min and the last responder ended; started responder ${r.label}/${r.id}.`);
      }
    }
    if (minutesSince(state.lastAlertAt) >= REALERT_MIN) {
      state.lastAlertAt = iso();
      notifyMac(`Still red after ${mins} min`);
      await slack(`:rotating_light: *main still red* after ${mins} min (since \`${sha.slice(0, 10)}\`). Responders: ${(state.responders ?? []).map((x) => `${x.label}/${x.id}`).join(', ') || 'none'}.`);
    }
    saveState(state);
  }
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await tick();
