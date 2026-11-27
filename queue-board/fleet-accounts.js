// fleet-accounts.js: the Fleet view's one accounts table, under the machine cards. Above it the default model, effort
// and the model per ticket size. Then a row per Claude account: its email and plan, the machines it runs on, its week
// left with the reset, its 5-hour left, one mark (taken out, signed out on a machine, or past 90% of a window, which is
// Gollum's Ring from gollum-data.js), and its levers inline: Burn (burnAccounts, with burnUntil), Fable (fableAccounts
// and noFableAccounts), its own worker cap (workerCapByAccount) and Take out or Put back (accountsOut). Any account the
// board only watches follows, marked "not in the queue", then Codex and Grok with their week. The floors and reserves
// fold away. Under 900px the table becomes a list. Uses control-data.js, fleet-logic.js and page.html's helpers.
const ctlNumVal = (key) => ctl.data.numbers[key]?.value;
const ctlTog = (on, body, text, attrs = '') => `<button class="tog sm${on ? ' on' : ''}" type="button" aria-pressed="${on}" data-ctl="${esc(JSON.stringify(body))}" ${attrs}>${esc(text)}</button>`;

// A week-left ring: how much of the window is left, red at 10% or less, amber at 30% or less.
function fleetRing(left) {
  const c = 2 * Math.PI * 5.5, sev = left <= 10 ? 'bad' : left <= 30 ? 'warn' : 'ok';
  return `<svg class="ring ${sev}" viewBox="0 0 15 15" aria-hidden="true"><circle class="track" cx="7.5" cy="7.5" r="5.5"/>${left > 0 ? `<circle class="fill" cx="7.5" cy="7.5" r="5.5" stroke-dasharray="${(c * left / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 7.5 7.5)"/>` : ''}</svg>`;
}
const fleetWeek = (left, resets) => (left == null ? '<span class="plan">no reading</span>'
  : `<span class="wk-left">${fleetRing(left)}<b>${left}%</b>${resets ? `<span class="r">resets ${esc(ctlClock(resets))}</span>` : ''}</span>`);

function fleetBurn(a) {
  const name = `account ${a.label}`;
  if (a.burn) return ctlTog(true, { op: 'burn', account: a.label, value: false, expect: true }, a.burnUntil ? `until ${ctlClock(a.burnUntil)}` : 'Burn');
  const text = `${esc(name)} wins every ticket while it has ${ctlNumVal('burnFloorPercent') ?? 2}% of its week left after its workers' reserve, ahead of Codex, Grok and the other accounts. `
    + "Its Fable switch stays as it is. Takes effect on each machine's next tick.";
  return ctlTog(false, { op: 'burn', account: a.label, value: true, expect: false }, 'Burn', `data-confirm="${ctlAttr(text)}" data-title="Burn ${esc(name)} first?" data-go="Burn it first"`);
}
function fleetFable(a, weekLeft) {
  const name = `account ${a.label}`;
  const minWeek = ctlNumVal('fableMinWeeklyLeftPercent') ?? 50;
  const wait = a.fable && weekLeft != null && weekLeft < minWeek ? ` title="${esc(`Waits: ${weekLeft}% of its week left, Fable needs ${minWeek}%`)}"` : '';
  if (a.fable) return ctlTog(true, { op: 'fable', account: a.label, value: false, expect: true }, 'Fable', wait);
  const text = `${esc(name)}'s new workers run Fable while it has ${ctlNumVal('fableFloorPercent') ?? 10}% of its Fable allowance and ${minWeek}% of its week left, `
    + "whatever their size; after that they run Opus, or Sonnet for Size S. Takes effect on each machine's next tick.";
  return ctlTog(false, { op: 'fable', account: a.label, value: true, expect: false }, 'Fable', `data-confirm="${ctlAttr(text)}" data-title="Fable on ${esc(name)}?" data-go="Use Fable"`
    + (a.burn ? '' : ` data-extra="${esc(JSON.stringify({ label: `Also burn ${name} first, so it gets the work`, checked: true, op: { op: 'burn', account: a.label, value: true, expect: false } }))}"`));
}
function fleetOut(a) {
  const name = `account ${a.label}`;
  if (a.out) return `<button class="cbtn go small" type="button" title="${esc(`Out since ${ago(a.out.since)}`)}" data-ctl="${esc(JSON.stringify({ op: 'out', account: a.label, value: false, expect: true }))}">Put back</button>`;
  if (!a.on.length) return '';
  const text = `${esc(name)} comes off every machine's account list (${esc(a.on.map(realmName).join(', '))}), so no queue work goes to it. `
    + 'Its running workers finish. Put it back here to restore exactly those machines.';
  return `<button class="cbtn small" type="button" data-ctl="${esc(JSON.stringify({ op: 'out', account: a.label, value: true, expect: false }))}" data-confirm="${ctlAttr(text)}" data-title="Take ${esc(name)} out of the queue?" data-go="Take it out" data-danger="1">Take out</button>`;
}

