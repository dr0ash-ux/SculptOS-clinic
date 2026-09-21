import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/calendarDate.ts', import.meta.url), 'utf8')
const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
const { dateKey } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
for (const timezone of ['Asia/Kolkata', 'UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
  process.env.TZ = timezone
  for (const day of ['2026-09-21', '2026-12-31', '2027-01-01', '2026-03-08', '2026-11-01']) {
    const column = new Date(`${day}T00:00:00`)
    assert.equal(dateKey(column), day)
    for (const time of ['00:05', '07:00', '10:30', '17:00', '22:00', '23:55']) {
      const booking = new Date(`${day}T${time}:00`)
      const stored = booking.toISOString()
      assert.equal(dateKey(new Date(stored)), dateKey(column), `${timezone}: ${day} ${time}`)
    }
  }
  console.log(`${timezone}: booking dates round-trip to their original calendar columns`)
}
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
assert.ok(!app.includes('scheduled_at.slice(0, 10)'), 'No UTC date slicing for calendar grouping')
const clinical = app.slice(app.indexOf('const saveClinicalFile ='), app.indexOf('const switchBranch ='))
assert.match(clinical, /if \(error\) throw/)
assert.match(clinical, /navigateTo\('appointments'\)/)
assert.ok(!clinical.includes("navigateTo('treatment_plan')"))
assert.match(app, /<summary>General settings<\/summary>/)
assert.match(app, /workspace.role === 'admin' && <details/)
assert.match(app, /onMouseLeave=\{\(\) => setPreview\(null\)\}/)
console.log('Clinical save failure/success routing, settings guard and hover dismissal checks passed')
