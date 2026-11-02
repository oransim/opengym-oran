// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(() => Promise.reject(new Error('offline'))), beacon: vi.fn() }))

import { DEF, useStore } from '../store/useStore.js'
import Fasting from './Fasting.jsx'

const clone = value => structuredClone(value)
let host, root
const button = name => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === name)

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.setState({ S: clone(DEF), user: null, ready: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

it('starts a fast, shows its timer, then saves its duration in history', () => {
  act(() => root.render(<MemoryRouter><Fasting /></MemoryRouter>))
  expect(button('Start fast')).toBeTruthy()
  act(() => button('Start fast').click())
  expect(useStore.getState().S.fasts).toBeTruthy()
  expect(button('End fast')).toBeTruthy()
  expect(host.textContent).toContain('0:00:00')
  act(() => button('End fast').click())
  expect(button('Start fast')).toBeTruthy()
  expect(host.textContent).toContain('History')
  expect(host.textContent).toContain('0:00:00')
  expect(Object.values(useStore.getState().S.fasts)[0].end).toBeGreaterThan(0)
})

it('shows elapsed time from a fast already stored in the profile', () => {
  vi.spyOn(Date, 'now').mockReturnValue(3_601_000)
  useStore.setState(s => ({ S: { ...s.S, fasts: { old: { id: 'old', start: 1_000, _ts: 1_000 } } } }))
  act(() => root.render(<MemoryRouter><Fasting /></MemoryRouter>))
  expect(host.textContent).toContain('1:00:00')
})
