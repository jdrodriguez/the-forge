// The repo map: dispatcher.repos sends a Linear project's tickets to another repo, with its own checkout, brief, checks
// and merge policy. Runs the real dispatcher in capacity-sandbox.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { briefs, capBox, dispatches, lines, live, ready, state, tick } from './capacity-sandbox.mjs';

const inProject = (n, name) => ({ ...ready(n), project: { id: `P-${name}`, name } });
// A checkout and a brief for the site repo; the brief names the repo, base and worktrees placeholders.
function siteBox(entry = {}, more = {}) {
  const checkout = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'site-')));
  execFileSync('git', ['init', '-q', checkout]);
  execFileSync('git', ['-C', checkout, 'remote', 'add', 'origin', `https://github.com/${entry.origin ?? 'org/site'}.git`]);
  const box = capBox({ dispatcher: { repos: { Site: { github: 'org/site', path: checkout, brief: 'site-brief.md', ...entry }, ...(more.repos ?? {}) } }, ...more });
  fs.writeFileSync(path.join(box.dir, 'site-brief.md'), 'Site brief for {{ID}} in {{REPO}} on {{BASE}}, worktrees in {{WORKTREES}}.\n');
  return { box, checkout };
}
const mergeRequest = (box, id = 'ENG-9') => {
  const f = path.join(box.shared, 'merge-requests', `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

test("a mapped project's ticket is claimed in its repo, with that repo's brief, and its claim records the repo by key", () => {
  const { box, checkout } = siteBox({ base: 'trunk' }, { readyList: [inProject(11, 'Site'), ready(12)] });
  tick(box);
  assert.equal(dispatches(box).length, 2);
  const site = briefs(box).find((b) => b.startsWith('Site brief'));
  assert.equal(site, `Site brief for ENG-11 in org/site on trunk, worktrees in ${checkout}/.claude/worktrees.\n`);
  assert.deepEqual([state(box).tickets['ENG-11'].repo, state(box).tickets['ENG-11'].repoKey], ['org/site', 'Site']);
  assert.equal(state(box).tickets['ENG-12'].repo, undefined, 'an unlisted project builds in repoPath');
});

test('a machine without the checkout leaves the ticket for one that has it', () => {
  const { box } = siteBox({ path: '/nonexistent/site' }, { readyList: [inProject(11, 'Site')] });
  assert.match(tick(box), /ENG-11: builds in org\/site, but host-a has no checkout of org\/site at \/nonexistent\/site, so it is left for a machine that has/);
  assert.equal(dispatches(box).length, 0);
});

test('a project mapped to no repo is sent back', () => {
  const box = capBox({ dispatcher: { repos: { Later: { github: null, why: 'its repo does not exist yet' } } }, readyList: [inProject(11, 'Later')] });
  tick(box);
  assert.equal(dispatches(box).length, 0);
  assert.match(lines(box, 'asks').join('\n'), /has no repo the queue builds in \(dispatcher\.repos: its repo does not exist yet\)/);
});

test("a green PR in an orchestrator-mode repo goes to the orchestrator with the repo named, and is never merged here", () => {
  const { box } = siteBox({ mergeReason: 'a merge publishes the site' }, {
    tickets: { 'ENG-9': live(9, { repo: 'org/site', repoKey: 'Site' }) }, prs: { 9: { branch: 'agent/eng-9' } } });
  tick(box);
  const req = mergeRequest(box);
  assert.equal(req.repo, 'org/site');
  assert.match(req.review, /org\/site: a merge publishes the site/);
  assert.equal(lines(box, 'gh-log').filter((l) => l.startsWith('pr merge')).length, 0);
});

test('a ticket whose recorded repo entry changed since its claim falls back to the orchestrator, never to a queue merge', () => {
  const { box } = siteBox({ github: 'org/other', mergeMode: 'queue' }, {
    tickets: { 'ENG-9': live(9, { repo: 'org/site', repoKey: 'Site' }) }, prs: { 9: { branch: 'agent/eng-9' } } });
  tick(box);
  assert.equal(mergeRequest(box)?.repo, 'org/site');
  assert.equal(lines(box, 'gh-log').filter((l) => l.startsWith('pr merge')).length, 0);
});

test("a repo with requiredChecks is green by its checks: a BLOCKED review gate passes with reviewGateBlocks", () => {
  const { box } = siteBox({ requiredChecks: ['Claude Code Review'], reviewGateBlocks: true }, {
    tickets: { 'ENG-9': live(9, { repo: 'org/site', repoKey: 'Site' }) }, prs: { 9: { branch: 'agent/eng-9', merge: 'BLOCKED' } } });
  tick(box);
  assert.equal(mergeRequest(box)?.repo, 'org/site', 'green, so it went to the orchestrator');
  const { box: strict } = siteBox({ requiredChecks: ['quality'] }, {
    tickets: { 'ENG-9': live(9, { repo: 'org/site', repoKey: 'Site' }) }, prs: { 9: { branch: 'agent/eng-9' } } });
  assert.match(tick(strict), /ENG-9: not green yet \(quality not passed\)/);
});

test("a checkout whose origin is another repo is not used: the ticket is left for a machine with the right one", () => {
  const { box } = siteBox({ origin: 'org/other-site' }, { readyList: [inProject(11, 'Site')] });
  assert.match(tick(box), /ENG-11: builds in org\/site, but host-a has a checkout at .* whose origin is not org\/site/);
  assert.equal(dispatches(box).length, 0);
});
