// The one worker count the board shows everywhere (sidebar, phone bar, Queue, Fleet): slots in use over capacity.
// In use is every holder of a regular slot, as the dispatcher counts them: a queue worker that builds (not one whose
// green PR waits on a merge, parked on the reviewer's review, or waiting in its machine's wake queue) and a worker outside the
// queue that takes a slot. Sentry workers sit in their own side slots and count in neither number (on a machine with
// no Sentry slots they build in, and count as, regular slots). Capacity is each
// machine's maxWorkers plus its burst slots while they are open. When in use passes capacity, `over` says by how much.
// Loaded by page.html as a plain script (forgeSlots on window) and by board.mjs and the tests through require/import.
(function (root) {
  const holdsRegularSlot = (t) => Boolean(t.live) && !t.sentry
    && (t.adhoc ? t.takesSlot === true : t.status !== 'merge-asked' && !t.parked && !t.waitingForSlot);

  // The burst slots open on a machine now, by the dispatcher's own rule (dispatcher.mjs burstState): burstWorkers extra
  // slots while the 5-minute load per core is under burstLoadPerCore (else half of maxLoadPerCore, else 0.75) and at
  // least burstMinMemoryFreePercent of memory is free (else twice minMemoryFreePercent, else 40). A wound-down machine
  // (maxWorkers 0) or an unreadable load or memory opens none.
  function burstOpen(host = {}, cfg = {}, load = null, memFreePercent = null) {
    const extra = host.burstWorkers ?? 0;
    if (!(extra > 0) || host.maxWorkers === 0 || !load || !load.cores || load.avg5 == null || memFreePercent == null) return 0;
    const perCore = host.maxLoadPerCore ?? cfg.maxLoadPerCore ?? load.maxPerCore ?? null;
    const minFree = host.minMemoryFreePercent ?? cfg.minMemoryFreePercent ?? null;
    const burstPerCore = host.burstLoadPerCore ?? cfg.burstLoadPerCore ?? (perCore ? perCore / 2 : 0.75);
    const burstFree = host.burstMinMemoryFreePercent ?? cfg.burstMinMemoryFreePercent ?? (minFree ? minFree * 2 : 40);
    return load.avg5 < burstPerCore * load.cores && memFreePercent >= burstFree ? extra : 0;
  }

  // One machine's count: { host, used, cap, over }. A machine with no Sentry slots builds Sentry tickets in its regular
  // slots, so there they count like any other.
  function machineSlots(snapshot, m) {
    const noSentry = !(Number(m.sentryWorkers) > 0);
    const used = (snapshot.tickets || []).filter((t) => t.host === m.host && holdsRegularSlot(noSentry && t.sentry ? { ...t, sentry: false } : t)).length;
    const cap = (Number(m.maxWorkers) || 0) + (Number(m.burstOpen) || 0);
    return { host: m.host, used, cap, over: Math.max(0, used - cap) };
  }

  // The fleet's count: { used, cap, over, text, machines: [machineSlots...] }. text is the one wording, "18 of 17 slots".
  function forgeSlots(snapshot) {
    const machines = (snapshot?.machines || []).map((m) => machineSlots(snapshot, m));
    const used = machines.reduce((n, m) => n + m.used, 0);
    const cap = machines.reduce((n, m) => n + m.cap, 0);
    return { used, cap, over: Math.max(0, used - cap), text: `${used} of ${cap} slots`, machines };
  }

  const api = { forgeSlots, machineSlots, holdsRegularSlot, burstOpen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
