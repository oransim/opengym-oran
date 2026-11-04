// A date-specific exception to the repeating weekday plan. Keep the routine in `week` so its
// other occurrences remain scheduled; only this date stops showing it.
import { effectiveRoutineIds } from './history.js'
import { exerciseRepeatsOn } from './exercise-repeat.js'

export const skippedOn = (S, iso) => Array.isArray(S?.dayPlanSkip?.[iso]) ? S.dayPlanSkip[iso] : []
export const isSkippedOn = (S, iso, id) => skippedOn(S, iso).includes(id)

export function activeSkippedOn(S, iso) {
  const withoutSkip = { ...S, dayPlanSkip: { ...S.dayPlanSkip, [iso]: [] } }
  const planned = new Set([...effectiveRoutineIds(withoutSkip, iso), ...exerciseRepeatsOn(withoutSkip, iso).map(r => r.id)])
  return skippedOn(S, iso).filter(id => planned.has(id))
}

export function skipOnDate(S, iso, id) {
  S.dayPlanSkip ||= {}
  const ids = skippedOn(S, iso)
  if (!ids.includes(id)) S.dayPlanSkip[iso] = [...ids, id]
}

export function restoreOnDate(S, iso, id) {
  const next = skippedOn(S, iso).filter(rid => rid !== id)
  if (next.length) S.dayPlanSkip[iso] = next
  else if (S.dayPlanSkip) delete S.dayPlanSkip[iso]
}
