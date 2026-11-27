// fleet-card.js: one Fleet card per queue machine. The realm's band (its name, the machine, when it last ticked), the
// seats (a figure per worker, which opens its session panel; a dashed seat holds no slot; empty seats are free slots),
// the Workers, Sentry and Burst steppers beside what they govern, the health bars, the accounts the machine may use,
// then Wind down and Pause and its worktrees. The card's id is f-<host>, so #fleet/<host> scrolls to it (page.html's
// TARGET). A machine the config has no dispatcher.hosts entry for (h.readOnly) shows its counts without steppers.
// Uses control-data.js (ctl, ctlStep, ctlAttr), fleet-logic.js, worker-count.js and page.html's helpers.
const FLEET_CHEV = '<svg class="chev" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What runs on a machine now: the Sentry slots in use, the tickets in its wake queue, those waiting on a merge, and
// the workers a reboot would cut short (busy, working or blocked on input).
function ctlLiveOn(host) {
  const mine = snap.tickets.filter((t) => t.host === host && t.live);
  const queue = mine.filter((t) => !t.adhoc);
  return {
    sentryUse: queue.filter((t) => t.sentry && holdsSlot(t)).length,
    waiting: mine.filter((t) => t.waitingForSlot),
    merging: queue.filter((t) => t.status === 'merge-asked' || t.parked),
    working: mine.filter((t) => ['busy', 'working', 'blocked'].includes(t.workerState)),
  };
}
const ctlWho = (t) => `${t.nickname ? `${esc(t.nickname)} ` : ''}${esc(t.label || t.id)}`;
const ctlNextTick = (m) => {
  if (!m?.lastTick) return 'its next tick';
  const left = Date.parse(m.lastTick) + (snap.config.tickMinutes || 20) * 60000 - Date.now();
  return left > 60000 ? `its next tick, in about ${dur(left)}` : 'its next tick, due now';
};
// Wound down only once a fresh reading shows the machine itself reads no slots in its own copy of the config.
const ctlWoundDown = (m) => Boolean(m?.ok) && m.maxWorkers === 0 && !m.sentryWorkers;

