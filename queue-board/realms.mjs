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

// The host to realm-key map: queueBoard.realms as given, or the enabled hosts in order against REALM_ORDER.
export function realmKeys(hosts, configured) {
  if (configured && typeof configured === 'object') return { ...configured };
  return Object.fromEntries((hosts ?? []).slice(0, REALM_ORDER.length).map((h, i) => [h, REALM_ORDER[i]]));
}

// The table the page reads, { host: { key, name, folk } }, for the enabled hosts. An entry with an unknown key is left
// out, so that host is drawn as the fallback.
export function realmTable(hosts, configured) {
  return Object.fromEntries(Object.entries(realmKeys(hosts, configured))
    .filter(([h, k]) => REALM_KINDS[k] && (hosts ?? []).includes(h))
    .map(([h, k]) => [h, { ...REALM_KINDS[k] }]));
}
