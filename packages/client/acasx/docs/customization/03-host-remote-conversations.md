---
description: 'ACAS.X 定制第三类：用 agent preset 表达对话类型，并用双面客户端插件的 Host/Remote 服务编排场景会话。'
kind: 'customization-note'
---

# 定制三：不同对话类型与 Host/Remote 会话编排

本分支对应 `codex/acasx-3-host-remote`。产品要同时存在「日常监管」「心盾」两个业务对话类型和一个全局「主对话」，它们在能力上由 agent preset 区分，在会话上各自拥有独立工作目录。

## 机制一：对话差异用 agent preset 表达

每个场景是一份 `@deepseek-ai/dsh-agent-preset` 声明，放在 `packages/bundle/web-app/presets/` 下，由 bundle 的 `files`/`exports` 发布，组合里以 `insert` 追加 `preset-richang-jianguan`、`preset-xindun` 两行。

两个场景 preset 设为 `hidden: true`，因此不出现在用户可见的 preset 下拉与设置 roster；会话仍通过 `agentPreset` 显式指定它们，会话头部/芯片按 `name` 显示「日常监管 / 心盾」。这样业务分类没有进入 `SessionHeader` 这类持久化格式，升级时不需要迁移。

## 机制二：Host 半边解析场景工作目录

场景目录是会话归属的载体：同一目录下的会话属于同一（罪犯, 场景）。路径由 Host 决定，浏览器不自己拼。

`packages/client/acasx/src/index.ts` 是一个 TypertRemoteService，注册 `acasxScenario` 命名空间并暴露两个 `@Remote` 方法：`workspacePath({criminalId, criminalName, scenario})` 解析 `$DSH_HOME/workspaces/<id>-<姓名>/<场景>` 并按需 `mkdir`；`mainConversationPath()` 解析 `$DSH_HOME/main-conversation`。

`./typert`、`./remote` 是构建期生成的产物。为此 `tsconfig.host.json` 增加 `packages/client/acasx/tsconfig.host.json` 引用，Typert 生成器才能发现 Host 面的 `@Remote`；这是双面包必须补的构建拓扑，照搬 `packages/client/file-upload` 的布局。

## 机制三：浏览器半边自挂载 Remote 并编排会话

浏览器半边先 `ctx.remote.$mount(acasxScenarioRemote)`，再在声明了 `remote.acasxScenario`、`remote.session` 的 `ctx.inject([...], registerAcasxUi)` 子作用域里注册界面：不这样分层，cordis 会拒绝读取未声明的 `ctx.remote.<ns>`。

命名空间由本包自挂载，而不是加进 `api-remotes` 外观，是为了避免 `api/remotes → acasx → ui-workspace → api/remotes` 的工程引用环。

场景会话的创建链路固定为：

```text
resolveScenarioWorkspace → ctx.workspaces.create({ path }) → ctx.remote.session.create({ workspaceId, agentPreset }) → ctx.sessions.refresh() → ctx.uiWorkspace.openSession(sessionId)
```

三个步骤都有必要：只给 `cwd` 的会话没有归属 Workspace，会话页会停在「选择工作区」并禁用输入，所以目录要先注册成 Workspace；`remote.session.create` 绕过客户端 SessionManager 的本地记录，必须 `sessions.refresh()` 把 Host 权威列表拉回来；最后再打开会话。复用同目录已有的空白会话优先于新建。

全局「主对话」独立建模为 `MainConversationPanel`、`MainConversationSession`、`MainConversationController`，固定 `$DSH_HOME/main-conversation` 与 `standard` preset，始终复用同一条会话，不参与罪犯场景的 `cwd` 过滤。

## 机制四：产品 home 与组合挂载

产品启动入口调用 `applyAcasxHomeDefault()`：仅当 `DSH_HOME` 未设置或为空白时，把它设为 `~/.acasx`；官方 dsh 的 `~/.dsh` 与显式 `DSH_HOME`（含仓库内 `.acasx-dev-home`）都不受影响。落地入口是 `apps/cli/src/bin.ts`、`apps/desktop/src/main.ts`、`apps/desktop-host/src/index.ts`。

