// coverage.mjs: checks a config against the example and docs/configuration.md. A key the example does not have is a
// typo or a key no component reads, and a section docs/configuration.md has no row for is a key nobody documented.
// Tests run it on every config init writes, and doctor runs it on the person's config.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.mjs';
import { readExample, stripNotes } from './answers.mjs';

// Maps whose keys are names the person picks (host names, realm keys, environment names). Every entry in one is held
// to the fields the example's entries have between them.
const NAMED = ['dispatcher.hosts', 'queueBoard.ssh', 'queueBoard.names', 'queueBoard.realms', 'queueBoard.nicknames',
  'learning.ssh', 'merge.repos', 'push.env', 'dispatcher.externalBuilders.fallback.env'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// The example's shape for a named map: the union of its entries' fields, or a leaf when the entries are not objects.
function namedShape(exMap) {
  const entries = Object.values(exMap ?? {});
  if (!entries.length || !entries.every(isObj)) return null;
  return Object.assign({}, ...entries);
}

// Paths in cfg the example has no place for, e.g. ["dispatcher.hosts.box.maxWorker"].
export function unknownKeys(cfg, example = readExample()) {
  const ex = stripNotes(example);
  const out = [];
  const walk = (v, shape, at) => {
    if (!isObj(v)) return;
    for (const [k, x] of Object.entries(v)) {
      if (k === '//' || k.endsWith('Note')) continue; // documentation, which the loader drops
      const p = at ? `${at}.${k}` : k;
      if (NAMED.includes(at)) {
        const s = namedShape(shape);
        if (s && isObj(x)) walk(x, s, `${at}.*`);
        continue;
      }
      if (!isObj(shape) || !(k in shape)) {
        out.push(p.replaceAll('.*', ''));
        continue;
      }
      // A key the example leaves null (weather, say) takes whatever shape its Note describes.
      if (shape[k] !== null) walk(x, shape[k], p);
    }
  };
  walk(cfg, ex, '');
  return out;
}

// Sections and top-level keys of cfg that docs/configuration.md has no row for.
export function undocumentedKeys(cfg, docFile = path.join(ROOT, 'docs/configuration.md')) {
  const doc = fs.readFileSync(docFile, 'utf8');
  const rows = new Set([...doc.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]));
  const out = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (k === '//' || k.endsWith('Note')) continue;
    if (isObj(v)) {
      for (const sub of Object.keys(v)) if (!sub.endsWith('Note') && !rows.has(`${k}.${sub}`)) out.push(`${k}.${sub}`);
    } else if (!rows.has(k)) out.push(k);
  }
  return out;
}
