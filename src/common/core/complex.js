/**
 * 复数运算的最小实现：实数用 number 表示，只有真的出现虚部时才退化成 { re, im }。
 * 这样普通算式（绝大多数）不产生任何对象分配，而 √(-4)、(2+3i)(1-i) 这类也能算。
 */

export function isC(v) { return typeof v === 'object' && v !== null }

/** 统一成 { re, im } */
export function toC(v) { return isC(v) ? v : { re: v, im: 0 } }

export function cAdd(a, b) {
  if (!isC(a) && !isC(b)) return a + b
  const x = toC(a), y = toC(b)
  return norm({ re: x.re + y.re, im: x.im + y.im })
}

export function cSub(a, b) {
  if (!isC(a) && !isC(b)) return a - b
  const x = toC(a), y = toC(b)
  return norm({ re: x.re - y.re, im: x.im - y.im })
}

export function cMul(a, b) {
  if (!isC(a) && !isC(b)) return a * b
  const x = toC(a), y = toC(b)
  return norm({
    re: x.re * y.re - x.im * y.im,
    im: x.re * y.im + x.im * y.re
  })
}

export function cDiv(a, b) {
  if (!isC(a) && !isC(b)) return a / b
  const x = toC(a), y = toC(b)
  const d = y.re * y.re + y.im * y.im
  if (d === 0) return { re: NaN, im: 0 }
  return norm({
    re: (x.re * y.re + x.im * y.im) / d,
    im: (x.im * y.re - x.re * y.im) / d
  })
}

/** 虚部为 0 就退回实数 */
export function norm(v) {
  if (!isC(v)) return v
  if (Math.abs(v.im) < 1e-14) return v.re
  return { re: v.re, im: v.im }
}

export function cAbs(v) {
  if (!isC(v)) return Math.abs(v)
  return Math.sqrt(v.re * v.re + v.im * v.im)
}

export function cNeg(v) { return isC(v) ? { re: -v.re, im: -v.im } : -v }

/** 复数的模与辐角 */
export function cArg(v) {
  const c = toC(v)
  return Math.atan2(c.im, c.re)
}

/** 复数开平方（实数负数会得到纯虚数） */
export function cSqrt(v) {
  if (!isC(v)) {
    if (v >= 0) return Math.sqrt(v)
    return { re: 0, im: Math.sqrt(-v) }
  }
  const r = Math.sqrt(cAbs(v))
  const t = cArg(v) / 2
  return norm({ re: r * Math.cos(t), im: r * Math.sin(t) })
}

/** 复数自然对数 */
export function cLn(v) {
  if (!isC(v)) {
    if (v > 0) return Math.log(v)
    if (v === 0) return -Infinity
    return { re: Math.log(-v), im: Math.PI }
  }
  return { re: Math.log(cAbs(v)), im: cArg(v) }
}

/**
 * 幂运算：底数为负而指数不是整数时走复数（主值分支），
 * 但指数是 p/q 且 q 为奇数时返回实数根——这样 (-8)^(1/3) 得到 -2 而不是 1+1.73i，
 * 符合普通计算器的习惯。
 */
export function cPow(a, b) {
  if (Math.abs(toC(a).im) < 1e-14 && Math.abs(toC(b).im) < 1e-14) {
    const base = toC(a).re, exp = toC(b).re
    const v = Math.pow(base, exp)
    if (isFinite(v)) return v
    if (base === 0) return 0
  }
  const x = toC(a), y = toC(b)
  if (y.im === 0 && x.im === 0) {
    if (x.re < 0) {
      // 尝试用有理指数找实数根：exp = p/q，q 为奇数
      const real = realRoot(x.re, y.re)
      if (real !== null) return real
    }
  }
  if (cAbs(a) === 0) return 0
  // z^w = exp(w·ln z)
  const l = cLn(a)
  return cExp(cMul(y, l))
}

/** 负数的实数奇次根：能把 exp 近似成 p/q（q 为奇数、q ≤ 9）时返回实数 */
export function realRoot(base, exp) {
  if (!(base < 0)) return null
  const frac = approxFraction(exp, 9, 1e-12)
  if (!frac) return null
  const q = frac[1]
  if (q % 2 === 0) return null
  const p = frac[0]
  const r = Math.pow(-base, p / q)
  return (p % 2 === 0) ? r : -r
}

/** 把浮点数近似成最简分数（分母 ≤ maxDen），失败返回 null */
export function approxFraction(v, maxDen, tol) {
  if (!isFinite(v)) return null
  let bestA = 0, bestB = 1, best = Math.abs(v)
  for (let b = 1; b <= maxDen; b++) {
    const a = Math.round(v * b)
    const err = Math.abs(v - a / b)
    if (err < best) { best = err; bestA = a; bestB = b }
    if (err < 1e-15) break
  }
  if (best > tol) return null
  let x = Math.abs(bestA), y = bestB
  while (y) { const t = y; y = x % y; x = t }
  const g = x || 1
  return [bestA / g, bestB / g]
}

export function cExp(v) {
  if (!isC(v)) return Math.exp(v)
  const r = Math.exp(v.re)
  return norm({ re: r * Math.cos(v.im), im: r * Math.sin(v.im) })
}

/** 显示成 a + bi / bi / a */
export function fmtComplex(v, fmt) {
  if (!isC(v)) return fmt(v)
  const re = v.re, im = v.im
  const eps = 1e-12
  if (Math.abs(im) < eps) return fmt(re)
  if (Math.abs(re) < eps) {
    const s = fmt(Math.abs(im))
    return (im < 0 ? '-' : '') + (s === '1' ? '' : s) + 'i'
  }
  const s = fmt(Math.abs(im))
  return fmt(re) + (im < 0 ? ' − ' : ' + ') + (s === '1' ? '' : s) + 'i'
}
