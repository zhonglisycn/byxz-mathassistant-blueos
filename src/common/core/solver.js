/**
 * 方程求解：一次 / 二次（含复数根、顶点、韦达定理）/ 二元一次方程组 / 任意 f(x)=0 数值求根
 * 纯 JS，返回结构化结果与可展示的步骤，方便页面直接渲染。
 */
import { compile, parseExpr, formatNumber, formatExact, display } from './calc.js'
import { toPoly, polySub, polyText, polyDegree, polyRoots } from './poly.js'

const EPS = 1e-9

/** 显示用：优先精确形式 */
function show(v) {
  const x = formatExact(v)
  return x !== null ? x : formatNumber(v)
}

/* ------------------------------------------------------------------ */
/* 一元一次：ax + b = 0                                                */
/* ------------------------------------------------------------------ */

export function solveLinear(a, b) {
  if (Math.abs(a) < EPS) {
    if (Math.abs(b) < EPS) return { kind: 'linear', ok: true, any: true, roots: [], steps: ['a 和 b 都为 0：任意 x 都成立（恒等式）'] }
    return { kind: 'linear', ok: false, err: 'a = 0 且 b ≠ 0：无解（矛盾式）', roots: [], steps: [] }
  }
  const x = -b / a
  return {
    kind: 'linear', ok: true, any: false, roots: [x],
    steps: ['ax + b = 0  →  x = −b / a', 'x = −(' + show(b) + ') / ' + show(a), 'x = ' + show(x)]
  }
}

/* ------------------------------------------------------------------ */
/* 一元二次：ax² + bx + c = 0                                          */
/* ------------------------------------------------------------------ */

export function solveQuadratic(a, b, c) {
  if (Math.abs(a) < EPS) return solveLinear(b, c)
  const d = b * b - 4 * a * c
  const steps = [
    '判别式 Δ = b² − 4ac',
    'Δ = ' + show(b) + '² − 4×' + show(a) + '×' + show(c) + ' = ' + show(d)
  ]
  const vx = -b / (2 * a)
  const vy = c - b * b / (4 * a)
  const out = {
    kind: 'quadratic', ok: true, d: d, real: d >= -EPS,
    vertex: { x: vx, y: vy },
    sum: -b / a, product: c / a,
    steps: steps
  }
  if (d > EPS) {
    const r = Math.sqrt(d)
    const x1 = (-b - r) / (2 * a)
    const x2 = (-b + r) / (2 * a)
    out.roots = [{ re: x1, im: 0 }, { re: x2, im: 0 }]
    out.steps.push('Δ > 0：两个不相等的实根')
    out.steps.push('x = (−b ± √Δ) / 2a  →  x₁ = ' + show(x1) + '，x₂ = ' + show(x2))
  } else if (Math.abs(d) <= EPS) {
    const x = -b / (2 * a)
    out.roots = [{ re: x, im: 0 }]
    out.steps.push('Δ = 0：两个相等的实根')
    out.steps.push('x₁ = x₂ = −b / 2a = ' + show(x))
  } else {
    const re = -b / (2 * a)
    const im = Math.sqrt(-d) / (2 * a)
    out.roots = [{ re: re, im: Math.abs(im) }, { re: re, im: -Math.abs(im) }]
    out.steps.push('Δ < 0：没有实根，有一对共轭复根')
    out.steps.push('x = (−b ± i√|Δ|) / 2a  →  x = ' + show(re) + ' ± ' + show(Math.abs(im)) + 'i')
  }
  out.steps.push('顶点 ( −b/2a , c − b²/4a ) = ( ' + show(vx) + ' , ' + show(vy) + ' )')
  out.steps.push('韦达定理：两根之和 = ' + show(out.sum) + '，两根之积 = ' + show(out.product))
  return out
}

/* ------------------------------------------------------------------ */
/* 二元一次方程组：a1x + b1y = c1 ；a2x + b2y = c2                      */
/* ------------------------------------------------------------------ */

