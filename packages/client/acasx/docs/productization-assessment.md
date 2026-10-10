---
description: 'ACAS.X 在 DeepSeek Harness 上产品化的接入机制评估：工程化基线、功能扩展、登录接管与破坏性升级应对。demo 仅作机制验证，不作产品代码基线。'
kind: 'technical-plan'
---

# ACAS.X 基于 DeepSeek Harness 的产品化技术方案

## 0. 文档定位与评估口径

当前仓库里的自定义实现（品牌字标、左侧业务树、业务模块主面板、右侧「档案完整度」tab）只用于回答一个问题：**dsh 能不能被改造成 ACAS.X 的产品外壳**。它属于机制验证（PoC），不是产品代码基线。

因此本文**不评价 demo 的界面细节、mock 数据、内联样式或硬编码文案**：这些会随产品化整体重写，讨论它们没有意义。

本文评估的是**接入方式本身**：

- 这种方式给我们什么样的工程化能力，缺什么才能真正支撑产品交付；
- 后续业务功能、业务后端、权限体系应该落在 dsh 的哪些扩展点上；
- 自建登录、绕过 dsh 登录分别意味着什么，代价和边界在哪；
- 上游 dsh 发生破坏性更新时，我们的自定义内容会不会阻塞升级，怎么把成本压到可控。

评估基线：fork 当前与 `upstream/master` 同步（`git rev-list --left-right --count` 为 `0 0`），自定义内容集中在 `packages/client/acasx/`，另有 5 个上游文件被加了 18 行、删 0 行。

> 一句话结论：**接入方向正确，当前只是原型；真正决定未来升级痛感的不是 demo 代码，而是三件事——组合方式（改上游还是自定义 bundle/profile）、接入面收敛程度、以及有没有兼容测试与升级门禁。**

## 1. 结论摘要

| 问题                       | 结论                                                                                                                                                     | 主要依据                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 这种接入方式适合产品开发吗 | 方向成立，但需要从「改上游外壳」升级为「自定义 bundle + 产品包」的正式组合方式                                                                           | 自定义面小、边界清楚；但组合仍写在上游 `web-app` 里，需要收敛                |
| 功能扩展支持如何           | 客户端槽位 + Host 侧 capability seam 基本覆盖 ACAS.X 的功能形态；缺的是业务数据层、会话关联、模块化 preset，不是扩展点                                   | dsh 的扩展点覆盖 UI、工具、命令、Remote API、Agent preset、子代理等          |
| 自建登录 / 绕过 dsh 登录   | 本阶段登录暂缓，按单 operator 运行并预留身份接口；将来由 ACAS BFF 持有用户登录，每用户一个隔离的 dsh 运行时，dsh 自带登录退化为内部传输保护              | dsh 是单 operator；会话/沙箱/凭据按 `$DSH_HOME` 隔离；BrowserAuth 可原样保留 |
| 破坏性更新会严重阻塞升级吗 | 现在几乎零成本；只要采用「组合覆盖 + 单一接入适配层 + 兼容测试」就不会严重阻塞。不治理则有三处放大风险：直改上游 bundle/tsconfig、无兼容测试、锁文件噪音 | 上游按行 id 打补丁、非破坏性 patch 语义、官方 upgrade guide 机制             |
| 当前最该做的三件事         | ① 把组合改到自定义 bundle/profile；② 给产品包自建 locale 字典与测试；③ 固化「上游触碰清单 + 升级 runbook」                                               | 详见第 3、6、7 节                                                            |

## 2. 现状：这套接入方式实际用了什么机制

### 2.1 仓库与上游关系

- 本仓库是 DeepSeek Harness 的 fork，`upstream` remote 指向 `deepseek-ai/deepseek-harness`，`origin` 是我们自己的仓库。
- 当前 fork 与 upstream 无提交级分叉，自定义内容基本以「一个新增包 + 少量上游文件改动」的形式存在。
- 上游处于 developer preview：公开 API 会破坏性变更，并按约定记录 upgrade guide；Session 持久化格式用单调递增的 `SESSION_FORMAT_VERSION` 和相邻迁移管理。

这条基线很重要：**现在的升级成本低，不是因为 dsh 稳定，而是因为我们的侵入面还很小。** 一旦自定义内容开始往上游包和持久化格式里生长，结论会变。

### 2.2 自定义包与上游侵入面

自定义代码集中在 `packages/client/acasx/`（`@deepseek-ai/dsh-client-acasx`），源码约 9 个文件、约 550 行，全部是客户端展示层，Host 侧只有一个空的 `apply()` 让 Loader 能挂载。

对上游文件的改动总共 5 个文件、18 行新增：

