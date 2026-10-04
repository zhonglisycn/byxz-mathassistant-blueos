/**
 * 方程求解测试：node tools/solver.test.mjs
 */
import assert from 'node:assert/strict'
const S = await import('./core/solver.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }
const near = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 1e-9 : tol)

section('一元一次 ax + b = 0')

test('常规解', () => {
  const r = S.solveLinear(2, 4)
  assert.equal(r.ok, true)
  assert.equal(r.roots.length, 1)
  assert.ok(near(r.roots[0], -2), '实际 ' + r.roots[0])
  assert.ok(r.steps.length >= 3, '应给出解题步骤')
})

test('a = 0：无解 / 恒等式', () => {
  const none = S.solveLinear(0, 5)
  assert.equal(none.ok, false)
  const any = S.solveLinear(0, 0)
  assert.equal(any.ok, true)
  assert.equal(any.any, true)
})

test('分数解显示为分数', () => {
  const r = S.solveLinear(3, -1)     // 3x - 1 = 0 → x = 1/3
  assert.ok(near(r.roots[0], 1 / 3))
  assert.ok(S.rootsText(r).indexOf('1/3') >= 0, '实际 ' + S.rootsText(r))
})

section('一元二次 ax² + bx + c = 0')

test('Δ > 0：两个实根', () => {
  const r = S.solveQuadratic(1, -3, 2)     // x² - 3x + 2 = 0 → 1, 2
  assert.equal(r.ok, true)
  assert.equal(r.real, true)
  assert.equal(r.roots.length, 2)
  const xs = r.roots.map(o => o.re).sort((a, b) => a - b)
  assert.ok(near(xs[0], 1) && near(xs[1], 2), '实际 ' + xs)
  assert.ok(near(r.sum, 3) && near(r.product, 2), '韦达定理')
  assert.ok(near(r.vertex.x, 1.5) && near(r.vertex.y, -0.25), '顶点')
})

test('Δ = 0：重根', () => {
  const r = S.solveQuadratic(1, -2, 1)
  assert.equal(r.roots.length, 1)
  assert.ok(near(r.roots[0].re, 1))
  assert.ok(r.steps.join(' ').indexOf('相等') >= 0)
})

test('Δ < 0：共轭复根', () => {
  const r = S.solveQuadratic(1, 0, 1)      // x² + 1 = 0 → ±i
  assert.equal(r.real, false)
  assert.equal(r.roots.length, 2)
  assert.ok(near(r.roots[0].re, 0) && near(Math.abs(r.roots[0].im), 1))
  assert.ok(S.rootsText(r).indexOf('i') >= 0, '实际 ' + S.rootsText(r))
})

test('二次项系数为 0 时自动按一次方程解', () => {
  const r = S.solveQuadratic(0, 2, -6)
  assert.equal(r.kind, 'linear')
  assert.ok(near(r.roots[0], 3))
})

test('无理解：x²+2x+5', () => {
  const r = S.solveQuadratic(1, 2, 5)
  assert.equal(r.d < 0, true)
  assert.ok(near(r.roots[0].re, -1) && near(Math.abs(r.roots[0].im), 2))
})

section('二元一次方程组')

test('唯一解', () => {
  const r = S.solveSystem2(1, 1, 3, 1, -1, 1)   // x+y=3, x-y=1 → (2,1)
  assert.equal(r.ok, true)
  assert.ok(near(r.x, 2) && near(r.y, 1), '实际 ' + r.x + ',' + r.y)
})

test('平行无解 / 重合无穷解', () => {
  const none = S.solveSystem2(1, 1, 1, 1, 1, 2)
  assert.equal(none.none, true)
  const any = S.solveSystem2(1, 1, 1, 2, 2, 2)
  assert.equal(any.any, true)
})

section('任意方程 f(x) = 0（数值求根）')

test('x² - 2 = 0 → ±√2', () => {
  const r = S.solveNumeric('x^2-2', { xmin: -5, xmax: 5 })
  assert.equal(r.ok, true)
  assert.equal(r.roots.length, 2)
  const xs = r.roots.slice().sort((a, b) => a - b)
  assert.ok(near(xs[0], -Math.SQRT2, 1e-5) && near(xs[1], Math.SQRT2, 1e-5), '实际 ' + xs)
})

