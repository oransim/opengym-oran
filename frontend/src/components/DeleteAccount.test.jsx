// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccountSheet, DeleteAccountRow, deleteAccountError } from './DeleteAccount.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { sheets: [], proofs: { set: true, deleteBlocked: null } }
  state.toast = vi.fn()
  state.deleteAccount = vi.fn(async () => {})
  state.api = vi.fn(async path => path === '/api/account/password' ? state.proofs : {})
  state.snapshot = () => ({ user: { id: 'u1', name: 'Mallory' }, deleteAccount: state.deleteAccount })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: (render, opts) => { mocks.sheets.push({ render, opts }) } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({ api: (...a) => mocks.api(...a) }))

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const alertText = host => host.querySelector('[role="alert"]')?.textContent || null
function type(el, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function toProof(host, name = 'Mallory') {
  await settle()
  type(host.querySelector('#delete-account-name'), name)
  act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await settle()
}
function sheet(props = {}) {
  const handlers = { close: vi.fn(), exportBackup: vi.fn(), exportBackupZip: vi.fn(), done: vi.fn(), hasMedia: false, ...props }
  return { handlers, host: mount(<DeleteAccountSheet {...handlers} />) }
}
const fail = (status, data) => Object.assign(new Error(data?.error || 'HTTP ' + status), { status, data })

beforeEach(() => {
  mocks.proofs = { set: true, deleteBlocked: null }
  mocks.api.mockClear()
  mocks.sheets.length = 0
  mocks.toast.mockClear()
  mocks.deleteAccount.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { for (const { root, host } of mounted.splice(0)) { act(() => root.unmount()); host.remove() } })

describe('DeleteAccountSheet', () => {
  it('offers a JSON backup, or a zip when there are photos and videos', () => {
    const plain = sheet()
    act(() => button(plain.host, 'Export backup (JSON)').click())
    expect(plain.handlers.exportBackup).toHaveBeenCalledOnce()
    const media = sheet({ hasMedia: true })
    act(() => button(media.host, 'Export with photos & videos (.zip)').click())
    expect(media.handlers.exportBackupZip).toHaveBeenCalledOnce()
  })

  it('requires the exact account name before asking for the current password', async () => {
    const { host } = sheet()
    await settle()
    expect(button(host, 'Continue').disabled).toBe(true)
    type(host.querySelector('#delete-account-name'), 'mallory')
    expect(button(host, 'Continue').disabled).toBe(true)
    type(host.querySelector('#delete-account-name'), 'Mallory ')
    await toProof(host, 'Mallory ')
    expect(host.querySelector('input[placeholder="Current password"]')).toBeTruthy()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('sends the current password with the delete, then closes and confirms it', async () => {
    const { handlers, host } = sheet()
    await toProof(host)
    type(host.querySelector('input[placeholder="Current password"]'), 'correct horse battery staple')
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mocks.deleteAccount).toHaveBeenCalledWith('Mallory', { current: 'correct horse battery staple' })
    expect(handlers.close).toHaveBeenCalledOnce()
    expect(handlers.done).toHaveBeenCalledOnce()
    expect(mocks.toast).toHaveBeenCalledWith('Your account is gone. Thanks for every rep.')
  })

  it('keeps the sheet open after a wrong password', async () => {
    mocks.deleteAccount.mockRejectedValue(fail(403, { code: 'current-wrong' }))
    const { handlers, host } = sheet()
    await toProof(host)
    type(host.querySelector('input[placeholder="Current password"]'), 'wrong')
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(alertText(host)).toBe('Your current password is not right.')
    expect(handlers.close).not.toHaveBeenCalled()
  })

  it('blocks the last admin before entering the account name', async () => {
    mocks.proofs = { set: true, deleteBlocked: 'last-admin' }
    const { host } = sheet()
    await settle()
    expect(alertText(host)).toMatch(/only admin/)
    expect(host.querySelector('#delete-account-name')).toBeNull()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('explains that an account without a password needs a setup link first', async () => {
    mocks.proofs = { set: false, deleteBlocked: null }
    const { host } = sheet()
    await toProof(host)
    expect(host.textContent).toContain('This account has no password yet. Ask an admin for a reset code before deleting it.')
    expect(host.querySelector('input[placeholder="Current password"]')).toBeNull()
    expect(button(host, 'Delete forever')).toBeUndefined()
  })
})

describe('deleteAccountError', () => {
  it('names known refusals and gives a safe fallback', () => {
    expect(deleteAccountError(fail(400, { code: 'confirm-name' }))).toBe('That is not your account name.')
    expect(deleteAccountError(fail(409, { code: 'last-admin' }))).toMatch(/only admin/)
    expect(deleteAccountError(fail(403, { code: 'current-wrong' }))).toBe('Your current password is not right.')
    expect(deleteAccountError(fail(500, {}))).toBe('Couldn’t delete the account. Nothing was removed.')
  })
})

describe('DeleteAccountRow', () => {
  it('opens the account deletion sheet', () => {
    const host = mount(<DeleteAccountRow exportBackup={vi.fn()} hasMedia={false} />)
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Delete my account')).click())
    expect(mocks.sheets).toHaveLength(1)
  })
})