| 上游文件                                   | 改动                                                     | 性质         | 升级风险                                       |
| ------------------------------------------ | -------------------------------------------------------- | ------------ | ---------------------------------------------- |
| `packages/bundle/web-app/cordis.patch.yml` | 插入 `acasx` 行；禁用 `ui-plugin-manager`、`ui-schedule` | 组合声明     | 中：上游改行 id 只会告警，但组合语义要靠人看   |
| `packages/bundle/web-app/package.json`     | 声明 `@deepseek-ai/dsh-client-acasx` 依赖                | 组合依赖闭包 | 中：客户端插件必须进依赖闭包，否则桌面端不出现 |
| `tsconfig.base.json`                       | 加 2 条 `paths`                                          | 构建映射     | 低：上游改构建结构时冲突                       |
| `tsconfig.client.json`                     | 加 1 条 project reference                                | 构建拓扑     | 低：同上                                       |
| `.gitignore`                               | 忽略 `.acasx-dev-home/`                                  | 本地开发     | 极低                                           |
| `pnpm-lock.yaml`                           | 401 行变更（含无关依赖漂移）                             | 依赖锁       | 高：合并冲突与误升级的主要噪音源               |

结论：**上游侵入面本身很小，问题不在行数，而在「改动写在哪个层」。** 组合声明的正式承载方式应该是自定义 bundle/profile，而不是直接改 `dsh-web-app`。第 7 节给出目标结构。

### 2.3 demo 验证过的机制

demo 虽然简单，但它验证了下面这些**机制可用**，这些是未来产品化真正依赖的东西：

1. **自定义客户端插件可以被组合加载**：通过 `package.json` 的 `dsh.client` 声明平台、注入依赖和 `./client` 产物，被 web 客户端 Boot Graph 扫描并激活。
2. **品牌类单槽位可整体替换**：`sidebar.brand.name`。
3. **单槽位可以用更低 `priority` 做阴影覆盖**：`sidebar.workspaces` 以 `priority: -1` 遮挡上游 workspace 浏览区，同时保留上游 `uiWorkspace` 服务继续被其他插件注入。这是「替换视图但不禁用服务」的正确手法。
4. **主面板可以用 keyed 槽位 + list 入口注册**：`main` 配 `sidebar.panellist`。
5. **右栏可以注册新的 tab 类型与主体**：`ctx.sidebarRightTabs.register` + keyed `sidebar.right.pane.tab`。
6. **构建期产品化注入可行**：通过包内脚本注入 `DSH_CLIENT_TITLE`，不改上游构建逻辑。

### 2.4 demo 没有验证的部分

以下内容 demo 完全没有覆盖，产品化时必须重新设计，不能把 demo 当作参考实现：

- 真实业务数据接入与分层（组件不直连后端）；
- `sessionId → (罪犯, 模块)` 的持久化关联与并发生命周期；
- 多模块 agent preset 与能力隔离；
- 登录、身份、权限、组织/监区数据；
- 多用户或并发使用；
- 加载态、空态、错误态、可访问性；
- 国际化文案、设计 token；
- 单元/e2e/snapshot 测试；
- 打包、发布、版本策略；
- 真实的上游升级演练。

## 3. 工程化评估

### 3.1 判断

**接入机制是工程化的；demo 不是交付基线。**

Cordis 的插件模型、effect 可卸载、profile/bundle 分层、客户端槽位声明合并，这些给了我们一套「不 fork 核心也能改产品」的正规通道。真正要做的是把产品开发规则建立在这套通道上，而不是继续用「改上游文件 + 组件内 mock」的方式往前堆。

### 3.2 已经具备的工程化要素

- **边界清楚**：产品代码只在 `packages/client/acasx/`，业务代码不写进上游包。
- **注册即 effect**：所有槽位注册都通过 `ctx.slots.inject` / `ctx.effect` 返回 disposer，插件卸载即回收。
- **依赖显式声明**：`inject`、`dsh.client.inject`、bundle dependencies 三处都显式写明，漏一处会在特定平台暴露。
- **构建分层**：`build:lib:client` 走 `tsconfig.client.json` + tsdown，产物是闭包工厂形式的客户端 bundle。
- **开发隔离**：`DSH_HOME` 固定到仓库内 `.acasx-dev-home`，不污染真实用户数据。

### 3.3 成为产品基线必须补的工程规则

| 规则                                          | 上游机制                                                                        | demo 状态                       | 产品阶段要求                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| 产品包必须有测试，且满足 per-file 100% 覆盖率 | `vitest.config.ts` 的 `include: packages/*/*/src/**/*.{ts,tsx}` + per-file 100% | 无测试                          | 产品包每个源文件自带单测；CI 才能通过 `test:coverage`               |
| 产品文案必须走 locale 字典                    | `verify-client-ui-i18n` 扫 `packages/client/*/src/**/*.tsx`                     | 26 处硬编码（已实测被门禁拦截） | 建 `locales.ts`/`locale.ts`，组件只接收 `t` 或已本地化 prop         |
| 业务数据访问必须分层                          | dsh Remote API / Host Service 机制                                              | 组件内 mock                     | 组件 → 客户端服务 → `ctx.remote.*` → Host Service → 业务后端        |
| 组合改动必须落在自定义 bundle/profile         | profile 叠加 bundle patch 层                                                    | 直改 `dsh-web-app`              | 新建 `@deepseek-ai/dsh-acasx-app` bundle，承担插入与禁用行          |
| 锁文件不得无关漂移                            | pnpm workspace                                                                  | `pnpm install` 带入无关版本升级 | CI 用 `--frozen-lockfile`；日常安装后只提交与自定义相关的 lock 变化 |
| 每个导出有 JSDoc、文件一个结尾换行            | `verify-export-jsdoc`、pre-commit                                               | 基本满足                        | 继续遵守上游门禁，产品包与上游同标准                                |
| 业务分类不得进持久化格式                      | SessionHeader 是持久化契约                                                      | 已明确不塞                      | `sessionId → (罪犯, 模块)` 存在我们自己的存储                       |

