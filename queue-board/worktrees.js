// worktrees.js: the Worktrees view, every machine's git worktrees from the snapshot's worktrees (worktree-state.mjs).
// A row of chips at the top picks one machine (#worktrees/<host>) or All (#worktrees), and Forgotten narrows either to
// what Gollum hoards (#worktrees/forgotten, #worktrees/<host>/forgotten): worktrees nobody uses whose last commit is
// three days old, or seven with a PR open (gollum-data.js's grForgotten), oldest first. Each machine lists its
// worktrees by state, the ones that need a look first, with its counts in plain text. The merged or closed ones that
// hold nothing GitHub lacks are folded into one "safe to remove" line, since those are what a cleanup takes. A row
// names its repository only when it is not the default one. Read-only: it changes nothing. Loaded after page.html's
// own script and uses its helpers: $, esc, ago, ico, ICON, snap, machineColor, realmName, sigil, render, WT_STATE,
// wtCounts, and gollum-data.js's grForgotten.
const wtOpen = {};
const WT_ICON = { active: ['run', 'run'], open: ['pr', 'todo'], local: ['warn', 'warn'], closed: ['todo', 'free'], merged: ['ok', 'merged'], nopr: ['free', 'free'], missing: ['bad', 'bad'] };
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

function wtMachine(m, repo, forgotten) {
  const head = `<h2 class="gh">${sigil(m.host, machineColor(m.host))}${esc(realmName(m.host))} <span class="gcount">${esc(m.name)}${m.rows ? `, ${m.rows.length}` : ''}</span></h2>`;
  const wrap = (body) => `<section class="group" id="wt-${esc(m.host)}">${head}${body}</section>`;
  if (!m.rows) return wrap(`<div class="empty">${m.error ? `Could not read its worktrees: ${esc(m.error)}` : 'Reading its worktrees...'}</div>`);
  if (forgotten) {
    const now = Date.now();
    const old = m.rows.filter((r) => grForgotten(r, now)).sort((a, b) => Date.parse(a.lastCommitAt) - Date.parse(b.lastCommitAt));
    return wrap(`<div class="wt-sum"><span>${old.length ? `${wtPlural(old.length, 'forgotten worktree')}, oldest first` : 'Nothing forgotten here.'}</span></div>${old.map((r) => wtRow(r, repo)).join('')}`);
  }
  const order = Object.keys(WT_STATE);
  const rows = [...m.rows].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || (b.lastCommitAt || '').localeCompare(a.lastCommitAt || ''));
  const keep = rows.filter((r) => !r.removable), spare = rows.filter((r) => r.removable);
  const sum = wtCounts(rows).map(([s, n]) => `${n} ${esc(WT_STATE[s][1])}`).join(', ');
  const read = `<span class="muted">Read ${ago(m.at)}${m.error ? `, the last scan failed: ${esc(m.error)}` : ''}</span>`;
  const more = spare.length ? `<div class="more-row"><button class="show-all wt-more" type="button" data-host="${esc(m.host)}" title="Merged or closed, nobody working in them, and nothing in them that GitHub lacks">${wtOpen[m.host] ? 'Hide' : 'Show'} ${spare.length} safe to remove</button></div>` : '';
  return wrap(`<div class="wt-sum">${sum ? `<span>${sum}</span>` : '<span class="muted">No worktrees.</span>'}${read}</div>`
    + keep.map((r) => wtRow(r, repo)).join('') + (wtOpen[m.host] ? spare.map((r) => wtRow(r, repo)).join('') : '') + more);
}

// What the URL picks: a machine (#worktrees/<host>) or null for All, and whether Forgotten narrows it.
function wtPicked(wt) {
  const [name, ...rest] = location.hash.slice(1).split('/');
  if (name !== 'worktrees') return { host: null, forgotten: false };
  const forgotten = rest.at(-1) === 'forgotten';
  let h = null;
  try {
    h = rest[0] && rest[0] !== 'forgotten' ? decodeURIComponent(rest[0]) : null;
  } catch { /* a malformed hash picks no machine */ }
  return { host: wt.machines.some((m) => m.host === h) ? h : null, forgotten };
}
const wtHref = (host, forgotten) => `#worktrees${host ? `/${encodeURIComponent(host)}` : ''}${forgotten ? '/forgotten' : ''}`;

function renderWorktrees() {
  const wt = snap?.worktrees;
  if (!wt) { $('worktrees').innerHTML = '<div class="empty">Reading the worktrees on every machine...</div>'; return; }
  const { host: pick, forgotten } = wtPicked(wt);
  const shown = wt.machines.filter((m) => !pick || m.host === pick);
  const read = shown.filter((m) => m.rows);
  const all = read.flatMap((m) => m.rows);
  const spare = all.filter((r) => r.removable).length;
  const total = wt.machines.reduce((n, m) => n + (m.rows?.length ?? 0), 0);
  const tab = (href, on, label, n) => `<a class="chip${on ? ' on' : ''}" href="${href}" data-go${on ? ' aria-current="true"' : ''}>${label}${n != null ? ` <b>${n}</b>` : ''}</a>`;
  const now = Date.now();
  const lost = (m) => (m.rows ?? []).filter((r) => grForgotten(r, now)).length;
  const lostAll = shown.reduce((n, m) => n + lost(m), 0);
  const picker = `<nav class="wt-pick" aria-label="Machine">${tab(wtHref(null, forgotten), !pick, 'All', total)}${wt.machines.map((m) =>
    tab(wtHref(m.host, forgotten), m.host === pick, `${sigil(m.host, machineColor(m.host))}${esc(realmName(m.host))}`, m.rows?.length)).join('')}`
    + `${tab(wtHref(pick, !forgotten), forgotten, 'Forgotten', lostAll)}</nav>`;
  $('worktrees').innerHTML = picker
    + `<div class="ibar"><span><b>${all.length}</b> worktrees${pick ? '' : ` on ${wtPlural(read.length, 'machine')}`}</span>${spare ? `<span><b>${spare}</b> safe to remove</span>` : ''}<span>Scanned every ${wt.everyMinutes} minutes</span>${wt.prErrors.length ? `<span>Could not read PRs for ${esc(wt.prErrors.join('; '))}</span>` : ''}</div>`
    + shown.map((m) => wtMachine(m, wt.repo, forgotten)).join('');
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