组合侧在 `packages/bundle/web-app/cordis.patch.yml` 插入 `acasx` 行、禁用产品不需要的 `ui-plugin-manager` 与 `ui-schedule`，并在 `packages/bundle/web-app/package.json` 的 `dependencies` 声明 `@deepseek-ai/dsh-client-acasx`。桌面端与打包环境按依赖闭包扫描客户端插件，只加组合行不加依赖会让插件在桌面端完全不出现。

## 机制五：侧栏业务树用阴影覆盖而不是禁用服务

`ui-workspace` 同时是 `uiWorkspace` 服务的提供者，十多个客户端插件注入它，禁用它会让整片 UI 停在 pending。产品包保留上游插件继续提供服务，只在 `sidebar.workspaces` 上以 `priority: -1` 注册自己的业务树做阴影覆盖：`single` 槽位同优先级重复注册会抛错，不同优先级之间最低者渲染。

demo 阶段业务树用组件内 mock，会话接入真实 dsh 数据的方式是按场景 `cwd` 全等过滤 `useSessions` 列表；展开节点时先向 Host 解析目录再过滤。

## 改动文件（上游侵入清单）

| 文件 | 改动 |
| --- | --- |
| `packages/client/acasx/**` | 产品包：Host 服务、Remote 类型、业务树、主对话、模块面板 |
| `packages/util/home-paths/src/index.ts` | 新增 `applyAcasxHomeDefault`，`ACASX_HOME_DIR_NAME` |
| `apps/cli/src/bin.ts`、`apps/desktop/src/main.ts`、`apps/desktop-host/src/index.ts` | 启动入口调用产品 home 兜底 |
| `packages/bundle/web-app/cordis.patch.yml` | 插入产品插件行、禁用两行上游插件 |
| `packages/bundle/web-app/package.json` | 依赖闭包与 preset 发布声明 |
| `packages/bundle/web-app/presets/{richang-jianguan,xindun}.patch.yml` | 两个场景 preset |
| `tsconfig.base.json`、`tsconfig.client.json`、`tsconfig.host.json` | 路径映射与两面工程引用 |
| `docs/config-catalog.md`、`docs/config-catalog.zh.md` | 生成目录登记新包 |

## 复刻步骤

1. 先定对话类型：为每个类型写一份 agent preset，业务分类只进 preset 与自有存储，不进 Session 格式。
2. 建双面包：Host 面写 TypertRemoteService 解析路径等 Host 决定的值，客户端面通过生成的 `./remote` 消费。
3. 按 `adding-a-remote-api` 的流程接入 Typert 生成，并把 host/client 两面分别挂到 `tsconfig.host.json`、`tsconfig.client.json`。
4. 客户端先 `$mount` 自己的 Remote 命名空间，再在声明了对应 `inject` 的子作用域注册界面；避免把命名空间塞进 `api-remotes` 造成引用环。
5. 场景会话按「注册 Workspace → 创建会话 → refresh → 打开」的顺序编排，不要只传 `cwd`。
6. 替换侧栏视图时用槽位阴影，保留提供服务的那一个上游插件。
7. 每个新启动入口调用 `applyAcasxHomeDefault()`，保证产品运行时与官方安装互不读写。

## 验证与已知限制

- 端到端链路需要在真实 Web 组合里跑：侧栏展开场景 → 新建会话 → 会话出现在该场景下 → hero 标题显示场景名。
- `packages/client/acasx/tests/hero.client.spec.ts` 覆盖 preset 到标题的映射；场景目录解析属于 Host 文件系统行为，需要在 Host 面验证。
- 当前会话归属是按 `cwd` 反推的 demo 方案；业务阶段应改为自有存储里的 `sessionId → (罪犯, 场景)` 映射，并预留 `ownerId`。
- `verify-package-dependencies` 对 `dshHomePath` 的重复安全分类尚未过门禁，需要人工复核后加入白名单。