这里特别说明两条容易被误判为「demo 问题」、其实是**接入方式的固有要求**：

- 覆盖率门禁：`packages/*/*/src` 会被 V8 coverage 强制纳入，即使没被任何测试 import 也会以 0% 计入。只要自定义包放在 `packages/client/acasx/`，产品阶段就必须自带测试，否则 CI 必红。
- i18n 门禁：客户端 UI 文案由 locale 字典独占，这是仓库级决策，不是 demo 的风格问题。产品化重写时必须在产品包里建字典，否则同样过不了门禁。

## 4. 功能扩展支持评估

### 4.1 扩展点地图

dsh 的扩展原则是「新行为挂到已文档化的扩展点」，而不是改 agent loop。对 ACAS.X 的规划，可以按下面的落位来设计：

| ACAS.X 需求                            | 推荐机制                                                                                          | 归属层                   | 备注                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| 品牌字标 / 骨架                        | `sidebar.brand.name`、`sidebar.brand.mark`                                                        | 客户端槽位               | 单槽位，可阴影覆盖                         |
| 左侧业务导航（罪犯 / 模块）            | `sidebar.workspaces` 阴影覆盖，或 `sidebar.workspaces.session.menu.item` / `.row.action` 增量注册 | 客户端槽位               | 见 4.3 的取舍                              |
| 业务模块主面板                         | keyed `main` + list `sidebar.panellist`                                                           | 客户端槽位               | 已由 demo 验证                             |
| 右侧档案 / 详情面板                    | `ctx.sidebarRightTabs.register` + keyed `sidebar.right.pane.tab`                                  | 客户端服务 + 槽位        | 已由 demo 验证                             |
| 会话列表 / 新建 / 重命名               | 上游 `ui-workspace` 的会话服务与 row slots                                                        | 客户端槽位 / 服务        | 整块阴影会丢掉这些能力                     |
| 业务后端数据                           | 自定义 Host Service + 生成的 Remote API（`adding-a-remote-api`）                                  | Host seam + 客户端消费   | 组件不直连后端                             |
| 模型可见业务能力（查询档案、比对矛盾） | `ctx.tools` 注册工具                                                                              | Host seam                | 新工具要同时设计 UI presenter              |
| 业务动作 / 快捷指令                    | `ctx.commands`                                                                                    | Host seam                | 不产生模型回合                             |
| 模块差异化能力（日常监管 / 心盾）      | agent preset + `systemPrompt` section + 每 preset 的 isolate realm                                | 组合配置                 | 用 preset 表达能力差异，不塞 SessionHeader |
| 长任务 / 定时 / 子代理                 | `ctx.jobs`、`schedule`、`ctx.subagent`                                                            | Host seam                | 后台任务与工作流已有承载                   |
| 外部系统连接                           | MCP / webhook / 自定义 provider                                                                   | Host seam                | 优先 MCP，不自造协议                       |
| 设置项 / 权限策略                      | settings section、`ctx.settings`                                                                  | Host seam + 客户端设置卡 | 部署差异走配置，不硬编码                   |
| 登录 / 身份                            | 见第 5 节                                                                                         | 传输层 / 账号层          | 单 operator 是核心约束                     |

### 4.2 路线图落位建议

按「先数据、再能力、后身份」推进，避免在 UI 上加更多 mock：

1. **数据层先行**：定义 ACAS.X Host Service（罪犯、档案、模块、会话归属），注册 Remote API；客户端只通过服务读数据。
2. **会话关联**：用 `sessionId → (罪犯, 模块)` 映射接入真实 dsh 会话；新建会话时按模块选择 agent preset。
3. **能力层**：把「规则试算」「矛盾核对」「干预建议」做成工具 + preset + 提示词分段，而不是写死在页面里。
4. **身份层（暂缓）**：本阶段只预留 `IdentityService` 与 `ownerId` 字段，不实现登录；出现多人使用、非受信网络或按用户审计需求时，再按第 5 节实现 BFF 登录与「用户 → dsh 运行时」路由。

### 4.3 阴影覆盖 vs 增量注册的取舍

demo 用 `priority: -1` 整块阴影覆盖了 `sidebar.workspaces`。这个手法本身是对的（替换视图、保留服务），但它有一个产品级代价：**上游 workspace 浏览区的全部能力同时消失**，包括目录选择流程、会话搜索、重命名/归档/置顶、会话行操作等。

