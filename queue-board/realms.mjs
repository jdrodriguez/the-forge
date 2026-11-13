// realms.mjs: which Middle-earth realm each queue machine is drawn as. There are four realms, each with its own folk:
// Rivendell (elves), the Shire (hobbits), Erebor (dwarves) and Rohan (Men). queueBoard.realms maps a host to a realm
// key. With no map, the enabled hosts take the four realms in that order. A host with no realm (a fifth machine, or one
// the map leaves out) is drawn as Men under its own name: the side view gives it Rohan's ground and the map Gondor's
// fields. The board sends the table to the page as snap.config.realms ({ host: { key, name, folk } }).

export const REALM_KINDS = {
  rivendell: { key: 'rivendell', name: 'Rivendell', folk: 'elf' },
  shire: { key: 'shire', name: 'The Shire', folk: 'hobbit' },
  erebor: { key: 'erebor', name: 'Erebor', folk: 'dwarf' },
  rohan: { key: 'rohan', name: 'Rohan', folk: 'man' },
};
export const REALM_ORDER = Object.keys(REALM_KINDS);

// Whether a config value names a realm. Only the table's own keys count, so a name every object inherits
// ("constructor", "toString") is no realm.
export const isRealm = (k) => typeof k === 'string' && Object.hasOwn(REALM_KINDS, k);

// The realm key each enabled host holds. queueBoard.realms gives them, for the enabled hosts it names with a known key;
// a host it leaves out, or names with an unknown key, holds none. With no map the enabled hosts take REALM_ORDER in
// order, and so they do with spread on when the map gives no enabled host a realm (one computer whose map names only
// other machines would otherwise draw one realm).
export function heldRealms(hosts, configured, { spread = false } = {}) {
  const list = hosts ?? [];
  const inOrder = () => Object.fromEntries(list.slice(0, REALM_ORDER.length).map((h, i) => [h, REALM_ORDER[i]]));
  if (!configured || typeof configured !== 'object') return inOrder();
  const held = Object.fromEntries(Object.entries(configured).filter(([h, k]) => list.includes(h) && isRealm(k)));
  return spread && !Object.keys(held).length ? inOrder() : held;
}

// The table the page reads, { host: { key, name, folk } }: the realms the enabled hosts hold. A host without one is
// drawn as the fallback.
export function realmTable(hosts, configured, { spread = false } = {}) {
  return Object.fromEntries(Object.entries(heldRealms(hosts, configured, { spread })).map(([h, k]) => [h, { ...REALM_KINDS[k] }]));
}
