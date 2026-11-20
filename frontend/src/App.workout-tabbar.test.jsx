// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { todayISO } from './lib/format.js'

vi.mock('./lib/sound.js', () => ({
  setPlayOnSilent: vi.fn(), setVibrate: vi.fn(), setAlarmBuzzer: vi.fn(),
  beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn(),
}))
vi.mock('./lib/api.js', async importOriginal => ({
  ...await importOriginal(), api: vi.fn(() => Promise.resolve({})), beacon: vi.fn(),
}))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original

beforeEach(() => {
  original = useStore.getState()
  localStorage.setItem('gym_guest', '1')
  window.location.hash = '#/workout'
  window.scrollTo = vi.fn()
  const S = structuredClone(DEF)
  S.sound = false
  S.active = { id: 'test', name: 'Test', start: Date.now(), cur: 0, entries: [
    { id: '1001', target: { mode: 'reps' }, sets: [{ w: 10, r: 5, done: false }, { w: 10, r: 5, done: false }] },
  ] }
  useStore.setState({ S, user: null, ready: true, boot: vi.fn() })
  useUI.setState({ sheets: [], work: null, timer: null })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useUI.getState().stopRest()
  useUI.getState().stopWork()
  useStore.setState(original)
  localStorage.clear()
})

// The owner, 2026-10-14: no extra bottom button to complete or finish during a workout (#563 is
// undone). The running workout has the whole screen again; Finish lives in its header.
it('a minimized workout resumes from the day card while the tabs stay for navigation', async () => {
  await act(async () => root.render(<App />))
  expect(host.querySelector('#tabbar')).toBeNull()
  expect(document.body.classList.contains('no-tabbar')).toBe(true)
  await act(async () => host.querySelector('.whdr button[aria-label="Minimize"]').click())
  expect(host.querySelectorAll('#tabbar button')).toHaveLength(5)
  expect(host.querySelector('.today-row .tag').textContent).toBe('Resume')
  await act(async () => host.querySelector('.today-row').click())
  expect(host.querySelector('#tabbar')).toBeNull()
  expect(useStore.getState().S.active.entries[0].sets.map(s => s.done)).toEqual([false, false])
})

it.each([{ editingWorkoutId: 'saved' }, { backfill: true }])('past workouts have no tab bar either: %j', async flags => {
  useStore.getState().update(s => Object.assign(s.active, flags), false)
  await act(async () => root.render(<App />))
  expect(host.querySelector('#tabbar')).toBeNull()
  expect(document.body.classList.contains('no-tabbar')).toBe(true)
})

it('opens a completed day’s editor without leaving the calendar sheet over it', async () => {
  window.location.hash = '#/home'
  useStore.getState().update(s => {
    const { entries } = s.active
    entries[0].sets[0].done = true
    s.workouts = [{ id: 'saved', d: todayISO(), name: 'Saved workout', start: Date.now() - 3600000,
      end: Date.now() - 1800000, routineIds: [], entries }]
    s.active = null
    s.week = {}
    s.dayPlan = {}
  }, false)
  await act(async () => root.render(<App />))
  await act(async () => host.querySelector('.today-row').click())
  await act(async () => host.querySelector('#modal-root section[aria-label="Done"] .item').click())
  const edit = [...host.querySelectorAll('#modal-root button')].find(b => b.textContent === 'Edit workout')
  expect(edit).toBeTruthy()
  await act(async () => edit.click())
  expect(useStore.getState().S.active?.editingWorkoutId).toBe('saved')
  expect(host.querySelector('#modal-root')).toBeNull()
  expect(host.querySelector('.whdr')).not.toBeNull()
})
