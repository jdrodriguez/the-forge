// fleet-card.js: one Fleet card per queue machine. The realm's band (its name, the machine, its state, when it last
// ticked), the seats (a figure per worker, which opens its session panel; a dashed seat holds no slot; empty seats are
// free slots), the Workers, Sentry and Burst slots beside what they govern, the health bars, the accounts the machine
// uses, then its pause state and its worktrees. The card's id is f-<host>, so #fleet/<host> scrolls to it (page.html's
// TARGET). Read-only: the slots and accounts come from dispatcher.hosts in the config, which is where they change.
// Uses fleet-logic.js, worker-count.js and page.html's helpers.
const FLEET_CHEV = '<svg class="chev" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What runs on a machine now: the Sentry slots in use, the tickets waiting for a slot, those waiting on a merge, and
// the workers a reboot would cut short (busy, working or blocked on input).
function fleetLiveOn(host) {
  const mine = snap.tickets.filter((t) => t.host === host && t.live);
  const queue = mine.filter((t) => !t.adhoc);
  return {
    sentryUse: queue.filter((t) => t.sentry && holdsSlot(t)).length,
    waiting: mine.filter((t) => t.waitingForSlot),
    merging: queue.filter((t) => t.status === 'merge-asked' || t.parked),
    working: mine.filter((t) => ['busy', 'working', 'blocked'].includes(t.workerState)),
  };
}

// The band's state word, shown only when the machine is not simply ticking.
function fleetState(m) {
  if (!m?.ok) return '<span class="chip bad">Offline</span>';
  if (m.paused) return '<span class="chip bad">Paused</span>';
  if (m.maxWorkers === 0 && !m.sentryWorkers) return '<span class="chip warn">No slots</span>';
  return '';
}

// One seat: the worker's pixel figure with its status gem; a click opens its session panel (session.js, button.view).
function fleetSeat(t) {
  const s = standing(t);
  const pose = s.sev === 'ok' ? 'cheer' : t.blockedSince || t.waiting || t.status === 'merge-asked' ? 'ask' : t.pr?.ci.fail.length ? 'fight'
    : ['busy', 'working'].includes(t.workerState) ? 'work' : 'sleep';
  const who = t.nickname || t.label || t.id;
  const held = t.adhoc ? t.takesSlot === true : holdsSlot(t);
  return `<button class="fseat view${held ? '' : ' out'}" type="button" data-id="${esc(t.id)}" title="${esc(`${who} ${t.label || t.id}: ${s.long}${held ? '' : `, ${slotWait(t)}`}`)}">`
    + `<canvas width="60" height="78" data-kind="${figureOf(t)}" data-name="${esc(who)}" data-pose="${pose}" aria-hidden="true"></canvas>`
    + `<span class="gem">${ico(s.sev, s.sev)}</span></button>`;
}

// A health bar: an etched groove filled to the reading with the limit cut in as a notch, then the value and its limit.
function fleetGauge(label, value, limit, pct, limitPct, sev) {
  const clamp = (p) => Math.max(0, Math.min(100, p ?? 0));
  return `<div class="gauge"><span>${esc(label)}</span><div class="groove"><i class="${sev}" style="width:${clamp(pct)}%"></i>${limitPct != null ? `<s style="left:${clamp(limitPct)}%"></s>` : ''}</div><b>${esc(value)} <span>${esc(limit)}</span></b></div>`;
}
function fleetHealth(m) {
  if (!m?.ok) return `<div class="cnote">${esc(m?.error || 'The board could not reach this machine.')}</div>`;
  const perCore = m.load?.cores ? m.load.avg5 / m.load.cores : null;
  const r = swapRatio(m);
  return [
    perCore != null && m.load.maxPerCore ? fleetGauge('Load per core', perCore.toFixed(2), `limit ${m.load.maxPerCore}`, (perCore / (m.load.maxPerCore * 2)) * 100, 50, perCore > m.load.maxPerCore ? 'bad' : 'ok') : '',
    m.memFreePercent != null ? fleetGauge('Memory free', `${m.memFreePercent}%`, m.minMemFreePercent != null ? `floor ${m.minMemFreePercent}%` : '', m.memFreePercent, m.minMemFreePercent, m.memFreePercent < (m.minMemFreePercent ?? 0) ? 'bad' : 'ok') : '',
    r != null ? fleetGauge('Swap used', m.swapUsedMb ? gb(m.swapUsedMb) : 'none', `of ${ram(m)}`, r * 100, SWAP_BAD * 100, r >= SWAP_BAD ? 'bad' : r >= SWAP_WARN ? 'warn' : 'ok') : '',
  ].join('');
}

