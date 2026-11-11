// mobile.js: what a phone needs beyond CSS (mobile.css, mobile-views.css; README "On a phone"). Loaded first of the page
// scripts, after page.html's own, so scene.js and scene2.js can ask it for a map's room. Uses page.html's $, esc, snap,
// view and standing. On a desktop window none of this shows or runs: every part asks phoneMq first.
//   - The bottom bar's More button and its sheet: the rest of the sidebar (the Queue's groups, the map from above,
//     Machines, Worktrees, Gollum and their links), copied from the nav each time it opens or the nav is redrawn.
//   - The Queue tab's count: Needs you, read from the sidebar's group link.
//   - The two maps: how tall a map may be (phoneMapRoom) and where it opens (phoneAim).
const phoneMq = matchMedia('(max-width: 899px), (pointer: coarse) and (max-height: 540px)');
const phoneLandMq = matchMedia('(max-width: 899px) and (max-height: 540px) and (orientation: landscape), (pointer: coarse) and (max-height: 540px) and (orientation: landscape)');
const PHONE_BAR = ['inbox', 'sessions', 'queue', 'scene'];
const PHONE_MORE = '[data-view="map"], [data-view="machines"], [data-view="worktrees"], [data-view="gollum"]';
const phoneSide = document.querySelector('.side');

const phoneMore = document.createElement('button');
phoneMore.type = 'button';
phoneMore.className = 'nav-more';
phoneMore.setAttribute('aria-haspopup', 'dialog');
phoneMore.setAttribute('aria-expanded', 'false');
phoneMore.setAttribute('aria-controls', 'moreSheet');
// Three cut gems in a row, the board's own mark for "more".
phoneMore.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7l3 3-3 3-3-3zM10 7l3 3-3 3-3-3zM16 7l3 3-3 3-3-3z" fill="currentColor"/></svg><span>More</span>';
const phoneSheet = document.createElement('div');
phoneSheet.className = 'more-sheet';
phoneSheet.id = 'moreSheet';
phoneSheet.setAttribute('role', 'dialog');
phoneSheet.setAttribute('aria-label', 'More views');
const phoneVeil = document.createElement('div');
phoneVeil.className = 'more-veil';
phoneSide.append(phoneMore, phoneSheet);
document.body.append(phoneVeil);

const phoneMoreOpen = () => phoneSheet.classList.contains('on');
// Every sidebar link the bar has no room for, in the sidebar's order. The Queue's groups come first; their heading is the
// Queue tab's own name, since the tab itself stays in the bar.
function phoneMoreFill() {
  const rest = [...document.querySelectorAll('#nav > .nav-item')].filter((a) => !PHONE_BAR.includes(a.dataset.view));
  const queue = document.querySelector('#nav > .nav-item[data-view="queue"] .nav-t')?.textContent ?? 'Queue';
  phoneSheet.innerHTML = `<h4>${esc(queue)}</h4>${rest.map((a) => a.outerHTML).join('')}`;
}
function phoneMoreSet(open) {
  if (open) phoneMoreFill();
  phoneSheet.classList.toggle('on', open);
  phoneVeil.classList.toggle('on', open);
  phoneMore.setAttribute('aria-expanded', String(open));
}
phoneMore.addEventListener('click', () => phoneMoreSet(!phoneMoreOpen()));
phoneVeil.addEventListener('click', () => phoneMoreSet(false));
// A link in the sheet or a tab in the bar goes where it says (page.html's own click handler) and the sheet closes.
phoneSide.addEventListener('click', (e) => { if (phoneMoreOpen() && e.target.closest('a.nav-item')) phoneMoreSet(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && phoneMoreOpen()) phoneMoreSet(false); });

// renderNav redraws the sidebar on every snapshot. Each time, the Queue tab takes the Needs you count (red when
// something is blocked, amber when it is only worth a look), More takes a seal when a view behind it is hot, and an
// open sheet is copied again.
function phoneNavSync() {
  const c = document.querySelector('#nav .nav-sub[href="#sec-needs"] .count');
  const n = Number(c?.textContent) || 0;
  phoneSide.dataset.needs = !n ? 'none' : c.classList.contains('hot') ? 'hot' : 'warm';
  phoneSide.style.setProperty('--needs', `"${n || ''}"`);
  phoneSide.dataset.more = document.querySelector(`#nav > .nav-item.view.hot:is(${PHONE_MORE})`) ? 'hot' : 'none';
  if (phoneMoreOpen()) phoneMoreFill();
}
new MutationObserver(phoneNavSync).observe($('nav'), { childList: true });

