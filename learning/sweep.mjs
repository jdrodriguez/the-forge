#!/usr/bin/env node
// Weekly failure sweep. Gathers failures from CI, merge queue, red main, review
// findings, /verify, the dispatcher and (optionally) the human's corrections,
// groups them into failure types, and writes reports/<date>.md plus history.json
// under learning.outDir (default <paths.stateDir>/learning).
// Usage: node learning/sweep.mjs [--days 7] [--since ISO] [--no-ssh] [--dry-run] [--quiet]
// Linear needs a key: LINEAR_API_KEY, linear.apiKeyCommand or linear.apiKeyFile (see lib/config.mjs).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadConfig, linearKey, expandHome, ROOT, HOME } from '../lib/config.mjs';
import {
  LADDER, compileSkipJobs, buildCatalog, stripLog, excerpt, jobBase, extractSignature, classify, normalize,
  parseCcr, verifyFailRows, headingText, parseMainWatch, parseDispatcherGiveUps, score,
} from './lib.mjs';

const pexec = promisify(execFile);
const cfg = loadConfig();
const L = cfg.learning ?? {};
const OUT = expandHome(L.outDir) || path.join(cfg.paths.stateDir, 'learning');
const CACHE = path.join(OUT, 'cache');
const REPO = cfg.github?.repo;
const REPO_PATH = cfg.repoPath;
const HUMAN_NAME = cfg.human?.name ?? 'the human';
const WORKSPACE = cfg.linear?.workspace;
const TEAM = cfg.linear?.team;
const VERIFY_HEADING = cfg.linear?.verifyEvidenceHeading ?? '## Verify evidence';
const SKIP_JOBS = compileSkipJobs(L.skipJobs);
const CATALOG = buildCatalog(L.catalog);
const REVIEW_BOT = L.reviewBotLogin ?? 'github-actions[bot]';
const CORRECTIONS = L.correctionsGlob ? expandHome(L.correctionsGlob) : null;
const LOCAL_HOST = os.hostname().split('.')[0];

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DAYS = Number(arg('--days', 7));
const SINCE = new Date(arg('--since', new Date(Date.now() - DAYS * 864e5).toISOString()));
const UNTIL = new Date();
const QUIET = args.includes('--quiet');
const NO_SSH = args.includes('--no-ssh');
const DRY = args.includes('--dry-run'); // no history, snapshot or report writes
const globSync = (pattern, opts) => {
  if (typeof fs.globSync !== 'function') throw new Error('fs.globSync needs Node 22 or later');
  return fs.globSync(pattern, opts);
};
// Review rule names from the repo's standards tables (learning.reviewRulesGlob): | TST-21 | Firm scope and soft delete ... |
const RULE_NAMES = (() => {
  const names = {};
  if (!L.reviewRulesGlob || !REPO_PATH || !fs.existsSync(REPO_PATH)) return names;
  for (const f of globSync(L.reviewRulesGlob, { cwd: REPO_PATH })) {
    for (const m of fs.readFileSync(path.join(REPO_PATH, f), 'utf8').matchAll(/^\|\s*([A-Z]{2,5}-\d+)\s*\|\s*([^|]+?)\s*\|/gm)) names[m[1]] ??= m[2];
  }
  return names;
})();
const log = (...a) => { if (!QUIET) console.error(...a); };
const notes = []; // source problems, printed in the report

// Human-time estimates (minutes) for sources with no measured cost. Rough on
// purpose; the README explains them.
const HUMAN = { verifyFail: 30, giveUp: 30, correction: 15, ccrFinding: 10 };

