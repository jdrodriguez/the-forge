// control-ops.mjs: the machine and account operations the Fleet view's levers may make to the config's dispatcher
// section (control.mjs applies them; control-ops-fleet.mjs has the fleet-wide ones). The page never sends config: it names one of these operations,
// and each one checks every field it takes, reads the value it governs, writes a new one and says what it did in the
// words the *Note fields use. Anything not in OPS is refused.
//
// An operation is a setter for one value: `target` names it ("maxWorkers:main-mac"), `read` gives it now, `write`
// sets it. That is what lets a change carry an end time: the revert reads the value again, and only puts the old one
// back while the value is still what the change set (control.mjs).
import { getAt, setAt, deleteAt, refuse, show, cleanInt, cleanNumber, cleanBool } from './control-config.mjs';
import { FLEET_OPS } from './control-ops-fleet.mjs';

const LABEL = /^[a-z]$/;
const hostOf = (b, cfg) => {
  if (typeof b.host !== 'string' || !cfg.hosts?.[b.host] || !cfg.enabledHosts?.includes(b.host)) refuse(`unknown machine ${show(b.host)}`);
  return b.host;
};
const hostKeys = (a, key) => ['hosts', a.host, key];
const sortedWith = (list, x, on) => [...new Set([...(list ?? []).filter((y) => y !== x), ...(on ? [x] : [])])].sort();

// Every account letter the config names anywhere, plus the ones the snapshot shows on a machine, used or spare.
export function knownAccounts(cfg, ctx = {}) {
  const all = new Set();
  for (const h of Object.values(cfg.hosts ?? {})) for (const l of [...(h.accounts ?? []), ...(h.fallbackAccounts ?? [])]) all.add(l);
  for (const l of [...(cfg.burnAccounts ?? []), ...(cfg.noFableAccounts ?? []), ...(cfg.fableAccounts ?? []), ...Object.keys(cfg.accountsOut ?? {})]) all.add(l);
  for (const h of cfg.enabledHosts ?? []) for (const l of [...(ctx.labelsOn?.(h) ?? []), ...(ctx.spareOn?.(h) ?? [])]) all.add(l);
  return [...all].filter((l) => LABEL.test(l)).sort();
}
const accountOf = (b, cfg, ctx) => {
  if (typeof b.account !== 'string' || !LABEL.test(b.account) || !knownAccounts(cfg, ctx).includes(b.account)) refuse(`unknown account ${show(b.account)}`);
  return b.account;
};

// Wound down for a reboot: maxWorkers, sentryWorkers and burstWorkers go to 0 and their values are kept beside them as
// <key>BeforeDrain, so bringing it back restores them.
const DRAIN = ['maxWorkers', 'sentryWorkers', 'burstWorkers'];
export const drainedOf = (h) => (h && h.maxWorkersBeforeDrain !== undefined
  ? Object.fromEntries(DRAIN.map((k) => [k, h[`${k}BeforeDrain`] ?? null])) : null);
const notDrained = (cfg, a) => {
  if (drainedOf(cfg.hosts[a.host])) refuse(`${a.host} is wound down; bring it back first`, 409);
};

// burn and Fable as the dispatcher reads them (pickAccount, workerModel): a burn account past its burnUntil no longer
// burns, and an account runs Fable when it is not in noFableAccounts and is in fableAccounts, burns, or model is fable.
const burnsNow = (cfg, l, now = Date.now()) => (cfg.burnAccounts ?? []).includes(l) && !(cfg.burnUntil?.[l] && now >= Date.parse(cfg.burnUntil[l]));
export const fableNow = (cfg, l, now) => !(cfg.noFableAccounts ?? []).includes(l)
  && ((cfg.fableAccounts ?? []).includes(l) || burnsNow(cfg, l, now) || cfg.model === 'fable');
