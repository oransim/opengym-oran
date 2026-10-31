export const isVisitRoutine = routine => routine?.kind === 'visit'
export const routineHasContent = routine => isVisitRoutine(routine) || !!routine?.ex?.length
export const isVisitSession = session => session?.kind === 'visit'
