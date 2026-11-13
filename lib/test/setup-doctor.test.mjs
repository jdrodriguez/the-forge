// the-forge doctor: in an empty home it names every missing thing and exits 1; on a set-up computer it reads clean;
// from the board's computer it checks ssh and the copy on each other computer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { answers, lastingCopy, sandbox } from './setup-sandbox.mjs';

const names = (r) => JSON.parse(r.stdout).checks.filter((c) => !c.ok).map((c) => c.name);

test('doctor in an empty home names each missing thing and exits 1', () => {
  const s = sandbox({ bare: true });
  const r = s.run(['doctor'], { AGENT_QUEUE_CONFIG: path.join(s.dir, 'none.json') });
  assert.equal(r.status, 1);
  for (const m of ['git: not installed', 'jq: not installed', 'curl: not installed', 'perl: not installed', 'gh: not installed',
    'claude: not installed', 'config: no config at', 'link forge-setup', 'link fleet', 'link specdesk', 'link ask-human.sh', 'link the-forge']) {
    assert.match(r.stdout, new RegExp(`MISS  ${m.replace('.', '\\.')}`), m);
  }
  assert.match(r.stdout, /fix: install Claude Code/);
  const j = s.run(['doctor', '--json'], { AGENT_QUEUE_CONFIG: path.join(s.dir, 'none.json') });
  assert.equal(j.status, 1);
  assert.equal(JSON.parse(j.stdout).ok, false);
});

function ready(s, a) {
  return lastingCopy(s, a).then(({ root, cli }) => {
    fs.mkdirSync(path.join(s.home, 'dev/example-app/.git'), { recursive: true });
    fs.mkdirSync(path.join(s.home, '.agent-queue'), { recursive: true });
    fs.writeFileSync(path.join(s.home, '.agent-queue/linear-api-key'), 'invented-key\n', { mode: 0o600 });
    return { root, cli };
  });
}

test('doctor on a set-up computer reads clean, and names a signed-out account, a loose key file and a wrong gh login', async () => {
  const s = sandbox();
  const a = answers(1, 2);
  a.computers[0].codex = false;
  const { cli } = await ready(s, a);
  const r = s.run(['doctor'], {}, cli);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /ok +Claude account a: signed in \(~\/\.claude\)/);
  assert.match(r.stdout, /ok +Claude account b: signed in \(~\/\.claude-b\)/);
  assert.match(r.stdout, /ok +gh account: tester is signed in/);
  assert.match(r.stdout, /is ready/);
  assert.doesNotMatch(r.stdout, /invented-key/, 'the key never appears');

  fs.chmodSync(path.join(s.home, '.agent-queue/linear-api-key'), 0o644);
  const loose = s.run(['doctor'], {}, cli);
  assert.match(loose.stdout, /Linear key: found, but .* is readable by others/);
  const out = s.run(['doctor', '--json'], { FAKE_CLAUDE_SIGNED_IN: 'false' }, cli);
  assert.equal(out.status, 1);
  assert.deepEqual(names(out), ['Claude account a', 'Claude account b']);
});

test('doctor checks Codex where the answers put it, and Tailscale, ssh and the copy from the board for other computers', async () => {
  const s = sandbox({ omit: ['codex'] });
  const a = answers(2, 2);
  const { cli } = await ready(s, a);
  // The board's computer runs Codex in the answers, and no codex is installed here.
  let r = s.run(['doctor', '--json'], {}, cli);
  assert.equal(r.status, 1);
  const res = JSON.parse(r.stdout);
  assert.deepEqual(names(r), ['codex', 'copy on box-two']);
  assert.ok(res.checks.find((c) => c.name === 'ssh box-two').ok);
  assert.ok(res.checks.find((c) => c.name === 'Tailscale').ok);
  assert.ok(!res.checks.some((c) => c.name === 'grok'), 'grok runs only on box-two, so this computer is not checked for it');
  // After copy-to, the other computer has the copy.
  assert.equal(s.run(['copy-to', 'box-two'], {}, cli).status, 0);
  r = s.run(['doctor', '--json'], {}, cli);
  assert.deepEqual(names(r), ['codex']);
  r = s.run(['doctor', '--json'], { FAKE_SSH_FAIL: '1' }, cli);
  assert.deepEqual(names(r), ['codex', 'ssh box-two']);
});
