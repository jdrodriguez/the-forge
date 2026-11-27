// control-fleet.js: the Fleet view's top strip, the tickets waiting for a slot, the folded fleet settings and load
// guards, and the change log. The strip says whether new work flows, the one worker count, Hold new work and every
// change that ends by itself (End now, Keep). Waiting for a slot shows only while a ticket waits, each with Push
// through, which writes the same request `dispatcher.mjs wake <ID>` does. The change log is control-log.jsonl,
// newest first. Uses control-data.js, fleet-card.js (plural) and fleet-accounts.js (ctlNum, ctlTog).

// The fleet-wide settings by name, for the toast, the timers and the change log.
const CTL_SWITCHES = { holdNewWork: 'New work held', 'externalBuilders.fallback.enabled': 'Codex and Grok as accounts',
  'codexAutoReset.enabled': 'Codex free resets', 'sentryTriage.enabled': 'Sentry triage' };
const CTL_NUMBERS = { maxConcurrent: 'Building at once', maxDispatchesPerDay: 'New tickets a day', headroomFloorPercent: 'Usage left on every account',
  workerCap: 'Workers per account', burnFloorPercent: 'Burn floor', fableFloorPercent: 'Fable floor', fableMinWeeklyLeftPercent: 'Fable needs week left',
  'workerReservePercent.max': 'Reserve per Max worker', 'workerReservePercent.team': 'Reserve per Team worker',
  'externalBuilders.fallback.maxRounds': 'Engine rounds', model: 'Default model', effort: 'Effort' };

// A logged target in words: "maxWorkers:main-mac" is "Rivendell workers".
function ctlTargetName(target) {
  if (CTL_SWITCHES[target] || CTL_NUMBERS[target]) return CTL_SWITCHES[target] || CTL_NUMBERS[target];
  const [kind, a, b] = String(target).split(':');
  const realm = (h) => realmName(h);
  const names = { maxWorkers: () => `${realm(a)} workers`, sentryWorkers: () => `${realm(a)} Sentry slots`, burstWorkers: () => `${realm(a)} burst slots`,
    drain: () => `${realm(a)} wind down`, pause: () => `${realm(a)} pause`, account: () => `account ${b} on ${realm(a)}`,
    maxLoadPerCore: () => `${realm(a)} load limit`, minMemoryFreePercent: () => `${realm(a)} memory floor`, burn: () => `account ${a} burn`,
    fable: () => `account ${a} Fable`, out: () => `account ${a} in the queue`, workerCap: () => `account ${a} worker cap`, engine: () => `${cap(a)} as an account`,
    prefer: () => `${cap(a)} fed first`, sizeModel: () => `Size ${a} model`, wake: () => `${a} push through` };
  return names[kind]?.() ?? kind;
}

// A change in words: "Erebor winds down", "Rivendell workers 5 to 4", "Account h Fable on".
function ctlHuman(e) {
  // What "none" means for the setting: the fleet's value for an account's cap or a machine's load guard, no daily cap.
  const none = e.op === 'workerCap' ? `fleet ${ctl.data?.defaults?.workerCap ?? ''}`.trim() : e.op === 'loadGuard' ? "the fleet's"
    : e.args?.key === 'maxDispatchesPerDay' ? 'no cap' : 'none';
  const v = (x) => (x === true ? 'on' : x === false ? 'off' : x ?? none);
  const realm = e.args?.host ? realmName(e.args.host) : '';
  if (e.op === 'drain') return e.to ? `${realm} winds down` : `${realm} brought back`;
  if (e.op === 'pause') return e.to ? `${realm} paused` : `${realm} resumed`;
  if (e.op === 'switch' && e.args?.key === 'holdNewWork') return e.to ? 'New work held on every machine' : 'New work flows again';
  if (e.op === 'out') return `Account ${e.args.account} ${e.to ? 'out of the queue' : 'back in the queue'}`;
  if (e.kind === 'wake' || !e.op) return cap(e.says || ctlTargetName(e.target));
  return `${cap(ctlTargetName(e.target))} ${typeof e.to === 'boolean' ? v(e.to) : `${v(e.from)} to ${v(e.to)}`}`;
}

function ctlTimerRow(t) {
  return `<div class="ctimer"><span class="left">${esc(ctlLeft(t.until))}</span><span>${esc(ctlHuman(t))}, ends ${esc(ctlClock(t.until))}</span>`
    + `<span class="tacts"><button class="cbtn small" type="button" data-ctl="${esc(JSON.stringify({ op: 'end', id: t.id }))}">End now</button>`
    + `<button class="cbtn small" type="button" data-ctl="${esc(JSON.stringify({ op: 'keep', id: t.id }))}" title="Drop the end time and keep it as it is">Keep</button></span></div>`;
}

