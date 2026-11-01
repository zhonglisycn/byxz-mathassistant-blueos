#!/usr/bin/env bash
# 内核测试：把 src/common/core（含 content 子目录）拷到带 type:module 的临时目录后逐个跑
set -e
cd "$(dirname "$0")/.."

TESTS=$(ls tools/*.test.mjs 2>/dev/null || true)
if [ -z "$TESTS" ]; then echo "没有找到测试文件"; exit 0; fi

fail=0
for t in $TESTS; do
  name=$(basename "$t" .test.mjs)
  TMP=".ct-$name"
  rm -rf "$TMP" 2>/dev/null || true
  mkdir -p "$TMP/core/content" "$TMP/data"
  printf '{ "type": "module" }' > "$TMP/package.json"
  cp src/common/data/*.js "$TMP/data/" 2>/dev/null || true
  for f in src/common/core/*.js; do
    b=$(basename "$f")
    [ "$b" = "util.js" ] && continue
    cp "$f" "$TMP/core/$b"
  done
  cp src/common/core/content/*.js "$TMP/core/content/" 2>/dev/null || true
  cat > "$TMP/core/util.js" <<'STUB'
const mem = {}
export function saveKey(key, value, cb) { mem[key] = value; if (cb) cb(true) }
export function loadKey(key, cb) { cb(mem[key] !== undefined, mem[key]) }
export function dropKey(key, cb) { delete mem[key]; if (cb) cb(true) }
STUB
  # 假 vibrator：app.test 用它断言"关掉震动后 tap() 一次都不调用"
  cat > "$TMP/core/vib-backend.js" <<'STUB'
const state = { count: 0 }
export function vibrate() { state.count++ }
export function count() { return state.count }
export function reset() { state.count = 0 }
export default { vibrate, count, reset }
STUB
  cp "$t" "$TMP/"
  echo ""
  echo "############ $name ############"
  ( cd "$TMP" && node "$name.test.mjs" ) || fail=1
done

echo ""
if [ "$fail" = "0" ]; then echo "全部测试通过"; else echo "存在失败用例"; exit 1; fi
