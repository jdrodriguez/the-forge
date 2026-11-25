#!/usr/bin/env node
// watch-child.mjs <cmd> [args...]: runs one watcher for orchestrator-watch.mjs and ends it when the parent is gone.
// orchestrator-watch.mjs starts this as the leader of its own process group; the watcher runs in that group, so a
// signal to the group stops the watcher and anything it started. Every 2 seconds it checks that its parent is still
// the process that started it: a parent that was killed outright leaves this one re-parented, and it then stops the
// whole group instead of marking events seen with nobody to read them. Output and exit status pass through.
import { spawn } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
const parent = process.ppid;
const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
const stopGroup = () => { try { process.kill(-process.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } };
setInterval(() => { if (process.ppid !== parent) stopGroup(); }, Number(process.env.FORGE_PARENT_POLL_MS ?? 2000)).unref();
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { child.kill('SIGTERM'); process.exit(1); });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
