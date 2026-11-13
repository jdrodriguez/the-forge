// board-realms.test.mjs: node --test queue-board/board-realms.test.mjs. Starts this repo's board with a throwaway config
// (test/page.mjs) and reads the realm fields of its snapshot: a realm map with an unknown or inherited key still builds a
// snapshot, with that host drawn as the fallback, and one computer whose map names only other machines still fills the
// whole map. No browser is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBoard } from './test/page.mjs';

const HOST = 'forge-test.invalid';
async function snapshotWith(queueBoard, port) {
  const b = await startBoard(port, { queueBoard });
  try {
    const res = await fetch(`${b.base}/api/snapshot`);
    return { status: res.status, snap: await res.json() };
  } finally {
    b.stop();
  }
}

test('a realm map with an unknown or an inherited key still builds the snapshot, the host as the fallback', async () => {
  for (const [i, key] of ['gondor', 'constructor', 'toString'].entries()) {
    const { status, snap } = await snapshotWith({ realms: { [HOST]: key }, spreadRealms: false }, 8780 + i);
    assert.equal(status, 200, key);
    assert.deepEqual(snap.config.realms, {}, key);
    assert.equal(snap.config.spread, false, key);
  }
});

test('one computer whose realm map names only other machines still spreads over the four realms', async () => {
  const { status, snap } = await snapshotWith({ realms: { 'other-box': 'erebor' } }, 8784);
  assert.equal(status, 200);
  assert.equal(snap.config.spread, true);
  assert.equal(snap.config.realms[HOST].key, 'rivendell');
  assert.deepEqual(snap.config.spreadRealms[HOST].map((r) => r.key), ['rivendell', 'shire', 'erebor', 'rohan']);
});
