// fleet-accounts.js: the Fleet view's one accounts table, under the machine cards. A row per Claude account in the
// queue: its email and plan, the machines it runs on, its week left with the reset, its 5-hour left, and one mark
// (signed out on a machine, or past 90% of a window, which is Gollum's Ring from gollum-data.js). Any account the board
// only watches follows, marked "not in the queue", then Codex and Grok with their week. Under 900px the table becomes a
// list. Read-only. Uses fleet-logic.js and page.html's helpers.
const fleetClock = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// A week-left ring: how much of the window is left, red at 10% or less, amber at 30% or less.
function fleetRing(left) {
  const c = 2 * Math.PI * 5.5, sev = left <= 10 ? 'bad' : left <= 30 ? 'warn' : 'ok';
  return `<svg class="ring ${sev}" viewBox="0 0 15 15" aria-hidden="true"><circle class="track" cx="7.5" cy="7.5" r="5.5"/>${left > 0 ? `<circle class="fill" cx="7.5" cy="7.5" r="5.5" stroke-dasharray="${(c * left / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 7.5 7.5)"/>` : ''}</svg>`;
}
const fleetWeek = (left, resets) => (left == null ? '<span class="plan">no reading</span>'
  : `<span class="wk-left">${fleetRing(left)}<b>${left}%</b>${resets ? `<span class="r">resets ${esc(fleetClock(resets))}</span>` : ''}</span>`);

// Every queue account (a letter some machine reads), with the machines it is on, worked out once per draw.
function fleetAcctRows() {
  const hot = new Set(typeof grReport === 'function' ? grReport().ring.flatMap((r) => r.labels) : []);
  const on = new Map();
  for (const m of snap.machines) for (const a of m.accounts ?? []) on.set(a.label, [...(on.get(a.label) ?? []), m.host]);
  return [...on.keys()].sort().map((label) => {
    const a = { label, on: on.get(label) };
    const u = acctReading(snap, label);
    const flag = acctFlag(a, u, hot, realmName);
    const where = a.on.map((h) => `<span title="${esc(realmName(h))}">${sigil(h, machineColor(h))}</span>`).join('');
    return { a, u, flag: flag ? `<span class="flag ${flag.sev}">${esc(flag.text)}</span>` : '', where, five: !u.email ? '' : u.fiveLimit ? `${u.fiveLeft}% left` : '<span class="plan">no limit</span>' };
  });
}

// Accounts the board only watches (collect.mjs's watched, such as the owner's own main account): shown with their
// usage, never given queue work. One row per account key, with its freshest reading.
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
  if (!rows.length && !svc.length && !watched.length) return '';
  const row = (lab, who, plan, where, week, five, flag) => `<tr><td>${lab}<span class="who">${esc(who ?? '')}</span> <span class="plan">${esc(plan ?? '')}</span></td>`
    + `<td><span class="realms">${where}</span></td><td>${week}</td><td class="hide-mid">${five}</td><td>${flag}</td></tr>`;
  const wide = `<table class="fa ftable-wide"><thead><tr><th>Account</th><th>Machines</th><th>Week left</th><th class="hide-mid">5-hour</th><th></th></tr></thead><tbody>
    ${rows.map(({ a, u, flag, where, five }) => row(`<span class="lab">${esc(a.label)}</span>`, u.email, u.plan, where, fleetWeek(u.weekLeft, u.weekResets), five, flag)).join('')}
    ${watched.map(({ a, left, five, where, flag }) => row(`<span class="lab">${esc(a.label)}</span>`, a.email, a.plan, where, fleetWeek(left, a.weekly?.resetsAt), five, flag)).join('')}
    ${svc.length ? `<tr class="grp"><td colspan="5">Codex and Grok</td></tr>${svc.map(({ s, left, where, flag }) => row(`<span class="lab svc">${esc(s.name)}</span>`, s.account, s.plan, where, fleetWeek(left, s.weekly?.resetsAt), '', flag)).join('')}` : ''}
    </tbody></table>`;
  const item = (lab, who, left, meta) => `<div class="facc"><div class="facc-1">${lab}<span class="who">${esc(who ?? '')}</span>${left != null ? `<span class="wk-left">${fleetRing(left)}<b>${left}%</b></span>` : ''}</div>${meta ? `<div class="facc-m">${meta}</div>` : ''}</div>`;
  const narrow = `<div class="ftable-narrow">${rows.map(({ a, u, flag, five }) => item(`<span class="lab">${esc(a.label)}</span>`, u.email ?? 'no reading', u.weekLeft, `${flag}${five ? `<span class="plan">5-hour ${five}</span>` : ''}`)).join('')}
    ${watched.map(({ a, left, flag }) => item(`<span class="lab">${esc(a.label)}</span>`, a.email, left, flag)).join('')}
    ${svc.map(({ s, left, flag }) => item(`<span class="lab svc">${esc(s.name)}</span>`, s.account, left, flag)).join('')}</div>`;
  return `<h2 class="fsech" id="fleet-accounts">Accounts</h2><div class="facct">${wide}${narrow}</div>`;
}
