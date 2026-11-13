// fixtures.mjs: board snapshots with invented data, for the page smoke test (page.test.mjs) and the realm tests. Each
// builder takes the time "now" and returns a whole snapshot in the shape board.mjs serves, with every time relative to
// now, so the same fixture reads the same whenever it runs: workers busy, one fighting a failing check, one waiting on
// the owner, one green, one asleep, a Sentry rider, a wanderer, and a merge a few minutes old for the fireworks.
import { REALM_KINDS } from '../realms.mjs';
import { realmsByHost, assignRealms } from '../realm-spread.mjs';
import { giveNames } from '../worker-names.mjs';

const POOLS = {
  rivendell: ['Elrond', 'Galadriel', 'Legolas', 'Arwen', 'Haldir', 'Glorfindel', 'Celeborn', 'Lindir'],
  shire: ['Frodo', 'Sam', 'Merry', 'Pippin', 'Bilbo', 'Rosie', 'Fatty', 'Lobelia'],
  erebor: ['Gimli', 'Thorin', 'Balin', 'Dwalin', 'Fili', 'Kili', 'Bombur', 'Gloin'],
  rohan: ['Theoden', 'Eowyn', 'Theodred', 'Hama', 'Gamling', 'Erkenbrand', 'Elfhelm', 'Grimbold'],
};
const MOODS = [
  {},
  { pr: { ci: { fail: ['unit tests'], running: [], pass: 12, overall: 'FAILURE' } } },
  { blockedSince: -12 },
  { status: 'merge-asked', pr: { ci: { fail: [], running: [], pass: 30, overall: 'SUCCESS' }, review: 'pass' } },
  { workerState: 'idle' },
  { pr: { ci: { fail: [], running: ['build'], pass: 4, overall: 'PENDING' } } },
  {},
  { workerState: 'idle', stalledSince: -200 },
];

const iso = (now, minutes) => new Date(now + minutes * 60_000).toISOString();

function machine(now, host, name, maxWorkers, sentryWorkers) {
  return {
    host, name, root: '~/dev/the-forge', ok: true, error: null, fetchedAt: iso(now, -0.5), enabled: true, paused: null,
    lastTick: iso(now, -6), lastError: null, stuckStreak: 0, maxWorkers, sentryWorkers, engineAccounts: [],
    heartbeat: { at: iso(now, -2), paused: false, sentryRoom: sentryWorkers > 0 ? true : null },
    dispatchedToday: 3, maxDispatchesPerDay: null, load: [1.2, 1.4, 1.5], memFreePercent: 42, minMemFreePercent: 10,
    ramMb: 32768, swapUsedMb: 0, topMemory: [],
    accounts: [{ label: 'a', key: 'a', email: `worker-a@${host}.example.test`, plan: 'Max', signedIn: true, usageAt: iso(now, -3),
      fiveHour: { used: 20, resetsAt: iso(now, 120) }, weekly: { used: 35, resetsAt: iso(now, 4000) }, otherSessions: 0 }],
    signedOut: [], watched: [], log: [], collectErrors: [],
  };
}

function prOf(id, n, extra) {
  return { number: n, url: `https://github.example.test/forge/app/pull/${n}`, title: `${id}: work`, state: 'OPEN', draft: false, mergeState: 'CLEAN',
    updatedAt: null, lastCommitAt: null, ci: { overall: 'PENDING', pass: 0, fail: [], running: [] }, review: null, mergeQueue: null, openThreads: 0, ...extra };
}

