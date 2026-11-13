// herald-events.mjs: what the queue herald announces, worked out by pure functions over the board's snapshots, so
// herald.test.mjs can check every rule without a board, a speaker or a clock. step(prev, snap, now, opts) returns the
// new state and the events to announce, each { kind, cue, head, body, key, who }. kind is one of sound.json's event
// switches. who says whose call it is, so the Middle-earth view can show who is calling (scene-call.js): { host, id } for
// a ticket's worker, { host, session } for a Claude app session, { host } for a machine, each with a name to show, or
// null (main, an ask with no worker).
//
// The facts are grouped in parts, one per source and machine: a part is a map of key to item, or null when this
// snapshot can't say (the machine never reported, Linear or GitHub failed, its sessions are not scanned yet). A null
// part keeps the previous read's, and a part seen for the first time only sets the baseline, so a board restart, a
// machine coming back or a failed read never sounds a burst of old news. The first read of all announces nothing.
// Each realm has its own merge cue, chosen by the folk that live there. snap.config.realms maps a host to its realm
// ({ key, name, folk }). A machine with no realm (a fifth machine) is drawn as Men, so it sounds Rohan's horn under its
// own name. A ticket that carries its own realm (tickets[].realm, a realm key: with spreadRealms one machine's workers
// sit in every realm) sounds that realm's cue, so a merge is heard in the voice of the realm its worker sat in.
const MERGE_CUE = { elf: 'merge-rivendell', hobbit: 'merge-shire', dwarf: 'merge-erebor', man: 'merge-rohan' };
const REALM_VOICE = { rivendell: ['Rivendell', 'elf'], shire: ['the Shire', 'hobbit'], erebor: ['Erebor', 'dwarf'], rohan: ['Rohan', 'man'] };
const realmOf = (snap, host, name) => {
  const r = snap.config?.realms?.[host];
  return r ? [r.name.replace(/^The /, 'the '), MERGE_CUE[r.folk] ?? MERGE_CUE.man] : [name, MERGE_CUE.man];
};
const mergeRealm = (snap, t, name) => {
  const v = REALM_VOICE[t.realm];
  return v ? [v[0], MERGE_CUE[v[1]]] : realmOf(snap, t.host, name);
};
// A merge older than this is old news even if the herald never saw it before.
const MERGE_FRESH_MS = 60 * 60_000;
// The war horn sounds again while main stays red.
export const HORN_REPEAT_MS = 15 * 60_000;
// The order events are played and posted in when several come at once.
export const ORDER = ['mainRed', 'trouble', 'needs', 'ci', 'merge', 'mainGreen', 'reminder'];

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const who = (t) => t?.nickname || 'A worker';
const whose = (t) => ({ host: t.host, id: t.id, name: t.nickname || t.label || t.id });
const ms = (t) => (typeof t === 'number' ? t : Date.parse(t ?? ''));
export function dur(milli) {
  const m = Math.max(0, Math.round(milli / 60000));
  if (m < 60) return `${m}m`;
  const h = m / 60;
  return h < 24 ? `${h < 10 ? h.toFixed(1) : Math.round(h)}h` : `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
}

// What waits on the owner from one machine's live tickets: a worker blocked on input in its session, a ticket carrying an
// open ask (a needs-human label), a green PR waiting on the owner's merge.
function ticketNeeds(tickets, asks) {
  const out = {};
  for (const t of tickets.filter((x) => x.live)) {
    const tag = ` · ${t.label || t.id}`;
    const w = whose(t);
    if (t.blockedSince) out[`blocked:${t.id}`] = { head: `${who(t)} is blocked${tag}`, body: clip(`Waiting on input in its session on ${t.machine}. ${t.title ?? ''}`, 200), since: t.blockedSince, who: w };
    if (t.waiting) {
      const a = asks?.find((x) => x.id === t.id || t.bundle?.some((b) => b.id === x.id));
      out[`ask:${t.id}`] = { head: `${who(t)} is waiting on you${tag}`, body: clip(a?.question || t.title || 'An open question in Linear.', 200), since: a?.createdAt ?? null, who: w };
    }
    if (t.status === 'merge-asked') out[`merge-ask:${t.id}`] = { head: `${who(t)}'s PR #${t.prNumber} waits on your merge${tag}`, body: clip(t.title ?? 'It touches paths you review yourself.', 200), since: null, who: w };
  }
  return out;
}

// Open asks from Linear. One on a bundle's companion counts as its lead's, so it is the same key the lead's ticket gives.
function askNeeds(snap) {
  const out = {};
  for (const a of snap.asks) {
    const lead = snap.tickets.find((t) => t.live && (t.id === a.id || t.bundle?.some((b) => b.id === a.id)));
    const id = lead?.id ?? a.id;
    out[`ask:${id}`] = { head: lead ? `${who(lead)} is waiting on you · ${lead.label || id}` : `A question waits on you · ${a.id}`,
      body: clip(a.question || a.title, 200), since: a.createdAt ?? null, who: lead ? whose(lead) : null };
  }
  return out;
}

