/**
 * 方程求解：一次 / 二次（含复数根、顶点、韦达定理）/ 二元一次方程组 / 任意 f(x)=0 数值求根
 * 纯 JS，返回结构化结果与可展示的步骤，方便页面直接渲染。
 */
import { compile, parseExpr, evalAst, formatNumber, formatExact, exactToNumber, display } from './calc.js'
import { toPoly, polySub, polyText, polyDegree, polySolve } from './poly.js'
import { hasVar } from './calculus.js'
import { isC } from './complex.js'

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
    out.steps.push('x = (−b ± √Δ) / 2a  →  x1 = ' + show(x1) + '，x2 = ' + show(x2))
  } else if (Math.abs(d) <= EPS) {
    const x = -b / (2 * a)
    out.roots = [{ re: x, im: 0 }]
    out.steps.push('Δ = 0：两个相等的实根')
    out.steps.push('x1 = x2 = −b / 2a = ' + show(x))
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
  const steps = ['主行列式 D = a1b2 − a2b1 = ' + show(det)]
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
  steps.push('D1 = c1b2 − c2b1 = ' + show(c1 * b2 - c2 * b1))
  steps.push('D2 = a1c2 − a2c1 = ' + show(a1 * c2 - a2 * c1))
  steps.push('x = D1/D = ' + show(x) + '，y = D2/D = ' + show(y))
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
  const c = compile(expr)
  if (!c.ok) return { kind: 'numeric', ok: false, err: c.err, roots: [] }
  const r = solveNumericFn(c.f, opts)
  r.expr = expr
  return r
}

/** 按函数求数值根（自由方程的非多项式分支直接用它） */
export function solveNumericFn(f, opts) {
  const o = opts || {}
  const xmin = typeof o.xmin === 'number' ? o.xmin : -20
  const xmax = typeof o.xmax === 'number' ? o.xmax : 20
  // 扫描加密：同样的区间切得更细，靠近的根不容易漏
  const steps = Math.max(50, Math.min(8000, o.steps || 1600))
  const tol = o.tol || 1e-9

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
    kind: 'numeric', ok: true, roots: roots,
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
    else if (Math.abs(x.im) < EPS) out.push('x' + (r.roots.length > 1 ? (i + 1) : '') + ' = ' + show(x.re))
    else out.push('x' + (r.roots.length > 1 ? (i + 1) : '') + ' = ' + show(x.re) + (x.im > 0 ? ' + ' : ' − ') + show(Math.abs(x.im)) + 'i')
  }
  return out.join('，')
}

/* ------------------------------------------------------------------ */
/* 精确 + 小数双行显示                                                */
/* ------------------------------------------------------------------ */

function tagOf(i, n) { return 'x' + (n > 1 ? (i + 1) : '') }

/**
 * 严格精确形式：formatExact 会给 1e-6 内的分数近似（计算器够用），
 * 但方程结果不能把 2.0945514815 写成 1307/624——回落成 null，只显示小数。
 */
export function strictExact(v) {
  const e = formatExact(v)
  if (e === null) return null
  const back = exactToNumber(e)
  if (back === null || Math.abs(back - v) > 1e-9 * Math.max(1, Math.abs(v))) return null
  return e
}

/** 单根的精确两段；任一段给不出精确形式就返回 null */
function exactPartsOf(r) {
  if (typeof r === 'number') {
    const re = strictExact(r)
    return re === null ? null : { re: re, im: null, imVal: 0 }
  }
  const re = strictExact(r.re)
  if (re === null) return null
  if (Math.abs(r.im) < 1e-12) return { re: re, im: null, imVal: 0 }
  const im = strictExact(Math.abs(r.im))
  if (im === null) return null
  return { re: re, im: im, imVal: r.im }
}

/** 精确串：a + bi / bi / a */
function exactRootText(r, i, n) {
  const p = exactPartsOf(r)
  if (!p) return null
  const tag = tagOf(i, n)
  const imOn = p.im !== null
  let body
  if (imOn && p.re === '0') {
    body = (p.imVal < 0 ? '-' : '') + (p.im === '1' ? '' : p.im) + 'i'
  } else if (imOn) {
    body = p.re + (p.imVal > 0 ? ' + ' : ' − ') + (p.im === '1' ? '' : p.im) + 'i'
  } else {
    body = p.re
  }
  return tag + ' = ' + body
}

/** 小数串：同一套根 */
function floatRootText(r, i, n) {
  const tag = tagOf(i, n)
  if (typeof r === 'number') return tag + ' = ' + formatNumber(r)
  if (Math.abs(r.im) < 1e-12) return tag + ' = ' + formatNumber(r.re)
  const im = Math.abs(r.im)
  if (Math.abs(r.re) < 1e-12) {
    return tag + ' = ' + (r.im < 0 ? '-' : '') + (im === 1 ? '' : formatNumber(im)) + 'i'
  }
  return tag + ' = ' + formatNumber(r.re) + (r.im > 0 ? ' + ' : ' − ') + (im === 1 ? '' : formatNumber(im)) + 'i'
}

