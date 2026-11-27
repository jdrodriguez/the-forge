// queue-view.js: the Queue, one short page in a fixed order. Needs you sits at the top, one line per item: a row that
// carries a question opens in place to show it, its recommendation and where to answer; every other row opens the thing
// it names (a worker's session panel, the PR waiting on a merge, the machine's card in Fleet, the ticket in Linear). The
// signed-out accounts fold into one row. Then the Workers grid, one card per worker grouped by machine, under the one
// worker count (worker-count.js); a worker that waits on you shows only in Needs you. Last, Ready and Merged as one
// line each, which open in place to their lists. Loaded after page.html's own script; uses its helpers (esc, cap, ico,
// ICON, standing, ms, dur, ago, link, figureAvatar, paintAvatars, wname, realmName, machineColor, sigil, priIco,
// sentryChip, ticketLinks, sentryHost, sentryOrder) and render() calls renderQueue.
const qOpen = new Set();
let qMergedAll = false;
const Q_CHEV = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const Q_DOWN = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const Q_UP = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 9l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const Q_EXT = '<svg class="ic" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3H3v8h8V8.5M8 2.5h3.5V6M11.5 2.5 6.5 7.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// An age in one short word: 37m, 13h, 4d.
const qAge = (t) => (t ? dur(ms(t)).split(' ')[0] : '');
const qPfx = (s) => esc(s).replace(/\b([A-Z]+-)(?=\d)/g, '<span class="pfx">$1</span>');
const qTitle = (s) => String(s || '').replace(/^\[(Decision|Blocked)\]\s*/, '');
// The Needs you items that are about machines, whose row opens that machine's card in Fleet.
const Q_MACHINE_KINDS = new Set(['Machine', 'Paused', 'Tick error', 'No ticks', 'Sentry slot', 'Swapping']);

// The attention() list made into rows: signed-out accounts folded into one, each item with its worker, its question and
// where a click lands. Newest first among the red ones, then the amber ones.
function queueNeeds(needs) {
  const letters = new Set();
  let soWhen = null, soBad = false;
  const rows = [];
  for (const n of needs) {
    const so = n.kind === 'Signed out' ? (n.text.match(/^Account (\w+)\b/) || [])[1] : (qTitle(n.title).match(/^Fleet account (\w)\b/) || [])[1];
    if (so) {
      letters.add(so);
      if (n.sev === 'bad') soBad = true;
      if (n.when && (!soWhen || n.when < soWhen)) soWhen = n.when;
      continue;
    }
    // Only the item made from an open ask carries its question; another alert on the same ticket opens what it names.
    const ask = (snap.asks || []).find((a) => a.id === n.id && a.title === n.title && a.question === n.text);
    const worker = n.id ? snap.tickets.find((t) => t.id === n.id && t.live && t.nickname) : null;
    const q = ask?.question || (n.kind === 'Blocked' && worker?.question) || '';
    const href = q ? null : n.kind === 'Merge' && n.href ? n.href : worker ? `#session=${encodeURIComponent(worker.id)}` : n.href || (Q_MACHINE_KINDS.has(n.kind) && n.host ? `#fleet/${encodeURIComponent(n.host)}` : n.url || null);
    rows.push({ ...n, key: `${n.kind}|${n.id || n.title}|${n.text?.slice(0, 40)}`, ask, worker, q, href, line: n.id ? qTitle(n.title) : `${n.title}: ${n.text}` });
  }
  if (letters.size) {
    const l = [...letters].sort();
    rows.push({ sev: soBad ? 'bad' : 'warn', kind: 'Signed out', key: 'signed-out', when: soWhen, href: '#fleet', line: `${l.length} account${l.length > 1 ? 's' : ''} signed out: ${l.join(', ')}` });
  }
  return rows.sort((a, b) => (a.sev === b.sev ? (b.when || '').localeCompare(a.when || '') : a.sev === 'bad' ? -1 : 1));
}

