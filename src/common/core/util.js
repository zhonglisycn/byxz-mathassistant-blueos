/**
 * 存档读写（BlueOS 版）
 * 原版基于 Vela 的 @system.storage，这里换成蓝河的 @blueos.storage.storage。
 * 所有调用都包了 try/catch：接口形态在各机型/版本可能有差异，
 * 最坏情况只是设置不持久化，不会让页面崩掉。
 */
import storage from '@blueos.storage.storage'

export function saveKey(key, value, cb) {
  try {
    storage.set({
      key: key,
      value: value,
      success: function () { if (cb) cb(true) },
      fail: function (data, code) { if (cb) cb(false, code) }
    })
  } catch (e) {
    if (cb) cb(false, e)
  }
}

export function loadKey(key, cb) {
  try {
    storage.get({
      key: key,
      success: function (data) { cb(true, data) },
      fail: function (data, code) { cb(false, code) }
    })
  } catch (e) {
    cb(false, e)
  }
}

export function dropKey(key, cb) {
  try {
    storage.delete({
      key: key,
      success: function () { if (cb) cb(true) },
      fail: function (data, code) { if (cb) cb(false, code) }
    })
  } catch (e) {
    if (cb) cb(false, e)
  }
}
