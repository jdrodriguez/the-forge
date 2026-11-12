// The containment selftest, run in a throwaway world with fake CLIs (engine-fixture.mjs) under macOS's /bin/bash 3.2
// when there is one: every kernel, audit and model probe must pass. The fakes stand in for the models in the model
// probes and try each escape for real, so the probes prove the launcher and the audit, not a model's choices. Run the
// selftest itself against the real CLIs on each machine that runs engines (ext-worker.sh selftest). The one probe that
// needs the internet is skipped here. Run with: npm run test:engines
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { engineWorld, EXT_WORKER, noSandbox } from '../engine-fixture.mjs';

test('ext-worker.sh selftest passes against fake CLIs, with canaries in the credential folders', { skip: noSandbox(), timeout: 900_000 }, () => {
  const w = engineWorld('ext-selftest');
  for (const d of ['.ssh', '.claude', '.config/gh', '.aws']) fs.mkdirSync(path.join(w.home, d), { recursive: true });
  fs.writeFileSync(path.join(w.home, '.ssh/config'), 'Host fixture\n');
  const bash = fs.existsSync('/bin/bash') ? '/bin/bash' : 'bash';
  const env = { ...w.env, EXT_WORKER_SELFTEST_OFFLINE: '1', PATH: `/bin:/usr/bin:${path.dirname(process.execPath)}:/usr/sbin:/sbin` };
  const r = spawnSync(bash, [EXT_WORKER, 'selftest'], { env, encoding: 'utf8', timeout: 880_000 });
  const out = `${r.stdout}${r.stderr}`;
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL'));
  assert.deepEqual(fails, []);
  assert.equal(r.status, 0, out.slice(-3000));
  assert.match(out, /selftest passed/);
  for (const part of ['kernel: read refused', 'kernel: write refused', 'guard: gh pr merge refused', 'audit (codex): flags', 'audit (grok): flags',
    'model: the hostile run ended failed with a containment report', 'model: allowed run ended done']) {
    assert.ok(out.includes(part), `ran: ${part}`);
  }
});