产品阶段有两条路：

- **整体接管**：我们自己实现罪犯/模块/会话的完整浏览与操作。自由度最高，但要重新实现上游已有能力，且上游每次改会话交互我们都要跟。
- **增量扩展**：保留上游 `ui-workspace` 浏览区，用 `sidebar.workspaces.session.menu.item`、`sidebar.workspaces.session.row.action` 等 list 槽位增加业务动作，把「罪犯/模块」作为筛选维度或会话元数据表达。升级成本最低，但交互形态受上游约束。

建议：**除非产品明确要求完全不同的导航模型，否则优先增量扩展**；整体接管时应把「需要上游哪些能力」列成清单并纳入兼容测试。

## 5. 登录与身份接管方案（单服务、多用户）

### 5.1 目标拓扑与关键区分

目标已经明确：**后台只部署一个服务，用户从 Web 或 App 登录同一个账号体系**，不是一人一个部署。用户身份由 ACAS 服务负责，dsh 不直接面向终端用户做登录。

当前状态补充：这套部署暂时没有启用任何登录，终端用户直接访问 dsh Web 端，dsh 以本机唯一 operator 运行。因此后续不是「替换 dsh 已有的账号登录」，而是**从零引入 ACAS 身份**——既没有现成账号模型挡路，也没有现成的按用户隔离可以直接复用。

本阶段决策：**登录暂缓，先不做。** 在登录落地之前，系统按单 operator、单 `$DSH_HOME` 运行，只允许在受信网络/本机范围内使用，不对多用户开放。第 5.9 节给出这个阶段的预留要求，保证将来补登录不是重写。

这里必须区分两个概念，否则方案会选错：

- **部署单元**：只有一个服务，这是我们对外运维的对象；
- **运行时隔离单位**：不能也只有一个。dsh 的 Web Host 是单 operator 模型，Session 目录、文件沙箱、凭据存储、浏览器 cookie 全部挂在同一个 `$DSH_HOME` 下。

把所有登录用户塞进同一个 dsh 运行时，会出现跨用户的会话可见、文件可见、凭据共享；对罪犯档案、监管数据这类场景不可接受。所以正确的问题不是「怎么让一个 dsh 服务多个人」，而是**一个 ACAS 服务如何管理「每用户一个 dsh 运行时」**。

### 5.2 为什么「一套服务」不等于「多租户」

容易混淆的地方在于：ChatGPT 这类产品也是一套后端服务，A 登录只看得到 A 的会话，B 只看得到 B 的。它靠的不是「一套服务」这个事实，而是**服务端每一层都带用户身份做数据隔离**：session 表有 `user_id`，列表查询永远带 `WHERE user_id = ?`，文件存储按用户分区，鉴权在任何 API 入口统一执行。多租户是它代码里的设计。

dsh 不是这种结构。它的单进程 Web 服务，本质是「本机单用户运行时 + 一个把本地浏览器接进来的 HTTP 通道」，不是「多用户 SaaS 后端」：

- `$DSH_HOME` 是它的租户边界，而它只有一个租户；
- Session 存储没有 owner 字段，列出会话就是扫描这个 home 下的全部会话；
- 浏览器 cookie 表达的是「你有权使用这个 Host」，不是「你是谁」；
- 文件沙箱、凭据存储、匿名 id 都是 home 级，没有按用户分区的概念。

所以 dsh 是**多 Session、单租户**：一个进程里可以有很多会话，也能一次跑很多 agent，但它没有任何地方记录「这个会话属于谁」，也没有「列出某用户的会话」这种 API。

在我们自己的登录前再想一层：我们的登录只认证了「浏览器 → ACAS 服务」这一段。如果 ACAS 服务随后仍把 A、B 路由进同一个 dsh 运行时，那么 dsh 拿到的事实还是「一个 operator 在用我」，它不知道 A 和 B 是两个人，也就无从隔离。跨用户混在一起的会是：聊天历史、上传/缓存的材料、工作区文件、模型请求日志、模型凭据。业务库里的罪犯/档案数据可以被我们后端鉴权，但这些会话与文件一样是敏感数据。

因此，给我们自己的登录「接上 dsh」有两条本质不同的路：

1. **把 dsh 改造或包装成多租户运行时**：让用户身份进入 dsh 的每一次存储与 API 调用，会话按用户分区、文件与凭据按用户隔离、审计按用户归属。这是给 dsh 补一个它本来没有的能力，改动面覆盖 core、session、fs、credentials 与传输层，且会被上游破坏性更新反复冲击。
2. **让 dsh 保持单租户，一个用户一个运行时**：隔离边界就是进程/容器与 `$DSH_HOME`，用户身份由 ACAS BFF 持有并负责路由。对外仍然是一个服务，对内存的是 N 个互相隔离的运行时。这就像一台数据库服务器对外是一个服务、对内管理多个独立 database。

