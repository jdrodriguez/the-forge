#!/usr/bin/env node
// the-forge: sets up and runs The Forge on this computer. docs/setup.md is the guide; the-forge <command> --help says
// what each command does. No dependencies, and no command asks for, stores or prints a password, token or key.
import fs from 'node:fs';
import path from 'node:path';
import { configPath, loadConfig, ROOT } from '../lib/config.mjs';
import { buildConfig, checkAnswers } from '../lib/setup/answers.mjs';
import { copyDirFor, copyPackage, copyTo, foreignFolder, linkSkills, refresh, reportLinks } from '../lib/setup/copy.mjs';
import { unknownKeys } from '../lib/setup/coverage.mjs';
import { doctor, printDoctor, toolChecks } from '../lib/setup/doctor.mjs';
import { anyInstalled, install, jobsHere, open, startStop, status, uninstall } from '../lib/setup/jobs.mjs';
import { DEFAULT_COPY, isTemporary, runLive, say, tilde, warn, which } from '../lib/setup/sh.mjs';

const HELP = {
  '': `the-forge: set up and run The Forge, a spec desk and an agent queue for Claude Code.

Usage: the-forge <command> [options]

  setup      copy The Forge to a lasting folder, link its skills, and start the setup interview in Claude Code
  init       write agent-queue.config.json from an answers file
  doctor     check this computer: programs, sign-ins, the config, the other computers
  install    install this computer's scheduled jobs (dispatcher, and on the board's computer the board and herald)
  uninstall  remove those jobs
  start      load the installed jobs
  stop       unload them (their files stay, so start brings them back)
  status     show each job, the board and whether the dispatcher is paused
  open       open the board in a browser
  update     refresh the lasting copy and reload the jobs
  copy-to    copy the lasting copy and config to another computer over ssh

the-forge <command> --help says more. docs/setup.md is the full guide.`,
  setup: `Usage: the-forge setup [--dir <folder>] [--here] [--no-start] [--force-links] [--dry-run]

Copies The Forge to a folder that stays (default ${DEFAULT_COPY}). A copy npx unpacked sits in npm's cache, which
can be cleaned at any time, and a global install sits under node_modules, which npm replaces on upgrade, so the
config and the scheduled jobs live in the lasting copy. Then it lists the programs this
computer is missing, links the skills into ~/.claude (forge-setup, specdesk, fleet, and ask-human.sh) and the-forge
into ~/.local/bin, and starts Claude Code on the forge-setup skill, which interviews you and does the rest.

  --dir <folder>  where the lasting copy goes
  --here          use this copy as the lasting one (a git clone, or a copy-to on another computer)
  --no-start      stop after the links; do not start Claude Code
  --force-links   repoint links that point somewhere else (a real file or folder is never replaced)
  --dry-run       say what would happen and change nothing`,
  init: `Usage: the-forge init --answers <file> [--out <file>] [--dry-run]

Writes agent-queue.config.json from the answers file the forge-setup skill writes (docs/setup.md, "The answers
file"). It asks no questions. An existing config is kept as <file>.bak-<time> first, and the answers are kept next
to the config as forge-answers.json, where the next init (adding a computer, say) starts from.

  --out <file>  write here (default: AGENT_QUEUE_CONFIG, else agent-queue.config.json in the lasting copy)
  --dry-run     print the config instead of writing it`,
  doctor: `Usage: the-forge doctor [--json]

Checks node, git, jq, curl, perl, gh and its sign-in, Claude Code, each Claude account this computer uses, Codex and
Grok where this computer runs them (hosts.<name>.engines), Tailscale and ssh to each other computer (from the board's computer), the Linear
key, the config against the example, and the skill links. It only reads, apart from the engine check's own
10-minute cache. Exits 1 when something is missing.

  --json  print the checks as JSON`,
  install: `Usage: the-forge install [--dry-run]

Installs this computer's jobs from the lasting copy: the dispatcher on every queue computer, and on the board's
computer the red-main watcher, the board and (macOS) the herald. launchd on macOS, systemd user units on Linux.`,
  uninstall: 'Usage: the-forge uninstall [--dry-run]\n\nRemoves the jobs install put on this computer.',
  start: 'Usage: the-forge start [--dry-run]\n\nLoads every installed job that is not running.',
  stop: 'Usage: the-forge stop [--dry-run]\n\nUnloads the jobs and keeps their files. To hold the whole queue instead, run node dispatcher/dispatcher.mjs pause "reason".',
  status: 'Usage: the-forge status [--json]\n\nShows each job on this computer, whether the board answers, and whether the dispatcher is paused.',
  open: 'Usage: the-forge open [--print]\n\nOpens the board in a browser. --print only prints its address.',
  update: `Usage: the-forge update [--dir <folder>] [--all] [--dry-run]

Refreshes the lasting copy: a git clone pulls, a copied package takes the files of the package running now (so run it
as npx the-forge@latest update). Your config and answers stay. Installed jobs are reloaded.

  --all  also copy the result to every other computer and reload their jobs (copy-to --install)`,
  'copy-to': `Usage: the-forge copy-to <computer> [--install] [--dry-run]

Copies the lasting copy, with its config and answers, to queueBoard.remoteRoot on another computer over ssh, then runs
setup --here --no-start there to link its skills. The computer is a host name from the config.

  --install  also install that computer's jobs (ssh -t, so you see its output)`,
};

