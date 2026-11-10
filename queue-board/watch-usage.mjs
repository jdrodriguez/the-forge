#!/usr/bin/env node
// watch-usage.mjs: refreshes the saved plan usage of the Claude accounts the board only watches, and prints what
// happened as JSON, for the queue board.
//   node watch-usage.mjs
// A watched account is a Claude Code folder ~/.claude-board-<name>, signed in once by hand:
//   CLAUDE_CONFIG_DIR=~/.claude-board-main claude auth login --email <address>
// The hyphen keeps it out of the fleet: fleet.sh takes only ~/.claude-<letters and digits> as accounts, so neither
// fleet.sh dispatch nor the dispatcher starts work on it. Each refresh runs 'claude -p /usage', which asks Anthropic for
// the usage windows and saves them in the folder's .claude.json, as fleet.sh does for the fleet's accounts. It runs no
// model and spends no tokens. collect.mjs reads the saved copy.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const TIMEOUT_MS = 30_000;
// A claude stopped while it renews the folder's sign-in loses the new login, so one renewing gets this much longer.
const GRACE_MS = 60_000;
// launchd and ssh start this with a short PATH, so the usual install folders are added.
const DIRS = [path.join(HOME, '.local/bin'), path.dirname(process.execPath), ...(process.env.PATH ?? '').split(':'), '/opt/homebrew/bin', '/usr/local/bin'];
const executable = (c) => { try { fs.accessSync(c, fs.constants.X_OK); return fs.statSync(c).isFile(); } catch { return false; } };
const claude = DIRS.map((d) => path.join(d, 'claude')).find(executable) ?? 'claude';

function refresh(dir) {
  return new Promise((resolve) => {
    const p = spawn(claude, ['-p', '/usage'], { cwd: os.tmpdir(), env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    let graced = false;
    p.stderr.on('data', (d) => { err += d; });
    const stop = () => {
      if (!graced && fs.existsSync(path.join(dir, '.oauth_refresh.lock'))) { graced = true; timer = setTimeout(stop, GRACE_MS); return; }
      p.kill();
      resolve({ error: `no answer in ${(TIMEOUT_MS + (graced ? GRACE_MS : 0)) / 1000}s` });
    };
    let timer = setTimeout(stop, TIMEOUT_MS);
    p.on('error', (e) => { clearTimeout(timer); resolve({ error: e.message }); });
    p.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? {} : { error: err.trim().split('\n').at(-1) || `claude exited ${code}` }); });
  });
}

const dirs = fs.readdirSync(HOME).filter((d) => /^\.claude-board-[a-z0-9]+$/.test(d) && fs.existsSync(path.join(HOME, d, '.claude.json')));
const accounts = {};
for (const d of dirs) accounts[d.slice('.claude-board-'.length)] = await refresh(path.join(HOME, d));
console.log(JSON.stringify({ at: new Date().toISOString(), accounts }));
