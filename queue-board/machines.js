// machines.js: the Machines view, a card per machine dressed as its realm, then the Accounts card across the grid
// under them (machines-accounts.js). A card opens on its realm's pixel diorama (realm-art.js) with the realm's name lettered over it and
// whether its dispatcher ticks. Under it: the workers in their seats, each a pixel figure posed as in the Middle-earth
// view with a status gem, and every free seat left visible; the last tick, heartbeat and dispatch count; load, memory and
// swap as etched gauges with the limit cut in as a notch; its worktrees; its accounts' 5-hour and weekly usage, folded
// away until opened; and the dispatcher log. Each realm has its own frame, drawn in CSS: elvish filigree for Rivendell, pegged wood for the Shire,
// riveted iron for Erebor. Loaded after page.html's own script and uses its helpers: $, esc, ago, dur, ms, ico, ICON,
// snap, standing, sentryOff, swapRatio, biggest, gb, ram, SWAP_WARN, SWAP_BAD, ticketLinks, figureOf, realmName,
// realmKind, machineColor, wtOf, wtCounts, WT_STATE and render.
const machLogs = new Set();
let machObserver = null;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const isNight = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : darkQuery.matches);
const pct100 = (p) => Math.max(0, Math.min(100, p ?? 0));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A usage ring like Linear's cycle progress.
function ring(pct, sev) {
  const r = 5.5, c = 2 * Math.PI * r, p = pct100(pct);
  return `<svg class="ring ${sev}" viewBox="0 0 14 14" aria-hidden="true"><circle class="track" cx="7" cy="7" r="${r}"/>${p ? `<circle class="fill" cx="7" cy="7" r="${r}" stroke-dasharray="${(p / 100 * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 7 7)"/>` : ''}</svg>`;
}
// Under the percentage: when the window resets, as a clock time (with the weekday unless it is today) and a countdown.
// A reset that has passed means the reading is from the window before it, so the percentage is dimmed.
function usageCell(w, floor) {
  if (!w) return '<span class="sub">no limit</span>';
  const left = 100 - (w.used ?? 0);
  const sev = left < floor ? 'bad' : left < floor + 20 ? 'warn' : 'ok';
  const at = w.resetsAt ? new Date(Math.round(Date.parse(w.resetsAt) / 60000) * 60000) : null;
  const past = at && at <= Date.now();
  const today = at && at.toDateString() === new Date().toDateString();
  const clock = at && at.toLocaleString([], { ...(today ? {} : { weekday: 'short' }), hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  const reset = at ? `<span class="sub" title="${past ? 'Reset' : 'Resets'} ${esc(at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}">${esc(clock)}<br>${past ? `${dur(Date.now() - at)} ago` : `in ${dur(at - Date.now())}`}</span>` : '';
  return `<span class="use${past ? ' stale' : ''}"${past ? ' title="Read before this window reset"' : ''}>${ring(w.used, sev)}${w.used ?? '?'}%</span>${reset}`;
}
const email = (e) => esc(e).replace('@', '@<wbr>');

// A gauge: its label, an etched groove filled to the reading with the limit cut in as a notch, then the value and its
// limit in muted text.
function gauge(label, value, limit, pct, limitPct, sev) {
  return `<div class="gauge"><span>${esc(label)}</span><div class="groove"><i class="${sev}" style="width:${pct100(pct)}%"></i>${limitPct != null ? `<s style="left:${pct100(limitPct)}%"></s>` : ''}</div><b>${esc(value)} <span>${esc(limit)}</span></b></div>`;
}
function gauges(m) {
  const perCore = m.load ? m.load.avg5 / m.load.cores : null;
  const r = swapRatio(m);
  return [
    perCore != null ? gauge('Load per core', perCore.toFixed(2), `limit ${m.load.maxPerCore}`, (perCore / (m.load.maxPerCore * 1.5)) * 100, 100 / 1.5, perCore > m.load.maxPerCore ? 'bad' : 'ok') : '',
    m.memFreePercent != null ? gauge('Memory free', `${m.memFreePercent}%`, `floor ${m.minMemFreePercent}%`, m.memFreePercent, m.minMemFreePercent, m.memFreePercent < m.minMemFreePercent ? 'bad' : 'ok') : '',
    r != null ? gauge('Swap used', m.swapUsedMb ? gb(m.swapUsedMb) : 'none', `of ${ram(m)} RAM`, r * 100, SWAP_BAD * 100, r >= SWAP_BAD ? 'bad' : r >= SWAP_WARN ? 'warn' : 'ok') : '',
  ].join('');
}

// The last tick (and when the next is due), the heartbeat's age and how many tickets it dispatched in a day.
function ledger(m) {
  const next = m.lastTick ? Date.parse(m.lastTick) + snap.config.tickMinutes * 60000 - Date.now() : null;
  const due = next != null && m.ok && !m.paused ? (next > 0 ? `next in about ${dur(next)}` : 'next due now') : '';
  const cell = (label, value, sub = '', cls = '') => `<div class="${cls}"><span>${esc(label)}</span><b>${value}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  const cap = m.maxDispatchesPerDay;
  return `<div class="ledger">${cell('Last tick', esc(ago(m.lastTick)), due)}${cell('Heartbeat', m.heartbeat ? `${esc(dur(ms(m.heartbeat.at)))} old` : 'none yet', m.heartbeat?.paused ? 'paused' : '')}`
    + `${cell('Dispatched in 24h', cap ? `${esc(m.dispatchedToday)} <span>of ${esc(cap)}</span>` : esc(m.dispatchedToday), '', cap && m.dispatchedToday >= cap ? 'warn' : '')}</div>`;
}

// A seated worker's pose matches the Middle-earth view: cheering when green, a raised hand when it waits on the owner,
// fighting while CI fails, at work while busy, asleep while idle, and faded once its session has ended.
function seatPose(t, s) {
  if (s.sev === 'ok') return 'cheer';
  if (['failed', 'stopped', 'gone'].includes(t.workerState) || (!t.adhoc && t.workerState === 'done')) return 'gone';
  if (t.blockedSince || t.waiting) return 'ask';
  if (t.pr?.ci.fail.length) return 'fight';
  if (t.status === 'merge-asked') return 'ask';
  return ['busy', 'working'].includes(t.workerState) ? 'work' : 'sleep';
}
// A seat's ticket links with each ID's prefix marked, so a phone shows only the number, as the Queue's slots do. The
// prefix is matched only where link text starts, never inside an href.
const seatIds = (t) => ticketLinks(t).replace(/>([A-Z]+-)(?=\d)/g, '><span class="pfx">$1</span>');
// A seat's figure opens the worker's session panel: a Claude worker's session, or a Codex or Grok worker's runs.
const fig = (t, says) => `<button class="seat-fig view" type="button" data-id="${esc(t.id)}" title="${esc(`${says}. View session`)}">`;
// One seat: the figure and its status gem open the worker's session panel, its name under it, and its ticket links.
function seat(t, extra = '') {
  const s = standing(t);
  const pose = seatPose(t, s);
  const who = t.nickname || '';
  return `<div class="seat${pose === 'gone' ? ' gone' : ''}${holdsSlot(t) ? '' : ' parked'}">
    ${fig(t, `${who || t.label || t.id}: ${s.long}`)}
      <canvas width="80" height="104" data-kind="${figureOf(t)}" data-name="${esc(t.nickname || t.label || t.id)}" data-pose="${pose}" aria-hidden="true"></canvas>
      <span class="seat-gem">${ico(s.sev, s.sev, s.long)}</span></button>
    ${who ? `<span class="seat-n">${aiMark(workerAi(t))}${esc(who)}</span>` : ''}<span class="seat-id">${seatIds(t)}</span>${extra}</div>`;
}
const emptySeat = (label, title) => `<div class="seat free" title="${esc(title)}"><div class="seat-fig">${label}</div></div>`;
// The machine's pool of seats, which any account fills (Claude, Codex or Grok, 2026-11-09), then the Sentry slot's: an
// idle or offline Sentry slot stays visible, and a ticket that holds no slot (a PR waiting on the orchestrator's merge, or
// parked on the reviewer's review) sits after its slots with a note, as the dispatcher counts it.
const waitSeat = (t) => seat(t, `<span class="seat-x">${slotWait(t)}</span>`);
function seats(m, here) {
  const regular = here.filter((t) => !t.sentry);
  const working = regular.filter(holdsSlot);
  const waiting = regular.filter((t) => !holdsSlot(t));
  const n = Math.max(m.maxWorkers || 0, working.length);
  const head = (label, value, cls = '') => `<div class="mh${cls}"><span>${esc(label)}</span><b>${value}</b></div>`;
  const over = working.length > (m.maxWorkers || 0) ? ' warn' : '';
  return head(m.sentryWorkers ? 'Regular slots' : 'Workers', `${working.length} <span>of ${esc(m.maxWorkers)}</span>${waiting.length ? `, ${waiting.length} waiting` : ''}`, over)
    + `<div class="seats">${working.map((t) => seat(t)).join('')}${Array.from({ length: n - working.length }, () => emptySeat('free', `A free seat on ${m.name}`)).join('')}${waiting.map(waitSeat).join('')}</div>`
    + sentrySeats(m, here.filter((t) => t.sentry), head);
}
function sentrySeats(m, sentry, head) {
  const inSentry = sentry.filter((t) => !t.parked);
  const parked = sentry.filter((t) => t.parked);
  const k = Math.max(m.sentryWorkers || 0, inSentry.length);
  if (!k && !parked.length) return '';
  const off = sentryOff(m);
  // Its place in the Sentry cascade (Erebor, then Rivendell, then the Shire), and whether it has room for the next one.
  const pos = sentryOrder().findIndex((x) => x.host === m.host) + 1;
  const room = m.heartbeat?.sentryRoom !== false;
  const place = pos ? ['first', 'second', 'third', 'fourth'][pos - 1] ?? `number ${pos}` : '';
  const state = inSentry.length ? (k > 1 ? `${inSentry.length} <span>of ${k}</span> busy` : 'busy') : off ? 'offline' : room ? `idle${place ? `, ${place} in line` : ''}` : 'idle, no room';
  const idle = emptySeat(`${ICON.sentry}<span>${off ? 'offline' : 'idle'}</span>`, off ? `Out of the Sentry cascade (${off}), so Sentry tickets pass to the next machine in line`
    : room ? `Kept for Sentry fix tickets; regular work never takes it.${place ? ` It is ${place} in line for them.` : ''}` : `No room for a Sentry ticket now (the machine is busy, its accounts are low, or ${snap.config.reviewer || 'the reviewer'} has the most Sentry reviews waiting), so they pass to the next machine in line`);
  return head(`Sentry slot${k > 1 ? 's' : ''}`, `${state}${parked.length ? `, ${parked.length} waiting on ${esc(snap.config.reviewer || 'the reviewer')}` : ''}`, (off || !room) && !inSentry.length ? ' warn' : '')
    + `<div class="seats">${inSentry.map((t) => seat(t)).join('')}${Array.from({ length: k - inSentry.length }, () => idle).join('')}${parked.map((t) => seat(t, `<span class="seat-x">waiting on ${esc(snap.config.reviewer || 'the reviewer')}</span>`)).join('')}</div>`;
}

// A machine card's line about its worktrees, linking to that machine in the Worktrees view.
function wtLine(host) {
  const w = wtOf(host);
  if (!w?.rows) return '';
  const parts = wtCounts(w.rows).map(([s, n]) => `${n} ${WT_STATE[s][2]}`).join(', ');
  return `<a class="mwt" href="#worktrees/${encodeURIComponent(host)}" data-go>${ico('branch', 'todo')}<b>${plural(w.rows.length, 'worktree')}</b><span class="t">${esc(parts)}</span></a>`;
}
function accounts(m, floor) {
  const name = (a) => `<td class="who">${a.email ? email(a.email) : `account ${esc(a.label)}`}<span class="sub">${a.plan ? `${esc(a.plan)}, ` : ''}account ${esc(a.label)}${a.signedIn === false ? ' <span class="chip bad">signed out</span>' : ''}</span></td>`;
  // A signed-out account's usage is the last it saw before the login went, so the row says it is signed out instead.
  const rows = (m.accounts || []).map((a) => (a.error || a.signedIn === false
    ? `<tr>${name(a)}<td colspan="3" class="muted">${esc(a.error || `Signed out ${a.signedOutAt ? ago(a.signedOutAt) : ''}, so it gets no work`)}</td></tr>`
    : `<tr>${name(a)}<td>${usageCell(a.fiveHour, floor)}</td><td>${usageCell(a.weekly, floor)}</td><td class="muted">${a.usageAt ? dur(ms(a.usageAt)) : 'n/a'}${a.otherSessions ? `<span class="sub">${a.otherSessions} other</span>` : ''}</td></tr>`)).join('');
  return `<table class="accts"><thead><tr><th>Account</th><th class="u">5-hour</th><th class="u">Weekly</th><th class="r">Saved</th></tr></thead><tbody>${rows}</tbody></table>`;
}
// Which machines show their own account list, kept in this browser. Closed by default: the Accounts card has them all.
const ACCT_KEY = 'forge.machineAccounts';
const acctOpen = new Set((() => { try { return JSON.parse(localStorage.getItem(ACCT_KEY)) || []; } catch { return []; } })());
$('machines').addEventListener('toggle', (e) => {
  const host = e.target.dataset?.acct;
  if (host == null) return;
  if (e.target.open) acctOpen.add(host); else acctOpen.delete(host);
  try { localStorage.setItem(ACCT_KEY, JSON.stringify([...acctOpen])); } catch { /* kept for this page load only */ }
}, true);
// A machine's accounts behind a toggle whose line names them and flags any signed out or out of room.
function accountsToggle(m, floor) {
  const list = m.accounts || [];
  if (!list.length) return '';
  const out = list.filter(unusable).length;
  const low = list.filter((a) => !unusable(a) && a.usageAt && !hasRoom(a, floor)).length;
  const chips = (out ? `<span class="chip bad">${out} signed out</span>` : '') + (low ? `<span class="chip warn">${low} out of room</span>` : '');
  return `<details class="macct" data-acct="${esc(m.host)}"${acctOpen.has(m.host) ? ' open' : ''}><summary>Accounts ${esc(list.map((a) => a.label).join(', '))}${chips}</summary>${accounts(m, floor)}</details>`;
}

// The band across the top: the realm's diorama with its name lettered over the sky on the left, and under the name the
// machine and whether its dispatcher ticks, so the landmarks on the right stay clear.
const band = (kind, title, sub) => `<div class="mband" data-art="${kind}"><canvas aria-hidden="true"></canvas>
  <div class="mband-t"><h3>${esc(title)}</h3><span class="mb-sub">${sub}</span></div></div>`;

function machineCard(m, here, floor) {
  const off = sentryOff(m);
  const state = !m.ok ? '<span class="chip bad">unreachable</span>' : m.paused ? '<span class="chip bad">paused</span>' : m.enabled === false ? '<span class="chip warn">not enabled</span>' : '<span class="chip ok">ticking</span>';
  const caps = [m.sentryWorkers && `${m.sentryWorkers} Sentry`].filter(Boolean);
  const sub = `${esc(m.name)}${state}${caps.length ? `<span class="mb-cap">${[`${m.maxWorkers} regular`, ...caps].join(' + ')}</span>` : ''}`;
  const notes = (off ? `<div class="mnote">Sentry slot offline: ${esc(off)}, so the other machines build Sentry tickets.</div>` : '')
    + (swapRatio(m) >= SWAP_WARN && m.topMemory ? `<div class="mnote">Swapping: ${esc(biggest(m))}.</div>` : '');
  return `<article class="mcard${!m.ok || m.paused ? ' down' : ''}" id="m-${esc(m.host)}" data-r="${realmKind(m.host)}" style="--mc:${machineColor(m.host)}">
    ${band(realmKind(m.host), realmName(m.host), sub)}
    <div class="msec">${seats(m, here)}</div>
    <div class="msec">${ledger(m)}<div class="gauges">${gauges(m)}</div>${notes}</div>
    <div class="msec">${wtLine(m.host)}${accountsToggle(m, floor)}
      <details data-host="${esc(m.host)}"${machLogs.has(m.host) ? ' open' : ''}><summary>Dispatcher log</summary><pre class="log">${esc((m.log || []).join('\n'))}</pre></details></div>
  </article>`;
}

function renderMachines(live) {
  const root = $('machines');
  const floor = snap.config.headroomFloorPercent;
  // The page rebuilds the cards on every snapshot; an open dispatcher log stays open.
  root.querySelectorAll('details[data-host]').forEach((d) => (d.open ? machLogs.add(d.dataset.host) : machLogs.delete(d.dataset.host)));
  root.innerHTML = snap.machines.map((m) => machineCard(m, live.filter((t) => t.host === m.host), floor)).join('') + accountsCard(floor);
  if (typeof drawFigure === 'function') {
    root.querySelectorAll('.seat-fig canvas').forEach((c) => {
      const g = c.getContext('2d');
      g.setTransform(4, 0, 0, 4, 0, 0);
      g.imageSmoothingEnabled = false;
      drawFigure(g, c.dataset.kind, c.dataset.name, 10, 24, c.dataset.pose === 'gone' ? 'stand' : c.dataset.pose, 0);
    });
  }
  // A band paints once it has a width, so a card built while the view is hidden paints when the view opens.
  machObserver?.disconnect();
  machObserver = new ResizeObserver((entries) => entries.forEach((e) => paintBand(e.target)));
  root.querySelectorAll('.mband').forEach((b) => machObserver.observe(b));
}
function paintBand(b) {
  const w = b.clientWidth;
  if (!w || typeof drawRealmArt !== 'function') return;
  const night = isNight() || b.dataset.art === 'stones';
  b.classList.toggle('night', night);
  drawRealmArt(b.querySelector('canvas'), b.dataset.art, night, w);
}
darkQuery.addEventListener('change', () => document.querySelectorAll('.mband').forEach(paintBand));
// A snapshot that arrived before this file loaded rendered without it, so render again.
if (snap) render();
