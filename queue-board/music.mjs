// music.mjs: the music library behind the header player (music.js): the owner's own MP3s on this Mac, in
// queueBoard.musicDir (default ~/Music) unless QUEUE_BOARD_MUSIC names another folder. GET /api/music lists every MP3 under that
// folder, one album per subfolder, rescanning at most every few seconds so a new album shows up on its own. GET
// /music/<id> serves one file with HTTP Range, so the browser can seek. The board only reads the folder: it never
// copies, moves or uploads a file, and the files stay out of the repo. A request names a track only by its id, an
// opaque hash of its path that is looked up among the files the last scan found, so no path from a request ever
// reaches the filesystem. A link in the folder is skipped, so nothing outside it is served either.
// Alerts come before the music: just before an alert sound plays, the herald (POST /api/alert) or the settings' Test
// button (board.mjs) says so here, and every page playing music hears it at once on its event stream (GET /api/events)
// and ducks the music for the cue's length and a second more. The herald's warning also says whose calls the cue is for,
// and the Middle-earth view, listening on the same stream, shows who is calling (scene-call.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream';
import { CUES, boardConfig } from './sound.mjs';

const ROOT = path.resolve(process.env.QUEUE_BOARD_MUSIC || boardConfig().qb.musicDir || path.join(os.homedir(), 'Music'));
const SCAN_MS = 5000;
const DEPTH = 3;
let lib = { at: 0, tracks: [], files: new Map(), error: null };

// Store-bought MP3 file names often put the disc and track ahead of the title ("(Disc 2) 05 - Rivendell") and write "_" for the
// characters a file name can't hold: a slash (" _ "), quotation marks ("_In Dreams_") and a colon ("Prologue_ One").
export function cleanTitle(name) {
  let s = name.normalize('NFC').replace(/\.mp3$/i, '');
  const disc = Number(s.match(/^\(Disc (\d+)\)\s*/i)?.[1] ?? 1);
  s = s.replace(/^\(Disc \d+\)\s*/i, '');
  const track = Number(s.match(/^(\d+)\s*-\s*/)?.[1] ?? 0);
  const title = s.replace(/^\d+\s*-\s*/, '')
    .replace(/\s*\[Explicit\]/gi, '')
    .replace(/ _ /g, ' / ')
    .replace(/(^|[\s(])_([^_]+)_(?=$|[\s),.\]])/g, '$1“$2”')
    .replace(/(\S)_ /g, '$1: ')
    // A quotation the file name cut short keeps its opening mark.
    .replace(/(^|[\s(])_(?=\S)/g, '$1“')
    .trim();
  // A name cut short at the file name's length limit stops inside its parenthesis; it gets an ellipsis and its closing marks.
  if (!/\([^)]*$/.test(title)) return { disc, track, title };
  return { disc, track, title: `${title}…${/“[^”]*$/.test(title) ? '”' : ''})` };
}

function scan() {
  const tracks = [];
  const files = new Map();
  const walk = (dir, depth) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const full = path.join(dir, d.name);
      // A Dirent describes the entry itself, so a symbolic link is neither a directory nor a file here.
      if (d.isDirectory() && depth < DEPTH) walk(full, depth + 1);
      else if (d.isFile() && /\.mp3$/i.test(d.name)) {
        const id = crypto.createHash('sha256').update(path.relative(ROOT, full).normalize('NFC')).digest('hex').slice(0, 16);
        tracks.push({ id, album: dir === ROOT ? '' : path.basename(dir).normalize('NFC'), ...cleanTitle(d.name) });
        files.set(id, full);
      }
    }
  };
  try {
    walk(ROOT, 0);
  } catch (e) {
    return { at: Date.now(), tracks: [], files, error: e.code === 'ENOENT' ? 'no music folder' : e.message };
  }
  tracks.sort((a, b) => a.album.localeCompare(b.album) || a.disc - b.disc || a.track - b.track || a.title.localeCompare(b.title));
  return { at: Date.now(), tracks, files, error: null };
}
const library = (force = false) => (force || Date.now() - lib.at > SCAN_MS ? (lib = scan()) : lib);

