/**
 * 跨页共享宿主（挂在 app 实例的 $def 上）
 *
 * 平台事实：BlueOS 打包器把 common/*.js **各内联一份进每个页面 bundle**，
 * 页面脚本又各自在自己的函数作用域里执行，所以"模块单例"在页面之间
 * 不是同一个对象——About 页改的开关，Calc 页 import 到的是另一份，读不到。
 * 页面之间唯一共享的 JS 对象是 app 实例：页面里的 this.$app，app.ux 导出的
 * 对象挂在 $app.$def 上（gt2-chess 的 share.js 已验证）。
 *
 * 本文件是纯 JS，不依赖平台接口，可在 Node 里单测。
 * 约定：bag 里的值只放 boolean、字号 0/1/2 或 null；null 表示"还没设置"，
 * 由 app.js 的三条兜底路径显式落到默认值并发布。
 */

export const SHARED_KEY = 'maShared'

/** 建一个共享宿主（每个 app 实例一份；测试里可以建多个模拟多页） */
export function createShare() {
  return {
    host: null,

    /**
     * @param app 页面的 this.$app（带 $def），或 app.ux 里的 this
     * @returns 宿主对象；绑定失败返回 null（调用方必须兜底）
     */
    bind(app) {
      let h = null
      try {
        if (app && app.$def) h = app.$def
        else if (app && typeof app === 'object') h = app
      } catch (e) {
        h = null
      }
      if (!h) return null
      this.host = h
      try {
        if (!h[SHARED_KEY] || typeof h[SHARED_KEY] !== 'object') {
          h[SHARED_KEY] = { deg: null, exact: null, vib: null, fs: null, full: null }
        }
      } catch (e) {
        // 宿主不可写：bag() 返回 null，调用方走 storage / 本页副本
      }
      return h
    },

    /** 共享数据袋；没绑定成功或宿主不可写时返回 null */
    bag() {
      const h = this.host
      if (!h) return null
      try {
        const b = h[SHARED_KEY]
        return (b && typeof b === 'object') ? b : null
      } catch (e) {
        return null
      }
    },

    /** 是否真的拿到了共享宿主（单测与排查用） */
    isShared() {
      return !!this.bag()
    }
  }
}

export default createShare()
