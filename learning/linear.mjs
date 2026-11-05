#!/usr/bin/env node
// Small Linear helper for the weekly failure-sweep routine, so it needs no
// connector. The key comes from LINEAR_API_KEY, linear.apiKeyCommand or linear.apiKeyFile:
//   node learning/linear.mjs <cmd> ...
// Commands:
//   search <term>            open and recent issues on linear.team whose title or description has the term
//   marker <type-id>         issues already filed for this failure type (by the description marker)
//   projects                 project names, to pick one for a ticket
//   create <draft.json>      creates the ticket in learning.draftState (Backlog); prints its identifier and URL
// draft.json: { "title", "description", "project", "priority" (1 urgent .. 4 low), "size" (one of dispatcher.queueSizes),
//               "typeId" (the sweep's failure type id; added to the description as a marker) }
// It never adds the ready label: drafts wait in Backlog for the human.
import fs from 'node:fs';
import { loadConfig, linearKey } from '../lib/config.mjs';

const cfg = loadConfig();
let KEY;
try {
  KEY = linearKey(cfg);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const TEAM_KEY = cfg.linear?.team;
if (!TEAM_KEY) { console.error('linear.team is not set in the config.'); process.exit(2); }
const SIZE_GROUP = cfg.linear?.sizeLabelGroup ?? 'Size';
const SIZES = cfg.dispatcher?.queueSizes ?? ['S', 'M', 'L'];
const DRAFT_STATE = cfg.learning?.draftState ?? 'Backlog';
const READY = cfg.linear?.labels?.ready ?? 'agent-ready';
const HUMAN = cfg.human?.name ?? 'the human';
export const MARKER = 'Failure-sweep type:';

async function gql(query, variables = {}) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: KEY },
    body: JSON.stringify({ query, variables }),
  }).then((x) => x.json());
  if (r.errors) throw new Error(r.errors.map((e) => e.message).join('; '));
  return r.data;
}

const ISSUE = 'identifier title url state{name type} project{name} labels{nodes{name}}';
const print = (nodes) => {
  if (!nodes.length) console.log('(no matches)');
  for (const i of nodes) console.log(`${i.identifier}\t${i.state.name}\t${i.project?.name ?? '-'}\t${i.title}\t${i.url}`);
};

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'search' && arg) {
  const d = await gql(`query($t:String!,$team:String!){issues(first:25,orderBy:updatedAt,filter:{team:{key:{eq:$team}},or:[{title:{containsIgnoreCase:$t}},{description:{containsIgnoreCase:$t}}]}){nodes{${ISSUE}}}}`, { t: arg, team: TEAM_KEY });
  print(d.issues.nodes);
} else if (cmd === 'marker' && arg) {
  const d = await gql(`query($t:String!,$team:String!){issues(first:25,filter:{team:{key:{eq:$team}},description:{contains:$t}}){nodes{${ISSUE}}}}`, { t: `${MARKER} ${arg}`, team: TEAM_KEY });
  print(d.issues.nodes);
} else if (cmd === 'projects') {
  const d = await gql(`{projects(first:100,filter:{state:{nin:["completed","canceled"]}}){nodes{name}}}`);
  for (const p of d.projects.nodes) console.log(p.name);
} else if (cmd === 'create' && arg) {
  const draft = JSON.parse(fs.readFileSync(arg, 'utf8'));
  for (const k of ['title', 'description', 'project', 'priority', 'size', 'typeId']) if (draft[k] === undefined) throw new Error(`draft is missing ${k}`);
  for (const s of ['## Acceptance scenarios', '## Adverse data', '## Out of scope / decisions']) {
    if (!draft.description.includes(s)) throw new Error(`description is missing the spec-floor section "${s}"`);
  }
  if (!SIZES.includes(draft.size)) throw new Error(`size must be one of ${SIZES.join(', ')}`);
  if (![1, 2, 3, 4].includes(draft.priority)) throw new Error('priority must be 1 (urgent) to 4 (low)');
  const d = await gql(`query($p:String!,$team:String!,$group:String!){teams(filter:{key:{eq:$team}}){nodes{id states{nodes{id name}}}}
    projects(first:5,filter:{name:{eqIgnoreCase:$p}}){nodes{id name}}
    issueLabels(first:10,filter:{parent:{name:{eq:$group}}}){nodes{id name}}}`, { p: draft.project, team: TEAM_KEY, group: SIZE_GROUP });
  const team = d.teams.nodes[0];
  if (!team) throw new Error(`no team with key ${TEAM_KEY}`);
  const backlog = team.states.nodes.find((s) => s.name === DRAFT_STATE);
  const project = d.projects.nodes[0];
  const size = d.issueLabels.nodes.find((l) => l.name === draft.size);
  if (!project) throw new Error(`no project named "${draft.project}" (run: node learning/linear.mjs projects)`);
  if (!backlog || !size) throw new Error(`${DRAFT_STATE} state or ${SIZE_GROUP} label not found`);
  const description = `${draft.description.trim()}\n\n---\n${MARKER} ${draft.typeId}\nDrafted by the weekly failure sweep (agent-queue learning/). Not queued: add ${READY} once ${HUMAN} approves.`;
  const r = await gql(`mutation($i:IssueCreateInput!){issueCreate(input:$i){success issue{identifier url}}}`, {
    i: { teamId: team.id, title: draft.title, description, projectId: project.id, priority: draft.priority, stateId: backlog.id, labelIds: [size.id] },
  });
  console.log(`${r.issueCreate.issue.identifier}\t${r.issueCreate.issue.url}`);
} else {
  console.error('usage: linear.mjs search <term> | marker <type-id> | projects | create <draft.json>');
  process.exit(2);
}
