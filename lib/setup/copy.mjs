// copy.mjs: the lasting copy of The Forge, the links that let Claude Code find its skills, and the copy on the other
// computers. A copy run through npx sits in npm's cache, which can be cleaned at any time, so setup copies the package
// to a folder that stays (default ~/the-forge) and every job points there.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { home, isTemporary, run, say, tilde, warn } from './sh.mjs';

// Never copied over a lasting copy: the person's own files, and anything a run leaves behind.
const KEEP = new Set(['agent-queue.config.json', 'forge-answers.json']);
const SKIP = new Set(['.git', 'node_modules', '.claude', '.DS_Store', '__pycache__']);
const skip = (name) => SKIP.has(name) || name.endsWith('.log');

// [link, target] pairs: the skills and scripts Claude Code finds by name in ~/.claude, and the-forge on PATH.
export function linkTargets(root) {
  const c = path.join(home(), '.claude');
  return [
    [path.join(c, 'skills/forge-setup'), path.join(root, 'skills/forge-setup')],
    [path.join(c, 'skills/forge-takeover'), path.join(root, 'skills/forge-takeover')],
    [path.join(c, 'skills/specdesk'), path.join(root, 'specdesk/skill')],
    [path.join(c, 'skills/fleet'), path.join(root, 'fleet')],
    [path.join(c, 'scripts/ask-human.sh'), path.join(root, 'inbox/ask-human.sh')],
    [path.join(home(), '.local/bin/the-forge'), path.join(root, 'bin/the-forge.mjs')],
  ];
}

// Why dest cannot take a copy, or null: a folder that exists, holds anything, and is not already a copy of The Forge
// (its package.json names the-forge and it has the command) is someone's own folder, which a copy would write over.
export function foreignFolder(dest) {
  let names;
  // The config and answers alone are what a copy keeps, so a folder holding only those is one of ours.
  try { names = fs.readdirSync(dest).filter((n) => n !== '.DS_Store' && !KEEP.has(n)); } catch { return null; }
  if (!names.length) return null;
  try {
    // A copy made before the package took its scoped name still carries the old name.
    const { name } = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
    if (['@jdrodriguez/the-forge', 'the-forge'].includes(name) && fs.existsSync(path.join(dest, 'bin/the-forge.mjs'))) return null;
  } catch { /* no package.json of The Forge */ }
  return `${tilde(dest)} already holds files and is not a copy of The Forge, so copying there would write over them. Pick an empty or new folder with --dir, or leave --dir out for ~/the-forge.`;
}

// Copies the package at src into dest, leaving dest's config and answers alone. Returns the files written.
export function copyPackage(src, dest, { dry = false } = {}) {
  let n = 0;
  // Real paths, so a --dir that is a link into the package is still caught.
  const real = (p) => {
    try { return fs.realpathSync(p); } catch { return path.join(real(path.dirname(p)), path.basename(p)); }
  };
  if (!dry) fs.mkdirSync(dest, { recursive: true });
  const target = real(path.resolve(dest));
  const walk = (from, to, top) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (skip(e.name) || (top && KEEP.has(e.name))) continue;
      const a = path.join(from, e.name);
      if (real(a) === target) continue; // a lasting copy inside the package is never copied into itself
      const b = path.join(to, e.name);
      if (e.isDirectory()) {
        if (!dry) fs.mkdirSync(b, { recursive: true });
        walk(a, b, false);
      } else if (e.isFile()) {
        if (!dry) {
          fs.copyFileSync(a, b);
          fs.chmodSync(b, fs.statSync(a).mode & 0o777);
        }
        n++;
      }
    }
  };
  walk(src, dest, true);
  return n;
}

// Points each link at the lasting copy. A link that already points there is left. A link that points somewhere else,
// or a real file or folder in the way, is left alone and reported, unless force is set, which replaces links only.
export function linkSkills(root, { dry = false, force = false } = {}) {
  const out = [];
  for (const [link, target] of linkTargets(root)) {
    let cur = null;
    try { cur = fs.readlinkSync(link); } catch { /* not a link */ }
    const exists = fs.existsSync(link) || cur !== null;
    if (cur && path.resolve(path.dirname(link), cur) === target) {
      out.push({ link, state: 'ok' });
      continue;
    }
    if (exists && (cur === null || !force)) {
      out.push({ link, state: 'left', why: cur ? `points at ${cur}` : 'is a real file or folder' });
      continue;
    }
    if (!dry) {
      fs.mkdirSync(path.dirname(link), { recursive: true });
      if (cur) fs.rmSync(link);
      fs.symlinkSync(target, link);
    }
    out.push({ link, state: cur ? 'relinked' : 'linked' });
  }
  return out;
}

