import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dryRefusal } from './dry.mjs';

test('a dry-run board refuses every POST', () => {
  const r = dryRefusal('POST', { QUEUE_BOARD_DRY: '1' });
  assert.equal(r.status, 403);
  assert.equal(r.body.ok, false);
  assert.match(r.body.error, /dry-run/);
});
test('a dry-run board still answers GET, and a normal board refuses nothing', () => {
  assert.equal(dryRefusal('GET', { QUEUE_BOARD_DRY: '1' }), null);
  assert.equal(dryRefusal('POST', {}), null);
  assert.equal(dryRefusal('POST', { QUEUE_BOARD_DRY: '0' }), null);
});