本文推荐第 2 条。它看起来「多进程」了，但这是把 dsh 已有的隔离边界用足；第 1 条才是真正昂贵且不稳定的选项。

### 5.3 dsh 现有三层认证

必须先把三层分开：dsh 自带登录、平台账号登录、模型凭据不是一回事。

| 层                            | 机制                                                                                                | 作用                                                          | 我们的处理方式                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 传输层会话认证（BrowserAuth） | 进程启动 token → `HttpOnly` 签名 cookie；密钥存 `$DSH_HOME/.credentials.yaml`；`Host`/`Origin` 校验 | 保护该 Host 的 RPC / WebSocket，防止 DNS rebinding 与跨站请求 | **保留，但只作为服务内部保护**，由 BFF 持有，不面向终端用户 |
| 平台账号层（Account）         | DeepSeek Platform 登录（浏览器授权/PKCE），`api-account-controller` + `ui-settings-account`         | 为 `deepseek-account` 模型路由提供凭据                        | **禁用/替换**，不让用户登录 DeepSeek                        |
| 模型凭据层（LLM credential）  | `llm-deepseek-api-key` 或 `llm-deepseek-account`                                                    | 每次模型请求解析真实凭据                                      | **切换到我们自己的模型网关**                                |

传输层的关键事实（来自 `packages/client/connection/README.md`）：

- 每个 dsh 进程随机生成 launch token，`?token=` 在 `GET /` 换成 authority 绑定的签名 cookie；
- cookie 默认 30 天，`HttpOnly` + `SameSite=Strict`，但不带 `Secure`（默认 loopback HTTP）；
- **没有 logout 操作**：要让一个运行时失效，需要删凭据并重启该运行时；
- `dsh web --host 0.0.0.0` 不支持，运行时必须 loopback 或显式配置 `trustedHosts`；
- **每个已认证请求代表同一个 Peer：operator**，dsh 本身不区分用户。

### 5.4 单服务多用户的候选架构

| 方案                                        | 用户隔离                                        | 前端                    | dsh 用法             | 成本                   | 结论                               |
| ------------------------------------------- | ----------------------------------------------- | ----------------------- | -------------------- | ---------------------- | ---------------------------------- |
| 1. BFF + 每用户 dsh 运行时，保留 dsh Web UI | 每用户独立 `DSH_HOME` 与进程/容器               | 反代 dsh Web UI         | 每用户一个 Web Host  | 中；需要运行时池与代理 | **近期推荐**，能保留现有槽位 UI    |
| 2. BFF + 每用户 dsh 运行时，自建前端        | 同上                                            | 我们自己的 Web/App 前端 | dsh 走 SDK/headless  | 中高；要重做 UI        | Web 与 App 统一体验时推荐          |
| 3. 单 dsh 运行时多用户共享                  | 无，或用自定义 sandbox/fs/credential 按用户隔离 | 自建前端                | 一个 Host 多 Session | 安全成本最高           | **不推荐**：共享沙箱与凭据，风险大 |
| 4. Fork dsh 增加多租户                      | 改核心身份与持久化                              | 任意                    | 单 Host 多租户       | 最高，且被上游反复打破 | **不推荐**                         |

四种方案的共同点是：**用户登录都由 ACAS BFF 负责**。区别只在 dsh 运行时怎么组织、以及前端是否复用 dsh 的 Web UI。

方案 3 有一个需要说清的边界：如果 ACAS 的智能体**只调用业务 API 工具**，不向模型暴露通用文件系统、shell、终端等能力，那么「单运行时多 Session」在数据隔离上是可评估的——跨用户风险主要剩会话/日志可见性与资源竞争，而这两点可以由自建前端和服务端路由控制。反过来，只要需要文件、命令执行、代码执行或材料上传到共享工作区，就必须回到方案 1/2 的每用户运行时隔离。不要把方案 3 和复用 dsh Web UI 组合：dsh 自己的会话列表会把同一运行时下所有人的会话暴露出来。

### 5.5 推荐架构：ACAS BFF + 每用户 dsh 运行时

```text
  Web / App
     │  账号登录（SSO / 密码 / 验证码）
     ▼
  ACAS 服务（唯一部署单元）
     │  用户会话、权限、组织、业务数据、模型审计
     │  用户 ──► 运行时路由表（服务端持有，客户端不可自选）
     ▼
  每用户 dsh 运行时（进程或容器，独立 DSH_HOME，loopback）
     │  BrowserAuth 仅限本机，token/cookie 由 BFF 持有
     ▼
  模型网关（统一凭据，按用户带审计标识）
```

工作方式：

1. 用户在 Web/App 登录，ACAS 服务签发自己的会话（JWT/Cookie），这是唯一的用户可见登录；
2. 服务按 `userId` 分配或复用该用户的 dsh 运行时，运行时自己的 `$DSH_HOME`、会话、文件沙箱互相隔离；
3. BFF 在运行时首次就绪时完成 dsh 的 launch token → cookie 交换，把 cookie 存在服务端会话里；终端用户永远看不到 dsh 的 `?token=`；
4. 浏览器只与 ACAS 服务通信；若保留 dsh Web UI，由 BFF 反向代理到该用户运行时的 loopback 端口并注入该用户的 cookie；
5. 用户登出时回收 BFF 会话，dsh 运行时按策略保留或销毁；
6. 模型请求统一经 ACAS 模型网关，凭据由服务持有，按用户/会话/罪犯记录审计。

