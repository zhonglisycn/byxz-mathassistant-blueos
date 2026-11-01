/**
 * 把电路图编辑器的“网格边”翻译成 circuit-lab 求解器输入。
 *
 * 节点是 4×4 网格的 n0…n15；每条边是一个两端元件：
 *   wire -> 直接导线；battery -> 6V；bulb -> 10Ω；switch -> 0Ω 开关；ammeter -> 理想电流表。
 * 非导线元件通过两根短导线接到两端节点，求解器本身只认元件端子和导线。
 */
import { solveCircuit } from './circuit-solver.js'

const TYPES = { battery: 'battery', bulb: 'lamp', switch: 'switch', ammeter: 'ammeter' }

function classify(edges) {
  let hasBattery = false
  const active = []
  for (const e of edges) {
    if (e.type === 'switch' && !e.on) continue
    if (e.type === 'battery') hasBattery = true
    active.push(e)
  }
  if (!hasBattery) return '无电源'
  if (!active.length) return '断路'
  const parent = {}
  const find = x => {
    if (parent[x] === undefined) parent[x] = x
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const join = (a, b) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  const used = {}
  for (const e of active) {
    used[e.a] = true
    used[e.b] = true
    join(e.a, e.b)
  }
  const roots = {}
  const nodes = Object.keys(used)
  for (const n of nodes) roots[find(n)] = true
  const rank = active.length - nodes.length + Object.keys(roots).length
  if (rank >= 2) return '并联'
  if (rank === 1) return '串联'
  return '断路'
}

/** edges: [{a,b,type,on}]，返回求解结果和每条边的读数。 */
export function analyzeCircuit(edges) {
  const wires = []
  const comps = []
  const junctions = []
  for (let i = 0; i < 16; i++) junctions.push({ id: 'n' + i })
  const edgeIds = []
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]
    const id = 'e' + i
    const key = e.a + '-' + e.b
    edgeIds.push(key)
    if (e.type === 'wire') {
      wires.push({ id: 'w' + i + 'a', a: 'n' + e.a + ':0', b: 'n' + e.b + ':0' })
      continue
    }
    const type = TYPES[e.type]
    if (!type) continue
    comps.push({
      id: id,
      type: type,
      value: type === 'battery' ? 6 : type === 'lamp' ? 10 : 0,
      closed: e.on !== false,
    })
    wires.push({ id: 'w' + i + 'a', a: 'n' + e.a + ':0', b: id + ':0' })
    wires.push({ id: 'w' + i + 'b', a: id + ':1', b: 'n' + e.b + ':0' })
  }
  let r
  try {
    r = solveCircuit(comps, wires, junctions)
  } catch (err) {
    return { ok: false, status: 'invalid', type: '无法求解', message: '电路无法求解', readings: {}, current: 0 }
  }
  const readings = {}
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]
    if (e.type === 'wire') continue
    const id = 'e' + i
    const cr = r.components[id]
    if (cr) readings[e.a + '-' + e.b] = { current: cr.current, voltage: cr.voltage, power: cr.power }
  }
  let type = classify(edges)
  if (r.status === 'short') type = '短路'
  return {
    ok: r.status === 'ok',
    status: r.status,
    type: type,
    powered: !!r.powered,
    current: r.current || 0,
    resistance: r.resistance,
    message: r.message || '',
    readings: readings,
  }
}
