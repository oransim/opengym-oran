// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import Plan from './Plan.jsx'
import { startFlow, scheduleItemSheet, repeatDaysSheet } from '../sheets.jsx'
import { todayISO } from '../lib/format.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  dayAssignSheet: vi.fn(), scheduleItemSheet: vi.fn(), repeatDaysSheet: vi.fn(),
  startFlow: vi.fn(), starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), menuSheet: vi.fn(),
  planHasRoutines: () => true, exportPlanFile: vi.fn(), printWholePlan: vi.fn(), importPlanFile: vi.fn(),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original
beforeEach(() => {
  original = useStore.getState()
  const day = new Date(`${todayISO()}T12:00:00`).getDay()
  const S = structuredClone(DEF)
  S.routines = [
    { id: 'routine', name: 'Side split', ex: [{ id: '0025' }] },
    { id: 'class', name: 'Yoga class', kind: 'visit', ex: [] },
    { id: 'repeat', name: 'Pancake stretch', kind: 'exercise-repeat', ex: [{ id: '0025', sets: 3, reps: 30 }] },
  ]
  S.week = { [day]: ['routine', 'class', 'repeat'] }
  S.workouts = []
  useStore.setState({ S, user: null })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  vi.clearAllMocks()
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState(original) })

it('shows each selected-day item separately and starts a repeat as a solo session', () => {
  act(() => root.render(<Plan />))
  const items = [...host.querySelectorAll('.plan-selected-item')]
  expect(items.map(el => el.querySelector('.tt')?.textContent)).toEqual(['Side split', 'Yoga class', 'Pancake stretch'])
  act(() => items[2].querySelector('button').click())
  expect(startFlow).toHaveBeenCalledWith(['repeat'])
  expect(startFlow).toHaveBeenCalledTimes(1)
})

it('does not start a second session while a workout is active', () => {
  useStore.getState().update(s => { s.active = { id: 'live', entries: [] } }, false)
  act(() => root.render(<Plan />))
  const repeat = [...host.querySelectorAll('.plan-selected-item')].find(el => el.textContent.includes('Pancake stretch'))
  act(() => repeat.querySelector('button').click())
  expect(startFlow).not.toHaveBeenCalled()
})

it('offers scheduling and an independent editor for the repeat rule', () => {
  act(() => root.render(<Plan />))
  act(() => host.querySelector('[aria-label="Schedule item"]').click())
  expect(scheduleItemSheet).toHaveBeenCalled()
  const rule = [...host.querySelectorAll('.plan-repeat-rule')].find(el => el.textContent.includes('Pancake stretch'))
  act(() => rule.querySelector('button').click())
  expect(repeatDaysSheet).toHaveBeenCalledWith('repeat')
})

it('keeps an imported repeat with schedule off visible for later scheduling', () => {
  useStore.getState().update(s => { for (const [day, ids] of Object.entries(s.week)) s.week[day] = ids.filter(id => id !== 'repeat') }, false)
  act(() => root.render(<Plan />))
  const rule = [...host.querySelectorAll('.plan-repeat-rule')].find(el => el.textContent.includes('Pancake stretch'))
  expect(rule).toBeTruthy()
  expect(rule.textContent).toContain('Not scheduled')
  act(() => rule.querySelector('button').click())
  expect(repeatDaysSheet).toHaveBeenCalledWith('repeat')
})

it('marks the selected calendar date and follows it across weeks', () => {
  act(() => root.render(<Plan />))
  expect(host.querySelector('.week-calendar-day.today').getAttribute('aria-pressed')).toBe('true')
  act(() => host.querySelector('button[aria-label="Next week"]').click())
  expect(host.querySelector('.week-calendar-day.today')).toBeNull()
  expect(host.querySelectorAll('.week-calendar-day[aria-pressed="true"]')).toHaveLength(1)
})

it('keeps an independent repeat visible when another item overrides the date', () => {
  useStore.getState().update(s => { s.dayPlan[todayISO()] = 'class' }, false)
  act(() => root.render(<Plan />))
  const names = [...host.querySelectorAll('.plan-selected-item .tt')].map(el => el.textContent)
  expect(names).toEqual(['Yoga class', 'Pancake stretch'])
  expect(host.querySelector('.week-calendar-day.today').title).toContain('Pancake stretch')
})

it('removes one selected routine only from this date and keeps its next weekly occurrence', () => {
  act(() => root.render(<Plan />))
  act(() => host.querySelector('button[aria-label="Remove Side split from this day"]').click())
  expect(useStore.getState().S.week[new Date(`${todayISO()}T12:00:00`).getDay()]).toEqual(['routine', 'class', 'repeat'])
  expect([...host.querySelectorAll('.plan-selected-item .tt')].map(el => el.textContent)).toEqual(['Yoga class', 'Pancake stretch'])
  expect(host.querySelector('.week-calendar-day.today').title).not.toContain('Side split')
  act(() => host.querySelector('.plan-skipped-item button').click())
  expect([...host.querySelectorAll('.plan-selected-item .tt')].map(el => el.textContent)).toContain('Side split')
  act(() => host.querySelector('button[aria-label="Remove Side split from this day"]').click())
  act(() => host.querySelector('button[aria-label="Next week"]').click())
  expect([...host.querySelectorAll('.plan-selected-item .tt')].map(el => el.textContent)).toContain('Side split')
})

it('removes one repeat from the selected date without losing the other planned items', () => {
  act(() => root.render(<Plan />))
  act(() => host.querySelector('button[aria-label="Remove Pancake stretch from this day"]').click())
  expect([...host.querySelectorAll('.plan-selected-item .tt')].map(el => el.textContent)).toEqual(['Side split', 'Yoga class'])
  expect(host.querySelector('.week-calendar-day.today').title).not.toContain('Pancake stretch')
  expect(useStore.getState().S.week[new Date(`${todayISO()}T12:00:00`).getDay()]).toEqual(['routine', 'class', 'repeat'])
})

it('does not show an old date skip after that routine is removed from the weekday schedule', () => {
  const weekday = new Date(`${todayISO()}T12:00:00`).getDay()
  act(() => root.render(<Plan />))
  act(() => host.querySelector('button[aria-label="Remove Side split from this day"]').click())
  act(() => useStore.getState().update(s => { s.week[weekday] = ['class', 'repeat'] }))
  expect(host.querySelector('.plan-skipped-item')).toBeNull()
  expect(host.querySelector('.week-calendar-day.today').classList.contains('overridden')).toBe(false)
})
