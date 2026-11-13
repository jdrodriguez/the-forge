// answers.mjs: turns the setup interview's answers file into agent-queue.config.json. This is the only place a config
// is generated, so every case can be tested. docs/setup.md describes the answers file; skills/forge-setup asks for it.
//
// The config starts from agent-queue.config.example.json with its Note keys dropped, so every default the example
// carries (and every key a later change adds there) comes along, and the person's answers replace the rest.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.mjs';

export const REALM_KEYS = ['rivendell', 'shire', 'erebor', 'rohan'];
export const ENGINES = ['codex', 'grok'];
const SYSTEMS = ['macos', 'linux'];
const isNote = (k) => k === '//' || k.endsWith('Note');

export const stripNotes = (v) => {
  if (Array.isArray(v)) return v.map(stripNotes);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !isNote(k)).map(([k, x]) => [k, stripNotes(x)]));
};

export const readExample = (file = path.join(ROOT, 'agent-queue.config.example.json')) => JSON.parse(fs.readFileSync(file, 'utf8'));

const isArgv = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.length > 0);
const lower = (s) => String(s).toLowerCase();

// Checks the answers and fills their defaults. Returns { answers, errors }; errors are sentences that name the field.
export function checkAnswers(raw) {
  const errors = [];
  const err = (s) => errors.push(s);
  const a = structuredClone(raw ?? {});
  if (!a.person?.name || typeof a.person.name !== 'string') err('person.name is missing: the name the queue works for');

  const comps = Array.isArray(a.computers) ? a.computers : [];
  if (comps.length < 1 || comps.length > 4) err(`computers must list 1 to 4 computers (found ${comps.length})`);
  const seen = new Set();
  for (const [i, c] of comps.entries()) {
    const at = `computers[${i}]`;
    if (!c || typeof c.host !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(c.host)) {
      err(`${at}.host must be the computer's short name, as hostname -s prints it`);
      continue;
    }
    if (seen.has(lower(c.host))) err(`${at}.host ${c.host} is listed twice`);
    seen.add(lower(c.host));
    c.system ??= 'macos';
    if (!SYSTEMS.includes(c.system)) err(`${at}.system must be macos or linux`);
    c.codex = Boolean(c.codex);
    c.grok = Boolean(c.grok);
    if (c.maxWorkers != null && !(Number.isInteger(c.maxWorkers) && c.maxWorkers > 0)) err(`${at}.maxWorkers must be a whole number above 0`);
  }
  const boards = comps.filter((c) => c?.board);
  if (comps.length === 1 && comps[0]) comps[0].board = true;
  else if (boards.length !== 1) err(`exactly one computer runs the board (board: true); found ${boards.length}`);
  for (const c of comps) {
    if (c && !c.board && (typeof c.ssh !== 'string' || !c.ssh)) err(`computers: ${c.host} needs ssh, how the board's computer reaches it (user@host or an ~/.ssh/config alias)`);
  }

  const accts = Array.isArray(a.claudeAccounts) ? a.claudeAccounts : [];
  if (!accts.length) err('claudeAccounts must list at least one Claude account');
  const hosts = comps.map((c) => c?.host).filter(Boolean);
  if (accts.length === 1 && accts[0]) {
    // One account is both the main one and the worker, on every computer.
    Object.assign(accts[0], { label: accts[0].label ?? 'a', main: true, worker: true });
    accts[0].computers ??= hosts;
  }
  const labels = new Set();
  for (const [i, ac] of accts.entries()) {
    const at = `claudeAccounts[${i}]`;
    if (!ac || typeof ac.label !== 'string' || !/^[a-z0-9]+$/.test(ac.label)) {
      err(`${at}.label must be lowercase letters or digits`);
      continue;
    }
    if (labels.has(ac.label)) err(`${at}.label ${ac.label} is listed twice`);
    labels.add(ac.label);
    ac.main = Boolean(ac.main);
    ac.worker = ac.worker !== false;
    ac.computers ??= hosts;
    for (const h of ac.computers) if (!hosts.includes(h)) err(`${at}.computers names ${h}, which is not in computers (names match letter case too)`);
    if (ac.main && ac.label !== 'a') err(`${at}: the main account's label is a, since it lives in ~/.claude`);
    if (!ac.main && ac.label === 'a') err(`${at}: label a belongs to the main account (~/.claude)`);
  }
  const board = comps.find((c) => c?.board);
  if (board && accts.length && !accts.some((ac) => (ac?.computers ?? []).includes(board.host))) {
    err(`no Claude account is signed in on ${board.host}, the board's computer, where the red-main responder starts`);
  }
  const mains = accts.filter((x) => x?.main);
  if (accts.length && mains.length !== 1) err(`exactly one Claude account is the main one (main: true); found ${mains.length}`);
  if (accts.length && !accts.some((x) => x?.worker)) err('at least one Claude account must be a worker');
  for (const c of comps) {
    if (!c?.host) continue;
    const builds = accts.some((ac) => ac?.worker && (ac.computers ?? []).includes(c.host)) || c.codex || c.grok;
    if (!builds) err(`computers: ${c.host} has no worker account and no Codex or Grok, so it would build nothing`);
  }

  const r = a.repository ?? {};
  if (typeof r.github !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(r.github)) err('repository.github must be owner/name');
  if (typeof r.githubUser !== 'string' || !r.githubUser) err('repository.githubUser is missing: the GitHub login the queue merges as (gh api user -q .login)');
  r.path ??= `~/dev/${String(r.github ?? '').split('/')[1] ?? 'app'}`;
  // Workers start in the folder above the checkout, which fleet.sh refuses when it is the home folder. A ~/ path means
  // the same folder on every computer.
  if (typeof r.path !== 'string' || !/^~\/[^/]+\/[^/]+/.test(r.path)) err('repository.path must be a folder at least two levels under the home folder, written as ~/..., such as ~/dev/app');
  if (!isArgv(r.check)) err('repository.check is missing: the command, as an argv array, that type-checks or tests the repo before a merge (e.g. ["npm", "run", "type-check"])');
  if (r.install != null && !(Array.isArray(r.install) && (r.install.length === 0 || isArgv(r.install)))) err('repository.install must be an argv array or []');
  if (r.gates != null && !(Array.isArray(r.gates) && r.gates.every(isArgv))) err('repository.gates must be a list of argv arrays');
  a.repository = r;

  const l = a.linear ?? {};
  if (!l.workspace) err('linear.workspace is missing: the slug in https://linear.app/<workspace>/');
  if (typeof l.team !== 'string' || !/^[A-Z][A-Z0-9]*$/.test(l.team)) err('linear.team must be the team key in capitals, the ticket prefix (ABC in ABC-123)');
  if (l.apiKeyCommand != null && !(Array.isArray(l.apiKeyCommand) && (l.apiKeyCommand.length === 0 || isArgv(l.apiKeyCommand)))) err('linear.apiKeyCommand must be an argv array');
  a.linear = l;

  if (a.slack != null && (!a.slack.domain || !/^C[A-Z0-9]+$/.test(a.slack.channel ?? ''))) err('slack needs domain and channel (a channel ID such as C0123456789), or leave slack out');
  const w = a.weather;
  if (w != null && !(Number.isFinite(w.latitude) && Number.isFinite(w.longitude))) err('weather needs latitude and longitude as numbers, or leave weather out');
  if (a.realms != null) {
    for (const [h, k] of Object.entries(a.realms)) {
      if (!REALM_KEYS.includes(k)) err(`realms.${h} must be one of ${REALM_KEYS.join(', ')}`);
      if (!hosts.includes(h)) err(`realms names ${h}, which is not in computers`);
    }
    const used = Object.values(a.realms);
    if (new Set(used).size !== used.length) err('realms gives one realm to two computers');
  }
  if (a.spreadRealms != null && !['auto', true, false].includes(a.spreadRealms)) err('spreadRealms must be "auto", true or false');
  return { answers: a, errors };
}

