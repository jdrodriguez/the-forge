// jobs.mjs: the scheduled jobs on this computer. The dispatcher runs on every queue computer; the red-main watcher, the
// board and the herald run on the board's computer. On macOS they are launchd jobs written by the repo's own install
// scripts; on Linux, systemd user units (dispatcher/install.sh writes the timers, and this file writes the board's
// service, which queue-board/install.sh leaves to you there). The herald posts macOS notifications, so it is macOS only.
import fs from 'node:fs';
import path from 'node:path';
import { configPath, loadConfig, ROOT } from '../config.mjs';
import { home, isTemporary, run, runLive, sameHost, say, thisHost, warn } from './sh.mjs';

const uid = () => String(process.getuid?.() ?? '');
const isLinux = () => run('uname', []).stdout.trim() === 'Linux';
const agents = () => path.join(home(), 'Library/LaunchAgents');
const units = () => path.join(home(), '.config/systemd/user');

// Every job this computer runs, from the config.
export function jobsHere(cfg = loadConfig({ fresh: true })) {
  const host = thisHost();
  const D = cfg.dispatcher ?? {};
  const linux = isLinux();
  const isBoard = sameHost(cfg.queueBoard?.host ?? host, host);
  const job = (name, label, unit, install, remove) => ({ name, label, unit, install, remove,
    file: linux ? path.join(units(), unit) : path.join(agents(), `${label}.plist`) });
  const d = (s) => path.join(ROOT, s);
  // Every job The Forge can put on a computer of this kind. jobs is the ones this computer runs now; all lets install
  // and uninstall find one left from an earlier config (the board moved to another computer, say).
  const all = [job('dispatcher', 'dev.agent-queue.dispatcher', 'agent-queue-dispatcher.timer', [d('dispatcher/install.sh')], [d('dispatcher/install.sh'), '--remove']),
    job('main-watch', 'dev.agent-queue.main-watch', 'agent-queue-main-watch.timer',
      [d('dispatcher/install.sh'), '--main-watch'], [d('dispatcher/install.sh'), '--main-watch', '--remove']),
    linux
      ? job('board', 'dev.agent-queue.queue-board', 'agent-queue-board.service', null, null)
      : job('board', 'dev.agent-queue.queue-board', null, [d('queue-board/install.sh')], [d('queue-board/install.sh'), '--remove']),
    ...(linux ? [] : [job('herald', 'dev.agent-queue.queue-herald', null, [d('queue-board/install-herald.sh')], [d('queue-board/install-herald.sh'), '--remove'])])];
  const runs = (j) => (j.name === 'dispatcher' ? (D.enabledHosts ?? []).some((h) => sameHost(h, host)) : isBoard);
  return { host, linux, isBoard, jobs: all.filter(runs), all, cfg };
}

function boardUnit(cfg) {
  const node = process.execPath;
  const log = path.join(cfg.paths.stateDir, 'queue-board.log');
  return `[Unit]
Description=The Forge board (queue-board/board.mjs). Written by the-forge install; remove with the-forge uninstall.

[Service]
WorkingDirectory=${home()}
Environment=HOME=${home()}
Environment=AGENT_QUEUE_CONFIG=${configPath()}
Environment=PATH=${path.dirname(node)}:${home()}/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=${node} ${path.join(ROOT, 'queue-board/board.mjs')}
Restart=always
RestartSec=30
StandardOutput=append:${log}
StandardError=append:${log}

[Install]
WantedBy=default.target
`;
}