// Puts an account's Fable switch where `on` says with the fewest list changes: on means fableAccounts and out of
// noFableAccounts; off means out of fableAccounts, and into noFableAccounts only when a burn or model fable would
// still start Fable on it.
function setFable(cfg, l, on, now) {
  const no = sortedWith(cfg.noFableAccounts, l, false);
  const yes = sortedWith(cfg.fableAccounts, l, on);
  setAt(cfg, ['noFableAccounts'], no);
  setAt(cfg, ['fableAccounts'], yes, 'noFableAccounts');
  if (!on && fableNow(cfg, l, now)) setAt(cfg, ['noFableAccounts'], sortedWith(no, l, true));
}
const dropEmpty = (cfg, key) => {
  if (cfg[key] && !Object.keys(cfg[key]).length) delete cfg[key];
};

const hostInt = (key, max, note, after = key) => ({
  args: (b, cfg) => ({ host: hostOf(b, cfg) }),
  value: (b) => cleanInt(b.value, 0, max, { name: key }),
  target: (a) => `${key}:${a.host}`,
  read: (cfg, a) => cfg.hosts[a.host][key] ?? 0,
  guard: notDrained,
  write: (cfg, a, v) => setAt(cfg, hostKeys(a, key), v, after),
  note: (a) => ({ at: hostKeys(a, note), after: key }),
  says: (a, f, t) => `${key} ${show(f)} to ${show(t)}`,
});

