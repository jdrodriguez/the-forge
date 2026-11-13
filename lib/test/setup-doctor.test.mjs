// the-forge doctor: in an empty home it names every missing thing and exits 1; on a set-up computer it reads clean;
// from the board's computer it checks ssh and the copy on each other computer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { answers, HOST, lastingCopy, sandbox } from './setup-sandbox.mjs';

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
    // Every account has trusted the folder workers start in.
    const ws = path.join(s.home, 'dev');
    const trust = JSON.stringify({ projects: { [ws]: { hasTrustDialogAccepted: true } } });
    fs.writeFileSync(path.join(s.home, '.claude.json'), trust);
    for (const l of ['b', 'c']) {
      fs.mkdirSync(path.join(s.home, `.claude-${l}`), { recursive: true });
      fs.writeFileSync(path.join(s.home, `.claude-${l}/.claude.json`), trust);
    }
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
  // Only the accounts this computer's jobs use: b is its worker and the red-main responder's account; a is neither.
  assert.match(r.stdout, /ok +Claude account b: signed in \(~\/\.claude-b\)/);
  assert.doesNotMatch(r.stdout, /Claude account a/);
  assert.match(r.stdout, /ok +gh account: tester is signed in/);
  assert.match(r.stdout, /is ready/);
  assert.doesNotMatch(r.stdout, /invented-key/, 'the key never appears');

  assert.match(r.stdout, /ok +trust b: trusts ~\/dev/);
  fs.chmodSync(path.join(s.home, '.agent-queue/linear-api-key'), 0o644);
  const loose = s.run(['doctor'], {}, cli);
  assert.equal(loose.status, 1);
  assert.match(loose.stdout, /MISS  Linear key: found, but .* is readable by other users\n +fix: chmod 600/);
  fs.chmodSync(path.join(s.home, '.agent-queue/linear-api-key'), 0o600);
  fs.writeFileSync(path.join(s.home, '.claude-b/.claude.json'), '{}');
  assert.deepEqual(names(s.run(['doctor', '--json'], {}, cli)), ['trust b']);
  // gh: a login with a hyphen is found; another account signed in instead is named.
  assert.deepEqual(names(s.run(['doctor', '--json'], { FAKE_GH_USER: 'Tester' }, cli)), ['trust b']);
  assert.deepEqual(names(s.run(['doctor', '--json'], { FAKE_GH_USER: 'someone-else' }, cli)), ['gh account', 'trust b']);
  const out = s.run(['doctor', '--json'], { FAKE_CLAUDE_SIGNED_IN: 'false' }, cli);
  assert.equal(out.status, 1);
  assert.deepEqual(names(out), ['Claude account b']);
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

test('doctor fills the answers defaults (an account with no label is a) and names a host that differs only in case', async () => {
  const s = sandbox();
  const a = answers(1, 1);
  a.computers[0].codex = false;
  const { root, cli } = await ready(s, a);
  fs.writeFileSync(path.join(root, 'forge-answers.json'), JSON.stringify({ ...a, claudeAccounts: [{}] }));
  const r = s.run(['doctor', '--json'], {}, cli);
  assert.equal(r.status, 0, r.stdout);
  assert.ok(JSON.parse(r.stdout).checks.some((c) => c.name === 'Claude account a' && c.ok));
  const other = sandbox();
  const flip = HOST === HOST.toLowerCase() ? HOST.toUpperCase() : HOST.toLowerCase();
  const b = JSON.parse(JSON.stringify(a).replaceAll(`"${HOST}"`, `"${flip}"`));
  const { cli: cli2 } = await ready(other, b);
  const d = JSON.parse(other.run(['doctor', '--json'], {}, cli2).stdout).checks.find((c) => c.name === 'this computer');
  assert.equal(d.ok, false);
  assert.match(d.detail, /the letter case must match/);
});
