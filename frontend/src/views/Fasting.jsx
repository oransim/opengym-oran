import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { activeFast, completedFasts, deleteFast, endFast, fastDuration, startFast } from '../lib/fasting.js'
import { dateLocale, t } from '../lib/i18n.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'

const when = time => new Date(time).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

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
  const remove = fast => confirmSheet({
    title: t('Delete fast?'),
    message: t('Remove this fast from your history?'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => update(s => { deleteFast(s, fast.id) }),
  })

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Fasting')}</h1><div className="sub">{t('Your fasting timer and history')}</div></div>
    </div>

    <div className="card" style={{ textAlign: 'center' }}>
      {running ? <>
        <div className="muted small">{t('Fast in progress')}</div>
        <div style={{ fontSize: 48, fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '16px 0' }} role="timer">{fastDuration(running, now)}</div>
        <div className="muted small" style={{ marginBottom: 20 }}>{t('Started {0}', when(running.start))}</div>
        <Button onClick={() => update(s => { endFast(s) })}>{t('End fast')}</Button>
      </> : <>
        <div className="big" style={{ marginBottom: 6 }}>{t('Ready when you are')}</div>
        <div className="muted small" style={{ marginBottom: 20 }}>{t('Start a timer and end it when you finish fasting.')}</div>
        <Button onClick={() => update(s => { startFast(s) })}>{t('Start fast')}</Button>
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
