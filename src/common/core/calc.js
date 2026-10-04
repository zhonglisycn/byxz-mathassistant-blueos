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
 *   后缀      !(阶乘 0~170)  °(角度转弧度)  ²  ³
 *   函数      sin cos tan asin acos atan sinh cosh tanh sqrt √ abs ln log log2 exp floor ceil round max min
 *   括号      ( )        逗号用于多参数函数 max(1,2)
 *   隐式乘法  2π  3(4+5)  (1+2)(3+4)  2sin(30)
 *
 * 角度模式：env.deg 为 true 时 sin/cos/tan 的入参按度、asin/acos/atan 的返回值按度。
 */

import { isC, toC, norm, cAdd, cSub, cMul, cDiv, cNeg, cAbs, cSqrt, cLn, cExp, cPow, fmtComplex } from './complex.js'

const PI = Math.PI
const E = Math.E

/* ------------------------------------------------------------------ */
/* 词法                                                               */
/* ------------------------------------------------------------------ */

const FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
  sinh: 1, cosh: 1, tanh: 1,
  sqrt: 1, abs: 1, ln: 1, log: 1, log2: 1, exp: 1,
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
  let p = 0
  const peek = () => tokens[p]
  const eat = (t, v) => {
    const k = tokens[p]
    if (!k || (t && k.t !== t) || (v && k.v !== v)) return null
    p++
    return k
  }

  function expr() {
    let node = term()
    for (;;) {
      const k = peek()
      if (k && k.t === 'op' && (k.v === '+' || k.v === '-')) { p++; node = { t: k.v, a: node, b: term() } }
      else return node
    }
  }

  function term() {
    let node = unary()
    for (;;) {
      const k = peek()
      if (k && k.t === 'op' && (k.v === '*' || k.v === '/' || k.v === '%')) { p++; node = { t: k.v, a: node, b: unary() } }
      // 隐式乘法：2π、3(4+5)、(1+2)(3+4)、2sin(30)
      else if (k && (k.t === 'num' || k.t === 'func' || k.t === 'lp' || k.t === 'var' || k.t === 'imag')) { node = { t: '*', a: node, b: unary() } }
      else return node
    }
  }

  function unary() {
    const k = peek()
    if (k && k.t === 'op' && (k.v === '-' || k.v === '+')) { p++; const v = unary(); return k.v === '-' ? { t: 'neg', a: v } : v }
    return power()
  }

  function power() {
    const base = postfix()
    const k = peek()
    if (k && k.t === 'op' && k.v === '^') { p++; return { t: '^', a: base, b: unary() } }   // 右结合
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
        args.push(expr())
        while (eat('comma')) args.push(expr())
        if (!eat('rp')) throw new Error('括号不匹配')
      } else {
        // √9、sin30 这类省略括号的写法：只吃一个一元表达式
        args.push(unary())
      }
      return { t: 'call', v: k.v, args: args }
    }
    if (k.t === 'lp') {
      p++
      const node = expr()
      if (!eat('rp')) throw new Error('括号不匹配')
      return node
    }
    throw new Error('算式不完整')
  }

  const node = expr()
  if (p < tokens.length) {
    const k = tokens[p]
    throw new Error(k.t === 'rp' ? '多余的右括号' : '算式有误：' + (k.v === undefined ? '符号' : k.v))
  }
  return node
}

/* ------------------------------------------------------------------ */
/* 求值                                                               */
/* ------------------------------------------------------------------ */

const FACT_MAX = 1000              // 阶乘上限

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
  const e = env || {}
  switch (node.t) {
    case 'num': return node.v
    case 'imag': return { re: 0, im: 1 }
    case 'var':
      if (typeof e.x !== 'number') throw new Error('算式里有未知的 x')
      return e.x
    case 'neg': return cNeg(noBig(evalAst(node.a, e), '取负'))
    case '+': return cAdd(noBig(evalAst(node.a, e), '加法'), noBig(evalAst(node.b, e), '加法'))
    case '-': return cSub(noBig(evalAst(node.a, e), '减法'), noBig(evalAst(node.b, e), '减法'))
    case '*': return cMul(noBig(evalAst(node.a, e), '乘法'), noBig(evalAst(node.b, e), '乘法'))
    case '/': {
      const d = noBig(evalAst(node.b, e), '除法')
      if (cAbs(d) === 0) throw new Error('除以零')
      return cDiv(noBig(evalAst(node.a, e), '除法'), d)
    }
    case '%': {
      const a = noBig(evalAst(node.a, e), '取余')
      const d = noBig(evalAst(node.b, e), '取余')
      if (isC(d) || isC(a)) throw new Error('取余不支持复数')
      if (d === 0) throw new Error('除以零')
      return a % d
    }
    case '^': {
      const a = noBig(evalAst(node.a, e), '乘方')
      const b = noBig(evalAst(node.b, e), '乘方')
      const v = cPow(a, b)
      if (!isC(v) && !isFinite(v)) throw new Error('幂运算结果超出范围')
      return v
    }
    case 'fact': {
      const v = noBig(evalAst(node.a, e), '阶乘')
      if (isC(v)) throw new Error('阶乘不支持复数')
      return factorial(v)
    }
    case 'call': {
      const args = []
      for (let i = 0; i < node.args.length; i++) args.push(noBig(evalAst(node.args[i], e), node.v))
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
export function displayResult(res, exactMode) {
  if (!res) return ''
  if (!res.ok) return res.err || '计算错误'
  // 超大阶乘：位数不多（≤40 位）时给完整整数，否则给科学计数法，精确模式补上位数
  if (res.huge) {
    if (exactMode) return res.digits <= 40 ? res.exact : (res.sci + '（' + res.digits + ' 位）')
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
  if (exactMode && res.exact) return res.exact
  return one(res.re)
}