function needRow(n) {
  const warm = n.sev !== 'bad';
  const open = n.q && qOpen.has(n.key);
  const what = `<span class="what">${n.worker ? `${figureAvatar(n.worker)}${wname(n.worker)}` : ''}${n.id ? `<span class="rid">${qPfx(n.label || n.id)}</span>` : ''}<span class="t" title="${esc(n.line)}">${esc(n.line)}</span></span>`;
  const inner = `${ico('seal', warm ? 'warn' : 'bad')}<span class="kind">${esc(n.kind)}</span>${what}<span class="age">${qAge(n.when)}</span>`;
  if (n.q) {
    const rec = n.ask?.recommend ? `<div class="rec"><b>Recommends:</b> ${linkify(n.ask.recommend)}</div>` : '';
    const acts = `${n.worker ? `<a class="lnk primary" href="#session=${encodeURIComponent(n.worker.id)}" data-session="${esc(n.worker.id)}">Open session</a>` : ''}${n.url ? `<a class="lnk" href="${esc(n.url)}" target="_blank" rel="noopener">Open in Linear ${Q_EXT}</a>` : ''}`;
    const q = String(n.q).replace(/^[\s\S]*?Question:\s*/, '').replace(/\s+/g, ' ');
    return `<button type="button" class="nrow${warm ? ' warm' : ''}${open ? ' is-open' : ''}" data-q="${esc(n.key)}" aria-expanded="${Boolean(open)}">${inner}<span class="go">${open ? Q_UP : Q_DOWN}</span></button>`
      + (open ? `<div class="ndetail"><div class="q">${linkify(q)}</div>${rec}${acts ? `<div class="acts">${acts}</div>` : ''}</div>` : '');
  }
  if (!n.href) return `<div class="nrow still${warm ? ' warm' : ''}">${inner}<span class="go"></span></div>`;
  const out = /^https?:/.test(n.href);
  const attrs = n.href.startsWith('#session=') ? ` data-session="${esc(n.worker.id)}"` : out ? ' target="_blank" rel="noopener"' : n.href.startsWith('#fleet') ? ' data-go data-view="fleet"' : '';
  return `<a class="nrow${warm ? ' warm' : ''}" href="${esc(n.href)}"${attrs}>${inner}<span class="go">${Q_CHEV}</span></a>`;
}

// One worker's card: its status mark, name and ticket, what it is doing now, and how long it has run and since it moved.
function qBay(t) {
  const s = standing(t);
  const holds = typeof holdsRegularSlot === 'function' && (holdsRegularSlot(t) || t.sentry);
  const tag = [t.adhoc ? 'outside the queue' : '', t.sentry ? 'Sentry slot' : '', !holds && !t.adhoc ? slotWait(t) : ''].filter(Boolean).join(' · ');
  return `<a class="bay${holds ? '' : ' out'}" href="#session=${encodeURIComponent(t.id)}" data-session="${esc(t.id)}" style="--mc:${machineColor(t.host)}" title="${esc(t.title || t.name || '')}">
    <span class="id">${ico(s.sev, s.sev, s.long)}<span class="ids">${t.nickname ? `${wname(t)} ` : aiMark(workerAi(t))}${qPfx(t.label || t.id)}</span></span>
    <span class="what">${esc(cap(s.short))}</span>
    <span class="when">${tag ? `<span class="tag">${esc(tag)}</span> · ` : ''}${onEngine(t) ? `${engineTag(t)} ` : ''}${t.dispatchedAt || t.claimedAt ? `${qAge(t.dispatchedAt || t.claimedAt)} in` : 'starting'}${t.lastProgressAt ? `, moved ${qAge(t.lastProgressAt)} ago` : ''}</span>${figureAvatar(t)}</a>`;
}

function qWorkers(shown, count) {
  const order = (t) => (t.adhoc ? 1 : 0) * 2 + (holdsRegularSlot(t) || t.sentry ? 0 : 1);
  return snap.machines.map((m) => {
    const mine = shown.filter((t) => t.host === m.host).sort((a, b) => order(a) - order(b) || (a.dispatchedAt || '').localeCompare(b.dispatchedAt || ''));
    const c = count.machines.find((x) => x.host === m.host) || { used: 0, cap: 0, over: 0 };
    if (!mine.length && !c.cap) return '';
    return `<section class="realm-row" id="w-${esc(m.host)}" style="--mc:${machineColor(m.host)}"><h3 class="realm-head">${sigil(m.host)}${esc(realmName(m.host))}<span class="muted${c.over ? ' over' : ''}">${c.used} of ${c.cap}${c.over ? `, ${c.over} over` : ''}</span></h3>
      <div class="realm-bays">${mine.map(qBay).join('') || '<span class="realm-empty">No one at work</span>'}</div></section>`;
  }).join('');
}

function qReadyList() {
  if (!snap.ready) return '<div class="empty">Linear did not answer; the ready list is unknown.</div>';
  if (!snap.ready.length) return '<div class="empty">Nothing is labeled agent-ready.</div>';
  const host = sentryHost(), line = sentryOrder().map((m) => realmName(m.host)).join(', then ');
  const sentry = (r) => (!r.sentry ? '' : `<span class="chip sentry" title="${esc(`Labeled sentry-triaged. It goes to the first machine with Sentry room, in the order ${line}: ${host ? `now ${realmName(host.host)}` : 'none has room now, so it waits'}.`)}">${ICON.sentry}Sentry</span>`);
  return snap.ready.map((r) => `<div class="row li">${priIco(r.priority)}<div class="rbody"><div class="rline"><span class="rid">${link(r.url, r.id)}</span><span class="rtitle" title="${esc(r.title)}">${esc(r.title)}</span>
    <span class="rmeta">${sentry(r)}${r.waitingOn ? `<span class="chip warn opt">waiting on ${esc(r.waitingOn)}</span>` : ''}<span>${qAge(r.createdAt)}</span></span></div></div></div>`).join('');
}

