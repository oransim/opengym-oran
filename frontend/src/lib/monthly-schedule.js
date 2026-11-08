// Monthly rules are keyed by routine id. A numbered date absent from a short month is skipped.
export function monthlyIdsOn(S, iso) {
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return []
  const day = date.getDate()
  const weekday = date.getDay()
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return Object.entries(S?.monthly || {}).filter(([, rule]) => {
    if (rule?.type === 'date') return rule.day === day
    if (rule?.type === 'last') return day === last
    if (rule?.type === 'weekday' && rule.weekday === weekday) {
      return rule.ordinal === -1 ? day + 7 > last : Math.ceil(day / 7) === rule.ordinal
    }
    return false
  }).map(([id]) => id)
}