fs.mkdirSync(path.join(CACHE, 'jobs'), { recursive: true });
fs.mkdirSync(path.join(CACHE, 'runs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'reports'), { recursive: true });
// Prune cache entries older than 21 days; the window never reaches back that far.
for (const sub of ['jobs', 'runs']) {
  for (const f of fs.readdirSync(path.join(CACHE, sub))) {
    const p = path.join(CACHE, sub, f);
    if (Date.now() - fs.statSync(p).mtimeMs > 21 * 864e5) fs.rmSync(p);
  }
}

async function sh(cmd, argv, opts = {}) {
  const { stdout } = await pexec(cmd, argv, { maxBuffer: 256 * 1024 * 1024, timeout: opts.timeout ?? 120_000, env: process.env });
  return stdout;
}
async function retry(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries || !/HTTP 5\d\d|ETIMEDOUT|ECONNRESET|timed out/i.test(String(e.message))) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}
async function ghJson(endpoint) {
  return JSON.parse(await retry(() => sh('gh', ['api', endpoint])));
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch((e) => ({ error: String(e.message ?? e).slice(0, 200) })); }
  }));
  return out;
}
const inWindow = (iso) => { const t = Date.parse(iso); return t >= SINCE.getTime() && t <= UNTIL.getTime(); };
const mins = (a, b) => (a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000) : 0);
const ticketUrl = (id) => (WORKSPACE ? `https://linear.app/${WORKSPACE}/issue/${id}` : '');

// The workflow the CI source reads: learning.ciWorkflowFile (ci.yml) when set, else
// the workflow whose name is github.ciWorkflow, found through the Actions API.
async function ciWorkflowId() {
  if (L.ciWorkflowFile) return L.ciWorkflowFile;
  const name = cfg.github?.ciWorkflow;
  if (!name) throw new Error('set learning.ciWorkflowFile or github.ciWorkflow');
  for (let page = 1; page <= 5; page++) {
    const r = await ghJson(`repos/${REPO}/actions/workflows?per_page=100&page=${page}`);
    const hit = r.workflows.find((w) => w.name === name);
    if (hit) return String(hit.id);
    if (r.workflows.length < 100) break;
  }
  throw new Error(`no workflow named "${name}" in ${REPO}; set learning.ciWorkflowFile`);
}

