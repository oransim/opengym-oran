import { useState } from 'react'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import { passwordError } from './PasswordAuth.jsx'

export function PairMobileSheet({ close }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const create = async event => {
    event.preventDefault()
    if (!password || busy) return
    setBusy(true); setError('')
    try {
      const result = await api('/api/pair/create', { method: 'POST', body: JSON.stringify({ current: password }) })
      setCode(result.code)
    } catch (e) { setError(passwordError(e)) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{t('Pair the mobile app')}</h3>
    {code ? <>
      <p className="muted small">{t('Enter this code in the mobile app. It works once and expires in 5 minutes.')}</p>
      <p style={{ fontSize: 26, fontWeight: 700, letterSpacing: '.12em', textAlign: 'center' }}>{code}</p>
      <Button onClick={close}>{t('Done')}</Button>
    </> : <form onSubmit={create}>
      <p className="muted small">{t('Confirm your password to make a pairing code for the mobile app.')}</p>
      <input className="input" type="password" autoComplete="current-password" placeholder={t('Current password')} value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p role="alert" className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy || !password}>{t('Create pairing code')}</Button>
    </form>}
  </>
}
export const openPairMobile = () => useUI.getState().openSheet(close => <PairMobileSheet close={close} />)
