// control-ops-fleet.mjs: the fleet-wide operations of the Fleet view's levers (control-ops.mjs has the per-machine and
// per-account ones): the numbers and switches they may set, Codex and Grok as queue accounts, and the model and effort.
// Each key is a path in the dispatcher section, listed here with its range and the *Note field its dated line goes to;
// any other key is refused.
import { getAt, setAt, deleteAt, refuse, show, cleanInt, cleanBool } from './control-config.mjs';

// key path -> range, whether "none" (the key removed) is allowed, and the note it is recorded in. A key the dispatcher
// reads with a fallback when it is unset is nullable, so Undo can put "unset" back.
export const NUMBERS = {
  maxConcurrent: { min: 0, max: 80, note: ['maxConcurrentNote'] },
  maxDispatchesPerDay: { min: 0, max: 200, nullable: true, note: ['maxDispatchesPerDayNote'], after: 'maxConcurrent' },
  headroomFloorPercent: { min: 0, max: 60, note: ['headroomNote'] },
  workerCap: { min: 1, max: 12, note: ['workerCapNote'] },
  burnFloorPercent: { min: 0, max: 50, nullable: true, note: ['burnNote'] },
  fableFloorPercent: { min: 0, max: 60, nullable: true, note: ['fableNote'] },
  fableMinWeeklyLeftPercent: { min: 0, max: 100, nullable: true, note: ['fableNote'] },
  'workerReservePercent.max': { min: 0, max: 30, nullable: true, note: ['workerReserveNote'] },
  'workerReservePercent.team': { min: 0, max: 30, nullable: true, note: ['workerReserveNote'] },
  'externalBuilders.fallback.maxRounds': { min: 1, max: 10, nullable: true, note: ['externalBuilders', 'fallbackNote'] },
};
// key path -> the note it is recorded in, and the key a new setting goes after.
export const SWITCHES = {
  holdNewWork: { note: ['holdNewWorkNote'], after: 'maxConcurrent' },
  'externalBuilders.fallback.enabled': { note: ['externalBuilders', 'fallback', 'onNote'] },
  'codexAutoReset.enabled': { note: ['codexAutoResetNote'], noteAfter: 'codexAutoReset' },
  'sentryTriage.enabled': { note: ['sentryTriageNote'] },
};
export const MODELS = ['opus', 'sonnet', 'fable'];
export const SIZE_MODELS = ['sonnet', 'opus'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const SIZES = ['S', 'M', 'L'];
export const ENGINES = ['codex', 'grok'];
// The engines that take queue tickets as the dispatcher reads them: an omitted list means both.
export const enginesOf = (cfg) => cfg.externalBuilders?.fallback?.engines ?? ENGINES;

const keyOf = (b, table) => {
  if (typeof b.key !== 'string' || !Object.hasOwn(table, b.key)) refuse(`unknown setting ${show(b.key)}`);
  return { key: b.key };
};
const path = (a) => a.key.split('.');
// A note at the top level sits after the key it is about; a nested one at the end of its object.
const noteAt = (spec, a) => ({ at: spec.note, after: spec.note.length === 1 ? (spec.noteAfter ?? path(a)[0]) : null });
const ordered = (list, x, on, order) => order.filter((e) => (e === x ? on : (list ?? []).includes(e)));
const MODEL_NOTE = { at: ['modelNote'], after: 'model' };

export const FLEET_OPS = {
  number: {
    args: (b) => keyOf(b, NUMBERS),
    value: (b, cfg, a) => cleanInt(b.value, NUMBERS[a.key].min, NUMBERS[a.key].max, { nullable: NUMBERS[a.key].nullable, name: a.key }),
    target: (a) => a.key,
    read: (cfg, a) => getAt(cfg, path(a)) ?? null,
    write: (cfg, a, v) => (v === null ? deleteAt(cfg, path(a)) : setAt(cfg, path(a), v, NUMBERS[a.key].after ?? null)),
    note: (a) => noteAt(NUMBERS[a.key], a),
    says: (a, f, t) => `${a.key} ${show(f)} to ${show(t)}`,
  },
  switch: {
    args: (b) => keyOf(b, SWITCHES),
    value: (b) => cleanBool(b.value),
    target: (a) => a.key,
    read: (cfg, a) => getAt(cfg, path(a)) === true,
    write: (cfg, a, v) => setAt(cfg, path(a), v, SWITCHES[a.key].after ?? null),
    note: (a) => noteAt(SWITCHES[a.key], a),
    says: (a, f, t) => (a.key === 'holdNewWork'
      ? (t ? 'new work held on every machine: no new ticket is claimed, and claimed work carries on' : 'new work flows again')
      : `${a.key} ${show(t)}`),
  },
  // Codex or Grok as a queue account (externalBuilders.fallback.engines), kept in the order codex, grok.
  engine: {
    args: (b) => {
      if (!ENGINES.includes(b.engine)) refuse(`unknown engine ${show(b.engine)}`);
      return { engine: b.engine };
    },
    value: (b) => cleanBool(b.value),
    target: (a) => `engine:${a.engine}`,
    read: (cfg, a) => enginesOf(cfg).includes(a.engine),
    write: (cfg, a, v) => setAt(cfg, ['externalBuilders', 'fallback', 'engines'], ordered(enginesOf(cfg), a.engine, v, ENGINES)),
    note: () => ({ at: ['externalBuilders', 'fallback', 'enginesNote'] }),
    says: (a, f, t) => `${a.engine} ${t ? 'takes' : 'takes no'} queue tickets`,
  },
  // An engine fed ahead of the Claude accounts while it has room (externalBuilders.fallback.prefer), codex before grok.
  prefer: {
    args: (b) => FLEET_OPS.engine.args(b),
    value: (b) => cleanBool(b.value),
    target: (a) => `prefer:${a.engine}`,
    read: (cfg, a) => (cfg.externalBuilders?.fallback?.prefer ?? []).includes(a.engine),
    write: (cfg, a, v) => setAt(cfg, ['externalBuilders', 'fallback', 'prefer'], ordered(cfg.externalBuilders?.fallback?.prefer, a.engine, v, ENGINES)),
    note: () => ({ at: ['externalBuilders', 'fallback', 'preferNote'] }),
    says: (a, f, t) => `${a.engine} ${t ? 'fed first, ahead of the Claude accounts' : 'ranked with the Claude accounts by usage left'}`,
  },
  // The default model. Fable for the whole queue falls back to modelFallback once an account's Fable allowance is spent.
  model: {
    args: () => ({}),
    value: (b) => {
      if (!MODELS.includes(b.value)) refuse(`model must be one of ${MODELS.join(', ')}`);
      return b.value;
    },
    target: () => 'model',
    read: (cfg) => cfg.model,
    write: (cfg, a, v) => {
      cfg.model = v;
      if (v === 'fable' && !cfg.modelFallback) setAt(cfg, ['modelFallback'], 'opus', 'model');
    },
    note: () => MODEL_NOTE,
    says: (a, f, t) => `model ${f} to ${t}`,
  },
  effort: {
    args: () => ({}),
    value: (b) => {
      if (!EFFORTS.includes(b.value)) refuse(`effort must be one of ${EFFORTS.join(', ')}`);
      return b.value;
    },
    target: () => 'effort',
    read: (cfg) => cfg.effort,
    write: (cfg, a, v) => { cfg.effort = v; },
    note: () => MODEL_NOTE,
    says: (a, f, t) => `effort ${f} to ${t}`,
  },
  // A smaller (or larger) model for one ticket Size (modelBySize), or none for the default model.
  sizeModel: {
    args: (b) => {
      if (!SIZES.includes(b.size)) refuse(`unknown size ${show(b.size)}`);
      return { size: b.size };
    },
    value: (b) => {
      if (b.value !== null && !SIZE_MODELS.includes(b.value)) refuse(`a size model must be one of ${SIZE_MODELS.join(', ')}, or none`);
      return b.value;
    },
    target: (a) => `sizeModel:${a.size}`,
    read: (cfg, a) => cfg.modelBySize?.[a.size] ?? null,
    write: (cfg, a, v) => {
      if (v === null) { if (cfg.modelBySize) delete cfg.modelBySize[a.size]; return; }
      setAt(cfg, ['modelBySize', a.size], v, 'model');
    },
    note: () => MODEL_NOTE,
    says: (a, f, t) => `Size ${a.size} model ${f ?? 'the default'} to ${t ?? 'the default'}`,
  },
};
