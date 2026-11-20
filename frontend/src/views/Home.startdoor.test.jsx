// @vitest-environment happy-dom
// Home owns workout actions: Start for an unfinished plan, Resume on its day card,
// and a separate route to the picker for freestyle or another routine.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { startFlow } from '../sheets.jsx'
import Home from './Home.jsx'
import { todayISO } from '../lib/format.js'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

const routines = [{ id: 'r1', name: 'Push', emoji: null, ex: [{ id: '0025' }] }]

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.mockClear(); startFlow.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

// Every weekday points at a routine and the weigh-in is off: today is always planned, and the
// weigh-in sheet's own way through to the Start screen never opens.
const setS = (over = {}) => useStore.setState(s => ({
  S: {
    ...s.S, routines, dayPlan: {}, workouts: [], active: null, weighIn: false,
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }, ...over,
  },
  user: null,
}))
const mount = () => act(() => root.render(<Home />))
const door = () => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Choose a different workout'))
const start = () => [...host.querySelectorAll('.card button')].find(b => b.textContent === 'Start Push' || b.textContent === 'Start Yoga')

describe('Home — the way to the Start screen when a plan already owns today', () => {
  it('starts today’s planned routine from its day card', () => {
    setS(); mount()
    expect(start()).toBeTruthy()
    act(() => start().click())
    expect(startFlow).toHaveBeenCalledWith(['r1'])
  })

  it('starts a planned class even though it has no exercises', () => {
    setS({ routines: [{ id: 'r1', name: 'Yoga', kind: 'visit', ex: [] }] }); mount()
    expect(start()).toBeTruthy()
    act(() => start().click())
    expect(startFlow).toHaveBeenCalledWith(['r1'])
  })

  it('starts every routine in a combined day as one session', () => {
    setS({ routines: [...routines, { id: 'r2', name: 'Core', ex: [{ id: '0001' }] }], week: { [new Date().getDay()]: ['r1', 'r2'] } }); mount()
    const button = [...host.querySelectorAll('.card button')].find(b => b.textContent === 'Start Push + Core')
    expect(button).toBeTruthy()
    act(() => button.click())
    expect(startFlow).toHaveBeenCalledWith(['r1', 'r2'])
  })

  it('does not offer Start again after today’s planned workout is completed', () => {
    setS({ workouts: [{ id: 'w1', d: todayISO(), name: 'Push', routineIds: ['r1'], entries: [] }] }); mount()
    expect(start()).toBeUndefined()
    expect(host.querySelector('.today-row .tag').textContent).toBe('Done')
    expect(door()).toBeTruthy()
  })

  it('does not offer Start on a rest day or for an empty routine', () => {
    setS({ week: {} }); mount()
    expect(start()).toBeUndefined()
    act(() => setS({ routines: [{ id: 'r1', name: 'Push', ex: [] }] }))
    expect(start()).toBeUndefined()
  })

  it.each([{}, { editingWorkoutId: 'w1' }])('does not offer a new Start while a session or edit is open: %j', flags => {
    setS({ active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [], ...flags } }); mount()
    expect(start()).toBeUndefined()
  })
  it('does not show the unused gym membership check-in card', () => {
    setS({ checkIn: true, gymCards: [{ id: 'old', value: 'ABC', fmt: 'qrcode' }] }); mount()
    expect(host.textContent).not.toContain('Check in')
    expect(nav).not.toHaveBeenCalledWith('/checkin')
  })

  it('opens the fasting timer from its Home card', () => {
    setS(); mount()
    const card = host.querySelector('.fasting-card')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Fasting')
    act(() => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(nav).toHaveBeenCalledWith('/fasting')
  })

  it('shows an active fast elapsed timer on Home and keeps it ticking', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
    const start = Date.now() - 65_000
    setS({ fasts: { running: { id: 'running', start, _ts: start } } }); mount()
    const card = host.querySelector('.fasting-card')
    expect(card.querySelector('[role="timer"]')?.textContent).toBe('0:01:05')
    act(() => vi.advanceTimersByTime(1000))
    expect(card.querySelector('[role="timer"]')?.textContent).toBe('0:01:06')
  })

  it('offers the door on a planned day, where the Start button would start the plan', () => {
    setS(); mount()
    expect(door()).toBeTruthy()
  })

  it('opens the Start screen without starting anything', () => {
    setS(); mount()
    act(() => { door().dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(nav).toHaveBeenCalledWith('/workout')
    expect(startFlow).not.toHaveBeenCalled()
  })

  it('is still there on a rest day, where freestyle is the only thing left to start', () => {
    setS({ week: {} }); mount()
    expect(door()).toBeTruthy()
  })

  it('goes away once a session is running — that screen resumes it, it does not choose', () => {
    setS({ active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } })
    mount()
    expect(door()).toBeFalsy()
  })

  it('reads an open editor on a saved workout as an edit, not as a session in progress', () => {
    setS({ active: { id: 'w', name: 'Push', start: 1000, cur: 0, entries: [], editingWorkoutId: 'w' } })
    mount()
    const row = host.querySelector('.today-row')
    expect(row.querySelector('.ttl').textContent).toBe('Push')
    expect(row.querySelector('.tag').textContent).toBe('Edit')
    act(() => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(nav).toHaveBeenCalledWith('/workout')
  })

  it('still reads a running session as in progress', () => {
    setS({ active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } })
    mount()
    const row = host.querySelector('.today-row')
    expect(row.querySelector('.ttl').textContent).toBe('Push (in progress)')
    expect(row.querySelector('.tag').textContent).toBe('Resume')
  })
})
