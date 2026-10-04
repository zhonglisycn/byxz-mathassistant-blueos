/**
 * 符号求导：把表达式语法树变成导函数的语法树，并做轻度化简（合并常量、去掉 ×1 / +0）。
 * 显示用 astText 转成 "2x"、"cos(x)" 这样能读的写法，绘图用 compileAst 复用求值。
 */
import { evalAst } from './calc.js'

export const D_UNSUPPORTED = '该函数不支持求导'

/** 该子树里是否含 x */
export function hasVar(node) {
  if (!node) return false
  if (node.t === 'var') return true
  if (node.t === 'num' || node.t === 'imag') return false
  if (node.a && hasVar(node.a)) return true
  if (node.b && hasVar(node.b)) return true
  if (node.args) {
    for (let i = 0; i < node.args.length; i++) if (hasVar(node.args[i])) return true
  }
  return false
}

const N = (v) => ({ t: 'num', v: v, raw: String(v) })
const isNum = (n) => n && n.t === 'num'
const numOf = (n) => (isNum(n) ? n.v : null)

/** 轻度化简：只做能一眼看出的合并，避免把式子改得面目全非 */
export function simplify(n) {
  if (!n) return n
  if (n.a && n.t !== 'call') n = { t: n.t, a: simplify(n.a), b: n.b ? simplify(n.b) : undefined }
  if (n.args) n = { t: 'call', v: n.v, args: n.args.map(simplify) }
  const a = n.a, b = n.b
  switch (n.t) {
    case 'neg':
      if (isNum(a)) return N(-a.v)
      if (a && a.t === 'neg') return a.a
      return { t: 'neg', a: a }
    case '+':
      if (isNum(a) && isNum(b)) return N(a.v + b.v)
      if (isNum(a) && a.v === 0) return b
      if (isNum(b) && b.v === 0) return a
      return { t: '+', a: a, b: b }
    case '-':
      if (isNum(a) && isNum(b)) return N(a.v - b.v)
      if (isNum(b) && b.v === 0) return a
      return { t: '-', a: a, b: b }
    case '*':
      if (isNum(a) && isNum(b)) return N(a.v * b.v)
      // 2·(2x) → 4x：常数因子先合并，否则导函数里会拖一堆括号
      if (isNum(a) && b && b.t === '*' && isNum(b.a)) return simplify({ t: '*', a: N(a.v * b.a.v), b: b.b })
      if (isNum(b) && a && a.t === '*' && isNum(a.a)) return simplify({ t: '*', a: N(b.v * a.a.v), b: a.b })
      if ((isNum(a) && a.v === 0) || (isNum(b) && b.v === 0)) return N(0)
      if (isNum(a) && a.v === 1) return b
      if (isNum(b) && b.v === 1) return a
      if (isNum(b) && b.v === -1) return { t: 'neg', a: a }
      if (isNum(a) && a.v === -1) return { t: 'neg', a: b }
      return { t: '*', a: a, b: b }
    case '/':
      if (isNum(a) && isNum(b) && b.v !== 0) return N(a.v / b.v)
      if (isNum(b) && b.v === 1) return a
      if (isNum(a) && a.v === 0) return N(0)
      return { t: '/', a: a, b: b }
    case '^':
      if (isNum(a) && isNum(b)) return N(Math.pow(a.v, b.v))
      if (isNum(b) && b.v === 1) return a
      if (isNum(b) && b.v === 0) return N(1)
      return { t: '^', a: a, b: b }
    default:
      return n
  }
}

/**
 * 求导。只支持 sin cos tan asin acos atan ln log log2 exp sqrt abs 这几种可导函数；
 * 取整/最大最小/取余/阶乘会明确报错，而不是给出错误答案。
 */