let serial = 100;
function ticket(now, m, { realm, nickname, mood = {}, sentry = false, adhoc = false, status = 'building', workerState = 'busy', mergedAt = null }) {
  serial += 1;
  const id = `ABC-${serial}`;
  const { pr, blockedSince, stalledSince, ...rest } = mood;
  const live = ['building', 'merge-asked', 'claiming', 'adhoc'].includes(rest.status ?? status);
  return {
    id, ticket: id, label: id, bundle: [], host: m.host, machine: m.name, live, status, sentry, adhoc, parked: null, nickname,
    engine: null, driver: null, contained: false, round: null, workerName: null, question: null, account: 'a',
    accountEmail: null, accountPlan: 'Max', workerId: `w${serial}`, workerState: live ? workerState : null, attach: null,
    branch: `abc-${serial}`, prNumber: pr ? serial : null, prUrl: pr ? `https://github.example.test/forge/app/pull/${serial}` : null,
    note: null, reason: null, waiting: false, claimedAt: iso(now, -95), dispatchedAt: iso(now, -90 + serial % 50), lastProgressAt: iso(now, -4),
    lastOutputAt: iso(now, -1), stalledSince: stalledSince != null ? iso(now, stalledSince) : null,
    blockedSince: blockedSince != null ? iso(now, blockedSince) : null, mergedAt, stuckAt: null, closedAt: null, effectErrors: 0,
    pr: pr ? prOf(id, serial, pr) : null, title: `Invented ticket ${serial}`, url: `https://tracker.example.test/${id}`, linearState: 'In Progress',
    realm: realm ?? null, ...rest,
  };
}

function base(now, machines, realms, tickets) {
  return {
    generatedAt: iso(now, 0), servedBy: machines[0].host, weather: null, seer: { at: now, codex: [], grok: [] },
    config: { maxConcurrent: machines.reduce((s, m) => s + m.maxWorkers, 0), maxDispatchesPerDay: null, stallHours: 3, spinHours: 6, headroomFloorPercent: 10,
      tickMinutes: 20, sentryHeartbeatMinutes: 45, sentryCascade: machines.filter((m) => m.sentryWorkers).map((m) => m.host), human: 'Alex',
      orchestrator: 'Desk', reviewer: 'Sam', repo: 'app', boardHost: machines[0].host, realms, place: null, repoDir: '~/dev/the-forge',
      addAccountScript: '/opt/the-forge/fleet/setup/add-account.sh', workspaceFolder: 'work', spread: false,
      labels: { ready: 'agent-ready', building: 'agent-building', stuck: 'agent-stuck', sentry: 'sentry-triaged', needsHuman: 'needs-human' } },
    machines, services: [], tickets, ready: [], asks: [], labeledBuilding: tickets.filter((t) => t.live && !t.adhoc).map((t) => t.id), labeledStuck: [],
    inbox: { unreadTotal: 0, since: null, inboxUrl: 'https://tracker.example.test/inbox', forYou: [], comments: { total: 0, issues: 0, rows: [] }, updates: { total: 0, issues: 0, rows: [] }, tried: true, at: iso(now, -1) },
    worktrees: { repo: 'app', everyMinutes: 5, prErrors: {}, machines: machines.map((m) => ({ host: m.host, name: m.name, rows: [], at: iso(now, -2), error: null })) },
    sessions: { everyMinutes: 1, handled: {}, machines: machines.map((m) => ({ host: m.host, name: m.name, at: iso(now, -1), error: null, older: 0, days: 14, rows: [] })) },
    main: { status: 'green', since: null, sha: 'abc1234', title: null, failing: [], error: null, run: null, updatedAt: iso(now, -2) },
    errors: {}, refreshing: false,
  };
}

// The workers of one machine: n live ones in its realm's names, each in the next mood, plus a merge 5 minutes old.
function crew(now, m, key, n, { keyed = true } = {}) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(ticket(now, m, { realm: keyed ? key : null, nickname: POOLS[key][i % POOLS[key].length], mood: MOODS[i % MOODS.length] }));
  out.push(ticket(now, m, { realm: keyed ? key : null, nickname: POOLS[key][n % POOLS[key].length], status: 'merged', mergedAt: iso(now, -5) }));
  return out;
}

const KEYS = ['rivendell', 'shire', 'erebor', 'rohan'];
const HOSTS = [['forge-one', 'one', 4, 1], ['forge-two', 'two', 3, 0], ['forge-three', 'three', 3, 0], ['forge-four', 'four', 4, 0]];

