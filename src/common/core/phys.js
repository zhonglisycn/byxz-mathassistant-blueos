/**
 * 物理内核：常用公式计算器。
 *
 * 每个公式只做"代入求值"，不推导、不联立；输入输出都带单位。
 * 常量：g = 9.8 m/s²，R = 8.314 J/(mol·K)，c = 3.0×10⁸ m/s。
 * 结果为有限数才返回；除零、非数字都给中文错误，页面直接显示。
 */

export const PHYS_CONST = {
  g: 9.8,
  R: 8.314,
  c: 3.0e8,
  NA: 6.022e23,
}

/** 结果格式化：普通数最多 6 位小数，过大/过小用科学计数法 */
export function fmtPhys(v) {
  if (!isFinite(v)) return '-'
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e6 || a < 1e-4)) {
    let s = v.toExponential(4)
    s = s.replace(/\.?0+e/, 'e').replace('e+', 'e')
    return s
  }
  let s = Number(v.toFixed(6)).toString()
  if (s === '-0') s = '0'
  return s
}

function f(k, label, unit, def) {
  return { k: k, label: label, unit: unit, def: def }
}

export const formulas = [
  {
    id: 'kin',
    name: '速度与加速度',
    expr: 'v = v0 + at    s = v0t + at^2/2',
    fields: [f('v0', '初速度 v0', 'm/s', 0), f('a', '加速度 a', 'm/s^2', 9.8), f('t', '时间 t', 's', 2)],
    calc: function (v) {
      const vv = v.v0 + v.a * v.t
      const s = v.v0 * v.t + 0.5 * v.a * v.t * v.t
      return [
        { label: '末速度 v', value: vv, unit: 'm/s' },
        { label: '位移 s', value: s, unit: 'm' },
      ]
    },
  },
  {
    id: 'newton',
    name: '牛顿第二定律',
    expr: 'F = ma',
    fields: [f('m', '质量 m', 'kg', 2), f('a', '加速度 a', 'm/s^2', 9.8)],
    calc: function (v) {
      return [{ label: '合力 F', value: v.m * v.a, unit: 'N' }]
    },
  },
  {
    id: 'work',
    name: '功和功率',
    expr: 'W = Fs    P = W/t',
    fields: [f('F', '力 F', 'N', 10), f('s', '位移 s', 'm', 5), f('t', '时间 t', 's', 2)],
    calc: function (v) {
      const w = v.F * v.s
      return [
        { label: '功 W', value: w, unit: 'J' },
        { label: '功率 P', value: w / v.t, unit: 'W' },
      ]
    },
  },
  {
    id: 'ohm',
    name: '欧姆定律',
    expr: 'U = IR    P = UI',
    fields: [f('I', '电流 I', 'A', 0.5), f('R', '电阻 R', 'Ω', 10)],
    calc: function (v) {
      const u = v.I * v.R
      return [
        { label: '电压 U', value: u, unit: 'V' },
        { label: '功率 P', value: u * v.I, unit: 'W' },
      ]
    },
  },
  {
    id: 'density',
    name: '密度',
    expr: 'rho = m / V',
    fields: [f('m', '质量 m', 'kg', 1), f('V', '体积 V', 'm^3', 0.001)],
    calc: function (v) {
      return [{ label: '密度 rho', value: v.m / v.V, unit: 'kg/m^3' }]
    },
  },
  {
    id: 'pressure',
    name: '压强',
    expr: 'p = F / S',
    fields: [f('F', '压力 F', 'N', 100), f('S', '受力面积 S', 'm^2', 0.02)],
    calc: function (v) {
      return [{ label: '压强 p', value: v.F / v.S, unit: 'Pa' }]
    },
  },
  {
    id: 'liquid',
    name: '液体压强',
    expr: 'p = rho*g*h  (g = 9.8)',
    fields: [f('rho', '密度 rho', 'kg/m^3', 1000), f('h', '深度 h', 'm', 2)],
    calc: function (v) {
      return [{ label: '压强 p', value: v.rho * PHYS_CONST.g * v.h, unit: 'Pa' }]
    },
  },
  {
    id: 'gas',
    name: '理想气体',
    expr: 'pV = nRT  (R = 8.314)',
    fields: [f('n', '物质的量 n', 'mol', 1), f('T', '温度 T', 'K', 300), f('V', '体积 V', 'm^3', 0.024)],
    calc: function (v) {
      return [{ label: '压强 p', value: (v.n * PHYS_CONST.R * v.T) / v.V, unit: 'Pa' }]
    },
  },
  {
    id: 'wave',
    name: '波速',
    expr: 'v = f*lambda',
    fields: [f('f', '频率 f', 'Hz', 440), f('lam', '波长 lambda', 'm', 0.78)],
    calc: function (v) {
      return [{ label: '波速 v', value: v.f * v.lam, unit: 'm/s' }]
    },
  },
  {
    id: 'energy',
    name: '动能与重力势能',
    expr: 'Ek = mv^2/2    Ep = mgh',
    fields: [f('m', '质量 m', 'kg', 1), f('v', '速度 v', 'm/s', 10), f('h', '高度 h', 'm', 2)],
    calc: function (v) {
      return [
        { label: '动能 Ek', value: 0.5 * v.m * v.v * v.v, unit: 'J' },
        { label: '重力势能 Ep', value: v.m * PHYS_CONST.g * v.h, unit: 'J' },
      ]
    },
  },
  {
    id: 'heat',
    name: '热量',
    expr: 'Q = cm*dT',
    fields: [f('c', '比热容 c', 'J/(kg*C)', 4200), f('m', '质量 m', 'kg', 1), f('dT', '温差 dT', 'C', 10)],
    calc: function (v) {
      return [{ label: '热量 Q', value: v.c * v.m * v.dT, unit: 'J' }]
    },
  },
]

export function formulaById(id) {
  for (let i = 0; i < formulas.length; i++) if (formulas[i].id === id) return formulas[i]
  return null
}

/**
 * 代入求值。
 * values 的键是字段 k，值可以是字符串；空/非数字给中文错误。
 */
export function computePhysics(id, values) {
  const def = formulaById(id)
  if (!def) return { ok: false, err: '公式不存在' }
  const vals = {}
  for (let i = 0; i < def.fields.length; i++) {
    const fd = def.fields[i]
    const raw = values ? values[fd.k] : undefined
    if (raw === '' || raw === null || raw === undefined) return { ok: false, err: '请输入' + fd.label }
    const n = Number(raw)
    if (!isFinite(n)) return { ok: false, err: fd.label + ' 不是有效数字' }
    vals[fd.k] = n
  }
  let rows
  try {
    rows = def.calc(vals)
  } catch (e) {
    return { ok: false, err: '计算失败' }
  }
  if (!rows || !rows.length) return { ok: false, err: '没有结果' }
  for (let i = 0; i < rows.length; i++) {
    if (!isFinite(rows[i].value)) return { ok: false, err: '除数不能为 0' }
  }
  return { ok: true, rows: rows }
}
