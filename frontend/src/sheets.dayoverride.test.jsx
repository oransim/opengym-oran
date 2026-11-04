// @vitest-environment happy-dom
// The day sheet's header names the plan the day would have without its override. In a coach
// week that is the queue's session for the day, in front of the weekday's own routines — the
// same answer the Home row gives — not the weekday list alone. The list itself puts the
// week's remaining sessions first inside the routine picker: picking one pins it to the day
// (the same per-date override), and one already pinned to another day shows that day.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { dayOverrideSheet, finishWorkout } from './sheets.jsx'
import { markAllSetsDone } from './lib/backfill.js'
import { todayISO, isoOf, fmtDate, exCount, exerciseNameText } from './lib/format.js'
import { EXIDX } from './lib/exercises.js'

const routines = [
  { id: 'd1', name: 'US W1 D1', emoji: null, ex: [{ id: '0025' }] },
  { id: 'd2', name: 'US W1 D2', emoji: null, ex: [{ id: '0025' }] },
  { id: 'own', name: 'Core', emoji: null, ex: [{ id: '0025' }] },
]
const classes = [
  { id: 'climb', name: 'Climbing', emoji: 'stretch', kind: 'visit', ex: [] },
  { id: 'yoga', name: 'Yoga', emoji: 'stretch', kind: 'visit', ex: [] },
]
const SINCE = Date.now() - 2 * 86400000
const daysFromToday = n => { const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const queue = { ids: ['d1', 'd2'], since: SINCE, startsOn: daysFromToday(-1), label: 'US W1' }
// A finished workout on `id`, started after the apply — the DONE RULE counts it for this week.
const logged = id => {
  const start = SINCE + 3600000
  return { id: 'w-' + id, d: isoOf(new Date(start)), start, end: start + 3600000, routineIds: [id], routineId: id, name: routines.find(r => r.id === id).name, entries: [] }
}
const mounted = []

function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const header = host => host.querySelector('.muted.small').textContent
const heading = host => host.querySelector('.menu-sec')?.textContent
const lists = host => [...host.querySelectorAll('.list')].map(l => [...l.querySelectorAll('.item .tt')].map(e => e.textContent))
const rowOf = (host, name) => [...host.querySelectorAll('.item')].find(el => el.querySelector('.tt')?.textContent === name)
const openPicker = (host, name) => {
  act(() => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === name).click())
  return renderTop()
}
const setS = (over = {}) => useStore.setState(s => ({ S: { ...s.S, routines, week: {}, dayPlan: {}, dayPlanSkip: {}, workouts: [], active: null, queue, ...over }, user: null }))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('Day sheet header in a coach week', () => {
  it('names the queue session for today, with the weekday\'s own routine after it', () => {
    setS()
    dayOverrideSheet(todayISO())
    expect(header(renderTop())).toMatch(/^Weekly plan: US W1 D1/)
    setS({ week: { [new Date().getDay()]: ['own'] } })
    dayOverrideSheet(todayISO())
    expect(header(renderTop())).toMatch(/^Weekly plan: US W1 D1 \+ Core/)
  })

  it('a rest override for today still shows the plan it replaced, marked as changed', () => {
    setS({ dayPlan: { [todayISO()]: 'rest' } })
    dayOverrideSheet(todayISO())
    const h = header(renderTop())
    expect(h).toMatch(/^Weekly plan: US W1 D1/)
    expect(h).toContain('changed for this day')
  })

  it('another day has no queue session: the weekday alone, or Rest', () => {
    const tomorrow = daysFromToday(1)
    setS({ week: { [new Date(tomorrow + 'T12:00:00').getDay()]: ['own'] } })
    dayOverrideSheet(tomorrow)
    expect(header(renderTop())).toMatch(/^Weekly plan: Core/)
    setS()
    dayOverrideSheet(tomorrow)
    expect(header(renderTop())).toMatch(/^Weekly plan: Rest/)
  })
})