// count machines, each with its realm (keyed realms, as the board sends after the fourth realm landed, unless legacy),
// its workers, a Sentry rider on the first and a wanderer on the road.
function machines(now, count, { legacy = false } = {}) {
  serial = 100;
  const ms = HOSTS.slice(0, count).map(([h, name, w, s]) => machine(now, h, name, w, s));
  const realms = Object.fromEntries(ms.map((m, i) => {
    const { key, ...rest } = REALM_KINDS[KEYS[i]];
    return [m.host, legacy ? rest : { key, ...rest }];
  }));
  const tickets = ms.flatMap((m, i) => crew(now, m, KEYS[i], m.maxWorkers, { keyed: !legacy }));
  tickets.push(ticket(now, ms[0], { nickname: 'Aragorn', sentry: true, realm: legacy ? null : KEYS[0] }));
  tickets.push(ticket(now, ms[0], { nickname: 'Gandalf', adhoc: true, status: 'adhoc', realm: legacy ? null : KEYS[0] }));
  return base(now, ms, realms, tickets);
}

export const fourMachines = (now = Date.now()) => machines(now, 4);
// Three machines as a board before the fourth realm sends them: realm entries without a key, tickets without a realm.
export const threeMachines = (now = Date.now()) => machines(now, 3, { legacy: true });

// One machine as the board sends it: its realm table, whether its realms spread, and each worker's realm and name given
// the way board.mjs gives them (realm-spread.mjs, worker-names.mjs), so the views draw what the board would send. It has
// one forgotten worktree, so Gollum keeps a heap in its first realm.
const NICKS = { ...POOLS, sentry: ['Aragorn'], adhoc: ['Gandalf'] };
function solo(now, tickets, { spread = true, mem = { seats: {}, names: { given: {}, lastGiven: {} } }, max = 8 } = {}) {
  const host = 'forge-solo';
  const m = machine(now, host, 'solo', max, 1);
  const byHost = realmsByHost([host], null, spread);
  const shown = tickets.map((t) => ({ ...t, nickname: t.sentry ? 'Aragorn' : null }));
  mem.seats = assignRealms(shown, byHost, mem.seats, now);
  giveNames(shown, NICKS, mem.names, { spread, nowIso: iso(now, 0) });
  const snap = base(now, [m], { [host]: { ...REALM_KINDS.rivendell } }, shown);
  snap.config.spread = spread;
  snap.config.spreadRealms = spread ? { [host]: byHost[host].map((k) => ({ ...REALM_KINDS[k] })) } : null;
  snap.worktrees.machines[0].rows = [{ path: '~/dev/the-forge-wt/abc-1', branch: 'abc-1', workers: [], procs: [], lastCommitAt: iso(now, -6 * 24 * 60), pr: null, state: 'local' }];
  return snap;
}
const soloMachine = () => machine(0, 'forge-solo', 'solo', 8, 1);

// One machine with n live workers, a merge 5 minutes old and a Sentry rider; spread says whether its realms spread.
export function oneMachine(now = Date.now(), n = 8, { spread = true } = {}) {
  serial = 100;
  const m = soloMachine();
  const tickets = [];
  for (let i = 0; i < n; i += 1) tickets.push(ticket(now, m, { mood: MOODS[i % MOODS.length] }));
  tickets.push(ticket(now, m, { status: 'merged', mergedAt: iso(now, -5) }));
  tickets.push(ticket(now, m, { sentry: true }));
  return solo(now, tickets, { spread, max: n });
}

// rounds snapshots of one spread machine, a minute apart: each round the oldest worker but the first merges and a new
// one starts, as the board would see them. The first worker (watched) works through all of them.
export function oneMachineRounds(now = Date.now(), rounds = 10, n = 8) {
  serial = 100;
  const m = soloMachine();
  const mem = { seats: {}, names: { given: {}, lastGiven: {} } };
  const start = now - rounds * 60_000;
  let live = Array.from({ length: n }, (_, i) => ticket(start, m, { mood: MOODS[i % MOODS.length] }));
  const watched = live[0].id;
  const merged = [];
  const out = [];
  for (let k = 0; k < rounds; k += 1) {
    const at = start + k * 60_000;
    if (k) {
      const done = live.splice(1, 1)[0];
      merged.push({ ...done, live: false, status: 'merged', workerState: null, mergedAt: iso(at, 0) });
      live.push({ ...ticket(at, m, {}), dispatchedAt: iso(at, 0) });
    }
    out.push(solo(at, [...live, ...merged], { mem }));
  }
  return { snaps: out, watched };
}
