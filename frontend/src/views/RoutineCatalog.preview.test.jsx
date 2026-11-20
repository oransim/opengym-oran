// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoutineCatalog from './RoutineCatalog.jsx'
import Modals from '../components/Modals.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import catalog from '../lib/routine-catalog.json'

vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original, originalUI
const button = (container, label) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const preview = () => host.querySelector('.routine-catalog-preview')
const mount = () => act(() => root.render(<MemoryRouter><RoutineCatalog /><Modals /></MemoryRouter>))
function openPreview(name) {
  const row = [...host.querySelectorAll('.routine-catalog-results > .item')].find(r => r.querySelector('.tt').textContent === name)
  const details = button(row, 'Details')
  expect(details).toBeTruthy()
  act(() => details.click())
  expect(preview()).not.toBeNull()
  return preview()
}

beforeEach(() => {
  vi.useFakeTimers()
  original = useStore.getState()
  originalUI = useUI.getState()
  localStorage.clear()
  window.scrollTo = vi.fn()
  useStore.setState({ S: { ...structuredClone(DEF), routines: [{ id: 'mine', name: 'My routine', ex: [] }], customEx: [] }, user: null })
  useUI.setState({ sheets: [], toastMsg: '' })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  mount()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState(original)
  useUI.setState(originalUI)
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('routine library preview before adding', () => {
  it('shows the exercises, durations, reps and notes without adding anything', () => {
    const before = structuredClone(useStore.getState().S)
    const storage = localStorage.getItem('gym_state_v1')
    const sheet = openPreview('Side split routine')
    const rows = [...sheet.querySelectorAll('.list > .item')]
    expect(rows).toHaveLength(8)
    expect(rows[0].querySelector('.tt').textContent.toLowerCase()).toBe('marching on spot')
    expect(rows[0].textContent).toContain('1 × 3:00')
    expect(rows[0].textContent).toContain('Easy pace to warm up.')
    expect(rows[1].textContent).toContain('1 × 20')
    expect(rows.at(-1).querySelector('.tt').textContent.toLowerCase()).toBe('side split')
    expect(useStore.getState().S).toEqual(before)
    expect(localStorage.getItem('gym_state_v1')).toBe(storage)
    act(() => button(sheet, 'Close').click())
    expect(preview()).toBeNull()
    expect(useStore.getState().S).toEqual(before)
  })

  it('adds the routine from its preview as a fresh copy and dismisses the sheet', () => {
    const source = structuredClone(catalog.routines[0])
    const sheet = openPreview('Side split routine')
    act(() => button(sheet, 'Add to my routines').click())
    const saved = useStore.getState().S.routines
    expect(saved).toHaveLength(2)
    expect(saved[0].id).toBe('mine')
    expect(saved[1].id).not.toBe(source.id)
    expect(saved[1].name).toBe('Side split routine')
    expect(saved[1].ex).toHaveLength(8)
    expect(saved[1].ex[0]).toMatchObject({ id: '4420', sets: 1, mode: 'time', sec: 180 })
    expect(preview()).toBeNull()
    expect(catalog.routines[0]).toEqual(source)
  })

  it('shows a bundled custom exercise before importing it', () => {
    const sheet = openPreview('Tricking power')
    expect(sheet.querySelector('.list .tt').textContent).toBe('Tricking power warm-up')
    expect(useStore.getState().S.customEx).toEqual([])
    act(() => button(sheet, 'Add to my routines').click())
    const saved = useStore.getState().S
    const routine = saved.routines.find(r => r.name === 'Tricking power')
    expect(saved.customEx.some(ex => ex.id === routine.ex[0].id && ex.n === 'Tricking power warm-up')).toBe(true)
  })

  it('previews classes with no exercise list without creating an empty routine', () => {
    act(() => button(host, 'Classes').click())
    const sheet = openPreview('yoga')
    expect(sheet.textContent).toContain('No exercises yet.')
    expect(useStore.getState().S.routines).toHaveLength(1)
    act(() => button(sheet, 'Add to my classes').click())
    expect(useStore.getState().S.routines[1]).toMatchObject({ name: 'yoga', kind: 'visit', ex: [] })
  })

  it('previews weights in the same units that the imported copy will use', () => {
    const routine = { id: 'preview-weight', name: 'Weighted preview', ex: [{ id: '0025', sets: 3, reps: 8, weight: 10 }] }
    catalog.routines.push(routine)
    try {
      mount()
      const sheet = openPreview('Weighted preview')
      expect(sheet.querySelector('.ss').textContent).toContain('3 × 8 · 10 kg')
      act(() => useStore.setState(s => ({ S: { ...s.S, unit: 'lb' } })))
      expect(sheet.querySelector('.ss').textContent).toContain('3 × 8 · 22 lb')
      act(() => button(sheet, 'Add to my routines').click())
      expect(useStore.getState().S.routines[1].ex[0].weight).toBe(22)
      expect(routine.ex[0].weight).toBe(10)
    } finally {
      catalog.routines.pop()
    }
  })
})
