/**
 * 物理公式内核测试：11 个公式、单位、除零与格式化。
 */
import assert from 'node:assert/strict'
const P = await import('./core/phys.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }
function near(a, b, tol) {
  assert.ok(Math.abs(a - b) < (tol === undefined ? 1e-6 : tol), a + ' !== ' + b)
}

section('公式数据')

test('11 个公式，id 唯一，字段完整', () => {
  assert.equal(P.formulas.length, 11)
  const ids = new Set()
  for (const f of P.formulas) {
    assert.ok(f.id && !ids.has(f.id), '重复 id：' + f.id)
    ids.add(f.id)
    assert.ok(f.name && f.expr)
    assert.ok(f.fields.length >= 2 && f.fields.length <= 3, f.id + ' 字段数 ' + f.fields.length)
    for (const fd of f.fields) assert.ok(fd.k && fd.label && fd.unit && fd.def !== undefined)
  }
})

section('代入计算')

test('速度与加速度', () => {
  const r = P.computePhysics('kin', { v0: '0', a: '9.8', t: '2' })
  assert.ok(r.ok, r.err)
  near(r.rows[0].value, 19.6)
  near(r.rows[1].value, 19.6)
  assert.equal(r.rows[0].unit, 'm/s')
})

test('牛顿第二定律 / 功和功率', () => {
  const f = P.computePhysics('newton', { m: '2', a: '3' })
  assert.ok(f.ok, f.err)
  near(f.rows[0].value, 6)
  const w = P.computePhysics('work', { F: '10', s: '5', t: '2' })
  assert.ok(w.ok, w.err)
  near(w.rows[0].value, 50)
  near(w.rows[1].value, 25)
})

test('欧姆定律 / 密度 / 压强', () => {
  const o = P.computePhysics('ohm', { I: '0.5', R: '10' })
  assert.ok(o.ok, o.err)
  near(o.rows[0].value, 5)
  near(o.rows[1].value, 2.5)
  const d = P.computePhysics('density', { m: '1', V: '0.001' })
  assert.ok(d.ok, d.err)
  near(d.rows[0].value, 1000)
  const p = P.computePhysics('pressure', { F: '100', S: '0.02' })
  assert.ok(p.ok, p.err)
  near(p.rows[0].value, 5000)
})

test('液体压强 / 理想气体 / 波速', () => {
  const l = P.computePhysics('liquid', { rho: '1000', h: '2' })
  assert.ok(l.ok, l.err)
  near(l.rows[0].value, 19600)
  const g = P.computePhysics('gas', { n: '1', T: '300', V: '0.024' })
  assert.ok(g.ok, g.err)
  near(g.rows[0].value, (8.314 * 300) / 0.024, 1e-3)
  const w = P.computePhysics('wave', { f: '440', lam: '0.78' })
  assert.ok(w.ok, w.err)
  near(w.rows[0].value, 343.2)
})

test('动能势能 / 热量', () => {
  const e = P.computePhysics('energy', { m: '1', v: '10', h: '2' })
  assert.ok(e.ok, e.err)
  near(e.rows[0].value, 50)
  near(e.rows[1].value, 19.6)
  const q = P.computePhysics('heat', { c: '4200', m: '1', dT: '10' })
  assert.ok(q.ok, q.err)
  near(q.rows[0].value, 42000)
})

section('错误与格式化')

test('除零 / 非数字 / 缺字段', () => {
  assert.equal(P.computePhysics('density', { m: '1', V: '0' }).ok, false)
  assert.match(P.computePhysics('density', { m: '1', V: '0' }).err, /除数|除/)
  assert.equal(P.computePhysics('newton', { m: 'abc', a: '1' }).ok, false)
  assert.match(P.computePhysics('newton', { m: '', a: '1' }).err, /请输入/)
  assert.equal(P.computePhysics('nope', {}).ok, false)
})

test('科学计数法与尾零', () => {
  assert.equal(P.fmtPhys(0), '0')
  assert.equal(P.fmtPhys(19.6), '19.6')
  assert.equal(P.fmtPhys(1000000), '1e6')
  assert.equal(P.fmtPhys(0.00001), '1e-5')
  assert.equal(P.fmtPhys(-0.0000001), '-1e-7')
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
