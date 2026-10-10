---
description: 'ACAS.X 的工程化与本地开发手册：环境隔离、构建、测试、格式化、依赖与上游升级。'
kind: 'development-guide'
---

# ACAS.X 工程化与本地开发手册

本文件面向后续接手 ACAS.X fork 的开发与运维：怎么在本仓库里跑起来、怎么构建和验证、哪些规则不能破、上游升级时先看哪里。命令都在仓库根目录执行，另有说明的除外。

## 1. 环境与运行时隔离

仓库要求 Node `^22.19 || >=24`，用 pnpm workspace 管理，安装只用 `pnpm install`。仓库没有配置自动安装（`.npmrc` 的 `verify-deps-before-run=false`），安装是显式动作；不要手工编辑 `pnpm-lock.yaml`。

产品运行时用独立 home，避免读到你本机已安装的官方 dsh 数据。

| 场景 | `DSH_HOME` | 说明 |
| --- | --- | --- |
| VS Code 集成终端 | `<仓库>/.acasx-dev-home` | 由 `.vscode/settings.json` 注入，build、test、dsh 命令都继承 |
| 产品正常运行 | `~/.acasx` | 启动入口调用 `applyAcasxHomeDefault()` 兜底；官方 dsh 仍是 `~/.dsh` |
| 显式设置 | 原样生效 | 显式 `DSH_HOME` 优先级最高，任何默认值都不覆盖它 |

`.acasx-dev-home/` 与 `.acasx-workspaces/` 已在 `.gitignore` 中。不要在 `.env` 里设 `DSH_HOME` 来指望它生效：`loadLayeredEnv` 在读取 `.env` 之前就已经解析了 home。不用 VS Code 时，自己在 shell 里导出 `DSH_HOME=<仓库>/.acasx-dev-home`。

## 2. 产品命令（走包内脚本）

ACAS.X 的产品标题是构建期注入的 `DSH_CLIENT_TITLE`。包内脚本 `packages/client/acasx/scripts/run-with-product-env.mjs` 读取 `package.json` 的 `acasx.productTitle`，注入环境后调用仓库根脚本。

| 目的 | 命令 |
| --- | --- |
| 构建产品产物 | `pnpm --filter @deepseek-ai/dsh-client-acasx run build:product` |
| 开发 Web（改动客户端热更新） | `pnpm --filter @deepseek-ai/dsh-client-acasx run dev:web` |
| 开发桌面端 | `pnpm --filter @deepseek-ai/dsh-client-acasx run dev:desktop` |

不要直接跑仓库根的 `pnpm run build` / `dev:web` / `dev:desktop` 来做产品构建：它们读不到 `acasx.productTitle`，产物会退回 DSH 默认标题。改产品标题只改 `packages/client/acasx/package.json` 的 `acasx.productTitle` 一行。

只想快速跑一次任务时可以用：`pnpm dsh --profile headless "task"`（需要 `DEEPSEEK_API_KEY`）。Web 浏览器自动化或录 GIF 时按根 `AGENTS.md` 的要求叠加目录选择器覆盖：`pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml`。

## 3. 构建

仓库按构建面分两次编译：Host 面（`tsconfig.host.json`）与 Client 面（`tsconfig.client.json`）。`@deepseek-ai/dsh-client-acasx` 是双面包，两个面都要挂上。

| 改了什么 | 命令 |
| --- | --- |
| 只改客户端（`src/client/**`） | `pnpm run build:lib:client` |
| 改了 Host 半边或其它包 | `pnpm run build` |
| 只检查 acasx 两面的类型 | `pnpm exec tsc -b packages/client/acasx/tsconfig.json` |

客户端产物是 `lib/client.js`：一个注册到 `window.__ModuleLoader__.load({ id, factory })` 的闭包工厂，外部依赖通过模块表解析。改了 `tsdown.config.ts` 后要重新构建才能看到产物变化。

## 4. 测试

先选最小覆盖面，不要默认跑全量。

| 目的 | 命令 |
| --- | --- |
| 全量单测 | `pnpm run test` |
| 聚焦单测 | `pnpm exec vitest run packages/client/acasx/tests packages/client/ui-conversation/tests` |
| 覆盖率门禁 | `pnpm run test:coverage`（`packages/*/*/src` 逐文件 100%） |
| 记录会话快照回放（无 key） | `pnpm run test:snapshot`，可用 `-t <name>` 过滤 |
| 重新录制快照（需要 key） | `pnpm run test:snapshot:record` |
| 真实 API e2e | `pnpm run test:e2e`（无 `DEEPSEEK_API_KEY` 时自跳过） |
| Web 内建流程 | `pnpm run test:web:built` |

Windows 上默认线程池可能崩溃或在 jsdom 测试里挂起；聚焦跑 UI 测试时加 `--pool=forks --no-file-parallelism`，例如 `pnpm exec vitest run --pool=forks --no-file-parallelism packages/client/ui-sidebar/tests`。

