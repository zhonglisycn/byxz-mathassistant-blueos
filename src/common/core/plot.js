/**
 * 函数图像：采样 → 稳健取值范围 → 像素映射
 *
 * 手环上没有 canvas，所以曲线是用一串小方块（绝对定位的 div）点出来的。
 * 这里只负责"算什么点、画到哪个像素"，不管渲染，方便单测。
 */
import { compile } from './calc.js'

function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d }

/** 常用函数预设 */
export function presets() {
  return [
    { name: 'y = x', expr: 'x' },
    { name: 'y = x²', expr: 'x^2' },
    { name: 'y = x³', expr: 'x^3' },
    { name: 'y = |x|', expr: 'abs(x)' },
    { name: 'y = √x', expr: 'sqrt(x)' },
    { name: 'y = 1/x', expr: '1/x' },
    { name: 'y = sin x', expr: 'sin(x)' },
    { name: 'y = cos x', expr: 'cos(x)' },
    { name: 'y = tan x', expr: 'tan(x)' },
    { name: 'y = ln x', expr: 'ln(x)' },
    { name: 'y = eˣ', expr: 'exp(x)' },
    { name: 'y = x²−2x−3', expr: 'x^2-2x-3' }
  ]
}

/**
 * 采样。pts 里保留 NaN（定义域外/出错），由 toPixels 负责丢掉，
 * 这样调用方能看到"哪里断了"。
 */
export function sample(expr, opts) {
  const o = opts || {}
  const xmin = num(o.xmin, -10)
  const xmax = num(o.xmax, 10)
  const n = Math.max(21, Math.min(401, Math.round(o.n || 121)))
  const c = compile(expr)
  if (!c.ok) return { ok: false, err: c.err, pts: [], expr: expr }
  const pts = []
  let good = 0
  for (let i = 0; i < n; i++) {
    const x = xmin + (xmax - xmin) * i / (n - 1)
    const y = c.f(x)
    if (isFinite(y)) good++
    pts.push({ x: x, y: y })
  }
  if (!good) return { ok: false, err: '这段区间内函数没有取值（可能整个落在定义域外）', pts: pts, expr: expr, xmin: xmin, xmax: xmax }
  return { ok: true, pts: pts, expr: expr, xmin: xmin, xmax: xmax, valid: good }
}

/**
 * 稳健的 y 轴范围：按分位数裁掉两端极值。
 * 不这么做的话，tan / 1÷x 这种在区间里有渐近线的函数会把整幅图压成一条平线。
 */
export function robustRange(pts, opts) {
  const o = opts || {}
  const trim = typeof o.trim === 'number' ? o.trim : 0.03
  const ys = []
  for (let i = 0; i < pts.length; i++) if (isFinite(pts[i].y)) ys.push(pts[i].y)
  if (!ys.length) return { ymin: -1, ymax: 1 }
  ys.sort((a, b) => a - b)
  const k = Math.floor(ys.length * trim)
  let lo = ys[Math.min(k, ys.length - 1)]
  let hi = ys[Math.max(0, ys.length - 1 - k)]
  if (!(hi > lo)) {
    const c = ys[Math.floor(ys.length / 2)]
    lo = c - 1
    hi = c + 1
  }
  const pad = (hi - lo) * 0.08
  return { ymin: lo - pad, ymax: hi + pad }
}

/**
 * 映射到像素。盒子 box = {w, h}，范围 r = {xmin,xmax,ymin,ymax}。
 * 超出 y 范围的点和定义域外的点会被丢掉——渐近线因此自然断开，不会画出一条竖线。
 * 返回 { dots: [{px,py}], ax, ay }，ax/ay 是坐标轴在图上的位置（可为 null）。
 */
