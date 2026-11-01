/** 震动入口（可被测试替换后端，见 vib-backend.js） */
import backend from './vib-backend.js'

export function vibrate() {
  backend.vibrate()
}
