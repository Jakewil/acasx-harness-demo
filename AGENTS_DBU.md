# AGENTS_DBU.md

本文件是 **ACAS.X 产品定制** 的协作规则，与根目录 [AGENTS.md](AGENTS.md) 并行生效。

`AGENTS.md` 是 DeepSeek Harness 上游的工程约定，仍然有效；本文件只补充 ACAS.X 自有的规则。两者冲突时，按更严格的一条执行，并在改动说明里写清依据。

## 项目定位

本仓库是 DeepSeek Harness 的 fork，用于把 dsh 打造成 **ACAS.X 综合智能体**：面向罪犯档案与监管/心盾/规则试算等业务场景的产品化实现。产品数据来自我们自己的业务后端，dsh 只作为会话与智能体运行时。

## 代码归属

- 产品代码**只放在 `packages/client/acasx/`**（包名 `@deepseek-ai/dsh-client-acasx`），业务代码不写进上游包。
- 需要新增依赖或修改上游文件时，先在本文件补一条原因说明，再动手。
- 在组合里挂载本包时，**必须同时把它声明为对应 bundle 的 `dependencies`**（`packages/bundle/web-app/package.json`）。只加 `cordis.patch.yml` 的 row 不够：桌面端与打包环境按依赖闭包扫描客户端插件清单，漏声明会让插件在桌面端完全不出现（web 端因 workspace 链接而看不出问题）。

## 文档与注释

- **注释、JSDoc、包 README、提交说明一律用中文**。
- 上游原有文件的英文注释保持原样，不做翻译，避免无意义的全仓改动。
- 对外可见的产品文案走 locale 字典，不硬编码在组件里。

## 侧栏与槽位（重要）

- **禁止禁用 `ui-workspace`**。它不只是 `sidebar.workspaces` 的占位者，同时提供 `uiWorkspace` 服务，`ui-sidebar`、`ui-conversation`、`ui-chat` 等十多个客户端插件都注入它；禁用它会让整片 UI 停在 `pending`。
- 要替换侧栏浏览区，请在 `sidebar.workspaces` 上**以更低的 `priority` 注册自己的占位者做阴影覆盖**。`single` 槽位按 `priority` 分档：同一档位重复注册会抛错，不同档位之间是阴影关系，**最低档位渲染**。
- 同理，任何"替换上游视图"的需求都优先考虑槽位阴影或行覆盖，而不是禁用提供服务的插件。

## 数据与会话

- **业务数据来自业务后端**。demo 阶段允许组件内 mock；接生产时把数据访问放进服务层或工具层，界面组件不直接发请求。
- 会话归属关系（罪犯、模块）保存在我们自己的存储里，用 `sessionId → (罪犯, 模块)` 映射关联。
- **不要把业务分类塞进 `SessionHeader`**——那是持久化格式，扩展它属于高风险变更，且会让上游版本读不了日志。
- 会话之间的能力差异用 **agent preset** 表达（如"日常监管""心盾"各一套 preset）。

## 依赖与构建

