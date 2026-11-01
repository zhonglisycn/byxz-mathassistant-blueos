/**
 * 生物页数据：6 个高中主题，每主题至少 5 条知识点。
 */
import assert from 'node:assert/strict'
const B = await import('./data/biology.js')
const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
test('6 个主题，内容非空', () => {
  assert.equal(B.bioTopics.length, 6)
  const ids = new Set()
  for (const t of B.bioTopics) {
    assert.ok(t.id && !ids.has(t.id), t.id)
    ids.add(t.id)
    assert.ok(t.name && t.sub)
    assert.ok(Array.isArray(t.points) && t.points.length >= 5, t.id)
    for (const p of t.points) assert.ok(typeof p === 'string' && p.length > 8)
  }
})
const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
