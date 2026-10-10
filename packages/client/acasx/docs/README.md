---
description: 'ACAS.X 定制与开发的文档汇总入口：四类定制主线、工程化与本地开发、客户端 CSS 链路，以及对应分支索引。'
kind: 'development-guide'
---

# ACAS.X 定制与开发文档汇总

本目录汇总 ACAS.X 在 DeepSeek Harness 上做产品定制的全部说明。本文件是导读与摘要；每类的完整细节、候选方案对比与代价在各自的文档里。

## 交付形态（先读这一段）

产品交付目标是桌面端：Electron 壳运行完整 dsh 运行时的同一个 `web-app` bundle（profile `desktop`），客户端插件与页面由它加载。Web 入口保留用于本地调试、自动化测试与录屏，不是交付目标。

开发工作流要区分两条路径：快速热更新目前只有 Web 调试路径有（`dev:web` 用 tsc / tsdown / vite 的常驻 watch，改客户端代码会重建 bundle）；桌面端 `dev:desktop` 是构建后启动，改代码要重新构建再启动。日常快速迭代可以在 Web 上做，功能验收以桌面端为准。

## 文档地图

| 文档 | 内容 | 适用场景 |
| --- | --- | --- |
| [engineering-and-local-development.md](engineering-and-local-development.md) | 环境隔离、产品命令、构建、测试、格式化、依赖规则、上游升级、已知门禁 | 接手开发、搭环境、发布 |
| [customization/01-source-params.md](customization/01-source-params.md) | 用可选属性扩展上游接口（hidden preset、固定工作区、隐藏外壳新建按钮） | 学「最小侵入改上游接口」 |
| [customization/02-slot-extensions.md](customization/02-slot-extensions.md) | 新增单槽位并用 fallback 保持默认渲染（hero 标题与预览徽标） | 学「扩展 UI 插槽」 |
| [customization/03-host-remote-conversations.md](customization/03-host-remote-conversations.md) | 对话类型用 preset 表达、Host/Remote 双面插件、场景会话编排、产品 home | 学「多类型对话与 Host/Remote」 |
| [customization/04-uno-antd-adaptation.md](customization/04-uno-antd-adaptation.md) | tsdown 内生成 UnoCSS、antd 组件库接入 | 学「组件库与原子 CSS 适配」 |
| [client-css-pipeline.md](client-css-pipeline.md) | 五类 CSS 的编译、注入、归属与清理链路 | 调样式、排查样式不生效 |
| [productization-assessment.md](productization-assessment.md) | 工程化基线、登录接管与上游破坏性升级的评估与路线 | 做产品化决策 |

## 四类定制主线

四类都遵守同一条原则：产品差异落在已文档化的扩展点上，不改 agent loop、不改持久化格式、不禁用提供服务的上游插件。

### 一、源码参数扩展

需求是让上游多一个可选行为，同时保持默认行为不变。做法是在 owning 类型上加可选字段，`undefined` 等价于旧行为：`PresetDefinition.hidden`、`ConversationInjected.workspaceSwitchEnabled`、`SidebarRootInjected.showNewSession`。

候选方案里被否掉的是：直接改消费组件、产品组件整体替换、CSS/DOM 隐藏、运行时打补丁、以及插件 Config（客户端插件拿不到 `cordis.yml` 配置）。可选字段的理由是表达能力最小、行为来源留在类型与调用点、不触碰持久化与 wire。

代价：产品策略以数据形式穿过上游类型；隐藏入口只改渲染角色，产品要在自己的场景里调用 `startSession`。完整对比见 [01-source-params.md](customization/01-source-params.md)。

### 二、插槽扩展

需求是让 hero 标题随会话变化、徽标变成能力入口，又不影响不挂产品的组合。做法是在 `ui-conversation` 新增两个 `single` 槽位并用 `renderSlot(..., { fallback })` 渲染，未占用时保持原来的节点。

被否掉的候选是：替换整个 hero、在上游写产品分支、让上游读产品服务、Portal/DOM 注入、误用现有槽位。新增槽位的理由是上游仍是默认渲染方，占用方拿到标准 props 与 effect 生命周期，改动面只有两处声明加一次 `renderSlot`。

代价：槽位名与 `scope` 成为公开契约。完整对比见 [02-slot-extensions.md](customization/02-slot-extensions.md)。

### 三、对话类型与 Host/Remote

需求是同时存在「日常监管」「心盾」两个业务对话与一个全局「主对话」。做法是：能力差异用 agent preset 表达（业务分类不进 `SessionHeader`）；场景目录由 Host 侧 `acasxScenario` Remote 解析；客户端先注册 Workspace 再建会话、refresh、打开；侧栏用 `priority: -1` 阴影覆盖 `sidebar.workspaces`。

