// @vitest-environment happy-dom
// A tap on a page's own back button brings the page it goes to back where it was scrolled to, as
// the edge swipe back (which presses that same button) and the system back already did. Its push
// used to open the page at the top, so Stats scrolled down, then Structural balance and back,
// started over.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { DEF, useStore } from './store/useStore.js'
import { api } from './lib/api.js'

vi.mock('./lib/sound.js', async importOriginal => ({ ...(await importOriginal()), setPlayOnSilent: vi.fn(), setVibrate: vi.fn(), setAlarmBuzzer: vi.fn(), setNativeBuzzer: vi.fn() }))
vi.mock('./lib/api.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, api: vi.fn(() => Promise.resolve({})), beacon: vi.fn() }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, originalS, originalUser, scrolls
const go = async hash => { await act(async () => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new PopStateEvent('popstate')) }) }
const scrolledTo = async y => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  await act(async () => { window.dispatchEvent(new Event('scroll')) })
}
const frame = () => act(async () => { await new Promise(r => requestAnimationFrame(() => r())) })
const tap = async el => { await act(async () => { el.click() }); await frame() }
// A screen loaded on demand (App.jsx lazyView) renders a few turns after its route does.
const appear = async find => {
  const get = typeof find === 'string' ? () => document.querySelector(find) : find
  for (let i = 0; i < 500 && !get(); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  return get()
}

beforeEach(async () => {
  originalS = useStore.getState().S
  originalUser = useStore.getState().user
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)) })
  localStorage.setItem('gym_guest', '1')
  window.location.hash = '#/stats'
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  scrolls = []
  window.scrollTo = vi.fn((x, y) => { scrolls.push([x, y]); Object.defineProperty(window, 'scrollY', { configurable: true, value: y }) })
  await act(async () => { root.render(<App />) })
  await appear('#app .hdr button[aria-label="History"]')   // Stats loads on demand too
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState({ S: originalS })
  useStore.setState({ user: originalUser })
  localStorage.removeItem('gym_guest')
})

describe("a page's own back button", () => {
  it('returns from Admin to the Settings entry that opened it without leaving Admin behind', async () => {
    vi.mocked(api).mockImplementation(path => Promise.resolve(path === '/api/admin/coach' ? { disabledByEnv: true } : {}))
    await act(async () => { useStore.setState({ user: { id: 'admin-test', name: 'Admin', admin: true } }) })
    await go('#/settings/account')
    const admin = await appear(() => [...document.querySelectorAll('#app button')].find(b => b.textContent.includes('Admin dashboard')))
    await tap(admin)
    expect(window.location.hash).toBe('#/admin')
    const adminIndex = window.history.state.idx
    await tap(await appear('#app [data-back="/settings/account"]'))
    expect(window.location.hash).toBe('#/settings/account')
    expect(window.history.state.idx).toBe(adminIndex - 1)
  })

  it('returns from History to its existing Stats entry', async () => {
    await tap(document.querySelector('#app .hdr button[aria-label="History"]'))
    const historyIndex = window.history.state.idx
    await tap(await appear('#app [data-back="/stats"]'))
    expect(window.location.hash).toBe('#/stats')
    expect(window.history.state.idx).toBe(historyIndex - 1)
  })

  it('replaces a detail page with its parent when its parent is not the previous entry', async () => {
    await go('#/plan')
    await go('#/history')
    const historyIndex = window.history.state.idx
    await tap(await appear('#app [data-back="/stats"]'))
    expect(window.location.hash).toBe('#/stats')
    expect(window.history.state.idx).toBe(historyIndex)
  })

  it('returns from Fasting to the Home entry that opened it', async () => {
    await go('#/home')
    const fasting = await appear(() => [...document.querySelectorAll('#app button, #app [role="button"]')].find(b => b.textContent.includes('Fasting')))
    await tap(fasting)
    expect(window.location.hash).toBe('#/fasting')
    const fastingIndex = window.history.state.idx
    await tap(await appear('#app [data-back="/home"]'))
    expect(window.location.hash).toBe('#/home')
    expect(window.history.state.idx).toBe(fastingIndex - 1)
  })

  it('replaces an unavailable routine editor instead of leaving a broken entry behind', async () => {
    await go('#/routines/r/missing-routine')
    const editorIndex = window.history.state.idx
    await appear(() => window.location.hash === '#/routines')
    expect(window.location.hash).toBe('#/routines')
    expect(window.history.state.idx).toBe(editorIndex)
  })

  it('brings Stats back where it was scrolled, not at the top', async () => {
    await scrolledTo(900)
    await tap(document.querySelector('#app .hdr button[aria-label="History"]'))
    expect(window.location.hash).toBe('#/history')
    expect(scrolls.at(-1)).toEqual([0, 0])          // a page you open starts at the top
    await tap(await appear('#app [data-back]'))
    expect(window.location.hash).toBe('#/stats')
    expect(scrolls.at(-1)).toEqual([0, 900])
  })

  it('takes Body measurements back to Stats, the screen it is opened from', async () => {
    await go('#/measurements')
    const back = await appear('#app [data-back]')
    expect(back.getAttribute('data-back')).toBe('/stats')
    await tap(back)
    expect(window.location.hash).toBe('#/stats')
  })

  it('a page opened at the top is remembered at the top, though no scroll event says so', async () => {
    const row = text => [...document.querySelectorAll('#app button, #app [role="button"]')].find(b => b.textContent.trim().startsWith(text))
    await go('#/settings/workout')
    await scrolledTo(400)                                    // an earlier visit, left halfway down
    await go('#/settings')
    await tap(await appear(() => row('Workout')))            // opened again: at the top
    expect(window.location.hash).toBe('#/settings/workout')
    await tap(row('Fine-tuning'))
    await tap(document.querySelector('#app [data-back]'))    // back the way it came
    expect(window.location.hash).toBe('#/settings/workout')
    expect(scrolls.at(-1)).toEqual([0, 0])
  })
})
