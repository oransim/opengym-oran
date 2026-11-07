import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { RoutinesList } from './Plan.jsx'
import { buildPlanBundle, mergePlan, parsePlan } from '../lib/plan-share.js'
import { t } from '../lib/i18n.js'
import { Button } from '../components/ui.jsx'
import catalog from '../lib/routine-catalog.json'

export default function Routines() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const addCatalog = routine => {
    const source = { ...catalog, routines: [routine], week: {} }
    const bundle = parsePlan(buildPlanBundle(source), S.unit || 'kg')
    update(s => mergePlan(s, bundle))
  }
  const section = (kind, title, addLabel) => <section className="sect" style={{ marginTop: 28 }}>
    <div className="sect-t">{t(title)}</div>
    <div className="list routine-list">{catalog.routines.filter(r => (r.kind === 'visit') === (kind === 'class')).map(r =>
      <div className="item" key={r.id}>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{kind === 'class' ? t('Class') : t('{0} exercises', r.ex.length)}</div></div>
        <Button size="sm" variant="tinted" onClick={() => addCatalog(r)}>{t(addLabel)}</Button>
      </div>
    )}</div>
  </section>
  return <div className="narrow plan routines-view">
    <RoutinesList S={S} update={update} nav={nav} />
    {section('routine', 'Routine library', 'Add to my routines')}
    {section('class', 'Class library', 'Add to my classes')}
  </div>
}