// Claude app sessions waiting on the owner (their last turn ended needing them, or they stopped mid-turn) that they have
// not marked handled. The key carries the session's activity time, so the same session waiting again later is news again.
// Like the Sessions view, a routine counts only by its latest run.
function sessionNeeds(m, handled) {
  const out = {};
  const seen = new Set();
  for (const r of m.rows) {
    if (r.routine) { if (seen.has(r.routine)) continue; seen.add(r.routine); }
    if (!['needs', 'stopped'].includes(r.state) || (handled?.[`${m.host}:${r.id}`] ?? 0) >= (r.activityAt ?? 0)) continue;
    out[`session:${m.host}:${r.id}:${r.activityAt}`] = { head: `${clip(r.title, 60)} session is waiting on you`,
      body: clip(r.ask || r.detail || (r.state === 'stopped' ? 'It stopped mid-turn, most likely on a prompt in the app.' : 'Its last turn ended waiting on you.'), 200),
      since: r.activityAt ? new Date(r.activityAt).toISOString() : null, who: { host: m.host, session: r.id, name: clip(r.title, 40) } };
  }
  return out;
}

// Everything the herald compares in one snapshot.
export function facts(snap, now) {
  const parts = {};
  const ghOk = !snap.errors?.github;
  for (const m of snap.machines ?? []) {
    // A machine the board never reached this run has no tickets in the snapshot, which is not the same as none.
    const known = Boolean(m.fetchedAt);
    const mine = (snap.tickets ?? []).filter((t) => t.host === m.host);
    parts[`needs:tickets:${m.host}`] = known ? ticketNeeds(mine, snap.asks) : null;
    parts[`stuck:${m.host}`] = known ? Object.fromEntries(mine.filter((t) => t.status === 'stuck').map((t) => [`stuck:${t.id}:${t.stuckAt}`,
      { head: `${who(t)} is stuck · ${t.label || t.id}`, body: clip(t.reason || 'The dispatcher gave up on it.', 200), who: whose(t) }])) : null;
    parts[`ci:${m.host}`] = known && ghOk ? Object.fromEntries(mine.filter((t) => t.live && t.pr?.ci?.fail?.length).map((t) => [`ci:${t.id}:${t.pr.number}`,
      { head: `An orc attacks ${who(t)} · ${t.label || t.id}`, body: clip(`CI failing on PR #${t.pr.number}: ${t.pr.ci.fail.join(', ')}`, 200), who: whose(t) }])) : null;
    parts[`merge:${m.host}`] = known ? Object.fromEntries(mine.filter((t) => t.status === 'merged' && now - ms(t.mergedAt) < MERGE_FRESH_MS).map((t) => [t, mergeRealm(snap, t, m.name)]).map(([t, realm]) => [`merged:${t.id}`,
      { head: `${who(t)} merged ${t.label || t.id} · ${realm[0]}`, body: clip(t.title || `PR #${t.prNumber}`, 200), cue: realm[1], who: whose(t) }])) : null;
  }
  parts['needs:asks'] = snap.asks ? askNeeds(snap) : null;
  for (const m of snap.sessions?.machines ?? []) parts[`needs:sessions:${m.host}`] = m.rows ? sessionNeeds(m, snap.sessions.handled) : null;
  const machines = Object.fromEntries((snap.machines ?? []).map((m) => [m.host, { name: m.name, ok: m.ok, paused: m.paused || null, error: m.error }]));
  return { gen: snap.generatedAt, parts, machines, main: snap.main ?? { status: 'unknown' } };
}

// Every item of one kind across parts, keyed.
function union(parts, kind) {
  const out = new Map();
  for (const [name, items] of Object.entries(parts)) {
    if (items && name.startsWith(`${kind}:`)) for (const [k, it] of Object.entries(items)) out.set(k, it);
  }
  return out;
}

// The state after the first read: everything as it stands, nothing announced.
function baseline(cur, now) {
  const red = cur.main.status === 'red';
  return {
    gen: cur.gen,
    parts: cur.parts,
    down: Object.fromEntries(Object.entries(cur.machines).map(([h, m]) => [h, m.ok ? 0 : 2])),
    paused: Object.fromEntries(Object.entries(cur.machines).map(([h, m]) => [h, m.paused])),
    main: { status: cur.main.status, sha: cur.main.sha ?? null, since: cur.main.since ?? null, hornAt: red ? now : 0 },
    firstSeen: Object.fromEntries([...union(cur.parts, 'needs').keys()].map((k) => [k, now])),
    remindAt: now,
  };
}