// ---------- Source 1 and 2: CI and merge_group, at the job level ----------
async function ciFailures() {
  if (!REPO) { notes.push('github.repo not set, so CI, merge_group and review findings were not read.'); return []; }
  const workflow = await ciWorkflowId();
  const day = SINCE.toISOString().slice(0, 10);
  const runs = [];
  for (let page = 1; page <= 30; page++) {
    const r = await ghJson(`repos/${REPO}/actions/workflows/${workflow}/runs?created=>=${day}&per_page=100&page=${page}`);
    runs.push(...r.workflow_runs);
    if (r.workflow_runs.length < 100) break;
  }
  const done = runs.filter((r) => r.status === 'completed' && ['failure', 'cancelled'].includes(r.conclusion) && inWindow(r.created_at));
  log(`ci: ${runs.length} runs, ${done.length} failed or cancelled`);
  const jobLists = await pool(done, 8, async (run) => {
    const f = path.join(CACHE, 'runs', `${run.id}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    const jobs = [];
    for (let page = 1; page <= 5; page++) {
      let j;
      try {
        j = await ghJson(`repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100&filter=all&page=${page}`);
      } catch (e) {
        // A run with exactly 100 jobs can 502 on page 2; keep what page 1 gave.
        if (page > 1 && /HTTP 5\d\d/.test(e.message)) break;
        throw e;
      }
      jobs.push(...j.jobs.map((x) => ({ id: x.id, name: x.name, conclusion: x.conclusion, started_at: x.started_at, completed_at: x.completed_at, run_attempt: x.run_attempt, html_url: x.html_url })));
      if (j.jobs.length < 100) break;
    }
    fs.writeFileSync(f, JSON.stringify(jobs));
    return jobs;
  });
  const failed = [];
  done.forEach((run, k) => {
    const jobs = Array.isArray(jobLists[k]) ? jobLists[k] : [];
    if (!Array.isArray(jobLists[k])) notes.push(`run ${run.id}: jobs list unreadable (${String(jobLists[k]?.error).split('\n').pop()})`);
    const bad = jobs.filter((j) => j.conclusion === 'failure' && !SKIP_JOBS.some((re) => re.test(j.name)));
    const runMin = mins(run.run_started_at, run.updated_at);
    for (const j of bad) failed.push({ run, job: j, share: runMin / bad.length });
  });
  log(`ci: ${failed.length} failed jobs to read`);
  const sigs = await pool(failed, 6, async ({ job }) => {
    // The cache holds a gzipped excerpt, so a better extractor re-reads old jobs without refetching.
    const f = path.join(CACHE, 'jobs', `${job.id}.v3.txt.gz`);
    let lines;
    if (fs.existsSync(f)) lines = gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n');
    else {
      try {
        lines = excerpt(stripLog(await retry(() => sh('gh', ['api', '--allow-escape-sequences', `repos/${REPO}/actions/jobs/${job.id}/logs`], { timeout: 180_000 }))));
      } catch (e) {
        return { id: job.id, sig: 'log unavailable', kind: 'unknown', raw: String(e.message).slice(0, 120) };
      }
      fs.writeFileSync(f, gzipSync(lines.join('\n')));
    }
    return { id: job.id, name: job.name, ...extractSignature(lines) };
  });
  return failed.map((f, k) => {
    const s = sigs[k] ?? { sig: 'log unavailable', kind: 'unknown' };
    const base = jobBase(f.job.name);
    return {
      source: f.run.event === 'merge_group' ? 'merge_group' : 'ci',
      type: classify(base, s.sig, CATALOG),
      job: base,
      sig: s.sig,
      at: f.job.completed_at,
      key: f.run.event === 'pull_request' ? `pr:${f.run.pull_requests?.[0]?.number ?? f.run.head_branch}` : `${f.run.event}:${f.run.head_branch}`,
      url: f.job.html_url,
      ciMinutes: mins(f.job.started_at, f.job.completed_at) + f.share,
    };
  });
}

// ---------- Source 2b: red main ----------
function redMain() {
  const file = path.join(cfg.paths.stateDir, 'main-watch.log');
  if (!fs.existsSync(file)) { notes.push('main-watch.log missing'); return []; }
  const ev = parseMainWatch(fs.readFileSync(file, 'utf8')).filter((e) => inWindow(e.at));
  const out = [];
  for (const e of ev.filter((x) => x.kind === 'red')) {
    const green = ev.find((g) => g.kind === 'green' && Date.parse(g.at) > Date.parse(e.at));
    const job = e.failing.split(/[ ,(]/)[0];
    out.push({
      source: 'red-main', type: `red-main:${job}`, job, sig: `main red: ${e.failing.slice(0, 120)}`, at: e.at,
      key: `sha:${e.sha}`, url: REPO ? `https://github.com/${REPO}/commit/${e.sha}` : '', humanMinutes: green?.minutes ?? 30,
      detail: e.title,
    });
  }
  return out;
}

// ---------- Source 3: review findings ----------
async function ccrFindings() {
  if (!REPO) return [];
  const day = SINCE.toISOString().slice(0, 10);
  const prs = JSON.parse(await sh('gh', ['pr', 'list', '-R', REPO, '--state', 'all', '--search', `updated:>=${day}`, '--limit', '400', '--json', 'number,url,title']));
  log(`ccr: ${prs.length} PRs updated in the window`);
  const lists = await pool(prs, 8, async (pr) => {
    const raw = await sh('gh', ['api', '--paginate', `repos/${REPO}/pulls/${pr.number}/comments?per_page=100`, '--jq', `.[]|select(.user.login==${JSON.stringify(REVIEW_BOT)})|{created_at,html_url,body:.body[0:500]}`]);
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  });
  const out = [];
  prs.forEach((pr, k) => {
    if (!Array.isArray(lists[k])) { notes.push(`PR #${pr.number}: review comments unreadable`); return; }
    for (const c of lists[k]) {
      if (!inWindow(c.created_at)) continue;
      const f = parseCcr(c.body);
      if (!f) continue;
      out.push({
        source: 'ccr', type: f.rule ? `ccr:${f.rule}` : `ccr:${f.axis}:${normalize(f.text).slice(0, 60)}`, job: f.axis,
        sig: `${f.rule ?? ''} ${f.text}`.trim(), at: c.created_at, key: `pr:${pr.number}`, url: c.html_url, humanMinutes: HUMAN.ccrFinding,
      });
    }
  });
  return out;
}

