// merged-to-verifying.mjs <pr>: after merge-approved.sh merges a PR, puts the PR's tickets in Verifying. Linear's GitHub
// integration moves a ticket to Done when its PR merges, and Done needs a verify evidence comment first
// (docs/ticket-spec.md). The dispatcher does this for the PRs it tracks; this covers the ones merged by hand (follow-up
// PRs, merge requests). It acts on every ticket ID in the PR's title and branch, since a bundled PR names all of its
// tickets, and only on a ticket in a completed state with no passing evidence comment written after this merge, so a
// ticket closed after verification stays put while a reopened ticket's old FAIL table does not hold it in Done.
import { execFileSync } from 'node:child_process';
import { linearKey, loadConfig } from '../lib/config.mjs';

const conf = loadConfig();
const TEAM = conf.linear.team;
const VERIFYING = conf.linear.states?.verifying ?? 'Verifying';
const HEADING = conf.linear.verifyEvidenceHeading ?? '## Verify evidence';
const pr = process.argv[2];
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const view = JSON.parse(run('gh', ['pr', 'view', pr, '--repo', conf.github.repo, '--json', 'title,headRefName,url,mergedAt']));
const ids = [...new Set([...`${view.title} ${view.headRefName}`.matchAll(new RegExp(`${TEAM}-\\d+`, 'gi'))].map((m) => m[0].toUpperCase()))];
if (!ids.length) { console.log(`#${pr}: no ${TEAM} ticket in its title or branch`); process.exit(0); }

const key = linearKey(conf);
const linear = async (query, variables) => {
  const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
};
const read = (id) => linear(`query($id:String!){issue(id:$id){id state{name type} team{states{nodes{id name}}} comments(first:100){nodes{body createdAt}}}}`, { id });

async function settle(id, waitForIntegration) {
  // The integration's move lands a few seconds after the merge; wait up to two minutes for it on the first ticket.
  let issue;
  for (let i = 0; i < (waitForIntegration ? 8 : 1); i++) {
    issue = (await read(id)).issue;
    if (issue.state.type === 'completed') break;
    if (waitForIntegration) await new Promise((r) => setTimeout(r, 15000));
  }
  if (issue.state.type !== 'completed') return console.log(`${id}: in ${issue.state.name}, left as is`);
  const evidence = issue.comments.nodes.filter((c) => c.body.includes(HEADING)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (evidence && view.mergedAt && Date.parse(evidence.createdAt) > Date.parse(view.mergedAt) && !/\|\s*FAIL\s*\|/.test(evidence.body)) {
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
