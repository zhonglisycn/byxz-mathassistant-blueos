/**
 * 求导与多项式的测试：node tools/calculus.test.mjs
 *
 * 求导用"数值微分交叉验证"：把 f 与 f' 都编译出来，比较 f'(x) 与
 * (f(x+h)−f(x−h))/2h —— 这样不依赖化简后的写法是否与手写一致。
 */
import assert from 'node:assert/strict'
const C = await import('./core/calc.js')
const K = await import('./core/calculus.js')
const POLY = await import('./core/poly.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

const compile = (src) => {
  const r = C.compile(src)
  assert.ok(r.ok, src + ' 编译失败：' + r.err)
  return r.f
}

/** 符号求导后与数值微分对比 */
function checkDerivative(src, points, tol) {
  const f = compile(src)
  const d = K.differentiate(C.parseExpr(src).ast)
  const fp = K.compileAst(d)
  const h = 1e-6
  for (const x of points) {
    const num = (f(x + h) - f(x - h)) / (2 * h)
    const sym = fp(x)
    const e = tol === undefined ? 1e-4 : tol
    assert.ok(Math.abs(num - sym) < e * Math.max(1, Math.abs(num)),
      src + ' 在 x=' + x + ' 处：符号求导 ' + sym + '，数值微分 ' + num)
  }
}

section('求导（与数值微分交叉验证）')

test('多项式', () => {
  checkDerivative('x^2', [-3, -1, 0.5, 2, 5])
  checkDerivative('x^3-2x+5', [-2, -1, 0, 1, 3])
  checkDerivative('3x^4-2x^2+x', [-2, -0.5, 0.5, 2])
  checkDerivative('7', [-1, 2])
})

test('三角函数与指数对数', () => {
  checkDerivative('sin(x)', [-2, -1, 0, 1, 2])
  checkDerivative('cos(x)', [-2, -1, 0, 1, 2])
  checkDerivative('tan(x)', [-1.2, -0.5, 0.5, 1.2], 1e-3)
  checkDerivative('exp(x)', [-2, 0, 1, 3])
  checkDerivative('ln(x)', [0.5, 1, 2, 10])
  checkDerivative('sqrt(x)', [0.5, 1, 4, 9], 1e-3)
})

test('乘除与复合（乘法法则、链式法则、商法则）', () => {
  checkDerivative('x*sin(x)', [-2, -0.5, 1, 3], 1e-3)
  checkDerivative('x/(x+1)', [-0.5, 0, 1, 3], 1e-3)
  checkDerivative('sin(x^2)', [-2, -0.5, 1, 2], 1e-3)
  checkDerivative('ln(3x+1)', [0, 1, 2], 1e-3)
  checkDerivative('exp(-x^2)', [-1.5, 0, 1.5], 1e-3)
  checkDerivative('sqrt(x^2+1)', [-2, 0, 2], 1e-3)
})

test('可读的导函数写法', () => {
  assert.equal(K.astText(K.differentiate(C.parseExpr('x^2').ast)), '2x')
  assert.equal(K.astText(K.differentiate(C.parseExpr('x^3').ast)), '3x²')
  assert.equal(K.astText(K.differentiate(C.parseExpr('sin(x)').ast)), 'cos(x)')
  assert.equal(K.astText(K.differentiate(C.parseExpr('x^2+3x').ast)), '2x + 3')
  assert.equal(K.astText(K.differentiate(C.parseExpr('1/x').ast)), '−1/x²')
})

test('不支持求导的函数会明确报错', () => {
  assert.throws(() => K.differentiate(C.parseExpr('floor(x)').ast), /不支持求导/)
  assert.throws(() => K.differentiate(C.parseExpr('max(x,2)').ast), /不支持求导/)
})

section('多项式（方程自动化为一般式的基础）')

test('展开与移项', () => {
  const p1 = POLY.toPoly(C.parseExpr('2(x+3)').ast)
  assert.deepEqual(p1, [6, 2], '2(x+3) 应展开为 2x+6，实际 ' + JSON.stringify(p1))
  const p2 = POLY.toPoly(C.parseExpr('x^2-3x').ast)
  assert.deepEqual(p2, [0, -3, 1])
  const p3 = POLY.toPoly(C.parseExpr('x^3').ast)
  assert.deepEqual(p3, [0, 0, 0, 1])
  const moved = POLY.polySub(POLY.toPoly(C.parseExpr('x^2-3x').ast), POLY.toPoly(C.parseExpr('-2').ast))
  assert.deepEqual(moved, [2, -3, 1], '移项后应为 x²−3x+2')
  assert.equal(POLY.polyText(moved), 'x² − 3x + 2')
})

test('不能展成多项式的情形返回 null', () => {
  assert.equal(POLY.toPoly(C.parseExpr('1/x').ast), null)
  assert.equal(POLY.toPoly(C.parseExpr('sin(x)').ast), null)
  assert.equal(POLY.toPoly(C.parseExpr('x^x').ast), null)
  assert.equal(POLY.toPoly(C.parseExpr('2^x').ast), null)
  // 与 x 无关的函数可以先当常数求值
  const c = POLY.toPoly(C.parseExpr('sqrt(4)x').ast)
  assert.deepEqual(c, [0, 2])
})

test('多项式求根（1/2/高次）', () => {
  assert.deepEqual(POLY.polyRoots([-2, 1]).map(v => Math.round(v * 1e6) / 1e6), [2])
  const q = POLY.polyRoots([2, -3, 1]).map(v => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b)
  assert.deepEqual(q, [1, 2])
  const cubic = POLY.polyRoots([-5, -2, 0, 1])
  assert.equal(cubic.length, 1)
  assert.ok(Math.abs(cubic[0] - 2.0945514815) < 1e-5, '实际 ' + cubic[0])
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
