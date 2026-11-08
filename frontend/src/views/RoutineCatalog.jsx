import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { buildPlanBundle, mergePlan, parsePlan } from '../lib/plan-share.js'
import { t } from '../lib/i18n.js'
import { Button, SearchField, Segmented } from '../components/ui.jsx'
import catalog from '../lib/routine-catalog.json'

const PAGE_SIZE = 40

export default function RoutineCatalog() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [kind, setKind] = useState('routine')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const entries = catalog.routines.filter(r =>
    (r.kind === 'visit') === (kind === 'class') &&
    r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )
  const add = routine => {
    // Use the plan import path so bundled custom exercises, unit conversion and fresh IDs
    // follow exactly the same rules as any imported routine.
    const source = { ...catalog, routines: [routine], week: {} }
    const bundle = parsePlan(buildPlanBundle(source), S.unit || 'kg')
    update(s => mergePlan(s, bundle))
  }

  return <div className="narrow plan routine-catalog">
    <div className="hdr">
      <div><h1>{t('Routine library')}</h1><div className="sub">{t('Routines and classes you can add to your plan')}</div></div>
    </div>
    <button className="plan-textbtn" onClick={() => nav('/routines')}>{t('My routines')}</button>
    <Segmented className="plan-views" value={kind} onChange={v => { setKind(v); setShown(PAGE_SIZE) }}
      options={[{ value: 'routine', label: t('Routines') }, { value: 'class', label: t('Classes') }]} />
    <SearchField value={query} onChange={e => { setQuery(e.target.value); setShown(PAGE_SIZE) }} onClear={() => { setQuery(''); setShown(PAGE_SIZE) }} placeholder={t('Search…')} aria-label={t('Search…')} />
    <div className="list routine-list routine-catalog-results">
      {entries.slice(0, shown).map(r => <div className="item" key={r.id}>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{kind === 'class' ? t('Class') : t('{0} exercises', r.ex.length)}</div></div>
        <Button size="sm" variant="tinted" onClick={() => add(r)}>{t(kind === 'class' ? 'Add to my classes' : 'Add to my routines')}</Button>
      </div>)}
      {!entries.length && <div className="empty">{t('No matches')}</div>}
    </div>
    {entries.length > shown && <Button className="routine-catalog-more" onClick={() => setShown(n => n + PAGE_SIZE)}>{t('Show more')}</Button>}
  </div>
}