export function musicList() {
  const l = library();
  return { root: ROOT.replace(os.homedir(), '~'), tracks: l.tracks, error: l.error };
}

// Streams one track: the whole file, or the one byte range asked for (206). Anything else in Range is ignored, which
// HTTP allows, so the whole file goes out.
export function musicFile(req, res, id) {
  const head = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const file = /^[0-9a-f]{16}$/.test(id) ? (library().files.get(id) ?? library(true).files.get(id)) : null;
  let size = 0;
  try { if (file) size = fs.statSync(file).size; } catch { /* gone since the scan */ }
  if (!size) {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end('not found');
  }
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  let start = 0;
  let end = size - 1;
  if (r && (r[1] || r[2])) {
    if (r[1]) {
      start = Number(r[1]);
      if (r[2]) end = Math.min(Number(r[2]), size - 1);
    } else start = Math.max(0, size - Number(r[2]));
    if (start > end) {
      res.writeHead(416, { ...head, 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...head, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
  } else res.writeHead(200, { ...head, 'Content-Length': size });
  return pipeline(fs.createReadStream(file, { start, end }), res, () => {});
}

// --- alerts ahead of the music ----------------------------------------------------------------------------------
// Every open event stream. Only a page whose music is on keeps one, so a tab without music holds no connection.
const listeners = new Set();
const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
// A comment line every 25 seconds keeps an idle stream from being dropped along the way.
setInterval(() => { for (const res of listeners) res.write(': still here\n\n'); }, 25_000).unref();

export function musicEvents(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', ...noStore });
  res.write('retry: 3000\n\n');
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
  res.on('error', () => listeners.delete(res));
}

// Tells every listening page that cue is about to sound for seconds, and whose calls it sounds for (the herald's, each
// { id, at, kind, head, who }; none for a Test button). Answers how many pages heard it.
export function alertPages(cue, seconds, calls = []) {
  const line = `event: alert\ndata: ${JSON.stringify({ cue, seconds, calls })}\n\n`;
  for (const res of listeners) res.write(line);
  return listeners.size;
}

// A call as the herald sends it, its strings cut to size and anything else dropped, or null when it is not one.
const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
function callOf(c) {
  if (!c || typeof c.id !== 'string' || !Number.isFinite(c.at)) return null;
  const w = c.who && typeof c.who === 'object' ? { host: str(c.who.host, 80), id: str(c.who.id, 40), session: str(c.who.session, 80), name: str(c.who.name, 60) } : null;
  return { id: c.id.slice(0, 160), at: c.at, kind: str(c.kind, 20) ?? 'needs', head: str(c.head, 200) ?? '', who: w?.host ? w : null };
}

// POST /api/alert from the herald: only from this Mac itself, with the board's X-Board header rule, and a known cue.
// from is the caller as board.mjs reads it (callerOf in host-ok.mjs), so a phone on the HTTPS address is not this Mac.
export async function musicAlert(req, res, from) {
  const answer = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', ...noStore }); res.end(JSON.stringify(body)); };
  if (from !== '127.0.0.1' && from !== '::1') return answer(403, { ok: false, error: 'only from this Mac' });
  if (req.headers['x-board'] !== 'alert' || !/^application\/json/.test(req.headers['content-type'] ?? '')) return answer(403, { ok: false, error: 'missing header' });
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8000) return answer(413, { ok: false, error: 'too long' });
  }
  let a;
  try { a = JSON.parse(body); } catch { return answer(400, { ok: false, error: 'bad JSON' }); }
  if (!Object.hasOwn(CUES, a?.cue ?? '') || !(typeof a.seconds === 'number' && a.seconds > 0 && a.seconds <= 60)) return answer(400, { ok: false, error: 'cue and seconds expected' });
  const calls = Array.isArray(a.calls) ? a.calls.slice(0, 6).map(callOf).filter(Boolean) : [];
  return answer(200, { ok: true, heard: alertPages(a.cue, a.seconds, calls) });
}
