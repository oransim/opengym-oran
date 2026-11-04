import { exOr } from './exercises.js'

export const isExerciseRepeat = r => r?.kind === 'exercise-repeat'

export function makeExerciseRepeat(exId, config, id) {
  const rawName = exOr(exId).n || 'Exercise'
  return {
    id,
    name: rawName.charAt(0).toUpperCase() + rawName.slice(1),
    emoji: 'stretch',
    kind: 'exercise-repeat',
    ex: [{ id: exId, ...config }],
  }
}

export function exerciseRepeatsOn(S, iso) {
  if (S?.dayPlan?.[iso] === 'rest') return []
  const day = new Date(`${iso}T12:00:00`).getDay()
  const ids = [].concat(S?.week?.[day] || [])
  return ids.map(id => (S?.routines || []).find(r => r?.id === id && isExerciseRepeat(r)))
    .filter(r => r && !S?.dayPlanSkip?.[iso]?.includes(r.id))
}

export function repeatDoneOn(S, repeatId, iso) {
  return (S?.workouts || []).some(w => w?.d === iso &&
    (Array.isArray(w.routineIds) ? w.routineIds.includes(repeatId) : w.routineId === repeatId))
}
