/**
 * 应用级全局开关（BlueOS 版）
 * 原版放在 app.ux 的 export default 上、页面通过 this.$app.$def 读写；
 * 蓝河这里改成一个普通模块单例：所有页面 import 同一个对象，
 * 改完即存，重建页面也不丢。
 */
import vibrator from '@blueos.hardware.vibrator.vibrator'
import { saveKey, loadKey } from './util.js'

const app = {
  deg: false,      // 三角函数按角度制
  exact: false,    // 结果优先显示精确形式（π、√2、分数）
  vib: true,       // 按键震动反馈
  loaded: false,

  init() {
    let n = 3
    const done = () => { if (--n <= 0) this.loaded = true }
    loadKey('ma_deg', (ok, v) => { if (ok) this.deg = v === '1'; done() })
    loadKey('ma_exact', (ok, v) => { if (ok) this.exact = v === '1'; done() })
    loadKey('ma_vib', (ok, v) => { this.vib = ok ? v === '1' : true; done() })
  },

  /** 轻振动（开关关掉时静默；80ms 节流，连打键盘不每键一震） */
  tap() {
    if (!this.vib) return
    const now = Date.now()
    if (this.lastVib && now - this.lastVib < 80) return
    this.lastVib = now
    try { vibrator.vibrate({ mode: 'short' }) } catch (e) { /* 部分机型不支持，忽略 */ }
  },

  setDeg(v) { this.deg = !!v; saveKey('ma_deg', v ? '1' : '0', null) },
  setExact(v) { this.exact = !!v; saveKey('ma_exact', v ? '1' : '0', null) },
  setVib(v) { this.vib = !!v; saveKey('ma_vib', v ? '1' : '0', null) },
}

export default app
