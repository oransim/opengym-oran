// @vitest-environment happy-dom
// Plan → Schedule → a weekday: saved routines and classes live in separate pickers. Tapping
// several puts them on a recurring weekday in order; "Rest day" clears it. The weekday key is
// dropped rather than left as an empty list.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { dayAssignSheet } from './sheets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
let host, root

const renderTop = () => {
  const sheet = useUI.getState().sheets.at(-1)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
}
const row = name => [...host.querySelectorAll('.item')].find(el => el.querySelector('.tt')?.textContent === name)
const button = name => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === name)
const tap = el => { act(() => el.click()); if (useUI.getState().sheets.length) renderTop() }
const open = kind => tap(button(kind))
const week = () => useStore.getState().S.week

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  const S = clone(useStore.getState().S)
  S.routines = [
    { id: 'push', name: 'Push', emoji: null, ex: [{ id: '0025' }] },
    { id: 'core', name: 'Core', emoji: null, ex: [] },
    { id: 'climb', name: 'climbing', emoji: 'stretch', kind: 'visit', ex: [] },
    { id: 'yoga', name: 'Yoga', emoji: 'stretch', kind: 'visit', ex: [] },
  ]
  S.week = { 1: ['push'] }
  useStore.setState({ S, user: null })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('the weekday picker', () => {
  it('puts New class and New routine beside Add exercise, with saved items out of the main sheet', () => {
    dayAssignSheet(4)
    renderTop()
    expect(row('Push')).toBeUndefined()
    expect(row('climbing')).toBeUndefined()
    const actions = [...host.querySelectorAll('button')].map(b => b.textContent.trim())
    expect(actions).toEqual(expect.arrayContaining(['Add exercise', 'New class', 'New routine']))
  })

  it('shows classes in the class picker and routines in the routine picker', () => {
    dayAssignSheet(4)
    renderTop()
    open('New class')
    expect(row('climbing')).toBeTruthy()
    expect(row('Yoga')).toBeTruthy()
    expect(row('Push')).toBeUndefined()
    tap(button('Done'))
    open('New routine')
    expect(row('Push')).toBeTruthy()
    expect(row('Core')).toBeTruthy()
    expect(row('climbing')).toBeUndefined()
  })

  it('schedules multiple classes and routines for the same weekday every week', () => {
    dayAssignSheet(3)
    renderTop()
    open('New class')
    tap(row('climbing'))
    tap(row('Yoga'))
    expect(week()[3]).toEqual(['climb', 'yoga'])
    tap(button('Done'))
    open('New routine')
    tap(row('Core'))
    expect(week()[3]).toEqual(['climb', 'yoga', 'core'])
  })

  it('creates and schedules a new class from the class picker', () => {
    dayAssignSheet(4)
    renderTop()
    open('New class')
    tap(button('Create class'))
    const created = useStore.getState().S.routines.at(-1)
    expect(created).toMatchObject({ name: 'New class', kind: 'visit', ex: [] })
    expect(week()[4]).toEqual([created.id])
    expect(useUI.getState().sheets).toHaveLength(0)
  })

  it('offers an exercise picker directly from the day', () => {
    useStore.getState().update(s => { s.routines = []; s.week = {} })
    dayAssignSheet(3)
    renderTop()
    const add = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise')
    expect(add).toBeTruthy()
    tap(add)
    expect(host.querySelector('h3').textContent).toBe('Choose exercise')
    const quick = host.querySelector('.list .item button.iconbtn')
    expect(quick).toBeTruthy()
    tap(quick)
    expect(button('Choose target')).toBeTruthy()
    tap(button('Choose target'))
    expect(host.textContent).toContain('Choose the days to repeat every week.')
    tap(button('Save schedule'))
    const st = useStore.getState().S
    expect(st.week[3]).toEqual([st.routines[0].id])
    expect(st.routines[0].kind).toBe('exercise-repeat')
    expect(st.routines[0].ex).toHaveLength(1)
  })

  it('ticks what is on the day and adds a second routine for a combined day, staying open', () => {
    dayAssignSheet(1)
    renderTop()
    expect(host.querySelector('h3').textContent).toBe('Monday')
    open('New routine')
    expect(row('Push').getAttribute('aria-pressed')).toBe('true')
    expect(row('Core').getAttribute('aria-pressed')).toBe('false')
    tap(row('Core'))
    expect(week()[1]).toEqual(['push', 'core'])
    expect(useUI.getState().sheets.length).toBe(2)
    expect(row('Core').getAttribute('aria-pressed')).toBe('true')
  })

  it('takes a routine off again, and drops the day once nothing is left', () => {
    dayAssignSheet(1)
    renderTop()
    open('New routine')
    tap(row('Push'))
    expect(week()).not.toHaveProperty('1')
    tap(button('Done'))
    expect(row('Rest day').querySelector('.menu-on').className).toContain('is-on')
  })

  it('Rest day clears a combined day and closes', () => {
    useStore.getState().update(s => { s.week[1] = ['push', 'core'] })
    dayAssignSheet(1)
    renderTop()
    tap(row('Rest day'))
    expect(week()).not.toHaveProperty('1')
    expect(useUI.getState().sheets.length).toBe(0)
  })

  it('plans an empty day and closes on Done', () => {
    dayAssignSheet(3)
    renderTop()
    open('New routine')
    tap(row('Core'))
    expect(week()[3]).toEqual(['core'])
    tap(button('Done'))
    act(() => button('Done').click())
    expect(useUI.getState().sheets.length).toBe(0)
  })
})
