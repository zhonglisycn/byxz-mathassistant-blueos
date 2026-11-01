/**
 * 化学内核：化学式解析 + 相对分子质量。
 *
 * 支持：
 *   H2O、Ca(OH)2、Al2(SO4)3、[Cu(NH3)4]SO4、CuSO4·5H2O、2H2O
 * 圆括号/方括号可嵌套；结晶水用 · 或 . 分隔；元素符号大小写敏感。
 * 只做摩尔质量，不解析化学方程式（配平需要另一套算法，别在这里硬塞）。
 */
import { elements } from '../data/elements.js'

export const CAT_SHORT = {
  alkali: '碱金',
  alkaline: '碱土',
  transition: '过渡',
  post: '后过渡',
  metalloid: '准金属',
  nonmetal: '非金属',
  halogen: '卤素',
  noble: '稀有',
  lanthanide: '镧系',
  actinide: '锕系',
  unknown: '其他',
}

export const CAT_NAMES = {
  alkali: '碱金属',
  alkaline: '碱土金属',
  transition: '过渡金属',
  post: '后过渡金属',
  metalloid: '准金属',
  nonmetal: '非金属',
  halogen: '卤素',
  noble: '稀有气体',
  lanthanide: '镧系',
  actinide: '锕系',
  unknown: '其他',
}

const BY_SYMBOL = {}
for (let i = 0; i < elements.length; i++) BY_SYMBOL[elements[i].symbol] = elements[i]

export function elementBySymbol(sym) {
  return BY_SYMBOL[sym] || null
}

/** 原子量格式化：最多 3 位小数，去掉尾零 */
export function fmtMass(n) {
  if (!isFinite(n)) return '-'
  const s = n.toFixed(3)
  return s.replace(/\.?0+$/, '')
}

/** 元素计数转可读串：H2 O1 -> H2 O；太长时调用方自己裁 */
export function countsText(counts, order) {
  const parts = []
  for (let i = 0; i < order.length; i++) {
    const k = order[i]
    const n = counts[k]
    parts.push(k + (n > 1 ? String(n) : ''))
  }
  return parts.join(' ')
}

/**
 * 解析一个不含结晶水点的片段。
 * 返回 { ok, mass, counts, order } 或 { ok:false, err }。
 */
function parsePart(src) {
  let i = 0

  function add(map, ord, sym, n) {
    if (!map[sym]) ord.push(sym)
    map[sym] = (map[sym] || 0) + n
  }

  function readCount() {
    let start = i
    while (i < src.length && src[i] >= '0' && src[i] <= '9') i++
    if (i === start) return 1
    const n = parseInt(src.slice(start, i), 10)
    return n > 0 ? n : 1
  }

  function parseSeq(stopAtParen) {
    let mass = 0
    let any = false
    const seqCounts = {}
    const seqOrder = []
    while (i < src.length) {
      const ch = src[i]
      if (ch === ')' || ch === ']') {
        if (!stopAtParen) return { ok: false, err: '括号不匹配' }
        i++
        if (!any) return { ok: false, err: '括号内不能为空' }
        return { ok: true, mass: mass, counts: seqCounts, order: seqOrder }
      }
      if (ch === '(' || ch === '[') {
        i++
        const sub = parseSeq(true)
        if (!sub.ok) return sub
        const n = readCount()
        mass += sub.mass * n
        for (let k = 0; k < sub.order.length; k++) {
          add(seqCounts, seqOrder, sub.order[k], sub.counts[sub.order[k]] * n)
        }
        any = true
        continue
      }
      if (ch >= 'A' && ch <= 'Z') {
        let sym = ch
        i++
        if (i < src.length && src[i] >= 'a' && src[i] <= 'z') {
          sym += src[i]
          i++
        }
        const el = BY_SYMBOL[sym]
        if (!el) return { ok: false, err: '未知元素：' + sym }
        const n = readCount()
        mass += el.mass * n
        add(seqCounts, seqOrder, sym, n)
        any = true
        continue
      }
      if (ch >= '0' && ch <= '9') return { ok: false, err: '数字前缺少元素或右括号' }
      if (ch === '·') return { ok: false, err: '结晶水点不能出现在括号内' }
      return { ok: false, err: '不支持的字符：' + ch }
    }
    if (stopAtParen) return { ok: false, err: '括号不匹配' }
    if (!any) return { ok: false, err: '化学式为空' }
    return { ok: true, mass: mass, counts: seqCounts, order: seqOrder }
  }

  const seq = parseSeq(false)
  if (!seq.ok) return seq

  return seq
}

/**
 * 解析完整化学式。
 * 结果：{ ok:true, mass, counts, order, text } 或 { ok:false, err }
 */
export function molarMass(input) {
  let src = String(input == null ? '' : input).replace(/\s+/g, '')
  src = src.replace(/[.．]/g, '·')
  if (!src) return { ok: false, err: '请输入化学式' }
  if (src.length > 48) return { ok: false, err: '化学式过长（最多 48 字符）' }

  const parts = src.split('·')
  let total = 0
  const counts = {}
  const order = []

  for (let p = 0; p < parts.length; p++) {
    let part = parts[p]
    if (!part) return { ok: false, err: '结晶水点两侧不能为空' }
    let coef = 1
    const m = /^(\d+)([\s\S]*)$/.exec(part)
    if (m) {
      coef = parseInt(m[1], 10)
      part = m[2]
      if (!part) return { ok: false, err: '系数后面缺少化学式' }
    }
    const r = parsePart(part)
    if (!r.ok) return r
    total += r.mass * coef
    for (let i = 0; i < r.order.length; i++) {
      const k = r.order[i]
      if (!counts[k]) order.push(k)
      counts[k] = (counts[k] || 0) + r.counts[k] * coef
    }
  }

  if (!order.length) return { ok: false, err: '没有识别到元素' }
  return { ok: true, mass: total, counts: counts, order: order, text: src }
}

/** 周期块：s / p / d / f，卡片底色按这个规律走 */
export function blockOf(e) {
  if (!e) return 'unknown'
  if (e.cat === 'lanthanide' || e.cat === 'actinide') return 'f'
  if (e.number === 2 || (e.group >= 1 && e.group <= 2)) return 's'
  if (e.group >= 13) return 'p'
  return 'd'
}

/** 元素周期表用的分类 class 名 */
export function catClass(cat) {
  return 'c-' + (cat || 'unknown')
}
