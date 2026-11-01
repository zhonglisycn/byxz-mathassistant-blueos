/**
 * 表达式引擎：分词 → 递归下降解析 → 求值
 *
 * 为什么不用 new Function / eval：
 *   ① 手环的 JS 引擎未必开放 eval，靠拼字符串求值不可靠；
 *   ② 拼字符串给不出可读错误（"括号不匹配"「除以零」根本区分不出来）；
 *   ③ 函数图像页每条曲线要算上千个点，需要的是纯函数实现而不是每次重新编译字符串。
 *
 * 支持的语法
 *   数字      3  3.14  .5  1e3
 *   常量      π  pi  e
 *   运算      + - * / × ÷ %(取余) ^ 或 **(幂，右结合)
 *   箭头      ↑(同 ^)  ↑↑(四阶/tetration)  ↑↑↑(五阶/pentation，极小范围)
 *   后缀      !(阶乘 0~2000)  °(角度转弧度)  ²  ³
 *   函数      sin cos tan asin acos atan sinh cosh tanh
 *             sqrt √ abs ln log log2 exp floor ceil round max min root
 *   绝对值    |x|（等价 abs(x)）
 *   括号      ( )        逗号用于多参数函数 max(1,2)、root(8,3)
 *   隐式乘法  2π  3(4+5)  (1+2)(3+4)  2sin(30)
 *
 * 上限与护栏（见 common/core/limits.js）：
 *   token 数 ≤ 4096；括号/函数/幂嵌套 ≤ 64 层；求值递归 ≤ 1024 层；
 *   幂/箭头结果 > 1e308 → "数值过大"，迭代次数 > 1e6 → "太大，拒绝计算"。
 *
 * 角度模式：env.deg 为 true 时 sin/cos/tan 的入参按度、asin/acos/atan 的返回值按度。
 */

import { isC, toC, norm, cAdd, cSub, cMul, cDiv, cNeg, cAbs, cSqrt, cLn, cExp, cPow, fmtComplex } from './complex.js'
import { LIMITS } from './limits.js'

const PI = Math.PI
const E = Math.E

/* ------------------------------------------------------------------ */
/* 词法                                                               */
/* ------------------------------------------------------------------ */

const FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
  sinh: 1, cosh: 1, tanh: 1,
  sqrt: 1, root: 2, abs: 1, ln: 1, log: 1, log2: 1, exp: 1,
  floor: 1, ceil: 1, round: 1, max: 2, min: 2
}

