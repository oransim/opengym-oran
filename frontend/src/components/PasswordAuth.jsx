import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

export const MIN_PASSWORD = 6
export const foldEmail = s => String(s || '').normalize('NFKC').trim().toLowerCase()
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@(?=.{1,253}$)[^\s@<>()[\]\\,;:"._-][^\s@<>()[\]\\,;:"]*\.[^\s@<>()[\]\\,;:".]{2,}$/u
export const looksLikeEmail = s => {
  const e = foldEmail(s)
  return !!e && [...e].length <= 254 && EMAIL_RE.test(e) && !e.includes('..')
}
export function passwordError(e) {
  const code = e?.data?.code
  if (e?.status === 429 || code === 'locked') return t('Too many attempts. Try again later.')
  switch (code) {
    case 'bad-credentials': return t('Wrong name, e-mail or password.')
    case 'too-short': return t('Use at least {0} characters.', MIN_PASSWORD)
    case 'too-common': return t('That password is too easy to guess. Try a longer one, or a few random words strung together.')
    case 'too-long': return t('That password is too long.')
    case 'name-taken': return t('Another profile already signs in with this name.')
    case 'email-invalid': return t('That is not an e-mail address.')
    case 'email-taken': return t('Another profile already uses this e-mail address.')
    case 'invite': return t('That invite code is not valid.')
    case 'current-required': case 'current-wrong': return t('Your current password is not right.')
    case 'reset-invalid': return t('That reset link is wrong or has expired.')
    case 'disabled': return t('This account has been disabled.')
    case 'busy': return t('The server is busy. Try again in a moment.')
  }
  return e?.message || t('Sign-in failed')
}
export function ProveOwner({ onProof, explain = passwordError, danger = false, submitText }) {
  const name = useStore(s => s.user?.name) || ''
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    if (!pw) { setErr(t('Enter your password.')); return }
    setBusy(true); setErr(null)
    try { await onProof({ current: pw }) }
    catch (e) { setErr(explain(e)) }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} noValidate>
    <input type="text" name="username" autoComplete="username" value={name} readOnly hidden />
    <input className="input" type="password" name="current-password" autoComplete="current-password" placeholder={t('Current password')}
      value={pw} onChange={e => setPw(e.target.value)} />
    <div style={{ height: 10 }} />
    <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy}>{submitText || t('Continue')}</Button>
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
  </form>
}
