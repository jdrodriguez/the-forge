// session.js: the session panel. "View session" on a building card or a "Needs you" item opens a worker's recent
// history (from /api/history, refreshed while the panel is open) with a box that types a message into the session
// (/api/send). Loaded after page.html's own script and uses its helpers: esc, link, ago, acctText, workerChip, snap.
const SESSION_POLL_MS = 10000;
const sess = { id: null, timer: null, count: 150, data: null, sig: '', open: new Set() };
const sessEl = (() => {
  const d = document.createElement('dialog');
  d.className = 'sess';
  d.setAttribute('aria-labelledby', 'sessTitle');
  d.innerHTML = `<div class="sess-head">
      <div class="sess-top"><h3 id="sessTitle"></h3><button class="sess-x" type="button" aria-label="Close" title="Close"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>
      <div class="chips" id="sessChips"></div>
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

function clock(t) {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderHead() {
  const t = ticketOf(sess.id);
  sq('sessTitle').innerHTML = t ? `<span class="mono">${link(t.url, t.label || t.id)}</span> ${esc(t.title || (t.ticket ? '' : t.name) || '')}` : esc(sess.id);
  if (!t) return;
  const seen = sess.data?.updatedAt ? `<span class="chip">last activity ${ago(sess.data.updatedAt)}</span>` : '';
  sq('sessChips').innerHTML = `<span class="chip host" style="--mc:${machineColor(t.host)}">${esc(t.machine)}</span>
    <span class="chip">${esc(acctText(t.accountEmail, t.accountPlan, t.account))}</span>${t.live ? workerChip(t) : `<span class="chip">${esc(t.status)}</span>`}${seen}`;
  const blocked = t.workerState === 'blocked';
  const form = sq('sessForm');
  form.hidden = !t.live;
  sq('sessText').disabled = blocked;
  sq('sessBtn').disabled = blocked;
  sq('sessText').placeholder = `Message ${t.label || t.id}'s worker. Ctrl+Enter sends.`;
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
  const who = { user: 'Sent to worker', assistant: 'Worker', error: 'Tool error', system: 'Notice' }[e.t] || e.t;
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
  if (push) history.pushState({ session: id }, '', `#session=${encodeURIComponent(id)}`);
  loadHistory();
}
function closePanel() {
  clearTimeout(sess.timer);
  sess.id = null;
  if (sessEl.open) sessEl.close();
}

sessEl.addEventListener('close', () => {
  clearTimeout(sess.timer);
  if (location.hash.startsWith('#session=')) history.back();
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
      status.textContent = body.delivered ? 'Delivered.' : 'Sent. The worker is mid-step, so it reads it at its next step.';
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
  const m = location.hash.match(/^#session=(.+)$/);
  if (m && snap) openPanel(decodeURIComponent(m[1]), false);
  else if (sessEl.open) { clearTimeout(sess.timer); sess.id = null; sessEl.close(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && sessEl.open) loadHistory(); });
// The page re-renders on every poll; keep the panel's header in step with the new snapshot.
const sessRender = render;
render = function () { sessRender(); if (sessEl.open) renderHead(); };
// A shared link with #session=ENG-123 opens that panel once the first snapshot is in.

(function openFromHash() {
  const m = location.hash.match(/^#session=(.+)$/);
  if (!m) return;
  if (!snap) return setTimeout(openFromHash, 500);
  openPanel(decodeURIComponent(m[1]), false);
})();
