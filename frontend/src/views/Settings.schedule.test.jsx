// @vitest-environment happy-dom
// Settings → Plan & schedule → How you train: the control's selection is DERIVED from the live queue (never stored),
// Fixed Week clears the pass after confirming and keeps the rotation, and Rotation
// either starts a pass from the saved sequence or sends you to Plan.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, nav: null }
  state.snapshot = () => ({
    S: state.S,
    user: null,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
    replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(),
    signOut: vi.fn(), signOutAll: vi.fn(), resetDemo: vi.fn(), disconnectServer: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(), webauthnOK: () => false, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false,
}))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), syncReminder: vi.fn() }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  loadStarterPlan: vi.fn(), starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(),
  importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(), menuSheet: vi.fn(),
}))
vi.mock('../lib/update.js', () => ({ checkForUpdate: vi.fn(), downloadAndInstall: vi.fn() }))

import { confirmSheet } from '../sheets.jsx'
import { todayISO } from '../lib/format.js'

const routines = [{ id: 'a', name: 'A', emoji: null, ex: [] }, { id: 'b', name: 'B', emoji: null, ex: [] }]
const baseS = over => ({
  unit: 'kg', lang: 'en', weekStart: 1, theme: 'dark', accent: 'lime', restSec: 90,
  workoutView: 'cards', wc: {}, reminder: { on: false, time: '08:00', tz: null }, effort: null,
  routines, week: {}, dayPlan: {}, workouts: [], bodyweight: [], exWeights: {}, customEx: [],
  equipProfiles: [], activeEquipId: null, gymCards: [], favEx: [], exNotes: {}, barWeights: {},
  queue: null, rotation: null, scheduleMode: null, active: null, ...over,
})

let host, root
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  mocks.nav = vi.fn(); confirmSheet.mockClear()
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mount = over => { mocks.S = baseS(over); act(() => root.render(<Settings page="plan" />)) }
describe('Settings — Plan & schedule', () => {
  it('offers weekday start choices without a rotation switch', () => {
    mount({ scheduleMode: 'rotation', rotation: { id: 'r1', sequence: ['a', 'b'] },
      queue: { ids: ['a', 'b'], since: Date.now(), startsOn: todayISO(), rotationId: 'r1' } })
    expect(host.textContent).toContain('Week starts on')
    expect(host.textContent).not.toContain('How you train')
    expect(host.textContent).not.toContain('Fixed Week')
    expect(host.textContent).not.toContain('Rotation')
    const sunday = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sunday')
    act(() => sunday.click())
    expect(mocks.S.weekStart).toBe(0)
  })

  it('leaves a coach queue alone while the weekday preference changes', () => {
    const queue = { ids: ['a', 'b'], since: Date.now(), startsOn: todayISO(), label: 'Coach week' }
    mount({ queue })
    const sunday = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sunday')
    act(() => sunday.click())
    expect(mocks.S.queue).toEqual(queue)
    expect(mocks.S.weekStart).toBe(0)
  })
})