// ---------- Source 4: /verify FAILs and reopens ----------
async function verifyFails() {
  let key;
  try {
    key = linearKey(cfg);
  } catch (e) {
    notes.push(`No Linear key (${e.message}), so /verify FAILs were not read.`);
    return [];
  }
  const team = TEAM ? `issue:{team:{key:{eq:${JSON.stringify(TEAM)}}}},` : '';
  const q = `query($after:String,$since:DateTimeOrDuration!,$heading:String!){comments(first:100,after:$after,filter:{createdAt:{gte:$since},${team}or:[{body:{contains:$heading}},{body:{contains:"Reopened"}}]}){nodes{id url createdAt body issue{identifier title}}pageInfo{hasNextPage endCursor}}}`;
  const out = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: key },
      body: JSON.stringify({ query: q, variables: { after, since: SINCE.toISOString(), heading: headingText(VERIFY_HEADING) } }),
    }).then((r) => r.json());
    if (res.errors) { notes.push(`Linear: ${res.errors[0].message}`); break; }
    for (const c of res.data.comments.nodes) {
      const fails = verifyFailRows(c.body, VERIFY_HEADING);
      const reopened = /^#+\s*Reopened/im.test(c.body);
      if (!fails.length && !reopened) continue;
      out.push({
        source: 'verify', type: reopened ? 'verify:reopened' : 'verify:fail', job: 'verify',
        sig: reopened ? 'ticket reopened after /verify' : `FAIL: ${fails[0].slice(0, 100)}`, at: c.createdAt,
        key: `ticket:${c.issue?.identifier}`, url: c.url, humanMinutes: HUMAN.verifyFail, detail: c.issue?.title,
      });
    }
    if (!res.data.comments.pageInfo.hasNextPage) break;
    after = res.data.comments.pageInfo.endCursor;
  }
  return out;
}

