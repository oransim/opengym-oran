import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readQueue, completedIds, nextOn, pinStateFor } from '../shared/queue-core.js';

const routines = [{ id: 'r1', name: 'Push' }, { id: 'r2', name: 'Pull' }];
const queue = { ids: ['r1', 'r1', 'gone', 'r2'], since: 5000, startsOn: '2026-09-07' };

test('shared queue rules normalize ids and count dated finished workouts with matching names', () => {
  const S = { routines, queue, workouts: [{ routineId: 'r1', start: 1000, d: '2026-09-07', name: 'Push + Core' }] };
  const q = readQueue(S, () => 'unused');
  assert.deepEqual(q.ids, ['r1', 'r2']);
  assert.deepEqual([...completedIds(S, q)], ['r1']);
  assert.equal(pinStateFor(S, q, 'r1'), 'done');
  assert.equal(pinStateFor(S, q, 'r2'), 'open');
});

test('strict queue ignores an earlier workout even when its date and name match', () => {
  const S = { routines, queue: { ...queue, strict: true }, workouts: [{ routineId: 'r1', start: 1000, d: '2026-09-07', name: 'Push' }] };
  assert.deepEqual([...completedIds(S, readQueue(S, () => 'unused'))], []);
});

test('a pin on another day leaves the next unpinned session available', () => {
  const S = { dayPlan: { '2026-09-08': 'r1', '2026-09-07': 'r2' } };
  assert.equal(nextOn(S, ['r1', 'r2'], '2026-09-07', '2026-09-07'), 'r2');
  assert.equal(nextOn(S, ['r1', 'r2'], '2026-09-09', '2026-09-09'), 'r1');
});
