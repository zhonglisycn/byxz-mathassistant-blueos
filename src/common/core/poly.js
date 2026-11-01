/**
 * 多项式引擎：把表达式语法树提取成系数数组 [c0, c1, c2, ...]，
 * 用于"方程自动化为一般式"——两边各自展成多项式，相减移项，就得到一般式。
 *
 * 支持：数字、x、+ − × ÷（除数必须是常数）、非负整数次幂（≤ 8 次）、
 * 以及与 x 无关的函数（如 √2、sin(1) 会先当常数求值）。
 * 出现 i、x 在分母、三角函数作用于 x 等情况会返回 null，由调用方退回数值法。
 */
import { evalAst } from './calc.js'
import { hasVar } from './calculus.js'
import { approxFraction } from './complex.js'

const DEG_MAX = 16

/** 把与 x 无关的子树求值成常数 */
function constOf(node) {
  const v = evalAst(node, { x: 0 })
  return (typeof v === 'number' && isFinite(v)) ? v : null
}

const ZERO = [0]
function trim(c) {
  const out = c.slice()
  // 抹掉浮点噪声
  for (let i = 0; i < out.length; i++) if (Math.abs(out[i]) < 1e-12) out[i] = 0
  while (out.length > 1 && out[out.length - 1] === 0) out.pop()
  return out
}

export function polyAdd(a, b) {
  const n = Math.max(a.length, b.length)
  const out = []
  for (let i = 0; i < n; i++) out.push((a[i] || 0) + (b[i] || 0))
  return trim(out)
}

export function polySub(a, b) {
  const n = Math.max(a.length, b.length)
  const out = []
  for (let i = 0; i < n; i++) out.push((a[i] || 0) - (b[i] || 0))
  return trim(out)
}

export function polyMul(a, b) {
  if (a.length + b.length - 1 > DEG_MAX + 1) return null
  const out = []
  for (let i = 0; i < a.length + b.length - 1; i++) out.push(0)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j]
  }
  return trim(out)
}

export function polyScale(a, k) { return trim(a.map(v => v * k)) }

export function polyEval(c, x) {
  let s = 0
  for (let i = c.length - 1; i >= 0; i--) s = s * x + c[i]
  return s
}

export function polyDegree(c) {
  for (let i = c.length - 1; i >= 0; i--) if (Math.abs(c[i]) > 1e-12) return i
  return 0
}

/** 语法树 → 系数数组；不能表示成多项式时返回 null */
export function toPoly(node) {
  if (!node) return null
  switch (node.t) {
    case 'num': return [node.v]
    case 'imag': return null
    case 'var': return [0, 1]
    case 'neg': {
      const a = toPoly(node.a)
      return a ? polyScale(a, -1) : null
    }
    case '+': case '-': {
      const a = toPoly(node.a), b = toPoly(node.b)
      if (!a || !b) return null
      return node.t === '+' ? polyAdd(a, b) : polySub(a, b)
    }
    case '*': {
      const a = toPoly(node.a), b = toPoly(node.b)
      if (!a || !b) return null
      return polyMul(a, b)
    }
    case '/': {
      const a = toPoly(node.a)
      if (!a) return null
      if (hasVar(node.b)) return null              // x 在分母：不是多项式
      const k = constOf(node.b)
      if (k === null || Math.abs(k) < 1e-15) return null
      return polyScale(a, 1 / k)
    }
    case '^': {
      if (hasVar(node.b)) return null              // 指数含 x：不是多项式
      const e = constOf(node.b)
      if (e === null || e < 0 || e > DEG_MAX || Math.round(e) !== e) return null
      const a = toPoly(node.a)
      if (!a) return null
      let out = [1]
      for (let i = 0; i < e; i++) {
        out = polyMul(out, a)
        if (!out) return null
      }
      return out
    }
    case 'call': {
      if (hasVar(node)) return null                // 三角函数/根号作用在 x 上：不是多项式
      const k = constOf(node)
      return k === null ? null : [k]
    }
    default: return null
  }
}

/* ------------------------------------------------------------------ */
/* 显示与求根                                                         */
/* ------------------------------------------------------------------ */

function cText(v) {
  const r = Math.round(v * 1e10) / 1e10
  return String(r)
}

/** [c0,c1,c2] → "x² − 3x + 2"（从高次往低次写，省略系数为 0 的项） */
export function polyText(c) {
  const d = polyDegree(c)
  const parts = []
  for (let i = d; i >= 0; i--) {
    const v = c[i] || 0
    if (Math.abs(v) < 1e-12) continue
    const abs = Math.abs(v)
    let coef = ''
    if (i === 0) coef = cText(abs)
    else if (Math.abs(abs - 1) > 1e-12) coef = cText(abs)
    const x = i === 0 ? '' : (i === 1 ? 'x' : 'x' + sup(i))
    const sign = parts.length === 0 ? (v < 0 ? '−' : '') : (v < 0 ? ' − ' : ' + ')
    parts.push(sign + coef + x)
  }
  return parts.length ? parts.join('') : '0'
}