// A computer with no state file pauses its first tick when any ticket carries the building label (another machine
// may own it). A computer being set up owns nothing yet, so it starts with an empty state.
function seedState(cfg, dry) {
  const st = path.join(cfg.paths.stateDir, 'state.json');
  if (fs.existsSync(st)) return;
  if (dry) return say(`would write an empty ${st}`);
  fs.mkdirSync(cfg.paths.stateDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(st, `${JSON.stringify({ tickets: {}, dispatches: [], stuckStreak: 0 }, null, 2)}\n`);
  say(`wrote an empty ${st}`);
}

// Whether any job of The Forge is installed on this computer, read from the job files alone (no config needed).
export function anyInstalled() {
  const has = (dir, re) => { try { return fs.readdirSync(dir).some((f) => re.test(f)); } catch { return false; } };
  return has(agents(), /^dev\.agent-queue\..*\.plist$/) || has(units(), /^agent-queue-.*\.(timer|service)$/);
}

const env = () => ({ ...process.env, AGENT_QUEUE_CONFIG: configPath() });

export function install({ dry = false } = {}) {
  if (isTemporary(ROOT)) {
    warn(`This copy is in npm's cache (${ROOT}), which can be cleaned at any time. Run the-forge setup first, then install from the lasting copy (~/the-forge).`);
    return false;
  }
  const { host, linux, jobs, all, cfg } = jobsHere();
  if (!jobs.length) {
    warn(`${host} is not in dispatcher.enabledHosts and is not queueBoard.host, so it runs no jobs. Add it to the answers and run the-forge init again.`);
    const left = all.filter((j) => fs.existsSync(j.file));
    if (left.length) say(`removing the jobs an earlier config put here: ${left.map((j) => j.name).join(', ')}`);
    removeJobs(left, dry);
    return false;
  }
  // systemd splits unquoted paths at spaces, and the dispatcher's own units are written the same way.
  if (linux && /\s/.test(`${ROOT}${home()}${cfg.paths.stateDir}`)) {
    return warn(`On Linux the copy (${ROOT}), the home folder and paths.stateDir must have no spaces in their paths. Run setup --dir with another folder.`), false;
  }
  seedState(cfg, dry);
  let ok = true;
  for (const j of jobs) {
    if (!j.install) {
      if (dry) { say(`would write ${j.file} and enable it`); continue; }
      fs.mkdirSync(units(), { recursive: true });
      fs.mkdirSync(cfg.paths.stateDir, { recursive: true });
      fs.writeFileSync(j.file, boardUnit(cfg));
      // restart, so a reinstall after update runs the new code.
      ok = run('systemctl', ['--user', 'daemon-reload']).ok && run('systemctl', ['--user', 'enable', j.unit]).ok
        && run('systemctl', ['--user', 'restart', j.unit]).ok && ok;
      say(`installed ${j.unit}`);
      continue;
    }
    if (dry) { say(`would run: bash ${j.install.join(' ')}`); continue; }
    const r = runLive('bash', j.install, { env: env() });
    if (!r.ok) { warn(`${j.name}: install failed`); ok = false; }
  }
  if (linux && !dry) say('The herald posts macOS notifications, so it is not installed on Linux. Run it on a Mac with queue-board/install-herald.sh --base <board address>.');
  const stale = jobsHere(cfg).all.filter((j) => !jobs.some((x) => x.name === j.name) && fs.existsSync(j.file));
  if (stale.length) {
    say(`this computer no longer runs ${stale.map((j) => j.name).join(', ')} in the config, so removing ${stale.length > 1 ? 'them' : 'it'}`);
    ok = removeJobs(stale, dry) && ok;
  }
  return ok;
}

// Removes every job of The Forge on this computer, also one an earlier config put here.
export function uninstall({ dry = false } = {}) {
  const { jobs, all } = jobsHere();
  return removeJobs(all.filter((j) => jobs.includes(j) || fs.existsSync(j.file)), dry);
}

function removeJobs(list, dry) {
  let ok = true;
  for (const j of list) {
    if (!j.remove) {
      if (dry) { say(`would disable and delete ${j.file}`); continue; }
      run('systemctl', ['--user', 'disable', '--now', j.unit]);
      fs.rmSync(j.file, { force: true });
      run('systemctl', ['--user', 'daemon-reload']);
      say(`removed ${j.unit}`);
      continue;
    }
    if (dry) { say(`would run: bash ${j.remove.join(' ')}`); continue; }
    if (!runLive('bash', j.remove, { env: env() }).ok) ok = false;
  }
  return ok;
}

const loaded = (j, linux) => (linux
  ? run('systemctl', ['--user', 'is-active', j.unit]).stdout.trim() === 'active'
  : run('launchctl', ['print', `gui/${uid()}/${j.label}`]).ok);

// start loads every installed job that is not loaded; stop unloads them and keeps their files, so start brings them
// back. To hold the whole queue instead, pause the dispatcher: node dispatcher/dispatcher.mjs pause "reason".
export function startStop(which, { dry = false } = {}) {
  const { jobs, linux } = jobsHere();
  const present = jobs.filter((j) => fs.existsSync(j.file));
  if (!present.length) return warn('No jobs are installed on this computer. Run the-forge install.'), false;
  let ok = true;
  for (const j of present) {
    const args = linux
      ? ['systemctl', ['--user', which, j.unit]]
      : which === 'start'
        ? ['launchctl', ['bootstrap', `gui/${uid()}`, j.file]]
        : ['launchctl', ['bootout', `gui/${uid()}/${j.label}`]];
    if (!linux && (which === 'start') === loaded(j, linux)) { say(`${j.name}: already ${which === 'start' ? 'running' : 'stopped'}`); continue; }
    if (dry) { say(`would run: ${args[0]} ${args[1].join(' ')}`); continue; }
    const r = run(...args);
    say(`${j.name}: ${r.ok ? (which === 'start' ? 'started' : 'stopped') : `${which} failed (${r.stderr.trim()})`}`);
    ok = ok && r.ok;
  }
  return ok;
}

const boardUrl = (cfg, isBoard) => `http://${isBoard ? '127.0.0.1' : cfg.queueBoard?.host}:${process.env.QUEUE_BOARD_PORT || cfg.queueBoard?.port || 8787}/`;

export async function status({ json = false } = {}) {
  const { host, linux, isBoard, jobs, cfg } = jobsHere();
  const rows = jobs.map((j) => ({ name: j.name, installed: fs.existsSync(j.file), running: fs.existsSync(j.file) && loaded(j, linux) }));
  const url = boardUrl(cfg, isBoard);
  let board = null;
  if (isBoard) {
    try {
      board = (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok;
    } catch { board = false; }
  }
  const pausedFile = path.join(cfg.paths.stateDir, 'PAUSED');
  const paused = fs.existsSync(pausedFile) ? fs.readFileSync(pausedFile, 'utf8').trim() : null;
  const res = { host, jobs: rows, board: isBoard ? { url, answering: board } : null, paused };
  if (json) return say(JSON.stringify(res, null, 2)), res;
  for (const r of rows) say(`${r.name.padEnd(11)} ${r.installed ? (r.running ? 'running' : 'installed, stopped') : 'not installed'}`);
  if (isBoard) say(`board      ${board ? `answering at ${url}` : `not answering at ${url}`}`);
  say(`dispatcher ${paused ? `PAUSED: ${paused} (node dispatcher/dispatcher.mjs resume)` : 'not paused'}`);
  return res;
}

export function open({ print = false } = {}) {
  const { isBoard, cfg, linux } = jobsHere();
  const url = boardUrl(cfg, isBoard);
  say(url);
  if (print) return true;
  const r = run(linux ? 'xdg-open' : 'open', [url]);
  if (!r.ok) warn(`could not open a browser here; open ${url} yourself`);
  return r.ok;
}