// ---------- Source 5: dispatcher give-ups on every machine ----------
// The remote log sits at the same place under the remote home: ssh runs `cat` from there.
const remoteStateDir = () => (cfg.paths.stateDir.startsWith(`${HOME}/`) ? path.relative(HOME, cfg.paths.stateDir) : cfg.paths.stateDir);
async function giveUps() {
  const machines = [
    { name: LOCAL_HOST, read: async () => fs.readFileSync(path.join(cfg.paths.stateDir, 'dispatcher.log'), 'utf8') },
    ...Object.entries(L.ssh ?? {}).filter(([name]) => name !== LOCAL_HOST).map(([name, ssh]) => ({ name, ssh })),
  ];
  const out = [];
  const seen = new Set();
  for (const m of machines) {
    let text;
    try {
      if (m.read) text = await m.read();
      else if (NO_SSH) { notes.push(`${m.name}: skipped (--no-ssh)`); continue; }
      else text = await sh('ssh', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', m.ssh, 'cat', path.join(remoteStateDir(), 'dispatcher.log')], { timeout: 30_000 });
    } catch (e) {
      notes.push(`${m.name}: dispatcher log unreachable (${String(e.message).split('\n')[0].slice(0, 100)}); skipped`);
      continue;
    }
    for (const g of parseDispatcherGiveUps(text)) {
      if (!inWindow(g.at)) continue;
      const id = `${g.ticket}:${g.kind}:${g.at.slice(0, 13)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        source: 'dispatcher', type: `dispatcher:${g.kind}:${g.reason}`, job: g.kind, sig: g.reason, at: g.at,
        key: `ticket:${g.ticket}`, url: ticketUrl(g.ticket), humanMinutes: HUMAN.giveUp, detail: `${m.name}: ${g.line.slice(25, 200)}`,
      });
    }
  }
  return out;
}

// ---------- Source 6: the human's corrections (learning.correctionsGlob, off by default) ----------
function corrections() {
  if (!CORRECTIONS) return [];
  const files = globSync(CORRECTIONS).filter((p) => fs.statSync(p).isFile());
  if (!files.length) { notes.push(`no files match learning.correctionsGlob (${L.correctionsGlob})`); return []; }
  // File times are useless here: sync tools, editors and the memory-hygiene pass
  // rewrite files without a new lesson. Two signals instead:
  //   - snapshot of each file's lesson-body hash from the previous sweep: a file
  //     missing from it is new, a changed hash is an update (a repeat lesson);
  //   - with no snapshot yet (the first run), the frontmatter `modified:` date.
  // More than BULK changed files at once means a cleanup pass, and none of them count.
  const BULK = 15;
  const snapFile = path.join(CACHE, 'memory-hashes.json');
  const snap = fs.existsSync(snapFile) ? JSON.parse(fs.readFileSync(snapFile, 'utf8')) : null;
  const next = {};
  const hits = [];
  for (const p of files) {
    const f = path.basename(p);
    const body = fs.readFileSync(p, 'utf8');
    const lesson = body.replace(/^---[\s\S]*?\n---\n/, '').trim();
    const hash = createHash('sha1').update(lesson).digest('hex');
    next[f] = hash;
    const fmModified = body.match(/^\s*modified:\s*"?([\d-]+T[\d:.]+Z?)/m)?.[1];
    let kind = null;
    if (snap) kind = !(f in snap) ? 'new' : snap[f] !== hash ? 'updated' : null;
    else if (fmModified && inWindow(fmModified)) kind = 'updated';
    if (!kind) continue;
    const desc = body.match(/^description:\s*"?(.*?)"?\s*$/m)?.[1] ?? '';
    hits.push({ f, p, kind, desc, at: fmModified && inWindow(fmModified) ? fmModified : UNTIL.toISOString() });
  }
  if (!snap) notes.push('First sweep: no memory snapshot yet, so corrections come from frontmatter `modified:` dates only. From the next sweep, new and changed feedback memories are read from the snapshot.');
  if (!DRY) fs.writeFileSync(snapFile, JSON.stringify(next));
  if (hits.length > BULK) {
    notes.push(`${hits.length} feedback memories changed since the last sweep, more than ${BULK}, which looks like a cleanup pass; corrections were not counted this week.`);
    return [];
  }
  const out = [];
  for (const h of hits) {
    const isNew = h.kind === 'new';
    out.push({
      source: 'correction', type: `correction:${h.f.replace(/\.md$/, '')}`, job: 'memory', sig: h.desc.slice(0, 160), at: h.at,
      // A changed (not new) feedback memory means the same lesson came up again: a second miss.
      key: h.kind, count: isNew ? 1 : 2, url: `file://${h.p}`, humanMinutes: HUMAN.correction * (isNew ? 1 : 2),
    });
  }
  return out;
}

// ---------- Enforcement search ----------
function enforcementSources() {
  const files = [];
  const add = (p, level) => { if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push({ p, level, text: fs.readFileSync(p, 'utf8') }); };
  const addDir = (d, re, level) => { if (fs.existsSync(d) && fs.statSync(d).isDirectory()) for (const f of fs.readdirSync(d)) if (re.test(f)) add(path.join(d, f), level); };
  if (REPO_PATH) {
    for (const f of ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.cjs', '.eslintrc.json']) add(path.join(REPO_PATH, f), 2);
    addDir(path.join(REPO_PATH, '.github/workflows'), /\.ya?ml$/, 3);
    addDir(path.join(REPO_PATH, '.husky'), /^[^.]/, 3);
    add(path.join(REPO_PATH, '.github/PULL_REQUEST_TEMPLATE.md'), 4);
  }
  add(path.join(HOME, '.claude/settings.json'), 3);
  add(path.join(ROOT, 'dispatcher/worker-brief.md'), 4);
  add(path.join(ROOT, 'specdesk/SPECDESK.md'), 4);
  if (REPO_PATH) add(path.join(REPO_PATH, 'CLAUDE.md'), 5);
  add(path.join(HOME, '.claude/CLAUDE.md'), 5);
  // learning.enforcementSources: more files or folders, e.g. a hooks folder at level 3.
  for (const s of L.enforcementSources ?? []) {
    const p = expandHome(s.path);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) addDir(p, new RegExp(s.pattern ?? '^[^.]'), s.level);
    else add(p, s.level);
  }
  return files;
}
function enforcementFor(type, sample, sources) {
  const cat = CATALOG.find((c) => c.id === type);
  let needles = cat?.enforce ?? [];
  if (!needles.length) {
    const rule = type.match(/^ccr:([A-Z]{2,5}-\d+)/)?.[1];
    if (rule) needles = [rule];
    else if (type.startsWith('dispatcher:')) needles = [type.includes('stalled') ? 'stalled' : 'merge state'];
    else if (type.startsWith('red-main:')) needles = ['main-red', 'main turned red'];
    else if (type.startsWith('correction:')) needles = [type.slice('correction:'.length)];
    else {
      const file = sample.match(/[\w.-]+\.(test|spec)\.[tj]sx?/)?.[0];
      needles = file ? [file] : [];
    }
  }
  const hits = sources.filter((s) => needles.some((n) => s.text.includes(n)));
  return hits.map((h) => ({ file: h.p.replace(HOME, '~'), level: h.level }));
}

