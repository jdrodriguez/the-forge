// herald-links.test.mjs: where a click on each herald notification goes (herald-links.mjs), checked on events step()
// makes from made-up snapshots, and the board address host-ok.mjs hands out. Run: node --test herald-links.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { step } from './herald-events.mjs';
import { boardUrl, eventUrl, sessionLink } from './herald-links.mjs';
import { boardAddress } from './host-ok.mjs';

const T0 = Date.parse('2026-11-25T15:00:00Z');
const B = 'https://board-mac.example-tailnet.ts.net/';
const links = { board: B, here: 'board-mac', repo: 'acme/app' };
let gen = 0;
const machine = (host, extra = {}) => ({ host, name: host, ok: true, paused: null, error: null, fetchedAt: '2026-11-25T14:59:00Z', ...extra });
const live = (id, extra = {}) => ({ id, label: id, host: 'board-mac', machine: 'board-mac', live: true, status: 'building', nickname: 'Rosie', title: 'T', ...extra });
function snap(over = {}) {
  gen += 1;
  return { generatedAt: new Date(T0 + gen * 1000).toISOString(), machines: [machine('board-mac'), machine('second-mac')],
    tickets: [live('ABC-1')], asks: [], sessions: { handled: {}, machines: [{ host: 'board-mac', rows: [] }, { host: 'second-mac', rows: [] }] },
    main: { status: 'green', sha: 'g1' }, errors: {}, ...over };
}
function events(a, b, now = T0 + 60_000) {
  return step(step(null, a, T0).state, b, now).events;
}
const urls = (evs) => Object.fromEntries(evs.map((e) => [e.key.split(':')[0], eventUrl(e, links)]));

test('a worker blocked, waiting, asking for a merge, stuck or failing CI opens its session panel', () => {
  const evs = events(snap({ tickets: [live('ABC-1'), live('ABC-2'), live('ABC-3'), live('ABC-4'), live('ABC-5')] }), snap({
    tickets: [live('ABC-1', { blockedSince: '2026-11-25T15:00:30Z' }), live('ABC-2', { waiting: true }), live('ABC-3', { status: 'merge-asked', prNumber: 7 }),
      live('ABC-4', { status: 'stuck', stuckAt: 'x' }), live('ABC-5', { pr: { number: 9, ci: { fail: ['lint'] } } })],
  }));
  assert.deepEqual(urls(evs), { blocked: `${B}#session=ABC-1`, ask: `${B}#session=ABC-2`, 'merge-ask': `${B}#session=ABC-3`,
    stuck: `${B}#session=ABC-4`, ci: `${B}#session=ABC-5` });
});

test('an ask with no worker opens the Queue at Needs you', () => {
  const [e] = events(snap(), snap({ asks: [{ id: 'ABC-9', question: 'Which?' }] }));
  assert.equal(eventUrl(e, links), `${B}#sec-needs`);
});

test('an app session opens in the Claude app on its own Mac, and its board panel from any other', () => {
  const sid = 'local_0a1b2c3d-1111-2222-3333-444455556666';
  const row = { id: sid, title: 'Specdesk', state: 'needs', activityAt: T0 + 30_000 };
  const sess = (host) => ({ handled: {}, machines: [{ host: 'board-mac', rows: host === 'board-mac' ? [row] : [] }, { host: 'second-mac', rows: host === 'board-mac' ? [] : [row] }] });
  const [here] = events(snap(), snap({ sessions: sess('board-mac') }));
  assert.equal(eventUrl(here, links), `claude://code/continue?session=${sid}`);
  const [there] = events(snap(), snap({ sessions: sess('second-mac') }));
  assert.equal(eventUrl(there, links), `${B}#sessions/${sid}`);
  assert.equal(sessionLink('board-mac', 'local_x;rm', links), `${B}#sessions`);
});

test('a machine out of reach or paused opens its Fleet card', () => {
  const down = machine('second-mac', { ok: false, error: 'ssh timed out' });
  const a = snap(), b = snap({ machines: [machine('board-mac'), down] }), c = snap({ machines: [machine('board-mac'), down] });
  const s1 = step(null, a, T0).state;
  const s2 = step(s1, b, T0 + 1000).state;
  const [e] = step(s2, c, T0 + 2000).events;
  assert.equal(eventUrl(e, links), `${B}#fleet/second-mac`);
  const [p] = events(snap(), snap({ machines: [machine('board-mac', { paused: 'by hand' }), machine('second-mac')] }));
  assert.equal(eventUrl(p, links), `${B}#fleet/board-mac`);
});

test('main red opens the failing run, or main\'s runs when the run is unknown', () => {
  const run = 'https://github.com/acme/app/actions/runs/123456';
  const [e] = events(snap(), snap({ main: { status: 'red', sha: 'r1', run } }));
  assert.equal(eventUrl(e, links), run);
  const [f] = events(snap(), snap({ main: { status: 'red', sha: 'r2', run: 'javascript:alert(1)' } }));
  assert.equal(eventUrl(f, links), 'https://github.com/acme/app/actions?query=branch%3Amain');
});

test('the reminder opens Needs you; a merge and main green have no link (sound only)', () => {
  assert.equal(eventUrl({ kind: 'reminder', key: 'reminder' }, links), `${B}#sec-needs`);
  assert.equal(eventUrl({ kind: 'merge', key: 'merged:ABC-1', who: { id: 'ABC-1' } }, links), null);
  assert.equal(eventUrl({ kind: 'mainGreen', key: 'green:g1' }, links), null);
});

test('the board address comes from the snapshot, else this Mac\'s name in place of loopback', () => {
  assert.equal(boardUrl({ board: { url: B } }, 'http://127.0.0.1:8787', 'board-mac'), B);
  assert.equal(boardUrl({}, 'http://127.0.0.1:8787', 'board-mac'), 'http://board-mac:8787/');
  assert.equal(boardUrl({ board: { url: 'javascript:x' } }, 'http://board-mac:8787', 'second-mac'), 'http://board-mac:8787/');
});

test('the board hands out its HTTPS name only when tailscale serve proxies its own port', () => {
  const ts = 'board-mac.example-tailnet.ts.net';
  const status = (port) => ({ Web: { [`${ts}:443`]: { Handlers: { '/': { Proxy: `http://127.0.0.1:${port}` } } } } });
  assert.equal(boardAddress(status(8787), { tsName: ts, me: 'board-mac', port: 8787 }), `https://${ts}/`);
  assert.equal(boardAddress(status(8787), { tsName: ts, me: 'board-mac', port: 8792 }), 'http://board-mac:8792/');
  assert.equal(boardAddress(null, { tsName: null, me: 'board-mac', port: 8787 }), 'http://board-mac:8787/');
});