function sup(n) {
  const map = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
  return map[n] || ('^' + n)
}

/** 多项式的实根：1 次直接解，2 次用公式，更高次走"有理根降次 + 数值扫描" */
export function polyRoots(c, opts) {
  const all = polySolve(c, opts).roots
  const out = []
  for (let i = 0; i < all.length; i++) {
    if (Math.abs(all[i].im) < 1e-10) out.push(all[i].re)
  }
  out.sort((a, b) => a - b)
  return out
}

/* ------------------------------------------------------------------ */
/* 有理根定理 + 降次                                                   */
/* ------------------------------------------------------------------ */

/** 多项式导数（有理根之间的极值点用于找重根） */
export function polyDerivative(c) {
  const out = []
  for (let i = 1; i < c.length; i++) out.push(c[i] * i)
  return out.length ? out : [0]
}

/** 除以 (x − r)，返回降次后的系数（综合除法） */
export function polyDivLinear(c, r) {
  const n = c.length - 1
  if (n <= 0) return [0]
  const b = []
  b[n - 1] = c[n]
  for (let i = n - 2; i >= 0; i--) b[i] = c[i + 1] + r * b[i + 1]
  return trim(b)
}

function gcdInt(a, b) {
  a = Math.abs(a); b = Math.abs(b)
  while (b) { const t = b; b = a % b; a = t }
  return a || 1
}

/** 正整数 n 的约数（防爆：最多收集 400 个） */
function divisors(n) {
  const out = []
  const v = Math.abs(Math.round(n))
  if (v === 0) return [0]
  if (v > 1e9) return null
  const lim = Math.floor(Math.sqrt(v))
  for (let i = 1; i <= lim; i++) {
    if (v % i === 0) {
      out.push(i)
      if (i !== v / i) out.push(v / i)
      if (out.length > 400) return null
    }
  }
  return out
}

/** 把浮点系数放大成整数系数（分母 ≤ 1000）；不可行时返回 null */
function integerCoeffs(c) {
  let den = 1
  const nums = []
  for (let i = 0; i < c.length; i++) {
    const v = c[i]
    if (Math.abs(v) < 1e-14) { nums.push(0); continue }
    const f = approxFraction(v, 1000, 1e-9)
    if (!f || Math.abs(f[0]) > 1e12) return null
    nums.push(f[0])
    den = den / gcdInt(den, f[1]) * f[1]
    if (den > 1e6) return null
  }
  const ints = []
  for (let i = 0; i < c.length; i++) {
    const f = approxFraction(c[i], 1000, 1e-9)
    const k = f ? Math.round(f[0] * den / f[1]) : 0
    if (k !== 0) {
      const back = k / den
      if (Math.abs(back - c[i]) > 1e-8 * Math.max(1, Math.abs(c[i]))) return null
    }
    ints.push(k)
  }
  return ints
}

