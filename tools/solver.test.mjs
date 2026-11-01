/**
 * 方程求解测试：node tools/solver.test.mjs
 */
import assert from 'node:assert/strict'
const S = await import('./core/solver.js')
const C = await import('./core/calc.js')
const POLY = await import('./core/poly.js')

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
  const den = S.solveEquation('1/x=2')
  assert.equal(den.ok, true, den.err)
  assert.ok(near(den.roots[0].re, 0.5, 1e-9), '实际 ' + JSON.stringify(den.roots))
  assert.ok(S.solveEquation('').err.length > 0)
})

section('三次 / 四次：有理根降次 + 数值求根')

test('三次 x³−6x²+11x−6=0 → 1,2,3（精确）', () => {
  const r = S.solveEquation('x^3-6x^2+11x-6=0')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.degree, 3)
  const xs = r.roots.map(o => Math.round(o.re * 1e9) / 1e9).sort((a, b) => a - b)
  assert.deepEqual(xs, [1, 2, 3], '实际 ' + xs)
  const lines = S.rootLines(r.roots, true)
  assert.equal(lines.hasExact, true, '三个整数根都应给精确行')
  assert.ok(lines.lines[0].text.indexOf('精确：') === 0)
  assert.ok(lines.lines[0].text.indexOf('x1 = 1') > 0, lines.lines[0].text)
})

test('三次的有理分数根保留精确形式（6x³−5x²−2x+1 → −1/2, 1/3, 1）', () => {
  const r = S.solveEquation('6x^3-5x^2-2x+1=0')
  assert.equal(r.ok, true, r.err)
  const lines = S.rootLines(r.roots, true)
  assert.equal(lines.hasExact, true)
  assert.ok(lines.exactText.indexOf('-1/2') > 0, lines.exactText)
  assert.ok(lines.exactText.indexOf('1/3') > 0, lines.exactText)
  assert.ok(lines.exactText.indexOf('1') > 0, lines.exactText)
})

test('四次：两个有理根 + 两个数值根（x⁴−3x³+6x−4=0 → 1,2,±√2）', () => {
  const r = S.solveEquation('x^4-3x^3+6x-4=0')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.degree, 4)
  assert.equal(r.roots.length, 4, '实际 ' + JSON.stringify(r.roots))
  const xs = r.roots.map(o => Math.round(o.re * 1e9) / 1e9).sort((a, b) => a - b)
  assert.deepEqual(xs, [-1.414213562, 1, 1.414213562, 2], '实际 ' + xs)
  const exactVals = r.roots.map(o => o.exact).filter(v => v)
  assert.deepEqual(exactVals.sort(), ['1', '2'], '有理根应保留精确分数/整数')
  const lines = S.rootLines(r.roots, true)
  assert.equal(lines.hasExact, true, '±√2 也应能写成精确形式')
  assert.ok(lines.lines[0].text.indexOf('√2') > 0, lines.lines[0].text)
})

test('五次及以上也能数值求根（x^5−x−1 有实根 ≈1.1673）', () => {
  const r = S.solveEquation('x^5-x-1=0')
  assert.equal(r.ok, true, r.err)
  assert.ok(r.roots.some(o => near(o.re, 1.167303978, 1e-4)), '实际 ' + JSON.stringify(r.roots))
})

test('高次 x^17−x=0 能找到 -1、0、1 三个实根', () => {
  const r = S.solveEquation('x^17-x=0')
  assert.equal(r.ok, true, r.err)
  const xs = r.roots.map(o => Math.round(o.re * 1e6) / 1e6)
  for (const v of [-1, 0, 1]) assert.ok(xs.indexOf(v) >= 0, '缺 ' + v + '，实际 ' + xs)
})

test('复杂自由式：分母、指数、绝对值混合也能数值求根', () => {
  const a = S.solveEquation('1/(x-1)=2')
  assert.equal(a.ok, true, a.err); assert.ok(near(a.roots[0].re, 1.5, 1e-9))
  const b = S.solveEquation('e^x=x^2')
  assert.equal(b.ok, true, b.err); assert.ok(b.roots.some(o => near(o.re, -0.7034674227, 1e-5)))
  const c = S.solveEquation('sin(x)+x^2=2')
  assert.equal(c.ok, true, c.err); assert.ok(c.roots.length >= 2)
})

section('自由式子新增：|x|、n 次根、指数塔')

test('|x| − 2 = 0 → ±2', () => {
  const r = S.solveEquation('|x|-2=0')
  assert.equal(r.ok, true, r.err)
  const xs = r.roots.map(o => o.re).sort((a, b) => a - b)
  assert.deepEqual(xs, [-2, 2], '实际 ' + xs)
})

test('root(x,3) − 2 = 0 → 8', () => {
  const r = S.solveEquation('root(x,3)-2=0')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.roots.length, 1, '实际 ' + JSON.stringify(r.roots))
  assert.ok(near(r.roots[0].re, 8, 1e-6), '实际 ' + r.roots[0].re)
})

test('非多项式的常数方程：2↑↑3=16 判恒等，=20 判矛盾', () => {
  const any = S.solveEquation('2↑↑3=16')
  assert.equal(any.ok, true, any.err)
  assert.equal(any.any, true)
  const none = S.solveEquation('2↑↑3=20')
  assert.equal(none.ok, true, none.err)
  assert.equal(none.none, true)
})

test('指数方程 2^x = 8 → 3（能解析就解析）', () => {
  const r = S.solveEquation('2^x=8')
  assert.equal(r.ok, true, r.err)
  assert.ok(r.roots.some(o => near(o.re, 3, 1e-6)), '实际 ' + JSON.stringify(r.roots))
})