export function differentiate(node) {
  if (!node) throw new Error(D_UNSUPPORTED)
  switch (node.t) {
    case 'num': case 'imag': return N(0)
    case 'var': return N(1)
    case 'neg': return simplify({ t: 'neg', a: differentiate(node.a) })
    case '+': return simplify({ t: '+', a: differentiate(node.a), b: differentiate(node.b) })
    case '-': return simplify({ t: '-', a: differentiate(node.a), b: differentiate(node.b) })
    // (uv)' = u'v + uv'
    case '*': return simplify({
      t: '+',
      a: { t: '*', a: differentiate(node.a), b: node.b },
      b: { t: '*', a: node.a, b: differentiate(node.b) }
    })
    // (u/v)' = (u'v − uv') / v²
    case '/': return simplify({
      t: '/',
      a: { t: '-', a: { t: '*', a: differentiate(node.a), b: node.b }, b: { t: '*', a: node.a, b: differentiate(node.b) } },
      b: { t: '^', a: node.b, b: N(2) }
    })
    case '^': {
      const bNum = numOf(node.b)
      // 幂函数：n·u^(n−1)·u'
      if (bNum !== null) {
        return simplify({
          t: '*',
          a: { t: '*', a: N(bNum), b: { t: '^', a: node.a, b: N(bNum - 1) } },
          b: differentiate(node.a)
        })
      }
      const aNum = numOf(node.a)
      // 指数函数：a^u · ln a · u'
      if (aNum !== null) {
        return simplify({
          t: '*',
          a: { t: '*', a: node, b: { t: 'call', v: 'ln', args: [N(aNum)] } },
          b: differentiate(node.b)
        })
      }
      // 一般情形：u^v · (v'·ln u + v·u'/u)
      return simplify({
        t: '*',
        a: node,
        b: {
          t: '+',
          a: { t: '*', a: differentiate(node.b), b: { t: 'call', v: 'ln', args: [node.a] } },
          b: { t: '*', a: node.b, b: { t: '/', a: differentiate(node.a), b: node.a } }
        }
      })
    }
    case 'call': {
      if (!node.args || node.args.length !== 1) throw new Error(D_UNSUPPORTED)
      const u = node.args[0]
      const du = differentiate(u)
      const wrap = (expr) => simplify({ t: '*', a: expr, b: du })
      switch (node.v) {
        case 'sin': return wrap({ t: 'call', v: 'cos', args: [u] })
        case 'cos': return wrap({ t: 'neg', a: { t: 'call', v: 'sin', args: [u] } })
        case 'tan': return wrap({ t: '/', a: N(1), b: { t: '^', a: { t: 'call', v: 'cos', args: [u] }, b: N(2) } })
        case 'ln': return wrap({ t: '/', a: N(1), b: u })
        case 'log': return wrap({ t: '/', a: N(1), b: { t: '*', a: u, b: { t: 'call', v: 'ln', args: [N(10)] } } })
        case 'log2': return wrap({ t: '/', a: N(1), b: { t: '*', a: u, b: { t: 'call', v: 'ln', args: [N(2)] } } })
        case 'exp': return wrap({ t: 'call', v: 'exp', args: [u] })
        case 'sqrt': return wrap({ t: '/', a: N(1), b: { t: '*', a: N(2), b: { t: 'call', v: 'sqrt', args: [u] } } })
        case 'asin': return wrap({ t: '/', a: N(1), b: { t: 'call', v: 'sqrt', args: [{ t: '-', a: N(1), b: { t: '^', a: u, b: N(2) } }] } })
        case 'acos': return wrap({ t: 'neg', a: { t: '/', a: N(1), b: { t: 'call', v: 'sqrt', args: [{ t: '-', a: N(1), b: { t: '^', a: u, b: N(2) } }] } } })
        case 'atan': return wrap({ t: '/', a: N(1), b: { t: '+', a: N(1), b: { t: '^', a: u, b: N(2) } } })
        // |u|' = u/|u| · u'
        case 'abs': return wrap({ t: '/', a: u, b: { t: 'call', v: 'abs', args: [u] } })
        default: throw new Error(D_UNSUPPORTED)
      }
    }
    default: throw new Error(D_UNSUPPORTED)
  }
}

/* ------------------------------------------------------------------ */
/* 显示：转成能读的式子                                                */
/* ------------------------------------------------------------------ */

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4, 'neg': 3 }

function txt(n, parentPrec) {
  if (!n) return ''
  switch (n.t) {
    case 'num': return String(Math.round(n.v * 1e12) / 1e12).replace('-', '−')
    case 'imag': return 'i'
    case 'var': return 'x'
    case 'neg': {
      const s = '−' + txt(n.a, 3)
      return parentPrec > 3 ? '(' + s + ')' : s
    }
    case '+': case '-': {
      const s = txt(n.a, 1) + (n.t === '+' ? ' + ' : ' − ') + txt(n.b, 2)
      return parentPrec > 1 ? '(' + s + ')' : s
    }
    case '*': {
      const s = mulText(n.a, n.b)
      return parentPrec > 2 ? '(' + s + ')' : s
    }
    case '/': {
      // 负号提到分数线前面：−1/x² 而不是 (−1)/x²
      const s = (n.a.t === 'neg' ? '−' + txt(n.a.a, 3) : txt(n.a, 2)) + '/' + txt(n.b, 3)
      return parentPrec > 2 ? '(' + s + ')' : s
    }
    case '^': {
      const be = numOf(n.b)
      const base = txt(n.a, 4)
      if (be === 2) return base + '²'
      if (be === 3) return base + '³'
      if (be === 0.5) return '√' + txt(n.a, 3)
      return base + '^' + txt(n.b, 4)
    }
    case 'call': {
      const name = n.v === 'sqrt' ? '√' : n.v
      return name + '(' + n.args.map(a => txt(a, 0)).join(', ') + ')'
    }
    default: return '?'
  }
}

/** 乘法显示：数字与变量/括号相邻时省略乘号（2x、2(x+1)），两个数字之间用 ×，其余用 · */
function mulText(a, b) {
  const left = txt(a, 2)
  const right = txt(b, 3)
  const leftIsNum = (a.t === 'num')
  const rightIsNum = (b.t === 'num')
  const gluesToRight = (b.t === 'var' || b.t === 'call' || b.t === '^' ||
    (b.t === 'neg' && b.a && (b.a.t === 'var' || b.a.t === 'call')))
  if (leftIsNum && rightIsNum) return left + '×' + right      // 2×3，不能写成 23
  if (leftIsNum && gluesToRight) return left + right           // 2x、2sin(x)
  return left + '·' + right
}

/** 语法树 → 可读字符串 */
export function astText(node) {
  if (!node) return ''
  return txt(node, 0)
}

/** 把（导函数的）语法树编译成 f(x)，供绘图复用 */
export function compileAst(node, opts) {
  const o = opts || {}
  return function (x) {
    try {
      const v = evalAst(node, { x: x, deg: o.deg })
      return (typeof v === 'number' && isFinite(v)) ? v : NaN
    } catch (e) {
      return NaN
    }
  }
}