const defaultWorkers = (n) => Math.max(1, Math.min(4, 2 * n));

// A failing check counts as a real failure only when its output matches premerge.errorPattern; anything else holds the
// merge a tick. The example's pattern is the TypeScript compiler's. Any other check (tests, a linter) counts any output
// as a real failure; a killed or timed-out run is still held, by its signal.
const defaultErrorPattern = (check, ts) => (/\btsc\b|type-?check/i.test(check.join(' ')) ? ts : '\\S');

// Builds the config object from checked answers. copyDir is where the lasting copy lives on every computer (~/ form).
export function buildConfig(a, { example = readExample(), copyDir = '~/the-forge', answersFile = 'the answers file' } = {}) {
  const cfg = stripNotes(example);
  const comps = a.computers;
  const board = comps.find((c) => c.board);
  const others = comps.filter((c) => !c.board);
  const name = a.person.name;
  const repo = a.repository;
  const onHost = (ac, h) => ac.computers.includes(h);
  const workers = a.claudeAccounts.filter((ac) => ac.worker);

  cfg['//'] = `Written by the-forge init from ${answersFile}. Run init again after changing the answers. docs/configuration.md explains every key.`;
  cfg.human = { name };
  cfg.repoPath = repo.path;
  cfg.workspaceCwd = path.posix.dirname(repo.path);
  cfg.github = { ...cfg.github, repo: repo.github, user: repo.githubUser, baseBranch: repo.baseBranch ?? 'main',
    ciWorkflow: repo.ciWorkflow ?? 'CI', reviewCheck: repo.reviewCheck ?? null };
  cfg.linear = { ...cfg.linear, workspace: a.linear.workspace, team: a.linear.team, apiKeyCommand: a.linear.apiKeyCommand ?? [],
    inboxProject: a.linear.inboxProject ?? `${name} Inbox` };
  cfg.slack = a.slack
    ? { ...cfg.slack, domain: a.slack.domain, channel: a.slack.channel, channelName: a.slack.channelName ?? cfg.slack.channelName }
    : { ...cfg.slack, domain: null, channel: null, channelName: null };
  if (a.reviewer) cfg.reviewer = { ...cfg.reviewer, ...a.reviewer };
  else delete cfg.reviewer;
  cfg.fleet = { ...cfg.fleet, primaryAccount: 'a' };

  const hostsCfg = {};
  for (const c of comps) {
    const accounts = workers.filter((ac) => onHost(ac, c.host)).map((ac) => ac.label);
    const engines = ENGINES.filter((e) => c[e]).length;
    hostsCfg[c.host] = { maxWorkers: c.maxWorkers ?? defaultWorkers(accounts.length + engines), accounts };
  }
  const anyEngine = ENGINES.filter((e) => comps.some((c) => c[e]));
  cfg.dispatcher = { ...cfg.dispatcher, enabledHosts: comps.map((c) => c.host), hosts: hostsCfg,
    maxConcurrent: Object.values(hostsCfg).reduce((n, h) => n + h.maxWorkers, 0),
    sentryTriage: { ...cfg.dispatcher.sentryTriage, enabled: false, host: board.host } };
  const fb = cfg.dispatcher.externalBuilders?.fallback ?? {};
  cfg.dispatcher.externalBuilders = { ...cfg.dispatcher.externalBuilders,
    fallback: { ...fb, enabled: anyEngine.length > 0, engines: anyEngine.length ? anyEngine : ENGINES } };

  cfg.push = { ...cfg.push, gates: repo.gates ?? [], env: {} };
  cfg.premerge = { ...cfg.premerge, installCommand: repo.install ?? [], checkCommand: repo.check,
    errorPattern: repo.errorPattern ?? defaultErrorPattern(repo.check, cfg.premerge.errorPattern), copyFiles: repo.copyFiles ?? cfg.premerge.copyFiles,
    buildOutputRoots: repo.buildOutputRoots ?? cfg.premerge.buildOutputRoots, migrations: repo.migrations === undefined ? cfg.premerge.migrations : repo.migrations };
  // The red-main responder starts on the board's computer, so it needs an account signed in there: a worker if one is,
  // else any account there (checkAnswers makes sure one is).
  const onBoard = a.claudeAccounts.filter((ac) => onHost(ac, board.host));
  const boardWorkers = onBoard.filter((ac) => ac.worker);
  cfg.mainWatch = { ...cfg.mainWatch, accounts: (boardWorkers.length ? boardWorkers : onBoard).map((ac) => ac.label) };

  const ssh = Object.fromEntries(comps.filter((c) => c.ssh).map((c) => [c.host, c.ssh]));
  // With other computers the board also listens on its Tailscale address, so they (and a phone on the tailnet) can
  // open it. Only devices on the person's tailnet reach that address.
  const bind = comps.length > 1 ? [...new Set([...(cfg.queueBoard.bind ?? ['127.0.0.1']), 'tailscale'])] : cfg.queueBoard.bind;
  const qb = { ...cfg.queueBoard, host: board.host, ssh, bind, names: Object.fromEntries(comps.filter((c) => c.name).map((c) => [c.host, c.name])),
    remoteRoot: copyDir, repoRoots: [cfg.workspaceCwd], extUsage: anyEngine.length > 0, weather: a.weather ?? null };
  if (a.realms) qb.realms = a.realms;
  else delete qb.realms; // The board gives Rivendell, the Shire, Erebor and Rohan in the order of dispatcher.enabledHosts.
  if (a.spreadRealms != null) qb.spreadRealms = a.spreadRealms;
  cfg.queueBoard = qb;
  cfg.learning = { ...cfg.learning, catalog: [], ssh: Object.fromEntries(others.map((c) => [c.host, c.ssh])) };
  return cfg;
}
