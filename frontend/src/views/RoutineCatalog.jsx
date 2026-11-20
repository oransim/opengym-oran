import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backTo } from '../lib/nav.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { buildPlanBundle, mergePlan, parsePlan } from '../lib/plan-share.js'
import { exOr } from '../lib/exercises.js'
import { exLine } from '../lib/history.js'
import { speedUnitOf } from '../lib/speed.js'
import { exCount } from '../lib/format.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { Button, SearchField, Segmented } from '../components/ui.jsx'
import { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import catalog from '../lib/routine-catalog.json'

const PAGE_SIZE = 40

// Preview and import read the same prescriptions, including bundled customs and unit conversion.
const catalogBundle = (routine, unit) => parsePlan(buildPlanBundle({ ...catalog, routines: [routine], week: {} }), unit || 'kg')

function CatalogPreview({ routine, add, close }) {
  const S = useStore(s => s.S)
  const bundle = catalogBundle(routine, S.unit)
  const shown = bundle.routines[0]
  return <div className="routine-catalog-preview">
    <h3>{shown.name}</h3>
    <div className="small dim" style={{ marginBottom: 12 }}>{shown.kind === 'visit' ? t('Class') : exCount(shown.ex.length)}</div>
    {shown.ex.length ? <div className="list" style={{ marginBottom: 16 }}>
      {shown.ex.map((entry, index) => {
        const custom = bundle.customEx.find(ex => ex.id === entry.id)
        const ex = custom || exOr(entry.id)
        return <div className="item" key={index}>
          {custom ? <span className="lrow-i"><Icon name="dumbbell" /></span> : <Thumb ex={ex} />}
          <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
            <div className="ss">{exLine(entry, bundle.unit, speedUnitOf(S))}</div>
            {entry.note && <div className="small dim" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{entry.note}</div>}
          </div>
        </div>
      })}
    </div> : <p className="muted">{t('No exercises yet.')}</p>}
    <Button variant="primary" onClick={() => { add(routine); close() }}>{t(shown.kind === 'visit' ? 'Add to my classes' : 'Add to my routines')}</Button>
    <Button variant="ghost" onClick={close}>{t('Close')}</Button>
  </div>
}

export default function RoutineCatalog() {
  const nav = useNavigate()
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
    update(s => mergePlan(s, catalogBundle(routine, s.unit)))
  }
  const preview = routine => useUI.getState().openSheet(close => <CatalogPreview routine={routine} add={add} close={close} />)

  return <div className="narrow plan routine-catalog">
    <div className="hdr">
      <div><h1>{t('Routine library')}</h1><div className="sub">{t('Routines and classes you can add to your plan')}</div></div>
    </div>
    <button className="plan-textbtn" onClick={() => backTo(nav, '/routines')}>{t('My routines')}</button>
    <Segmented className="plan-views" value={kind} onChange={v => { setKind(v); setShown(PAGE_SIZE) }}
      options={[{ value: 'routine', label: t('Routines') }, { value: 'class', label: t('Classes') }]} />
    <SearchField value={query} onChange={e => { setQuery(e.target.value); setShown(PAGE_SIZE) }} onClear={() => { setQuery(''); setShown(PAGE_SIZE) }} placeholder={t('Search…')} aria-label={t('Search…')} />
    <div className="list routine-list routine-catalog-results">
      {entries.slice(0, shown).map(r => <div className="item" key={r.id}>
        <button type="button" className="grow item-open" onClick={() => preview(r)}><span className="tt">{r.name}</span><span className="ss">{kind === 'class' ? t('Class') : exCount(r.ex.length)}</span></button>
        <div className="row" style={{ gap: 8, marginInlineStart: 'auto' }}>
          <Button size="sm" variant="ghost" onClick={() => preview(r)}>{t('Details')}</Button>
          <Button size="sm" variant="tinted" onClick={() => add(r)}>{t(kind === 'class' ? 'Add to my classes' : 'Add to my routines')}</Button>
        </div>
      </div>)}
      {!entries.length && <div className="empty">{t('No matches')}</div>}
    </div>
    {entries.length > shown && <Button className="routine-catalog-more" onClick={() => setShown(n => n + PAGE_SIZE)}>{t('Show more')}</Button>}
  </div>
}
