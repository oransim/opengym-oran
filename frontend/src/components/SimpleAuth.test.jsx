// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { SimpleLogin, SimpleAccountForm } from './SimpleAuth.jsx'
import { ProveOwner } from './PasswordAuth.jsx'
import { signInAgain } from './ServerSync.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const m = vi.hoisted(() => ({ calls: [], sheets: [], user: null, fail: null, config: { simple_login: true, password_login: true, email_reset: true } }))
vi.mock('../lib/api.js', () => ({
  api: async (path, opts) => { m.calls.push({ path, body: JSON.parse(opts?.body || '{}') }); if (m.fail) throw m.fail; return { ok: true } },
  passwordLogin: async (name, password) => { m.calls.push({ path: 'login', body: { name, password } }); if (m.fail) throw m.fail; return { id: 'u1', name } },
  passwordRegister: async (name, password, code, email) => { m.calls.push({ path: 'register', body: { name, password, code, email } }); return { id: 'u1', name } },
  webauthnOK: () => true, passkeyAssertion: vi.fn(),
}))
vi.mock('../store/useStore.js', () => {
  const state = () => ({ config: m.config, S: {}, setUser: u => { m.user = u }, adoptProfile: async () => {}, pushState: async () => {}, pullState: async () => {} })
  const useStore = s => s ? s(state()) : state(); useStore.getState = state
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => { const useUI = () => ({}); useUI.getState = () => ({ toast: () => {}, openSheet: render => m.sheets.push(render) }); return { useUI } })
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: () => {} }))
let root, host
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const type = (name, value) => act(() => { const el = host.querySelector(`[name="${name}"]`); Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
const submit = async () => { act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle() }
const mount = props => act(() => root.render(<SimpleLogin {...props} />))
beforeEach(() => { m.calls = []; m.sheets = []; m.user = null; m.fail = null; window.location.hash = '#/home'; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => act(() => { root.unmount(); host.remove() }))
it('offers only simple sign-in and signs into the named profile', async () => {
  mount(); expect(host.querySelector('[autocomplete="username"]')).toBeTruthy(); expect(host.querySelector('[autocomplete="current-password"]')).toBeTruthy()
  expect(host.textContent).not.toMatch(/passkey|QR|other device|reset code/i)
  type('username', 'oran'); type('password', 'my sufficiently long password'); await submit()
  expect(m.user).toEqual({ id: 'u1', name: 'oran' }); expect(m.calls[0].body.name).toBe('oran')
})
it('sends a reset request and acknowledges it without claiming an account exists', async () => {
  mount(); act(() => button('Forgot password?').click()); type('email', 'oran@example.com'); await submit()
  expect(m.calls[0]).toEqual({ path: '/api/login/forgot-password', body: { email: 'oran@example.com' } })
  expect(host.textContent).toContain('If an account uses that email'); expect(m.user).toBeNull()
})
it('shows mail delivery errors instead of a success message', async () => {
  m.fail = Object.assign(new Error('Password reset email is unavailable.'), { status: 503, data: { code: 'email-unavailable' } })
  mount(); act(() => button('Forgot password?').click()); type('email', 'oran@example.com'); await submit()
  expect(host.querySelector('[role="alert"]').textContent).toContain('unavailable'); expect(host.textContent).not.toContain('If an account uses that email')
})
it('requires a valid recovery email when creating an account', async () => {
  mount(); act(() => button('Create account').click()); type('username', 'oran'); type('password', 'my sufficiently long password'); type('confirm-password', 'my sufficiently long password'); await submit()
  expect(m.calls.length).toBe(0); expect(host.querySelector('[role="alert"]').textContent).toContain('email')
  type('email', 'recovery@example.com'); await submit(); expect(m.calls[0].body.email).toBe('recovery@example.com')
})
it('resets from an email link, removes the token from the URL, and asks for ordinary sign-in', async () => {
  window.location.hash = '#/reset-password?token=' + 'x'.repeat(43)
  mount({ resetPage: true, resetToken: 'x'.repeat(43) }); type('password', 'my sufficiently long password'); type('confirm-password', 'my sufficiently long password'); await submit()
  expect(m.calls[0]).toEqual({ path: '/api/login/reset-password', body: { token: 'x'.repeat(43), password: 'my sufficiently long password' } })
  expect(m.user).toBeNull(); expect(window.location.hash).not.toContain('token='); expect(host.textContent).toContain('Password updated'); expect(host.querySelector('[autocomplete="current-password"]')).toBeTruthy()
})
it('rejects mismatched passwords before sending a reset', async () => {
  mount({ resetPage: true, resetToken: 'x'.repeat(43) }); type('password', 'my sufficiently long password'); type('confirm-password', 'different sufficiently long password'); await submit()
  expect(m.calls.length).toBe(0); expect(host.querySelector('[role="alert"]').textContent).toContain('match')
})
it('an expired link offers a new email link, not a code or passkey fallback', async () => {
  m.fail = Object.assign(new Error('expired'), { status: 400, data: { code: 'reset-invalid' } })
  mount({ resetPage: true, resetToken: 'x'.repeat(43) }); type('password', 'my sufficiently long password'); type('confirm-password', 'my sufficiently long password'); await submit()
  expect(host.querySelector('[role="alert"]').textContent).toContain('new link'); expect(button('Request a new link')).toBeTruthy(); expect(host.textContent).not.toMatch(/passkey|reset code/i)
})
it('changing recovery email requires the current password and submits it with the address', async () => {
  const close = vi.fn(), done = vi.fn()
  act(() => root.render(<SimpleAccountForm kind="email" status={{ name: 'oran', email: 'old@example.com' }} close={close} done={done} />))
  type('email', 'new@example.com'); await submit(); expect(m.calls).toHaveLength(0)
  type('current-password', 'current sufficiently long password'); await submit()
  expect(m.calls[0]).toEqual({ path: '/api/account/email', body: { current: 'current sufficiently long password', email: 'new@example.com' } })
  expect(close).toHaveBeenCalled(); expect(done).toHaveBeenCalled()
})
it('sensitive account actions offer current-password confirmation without passkeys in simple mode', () => {
  act(() => root.render(<ProveOwner passkey password onProof={async () => {}} />))
  expect(host.querySelector('[autocomplete="current-password"]')).toBeTruthy()
  expect(host.textContent).not.toContain('Confirm with a passkey')
})
it('re-authentication after sync expires opens the simple flow without legacy recovery choices', () => {
  signInAgain(); act(() => root.render(m.sheets[0](() => {})))
  expect(host.querySelector('[autocomplete="username"]')).toBeTruthy()
  expect(host.textContent).not.toMatch(/passkey|reset code|other device/i)
})