// Every account with its reading, its mark and its levers, worked out once per draw.
function fleetAcctRows() {
  const hot = new Set(typeof grReport === 'function' ? grReport().ring.flatMap((r) => r.labels) : []);
  const fleetCap = ctl.data.defaults.workerCap;
  return ctl.data.accounts.map((a) => {
    const u = acctReading(snap, a.label);
    const flag = acctFlag(a, u, hot, realmName);
    const where = a.on.map((h) => `<span title="${esc(realmName(h))}">${sigil(h, machineColor(h))}</span>`).join('');
    const cap = ctlStep(`cap:${a.label}`, { op: 'workerCap', account: a.label }, a.workerCap, { min: 0, max: 12, none: `${fleetCap}`, fleet: fleetCap,
      title: `The most workers account ${a.label} may run on one machine; at the fleet's ${fleetCap} it follows the fleet's value.` });
    return { a, u, flag: flag ? `<span class="flag ${flag.sev}">${esc(flag.text)}</span>` : '', where, cap, five: !u.email ? '' : u.fiveLimit ? `${u.fiveLeft}% left` : '<span class="plan">no limit</span>' };
  });
}

// The default model and effort, and the model per Size, each a control that applies at once with Undo.
function fleetModels() {
  const md = ctl.data.model;
  const choices = ctl.data.choices;
  const fableAll = "Every account not in noFableAccounts runs Fable while its Fable allowance and half its week last, then Opus. Fable costs about twice Opus. Takes effect on each machine's next tick.";
  const seg = `<span class="seg">${choices.models.map((x) => `<button type="button" class="${md.model === x ? 'on' : ''}" ${md.model === x ? 'disabled' : ''} data-ctl="${esc(JSON.stringify({ op: 'model', value: x, expect: md.model }))}"`
    + `${x === 'fable' ? ` data-confirm="${ctlAttr(fableAll)}" data-title="Fable for the whole queue?" data-go="Use Fable everywhere"` : ''}>${esc(cap(x))}</button>`).join('')}</span>`;
  const select = (body, cur, options) => `<select data-ctl-select="${esc(JSON.stringify(body))}" data-v="${esc(JSON.stringify(cur))}">${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const sizes = choices.sizes.map((s) => `<label>Size ${esc(s)} ${select({ op: 'sizeModel', size: s }, md.bySize[s] ?? null, [['', `${cap(md.model)} (default)`], ...choices.sizeModels.map((x) => [x, cap(x)])])}</label>`).join('');
  return `<div class="fmodels"><div class="fmlab">Model ${seg}</div><label>Effort ${select({ op: 'effort' }, md.effort, choices.efforts.map((x) => [x, x]))}</label>${sizes}</div>`;
}

// A number setting as a stepper with its label and a short note, for the folded sections. One that may be none (the
// daily cap) is a dropdown of usual values instead, so a click never turns "no cap" into a cap of 0.
function ctlNum(key, label, note, { choices = null, noneText = 'none' } = {}) {
  const n = ctl.data.numbers[key];
  const field = choices
    ? `<select data-num="1" data-ctl-select="${esc(JSON.stringify({ op: 'number', key }))}" data-v="${esc(JSON.stringify(n.value))}">`
      + [[null, noneText], ...[...new Set([...choices, ...(n.value != null ? [n.value] : [])])].sort((x, y) => x - y).map((v) => [v, String(v)])]
        .map(([v, t]) => `<option value="${v ?? ''}"${v === n.value ? ' selected' : ''}>${esc(t)}</option>`).join('') + '</select>'
    : ctlStep(`n:${key}`, { op: 'number', key }, n.value, { min: n.min, max: n.max });
  return `<div class="cfield"><span>${esc(label)}</span>${field}${note ? `<span class="cnote">${esc(note)}</span>` : ''}</div>`;
}

// Accounts the board only watches (collect.mjs's watched, such as the owner's own main account): shown with their usage,
// never given queue work, so they carry no levers. One row per account key, with its freshest reading.
function fleetWatched() {
  const by = new Map();
  for (const m of snap.machines) for (const a of m.watched ?? []) {
    const k = a.key || `${a.label}|${a.email}`;
    const cur = by.get(k);
    const hosts = [...(cur?.hosts ?? []), m.host];
    by.set(k, !cur || String(a.usageAt ?? '') > String(cur.a.usageAt ?? '') ? { a, hosts } : { ...cur, hosts });
  }
  return [...by.values()].map(({ a, hosts }) => {
    const left = (w) => (w?.used == null ? null : Math.max(0, Math.round(100 - w.used)));
    return { a, left: left(a.weekly), five: a.fiveHour ? `${left(a.fiveHour)}% left` : '<span class="plan">no limit</span>',
      where: hosts.map((h) => sigil(h, machineColor(h))).join(''),
      flag: a.refreshError ? `<span class="flag warn" title="${esc(a.refreshError)}">can't refresh</span>` : '<span class="flag">not in the queue</span>' };
  });
}

function fleetServices() {
  return (snap.services ?? []).map((s) => {
    const left = s.weekly?.used != null ? Math.max(0, Math.round(100 - s.weekly.used)) : null;
    const where = (s.machines ?? []).length >= snap.machines.length ? '<span class="plan">all machines</span>' : (s.machines ?? []).map((h) => sigil(h, machineColor(h))).join('');
    return { s, left, where, flag: s.limited ? '<span class="flag warn">at its limit</span>' : s.error ? `<span class="flag bad">${esc(s.error)}</span>` : '' };
  });
}

