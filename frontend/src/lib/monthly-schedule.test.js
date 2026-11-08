import { describe, expect, it } from 'vitest'
import { monthlyIdsOn } from './monthly-schedule.js'
import { effectiveRoutineIds, nextTrainingDay } from './history.js'
import { exerciseRepeatsOn } from './exercise-repeat.js'

describe('monthly schedules', () => {
  const S = { monthly: {
    first: { type: 'date', day: 31 },
    last: { type: 'last' },
    secondTuesday: { type: 'weekday', ordinal: 2, weekday: 2 },
    lastFriday: { type: 'weekday', ordinal: -1, weekday: 5 },
  } }

  it('runs numbered dates only in months that have them', () => {
    expect(monthlyIdsOn(S, '2026-01-31')).toContain('first')
    expect(monthlyIdsOn(S, '2026-02-28')).not.toContain('first')
  })

  it('runs the last day and numbered or last weekdays', () => {
    expect(monthlyIdsOn(S, '2026-02-28')).toContain('last')
    expect(monthlyIdsOn(S, '2026-11-10')).toContain('secondTuesday')
    expect(monthlyIdsOn(S, '2026-11-27')).toContain('lastFriday')
    expect(monthlyIdsOn(S, '2026-11-20')).not.toContain('lastFriday')
  })

  it('appears in the dated plan and combines with a weekly routine only once', () => {
    const state = { routines: [{ id: 'first', ex: [{ id: '1' }] }, { id: 'weekly', ex: [{ id: '2' }] }],
      week: { 6: ['first', 'weekly'] }, monthly: S.monthly, dayPlan: {}, workouts: [] }
    expect(effectiveRoutineIds(state, '2026-01-31')).toEqual(['first', 'weekly'])
    expect(effectiveRoutineIds(state, '2026-02-28')).toEqual(['first', 'weekly'])
    expect(effectiveRoutineIds({ ...state, dayPlan: { '2026-01-31': 'weekly' } }, '2026-01-31')).toEqual(['weekly'])
  })

  it('includes a monthly exercise and finds a training day beyond next week', () => {
    const state = { routines: [{ id: 'first', ex: [{ id: '1' }] }, { id: 'exercise', kind: 'exercise-repeat', ex: [{ id: '2' }] }],
      week: {}, monthly: { first: { type: 'date', day: 31 }, exercise: { type: 'date', day: 31 } }, dayPlan: {}, workouts: [] }
    expect(exerciseRepeatsOn(state, '2026-01-31').map(r => r.id)).toEqual(['exercise'])
    expect(nextTrainingDay(state, '2026-01-01')?.iso).toBe('2026-01-31')
  })
})