export function reportLinks(rows, dry) {
  for (const r of rows) {
    const shown = tilde(r.link);
    if (r.state === 'left') warn(`left ${shown}: it ${r.why}. Run setup with --force-links to repoint a link (a real folder is never replaced).`);
    else say(`${dry && r.state !== 'ok' ? `would be ${r.state}` : r.state}: ${shown}`);
  }
  const bin = path.join(home(), '.local/bin');
  if (!(process.env.PATH ?? '').split(path.delimiter).includes(bin)) say(`note: ${tilde(bin)} is not on your PATH, so run The Forge as node ${tilde(path.join(bin, 'the-forge'))} or add that folder to PATH.`);
}

// Where the lasting copy goes: --dir, else this package itself when it is already a lasting folder, else ~/the-forge.
export function copyDirFor(root, dirArg) {
  if (dirArg) return path.resolve(dirArg.replace(/^~(?=$|\/)/, home()));
  return isTemporary(root) ? path.join(home(), 'the-forge') : root;
}

// The other computer's folder as a word for its shell: ~/x becomes "$HOME"/x, so it expands there.
export const remoteWord = (p) => (p === '~' ? '"$HOME"' : p.startsWith('~/') ? `"$HOME"/'${p.slice(2).replaceAll("'", "'\\''")}'` : `'${p.replaceAll("'", "'\\''")}'`);
const REMOTE_PATH = 'export PATH=/opt/homebrew/bin:/usr/local/bin:"$HOME"/.local/bin:$PATH';

// Copies the lasting copy (code, config and answers) to another computer over ssh, then links the skills there.
export function copyTo(root, cfg, host, { install = false, dry = false } = {}) {
  const dest = cfg.queueBoard?.ssh?.[host] ?? host;
  // The loader expands ~/, so a folder under this home is taken as the same folder under the other computer's home,
  // as the board does.
  const rr = tilde(cfg.queueBoard?.remoteRoot ?? root);
  const R = remoteWord(rr);
  const steps = [
    // -- ends ssh's options, so a destination can never be read as one.
    ['ssh', ['-o', 'BatchMode=yes', '--', dest, `mkdir -p ${R}`]],
    ['tar|ssh', ['--', dest, `tar -xf - -C ${R}`]],
    ['ssh', ['-o', 'BatchMode=yes', '--', dest, `${REMOTE_PATH}; node ${R}/bin/the-forge.mjs setup --here --no-start`]],
    ...(install ? [['ssh', ['-t', '--', dest, `${REMOTE_PATH}; node ${R}/bin/the-forge.mjs install`]]] : []),
  ];
  if (dry) {
    for (const [c, a] of steps) say(`would run: ${c} ${a.join(' ')}`);
    return true;
  }
  say(`copying ${tilde(root)} to ${host} (${dest}:${rr})`);
  for (const [c, a] of steps) {
    let ok;
    if (c === 'tar|ssh') {
      const excl = [...SKIP].map((s) => `--exclude=${s}`).concat('--exclude=*.log');
      const tar = spawnSync('tar', ['-cf', '-', ...excl, '-C', root, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 1 << 30 });
      if (tar.status !== 0) return warn(`could not pack ${root}: ${String(tar.stderr).trim()}`), false;
      ok = spawnSync('ssh', ['-o', 'BatchMode=yes', ...a], { input: tar.stdout, stdio: ['pipe', 'inherit', 'inherit'] }).status === 0;
    } else {
      ok = spawnSync(c, a, { stdio: 'inherit' }).status === 0;
    }
    if (!ok) return warn(`stopped: ${c} ${a.slice(-1)[0]} failed on ${host}. Check that ssh ${dest} works without a password (the-forge doctor).`), false;
  }
  say(`${host} has the copy at ${rr}${install ? ' and its jobs are installed' : `. Next: ssh -t ${dest} 'node ${rr}/bin/the-forge.mjs install'`}`);
  return true;
}

// Refreshes the lasting copy: a git checkout pulls, a copied package takes the files of the package running now.
export function refresh(root, dest, { dry = false } = {}) {
  // Checked first: a folder that is not The Forge's is never pulled or written over.
  const why = foreignFolder(dest);
  if (why) return warn(why), false;
  if (fs.existsSync(path.join(dest, '.git'))) {
    if (dry) return say(`would run: git -C ${dest} pull --ff-only`), true;
    const r = run('git', ['-C', dest, 'pull', '--ff-only'], { timeout: 120_000 });
    say((r.stdout + r.stderr).trim());
    return r.ok;
  }
  if (path.resolve(root) === path.resolve(dest)) {
    warn('This is the lasting copy itself. To update it, run the newest package: npx @jdrodriguez/the-forge@latest update (or npx github:jdrodriguez/the-forge update).');
    return false;
  }
  const n = copyPackage(root, dest, { dry });
  say(`${dry ? 'would refresh' : 'refreshed'} ${n} files in ${tilde(dest)}; your config and answers were kept`);
  return true;
}
