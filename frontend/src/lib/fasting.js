import { uid } from './format.js'

const entries = state => Object.values(state?.fasts || {}).filter(f => f && !f.deleted && Number.isFinite(f.start) && f.start > 0)

export function activeFast(state) {
  return entries(state).filter(f => f.end == null).sort((a, b) => b.start - a.start)[0] || null
}

export function completedFasts(state) {
  return entries(state).filter(f => Number.isFinite(f.end) && f.end >= f.start).sort((a, b) => b.end - a.end)
}

export function startFast(state, now = Date.now(), id = uid()) {
  const running = activeFast(state)
  if (running) return running
  if (!state.fasts || typeof state.fasts !== 'object') state.fasts = {}
  const fast = { id, start: now, _ts: now }
  state.fasts[id] = fast
  return fast
}

export function endFast(state, now = Date.now()) {
  const running = activeFast(state)
  if (!running) return null
  running.end = Math.max(running.start, now)
  running._ts = Math.max(now, running._ts + 1)
  return running
}

export function deleteFast(state, id, now = Date.now()) {
  const fast = state.fasts?.[id]
  if (!fast || fast.end == null || fast.deleted) return false
  fast.deleted = true
  fast._ts = Math.max(now, fast._ts + 1)
  return true
}

export function fastDuration(fast, now = Date.now()) {
  const seconds = Math.max(0, Math.floor(((fast?.end ?? now) - (fast?.start || now)) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
}
