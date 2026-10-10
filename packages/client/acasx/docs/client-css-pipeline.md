---
description: 'dsh 客户端插件里各类 CSS（Module、全局、?inline、UnoCSS 虚拟模块、antd 运行期样式）的编译与生效链路。'
kind: 'development-guide'
---

# dsh 客户端插件的 CSS 编译与生效链路

本文件说明 acasx 客户端包里的几种 CSS 分别由谁编译、在什么时机进入 DOM、由谁清理。acasx 走的是「动态客户端插件」通道：源码由 `packages/client/tsdown.client.ts` 的 `clientBundle()` 打包成 `lib/client.js`，运行时通过模块表加载，CSS 内联进这个 bundle，而不是作为独立 `.css` 资源由宿主 Vite 处理。

## 总览

| 写法 | 编译者 | 产物 | 进入 DOM 的时机 | 归属与清理 |
| --- | --- | --- | --- | --- |
| `import css from './X.module.css'` | `clientBundle` 内的 lightningcss | 哈希类名映射 + 样式注入模块 | 模块物化（factory 执行）时 | `style[data-plugin]` + `data-plugin-css`，卸载时按插件清理 |
| `import './global.css'` | 同上，仅压缩 | 样式注入模块 | 模块物化时 | 同上 |
| `import text from './X.css?inline'` | 同上，导出文本 | 默认导出压缩后的 CSS 字符串 | 由插件自己决定 | 插件自管，dsh 不做归属 |
| `import 'virtual:acasx-uno.css'` | acasx 自己的 tsdown 插件 + UnoCSS | 样式注入模块 | acasx 入口模块物化时 | 注入时只带 `data-plugin-css`，由模块系统在物化期补 `data-plugin` |
| antd 组件样式 | `@ant-design/cssinjs` | 运行期生成的哈希 `<style>` | React 渲染组件时 | 不在 dsh 归属机制内，不由插件卸载清理 |

对照：仓库还有一条「静态链接」通道 `staticLinked()`，它让 `.css` 保持相对外部引用并在 `lib/` 下产出真实样式文件，由宿主 Vite 决定类名哈希与打包。acasx 不在那条通道上。

## 1. CSS Modules（`.module.css`）

`css-modules.d.ts` 声明 `*.module.css` 的类型。构建时 `dsh-css-modules-inline` 插件接管：

1. `resolveId('./X.module.css')` 返回虚拟模块 `\0dsh-css:<绝对路径>.mjs`，虚拟 id 以 `.mjs` 结尾是为了绕开 tsdown 自带的 CSS 处理（它的守卫匹配以 `.css` 结尾的 id）。
2. `load` 调用 `addWatchFile(fileId)` 把真实样式文件登记进 watch 图，再用 lightningcss `transform({ cssModules: { pattern: '[hash]_[local]' }, minify: true })` 编译。
3. 生成的模块体做两件事：向 `<head>` 注入一个带 `data-plugin="<包名>"` 与 `data-plugin-css="<包名>/<文件名>"` 的 `<style>`；`export default` 哈希后的类名映射。

组件里这样使用：`import css from './AcasxCapabilitiesButton.module.css'`，然后 `className={css.trigger}`。哈希类名（形如 `a1b2c3_trigger`）保证不同插件的同名类互不冲突。

## 2. 全局 CSS（`import './x.css'`）

`dsh-css-global-inline` 接管非模块 `.css`：同样 `addWatchFile` + lightningcss 压缩，但生成的是无类名映射的注入模块。规则是全局的，需要自己控制选择器范围；用于引入第三方式样表或少量页面级规则。

## 3. 内联文本 CSS（`import text from './x.css?inline'`）

`dsh-css-text-inline` 把编译后的 CSS 作为默认导出的字符串，不产生任何注入副作用。适合需要自己保管生命周期的场景：挂到 ShadowRoot、按需创建/删除 `<style>`、或把样式传给需要字符串参数的 API。用这种写法时，卸载清理由插件自己负责。

## 4. UnoCSS 虚拟模块（`virtual:acasx-uno.css`）

普通 `@unocss/vite` 不适用：客户端插件由 tsdown 独立打包，Vite 看不到插件源码。acasx 在自己的 `tsdown.config.ts` 里定义了一个 `acasx-uno-css` 插件：