// The top strip, the fixed place to look first: whether new work flows (holdNewWork: no machine claims a new ticket
// while running work carries on), the one worker count (worker-count.js), Hold new work, and every change that ends by
// itself with a countdown, End now and Keep.
function ctlTop() {
  const held = ctl.data.switches.holdNewWork;
  const slots = forgeSlots(snap);
  const paused = snap.machines.filter((m) => m.ok && m.paused).length;
  const holdText = 'No machine claims a new agent-ready ticket. Everything already claimed carries on: workers keep building, green PRs merge, '
    + 'and tickets in the wake queue still wake. A ticket whose account runs out of usage waits on its machine. Takes effect on each machine\'s next tick.';
  const button = held
    ? `<button class="cbtn go push" type="button" data-ctl="${esc(JSON.stringify({ op: 'switch', key: 'holdNewWork', value: false, expect: true }))}">Let new work flow</button>`
    : `<button class="cbtn warn push" type="button" data-ctl="${esc(JSON.stringify({ op: 'switch', key: 'holdNewWork', value: true, expect: false }))}" data-confirm="${ctlAttr(holdText)}" data-title="Hold new work on every machine?" data-go="Hold new work" data-danger="1">Hold new work</button>`;
  const count = esc(slots.text).replace(/^(\d+ of \d+)/, '<b>$1</b>');
  return `<div class="ftop${held ? ' held' : ''}"><span class="flow ${held ? 'off' : 'on'}"><span class="dot"></span>${held ? 'New work held' : 'New work flows'}</span>`
    + `<span class="cnt">${count} in use${slots.over ? `, <span class="over">${slots.over} over</span>` : ''}${paused ? `, ${plural(paused, 'machine')} paused` : ''}</span>`
    + button
    + (ctl.data.timers.length ? `<div class="ctimers">${ctl.data.timers.map(ctlTimerRow).join('')}</div>` : '')
    + '</div>';
}

function ctlFleet() {
  const sw = ctl.data.switches;
  const eng = ctl.data.engines;
  const building = snap.labeledBuilding?.length ?? snap.tickets.filter((t) => t.live && !t.adhoc && t.status === 'building').length;
  const swTog = (key, text, title = '') => ctlTog(sw[key], { op: 'switch', key, value: !sw[key], expect: sw[key] }, text, title ? `title="${esc(title)}"` : '');
  const engTog = (op, e, on, text) => ctlTog(on, { op, engine: e, value: !on, expect: on }, text);
  return `<details class="cfold fmore" id="cf-fleet"><summary>Fleet settings and load guards</summary><div class="cfields">
    ${ctlNum('maxConcurrent', 'Building at once, all machines', `${building} building now. Each machine's workers still bound it.`)}
    ${ctlNum('maxDispatchesPerDay', 'New tickets a day, per machine', 'A rolling 24 hours.', { choices: [5, 10, 15, 20, 30, 50], noneText: 'No cap' })}
    <div class="cfield"><span>Codex and Grok as accounts</span><div class="cacts">${swTog('externalBuilders.fallback.enabled', 'Engines take tickets', 'Codex and Grok fill worker slots like Claude accounts')}</div>
      <div class="cacts">${ctl.data.choices.engines.map((e) => engTog('engine', e, eng.list.includes(e), cap(e))).join('')}</div>
      <div class="cacts">${ctl.data.choices.engines.map((e) => engTog('prefer', e, eng.prefer.includes(e), `${cap(e)} first`)).join('')}</div>
      <span class="cnote">First: fed ahead of the Claude accounts while it has room.</span></div>
    ${ctlNum('externalBuilders.fallback.maxRounds', 'Engine rounds before Claude', 'At this many rounds a Claude worker takes the ticket over.')}
    <div class="cfield"><span>Codex free resets</span><div class="cacts">${swTog('codexAutoReset.enabled', 'Spend them by themselves', 'codex-reset.mjs on codexAutoReset.host')}</div></div>
    <div class="cfield"><span>Sentry triage</span><div class="cacts">${swTog('sentryTriage.enabled', 'Diagnose and queue Sentry issues')}</div></div>
  </div>${ctl.data.hosts.map(ctlLoadGuards).join('')}</details>`;
}

function ctlWake() {
  const rows = ctl.data.waiting;
  const body = rows.map((w) => {
    const t = snap.tickets.find((x) => x.id === w.id);
    const asked = ctl.data.wakeRequests.includes(w.id);
    const text = `${esc(w.id)} wakes on ${esc(realmName(w.host))}'s next tick even though the machine is full, once. The machine then runs one more worker than its limit until a slot frees.`;
    return `<div class="crowl"><span class="when">${esc(dur(ms(w.since)))}</span>${sigil(w.host, machineColor(w.host))}
      <span class="what">${t?.nickname ? `${esc(t.nickname)} ` : ''}${t?.url ? link(t.url, w.id) : esc(w.id)}${t?.title ? ` ${esc(t.title)}` : ''}<small>waiting for a ${w.pool === 'sentry' ? 'Sentry slot' : 'slot'} on ${esc(realmName(w.host))}: ${esc(w.reason)}${w.from === 'heartbeat' ? ` (as of its heartbeat ${esc(ago(w.beatAt))})` : ''}</small></span>`
      + (asked ? '<span class="chip run">Pushed, wakes on its next tick</span>'
        : `<button class="cbtn" type="button" data-ctl="${esc(JSON.stringify({ op: 'wake', ticket: w.id }))}" data-confirm="${ctlAttr(text)}" data-title="Push ${esc(w.id)} through?" data-go="Push through" data-timed="0">Push through</button>`)
      + '</div>';
  }).join('');
  return body ? `<section class="csec" id="ctl-wake"><h2 class="gh">${ico('run', 'todo')}Waiting for a slot <span class="gcount">${rows.length}</span></h2><div class="cbody">${body}</div></section>` : '';
}

