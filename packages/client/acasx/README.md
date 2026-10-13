---
description: 'ACAS.X 的产品面：品牌字标、左侧业务树（罪犯名单 / 固定模块 / 会话），以及业务模块主面板。交付端为桌面端，Web 入口仅用于调试。'
kind: 'package-reference'
---

# @deepseek-ai/dsh-client-acasx

<a id="summary"></a>

## Summary

`dsh-client-acasx` 承载 ACAS.X 在 dsh 客户端之上的产品面。桌面端 Electron 加载完整 dsh 运行时的同一个 `web-app` bundle（profile `desktop`），客户端插件与页面由它加载；Web 入口保留用于本地调试，不是交付目标。本包替换侧栏品牌字标，用业务树接管左侧栏的浏览区域，并在侧栏顶部注册业务模块入口，每个入口打开自己的主面板。

## Table of Contents

- [Summary](#summary)
- [使用方式](#usage)
- [当前状态](#current-state)
- [产品化技术方案](#productization)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="usage"></a>

## 使用方式

在已经包含客户端外壳的组合里，把本包作为一行 `cordis.yml` 挂载即可。客户端侧会向以下槽位注册：

| 槽位                         | 用途                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `sidebar.brand.name`         | ACAS.X 品牌字标                                                       |
| `sidebar.workspaces`         | 左侧业务树；以 `priority: -1` 阴影覆盖上游的 workspace/session 浏览器 |
| `sidebar.panellist` + `main` | 业务模块入口与它打开的主面板                                          |
| `conversation.hero.headline` | 按当前会话 preset 显示「主对话 / 日常监管 / 心盾」                    |
| `conversation.hero.preview`  | 「预览版」按钮；点击打开 MCP 与 Skills 能力弹窗                       |

### Hero 标题与能力弹窗

`ui-conversation` 的 hero 标题和“预览版”徽标原本是写死的；上游现在提供两个 `session-maybe` 单槽，本包占用后接管渲染：

- `conversation.hero.headline`：读取当前会话的 `projectionValues.agentPreset`，把 `standard` 映射成「主对话」、`richang-jianguan` 映射成「日常监管」、`xindun` 映射成「心盾」，未知值回退到「主对话」。
- `conversation.hero.preview`：渲染与徽标同形的按钮，点击后用 antd 6 `Modal` 展示当前会话的 MCP 与 Skills。

Skills 走现成的 `skills/list` Remote。MCP 当前从 `agentPresets/read` 返回的 preset 组合 YAML 中解析 `mcp-client` 行，因此只覆盖 preset 声明的服务器；profile 全局 MCP 行、运行时连接状态和实际工具列表尚未纳入。后续需要精确到会话作用域时，应在 `acasxScenario` 增加按 `sessionId` 查询 Host scope 的 Remote，而不是继续扩展 YAML 解析。

本包同时验证 antd 6 与 UnoCSS：antd 6 与 React 18.3 兼容，不要求升级 React 19；UnoCSS 由 `tsdown.config.ts` 中的构建插件扫描 `src/**/*.{ts,tsx}` 生成 CSS，并通过 `virtual:acasx-uno.css` 在执行期注入 style 标签。当前 `lib/client.js` 约 4.9 MB（gzip 约 0.9 MB），后续应评估把 antd 弹窗改为按需动态加载。

### 为什么用低优先级阴影，而不是禁用 `ui-workspace`

`ui-workspace` 同时是 `uiWorkspace` 服务的提供者，`ui-sidebar`、`ui-conversation` 等十余个客户端插件都注入该服务。禁用它会让这些插件全部停在 pending，界面无法加载。

`sidebar.workspaces` 是 `single` 槽位：同一 `priority` 下重复注册会抛错，不同 `priority` 之间是阴影关系，**最低者渲染**。因此本包保留上游 `ui-workspace` 继续提供服务，只在更低优先级占住渲染位。

<a id="current-state"></a>

## 当前状态

左侧业务树的罪犯名单仍是组件内的 mock（11 名罪犯、每名固定三个模块），尚未接入业务后端。会话已经接真实 dsh 数据：展开一个（罪犯, 场景）节点时，浏览器先向 Host 解析该场景的工作目录，再用 `useSessions` 按 `cwd` **全等**过滤出属于它的会话行。

Host 半边提供 `acasxScenario.workspacePath` Remote 方法，把（罪犯 id, 姓名, 场景）解析成 `$DSH_HOME/workspaces/<id>-<姓名>/<场景>` 的绝对路径并按需创建目录。浏览器半边的 `＋` 先复用同场景下已有的空白会话；没有空白会话时按此链路新建：

```text
resolveScenarioWorkspace → ctx.workspaces.create({ path }) → ctx.remote.session.create({ workspaceId, agentPreset }) → ctx.sessions.refresh() → ctx.uiWorkspace.openSession(sessionId)
```

场景目录要先注册成 Workspace：只给 `cwd` 的会话没有归属 Workspace，会话页会停在“选择工作区”并禁用输入。`remote.session.create` 直接走 Remote，会绕过客户端 SessionManager 的本地记录，所以创建后要主动 `sessions.refresh()` 把 Host 权威列表拉回来，新会话行才会出现。创建或复用后侧栏会展开对应场景，并按当前主视图会话显示选中态。

顶部「主对话」是全局单例会话，固定在 `$DSH_HOME/main-conversation`：首次使用时创建或复用它唯一的空白会话，之后始终打开同一条会话；创建与复用都固定 `standard` preset，保证 hero 标题始终是「主对话」。空会话时正常发起对话，有历史时直接加载并继续；它不提供新建入口，也不参与罪犯场景的 `cwd` 过滤，因此不会归入日常监管或心盾。代码中以 `MainConversationPanel`、`MainConversationSession` 和 `MainConversationController` 独立建模，不与其他场景共用类型。

场景到 agent preset 的映射：日常监管 → `richang-jianguan`，心盾 → `xindun`。这两个 preset 是产品内部组合（`hidden: true`），不出现在用户可见的 Agent 预设下拉或设置 roster 里；它们只通过侧栏场景发起，会话头部/芯片按 `name` 显示“日常监管 / 心盾”。

### 账号登录与多账号隔离

桌面端在启动 Host 之前显示 ACAS.X 账号登录窗口。每个账号使用独立的 `DSH_HOME` 和 `DSH_AGENTS_HOME`，共用随包的 `desktop` profile；会话、设置、凭据和工作区数据按账号隔离。侧栏底部注册账号入口，显示当前账号并提供“切换账号”；Web 环境不渲染该入口。共享账号核心、桌面加载页、切换流程和 Web 调试适配器见 [docs/accounts.md](docs/accounts.md)。

### Host 与 Remote 接线

本包是双面包。Host 半边 `src/index.ts` 注册 `acasxScenario` Cordis 服务并导出 `./typert`、`./remote` 生成产物；浏览器半边导入生成的 `/remote` 贡献、用 `ctx.remote.$mount()` 自挂载，再注册界面。命名空间由本包自挂载而不是加进 `api-remotes` 外观，是为了避免 `api/remotes → acasx → ui-workspace → api/remotes` 的工程引用环。

场景目录落在 ACAS.X 自己的产品 home 下：产品启动入口把空的 `DSH_HOME` 兜底成 `~/.acasx`（官方 dsh 仍是 `~/.dsh`，显式 `DSH_HOME` 优先），因此实际路径是 `~/.acasx/workspaces/<id>-<姓名>/<场景>`。

<a id="productization"></a>

## 产品化技术方案

本包当前实现只用于验证 dsh 的接入机制，不是产品代码基线。工程化基线、功能扩展、登录接管与上游破坏性升级的完整评估见 [docs/productization-assessment.md](docs/productization-assessment.md)。

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

本包是桌面交付的产品面，不是通用上游包。新增产品行为应优先落在本包和 acasx 自有文档中，避免把产品分支扩散到上游 UI 包。Linux 打包、运行时准备、Office 引擎和启动修复的文件职责见 [docs/desktop-packaging-and-runtime.md](docs/desktop-packaging-and-runtime.md)。

</details>

## Model Experience

None, as this package registers product UI slots and a scenario-path Remote service without contributing model context or Session events.

#### KV Cache effect

None. The scenario-path Remote resolves paths and creates directories; it does not assemble or mutate model requests.

## Known Limitations and Deferred Work

- 罪犯与模块数据需要改为来自业务后端；现状用 cwd 反推会话归属，业务阶段应改为我们自己的 `sessionId → (罪犯, 场景)` 映射。
- 右侧「档案完整度」面板尚未实现，计划通过 `sidebarRightTabs` 注册一个新的 tab 类型。
- 模型对话需要可用的 `DEEPSEEK_API_KEY` 或模型网关；缺少凭据时发送消息会得到 `ACCOUNT_SIGN_IN_REQUIRED`。
- 已有演示账号可能保留历史系统默认工作区记录；全新账号只创建主对话与场景工作区。