- 依赖安装只用 `pnpm install`，**不要手工编辑 `pnpm-lock.yaml`**。
- 该仓库没有配置自动安装（`.npmrc` 里 `verify-deps-before-run=false`），安装是显式动作。
- 改了客户端代码后跑 `pnpm run build:lib:client`；改了 host 侧跑 `pnpm run build`。
- 格式化用包内脚本：`pnpm --filter @deepseek-ai/dsh-client-acasx run format`（校验用 `format:check`）。oxfmt 只装在本包的 devDependencies，配置在 `packages/client/acasx/oxfmt.config.ts`，选项与根 `.oxfmtrc.json` 对齐（单引号、无分号、indent 2、`printWidth: 140`、行首运算符）。根 `.oxfmtrc.json` 只放行 `packages/client/acasx/**`，上游文件由 `.vscode/settings.json` 的 `source.fixAll.oxc` 在保存时做 oxlint 修复，保留原有折行。上游风格由根 `.oxlintrc.json` 的 `@stylistic` 规则约束；oxfmt 会重排 named import 等结构，不能用于上游文件。
- 产品侧组件库与原子 CSS 验证：antd 6 的 peer 是 React `>=18`，当前 React 18.3.1 可直接使用，**不升级 React 19**。UnoCSS 不能通过 `@unocss/vite` 作用于 acasx，因为客户端插件由 tsdown 生成、不经 apps/web 的 Vite 图；当前由 `packages/client/acasx/tsdown.config.ts` 的构建插件扫描 `src/**/*.{ts,tsx}`，生成 CSS 后经 `virtual:acasx-uno.css` 在执行期注入 style。同一配置把 `yaml` 强制解析到 `yaml/browser`，避免客户端 bundle 留下 `require("process")`。antd 与 UnoCSS 只允许放在 acasx，不得进入上游包；当前 antd 内联后 `lib/client.js` 约 4.9 MB（gzip 约 0.9 MB），后续应评估按需动态加载。
- 本地开发的 `DSH_HOME` 由 `.vscode/settings.json` 的 `terminal.integrated.env.*` 固定到仓库内的 `.acasx-dev-home`，对每个 VS Code 集成终端生效（build、test、dsh 命令全部继承）。不要用默认的 `~/.dsh` 调开发环境，也不要指望在 `.env` 里设 `DSH_HOME`——`loadLayeredEnv` 在读取 `.env` 之前就已经解析了 home，那条路无效。
- **产品 home = `~/.acasx`**：官方 dsh 安装用 `~/.dsh`，本 fork（ACAS.X）用自己的 `~/.acasx`，互不读写。dsh 的 skills（`$DSH_HOME/skills`）、会话（`$DSH_HOME/sessions`）、凭据、logs、profiles 与我们的 workspaces 都派生自这一个 home，所以是「把我们这套的 harness home 指到 `~/.acasx`」，不是再加第二个根。落地方式：`@deepseek-ai/dsh-home-paths` 提供 `applyAcasxHomeDefault(env)`，在 `dsh` CLI 入口（`apps/cli/src/bin.ts`）、桌面主进程（`apps/desktop/src/main.ts`）与桌面子进程（`apps/desktop-host/src/index.ts`）调用；`DSH_HOME` 已设置（含 VS Code 的 `.acasx-dev-home`）时一律不覆盖。跨平台用 `os.homedir()` + `path.join`：Windows `C:\Users\<user>\.acasx`、macOS `/Users/<user>/.acasx`、Linux `/home/<user>/.acasx`。
- **产品命令走包内脚本**，它们把 `acasx.productTitle` 作为构建期 `DSH_CLIENT_TITLE` 注入后在仓库根执行对应脚本：
  - `pnpm --filter @deepseek-ai/dsh-client-acasx run build:product`
  - `pnpm --filter @deepseek-ai/dsh-client-acasx run dev:web`
  - `pnpm --filter @deepseek-ai/dsh-client-acasx run dev:desktop`
  **不要直接跑根目录的 `pnpm run build` / `dev:web` / `dev:desktop`**——它们读不到产品标题，构建物会退回 DSH 默认标题。改产品标题只改 `packages/client/acasx/package.json` 里 `productTitle` 那一行。

## 与上游的关系

