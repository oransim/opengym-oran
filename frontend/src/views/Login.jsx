import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { SimpleLogin } from '../components/SimpleAuth.jsx'

export default function Login() {
  const setGuest = useStore(s => s.setGuest)
  if (!DEMO) return <SimpleLogin />
  return <div className="narrow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }}>
    <div style={{ fontSize: 54, color: 'var(--acc)' }}><Icon name="dumbbell" /></div>
    <h1>Open Gym Oran</h1>
    <p className="muted">{t('Live demo. Everything stays in this browser.')}</p>
    <Button variant="primary" icon="play" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
    <p className="dim small"><a href={REPO} target="_blank" rel="noopener">{t('Self-host it in a minute →')}</a></p>
  </div>
}