这条路径同时满足两点：**用户登录完全是我们自己的**，而 **dsh 自带登录不需要被改**——它退化成服务内部的传输保护，从用户视角看就是「绕过」了。

### 5.6 运行时池的关键工程问题

- **生命周期**：首次登录或首次创建会话时分配；空闲超时回收；回收前要落盘会话数据，恢复时保持 `sessionId → (罪犯, 模块)` 映射不变。
- **资源上限**：每个活跃用户一个 Node 进程，需要按并发在线数设定内存、进程数与排队策略；不能假设「一个服务 = 一个进程」。
- **端口与信任**：运行时只监听 loopback，只允许 BFF 访问；`trustedHosts`/`Origin` 必须与代理一致。
- **权限**：`userId → runtimeId` 的映射只存在服务端；客户端传入的任何运行时/会话标识都必须经服务端鉴权，防止越权访问他人会话。
- **升级**：运行池整体升级，需要有 drain、灰度与回滚；运行中的会话要能迁移或等待结束。
- **审计**：dsh 的匿名 id 是 home 级、不标识用户；用户级审计由 BFF 与模型网关承担，不要依赖 dsh 自身。

### 5.7 模型凭据

在 profile/patch 里禁用或替换 `deepseek-account-platform`、`api-account-controller`、`ui-settings-account`、`llm-deepseek-account`；保留 `llm-deepseek-api-key`（或写自定义 LLM adapter），把 `apiKeyEnv`/`baseURL` 指向我们的网关。

模型 credential 建议由 ACAS 服务统一持有，按请求携带用户标识做审计；除非合规要求，不需要每用户一份 key。这样凭据轮换只在一处发生。

### 5.8 不建议的路线

- 不要让多个真实用户共享同一个 dsh 运行时的文件沙箱与凭据存储；
- 不要在 developer preview 阶段 fork `BrowserAuth`/Peer 模型去做多租户，这会与上游破坏性更新持续冲突；
- 不要把「用户身份」塞进 SessionHeader 等持久化格式，用户归属应存在 ACAS 服务自己的存储里。

### 5.9 登录暂缓阶段的约束与预留

登录不做，不等于身份问题可以忽略。这一阶段的目标是：**功能可以按单用户前进，但身份必须被当作一个尚未实现的接口预留出来**，否则将来补登录会变成跨层重写。

- **运行假设**：单 operator、单 `$DSH_HOME`、受信网络访问。绝不把当前形态直接开放给多个真实用户，因为它没有隔离。
- **预留身份接口**：在 ACAS 服务层定义 `IdentityService`（当前用户、角色、权限、数据范围）这一概念，现阶段只有「本地操作员」一个实现。业务数据查询、工具调用、审计都通过它取当前身份，而不是到处写死「单人」。
- **预留存储字段**：`sessionId → (罪犯, 模块)` 的记录预留 `ownerId`（现阶段为单例或空值）。将来接登录时只需填值，不改表结构；同时仍然不要把它写进 dsh 的 SessionHeader。
- **预留服务分层**：业务数据统一走 Host Service + Remote API，组件不直连后端。登录上线时，鉴权与用户范围只在服务层加一次。
- **UI 不固化账号概念**：现阶段不把账号、角色、组织做成写死的产品文案；界面上的「管理员」等占位要么去掉，要么明确是演示状态。
- **触发条件**：一旦出现「多人同时使用」「暴露到非受信网络」「需要按用户审计或授权」中的任意一条，就必须先上登录与运行时隔离，再开放使用，不能靠上线后补。

## 6. 破坏性升级影响与升级支持

### 6.1 上游的兼容性承诺

- 上游是 developer preview：公开 API 预稳定，会破坏性变更。
- 但上游有正式的变更管理：外部可感知的破坏性变更会写 `docs/upgrade-guide/`；Session 格式用单调版本 + 相邻迁移，`SCHEMA_VERSION` 只增不减，历史 generation 不重写。
- patch 按行 id 生效：补丁命中的行不存在时**只打印警告**，不会让整个启动失败。
- 客户端插件之间**没有 API 版本协商**：上游改了槽位名、服务名、props 结构，不会在加载时报「版本不兼容」，而是表现为 import 失败、`pending (waiting for service)`、或运行期结构不匹配。**兼容测试是唯一可靠的早期信号。**

### 6.2 自定义面与升级风险矩阵