// ---------- Main ----------
const results = await Promise.all([
  ciFailures().catch((e) => { notes.push(`CI source failed: ${e.message}`); return []; }),
  Promise.resolve(redMain()),
  ccrFindings().catch((e) => { notes.push(`Review source failed: ${e.message}`); return []; }),
  verifyFails().catch((e) => { notes.push(`Linear source failed: ${e.message}`); return []; }),
  giveUps(),
  Promise.resolve(corrections()),
]);
const events = results.flat();
log(`events: ${events.length}`);

const types = new Map();
for (const e of events) {
  const t = types.get(e.type) ?? { id: e.type, sources: new Set(), count: 0, keys: new Set(), ciMinutes: 0, humanMinutes: 0, examples: [], sigs: new Map(), ats: [] };
  t.sources.add(e.source);
  t.count += e.count ?? 1;
  t.keys.add(e.key);
  t.ciMinutes += e.ciMinutes ?? 0;
  t.humanMinutes += e.humanMinutes ?? 0;
  if (t.examples.length < 5 && !t.examples.some((x) => x.key === e.key)) t.examples.push({ url: e.url, key: e.key, at: e.at, detail: e.detail });
  t.sigs.set(e.sig, (t.sigs.get(e.sig) ?? 0) + 1);
  t.ats.push(e.at);
  types.set(e.type, t);
}

const histFile = path.join(OUT, 'history.json');
const history = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : { weeks: [], fixes: {} };
const prev = history.weeks.filter((w) => w.date < UNTIL.toISOString().slice(0, 10)).at(-1);
const sources = enforcementSources();