// Hover text has no hover on a phone. A tap on anything that carries a title, and is not itself a link or a control,
// shows that text in a small note beside it; the next tap or a scroll puts it away. Text the element already shows in
// full is not repeated.
const phoneTip = document.createElement('div');
phoneTip.className = 'tap-tip';
phoneTip.setAttribute('role', 'tooltip');
phoneTip.hidden = true;
document.body.append(phoneTip);
document.addEventListener('click', (e) => {
  const shown = phoneTip.hidden ? null : phoneTip.textContent;
  phoneTip.hidden = true;
  if (!phoneMq.matches || e.target.closest('a, button, summary, input, textarea, select, label')) return;
  const el = e.target.closest('[title]');
  const text = el?.getAttribute('title').trim();
  if (!text || text === shown || text === el.textContent.trim()) return;
  // A modal dialog (the session panel) draws over the page, so the note goes inside it.
  (el.closest('dialog') ?? document.body).append(phoneTip);
  phoneTip.textContent = text;
  phoneTip.hidden = false;
  const r = el.getBoundingClientRect();
  const [w, h] = [phoneTip.offsetWidth, phoneTip.offsetHeight];
  phoneTip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  phoneTip.style.top = `${r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8}px`;
});
window.addEventListener('scroll', () => { phoneTip.hidden = true; }, { passive: true, capture: true });

// The height a map may take on a phone, or null on a desktop window, where the map keeps its own rule. On a phone each
// map sits in a frame with a height of its own (mobile-views.css): upright, what is left between the header and the
// bottom bar; on its side, the whole screen. scene.js and scene2.js size the world to it and never below their minimum.
function phoneMapRoom(frame) {
  return phoneMq.matches ? frame.clientHeight : null;
}

// A map on a phone is larger than its frame and the finger pans it. It opens on the worker to act on first: the one who
// just called, else the first one blocked on the owner, else the first worker, so the first screen is never empty land.
// With the phone on its side the page also scrolls down to the frame, which then fills the screen. It aims once each
// time the view opens or the phone turns, and leaves the map where the owner panned it after that.
const phoneAimed = { key: '', timer: null };
function phoneAim(tries = 24) {
  clearTimeout(phoneAimed.timer);
  if (!phoneMq.matches || (view !== 'scene' && view !== 'map')) { phoneAimed.key = ''; return; }
  const key = `${view} ${phoneLandMq.matches}`;
  if (phoneAimed.key === key) return;
  const wrap = document.querySelector(`#${view} .sc-wrap`);
  const stage = wrap?.querySelector('.sc-stage');
  const tags = stage ? [...stage.querySelectorAll('.sc-name')] : [];
  // The tags come with the first snapshot; until then try again, and settle for the middle if nobody is at work.
  if (!tags.length && tries > 0) { phoneAimed.timer = setTimeout(() => phoneAim(tries - 1), 400); return; }
  if (!stage?.offsetWidth) return;
  const need = snap?.tickets.find((t) => t.live && standing(t).sev === 'bad');
  const tag = tags.find((el) => el.classList.contains('sc-calling')) ?? (need && tags.find((el) => el.dataset.id === need.id)) ?? tags[0];
  wrap.scrollLeft = Math.max(0, (tag ? tag.offsetLeft : stage.offsetWidth / 2) - wrap.clientWidth / 2);
  // The side view keeps its ground and road in sight; the map from above centres on the worker both ways.
  wrap.scrollTop = view === 'scene' ? wrap.scrollHeight : Math.max(0, (tag ? tag.offsetTop : stage.offsetHeight / 2) - wrap.clientHeight / 2);
  if (phoneLandMq.matches) window.scrollTo(0, wrap.getBoundingClientRect().top + window.scrollY);
  phoneAimed.key = key;
}
// page.html fires a resize on every switch of view and then scrolls to the top, and the maps lay themselves out on the
// same event, so the aim waits for both.
window.addEventListener('resize', () => { clearTimeout(phoneAimed.timer); phoneAimed.timer = setTimeout(phoneAim, 120); });
// The first aim waits for the page's load, when page.html scrolls to the top one last time.
if (document.readyState === 'complete') phoneAim();
else window.addEventListener('load', () => { phoneAimed.timer = setTimeout(phoneAim, 120); });