## 5. 格式化与静态检查

产品包有独立的 `oxfmt.config.ts` 与 `oxlint.config.ts`；根 `.oxfmtrc.json` 只放行 `packages/client/acasx/**`，上游文件不参与产品格式化。oxfmt 会重排 named import，直接跑在上游文件上会产生大量无意义改动。

| 目的 | 命令 |
| --- | --- |
| 格式化产品包 | `pnpm --filter @deepseek-ai/dsh-client-acasx run format` |
| 校验产品包格式 | `pnpm --filter @deepseek-ai/dsh-client-acasx run format:check` |
| 全仓 lint | `pnpm run lint` |
| 类型检查 | `pnpm run typecheck` |
| 跨文件重复检测 | `pnpm run duplication` |
| 包/依赖/NodeNext 体检 | `pnpm run hygiene` |
| 文档门禁 | `pnpm run doc-sync`（快速版 `pnpm run test:docs`） |

VS Code 已配置保存时只跑 oxc 的 fix-all，不跑全仓 formatter，避免动上游文件的折行。

## 6. 依赖与组合规则

- 产品依赖只加在 `packages/client/acasx/package.json`；antd、unocss、yaml 不得扩散到上游包。
- 在组合里挂载产品包时，必须同时在 `packages/bundle/web-app/package.json` 的 `dependencies` 声明它。桌面端与打包环境按依赖闭包扫描客户端插件，只加 `cordis.patch.yml` 的行会让插件在桌面端完全不出现。
- 客户端插件的外部依赖是显式模块表请求：`package.json` 的 `dsh.client.external` 与源码 import 必须一致，漏声明会在构建期被 bundle purity 门禁拦下。
- 客户端插件拿不到 `cordis.yml` 的 `config`（boot manifest 只按 `id` 创建 entry），部署差异目前只能走注入面或组合行。

## 7. 上游升级

`upstream` remote 指向 `deepseek-ai/deepseek-harness`。上游是 developer preview，公开 API 会破坏性变更，修复以最小侵入为原则。

先看这份「上游触碰清单」，升级时优先检查它们：

| 区域 | 文件 |
| --- | --- |
| 组合 | `packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/package.json` |
| 构建拓扑 | `tsconfig.base.json`、`tsconfig.client.json`、`tsconfig.host.json` |
| 会话与预设 | `packages/preset/agent-preset-registry/**`、`packages/preset/agent-preset/**`、`packages/client/ui-agent-preset/**` |
| 会话 UI | `packages/client/ui-conversation/**` |
| 侧栏 | `packages/client/ui-sidebar/**` |
| 启动与 home | `apps/cli/src/bin.ts`、`apps/desktop/src/main.ts`、`apps/desktop-host/src/index.ts`、`packages/util/home-paths/**` |
| 生成物 | `docs/config-catalog*.md`、`pnpm-lock.yaml`、`THIRD_PARTY_NOTICES.md` |

升级步骤建议固定为：`git fetch upstream` → 合并或变基（保留可追溯记录）→ `pnpm install --frozen-lockfile` → `pnpm run build:lib:client` → 聚焦测试与快照 → 重生成 `docs/config-catalog*.md` → 人工过一遍被禁用/覆盖的上游行（`ui-plugin-manager`、`ui-schedule`、`ui-workspace`）。

## 8. 已知门禁问题

当前有两条已知未过或需要人工确认的门禁，改动相关代码时要留意：

- `verify-package-dependencies` 报 `@deepseek-ai/dsh-home-paths#dshHomePath is not classified as safe or peer-required`。`dshHomePath` 只按 `$DSH_HOME` 计算绝对路径，多副本结果一致；要放进 `DUPLICATE_SAFE_PACKAGES` 需人工复核。
- `verify-client-ui-i18n` 在原有硬编码之外新增了一处（侧栏业务树的 `aria-label="新建会话"`）。产品包文案应走 locale 字典，后续补字典时一并清掉。

## 9. 目录导览

```text
packages/client/acasx/
  src/index.ts            Host 半边：acasxScenario Remote 服务
  src/types.ts            Remote 线上的类型（仅类型）
  src/client/index.ts     浏览器半边入口：挂载 Remote、注册界面
  src/client/...          品牌、业务树、主对话、面板、能力弹窗
  scripts/                产品命令入口（注入 DSH_CLIENT_TITLE）
  tests/                  hero 映射、UnoCSS 抽取
  docs/                   本文件与技术方案、定制说明
  tsconfig.host.json      Host 面工程引用（@Remote 生成依赖它）
  tsconfig.client.json    Client 面工程引用
  tsdown.config.ts        客户端 bundle 与 UnoCSS 虚拟模块
```

产品代码只放这个包；业务数据接入后应落在 Host 服务与自有存储里，不要把业务分类塞进 Session 持久化格式。
