// queue-view.test.mjs: node --test queue-view.test.mjs. The Queue's Needs you rows (queue-view.js queueNeeds): the
// signed-out accounts fold into one row, a row with a question opens in place, and every other row lands on what it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(snap) {
  const ctx = { snap, document: { addEventListener() {} }, CSS: { escape: (s) => s } };
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(new URL('./queue-view.js', import.meta.url), 'utf8')}\nthis.queueNeeds = queueNeeds;`, ctx);
  return ctx.queueNeeds;
}
const worker = { id: 'ABC-1', live: true, nickname: 'Rosie', question: 'Which way?' };
const base = { tickets: [worker, { id: 'ABC-2', live: true, nickname: 'Sam' }], asks: [{ id: 'ABC-9', title: '[Decision] Pick one', question: 'Context. Question: A or B?', recommend: 'A' }] };

test('signed-out accounts fold into one row that opens Fleet, red when any of them was', () => {
  const rows = load(base)([
    { sev: 'warn', kind: 'Signed out', host: 'h1', title: 'Mac', when: '2026-11-20T00:00:00Z', text: 'Account c, x@y (max), is signed out on Mac' },
    { sev: 'warn', kind: 'Signed out', host: 'h2', title: 'Second', when: '2026-11-19T00:00:00Z', text: 'Account a is signed out on Second' },
    { sev: 'bad', kind: 'Decision', id: 'ABC-8', title: '[Decision] Fleet account h needs a login', url: 'https://linear.app/x/ABC-8' },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].kind, rows[0].sev, rows[0].href, rows[0].line, rows[0].when], ['Signed out', 'bad', '#fleet', '3 accounts signed out: a, c, h', '2026-11-19T00:00:00Z']);
});

test('a row with a question opens in place; the rest land on what they name', () => {
  const rows = load(base)([
    { sev: 'bad', kind: 'Decision', id: 'ABC-9', title: '[Decision] Pick one', url: 'https://linear.app/x/ABC-9', when: '2026-11-25T10:00:00Z', text: 'Context. Question: A or B?' },
    { sev: 'warn', kind: 'Stalled', id: 'ABC-9', title: '[Decision] Pick one', url: 'https://linear.app/x/ABC-9', text: 'Nothing has moved.' },
    { sev: 'bad', kind: 'Blocked', id: 'ABC-1', title: 'Rosie work', url: 'https://linear.app/x/ABC-1', when: '2026-11-25T09:00:00Z' },
    { sev: 'warn', kind: 'Ended', id: 'ABC-2', title: 'Sam work', url: 'https://linear.app/x/ABC-2', when: '2026-11-25T08:00:00Z' },
    { sev: 'bad', kind: 'Merge', id: 'ABC-2', title: 'Sam work', url: 'https://linear.app/x/ABC-2', href: 'https://github.com/o/r/pull/5' },
    { sev: 'bad', kind: 'Paused', host: 'second', title: 'Second', text: 'held by hand' },
    { sev: 'warn', kind: 'Stuck', id: 'ABC-3', title: 'Old work', url: 'https://linear.app/x/ABC-3', when: '2026-11-24T08:00:00Z' },
    { sev: 'warn', kind: 'GitHub', title: 'Board', text: 'Could not read PRs: 502' },
  ]);
  const by = Object.fromEntries(rows.map((r) => [`${r.kind} ${r.id || r.title}`, r]));
  assert.equal(by['Decision ABC-9'].q, 'Context. Question: A or B?');
  assert.equal(by['Decision ABC-9'].href, null);
  assert.equal(by['Decision ABC-9'].line, 'Pick one');
  assert.equal(by['Blocked ABC-1'].q, 'Which way?', "a blocked worker's own question");
  assert.equal(by['Ended ABC-2'].href, '#session=ABC-2');
  assert.equal(by['Stalled ABC-9'].q, '', 'another alert on an asked ticket does not borrow the question');
  assert.equal(by['Stalled ABC-9'].href, 'https://linear.app/x/ABC-9');
  assert.equal(by['Merge ABC-2'].href, 'https://github.com/o/r/pull/5', 'a merge opens its PR');
  assert.equal(by['Paused Second'].href, '#fleet/second');
  assert.equal(by['Paused Second'].line, 'Second: held by hand');
  assert.equal(by['Stuck ABC-3'].href, 'https://linear.app/x/ABC-3');
  assert.equal(by['GitHub Board'].href, null, 'nothing to open, so not clickable');
});

test('red rows first, newest first within each', () => {
  const rows = load(base)([
    { sev: 'warn', kind: 'Stuck', id: 'ABC-5', title: 'a', url: 'u', when: '2026-11-25T12:00:00Z' },
    { sev: 'bad', kind: 'Blocked', id: 'ABC-6', title: 'b', url: 'u', when: '2026-11-20T00:00:00Z' },
    { sev: 'bad', kind: 'Blocked', id: 'ABC-7', title: 'c', url: 'u', when: '2026-11-24T00:00:00Z' },
  ]);
  assert.equal(rows.map((r) => r.id).join(), 'ABC-7,ABC-6,ABC-5');
});
