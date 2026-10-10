---
description: 'ACAS.X 定制第四类：在 tsdown 构建的 dsh 客户端插件里接入 UnoCSS 原子样式与 antd 组件库。'
kind: 'customization-note'
---

# 定制四：组件库与 UnoCSS 在 dsh 客户端插件中的适配

本分支对应 `codex/acasx-4-uno-antd`。产品面要使用 antd 6 的 `Modal`、`Tabs`、`List` 等组件，并希望用原子类写布局；难点在于 dsh 的客户端插件由 tsdown 打包，不经过 `apps/web` 的 Vite 图。

## 为什么常规接法不成立

`@unocss/vite` 只在 Vite 构建里生成并注入 CSS。客户端插件由 `packages/tsdown.client.ts` 在独立进程打包，Vite 看不到插件源码，因此静态 `import 'virtual:xxxx.css'` 没有构建方生成。

antd 本身是运行时组件库，可以随插件 bundle 一起打包，但要确认 peer 版本：antd 6 要求 React `>=18`，当前 React 18.3.1 直接可用，不升级 React 19。

## 机制一：把 UnoCSS 生成器装进 tsdown 插件

`packages/client/acasx/tsdown.config.ts` 定义一个 tsdown 插件：`resolveId` 把 `virtual:acasx-uno.css` 指到虚拟模块，`load` 时用 `globSync('src/**/*.{ts,tsx}')` 扫描源码，交给 `createGenerator({ presets: [presetWind3()] })` 生成 CSS，再把 CSS 包装成执行期注入 `<style data-plugin-css="acasx-uno">` 的模块。

客户端源码写 `import 'virtual:acasx-uno.css'` 即可。执行期注入而非构建期产资源文件，是因为插件 bundle 没有宿主资源收集流程；`data-plugin-css` 标记用来避免重复注入。

同一入口用 `resolveId` 把 `yaml` 强制解析到 `yaml/browser`：tsdown 下 `yaml` 的 `exports` 会落到 node 构建，客户端 bundle 会留下 `require("process")`，浏览器端直接报错。

CSS Modules、全局 CSS、`?inline`、UnoCSS 虚拟模块与 antd 运行期样式这五类样式的完整编译、注入、归属与清理链路，见 [client-css-pipeline.md](../client-css-pipeline.md)。

## 机制二：antd 的 locale 与容器

`AcasxCapabilitiesButton` 用 `ConfigProvider` 包住 `Modal`，按 `document.documentElement.lang` 在 `zh_CN`/`en_US` 之间选 antd locale；页面文案仍走本包 locale 字典，antd 只负责组件内部文案。

该按钮占用第二类定制新增的 `conversation.hero.preview` 槽位，点击后读取 `skills/list` Remote 与 `agentPresets/read` 返回的 preset 组合 YAML，展示当前会话的 MCP 与 Skills。

## 候选方案与取舍

原子 CSS 与组件库各有候选路径，筛选标准是「只影响产品包、构建结果确定、不把成本推给上游」。

| 候选方案 | 做法 | 不采用的原因 |
| --- | --- | --- |
| `@unocss/vite` 接到 `apps/web` | 在 Vite 构建里生成 CSS | 客户端插件由 tsdown 独立打包，Vite 看不到插件源码，原子类不会被抽取 |
| 把 UnoCSS 配置加进上游构建 | 改 `apps/web` 或上游包 | 把产品样式需求塞进上游构建，所有组合一起受影响，产品包不再自包含 |
| 只用 CSS Modules / 手写 CSS | 每个组件写样式文件 | 能用但失去原子类工作流；产品面按 token 拼布局时样式文件会持续膨胀，改动也更难复用 |
| 浏览器运行期扫 DOM 生成 CSS | 运行时收集 class 再注入 | 首屏闪烁、CSP 与性能风险、结果不确定，测试也无法稳定断言 |
| 让宿主收集插件 CSS 资产 | 依赖构建系统收集插件样式 | 插件 bundle 是自包含的工厂闭包，没有资源收集通道；在插件内注入 `<style>` 是当前契约下的直接做法 |
| 换组件库或自研组件 | 不用 antd | 维护成本高；仓库政策优先维护成熟依赖。antd 6 的 peer 允许 React 18，不需要为它升级 React 19 |
| 让上游改 `yaml` 解析 | 在上游处理 node/browser 差异 | 浏览器 bundle 里 `yaml` 落到 node 构建会带 `require("process")`；在产品包的 tsdown 插件里 alias 到 `yaml/browser` 只影响产品包 |

选当前方案的理由：生成器与组件库都装在产品包的构建链里，产物自包含，上游文件零改动；CSS 在构建期从源码抽取，结果确定且可测试。

这个方案的代价必须写清楚：antd 内联后 `lib/client.js` 约 4.9 MB（gzip 约 0.9 MB），需要后续按需加载来收；样式是运行期插入 `<style>`，CSP 严格的环境要评估 nonce；`uno.config.ts` 目前没有被 tsdown 插件加载，自定义规则、safelist 与 postprocess 尚未生效。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `packages/client/acasx/tsdown.config.ts` | 虚拟 UnoCSS 模块插件、`yaml/browser` 解析 |
| `packages/client/acasx/uno.config.ts` | 原子类预设与 `level-*` 自定义规则 |
| `packages/client/acasx/src/client/virtual-uno.d.ts` | 虚拟模块类型声明 |
| `packages/client/acasx/src/client/hero/AcasxCapabilitiesButton.tsx`、`.module.css` | antd 弹窗与同形按钮 |
| `packages/client/acasx/src/client/hero/capabilities.ts` | preset 组合 YAML 中收集 MCP 服务器 |
| `packages/client/acasx/tests/uno.client.spec.ts` | 断言构建链能抽取组件用到的原子类 |
| `packages/client/acasx/package.json` | `antd`、`unocss`、`yaml` 依赖与包内脚本 |
| `.oxfmtrc.json`、`packages/client/acasx/oxfmt.config.ts`、`oxlint.config.ts` | 只放行 acasx 的格式化/检查配置 |

## 复刻步骤

1. 依赖只加在产品包：`antd`、`unocss`、`yaml` 进 `packages/client/acasx/package.json`，不进上游包。
2. 在 tsdown 插件里生成 CSS，而不是依赖 `@unocss/vite`；扫描范围限定插件自己的 `src`，避免把宿主代码卷进来。
3. 需要浏览器构建的依赖用 `resolveId` 显式切到 browser 入口。
4. 组件库的容器（`ConfigProvider`）和一个按钮/入口一起注册到既有槽位；弹窗数据通过 Remote 读取，组件不直连业务后端。
5. 用同一套 preset 写一个抽取测试，保证「源码里写的原子类」确实能生成 CSS。

## 验证与已知限制

- `pnpm --filter @deepseek-ai/dsh-client-acasx test` 覆盖 UNO 抽取与 hero 映射。
- 构建走包内脚本 `node scripts/run-with-product-env.mjs build`，它注入 `DSH_CLIENT_TITLE` 后调用仓库根构建；不要直接跑根 `pnpm run build`，否则产品标题会退回 DSH 默认值。
- antd 内联后 `lib/client.js` 约 4.9 MB（gzip 约 0.9 MB），后续应评估把弹窗改为按需动态加载。
- 当前 tsdown 插件直接实例化 `presetWind3()`，没有加载 `uno.config.ts`，因此该文件里的 `safelist`、`postprocess` 与 `level-*` 规则尚未进入 bundle。需要这些规则时，应在插件里加载该配置，并同步更新抽取测试。