// The accounts a machine uses (collect.mjs reads only the ones dispatcher.hosts.<host>.accounts allows); one signed
// out here is red.
function fleetLetters(m) {
  const accts = m?.accounts ?? [];
  if (!accts.length) return `<span class="cnote">${m?.ok ? 'No account read here.' : 'Unknown while offline.'}</span>`;
  const signedOut = new Set([...(m.signedOut ?? []), ...accts.filter((a) => a.signedIn === false).map((a) => a.label)]);
  return `<div class="letters">${accts.map((a) => {
    const gone = signedOut.has(a.label);
    const title = `account ${a.label}${a.plan ? ` (${a.plan})` : ''}${gone ? ', signed out here' : ''}`;
    return `<span class="letter on${gone ? ' gone' : ''}" title="${esc(title)}">${esc(a.label)}</span>`;
  }).join('')}</div>`;
}

// The pause state, if any, and the link to the machine's worktrees.
function fleetFoot(m, name) {
  const state = m?.paused ? `<div class="cstate wait">Paused: ${esc(String(m.paused).replace(/^\S+Z /, ''))}. Resume with <code>node ${esc(m.root ?? snap.config.repoDir ?? '.')}/dispatcher/dispatcher.mjs resume</code> on ${esc(name)}.</div>` : '';
  const wt = wtOf(m?.host)?.rows;
  const safe = wt ? wt.filter((r) => r.removable).length : 0;
  const wtLink = wt ? `<a class="fwt" href="#worktrees/${encodeURIComponent(m.host)}" data-go>${ico('branch', 'todo')}<span><b>${plural(wt.length, 'worktree')}</b>${safe ? `, ${safe} safe to remove` : ''}</span>${FLEET_CHEV}</a>` : '';
  return state || wtLink ? `<div class="fsec">${state}${wtLink ? `<div class="frow">${wtLink}</div>` : ''}</div>` : '';
}

function fleetCard(m, slots) {
  const name = realmName(m.host);
  const live = fleetLiveOn(m.host);
  const count = slots.machines.find((x) => x.host === m.host) ?? { used: 0, cap: m.maxWorkers ?? 0, over: 0 };
  const extra = [live.waiting.length ? `${live.waiting.length} waiting for a slot` : '', live.merging.length ? `${live.merging.length} waiting to merge` : ''].filter(Boolean).join(', ');
  const mine = snap.tickets.filter((t) => t.host === m.host && t.live);
  const held = (t) => (t.adhoc ? t.takesSlot === true : holdsSlot(t));
  const order = [...mine.filter((t) => held(t) && !t.sentry), ...mine.filter((t) => held(t) && t.sentry), ...mine.filter((t) => !held(t))];
  const free = Math.max(0, count.cap - count.used);
  const seats = order.map(fleetSeat).join('') + Array.from({ length: free }, () => '<span class="fseat free" title="A free slot"></span>').join('');
  const tick = tickWords(m, Date.now(), snap.config.tickMinutes, dur);
  const slot = (label, value, live, title) => `<div class="fctl"><span>${label}</span><output class="fval" title="${esc(title)}">${value ?? 0}</output><span class="live">${live}</span></div>`;
  return `<article class="fcard${!m.ok || m.paused ? ' down' : ''}" id="f-${esc(m.host)}" style="--mc:${machineColor(m.host)}">
    <div class="fband">${sigil(m.host, machineColor(m.host))}<h3>${esc(name)}</h3><span class="host">${esc(m.name ?? m.host)}</span>${fleetState(m)}<span class="tick">${esc(tick)}</span></div>
    ${seats ? `<div class="fsec"><div class="fseats">${seats}</div></div>` : ''}
    <div class="fsec">
      ${slot('Workers', m.maxWorkers, `<b${count.over ? ' class="warn"' : ''}>${count.used} in use</b>${count.over ? `<span class="warn">, ${count.over} over</span>` : ''}${extra ? `, ${esc(extra)}` : ''}`, "The machine's whole build pool, every account (dispatcher.hosts.<host>.maxWorkers).")}
      ${slot('Sentry', m.sentryWorkers, live.sentryUse ? `<b>${live.sentryUse}</b> busy` : 'idle', 'Side slots for Sentry fixes, apart from the workers (sentryWorkers).')}
      ${slot('Burst', m.burstWorkers, esc(burstWords(m)), 'Extra worker slots while the machine is calm (burstWorkers).')}
    </div>
    <div class="fsec fhealth">${fleetHealth(m)}</div>
    <div class="fsec"><div class="fctl facc-row"><span>Accounts</span>${fleetLetters(m)}</div></div>
    ${fleetFoot(m, name)}
  </article>`;
}

// Draws each seat's figure, as the Middle-earth view poses it.
function fleetFigures(root) {
  if (typeof drawFigure !== 'function') return;
  root.querySelectorAll('.fseat canvas').forEach((c) => {
    const g = c.getContext('2d');
    g.setTransform(3, 0, 0, 3, 0, 0);
    g.imageSmoothingEnabled = false;
    drawFigure(g, c.dataset.kind, c.dataset.name, 10, 24, c.dataset.pose, 0);
  });
}
