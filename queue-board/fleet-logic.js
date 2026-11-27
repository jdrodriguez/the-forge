// fleet-logic.js: the Fleet view's sums, kept apart from the drawing so the tests can run them in node. Loaded by
// page.html as a plain script (the functions land on window) and by fleet-logic.test.mjs through require.
(function (root) {
  // Where a reading is the freshest of several machines' copies of one account.
  const fresher = (a, b) => String(a?.usageAt ?? '') > String(b?.usageAt ?? '');

  // One account letter across every machine: its email and plan, its freshest weekly and 5-hour reading from a machine
  // where it is signed in, and the machines it is signed out on. { email, plan, weekLeft, weekResets, fiveLeft, signedOutOn }.
  function acctReading(snapshot, label) {
    let best = null, any = null;
    const signedOutOn = [];
    for (const m of snapshot?.machines ?? []) {
      const a = (m.accounts ?? []).find((x) => x.label === label);
      if ((m.signedOut ?? []).includes(label) || a?.signedIn === false) signedOutOn.push(m.host);
      if (!a) continue;
      if (!any || (a.email && !any.email)) any = a;
      if (a.error || a.signedIn === false) continue;
      if (!best || fresher(a, best)) best = a;
    }
    const src = best ?? any;
    const left = (w) => (w?.used == null ? null : Math.max(0, Math.round(100 - w.used)));
    return {
      email: src?.email ?? null,
      plan: src?.plan ?? null,
      weekLeft: left(best?.weekly),
      weekResets: best?.weekly?.resetsAt ?? null,
      fiveLeft: left(best?.fiveHour),
      fiveLimit: Boolean(best?.fiveHour),
      signedOutOn: [...new Set(signedOutOn)],
    };
  }

  // The one mark a row carries, most urgent first: out of the queue, signed out somewhere it is used, past 90% of a
  // window (Gollum's Ring: hot is the set of labels grReport found at 90% or more). { text, sev } or null.
  function acctFlag(row, reading, hot, realm = (h) => h) {
    if (row.out) return { text: 'taken out', sev: '' };
    const out = reading.signedOutOn.filter((h) => !row.on?.length || row.on.includes(h));
    if (out.length) return { text: `signed out on ${out.map(realm).join(', ')}`, sev: 'bad' };
    if (hot?.has?.(row.label)) return { text: 'past 90%', sev: 'warn' };
    return null;
  }

  // A machine's burst slots in words, by the snapshot's burstWorkers and burstOpen (board.mjs, worker-count.js's rule).
  function burstWords(m) {
    const n = m?.burstWorkers ?? 0;
    if (!n) return 'off';
    if (m.maxWorkers === 0) return 'closed while wound down';
    if (m.burstOpen) return 'open';
    const perCore = m.load?.cores ? m.load.avg5 / m.load.cores : null;
    if (perCore == null || m.memFreePercent == null) return 'closed, no reading';
    const lim = m.load.maxPerCore ? m.load.maxPerCore / 2 : 0.75;
    if (perCore >= lim) return 'closed, load is high';
    return 'closed, memory is low';
  }

  // How long since the machine's dispatcher ticked, and its heartbeat's age only when that is stale (over twice the tick).
  function tickWords(m, now, tickMinutes, dur) {
    const parts = [m?.lastTick ? `ticked ${dur(now - Date.parse(m.lastTick))} ago` : 'never ticked'];
    const beat = m?.heartbeat?.at ? now - Date.parse(m.heartbeat.at) : null;
    if (beat != null && beat > 2 * (tickMinutes || 20) * 60000) parts.push(`heartbeat ${dur(beat)} old`);
    return parts.join(', ');
  }

  const api = { acctReading, acctFlag, burstWords, tickWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
