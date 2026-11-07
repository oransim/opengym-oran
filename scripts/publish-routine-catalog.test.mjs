import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./publish-routine-catalog.mjs', import.meta.url))

test('publishes a plan export without a source account and keeps existing templates', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-catalog-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const input = path.join(dir, 'plan.json'), output = path.join(dir, 'catalog.json')
  fs.writeFileSync(output, JSON.stringify({ unit: 'kg', routines: [{ id: 'old', name: 'Yoga', kind: 'visit', ex: [] }], customEx: [] }))
  fs.writeFileSync(input, JSON.stringify({
    opengym_plan: 1, unit: 'kg', week: {},
    routines: [
      { id: 'new', name: 'New strength routine', ex: [{ id: 'custom-1', sets: 3, reps: 8 }] },
      { id: 'repeat', name: 'Repeat', kind: 'exercise-repeat', ex: [{ id: '0025' }] }
    ],
    customEx: [{ id: 'custom-1', n: 'A custom exercise', bp: 'legs' }],
    workouts: [{ id: 'private' }]
  }))
  const result = spawnSync(process.execPath, [script, input, output], { encoding: 'utf8', cwd: dir })
  assert.equal(result.status, 0, result.stderr)
  const catalog = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.deepEqual(catalog.routines.map(r => r.name), ['Yoga', 'New strength routine'])
  assert.deepEqual(catalog.customEx.map(e => e.id), ['custom-1'])
  assert.equal(JSON.stringify(catalog).includes('private'), false)
})
