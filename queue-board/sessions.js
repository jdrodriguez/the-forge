// sessions.js: the Sessions view, the owner's Claude app sessions outside the queue on every machine, from the snapshot's
// sessions (sessions.mjs). Waiting on them (what each needs, in its own words) and Ready for their review stay open; every
// other group (working now, new since they last opened them, errored, quiet for two days, done and seen) is one line that
// opens in place. A row shows only its open PRs. A routine shows only its latest run. Handled hides a row until its
// session does something new (board.mjs keeps the marks). View opens the session's transcript in the session panel
// (session.js); replies happen in the Claude app. Loaded after page.html's own script
// and uses its helpers: $, esc, ago, ico, ICON, link, linkify, snap, machineColor, realmName, sigil, render.
const SESS_GROUPS = [
  ['working', 'Working now', 'run', 'run'],
  ['needs', 'Waiting on you', 'seal', 'warn'],
  ['review', 'Ready for your review', 'pr', 'todo'],
  ['unseen', 'New since you looked', 'spark', 'run'],
  ['error', 'Errored', 'bad', 'bad'],
  ['quiet', 'Quiet for 2+ days', 'free', 'free'],
  ['done', 'Done and seen', 'ok', 'merged'],
];
// The groups that show as one line until opened: only Waiting on you and Ready for your review ask anything of the owner.
const SESS_FOLDED = new Set(['working', 'unseen', 'error', 'quiet', 'done']);
const sessOpen = { handled: false };
const SESS_DOWN = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SESS_UP = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 9l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const sessKey = (m, r) => `${m.host}:${r.id}`;
const sessAgo = (ms) => (ms ? ago(new Date(ms).toISOString()) : 'never');

// Every row the view shows, each with its machine, keeping only a routine's latest run on each machine. A session
// stopped mid-turn waits on the owner too, most likely on a prompt in the app, so it joins Waiting on you.
function sessRows() {
  const out = [];
  for (const m of snap?.sessions?.machines ?? []) {
    const seen = new Set();
    for (const r of m.rows ?? []) {
      if (r.routine) { if (seen.has(r.routine)) continue; seen.add(r.routine); }
      const handled = (snap.sessions.handled?.[sessKey(m, r)] ?? 0) >= (r.activityAt ?? 0);
      out.push({ m, r, group: r.state === 'stopped' ? 'needs' : r.state, handled });
    }
  }
  return out;
}
// For the sidebar: how many sessions wait on the owner and haven't been marked handled.
function sessNeedCount() {
  return snap?.sessions ? sessRows().filter((x) => x.group === 'needs' && !x.handled).length : null;
}

