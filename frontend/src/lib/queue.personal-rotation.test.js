import { expect, it } from 'vitest'
import { queueOf, queueNext, queueView, weekTally } from './queue.js'
import { effectiveRoutineIds } from './history.js'

const today = '2026-11-03'
const routines = [
  { id: 'old', name: 'Old rotation', ex: [{ id: '0025' }] },
  { id: 'weekday', name: 'Weekday', ex: [{ id: '0025' }] },
]
const base = () => ({ routines, week: { 2: ['weekday'] }, dayPlan: {}, workouts: [],
  rotation: { id: 'rot', sequence: ['old'] },
  queue: { ids: ['old'], since: Date.parse(today), startsOn: today, label: 'Old rotation', rotationId: 'rot' } })

it('ignores a saved personal rotation queue and keeps the weekday plan', () => {
  const S = base()
  expect(queueOf(S)).toBe(null)
  expect(queueView(S, today)).toBe(null)
  expect(queueNext(S, today, today)).toBe(null)
  expect(effectiveRoutineIds(S, today)).toEqual(['weekday'])
  expect(S.rotation.sequence).toEqual(['old'])
})

it('keeps an externally supplied coach queue', () => {
  const S = base()
  S.queue = { ...S.queue, rotationId: 'coach' }
  expect(queueOf(S)?.ids).toEqual(['old'])
  expect(queueNext(S, today, today)).toBe('old')
  expect(effectiveRoutineIds(S, today, today)).toEqual(['old', 'weekday'])
})

it('counts a standalone exercise repeat separately from a routine on the same weekday', () => {
  const S = base()
  S.queue = null
  S.routines.push({ id: 'repeat', name: 'Pancake', kind: 'exercise-repeat', ex: [{ id: '0025' }] })
  S.week[2].push('repeat')
  S.workouts = [
    { d: today, routineIds: ['weekday'], start: 100, name: 'Weekday' },
    { d: today, routineIds: ['repeat'], start: 200, name: 'Pancake' },
  ]
  expect(weekTally(S, today)).toEqual({ done: 2, planned: 2 })
  S.queue = { ids: ['old'], since: 1, startsOn: today, label: 'Coach' }
  expect(weekTally(S, today)).toEqual({ done: 2, planned: 3 })
})
