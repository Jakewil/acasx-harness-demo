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

## 机制二：antd 的 locale 与容器

`AcasxCapabilitiesButton` 用 `ConfigProvider` 包住 `Modal`，按 `document.documentElement.lang` 在 `zh_CN`/`en_US` 之间选 antd locale；页面文案仍走本包 locale 字典，antd 只负责组件内部文案。

该按钮占用第二类定制新增的 `conversation.hero.preview` 槽位，点击后读取 `skills/list` Remote 与 `agentPresets/read` 返回的 preset 组合 YAML，展示当前会话的 MCP 与 Skills。

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
