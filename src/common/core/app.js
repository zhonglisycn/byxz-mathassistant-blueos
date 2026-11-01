/**
 * 应用级全局开关（角度制 / 精确优先 / 按键震动 / 字号）
 *
 * 平台事实（见 vivo-watch-blueos-app 技能第一条）：
 *   BlueOS 打包器把 common/*.js 各内联一份进每个页面 bundle，模块单例在页面
 *   之间不是同一个对象。所以设置不能只放在本模块里，必须走三通道：
 *     ① 共享宿主：页面 onInit/onShow 调 bind(this.$app)，值挂在 $app.$def.maShared；
 *     ② storage 兜底：拿不到 $def 时读 ma_deg / ma_exact / ma_vib / ma_fs（键名不变）；
 *     ③ 本地副本：两条都不可用时用本页副本，并 console.warn 一次便于真机定位。
 *
 * 三条路径都必须**显式落到默认值并发布**：真机首装时最容易出的问题不是崩溃，
 * 而是"读到无值"——开关显示成关、震动默认没了。默认值：角度关、精确关、震动开、字号中。
 *
 * 本文件不直接 import 平台接口（storage/vibrator 都在 util.js / vib.js 里，
 * 测试可替换），导出 createApp 便于单测里造两个"页面实例"验证跨页。
 */
import { saveKey, loadKey } from './util.js'
import { vibrate } from './vib.js'
import { createShare } from './share.js'

const FIELDS = ['deg', 'exact', 'vib', 'fs', 'full']
const DEFAULTS = { deg: false, exact: false, vib: true, fs: 1, full: false }
const STORAGE_KEYS = { deg: 'ma_deg', exact: 'ma_exact', vib: 'ma_vib', fs: 'ma_fs', full: 'ma_full' }

function isBool(v) { return v === true || v === false }
function isFs(v) { return v === 0 || v === 1 || v === 2 }
function normFs(v) {
  const n = Number(v)
  if (!isFinite(n)) return DEFAULTS.fs
  return Math.max(0, Math.min(2, Math.round(n)))
}

/**
 * 建一个应用设置实例（等价于"一个页面 bundle 里的那份 app.js"）。
 * opts 全部可注入，方便测试：
 *   { share, loadKey, saveKey, vibrate, warn }
 */