// The band's state word, shown only when the machine is not simply ticking.
function fleetState(h, m, live) {
  if (!m?.ok) return '<span class="chip bad">Offline</span>';
  if (m.paused) return '<span class="chip bad">Paused</span>';
  if (h.drained) return live.working.length || !ctlWoundDown(m) ? '<span class="chip warn">Winding down</span>' : '<span class="chip ok">Safe to reboot</span>';
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

// The accounts a machine may use: each letter it has a folder for, on or off; one signed out here is red, one out of
// the queue struck through.
function fleetLetters(h, m) {
  if (h.readOnly) return `<span class="cnote">${esc((m?.accounts ?? []).map((a) => a.label).join(', ') || 'No account read here.')}</span>`;
  if (!h.accounts) return '<span class="cnote">No account list: it may use every account.</span>';
  const plans = Object.fromEntries((m?.accounts ?? []).map((a) => [a.label, a.plan]));
  const letters = [...new Set([...h.accounts, ...(m?.accounts ?? []).map((a) => a.label), ...(h.spare ?? m?.spareLabels ?? [])])].sort();
  const outs = new Set(ctl.data.accounts.filter((a) => a.out).map((a) => a.label));
  const signedOut = new Set([...(m?.signedOut ?? []), ...(m?.accounts ?? []).filter((a) => a.signedIn === false).map((a) => a.label)]);
  return `<div class="letters">${letters.map((l) => {
    const on = h.accounts.includes(l), out = outs.has(l), gone = signedOut.has(l);
    const title = `account ${l}${plans[l] ? ` (${plans[l]})` : ''}${gone ? ', signed out here' : ''}: ${out ? 'out of the queue; put it back under Accounts' : on ? 'used here; click to stop' : 'not used here; click to use'}`;
    return `<button class="letter${on ? ' on' : ''}${out ? ' out' : ''}${gone ? ' gone' : ''}" type="button" title="${esc(title)}" ${out ? 'disabled' : ''} data-ctl="${esc(JSON.stringify({ op: 'hostAccount', host: h.host, account: l, value: !on, expect: on }))}">${esc(l)}</button>`;
  }).join('')}</div>`;
}

// Wind down or bring back, and pause or resume, each with what it will do in its confirmation, and the state line.
function fleetActs(h, m, live, name) {
  const next = ctlNextTick(m);
  const acts = [];
  if (h.readOnly) {
    // No dispatcher.hosts entry for it, so there are no slots to wind down.
  } else if (h.drained) {
    const d = h.drained;
    acts.push(`<button class="cbtn go" type="button" data-ctl="${esc(JSON.stringify({ op: 'drain', host: h.host, value: false, expect: true }))}">Bring back to ${plural(d.maxWorkers ?? 0, 'worker')}${d.sentryWorkers ? `, ${d.sentryWorkers} Sentry` : ''}${d.burstWorkers ? `, ${d.burstWorkers} burst` : ''}</button>`);
  } else {
    const text = `Nothing new starts on ${esc(name)}: workers ${h.maxWorkers} to 0, Sentry ${h.sentryWorkers} to 0, burst ${h.burstWorkers} to 0. `
      + `Running work finishes and merges, and this card says when it is safe to reboot. Takes effect on ${esc(next)}.`;
    acts.push(`<button class="cbtn warn" type="button" data-ctl="${esc(JSON.stringify({ op: 'drain', host: h.host, value: true, expect: false }))}" data-confirm="${ctlAttr(text)}" data-title="Wind down ${esc(name)}?" data-go="Wind down" data-danger="1">Wind down</button>`);
  }
  if (m?.ok && m.paused) {
    acts.push(`<button class="cbtn go" type="button" data-ctl="${esc(JSON.stringify({ op: 'pause', host: h.host, value: false }))}">Resume</button>`);
  } else if (m?.ok) {
    const text = `${esc(name)}'s dispatcher stops dispatching and merging until it resumes; its workers keep working, and their green PRs wait. `
      + 'Use Wind down instead to let running work finish and merge. It takes effect at once on that machine.';
    acts.push(`<button class="cbtn" type="button" data-ctl="${esc(JSON.stringify({ op: 'pause', host: h.host, value: true }))}" data-confirm="${ctlAttr(text)}" data-title="Pause ${esc(name)}?" data-go="Pause" data-danger="1">Pause</button>`);
  }
  let state = '';
  if (m?.paused) state = `<div class="cstate wait">Paused: ${esc(String(m.paused).replace(/^\S+Z /, ''))}</div>`;
  if (h.drained) {
    const waits = live.merging.length ? ` ${plural(live.merging.length, 'ticket')} wait${live.merging.length === 1 ? 's' : ''} on a merge or a review and need${live.merging.length === 1 ? 's' : ''} no worker.` : '';
    const unread = m?.ok ? `${esc(name)} has not read the change yet; it does on ${esc(next)}.` : `${esc(name)} is offline, so the board cannot tell what runs there.`;
    state += live.working.length ? `<div class="cstate wait">Winding down. Still working: ${live.working.map(ctlWho).join(', ')}.${waits}</div>`
      : !ctlWoundDown(m) ? `<div class="cstate wait">Winding down. ${unread}${waits}</div>`
      : `<div class="cstate safe">Safe to reboot: nothing is working here.${waits}</div>`;
  }
  const wt = wtOf(h.host)?.rows;
  const safe = wt ? wt.filter((r) => r.removable).length : 0;
  const wtLink = wt ? `<a class="fwt" href="#worktrees/${encodeURIComponent(h.host)}" data-go>${ico('branch', 'todo')}<span><b>${plural(wt.length, 'worktree')}</b>${safe ? `, ${safe} safe to remove` : ''}</span>${FLEET_CHEV}</a>` : '';
  return `${state}<div class="frow">${acts.join('')}${wtLink}</div>`;
}

function fleetCard(h, slots) {
  const m = snap.machines.find((x) => x.host === h.host);
  const name = realmName(h.host);
  const live = ctlLiveOn(h.host);
  const next = ctlNextTick(m);
  const count = slots.machines.find((x) => x.host === h.host) ?? { used: 0, cap: h.maxWorkers, over: 0 };
  const lock = h.readOnly ? `No dispatcher.hosts entry for ${h.host} in the config` : h.drained ? 'Wound down: bring it back first' : null;
  const stepper = (key, value, max, title) => (lock ? `<output class="cnote" title="${esc(lock)}">${esc(h.readOnly ? value ?? 0 : 0)}</output>`
    : ctlStep(`${key}:${h.host}`, { op: key, host: h.host }, value, { min: 0, max, title: `${title} Takes effect on ${next}.` }));
  const extra = [live.waiting.length ? `${live.waiting.length} waiting for a slot` : '', live.merging.length ? `${live.merging.length} waiting to merge` : ''].filter(Boolean).join(', ');
  const mine = snap.tickets.filter((t) => t.host === h.host && t.live);
  const held = (t) => (t.adhoc ? t.takesSlot === true : holdsSlot(t));
  const order = [...mine.filter((t) => held(t) && !t.sentry), ...mine.filter((t) => held(t) && t.sentry), ...mine.filter((t) => !held(t))];
  const free = Math.max(0, count.cap - count.used);
  const seats = order.map(fleetSeat).join('') + Array.from({ length: free }, () => '<span class="fseat free" title="A free slot"></span>').join('');
  const tick = m ? tickWords(m, Date.now(), snap.config.tickMinutes, dur) : '';
  return `<article class="fcard${!m?.ok || m?.paused ? ' down' : ''}" id="f-${esc(h.host)}" style="--mc:${machineColor(h.host)}">
    <div class="fband">${sigil(h.host, machineColor(h.host))}<h3>${esc(name)}</h3><span class="host">${esc(m?.name ?? h.host)}</span>${fleetState(h, m, live)}<span class="tick">${esc(tick)}</span></div>
    ${seats ? `<div class="fsec"><div class="fseats">${seats}</div></div>` : ''}
    <div class="fsec">
      <div class="fctl"><span>Workers</span>${stepper('maxWorkers', h.maxWorkers, 24, "The machine's whole build pool, every account.")}<span class="live"><b${count.over ? ' class="warn"' : ''}>${count.used} in use</b>${count.over ? `<span class="warn">, ${count.over} over</span>` : ''}${extra ? `, ${esc(extra)}` : ''}</span></div>
      <div class="fctl"><span>Sentry</span>${stepper('sentryWorkers', h.sentryWorkers, 4, 'Side slots for Sentry fixes, apart from the workers.')}<span class="live">${live.sentryUse ? `<b>${live.sentryUse}</b> busy` : 'idle'}</span></div>
      <div class="fctl"><span>Burst</span>${stepper('burstWorkers', h.burstWorkers, 8, 'Extra worker slots while the machine is calm.')}<span class="live">${esc(burstWords({ ...m, burstWorkers: h.burstWorkers }))}</span></div>
    </div>
    <div class="fsec fhealth">${fleetHealth(m)}</div>
    <div class="fsec"><div class="fctl facc-row"><span>Accounts</span>${fleetLetters(h, m)}</div></div>
    <div class="fsec">${fleetActs(h, m, live, name)}</div>
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
