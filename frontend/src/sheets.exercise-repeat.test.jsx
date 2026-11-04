// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { scheduleItemSheet, repeatDaysSheet } from './sheets.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original
const renderTop = () => {
  const sheet = useUI.getState().sheets.at(-1)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
}
const button = name => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === name)
const menuItem = name => [...host.querySelectorAll('.menu-item')].find(el => el.querySelector('.tt')?.textContent === name)
beforeEach(() => {
  original = useStore.getState()
  useUI.setState({ sheets: [], toastMsg: '' })
  const S = structuredClone(DEF)
  S.routines = [
    { id: 'r', name: 'Routine A', ex: [{ id: '0025' }] },
    { id: 'c', name: 'Class A', kind: 'visit', ex: [] },
    { id: 'e1', name: 'Stretch', kind: 'exercise-repeat', ex: [{ id: '0025', sets: 3 }] },
    { id: 'e2', name: 'Stretch', kind: 'exercise-repeat', ex: [{ id: '0025', sets: 5 }] },
  ]
  S.week = { 1: ['e1'], 4: ['e2'] }
  useStore.setState({ S, user: null })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState(original) })

it('offers routine, class, and exercise as separate scheduling types', () => {
  scheduleItemSheet()
  renderTop()
  expect(['Routine', 'Class', 'Exercise'].every(label => menuItem(label))).toBe(true)
  act(() => menuItem('Class').click())
  renderTop()
  expect(host.textContent).toContain('Class A')
  expect(host.textContent).not.toContain('Routine A')
  expect(host.textContent).not.toContain('Stretch')
})

it('edits weekdays of one exercise rule without changing its sibling', () => {
  repeatDaysSheet('e1')
  renderTop()
  act(() => host.querySelector('button[aria-label="Wednesday"]').click())
  act(() => button('Save schedule').click())
  const S = useStore.getState().S
  expect(S.week[1]).toContain('e1')
  expect(S.week[3]).toContain('e1')
  expect(S.week[4]).toEqual(['e2'])
  expect(S.routines.find(r => r.id === 'e2').ex[0].sets).toBe(5)
})

it('deletes only the selected exercise repeat', () => {
  repeatDaysSheet('e1')
  renderTop()
  act(() => button('Delete repeat').click())
  const S = useStore.getState().S
  expect(S.routines.some(r => r.id === 'e1')).toBe(false)
  expect(S.routines.find(r => r.id === 'e2').ex[0].sets).toBe(5)
  expect(S.week[1]).toBeUndefined()
  expect(S.week[4]).toEqual(['e2'])
})

it('creates an exercise repeat through the target editor and chosen weekdays', () => {
  scheduleItemSheet({ day: 2 })
  renderTop()
  act(() => menuItem('Exercise').click())
  renderTop()
  const quick = host.querySelector('.list .item button.iconbtn')
  act(() => quick.click())
  renderTop()
  expect(button('Choose target')).toBeTruthy()
  act(() => button('Choose target').click())
  renderTop()
  expect(host.querySelector('button[aria-label="Tuesday"]').getAttribute('aria-pressed')).toBe('true')
  act(() => host.querySelector('button[aria-label="Friday"]').click())
  act(() => button('Save schedule').click())
  const S = useStore.getState().S
  const created = S.routines.at(-1)
  expect(created.kind).toBe('exercise-repeat')
  expect(created.ex).toHaveLength(1)
  expect(created.ex[0]).toMatchObject({ sets: 3, reps: 10 })
  expect(S.week[2]).toContain(created.id)
  expect(S.week[5]).toContain(created.id)
})