export function createApp(opts) {
  const o = opts || {}
  const sh = o.share || createShare()
  const load = o.loadKey || loadKey
  const save = o.saveKey || saveKey
  const buzz = o.vibrate || vibrate
  const warn = o.warn || function (msg) {
    try {
      if (typeof console !== 'undefined' && console && console.warn) console.warn(msg)
    } catch (e) { /* 忽略 */ }
  }

  const app = {
    // 本地副本：布尔项始终是 boolean，字号是 0/1/2，页面直接读不会看到 undefined
    deg: DEFAULTS.deg,
    exact: DEFAULTS.exact,
    vib: DEFAULTS.vib,
    fs: DEFAULTS.fs,
    full: DEFAULTS.full,
    loaded: false,
    lastVib: 0,

    _warned: false,
    _storageTried: false,
    _dirty: { deg: false, exact: false, vib: false, fs: false, full: false },
    _hostKeys: { deg: false, exact: false, vib: false, fs: false, full: false },

    /**
     * 页面 onInit / onShow 调用：接进共享宿主。
     * 宿主里没有值的键 → 用本页值/默认值补上并发布（显式默认值）。
     */
    bind(hostApp) {
      this._hostKeys = { deg: false, exact: false, vib: false, fs: false, full: false }
      const h = sh.bind(hostApp)
      const b = h ? sh.bag() : null
      if (!b) {
        this._warnOnce()
        this._loadStorage()
        return false
      }
      let missing = false
      for (let i = 0; i < FIELDS.length; i++) {
        const k = FIELDS[i]
        const valid = k === 'fs' ? isFs(b[k]) : isBool(b[k])
        this._hostKeys[k] = valid
        if (valid) {
          this[k] = b[k]
        } else {
          missing = true
          const fallback = k === 'fs' ? (isFs(this[k]) ? this[k] : DEFAULTS.fs) : (isBool(this[k]) ? this[k] : DEFAULTS[k])
          b[k] = fallback
          this[k] = fallback
        }
      }
      // 首次装包/宿主刚建袋：宿主里没有存档值，再走一次 storage 兜底。
      // 已经有值就不要再读盘——否则"另一页刚改完、落盘还没回调"时会被旧值覆盖。
      if (missing) this._loadStorage()
      this.loaded = true
      return true
    },

    /** app.ux onCreate 调：建宿主 + 读一次存档（默认值先发布） */
    init(hostApp) {
      this.bind(hostApp)
      this._loadStorage()
    },

    /** 拿不到共享宿主时只 warn 一次（真机日志里好定位） */
    _warnOnce() {
      if (this._warned) return
      this._warned = true
      warn('理科助手：拿不到 app.$def 共享容器，设置改用 storage / 本页副本兜底')
    },

    /** 把值发到共享宿主（没有宿主时静默，本页副本照常可用） */
    _publish(k, v) {
      const b = sh.bag()
      if (!b) return
      try { b[k] = v } catch (e) { /* 宿主不可写：保持本页副本 */ }
    },

    /**
     * storage 兜底：读不到 / 没有 storage → 显式落默认值并发布。
     * 每个页面副本最多读一次（_storageTried）。
     */
    _loadStorage() {
      if (this._storageTried) return
      this._storageTried = true
      let pending = FIELDS.length
      const done = () => {
        if (--pending <= 0) this.loaded = true
      }
      for (let i = 0; i < FIELDS.length; i++) {
        const k = FIELDS[i]
        // 先把当前值（默认值或宿主值）发布出去：即使 storage 永远不回调，默认值也生效
        if (!this._dirty[k]) this._publish(k, this[k])
        load(STORAGE_KEYS[k], (ok, raw) => {
          if (!this._dirty[k] && !this._hostKeys[k]) {
            let v
            if (k === 'fs') {
              v = ok ? normFs(raw) : DEFAULTS.fs
            } else {
              v = ok ? String(raw) === '1' : DEFAULTS[k]
            }
            this[k] = v
            this._publish(k, v)
          }
          done()
        })
      }
    },

    /** 生效值：优先共享宿主（跨页实时），其次本页副本 */
    degOn() {
      const b = sh.bag()
      if (b && isBool(b.deg)) return b.deg
      return isBool(this.deg) ? this.deg : DEFAULTS.deg
    },

    exactOn() {
      const b = sh.bag()
      if (b && isBool(b.exact)) return b.exact
      return isBool(this.exact) ? this.exact : DEFAULTS.exact
    },

    vibOn() {
      const b = sh.bag()
      if (b && isBool(b.vib)) return b.vib
      return isBool(this.vib) ? this.vib : DEFAULTS.vib
    },

    /** 理科页字号：0 小 / 1 中 / 2 大 */
    fsOn() {
      const b = sh.bag()
      if (b && isFs(b.fs)) return b.fs
      return isFs(this.fs) ? this.fs : DEFAULTS.fs
    },

    /** 全部显示：精确模式下不省略长整数 */
    fullOn() {
      const b = sh.bag()
      if (b && isBool(b.full)) return b.full
      return isBool(this.full) ? this.full : DEFAULTS.full
    },

    /** 轻振动（开关关掉时静默；80ms 节流，连打键盘不每键一震） */
    tap() {
      if (!this.vibOn()) return false
      const now = Date.now()
      if (this.lastVib && now - this.lastVib < 80) return false
      this.lastVib = now
      try { buzz() } catch (e) { /* 后端不可用不影响主流程 */ }
      return true
    },

    setDeg(v) { return this._set('deg', v) },
    setExact(v) { return this._set('exact', v) },
    setVib(v) { return this._set('vib', v) },
    setFs(v) { return this._set('fs', v) },
    setFull(v) { return this._set('full', v) },

    _set(k, v) {
      const val = k === 'fs' ? normFs(v) : !!v
      this[k] = val
      this._dirty[k] = true
      this._publish(k, val)
      const raw = k === 'fs' ? String(val) : (val ? '1' : '0')
      try { save(STORAGE_KEYS[k], raw, null) } catch (e) { /* 存档失败不影响本次会话 */ }
      return val
    }
  }

  return app
}

export default createApp()
