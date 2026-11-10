// machines-accounts.js: the Machines view's Accounts card, across the grid under the machines. Every plan the queue
// draws on shows once, Claude's accounts then Codex's and Grok's, with its plan, where it is signed in and what its
// 5-hour and weekly windows have left. A Claude account shows once however many labels and machines hold it: the same
// key (collect.mjs, a short hash of its account and organization ids) is one account with one set of limits, shown with
// its freshest reading. An account the board only watches (collect.mjs's watched, such as the owner's own main account) shows
// with the rest, marked as outside the queue. Codex and Grok are read hourly on every machine and merged by account
// (ext-usage.mjs). Loaded
// before machines.js; it uses machines.js's usageCell and email, and page.html's helpers, only when it renders.

// Whether a reading leaves room to work: at least the dispatcher's floor left in both windows, a window with no limit,
// or one that has reset since the reading.
const hasRoom = (a, floor) => [a.fiveHour, a.weekly].every((w) => !w || (w.resetsAt && Date.parse(w.resetsAt) <= Date.now()) || 100 - (w.used ?? 0) >= floor);
const unusable = (a) => a.error || a.signedIn === false;
const realmLink = (m) => `<a href="#machines/${encodeURIComponent(m.host)}" data-go title="${esc(m.name)}">${esc(realmName(m.host))}</a>`;

// Claude's accounts, one row each: the watched ones first, then the fleet's in label order. A machine whose collect.mjs
// has no key yet groups by email and plan.
function claudeRows(floor) {
  const groups = new Map();
  for (const m of snap.machines) {
    for (const a of [...(m.accounts || []), ...(m.watched || [])]) {
      const k = a.key || (a.email ? `${a.email}|${a.plan}` : `?${a.label}`);
      if (!groups.has(k)) groups.set(k, { email: a.email, plan: a.plan, labels: new Set(), places: [], watchOnly: true });
      if (!a.watchOnly) groups.get(k).watchOnly = false;
      groups.get(k).labels.add(a.label);
      groups.get(k).places.push({ m, a });
    }
  }
  return [...groups.values()].map((g) => {
    const read = g.places.filter(({ a }) => !unusable(a) && a.usageAt).sort((x, y) => Date.parse(y.a.usageAt) - Date.parse(x.a.usageAt))[0]?.a ?? null;
    const labels = [...g.labels].sort();
    const stale = g.places.find(({ a }) => a.refreshError)?.a.refreshError;
    return {
      name: (g.email ? email(g.email) : `account ${esc(labels.join(', '))}`) + (g.watchOnly ? ' <span class="chip" title="Shown here only; the queue never runs work on it">not in the queue</span>' : '')
        + (stale ? ` <span class="chip warn" title="${esc(stale)}">can't refresh</span>` : ''),
      plan: g.plan,
      where: claudePlaces(g),
      read: read && { fiveHour: read.fiveHour, weekly: read.weekly, at: read.usageAt },
      note: g.places.every(({ a }) => unusable(a)) ? 'Signed out everywhere, so it gets no work' : 'No usage read yet',
      room: Boolean(read && hasRoom(read, floor)),
      first: g.watchOnly ? '' : labels[0],
    };
  }).sort((x, y) => x.first.localeCompare(y.first));
}
// Where a Claude account is signed in: each machine's realm with the labels it has there, and a chip on any signed out.
function claudePlaces(g) {
  return snap.machines.map((m) => {
    const here = g.places.filter((p) => p.m === m);
    if (!here.length) return '';
    const out = here.filter(({ a }) => unusable(a));
    const chip = out.length ? ` <span class="chip bad" title="${esc(out.map(({ a }) => a.error || (a.signedOutAt ? `signed out ${ago(a.signedOutAt)}` : 'signed out')).join('; '))}">${out.length === here.length ? '' : `${esc(out.map(({ a }) => a.label).join(', '))} `}signed out</span>` : '';
    return `${realmLink(m)} (${esc(here.map(({ a }) => a.label).join(', '))})${chip}`;
  }).filter(Boolean).join(', ');
}
// Codex's or Grok's accounts (snap.services), with the machines signed in to each.
function serviceRows(name, floor) {
  return (snap.services || []).filter((s) => s.name === name).map((s) => {
    const read = s.error ? null : { fiveHour: s.fiveHour, weekly: s.weekly ?? s.period, at: s.at };
    const out = s.error && /authenticat|log ?in|sign/i.test(s.error);
    return {
      name: s.account ? email(s.account) : esc(s.name),
      plan: s.plan,
      where: s.machines.map((n) => { const m = snap.machines.find((x) => x.name === n); return m ? realmLink(m) : esc(n); }).join(', '),
      extra: [s.credits != null ? `${s.credits.toLocaleString()} credits` : '', s.freeResets ? `${s.freeResets} free reset${s.freeResets > 1 ? 's' : ''}` : '',
        s.onDemand ? `pay as you go: ${s.onDemand.used} of ${s.onDemand.cap}` : '', s.limited ? `limit hit (${s.limited})` : ''].filter(Boolean).join(', '),
      read,
      note: `${out ? '<span class="chip bad">signed out</span> ' : ''}${esc(s.error || '')}`,
      room: Boolean(read && !s.limited && hasRoom(read, floor)),
    };
  });
}
function accountGroups(floor) {
  return [['claude', claudeRows(floor)], ['codex', serviceRows('Codex', floor)], ['grok', serviceRows('Grok', floor)]].filter(([, rows]) => rows.length);
}