// Each part kind's event switch and cue; a merge item carries its realm's own cue.
const KIND = { needs: 'needs', stuck: 'trouble', ci: 'ci', merge: 'merge' };
const CUE = { needs: 'needs', stuck: 'trouble', ci: 'ci' };

export function step(prev, snap, now, { reminderMinutes = 30 } = {}) {
  const cur = facts(snap, now);
  if (!prev) return { state: baseline(cur, now), events: [] };
  const events = [];
  const newGen = cur.gen !== prev.gen;
  const parts = {};
  for (const [name, items] of Object.entries(cur.parts)) parts[name] = items ?? prev.parts[name] ?? null;

  for (const kind of ['needs', 'stuck', 'ci', 'merge']) {
    const before = union(prev.parts, kind);
    const fired = new Set();
    for (const [name, items] of Object.entries(parts)) {
      if (!items || !name.startsWith(`${kind}:`) || !prev.parts[name]) continue;
      for (const [k, it] of Object.entries(items)) {
        if (before.has(k) || fired.has(k)) continue;
        fired.add(k);
        events.push({ kind: KIND[kind], cue: it.cue ?? CUE[kind], head: it.head, body: it.body, key: k, who: it.who ?? null });
      }
    }
  }

  // Machines: out of reach for two fresh snapshots in a row, or newly paused.
  const down = {}, paused = {};
  for (const [h, m] of Object.entries(cur.machines)) {
    const was = prev.down[h] ?? 0;
    down[h] = m.ok ? 0 : newGen ? was + 1 : was;
    if (down[h] === 2 && was === 1) events.push({ kind: 'trouble', cue: 'trouble', head: `${m.name} is out of reach`, body: clip(m.error || 'The board could not reach it twice in a row.', 200), key: `down:${h}`, who: { host: h, name: m.name } });
    paused[h] = m.paused;
    if (m.paused && !prev.paused[h] && Object.hasOwn(prev.paused, h)) events.push({ kind: 'trouble', cue: 'trouble', head: `${m.name} is paused`, body: clip(m.paused, 200), key: `paused:${h}`, who: { host: h, name: m.name } });
  }

  // main: unknown (the watcher's file missing or stale) says nothing, so the last known state stands.
  let main = prev.main;
  const mm = cur.main;
  if (mm.status === 'red') {
    const fresh = prev.main.status !== 'red' || prev.main.sha !== mm.sha;
    if (fresh || now - prev.main.hornAt >= HORN_REPEAT_MS) {
      const failing = mm.failing?.length ? ` Failing: ${mm.failing.join(', ')}.` : '';
      events.push({ kind: 'mainRed', cue: 'main-red', key: `red:${mm.sha}`,
        head: fresh ? 'Orcs at the gates: main is red' : `Main is still red, ${dur(now - ms(mm.since ?? prev.main.since))}`,
        body: clip(`${mm.title ? `Since ${mm.title}.` : ''}${failing}`, 200) || 'See the board for the failing run.' });
      main = { status: 'red', sha: mm.sha, since: mm.since ?? null, hornAt: now };
    } else main = { ...prev.main, since: mm.since ?? prev.main.since ?? null };
  } else if (mm.status === 'green') {
    if (prev.main.status === 'red') events.push({ kind: 'mainGreen', cue: 'main-green', head: 'Main is green again', body: 'The orcs are fleeing.', key: `green:${mm.sha}` });
    main = { status: 'green', sha: mm.sha ?? null, hornAt: 0 };
  }

  // What waits on the owner now, when each item began, and a reminder every reminderMinutes while anything does. A new
  // needs event restarts the clock, so a reminder never follows hard on the bell.
  const waiting = union(parts, 'needs');
  const firstSeen = {};
  for (const k of waiting.keys()) firstSeen[k] = prev.firstSeen[k] ?? now;
  let remindAt = prev.remindAt;
  if (!waiting.size || events.some((e) => e.kind === 'needs')) remindAt = now;
  else if (now - remindAt >= reminderMinutes * 60_000) {
    const since = (k, it) => (Number.isFinite(ms(it.since)) ? ms(it.since) : firstSeen[k]);
    const [k0, oldest] = [...waiting].sort(([ka, a], [kb, b]) => since(ka, a) - since(kb, b))[0];
    const n = waiting.size;
    events.push({ kind: 'reminder', cue: 'reminder', key: 'reminder', head: `${n} ${n === 1 ? 'thing waits' : 'things wait'} on you`,
      body: clip(`Oldest, for ${dur(now - since(k0, oldest))}: ${oldest.head}`, 200), who: oldest.who ?? null });
    remindAt = now;
  }

  events.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { state: { gen: cur.gen, parts, down, paused, main, firstSeen, remindAt }, events, waiting: waiting.size };
}