export function toPixels(pts, box, r) {
  const w = num(box.w, 100), h = num(box.h, 100)
  const xmin = num(r.xmin, -10), xmax = num(r.xmax, 10)
  const ymin = num(r.ymin, -1), ymax = num(r.ymax, 1)
  const sx = (xmax - xmin) !== 0 ? w / (xmax - xmin) : 1
  const sy = (ymax - ymin) !== 0 ? h / (ymax - ymin) : 1
  const dots = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (!isFinite(p.x) || !isFinite(p.y)) continue
    if (p.y < ymin || p.y > ymax) continue
    if (p.x < xmin || p.x > xmax) continue
    dots.push({
      px: Math.round((p.x - xmin) * sx),
      py: Math.round(h - (p.y - ymin) * sy)
    })
  }
  // 坐标轴：x 轴在 y=0 处，y 轴在 x=0 处（不在范围内则为 null）
  let ay = null, ax = null
  if (ymin <= 0 && 0 <= ymax) ay = Math.round(h - (0 - ymin) * sy)
  if (xmin <= 0 && 0 <= xmax) ax = Math.round((0 - xmin) * sx)
  return { dots: dots, ax: ax, ay: ay, w: w, h: h }
}

/** 采样 + 映射一条龙（页面用） */
export function plot(expr, opts) {
  const c = compile(expr)
  if (!c.ok) return { ok: false, err: c.err, dots: [], expr: expr }
  const r = plotFn(c.f, opts)
  r.expr = expr
  return r
}

/**
 * 直接给一个函数采样并映射——导函数只有语法树、没有表达式字符串，
 * 所以绘图与值表都提供"按函数"的版本。
 */
export function plotFn(f, opts) {
  const o = opts || {}
  const xmin = num(o.xmin, -10)
  const xmax = num(o.xmax, 10)
  const n = Math.max(21, Math.min(401, Math.round(o.n || 121)))
  const pts = []
  let good = 0
  for (let i = 0; i < n; i++) {
    const x = xmin + (xmax - xmin) * i / (n - 1)
    const y = f(x)
    if (isFinite(y)) good++
    pts.push({ x: x, y: y })
  }
  if (!good) return { ok: false, err: '这段区间内函数没有取值', dots: [], xmin: xmin, xmax: xmax }
  const range = robustRange(pts, o)
  const px = toPixels(pts, { w: num(o.w, 172), h: num(o.h, 200) }, {
    xmin: xmin, xmax: xmax, ymin: range.ymin, ymax: range.ymax
  })
  return {
    ok: true,
    dots: px.dots, ax: px.ax, ay: px.ay,
    xmin: xmin, xmax: xmax, ymin: range.ymin, ymax: range.ymax,
    sampled: pts.length, drawn: px.dots.length
  }
}

/** 给坐标轴刻度用：把范围取成好读的数字 */
export function niceTicks(min, max, count) {
  const c = Math.max(2, Math.min(9, count || 4))
  const span = max - min
  if (!(span > 0)) return [min]
  const raw = span / c
  const mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10))
  const norm = raw / mag
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag
  const out = []
  const start = Math.ceil(min / step) * step
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v)
  return out
}

/**
 * 值表：在区间内按固定步长取 x，给出 f(x)（定义域外为 NaN，由页面显示成 "—"）。
 * opts.step 是 x 的步长；结果条数上限由 maxRows 控制。
 */
export function table(expr, opts) {
  const c = compile(expr)
  if (!c.ok) return { ok: false, err: c.err, rows: [] }
  return tableFn(c.f, opts)
}

/** 按函数取值表（f2 可选，用来一并给出导数值） */
export function tableFn(f, opts) {
  const o = opts || {}
  const xmin = num(o.xmin, -5)
  const xmax = num(o.xmax, 5)
  const step = Math.abs(num(o.step, 1)) || 1
  const maxRows = Math.max(2, Math.min(80, Math.round(o.maxRows || 40)))
  const f2 = o.f2 || null
  const rows = []
  const n = Math.min(maxRows, Math.floor((xmax - xmin) / step + 1e-9) + 1)
  for (let i = 0; i < n; i++) {
    const x = xmin + i * step
    const y = f(x)
    const d = f2 ? f2(x) : NaN
    rows.push({
      x: Math.round(x * 1e6) / 1e6,
      y: y, ok: isFinite(y),
      d: d, dok: isFinite(d)
    })
  }
  if (!rows.length) return { ok: false, err: '区间太窄，取不到点', rows: [] }
  return { ok: true, rows: rows, step: step }
}