function fleetAccounts() {
  const rows = fleetAcctRows();
  const svc = fleetServices();
  const watched = fleetWatched();
  const wide = `<table class="fa ftable-wide"><thead><tr><th>Account</th><th>Machines</th><th>Week left</th><th class="hide-mid">5-hour</th><th></th><th>Burn</th><th>Fable</th><th>Cap</th><th></th></tr></thead><tbody>
    ${rows.map(({ a, u, flag, where, cap: c, five }) => `<tr class="${a.out || !a.on.length ? 'dim' : ''}" id="fa-${esc(a.label)}"><td><span class="lab">${esc(a.label)}</span><span class="who">${esc(u.email ?? '')}</span> <span class="plan">${esc(u.plan ?? '')}</span></td>
      <td><span class="realms">${where || '<span class="plan">none</span>'}</span></td><td>${fleetWeek(u.weekLeft, u.weekResets)}</td><td class="hide-mid">${five}</td><td>${flag}</td>
      <td>${fleetBurn(a)}</td><td>${fleetFable(a, u.weekLeft)}</td><td>${c}</td><td>${fleetOut(a)}</td></tr>`).join('')}
    ${watched.map(({ a, left, five, where, flag }) => `<tr><td><span class="lab">${esc(a.label)}</span><span class="who">${esc(a.email ?? '')}</span> <span class="plan">${esc(a.plan ?? '')}</span></td>
      <td><span class="realms">${where}</span></td><td>${fleetWeek(left, a.weekly?.resetsAt)}</td><td class="hide-mid">${five}</td><td>${flag}</td><td colspan="4"></td></tr>`).join('')}
    ${svc.length ? `<tr class="grp"><td colspan="9">Codex and Grok</td></tr>${svc.map(({ s, left, where, flag }) => `<tr><td><span class="lab svc">${esc(s.name)}</span><span class="who">${esc(s.account ?? '')}</span> <span class="plan">${esc(s.plan ?? '')}</span></td>
      <td>${where}</td><td>${fleetWeek(left, s.weekly?.resetsAt)}</td><td class="hide-mid"></td><td>${flag}</td><td colspan="4"></td></tr>`).join('')}` : ''}
    </tbody></table>`;
  const narrow = `<div class="ftable-narrow">${rows.map(({ a, u, flag, five }) => `<div class="facc${a.out || !a.on.length ? ' dim' : ''}"><div class="facc-1"><span class="lab">${esc(a.label)}</span><span class="who">${esc(u.email ?? 'no machine')}</span>${u.weekLeft != null ? `<span class="wk-left">${fleetRing(u.weekLeft)}<b>${u.weekLeft}%</b></span>` : ''}</div>
    ${flag || five ? `<div class="facc-m">${flag}${five ? `<span class="plan">5-hour ${five}</span>` : ''}</div>` : ''}<div class="facc-2">${fleetBurn(a)}${fleetFable(a, u.weekLeft)}${fleetOut(a)}</div></div>`).join('')}
    ${watched.map(({ a, left, flag }) => `<div class="facc"><div class="facc-1"><span class="lab">${esc(a.label)}</span><span class="who">${esc(a.email ?? '')}</span>${left != null ? `<span class="wk-left">${fleetRing(left)}<b>${left}%</b></span>` : ''}</div><div class="facc-m">${flag}</div></div>`).join('')}
    ${svc.map(({ s, left, flag }) => `<div class="facc"><div class="facc-1"><span class="lab svc">${esc(s.name)}</span><span class="who">${esc(s.account ?? '')}</span>${left != null ? `<span class="wk-left">${fleetRing(left)}<b>${left}%</b></span>` : ''}</div>${flag ? `<div class="facc-m">${flag}</div>` : ''}</div>`).join('')}</div>`;
  return `<h2 class="fsech" id="fleet-accounts">Accounts</h2><div class="facct">${fleetModels()}${wide}${narrow}
    <details class="cfold" id="cf-floors"><summary>Floors and reserves</summary><div class="cfields">
      ${ctlNum('headroomFloorPercent', 'Usage left on every account', 'An account takes no new worker under this % of its 5-hour or weekly usage.')}
      ${ctlNum('burnFloorPercent', 'Burn floor', 'A burn account goes first until its week is down to this %.')}
      ${ctlNum('fableFloorPercent', 'Fable floor', 'Fable stops once this % of the Fable allowance is left.')}
      ${ctlNum('fableMinWeeklyLeftPercent', 'Fable needs week left', 'Fable starts only while this % of the week is left.')}
      ${ctlNum('workerReservePercent.max', 'Reserve per worker, Max', '% of a Max week each running worker holds back.')}
      ${ctlNum('workerReservePercent.team', 'Reserve per worker, Team', '% of a Team week each running worker holds back.')}
      ${ctlNum('workerCap', 'Workers per account', 'The most one account runs on one machine, unless its row says otherwise.')}
    </div></details></div>`;
}
