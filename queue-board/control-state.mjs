// control-state.mjs: what GET /api/control answers, for the Fleet view's levers (control.mjs). Only the values the
// levers set, the fleet defaults a machine falls back to, the running timers, the newest log lines and the tickets
// waiting for a slot. Never a *Note field (a note may name an account by email) and never an email: accounts go by
// letter, their plans come from the snapshot the page already has, and noEmails masks any address in free text.
import fs from 'node:fs';
import path from 'node:path';
import { getAt, EMAIL } from './control-config.mjs';
import { knownAccounts, drainedOf, fableNow } from './control-ops.mjs';
import { NUMBERS, SWITCHES, MODELS, SIZE_MODELS, EFFORTS, SIZES, ENGINES, enginesOf } from './control-ops-fleet.mjs';
import { pendingTimers } from './control-log.mjs';

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// Every string in v with each email address in it masked, so no reason or log line can carry one to the page.
const mask = (x) => x.replace(EMAIL, '[email]');
export const noEmails = (v) => JSON.parse(JSON.stringify(v ?? null, (k, x) => {
  if (typeof x === 'string') return mask(x);
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.entries(x).map(([key, y]) => [mask(key), y]));
  return x;
}));

// Every machine's wake queue: from the snapshot (each machine's state, fresh to the minute) and, for a machine the
// snapshot could not read, from its heartbeat (as of its last tick). Each row says where it came from.
// A machine the snapshot read has its whole queue in it, so its heartbeat (older) is not read.
export function waitingTickets(dir, snap, ticket = /^[A-Z][A-Z0-9]*-\d+$/) {
  const rows = [];
  const seen = new Set();
  for (const t of snap?.tickets ?? []) {
    if (!t.waitingForSlot) continue;
    seen.add(t.id);
    rows.push({ id: t.id, host: t.host, since: t.waitingForSlot.since, reason: t.waitingForSlot.reason, pool: t.waitingForSlot.pool ?? 'regular', from: 'state' });
  }
  let files = [];
  try {
    files = fs.readdirSync(path.join(dir, 'heartbeats')).filter((f) => f.endsWith('.json'));
  } catch { /* no heartbeats yet */ }
  const reached = new Set((snap?.machines ?? []).filter((m) => m.ok).map((m) => m.host));
  for (const f of files) {
    const beat = readJson(path.join(dir, 'heartbeats', f));
    if (reached.has(beat?.host ?? f.slice(0, -5))) continue;
    for (const w of beat?.wakeQueue ?? []) {
      if (seen.has(w.id) || !ticket.test(w.id ?? '')) continue;
      seen.add(w.id);
      rows.push({ id: w.id, host: beat.host ?? f.slice(0, -5), since: w.since, reason: w.reason, pool: w.pool ?? 'regular', from: 'heartbeat', beatAt: beat.at });
    }
  }
  return rows.sort((a, b) => String(a.since).localeCompare(String(b.since)));
}

// Each machine's heartbeat, cut to what the view shows (accountsWorking carries emails and is left out).
function beatOf(dir, host) {
  const b = readJson(path.join(dir, 'heartbeats', `${host}.json`));
  return b ? { at: b.at, paused: Boolean(b.paused), room: b.room ?? null, sentryRoom: b.sentryRoom ?? null } : null;
}

export function controlState({ cfg, dir, log, snap, ctx, here, ticket }) {
  const hosts = (cfg.enabledHosts ?? []).filter((h) => cfg.hosts?.[h]).map((host) => {
    const h = cfg.hosts[host];
    return {
      host,
      platform: h.platform ?? null,
      maxWorkers: h.maxWorkers ?? 0,
      sentryWorkers: h.sentryWorkers ?? 0,
      burstWorkers: h.burstWorkers ?? 0,
      drained: drainedOf(h),
      accounts: h.accounts ?? null,
      fallbackAccounts: h.fallbackAccounts ?? [],
      spare: ctx.spareOn?.(host) ?? null,
      maxLoadPerCore: h.maxLoadPerCore ?? null,
      minMemoryFreePercent: h.minMemoryFreePercent ?? null,
      beat: beatOf(dir, host),
    };
  });
  const known = knownAccounts(cfg, ctx);
  let wakeRequests = [];
  try {
    wakeRequests = fs.readdirSync(path.join(dir, 'wake-requests')).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter((n) => ticket.test(n));
  } catch { /* none recorded yet */ }
  const keep = (e) => ({ id: e.id, at: e.at, kind: e.kind, by: e.by, op: e.op ?? null, args: e.args ?? null, target: e.target, from: e.from, to: e.to,
    says: e.says ?? null, why: e.why ?? null, until: e.until ?? null, revertTo: e.revertTo, ref: e.ref ?? null, reason: e.reason ?? null, ticket: e.ticket ?? null, host: e.host ?? null });
  return noEmails({
    at: new Date(ctx.now).toISOString(),
    here,
    hosts,
    defaults: { maxLoadPerCore: cfg.maxLoadPerCore ?? null, minMemoryFreePercent: cfg.minMemoryFreePercent ?? null, workerCap: cfg.workerCap ?? null },
    accounts: known.map((label) => ({
      label,
      on: hosts.filter((h) => (h.accounts ?? []).includes(label)).map((h) => h.host),
      burn: (cfg.burnAccounts ?? []).includes(label),
      burnUntil: cfg.burnUntil?.[label] ?? null,
      fable: fableNow(cfg, label, ctx.now),
      out: cfg.accountsOut?.[label] ?? null,
      workerCap: cfg.workerCapByAccount?.[label] ?? null,
    })),
    numbers: Object.fromEntries(Object.entries(NUMBERS).map(([k, s]) => [k, { value: getAt(cfg, k.split('.')) ?? null, min: s.min, max: s.max, nullable: Boolean(s.nullable) }])),
    switches: Object.fromEntries(Object.keys(SWITCHES).map((k) => [k, getAt(cfg, k.split('.')) === true])),
    engines: { list: enginesOf(cfg), prefer: cfg.externalBuilders?.fallback?.prefer ?? [] },
    model: { model: cfg.model ?? null, fallback: cfg.modelFallback ?? null, effort: cfg.effort ?? null, bySize: cfg.modelBySize ?? {} },
    choices: { models: MODELS, sizeModels: SIZE_MODELS, efforts: EFFORTS, sizes: SIZES, engines: ENGINES },
    timers: pendingTimers(log).map(keep),
    log: log.slice(-120).reverse().map(keep),
    waiting: waitingTickets(dir, snap, ticket),
    wakeRequests,
  });
}
