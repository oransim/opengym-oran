import { describe, expect, it } from 'vitest'
import { isVisitRoutine, routineHasContent, isVisitSession } from './visit-routine.js'
import { nextTrainingDay } from './history.js'
import { buildCompletedWorkout } from './finish-workout.js'

describe('gym and class visits', () => {
  const visit = { id: 'yoga', name: 'Yoga', kind: 'visit', ex: [] }
  const empty = { id: 'empty', name: 'Unfinished', ex: [] }

  it('treats an exercise-free visit as schedulable, while an unfinished exercise routine stays empty', () => {
    expect(isVisitRoutine(visit)).toBe(true)
    expect(routineHasContent(visit)).toBe(true)
    expect(routineHasContent(empty)).toBe(false)
    expect(nextTrainingDay({ routines: [visit], week: { 1: ['yoga'] }, dayPlan: {}, workouts: [] }, '2026-11-01')?.routine?.name).toBe('Yoga')
  })

  it('keeps a visit distinct in history after finishing a timed session', () => {
    const active = { id: 'w1', d: '2026-11-02', start: 1000, routineIds: ['yoga'], name: 'Yoga', kind: 'visit', bw: null, entries: [] }
    expect(isVisitSession(active)).toBe(true)
    expect(buildCompletedWorkout(active, { end: 3601000 })).toMatchObject({
      id: 'w1', kind: 'visit', name: 'Yoga', start: 1000, end: 3601000,
      routineIds: ['yoga'], entries: [],
    })
    expect(isVisitSession({ ...active, kind: undefined })).toBe(false)
  })
})