/**
 * 结果双行：exactText 为 null 时只给小数行 + 说明。
 * exactFirst 由全局"精确/小数"开关决定哪行在前/加粗。
 * 返回 { lines:[{text,on,small}], hasExact, exactText, floatText }
 */
export function makeLines(exactText, floatText, exactFirst) {
  const lines = []
  if (exactText !== null && exactText !== undefined) {
    if (exactFirst) {
      lines.push({ text: '精确：' + exactText, on: true, cls: 't-line-on' })
      lines.push({ text: '小数：' + floatText, on: false, cls: 't-line-off' })
    } else {
      lines.push({ text: '小数：' + floatText, on: true, cls: 't-line-on' })
      lines.push({ text: '精确：' + exactText, on: false, cls: 't-line-off' })
    }
    return { lines: lines, hasExact: true, exactText: exactText, floatText: floatText }
  }
  lines.push({ text: '小数：' + floatText, on: true, cls: 't-line-on' })
  lines.push({ text: '（精确形式不可得，仅显示小数）', on: false, small: true, cls: 't-line-sm t-line-off' })
  return { lines: lines, hasExact: false, exactText: null, floatText: floatText }
}

/** 一组根 → 精确 + 小数双行 */
export function rootLines(roots, exactFirst) {
  const list = roots || []
  const n = list.length
  let exact = []
  let hasExact = n > 0
  const floats = []
  for (let i = 0; i < n; i++) {
    const e = exactRootText(list[i], i, n)
    if (e === null) hasExact = false
    else exact.push(e)
    floats.push(floatRootText(list[i], i, n))
  }
  return makeLines(hasExact ? exact.join('，') : null, floats.join('，'), exactFirst)
}

/* ------------------------------------------------------------------ */
/* 任意写法的方程：自动化为一般式再解                                   */
/*                                                                    */
/* 2x + 3 = 7        → 2x − 4 = 0            → x = 2                  */
/* x² − 3x = −2      → x² − 3x + 2 = 0       → x = 1, 2              */
/* 2(x+3) = x − 1    → x + 7 = 0             → x = −7                 */
/* 做法：等号两边各自展成多项式，相减移项得到一般式，再按次数选解法。   */
/* ------------------------------------------------------------------ */

/** 分母里含 x：保留旧行为，明确拒绝（数值法也很容易把极点误当根） */
function hasVarDiv(node) {
  if (!node) return false
  if (node.t === '/' && hasVar(node.b)) return true
  if (node.a && hasVarDiv(node.a)) return true
  if (node.b && hasVarDiv(node.b)) return true
  if (node.args) {
    for (let i = 0; i < node.args.length; i++) if (hasVarDiv(node.args[i])) return true
  }
  return false
}

/**
 * 估算多项式的次数（不展开），用来在 toPoly 因"次数太高"返回 null 时
 * 仍能给出"最高支持 4 次"的明确错误，而不是偷偷走数值求解。
 * 非多项式（|x|、root、指数含 x 等）返回 null。
 */
function degreeOf(node) {
  if (!node) return null
  switch (node.t) {
    case 'num': return 0
    case 'imag': return null
    case 'var': return 1
    case 'neg': return degreeOf(node.a)
    case '+': case '-': {
      const a = degreeOf(node.a), b = degreeOf(node.b)
      return (a === null || b === null) ? null : Math.max(a, b)
    }
    case '*': {
      const a = degreeOf(node.a), b = degreeOf(node.b)
      return (a === null || b === null) ? null : a + b
    }
    case '/': {
      if (hasVar(node.b)) return null
      return degreeOf(node.a)
    }
    case '^': {
      if (hasVar(node.b)) return null
      const d = degreeOf(node.a)
      if (d === null) return null
      try {
        const e = evalAst(node.b, { x: 0 })
        if (typeof e !== 'number' || !isFinite(e) || e < 0 || Math.round(e) !== e) return null
        return d * e
      } catch (err) {
        return null
      }
    }
    case 'call': return hasVar(node) ? null : 0
    case 'fact': return hasVar(node) ? null : 0
    default: return null
  }
}

/** 等号两边相减得到 f(x)；复数/定义域外返回 NaN，交给数值扫描跳过 */
function diffFn(left, right) {
  return function (x) {
    try {
      const a = evalAst(left, { x: x })
      const b = evalAst(right, { x: x })
      if (isC(a) || isC(b)) return NaN
      return a - b
    } catch (e) {
      return NaN
    }
  }
}