1. `resolveId('virtual:acasx-uno.css')` 指向虚拟模块 `\0acasx-uno.mjs`。
2. `load` 用 `globSync('src/**/*.{ts,tsx}')` 读取源码文本，交给 `createGenerator({ presets: [presetWind3()] }).generate(sources, { preflights: false })` 生成 CSS。
3. 生成的模块体在执行期注入 `<style data-plugin-css="acasx-uno">`。

`src/client/index.ts` 顶部的 `import 'virtual:acasx-uno.css'` 让这段注入在 acasx 客户端入口物化时执行。注意三点：

- 抽取基于源码文本，类名必须字面出现在 `src/**/*.{ts,tsx}`；动态拼接的类名不会被生成，需要 `safelist`。
- `preflights: false` 表示只产出工具类，不注入 UnoCSS 的全局 reset，避免影响上游页面。
- 当前插件直接实例化 `presetWind3()`，没有加载仓库里的 `uno.config.ts`，因此该文件的自定义 `level-*` 规则、`safelist` 与 `postprocess` 尚未生效；需要时应在插件里加载这份配置，并同步更新 `tests/uno.client.spec.ts` 的抽取断言。

## 5. antd 的运行期样式

acasx 没有引入 antd 的静态样式文件。antd 6 通过 `@ant-design/cssinjs` 在组件渲染时按需生成并插入哈希去重的 `<style>`，`ConfigProvider` 只影响组件内部文案，不影响 CSS。

这类样式和 dsh 的样式归属是两套机制：它们出现在 React 渲染阶段，晚于模块物化，因此不会被打上 `data-plugin`，插件卸载或热更新时也不由 `removeOwnedStyles` 清理。实践上要把它当作运行期 CSS-in-JS：保留 antd 的使用范围在产品自己的界面里；严格 CSP 环境需要给 cssinjs 配 nonce；不要假设热更新会回收这些标签。

## 6. 生命周期与顺序

模块系统在物化一个插件时先记录「已存在的无归属样式」，执行工厂后再调用 `claimStyles`：把物化期间新出现的无归属 `<style>` 打上 `data-plugin="<包名>"`，并记录它们的 `data-plugin-css`。卸载或代码替换时 `removeOwnedStyles(id)` 删除所有 `style[data-plugin=<包名>]`。

这条规则解释了一个细节：内置注入模块自己设了 `data-plugin`；acasx 的 UnoCSS 注入器只设 `data-plugin-css`，靠模块系统的 `claimStyles` 在物化期补上 `data-plugin`，所以两类样式都能被卸载清理。

层叠顺序由「模块物化顺序 + React 渲染顺序」决定，选择器同权重时后插入的生效。CSS Modules 靠哈希隔离；UnoCSS 工具类、全局 CSS、antd 样式都是全局的，需要靠选择器范围与顺序控制。`uno.config.ts` 里原本用 `body:not(#\#)` 提升工具类权重的 `postprocess` 目前没有接入，不能作为覆盖手段依赖。

## 7. 构建入口与产物

客户端构建：`pnpm run build:lib:client`（等价于 `tsc -b tsconfig.client.json && tsdown --config-loader native --env.DSH_BUILD_FACE client`）。

输出 `lib/client.js`：`format: 'cjs'`、`platform: 'browser'`，文件头是 `window.__ModuleLoader__.load({ id, factory })` 的注册包装。所有上述 CSS（除 `?inline`）都被内联进这个 bundle 的执行逻辑，不会在 `lib/` 下额外产出 `.css` 文件。改样式后要重新构建（`dev:web` 会在编辑时重建客户端 bundle）。

## 8. 排查清单

| 现象 | 先检查 |
| --- | --- |
| Module 类名没生效 | import 是否写 `X.module.css`，模板里是否使用 `css.<local>`，构建是否重跑 |
| UnoCSS 工具类没生成 | 类名是否字面出现在 `src/**/*.{ts,tsx}`；是否属于需要 safelist 的动态类名 |
| 样式互相覆盖 | 谁在全局（UnoCSS / 全局 CSS / antd），选择器范围与插入顺序是否可预期 |
| 卸载后样式残留 | `style[data-plugin]` 是否有对应标签；antd 运行期样式按设计不归属，需要自行处理 |
| 严格 CSP 下样式被拦 | 运行期注入的 `<style>` 需要 `style-src` 放行；antd 的 cssinjs 要配 nonce |