- 上游是公开仓库，`upstream` remote 指向它，用于日后核对与合并。
- 上游处于 developer preview，公开 API 会破坏性变更。对上游 API 的调用尽量收敛在少量文件里，便于升级时集中修改。
- 上游文件上的改动越少越好；确需修改时，保持最小且可解释。
- 产品化改动记录：`ui-conversation` 的 hero 工作区 chip 由上游 `ConversationContent` 直接渲染，没有可覆盖它的槽位；ACAS.X 需要固定工作区，因此在 `ConversationInjected` 增加 `workspaceSwitchEnabled`，产品组合固定为 `false`，已选中工作区后渲染置灰锁定态。冷启动尚未选中工作区时仍保留首次选择入口。
- 产品化改动记录：`ui-conversation` 的 hero 标题与“预览版”徽标是写死的，ACAS.X 需要按场景显示标题并把徽标换成能力说明入口；因此为 `conversation.content` factory 增加 `conversation.hero.headline` 与 `conversation.hero.preview` 两个 `session-maybe` 单槽，未占用时保持原有文案与徽标。
- 场景会话记录：`packages/client/acasx` 现在是双面包。Host 半边提供 `acasxScenario.workspacePath`（用 `dshHomePath('workspaces', '<id>-<姓名>', '<场景>')` 解析绝对路径），浏览器半边自挂载生成的 `./remote` 贡献，并在 `sidebar.workspaces` 上按 cwd 全等过滤会话、用 `remote.session.create({ cwd, agentPreset })` 新建后 `sessions.refresh()` 再 `uiWorkspace.openSession`。命名空间选择自挂载而不是加进 `api/remotes`，是为了避免 `api/remotes → acasx → ui-workspace → api/remotes` 的工程引用环。
- 上游构建聚合改动 2 处：`tsconfig.host.json` 增加 `packages/client/acasx/tsconfig.host.json` 引用，`tsconfig.client.json` 把 acasx 引用改为 client 面配置。原因是 Host 面 `@Remote` 必须进 host 聚合，Typert 生成器才能发现并产出 `./typert`、`./remote`。照搬 `packages/client/file-upload`、`packages/client/ui-plugin-manager` 的双面布局。
- 已知门禁未过项：`verify-package-dependencies` 报 `@deepseek-ai/dsh-home-paths#dshHomePath is not classified as safe or peer-required`。`dshHomePath` 只按 `$DSH_HOME` 计算绝对路径，多副本结果一致；按仓库策略把它加入 `DUPLICATE_SAFE_PACKAGES` 需要人工复核，本次未自动添加。另外 `verify-client-ui-i18n` 在原有 25 处硬编码之外新增 1 处（新建按钮的 `aria-label`）。
- 场景会话链路修正：`acasxScenario` 命名空间由本包自挂载，`ctx.remote.acasxScenario` / `ctx.remote.session` 只能在声明了对应 inject 的**子作用域**里访问（照 `client-ui-voice-input`：先 `$mount`，再 `ctx.inject([...], registerUi)`）。场景目录先由 Host `workspacePath` `mkdir -p`，客户端再 `workspaces.create({ path })` 并用 `workspaceId` 建会话；只传 `cwd` 会让会话没有归属 Workspace，hero 停在“选择工作区”并禁用输入。
- 内部 preset 不再出现在用户选择器：`PresetDefinition` / `AgentPresetRow` / `AgentPreset` 增加可选 `hidden`（默认不隐藏），`agent-preset` Config 透传，`ui-agent-preset` 的下拉菜单与设置 roster 过滤它，但会话头部/芯片仍能解析显示名。两个场景 preset 设为 `hidden: true` 并补了 `name`（日常监管 / 心盾）。这是对上游 `preset/agent-preset*` 与 `client/ui-agent-preset` 的改动，已重生成 `docs/config-catalog*.md`。
- preset 配置修正：`web-app` 禁用了 base 的 `tool-fs-search` 行，改由 preset 拥有，但两个 preset 重新挂载时没给必填的 `sampleOverCapGlobResults`，导致 `session.create` 在挂载 preset 时失败。两个 preset 行已补 `config.sampleOverCapGlobResults: false`。
- 多账号机制记录：账号存储、密码校验与「账号 → `DSH_HOME` / `DSH_AGENTS_HOME`」映射在 `packages/client/acasx/src/account.ts`，经包导出 `@deepseek-ai/dsh-client-acasx/account` 提供，桌面端 Electron main 复用同一份 Host 侧模块；Web 调试适配器 `packages/client/acasx/scripts/account-demo.mjs` 只承担登录页和 `dsh web` 生命周期，不进入桌面链路。主对话初始化由 `AcasxScenario` 在 Host 启动时向 `workspaceRegistry` 预注册 `main-conversation` 工作区，避免 `ui-workspace` 在空态创建系统默认工作区；为此 acasx 增加 `@deepseek-ai/dsh-workspace` 的 peer/dev 依赖。桌面接入已修改 `apps/desktop/package.json`（acasx `devDependencies`）、`apps/desktop/tsconfig.host.json`、`tsconfig.base.json`、`apps/desktop/src/main.ts`、`apps/desktop/src/ipc.ts`、`apps/desktop/src/preload-app.ts` 与 `apps/desktop/tsdown.config.ts`：main 在 Host 启动前显示 ACAS.X 登录窗口，登录后写账号 `DSH_HOME`、展示加载页再进入系统；`dshDesktop.acasx` 暴露当前账号与切换账号 IPC，ACAS.X 侧栏底部账号入口据此显示账号并提供切换入口。切换账号停止 Host 并回到登录门，先在旧页面可见前隐藏主窗口，再在加载页提交后显示，不能在运行中的 Host 里动态更换 `DSH_HOME`。
