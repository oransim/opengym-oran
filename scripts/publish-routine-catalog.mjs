// Add or update bundled routine and class templates from an exported openGym plan file.
// Usage: node scripts/publish-routine-catalog.mjs path/to/plan.json [output.json]
// The plan export contains routines and their custom exercises, without account or workout data.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/publish-routine-catalog.mjs path/to/plan.json [output.json]')
  process.exit(1)
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[3] || path.join(root, 'frontend/src/lib/routine-catalog.json'))
const records = value => Array.isArray(value) ? value.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : []
const safe = obj => Object.fromEntries(Object.entries(obj).filter(([key]) =>
  !key.startsWith('_') && !['media', 'photo', 'photos', 'video', 'videos'].includes(key)))
const keyOf = r => `${r.kind === 'visit' ? 'class' : 'routine'}:${r.name.trim().toLowerCase()}`
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))

const plan = read(path.resolve(input))
if (plan.opengym_plan !== 1 || !Array.isArray(plan.routines)) {
  throw new Error('Input must be an openGym plan export (Export plan file).')
}
const current = fs.existsSync(output) ? read(output) : { unit: plan.unit || 'kg', routines: [], customEx: [] }
if (plan.unit !== current.unit) {
  throw new Error(`Plan uses ${plan.unit || 'an unknown unit'}; the catalog uses ${current.unit}. Export a plan in the catalog's unit before publishing.`)
}
const byKey = new Map(records(current.routines).map(r => [keyOf(r), r]))
let published = 0
for (const r of records(plan.routines)) {
  if (r.kind === 'exercise-repeat' || (r.kind && r.kind !== 'visit')) continue
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name.trim() || !Array.isArray(r.ex)) continue
  if (r.kind !== 'visit' && !r.ex.length) continue
  const template = {
    id: r.id, name: r.name.trim(), ...(r.emoji ? { emoji: r.emoji } : {}),
    ...(r.kind === 'visit' ? { kind: 'visit' } : {}),
    ...(r.excludeFromProgression ? { excludeFromProgression: true } : {}),
    ex: records(r.ex).map(safe)
  }
  byKey.set(keyOf(template), template)
  published++
}
if (!published) throw new Error('The plan export has no routines or classes to publish.')

const routines = [...byKey.values()]
const used = new Set(routines.flatMap(r => records(r.ex).map(e => e.id)))
const customById = new Map([...records(current.customEx), ...records(plan.customEx)]
  .filter(e => typeof e.id === 'string' && used.has(e.id)).map(e => [e.id, safe(e)]))
const catalog = { unit: current.unit === 'lb' ? 'lb' : 'kg', routines, customEx: [...customById.values()] }
fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + '\n')
console.log(`Published ${published} templates; catalog now has ${routines.length} routines and classes: ${output}`)
