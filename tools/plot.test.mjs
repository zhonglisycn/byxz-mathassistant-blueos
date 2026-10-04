/**
 * 函数图像采样测试：node tools/plot.test.mjs
 */
import assert from 'node:assert/strict'
const P = await import('./core/plot.js')

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

section('采样')

test('采样点数与区间正确', () => {
  const s = P.sample('x^2', { xmin: -3, xmax: 3, n: 61 })
  assert.equal(s.ok, true)
  assert.equal(s.pts.length, 61)
  assert.equal(s.pts[0].x, -3)
  assert.equal(s.pts[60].x, 3)
  assert.ok(Math.abs(s.pts[30].y) < 1e-12, 'x=0 处 y 应为 0')
})

test('定义域外的点保留 NaN，不算失败', () => {
  const s = P.sample('sqrt(x)', { xmin: -4, xmax: 4, n: 41 })
  assert.equal(s.ok, true)
  assert.ok(s.pts[0].y !== s.pts[0].y, 'x<0 处应是 NaN')
  assert.equal(s.pts[40].y, 2)
})

test('整段无定义则报错', () => {
  const s = P.sample('sqrt(x)', { xmin: -10, xmax: -1 })
  assert.equal(s.ok, false)
  assert.ok(s.err)
})

test('表达式非法时报错', () => {
  const s = P.sample('x^2+(', {})
  assert.equal(s.ok, false)
  assert.ok(s.err)
})

section('取值范围（避免渐近线把图压平）')

test('普通函数范围合理', () => {
  const r = P.robustRange(P.sample('x^2', { xmin: -3, xmax: 3, n: 61 }).pts)
  assert.ok(r.ymin < 0 && r.ymax > 9, '实际 ' + JSON.stringify(r))
  assert.ok(r.ymax - r.ymin < 30)
})

test('tan 的范围被裁到可读区间', () => {
  const pts = P.sample('tan(x)', { xmin: -4, xmax: 4, n: 201 }).pts
  const r = P.robustRange(pts)
  assert.ok(r.ymax - r.ymin < 100, '范围被渐近线撑爆了：' + JSON.stringify(r))
})

test('常数函数也能画（不退化）', () => {
  const r = P.robustRange(P.sample('3', { xmin: -1, xmax: 1, n: 21 }).pts)
  assert.ok(r.ymax > r.ymin, '范围不能是 0 高')
})

section('像素映射')

test('映射到底部为 ymin、顶部为 ymax', () => {
  const px = P.toPixels([{ x: 0, y: 0 }, { x: 1, y: 1 }], { w: 100, h: 100 }, { xmin: 0, xmax: 1, ymin: 0, ymax: 1 })
  assert.equal(px.dots.length, 2)
  assert.equal(px.dots[0].px, 0)
  assert.equal(px.dots[0].py, 100)
  assert.equal(px.dots[1].px, 100)
  assert.equal(px.dots[1].py, 0)
  assert.equal(px.ax, 0)
  assert.equal(px.ay, 100)
})

test('超出 y 范围的点被丢掉（渐近线自然断开）', () => {
  const r = P.plot('1/x', { xmin: -5, xmax: 5, n: 201, w: 172, h: 200 })
  assert.equal(r.ok, true)
  assert.ok(r.ax !== null, 'x 范围含 0，y 轴应有位置')
  assert.ok(r.ay !== null, 'y 范围含 0，x 轴应有位置')
  // 极点附近的点必须被丢掉，否则会在图上画出一条竖直的假线
  assert.ok(r.sampled - r.drawn >= 3, '极点附近应丢掉至少 3 个点，实际丢掉 ' + (r.sampled - r.drawn))
  const near0 = r.dots.filter(d => Math.abs(d.px - r.ax) < 2)
  assert.equal(near0.length, 0, '极点两侧 2px 内不应有画出的点，实际 ' + near0.length)
})

test('sin 的整幅曲线都在盒子内', () => {
  const r = P.plot('sin(x)', { xmin: -7, xmax: 7, n: 141, w: 172, h: 200 })
  assert.equal(r.ok, true)
  assert.ok(r.dots.length > 100)
  for (const d of r.dots) {
    assert.ok(d.px >= 0 && d.px <= 172, 'px 越界：' + d.px)
    assert.ok(d.py >= 0 && d.py <= 200, 'py 越界：' + d.py)
  }
})

test('预设里的每个函数都能画出来', () => {
  const list = P.presets()
  assert.ok(list.length >= 10)
  for (const p of list) {
    const r = P.plot(p.expr, { xmin: -8, xmax: 8, n: 121, w: 172, h: 200 })
    assert.equal(r.ok, true, p.name + ' 采样失败：' + r.err)
    assert.ok(r.dots.length > 10, p.name + ' 只画出 ' + r.dots.length + ' 个点')
  }
})

section('坐标刻度')

test('niceTicks 取整刻度', () => {
  assert.deepEqual(P.niceTicks(0, 10, 5).slice(0, 3), [0, 2, 4])
  assert.ok(P.niceTicks(0, 1, 4).indexOf(0) >= 0)
  assert.ok(P.niceTicks(-1, 1, 4).indexOf(0) >= 0)
  const t = P.niceTicks(0, 100, 4)
  assert.ok(t[t.length - 1] <= 100 + 1e-9)
})

section('值表')

test('值表的行数与取值', () => {
  const t = P.table('x^2', { xmin: -2, xmax: 2, step: 1 })
  assert.equal(t.ok, true, t.err)
  assert.equal(t.rows.length, 5)
  assert.equal(t.rows[0].x, -2)
  assert.equal(t.rows[0].y, 4)
  assert.equal(t.rows[4].y, 4)
  assert.equal(t.rows[2].y, 0)
})

test('定义域外标记为取不到，而不是报错', () => {
  const t = P.table('sqrt(x)', { xmin: -2, xmax: 4, step: 1 })
  assert.equal(t.ok, true)
  assert.equal(t.rows[0].ok, false, 'x=−2 处应标 ok=false')
  assert.equal(t.rows[4].ok, true)
})

test('同时给出导数值（按函数传）', () => {
  const c = { f: null }
  const C2 = P.tableFn(function (x) { return x * x }, { xmin: 0, xmax: 3, step: 1, f2: function (x) { return 2 * x } })
  assert.equal(C2.ok, true)
  assert.equal(C2.rows[3].y, 9)
  assert.equal(C2.rows[3].d, 6)
})

test('非法表达式报错', () => {
  assert.equal(P.table('x^2+(', {}).ok, false)
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
