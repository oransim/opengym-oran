import { describe, expect, it } from 'vitest'
import { localExtras, mergeStates, resetIdsOf, sinceReset, stampChange } from './sync-merge.js'

const base = (fasts, ts) => ({ unit: 'kg', workouts: [], routines: [], bodyweight: [], fasts, _ts: ts })

describe('fasting across devices and backups', () => {
  it('keeps fasts started on separate devices when their profiles sync', () => {
    const a = base({ a: { id: 'a', start: 1_000, end: 2_000, _ts: 2_000 } }, 2_000)
    const b = base({ b: { id: 'b', start: 3_000, _ts: 3_000 } }, 3_000)
    expect(Object.keys(mergeStates(a, b).fasts).sort()).toEqual(['a', 'b'])
  })

  it('keeps an ended or removed fast over an older copy of it', () => {
    const running = base({ a: { id: 'a', start: 1_000, _ts: 1_000 } }, 4_000)
    const ended = base({ a: { id: 'a', start: 1_000, end: 2_000, _ts: 2_000 } }, 2_000)
    expect(mergeStates(running, ended).fasts.a.end).toBe(2_000)
    const removed = base({ a: { id: 'a', start: 1_000, end: 2_000, deleted: true, _ts: 3_000 } }, 3_000)
    expect(mergeStates(ended, removed).fasts.a.deleted).toBe(true)
  })

  it('includes fasting in reset and guest sign-in protection', () => {
    const guest = base({ a: { id: 'a', start: 1_000, _ts: 1_000 } }, 1_000)
    const server = base({}, 2_000)
    expect(localExtras(guest, server).setup).toBe(1)
    const ids = resetIdsOf(guest)
    expect(sinceReset(guest, 3_000, ids).fasts).toEqual({})
  })

  it('stamps a stopped fast after the latest change already seen on this device', () => {
    const before = base({ a: { id: 'a', start: 1_000, _ts: 1_000 } }, 9_000)
    const after = structuredClone(before)
    after.fasts.a.end = 2_000
    after.fasts.a._ts = 2_000
    stampChange(before, after, 2_000)
    expect(after.fasts.a._ts).toBeGreaterThan(9_000)
  })
})
