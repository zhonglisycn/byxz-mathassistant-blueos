/**
 * 按键说明与标签一致性测试：node tools/keys.test.mjs（由 tools/run-tests.sh 调用）
 *
 * 为什么要有：键盘上写着 sinh，按下却出 sin( —— 标签和内核不一致这种错，
 * 光看界面发现不了（要按下去才知道），最该由测试盯着。
 */
import assert from 'node:assert/strict'
import { KEY_DESC, KEY_ORDER, descOf, descList } from './core/keys.js'
import { evaluate, displayResult } from './core/calc.js'

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

section('说明表本身')

test('每个键都有说明，说明不是空的', () => {
  assert.ok(KEY_ORDER.length > 30, '键数 ' + KEY_ORDER.length)
  for (const k of KEY_ORDER) {
    assert.ok(KEY_DESC[k], k + ' 没有说明')
    assert.ok(String(KEY_DESC[k]).trim().length >= 1, k + ' 说明是空的')
  }
})

test('说明都短到能放一行（≤ 20 字）', () => {
  for (const k of KEY_ORDER) {
    assert.ok(String(KEY_DESC[k]).length <= 20, k + ' 的说明过长：' + KEY_DESC[k])
  }
})

test('键名不重复', () => {
  const seen = {}
  for (const k of KEY_ORDER) {
    assert.ok(!seen[k], k + ' 重复出现')
    seen[k] = 1
  }
})

test('没登记的键返回空说明（不会变成 undefined 打印到屏幕上）', () => {
  assert.equal(descOf('不存在'), '')
  assert.equal(descOf(''), '')
})

test('descList 与 KEY_ORDER 一一对应', () => {
  const l = descList()
  assert.equal(l.length, KEY_ORDER.length)
  assert.equal(l[0].k, KEY_ORDER[0])
  assert.equal(l[l.length - 1].k, KEY_ORDER[KEY_ORDER.length - 1])
})

section('标签与内核一致（键盘上写的，内核必须真支持）')

// 键盘上标着函数名的键：按下去必须能算，否则标签就是骗人的
const FN_KEYS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'ln', 'log', 'abs']

test('函数键都能算出来', () => {
  for (const k of FN_KEYS) {
    assert.ok(KEY_DESC[k], k + ' 不在说明表里')
    const r = evaluate(k + '(1)')
    assert.ok(r.ok, k + '(1) 算不出来：' + r.err)
    assert.ok(displayResult(r, false).length > 0)
  }
})

test('√ 键（写作 sqrt）能用', () => {
  const r = evaluate('sqrt(9)')
  assert.ok(r.ok && Math.abs(r.value - 3) < 1e-12)
  assert.ok(KEY_DESC['√'], '√ 没有说明')
})

test('说明里提到的上限与内核一致（阶乘 1000）', () => {
  assert.ok(KEY_DESC['!'].indexOf('1000') > 0, KEY_DESC['!'])
  assert.ok(evaluate('1000!').ok)
  assert.ok(!evaluate('1001!').ok)
})

test('π 与 e 键说明里的数值对得上', () => {
  assert.ok(Math.abs(evaluate('π').value - Math.PI) < 1e-12)
  assert.ok(Math.abs(evaluate('e').value - Math.E) < 1e-12)
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
