// realm-view.js: the snapshot the two Middle-earth views draw. drawSnap() returns the board's own snapshot unless its
// realms spread (snap.config.spread: one computer fills the whole map, realm-spread.mjs). Then each realm a machine
// holds (snap.config.spreadRealms[host], its own realm first) is drawn as a machine of its own: its own host id (the
// machine's own for its first realm, host~key for the others), a share of the machine's worker and Sentry slots (the
// shares add up to the machine's own), the tickets the board gave that realm (tickets[].realm), and the real machine's
// health. Only the drawing sees these: the Queue, Machines, Worktrees, Sessions and Gollum views, the session panel and
// the herald keep the real snapshot. The bridges back to the real machine: a call names the real host, so drawWho finds
// the worker's realm; Gollum and machine calls stay with the machine's own id, its first realm; the out-of-reach note
// shows on the first realm only (echo marks the others); merges keep the realm their worker sat in.
const RV = { src: null, out: null };

function drawSnap() {
  const s = snap;
  if (!s?.config?.spread || !s.config.spreadRealms) return s;
  if (RV.src === s) return RV.out;
  const by = s.config.spreadRealms;
  const many = (host) => (by[host]?.length ?? 0) > 1;
  const vhost = (host, key) => (!key || !many(host) || by[host][0].key === key ? host : `${host}~${key}`);
  const realms = { ...(s.config.realms ?? {}) };
  const machines = [];
  for (const m of s.machines) {
    if (!many(m.host)) { machines.push(m); continue; }
    const list = by[m.host];
    const share = (n, i) => Math.floor((n || 0) / list.length) + (i < (n || 0) % list.length ? 1 : 0);
    list.forEach((r, i) => {
      const host = vhost(m.host, r.key);
      realms[host] = r;
      machines.push({ ...m, host, realHost: m.host, echo: i > 0, maxWorkers: share(m.maxWorkers, i), sentryWorkers: share(m.sentryWorkers, i) });
    });
  }
  const tickets = s.tickets.map((t) => (many(t.host) && t.realm ? { ...t, host: vhost(t.host, t.realm), realHost: t.host } : t));
  RV.src = s;
  RV.out = { ...s, machines, tickets, config: { ...s.config, realms } };
  return RV.out;
}

// The real machine behind a drawn one.
const realHostOf = (host) => drawSnap()?.machines.find((m) => m.host === host)?.realHost ?? host;

// A call (scene-call.js, scene2-call.js) names the real host. A ticket's worker is found in the realm it sits in;
// a session or a machine stays with the machine's own id, its first realm.
function drawWho(w) {
  if (!w?.id || !snap?.config?.spread) return w;
  const t = drawSnap().tickets.find((x) => x.id === w.id && (x.realHost ?? x.host) === w.host);
  return t && t.host !== w.host ? { ...w, host: t.host } : w;
}
