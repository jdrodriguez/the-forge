// realm-spread.mjs: which realm each worker sits in. Normally a worker sits in its machine's realm (realms.mjs). With
// spread realms on (queueBoard.spreadRealms: "auto" turns it on when exactly one host is enabled), a machine also holds
// the realms no machine holds, so one computer fills the whole map: each worker takes, when its ticket starts, the
// realm of its machine with the fewest live workers, keeps it for the ticket's life, and keeps it after the merge. The
// board stores what it gave in <stateDir>/queue-board-realms.json and sends it as tickets[].realm (a realm key).
import { REALM_ORDER, heldRealms } from './realms.mjs';

// How long a ticket's realm is kept after the board last saw the ticket: longer than any ticket shows (7 days stuck).
export const KEEP_MS = 8 * 24 * 3600_000;

// Whether realms spread: true, false, or "auto" (the default), which is on when exactly one host is enabled.
export function spreadOn(setting, hosts) {
  if (setting === true || setting === false) return setting;
  return (hosts ?? []).length === 1;
}

// { host: [realm keys] }. Off: each host its own realm, if it has one. On: each host its own realm first, then the
// realms no host holds, dealt in REALM_ORDER round the hosts that have a realm, in host order. A host with no realm
// (a fifth machine) gets none either way.
export function realmsByHost(hosts, configured, spread) {
  // Only enabled hosts hold a realm: one the config names for a host that is not enabled is free to spread into.
  const own = heldRealms(hosts, configured, { spread });
  const out = Object.fromEntries((hosts ?? []).map((h) => [h, own[h] ? [own[h]] : []]));
  if (!spread) return out;
  const held = new Set(Object.values(own));
  const takers = (hosts ?? []).filter((h) => out[h].length);
  REALM_ORDER.filter((k) => !held.has(k)).forEach((k, i) => { if (takers.length) out[takers[i % takers.length]].push(k); });
  return out;
}

const keyOf = (t) => `${t.host}/${t.id}`;
// A worker in the regular slots, the Sentry slots, or outside the queue: each is balanced on its own.
const laneOf = (t) => (t.adhoc ? 'adhoc' : t.sentry ? 'sentry' : 'regular');

// Sets t.realm on every ticket and returns the new memory ({ key: { realm, seen } }). A remembered realm the machine
// still holds stays, however long ago it was given while the ticket still shows (a board stopped for days and started
// again keeps it); one the board no longer sees is forgotten after KEEP_MS. A live ticket with none takes its machine's realm with the fewest live workers in its lane (the
// earlier realm in the machine's list on a tie), the oldest dispatch first. A ticket the board never saw live (a merge
// from before) takes its machine's first realm. now is a number of ms.
export function assignRealms(tickets, byHost, memory = {}, now = Date.now()) {
  const shown = new Set(tickets.map(keyOf));
  const next = {};
  for (const [k, v] of Object.entries(memory ?? {})) if (shown.has(k) || now - (v?.seen ?? 0) < KEEP_MS) next[k] = v;
  const realmsOf = (t) => (Object.hasOwn(byHost, t.host) ? byHost[t.host] : []);
  const count = new Map();
  const bump = (t, realm) => { const c = `${t.host}|${laneOf(t)}|${realm}`; count.set(c, (count.get(c) ?? 0) + 1); };
  const order = [...tickets].sort((a, b) => (a.dispatchedAt || '').localeCompare(b.dispatchedAt || ''));
  const kept = (t) => { const m = Object.hasOwn(next, keyOf(t)) ? next[keyOf(t)] : null; return m && realmsOf(t).includes(m.realm) ? m.realm : null; };
  for (const t of order) if (t.live && kept(t)) bump(t, kept(t));
  for (const t of order) {
    const mine = realmsOf(t);
    let realm = kept(t);
    if (!realm && t.live && mine.length) {
      const load = (k) => count.get(`${t.host}|${laneOf(t)}|${k}`) ?? 0;
      realm = mine.reduce((best, k) => (load(k) < load(best) ? k : best), mine[0]);
      bump(t, realm);
    }
    realm ??= mine[0] ?? null;
    t.realm = realm;
    if (realm) next[keyOf(t)] = { realm, seen: now };
  }
  return next;
}
