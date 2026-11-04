import { describe, expect, it } from 'vitest'
import { effectiveRoutineIds } from './history.js'
import { exerciseRepeatsOn, isExerciseRepeat, makeExerciseRepeat, repeatDoneOn } from './exercise-repeat.js'

const iso = '2026-11-09' // Monday
const base = () => ({
  routines: [
    { id: 'routine', name: 'Climbing', ex: [{ id: '0025', sets: 3, reps: 8 }] },
    { id: 'repeat-a', name: 'Adductor stretch', kind: 'exercise-repeat', ex: [{ id: '4512', sets: 2, mode: 'time', sec: 30 }] },
    { id: 'repeat-b', name: 'Adductor stretch', kind: 'exercise-repeat', ex: [{ id: '4512', sets: 3, mode: 'time', sec: 45 }] },
  ],
  week: { 1: ['routine', 'repeat-a'], 4: ['repeat-b'] },
  dayPlan: {}, workouts: [], queue: null,
})

describe('standalone exercise repeats', () => {
  it('keeps two rules for the same exercise independent by routine id', () => {
    const S = base()
    expect(exerciseRepeatsOn(S, iso).map(r => r.id)).toEqual(['repeat-a'])
    expect(exerciseRepeatsOn(S, '2026-11-12').map(r => r.id)).toEqual(['repeat-b'])
    expect(exerciseRepeatsOn(S, '2026-11-10')).toEqual([])
  })

  it('hides a repeat on one rest date without erasing next Monday', () => {
    const S = base()
    S.dayPlan[iso] = 'rest'
    expect(exerciseRepeatsOn(S, iso)).toEqual([])
    expect(exerciseRepeatsOn(S, '2026-11-16').map(r => r.id)).toEqual(['repeat-a'])
  })

  it('skips only one repeat on a date while its weekly rule remains', () => {
    const S = base()
    S.dayPlanSkip = { [iso]: ['repeat-a'] }
    expect(exerciseRepeatsOn(S, iso)).toEqual([])
    expect(exerciseRepeatsOn(S, '2026-11-16').map(r => r.id)).toEqual(['repeat-a'])
  })

  it('marks only the logged repeat complete on its workout date', () => {
    const S = base()
    S.workouts.push({ id: 'w1', d: iso, routineIds: ['repeat-a'], start: 100, end: 200 })
    expect(repeatDoneOn(S, 'repeat-a', iso)).toBe(true)
    expect(repeatDoneOn(S, 'repeat-b', iso)).toBe(false)
    expect(repeatDoneOn(S, 'repeat-a', '2026-11-16')).toBe(false)
  })

  it('keeps a repeat out of the combined routine session', () => {
    const S = base()
    expect(effectiveRoutineIds(S, iso, iso)).toEqual(['routine'])
    expect(exerciseRepeatsOn(S, iso).map(r => r.id)).toEqual(['repeat-a'])
  })

  it('creates a one-exercise repeat with its own target', () => {
    const r = makeExerciseRepeat('4512', { sets: 2, mode: 'time', sec: 30, weight: 0 }, 'new-rule')
    expect(isExerciseRepeat(r)).toBe(true)
    expect(r).toMatchObject({ id: 'new-rule', name: 'Adductor stretch', kind: 'exercise-repeat', ex: [{ id: '4512', sets: 2, sec: 30 }] })
  })
})
