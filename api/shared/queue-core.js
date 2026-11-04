// Queue rules shared by the browser and the API reminder worker. Dates are supplied by each
// caller: the browser uses the device's local day, while the worker uses the reminder time zone.
export const routineIdsOf = w => Array.isArray(w.routineIds) ? w.routineIds : (w.routineId ? [w.routineId] : []);
const nameParts = w => String(w.name || '').split(' + ');

export function readQueue(S, dayOf) {
  const q = S?.queue;
  if (!q || typeof q !== 'object' || !Array.isArray(q.ids)) return null;
  if (q.rotationId && q.rotationId === S?.rotation?.id) return null;
  const known = new Set((Array.isArray(S?.routines) ? S.routines : []).map(r => r?.id));
  const ids = [...new Set(q.ids)].filter(id => known.has(id));
  if (!ids.length) return null;
  return { ...q, ids, startsOn: typeof q.startsOn === 'string' ? q.startsOn : dayOf(q.since || 0) };
}

// A workout credits a session if its start is after the pass began, or an earlier-clock
// workout is dated inside the pass and names that routine. Strict passes use only the clock.
export const workoutCredited = (q, w, name) => (w.start ?? 0) >= q.since
  || (q.strict !== true && String(w.d || '') >= q.startsOn && nameParts(w).includes(name));

export const workoutCountsFor = (S, q, w, id) => routineIdsOf(w).includes(id)
  && workoutCredited(q, w, (S.routines || []).find(r => r?.id === id)?.name);

// One pass over workouts, even when a queue has many sessions or the log is large.
export function completedIds(S, q) {
  const want = new Set(q.ids), names = new Map(), done = new Set();
  for (const r of S.routines || []) if (want.has(r?.id) && !names.has(r.id)) names.set(r.id, r.name);
  for (const w of S.workouts || []) {
    if (done.size === want.size) break;
    for (const id of routineIdsOf(w)) {
      if (want.has(id) && !done.has(id) && workoutCredited(q, w, names.get(id))) done.add(id);
    }
  }
  return done;
}

export function pinStateFor(S, q, id) {
  if (!q || !id || !q.ids.includes(id)) return null;
  return completedIds(S, q).has(id) ? 'done' : 'open';
}

export function activePins(S, remaining, today) {
  const open = new Set(remaining);
  return Object.entries(S.dayPlan || {}).filter(([iso, id]) => iso >= today && open.has(id))
    .map(([iso, id]) => ({ iso, id }));
}

export function nextOn(S, remaining, on, today) {
  const pins = activePins(S, remaining, today);
  const here = pins.find(p => p.iso === on);
  if (here) return here.id;
  const pinned = new Set(pins.map(p => p.id));
  return remaining.find(id => !pinned.has(id)) ?? null;
}