test('x 在分母可解，且 1/x=0 不会把极点当根', () => {
  const a = S.solveEquation('1/x=2')
  assert.equal(a.ok, true, a.err); assert.ok(near(a.roots[0].re, 0.5, 1e-9))
  const b = S.solveEquation('1/x=0')
  assert.equal(b.ok, true, b.err)
  assert.equal(b.roots.length, 0)
})

section('精确 + 小数双显示')

test('二次：精确行 √3/2 与小数行数值一致', () => {
  const r = S.solveEquation('4x^2-3=0')
  assert.equal(r.ok, true, r.err)
  const lines = S.rootLines(r.roots, true)
  assert.equal(lines.hasExact, true)
  assert.ok(lines.lines[0].text.indexOf('精确：') === 0, lines.lines[0].text)
  assert.ok(lines.lines[1].text.indexOf('小数：') === 0, lines.lines[1].text)
  // 每个根的精确串还原成数值，与根本身差 < 1e-9
  for (const root of r.roots) {
    const e = C.formatExact(root.re)
    assert.notEqual(e, null)
    const n = C.exactToNumber(e)
    assert.notEqual(n, null, '精确串解析失败：' + e)
    assert.ok(Math.abs(n - root.re) < 1e-9, e + ' vs ' + root.re)
    const f = parseFloat(C.formatNumber(root.re))
    assert.ok(Math.abs(f - root.re) < 1e-6)
  }
  assert.ok(lines.exactText.indexOf('√3/2') >= 0, lines.exactText)
})

test('开关只决定先后：exactFirst=false 时小数行在前且加粗', () => {
  const roots = [{ re: 0.5, im: 0 }]
  const a = S.rootLines(roots, true)
  assert.ok(a.lines[0].text.indexOf('精确：') === 0 && a.lines[0].on)
  assert.ok(a.lines[1].text.indexOf('小数：') === 0 && !a.lines[1].on)
  const b = S.rootLines(roots, false)
  assert.ok(b.lines[0].text.indexOf('小数：') === 0 && b.lines[0].on)
  assert.ok(b.lines[1].text.indexOf('精确：') === 0 && !b.lines[1].on)
})

test('精确不可得时只显示小数并注明', () => {
  const roots = [{ re: 2.0945514815, im: 0 }]
  const lines = S.rootLines(roots, true)
  assert.equal(lines.hasExact, false)
  assert.equal(lines.lines.length, 2)
  assert.ok(lines.lines[0].text.indexOf('小数：') === 0)
  assert.equal(lines.lines[0].on, true)
  assert.ok(lines.lines[1].text.indexOf('精确形式不可得') > 0)
  assert.equal(lines.lines[1].small, true)
})

test('精确行的值与小数行一致（三次 1,2,3）', () => {
  const r = S.solveEquation('x^3-6x^2+11x-6=0')
  const lines = S.rootLines(r.roots, true)
  for (const root of r.roots) {
    const e = C.formatExact(root.re)
    assert.notEqual(e, null)
    assert.ok(Math.abs(C.exactToNumber(e) - root.re) < 1e-9)
  }
  assert.ok(lines.exactText.indexOf('1') >= 0)
  assert.ok(lines.floatText.indexOf('1') >= 0)
})

section('数值求根加密 / 降次不漏根')

test('四次多项式的高次扫描能找全 4 个实根', () => {
  const roots = POLY.polyRoots([-4, 6, 0, -3, 1], { xmin: -50, xmax: 50 })
  const xs = roots.map(v => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b)
  assert.deepEqual(xs, [-1.414214, 1, 1.414214, 2], '实际 ' + xs)
})

test('偶次重根（只碰不变号）也能找到', () => {
  // (x−1)²(x+2) = x³ − 3x + 2
  const roots = POLY.polyRoots([2, -3, 0, 1], { xmin: -10, xmax: 10 })
  const xs = roots.map(v => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b)
  assert.deepEqual(xs, [-2, 1], '实际 ' + xs)
})

test('无有理根的三次也能找全 3 个实根（x³−3x+1）', () => {
  const r = S.solveEquation('x^3-3x+1=0')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.roots.length, 3, '实际 ' + JSON.stringify(r.roots))
  assert.ok(near(r.roots[0].re, -1.8793852416, 1e-6))
  assert.ok(near(r.roots[1].re, 0.3472963553, 1e-6))
  assert.ok(near(r.roots[2].re, 1.5320888862, 1e-6))
})

test('无有理根的四次也能找全 4 个实根（x⁴−10x²+1）', () => {
  const r = S.solveEquation('x^4-10x^2+1=0')
  assert.equal(r.ok, true, r.err)
  assert.equal(r.roots.length, 4, '实际 ' + JSON.stringify(r.roots))
  const abs = r.roots.map(o => Math.abs(o.re)).sort((a, b) => a - b)
  assert.ok(near(abs[0], 0.3178372452, 1e-6) && near(abs[1], 0.3178372452, 1e-6))
  assert.ok(near(abs[2], 3.1462643699, 1e-6) && near(abs[3], 3.1462643699, 1e-6))
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)

test('高纳德箭头：大数常数判恒等/矛盾，x=常数直接给根', () => {
  const any = S.solveEquation('2↑↑5=2↑↑5')
  assert.equal(any.ok, true); assert.equal(any.any, true)
  const none = S.solveEquation('2↑↑5=2↑↑6')
  assert.equal(none.ok, true); assert.equal(none.none, true)
  const r1 = S.solveEquation('2↑↑↑3=x')
  assert.equal(r1.ok, true); assert.equal(r1.roots[0].re, 65536)
  const r2 = S.solveEquation('x=2↑↑↑3')
  assert.equal(r2.ok, true); assert.equal(r2.roots[0].re, 65536)
})
