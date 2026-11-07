import { useEffect, useState } from 'react'
import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api, passwordLogin, passwordRegister, passwordResetRedeem } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { askAddDeviceData } from '../sheets.jsx'
import { Button, Row } from './ui.jsx'
import { MIN_PASSWORD, looksLikeEmail, passwordError } from './PasswordAuth.jsx'

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })
const explain = e => e?.data?.code === 'reset-invalid' ? t('This link has expired or has already been used. Request a new link.') : passwordError(e)
const enough = pw => [...pw.normalize('NFKC')].length >= MIN_PASSWORD
function Field({ label, name, type = 'text', value, onChange, autoComplete }) {
  return <label style={{ display: 'grid', gap: 6, marginBottom: 14, textAlign: 'start', fontWeight: 500 }}>
    <span className="small">{t(label)}</span>
    <input className="input" name={name} type={type} aria-label={t(label)} autoComplete={autoComplete} value={value}
      style={{ width: '100%', minHeight: 46, padding: '11px 12px', border: '1px solid var(--sep)', borderRadius: 10, background: 'var(--bg)', color: 'var(--label)', fontSize: 16 }}
      autoCapitalize="none" spellCheck={false} maxLength={name === 'username' ? 40 : 256} onChange={e => onChange(e.target.value)} />
  </label>
}
function Alert({ children }) { return children ? <div role="alert" className="small" style={{ color: 'var(--red)', marginBottom: 14 }}>{children}</div> : null }

