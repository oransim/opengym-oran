// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'
import Plan from './Plan.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  dayAssignSheet: vi.fn(), scheduleItemSheet: vi.fn(), repeatDaysSheet: vi.fn(), scheduleDaysSheet: vi.fn(),
  startFlow: vi.fn(), starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), menuSheet: vi.fn(),
  planHasRoutines: () => true, exportPlanFile: vi.fn(), printWholePlan: vi.fn(), importPlanFile: vi.fn(),
}))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original
beforeEach(() => {
  original = useStore.getState()
  const S = structuredClone(DEF)
  S.routines = [
    { id: 'old', name: 'Old rotation', ex: [{ id: '0025' }] },
    { id: 'own', name: 'My weekday', ex: [{ id: '0025' }] },
  ]
  S.week = { [new Date(`${todayISO()}T12:00:00`).getDay()]: ['own'] }
  S.rotation = { id: 'rot', sequence: ['old'] }
  S.scheduleMode = 'rotation'
  S.queue = { ids: ['old'], since: Date.now() - 1000, startsOn: todayISO(), rotationId: 'rot' }
  useStore.setState({ S, user: null })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState(original) })

it('shows weekdays with no personal rotation control or queue, while retaining its data', () => {
  act(() => root.render(<Plan />))
  expect(host.querySelector('.plan-mode')).toBeNull()
  expect(host.querySelector('.rotation')).toBeNull()
  expect(host.querySelector('.plan-coach-week')).toBeNull()
  expect(host.textContent).toContain('My weekday')
  expect(host.textContent).toContain('Choose weekdays')
  expect(useStore.getState().S.rotation.sequence).toEqual(['old'])
})

it('shows an external queue as Coach week above the calendar', () => {
  useStore.getState().update(s => { s.queue.rotationId = 'coach' }, false)
  act(() => root.render(<Plan />))
  const card = host.querySelector('.plan-coach-week')
  expect(card).toBeTruthy()
  expect(card.textContent).toContain('Coach week')
  expect(card.textContent).toContain('Old rotation')
  expect(card.compareDocumentPosition(host.querySelector('.plan-calendar')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
