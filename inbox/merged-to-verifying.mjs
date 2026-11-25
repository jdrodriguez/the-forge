// merged-to-verifying.mjs <pr> [owner/name]: after merge-approved.mjs merges a PR, puts the PR's tickets in Verifying.
// The repo defaults to github.repo. Linear's GitHub integration moves a ticket to Done when its PR merges, and Done
// needs a verify evidence comment first (docs/ticket-spec.md). The dispatcher does this for the PRs it tracks; this
// covers the ones merged by hand (follow-up PRs, merge requests). It acts on every ticket ID in the PR's title and
// branch, since a bundled PR names all of its tickets.
//
// A ticket in a completed state stays there only when its newest evidence comment by an accepted author came after the
// merge and passes (lib/verify-evidence.mjs: footer, at least one PASS row, no FAIL or malformed row). Accepted authors
// are the Linear key's own user and linear.verifyEvidenceAuthors. Anything weaker moves it to Verifying, so a reopened
// ticket's old table never holds it in Done.
import { execFileSync } from 'node:child_process';
import { linearKey, loadConfig } from '../lib/config.mjs';
import { newestPassing } from '../lib/verify-evidence.mjs';

const conf = loadConfig();
const TEAM = conf.linear.team;
const VERIFYING = conf.linear.states?.verifying ?? 'Verifying';
const opts = {
  heading: conf.linear.verifyEvidenceHeading ?? '## Verify evidence',
  environments: conf.linear.verifyEnvironments ?? ['staging', 'production'],
};
const AUTHORS = conf.linear.verifyEvidenceAuthors ?? [];
const pr = process.argv[2];
const repo = process.argv[3] || conf.github.repo;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const view = JSON.parse(run('gh', ['pr', 'view', pr, '--repo', repo, '--json', 'title,headRefName,url,mergedAt']));
const ids = [...new Set([...`${view.title} ${view.headRefName}`.matchAll(new RegExp(`${TEAM}-\\d+`, 'gi'))].map((m) => m[0].toUpperCase()))];
if (!ids.length) { console.log(`#${pr}: no ${TEAM} ticket in its title or branch`); process.exit(0); }

const key = linearKey(conf);
const linear = async (query, variables) => {
  const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
};
const read = (id) => linear(`query($id:String!){issue(id:$id){id state{name type} team{states{nodes{id name}}} comments(first:100){nodes{body createdAt user{id}}}}}`, { id });
const viewerId = (await linear('query{viewer{id}}')).viewer.id;
const accepted = (c) => Boolean(c.user?.id) && (c.user.id === viewerId || AUTHORS.includes(c.user.id));

async function settle(id, waitForIntegration) {
  // The integration's move lands a few seconds after the merge; wait up to two minutes for it on the first ticket.
  let issue;
  for (let i = 0; i < (waitForIntegration ? 8 : 1); i++) {
    issue = (await read(id)).issue;
    if (issue.state.type === 'completed') break;
    if (waitForIntegration) await new Promise((r) => setTimeout(r, 15000 * Number(process.env.FORGE_SLEEP_SCALE ?? 1)));
  }
  if (issue.state.type !== 'completed') return console.log(`${id}: in ${issue.state.name}, left as is`);
  if (newestPassing(issue.comments.nodes, { ...opts, accepted, after: view.mergedAt })) {
    return console.log(`${id}: Done with passing verify evidence from after the merge, left as is`);
  }
  const verifying = issue.team.states.nodes.find((s) => s.name === VERIFYING).id;
  await linear(`mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}`, { id: issue.id, s: verifying });
  await linear(`mutation($id:String!,$b:String!){commentCreate(input:{issueId:$id,body:$b}){success}}`, {
    id: issue.id,
    b: `Merged ${view.url}. Linear's GitHub integration moved this to Done; moved it to ${VERIFYING}, since Done needs a verify evidence comment first.`,
  });
  console.log(`${id}: moved from ${issue.state.name} to ${VERIFYING}`);
}

for (const [i, id] of ids.entries()) await settle(id, i === 0);
