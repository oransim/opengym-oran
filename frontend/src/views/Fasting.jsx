import { useEffect, useState } from 'react'
import { backTo } from '../lib/nav.js'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { activeFast, completedFasts, deleteFast, endFast, fastDuration, startFast } from '../lib/fasting.js'
import { isoOf } from '../lib/format.js'
import { dateLocale, t } from '../lib/i18n.js'
import { Button, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'

const when = time => new Date(time).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const localTime = time => {
  const date = new Date(time)
  return isoOf(date) + 'T' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
}

function FastTimeSheet({ fast, close }) {
  const [initialTime] = useState(() => localTime(Date.now()))
  const [time, setTime] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!fast || time !== null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [fast, time])
  const endTime = time === null ? now : new Date(time).getTime()
  const duration = fast && Number.isFinite(endTime) && endTime >= fast.start && endTime <= Date.now()
    ? fastDuration(fast, endTime) : null
  const save = e => {
    e.preventDefault()
    // Leaving the default alone means now, including seconds, even if the sheet stayed open.
    const timestamp = time === null ? Date.now() : new Date(time).getTime()
    if (!Number.isFinite(timestamp) || timestamp <= 0) { setError(t('Choose a valid date')); return }
    if (timestamp > Date.now()) { setError(t('Choose a time up to now.')); return }
    const running = activeFast(useStore.getState().S)
    // A sync while the picker is open must not end a different fast.
    if (fast && running?.id !== fast.id) { close(); return }
    if (fast && timestamp < running.start) { setError(t('The end time cannot be before the start time.')); return }
    useStore.getState().update(s => { if (fast) endFast(s, timestamp); else startFast(s, timestamp) })
    close()
  }
  return <form onSubmit={save} noValidate>
    <h3>{fast ? t('End fast') : t('Start fast')}</h3>
    <div className="muted small" style={{ marginBottom: 16 }}>
      {fast ? t('Choose when your fast ended. You can select a time in the past.') : t('Choose when your fast started. You can select a time in the past.')}
    </div>
    {fast && <div className="muted small" style={{ marginBottom: 12 }}>{t('Started {0}', when(fast.start))}</div>}
    <label style={{ display: 'grid', gap: 8 }}>
      <span className="small">{fast ? t('End time') : t('Start time')}</span>
      <TextField type="datetime-local" dir="ltr" value={time ?? initialTime}
        min={fast ? localTime(fast.start) : undefined} max={localTime(Date.now())} required
        aria-invalid={!!error} aria-describedby={error ? 'fast-time-error' : undefined}
        onChange={e => { setTime(e.target.value); setError('') }} />
    </label>
    {duration !== null && <div style={{ textAlign: 'center', marginTop: 16 }}>
      <div className="muted small">{t('Total fasting time')}</div>
      <div role="status" aria-label={t('Total fasting time')} aria-live={time === null ? 'off' : 'polite'}
        style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{duration}</div>
    </div>}
    {error && <div id="fast-time-error" role="alert" className="small" style={{ color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    <div style={{ height: 18 }} />
    <Button type="submit" variant="primary">{fast ? t('End fast') : t('Start fast')}</Button>
    <div style={{ height: 8 }} />
    <Button type="button" variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </form>
}

export default function Fasting() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const running = activeFast(S)
  const history = completedFasts(S)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!running) return
    const tick = () => { if (!document.hidden) setNow(Date.now()) }
    tick()
    const timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [running?.start])

  const update = fn => useStore.getState().update(fn)
  const chooseTime = fast => useUI.getState().openSheet(close => <FastTimeSheet fast={fast} close={close} />)
  const remove = fast => confirmSheet({
    title: t('Delete fast?'),
    message: t('Remove this fast from your history?'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => update(s => { deleteFast(s, fast.id) }),
  })

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => backTo(nav, '/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Fasting')}</h1><div className="sub">{t('Your fasting timer and history')}</div></div>
    </div>

    <div className="card" style={{ textAlign: 'center' }}>
      {running ? <>
        <div className="muted small">{t('Fast in progress')}</div>
        <div style={{ fontSize: 48, fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '16px 0' }} role="timer">{fastDuration(running, now)}</div>
        <div className="muted small" style={{ marginBottom: 20 }}>{t('Started {0}', when(running.start))}</div>
        <Button onClick={() => chooseTime(running)}>{t('End fast')}</Button>
      </> : <>
        <div className="big" style={{ marginBottom: 6 }}>{t('Ready when you are')}</div>
        <div className="muted small" style={{ marginBottom: 20 }}>{t('Start a timer and end it when you finish fasting.')}</div>
        <Button onClick={() => chooseTime(null)}>{t('Start fast')}</Button>
      </>}
    </div>

    <h4 className="sec" style={{ marginTop: 24 }}>{t('History')}</h4>
    {history.length ? <div className="list">{history.map(fast => <div className="item" key={fast.id}>
      <span className="lrow-i"><Icon name="timer" /></span>
      <div className="grow">
        <div className="tt">{fastDuration(fast)}</div>
        <div className="ss">{when(fast.start)} – {when(fast.end)}</div>
      </div>
      <button className="iconbtn" onClick={() => remove(fast)} aria-label={t('Delete fast')}><Icon name="trash" /></button>
    </div>)}</div> : <div className="empty">{t('No completed fasts yet.')}</div>}
  </div>
}
