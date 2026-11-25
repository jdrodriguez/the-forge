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
  execFileSync('git', ['-C', checkout, 'remote', 'add', 'origin', entry.originUrl ?? `https://github.com/${entry.origin ?? 'org/site'}.git`]);
  const { dispatcher = {}, ...rest } = more;
  const box = capBox({ dispatcher: { ...dispatcher, repos: { Site: { github: 'org/site', path: checkout, brief: 'site-brief.md', ...entry }, ...(more.repos ?? {}) } }, ...rest });
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

test('a checkout is used only when its origin names exactly the mapped repo, in https, ssh or scp form', () => {
  for (const [originUrl, ok] of [
    ['git@github.com:Org/Site.git', true],
    ['ssh://git@github.com/org/site', true],
    ['https://github.com/org/site/', true],
    ['https://github.com/xorg/site.git', false],
    ['https://github.com/other-org/site.git', false],
    ['https://github.com/org/site-old.git', false],
    ['https://gitlab.com/org/site.git', false],
  ]) {
    const { box } = siteBox({ originUrl }, { readyList: [inProject(11, 'Site')] });
    const out = tick(box);
    assert.equal(dispatches(box).length, ok ? 1 : 0, `${originUrl}: ${out}`);
    if (!ok) assert.match(out, /ENG-11: builds in org\/site, but host-a has a checkout at .* whose origin is .*, not org\/site/);
  }
});

test('a checkout path with "..", or a worktrees folder outside the checkout, is not used', () => {
  const { box, checkout } = siteBox({}, { readyList: [inProject(11, 'Site')] });
  const { box: dots } = siteBox({ path: `${checkout}/../${path.basename(checkout)}` }, { readyList: [inProject(11, 'Site')] });
  assert.match(tick(dots), /ENG-11: builds in org\/site, but host-a has a checkout path for org\/site that is not absolute or holds "\.\."/);
  assert.equal(dispatches(dots).length, 0);
  fs.mkdirSync(path.join(checkout, '.claude'), { recursive: true });
  fs.symlinkSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elsewhere-')), path.join(checkout, '.claude', 'worktrees'));
  assert.match(tick(box), /ENG-11: builds in org\/site, but host-a has a worktrees folder .* outside the checkout/);
  assert.equal(dispatches(box).length, 0);
});

test('a replacement checks the checkout again: one whose origin changed since the claim is not replaced here', () => {
  const { box } = siteBox({ origin: 'org/elsewhere' }, { tickets: { 'ENG-9': live(9, { repo: 'org/site', repoKey: 'Site' }) },
    ps: [{ label: 'b', id: 'w-9', name: 'queue-eng-9', state: 'failed', status: 'failed', kind: 'background' }] });
  tick(box);
  const out = tick(box);
  assert.match(out, /not replaced on host-a: it builds in org\/site, and this machine has a checkout at .* whose origin is github\.com\/org\/elsewhere|not replaced on host-a: it builds in org\/site, and this machine has a checkout at .* whose origin is org\/elsewhere, not org\/site/);
  assert.equal(briefs(box).length, 0);
});

test('a teardown checks the checkout again and leaves one whose origin is another repo alone', () => {
  const { box } = siteBox({ origin: 'org/elsewhere' }, {
    dispatcher: { worktreeCleanup: { enabled: true, sweepHours: 24 } },
    tickets: { 'ENG-9': { status: 'merged', mergedAt: new Date().toISOString(), mergedSha: 'm', ciChecked: true, account: 'b', workerId: 'w-9',
      branch: 'agent/eng-9', prNumber: 9, repo: 'org/site', repoKey: 'Site' } },
    prs: { 9: { branch: 'agent/eng-9', state: 'MERGED' } } });
  fs.writeFileSync(path.join(box.stateDir, 'worktree-sweep.json'), JSON.stringify({ lastRun: new Date().toISOString() }));
  tick(box);
  assert.match(state(box).tickets['ENG-9'].teardown?.skipped ?? '', /whose origin is org\/elsewhere, not org\/site/);
});

test("a mapped repo's riskyPathPatterns replace the default ones for its PRs", () => {
  const { box } = siteBox({ mergeMode: 'queue', riskyPathPatterns: ['^content/legal/'] }, {
    dispatcher: { riskyPathPatterns: ['^src/'] },
    tickets: { 'ENG-9': live(9, { repo: 'org/site', repoKey: 'Site' }), 'ENG-8': live(8, { repo: 'org/site', repoKey: 'Site' }) },
    prs: { 9: { branch: 'agent/eng-9', files: ['content/legal/terms.md'] }, 8: { branch: 'agent/eng-8', files: ['src/x.ts'] } } });
  tick(box);
  assert.deepEqual(mergeRequest(box, 'ENG-9')?.risky, ['content/legal/terms.md']);
  assert.equal(mergeRequest(box, 'ENG-8'), null, "the default ^src/ pattern does not apply to this repo's PR");
});

test('an invalid ignoreChecks pattern is logged once a tick and the PR does not read green', () => {
  const { box } = siteBox({ ignoreChecks: ['(unclosed'] }, {
    tickets: { 'ENG-9': live(9, { repo: 'org/site', repoKey: 'Site' }) }, prs: { 9: { branch: 'agent/eng-9' } } });
  const out = tick(box);
  assert.equal(out.match(/repos\.Site\.ignoreChecks: "\(unclosed" is not a valid regex .*; the queue merges none of this repo's PRs until it is fixed/g)?.length, 1, out);
  assert.match(out, /ENG-9: not green yet \(ignoreChecks pattern "\(unclosed" is not a valid regex\)/);
  assert.equal(mergeRequest(box), null);
});
