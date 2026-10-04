# 数学助手 · vivo WATCH GT 2

手环版数学助手移植到 vivo WATCH GT 2，跑蓝河 BlueOS 3，432×514 方屏。

- 包名 `com.byxz.mathassistant`
- 产物：BlueOS Studio 打包出的 `.rpk`
- 功能跟手环版一致：计算器、方程求解、函数图像
- 手环版（Vela 快应用）：https://github.com/zhonglisycn/byxz-mathassistant

## 三个模块

**计算器**：四则、幂、取余、阶乘，常量 π e，sin cos tan asin acos atan √ ln log abs 等；
隐式乘法（`2π`、`3(4+5)`、`(1+2)(3+4)`）；边输入边给预览；精确形式（π、√2、分数）；
角度弧度切换；光标编辑；虚数和精确分数。

**方程求解**：一次、二次（含复根、顶点、韦达定理）、二元一次方程组（克莱姆法则）、
任意 f(x)=0 的数值求根。自由式子会自动展开移项化成一般式再解。
数值求根要求收敛后 |f(根)| 足够小，所以 tan 的渐近线和 1/x 的极点不会被误报成根。

**函数图像**：12 个预设函数加自定义表达式；三档区间；y 轴按分位数裁剪后再留余量；
符号求导给出 f′(x) 并可以直接画；值表；取点读数。手环上没有 canvas，
曲线是按像素列聚成的竖段拼出来的，一列一段。

## 跟手环版比改了什么

- 系统接口全换成蓝河的：路由 `@blueos.app.appmanager.router`、存储 `@blueos.storage.storage`、
  震动 `@blueos.hardware.vibrator.vibrator`，manifest 里对应 `blueos.*` 能力声明
- 角度制 / 精确 / 震动三个开关，从 `this.$app.$def` 换成普通模块单例，页面 import 同一个对象
- 尺寸按 432×514 方屏重排（原来按 212×520 胶囊屏做的），页面留白那三档设置删掉了
- 键盘从自动换行改成一行四个写死，不去赌运行时的 `flex-wrap`
- 表达式、采样点数、取点 x 各有输入键盘，顶栏下面一排常驻按钮唤出，一次只开一个
- 采样点数可调（20~401，默认 200），点数少了竖段自动加宽，曲线不会断成虚线
- 原工程的 `tools/check-ux.mjs` 搬了过来，补上对 `data:` 字段的识别

## 跑起来

```bash
pnpm i        # 只有 lint 依赖，不装也能在 Studio 里跑
pnpm test     # 内核测试（跑之前会给 util.js 打桩）
pnpm lint
```

开发用 BlueOS Studio 打开工程目录，预览设备选 watch-square；Studio 首次打开工程会生成
`.ide/settings.json`，把里面 watch-square 的分辨率改成 `432*514`，预览就和 GT2 一致。
打包在工具栏「打包」，首次要生成签名；装表用 OrbitV 蓝牙推 rpk。

也可以命令行打包（blueos-pack 是 Studio 自带的，不用另装）：

```bash
PACK="<Studio>/resources/app/extensions/blueos-debugger/node_modules/blueos-pack/bin/index.js"
node "$PACK" build   --device-type watch-square   # 调试包，免签名
node "$PACK" release --device-type watch-square   # 发布包，需要 sign/ 下的证书

# 首次出 release 包前，生成一对自签名证书（MSYS_NO_PATHCONV=1 别漏）：
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout sign/private.pem -out sign/certificate.pem -days 3650 \
  -subj "/C=CN/O=byxz/CN=com.byxz.mathassistant"
```

产物在 `dist/watch-square/debug|release/`：debug 约 210KB，release 约 89KB。

## 已知问题

- 只在模拟器和 GT2 真机上试过。存储和震动两个接口写的是最坏情况能降级的形式，
  哪台机器上不生效，改 `src/common/core/util.js` 和 `src/common/core/app.js` 就行
- 图像页的曲线和坐标轴是绝对定位拼的，其他机型上没验证
- 手环版自带的限制没变：数值求根只找实根、高次走向数值法、精确分数只在有理数运算下给

## 许可

MIT。

计算器的界面布局与配色参考开源项目 Open_Modular_Boardgame_Companion（MIT，MinimumBubble11）。
表达式解析、方程求解、图像采样与渲染都是手环版工程自己写的，移植没有动内核。
