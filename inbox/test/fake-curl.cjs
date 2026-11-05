#!/usr/bin/env node
// A stub curl for the inbox tests: a tiny Linear and Slack kept in $HOME/linear.json. It understands only the calls
// ask-human.sh makes. Every Slack post is appended to $HOME/slack.
const fs = require('node:fs');

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('https://'));
const body = JSON.parse(args[args.indexOf('-d') + 1] ?? '{}');
const DB = `${process.env.HOME}/linear.json`;
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const save = () => fs.writeFileSync(DB, JSON.stringify(db, null, 2));
const out = (data) => process.stdout.write(JSON.stringify({ data }));
const now = () => new Date(Date.now() + (db.clock = (db.clock ?? 0) + 1) * 1000).toISOString();

if (url.startsWith('https://slack.com/')) {
  fs.appendFileSync(`${process.env.HOME}/slack`, `${JSON.stringify(body)}\n`);
  process.stdout.write(JSON.stringify({ ok: true, ts: '1700000000.123456' }));
  process.exit(0);
}

const { query, variables: v = {} } = body;
const issue = (id) => db.issues.find((i) => i.id === id || i.identifier === id);
const labelName = v.l && db.labels[v.l] ? db.labels[v.l] : v.l;
if (query.includes('issueLabels(')) {
  out({ issueLabels: { nodes: Object.entries(db.labels).filter(([, n]) => n === labelName).map(([id]) => ({ id })) } });
} else if (query.includes('issueAddLabel')) {
  issue(v.i).labels.push(db.labels[v.l]);
  save();
  out({ issueAddLabel: { success: true } });
} else if (query.includes('issueRemoveLabel')) {
  const i = issue(v.i);
  i.labels = i.labels.filter((n) => n !== db.labels[v.l]);
  save();
  out({ issueRemoveLabel: { success: true } });
} else if (query.includes('commentCreate')) {
  issue(v.i).comments.push({ body: v.b, createdAt: now() });
  save();
  out({ commentCreate: { success: true } });
} else if (query.includes('attachmentLinkSlack')) {
  issue(v.i).attachments.push({ url: v.u, createdAt: now() });
  save();
  out({ attachmentLinkSlack: { success: true } });
} else if (query.includes('issues(')) {
  out({ issues: { nodes: db.issues.filter((i) => i.labels.includes(labelName)).map((i) => ({ ...i, comments: { nodes: i.comments } })) } });
} else if (query.includes('issue(id:$id)')) {
  const i = issue(v.id);
  out({ issue: i ? { ...i, labels: { nodes: i.labels.map((name) => ({ name })) }, comments: { nodes: i.comments }, attachments: { nodes: i.attachments } } : null });
} else {
  process.stdout.write(JSON.stringify({ errors: [{ message: `fake-curl: unhandled ${query.slice(0, 60)}` }] }));
}
