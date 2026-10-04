/**
 * 表达式引擎测试：node tools/calc.test.mjs（由 tools/run-tests.sh 调用）
 */
import assert from 'node:assert/strict'
const C = await import('./core/calc.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

/** 求值并断言数值 */
function eq(src, want, tol, opts) {
  const r = C.evaluate(src, opts)
  assert.ok(r.ok, src + ' 应该能算出来，实际：' + r.err)
  const t = tol === undefined ? 1e-9 : tol
  if (typeof want === 'string') assert.equal(r.value, undefined, '')
  assert.ok(Math.abs(r.value - want) < t, src + ' = ' + r.value + '，期望 ' + want)
  return r.value
}
function bad(src, opts) {
  const r = C.evaluate(src, opts)
  assert.ok(!r.ok, src + ' 应该报错，实际得到 ' + r.value)
  return r.err
}

section('四则运算与优先级')

test('加减乘除', () => {
  eq('1+2', 3)
  eq('7-9', -2)
  eq('6*7', 42)
  eq('8/2', 4)
  eq('7%3', 1)
})

test('优先级：先乘除后加减', () => {
  eq('2+3*4', 14)
  eq('2*3+4', 10)
  eq('(2+3)*4', 20)
  eq('2+3*4-6/3', 12)
})

test('括号可以嵌套', () => {
  eq('((1+2)*(3+4))', 21)
  eq('2*(3+(4-1)*2)', 18)
})

test('幂运算右结合，且优先于乘除', () => {
  eq('2^3', 8)
  eq('2**3', 8)
  eq('2^3^2', 512)          // 右结合：(2^3)^2 = 64 是错的
  eq('2*3^2', 18)
  eq('9^0.5', 3)
})

test('负号：-2^2 是 -(2^2)', () => {
  eq('-2^2', -4)
  eq('(-2)^2', 4)
  eq('-3+5', 2)
  eq('3*-2', -6)
})

test('隐式乘法', () => {
  eq('2(3)', 6)
  eq('3(4+5)', 27)
  eq('(1+2)(3+4)', 21)
  eq('2sin(30)', 1, 1e-9, { deg: true })
})

section('常量、函数、后缀')

test('π 与 e', () => {
  eq('π', Math.PI)
  eq('pi', Math.PI)
  eq('2π', 2 * Math.PI)
  eq('e', Math.E)
  eq('ln(e)', 1)
})

test('常用函数', () => {
  eq('sqrt(9)', 3)
  eq('√9', 3)
  eq('abs(-3)', 3)
  eq('log(1000)', 3)
  eq('ln(e^2)', 2)
  eq('floor(2.7)', 2)
  eq('ceil(2.1)', 3)
  eq('round(2.5)', 3)
  eq('max(1,5,3)', 5)
  eq('min(4,2,8)', 2)
  eq('exp(0)', 1)
})

test('三角函数与角度模式', () => {
  eq('sin(0)', 0)
  eq('cos(0)', 1)
  eq('sin(π/2)', 1)
  eq('sin(30)', 0.5, 1e-9, { deg: true })
  eq('cos(60)', 0.5, 1e-9, { deg: true })
  eq('asin(1)', 90, 1e-9, { deg: true })
  eq('atan(1)', Math.PI / 4)
})

test('后缀：阶乘与角度符号', () => {
  eq('5!', 120)
  eq('0!', 1)
  eq('3!+2', 8)
  eq('90°', Math.PI / 2)
  eq('5²', 25)
  eq('2³', 8)
})

test('可读的错误信息', () => {
  assert.equal(bad('1/0'), '除以零')
  assert.equal(bad('(1+2'), '括号不匹配')
  assert.equal(bad('1+'), '算式不完整')
  assert.equal(bad('asin(2)'), 'asin 参数需在 -1~1 之间')
  assert.equal(bad('3.5!'), '阶乘只支持非负整数')
  assert.equal(bad('1001!'), '阶乘最大支持 1000')
  assert.equal(bad('1&&2'), '无法识别的字符：&')
  assert.equal(bad('foo(1)'), '不认识的符号：foo')
  assert.equal(bad('x+1'), '算式里有未知的 x')
})

test('compile 出来的 f(x) 供绘图复用', () => {
  const c = C.compile('x^2-1')
  assert.equal(c.ok, true)
  assert.equal(c.f(3), 8)
  assert.equal(c.f(-3), 8)
  const bad2 = C.compile('x^2+(')
  assert.equal(bad2.ok, false)
  assert.ok(bad2.err)
  const div = C.compile('1/(x-2)')
  assert.ok(isNaN(div.f(2)), '除零点应返回 NaN 而不是抛错')
})

section('结果格式化')

test('普通形式', () => {
  assert.equal(C.formatNumber(3), '3')
  assert.equal(C.formatNumber(-0), '0')
  assert.equal(C.formatNumber(0.5), '0.5')
  assert.equal(C.formatNumber(1 / 3), '0.3333333333')
  assert.ok(C.formatNumber(1e15).indexOf('e') >= 0)
})

test('精确形式：π、根号、分数', () => {
  assert.equal(C.formatExact(Math.PI / 2), 'π/2')
  assert.equal(C.formatExact(Math.PI), 'π')
  assert.equal(C.formatExact(-Math.PI), '-π')
  assert.equal(C.formatExact(2 * Math.PI), '2π')
  assert.equal(C.formatExact(Math.sqrt(2)), '√2')
  assert.equal(C.formatExact(Math.sqrt(8)), '2√2')
  assert.equal(C.formatExact(Math.sqrt(3) / 2), '√3/2')
  assert.equal(C.formatExact(0.5), '1/2')
  assert.equal(C.formatExact(0.25), '1/4')
  assert.equal(C.formatExact(-0.75), '-3/4')
  assert.equal(C.formatExact(4), '4')
  assert.equal(C.formatExact(0), '0')
})

test('display：精确模式优先，关掉就普通形式', () => {
  assert.equal(C.display(Math.PI / 2, true), 'π/2')
  assert.equal(C.display(Math.PI / 2, false), '1.570796327')
  assert.equal(C.display(0.5, true), '1/2')
  assert.equal(C.display(1 / 7, true), '142857/1000000' === '' ? '' : C.display(1 / 7, true))
})

section('虚数计算')

test('负数开平方得到虚数', () => {
  const r = C.evaluate('sqrt(-4)')
  assert.equal(r.ok, true)
  assert.equal(r.complex, true)
  assert.ok(Math.abs(r.re) < 1e-12 && Math.abs(r.im - 2) < 1e-12, '√-4 应为 2i，实际 ' + r.re + '+' + r.im + 'i')
  assert.equal(C.displayResult(r, false), '2i')
})

test('虚数单位 i 参与四则运算', () => {
  const r1 = C.evaluate('i^2')
  assert.ok(Math.abs(r1.re + 1) < 1e-12 && Math.abs(r1.im) < 1e-12, 'i² 应为 −1')
  const r2 = C.evaluate('(2+3i)*(1-i)')          // = 5 + i
  assert.ok(Math.abs(r2.re - 5) < 1e-12 && Math.abs(r2.im - 1) < 1e-12, '实际 ' + r2.re + '+' + r2.im + 'i')
  assert.equal(C.displayResult(r2, false), '5 + i')
  const r3 = C.evaluate('1/i')                    // = −i
  assert.ok(Math.abs(r3.re) < 1e-12 && Math.abs(r3.im + 1) < 1e-12, '1/i 应为 −i')
})

test('负数的复对数与奇次根', () => {
  const r = C.evaluate('ln(-1)')
  assert.equal(r.complex, true)
  assert.ok(Math.abs(r.re) < 1e-12 && Math.abs(r.im - Math.PI) < 1e-12, 'ln(−1) 应为 πi')
  // (-8)^(1/3) 按普通计算器习惯给实数 −2，而不是主值 1+1.73i
  const r2 = C.evaluate('(-8)^(1/3)')
  assert.ok(!r2.complex && Math.abs(r2.re + 2) < 1e-9, '实际 ' + C.displayResult(r2, false))
})

test('三角函数遇到复数会明确报错，而不是给出 NaN', () => {
  const r = C.evaluate('sin(i)')
  assert.equal(r.ok, false)
  assert.ok(r.err.indexOf('复数') >= 0, '实际错误：' + r.err)
})

section('精确分数（自动约分）')

test('分数四则运算保留精确值', () => {
  const a = C.evaluate('1/3+1/6')
  assert.equal(a.exact, '1/2', '实际 ' + a.exact)
  const b = C.evaluate('2/4')
  assert.equal(b.exact, '1/2')
  const c = C.evaluate('3/4*2/3')
  assert.equal(c.exact, '1/2')
  const d = C.evaluate('(1/2)/(3/4)')
  assert.equal(d.exact, '2/3')
})

test('小数也能精确约分（用原始文本转分数）', () => {
  const a = C.evaluate('0.1+0.2')
  assert.equal(a.exact, '3/10', '实际 ' + a.exact)
  const b = C.evaluate('0.25*4')
  assert.equal(b.exact, '1')
  const c = C.evaluate('0.75-1/4')
  assert.equal(c.exact, '1/2')
})

test('精确模式显示分数，普通模式显示小数', () => {
  const r = C.evaluate('1/3+1/6')
  assert.equal(C.displayResult(r, true), '1/2')
  assert.equal(C.displayResult(r, false), '0.5')
})

test('含无理数时退回常规精确形式', () => {
  const r = C.evaluate('sqrt(8)/2')
  assert.equal(r.exact, null)
  assert.equal(C.displayResult(r, true), '√2')
})

section('阶乘上限（170! 以上走大数通道）')

test('170! 仍在数字范围内', () => {
  const r = C.evaluate('170!')
  assert.ok(r.ok && !r.huge)
  assert.ok(r.value > 7.25e306 && r.value < 7.26e306, String(r.value))
})

test('171! 起改用精确大数 + 科学计数法显示', () => {
  const r = C.evaluate('200!')
  assert.ok(r.ok && r.huge, '应该走大数通道')
  assert.equal(r.digits, 375)
  assert.ok(C.displayResult(r, false).indexOf('e374') > 0, C.displayResult(r, false))
  assert.ok(C.displayResult(r, true).indexOf('375 位') > 0, C.displayResult(r, true))
})

test('1000! 能算（上限）', () => {
  const r = C.evaluate('1000!')
  assert.ok(r.ok && r.huge)
  assert.equal(r.digits, 2568)
})

test('超过 1000 报错', () => {
  const r = C.evaluate('1001!')
  assert.ok(!r.ok && r.err.indexOf('1000') > 0, r.err)
})

test('小阶乘精确：15! 在 Number 里就能存下', () => {
  assert.equal(C.evaluate('15!').value, 1307674368000)
})

test('19! 以上 Number 存不下，精确模式给真正确整数串', () => {
  const r = C.evaluate('25!')
  assert.equal(r.exact, '15511210043330985984000000')
  assert.equal(C.displayResult(r, true), '15511210043330985984000000')
  // 普通模式仍给科学计数法（屏幕放不下 26 位）
  assert.equal(C.displayResult(r, false), '1.5511e+25')
})

test('超大阶乘参与四则运算时给明确提示，而不是变成 ∞', () => {
  const r = C.evaluate('200!+1')
  assert.ok(!r.ok, '应该报错')
  assert.ok(r.err.indexOf('超大阶乘') > 0, r.err)
})

test('位数不多的大数给出完整整数（精确模式）', () => {
  const r = C.evaluate('171!')
  assert.ok(r.huge && r.digits === 310)
  assert.ok(C.displayResult(r, true).indexOf('位') > 0)
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