const ranked = [...types.values()].map((t) => {
  const distinct = t.id.startsWith('correction:') ? t.count : t.keys.size;
  const sample = [...t.sigs.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const enforced = enforcementFor(t.id, sample, sources);
  const cat = CATALOG.find((c) => c.id === t.id);
  const fix = history.fixes[t.id];
  const prevCount = prev?.types?.[t.id]?.count;
  const sinceFix = fix ? t.ats.filter((a) => Date.parse(a) > Date.parse(fix.landedAt)).length : null;
  const fixHours = fix ? Math.max(0, (UNTIL - Date.parse(fix.landedAt)) / 36e5) : null;
  let recommend = cat?.recommend ?? defaultLevel(t.id, enforced);
  let flag = null;
  if (fix && prevCount !== undefined && Date.parse(fix.landedAt) < Date.parse(prev.until ?? prev.date) && t.count >= prevCount) {
    recommend = Math.max(1, Math.min(recommend, fix.level - 1));
    flag = `fix landed at level ${fix.level} (${fix.note}) on ${fix.landedAt.slice(0, 10)}, but the count did not drop (${prevCount} → ${t.count}). Move it up to level ${recommend}.`;
  }
  return {
    id: t.id, title: cat?.title ?? titleFor(t.id, sample), sources: [...t.sources], count: t.count, distinct,
    ciMinutes: Math.round(t.ciMinutes), humanMinutes: Math.round(t.humanMinutes), sample, examples: t.examples,
    enforced, recommend, why: cat?.why ?? whyFor(t.id), fix, sinceFix, fixHours, prevCount, flag,
    score: score({ ciMinutes: t.ciMinutes, humanMinutes: t.humanMinutes, distinct }),
  };
}).sort((a, b) => b.score - a.score || b.count - a.count);

function defaultLevel(id, enforced) {
  if (id.startsWith('ccr:')) return 4;
  if (id.startsWith('dispatcher:')) return 1;
  if (id.startsWith('correction:')) return enforced.some((e) => e.level <= 4) ? 3 : 4;
  if (id.startsWith('ci:')) return 2;
  if (id.startsWith('red-main:')) return 3;
  return 4;
}
function titleFor(id, sample) {
  if (id.startsWith('ccr:')) {
    const rule = id.slice(4);
    return RULE_NAMES[rule] ? `Review ${rule} (${RULE_NAMES[rule]}) keeps coming up` : `Review ${rule}: ${sample.replace(/^[A-Z]{2,5}-\d+\s*/, '').slice(0, 90)}`;
  }
  if (id.startsWith('dispatcher:')) return `Dispatcher gave up: ${id.split(':').slice(1).join(', ')}`;
  if (id.startsWith('correction:')) return `${HUMAN_NAME} correction: ${sample.slice(0, 100)}`;
  if (id.startsWith('red-main:')) return `main went red in ${id.slice(9)}`;
  if (id.startsWith('verify:')) return id === 'verify:fail' ? '/verify found a FAIL on staging' : 'ticket reopened after /verify';
  return `CI ${id.split(':')[1]}: ${sample.slice(0, 110)}`;
}
function whyFor(id) {
  if (id.startsWith('ccr:')) return 'The reviewer already catches it after a CI run; a pre-push self-check for this rule in the worker brief catches it first. Where the rule is mechanical, a lint rule or test helper beats the brief.';
  if (id.startsWith('dispatcher:')) return 'Give-ups cost a redispatch and a human look. Fix the state the dispatcher cannot move (conflicts, blocked merge, a long-running worker) in the dispatcher itself.';
  if (id.startsWith('correction:')) return 'A correction is a second miss by definition. Move the lesson into the cheapest check that would have caught it.';
  if (id.startsWith('ci:')) return 'If it hits more than one PR it is not the PR\'s fault: a flake or a shared break. Fix it with a test-harness change.';
  if (id.startsWith('red-main:')) return 'Red main blocks every merge. Look at why the merge queue let it through.';
  if (id.startsWith('verify:')) return 'Work passed CI and review but failed on staging. The acceptance scenario was not exercised by a test at a real boundary.';
  return 'Look at the examples.';
}

// ---------- Report ----------
const date = UNTIL.toISOString().slice(0, 10);
const level = (n) => `${n}. ${LADDER[n]}`;
const md = [];
md.push(`# Failure sweep ${date}`, '');
md.push(`Window: ${SINCE.toISOString().slice(0, 16)}Z to ${UNTIL.toISOString().slice(0, 16)}Z. ${events.length} failure events in ${ranked.length} types. Generated by \`learning/sweep.mjs\`.`, '');
md.push('Score = CI minutes + estimated human minutes + 10 per distinct PR or ticket hit. "Recurring" means 2 or more distinct PRs or tickets.', '');
const bySource = {};
for (const e of events) bySource[e.source] = (bySource[e.source] ?? 0) + 1;
md.push(`Events by source: ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`, '');
if (notes.length) md.push('## Source problems', '', ...notes.map((n) => `- ${n}`), '');
const flagged = ranked.filter((r) => r.flag);
if (flagged.length) md.push('## Fixes that did not hold', '', ...flagged.map((r) => `- **${r.id}**: ${r.flag}`), '');
md.push('## Top failure types', '');
md.push('| # | Type | Count | PRs/tickets | CI min | Human min | Last week | Enforced today | Fix level |', '|---|---|---|---|---|---|---|---|---|');
ranked.slice(0, 25).forEach((r, i) => {
  md.push(`| ${i + 1} | ${r.title.replace(/\|/g, '\\|').slice(0, 110)} | ${r.count} | ${r.distinct} | ${r.ciMinutes} | ${r.humanMinutes} | ${r.prevCount ?? 'n/a'} | ${r.enforced.length ? Math.min(...r.enforced.map((e) => e.level)) : 'no'} | ${r.recommend} |`);
});
md.push('', '## Detail (top 10)', '');
ranked.slice(0, 10).forEach((r, i) => {
  md.push(`### ${i + 1}. ${r.title}`, '');
  md.push(`- **Id:** \`${r.id}\` (sources: ${r.sources.join(', ')})`);
  md.push(`- **Count:** ${r.count} across ${r.distinct} PRs/tickets; ${r.ciMinutes} CI minutes, about ${r.humanMinutes} human minutes. Last week: ${r.prevCount ?? 'not tracked yet'}.`);
  md.push(`- **Signature:** \`${r.sample.replace(/`/g, "'").slice(0, 200)}\``);
  md.push(`- **Examples:** ${r.examples.map((x) => `[${x.key}](${x.url})${x.detail ? ` (${String(x.detail).slice(0, 60)})` : ''}`).join(', ')}`);
  md.push(`- **Enforced today:** ${r.enforced.length ? r.enforced.map((e) => `\`${e.file}\` (level ${e.level})`).join(', ') : 'nothing found'}`);
  if (history.inFlight?.[r.id]) md.push(`- **Fix in flight:** ${history.inFlight[r.id].ticket} (filed ${history.inFlight[r.id].filedAt.slice(0, 10)}, level ${history.inFlight[r.id].level ?? '?'})`);
  if (r.fix) md.push(`- **Fix in place:** level ${r.fix.level}, ${r.fix.note} (landed ${r.fix.landedAt.slice(0, 16)}Z). ${r.sinceFix} of ${r.count} events came after it, in ${Math.round(r.fixHours)} hours; the week-over-week check starts next sweep.`);
  md.push(`- **Recommended fix level:** ${level(r.recommend)}. ${r.why}`);
  if (r.flag) md.push(`- **Flag:** ${r.flag}`);
  md.push('');
});
const candidates = ranked.filter((r) => r.distinct >= 2 && !history.inFlight?.[r.id] && (!r.fix || r.flag));
md.push('## Needs a fix drafted', '', 'Types seen in 2 or more distinct PRs or tickets with no fix in flight (or whose landed fix did not hold), in rank order. The weekly routine drafts tickets for these.', '');
candidates.slice(0, 15).forEach((r) => md.push(`- \`${r.id}\`: ${r.title} (${r.count} events, ${r.distinct} PRs/tickets; level ${r.recommend})`));
if (candidates.length > 15) md.push(`- and ${candidates.length - 15} more in the JSON report`);
md.push('');
md.push('## Fix ladder', '', ...Object.keys(LADDER).map((k) => `${k}. ${LADDER[k]}`), '');

const reportPath = path.join(OUT, 'reports', `${date}.md`);
if (DRY) { console.log(md.join('\n')); process.exit(0); }
fs.writeFileSync(reportPath, md.join('\n'));

history.weeks = history.weeks.filter((w) => w.date !== date);
history.weeks.push({
  date, since: SINCE.toISOString(), until: UNTIL.toISOString(), report: `reports/${date}.md`,
  types: Object.fromEntries(ranked.map((r) => [r.id, { count: r.count, distinct: r.distinct, ciMinutes: r.ciMinutes, humanMinutes: r.humanMinutes, recommend: r.recommend }])),
});
fs.writeFileSync(histFile, JSON.stringify(history, null, 2));
fs.writeFileSync(path.join(OUT, 'reports', `${date}.json`), JSON.stringify({ date, notes, ranked, draftCandidates: candidates.map((r) => r.id), inFlight: history.inFlight ?? {} }, null, 2));
console.log(reportPath);
