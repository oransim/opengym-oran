// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Routines from './Routines.jsx'
import RoutineCatalog from './RoutineCatalog.jsx'
import { DEF, useStore } from '../store/useStore.js'
import catalog from '../lib/routine-catalog.json'


globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, router, oldS, oldUser
beforeEach(() => {
  oldS = useStore.getState().S
  oldUser = useStore.getState().user
  useStore.setState({
    user: { id: 'test', name: 'test' },
    S: {
      ...structuredClone(DEF),
      routines: [
        { id: 'work', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8 }] },
        { id: 'class', name: 'Yoga', kind: 'visit', ex: [] },
        { id: 'repeat', name: 'Adductor stretch', kind: 'exercise-repeat', ex: [{ id: '4512', sets: 2, sec: 30 }] },
      ],
    },
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  router = createMemoryRouter([
    { path: '/routines', element: <Routines /> },
    { path: '/routines/catalog', element: <RoutineCatalog /> },
    { path: '/routines/r/:id', element: <div>Routine editor</div> },
  ], { initialEntries: ['/routines'] })
  act(() => root.render(<RouterProvider router={router} />))
})
afterEach(() => {
  act(() => root.unmount())
  router.dispose()
  host.remove()
  useStore.setState({ S: oldS, user: oldUser })
})
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)

describe('Routines root view', () => {
  it('opens the catalog without listing every bundled entry on the personal screen', async () => {
    expect(host.textContent).not.toContain('Side split routine')
    await act(async () => button('Browse library').click())
    expect(router.state.location.pathname).toBe('/routines/catalog')
  })
  it('shows routines and classes in separate lists, excluding repeat exercises', () => {
    expect(host.textContent).toContain('Push')
    expect(host.textContent).not.toContain('Yoga')
    expect(host.textContent).not.toContain('Adductor stretch')
    act(() => button('Classes').click())
    expect(host.textContent).toContain('Yoga')
    expect(host.textContent).not.toContain('Push')
    expect(host.textContent).not.toContain('Adductor stretch')
  })

  it('creates the selected type and opens its editor', async () => {
    act(() => button('Classes').click())
    await act(async () => button('New class').click())
    const made = useStore.getState().S.routines.find(r => r.name === 'New class')
    expect(made?.kind).toBe('visit')
    expect(router.state.location.pathname).toBe(`/routines/r/${made.id}`)
  })

  it('offers bundled routines and classes on a separate screen as copies', async () => {
    expect(catalog.routines.filter(r => r.kind === 'visit').map(r => r.name)).toEqual(['yoga', 'Pilates', 'tricking', 'climbing', 'functional'])
    await act(async () => button('Browse library').click())
    expect(host.textContent).toContain('Side split routine')
    await act(async () => button('Add to my routines').click())
    expect(useStore.getState().S.routines.find(r => r.name === 'Push')).toBeTruthy()
    expect(useStore.getState().S.routines.find(r => r.name === 'Side split routine')?.id).not.toBe('flex-24e03a58582c')
    act(() => button('Classes').click())
    expect(host.textContent).toContain('climbing')
    expect(host.textContent).not.toContain('Side split routine')
    await act(async () => button('Add to my classes').click())
    expect(useStore.getState().S.routines.some(r => r.kind === 'visit' && r.name === 'yoga')).toBe(true)
  })

  it('filters the catalog by name and returns to personal routines', async () => {
    await act(async () => button('Browse library').click())
    const search = host.querySelector('input[placeholder="Search…"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'pancake')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.textContent).toContain('Pancake split routine')
    expect(host.textContent).not.toContain('Side split routine')
    await act(async () => button('My routines').click())
    expect(router.state.location.pathname).toBe('/routines')
  })

  it('shows a manageable first page when the catalog grows', async () => {
    const extra = Array.from({ length: 50 }, (_, i) => ({ id: `test-${i}`, name: `Added routine ${i}`, ex: [] }))
    catalog.routines.push(...extra)
    try {
      await act(async () => button('Browse library').click())
      expect(host.textContent).toContain('Added routine 0')
      expect(host.textContent).not.toContain('Added routine 49')
      await act(async () => button('Show more').click())
      expect(host.textContent).toContain('Added routine 49')
    } finally {
      catalog.routines.splice(-extra.length)
    }
  })

  it('brings along the bundled custom exercise used by Tricking power', async () => {
    await act(async () => button('Browse library').click())
    const add = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Add to my routines')
    await act(async () => add.at(-2).click())
    const state = useStore.getState().S
    const routine = state.routines.find(r => r.name === 'Tricking power')
    expect(routine).toBeTruthy()
    expect(state.customEx.some(e => e.id === routine.ex[0].id && e.n === 'Tricking power warm-up')).toBe(true)
  })
})
