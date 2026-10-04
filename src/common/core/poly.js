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

const DEG_MAX = 8

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

/** 多项式的实根：1 次直接解，2 次用公式，更高次扫描变号 + 二分 */
export function polyRoots(c, opts) {
  const o = opts || {}
  const d = polyDegree(c)
  if (d === 0) return []
  if (d === 1) return [-c[0] / c[1]]
  if (d === 2) {
    const [a0, a1, a2] = [c[0] || 0, c[1] || 0, c[2] || 0]
    const D = a1 * a1 - 4 * a2 * a0
    if (D < 0) return []
    if (D === 0) return [-a1 / (2 * a2)]
    const r = Math.sqrt(D)
    return [(-a1 - r) / (2 * a2), (-a1 + r) / (2 * a2)].sort((p, q) => p - q)
  }
  const xmin = typeof o.xmin === 'number' ? o.xmin : -50
  const xmax = typeof o.xmax === 'number' ? o.xmax : 50
  const steps = Math.max(200, Math.min(4000, o.steps || 1200))
  const roots = []
  const push = (x) => {
    for (let i = 0; i < roots.length; i++) if (Math.abs(roots[i] - x) < 1e-6) return
    roots.push(x)
  }
  let px = xmin, py = polyEval(c, xmin)
  for (let i = 1; i <= steps; i++) {
    const x = xmin + (xmax - xmin) * i / steps
    const y = polyEval(c, x)
    if (y === 0) push(x)
    else if ((py < 0 && y > 0) || (py > 0 && y < 0)) {
      let lo = px, hi = x, flo = py
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2
        const fm = polyEval(c, mid)
        if (Math.abs(fm) < 1e-12 || (hi - lo) < 1e-13) { lo = mid; hi = mid; break }
        if ((flo < 0 && fm > 0) || (flo > 0 && fm < 0)) hi = mid
        else { lo = mid; flo = fm }
      }
      push((lo + hi) / 2)
    }
    px = x
    py = y
  }
  return roots.sort((a, b) => a - b)
}
