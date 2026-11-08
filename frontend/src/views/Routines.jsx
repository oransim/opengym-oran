import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { RoutinesList } from './Plan.jsx'
import { t } from '../lib/i18n.js'
import { Button } from '../components/ui.jsx'

export default function Routines() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  return <div className="narrow plan routines-view">
    <RoutinesList S={S} update={update} nav={nav} />
    <Button className="routine-catalog-link" variant="tinted" onClick={() => nav('/routines/catalog')}>{t('Browse library')}</Button>
  </div>
}