// One row: the plan and where it is signed in get their own columns, and fold into the line under the email when the
// card is narrow; a row with no reading says why across the usage columns.
function acctRow(r, floor) {
  const plan = r.plan ? esc(r.plan) : '';
  return `<tr><td class="who">${r.name}<span class="sub nar">${plan ? `${plan}, ` : ''}on ${r.where}</span>${r.extra ? `<span class="sub">${esc(r.extra)}</span>` : ''}</td>`
    + `<td class="wide">${plan}</td><td class="wide where">${r.where}</td>`
    + (r.read ? `<td>${usageCell(r.read.fiveHour, floor)}</td><td>${usageCell(r.read.weekly, floor)}</td><td class="muted">${r.read.at ? dur(ms(r.read.at)) : 'n/a'}</td>`
      : `<td colspan="3" class="muted">${r.note}</td>`) + '</tr>';
}
function accountsCard(floor) {
  const groups = accountGroups(floor);
  if (!groups.length) return '';
  const all = groups.flatMap(([, rows]) => rows);
  const room = all.filter((r) => r.room).length;
  const sub = `Plan usage left<span class="chip ${room < all.length ? 'warn' : 'ok'}">${room} of ${all.length} with room</span>`;
  const body = groups.map(([kind, rows]) => {
    const n = rows.filter((r) => r.room).length;
    const tally = rows.length > 1 ? `${n} of ${rows.length} with room` : n ? 'has room' : 'out of room';
    // The heading's cells line up with the columns, so the two that fold away on a narrow card take nothing with them.
    return `<tr class="agrp"><th title="${esc(AI_NAME[kind])}">${aiMark(kind)}</th><th class="wide"></th><th class="wide"></th><th colspan="3" class="tally">${tally}</th></tr>${rows.map((r) => acctRow(r, floor)).join('')}`;
  }).join('');
  return `<article class="mcard wide" id="m-accounts" data-r="stones">${band('stones', 'Accounts', sub)}
    <div class="msec"><table class="accts" title="${esc(`With room: at least ${floor}% left in both windows`)}"><thead><tr><th>Account</th><th class="wide p">Plan</th><th class="wide w">Signed in on</th><th class="u">5-hour</th><th class="u">Weekly</th><th class="r">Read</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
}
