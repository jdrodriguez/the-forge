// inbox.js: the Inbox view, the human's unread Linear notifications from the snapshot's inbox (linear-inbox.mjs).
// Mentions, replies to their comments and review requests come first, then what was assigned to them, then comments on
// issues they follow and other updates, one row per issue. Read-only: opening a notice in Linear marks it read there, and it

// leaves this view at the next inbox read. Loaded after page.html's own script and uses its helpers: $, esc, ago, snap,
// copyText, render.
const INBOX_ROWS = 15;
const inboxOpen = { comments: false, updates: false };
const KIND = { mention: 'Mention', reply: 'Reply', review: 'Review', assigned: 'Assigned' };
const AV = ['#5e6ad2', '#26a46b', '#d9730d', '#c2449f', '#0f8f9e', '#8b6ae6', '#c4542b'];
let inboxItems = [];

function avatar(name) {
  const who = name || 'Linear';
  const initials = who.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const hue = AV[[...who].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AV.length];
  return `<span class="avatar" style="--av:${hue}" title="${esc(who)}" aria-hidden="true">${esc(initials)}</span>`;
}
const noticeLink = (n, text, cls = '') => `<a class="${cls}" href="${esc(n.url)}" target="_blank" rel="noopener" title="${esc(n.title)}">${esc(text)}</a>`;

function aimedRow(n) {
  const i = inboxItems.push(n) - 1;
  return `<div class="row inb">${avatar(n.actor)}<div class="rbody">
    <div class="rline"><span class="chip${n.kind === 'mention' ? ' engine' : ''}">${KIND[n.kind]}</span>${n.issue ? `<span class="rid">${esc(n.issue)}</span>` : ''}${noticeLink(n, n.title, 'rtitle')}<span class="rmeta">${ago(n.at)}</span></div>
    <div class="rtext" title="${esc(n.text)}">${esc(n.text)}</div>
    <div class="inb-actions"><a class="btn" href="${esc(n.url)}" target="_blank" rel="noopener">Open in Linear</a><button class="btn copy-notice" type="button" data-i="${i}" title="Copies the notice and its link, to paste into a Claude session">Copy for Claude</button><span class="msg" role="status"></span></div>
  </div></div>`;
}
function groupRow(g) {
  return `<div class="row inb">${avatar(g.actor)}<div class="rbody">
    <div class="rline">${g.issue ? `<span class="rid">${esc(g.issue)}</span>` : ''}${noticeLink(g, g.title, 'rtitle')}<span class="rmeta">${g.count > 1 ? `<span class="chip">${g.count} new</span>` : ''}<span>${ago(g.at)}</span></span></div>
    <div class="rsub clamp">${esc(g.text)}</div>
  </div></div>`;
}

function inboxGroup(id, icon, title, count, body) {
  return `<section class="group" id="${id}"><h2 class="gh">${icon}${esc(title)} <span class="gcount">${esc(count)}</span></h2>${body}</section>`;
}
// Comments and updates show their newest rows; the snapshot carries up to 40 issues, and Linear has the rest.
function grouped(key, g, empty, inboxUrl) {
  if (!g.rows.length) return `<div class="empty">${empty}</div>`;
  const rows = inboxOpen[key] ? g.rows : g.rows.slice(0, INBOX_ROWS);
  const more = g.rows.length > INBOX_ROWS ? `<button class="show-all inbox-more" type="button" data-key="${key}">${inboxOpen[key] ? `Show the latest ${INBOX_ROWS}` : `Show ${g.rows.length - INBOX_ROWS} more`}</button>` : '';
  const rest = g.issues > g.rows.length ? `<a href="${esc(inboxUrl)}" target="_blank" rel="noopener">${g.issues - g.rows.length} older issues in Linear</a>` : '';
  return rows.map(groupRow).join('') + (more || rest ? `<div class="more-row">${more}${rest}</div>` : '');
}

function renderInbox() {
  const box = snap?.inbox;
  inboxItems = [];
  if (!box) { $('inbox').innerHTML = '<div class="empty">Reading your Linear inbox...</div>'; return; }
  if (!box.forYou) { $('inbox').innerHTML = `<div class="banner">Could not read your Linear inbox: ${esc(box.error)}</div>`; return; }
  const aimed = box.forYou.filter((n) => n.kind !== 'assigned');
  const assigned = box.forYou.filter((n) => n.kind === 'assigned');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  $('inbox').innerHTML = `<div class="ibar"><span><b>${box.unreadTotal}</b> unread in Linear</span><span>Read ${ago(box.at)}${box.error ? `, the last read failed: ${esc(box.error)}` : ''}</span>
      <a href="${esc(box.inboxUrl)}" target="_blank" rel="noopener">Open your Linear inbox</a></div>`
    + inboxGroup('inb-you', ico('urgent', aimed.length ? 'bad' : 'free'), 'Mentions, replies and reviews', aimed.length,
      aimed.length ? aimed.map(aimedRow).join('') : '<div class="empty">Nobody has mentioned you, replied to you or asked for your review.</div>')
    + inboxGroup('inb-assigned', ico('todo'), 'Assigned to you', assigned.length,
      assigned.length ? assigned.map(aimedRow).join('') : '<div class="empty">Nothing new is assigned to you.</div>')
    + inboxGroup('inb-comments', ico('comment', 'todo'), 'Comments on issues you follow', `${plural(box.comments.total, 'comment')} on ${plural(box.comments.issues, 'issue')}`,
      grouped('comments', box.comments, 'No new comments.', box.inboxUrl))
    + inboxGroup('inb-updates', ico('free'), 'Other updates', `${plural(box.updates.total, 'update')} on ${plural(box.updates.issues, 'issue')}`,
      grouped('updates', box.updates, 'No other updates.', box.inboxUrl));
}

document.addEventListener('click', (e) => {
  const more = e.target.closest('.inbox-more');
  if (more) { inboxOpen[more.dataset.key] = !inboxOpen[more.dataset.key]; renderInbox(); return; }
  const copy = e.target.closest('.copy-notice');
  if (!copy) return;
  const n = inboxItems[Number(copy.dataset.i)];
  const text = `Help me with this Linear notification:\n${n.issue ? `${n.issue}: ` : ''}${n.title}\n${n.text}\n${n.url}`;
  copy.nextElementSibling.textContent = copyText(text) ? 'Copied' : 'Could not copy';
});
// The page re-renders on every new snapshot; the Inbox follows it.
const inboxRender = render;
render = function () { inboxRender(); renderInbox(); };
if (snap) renderInbox();