function parse(argv) {
  const [cmd = '', ...rest] = argv;
  const opts = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) opts._.push(a);
    else if (['--dir', '--answers', '--out'].includes(a)) opts[a.slice(2)] = rest[++i];
    else opts[a.slice(2)] = true;
  }
  return { cmd, opts };
}

function setup(o) {
  const dry = Boolean(o['dry-run']);
  const dest = o.here ? ROOT : copyDirFor(ROOT, o.dir);
  if (dest !== ROOT) {
    const why = foreignFolder(dest);
    if (why) return warn(why), 1;
    const n = copyPackage(ROOT, dest, { dry });
    say(`${dry ? 'would copy' : 'copied'} ${n} files to ${tilde(dest)}, the lasting copy`);
  } else if (isTemporary(dest)) {
    warn(`${dest} is in npm's cache or node_modules, which npm replaces; pass --dir or drop --here`);
    return 1;
  } else say(`the lasting copy is ${tilde(dest)}`);

  const checks = [];
  toolChecks(checks);
  const missing = checks.filter((c) => !c.ok);
  for (const c of missing) say(`missing: ${c.name} (${c.detail}). ${c.fix}`);
  if (!missing.length) say('every program The Forge needs is here');
  reportLinks(linkSkills(dest, { dry, force: Boolean(o['force-links']) }), dry);

  if (o['no-start']) return 0;
  if (!which('claude')) {
    say('\nClaude Code is not installed. Install it, sign in, then run this again:');
    say('  curl -fsSL https://claude.ai/install.sh | bash      (or: npm install -g @anthropic-ai/claude-code)');
    say(`  node ${tilde(path.join(dest, 'bin/the-forge.mjs'))} setup --here`);
    return 1;
  }
  if (dry) return say(`would start: claude /forge-setup (in ${tilde(dest)})`), 0;
  say('\nStarting Claude Code on the forge-setup skill. It asks one question at a time.');
  return runLive('claude', ['/forge-setup'], { cwd: dest }).ok ? 0 : 1;
}