// One change log line in words.
function ctlLogLine(e) {
  const name = ctlTargetName(e.target);
  const why = e.why ? ` (${e.why})` : '';
  switch (e.kind) {
    case 'change': return [ctlHuman(e) + why, e.until ? `ends ${ctlClock(e.until)}${typeof e.revertTo === 'boolean' ? '' : `, back to ${e.revertTo ?? 'none'}`}` : ''];
    case 'revert': return [`Put back: ${ctlHuman(e)}`, e.reason];
    case 'skipped': return [`${cap(name)}: end time reached, nothing put back`, e.reason];
    case 'superseded': return [`${cap(name)}: its end time passed to the next change`, ''];
    case 'keep': return [`${cap(name)}: kept, with no end time`, ''];
    case 'until': return [`${cap(name)}: ends ${ctlClock(e.until)}`, ''];
    case 'wake': return [cap(e.says || name), ''];
    default: return [name, e.kind];
  }
}
let ctlLogAll = false;
function ctlLog() {
  const rows = ctl.data.log;
  const shown = ctlLogAll ? rows : rows.slice(0, 25);
  const body = shown.length ? shown.map((e) => {
    const [what, sub] = ctlLogLine(e);
    // Who: the human for what they did on the page, the board for what it put back by itself.
    const who = ['revert', 'skipped', 'superseded'].includes(e.kind) && e.reason !== 'ended early from the board' ? 'The board' : (snap.config.human || 'You');
    return `<div class="crowl"><span class="when" title="${esc(new Date(e.at).toLocaleString())}">${esc(ago(e.at))}</span><span class="kind">${who}</span>`
      + `<span class="what">${esc(what)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`;
  }).join('') + (rows.length > 25 ? `<div class="crowl"><button class="cbtn small" type="button" id="ctlLogMore">${ctlLogAll ? 'Show the latest 25' : `Show all ${rows.length}`}</button></div>` : '')
    : '<div class="cempty">Nothing changed from this page yet. Every change shows here, newest first, and in the config\'s notes.</div>';
  return `<details class="cfold fmore" id="cf-log"><summary>Change log</summary><div class="flog">${body}</div></details>`;
}
document.addEventListener('click', (e) => {
  if (e.target.id !== 'ctlLogMore') return;
  ctlLogAll = !ctlLogAll;
  renderControl();
});

// One machine's own load guards, or the fleet's: a dropdown each, since the load limit is a fraction.
function ctlLoadGuards(h) {
  const d = ctl.data.defaults;
  const opt = (v, cur, text) => `<option value="${v}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(text)}</option>`;
  const sel = (key, list, cur, unit, fleet) => `<select data-num="1" data-ctl-select="${esc(JSON.stringify({ op: 'loadGuard', host: h.host, key }))}" data-v="${esc(JSON.stringify(cur))}">`
    + `${opt('', cur, `the fleet's ${fleet}${unit}`)}${[...new Set([...list, ...(cur != null ? [cur] : [])])].sort((a, b) => a - b).map((v) => opt(v, cur, `${v}${unit}`)).join('')}</select>`;
  return `<div class="cfields fguard"><div class="cfield"><span>${sigil(h.host, machineColor(h.host))} ${esc(realmName(h.host))}</span></div>`
    + `<label class="cfield"><span>Load per core limit</span>${sel('maxLoadPerCore', [0.75, 1, 1.25, 1.5, 2, 3, 5, 10], h.maxLoadPerCore, '', d.maxLoadPerCore)}<span class="cnote">Over it, this machine claims nothing.</span></label>`
    + `<label class="cfield"><span>Memory free floor</span>${sel('minMemoryFreePercent', [5, 10, 15, 20, 25, 30, 40], h.minMemoryFreePercent, '%', d.minMemoryFreePercent)}<span class="cnote">Under it, this machine claims nothing.</span></label></div>`;
}

// Each machine's dispatcher log, folded away.
function ctlLogs() {
  return `<details class="cfold fmore" id="cf-dlog"><summary>Dispatcher logs</summary>${snap.machines.map((m) =>
    `<div class="fdlog"><div class="cfield"><span>${sigil(m.host, machineColor(m.host))} ${esc(realmName(m.host))}</span></div><pre class="log">${esc((m.log || []).join('\n') || 'No log read.')}</pre></div>`).join('')}</details>`;
}