function tokenize(src) {
  const out = []
  let i = 0
  const s = String(src)
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    // 数字（允许小数点开头、科学计数法）
    if ((c >= '0' && c <= '9') || (c === '.' && s[i + 1] >= '0' && s[i + 1] <= '9')) {
      let j = i, dot = false
      while (j < s.length) {
        const d = s[j]
        if (d >= '0' && d <= '9') { j++; continue }
        if (d === '.' && !dot) { dot = true; j++; continue }
        if ((d === 'e' || d === 'E') && s[j + 1] >= '0' && s[j + 1] <= '9') { j += 2; while (s[j] >= '0' && s[j] <= '9') j++; break }
        break
      }
      out.push({ t: 'num', v: parseFloat(s.slice(i, j)), raw: s.slice(i, j) })
      i = j
      continue
    }
    // 字母：函数名、常量、变量 x
    if (/[a-zA-Z]/.test(c)) {
      let j = i
      while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++
      const name = s.slice(i, j).toLowerCase()
      if (name === 'pi') out.push({ t: 'num', v: PI })
      else if (name === 'e') out.push({ t: 'num', v: E })
      else if (name === 'x') out.push({ t: 'var', v: 'x' })
      else if (name === 'i') out.push({ t: 'imag', v: 'i' })
      else if (FUNCS[name]) out.push({ t: 'func', v: name })
      else throw new Error('不认识的符号：' + name)
      i = j
      continue
    }
    if (c === 'π') { out.push({ t: 'num', v: PI }); i++; continue }
    if (c === '√') { out.push({ t: 'func', v: 'sqrt' }); i++; continue }
    if (c === '|') { out.push({ t: 'bar' }); i++; continue }
    if (c === '↑') {
      // 连续箭头：↑ / ↑↑ / ↑↑↑
      let n = 1
      while (s[i + n] === '↑') n++
      if (n > 6) throw new Error('箭头最多 6 个')
      out.push({ t: 'op', v: '↑'.repeat(n) })
      i += n
      continue
    }
    if (c === '×') { out.push({ t: 'op', v: '*' }); i++; continue }
    if (c === '÷') { out.push({ t: 'op', v: '/' }); i++; continue }
    if (c === '−') { out.push({ t: 'op', v: '-' }); i++; continue }
    if (c === '*' && s[i + 1] === '*') { out.push({ t: 'op', v: '^' }); i += 2; continue }
    if ('+-*/^%'.indexOf(c) >= 0) { out.push({ t: 'op', v: c }); i++; continue }
    if (c === '!') { out.push({ t: 'suf', v: '!' }); i++; continue }
    if (c === '°') { out.push({ t: 'suf', v: '°' }); i++; continue }
    if (c === '²') { out.push({ t: 'suf', v: '2' }); i++; continue }
    if (c === '³') { out.push({ t: 'suf', v: '3' }); i++; continue }
    if (c === '(') { out.push({ t: 'lp' }); i++; continue }
    if (c === ')') { out.push({ t: 'rp' }); i++; continue }
    if (c === ',') { out.push({ t: 'comma' }); i++; continue }
    throw new Error('无法识别的字符：' + c)
  }
  if (out.length > LIMITS.tokens) {
    throw new Error('算式太长（最多 ' + LIMITS.tokens + ' 个符号）')
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 语法（递归下降，优先级由低到高）                                     */
/*   expr   := term (('+'|'-') term)*                                  */
/*   term   := unary (('*'|'/'|'%'|隐式) unary)*                        */
/*   unary  := ('-'|'+') unary | power                                  */
/*   power  := postfix ('^' unary)?        // 右结合，2^3^2 = 512        */
/*   postfix:= primary ('!'|'°'|'²'|'³')*                               */
/*   primary:= 数字 | 变量 | 函数 '(' expr (',' expr)* ')' | '(' expr ')' */
/* ------------------------------------------------------------------ */

function parse(tokens) {
  if (tokens.length > LIMITS.tokens) {
    throw new Error('算式太长（最多 ' + LIMITS.tokens + ' 个符号）')
  }
  let p = 0
  let depth = 0
  const peek = () => tokens[p]
  const eat = (t, v) => {
    const k = tokens[p]
    if (!k || (t && k.t !== t) || (v && k.v !== v)) return null
    p++
    return k
  }
  /** 括号 / 函数 / 幂的嵌套深度护栏：防止恶意长串把栈打穿 */
  const nested = (fn) => {
    if (++depth > LIMITS.depth) {
      depth--
      throw new Error('嵌套层数太多（最多 ' + LIMITS.depth + ' 层）')
    }
    try {
      return fn()
    } finally {
      depth--
    }
  }

  function expr(stopBar) {
    let node = term(stopBar)
    for (;;) {
      const k = peek()
      if (k && k.t === 'op' && (k.v === '+' || k.v === '-')) { p++; node = { t: k.v, a: node, b: term(stopBar) } }
      else return node
    }
  }

  function term(stopBar) {
    let node = unary()
    for (;;) {
      const k = peek()
      if (k && k.t === 'op' && (k.v === '*' || k.v === '/' || k.v === '%')) { p++; node = { t: k.v, a: node, b: unary() } }
      // 隐式乘法：2π、3(4+5)、(1+2)(3+4)、2sin(30)、2|x|
      // stopBar=true 时（绝对值内部）bar 是收尾符，不能当乘号吃进去
      else if (k && (k.t === 'num' || k.t === 'func' || k.t === 'lp' || k.t === 'var' || k.t === 'imag' || (k.t === 'bar' && !stopBar))) { node = { t: '*', a: node, b: unary() } }
      else return node
    }
  }

  function unary() {
    const k = peek()
    if (k && k.t === 'op' && (k.v === '-' || k.v === '+')) {
      p++
      const v = nested(() => unary())
      return k.v === '-' ? { t: 'neg', a: v } : v
    }
    return power()
  }

  function power() {
    const base = postfix()
    const k = peek()
    if (k && k.t === 'op' && (k.v === '^' || /^↑+$/.test(k.v))) {
      p++
      // 右结合：2^3^2 = 512，2↑3↑2 = 2↑(3↑2) = 512
      const rhs = nested(() => unary())
      return k.v === '^' ? { t: '^', a: base, b: rhs } : { t: 'arrow', v: k.v, a: base, b: rhs }
    }
    return base
  }

  function postfix() {
    let node = primary()
    for (;;) {
      const k = peek()
      if (k && k.t === 'suf') {
        p++
        if (k.v === '!') node = { t: 'fact', a: node }
        else if (k.v === '°') node = { t: '*', a: node, b: { t: 'num', v: PI / 180 } }
        else node = { t: '^', a: node, b: { t: 'num', v: parseInt(k.v, 10) } }
        continue
      }
      return node
    }
  }

  function primary() {
    const k = peek()
    if (!k) throw new Error('算式不完整')
    if (k.t === 'num') { p++; return k }
    if (k.t === 'var') { p++; return k }
    if (k.t === 'imag') { p++; return k }
    if (k.t === 'func') {
      p++
      const args = []
      if (eat('lp')) {
        args.push(nested(() => expr()))
        while (eat('comma')) args.push(nested(() => expr()))
        if (!eat('rp')) throw new Error('括号不匹配')
      } else {
        // √9、sin30 这类省略括号的写法：只吃一个一元表达式
        args.push(nested(() => unary()))
      }
      return { t: 'call', v: k.v, args: args }
    }
    if (k.t === 'lp') {
      p++
      const node = nested(() => expr())
      if (!eat('rp')) throw new Error('括号不匹配')
      return node
    }
    if (k.t === 'bar') {
      // |x| → abs(x)；内部表达式遇到配对的 | 就停（stopBar）
      p++
      const node = nested(() => expr(true))
      if (!eat('bar')) throw new Error('绝对值缺少收尾的 |')
      return { t: 'call', v: 'abs', args: [node] }
    }
    throw new Error('算式不完整')
  }

  const node = expr()
  if (p < tokens.length) {
    const k = tokens[p]
    throw new Error(k.t === 'rp' ? '多余的右括号' : '算式有误：' + (k.v === undefined ? '符号' : k.v))
  }
  // 指数塔只允许 2 层：2^3^2 可以，2^3^2^2 / 2^(3^(4^5)) 拒绝。
  // 只数右侧链；左边 (2^3)^2 不是塔，正常算。
  function rightTower(n) {
    let d = 0
    while (n && n.t === '^') { d++; n = n.b }
    return d
  }
  function checkTower(n) {
    if (!n || typeof n !== 'object') return
    if (n.t === '^' && rightTower(n) > LIMITS.towerDepth) throw new Error('指数塔最多 ' + LIMITS.towerDepth + ' 层')
    checkTower(n.a)
    checkTower(n.b)
    if (n.args) for (let i = 0; i < n.args.length; i++) checkTower(n.args[i])
  }
  checkTower(node)
  return node
}

/* ------------------------------------------------------------------ */
/* 求值                                                               */
/* ------------------------------------------------------------------ */

const FACT_MAX = LIMITS.factMax

/**
 * 十进制大整数：只用来"乘以一个小整数"，所以用数组存每一位（低位在前）就够。
 * 为什么不用 BigInt：手环的 jsc 字节码编译器不认 BigInt 字面量（1n），
 * 一用就 build error，改用数组乘法反而哪儿都能跑。
 */
function mulSmall(digits, m) {
  let carry = 0
  for (let i = 0; i < digits.length; i++) {
    const v = digits[i] * m + carry
    digits[i] = v % 10
    carry = (v - digits[i]) / 10
  }
  while (carry > 0) {
    digits.push(carry % 10)
    carry = Math.floor(carry / 10)
  }
}

/** n! 的精确十进制串 */
function factDigits(n) {
  const d = [1]
  for (let i = 2; i <= n; i++) mulSmall(d, i)
  let s = ''
  for (let i = d.length - 1; i >= 0; i--) s += d[i]
  return s
}

/** 阶乘分步任务：给计算器页做真实进度条用（不参与普通求值） */
export function createFactorialJob(n) {
  const top = Math.max(0, Math.floor(n))
  const d = [1]
  let i = 2
  const total = Math.max(1, top - 1)
  return {
    step(k) {
      let c = 0
      while (i <= top && c < k) { mulSmall(d, i); i++; c++ }
    },
    done() { return i > top },
    progress() { return Math.min(1, (i - 2) / total) },
    digits() { return factDigitsString(d) },
  }
}

function factDigitsString(d) {
  let s = ''
  for (let i = d.length - 1; i >= 0; i--) s += d[i]
  return s
}

/** 把精确串压成一个能参与普通运算的近似数（前 15 位 + 指数） */
function approxOf(s) {
  return Number(s.slice(0, 15)) * Math.pow(10, s.length - 15)
}

/**
 * 超大结果载体：n! 超出 Number 的范围（170! ≈ 7.26e306）后数字类型放不下（变 Infinity）。
 * 用对象把精确串带出去交给显示层；参与四则运算时明确报错，
 * 而不是悄悄变成 ∞ 或 NaN（那是最难查的错）。
 */
function bigResult(digitStr) {
  const s = String(digitStr)
  const sig = s.length <= 13 ? s : (s.slice(0, 1) + '.' + s.slice(1, 13))
  return {
    __big: true,
    digits: s.length,
    exact: s,
    sci: s.length <= 15 ? s : (sig + 'e' + (s.length - 1))
  }
}
function isBig(v) { return !!(v && v.__big) }
function noBig(v, what) {
  if (isBig(v)) throw new Error(what + '碰到超大阶乘，请先单独算出 n!')
  return v
}

function factorial(n) {
  if (n < 0 || Math.round(n) !== n) throw new Error('阶乘只支持非负整数')
  if (n > LIMITS.iterMax) throw new Error('太大，拒绝计算')
  if (n > FACT_MAX) throw new Error('阶乘最大支持 ' + FACT_MAX)
  if (n <= 18) {                       // 18! 还在 2^53 以内，直接乘就是精确的
    let r = 1
    for (let i = 2; i <= n; i++) r *= i
    return r
  }
  const s = factDigits(n)
  if (s.length <= 309) return approxOf(s)   // 170! 以内 Number 还能近似表示
  return bigResult(s)                        // 再大：走大数通道
}

/**
 * 幂结果护栏：实数/虚部任一项超 1e308 或非有限 → "数值过大"。
 * 统一走这里，^、↑、↑↑、↑↑↑ 用的是同一套上限。
 */
function powValue(a, b) {
  const v = cPow(a, b)
  const c = toC(v)
  if (!isFinite(c.re) || !isFinite(c.im) || Math.abs(c.re) > LIMITS.numMax || Math.abs(c.im) > LIMITS.numMax) {
    throw new Error('数值过大')
  }
  return v
}

/** n 次根：n 为非零整数；奇次根允许负数，偶次根负数 → 复数（主值） */
function nthRoot(x, n) {
  if (isC(n)) throw new Error('根的次数必须是整数')
  if (Math.round(n) !== n || n === 0) throw new Error('根的次数必须是非零整数')
  const k = Math.abs(n)
  let r
  if (!isC(x) && x < 0 && k % 2 === 1) {
    r = -Math.pow(-x, 1 / k)
  } else if (!isC(x) && x < 0) {
    r = cPow(x, 1 / k)              // √-4 → 2i，四次根负数同理走复数
  } else {
    r = powValue(x, 1 / k)
  }
  if (n < 0) {
    if (isC(r)) {
      const d = r.re * r.re + r.im * r.im
      if (d === 0) throw new Error('除以零')
      r = norm({ re: r.re / d, im: -r.im / d })
    } else {
      if (r === 0) throw new Error('除以零')
      r = 1 / r
    }
  }
  return r
}

/** 大整数：base 1e7 limbs，用于 ↑↑ 的精确展开 */
const BIG_DIGITS = 60000
const BIG_EXP_MAX = 500000

function limbsOf(n) {
  n = Math.abs(Math.floor(n))
  const a = []
  while (n > 0) { a.push(n % 10000000); n = Math.floor(n / 10000000) }
  return a.length ? a : [0]
}
function mulLimbs(a, b) {
  const r = new Array(a.length + b.length).fill(0)
  for (let i = 0; i < a.length; i++) {
    let carry = 0
    for (let j = 0; j < b.length; j++) {
      const v = r[i + j] + a[i] * b[j] + carry
      r[i + j] = v % 10000000
      carry = Math.floor(v / 10000000)
    }
    let k = i + b.length
    while (carry) { const v = r[k] + carry; r[k] = v % 10000000; carry = Math.floor(v / 10000000); k++ }
  }
  while (r.length > 1 && r[r.length - 1] === 0) r.pop()
  return r
}
function limbsToStr(a) {
  let s = String(a[a.length - 1])
  for (let i = a.length - 2; i >= 0; i--) s += ('0000000' + a[i]).slice(-7)
  return s
}
function bigPowExact(base, exp) {
  if (exp === 0) return 1
  if (base === 0) return 0
  if (base === 1) return 1
  if (!(exp > 0) || Math.floor(exp) !== exp) return null
  const digits = Math.floor(exp * Math.log10(base)) + 1
  if (digits > BIG_DIGITS || exp > BIG_EXP_MAX) return null
  let result = [1]
  let b = limbsOf(base)
  let e = exp
  while (e > 0) {
    if (e & 1) result = mulLimbs(result, b)
    e = Math.floor(e / 2)
    if (e) b = mulLimbs(b, b)
  }
  const str = limbsToStr(result)
  return str.length <= 15 ? Number(str) : bigResult(str)
}
function towerResult(label) {
  return { __big: true, tower: true, expr: label, exact: label, sci: '', digits: 0 }
}
function arrowLabel(a, b, k) {
  return String(a) + '↑'.repeat(k) + String(b)
}
/** 整数 a 的 k 级高纳德箭头；算不尽时返回箭头表示 */
function hyperInt(a, b, k) {
  if (b === 0) return 1
  if (b === 1) return a
  if (a === 0) return k === 1 ? 0 : (b === 1 ? 0 : 0)
  if (a === 1) return 1
  if (b > 1000) return towerResult(arrowLabel(a, b, k))
  if (k === 1) return bigPowExact(a, b) || towerResult(arrowLabel(a, b, 1))
  if (b > 100000) return towerResult(arrowLabel(a, b, k))
  const inner = hyperInt(a, b - 1, k)
  if (inner && inner.__big) return towerResult(arrowLabel(a, b, k))
  if (typeof inner !== 'number' || !isFinite(inner) || inner < 0) return towerResult(arrowLabel(a, b, k))
  if (k === 2) {
    const v = bigPowExact(a, inner)
    return v === null ? towerResult(arrowLabel(a, b, k)) : v
  }
  return hyperInt(a, inner, k - 1)
}

/**
 * 箭头运算：↑ = 幂；↑↑ = tetration；↑↑↑ = pentation；支持 1~6 个箭头。
 * 能精确展开时返回大整数（最多 3 万位），否则保留 a↑↑b 的箭头表示。
 */
function arrowValue(op, a, b) {
  if (op === '↑') return powValue(a, b)
  const bc = toC(b)
  if (Math.abs(bc.im) > 1e-12 || Math.round(bc.re) !== bc.re) {
    throw new Error(op + ' 的阶数必须是整数')
  }
  const n = bc.re
  if (n < 0) throw new Error(op + ' 的阶数不能为负')
  const ac = toC(a)
  const k = op.length
  if (!isC(a) && Math.abs(ac.im) < 1e-12 && Math.round(ac.re) === ac.re && ac.re >= 0) {
    const out = hyperInt(ac.re, n, k)
    return (out && out.__big && out.tower) ? towerResult(arrowLabel(ac.re, n, k)) : out
  }
  // 非整数底数：只保留小范围数值迭代
  if (k > 2) throw new Error(op + ' 需要整数底数')
  if (n > LIMITS.tetraB) throw new Error('数值过大')
  let r = 1
  for (let i = 0; i < n; i++) r = powValue(a, r)
  return r
}

function callFn(name, args, env) {
  const deg = !!env.deg
  const toRad = (v) => (deg ? v * PI / 180 : v)
  const fromRad = (v) => (deg ? v * 180 / PI : v)
  const need1 = () => {
    if (args.length !== 1) throw new Error(name + ' 需要 1 个参数')
    return args[0]
  }
  const real1 = (v) => {
    if (isC(v)) throw new Error(name + ' 暂不支持复数')
    return v
  }
  switch (name) {
    case 'sin': return Math.sin(toRad(real1(need1())))
    case 'cos': return Math.cos(toRad(real1(need1())))
    case 'tan': return Math.tan(toRad(real1(need1())))
    case 'asin': {
      const v = real1(need1())
      if (v < -1 || v > 1) throw new Error('asin 参数需在 -1~1 之间')
      return fromRad(Math.asin(v))
    }
    case 'acos': {
      const v = real1(need1())
      if (v < -1 || v > 1) throw new Error('acos 参数需在 -1~1 之间')
      return fromRad(Math.acos(v))
    }
    case 'atan': return fromRad(Math.atan(real1(need1())))
    case 'sinh': return Math.sinh(real1(need1()))
    case 'cosh': return Math.cosh(real1(need1()))
    case 'tanh': return Math.tanh(real1(need1()))
    // 负数开平方给出虚数结果（√-4 = 2i）
    case 'sqrt': return cSqrt(need1())
    case 'root': {
      if (args.length !== 2) throw new Error('root 需要 2 个参数：root(x, n)')
      return nthRoot(args[0], args[1])
    }
    case 'abs': return cAbs(need1())
    case 'ln': return cLn(need1())
    case 'log': return cDiv(cLn(need1()), Math.LN10)
    case 'log2': return cDiv(cLn(need1()), Math.LN2)
    case 'exp': return cExp(need1())
    case 'floor': return Math.floor(real1(need1()))
    case 'ceil': return Math.ceil(real1(need1()))
    case 'round': return Math.round(real1(need1()))
    case 'max': return Math.max.apply(null, args.map(real1))
    case 'min': return Math.min.apply(null, args.map(real1))
  }
  throw new Error('不认识的函数：' + name)
}

/** 对语法树求值。env 可含 { x, deg } */
export function evalAst(node, env) {
  return evalNode(node, env || {}, 0)
}

/** 递归求值；d 是当前深度，超过上限就报错而不是把栈打穿 */
function evalNode(node, e, d) {
  if (d > LIMITS.evalDepth) throw new Error('算式嵌套太深（最多 ' + LIMITS.evalDepth + ' 层）')
  const dd = d + 1
  switch (node.t) {
    case 'num': return node.v
    case 'imag': return { re: 0, im: 1 }
    case 'var':
      if (typeof e.x !== 'number') throw new Error('算式里有未知的 x')
      return e.x
    case 'neg': return cNeg(noBig(evalNode(node.a, e, dd), '取负'))
    case '+': return cAdd(noBig(evalNode(node.a, e, dd), '加法'), noBig(evalNode(node.b, e, dd), '加法'))
    case '-': return cSub(noBig(evalNode(node.a, e, dd), '减法'), noBig(evalNode(node.b, e, dd), '减法'))
    case '*': return cMul(noBig(evalNode(node.a, e, dd), '乘法'), noBig(evalNode(node.b, e, dd), '乘法'))
    case '/': {
      const d0 = noBig(evalNode(node.b, e, dd), '除法')
      if (cAbs(d0) === 0) throw new Error('除以零')
      return cDiv(noBig(evalNode(node.a, e, dd), '除法'), d0)
    }
    case '%': {
      const a = noBig(evalNode(node.a, e, dd), '取余')
      const d0 = noBig(evalNode(node.b, e, dd), '取余')
      if (isC(d0) || isC(a)) throw new Error('取余不支持复数')
      if (d0 === 0) throw new Error('除以零')
      return a % d0
    }
    case '^': {
      const a = noBig(evalNode(node.a, e, dd), '乘方')
      const b = noBig(evalNode(node.b, e, dd), '乘方')
      return powValue(a, b)
    }
    case 'arrow': {
      const a = noBig(evalNode(node.a, e, dd), '箭头运算')
      const b = noBig(evalNode(node.b, e, dd), '箭头运算')
      return arrowValue(node.v, a, b)
    }
    case 'fact': {
      const v = noBig(evalNode(node.a, e, dd), '阶乘')
      if (isC(v)) throw new Error('阶乘不支持复数')
      return factorial(v)
    }
    case 'call': {
      const args = []
      for (let i = 0; i < node.args.length; i++) args.push(noBig(evalNode(node.args[i], e, dd), node.v))
      return callFn(node.v, args, e)
    }
  }
  throw new Error('算式有误')
}

/* ------------------------------------------------------------------ */
/* 对外接口                                                            */
/* ------------------------------------------------------------------ */

/** 只解析不求值：返回 { ok, ast, err }（求解器要把等号两边分别展成多项式） */
export function parseExpr(src) {
  try {
    const t = String(src == null ? '' : src).trim()
    if (!t) return { ok: false, err: '这里是空的' }
    return { ok: true, ast: parse(tokenize(t)) }
  } catch (err) {
    return { ok: false, err: (err && err.message) ? err.message : '算式有误' }
  }
}

/** 解析并求值。返回 { ok, value, err } */
export function evaluate(src, opts) {
  const o = opts || {}
  try {
    if (!String(src).trim()) return { ok: false, err: '还没有输入算式' }
    const ast = parse(tokenize(src))
    const v = evalAst(ast, { deg: o.deg })
    // 超大阶乘（171! 起）：数字类型放不下，直接把精确串带出去交给显示层
    if (isBig(v)) {
      return {
        ok: true, huge: true,
        value: undefined, re: NaN, im: 0, complex: false,
        digits: v.digits, exact: v.exact, sci: v.sci,
        tower: !!v.tower, expr: v.expr || '',
        ast: ast
      }
    }
    const c = toC(v)
    if (isNaN(c.re) || isNaN(c.im)) return { ok: false, err: '算不出结果' }
    if (!isFinite(c.re) || !isFinite(c.im)) return { ok: false, err: '结果超出范围' }
    const rat = evalRational(ast)
    return {
      ok: true,
      value: c.re,                 // 兼容旧调用：实数结果
      re: c.re,
      im: c.im,
      complex: isC(v),
      exact: rat ? formatRational(rat) : null,
      ast: ast
    }
  } catch (err) {
    return { ok: false, err: (err && err.message) ? err.message : '算式有误' }
  }
}

/**
 * 编译成 f(x)：绘图页与"解任意方程"都用它，避免每个点都重新分词解析。
 * 返回 { ok, f, err }；f(x) 出错时返回 NaN（绘图时跳过该点）。
 */
export function compile(src, opts) {
  const o = opts || {}
  let ast
  try {
    ast = parse(tokenize(src))
  } catch (err) {
    return { ok: false, err: (err && err.message) ? err.message : '算式有误' }
  }
  return {
    ok: true,
    ast: ast,
    f: function (x) {
      try {
        const v = evalAst(ast, { x: x, deg: o.deg })
        return (!isC(v) && isFinite(v)) ? v : NaN
      } catch (err) {
        return NaN
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 结果显示                                                           */
/* ------------------------------------------------------------------ */

/** 普通显示：整数原样，过长用科学计数法 */
export function formatNumber(v) {
  if (!isFinite(v)) return '∞'
  if (Math.abs(v - Math.round(v)) < 1e-12 && Math.abs(v) < 1e15) return String(Math.round(v))
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) return v.toExponential(4)
  let s = String(parseFloat(v.toPrecision(10)))
  if (s.length > 14) s = v.toExponential(4)
  return s === '-0' ? '0' : s
}

function gcd(a, b) {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { const t = b; b = a % b; a = t }
  return a || 1
}

/**
 * 精确形式：π 的倍数、√n、a√b/c、最简分数
 * 思路参考了开源项目 Open_Modular_Boardgame_Companion（MIT, MinimumBubble11）的
 * _toExactForm / _toFraction，这里重写为独立函数并补了 π 的有理倍数。
 */
export function formatExact(v) {
  if (!isFinite(v)) return null
  const eps = 1e-9
  const neg = v < 0
  const abs = Math.abs(v)
  const sign = neg ? '-' : ''
  if (abs < eps) return '0'
  if (Math.abs(abs - Math.round(abs)) < 1e-12) return sign + String(Math.round(abs))
  // π 的有理倍数：v = (a/b)·π
  const overPi = abs / PI
  const frac = rational(overPi, 60, 1e-10)
  if (frac && Math.abs(frac[0] / frac[1] - overPi) < 1e-10) {
    const a = frac[0], b = frac[1]
    const num = a === 1 ? 'π' : a + 'π'
    return sign + (b === 1 ? num : num + '/' + b)
  }
  // a√b 与 (a√b)/c
  for (let n = 2; n <= 99; n++) {
    const r = Math.sqrt(n)
    if (Math.abs(Math.round(r) - r) < 1e-12) continue          // 完全平方数跳过
    const ratio = abs / r
    const q = rational(ratio, 24, 1e-10)
    if (q && Math.abs((r * q[0]) / q[1] - abs) < 1e-10) {
      const a = q[0], b = q[1]
      const head = a === 1 ? '√' + n : a + '√' + n
      return sign + (b === 1 ? head : head + '/' + b)
    }
  }
  // 最简分数
  const f = rational(abs, 1000, 1e-6)
  if (f && f[1] !== 1) return sign + f[0] + '/' + f[1]
  return null
}

/** 把 val 近似成最简分数 a/b（分母不超过 maxDen，误差小于 tol） */
function rational(val, maxDen, tol) {
  if (!isFinite(val)) return null
  let bestA = 0, bestB = 1, best = Math.abs(val)
  for (let b = 1; b <= maxDen; b++) {
    const a = Math.round(val * b)
    const err = Math.abs(val - a / b)
    if (err < best) { best = err; bestA = a; bestB = b }
    if (err < 1e-13) break
  }
  if (best > tol) return null
  const g = gcd(bestA, bestB)
  return [bestA / g, bestB / g]
}

/** 计算器显示：默认普通形式，开启精确模式时优先精确形式 */
export function display(v, exact) {
  if (exact) {
    const x = formatExact(v)
    if (x !== null) return x
  }
  return formatNumber(v)
}

/**
 * 把本工程产生的精确串还原成数值（测试"精确行与小数行一致"用）：
 *   3、-3/4、√2、2√2、√3/2、-√3/2、π、2π、π/2、-2π/3
 * 解析不了（超大阶乘、复数等）返回 null。
 */
export function exactToNumber(s) {
  if (s === null || s === undefined) return null
  let t = String(s).trim().replace(/−/g, '-').replace(/\s+/g, '')
  if (!t || t.indexOf('i') >= 0) return null
  let sign = 1
  if (t.charAt(0) === '-') { sign = -1; t = t.slice(1) } else if (t.charAt(0) === '+') { t = t.slice(1) }
  let num = t
  let den = 1
  const slash = t.indexOf('/')
  if (slash >= 0) {
    num = t.slice(0, slash)
    den = parseFloat(t.slice(slash + 1))
    if (!isFinite(den) || den === 0) return null
  }
  let val
  const pi = num.indexOf('π')
  const rt = num.indexOf('√')
  if (pi >= 0) {
    const a = pi === 0 ? 1 : parseFloat(num.slice(0, pi))
    if (!isFinite(a)) return null
    val = a * PI
  } else if (rt >= 0) {
    const a = rt === 0 ? 1 : parseFloat(num.slice(0, rt))
    const b = parseFloat(num.slice(rt + 1))
    if (!isFinite(a) || !isFinite(b)) return null
    val = a * Math.sqrt(b)
  } else {
    val = parseFloat(num)
    if (!isFinite(val)) return null
  }
  return sign * val / den
}


/* ------------------------------------------------------------------ */
/* 有理数精确计算：整条算式都是有理数、且只用 + − × ÷ 与整数次幂时，   */
/* 给出精确分数（1/3 + 1/6 = 1/2，而不是 0.5 的近似）。用数字的原始文本  */
/* 转分数，所以 0.1 + 0.2 也能得到 3/10。                              */
/* ------------------------------------------------------------------ */

const RAT_LIMIT = 1e15

function gcdInt(a, b) {
  a = Math.abs(a); b = Math.abs(b)
  while (b) { const t = b; b = a % b; a = t }
  return a || 1
}

function rMake(n, d) {
  if (!isFinite(n) || !isFinite(d) || d === 0) return null
  if (Math.abs(n) > RAT_LIMIT || Math.abs(d) > RAT_LIMIT) return null
  if (d < 0) { n = -n; d = -d }
  const g = gcdInt(n, d)
  return { n: n / g, d: d / g }
}

/** "0.25" → 1/4；"12" → 12；"1e3" → 1000 */
function ratFromText(raw) {
  if (raw === undefined) return null
  const t = String(raw)
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(t)
  if (!m) return null
  const int = m[1] || '0'
  const frac = m[2] || ''
  const exp = m[3] ? parseInt(m[3], 10) : 0
  const digits = int + frac
  if (!digits.length) return null
  let n = parseInt(digits, 10)
  let d = Math.pow(10, frac.length)
  if (exp > 0) n *= Math.pow(10, exp)
  else if (exp < 0) d *= Math.pow(10, -exp)
  return rMake(n, d)
}

function evalRational(node) {
  if (!node) return null
  switch (node.t) {
    case 'num': return ratFromText(node.raw)
    case 'imag': return null
    case 'var': return null
    case 'neg': {
      const a = evalRational(node.a)
      return a ? rMake(-a.n, a.d) : null
    }
    case '+': case '-': case '*': case '/': {
      const a = evalRational(node.a)
      const b = evalRational(node.b)
      if (!a || !b) return null
      // 大阶乘（带精确串）不参与精确分式运算：老实退回小数显示，别硬凑一个错分数
      if (a.big || b.big) return null
      if (node.t === '+') return rMake(a.n * b.d + b.n * a.d, a.d * b.d)
      if (node.t === '-') return rMake(a.n * b.d - b.n * a.d, a.d * b.d)
      if (node.t === '*') return rMake(a.n * b.n, a.d * b.d)
      if (b.n === 0) return null
      return rMake(a.n * b.d, a.d * b.n)
    }
    case '^': {
      const a = evalRational(node.a)
      const b = evalRational(node.b)
      if (!a || !b || b.d !== 1) return null
      const k = b.n
      if (k > 20 || k < -20) return null
      if (k === 0) return rMake(1, 1)
      let n = 1, d = 1
      for (let i = 0; i < Math.abs(k); i++) { n *= a.n; d *= a.d }
      return k > 0 ? rMake(n, d) : rMake(d, n)
    }
    case 'fact': {
      const a = evalRational(node.a)
      if (!a || a.d !== 1 || a.n < 0 || a.n > FACT_MAX) return null
      // 19! 以上 Number 存不下全部数字：把精确串挂在 r.big 上，精确模式直接显示它。
      // 不走 rMake（它有 RAT_LIMIT 范围检查，大数会被判成 null）
      const s = factDigits(a.n)
      return { n: s.length <= 15 ? Number(s) : 0, d: 1, big: s }
    }
    default: return null
  }
}

export function formatRational(r) {
  if (!r) return null
  if (r.big) return r.big          // 阶乘：直接给精确整数串（Number 存不下时会失真）
  return r.d === 1 ? String(r.n) : (r.n + '/' + r.d)
}

/** 精确形式的字符串（不含符号），供 display 复用 */
function exactPart(v, exactMode) {
  if (!exactMode) return null
  return formatExact(v)
}

/** 结果格式化：支持复数与精确模式（优先用有理数精确值） */
export function displayResult(res, exactMode, full) {
  if (!res) return ''
  if (!res.ok) return res.err || '计算错误'
  // 超大阶乘：位数不多（≤40 位）时给完整整数，否则给科学计数法，精确模式补上位数
  if (res.huge) {
    if (res.tower) return exactMode ? res.expr : (res.expr + '（无法完整展开）')
    if (exactMode) return full ? String(res.exact) : (res.digits <= 40 ? res.exact : (res.sci + '（' + res.digits + ' 位）'))
    return res.sci
  }
  const one = (x) => {
    if (exactMode) {
      const e = formatExact(x)
      if (e !== null) return e
    }
    return formatNumber(x)
  }
  if (res.complex) return fmtComplex({ re: res.re, im: res.im }, one)
  if (exactMode && res.exact) {
    const s = String(res.exact)
    if (full) return s
    // 默认给首尾 + 位数，避免 100! 这类长整数把屏幕撑爆。
    if (s.length > 48) return s.slice(0, 18) + '…' + s.slice(-8) + '（' + s.length + ' 位）'
    return s
  }
  return one(res.re)
}
