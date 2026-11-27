// fleet-view.js: the Fleet view (#fleet, #fleet/<host>). The top strip says the one worker count (worker-count.js) and
// how many machines are paused or offline; under it a card per queue machine (fleet-card.js), then the accounts table
// (fleet-accounts.js). Everything comes from the snapshot, so the view is read-only: the slots, burst slots and
// accounts are set in the config's dispatcher.hosts, and a machine pauses with `dispatcher.mjs pause`. Drawn on every
// snapshot while the view is open and once when it opens (page.html's render and its view switch). Loaded after
// page.html's own script and uses its helpers: $, esc, snap, view.

function fleetTop(slots) {
  const paused = snap.machines.filter((m) => m.ok && m.paused).length;
  const down = snap.machines.filter((m) => !m.ok).length;
  const count = esc(slots.text).replace(/^(\d+ of \d+)/, '<b>$1</b>');
  const extra = [paused ? `${plural(paused, 'machine')} paused` : '', down ? `${down} offline` : ''].filter(Boolean).join(', ');
  return `<div class="ftop"><span class="cnt">${count} in use${slots.over ? `, <span class="over">${slots.over} over</span>` : ''}${extra ? `, ${esc(extra)}` : ''}</span></div>`;
}

function renderFleet() {
  const root = $('fleet');
  if (!root || view !== 'fleet') return;
  if (!snap) { root.innerHTML = '<div class="fv"><div class="empty">Reading the fleet...</div></div>'; return; }
  const slots = forgeSlots(snap);
  const cards = snap.machines.map((m) => fleetCard(m, slots)).join('');
  root.innerHTML = `<div class="fv">${fleetTop(slots)}${cards ? `<div class="fgrid">${cards}</div>` : '<div class="empty">No queue machines are enabled (dispatcher.enabledHosts).</div>'}${fleetAccounts()}</div>`;
  fleetFigures(root);
}
