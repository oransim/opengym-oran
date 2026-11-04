// @vitest-environment happy-dom
// Starter-plan setup belongs in Plan, where the schedule and routines are edited.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { starterPlanSheet } from '../sheets.jsx'
import Home from './Home.jsx'
import Plan from './Plan.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
  dayAssignSheet: vi.fn(), planToolsSheet: vi.fn(),
}))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  starterPlanSheet.mockClear()
  useStore.setState(s => ({ S: { ...s.S, routines: [], week: {}, active: null }, user: null }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const starterButton = () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Load starter plan')

describe('Home empty state', () => {
  it('keeps starter-plan setup off the dashboard', () => {
    act(() => root.render(<Home />))
    expect(starterButton()).toBeFalsy()
    expect(host.textContent).not.toContain('Welcome!')
  })

  it('shows a seven-day calendar even before a rotation is configured', () => {
    useStore.setState(s => ({ S: { ...s.S, scheduleMode: 'rotation', rotation: null, queue: null } }))
    act(() => root.render(<Home />))
    expect(host.querySelectorAll('.week-calendar-day')).toHaveLength(7)
  })

  it('shows the name of a routine assigned to a weekday', () => {
    const dow = new Date().getDay()
    useStore.setState(s => ({ S: { ...s.S, routines: [{ id: 'r', name: 'Climbing', emoji: 'star', ex: [] }], week: { [dow]: ['r'] }, scheduleMode: 'week' } }))
    act(() => root.render(<Home />))
    expect(host.querySelector('.week-calendar-day.today').textContent).toContain('Climbing')
  })
})

describe('Plan empty state', () => {
  it('shows the weekly calendar in Schedule', () => {
    act(() => root.render(<Plan />))
    expect(host.querySelectorAll('.week-calendar-day')).toHaveLength(7)
  })
  it('opens the starter plan chooser instead of loading one plan blind', () => {
    act(() => root.render(<Plan />))
    const button = starterButton()
    expect(button).toBeTruthy()

    act(() => { button.click() })
    expect(starterPlanSheet).toHaveBeenCalledTimes(1)
  })

  it('drops the offer once the user has routines', () => {
    useStore.setState(s => ({ S: { ...s.S, routines: [{ id: 'r', name: 'Mine', emoji: 'star', ex: [] }] } }))
    act(() => root.render(<Plan />))
    expect(starterButton()).toBeFalsy()
  })
})