export function solveSystem2(a1, b1, c1, a2, b2, c2) {
  const det = a1 * b2 - a2 * b1
  const steps = ['主行列式 D = a₁b₂ − a₂b₁ = ' + show(det)]
  if (Math.abs(det) < EPS) {
    const same = Math.abs(a1 * c2 - a2 * c1) < EPS && Math.abs(b1 * c2 - b2 * c1) < EPS
    if (same) {
      steps.push('D = 0 且方程等价：无穷多组解（两直线重合）')
      return { kind: 'system2', ok: true, any: true, steps: steps }
    }
    steps.push('D = 0 且方程不等价：无解（两直线平行）')
    return { kind: 'system2', ok: true, none: true, steps: steps }
  }
  const x = (c1 * b2 - c2 * b1) / det
  const y = (a1 * c2 - a2 * c1) / det
  steps.push('D₁ = c₁b₂ − c₂b₁ = ' + show(c1 * b2 - c2 * b1))
  steps.push('D₂ = a₁c₂ − a₂c₁ = ' + show(a1 * c2 - a2 * c1))
  steps.push('x = D₁/D = ' + show(x) + '，y = D₂/D = ' + show(y))
  return { kind: 'system2', ok: true, x: x, y: y, det: det, steps: steps }
}

/* ------------------------------------------------------------------ */
/* 任意方程 f(x) = 0：扫描变号区间 + 二分细化                          */
/* ------------------------------------------------------------------ */

/**
 * 数值求根。expr 里用 x 作未知数，例如 "x^3-2x-5" 或 "sin(x)-0.5"。
 * 变号扫描可能被"不连续点"骗到（tan 的渐近线两边正好一正一负），
 * 所以二分收敛后还要检查 |f(根)| 是否足够小，否则丢弃。
 * opts: { xmin, xmax, steps, tol }
 */
export function solveNumeric(expr, opts) {
  const o = opts || {}
  const xmin = typeof o.xmin === 'number' ? o.xmin : -20
  const xmax = typeof o.xmax === 'number' ? o.xmax : 20
  const steps = Math.max(50, Math.min(4000, o.steps || 600))
  const tol = o.tol || 1e-9
  const c = compile(expr)
  if (!c.ok) return { kind: 'numeric', ok: false, err: c.err, roots: [] }
  const f = c.f

  const roots = []
  const push = (x) => {
    for (let i = 0; i < roots.length; i++) if (Math.abs(roots[i] - x) < 1e-6) return
    roots.push(x)
  }

  let prevX = xmin
  let prevY = f(xmin)
  if (prevY === 0) push(xmin)
  for (let i = 1; i <= steps; i++) {
    const x = xmin + (xmax - xmin) * i / steps
    const y = f(x)
    if (y === 0) { push(x); prevX = x; prevY = y; continue }
    // 变号 → 区间内必有根（除非是不连续点，下面用 |f| 兜住）
    if (isFinite(y) && isFinite(prevY) && ((prevY < 0 && y > 0) || (prevY > 0 && y < 0))) {
      let lo = prevX, hi = x, flo = prevY
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2
        const fm = f(mid)
        if (!isFinite(fm)) break
        if (Math.abs(fm) < tol || (hi - lo) < 1e-12) { lo = mid; hi = mid; break }
        if ((flo < 0 && fm > 0) || (flo > 0 && fm < 0)) { hi = mid } else { lo = mid; flo = fm }
      }
      const root = (lo + hi) / 2
      const fr = f(root)
      // 只接受真正接近 0 的根，滤掉渐近线
      if (isFinite(fr) && Math.abs(fr) < 1e-6) push(root)
    }
    prevX = x
    prevY = y
  }
  roots.sort((p, q) => p - q)
  return {
    kind: 'numeric', ok: true, roots: roots, expr: expr,
    scanned: { xmin: xmin, xmax: xmax, steps: steps },
    steps: roots.length
      ? ['在 [' + xmin + ', ' + xmax + '] 内按 ' + steps + ' 等分扫描变号区间，再二分细化', '共找到 ' + roots.length + ' 个实根']
      : ['在 [' + xmin + ', ' + xmax + '] 内没有找到实根（可换扫描范围再试）']
  }
}