| 自定义面                                               | 依赖的上游契约                               | 上游破坏时表现                         | 风险 | 缓解                                                      |
| ------------------------------------------------------ | -------------------------------------------- | -------------------------------------- | ---- | --------------------------------------------------------- |
| `dsh.client` 清单 / 客户端 bundle 产物                 | `clientBundle` 预设、Boot Graph 格式         | 插件 import 失败、boot audit 报错      | 中   | 产品包自带构建 smoke；升级后先跑 `build:lib:client`       |
| `sidebar.brand.name`                                   | 单槽位名与 owner props                       | 品牌不显示或注册抛错                   | 低   | 注册测试断言槽位命中                                      |
| `sidebar.workspaces` 阴影                              | slot priority 语义（低者渲染、同优先级抛错） | 上游浏览区重新露出来，或注册冲突       | 中   | 兼容测试断言 `entries('sidebar.workspaces')` 选中的是我们 |
| `sidebar.panellist` / `main`                           | keyed/list 槽位与 `MainPanelId`              | 入口按钮缺失、面板打不开               | 中   | 断言注册表与 `layout.selectPanel`                         |
| `sidebarRightTabs` + `sidebar.right.pane.tab`          | 服务方法签名、tab 定义结构、keyed 槽位       | tab 不出现或面板为空                   | 中   | 单测 stub 服务并断言注册                                  |
| `inject` 服务名（`slots`/`layout`/`sidebarRightTabs`） | 服务名与提供者                               | 插件停在 pending，整片 UI 不激活       | 高   | 启动 smoke + boot audit                                   |
| 禁用上游行（plugin-manager / schedule）                | 上游行 id 与它们提供的服务                   | 行消失只剩警告；若被别处依赖则 pending | 中   | 改为自定义 bundle 承担；升级时核对被禁用行的服务          |
| `tsconfig.*` / bundle `package.json` 直接改            | 构建拓扑与依赖闭包                           | merge 冲突；桌面端插件不出现           | 中   | 改到自定义 bundle/profile；保留可检查的「上游触碰清单」   |
| Host 侧业务 Service / Remote API（未来）               | 服务注册、Typert 生成、wire 协议             | 编译失败或运行时 Remote 错误           | 中   | 用 `adding-a-remote-api` 正式流程 + e2e                   |
| Session 格式（未来）                                   | `SESSION_FORMAT_VERSION`、相邻迁移           | 日志读不了 / 迁移缺失                  | 高   | 不扩展 SessionHeader；业务数据放自有存储                  |

### 6.3 当前升级成本测算

- 提交级分叉：0。
- 上游文件侵入：5 文件 / 18 行新增 / 0 行删除（不含 lock）。
- 自定义代码：1 个包 / 9 个源文件 / 约 550 行，全部在客户端展示层。
- 因此一次上游 merge 的**理论人工成本**是「5 处小冲突 + 跑一次客户端构建」；**真实风险**来自没有被测试固定的槽位契约与依赖闭包，而不是代码量。

### 6.4 让升级从「人肉 merge」变成「门禁驱动」

目标是把「升级会不会坏」变成 CI 能回答的问题：

1. **上游触碰清单**：维护一份允许修改的上游文件 + 改动说明（现在的 `AGENTS_DBU.md` 是雏形）。可以进一步做成脚本：把当前工作树与 upstream 基线 diff，出现清单外文件即失败。
2. **接入适配层**：把上游槽位名、服务名、关键类型收口到产品包内一个 `integration` 模块，`apply.ts` 只调用该模块。上游改名时只改一处，且类型错误集中在编译期。
3. **兼容测试**：用 stub 的 `slots` / `layout` / `sidebarRightTabs` 跑一次 `apply`，断言注册的槽位、key、priority 与 def 结构。参考 `ui-deliverables` 等包的做法，不需要真实浏览器。
4. **启动 smoke**：`build:lib:client` + Boot Graph 加载，能捕获服务名/清单/产物层面的破坏。
5. **升级演练**：每个上游 release 走一次固定流程，把断点记录成 upgrade 记录，形成我们的升级知识库。

### 6.5 升级 runbook（建议固化为脚本）

1. `git fetch upstream && git merge upstream/master`（保留可追溯的合并记录，不用 rebase 重写已发布分支）。
2. 检查上游触碰清单冲突：`cordis.patch.yml` / bundle `package.json` / `tsconfig.*`。
3. `pnpm install --frozen-lockfile`，确认依赖闭包未变。
4. `pnpm run build:lib:client`，捕获客户端清单与 bundle 产物破坏。
5. 跑产品包测试 + 兼容测试 + 启动 smoke。
6. 跑相关上游门禁：`verify-client-ui-i18n`、`test:coverage`（产品包部分）、`doc-sync` 的相关子集。
7. 人工过一遍被禁用/覆盖的上游行：`ui-plugin-manager`、`ui-schedule`、`ui-workspace`。
8. 记录本次断点与修法；若上游修改了 Session 格式，按 upgrade guide 迁移。

## 7. 目标架构与实施路线

### 7.1 目标分层