function qMergedList(merged) {
  const shown = qMergedAll ? merged : merged.slice(0, MERGED_SHOWN);
  return shown.map((t) => `<div class="row li">${ico('ok', 'merged', 'Merged')}<div class="rbody"><div class="rline"><span class="wname col">${esc(t.nickname || '')}</span><span class="rid">${ticketLinks(t)}</span><span class="rtitle" title="${esc(t.title || '')}">${esc(t.title || '')}</span>
    <span class="rmeta">${sentryChip(t)}${t.linearState ? `<span class="chip opt">${esc(t.linearState)}</span>` : ''}${t.prUrl ? `<span class="opt">${link(t.prUrl, `PR #${t.prUrl.split('/').pop()}`)}</span>` : ''}<span class="mini-host opt" style="--mc:${machineColor(t.host)}" title="${esc(t.machine)}">${sigil(t.host)}${esc(realmName(t.host))}</span><span>${qAge(t.mergedAt)}</span></span></div></div></div>`).join('')
    + (merged.length > MERGED_SHOWN ? `<div class="more-row"><button class="show-all q-merged-all" type="button">${qMergedAll ? `Show the latest ${MERGED_SHOWN}` : `Show all ${merged.length}`}</button></div>` : '');
}

// A line that opens in place to its list.
function qFold(key, icon, label, n, rest, body) {
  const open = qOpen.has(key);
  return `<section class="group qfold" id="sec-${key}"><button type="button" class="fold" data-q="${key}" aria-expanded="${open}">${icon}<span class="lab">${esc(label)}</span><b>${n}</b><span class="rest">${esc(rest)}</span><span class="go">${open ? Q_UP : Q_DOWN}</span></button>${open ? `<div class="fold-body">${body()}</div>` : ''}</section>`;
}

function renderQueue(rows, merged) {
  const hot = rows.some((n) => n.sev === 'bad');
  const waiting = new Set(rows.filter((n) => n.worker).map((n) => n.worker.id));
  const count = forgeSlots(snap);
  const shown = snap.tickets.filter((t) => t.live && !waiting.has(t.id));
  const needsHtml = rows.length ? rows.map(needRow).join('')
    : `<div class="all-clear">${ico('ok', 'ok')}Nothing needs you right now.<span class="lore">All is quiet in the realms.</span></div>`;
  const mergedDone = merged.filter((t) => t.linearState === 'Done').length;
  const waitOn = (snap.ready || []).filter((r) => r.waitingOn).length;
  const ready = snap.ready ? snap.ready.length : '?';
  const html = `<section class="group nq" id="sec-needs"><h2 class="gh">${ico('seal', hot ? 'bad' : rows.length ? 'warn' : 'free')}Needs you <span class="gcount${rows.length ? ` seal${hot ? '' : ' warm'}` : ''}">${rows.length}</span></h2>${needsHtml}</section>
    <section class="group" id="sec-workers"><h2 class="gh">${ico('run')}Workers <span class="gcount">${count.text}</span>${count.over ? `<span class="gcount over">${count.over} over</span>` : ''}</h2>
      <div class="wk"><div class="realms">${qWorkers(shown, count)}</div></div></section>
    ${qFold('ready', ico('todo'), 'Ready', ready, snap.ready ? `${snap.ready.length - waitOn} can start, ${waitOn} wait on another ticket` : 'Linear did not answer', qReadyList)}
    ${qFold('merged', ico('ok', 'merged'), 'Merged', merged.length, `in 48 hours, ${mergedDone} Done`, () => qMergedList(merged))}`;
  // A snapshot that changes nothing here leaves the page alone, so a click in progress and the keyboard's focus survive.
  const root = $('view-queue');
  if (root.dataset.html === html) return;
  root.innerHTML = html;
  root.dataset.html = html;
  paintAvatars(root);
}

document.addEventListener('click', (e) => {
  const s = e.target.closest('a[data-session]');
  if (s && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && typeof openPanel === 'function') {
    e.preventDefault();
    openPanel(s.dataset.session);
    return;
  }
  const q = e.target.closest('[data-q]');
  if (q && $('view-queue').contains(q)) {
    qOpen.has(q.dataset.q) ? qOpen.delete(q.dataset.q) : qOpen.add(q.dataset.q);
    render();
    $('view-queue').querySelector(`[data-q="${CSS.escape(q.dataset.q)}"]`)?.focus();
    return;
  }
  if (e.target.closest('.q-merged-all')) { qMergedAll = !qMergedAll; render(); }
});
