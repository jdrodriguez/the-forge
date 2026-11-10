// gollum-view.js: the Gollum view, what Gollum reports (gollum-data.js's grReport) in two parts. The Ring is a card
// across the full width listing every Claude account at 90% or more of its 5-hour or weekly window, with when each
// window resets and where the account is signed in. The hoard is a card per machine, dressed as its realm like the
// Machines view's cards, listing that machine's forgotten worktrees oldest first: its branch, how long since the last
// commit, its PR, and chips for uncommitted changes, commits GitHub lacks and "safe to remove". Read-only: it changes
// nothing. A card's id is g-<host>, so #gollum/<host> scrolls to it (page.html's TARGET). Loaded after machines.js
// and uses its grReport, the page's helpers ($, esc, ago, ico, ICON, snap, realmName, realmKind, machineColor, band)
// and machines.js's usageCell, email, plural and paintBand, machines-accounts.js's realmLink, and worktrees.js's
// wtPlural, only when it renders.
let gvObserver = null;

// Where an account is signed in: each machine's realm with the labels it has there.
function gvPlaces(a) {
  const hosts = [...new Set(a.places.map((p) => p.host))];
  return hosts.map((host) => {
    const m = snap.machines.find((x) => x.host === host);
    const labels = a.places.filter((p) => p.host === host).map((p) => p.label).join(', ');
    return `${m ? realmLink(m) : esc(host)} (${esc(labels)})`;
  }).join(', ');
}
// One window's cell: the reading with its reset, or a muted note when only the other window is hot.
const gvWindow = (a, span, floor) => {
  const w = a.windows.find((x) => x.span === span);
  return w ? usageCell({ used: w.used, resetsAt: w.resetsAt }, floor) : `<span class="sub">under ${GR_HOT}%</span>`;
};
function gvRingRow(a, floor) {
  const places = gvPlaces(a);
  return `<tr><td class="who">${a.email ? email(a.email) : 'account'} <span class="chip" title="Account label">${esc(a.labels.join(', '))}</span>`
    + `<span class="sub nar">on ${places}</span></td><td>${gvWindow(a, '5-hour', floor)}</td><td>${gvWindow(a, 'weekly', floor)}</td>`
    + `<td class="wide where">${places}</td></tr>`;
}
function gvRing(report, floor) {
  const n = report.ring.length;
  const sub = n ? `<span class="chip warn">${n} past ${GR_HOT}%</span>` : '<span class="chip ok">none past ' + GR_HOT + '%</span>';
  const body = n
    ? `<table class="accts gv-ring"><thead><tr><th>Account</th><th class="u">5-hour</th><th class="u">Weekly</th><th class="wide w">Signed in on</th></tr></thead>`
      + `<tbody>${report.ring.map((a) => gvRingRow(a, floor)).join('')}</tbody></table>`
    : `<div class="empty">No account is past ${GR_HOT}% of its 5-hour or weekly limit.</div>`;
  return `<article class="mcard wide" id="g-ring" data-r="stones">${band('stones', 'The Ring', sub)}<div class="msec">${body}</div></article>`;
}

// One forgotten worktree: its branch (the folder's name when it has none) and the age of its last commit, then chips.
function gvRow(r, usual) {
  const pr = r.pr ? `<a class="chip" href="${esc(r.pr.url)}" target="_blank" rel="noopener" title="${esc(r.pr.title)}">${ICON.pr}#${r.pr.number} ${r.pr.state === 'OPEN' && r.pr.draft ? 'draft' : esc(r.pr.state.toLowerCase())}</a>` : '';
  const chips = [
    pr,
    r.repo !== usual ? `<span class="chip">${esc(r.repo)}</span>` : '',
    r.changed ? `<span class="chip warn" title="Tracked files with uncommitted changes">${r.changed} uncommitted</span>` : '',
    r.onlyHere ? `<span class="chip warn" title="Commits on no branch on GitHub">${wtPlural(r.onlyHere, 'commit')} not on GitHub</span>` : '',
    r.removable ? '<span class="chip ok" title="Merged or closed, and nothing in it that GitHub lacks">safe to remove</span>' : '',
  ].join('');
  return `<div class="row"><span class="ico todo" aria-hidden="true">${ICON.branch}</span><div class="rbody"><div class="rline">`
    + `<span class="rtitle" title="${esc(r.path)}">${esc(r.branch || r.name)}</span><span class="rmeta" title="Last commit">${ago(r.lastCommitAt)}</span></div>`
    + `${chips ? `<div class="chips">${chips}</div>` : ''}</div></div>`;
}
function gvCard(h, usual) {
  const m = snap.machines.find((x) => x.host === h.host);
  const sub = `${esc(m?.name ?? h.host)}<span class="chip ${h.rows.length ? 'warn' : 'ok'}">${h.rows.length ? `${h.rows.length} forgotten` : 'none forgotten'}</span>`;
  const body = h.rows.length ? h.rows.map((r) => gvRow(r, usual)).join('') : '<div class="empty">Nothing forgotten</div>';
  return `<article class="mcard gv" id="g-${esc(h.host)}" data-r="${realmKind(h.host)}" style="--mc:${machineColor(h.host)}">${band(realmKind(h.host), realmName(h.host), sub)}${body}</article>`;
}

function renderGollum() {
  const root = $('gollum');
  if (!snap || typeof grReport !== 'function') { root.innerHTML = '<div class="empty">Reading the machines...</div>'; return; }
  const report = grReport();
  const usual = snap.worktrees?.repo;
  root.innerHTML = `<div class="mview"><div class="machines">${gvRing(report, snap.config.headroomFloorPercent)}${report.hosts.map((h) => gvCard(h, usual)).join('')}</div></div>`;
  // A band paints once it has a width, so a card built while the view is hidden paints when the view opens.
  gvObserver?.disconnect();
  gvObserver = new ResizeObserver((entries) => entries.forEach((e) => paintBand(e.target)));
  root.querySelectorAll('.mband').forEach((b) => gvObserver.observe(b));
}
// A snapshot that arrived before this file loaded rendered without it, so render again.
if (snap) render();