```text
上游（不动或最小改动）
  dsh-base / dsh-web-app / client/ui-* / core/*
        ↑ 依赖（只读）
ACAS.X 组合层
  @deepseek-ai/dsh-acasx-app     ← 自定义 bundle：插入产品插件、禁用不需要的上游行
  profile `acasx`                ← 由 dsh 支持的 profile + patch 层承载，承载部署差异
        ↑
ACAS.X 产品层
  packages/client/acasx/*        ← 客户端 UI（槽位注册、locale、设计 token、测试）
  packages/.../acasx-*           ← Host Service / Remote API / tools / presets
        ↑
ACAS.X 服务与运维层
  ACAS BFF                       ← 用户登录、权限、业务查询、用户 → 运行时路由、模型审计
  运行时池                       ← 每用户一个 dsh 进程/容器（独立 DSH_HOME，loopback）
        ↑
业务后端（监区、罪犯、档案、权限、模型网关）
```

关键点：

- **组合层独立**：把 `dsh-web-app` 里的 `acasx` 行、被禁用行、bundle 依赖迁到 `dsh-acasx-app`，上游 bundle 文件恢复原样。
- **产品层独立**：客户端 UI、Host Service、Remote API、tools、presets 都在产品包内，通过扩展点接入。
- **部署差异走 profile/patch/配置**：模型网关、host、trustedHosts、cookie 时长等不写死在代码。
- 不可避免的最小上游触碰只剩构建拓扑（`tsconfig.*`）与 workspace 登记；这些进入「上游触碰清单」并被 CI 检查。

### 7.2 分阶段路线

| 阶段                    | 目标                             | 主要工作                                                                                                                                             | 退出条件                                                            |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P0 基线固化             | 把 demo 机制变成可维护的接入骨架 | 提交自定义改动；新建 `dsh-acasx-app` bundle 与 `acasx` profile；收敛上游触碰清单；产品包建 locale 字典与最小测试                                     | `build:lib:client` + 覆盖率 + i18n 门禁通过；上游文件改动只剩清单内 |
| P1 数据接入             | 去掉 mock，接业务后端            | ACAS Host Service + Remote API；`sessionId → (罪犯, 模块)` 存储；会话新建接 preset                                                                   | 端到端可创建/恢复会话；数据层有单测与 e2e                           |
| P2 能力扩展             | 规则试算、心盾、工具化           | tools + commands + presets + 提示词分段 + UI presenter                                                                                               | 每个模块有独立 preset 与可验收的模型行为                            |
| P3 身份与多用户（暂缓） | ACAS BFF 登录 + 每用户运行时池   | 登录暂缓，阶段内只预留 `IdentityService`、`ownerId` 字段与服务分层；触发条件出现后再启动 BFF 登录、用户 → 运行时路由、运行时池生命周期与模型网关审计 | 触发条件出现时可在不重写业务层的前提下补上登录与隔离                |
| P4 升级常态化           | 升级不再是项目，而是例行流程     | 兼容测试、启动 smoke、升级 runbook、上游触碰门禁、canary                                                                                             | 每次上游 release 可在固定工时内验证并合入                           |

## 8. 待决策问题

这几个问题会显著改变方案，建议在产品化启动前定下来：

1. **运行时隔离单位**：每用户一个进程，还是容器/沙箱？决定安全等级、单机并发上限与运维复杂度。
2. **前端归属**：用 BFF 反代保留 dsh Web UI 与槽位生态，还是自建 Web/App 前端、dsh 只走 SDK/headless？
3. **模型供给**：统一网关凭据，还是按用户/组织分账？决定审计与配额方案。
4. **上游节奏**：跟踪 master、固定 release tag，还是只跟安全修复？决定升级门禁的强度。
5. **业务身份与 dsh 会话的映射责任**：会话归属存在我们后端，会话数据在每用户 `DSH_HOME`；需要明确备份、迁移、删除、审计由哪一层负责。

## 附录 A. 本次评估用到的证据

- 架构与扩展点：`docs/architecture.md`、`docs/cookbook/extension-cookbook.md`、`docs/cookbook/adding-a-remote-api.md`。
- 客户端槽位契约：`packages/client/ui-sidebar/src/client/contract/slots.ts`、`packages/client/ui-layout/src/client/index.ts`、`packages/client/ui-workspace/src/client/contract/slots.ts`。
- 客户端加载与清单：`packages/client/modules/src/client/manifest.ts`、`packages/client/web/src/boot-client.ts`。
- 传输层认证：`packages/client/connection/src/browser-auth.ts`、`packages/client/connection/README.md`。
- 账号与凭据：`packages/api/account-controller/README.md`、`packages/llm/llm-deepseek-account/README.md`、`packages/llm/llm-deepseek-api-key/README.md`、`docs/subsystems/credentials.md`。
- 组合与补丁语义：`packages/boot/app-boot/README.md`。
- 版本与升级：`docs/session-format-status.md`、`docs/upgrade-guide/`。
- 门禁：`vitest.config.ts` 覆盖率配置、`scripts/verify-client-ui-i18n.ts`（实测拦截 26 处客户端硬编码文案）。
