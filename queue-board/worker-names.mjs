// worker-names.mjs: the Middle-earth name each live worker shows under, from the pools in queueBoard.nicknames. A pool
// is keyed by realm (rivendell, shire, erebor, rohan) or by host, with sentry for Sentry-slot workers, adhoc for workers
// some session started outside the queue (the wanderers), and other for a machine with no realm. A worker takes its
// name from the first pool that fits: adhoc, sentry, then with spread realms the pool of the realm it sits in
// (tickets[].realm), then its host's, then its realm's, then other. A name the dispatcher already gave a ticket (its
// nickname) wins. A board-given name stays with its entry while the entry shows, and the least recently given free name
// goes out next. A pool with every name in use numbers its least recently given name ("Frodo 2"). board.mjs keeps the
// state ({ given, lastGiven }) in <stateDir>/queue-board-names.json across restarts.

// Fills t.nickname on every ticket and updates state in place. spread says whether a worker's own realm comes before
// its host's pool. nowIso is the time names are stamped with.
export function giveNames(tickets, pools, state, { spread = false, nowIso = new Date().toISOString() } = {}) {
  if (!pools) return;
  // A pool by its own key only, so a realm or host named like an inherited property ("constructor") finds none.
  const own = (k) => (typeof k === 'string' && Object.hasOwn(pools, k) && Array.isArray(pools[k]) ? pools[k] : null);
  const key = (t) => `${t.host}/${t.id}`;
  const shown = new Set(tickets.map(key));
  for (const k of Object.keys(state.given)) if (!shown.has(k)) delete state.given[k];
  const live = tickets.filter((t) => t.live).sort((a, b) => (a.dispatchedAt || '').localeCompare(b.dispatchedAt || ''));
  const taken = new Set(live.map((t) => t.nickname ?? state.given[key(t)]).filter(Boolean));
  for (const t of live) {
    if (t.nickname || Object.hasOwn(state.given, key(t))) continue;
    // A Codex or Grok worker takes its realm's names like any worker.
    const pool = (t.adhoc && own('adhoc')) || (t.sentry && own('sentry')) || (spread && own(t.realm)) || own(t.host) || own(t.realm) || own('other');
    if (!pool?.length) continue;
    const when = (n) => (Object.hasOwn(state.lastGiven, n) ? String(state.lastGiven[n]) : '');
    const free = pool.filter((n) => !taken.has(n)).sort((a, b) => when(a).localeCompare(when(b)));
    let name = free[0];
    for (let i = 2; !name; i++) name = pool.map((n) => `${n} ${i}`).find((n) => !taken.has(n));
    state.given[key(t)] = name;
    state.lastGiven[name] = nowIso;
    taken.add(name);
  }
  for (const t of tickets) t.nickname ??= state.given[key(t)] ?? null;
}
