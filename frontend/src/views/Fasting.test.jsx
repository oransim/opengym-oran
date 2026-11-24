// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(() => Promise.reject(new Error('offline'))), beacon: vi.fn() }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Fasting from './Fasting.jsx'

const clone = value => structuredClone(value)
let host, root
const button = name => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === name)
const fasts = () => Object.values(useStore.getState().S.fasts)
const render = () => act(() => root.render(<MemoryRouter><Fasting /><Sheets /></MemoryRouter>))
function Sheets() {
  const sheets = useUI(s => s.sheets)
  return <>{sheets.map(s => <div key={s.id}>{s.render(() => useUI.getState().closeSheet(s.id))}</div>)}</>
}
const picker = () => host.querySelector('input[type="datetime-local"]')
const submit = () => act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
const chooseTime = value => act(() => {
  const input = picker()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.setState({ S: clone(DEF), user: null, ready: true })
  useUI.setState({ sheets: [] })
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-22T12:34:56').getTime())
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useUI.getState().closeAll(); vi.useRealTimers(); vi.restoreAllMocks() })

it('starts a fast, shows its timer, then saves its duration in history', () => {
  render()
  expect(button('Start fast')).toBeTruthy()
  act(() => button('Start fast').click())
  expect(fasts()).toEqual([])
  expect(picker().value).toBe('2026-11-22T12:34')
  submit()
  expect(fasts()[0].start).toBe(Date.now())
  expect(button('End fast')).toBeTruthy()
  expect(host.textContent).toContain('0:00:00')
  act(() => button('End fast').click())
  expect(fasts()[0].end).toBeUndefined()
  submit()
  expect(button('Start fast')).toBeTruthy()
  expect(host.textContent).toContain('History')
  expect(host.textContent).toContain('0:00:00')
  expect(fasts()[0].end).toBe(Date.now())
})

it('shows elapsed time from a fast already stored in the profile', () => {
  vi.spyOn(Date, 'now').mockReturnValue(3_601_000)
  useStore.setState(s => ({ S: { ...s.S, fasts: { old: { id: 'old', start: 1_000, _ts: 1_000 } } } }))
  act(() => root.render(<MemoryRouter><Fasting /></MemoryRouter>))
  expect(host.textContent).toContain('1:00:00')
})

it('records a whole fast in the past using local dates and times', () => {
  render()
  act(() => button('Start fast').click())
  chooseTime('2026-11-20T20:30')
  submit()
  expect(fasts()[0].start).toBe(new Date('2026-11-20T20:30').getTime())
  expect(host.querySelector('[role="timer"]').textContent).toBe('40:04:56')
  act(() => button('End fast').click())
  chooseTime('2026-11-21T12:30')
  submit()
  expect(fasts()[0].end).toBe(new Date('2026-11-21T12:30').getTime())
  expect(fasts()[0]._ts).toBeGreaterThanOrEqual(Date.now())
  expect(host.querySelector('[role="timer"]')).toBeNull()
  expect(host.textContent).toContain('16:00:00')
  expect(picker()).toBeNull()
})

it('cancels a start or end without changing the saved fast', () => {
  render()
  act(() => button('Start fast').click())
  chooseTime('2026-11-21T20:30')
  act(() => button('Cancel').click())
  expect(fasts()).toEqual([])
  act(() => button('Start fast').click())
  submit()
  const before = clone(fasts())
  act(() => button('End fast').click())
  act(() => button('Cancel').click())
  expect(fasts()).toEqual(before)
  expect(button('End fast')).toBeTruthy()
})

it.each(['2026-11-22T12:35', '2026-11-23T10:00', ''])('rejects an invalid or future start: %s', value => {
  render()
  act(() => button('Start fast').click())
  chooseTime(value)
  submit()
  expect(fasts()).toEqual([])
  expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy()
  expect(picker()).toBeTruthy()
})

it.each(['2026-11-21T19:59', '2026-11-22T12:35', ''])('rejects an end before the start, in the future, or empty: %s', value => {
  useStore.setState(s => ({ S: { ...s.S, fasts: { old: { id: 'old', start: new Date('2026-11-21T20:00').getTime(), _ts: 1_000 } } } }))
  render()
  act(() => button('End fast').click())
  chooseTime(value)
  submit()
  expect(fasts()[0].end).toBeUndefined()
  expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy()
})

it('allows ending at the selected start time', () => {
  const start = new Date('2026-11-21T20:00').getTime()
  useStore.setState(s => ({ S: { ...s.S, fasts: { old: { id: 'old', start, _ts: start } } } }))
  render()
  act(() => button('End fast').click())
  chooseTime('2026-11-21T20:00')
  submit()
  expect(fasts()[0].end).toBe(start)
  expect(host.textContent).toContain('0:00:00')
})

it('previews the total duration as the selected end changes without saving the fast', () => {
  const start = new Date('2026-11-20T20:30').getTime()
  useStore.setState(s => ({ S: { ...s.S, fasts: { old: { id: 'old', start, _ts: start } } } }))
  render()
  act(() => button('End fast').click())
  const total = () => host.querySelector('[aria-label="Total fasting time"]')?.textContent
  expect(total()).toBe('40:04:56')
  chooseTime('2026-11-21T12:30')
  expect(total()).toBe('16:00:00')
  chooseTime('2026-11-22T08:45')
  expect(total()).toBe('36:15:00')
  expect(fasts()[0].end).toBeUndefined()
  submit()
  expect(host.querySelector('[aria-label="Total fasting time"]')).toBeNull()
  expect(host.textContent).toContain('36:15:00')
})

it.each(['2026-11-20T19:00', '2026-11-22T12:35', ''])('hides the duration for an invalid end time: %s', value => {
  const start = new Date('2026-11-20T20:30').getTime()
  useStore.setState(s => ({ S: { ...s.S, fasts: { old: { id: 'old', start, _ts: start } } } }))
  render()
  act(() => button('End fast').click())
  expect(host.querySelector('[aria-label="Total fasting time"]')).toBeTruthy()
  chooseTime(value)
  expect(host.querySelector('[aria-label="Total fasting time"]')).toBeNull()
  chooseTime('2026-11-20T20:30')
  expect(host.querySelector('[aria-label="Total fasting time"]').textContent).toBe('0:00:00')
})

it('keeps the default total current and stops counting when a past end is selected', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-22T12:34:56'))
  vi.spyOn(Date, 'now').mockImplementation(() => new Date().getTime())
  const start = new Date('2026-11-21T20:30').getTime()
  useStore.setState(s => ({ S: { ...s.S, fasts: { old: { id: 'old', start, _ts: start } } } }))
  render()
  act(() => button('End fast').click())
  const total = () => host.querySelector('[aria-label="Total fasting time"]')?.textContent
  expect(total()).toBe('16:04:56')
  act(() => vi.advanceTimersByTime(2000))
  expect(total()).toBe('16:04:58')
  chooseTime('2026-11-22T08:30')
  act(() => vi.advanceTimersByTime(2000))
  expect(total()).toBe('12:00:00')
})