被否掉的候选是：把类型塞进持久化格式、fork agent loop、禁用 `ui-workspace`、浏览器自己拼绝对路径、把命名空间加进 `api-remotes`（会造成引用环）、只给 `cwd` 建会话。

代价与遗留：`cwd` 反推会话归属是临时方案，业务阶段要换成自有存储的 `sessionId → (罪犯, 场景)` 映射；阴影覆盖会暂时丢掉上游浏览能力；双面包要同时挂 host/client 两个 tsconfig。另有一节专门说明为什么不用 `sessionId` 编码类型。完整对比见 [03-host-remote-conversations.md](customization/03-host-remote-conversations.md)。

### 四、组件库与 UnoCSS 适配

需求是在 tsdown 打包的客户端插件里用原子类与 antd。做法是在产品包的 `tsdown.config.ts` 里用 UnoCSS 生成器处理 `virtual:acasx-uno.css`，执行期注入 `<style>`；antd 随产品包打包，用 `ConfigProvider` 管理 locale；`yaml` 显式 alias 到 `yaml/browser`。

被否掉的候选是：`@unocss/vite` 接到 `apps/web`、改上游构建、只用手写 CSS、运行期扫 DOM、依赖宿主收集插件 CSS、换组件库。

代价：`lib/client.js` 约 4.9 MB（gzip 约 0.9 MB）；运行期注入 `<style>` 在严格 CSP 下要处理 nonce；`uno.config.ts` 目前未被 tsdown 插件加载，自定义规则尚未生效。完整对比见 [04-uno-antd-adaptation.md](customization/04-uno-antd-adaptation.md)。

## 工程化与本地开发要点

| 主题 | 结论 |
| --- | --- |
| 产品 home | 默认 `~/.acasx`，显式 `DSH_HOME` 优先；仓库开发用 `.acasx-dev-home` |
| 产品命令 | 走包内脚本注入 `DSH_CLIENT_TITLE`，不要直接跑根 `build` / `dev:web` / `dev:desktop` |
| 构建面 | 客户端 `pnpm run build:lib:client`；Host 或跨包改动 `pnpm run build` |
| 测试 | 先跑聚焦单测；Windows 上加 `--pool=forks --no-file-parallelism` |
| 格式化 | 产品包自有 oxfmt/oxlint，根配置只放行 acasx，上游文件不重排 |
| 依赖 | 产品依赖只在 acasx 包；挂载产品包必须同时声明 bundle `dependencies` |
| 升级 | 按「上游触碰清单」检查，先 `build:lib:client`，再聚焦测试与快照 |

完整命令、已知门禁问题与升级步骤见 [engineering-and-local-development.md](engineering-and-local-development.md)。

## 客户端 CSS 一览

| CSS 类型 | 编译与生效 |
| --- | --- |
| `.module.css` | 包内 lightningcss 编译成哈希类名，模块物化时注入 `style[data-plugin]` |
| `import './x.css'` | 同样编译并注入，规则是全局的 |
| `x.css?inline` | 只导出编译后的 CSS 文本，生命周期由插件自己管 |
| `virtual:acasx-uno.css` | acasx 的 tsdown 插件扫描源码用 UnoCSS 生成，执行期注入 |
| antd 组件样式 | `@ant-design/cssinjs` 渲染期注入，不进入 dsh 的样式归属机制 |

层叠顺序由模块物化与 React 渲染顺序决定；完整链路、归属清理与排查清单见 [client-css-pipeline.md](client-css-pipeline.md)。

## 分支索引

| 分支 | 内容 |
| --- | --- |
| `codex/acasx-1-params` | 第一类：源码参数扩展 |
| `codex/acasx-2-slots` | 第二类：插槽扩展（叠在第一类上） |
| `codex/acasx-3-host-remote` | 第三类：对话类型与 Host/Remote（叠在前两类上） |
| `codex/acasx-4-uno-antd` | 第四类：组件库与 UnoCSS（叠在前三类上） |
| `codex/acasx-demo-full` | 全量改动 + 全部文档汇总（本分支） |

四类分支是一条依赖栈，后一分支包含前面的改动；看单类增量用 `git diff <前一个分支> <分支>`。

## 快速命令

```sh
# 桌面端日常开发（注入产品标题，构建后启动）
pnpm --filter @deepseek-ai/dsh-client-acasx run dev:desktop

# 构建产品产物
pnpm --filter @deepseek-ai/dsh-client-acasx run build:product

# 仅用于快速热更新的 Web 调试路径
pnpm --filter @deepseek-ai/dsh-client-acasx run dev:web

# 聚焦单测（Windows 上用 forks 池）
pnpm exec vitest run --pool=forks --no-file-parallelism packages/client/acasx/tests

# 桌面端打包自检
pnpm --filter @deepseek-ai/dsh-desktop run check:package
```
