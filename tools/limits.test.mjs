/**
 * 输入上限与显示截断测试：node tools/limits.test.mjs
 */
import assert from 'node:assert/strict'
const L = await import('./core/limits.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

section('输入长度上限（本次：4096 / 2048 / 512）')

test('上限常量就是需求值', () => {
  assert.equal(L.LIMITS.calcExpr, 4096)
  assert.equal(L.LIMITS.freeEq, 2048)
  assert.equal(L.LIMITS.coef, 512)
  assert.equal(L.LIMITS.tokens, 32768)
  assert.equal(L.LIMITS.depth, 256)
  assert.equal(L.LIMITS.numMax, Infinity)
  assert.equal(L.LIMITS.bigMaxDigits, 1001)
  assert.equal(L.LIMITS.tetraB, 12)
  assert.equal(L.LIMITS.factMax, 10000)
  assert.equal(L.LIMITS.towerDepth, 12)
})

test('计算器表达式边界：4095+1 可以，4096+1 不行', () => {
  assert.equal(L.fits('calcExpr', 4095, 1), true)
  assert.equal(L.fits('calcExpr', 4096, 1), false)
  assert.equal(L.fits('calcExpr', 4094, 2), true)
  assert.equal(L.fits('calcExpr', 4095, 2), false)
})

test('自由方程边界：2047+1 可以，2048+1 不行', () => {
  assert.equal(L.fits('freeEq', 2047, 1), true)
  assert.equal(L.fits('freeEq', 2048, 1), false)
})

test('系数边界：511+1 可以，512+1 不行', () => {
  assert.equal(L.fits('coef', 511, 1), true)
  assert.equal(L.fits('coef', 512, 1), false)
})

test('未知类别不拦（返回 true）', () => {
  assert.equal(L.fits('nothing', 999999, 999999), true)
})

section('显示层截断（内部不截）')

test('短文本原样显示', () => {
  assert.equal(L.clipText('1+2', 10), '1+2')
  const s = '1+2'
  assert.equal(L.clipCursor(s, 3, 10), '1+2|')
})

test('超长文本尾部保留并加省略号', () => {
  const s = '1'.repeat(100) + 'X'
  const out = L.clipText(s, 10)
  assert.ok(out.length <= 10, '长度 ' + out.length)
  assert.ok(out.charAt(0) === '…')
  assert.ok(out.indexOf('X') > 0, '尾部要保留')
})

test('超长表达式：光标始终在显示窗口里，内部串不变', () => {
  const s = '1+'.repeat(200) + '9'
  const cur = 120
  const out = L.clipCursor(s, cur, 40)
  assert.ok(out.indexOf('|') >= 0, '光标必须可见')
  assert.equal(s.length, 401, '内部串不应被改')
  assert.ok(out.length <= 42, '显示串应受窗口限制，实际 ' + out.length)
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