function sessRow({ m, r, group, handled }) {
  const many = (snap.sessions.machines ?? []).filter((x) => x.rows?.length).length > 1;
  // A session in the usual workspace folder (snap.config.workspaceFolder) needs no folder chip.
  const ws = snap.config?.workspaceFolder;
  const folder = r.folder && !(ws && r.folder.replace(/\/+$/, '').split('/').pop() === ws) ? r.folder.split('/').pop() : '';
  const chips = [
    r.state === 'stopped' ? '<span class="chip warn" title="Its last turn never finished: most likely a question or permission prompt waiting in the app">stopped mid-turn</span>' : '',
    many ? `<span class="mini-host" style="--mc:${machineColor(m.host)}" title="${esc(m.name)}">${sigil(m.host)}${esc(realmName(m.host))}</span>` : '',
    r.routine ? `<span class="chip" title="Scheduled routine ${esc(r.routine)}">routine</span>` : '',
    r.parent ? `<span class="chip">${(() => { const p = m.rows.find((x) => x.id === r.parent); return p ? `from ${esc(p.title)}` : 'side session'; })()}</span>` : '',
    r.remote ? '<span class="chip">remote</span>' : '',
    folder ? `<span class="chip" title="${esc(r.folder)}">${esc(folder)}</span>` : '',
    ...r.prs.filter((p) => /^https:\/\//.test(p.url) && p.state === 'OPEN').map((p) => `<a class="chip" href="${esc(p.url)}" target="_blank" rel="noopener">${ICON.pr}#${esc(p.number)} ${esc(String(p.state || '').toLowerCase())}</a>`),
  ].join('');
  const said = group === 'needs' ? r.ask || r.detail || 'Its last turn ended waiting on you.' : group === 'error' ? r.error : r.detail || r.report || '';
  const fresh = (r.activityAt ?? 0) > (r.focusedAt ?? 0) + 60_000;
  const [, , icon, cls] = SESS_GROUPS.find((g) => g[0] === group);
  const act = group === 'quiet' || group === 'done' || group === 'working' ? '' : `<button class="open sess-done" type="button" data-key="${esc(sessKey(m, r))}" data-at="${handled ? 0 : Number(r.activityAt) || 0}">${handled ? 'Show again' : 'Handled'}</button>`;
  // Two lines: the title with its chips, then what it said; its age and buttons sit at the right end of the first.
  return `<div class="row sessrow${handled ? ' handled' : ''}">${ico(icon, cls)}<div class="rbody">
    <div class="rline">${fresh && group !== 'working' ? '<span class="sess-new" title="Changed since you last opened it"></span>' : ''}<span class="rtitle" title="${esc(r.title)}">${esc(r.title)}</span>${chips}</div>
    ${said ? `<div class="rtext">${linkify(said)}</div>` : ''}
  </div><div class="sess-side"><span class="rmeta" title="Last activity">${sessAgo(r.activityAt)}</span><button class="open view" type="button" data-id="app:${esc(m.host)}:${esc(r.id)}">View</button>${act}</div></div>`;
}

function renderSessions() {
  const S = snap?.sessions;
  if (!S) { $('sessions').innerHTML = '<div class="empty">Reading the Claude app sessions on every machine...</div>'; return; }
  const rows = sessRows();
  const live = rows.filter((x) => !x.handled);
  const count = (g) => live.filter((x) => x.group === g).length;
  const read = S.machines.filter((m) => m.at).map((m) => m.at).sort()[0];
  const errs = S.machines.filter((m) => m.error).map((m) => `${m.name}: ${m.error}`);
  const bar = `<div class="ibar"><span><b>${count('working')}</b> working</span><span><b>${count('needs')}</b> waiting on you</span><span><b>${count('review')}</b> to review</span><span><b>${count('unseen')}</b> new since you looked</span>`
    + `<span>Read ${read ? ago(read) : 'never'}</span>`
    + `${errs.length ? `<span class="bad">Could not read ${esc(errs.join('; '))}</span>` : ''}</div>`;
  const groups = SESS_GROUPS.map(([g, title, icon, cls]) => {
    const list = live.filter((x) => x.group === g);
    if (!list.length) return g === 'needs' ? `<section class="group"><div class="all-clear">${ico('ok', 'ok')}No session is waiting on you.<span class="lore">No messengers at the door.</span></div></section>` : '';
    if (SESS_FOLDED.has(g)) {
      const open = Boolean(sessOpen[g]);
      return `<section class="group sess-line"><button class="fold sess-fold" type="button" data-g="${g}" aria-expanded="${open}">${ico(icon, cls)}<span class="lab">${esc(title)}</span><b>${list.length}</b><span class="go">${open ? SESS_UP : SESS_DOWN}</span></button>${open ? `<div class="fold-body">${list.map(sessRow).join('')}</div>` : ''}</section>`;
    }
    return `<section class="group"><h2 class="gh">${ico(icon, cls)}${esc(title)} <span class="gcount${g === 'needs' ? ' seal' : ''}">${list.length}</span></h2>${list.map(sessRow).join('')}</section>`;
  }).join('');
  const done = rows.filter((x) => x.handled);
  const handledRow = done.length ? `<section class="group"><div class="more-row"><button class="show-all sess-fold" type="button" data-g="handled">${sessOpen.handled ? 'Hide' : 'Show'} ${done.length} marked handled</button></div>${sessOpen.handled ? done.map(sessRow).join('') : ''}</section>` : '';
  $('sessions').innerHTML = bar + groups + handledRow;
}

document.addEventListener('click', async (e) => {
  const fold = e.target.closest('.sess-fold');
  if (fold) { sessOpen[fold.dataset.g] = !sessOpen[fold.dataset.g]; renderSessions(); return; }
  const b = e.target.closest('.sess-done');
  if (!b) return;
  b.disabled = true;
  try {
    const r = await fetch(`/api/handled?key=${encodeURIComponent(b.dataset.key)}&at=${encodeURIComponent(b.dataset.at)}`, { method: 'POST', headers: { 'X-Board': 'handled' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const at = Number(b.dataset.at);
    if (at) snap.sessions.handled[b.dataset.key] = at;
    else delete snap.sessions.handled[b.dataset.key];
    render();
  } catch (err) {
    b.disabled = false;
    b.title = `Not saved: ${err.message}`;
  }
});
// The page re-renders on every new snapshot; the Sessions view follows it. A snapshot that arrived before this file
// loaded rendered without it, so render again.
const sessionsRender = render;
render = function () { sessionsRender(); renderSessions(); };
if (snap) render();