describe('Day sheet list in a coach week', () => {
  it('keeps exercise, routine, and class actions side by side', () => {
    setS({ queue: null })
    dayOverrideSheet(todayISO())
    const host = renderTop()
    const names = ['Add exercise', 'Add routine', 'Add class']
    const buttons = names.map(name => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === name))
    expect(buttons.every(Boolean)).toBe(true)
    expect(buttons.map(b => b.parentElement)).toEqual([buttons[0].parentElement, buttons[0].parentElement, buttons[0].parentElement])
    expect(buttons[0].parentElement.classList.contains('day-override-actions')).toBe(true)
  })

  it('shows separate routine and class actions instead of raw saved items', () => {
    setS({ queue: null, routines: [...routines, ...classes] })
    dayOverrideSheet(todayISO())
    const day = renderTop()
    expect(rowOf(day, 'Core')).toBeUndefined()
    expect(rowOf(day, 'Climbing')).toBeUndefined()
    const routinePicker = openPicker(day, 'Add routine')
    expect(rowOf(routinePicker, 'Core')).toBeTruthy()
    expect(rowOf(routinePicker, 'Climbing')).toBeUndefined()
    act(() => useUI.getState().closeSheet(useUI.getState().sheets.at(-1).id))
    const classPicker = openPicker(day, 'Add class')
    expect(rowOf(classPicker, 'Climbing')).toBeTruthy()
    expect(rowOf(classPicker, 'Yoga')).toBeTruthy()
    expect(rowOf(classPicker, 'Core')).toBeUndefined()
  })

  it('plans a class only for the selected future date', () => {
    const future = daysFromToday(2)
    setS({ queue: null, routines: [...routines, ...classes] })
    dayOverrideSheet(future)
    const picker = openPicker(renderTop(), 'Add class')
    act(() => rowOf(picker, 'Yoga').click())
    expect(useStore.getState().S.dayPlan[future]).toBe('yoga')
    expect(useStore.getState().S.week).toEqual({})
  })

  it('keeps a separate exercise repeat skipped when choosing a class for the date', () => {
    const future = daysFromToday(2)
    const weekday = new Date(future + 'T12:00:00').getDay()
    const repeat = { id: 'repeat', name: 'Side split', kind: 'exercise-repeat', ex: [{ id: '0025' }] }
    setS({ queue: null, routines: [...classes, repeat], week: { [weekday]: ['repeat'] }, dayPlanSkip: { [future]: ['repeat'] } })
    dayOverrideSheet(future)
    const picker = openPicker(renderTop(), 'Add class')
    act(() => rowOf(picker, 'Yoga').click())
    expect(useStore.getState().S.dayPlan[future]).toBe('yoga')
    expect(useStore.getState().S.dayPlanSkip[future]).toEqual(['repeat'])
  })

  it('can create another class from the class picker', () => {
    setS({ queue: null, routines })
    dayOverrideSheet(todayISO())
    const picker = openPicker(renderTop(), 'Add class')
    act(() => rowOf(picker, 'Create class').click())
    expect(useStore.getState().S.routines.at(-1)).toMatchObject({ name: 'New class', kind: 'visit', ex: [] })
    expect(useStore.getState().S.week).toEqual({})
  })

  it('opens a completed-workout log when a class is chosen for a past date', () => {
    const past = daysFromToday(-2)
    setS({ queue: null, routines: [...routines, ...classes] })
    dayOverrideSheet(past)
    const picker = openPicker(renderTop(), 'Add class')
    act(() => rowOf(picker, 'Climbing').click())
    const log = renderTop()
    expect(log.querySelector('h3').textContent).toBe('Log a past workout')
    expect(log.querySelector('input[type=date]').value).toBe(past)
    act(() => [...log.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue').click())
    expect(useStore.getState().S.active).toMatchObject({ d: past, kind: 'visit', routineIds: ['climb'] })
    expect(useStore.getState().S.dayPlan[past]).toBeUndefined()
    act(() => finishWorkout())
    expect(useStore.getState().S.workouts.at(-1)).toMatchObject({ d: past, kind: 'visit', routineIds: ['climb'] })
  })
  it('books an exercise for today without starting a workout', () => {
    setS({ queue: null, routines: [], week: {}, weighIn: false })
    dayOverrideSheet(todayISO())
    const host = renderTop()
    const add = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise')
    expect(add).toBeTruthy()
    act(() => add.click())
    expect(useUI.getState().sheets).toHaveLength(1)
    const picker = renderTop()
    expect(picker.querySelector('h3').textContent).toBe('Add exercise')
    act(() => picker.querySelector('.list .item button.iconbtn').click())
    const st = useStore.getState().S
    expect(st.active).toBeNull()
    expect(st.week).toEqual({})
    expect(st.dayPlan[todayISO()]).toBe(st.routines[0].id)
    expect(st.routines[0].ex).toHaveLength(1)
    const preview = renderTop()
    expect(preview.querySelector('h3').textContent).toBe(st.routines[0].name)
    expect([...preview.querySelectorAll('button')].some(b => b.textContent.trim() === 'Start')).toBe(true)
  })

  it('opens a booked routine before starting it', () => {
    const future = daysFromToday(1)
    setS({ queue: null, routines: [{ id: 'side', name: 'Side split routine', ex: [{ id: '0025' }] }],
      dayPlan: { [future]: 'side' }, weighIn: false })
    dayOverrideSheet(future)
    const day = renderTop()
    expect(rowOf(day, 'Side split routine')).toBeTruthy()
    expect(rowOf(day, 'Barbell Bench Press')).toBeUndefined()
    act(() => rowOf(day, 'Side split routine').click())
    const preview = renderTop()
    expect(preview.querySelector('h3').textContent).toBe('Side split routine')
    expect(rowOf(preview, 'Barbell Bench Press')).toBeTruthy()
    expect(useStore.getState().S.active).toBeNull()
    act(() => [...preview.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start').click())
    expect(useStore.getState().S.active?.routineIds).toEqual(['side'])
  })

  it('opens a dated past-workout log with the selected exercise', () => {
    const yesterday = daysFromToday(-1)
    setS({ queue: null, routines: [], week: {}, active: null })
    dayOverrideSheet(yesterday)
    const day = renderTop()
    act(() => [...day.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise').click())
    const picker = renderTop()
    act(() => picker.querySelector('.list .item button.iconbtn').click())
    const log = renderTop()
    expect(log.querySelector('h3').textContent).toBe('Log a past workout')
    expect(log.querySelector('input[type=date]').value).toBe(yesterday)
    act(() => [...log.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue').click())
    const st = useStore.getState().S
    expect(st.active).toMatchObject({ d: yesterday, backfill: { durationMin: 60 } })
    expect(st.active.entries).toHaveLength(1)
    expect(st.week).toEqual({})
    act(() => useStore.getState().update(s => { s.active.entries = markAllSetsDone(s.active.entries) }))
    act(() => finishWorkout())
    expect(useStore.getState().S.workouts.at(-1)).toMatchObject({ d: yesterday, entries: [{ id: st.active.entries[0].id }] })
  })

  it('plans an exercise on a future date without making it weekly', () => {
    const future = daysFromToday(2)
    setS({ queue: null, routines: [], week: {}, dayPlan: {} })
    dayOverrideSheet(future)
    const day = renderTop()
    act(() => [...day.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise').click())
    const picker = renderTop()
    act(() => picker.querySelector('.list .item button.iconbtn').click())
    const st = useStore.getState().S
    expect(st.week).toEqual({})
    expect(st.dayPlan[future]).toBe(st.routines[0].id)
    expect(st.routines[0].ex).toHaveLength(1)
  })

  it('shows a booked exercise and lets me remove it from that date', () => {
    const future = daysFromToday(2)
    setS({ queue: null, routines: [], week: {}, dayPlan: {} })
    dayOverrideSheet(future)
    const day = renderTop()
    act(() => [...day.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise').click())
    const picker = renderTop()
    act(() => picker.querySelector('.list .item button.iconbtn').click())
    const booked = useStore.getState().S.routines[0]
    dayOverrideSheet(future)
    const reopened = renderTop()
    expect(rowOf(reopened, booked.name)).toBeTruthy()
    act(() => rowOf(reopened, booked.name).click())
    const preview = renderTop()
    const name = exerciseNameText(EXIDX[booked.ex[0].id])
    expect(rowOf(preview, name)).toBeTruthy()
    act(() => preview.querySelector(`button[aria-label="Remove ${name}"]`).click())
    const st = useStore.getState().S
    expect(st.dayPlan[future]).toBe('rest')
    expect(st.routines.some(r => r.id === booked.id)).toBe(false)
    expect(useUI.getState().sheets).toHaveLength(0)
    expect(rowOf(preview, name)).toBeUndefined()
  })

  it('shows a previously skipped date booking again when another exercise is added to it', () => {
    const future = daysFromToday(2)
    const booked = { id: 'dated', name: fmtDate(future, true), dateOnly: future, ex: [{ id: '0025' }] }
    setS({ queue: null, routines: [booked], dayPlan: { [future]: 'dated' }, dayPlanSkip: { [future]: ['dated'] } })
    dayOverrideSheet(future)
    const day = renderTop()
    act(() => [...day.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise').click())
    const picker = renderTop()
    act(() => picker.querySelector('.list .item button.iconbtn').click())
    expect(useStore.getState().S.dayPlanSkip[future]).toBeUndefined()
    dayOverrideSheet(future)
    expect(rowOf(renderTop(), booked.name)).toBeTruthy()
  })

  it('removes one exercise from a dated booking without changing its weekly routine', () => {
    const future = daysFromToday(2)
    const weekday = new Date(future + 'T12:00:00').getDay()
    setS({ queue: null, routines: [{ id: 'shared', name: 'Strength', ex: [{ id: '0025' }, { id: '0001' }] }],
      week: { [weekday]: ['shared'] }, dayPlan: { [future]: 'shared' } })
    dayOverrideSheet(future)
    const day = renderTop()
    expect(rowOf(day, 'Strength')).toBeTruthy()
    act(() => rowOf(day, 'Strength').click())
    const preview = renderTop()
    expect(rowOf(preview, 'Barbell Bench Press')).toBeTruthy()
    expect(rowOf(preview, '3/4 Sit-Up')).toBeTruthy()
    act(() => preview.querySelector('button[aria-label="Remove Barbell Bench Press"]').click())
    const st = useStore.getState().S
    expect(st.routines.find(r => r.id === 'shared').ex).toHaveLength(2)
    expect(st.week[weekday]).toEqual(['shared'])
    expect(st.routines.find(r => r.id === st.dayPlan[future]).ex).toEqual([{ id: '0001' }])
    expect(rowOf(preview, 'Barbell Bench Press')).toBeUndefined()
    expect(rowOf(preview, '3/4 Sit-Up')).toBeTruthy()
  })

  it('shows a weekly booking and removes it from the selected date only', () => {
    const future = daysFromToday(2)
    const weekday = new Date(future + 'T12:00:00').getDay()
    const otherDay = (weekday + 1) % 7
    setS({ queue: null, routines: [{ id: 'morning', name: 'Daily morning stretches', ex: [{ id: '0025' }] }],
      week: { [weekday]: ['morning'], [otherDay]: ['morning'] } })
    dayOverrideSheet(future)
    const day = renderTop()
    expect(rowOf(day, 'Daily morning stretches')).toBeTruthy()
    act(() => day.querySelector('button[aria-label="Remove Daily morning stretches from this day"]').click())
    const st = useStore.getState().S
    expect(st.week[weekday]).toEqual(['morning'])
    expect(st.week[otherDay]).toEqual(['morning'])
    expect(st.dayPlanSkip[future]).toEqual(['morning'])
    expect(st.routines.find(r => r.id === 'morning')).toBeTruthy()
    expect(header(day)).toContain('Weekly plan: Daily morning stretches')
    expect(header(day)).toContain('changed for this day')
    expect(day.querySelector('button[aria-label="Remove Daily morning stretches from this day"]')).toBeNull()
    expect(rowOf(day, 'Daily morning stretches').textContent).toContain('Restore')
    act(() => [...rowOf(day, 'Daily morning stretches').querySelectorAll('button')].find(b => b.textContent.trim() === 'Restore').click())
    expect(useStore.getState().S.dayPlanSkip[future]).toBeUndefined()
    expect(day.querySelector('button[aria-label="Remove Daily morning stretches from this day"]')).toBeTruthy()
  })

  it('shows repeating exercises alongside other weekday bookings and removes only the chosen repeat', () => {
    const future = daysFromToday(2)
    const weekday = new Date(future + 'T12:00:00').getDay()
    setS({ queue: null, routines: [
      { id: 'stretch', name: 'Side split', kind: 'exercise-repeat', ex: [{ id: '0025' }] },
      { id: 'morning', name: 'Daily morning stretches', ex: [{ id: '0001' }] },
    ], week: { [weekday]: ['stretch', 'morning'] } })
    dayOverrideSheet(future)
    const day = renderTop()
    expect(header(day)).toContain('Side split')
    expect(rowOf(day, 'Side split')).toBeTruthy()
    expect(rowOf(day, 'Daily morning stretches')).toBeTruthy()
    act(() => day.querySelector('button[aria-label="Remove Side split from this day"]').click())
    expect(useStore.getState().S.week[weekday]).toEqual(['stretch', 'morning'])
    expect(useStore.getState().S.dayPlanSkip[future]).toEqual(['stretch'])
    expect(day.querySelector('button[aria-label="Remove Side split from this day"]')).toBeNull()
    expect(rowOf(day, 'Side split').textContent).toContain('Restore')
    expect(rowOf(day, 'Daily morning stretches')).toBeTruthy()
  })

  it('keeps a future date’s existing weekly exercise when adding a one-off exercise', () => {
    const future = daysFromToday(2)
    const weekday = new Date(future + 'T12:00:00').getDay()
    setS({ queue: null, week: { [weekday]: ['own'] }, dayPlan: {} })
    dayOverrideSheet(future)
    const day = renderTop()
    act(() => [...day.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise').click())
    const picker = renderTop()
    act(() => picker.querySelector('.list .item button.iconbtn').click())
    const st = useStore.getState().S
    expect(st.week[weekday]).toEqual(['own'])
    expect(st.routines.find(r => r.id === 'own').ex).toHaveLength(1)
    expect(st.routines.find(r => r.id === st.dayPlan[future]).ex).toHaveLength(2)
  })

  it('a fulfilled pin — the session pinned here already done — reads as no change; the clear row stays', () => {
    setS({ dayPlan: { [todayISO()]: 'd1' }, workouts: [logged('d1')] })
    dayOverrideSheet(todayISO())
    const host = renderTop()
    expect(header(host)).toMatch(/^Weekly plan: US W1 D2/)
    expect(header(host)).not.toContain('changed for this day')
    expect(rowOf(host, 'Back to weekly plan')).toBeTruthy()
  })

  it("the pinned day's own sheet shows the exercise count, not its own date again", () => {
    const friday = daysFromToday(2)
    setS({ dayPlan: { [friday]: 'd2' } })
    dayOverrideSheet(friday)
    const host = openPicker(renderTop(), 'Add routine')
    expect(rowOf(host, 'US W1 D2').querySelector('.ss').textContent).toBe(exCount(1))
    // …while from today's sheet the same session wears Friday.
    dayOverrideSheet(todayISO())
    expect(rowOf(openPicker(renderTop(), 'Add routine'), 'US W1 D2').querySelector('.ss').textContent).toBe(fmtDate(friday, true))
    // A session pinned to today wears today from another day's sheet, though the row lights it as next.
    setS({ dayPlan: { [todayISO()]: 'd2' } })
    dayOverrideSheet(friday)
    expect(rowOf(openPicker(renderTop(), 'Add routine'), 'US W1 D2').querySelector('.ss').textContent).toBe(fmtDate(todayISO(), true))
  })

  it('lists the remaining sessions first under Coach week, a done session down in the plain list', () => {
    setS({ workouts: [logged('d1')] })
    dayOverrideSheet(todayISO())
    const host = openPicker(renderTop(), 'Add routine')
    expect(heading(host)).toBe('Coach week')
    const [coach, plain] = lists(host)
    expect(coach).toEqual(['US W1 D2'])
    expect(plain).toEqual(['US W1 D1', 'Core'])
  })

  it('a saved personal loop is absent from the coach section', () => {
    setS({ queue: { ...queue, rotationId: 'r1' }, rotation: { id: 'r1', sequence: ['d1', 'd2'], label: 'Rotation' } })
    try {
    dayOverrideSheet(todayISO())
    const picker = openPicker(renderTop(), 'Add routine')
    expect(heading(picker)).toBeUndefined()
    expect(rowOf(picker, 'US W1 D1')).toBeTruthy()
    } finally { act(() => useStore.setState(s => ({ S: { ...s.S, rotation: null } }))) }
  })

  it('picking a coach row pins that session to the day', () => {
    const friday = daysFromToday(2)
    setS()
    dayOverrideSheet(friday)
    const host = openPicker(renderTop(), 'Add routine')
    act(() => rowOf(host, 'US W1 D2').click())
    expect(useStore.getState().S.dayPlan[friday]).toBe('d2')
    expect(useUI.getState().sheets).toHaveLength(0)
    expect(useUI.getState().toastMsg).toBe(`US W1 D2 planned for ${fmtDate(friday)}`)
  })

  it('a session pinned to another day shows that day instead of its exercise count', () => {
    const friday = daysFromToday(2)
    setS({ dayPlan: { [friday]: 'd2' } })
    dayOverrideSheet(todayISO())
    const host = openPicker(renderTop(), 'Add routine')
    expect(rowOf(host, 'US W1 D2').querySelector('.ss').textContent).toBe(fmtDate(friday, true))
    expect(rowOf(host, 'US W1 D1').querySelector('.ss').textContent).toBe(exCount(1))
  })

  it('without a queue there is no heading and one plain list', () => {
    setS({ queue: null })
    dayOverrideSheet(todayISO())
    const host = openPicker(renderTop(), 'Add routine')
    expect(heading(host)).toBeUndefined()
    expect(lists(host)[0]).toEqual(['US W1 D1', 'US W1 D2', 'Core'])
  })
})
