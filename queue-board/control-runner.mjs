// control-runner.mjs: runs the dispatcher's own CLI on a queue machine for the Fleet view's Pause and Resume
// (control.mjs): here directly, elsewhere over ssh the way the board runs collect.mjs. Every argument is single-quoted
// for the remote shell. QUEUE_BOARD_CONTROL_RECORD names a file that takes the calls instead, so a second board run to
// try a change never pauses a real machine.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { refuse } from './control-config.mjs';

const execFileP = promisify(execFile);
const REMOTE_PATH = 'PATH=$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
const quote = (x) => `'${String(x).replace(/'/g, "'\\''")}'`;
// A path for the remote shell: a leading ~/ stays bare so that shell expands it.
const remotePath = (p) => (p.startsWith('~/') ? `~/${quote(p.slice(2))}` : quote(p));

// here: this machine's short hostname. root: this checkout. machines: [{ host, ssh, root }], root being where the
// checkout sits on that machine (queueBoard.remoteRoot).
export function createRunner({ here, root, machines = [], env = process.env }) {
  return async (host, args) => {
    const record = env.QUEUE_BOARD_CONTROL_RECORD;
    if (record) {
      fs.appendFileSync(record, `${JSON.stringify({ at: new Date().toISOString(), host, args })}\n`);
      return 'recorded, not run (QUEUE_BOARD_CONTROL_RECORD)';
    }
    if (host === here) {
      return (await execFileP(process.execPath, [path.join(root, 'dispatcher', 'dispatcher.mjs'), ...args], { encoding: 'utf8', timeout: 30_000 })).stdout;
    }
    const m = machines.find((x) => x.host === host);
    if (!m) refuse(`no way to reach ${host}`, 502);
    const cmd = `${REMOTE_PATH} node ${remotePath(`${m.root}/dispatcher/dispatcher.mjs`)} ${args.map(quote).join(' ')}`;
    try {
      return (await execFileP('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', m.ssh, cmd], { encoding: 'utf8', timeout: 30_000 })).stdout;
    } catch (e) {
      return refuse(`could not reach ${host} to run it: ${String(e.stderr || e.message).trim().split('\n').pop().slice(0, 200)}`, 502);
    }
  };
}
