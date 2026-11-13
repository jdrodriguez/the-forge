// page-probe.js: evaluated in the board's page by page.test.mjs (an expression whose promise resolves to JSON-able data).
// It reports what the open view drew: the realms, which worker stands at which realm's station, whether the frame clock
// moves, and on the map every overlap between realms, between a realm and a landmark's zone, and between a Sentry post
// and a realm.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { view, title: document.getElementById('viewTitle')?.textContent ?? null, realms: [], workers: [], clashes: [], ticks: null };
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  if (view === 'scene' && typeof sc !== 'undefined') {
    const t0 = sc.tick;
    await wait(1200);
    out.ticks = [t0, sc.tick];
    out.realms = sc.realms.map((r) => ({ host: r.m.host, kind: r.kind, title: r.title, x0: r.x0, w: r.w }));
    for (const a of sc.actors.values()) out.workers.push({ id: a.t.id, host: a.t.host, realm: a.realm?.m.host ?? null, station: a.station?.id ?? null, sentry: Boolean(a.t.sentry), adhoc: Boolean(a.t.adhoc), mood: a.mood, name: a.name });
    sc.realms.forEach((a, i) => sc.realms.slice(i + 1).forEach((b) => { if (a.x0 < b.x0 + b.w && b.x0 < a.x0 + a.w) out.clashes.push(`realm ${a.title} overlaps realm ${b.title}`); }));
  }
  if (view === 'map' && typeof m2 !== 'undefined' && m2.plan) {
    const t0 = m2.tick;
    await wait(1200);
    out.ticks = [t0, m2.tick];
    const p = m2.plan;
    out.size = [p.W, p.H];
    out.scale = m2.scale ?? null;
    const box = (r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
    out.realms = p.realms.map((r) => ({ host: r.m.host, kind: r.kind, title: r.title, edoras: r === p.edoras, ...box(r) }));
    for (const a of m2.actors.values()) out.workers.push({ id: a.t?.id, host: a.t?.host, realm: a.realm?.m?.host ?? null, station: a.station?.id ?? null, sentry: Boolean(a.t?.sentry), adhoc: Boolean(a.t?.adhoc), name: a.name ?? a.t?.nickname });
    p.realms.forEach((a, i) => p.realms.slice(i + 1).forEach((b) => { if (hit(box(a), box(b))) out.clashes.push(`realm ${a.title} overlaps realm ${b.title}`); }));
    for (const r of p.realms) if (r.x < 0 || r.y < 0 || r.x + r.w > p.W + 1 || r.y + r.h > p.H) out.clashes.push(`realm ${r.title} runs off the map`);
    for (const [k, z] of Object.entries(p.zones ?? {})) {
      if (k.startsWith('gollum:')) continue;
      for (const r of p.realms) if (hit(box(r), z)) out.clashes.push(`realm ${r.title} overlaps landmark ${k}`);
    }
    for (const s of p.stations.filter((st) => st.sentry && st.land)) {
      const post = { x0: Math.min(s.x - 3, s.hx - 6), y0: s.y - 31, x1: s.x + 8, y1: s.y + 1 };
      for (const r of p.realms) if (hit(box(r), post)) out.clashes.push(`${s.land} post ${s.id} overlaps realm ${r.title}`);
    }
    out.fits = p.fits;
  }
  return out;
})()
