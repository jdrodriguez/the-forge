// worktrees.js: the Worktrees view, every machine's git worktrees from the snapshot's worktrees (worktree-state.mjs).
// Each machine lists its worktrees by state, the ones that need a look first. The merged or closed ones that hold nothing
// GitHub lacks are folded into one "safe to remove" line, since those are what a cleanup takes. Read-only: it changes
// nothing. Loaded after page.html's own script and uses its helpers: $, esc, ago, ico, ICON, snap, machineColor, render,
// WT_STATE, wtCounts.
const wtOpen = {};
const WT_ICON = { active: ['run', 'run'], open: ['pr', 'todo'], local: ['warn', 'warn'], closed: ['todo', 'free'], merged: ['ok', 'merged'], nopr: ['free', 'free'], missing: ['bad', 'bad'] };
const WT_CHIP = { active: 'run', local: 'warn', missing: 'bad' };
const wtPlural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function wtRow(r, repo) {
  const [icon, cls] = WT_ICON[r.state];
  const pr = r.pr ? `<a class="chip" href="${esc(r.pr.url)}" target="_blank" rel="noopener" title="${esc(r.pr.title)}">${ICON.pr}#${r.pr.number} ${r.pr.state === 'OPEN' && r.pr.draft ? 'draft' : r.pr.state.toLowerCase()}</a>` : '';
  // The worker and any Claude session matter; shells, node and the rest are a count, listed in the tooltip.
  const rest = r.procs.filter((p) => p !== 'claude');
  const who = [...r.workers.map((w) => `${w} worker`), r.procs.includes('claude') ? 'Claude session' : '', rest.length ? wtPlural(rest.length, 'other process', 'other processes') : ''].filter(Boolean).join(', ');
  const chips = [
    r.repo !== repo ? `<span class="chip">${esc(r.repo)}</span>` : '',
    who ? `<span class="chip run" title="Running in this folder: ${esc(r.procs.join(', ') || 'the worker')}">${esc(who)}</span>` : '',
    r.changed ? `<span class="chip warn" title="Tracked files with uncommitted changes">${r.changed} uncommitted</span>` : '',
    r.onlyHere ? `<span class="chip warn" title="Commits on no branch on GitHub">${wtPlural(r.onlyHere, 'commit')} not on GitHub</span>` : '',
    r.locked ? '<span class="chip">locked</span>' : '',
    !r.branch && !r.missing ? `<span class="chip">detached at ${esc(r.head)}</span>` : '',
    r.prChecked ? '' : '<span class="chip">PR not checked</span>',
    r.error ? `<span class="chip bad" title="${esc(r.error)}">git failed</span>` : '',
  ].join('');
  return `<div class="row wt">${ico(icon, cls, WT_STATE[r.state][0])}<div class="rbody"><div class="rline">
    <span class="rid" title="${esc(r.path)}">${esc(r.name)}</span><span class="rtitle" title="${esc(r.branch || '')}">${esc(r.pr?.title || r.branch || 'no branch')}</span>
    ${r.lastCommitAt ? `<span class="rmeta" title="Last commit">${ago(r.lastCommitAt)}</span>` : ''}</div>${chips || pr ? `<div class="chips">${pr}${chips}</div>` : ''}</div></div>`;
}

function wtMachine(m, repo) {
  const head = `<h2 class="gh"><span class="mdot" style="--mc:${machineColor(m.host)}"></span>${esc(m.name)} <span class="gcount">${m.rows ? m.rows.length : ''}</span></h2>`;
  const wrap = (body) => `<section class="group" id="wt-${esc(m.host)}">${head}${body}</section>`;
  if (!m.rows) return wrap(`<div class="empty">${m.error ? `Could not read its worktrees: ${esc(m.error)}` : 'Reading its worktrees...'}</div>`);
  const order = Object.keys(WT_STATE);
  const rows = [...m.rows].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || (b.lastCommitAt || '').localeCompare(a.lastCommitAt || ''));
  const keep = rows.filter((r) => !r.removable), spare = rows.filter((r) => r.removable);
  const sum = wtCounts(rows).map(([s, n]) => `<span class="chip ${WT_CHIP[s] || ''}">${n} ${esc(WT_STATE[s][1])}</span>`).join('');
  const read = `<span class="muted">Read ${ago(m.at)}${m.error ? `, the last scan failed: ${esc(m.error)}` : ''}</span>`;
  const more = spare.length ? `<div class="more-row"><button class="show-all wt-more" type="button" data-host="${esc(m.host)}" title="Merged or closed, nobody working in them, and nothing in them that GitHub lacks">${wtOpen[m.host] ? 'Hide' : 'Show'} ${spare.length} safe to remove</button></div>` : '';
  return wrap(`<div class="wt-sum">${sum || '<span class="muted">No worktrees.</span>'}${read}</div>`
    + keep.map((r) => wtRow(r, repo)).join('') + (wtOpen[m.host] ? spare.map((r) => wtRow(r, repo)).join('') : '') + more);
}

function renderWorktrees() {
  const wt = snap?.worktrees;
  if (!wt) { $('worktrees').innerHTML = '<div class="empty">Reading the worktrees on every machine...</div>'; return; }
  const read = wt.machines.filter((m) => m.rows);
  const all = read.flatMap((m) => m.rows);
  const spare = all.filter((r) => r.removable).length;
  $('worktrees').innerHTML = `<div class="ibar"><span><b>${all.length}</b> worktrees on ${wtPlural(read.length, 'machine')}</span>${spare ? `<span><b>${spare}</b> safe to remove</span>` : ''}<span>Scanned every ${wt.everyMinutes} minutes</span>${wt.prErrors.length ? `<span>Could not read PRs for ${esc(wt.prErrors.join('; '))}</span>` : ''}</div>`
    + wt.machines.map((m) => wtMachine(m, wt.repo)).join('');
}

document.addEventListener('click', (e) => {
  const more = e.target.closest('.wt-more');
  if (!more) return;
  wtOpen[more.dataset.host] = !wtOpen[more.dataset.host];
  renderWorktrees();
});
// The page re-renders on every new snapshot; the Worktrees view follows it. A snapshot that arrived before this file
// loaded rendered without it, so render again.
const worktreesRender = render;
render = function () { worktreesRender(); renderWorktrees(); };
if (snap) render();