export const OPS = {
  maxWorkers: hostInt('maxWorkers', 24, 'maxWorkersNote'),
  sentryWorkers: hostInt('sentryWorkers', 4, 'sentryWorkersNote', 'maxWorkers'),
  burstWorkers: hostInt('burstWorkers', 8, 'burstNote', 'sentryWorkers'),

  drain: {
    args: (b, cfg) => ({ host: hostOf(b, cfg) }),
    value: (b) => cleanBool(b.value),
    target: (a) => `drain:${a.host}`,
    read: (cfg, a) => Boolean(drainedOf(cfg.hosts[a.host])),
    write: (cfg, a, on) => {
      const h = cfg.hosts[a.host];
      const parts = [];
      for (const k of DRAIN) {
        if (on) {
          parts.push(`${k} ${h[k] ?? 0} to 0`);
          setAt(cfg, hostKeys(a, `${k}BeforeDrain`), h[k] ?? null, k);
          setAt(cfg, hostKeys(a, k), 0, 'maxWorkers');
        } else {
          const before = h[`${k}BeforeDrain`];
          parts.push(`${k} ${h[k] ?? 0} to ${before ?? 0}`);
          if (before === null || before === undefined) delete h[k];
          else h[k] = before;
          delete h[`${k}BeforeDrain`];
        }
      }
      return parts.join(', ');
    },
    note: (a) => ({ at: hostKeys(a, 'drainNote') }),
    says: (a, f, t, detail) => (t ? `wound down, nothing new starts here and running work finishes: ${detail}` : `brought back: ${detail}`),
  },

  hostAccount: {
    args: (b, cfg, ctx) => {
      const host = hostOf(b, cfg);
      const account = accountOf(b, cfg, ctx);
      if (!Array.isArray(cfg.hosts[host].accounts)) refuse(`${host} has no account list, so it may use every account`);
      // An account this machine lists, or one it has a folder for (collect.mjs's spareLabels), may be put on its list.
      const here = [...cfg.hosts[host].accounts, ...(ctx.labelsOn?.(host) ?? []), ...(ctx.spareOn?.(host) ?? [])];
      if (!here.includes(account)) refuse(`account ${account} has no folder on ${host}, so ${host} could not use it`);
      return { host, account };
    },
    value: (b) => cleanBool(b.value),
    target: (a) => `account:${a.host}:${a.account}`,
    read: (cfg, a) => cfg.hosts[a.host].accounts.includes(a.account),
    guard: (cfg, a, v) => {
      if (v && cfg.accountsOut?.[a.account]) refuse(`account ${a.account} is out of the queue; put it back first`, 409);
    },
    write: (cfg, a, v) => setAt(cfg, hostKeys(a, 'accounts'), sortedWith(cfg.hosts[a.host].accounts, a.account, v)),
    note: (a) => ({ at: hostKeys(a, 'accountsNote'), after: 'accounts' }),
    says: (a, f, t) => `account ${a.account} ${t ? 'added' : 'taken off'}`,
  },

  // A machine's own load guard, or none to use the fleet's (the dispatcher section's own value).
  loadGuard: {
    args: (b, cfg) => {
      if (!['maxLoadPerCore', 'minMemoryFreePercent'].includes(b.key)) refuse(`unknown load guard ${show(b.key)}`);
      return { host: hostOf(b, cfg), key: b.key };
    },
    value: (b, cfg, a) => (a.key === 'maxLoadPerCore' ? cleanNumber(b.value, 0.25, 20, { nullable: true, name: a.key })
      : cleanInt(b.value, 0, 90, { nullable: true, name: a.key })),
    target: (a) => `${a.key}:${a.host}`,
    read: (cfg, a) => cfg.hosts[a.host][a.key] ?? null,
    write: (cfg, a, v) => (v === null ? deleteAt(cfg, hostKeys(a, a.key)) : setAt(cfg, hostKeys(a, a.key), v, 'accounts')),
    note: (a) => ({ at: hostKeys(a, 'loadNote') }),
    says: (a, f, t, d, cfg) => `${a.key} ${f ?? `the fleet's ${cfg[a.key]}`} to ${t ?? `the fleet's ${cfg[a.key]}`}`,
  },

  // Burn an account first (burnAccounts). An end time also goes into burnUntil, so the dispatcher stops the burn at
  // that instant on its own even while the board is down. The Fable switch stays where it was: a burn account not in
  // noFableAccounts runs Fable, so turning a burn on alone could also start Fable workers.
  burn: {
    args: (b, cfg, ctx) => ({ account: accountOf(b, cfg, ctx) }),
    value: (b) => cleanBool(b.value),
    target: (a) => `burn:${a.account}`,
    read: (cfg, a) => (cfg.burnAccounts ?? []).includes(a.account),
    write: (cfg, a, v, ctx) => {
      const fable = fableNow(cfg, a.account, ctx.now);
      const list = (cfg.burnAccounts ?? []).filter((l) => l !== a.account);
      setAt(cfg, ['burnAccounts'], v ? [...list, a.account] : list);
      OPS.burn.onUntil(cfg, a, v ? ctx.until : null);
      if (fableNow(cfg, a.account, ctx.now) !== fable) setFable(cfg, a.account, fable, ctx.now);
    },
    onUntil: (cfg, a, until) => {
      if (until) setAt(cfg, ['burnUntil', a.account], until, 'burnAccounts');
      else if (cfg.burnUntil) delete cfg.burnUntil[a.account];
      dropEmpty(cfg, 'burnUntil');
    },
    note: () => ({ at: ['burnNote'], after: 'burnAccounts' }),
    says: (a, f, t) => (t ? `account ${a.account} burned first` : `account ${a.account} no longer burned first`),
  },

  // Fable on an account (fableAccounts), or never (noFableAccounts).
  fable: {
    args: (b, cfg, ctx) => ({ account: accountOf(b, cfg, ctx) }),
    value: (b) => cleanBool(b.value),
    target: (a) => `fable:${a.account}`,
    read: (cfg, a, ctx) => fableNow(cfg, a.account, ctx.now),
    write: (cfg, a, v, ctx) => setFable(cfg, a.account, v, ctx.now),
    note: () => ({ at: ['fableNote'], after: 'fableMinWeeklyLeftPercent' }),
    says: (a, f, t) => (t ? `account ${a.account} runs Fable while it may` : `account ${a.account} runs no Fable`),
  },

  // Out of the queue entirely (signed out, or kept for the owner's own use): off every machine's accounts and
  // fallbackAccounts. accountsOut remembers where it was, so putting it back restores those machines.
  out: {
    args: (b, cfg, ctx) => ({ account: accountOf(b, cfg, ctx) }),
    value: (b) => cleanBool(b.value),
    target: (a) => `out:${a.account}`,
    read: (cfg, a) => Boolean(cfg.accountsOut?.[a.account]),
    guard: (cfg, a, v) => {
      const on = Object.values(cfg.hosts).some((h) => (h.accounts ?? []).includes(a.account) || (h.fallbackAccounts ?? []).includes(a.account));
      if (v && !on) refuse(`account ${a.account} is on no machine's account list already`, 409);
      const open = (cfg.enabledHosts ?? []).find((n) => !Array.isArray(cfg.hosts?.[n]?.accounts));
      if (v && open) refuse(`${open} has no account list, so it may use every account; give it one first`, 409);
      if (!v && !cfg.accountsOut?.[a.account]) refuse(`nothing records where account ${a.account} was; add it on a machine's account list`, 409);
    },
    write: (cfg, a, v, ctx) => {
      if (v) {
        const where = { hosts: [], fallbackHosts: [], since: new Date(ctx.now).toISOString() };
        for (const [name, h] of Object.entries(cfg.hosts)) {
          if ((h.accounts ?? []).includes(a.account)) { where.hosts.push(name); h.accounts = h.accounts.filter((l) => l !== a.account); }
          if ((h.fallbackAccounts ?? []).includes(a.account)) { where.fallbackHosts.push(name); h.fallbackAccounts = h.fallbackAccounts.filter((l) => l !== a.account); }
        }
        setAt(cfg, ['accountsOut', a.account], where, 'workerCapByAccount');
        return `off ${where.hosts.concat(where.fallbackHosts).join(', ')}`;
      }
      const where = cfg.accountsOut[a.account];
      const back = [];
      for (const name of where.hosts ?? []) if (cfg.hosts[name]) { cfg.hosts[name].accounts = sortedWith(cfg.hosts[name].accounts, a.account, true); back.push(name); }
      for (const name of where.fallbackHosts ?? []) if (cfg.hosts[name]) { cfg.hosts[name].fallbackAccounts = sortedWith(cfg.hosts[name].fallbackAccounts, a.account, true); back.push(name); }
      delete cfg.accountsOut[a.account];
      dropEmpty(cfg, 'accountsOut');
      return `back on ${back.join(', ') || 'no machine (none of its machines is left)'}`;
    },
    note: () => ({ at: ['accountsOutNote'], after: 'accountsOut' }),
    says: (a, f, t, detail) => `account ${a.account} ${t ? 'out of the queue' : 'back in the queue'}, ${detail}`,
  },

  // The most working sessions one account may hold on a machine (workerCapByAccount), or none for workerCap.
  workerCap: {
    args: (b, cfg, ctx) => ({ account: accountOf(b, cfg, ctx) }),
    value: (b) => cleanInt(b.value, 0, 12, { nullable: true, name: 'workerCap' }),
    target: (a) => `workerCap:${a.account}`,
    read: (cfg, a) => cfg.workerCapByAccount?.[a.account] ?? null,
    write: (cfg, a, v) => {
      if (v === null) { if (cfg.workerCapByAccount) delete cfg.workerCapByAccount[a.account]; dropEmpty(cfg, 'workerCapByAccount'); return; }
      setAt(cfg, ['workerCapByAccount', a.account], v, 'workerCap');
    },
    note: () => ({ at: ['workerCapNote'], after: 'workerCap' }),
    says: (a, f, t, d, cfg) => `account ${a.account} workerCap ${f ?? `${cfg.workerCap} (the fleet's)`} to ${t ?? `${cfg.workerCap} (the fleet's)`}`,
  },

  ...FLEET_OPS,
};