/** The web account flow: credentials in, email link out, no device-transfer ceremonies. */
export function SimpleLogin({ resetPage = false, resetToken = '', initialMode = 'signin', compact = false, onAuthenticated }) {
  const config = useStore(s => s.config)
  const [mode, setMode] = useState(resetPage ? 'reset' : initialMode)
  const [name, setName] = useState(''), [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState(''), [again, setAgain] = useState(''), [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const change = next => { setMode(next); setError(''); setNotice(''); setPassword(''); setAgain('') }
  const submit = async ev => {
    ev.preventDefault(); if (busy) return
    const bad = (mode === 'signin' || mode === 'register' || mode === 'code') && !name.trim() ? t('Enter your username.')
      : (mode === 'forgot' || mode === 'register') && !looksLikeEmail(email) ? t('Enter a valid recovery email.')
      : mode === 'signin' && !password ? t('Enter your password.')
      : mode === 'code' && !code.trim() ? t('Enter the reset code.')
      : (mode === 'reset' || mode === 'register' || mode === 'code') && !enough(password) ? t('Use at least {0} characters.', MIN_PASSWORD)
      : (mode === 'reset' || mode === 'register' || mode === 'code') && password !== again ? t('The passwords do not match.')
      : mode === 'register' && config?.invite_only && !invite.trim() ? t('An invite code is required')
      : mode === 'reset' && !resetToken ? t('This link is incomplete. Request a new link.') : ''
    if (bad) { setError(bad); return }
    setBusy(true); setError('')
    try {
      if (mode === 'forgot') {
        await post('/api/login/forgot-password', { email: email.trim() })
        setNotice(t('If an account uses that email, a password reset email has been requested. Check your inbox and spam folder shortly.'))
      } else if (mode === 'code') {
        const st = useStore.getState()
        const user = await passwordResetRedeem(name.trim(), code.trim(), password)
        st.setUser(user, { adopt: true })
        await st.adoptProfile(askAddDeviceData)
        onAuthenticated?.()
        window.location.hash = '/home'
      } else if (mode === 'reset') {
        await post('/api/login/reset-password', { token: resetToken, password })
        // The token is in the fragment, never a server URL or referrer. Remove it after use.
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + '#/reset-password')
        setMode('signin'); setPassword(''); setAgain(''); setNotice(t('Password updated. Sign in with your username and new password.'))
      } else {
        const st = useStore.getState()
        const registering = mode === 'register'
        const user = registering ? await passwordRegister(name.trim(), password, invite.trim(), email.trim()) : await passwordLogin(name.trim(), password)
        st.setUser(user, { adopt: !registering })
        if (registering) { if (hasData(st.S)) await st.pushState(); else await st.pullState() }
        else await st.adoptProfile(askAddDeviceData)
        onAuthenticated?.()
        window.location.hash = '/home'
      }
    } catch (e) { setError(explain(e)) }
    finally { setBusy(false) }
  }
  const titles = { signin: 'Sign in', register: 'Create account', forgot: 'Reset password', reset: 'Choose a new password', code: 'Use a reset code' }
  return <div className="narrow" style={{ maxWidth: 430, margin: 'auto', padding: compact ? '8px 0' : 'max(36px, 9vh) 8px 36px' }}>
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div className="small" style={{ color: 'var(--acc)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 10 }}>OPEN GYM ORAN</div>
      <h1 style={{ margin: '0 0 8px', fontSize: 32 }}>{t(titles[mode])}</h1>
      <div className="muted small">{mode === 'forgot' ? t('Enter your recovery email. We will send you a link to choose a new password.')
        : mode === 'register' ? t('Your training, saved in your own account.') : mode === 'reset' ? t('Choose a password you can use on all your devices.') : t('Welcome back. Your training is waiting.')}</div>
    </div>
    <div className="card" style={{ padding: 22 }}>
      {notice && <p role="status" className="small" style={{ color: 'var(--acc)', marginTop: 0, lineHeight: 1.6 }}>{notice}</p>}
      <form onSubmit={submit} noValidate>
        {(mode === 'signin' || mode === 'register' || mode === 'code') && <Field label="Username" name="username" autoComplete="username" value={name} onChange={setName} />}
        {(mode === 'forgot' || mode === 'register') && <Field label="Recovery email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} />}
        {mode === 'code' && <Field label="Reset code" name="reset-code" autoComplete="one-time-code" value={code} onChange={setCode} />}
        {mode !== 'forgot' && <Field label={mode === 'reset' || mode === 'code' ? 'New password' : 'Password'} name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={setPassword} />}
        {(mode === 'register' || mode === 'reset' || mode === 'code') && <>
          <Field label="Confirm password" name="confirm-password" type="password" autoComplete="new-password" value={again} onChange={setAgain} />
          <p className="small dim">{t('Use at least {0} characters.', MIN_PASSWORD)}</p>
        </>}
        {mode === 'register' && config?.invite_only && <Field label="Invite code" name="invite-code" value={invite} onChange={setInvite} />}
        <Alert>{error}</Alert>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? t('Please wait…') : t(mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save new password' : titles[mode])}</Button>
      </form>
      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {mode === 'signin' && <Button variant="ghost" onClick={() => change('forgot')}>{t('Forgot password?')}</Button>}
        {mode === 'signin' && <Button variant="ghost" onClick={() => change('code')}>{t('Have a reset code?')}</Button>}
        {mode === 'signin' && <Button variant="ghost" onClick={() => change('register')}>{t('Create account')}</Button>}
        {mode === 'reset' && <Button variant="ghost" onClick={() => change('forgot')}>{t('Request a new link')}</Button>}
        {mode !== 'signin' && <Button variant="ghost" onClick={() => change('signin')}>{t('Back to sign in')}</Button>}
      </div>
    </div>
  </div>
}

export const openSimpleSignIn = (initialMode = 'signin') => useUI.getState().openSheet(close => <SimpleLogin compact initialMode={initialMode} onAuthenticated={close} />)

export function SimpleAccountRows() {
  const [status, setStatus] = useState(null), [loadError, setLoadError] = useState('')
  const load = () => api('/api/account/password').then(setStatus).catch(() => setLoadError(t('Account settings could not be loaded. Please try again.')))
  useEffect(() => { load() }, [])
  if (!status) return <Alert>{loadError}</Alert>
  const edit = kind => useUI.getState().openSheet(close => <SimpleAccountForm kind={kind} status={status} close={close} done={load} />)
  return <>
    <Row icon="person" title={t('Username')} subtitle={status.name} />
    <Row icon="key" title={t('Password')} subtitle={status.set ? t('Change your password') : t('Check your password setup email to finish account setup.')} accessory={status.set ? 'chevron' : 'none'} onClick={status.set ? () => edit('password') : undefined} />
    <Row icon="envelope" title={t('Recovery email')} subtitle={status.email || t('Not set')} accessory={status.set ? 'chevron' : 'none'} onClick={status.set ? () => edit('email') : undefined} />
  </>
}

export function SimpleAccountForm({ kind, status, close, done }) {
  const [current, setCurrent] = useState(''), [value, setValue] = useState(kind === 'email' ? status.email || '' : ''), [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submit = async ev => {
    ev.preventDefault(); if (busy) return
    const bad = !current ? t('Enter your current password.') : kind === 'email' && !looksLikeEmail(value) ? t('Enter a valid recovery email.')
      : kind === 'password' && !enough(value) ? t('Use at least {0} characters.', MIN_PASSWORD)
      : kind === 'password' && value !== again ? t('The passwords do not match.') : ''
    if (bad) { setError(bad); return }
    setBusy(true); setError('')
    try {
      await post('/api/account/' + kind, kind === 'email' ? { email: value.trim(), current } : { next: value, current })
      await done(); close(); useUI.getState().toast(t(kind === 'email' ? 'Recovery email saved' : 'Password saved. You’re now signed out everywhere else.'))
    } catch (e) { setError(explain(e)) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{t(kind === 'email' ? 'Change recovery email' : 'Change password')}</h3>
    <p className="muted small">{t(kind === 'email' ? 'Password reset links will be sent to this address.' : 'Saving your password signs you out on your other devices.')}</p>
    <form onSubmit={submit} noValidate>
      <input name="username" autoComplete="username" value={status.name} readOnly hidden />
      <Field label="Current password" name="current-password" type="password" autoComplete="current-password" value={current} onChange={setCurrent} />
      <Field label={kind === 'email' ? 'Recovery email' : 'New password'} name={kind === 'email' ? 'email' : 'new-password'} type={kind === 'email' ? 'email' : 'password'} autoComplete={kind === 'email' ? 'email' : 'new-password'} value={value} onChange={setValue} />
      {kind === 'password' && <Field label="Confirm password" name="confirm-password" type="password" autoComplete="new-password" value={again} onChange={setAgain} />}
      <Alert>{error}</Alert><Button type="submit" variant="primary" disabled={busy}>{t('Save')}</Button>
    </form>
  </>
}
