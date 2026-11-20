// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { dayOverrideSheet, saveWorkoutEdits } from './sheets.jsx'
import { removeActiveExercise } from './views/Workout.jsx'

vi.mock('./lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => structuredClone(value)
const date = '2026-11-17'
const workout = (id, d = date) => ({
  id, d, name: id === 'climb' ? 'Climbing' : 'Strength',
  start: new Date(`${d}T10:00:00`).getTime(), end: new Date(`${d}T11:00:00`).getTime(),
  routineIds: ['r1'],
  entries: [
    { id: '0025', target: { sets: 1, reps: 8 }, sets: [{ w: 40, r: 8, done: true }] },
    { id: '0001', target: { sets: 1, reps: 10 }, sets: [{ w: 20, r: 10, done: true }] },
  ],
})
const mounted = []
function top() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
function clickButton(host, label) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === label)
  expect(button, label).toBeTruthy()
  act(() => button.click())
}
const completedRows = host => [...host.querySelectorAll('[aria-label="Done"] .item')]
function openSaved(host, index = 0) {
  const rows = completedRows(host)
  expect(rows.length).toBeGreaterThan(index)
  act(() => rows[index].click())
  expect(useUI.getState().sheets).toHaveLength(1)
  return top()
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-18T12:00:00'))
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  useStore.setState({ S: { ...clone(DEF), workouts: [workout('climb'), workout('strength'), workout('other', '2026-11-16')],
    routines: [{ id: 'r1', name: 'Saved routine', ex: [{ id: '0025' }] }], week: {}, dayPlan: {}, active: null }, user: null })
})
afterEach(() => {
  act(() => mounted.splice(0).reverse().forEach(({ root, host }) => { root.unmount(); host.remove() }))
  useUI.setState({ sheets: [], timer: null, work: null })
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('completed workouts reached from a calendar day', () => {
  it('lists all sessions for that date even when the current weekly plan says rest', () => {
    dayOverrideSheet(date)
    const host = top()
    expect(completedRows(host).map(row => row.querySelector('.tt').textContent)).toEqual(['Climbing', 'Strength'])
    const detail = openSaved(host)
    expect(detail.querySelector('h3').textContent).toBe('Climbing')
    expect(detail.querySelectorAll('.wd-ex')).toHaveLength(2)
    expect(detail.textContent).toContain('40')
    expect(detail.textContent).toContain('Edit workout')
    expect(detail.textContent).toContain('Delete workout')
  })

  it('deletes only the selected workout after confirmation and refreshes the day', () => {
    dayOverrideSheet(date)
    const host = top()
    const detail = openSaved(host)
    clickButton(detail, 'Delete workout')
    clickButton(top(), 'Cancel')
    expect(useStore.getState().S.workouts).toHaveLength(3)
    clickButton(detail, 'Delete workout')
    clickButton(top(), 'Delete')
    expect(useStore.getState().S.workouts.map(w => w.id)).toEqual(['strength', 'other'])
    dayOverrideSheet(date)
    expect(completedRows(top()).map(row => row.querySelector('.tt').textContent)).toEqual(['Strength'])
    expect(JSON.parse(localStorage.getItem('gym_state_v1')).workouts.map(w => w.id)).toEqual(['strength', 'other'])
    expect(useStore.getState().S.routines[0].ex).toEqual([{ id: '0025' }])
  })

  it('lets a completed exercise be removed through Edit workout while preserving the other exercise', () => {
    dayOverrideSheet(date)
    clickButton(openSaved(top()), 'Edit workout')
    expect(useStore.getState().S.active?.editingWorkoutId).toBe('climb')
    act(() => removeActiveExercise(0))
    act(() => saveWorkoutEdits(() => {}))
    const saved = useStore.getState().S.workouts.find(w => w.id === 'climb')
    expect(saved.entries.map(e => e.id)).toEqual(['0001'])
    expect(saved.entries[0].sets[0]).toMatchObject({ w: 20, r: 10, done: true })
    expect(useStore.getState().S.active).toBeNull()
    expect(useStore.getState().S.routines[0].ex).toEqual([{ id: '0025' }])
  })

  it('shows today’s completed sessions too', () => {
    useStore.setState(s => ({ S: { ...s.S, workouts: [workout('climb', '2026-11-18')] } }))
    dayOverrideSheet('2026-11-18')
    expect(completedRows(top())).toHaveLength(1)
  })

  it('opens a logged class with no exercises and lets it be deleted', () => {
    const visit = { ...workout('climb'), kind: 'visit', entries: [] }
    useStore.setState(s => ({ S: { ...s.S, workouts: [visit] } }))
    dayOverrideSheet(date)
    const detail = openSaved(top())
    expect(detail.textContent).not.toContain('Edit workout')
    clickButton(detail, 'Delete workout')
    clickButton(top(), 'Delete')
    expect(useStore.getState().S.workouts).toEqual([])
  })

  it('asks before deleting a workout whose final completed exercise was removed', () => {
    dayOverrideSheet(date)
    clickButton(openSaved(top()), 'Edit workout')
    act(() => { removeActiveExercise(1); removeActiveExercise(0) })
    act(() => saveWorkoutEdits(() => {}))
    expect(useStore.getState().S.workouts).toHaveLength(3)
    clickButton(top(), 'Keep editing')
    expect(useStore.getState().S.active?.editingWorkoutId).toBe('climb')
    act(() => saveWorkoutEdits(() => {}))
    clickButton(top(), 'Delete workout')
    expect(useStore.getState().S.workouts.map(w => w.id)).toEqual(['strength', 'other'])
    expect(useStore.getState().S.active).toBeNull()
  })
})
