// gollum-data.js: what Gollum reports, worked out once from the snapshot for the Gollum view (gollum-view.js) and for
// his figures in both Middle-earth views (scene-gollum.js, scene2-gollum.js), so all three count the same way
// (2026-11-09: one Gollum per machine, his findings in a view of their own).
// He hoards forgotten work: a worktree that no worker and no process uses, whose last commit is three days old or more
// (seven while its PR is still open). And he covets usage: a Claude account in the queue (not one the board only
// watches) that has used 90% or more of its 5-hour or weekly window, the window not yet reset. An account shows once
// however many labels and machines hold it, matched by collect.mjs's key as the Accounts card does.
// grReport() gives { at, n, hosts, ring }:
//   n      how many worktrees are forgotten across every machine;
//   hosts  one entry per machine in the snapshot's order: { host, rows, ring }, rows its forgotten worktrees oldest
//          first (each worktree row from worktree-state.mjs, with host added), ring the hot accounts signed in there;
//   ring   every hot account: { key, email, labels, windows, used, places }, windows its 5-hour and weekly windows at
//          90% or more ({ span, used, resetsAt }), used the highest of them, places [{ host, label }] where it is
//          signed in; the most used first.
// grHost(host) gives one machine's entry, or null. Worked out again when the snapshot changes and once a minute. Uses
// page.html's snap.
const GR_HOT = 90;
const GR_DAY = 864e5;
const gr = { key: '', report: null };

const grForgotten = (w, now) => !w.workers?.length && !w.procs?.length && w.lastCommitAt
  && now - Date.parse(w.lastCommitAt) >= (w.pr?.state === 'OPEN' ? 7 : 3) * GR_DAY;

function grReport() {
  const key = `${snap?.generatedAt}|${Math.floor(Date.now() / 60000)}`;
  if (gr.key === key) return gr.report;
  const now = Date.now();
  const wt = new Map((snap?.worktrees?.machines ?? []).map((m) => [m.host, m.rows ?? []]));
  const accounts = new Map();
  for (const m of snap?.machines ?? []) {
    for (const a of m.accounts ?? []) {
      if (a.error || a.signedIn === false) continue;
      const windows = [[a.fiveHour, '5-hour'], [a.weekly, 'weekly']]
        .filter(([w]) => w?.used >= GR_HOT && !(w.resetsAt && Date.parse(w.resetsAt) <= now))
        .map(([w, span]) => ({ span, used: Math.round(w.used), resetsAt: w.resetsAt ?? null }));
      const k = a.key || `${a.label}|${a.email}`;
      const acct = accounts.get(k) ?? { key: k, email: a.email ?? null, labels: [], windows: [], used: 0, places: [], readAt: '' };
      accounts.set(k, acct);
      if (!acct.labels.includes(a.label)) acct.labels.push(a.label);
      acct.places.push({ host: m.host, label: a.label });
      // The freshest reading of the account's windows wins, as on the Accounts card.
      if ((a.usageAt ?? '') >= acct.readAt) Object.assign(acct, { windows, readAt: a.usageAt ?? '' });
    }
  }
  const ring = [...accounts.values()].filter((a) => a.windows.length)
    .map((a) => ({ ...a, used: Math.max(...a.windows.map((w) => w.used)), labels: a.labels.sort() }))
    .sort((p, q) => q.used - p.used);
  const hosts = (snap?.machines ?? []).map((m) => ({
    host: m.host,
    rows: (wt.get(m.host) ?? []).filter((w) => grForgotten(w, now)).map((w) => ({ ...w, host: m.host }))
      .sort((p, q) => Date.parse(p.lastCommitAt) - Date.parse(q.lastCommitAt)),
    ring: ring.filter((a) => a.places.some((p) => p.host === m.host)),
  }));
  gr.report = { at: snap?.generatedAt ?? null, n: hosts.reduce((s, h) => s + h.rows.length, 0), hosts, ring };
  gr.key = key;
  return gr.report;
}
const grHost = (host) => grReport().hosts.find((h) => h.host === host) ?? null;
