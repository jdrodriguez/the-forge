// session.js: the session panel. "View session" on a building card or a "Needs you" item opens a worker's recent
// history (from /api/history, refreshed while the panel is open) with a box that types a message into the session
// (/api/send). On a row of the Sessions view it opens a Claude app session's history the same way, without the box.
// Its address is #session=ABC-123 for a worker and #sessions/local_<id> for an app session, so a link from the herald's
// notification or a call opens it; the open panel marks its worker's card (aria-current) and its calls as seen.
// Loaded after page.html's own script and uses its helpers: esc, link, ago, acctText, workerChip, snap.
const SESSION_POLL_MS = 10000;
const sess = { id: null, timer: null, count: 150, data: null, sig: '', open: new Set() };
const sessEl = (() => {
  const d = document.createElement('dialog');
  d.className = 'sess';
  d.setAttribute('aria-labelledby', 'sessTitle');
  d.innerHTML = `<div class="sess-head">
      <div class="sess-top"><h3 id="sessTitle"></h3><button class="sess-x" type="button" aria-label="Close" title="Close"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>
      <div class="chips" id="sessChips"></div>
      <div class="sess-acts" id="sessActs"></div>
    </div>
    <div class="sess-feed" id="sessFeed" tabindex="0"></div>
    <form class="sess-send" id="sessForm">
      <div class="composer">
        <textarea id="sessText" rows="3" maxlength="8000" aria-label="Message to the worker"></textarea>
        <div class="sess-row"><span class="sess-status" id="sessStatus" role="status"></span><button class="open primary" type="submit" id="sessBtn">Send</button></div>
      </div>
    </form>`;
  document.body.append(d);
  return d;
})();
const sq = (id) => sessEl.querySelector(`#${id}`);
// A bundle's companion opens its lead's worker.
const ticketOf = (id) => snap?.tickets.find((t) => (t.id === id || t.bundle?.some((b) => b.id === id)) && t.workerId);
// A Claude app session from the Sessions view (sessions.js), id app:<host>:<session id>, with its machine. The panel
// only reads one: the owner replies to it in the Claude app.
function appOf(id) {
  const [, host, sid] = String(id).match(/^app:([\w-]+):(local_[0-9a-f-]+)$/) ?? [];
  const m = snap?.sessions?.machines.find((x) => x.host === host);
  const r = m?.rows?.find((x) => x.id === sid);
  return r ? { m, r } : null;
}
// The board's id of an app session from its own (local_...), found among the machines' sessions.
function appIdOf(sid) {
  const m = snap?.sessions?.machines?.find((x) => x.rows?.some((r) => r.id === sid));
  return m ? `app:${m.host}:${sid}` : null;
}
const appSid = (id) => String(id).match(/^app:([\w-]+):(local_[A-Za-z0-9-]{1,64})$/);
const panelHash = (id) => { const a = appSid(id); return a ? `#sessions/${a[2]}` : `#session=${encodeURIComponent(id)}`; };
// The panel the URL names, or null.
function panelFromHash() {
  const w = location.hash.match(/^#session=(.+)$/);
  if (w) return decodeURIComponent(w[1]);
  const a = location.hash.match(/^#sessions\/(local_[A-Za-z0-9-]{1,64})$/);
  return a ? appIdOf(a[1]) : null;
}
// Opens an app session where the owner answers it: in the Claude app, when this page runs on the Mac the session runs on
// (the board names that Mac in viewerHost), and in the board's own panel anywhere else.
function appLink(id) {
  const a = appSid(id);
  return a && snap?.viewerHost === a[1] ? `claude://code/continue?session=${a[2]}` : null;
}
let openExternal = (url) => { location.href = url; };
function openAppSession(id) {
  const url = appLink(id);
  if (url) openExternal(url);
  else openPanel(id);
}
// Marks what the open panel is about: its worker's card, and its calls in the Middle-earth bar, which it answers.
function markOpen(id) {
  document.querySelectorAll('[aria-current="true"][data-id]').forEach((el) => { if (el.dataset.id !== id) el.removeAttribute('aria-current'); });
  if (!id) return;
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((el) => el.setAttribute('aria-current', 'true'));
  const a = appSid(id);
  const mine = typeof calls === 'object' ? [...calls.all.values()].filter((c) => (a ? c.who?.session === a[2] : c.who?.id === id)) : [];
  if (mine.length && typeof callDismiss === 'function') callDismiss(mine);
}
const APP_STATE = { needs: 'waiting on you', stopped: 'stopped mid-turn', review: 'ready for review', unseen: 'new since you looked', working: 'working', error: 'errored', quiet: 'quiet', done: 'done' };
function renderAppHead(a) {
  sq('sessTitle').textContent = a.r.title;
  sq('sessChips').innerHTML = `<span class="chip host" style="--mc:${machineColor(a.m.host)}">${esc(realmName(a.m.host))} (${esc(a.m.name)})</span>
    <span class="chip${a.r.state === 'needs' || a.r.state === 'stopped' ? ' warn' : ''}">${esc(APP_STATE[a.r.state] || a.r.state)}</span>
    <span class="chip">last activity ${ago(new Date(a.r.activityAt).toISOString())}</span>${a.r.routine ? '<span class="chip">routine</span>' : ''}`;
  sq('sessForm').hidden = true;
  setActs('');
}
// The worker's PR and where it stands, Open in terminal, and the details the Queue's cards once carried: the last push,
// the worker's id and the command that attaches to it. Rewritten only when it changes, so a message beside Open in
// terminal and an open Details stay put.
function setActs(html) {
  if (sq('sessActs').dataset.html !== html) { sq('sessActs').innerHTML = html; sq('sessActs').dataset.html = html; }
}
function ticketActs(t) {
  const s = t.live ? standing(t) : null, pr = t.pr;
  const state = s ? `<span class="chip ${s.sev}">${esc(s.long)}</span>` : '';
  const prLink = pr ? `<a class="chip" href="${esc(pr.url)}" target="_blank" rel="noopener">${ICON.pr}PR #${pr.number}</a>` : '';
  const term = t.attach ? `<button class="open" type="button" data-id="${esc(t.id)}">Open in terminal</button><span class="msg"></span>` : '';
  const facts = [['Last push', ago(pr ? pr.lastCommitAt : t.branchCommitAt)], ['Worker', t.workerId || 'n/a'], t.attach ? ['Command', t.attach] : null].filter(Boolean);
  const details = `<details class="sess-more"><summary>Details</summary><dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${k === 'Command' ? `<code class="cmd">${esc(v)}</code>` : esc(v)}</dd>`).join('')}</dl></details>`;
  return `<div class="chips">${state}${prLink}</div><div class="open-row">${term}${details}</div>`;
}

function clock(t) {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderHead() {
  const app = String(sess.id).startsWith('app:') ? appOf(sess.id) : null;
  if (app) return renderAppHead(app);
  const t = ticketOf(sess.id);
  sq('sessTitle').innerHTML = t ? `${figureAvatar(t)}${wname(t)} <span class="mono">${link(t.url, t.label || t.id)}</span> ${esc(t.title || (t.ticket ? '' : t.name) || '')}` : esc(sess.id);
  paintAvatars(sq('sessTitle'));
  if (!t) return setActs('');
  setActs(ticketActs(t));
  const seen = sess.data?.updatedAt ? `<span class="chip">last activity ${ago(sess.data.updatedAt)}</span>` : '';
  // A Codex or Grok worker's mark by its name says what runs it, so it gets no account chip; it takes no messages either
  // (it reads its brief, not a terminal), so its panel shows its runs (engine-history.mjs) with no message box.
  const engine = onEngine(t);
  sq('sessChips').innerHTML = `<span class="chip host" style="--mc:${machineColor(t.host)}">${esc(realmName(t.host))} (${esc(t.machine)})</span>
    ${engine ? '' : `<span class="chip">${esc(acctText(t.accountEmail, t.accountPlan, t.account))}</span>`}${t.live ? workerChip(t) : `<span class="chip">${esc(t.status)}</span>`}${seen}`;
  const blocked = t.workerState === 'blocked';
  const form = sq('sessForm');
  form.hidden = !t.live || engine;
  sq('sessText').disabled = blocked;
  sq('sessBtn').disabled = blocked;
  sq('sessText').placeholder = `Message ${t.nickname || `${t.label || t.id}'s worker`}. Ctrl+Enter sends.`;
  sq('sessText').setAttribute('aria-label', `Message to ${called(t)}`);
  if (blocked) sq('sessStatus').textContent = 'It is waiting on a prompt in its session. Answer it with Open in terminal.';
}

// Bold and inline code, the two marks workers use most. The text is escaped first, so the marks wrap safe text.
const marks = (s) => esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');

function eventHtml(e, i) {
  const key = `${e.at}|${i}`;
  const open = sess.open.has(key) ? ' open' : '';
  const time = e.at ? `<time datetime="${esc(e.at)}" title="${esc(new Date(e.at).toLocaleString())}">${clock(e.at)}</time>` : '';
  if (e.t === 'tool') {
    return `<div class="ev tool" data-key="${esc(key)}"><div class="ev-line"><span class="tn">${esc(e.name)}</span><span class="tl">${esc(e.label || '')}</span>${time}</div>
      ${e.detail ? `<code class="det${open}">${esc(e.detail)}</code>` : ''}</div>`;
  }
  const name = esc(ticketOf(sess.id)?.nickname || '');
  const who = String(sess.id).startsWith('app:') ? { user: 'You', assistant: aiMark('claude'), error: 'Tool error', system: 'Notice' }[e.t] || esc(e.t)
    : { user: `Sent to ${name || 'worker'}`, assistant: name || 'Worker', error: 'Tool error', system: 'Notice' }[e.t] || esc(e.t);
  return `<div class="ev ${esc(e.t)}" data-key="${esc(key)}"><div class="ev-line"><span class="who">${who}</span>${time}</div>
    <div class="txt${open}">${e.t === 'error' ? esc(e.text) : marks(e.text)}</div></div>`;
}

function renderFeed() {
  const feed = sq('sessFeed');
  const d = sess.data;
  if (!d) { feed.innerHTML = '<div class="empty">Loading the session...</div>'; return; }
  if (!d.ok) { feed.innerHTML = `<div class="empty">${esc(d.error || 'Could not read the session.')}</div>`; return; }
  const sig = `${d.events.length}|${d.events.at(-1)?.at}|${sess.open.size}`;
  if (sig === sess.sig) return;
  sess.sig = sig;
  const pinned = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  const more = d.earlier && sess.count < 400 ? '<button class="open more" type="button">Show earlier</button>' : '';
  feed.innerHTML = more + (d.events.length ? d.events.map(eventHtml).join('') : '<div class="empty">Nothing in this session yet.</div>');
  feed.querySelectorAll('.txt').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4) el.classList.add('clamped'); });
  if (pinned || !sess.loaded) feed.scrollTop = feed.scrollHeight;
  sess.loaded = true;
}

async function loadHistory() {
  const id = sess.id;
  clearTimeout(sess.timer);
  try {
    const r = await fetch(`/api/history?id=${encodeURIComponent(id)}&n=${sess.count}`);
    const body = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (id !== sess.id) return;
    sess.data = body;
  } catch (err) {
    if (id !== sess.id) return;
    sess.data = sess.data?.ok ? sess.data : { ok: false, error: `Could not reach the board: ${err.message}` };
  }
  renderHead();
  renderFeed();
  if (sessEl.open && !document.hidden) sess.timer = setTimeout(loadHistory, SESSION_POLL_MS);
}

function openPanel(id, push = true) {
  Object.assign(sess, { id, count: 150, data: null, sig: '', loaded: false, open: new Set() });
  sq('sessStatus').textContent = '';
  sq('sessText').value = '';
  renderHead();
  renderFeed();
  if (!sessEl.open) sessEl.showModal();
  sess.pushed = push;
  if (push) history.pushState({ session: id }, '', panelHash(id));
  markOpen(id);
  loadHistory();
}
function closePanel() {
  clearTimeout(sess.timer);
  sess.id = null;
  if (sessEl.open) sessEl.close();
}

// Closing goes back to where the panel was opened from; one opened by a link (a notification) has nowhere to go back
// to, so its address becomes its view's own.
sessEl.addEventListener('close', () => {
  clearTimeout(sess.timer);
  markOpen(null);
  const app = location.hash.startsWith('#sessions/');
  if (!app && !location.hash.startsWith('#session=')) return;
  if (sess.pushed) history.back();
  else history.replaceState(null, '', app ? '#sessions' : location.pathname + location.search);
});
sessEl.addEventListener('click', (e) => {
  if (e.target === sessEl || e.target.closest('.sess-x')) return closePanel();
  if (e.target.closest('.more')) { sess.count = 400; sess.sig = ''; return loadHistory(); }
  const ev = e.target.closest('.ev');
  if (ev && (e.target.closest('.det') || e.target.closest('.txt.clamped, .txt.open')) && !getSelection().toString()) {
    sess.open.has(ev.dataset.key) ? sess.open.delete(ev.dataset.key) : sess.open.add(ev.dataset.key);
    sess.sig = '';
    renderFeed();
  }
});
sq('sessText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sq('sessForm').requestSubmit(); }
});
sq('sessForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = sq('sessText').value.trim();
  if (!text || !sess.id) return;
  const id = sess.id, btn = sq('sessBtn'), status = sq('sessStatus');
  btn.disabled = true;
  status.textContent = 'Typing it into the session...';
  try {
    const r = await fetch(`/api/send?id=${encodeURIComponent(id)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Board': 'send' }, body: JSON.stringify({ text }),
    });
    const body = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (id !== sess.id) return;
    if (body.ok) {
      sq('sessText').value = '';
      status.textContent = body.delivered ? 'Delivered.' : `Sent. ${cap(called(ticketOf(id)))} is mid-step, so it reads it at its next step.`;
      sess.sig = '';
      setTimeout(() => { if (id === sess.id) loadHistory(); }, 1500);
    } else {
      status.textContent = `Not sent: ${body.error || r.status}`;
    }
  } catch (err) {
    status.textContent = `Not sent: ${err.message}`;
  }
  btn.disabled = ticketOf(id)?.workerState === 'blocked';
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('button.view');
  if (b) openPanel(b.dataset.id);
});
window.addEventListener('popstate', () => {
  const id = snap && panelFromHash();
  if (id) openPanel(id, false);
  else if (sessEl.open) { clearTimeout(sess.timer); sess.id = null; sessEl.close(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && sessEl.open) loadHistory(); });
// The page re-renders on every poll; keep the panel's header in step with the new snapshot.
const sessRender = render;
render = function () { sessRender(); if (sessEl.open) { renderHead(); markOpen(sess.id); } };
// A link with #session=ABC-123 or #sessions/local_<id> (a notification, a shared link) opens that panel once the first
// snapshot is in; an app session waits for the sessions scan too, and one no longer listed leaves the Sessions view.
(function openFromHash(tries = 0) {
  if (!/^#session=|^#sessions\//.test(location.hash)) return;
  const id = snap && panelFromHash();
  if (id) return openPanel(id, false);
  if (tries < 40) setTimeout(() => openFromHash(tries + 1), 500);
})();