/** 在多项式里找一个有理根：先 0，再按 |p/q| 从小到大试 */
function findRationalRoot(c) {
  const d = polyDegree(c)
  if (d < 1) return null
  if (Math.abs(c[0]) < 1e-12) return { p: 0, q: 1, v: 0, text: '0' }
  const ints = integerCoeffs(c)
  if (!ints) return null
  const lead = Math.round(ints[d])
  const cons = Math.round(ints[0])
  if (lead === 0 || cons === 0) return null
  const ps = divisors(cons)
  const qs = divisors(lead)
  if (!ps || !qs) return null
  const cand = []
  for (let i = 0; i < ps.length; i++) {
    for (let j = 0; j < qs.length; j++) {
      let p = ps[i], q = qs[j]
      const g = gcdInt(p, q)
      p /= g; q /= g
      cand.push({ p: p, q: q, v: p / q })
      cand.push({ p: -p, q: q, v: -p / q })
      if (cand.length > 3000) break
    }
    if (cand.length > 3000) break
  }
  cand.sort((a, b) => Math.abs(a.v) - Math.abs(b.v) || a.v - b.v)
  const magOf = (v) => {
    let m = 0, pw = 1
    const av = Math.abs(v)
    for (let i = 0; i < c.length; i++) { m += Math.abs(c[i]) * pw; pw *= av }
    return Math.max(1, m)
  }
  for (let i = 0; i < cand.length; i++) {
    const r = cand[i]
    const y = polyEval(c, r.v)
    if (Math.abs(y) <= 1e-9 * magOf(r.v)) {
      return { p: r.p, q: r.q, v: r.v, text: r.q === 1 ? String(r.p) : (r.p + '/' + r.q) }
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* 数值求根：加密扫描 + 二分；再用导数找"只碰不变号"的重根            */
/* ------------------------------------------------------------------ */

function bisect(c, lo, hi, flo) {
  let a = lo, b = hi, fa = flo
  for (let k = 0; k < 100; k++) {
    const mid = (a + b) / 2
    const fm = polyEval(c, mid)
    if (Math.abs(fm) < 1e-13 || (b - a) < 1e-12) return mid
    if ((fa < 0 && fm > 0) || (fa > 0 && fm < 0)) b = mid
    else { a = mid; fa = fm }
  }
  return (a + b) / 2
}

function polyRootsNumeric(c, opts) {
  const o = opts || {}
  const xmin = typeof o.xmin === 'number' ? o.xmin : -50
  const xmax = typeof o.xmax === 'number' ? o.xmax : 50
  const steps = Math.max(400, Math.min(8000, o.steps || 4000))
  const roots = []
  const push = (x) => {
    if (!isFinite(x)) return
    for (let i = 0; i < roots.length; i++) if (Math.abs(roots[i] - x) < 1e-6) return
    roots.push(x)
  }
  let px = xmin, py = polyEval(c, xmin)
  if (py === 0) push(px)
  for (let i = 1; i <= steps; i++) {
    const x = xmin + (xmax - xmin) * i / steps
    const y = polyEval(c, x)
    if (y === 0) push(x)
    else if ((py < 0 && y > 0) || (py > 0 && y < 0)) push(bisect(c, px, x, py))
    px = x
    py = y
  }
  // 偶次重根只在极值点"碰一下"，不变号：找导数变号处，再看 |f| 是否接近 0
  const dc = polyDerivative(c)
  let dx = xmin, dy = polyEval(dc, xmin)
  for (let i = 1; i <= steps; i++) {
    const x = xmin + (xmax - xmin) * i / steps
    const y = polyEval(dc, x)
    if ((dy < 0 && y > 0) || (dy > 0 && y < 0)) {
      const xe = bisect(dc, dx, x, dy)
      const ye = polyEval(c, xe)
      if (Math.abs(ye) < 1e-7) push(xe)
    }
    dx = x
    dy = y
  }
  return roots.sort((a, b) => a - b)
}

/* ------------------------------------------------------------------ */
/* 统一入口：返回全部根（含复根 / 有理根的精确写法）                    */
/* ------------------------------------------------------------------ */

/**
 * 多项式求根：先按有理根定理找 p/q 并降次（保留精确分数），
 * 降到二次用求根公式（含复根），降不动时用数值扫描找全部实根。
 * 返回 [{ re, im, exact }]，按实部/虚部排序。
 */
export function polySolve(c, opts) {
  let coeff = trim(c.slice())
  const roots = []
  const steps = []
  const push = (re, im, exact) => {
    for (let i = 0; i < roots.length; i++) {
      if (Math.abs(roots[i].re - re) < 1e-7 && Math.abs(roots[i].im - im) < 1e-7) {
        if (!roots[i].exact && exact) roots[i].exact = exact
        return
      }
    }
    roots.push({ re: re, im: im, exact: exact || null })
  }

  let guard = 0
  while (polyDegree(coeff) > 2 && guard++ < 8) {
    const r = findRationalRoot(coeff)
    if (!r) break
    push(r.v, 0, r.text)
    steps.push('有理根 x = ' + r.text + '，用 (x − ' + r.text + ') 降次')
    coeff = polyDivLinear(coeff, r.v)
  }

  const d = polyDegree(coeff)
  if (d === 2) {
    const a = coeff[2] || 0, b = coeff[1] || 0, cc = coeff[0] || 0
    const disc = b * b - 4 * a * cc
    if (disc >= 0) {
      const s = Math.sqrt(disc)
      push((-b - s) / (2 * a), 0, null)
      push((-b + s) / (2 * a), 0, null)
    } else {
      const s = Math.sqrt(-disc)
      push(-b / (2 * a), Math.abs(s / (2 * a)), null)
      push(-b / (2 * a), -Math.abs(s / (2 * a)), null)
    }
    steps.push('降到二次，用求根公式')
  } else if (d === 1) {
    push(-coeff[0] / coeff[1], 0, null)
  } else if (d >= 3) {
    const xs = polyRootsNumeric(coeff, opts)
    for (let i = 0; i < xs.length; i++) push(xs[i], 0, null)
    steps.push('剩余 ' + d + ' 次用数值法（' + (opts && opts.steps ? opts.steps : 4000) + ' 段扫描 + 二分）')
  }

  roots.sort((p, q) => (p.re - q.re) || (p.im - q.im))
  return { roots: roots, steps: steps, degree: polyDegree(c) }
}
