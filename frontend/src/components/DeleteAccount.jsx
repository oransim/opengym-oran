// Account deletion asks for the account name and current password.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { passwordError, ProveOwner } from './PasswordAuth.jsx'
import { Row, Button } from './ui.jsx'

const errStyle = { color: 'var(--red)', marginTop: 10 }

// The server's answer in the UI language, by its `code` (api/openapi.yaml, /api/account/delete).
export function deleteAccountError(e) {
  switch (e?.data?.code) {
    case 'confirm-name': return t('That is not your account name.')
    case 'last-admin': return t('You’re the only admin here, and other profiles still use this server. Make someone else an admin first.')
  }
  if (e?.data?.code || e?.status === 429) return passwordError(e)
  return t('Couldn’t delete the account. Nothing was removed.')
}

export function DeleteAccountSheet({ close, exportBackup, exportBackupZip, hasMedia, done }) {
  const user = useStore(s => s.user)
  const [typed, setTyped] = useState('')
  const [step, setStep] = useState('name')   // 'name' | 'confirm'
  const [proofs, setProofs] = useState(null)
  const [err, setErr] = useState(null)
  const ref = useRef(null)
  const name = user?.name || ''
  const match = !!name && typed.trim() === name
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  // Read as the sheet opens, so the proof step is ready by the time the name is typed.
  useEffect(() => {
    api('/api/account/password')
      .then(result => setProofs({ password: result.set, deleteBlocked: result.deleteBlocked }))
      .catch(e => setErr(deleteAccountError(e)))
  }, [])
  const next = ev => {
    ev.preventDefault()
    if (!match) return
    setStep('confirm')
  }
  const remove = async proof => {
    await useStore.getState().deleteAccount(typed.trim(), proof)
    close()
    useUI.getState().toast(t('Your account is gone. Thanks for every rep.'))
    done?.()
  }
  const password = !!proofs?.password
  const blocked = proofs?.deleteBlocked === 'last-admin' ? deleteAccountError({ data: { code: 'last-admin' } }) : null
  return <>
    <h3>{t('Delete your account?')}</h3>
    <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.5 }}>
      {t('Your profile, workouts, body weight, photos and videos are deleted from this server for good. There is no undo, and not even your admin can bring them back.')}
    </div>
    {step === 'name' ? <>
      <div className="small" style={{ marginBottom: 8 }}>{t('Want a copy first? Export a backup. You can import it into openGym anytime.')}</div>
      {hasMedia && exportBackupZip
        ? <Button icon="share" onClick={exportBackupZip}>{t('Export with photos & videos (.zip)')}</Button>
        : <Button icon="share" onClick={exportBackup}>{t('Export backup (JSON)')}</Button>}
      {blocked ? <div className="small" role="alert" style={errStyle}>{blocked}</div> : <form onSubmit={next} noValidate style={{ marginTop: 18 }}>
        <label className="small" htmlFor="delete-account-name" style={{ display: 'block', marginBottom: 6 }}>{t('Type {0} to confirm.', name)}</label>
        <input ref={ref} id="delete-account-name" className="input" placeholder={t('Account name')} autoComplete="off"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} value={typed} onChange={e => setTyped(e.target.value)} />
        <div style={{ height: 14 }} />
        <button type="submit" className="btn danger" disabled={!match}>{t('Continue')}</button>
      </form>}
      <div style={{ height: 8 }} />
      <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
    </> : <>
      <div className="dim small" style={{ marginBottom: 14 }}>{t('First confirm that it is you.')}</div>
      {!proofs ? (err ? <div className="small" role="alert" style={errStyle}>{err}</div> : <div className="dim small">{t('Loading…')}</div>)
        : <ProveOwner password={password} explain={deleteAccountError} danger submitText={t('Delete forever')} onProof={remove} />}
      <div style={{ height: 8 }} />
      <Button type="button" variant="ghost" className="dim" onClick={() => setStep('name')}>{t('Back')}</Button>
    </>}
  </>
}

// The row on the Account page. `done` runs once the account is gone (Settings goes home).
export function DeleteAccountRow(props) {
  const open = () => useUI.getState().openSheet(close => <DeleteAccountSheet {...props} close={close} />)
  return <Row icon="trash" iconTint="var(--red)" title={t('Delete my account')} subtitle={t('Removes your profile and everything in it from this server.')} danger onClick={open} />
}
