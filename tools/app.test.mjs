/**
 * 全局开关 / 跨页共享 / 震动开关测试：node tools/app.test.mjs
 *
 * 重点复现"模块单例不是跨页单例"：同一个 Node 进程里用 createApp 造两份实例，
 * 模拟两个页面 bundle；它们只通过 $app.$def.maShared 互通。
 * 震动后端在 tools/run-tests.sh 里被替换成计数假实现。
 */
import assert from 'node:assert/strict'
const A = await import('./core/app.js')
const V = await import('./core/vib-backend.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

const noop = () => {}

/** 假 storage：同步回调，key 与真实工程一致（ma_deg / ma_exact / ma_vib） */
function fakeStore(initial) {
  const mem = Object.assign({}, initial || {})
  return {
    mem: mem,
    loadKey(key, cb) { cb(Object.prototype.hasOwnProperty.call(mem, key), mem[key]) },
    saveKey(key, value, cb) { mem[key] = value; if (cb) cb(true) }
  }
}

/** 一个"页面 bundle 实例"；storage 默认读不到，方便测裸启动 */
function page(opts) {
  return A.createApp(Object.assign({
    loadKey: (k, cb) => cb(false),
    saveKey: noop,
    vibrate: noop,
    warn: noop
  }, opts || {}))
}

section('任务 0：三条兜底路径都落到默认值')

test('裸启动（无 storage、无 $app）→ 默认值：角度关、精确关、震动开、字号中', () => {
  const warns = []
  const app = page({ warn: m => warns.push(m) })
  app.bind(null)
  assert.equal(app.deg, false)
  assert.equal(app.exact, false)
  assert.equal(app.vib, true)
  assert.equal(app.degOn(), false)
  assert.equal(app.exactOn(), false)
  assert.equal(app.vibOn(), true)
  assert.equal(app.fsOn(), 1)
  assert.equal(app.fullOn(), false)
  assert.equal(warns.length, 1, '拿不到共享宿主只 warn 一次')
  app.bind(null)
  assert.equal(warns.length, 1, '第二次 bind 不应再 warn')
})

test('有 $app.$def、storage 读不到 → 默认值显式发布到共享袋（不是 null）', () => {
  const def = {}
  const app = page()
  assert.equal(app.bind({ $def: def }), true)
  assert.ok(def.maShared, '应建立 maShared 共享袋')
  assert.equal(def.maShared.deg, false)
  assert.equal(def.maShared.exact, false)
  assert.equal(def.maShared.vib, true)
  assert.equal(def.maShared.fs, 1)
  assert.equal(def.maShared.full, false)
})

test('storage 路径：读到存档值（键名不变）', () => {
  const st = fakeStore({ ma_deg: '1', ma_exact: '1', ma_vib: '0', ma_fs: '2', ma_full: '1' })
  const app = page({ loadKey: st.loadKey })
  app.bind(null)
  assert.equal(app.deg, true)
  assert.equal(app.exact, true)
  assert.equal(app.vib, false)
  assert.equal(app.fs, 2)
  assert.equal(app.full, true)
})

test('storage 不可用（回调 fail）→ 默认值，不留下 undefined', () => {
  const app = page({ loadKey: (k, cb) => cb(false) })
  app.bind(null)
  assert.deepEqual([app.deg, app.exact, app.vib], [false, false, true])
})

test('$app.$def 路径：已有存档值时直接采用共享值', () => {
  const def = { maShared: { deg: true, exact: true, vib: false } }
  const app = page()
  app.bind({ $def: def })
  assert.deepEqual([app.deg, app.exact, app.vib], [true, true, false])
})

test('app.ux 的 init(this) 也能建袋（宿主就是 app 实例）', () => {
  const host = {}
  const app = page()
  app.init(host)
  assert.ok(host.maShared)
  assert.equal(host.maShared.vib, true)
})

section('任务 0：切页后设置仍生效')

test('页面 A 改设置，页面 B bind 同一个 $def 能读到', () => {
  const def = {}
  const a = page()
  const b = page()
  a.bind({ $def: def })
  b.bind({ $def: def })
  a.setDeg(true)
  a.setExact(true)
  a.setVib(false)
  a.setFs(2)
  a.setFull(true)
  // B 还没重新 bind 时，生效值也应优先读共享宿主
  assert.equal(b.degOn(), true)
  assert.equal(b.exactOn(), true)
  assert.equal(b.vibOn(), false)
  assert.equal(b.fsOn(), 2)
  assert.equal(b.fullOn(), true)
  b.bind({ $def: def })
  assert.deepEqual([b.deg, b.exact, b.vib, b.fs, b.full], [true, true, false, 2, true])
})

test('设置写盘用固定键名，重新启动能读回', () => {
  const st = fakeStore()
  const a = page({ saveKey: st.saveKey })
  a.bind(null)
  a.setVib(false)
  a.setDeg(true)
  a.setFs(0)
  a.setFull(true)
  assert.equal(st.mem.ma_vib, '0')
  assert.equal(st.mem.ma_deg, '1')
  assert.equal(st.mem.ma_fs, '0')
  assert.equal(st.mem.ma_full, '1')
  // 新实例 + 同一份 storage（模拟重启）
  const b = page({ loadKey: st.loadKey })
  b.bind(null)
  assert.equal(b.vibOn(), false)
  assert.equal(b.degOn(), true)
  assert.equal(b.fsOn(), 0)
  assert.equal(b.fullOn(), true)
})

section('任务 5：震动开关')

test('默认开：tap() 调一次假 vibrator', () => {
  V.reset()
  const app = page({ vibrate: V.vibrate })
  app.bind(null)
  app.lastVib = 0
  app.tap()
  assert.equal(V.count(), 1)
})

test('关掉后所有页面共用设置：tap() 一次都不调用 vibrator', () => {
  V.reset()
  const def = {}
  const a = page({ vibrate: V.vibrate })
  const b = page({ vibrate: V.vibrate })
  a.bind({ $def: def })
  b.bind({ $def: def })
  a.setVib(false)
  a.lastVib = 0
  b.lastVib = 0
  a.tap()
  b.tap()
  assert.equal(V.count(), 0, '关闭震动后不应有任何震动调用')
  assert.equal(b.vibOn(), false, 'B 页应通过共享宿主看到关闭状态')
})

test('重新打开后 tap() 恢复（设置跨页立即生效）', () => {
  V.reset()
  const def = {}
  const a = page({ vibrate: V.vibrate })
  const b = page({ vibrate: V.vibrate })
  a.bind({ $def: def })
  b.bind({ $def: def })
  a.setVib(false)
  a.setVib(true)
  b.lastVib = 0
  b.tap()
  assert.equal(V.count(), 1)
})

section('字号选择')

test('字号 0/1/2 会夹紧并跨页生效', () => {
  const def = {}
  const a = page()
  const b = page()
  a.bind({ $def: def })
  b.bind({ $def: def })
  a.setFs(-3)
  assert.equal(a.fsOn(), 0)
  b.setFs(9)
  assert.equal(b.fsOn(), 2)
  a.setFs(1.7)
  assert.equal(a.fsOn(), 2)
  assert.equal(b.fsOn(), 2)
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