/** 把一组根转成显示文本 */
export function rootsText(r) {
  if (!r || !r.ok) return r && r.err ? r.err : '无结果'
  if (r.any) return '任意 x 都成立'
  if (r.none) return '无解'
  if (!r.roots || !r.roots.length) return '没有实根'
  const out = []
  for (let i = 0; i < r.roots.length; i++) {
    const x = r.roots[i]
    if (typeof x === 'number') out.push('x' + (r.roots.length > 1 ? (i + 1) : '') + ' = ' + show(x))
    else if (Math.abs(x.im) < EPS) out.push('x' + (i + 1) + ' = ' + show(x.re))
    else out.push('x' + (i + 1) + ' = ' + show(x.re) + (x.im > 0 ? ' + ' : ' − ') + show(Math.abs(x.im)) + 'i')
  }
  return out.join('，')
}

/* ------------------------------------------------------------------ */
/* 任意写法的方程：自动化为一般式再解                                   */
/*                                                                    */
/* 2x + 3 = 7        → 2x − 4 = 0            → x = 2                  */
/* x² − 3x = −2      → x² − 3x + 2 = 0       → x = 1, 2              */
/* 2(x+3) = x − 1    → x + 7 = 0             → x = −7                 */
/* 做法：等号两边各自展成多项式，相减移项得到一般式，再按次数选解法。   */
/* ------------------------------------------------------------------ */

export function solveEquation(src, opts) {
  const o = opts || {}
  const text = String(src == null ? '' : src).trim()
  if (!text) return { ok: false, err: '还没有输入方程' }
  const parts = text.split('=')
  if (parts.length === 1) return { ok: false, err: '方程里要有等号，例如 2x+3=7' }
  if (parts.length > 2) return { ok: false, err: '只能有一个等号' }

  const L = parseExpr(parts[0])
  if (!L.ok) return { ok: false, err: '等号左边：' + L.err }
  const R = parseExpr(parts[1])
  if (!R.ok) return { ok: false, err: '等号右边：' + R.err }

  const pl = toPoly(L.ast)
  const pr = toPoly(R.ast)
  if (!pl || !pr) {
    return {
      ok: false,
      err: '这个方程暂时解不了：它不能整理成多项式（x 在分母、幂次太高，或含三角函数/虚数）'
    }
  }

  const c = polySub(pl, pr)
  const d = polyDegree(c)
  const general = polyText(c) + ' = 0'
  const steps = ['两边展开后移项，化为一般式：' + general]

  if (d === 0) {
    const zero = Math.abs(c[0]) < 1e-12
    steps.push(zero ? '两边恒等，任意 x 都成立' : '常数不相等，方程无解')
    return { ok: true, kind: 'poly', degree: 0, general: general, any: zero, none: !zero, roots: [], steps: steps }
  }

  if (d === 1) {
    const r = solveLinear(c[1], c[0])
    for (let i = 0; i < r.steps.length; i++) steps.push(r.steps[i])
    return { ok: true, kind: 'poly', degree: 1, general: general, roots: r.roots.map(v => ({ re: v, im: 0 })), steps: steps }
  }

  if (d === 2) {
    const r = solveQuadratic(c[2] || 0, c[1] || 0, c[0] || 0)
    for (let i = 0; i < r.steps.length; i++) steps.push(r.steps[i])
    return {
      ok: true, kind: 'poly', degree: 2, general: general,
      roots: r.roots, d2: r.d, vertex: r.vertex, sum: r.sum, product: r.product, steps: steps
    }
  }

  const xs = polyRoots(c, { xmin: o.xmin || -50, xmax: o.xmax || 50 })
  steps.push('次数 ≥ 3，用数值法扫描变号区间再二分细化（只在 −50 ~ 50 内找实根）')
  steps.push(xs.length ? ('共找到 ' + xs.length + ' 个实根') : '这个范围里没有找到实根（可能只有复根）')
  return { ok: true, kind: 'poly', degree: d, general: general, roots: xs.map(v => ({ re: v, im: 0 })), steps: steps }
}

export { display }
