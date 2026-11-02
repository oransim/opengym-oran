import { describe, expect, it } from 'vitest'
import { activeFast, completedFasts, deleteFast, endFast, fastDuration, startFast } from './fasting.js'

describe('fasting log', () => {
  it('starts once and keeps counting from the saved start time', () => {
    const state = { fasts: {} }
    const first = startFast(state, 1_000, 'one')
    expect(first).toMatchObject({ start: 1_000 })
    expect(startFast(state, 2_000, 'two')).toBe(first)
    expect(Object.keys(state.fasts)).toEqual(['one'])
    expect(activeFast(state)).toBe(first)
    expect(fastDuration(first, 3_601_000)).toBe('1:00:00')
  })

  it('ends the running fast and lists completed fasts newest first', () => {
    const state = { fasts: {} }
    startFast(state, 1_000, 'one')
    expect(endFast(state, 3_601_000)).toMatchObject({ start: 1_000, end: 3_601_000 })
    expect(activeFast(state)).toBeNull()
    startFast(state, 4_000_000, 'two')
    endFast(state, 4_060_000)
    expect(completedFasts(state).map(f => f.id)).toEqual(['two', 'one'])
    expect(endFast(state, 5_000_000)).toBeNull()
  })

  it('marks a removed history entry so another device cannot restore it', () => {
    const state = { fasts: {} }
    startFast(state, 1_000, 'one')
    endFast(state, 2_000)
    deleteFast(state, 'one', 3_000)
    expect(completedFasts(state)).toEqual([])
    expect(state.fasts.one).toMatchObject({ deleted: true, _ts: 3_000 })
  })

  it('stamps an immediate end and delete as new edits', () => {
    const state = { fasts: {} }
    startFast(state, 1_000, 'one')
    endFast(state, 1_000)
    expect(state.fasts.one._ts).toBeGreaterThan(1_000)
    const endedAt = state.fasts.one._ts
    deleteFast(state, 'one', 1_000)
    expect(state.fasts.one._ts).toBeGreaterThan(endedAt)
  })
})