function init(o) {
  if (!o.answers) return warn(HELP.init), 2;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(o.answers, 'utf8'));
  } catch (e) {
    return warn(`could not read ${o.answers}: ${e.message}`), 1;
  }
  const { answers, errors } = checkAnswers(raw);
  if (errors.length) return warn(`The answers file has ${errors.length} problem(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`), 1;
  const copyDir = answers.copyDir ?? (isTemporary(ROOT) ? DEFAULT_COPY : tilde(ROOT));
  const cfg = buildConfig(answers, { copyDir, answersFile: path.basename(o.answers) });
  const unknown = unknownKeys(cfg);
  // A key the example lacks is one no component of this copy reads, and doctor would reject the config.
  if (unknown.length) return warn(`This copy of The Forge has no config key for ${unknown.join(', ')}. Update it (the-forge update), or leave that answer out.`), 1;
  const text = `${JSON.stringify(cfg, null, 2)}\n`;
  if (o['dry-run']) return process.stdout.write(text), 0;
  const out = path.resolve(o.out ?? configPath());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) {
    const bak = `${out}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(out, bak);
    say(`kept the old config as ${tilde(bak)}`);
  }
  fs.writeFileSync(out, text);
  const keep = path.join(path.dirname(out), 'forge-answers.json');
  if (path.resolve(o.answers) !== keep) fs.writeFileSync(keep, `${JSON.stringify(raw, null, 2)}\n`);
  const hosts = answers.computers.map((c) => c.host).join(', ');
  say(`wrote ${tilde(out)} for ${answers.computers.length} computer(s) (${hosts}), board on ${cfg.queueBoard.host}`);
  return 0;
}

async function update(o) {
  const dry = Boolean(o['dry-run']);
  const dest = copyDirFor(ROOT, o.dir);
  if (!refresh(ROOT, dest, { dry })) return 1;
  const node = process.execPath;
  const self = path.join(dest, 'bin/the-forge.mjs');
  // The config is the lasting copy's, also when this runs from a newer package in npm's cache.
  const own = path.join(dest, 'agent-queue.config.json');
  if (process.env.AGENT_QUEUE_CONFIG && path.resolve(process.env.AGENT_QUEUE_CONFIG) !== own) warn(`ignoring AGENT_QUEUE_CONFIG: update reinstalls the jobs with ${tilde(own)}`);
  process.env.AGENT_QUEUE_CONFIG = own;
  if (anyInstalled()) {
    if (dry) say(`would run: node ${self} install`);
    else if (!runLive(node, [self, 'install']).ok) return 1;
  }
  if (!o.all) return 0;
  const cfg = loadConfig({ fresh: true });
  const others = (cfg.dispatcher?.enabledHosts ?? []).filter((h) => h.toLowerCase() !== jobsHere(cfg).host.toLowerCase());
  let ok = true;
  for (const h of others) ok = runLive(node, [self, 'copy-to', h, '--install', ...(dry ? ['--dry-run'] : [])]).ok && ok;
  return ok ? 0 : 1;
}

async function main() {
  const { cmd, opts: o } = parse(process.argv.slice(2));
  if (cmd === '' || cmd === '--help' || cmd === '-h' || cmd === 'help') return say(HELP['']), 0;
  if (!(cmd in HELP)) return warn(`unknown command: ${cmd}\n\n${HELP['']}`), 2;
  if (o.help || o.h) return say(HELP[cmd]), 0;
  const dry = Boolean(o['dry-run']);
  switch (cmd) {
    case 'setup': return setup(o);
    case 'init': return init(o);
    case 'doctor': {
      const res = doctor();
      if (o.json) say(JSON.stringify(res, null, 2));
      else printDoctor(res);
      return res.ok ? 0 : 1;
    }
    case 'install': return install({ dry }) ? 0 : 1;
    case 'uninstall': return uninstall({ dry }) ? 0 : 1;
    case 'start': case 'stop': return startStop(cmd, { dry }) ? 0 : 1;
    case 'status': return (await status({ json: Boolean(o.json) })), 0;
    case 'open': return open({ print: Boolean(o.print) }) ? 0 : 1;
    case 'update': return update(o);
    case 'copy-to': {
      if (!o._[0]) return warn(HELP['copy-to']), 2;
      if (isTemporary(ROOT)) return warn('Run copy-to from the lasting copy (the-forge setup makes it).'), 1;
      // copy-to sends the lasting copy's own config; another computer reads its config from there.
      if (path.resolve(configPath()) !== path.join(ROOT, 'agent-queue.config.json')) {
        return warn(`AGENT_QUEUE_CONFIG points at ${configPath()}, but copy-to sends ${tilde(path.join(ROOT, 'agent-queue.config.json'))}. Write the config there (init --out) or unset AGENT_QUEUE_CONFIG.`), 1;
      }
      return copyTo(ROOT, loadConfig({ fresh: true }), o._[0], { install: Boolean(o.install), dry }) ? 0 : 1;
    }
  }
  return 2;
}

main().then((code) => { process.exitCode = code ?? 0; }, (e) => {
  warn(`the-forge: ${e.message}`);
  process.exitCode = 1;
});
