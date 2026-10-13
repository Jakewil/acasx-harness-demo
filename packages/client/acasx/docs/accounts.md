---
description: 'ACAS.X 桌面多账号登录、账号数据隔离、底部账号入口、主对话初始化与 Web 调试适配器的当前实现说明。'
kind: 'development-guide'
---

# ACAS.X 多账号与桌面登录

产品交付目标是桌面端。桌面端在启动 Host 之前显示 ACAS.X 账号登录窗口；每个账号拥有独立的 `DSH_HOME` 和 `DSH_AGENTS_HOME`，共用随包的 `desktop` profile。Web 入口只用于热更新调试，不承担产品登录。

## 目标与边界

- 登录发生在 dsh Host 启动之前，终端用户不接触 dsh 自带的 DeepSeek 账号登录。
- 一个账号对应一套独立数据目录；profile 只决定能力组合，不承担数据隔离。
- 同一时间只运行一个账号的 Host；切换账号等于停止 Host、退出登录、重新登录。
- 当前账号记录是本地演示账号（JSON 文件加 scrypt 摘要），不是生产身份系统。

## 共享账号核心

账号记录、密码校验和目录映射在 [`src/account.ts`](../src/account.ts)，通过包导出 `@deepseek-ai/dsh-client-acasx/account` 提供：

| 导出 | 职责 |
| --- | --- |
| `loadAccountStore` | 读取账号文件，首次用种子初始化 |
| `verifyAccount` | 恒定时间比较密码 |
| `accountView` | 投影出不带密码材料的界面视图 |
| `assertAccountId` | 校验账号 id，阻止目录穿越 |
| `resolveAccountHome` | 解析账号的 `{ root, home, agents }` |
| `prepareAccountHome` | 创建账号目录并写入账号自己的 `AGENTS.md` |

这里不包含 HTTP、端口、cookie 或任何运行时启动逻辑。桌面端 Electron main 和 Web 调试适配器各自消费这份模块，并按自己的方式启动 dsh。

## 桌面登录与加载

桌面端启动顺序：

```text
桌面启动
  → ACAS.X 登录窗口
  → 校验账号
  → 写入该账号的 DSH_HOME / DSH_AGENTS_HOME
  → 隐藏旧主窗口
  → 显示加载页
  → 启动 Host
  → 进入系统
```

登录窗口由 [account-login-window.ts](../../../../apps/desktop/src/account-login-window.ts) 创建，页面在 [account-login.html](../../../../apps/desktop/renderer/account-login.html)。登录成功后，[main.ts](../../../../apps/desktop/src/main.ts) 把账号对应的 `DSH_HOME` / `DSH_AGENTS_HOME` 写入 Host 环境，并让 `DesktopHostProcess` 继续使用共享的 `$DSH_HOME/profiles/desktop`。因此插件安装是共享的，会话、设置、凭据和工作区数据按账号隔离。

加载页在 [loading.html](../../../../apps/desktop/renderer/loading.html)，在 Host 启动前载入主窗口。主窗口在旧页面可见前先隐藏，加载页提交后才显示；Host 就绪并完成引导后进入系统。账号会话存在时，上游的 DeepSeek 账号/API Key 引导不会展示。

## 切换账号与底部入口

侧栏底部通过 `sidebar.footer.action` 注册 [AccountAction.tsx](../src/client/sidebar/AccountAction.tsx)：

- 桌面端显示 `Alice · 切换账号`；侧栏收窄时只显示用户图标。
- Web 调试环境不渲染这个入口。
- 点击后调用 `dshDesktop.acasx.switchAccount()`，主进程隐藏主窗口、停止 Host，并回到登录窗口。

桌面桥在 [ipc.ts](../../../../apps/desktop/src/ipc.ts) 和 [preload-app.ts](../../../../apps/desktop/src/preload-app.ts) 中定义，暴露 `currentAccount()` 与 `switchAccount()`。当前账号只投影 `id`、`username`、`displayName`，不把密码材料交给渲染进程。

## 主对话与场景会话

全局「主对话」固定在 `$DSH_HOME/main-conversation`，使用 `standard` preset。布局初始化时 `activePanelId` 为 `null`，主面板回退渲染 `conversation`；ACAS.X 只在**首次** reconcile 时把 `null` 视为主对话入口，因此首次进入会打开固定主对话。

之后打开场景会话时，`ui-workspace` 也会把 `activePanelId` 切回 `null`；此时它表示场景会话，不再触发主对话，否则 mainView 会被抢回主对话，导致无法切换到「日常监管」「心盾」等会话类型。

Host 半边的 `AcasxScenario` 在 `Service.init` 中把 `$DSH_HOME/main-conversation` 预注册成工作区。这样 `ui-workspace` 在客户端恢复选择时能看到已有工作区，不会创建 `Documents/deepseek-harness/default workspace`；产品只保留主对话与场景工作区两条路径。

## Web 调试适配器

[`scripts/account-demo.mjs`](../scripts/account-demo.mjs) 是 Web 专用适配器：

```text
浏览器 → 登录页（127.0.0.1:8088）
       → 校验演示账号
       → resolveAccountHome
       → 用 DSH_HOME / DSH_AGENTS_HOME 启动 dsh web
       → 浏览器打开该 dsh web
```

已有构建产物时，先启动热更新监听，再启动登录页：

```sh
pnpm --filter @deepseek-ai/dsh-client-acasx run demo:accounts:watch
pnpm --filter @deepseek-ai/dsh-client-acasx run demo:accounts
```

演示账号为 `alice / alice123` 和 `bob / bob123`。Web 演示数据默认写入 `~/.acasx-demo/`，目录结构是 `accounts.json` 加 `accounts/<id>/{home,agents}`。

Web 适配器只负责登录页、浏览器会话 cookie 和 `dsh web` 子进程生命周期；桌面端不复用这些部分。

## 桌面数据目录

```text
~/.acasx/                      ACAS.X 产品根目录（或显式 DSH_HOME）
  accounts.json                账号记录
  accounts/<id>/home/          该账号的 DSH_HOME
  accounts/<id>/agents/        该账号的 DSH_AGENTS_HOME
  profiles/desktop/            桌面端共享 profile 与插件安装
```

每个账号的 `home/` 下包含自己的 `sessions`、`storages`、`workspaces`、`.credentials.yaml` 和 `.anonymous-user-id`。

## 验证与已知限制

- 共享账号核心、桌面账号会话、主对话初始化和底部账号入口有 4 个聚焦测试文件、15 个测试覆盖；桌面 main、acasx 两面和客户端聚合均通过类型检查与构建。
- 全新账号的 `storages/workspace.json` 只包含 `main-conversation`，不创建系统默认工作区。
- 已有演示账号可能保留历史默认工作区记录；要看干净的两条路径，需要使用全新账号或清空虚拟演示 home。
- 模型对话需要可用的 `DEEPSEEK_API_KEY` 或模型网关；缺少凭据时账号隔离和主对话初始化仍可验证，但发送消息会得到 `ACCOUNT_SIGN_IN_REQUIRED`。
- 当前一次只运行一个账号的 Host，不做并行运行时池。
- 开发模式下 crashpad、mandatory update overlay 和 Web 前端 CSP 会输出不影响功能的日志；产品功能验证以登录、账号隔离、主对话和场景会话切换为准。
