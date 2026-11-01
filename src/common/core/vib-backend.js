/**
 * 震动后端：唯一 import 平台接口的地方。
 *
 * 单独拆出来是为了两件事：
 *   ① 测试运行器可以把本文件换成"假 vibrator 计数"（tools/run-tests.sh），
 *      从而断言"关闭震动后 tap() 一次都不调用 vibrator"；
 *   ② 平台接口不可用时只在最底层降级，app.js 的开关逻辑保持纯 JS。
 */
import vibrator from '@blueos.hardware.vibrator.vibrator'

export default {
  vibrate() {
    try {
      vibrator.vibrate({ mode: 'short' })
    } catch (e) {
      // 部分机型/版本不支持：静默，不影响主流程
    }
  }
}
