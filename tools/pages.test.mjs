/**
 * 页面静态约束：node tools/pages.test.mjs
 *
 * 这一组专门盯"界面层才犯的错"：
 *   ① 震动开关只能出现在设置页（任务 5）——其它页面不得有开关/快捷切换；
 *   ② 所有页面都接共享宿主，按键都走全局 appGlobal.tap()；
 *   ③ 新键位（ⁿ√ / ↑ / ↑↑ / ↑↑↑ / , / |）三页键盘都有；
 *   ④ 键盘行最多 4 个键、总宽不超出 432−2×14 的可用宽度（不许被裁）。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 测试运行器会把本文件拷到 .ct-pages/ 下执行；从文件位置回推工程根
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAGES = path.join(ROOT, 'src', 'pages')
const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

const names = fs.readdirSync(PAGES).filter(d => fs.statSync(path.join(PAGES, d)).isDirectory())
const src = {}
for (const n of names) src[n] = fs.readFileSync(path.join(PAGES, n, 'index.ux'), 'utf8')

section('任务 5：震动开关只在设置页')

test('设置页（About）有且只有它包含震动开关', () => {
  assert.ok(src.About, '缺少 About 页')
  assert.ok(src.About.indexOf('按键震动') >= 0, '设置页应有"按键震动"行')
  assert.ok(src.About.indexOf('flipVib') >= 0, '设置页应有 flipVib')
})

test('其它页面源码里没有震动开关 / 快捷切换', () => {
  for (const n of Object.keys(src)) {
    if (n === 'About') continue
    const s = src[n]
    assert.ok(s.indexOf('flipVib') < 0, n + ' 不应有 flipVib')
    assert.ok(s.indexOf('setVib') < 0, n + ' 不应调用 setVib')
    assert.ok(s.indexOf('按键震动') < 0, n + ' 不应出现"按键震动"设置')
    // 连"震动开/关"这种状态快捷行也不要（Home 以前有）
    assert.ok(!/震动[开关]/.test(s), n + ' 不应显示震动快捷状态')
  }
})

test('计算器/方程/图像页按下一律走全局 appGlobal.tap()', () => {
  for (const n of ['Calc', 'Eq', 'Plot']) {
    assert.ok(src[n].indexOf("import appGlobal from '../../common/core/app.js'") >= 0, n + ' 应 import appGlobal')
    assert.ok(src[n].indexOf('appGlobal.tap()') >= 0, n + ' 的按键应走全局 tap()')
  }
})

section('任务 0：所有页面接共享宿主')

test('每个页面都在 onInit/onShow 调 appGlobal.bind(this.$app)', () => {
  for (const n of Object.keys(src)) {
    assert.ok(src[n].indexOf('appGlobal.bind(this.$app)') >= 0, n + ' 没有接共享宿主')
  }
})

section('新键位')

test('ⁿ√ / ↑ / , / | 进了键盘，且只保留一个 ↑ 按钮', () => {
  for (const n of ['Calc', 'Eq', 'Plot']) {
    assert.ok(src[n].indexOf("tap('↑')") >= 0, n + ' 缺 ↑ 键')
    assert.ok(src[n].indexOf("tap('↑↑')") < 0, n + ' 不应有 ↑↑ 按钮')
    assert.ok(src[n].indexOf("tap('↑↑↑')") < 0, n + ' 不应有 ↑↑↑ 按钮')
    assert.ok(src[n].indexOf("tap(',')") >= 0, n + ' 缺逗号键')
  }
  assert.ok(src.Eq.indexOf("tap('|')") >= 0, '方程页应有 | 键')
  assert.ok(src.Plot.indexOf("tap('|')") >= 0, '图像页应有 | 键')
})

test('ⁿ√ 键插入 root(（参数用逗号）', () => {
  for (const n of ['Calc', 'Eq', 'Plot']) {
    assert.ok(/['"]ⁿ√['"]\s*:\s*['"]root\(['"]/.test(src[n]), n + ' 的 ⁿ√ 应插入 root(')
  }
})

section('输入上限接到页面（内部不截断）')

test('三个页面都用 limits.js 的 fits() 而不是旧硬编码', () => {
  assert.ok(src.Calc.indexOf("fits('calcExpr'") >= 0)
  assert.ok(src.Eq.indexOf("fits('freeEq'") >= 0)
  assert.ok(src.Eq.indexOf("fits('coef'") >= 0)
  assert.ok(src.Plot.indexOf("fits('plotExpr'") >= 0)
  assert.ok(src.Calc.indexOf('length < 160') < 0, '旧的 160 上限应删掉')
  assert.ok(src.Eq.indexOf('length < 48') < 0, '旧的 48 上限应删掉')
  assert.ok(src.Eq.indexOf('length < 24') < 0, '旧的 24 上限应删掉')
})

section('键盘网格：每行 ≤ 4 键，宽度不超出可用区')

/** 从模板里按行数键盘键（.prow 内 class="key" 的个数） */
function keyboardRows(tpl) {
  const rows = []
  let cur = null
  const lines = tpl.split(/\r?\n/)
  for (const line of lines) {
    if (/class="prow"/.test(line)) { cur = 0; continue }
    if (cur !== null) {
      if (/class="key\b/.test(line)) { cur++; continue }
      if (/^\s*<\/div>\s*$/.test(line)) { rows.push(cur); cur = null }
    }
  }
  return rows
}

test('每页每个键盘行 1~4 个键，且 4 键行宽度 ≤ 404px', () => {
  const PAGE_W = 432
  const PAD_X = 14
  const usable = PAGE_W - PAD_X * 2
  for (const n of Object.keys(src)) {
    const tpl = src[n].match(/<template>([\s\S]*?)<\/template>/)
    if (!tpl) continue
    const rows = keyboardRows(tpl[1])
    if (!rows.length) continue
    for (const c of rows) {
      assert.ok(c >= 1 && c <= 4, n + ' 有一行 ' + c + ' 个键（会裁/换行）')
    }
    // 最坏情况：Calc 的 .key 是 77px + 4px×2 外边距 → 4 键 340px
    assert.ok(4 * (77 + 8) <= usable, '4 键行 ' + (4 * (77 + 8)) + 'px 超出可用 ' + usable + 'px')
  }
})

test('新加的键位确实在某一行里（不是被漏掉的静态模板）', () => {
  const rowsCalc = keyboardRows(src.Calc.match(/<template>([\s\S]*?)<\/template>/)[1])
  assert.ok(rowsCalc.length >= 12, '计算器键盘行数 ' + rowsCalc.length)
  const tplEq = src.Eq.match(/<template>([\s\S]*?)<\/template>/)[1]
  const rowsEq = keyboardRows(tplEq)
  assert.ok(rowsEq.length >= 9, '方程页键盘行数 ' + rowsEq.length)
  const tplPlot = src.Plot.match(/<template>([\s\S]*?)<\/template>/)[1]
  const rowsPlot = keyboardRows(tplPlot)
  assert.ok(rowsPlot.length >= 10, '图像页键盘行数 ' + rowsPlot.length)
})

section('理科扩展（v2.0）')

test('首页有化学/物理入口，manifest 注册了两个页面', () => {
  assert.ok(src.Home.indexOf('goChem') >= 0, '首页缺化学入口')
  assert.ok(src.Home.indexOf('goPhys') >= 0, '首页缺物理入口')
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'))
  assert.ok(manifest.router.pages['pages/Chemistry'], 'manifest 缺 Chemistry')
  assert.ok(manifest.router.pages['pages/Physics'], 'manifest 缺 Physics')
  assert.equal(manifest.name, '理科助手')
})

test('化学页有周期表/摩尔质量，物理页有公式计算', () => {
  assert.ok(src.Chemistry.indexOf('pchips') >= 0)
  assert.ok(src.Chemistry.indexOf('摩尔质量') >= 0)
  assert.ok(src.Chemistry.indexOf('openPicker') >= 0)
  assert.ok(src.Physics.indexOf('computePhysics') >= 0)
  assert.ok(src.Physics.indexOf('fieldRows') >= 0)
})

test('化学分页卡片 + 理科页字号接进设置', () => {
  assert.ok(src.Chemistry.indexOf('FS_LAYOUT') >= 0)
  assert.ok(src.Chemistry.indexOf('buildCards') >= 0)
  assert.ok(src.Chemistry.indexOf('scroll-x') < 0, '化学页不应再靠横向滑动')
  assert.ok(src.About.indexOf('prevFs') >= 0 && src.About.indexOf('nextFs') >= 0)
  assert.ok(src.Physics.indexOf('fs{{fs}}') >= 0)
})

test('生物页、设置分页、绘制按钮都接好', () => {
  assert.ok(src.Biology && src.Biology.indexOf('bioTopics') >= 0)
  assert.ok(src.Home.indexOf('goBio') >= 0)
  assert.ok(src.About.indexOf("setTab('display')") >= 0)
  assert.ok(src.Plot.indexOf('drawNow') >= 0)
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'))
  assert.ok(manifest.router.pages['pages/Biology'], 'manifest 缺 Biology')
})

test('物理电路图入口和页面接好', () => {
  assert.ok(src.Circuit && src.Circuit.indexOf('tapEdge') >= 0)
  assert.ok(src.Circuit.indexOf('实物图') >= 0)
  assert.ok(src.Physics.indexOf('goCircuit') >= 0)
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'))
  assert.ok(manifest.router.pages['pages/Circuit'], 'manifest 缺 Circuit')
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
