import { useState } from 'react'
import { DAYN, DAYS, fmtDate, isoOf, todayISO, weekDayOffset, weekStartOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayNoteOf } from '../lib/day-notes.js'
import { pinState, queueOf } from '../lib/queue.js'
import { isExerciseRepeat } from '../lib/exercise-repeat.js'
import { monthlyIdsOn } from '../lib/monthly-schedule.js'
import Icon from './Icon.jsx'

// A dated week for both the dashboard and the schedule editor. A rotation's next session
// floats until it is trained or pinned, so only fixed assignments and explicit pins get dates.
export default function WeekCalendar({ S, onDay, selectedIso }) {
  const [offset, setOffset] = useState(0)
  const moveWeek = delta => {
    setOffset(n => n + delta)
    if (selectedIso) {
      const date = new Date(`${selectedIso}T12:00:00`)
      date.setDate(date.getDate() + 7 * delta)
      onDay(isoOf(date), date.getDay())
    }
  }
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - weekDayOffset(today.getDay(), weekStartOf(S)) + offset * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const queueIds = queueOf(S)?.ids || []
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const iso = isoOf(date)
    const assigned = [...new Set([...[].concat(S.week?.[date.getDay()] || []), ...monthlyIdsOn(S, iso)])].filter(id => !queueIds.includes(id))
    const repeats = assigned.filter(id => isExerciseRepeat(S.routines.find(r => r.id === id)))
    const override = S.dayPlan?.[iso]
    const pin = pinState(S, override)
    const ids = override === 'rest' ? [] : override && S.routines.some(r => r.id === override)
      ? pin === 'done' ? assigned : pin === 'open' ? [...new Set([override, ...assigned])] : [...new Set([override, ...repeats])]
      : assigned
    const skipped = new Set(Array.isArray(S.dayPlanSkip?.[iso]) ? S.dayPlanSkip[iso] : [])
    const planned = ids.filter(id => !skipped.has(id)).map(id => S.routines.find(r => r.id === id)?.name).filter(Boolean)
    const logged = (S.workouts || []).filter(w => w.d === iso)
    const noted = !logged.length && !!dayNoteOf(S, iso)
    const names = logged.length ? logged.map(w => w.name).filter(Boolean) : planned
    const label = names.length ? names.join(' + ') : logged.length ? t('Done') : noted ? t('Day note') : t('Rest day')
    return { date, iso, label, empty: !names.length && !logged.length && !noted,
      done: logged.length > 0, noted, overridden: (override !== undefined && pin !== 'done') || ids.some(id => skipped.has(id)), planned: planned.length > 0 }
  })

  return <div className="week-calendar" role="group" aria-label={t('Weekly Training Plan')}>
    <div className="week-calendar-head">
      <button className="iconbtn sm" onClick={() => moveWeek(-1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
      <div className="small muted">{offset === 0 ? `${t('This week')} · ` : ''}{fmtDate(isoOf(start))} – {fmtDate(isoOf(end))}</div>
      <button className="iconbtn sm" onClick={() => moveWeek(1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
    </div>
    <div className="week-calendar-grid">
      {days.map(({ date, iso, label, empty, done, noted, overridden, planned }) => <button key={iso}
        className={'week-calendar-day' + (iso === todayISO() ? ' today' : '') + (iso === selectedIso ? ' selected' : '') + (done ? ' done' : noted ? ' noted' : overridden ? ' overridden' : planned ? ' planned' : '')}
        aria-pressed={selectedIso ? iso === selectedIso : undefined}
        aria-label={`${t(DAYN[date.getDay()])}, ${fmtDate(iso)}: ${label}`}
        title={label} onClick={() => onDay(iso, date.getDay())}>
        <span className="week-calendar-dow">{t(DAYS[date.getDay()])}</span>
        <span className="week-calendar-date">{date.getDate()}</span>
        <span className="week-calendar-name">{empty ? '–' : label}</span>
      </button>)}
    </div>
  </div>
}
