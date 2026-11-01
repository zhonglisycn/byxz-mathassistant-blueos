/**
 * 化学内核测试：118 元素数据完整性 + 化学式解析 / 摩尔质量。
 */
import assert from 'node:assert/strict'
const E = await import('./data/elements.js')
const C = await import('./core/chem.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

section('元素数据')

test('118 个元素，序号连续，符号唯一', () => {
  assert.equal(E.elements.length, 118)
  const seen = new Set()
  for (let i = 0; i < E.elements.length; i++) {
    const e = E.elements[i]
    assert.equal(e.number, i + 1)
    assert.ok(e.symbol && !seen.has(e.symbol), '符号重复：' + e.symbol)
    seen.add(e.symbol)
    assert.ok(e.mass > 0, e.symbol + ' 原子量无效')
    assert.ok(e.name)
    assert.ok(e.valence !== undefined)
    assert.ok(e.group >= 1 && e.group <= 18)
    assert.ok(e.period >= 1 && e.period <= 9)
  }
})

test('卡片颜色按 s/p/d/f 区', () => {
  assert.equal(C.blockOf(E.elements[0]), 's')      // H
  assert.equal(C.blockOf(E.elements[1]), 's')      // He（1s²）
  assert.equal(C.blockOf(E.elements[7]), 'p')      // O
  assert.equal(C.blockOf(E.elements[25]), 'd')     // Fe
  assert.equal(C.blockOf(E.elements[56]), 'f')     // La
  assert.equal(C.blockOf(E.elements[88]), 'f')     // Ac
  for (const e of E.elements) assert.ok('spdf'.indexOf(C.blockOf(e)) >= 0, e.symbol)
})

test('详情数据 118 条：性质与方程式', () => {
  const h = E.elements[0]
  assert.ok(h.properties.includes('最轻'))
  assert.ok(h.equations.length >= 3)
  assert.ok(h.equations[0].includes('H'))
  for (const e of E.elements) {
    assert.ok(e.properties && e.properties.length > 2, e.symbol + ' 缺性质')
    assert.ok(Array.isArray(e.equations), e.symbol + ' equations 不是数组')
    for (const q of e.equations) assert.ok(typeof q === 'string' && q.length > 0)
  }
})

test('周期表坐标不重叠', () => {
  const seen = new Set()
  for (const e of E.elements) {
    let row = e.period
    if (e.cat === 'lanthanide') row = 8
    if (e.cat === 'actinide') row = 9
    const key = row + ':' + e.group
    assert.ok(!seen.has(key), '坐标重叠：' + key + ' ' + e.symbol)
    seen.add(key)
  }
  assert.equal(seen.size, 118)
})

test('镧系 / 锕系坐标单独成行', () => {
  const la = E.elements[56]
  const ac = E.elements[88]
  assert.equal(la.symbol, 'La')
  assert.equal(la.cat, 'lanthanide')
  assert.equal(ac.symbol, 'Ac')
  assert.equal(ac.cat, 'actinide')
  assert.equal(la.group, 3)
  assert.equal(ac.group, 3)
})

section('化学式解析')

test('H2O = 18.015', () => {
  const r = C.molarMass('H2O')
  assert.ok(r.ok, r.err)
  assert.ok(Math.abs(r.mass - 18.015) < 1e-9)
  assert.deepEqual(r.counts, { H: 2, O: 1 })
})

test('括号：Ca(OH)2、Al2(SO4)3', () => {
  const a = C.molarMass('Ca(OH)2')
  assert.ok(a.ok, a.err)
  assert.ok(Math.abs(a.mass - 74.092) < 1e-6, String(a.mass))
  assert.deepEqual(a.counts, { Ca: 1, O: 2, H: 2 })
  const b = C.molarMass('Al2(SO4)3')
  assert.ok(b.ok, b.err)
  assert.ok(Math.abs(b.mass - 342.132) < 1e-6, String(b.mass))
  assert.deepEqual(b.counts, { Al: 2, S: 3, O: 12 })
})

test('结晶水：CuSO4.5H2O（点号两种写法）', () => {
  const a = C.molarMass('CuSO4.5H2O')
  const b = C.molarMass('CuSO4·5H2O')
  assert.ok(a.ok, a.err)
  assert.ok(b.ok, b.err)
  assert.ok(Math.abs(a.mass - 249.677) < 1e-6, String(a.mass))
  assert.deepEqual(a.counts, { Cu: 1, S: 1, O: 9, H: 10 })
  assert.ok(Math.abs(a.mass - b.mass) < 1e-9)
})

test('前导系数按份数计', () => {
  const r = C.molarMass('2H2O')
  assert.ok(r.ok, r.err)
  assert.ok(Math.abs(r.mass - 36.03) < 1e-9)
  assert.deepEqual(r.counts, { H: 4, O: 2 })
})

test('嵌套括号与常见有机物', () => {
  const b = C.molarMass('[Cu(NH3)4]SO4')
  assert.ok(b.ok, b.err)
  assert.ok(b.mass > 200 && b.mass < 250, String(b.mass))
  const r = C.molarMass('C6H12O6')
  assert.ok(r.ok, r.err)
  assert.ok(Math.abs(r.mass - 180.156) < 1e-6)
  const s = C.molarMass('(NH4)2SO4')
  assert.ok(s.ok, s.err)
  assert.ok(Math.abs(s.mass - 132.134) < 1e-6)
  assert.deepEqual(s.counts, { N: 2, H: 8, S: 1, O: 4 })
})

test('错误提示', () => {
  assert.equal(C.molarMass('').ok, false)
  assert.match(C.molarMass('Xx2').err, /未知元素/)
  assert.match(C.molarMass('Ca(OH2').err, /括号/)
  assert.match(C.molarMass('2').err, /缺少化学式/)
  assert.match(C.molarMass('H2O·').err, /两侧/)
  assert.match(C.molarMass('h2o').err, /未知元素|不支持/)
  assert.match(C.molarMass('H2O)').err, /括号/)
  assert.match(C.molarMass('H2O2H'.repeat(20)).err, /过长/)
})

test('计数文本', () => {
  const r = C.molarMass('Ca(OH)2')
  assert.equal(C.countsText(r.counts, r.order), 'Ca O2 H2')
  assert.equal(C.fmtMass(74.09200000000001), '74.092')
  assert.equal(C.fmtMass(18), '18')
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
