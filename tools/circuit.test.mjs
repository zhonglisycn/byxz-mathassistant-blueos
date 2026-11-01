/**
 * 电路求解适配层测试：串联、并联、开关断路、电流表读数、短路。
 * 求解器来自 circuit-lab（MIT）。
 */
import assert from 'node:assert/strict'
const C = await import('./core/circuit.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function edge(a, b, type, on = true) {
  return { a: Math.min(a, b), b: Math.max(a, b), type: type, on: on }
}
function near(a, b, tol = 1e-6) { assert.ok(Math.abs(a - b) < tol, a + ' != ' + b) }

test('串联：两灯泡 + 开关闭合', () => {
  const edges = [
    edge(0, 1, 'bulb'), edge(1, 2, 'bulb'), edge(2, 3, 'wire'),
    edge(3, 7, 'wire'), edge(7, 11, 'switch'), edge(11, 15, 'wire'),
    edge(15, 14, 'wire'), edge(14, 13, 'battery'), edge(13, 12, 'wire'),
    edge(12, 8, 'wire'), edge(8, 4, 'wire'), edge(4, 0, 'wire'),
  ]
  const r = C.analyzeCircuit(edges)
  assert.equal(r.type, '串联')
  assert.equal(r.powered, true)
  near(r.current, 0.3)
  near(r.readings['0-1'].current, 0.3)
  near(r.readings['1-2'].current, 0.3)
})

test('并联：两灯泡支路', () => {
  const edges = [
    edge(0, 4, 'wire'), edge(4, 8, 'wire'), edge(8, 12, 'wire'),
    edge(3, 7, 'wire'), edge(7, 11, 'wire'), edge(11, 15, 'wire'),
    edge(4, 5, 'wire'), edge(5, 6, 'bulb'), edge(6, 7, 'wire'),
    edge(8, 9, 'wire'), edge(9, 10, 'bulb'), edge(10, 11, 'wire'),
    edge(12, 13, 'switch'), edge(13, 14, 'battery'), edge(14, 15, 'wire'),
  ]
  const r = C.analyzeCircuit(edges)
  assert.equal(r.type, '并联')
  near(r.current, 1.2)
  near(r.readings['5-6'].current, 0.6)
  near(r.readings['9-10'].current, 0.6)
})

test('开关断开 → 断路、无电流', () => {
  const edges = [
    edge(0, 1, 'battery'), edge(1, 5, 'lamp'), edge(5, 4, 'switch', false), edge(4, 0, 'wire'),
  ]
  const r = C.analyzeCircuit(edges)
  assert.equal(r.powered, false)
  assert.equal(r.type, '断路')
  near(r.current, 0, 1e-12)
})

test('电流表读数：串联 0.60A', () => {
  const edges = [
    edge(0, 1, 'battery'), edge(1, 5, 'bulb'), edge(5, 4, 'ammeter'), edge(4, 0, 'wire'),
  ]
  const r = C.analyzeCircuit(edges)
  assert.equal(r.type, '串联')
  near(r.current, 0.6)
  near(r.readings['4-5'].current, 0.6)
  assert.ok(r.readings['4-5'])
})

test('无电源 / 电源短路', () => {
  const none = C.analyzeCircuit([edge(0, 1, 'bulb')])
  assert.equal(none.type, '无电源')
  const short = C.analyzeCircuit([
    edge(0, 1, 'battery'), edge(1, 5, 'wire'), edge(5, 4, 'wire'), edge(4, 0, 'wire'),
  ])
  assert.equal(short.status, 'short')
  assert.equal(short.type, '短路')
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