test('sin(x) = 0 的多个根（含 0、±π）', () => {
  const r = S.solveNumeric('sin(x)', { xmin: -7, xmax: 7 })
  assert.ok(r.roots.length >= 5, '应找到至少 5 个根，实际 ' + r.roots.length)
  assert.ok(r.roots.some(v => near(v, 0, 1e-5)))
  assert.ok(r.roots.some(v => near(v, Math.PI, 1e-5)))
  assert.ok(r.roots.some(v => near(v, -Math.PI, 1e-5)))
})

test('tan(x) 不能把渐近线当成根', () => {
  const r = S.solveNumeric('tan(x)', { xmin: -4, xmax: 4 })
  // tan 在 ±π/2 两侧变号，但不是根；真正的根是 0、±π
  for (const v of r.roots) {
    assert.ok(Math.abs(Math.tan(v)) < 1e-6, '假的根：' + v + '，tan=' + Math.tan(v))
  }
  assert.ok(r.roots.some(v => near(v, 0, 1e-5)))
  assert.ok(r.roots.some(v => near(v, Math.PI, 1e-2)), '应找到 π，实际 ' + r.roots)
})

test('1/x 没有根（x=0 是极点，不能报成根）', () => {
  const r = S.solveNumeric('1/x', { xmin: -5, xmax: 5 })
  assert.equal(r.roots.length, 0, '实际 ' + r.roots)
})

test('无实根与非法表达式', () => {
  assert.equal(S.solveNumeric('x^2+1', { xmin: -10, xmax: 10 }).roots.length, 0)
  const bad = S.solveNumeric('x^2+(', {})
  assert.equal(bad.ok, false)
  assert.ok(bad.err)
})

test('一元三次也能求（数值法）', () => {
  const r = S.solveNumeric('x^3-2x-5', { xmin: -5, xmax: 5 })
  assert.equal(r.roots.length, 1)
  assert.ok(near(r.roots[0], 2.0945514815, 1e-5), '实际 ' + r.roots[0])
})

section('任意写法的方程（自动化为一般式）')

test('一次：2x + 3 = 7', () => {
  const r = S.solveEquation('2x+3=7')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.general, '2x − 4 = 0')
  assert.equal(r.roots.length, 1)
  assert.ok(near(r.roots[0].re, 2), '实际 ' + r.roots[0].re)
})

test('二次：x² − 3x = −2（右边也要移项）', () => {
  const r = S.solveEquation('x^2-3x=-2')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.general, 'x² − 3x + 2 = 0')
  const xs = r.roots.map(o => Math.round(o.re * 1e6) / 1e6).sort((a, b) => a - b)
  assert.deepEqual(xs, [1, 2])
})

test('展开括号：2(x+3) = x − 1', () => {
  const r = S.solveEquation('2(x+3)=x-1')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.general, 'x + 7 = 0')
  assert.ok(near(r.roots[0].re, -7), '实际 ' + r.roots[0].re)
})

test('两边都有二次项：3x² + 1 = x² + 9', () => {
  const r = S.solveEquation('3x^2+1=x^2+9')
  assert.equal(r.general, '2x² − 8 = 0')
  const xs = r.roots.map(o => Math.round(o.re * 1e6) / 1e6).sort((a, b) => a - b)
  assert.deepEqual(xs, [-2, 2])
})

test('无实根时给出复根', () => {
  const r = S.solveEquation('x^2+1=0')
  assert.equal(r.ok, true)
  assert.equal(r.roots.length, 2)
  assert.ok(Math.abs(r.roots[0].re) < 1e-9 && Math.abs(r.roots[0].im) > 0.99)
})

test('分数系数与分母：x/2 + 1 = 3', () => {
  const r = S.solveEquation('x/2+1=3')
  assert.equal(r.ok, true, r.err)
  assert.ok(near(r.roots[0].re, 4), '实际 ' + r.roots[0].re + '，一般式 ' + r.general)
})

test('恒等式与矛盾式', () => {
  assert.equal(S.solveEquation('x^2=x^2').any, true)
  assert.equal(S.solveEquation('1=2').none, true)
})

test('高次走数值法', () => {
  const r = S.solveEquation('x^3-2x-5=0')
  assert.equal(r.ok, true)
  assert.equal(r.roots.length, 1)
  assert.ok(near(r.roots[0].re, 2.0945514815, 1e-4), '实际 ' + r.roots[0].re)
})

test('写错时的提示', () => {
  assert.ok(S.solveEquation('2x+3').err.indexOf('等号') >= 0)
  assert.ok(S.solveEquation('x=1=2').err.indexOf('一个等号') >= 0)
  assert.ok(S.solveEquation('1/x=2').err.length > 0, 'x 在分母应给出说明')
  assert.ok(S.solveEquation('').err.length > 0)
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
