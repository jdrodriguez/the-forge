// control-config.mjs: reads and writes the config file for the Fleet view's levers (control.mjs), and the small
// helpers its operations share (control-ops.mjs). The levers act on the file's `dispatcher` section, which every
// machine's dispatcher reads on each tick.
//
// The write is the safety part. Other sessions and a sync tool may write the same file, so a write reads the file,
// changes the parsed copy, checks the file still holds what was read (its SHA-256), writes a temp file next to it and
// renames it over the original. A file that changed in between is never overwritten: the caller gets a CHANGED error
// and nothing is written. The layout stays the file's own (two-space JSON, key order kept, a newline at the end), so a
// write changes only the lines it means to.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (text) => createHash('sha256').update(text).digest('hex');
export const serialize = (root) => `${JSON.stringify(root, null, 2)}\n`;
const tmpOf = (file) => path.join(path.dirname(file), `.${path.basename(file)}.board-${process.pid}.tmp`);

// root is the whole file; cfg is its dispatcher section, which the operations change in place.
export function readConfig(file) {
  const text = fs.readFileSync(file, 'utf8');
  const root = JSON.parse(text);
  if (!root || typeof root !== 'object' || !root.dispatcher || typeof root.dispatcher !== 'object') {
    throw new Refusal(`${path.basename(file)} has no dispatcher section`, 500);
  }
  return { text, hash: sha(text), root, cfg: root.dispatcher };
}

// Writes `before.root` over the file only if the file still holds what `before` read. Returns whether the old text was
// already in the standard layout (false means this write also normalized its spacing, which the change log records).
// A config reached through a symlink (one file shared by every machine) is written at its target, so the link stays.
export function writeConfig(link, before) {
  const file = fs.realpathSync(link);
  const text = serialize(before.root);
  if (sha(fs.readFileSync(file, 'utf8')) !== before.hash) {
    throw Object.assign(new Error(`${path.basename(file)} changed while this change was being made (another session or a sync wrote it), so nothing was written. Try again.`), { code: 'CHANGED' });
  }
  fs.writeFileSync(tmpOf(file), text);
  fs.renameSync(tmpOf(file), file);
  return { standard: serialize(JSON.parse(before.text)) === before.text };
}

// Puts the text `before` read back over a write of `before.root`, if the file still holds what that write left. Used
// when the change log could not record the change, so the config never keeps a change the log does not know about.
export function restoreConfig(link, before) {
  const file = fs.realpathSync(link);
  if (fs.readFileSync(file, 'utf8') !== serialize(before.root)) return;
  fs.writeFileSync(tmpOf(file), before.text);
  fs.renameSync(tmpOf(file), file);
}

// A refusal the page shows as it is: a bad field, an unknown host or account, a value out of range.
export class Refusal extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}
export const refuse = (message, status, extra) => { throw new Refusal(message, status, extra); };

// Dotted paths into the config ('externalBuilders.fallback.enabled'). A missing parent reads as undefined.
export const getAt = (obj, keys) => keys.reduce((o, k) => (o == null ? undefined : o[k]), obj);
// Sets one key, creating missing parents as objects. A new key goes after `after` when that key exists in the parent,
// so a new setting or note lands next to the one it belongs with instead of at the end of the file.
export function setAt(obj, keys, value, after = null) {
  const parent = keys.slice(0, -1).reduce((o, k) => (o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {})), obj);
  const key = keys.at(-1);
  if (Object.hasOwn(parent, key) || !after || !Object.hasOwn(parent, after)) {
    parent[key] = value;
    return;
  }
  // Rebuild the keys after `after` so the new one sits right behind it; JSON keeps insertion order.
  const tail = Object.keys(parent).slice(Object.keys(parent).indexOf(after) + 1);
  const saved = tail.map((k) => [k, parent[k]]);
  for (const k of tail) delete parent[k];
  parent[key] = value;
  for (const [k, v] of saved) parent[k] = v;
}
export function deleteAt(obj, keys) {
  const parent = getAt(obj, keys.slice(0, -1));
  if (parent && typeof parent === 'object') delete parent[keys.at(-1)];
}

// A dated note line (the *Note fields record why each value is what it is):
// "2026-11-19 ~22:10Z, Alex via the board: maxWorkers 5 to 0 (wind down for a reboot); was 5."
export const stamp = (at) => `${at.slice(0, 10)} ~${at.slice(11, 16)}Z`;
export function appendNote(cfg, note, line) {
  const keys = note.at;
  const old = getAt(cfg, keys);
  setAt(cfg, keys, typeof old === 'string' && old.trim() ? `${old.trimEnd()} ${line}` : line, note.after ?? null);
}

// How a value reads in a note, the change log and the page. Account lists and model maps stay short.
export function show(v) {
  if (v === null || v === undefined) return 'none';
  if (v === true) return 'on';
  if (v === false) return 'off';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${show(x)}`).join(', ') || 'none';
  return String(v);
}

export const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}/g;

// Free text typed as the reason for a change: one line, no control characters, no email, at most 140 characters.
export function cleanWhy(why) {
  if (why == null || why === '') return null;
  if (typeof why !== 'string') refuse('why must be text');
  const one = why.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (one.length > 140) refuse('why is longer than 140 characters');
  if (one.match(EMAIL)) refuse('why may not hold an email address: accounts go by their letter');
  return one || null;
}

// An end time for a temporary change: an ISO instant at least a minute and at most 14 days ahead.
export function cleanUntil(until, now = Date.now()) {
  if (until == null || until === '') return null;
  const t = typeof until === 'string' ? Date.parse(until) : NaN;
  if (!Number.isFinite(t)) refuse('until must be an ISO date and time');
  if (t < now + 60_000) refuse('the end time must be at least a minute from now');
  if (t > now + 14 * 24 * 3.6e6) refuse('the end time must be within 14 days');
  return new Date(t).toISOString();
}

// An integer in [min, max], or null when nullable says "none" is allowed.
export function cleanInt(value, min, max, { nullable = false, name = 'value' } = {}) {
  if (value === null && nullable) return null;
  if (!Number.isInteger(value) || value < min || value > max) refuse(`${name} must be a whole number from ${min} to ${max}${nullable ? ', or none' : ''}`);
  return value;
}
export function cleanNumber(value, min, max, { nullable = false, name = 'value' } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) refuse(`${name} must be a number from ${min} to ${max}${nullable ? ', or none' : ''}`);
  return Math.round(value * 100) / 100;
}
export function cleanBool(value, name = 'value') {
  if (typeof value !== 'boolean') refuse(`${name} must be true or false`);
  return value;
}
