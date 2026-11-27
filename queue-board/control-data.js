// control-data.js: the Fleet view's plumbing for its levers. It reads /api/control for what each lever is set to, sends one
// named operation at a time (the server checks and applies it: control.mjs), and owns the three pieces every section
// shares: steppers that wait a moment after the last click and then send once, a confirmation for big moves with an
// optional end time, and a toast after each change with Undo and Ends. fleet-card.js, fleet-accounts.js and
// control-fleet.js draw the sections; renderControl here puts them together. Loaded after page.html's own script and
// uses its helpers: $, esc, dur, ms, ago, snap, view, realmName, sigil, machineColor, holdsSlot.
const ctl = { data: null, error: null, loading: false, steps: new Map(), toast: null, toastTimer: null, dialog: null, polled: 0 };

async function ctlLoad() {
  if (ctl.loading) return;
  ctl.loading = true;
  try {
    const r = await fetch('/api/control', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    ctl.data = await r.json();
    ctl.error = null;
  } catch (e) {
    ctl.error = e.message;
  }
  ctl.loading = false;
  ctl.polled = Date.now();
  renderControl();
}
// Sends one operation. A change answers with its log entry, which the toast offers to undo or give an end time; a
// refusal shows the server's words, and one that says the value moved underneath reloads what the page shows.
async function ctlSend(body, { label = null } = {}) {
  let out;
  try {
    const r = await fetch('/api/control', { method: 'POST', headers: { 'X-Board': 'control', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    out = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  } catch (e) {
    out = { ok: false, error: `the board did not answer (${e.message})` };
  }
  if (out.state) ctl.data = out.state;
  if (!out.ok) {
    ctlToast({ text: out.error || 'refused', bad: true });
    if (out.current !== undefined || /changed/.test(out.error || '')) ctlLoad();
  } else {
    const all = out.entries || [];
    const e = all.at(-1);
    const undoable = all.length === 1 && e.kind === 'change' && !['undo', 'end', 'keep', 'until'].includes(body.op);
    ctlToast({ text: label || (all.length ? all.map(ctlSaid).join('; ') : 'Done'), entry: undoable ? e : null, until: e?.until || null });
    // The snapshot follows the change on its next poll; ask now so the live counts catch up sooner.
    if (typeof schedule === 'function') schedule(1500);
  }
  renderControl();
  return out;
}

// A change in words for the toast (ctlHuman, control-fleet.js). Config changes take effect on each machine's next tick; a
// pause acts at once.
function ctlSaid(e) {
  const what = typeof ctlHuman === 'function' ? ctlHuman(e) : cap(e.says || 'done');
  return e.kind === 'change' && e.op !== 'pause' ? `${what}, from the next tick` : what;
}

// --- end times ------------------------------------------------------------------------------------------------
// The presets the confirmation and the Ends dialog offer, in this browser's own time.
function ctlUntilChoices() {
  const at = (h, m = 0, days = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
  const plus = (hours) => new Date(Date.now() + hours * 3.6e6);
  const tonight = at(23);
  const morning = at(9, 0, 1);
  const out = [['', 'No end'], ['1h', 'For 1 hour', plus(1)], ['3h', 'For 3 hours', plus(3)], ['8h', 'For 8 hours', plus(8)]];
  if (tonight - Date.now() > 3.6e6) out.push(['tonight', 'Until 11 PM tonight', tonight]);
  out.push(['morning', 'Until 9 AM tomorrow', morning], ['custom', 'Until a time I pick']);
  return out;
}
const ctlLeft = (iso) => { const m = Date.parse(iso) - Date.now(); return m > 0 ? dur(m) : 'now'; };
const ctlClock = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// --- the dialog: a confirmation for a big move, or an end time for a change already made ----------------------------
// `text` is HTML the sections build with every value escaped; ctlAttr puts such HTML into a data attribute.
const ctlAttr = (html) => esc(html);
function ctlDialog({ title, text, body, go = 'Confirm', danger = false, timed = true, why = true, extra = null, onlyUntil = null }) {
  const el = $('ctlDialog');
  const choices = ctlUntilChoices().filter(([k]) => !onlyUntil || k);
  el.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="ctlDlgT"><h3 id="ctlDlgT">${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
    ${extra ? `<label class="check"><input type="checkbox" id="ctlDlgExtra"${extra.checked ? ' checked' : ''}> ${esc(extra.label)}</label>` : ''}
    ${timed ? `<label>Ends<select id="ctlDlgUntil">${choices.map(([k, t, d]) => `<option value="${k}">${esc(t)}${d ? ` (${esc(ctlClock(d.toISOString()))})` : ''}</option>`).join('')}</select></label>
    <label id="ctlDlgCustomL" hidden>Ends at<input type="datetime-local" id="ctlDlgCustom"></label>` : ''}
    ${why ? '<label>Why (goes into the config note and the change log; no email addresses)<input type="text" id="ctlDlgWhy" maxlength="140" placeholder="optional"></label>' : ''}
    <div class="cacts"><button class="cbtn" type="button" data-dlg="cancel">Cancel</button><button class="cbtn ${danger ? 'warn' : 'go'}" type="button" data-dlg="go">${esc(go)}</button></div></div>`;
  el.hidden = false;
  ctl.dialog = { body, extra, onlyUntil, extraChecked: Boolean(extra?.checked) };
  el.querySelector('[data-dlg="go"]').focus();
}
function ctlDialogUntil() {
  const pick = $('ctlDlgUntil')?.value;
  if (!pick) return null;
  if (pick === 'custom') {
    const v = $('ctlDlgCustom').value;
    return v ? new Date(v).toISOString() : undefined;
  }
  return ctlUntilChoices().find(([k]) => k === pick)?.[2]?.toISOString() ?? null;
}
function ctlDialogGo() {
  const d = ctl.dialog;
  const until = ctlDialogUntil();
  if (until === undefined) return ctlToast({ text: 'Pick the time it ends', bad: true });
  const why = $('ctlDlgWhy')?.value.trim() || undefined;
  ctlDialogClose();
  if (d.onlyUntil) return ctlSend({ op: 'until', id: d.onlyUntil, until }, { label: `Ends ${ctlClock(until)}` });
  const body = typeof d.body === 'function' ? d.body(Boolean(d.extraChecked)) : d.body;
  return ctlSend({ ...body, ...(until ? { until } : {}), ...(why ? { why } : {}) });
}
function ctlDialogClose() {
  $('ctlDialog').hidden = true;
  ctl.dialog = null;
}

// --- the toast --------------------------------------------------------------------------------------------------
function ctlToast({ text, bad = false, entry = null, until = null }) {
  ctl.toast = { text, bad, entry, until };
  clearTimeout(ctl.toastTimer);
  ctl.toastTimer = setTimeout(() => { ctl.toast = null; ctlToastPaint(); }, bad ? 9000 : 12000);
  ctlToastPaint();
}
function ctlToastPaint() {
  const el = $('ctlToast');
  const t = ctl.toast;
  el.hidden = !t;
  if (!t) return;
  el.className = `ctoast${t.bad ? ' bad' : ''}`;
  el.innerHTML = `<span role="status">${esc(t.text)}${t.until ? `, until ${esc(ctlClock(t.until))}` : ''}</span>`
    + (t.entry ? `<button type="button" data-toast="undo">Undo</button>${t.entry.op === 'pause' && !t.entry.to ? '' : `<button type="button" data-toast="ends">${t.until ? 'Change end' : 'Ends...'}</button>`}` : '')
    + '<button type="button" data-toast="close" aria-label="Close">Close</button>';
}

// --- steppers ---------------------------------------------------------------------------------------------------
// A stepper keeps the clicks for 0.9 seconds and sends one change with the value the page showed first as `expect`,
// so three quick clicks are one write and one note line, and a value someone else changed meanwhile is refused.
// `fleet` is the fleet-wide value a none stands for (an account's worker cap): stepping starts from it, and reaching it
// again sets none, so the account follows the fleet's value from then on.
const ctlStep = (key, body, value, { min = 0, max = 99, none = null, title = '', fleet = null } = {}) => {
  const s = ctl.steps.get(key);
  const v = s ? s.value : value;
  const shown = v === null ? `<span class="none">${esc(none ?? 'none')}</span>` : esc(v);
  return `<span class="step${s ? ' pending' : ''}" data-step="${esc(key)}" data-body="${esc(JSON.stringify(body))}" data-v="${esc(JSON.stringify(value))}" data-min="${min}" data-max="${max}"${fleet !== null ? ` data-fleet="${fleet}"` : ''} title="${esc(title)}">`
    + `<button type="button" data-d="-1" aria-label="Lower" ${v !== null && v <= min ? 'disabled' : ''}>&minus;</button><output>${shown}</output>`
    + `<button type="button" data-d="1" aria-label="Raise" ${v !== null && v >= max ? 'disabled' : ''}>+</button></span>`;
};
function ctlStepClick(stepEl, d) {
  const key = stepEl.dataset.step;
  const base = JSON.parse(stepEl.dataset.v);
  const min = Number(stepEl.dataset.min), max = Number(stepEl.dataset.max);
  const s = ctl.steps.get(key) ?? { base, value: base, body: JSON.parse(stepEl.dataset.body) };
  const fleet = stepEl.dataset.fleet != null ? Number(stepEl.dataset.fleet) : null;
  let next = Math.min(max, Math.max(min, (s.value ?? fleet ?? min) + d));
  if (fleet !== null && next === fleet) next = null;
  s.value = next;
  clearTimeout(s.timer);
  ctl.steps.set(key, s);
  s.timer = setTimeout(() => {
    ctl.steps.delete(key);
    if (JSON.stringify(s.value) === JSON.stringify(s.base)) return renderControl();
    ctlSend({ ...s.body, value: s.value, expect: s.base });
  }, 900);
  renderControl();
}

// --- one click handler for the whole view -----------------------------------------------------------------------
// [data-ctl] holds an operation to send; with data-confirm it opens the dialog first. [data-step] is a stepper.
document.addEventListener('click', (e) => {
  const tb = e.target.closest('[data-toast]');
  if (tb) {
    const t = ctl.toast;
    if (tb.dataset.toast === 'undo' && t?.entry) ctlSend({ op: 'undo', id: t.entry.id }, { label: 'Undone' });
    if (tb.dataset.toast === 'ends' && t?.entry) ctlDialog({ title: 'When should this end by itself?', text: esc(cap(t.entry.says)), body: null, go: 'Set the end', why: false, onlyUntil: t.entry.id });
    if (tb.dataset.toast === 'close' || tb.dataset.toast === 'undo') { ctl.toast = null; ctlToastPaint(); }
    return;
  }
  const db = e.target.closest('[data-dlg]');
  if (db) return db.dataset.dlg === 'go' ? ctlDialogGo() : ctlDialogClose();
  if (e.target.id === 'ctlDialog') return ctlDialogClose();
  const sb = e.target.closest('.step button');
  if (sb && sb.closest('#fleet')) return ctlStepClick(sb.closest('.step'), Number(sb.dataset.d));
  const b = e.target.closest('[data-ctl]');
  if (!b || !b.closest('#fleet') || b.disabled) return;
  const body = JSON.parse(b.dataset.ctl);
  if (b.dataset.confirm != null) {
    const extra = b.dataset.extra ? JSON.parse(b.dataset.extra) : null;
    ctlDialog({ title: b.dataset.title || 'Confirm', text: b.dataset.confirm, go: b.dataset.go || 'Confirm', danger: b.dataset.danger === '1', timed: b.dataset.timed !== '0',
      extra, body: extra ? (checked) => (checked ? { batch: [body, extra.op] } : body) : body });
    return;
  }
  ctlSend(body);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'ctlDlgUntil') $('ctlDlgCustomL').hidden = e.target.value !== 'custom';
  if (e.target.id === 'ctlDlgExtra' && ctl.dialog) ctl.dialog.extraChecked = e.target.checked;
  const sel = e.target.closest('select[data-ctl-select]');
  if (sel && sel.closest('#fleet')) {
    const value = sel.value === '' ? null : sel.dataset.num ? Number(sel.value) : sel.value;
    ctlSend({ ...JSON.parse(sel.dataset.ctlSelect), value, expect: JSON.parse(sel.dataset.v) });
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ctl.dialog) ctlDialogClose(); });

// --- the view ---------------------------------------------------------------------------------------------------
// The Fleet view: the top strip, any ticket waiting for a slot, a card per machine (fleet-card.js), the accounts table
// (fleet-accounts.js), then the fleet settings, the dispatcher logs and the change log, folded. Drawn on every snapshot
// and every /api/control answer while the view is open; /api/control is read again every 20 seconds then, and once
// when the view opens.
function renderControl() {
  const root = $('fleet');
  if (!root || view !== 'fleet') return;
  if (Date.now() - ctl.polled > 20000) ctlLoad();
  if (!ctl.data || !snap) {
    root.innerHTML = `<div class="fv"><div class="empty">${ctl.error ? `The board could not read the controls: ${esc(ctl.error)}` : 'Reading the controls...'}</div></div>`;
    return;
  }
  // Keep the open folds and the scroll across a redraw.
  const open = new Set([...root.querySelectorAll('details[open]')].map((d) => d.id));
  const slots = forgeSlots(snap);
  // A queue machine with no dispatcher.hosts entry still gets a card, without levers for its slots.
  const bare = snap.machines.filter((m) => !ctl.data.hosts.some((h) => h.host === m.host)).map((m) => ({ host: m.host, maxWorkers: m.maxWorkers ?? 0,
    sentryWorkers: m.sentryWorkers ?? 0, burstWorkers: m.burstWorkers ?? 0, drained: null, accounts: null, readOnly: true }));
  const cards = [...ctl.data.hosts, ...bare].map((h) => fleetCard(h, slots)).join('');
  root.innerHTML = `<div class="fv">${ctlTop()}${ctlWake()}${cards ? `<div class="fgrid">${cards}</div>` : '<div class="empty">No queue machines are enabled (dispatcher.enabledHosts).</div>'}`
    + `${fleetAccounts()}<div class="fmores">${ctlFleet()}${ctlLogs()}${ctlLog()}</div></div>`;
  for (const id of open) { const d = $(id); if (d) d.open = true; }
  fleetFigures(root);
}
// Read every 20 seconds while the view is open and every 2 minutes otherwise, so the sidebar's count stays true.
setInterval(() => { if (!document.hidden && (view === 'fleet' || Date.now() - ctl.polled > 120000)) ctlLoad(); }, 20000);
ctlLoad();
