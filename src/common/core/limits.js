/**
 * 输入 / 计算上限（页面与内核共用一份，测试也读这里）
 *
 * 为什么集中定义：键盘页、方程页、图像页、解析器各写一个数字，
 * 改上限时必漏一个；而且测试要能直接断言"边界到底是多少"。
 *
 * 注意"内部不截断、显示才截断"：
 *   - 输入长度限制只挡键盘继续追加（exprLen / eqLen / coefLen）；
 *   - 表达式内部保持完整，只在显示到小屏时用 clipCursor / clipText；
 *   - 内核另有一组防爆护栏（token / 嵌套 / 数值），见 calc.js。
 */

export const LIMITS = {
  // 输入长度（字符）
  calcExpr: 2048,     // 计算器表达式
  freeEq: 1024,        // 方程页"自由式子"
  coef: 256,          // 方程页系数（单个输入）
  plotExpr: 1024,      // 图像页自定义表达式

  // 显示窗口（字符，超出只影响显示）
  calcShow: 240,
  eqShow: 240,
  plotShow: 240,

  // 内核护栏
  tokens: 16384,       // 分词后的 token 数
  depth: 128,          // 括号 / 函数 / 幂的嵌套深度
  evalDepth: 4096,    // 语法树求值递归深度（防超长链把栈打穿）
  numMax: 1e308,      // 单个实数结果上限
  iterMax: 5e6,       // 阶乘 / 箭头这类迭代运算的次数上限
  tetraB: 10,          // a↑↑b 的 b 上限
  factMax: 5000,      // 阶乘上限
  towerDepth: 10       // 指数塔最多几层（^ 右结合链）
}

/** 某类输入还能不能追加 addLen 个字符 */
export function fits(kind, currentLen, addLen) {
  const max = LIMITS[kind]
  if (typeof max !== 'number') return true
  return (currentLen | 0) + (addLen | 0) <= max
}

/** 纯文本截断：超过 max 保留尾部并加省略号（错误/结果提示用） */
export function clipText(s, max) {
  const t = String(s == null ? '' : s)
  const m = max || LIMITS.calcShow
  if (t.length <= m) return t
  return '…' + t.slice(t.length - m + 1)
}

/**
 * 带光标的表达式截断：窗口跟着光标走，光标永远可见。
 * 返回的是"显示串"，内部 expr 完全不改。
 */
export function clipCursor(text, cur, max) {
  const s = String(text == null ? '' : text)
  let c = Math.max(0, Math.min(s.length, cur | 0))
  const m = max || LIMITS.calcShow
  if (s.length + 1 <= m) return s.slice(0, c) + '|' + s.slice(c)
  const half = Math.floor((m - 1) / 2)
  let start = Math.max(0, c - half)
  let end = Math.min(s.length, start + m - 1)
  start = Math.max(0, end - (m - 1))
  const head = start > 0 ? '…' : ''
  const tail = end < s.length ? '…' : ''
  const before = s.slice(start, c)
  const after = s.slice(c, end)
  return head + before + '|' + after + tail
}
