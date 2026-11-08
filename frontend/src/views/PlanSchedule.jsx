import { useState } from 'react'
import { DAYN, DAYS, exCount, fmtDate, routineCount, todayISO, weekOrder, weekStartOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { effectiveRoutineIds } from '../lib/history.js'
import { exerciseRepeatsOn, isExerciseRepeat, repeatDoneOn } from '../lib/exercise-repeat.js'
import { isVisitRoutine } from '../lib/visit-routine.js'
import { deriveSessionName } from '../lib/session-merge.js'
import { setsRepsOf } from '../lib/history.js'
import { dayAssignSheet, repeatDaysSheet, scheduleDaysSheet, scheduleItemSheet, startFlow, starterPlanSheet } from '../sheets.jsx'
import { Button, Row, Section } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import MiniBodyMap from '../components/MiniBodyMap.jsx'
import WeekCalendar from '../components/WeekCalendar.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { queueView } from '../lib/queue.js'
import { activeSkippedOn, skipOnDate, restoreOnDate } from '../lib/day-plan-skip.js'
import { useStore } from '../store/useStore.js'

export default function PlanSchedule({ S, nav }) {
  const [selectedIso, setSelectedIso] = useState(todayISO())
  const selectedDay = new Date(`${selectedIso}T12:00:00`).getDay()
  const routineOf = id => S.routines.find(r => r.id === id)
  const dayIds = effectiveRoutineIds(S, selectedIso)
  const selected = [...dayIds.map(routineOf).filter(Boolean), ...exerciseRepeatsOn(S, selectedIso)]
  const skipped = activeSkippedOn(S, selectedIso).map(routineOf).filter(Boolean)
  const order = weekOrder(weekStartOf(S))
  const schedule = () => scheduleItemSheet({ day: selectedDay, iso: selectedIso })
  const startOne = r => { if (!S.active) startFlow([r.id]) }
  const skipOne = r => useStore.getState().update(s => skipOnDate(s, selectedIso, r.id))
  const restoreOne = r => useStore.getState().update(s => restoreOnDate(s, selectedIso, r.id))
  const daysOf = id => order.filter(d => [].concat(S.week?.[d] || []).includes(id))
  const repeating = S.routines.filter(r => (isExerciseRepeat(r) || daysOf(r.id).length) && !S.monthly?.[r.id])
  const monthly = S.routines.filter(r => S.monthly?.[r.id])
  const monthlyLabel = rule => rule.type === 'last' ? t('Last day of every month')
    : rule.type === 'weekday' ? `${[t('First'), t('Second'), t('Third'), t('Fourth'), t('Last')][rule.ordinal === -1 ? 4 : rule.ordinal - 1]} ${t(DAYN[rule.weekday])}`
      : t('Day {0} of every month', rule.day)
  const weekdayRoutines = d => [].concat(S.week?.[d] || []).map(routineOf).filter(Boolean)
  const coach = queueView(S, todayISO())
  const [noticeDismissed, setNoticeDismissed] = useState(() => {
    try { return localStorage.getItem('gym_weekday_migration_notice') === '1' } catch { return false }
  })
  const legacyRotation = !noticeDismissed && !!S.rotation?.sequence?.length && S.scheduleMode === 'rotation'
    && (!S.queue || S.queue.rotationId === S.rotation.id)
  const dismissNotice = () => {
    setNoticeDismissed(true)
    try { localStorage.setItem('gym_weekday_migration_notice', '1') } catch { /* private mode */ }
  }

  return <>
    {legacyRotation && <Section className="plan-migration-notice">
      <div className="row between" style={{ gap: 10 }}><div><strong>{t('Choose weekdays for your routines')}</strong>
        <div className="small dim">{t('Your old rotation is saved. Use Schedule to place its routines on the days you choose.')}</div></div>
        <button className="iconbtn" aria-label={t('Dismiss')} onClick={dismissNotice}><Icon name="xmark" /></button></div>
    </Section>}
    {coach && <Section className="plan-coach-week">
      <h4 className="sec">{t('Coach week')}</h4>
      <div className="list">{coach.items.map(item => <div key={item.id} className="item">
        <span className="lrow-i"><Icon name={item.state === 'done' ? 'check' : 'figureStrength'} /></span>
        <div className="grow"><div className="tt">{item.name}</div><div className="ss">{item.state === 'done' ? t('Done') : item.state === 'next' ? t('Up next') : item.state === 'pinned' ? fmtDate(item.on, true) : t('Later')}</div></div>
        {item.state === 'next' && <Button size="sm" variant="tinted" disabled={!!S.active} onClick={() => startOne({ id: item.id })}>{t('Start')}</Button>}
      </div>)}</div>
    </Section>}
    <Section className="plan-calendar"><WeekCalendar S={S} selectedIso={selectedIso} onDay={iso => setSelectedIso(iso)} /></Section>

    <div className="row between plan-sec-h" style={{ alignItems: 'center' }}>
      <div><h4 className="sec">{fmtDate(selectedIso, true)}</h4><div className="small dim">{t(DAYN[selectedDay])}</div></div>
      <Button size="sm" variant="tinted" icon="plus" aria-label={t('Schedule item')} onClick={schedule}>{t('Schedule')}</Button>
    </div>
    {selected.length ? <div className="list plan-selected-items">{selected.map(r => {
      const repeat = isExerciseRepeat(r)
      const done = repeat && repeatDoneOn(S, r.id, selectedIso)
      return <div key={r.id} className="item plan-selected-item">
        <span className="lrow-i"><Icon name={repeat ? 'dumbbell' : isVisitRoutine(r) ? 'stretch' : 'figureStrength'} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{repeat ? `${t('Exercise')} · ${setsRepsOf(r.ex[0])}` : isVisitRoutine(r) ? t('Class') : exCount(r.ex.length)}{done ? ` · ${t('Done')}` : ''}</div></div>
        <Button size="sm" variant="tinted" disabled={!!S.active || done} onClick={() => startOne(r)}>{done ? t('Done') : t('Start')}</Button>
        <Button size="sm" variant="ghost" icon="trash" aria-label={t('Remove {0} from this day', r.name)} onClick={() => skipOne(r)}>{t('Remove for this day')}</Button>
      </div>
    })}</div> : <div className="empty plan-selected-empty">{t('Nothing scheduled for this day.')}</div>}
    {skipped.length > 0 && <div className="list plan-skipped-items" style={{ marginTop: 10 }}>{skipped.map(r => <div key={r.id} className="item plan-skipped-item">
      <span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="reset" /></span>
      <div className="grow"><div className="tt">{r.name}</div><div className="ss">{t('Skipped for this day')}</div></div>
      <Button size="sm" variant="ghost" onClick={() => restoreOne(r)}>{t('Restore')}</Button>
    </div>)}</div>}

    {!S.routines.some(r => !isExerciseRepeat(r)) && <div className="empty plan-empty">
      <div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Make one, or grab the starter plan to get going.')}
      <div style={{ marginTop: 12 }}><Button icon="clipboard" onClick={starterPlanSheet}>{t('Load starter plan')}</Button></div>
    </div>}

    <h4 className="sec">{t('This week')}</h4>
    <div className="list plan-week">{order.map(d => {
      const rs = weekdayRoutines(d)
      return <div key={d} className="item plan-day" data-day={d} aria-label={t(DAYN[d])} {...tappable(() => dayAssignSheet(d))}>
        <span className={'plan-day-n' + (d === new Date().getDay() ? ' today' : '')} aria-hidden="true">{t(DAYS[d])}</span>
        <span className={'lrow-i' + (rs.length ? '' : ' rest')}><Icon name={rs.length ? isExerciseRepeat(rs[0]) ? 'dumbbell' : 'figureStrength' : 'moon'} /></span>
        <div className="grow"><div className="tt">{rs.length ? deriveSessionName(rs.map(r => r.name)) : t('Rest day')}</div>
          <div className="ss">{rs.length === 1 ? isExerciseRepeat(rs[0]) ? t('Exercise') : isVisitRoutine(rs[0]) ? t('Class') : exCount(rs[0].ex.length) : rs.length ? routineCount(rs.length) : t('Tap to plan something')}</div></div>
        {rs.length > 0 && <MiniBodyMap routines={rs} body={S.body} />}
        <Icon name="chevronRight" className="chev" />
      </div>
    })}</div>

    <h4 className="sec">{t('Repeats every week')}</h4>
    {repeating.length ? <div className="list plan-repeat-list">{repeating.map(r => {
      const repeat = isExerciseRepeat(r)
      return <div key={r.id} className={'item plan-repeat-rule' + (repeat ? ' is-exercise' : '')}>
        <span className="lrow-i"><Icon name={repeat ? 'dumbbell' : isVisitRoutine(r) ? 'stretch' : 'figureStrength'} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{repeat ? `${setsRepsOf(r.ex[0])} · ` : ''}{daysOf(r.id).length ? daysOf(r.id).map(d => t(DAYS[d])).join(', ') : t('Not scheduled')}</div></div>
        <button className="iconbtn" aria-label={t('Edit schedule for {0}', r.name)} onClick={() => repeat ? repeatDaysSheet(r.id) : scheduleDaysSheet(r.id)}><Icon name="pencil" /></button>
      </div>
    })}</div> : <div className="empty">{t('No weekly repeats yet.')}</div>}

    <h4 className="sec">{t('Repeats every month')}</h4>
    {monthly.length ? <div className="list plan-repeat-list">{monthly.map(r => <div key={r.id} className="item plan-repeat-rule">
      <span className="lrow-i"><Icon name={isExerciseRepeat(r) ? 'dumbbell' : isVisitRoutine(r) ? 'stretch' : 'figureStrength'} /></span>
      <div className="grow"><div className="tt">{r.name}</div><div className="ss">{monthlyLabel(S.monthly[r.id])}</div></div>
      <button className="iconbtn" aria-label={t('Edit schedule for {0}', r.name)} onClick={() => scheduleDaysSheet(r.id)}><Icon name="pencil" /></button>
    </div>)}</div> : <div className="empty">{t('No monthly repeats yet.')}</div>}

    {S.routines.length > 0 && <Section className="plan-link"><Row icon="chart" iconTint="var(--indigo)" title={t('Weekly muscle volume')}
      subtitle={t('Now in Stats, next to Muscle balance')} accessory="chevron" onClick={() => nav('/stats?focus=weekly-volume')} /></Section>}
  </>
}
