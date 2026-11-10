// ext-runs.mjs: the Codex and Grok calls running on this machine right now, for the Middle-earth view's seer (Saruman
// at his palantír, scene-saruman.js). Every such call goes through scripts/ext-agent.sh <codex|grok>, whatever
// session, fleet worker or review started it, so the board counts those script processes with ps, at most every 15
// seconds, in the background. For each run it keeps the engine, how long it has run and the folder it reads (--cwd),
// never its prompt. Calls on the other machines are not seen. Codex and Grok building a ticket are workers, never
// seeing, so the board keeps them apart from Saruman's research calls: engine workers run under ext-worker.sh and a
// Claude worker's write steps under ext-build.sh, so a run with either among its parent processes is left out, whatever
// script it goes through.
import { execFile } from 'node:child_process';

const EVERY_MS = 15_000;
const r = { last: { at: 0, codex: [], grok: [] }, at: 0, busy: false };
// ps's elapsed time, [[dd-]hh:]mm:ss, in seconds.
const seconds = (t) => {
  const [d, rest] = t.includes('-') ? t.split('-') : [0, t];
  return rest.split(':').map(Number).reduce((s, n) => s * 60 + n, 0) + Number(d) * 86_400;
};

function refresh() {
  r.busy = true;
  execFile('ps', ['-axo', 'pid=,ppid=,etime=,args='], { maxBuffer: 8 * 1024 * 1024, timeout: 5000 }, (err, out) => {
    r.at = Date.now();
    r.busy = false;
    if (err) return;
    const next = { at: r.at, codex: [], grok: [] };
    const procs = new Map();
    for (const line of out.split('\n')) {
      const p = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (p) procs.set(Number(p[1]), { ppid: Number(p[2]), etime: p[3], args: p[4] });
    }
    // A process running a builder script (by its shell, or straight by its path), not a shell whose command line only
    // quotes the name: a session that mentions ext-build.sh beside a research call still lights the stone.
    const builder = /^(?:\S*\/)?(?:ba|z|da)?sh\s+(?:-\S+\s+)*\S*\bext-(?:worker|build)\.sh\b|^\S*\bext-(?:worker|build)\.sh\b/;
    const builds = (pid) => {
      for (let k = 0, q = procs.get(pid); q && k < 40; k += 1, q = procs.get(q.ppid)) if (builder.test(q.args.trim())) return true;
      return false;
    };
    for (const p of procs.values()) {
      // The script's own bash process, not the shells that launched it (their command lines quote it too).
      const m = p.args.trim().match(/^(?:\/bin\/)?bash \S*ext-agent\.sh (codex|grok)\b(.*)$/);
      if (!m || builds(p.ppid)) continue;
      const cwd = m[2].match(/--cwd (\S+)/)?.[1] ?? null;
      next[m[1]].push({ secs: seconds(p.etime), cwd });
    }
    r.last = next;
  });
}

// The last count, counting again in the background when it is 15 seconds old.
export function extRuns() {
  if (!r.busy && Date.now() - r.at > EVERY_MS) refresh();
  return r.last;
}
extRuns();
