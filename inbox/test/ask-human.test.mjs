// ask-human.sh against a fake Linear and Slack (fake-curl.cjs on PATH as curl), in a throwaway HOME with a config
// built from the example. Nothing real is read, written or sent.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-queue.config.example.json'), 'utf8'));

function sandbox({ slack = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-human-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'curl'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, 'fake-curl.cjs')}" "$@"\n`, { mode: 0o755 });
  const configFile = path.join(home, 'agent-queue.config.json');
  fs.writeFileSync(configFile, JSON.stringify({ ...EXAMPLE, human: { name: 'Alex' } }));
  fs.writeFileSync(path.join(home, 'linear.json'), JSON.stringify({
    labels: { 'L-needs': 'needs-human' },
    issues: [{ id: 'uuid-5', identifier: 'ENG-5', title: 'Show the risk panel', url: 'https://linear.app/x/issue/ENG-5', labels: [], comments: [], attachments: [] }],
  }));
  if (slack) {
    fs.mkdirSync(path.join(home, '.agent-queue'));
    fs.writeFileSync(path.join(home, '.agent-queue/slack-bot-token'), 'fake-bot-token\n');
  }
  return { home, bin, configFile };
}

const run = (box, args) => spawnSync(path.join(ROOT, 'inbox/ask-human.sh'), args, {
  env: { ...process.env, HOME: box.home, PATH: `${box.bin}:${process.env.PATH}`, AGENT_QUEUE_CONFIG: box.configFile, LINEAR_API_KEY: 'fake-linear-key' },
  encoding: 'utf8', timeout: 60_000 });
const db = (box) => JSON.parse(fs.readFileSync(path.join(box.home, 'linear.json'), 'utf8'));
const answer = (box, text) => {
  const d = db(box);
  d.issues[0].comments.push({ body: text, createdAt: new Date(Date.now() + 3_600_000).toISOString() });
  fs.writeFileSync(path.join(box.home, 'linear.json'), JSON.stringify(d));
};

test('an ask labels the ticket, posts the fixed-format comment, and prints the URL and the exact wait command', () => {
  const box = sandbox();
  const r = run(box, ['ask', 'ENG-5', '--type', 'decision', '--ask', 'Keep the old column?', '--recommend', 'drop it',
    '--default', 'it stays', '--from', 'a worker']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'https://linear.app/x/issue/ENG-5');
  assert.match(r.stderr, /run_in_background: true, with no &, subshell or redirect: \S*inbox\/ask-human\.sh wait ENG-5\n/);
  const [i] = db(box).issues;
  assert.deepEqual(i.labels, ['needs-human']);
  assert.equal(i.comments[0].body, '**Needs Alex: Decision** (from a worker)\n\n**Question:** Keep the old column?\n**Recommend:** drop it\n**If no answer:** it stays\n\n_Answer in a comment, then remove the needs-human label._');
});

test('check reads WAITING until a reply lands, ignores the Slack sync note, then reads ANSWERED with the reply', () => {
  const box = sandbox();
  run(box, ['ask', 'ENG-5', '--type', 'blocked', '--ask', 'Which table?']);
  assert.match(run(box, ['check', 'ENG-5']).stdout, /^WAITING since /);
  answer(box, 'This comment thread is synced to a Slack thread');
  assert.match(run(box, ['check', 'ENG-5']).stdout, /^WAITING since /);
  answer(box, 'Use the accounts table.');
  assert.equal(run(box, ['check', 'ENG-5']).stdout, 'ANSWERED\nUse the accounts table.\n');
  assert.equal(run(box, ['wait', 'ENG-5', '--every', '1']).stdout, 'ANSWERED\nUse the accounts table.\n');
});

test('list and summary show the open ask; sweep clears the label once it is answered', () => {
  const box = sandbox();
  run(box, ['ask', 'ENG-5', '--type', 'merge', '--ask', 'Merge the auth change?', '--from', 'dispatcher']);
  const list = run(box, ['list']).stdout;
  assert.match(list, /^Approve merge\s+ENG-5\s+\d+[mhd]\s+dispatcher\s+Merge the auth change\?\n$/);
  assert.match(run(box, ['summary']).stdout, /^\[Inbox\] 1 item\(s\) waiting on Alex in Linear's "Needs Alex" view \(oldest \d+[mhd]\)\. ask-human\.sh list shows them\.\n$/);
  assert.equal(run(box, ['sweep']).stdout, '');
  answer(box, 'Yes.');
  assert.equal(run(box, ['sweep']).stdout, 'ENG-5: answered, needs-human removed\n');
  assert.deepEqual(db(box).issues[0].labels, []);
  assert.equal(run(box, ['summary']).stdout, '');
});

test('with a bot token the ask goes to Slack once, as a thread synced to the ticket', () => {
  const box = sandbox({ slack: true });
  assert.equal(run(box, ['ask', 'ENG-5', '--type', 'decision', '--ask', 'Ship it?']).status, 0);
  const posts = fs.readFileSync(path.join(box.home, 'slack'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].channel, EXAMPLE.slack.channel);
  assert.match(posts[0].text, /^<https:\/\/linear.app\/x\/issue\/ENG-5\|ENG-5> Show the risk panel\n\*Needs Alex: Decision\*/);
  assert.deepEqual(db(box).issues[0].attachments.map((a) => a.url), [`https://${EXAMPLE.slack.domain}.slack.com/archives/${EXAMPLE.slack.channel}/p1700000000123456`]);
  assert.equal(run(box, ['slack', 'ENG-5']).stdout, 'already in Slack\n');
  assert.equal(run(box, ['sweep']).stdout, '');
});

test('a bad call explains itself with the usage exit codes', () => {
  const box = sandbox();
  assert.equal(run(box, ['ask', 'ENG-5', '--type', 'other', '--ask', 'x']).status, 2);
  assert.equal(run(box, ['ask', 'ENG-404', '--type', 'blocked', '--ask', 'x']).status, 2);
  const u = run(box, []);
  assert.equal(u.status, 2);
  assert.match(u.stdout, /^ask-human\.sh: the one inbox/);
});