function bigKey(v) {
  if (!v || !v.__big) return null
  return v.tower ? ('T:' + v.expr) : ('B:' + v.exact)
}

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
    // 非多项式：|x|、root(x,n)、2^x、指数塔这类能算的走数值求根。
    // 但 x 在分母的仍然拒绝（既有行为，也是防渐近线误报的保险）。
    const dl = degreeOf(L.ast), dr = degreeOf(R.ast)
    const dTop = (dl === null || dr === null) ? null : Math.max(dl, dr)
    const hasDen = hasVarDiv(L.ast) || hasVarDiv(R.ast)
    // 两边都是常数（例如 2↑↑3 = 16）：直接判恒等/矛盾，别让数值扫描把 xmin 当成根
    if (!hasVar(L.ast) && !hasVar(R.ast)) {
      let va, vb
      try {
        va = evalAst(L.ast, { x: 0 })
        vb = evalAst(R.ast, { x: 0 })
      } catch (e) {
        return { ok: false, err: (e && e.message) ? e.message : '算式有误' }
      }
      const ka = bigKey(va), kb = bigKey(vb)
      if (ka !== null || kb !== null) {
        const zero2 = ka === kb
        return {
          ok: true, kind: 'numeric', degree: 0, general: text,
          any: zero2, none: !zero2, roots: [],
          steps: [zero2 ? '两边是同一个大数/箭头表达式，任意 x 都成立' : '两边的大数/箭头表达式不相等，方程无解']
        }
      }
      if (isC(va) || isC(vb)) return { ok: false, err: '方程结果暂不支持复数（可先用计算器算）' }
      const zero = Math.abs(va - vb) < 1e-12
      const steps0 = [zero ? '两边相等，任意 x 都成立' : '两边不相等，方程无解']
      return {
        ok: true, kind: 'numeric', degree: 0, general: text,
        any: zero, none: !zero, roots: [], steps: steps0
      }
    }
    // 常数 = x 也直接给根
    if (!hasVar(R.ast) && L.ast && L.ast.t === 'var' && L.ast.v === 'x') {
      try {
        const v = evalAst(R.ast, { x: 0 })
        if (!isC(v) && typeof v === 'number' && isFinite(v)) {
          return {
            ok: true, kind: 'numeric', degree: null, general: text,
            roots: [{ re: v, im: 0 }],
            steps: ['常数等于 x，直接得到 x = ' + formatNumber(v)]
          }
        }
      } catch (e) { /* fall through */ }
    }
    // x = 常数 这种直接给根，避免数值扫描区间 (-50,50) 漏掉大常数
    if (!hasVar(L.ast) && R.ast && R.ast.t === 'var' && R.ast.v === 'x') {
      try {
        const v = evalAst(L.ast, { x: 0 })
        if (!isC(v) && typeof v === 'number' && isFinite(v)) {
          return {
            ok: true, kind: 'numeric', degree: null, general: text,
            roots: [{ re: v, im: 0 }],
            steps: ['常数等于 x，直接得到 x = ' + formatNumber(v)]
          }
        }
      } catch (e) { /* fall through */ }
    }
    const f = diffFn(L.ast, R.ast)
    const ranges = (typeof o.xmin === 'number' && typeof o.xmax === 'number')
      ? [[o.xmin, o.xmax, o.steps || 4000]]
      : [[-100, 100, 4000], [100, 10000, 3000], [-10000, -100, 3000], [10000, 1000000, 3000], [-1000000, -10000, 3000]]
    const all = []
    const rangeNotes = []
    for (const rg of ranges) {
      const nr = solveNumericFn(f, { xmin: rg[0], xmax: rg[1], steps: rg[2] })
      for (const x of nr.roots) {
        let dup = false
        for (const y of all) if (Math.abs(x - y) < 1e-6) { dup = true; break }
        if (!dup) all.push(x)
      }
      rangeNotes.push('[' + rg[0] + ', ' + rg[1] + ']')
    }
    all.sort((a, b) => a - b)
    const steps = [
      '这个方程不是多项式（含 |x|、n 次根、指数或分母等），改用数值求根：f(x) = 左边 − 右边',
      '扫描区间：' + rangeNotes.join('、'),
      hasDen ? '分母含 x：已用 |f(根)| 检查过滤极点/渐近线' : '已按 |f(根)| 检查过滤渐近线',
      all.length ? ('共找到 ' + all.length + ' 个实根') : '这些区间里没有找到实根'
    ]
    return {
      ok: true, kind: 'numeric', degree: null,
      general: '数值求根：' + text,
      roots: all.map(v => ({ re: v, im: 0 })),
      steps: steps
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

  // 三次以上：有理根定理找精确分数根并降次，剩余部分数值求根
  steps.push('次数 ≥ 3：先按有理根定理试 x = p/q（p 整除常数项、q 整除首项）')
  const pr2 = polySolve(c, { xmin: o.xmin || -50, xmax: o.xmax || 50, steps: o.steps || 4000 })
  for (let i = 0; i < pr2.steps.length; i++) steps.push(pr2.steps[i])
  steps.push(pr2.roots.length ? ('共找到 ' + pr2.roots.length + ' 个根（含复根）') : '这个范围里没有找到根')
  return { ok: true, kind: 'poly', degree: d, general: general, roots: pr2.roots, steps: steps }
}

export { display }
