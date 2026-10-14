# agent-service 实现说明

本文档说明 `apps/agent-service` 的目标、总体架构、文件职责、对上游的修改、当前满足的需求，以及尚未支持或需要继续投入的能力。

## 目标需求

需求可以拆成六条：把 DeepSeek Harness 当作后台 agent 引擎；dsh 运行时部署在服务器上；用户通过狱情分析系统自己的 Web 页面登录；用户在自己的页面里创建分析会话、提交分析任务；页面实时展示执行过程；后端使用 Node.js 接入 dsh。

## 总体架构

```text
浏览器
  │
  ├─ GET /login            登录页（login.html）
  ├─ GET /console          工作台页（console.html，需要登录 cookie）
  ├─ REST /api/*           登录、会话、消息、历史
  └─ SSE  /api/sessions/:id/stream
        │
Node 网关（apps/agent-service，由 dsh --profile agent-service 启动）
  ├─ 用户与令牌管理（auth.ts）
  ├─ 会话/事件/订阅存储（store.ts）
  ├─ HTTP/SSE 路由与页面跳转（gateway.ts）
  └─ SDK 运行时管理（runtime.ts）
        │  stdio JSON-RPC
dsh SDK 子进程（dsh --profile sdk + patches/restricted.cordis.yml）
  ├─ Agent loop、模型调用、工具执行
  └─ JSONL 会话持久化（DSH_HOME 下）
```

关键边界：浏览器只认识网关的 HTTP 和 SSE 接口，永远拿不到 dsh 的 sessionId、profile 或进程信息；网关是唯一接触 dsh 运行时的组件，通过官方 Node SDK 驱动；一个部署内共享一个 dsh 运行时进程，多用户通过网关做逻辑隔离；子运行时使用只读、无网络、无审批提示的受限组合。

## 请求与执行流程

登录：浏览器访问 `/` 时，网关按 cookie 跳转到 `/login` 或 `/console`；`/login` 把账号密码提交到 `POST /api/login`，网关校验演示账号并签发 `HttpOnly` cookie；已登录用户再访问 `/login` 会被跳回 `/console`。

创建会话：页面调用 `POST /api/sessions`；网关生成随机 UUID 作为会话 id，在租户数据目录下创建会话工作区，写入模拟案情材料 `case.md`，再调用 SDK 的 `session/working-directory/set` 创建或恢复同名 dsh 会话并设置工作目录；会话行只属于当前登录用户。

提交任务：页面调用 `POST /api/sessions/:id/messages`；网关先写入本地用户消息事件，再通过 SDK 的 `session/prompt` 入队；dsh 子进程执行 agent loop 并持续产生会话事件；网关订阅 SDK 通知，把 `session.event`、`session.status`、`subagent.*` 路由到对应网关会话；事件按会话内序号写入内存存储并立即通过 SSE 推送；页面按事件类型渲染用户消息、助手消息、工具调用、工具结果和状态。

## 新增文件

| 文件 | 作用 |
|---|---|
| `apps/agent-service/package.json` | 声明应用包本体、profile bundle patch、运行入口、启动入口、依赖和发布文件。 |
| `apps/agent-service/cordis.patch.yml` | `agent-service` profile 的 patch：插入启动行和网关行，提供监听地址、数据目录、模型路由和演示账号。 |
| `apps/agent-service/patches/restricted.cordis.yml` | 子运行时的安全 patch：只读沙箱、关闭审批提示、移除网络、子 agent 和 skill 工具。 |
| `apps/agent-service/src/startup.ts` | 命令行解析：成功解析后发布 `agentServiceStartup`；`--help` 只打印帮助，不绑定端口。 |
| `apps/agent-service/src/index.ts` | Cordis 网关插件：解析默认值、校验配置、启动 HTTP/SSE 网关，并在卸载时关闭。 |
| `apps/agent-service/src/gateway.ts` | HTTP 与 SSE 实现：页面跳转、登录、会话、消息、历史、流式推送、运行时故障恢复。 |
| `apps/agent-service/src/auth.ts` | 演示账号、令牌、cookie 的读写；生产环境由狱情系统账号体系替换。 |
| `apps/agent-service/src/store.ts` | 内存会话、事件、订阅存储；所有读取先做会话归属校验，并定义结构化 `GatewayError`。 |
| `apps/agent-service/src/runtime.ts` | 运行时接口与 SDK 实现：延迟启动 dsh 子进程、初始化握手、通知泵、关闭阶梯。 |
| `apps/agent-service/src/util.ts` | 共享的值守卫与错误文本工具。 |
| `apps/agent-service/public/login.html` | 独立登录页；未登录用户看到的第一页。 |
| `apps/agent-service/public/login.js` | 登录提交、错误展示、已登录跳转。 |
| `apps/agent-service/public/console.html` | 独立工作台页；只有登录后才会由网关返回。 |
| `apps/agent-service/public/console.js` | 会话列表、创建会话、输入消息、SSE 订阅和事件渲染。 |
| `apps/agent-service/public/client-api.js` | 两个页面共享的 fetch 封装和 DOM 工具。 |
| `apps/agent-service/public/styles.css` | 登录页和工作台页的共享样式。 |
| `apps/agent-service/tests/store.spec.ts` | 认证、令牌、会话归属、事件序号、订阅和失败标记的单元测试。 |
| `apps/agent-service/tests/gateway.spec.ts` | 用假运行时覆盖页面路由、登录、创建、提交、隔离、SSE 和冷启动重试。 |
| `apps/agent-service/tsconfig.json` | 应用自己的 TypeScript 工程配置。 |
| `apps/agent-service/tsdown.config.ts` | 应用入口的打包配置。 |
| `apps/agent-service/README.md` / `README.zh.md` | 使用说明与配置表（双语配对）。 |
| `apps/agent-service/docs/implementation.md` | 本文档。 |

## 修改过的上游文件

| 文件 | 修改意义 |
|---|---|
| `packages/boot/app-boot/src/profile.ts` | 把 `agent-service` 注册为随发行版交付的 profile 模板，使 `dsh --profile agent-service` 首次使用即可初始化。 |
| `apps/cli/package.json` | 让 CLI 安装依赖图包含应用包，profile 行才能被运行时解析并加载。 |
| `tsconfig.base.json` | 添加 `@deepseek-ai/dsh-agent-service` 及其 `/startup` 子路径的源码映射。 |
| `tsconfig.host.json` | 把应用加入 Host 类型检查工程图。 |
| `tsdown.config.ts` | 把 `apps/agent-service` 加入 Host 构建工作区。 |
| `package.json` | 新增 `demo:agent-service` 演示启动脚本。 |
| `scripts/verify-application-entrypoints.ts` | 把演示启动器登记为 `dsh` profile 启动，满足“只有 dsh profile 能启动 Node 应用”的仓库规则。 |
| `docs/architecture.md` / `.zh.md` / `.i18n.yaml` | 更新随发行版交付的 profile 列表和组合包说明（双语配对）。 |
| `packages/boot/app-boot/README.md` / `.zh.md` / `.i18n.yaml` | 同步 profile 列表和独立组合包说明（双语配对）。 |
| `docs/cli-help.md` / `.zh.md` / `.i18n.yaml` | 由生成器重新生成的 CLI 帮助，新增 `dsh agent-service` 页面。 |
| `docs/config-catalog.md` / `.zh.md` | 重新生成的配置目录；本次同时修正了上游分支遗留的 ACAS.X 服务列表新鲜度问题。 |
| `pnpm-lock.yaml` | 记录新工作区包、依赖链接和 CLI 依赖。 |

## package.json 说明

`apps/agent-service/package.json` 同时声明两件事：它是一个普通 Node 应用包，也是一个 dsh profile bundle。前者决定编译、运行和发布，后者由 `dsh.bundle.patch` 声明，决定 `dsh --profile agent-service` 能否加载它。

### 关键字段

| 字段 | 值 | 作用 |
|---|---|---|
| `name` | `@deepseek-ai/dsh-agent-service` | 包名；也是 `cordis.patch.yml` 中两个 row 的 `name`。 |
| `main` / `types` | `lib/index.js` / `lib/types/index.d.ts` | 默认入口，导出网关 Cordis 插件。 |
| `exports["."]` | `./lib/index.js` | 让 dsh loader 能按包名加载网关插件。 |
| `exports["./startup"]` | `./lib/startup.js` | 让 profile 用 `@deepseek-ai/dsh-agent-service/startup` 单独加载命令行启动行。 |
| `dsh.bundle.patch` | `./cordis.patch.yml` | 声明这是 dsh bundle；profile 初始化时据此应用 patch。 |
| `files` | `lib`、`cordis.patch.yml`、`public`、`patches` | 发布时必须携带运行时代码、profile patch、Web 页面和子运行时 patch。 |
| `publishConfig` | `access: public` | 允许发布；`apps/cli` 依赖这个包，因此它不能是私有包。 |
| `type` | `module` | 全 ESM，符合仓库约定。 |

### 依赖总览

| 依赖 | 声明 | 使用位置 | 作用 |
|---|---|---|---|
| `@deepseek-ai/dsh-sdk-client` | `dependencies` | `src/runtime.ts`、`src/gateway.ts` | Node/TypeScript 的 dsh SDK：启动并驱动 `dsh --profile sdk` 子进程，提供协议客户端和类型化错误。 |
| `@deepseek-ai/dsh-cmdline` | `dependencies` | `src/startup.ts` | 解析应用自己的命令行、`--help` 和退出请求；成功解析后才发布启动服务。 |
| `@deepseek-ai/schemastery` | `dependencies` | `src/index.ts`、`src/startup.ts` | 定义并校验插件 Config；加载 profile 时检查字段类型和必填项。 |
| `commander` | `dependencies` | `src/startup.ts` | 构造命令行程序、参数定义和帮助文本。 |
| `@deepseek-ai/cordis` | `peerDependencies` + `devDependencies` | `src/index.ts`、`src/startup.ts` | 插件运行时和服务容器；运行时由 dsh 宿主提供，开发时用于类型检查和构建。 |

### `@deepseek-ai/dsh-sdk-client`

这是“把 dsh 当后台 agent 引擎”的核心依赖。它提供两个层次：

```text
DeepSeekHarness   高层运行封装：运行一次任务并等待 agent 进入 idle
HarnessClient     低层协议客户端：长连接、prompt、subscribe、request
```

本应用使用 `HarnessClient`，因为一个网关进程要在同一条连接上同时服务多个用户会话；`DeepSeekHarness.run()` 以一次运行区间为中心，不适合这种多路复用。`src/runtime.ts` 用它完成三件事：

1. 启动子进程：按配置传入 `profile: 'sdk'`、`patches`（受限 patch）、`dshHome`、`processCwd` 和 `initializeTimeoutMs`。
2. 协议调用：`initialize` 完成进程级握手和模型路由校验；`setWorkingDirectory()` 为每个网关会话准备独立的 dsh 会话；`prompt()` 把用户消息入队。
3. 通知订阅：`subscribe()` 返回异步订阅，网关持续读取 `session.event`、`session.status` 和 `subagent.*`，再路由到对应会话。

`src/gateway.ts` 还使用它导出的 `TransportClosedError` 和 `RequestTimeoutError`，只为“子进程消失或启动超时”做一次有界重试；协议错误和配置错误直接返回给调用方，不重试。

这个包不提供 HTTP 服务。HTTP、SSE、登录、会话归属和页面跳转都由 `src/gateway.ts` 实现，SDK 只负责与 dsh 子进程通信。

SDK 自身依赖同版本的 `@deepseek-ai/dsh`，并负责解析和启动该 dsh 可执行文件，所以本应用不需要直接声明 `@deepseek-ai/dsh`。两边版本必须一致：工作区内由 `workspace:*` 保持同版，发布后由 SDK 的精确版本依赖保证。

### `@deepseek-ai/dsh-cmdline`

因为 `agent-service` 本身是 dsh profile，用户执行的是 `dsh --profile agent-service`，应用需要自己处理剩余参数。`src/startup.ts` 调用 `parseCmdline(ctx, program)`，实现两种互斥结果：

```text
dsh --profile agent-service --help   打印帮助并退出，不绑定端口
dsh --profile agent-service          发布 agentServiceStartup，网关行开始监听
```

网关行的 `inject: [agentServiceStartup]` 让它只在解析成功后激活。没有这个依赖，`--help` 会被当成正常启动，服务器会错误地占用端口。

### `@deepseek-ai/schemastery`

`schemastery` 是 dsh 的配置 schema 库。`src/index.ts` 和 `src/startup.ts` 都用它声明 `Config`：

```ts
export const Config: z<Config> = z.object({
  host: z.string(),
  port: z.number(),
  users: z.array(z.object({ username: z.string(), password: z.string(), displayName: z.string() })),
})
```

加载 `cordis.patch.yml` 时，loader 用这个 schema 校验配置。字段类型错误、数组元素缺字段等问题会在启动阶段失败，而不是运行到某个请求时才暴露。

### `commander`

`src/startup.ts` 用 `commander` 的 `Command` 定义应用名、描述、`-h, --help` 和 action。`dsh-cmdline` 负责把 dsh 剩余参数交给这个程序并处理成功、帮助和拒绝三种出口。它只影响命令行，不参与浏览器和 HTTP 逻辑。

### `@deepseek-ai/cordis`

本应用是一个 Cordis 插件，需要 `Context`、`ctx.effect()`、`ctx.logger`、`ctx.provide()` 和插件注入机制。Cordis 容器由 dsh 宿主进程提供，因此它声明为 `peerDependencies`，避免在自己的依赖树中再装一份 Cordis 造成服务注册分裂。`devDependencies` 中的同一项只为本仓库的类型检查、测试和打包提供类型来源。

### 版本写法与未声明的依赖

`workspace:*` 表示使用工作区中的同一个包，DSH 系列依赖都用它保持同版；`workspace:~` 用于 vendor 提供的 `@deepseek-ai/cordis`；`commander` 使用普通 npm 范围 `^15.0.0`。

以下内容刻意不写进依赖：`node:http`、`node:fs`、`node:crypto`、`node:path` 等是 Node 内置模块；实时推送使用 HTTP 上的 SSE，不需要 `ws`；页面是原生 ESM 和 DOM，不需要 React 或构建框架。

## 需求覆盖情况

| 需求 | 结论 | 说明 |
|---|---|---|
| dsh 作为后台 agent 引擎 | 已满足 | 网关通过 Node SDK 启动 `dsh --profile sdk`，由 dsh 执行模型调用、工具和会话日志。 |
| 部署在服务器 | 基本满足 | 应用是标准 Node 服务，可绑定服务器地址；生产还需要反向代理、TLS、守护和资源限制。 |
| 用户通过自己的页面登录 | 形式满足 | `/login` 是独立页面；认证目前是演示账号，未接狱情系统 SSO。 |
| 创建会话 | 已满足 | `/console` 可新建会话，网关生成不透明 id、工作区和 dsh 会话。 |
| 实时看到执行过程 | 部分满足 | SSE 推送状态、步骤、工具调用与结果、助手消息；暂无逐 token 流式输出。 |
| 不使用 dsh 自带界面 | 已满足 | 只加载 `apps/agent-service/public`，dsh 的 Web 客户端未挂载，dsh 进程也不暴露端口。 |
| 后端 Node.js 接入 | 已满足 | 网关本身是 Node/TypeScript，运行时通过官方 Node SDK 驱动。 |
| 多用户数据隔离 | 部分满足 | 会话、历史、流式订阅按登录用户强制隔离；文件系统和进程仍是共享的。 |

## 尚未支持或待完成的能力

认证与权限：演示账号和令牌都在内存中，密码写在 profile patch 里，重启即失效。生产应接入狱情系统的账号、角色和数据权限，并将会话与业务对象建立稳定映射。

持久化与历史：网关的会话列表和事件历史在内存中，进程重启会丢失；dsh 自己的会话日志仍然写入 `DSH_HOME`。SDK 没有历史读取接口，生产需要把网关事件写入数据库，并实现列表、分页和断线补齐。

流式粒度：SDK 只转发落盘后的 `session.event`。页面能看到步骤、工具调用、工具结果和每一步的助手消息，但看不到逐 token 增量。若要逐字输出，需要在 dsh 侧加插件转发 `agent/assistant-stream`，并扩展 SDK 协议。

人工审批：审批请求是 dsh Host 内的 `approval/request` waterfall，而 SDK 目前没有 server→client 请求通道。本 demo 直接使用 `policy: never`，只开放不需要审批的只读工具。支持审批需要在协议和两端客户端中增加请求/响应消息。

单回合取消：SDK 没有取消或关闭单个会话的方法。当前只能等待回合结束，或重启该用户或部署的运行时；重启后可按 sessionId 恢复持久会话。

文件系统隔离：当前是一个共享 dsh 运行时，隔离是逻辑隔离：会话归属由网关保证，但文件读写没有按用户做 OS 级隔离。需要真实文件隔离时，应改为每用户独立进程、独立 `DSH_HOME` 和独立 OS 账号或容器。

业务接入：本 demo 用本地 `case.md` 模拟案情材料，还没有把罪犯档案、线索、历史分析做成 MCP 工具，也没有把 agent 的结构化结论写回业务库。

部署与运维：还没有容器镜像、TLS 终止、反向代理配置、健康检查、指标、审计日志、配额和空闲回收；模型默认走 `deepseek-official`，需要替换为内网模型网关和凭据管理。

前端展示：当前渲染纯文本、简单工具卡片和状态徽标；正式产品还需要 Markdown、代码和差异渲染、执行时间线、失败重试入口和更完整的断线重连体验。

## 本地验证

```bash
cd /d/project/dshDemo   # Git Bash；WSL 用 /mnt/d/project/dshDemo
pnpm exec vitest run apps/agent-service/tests
node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc -b apps/agent-service/tsconfig.json

export DSH_HOME="$(mktemp -d -t dsh-agent-service-home.XXXXXX)"
export DSH_AGENT_SERVICE_DATA="$(mktemp -d -t dsh-agent-service-data.XXXXXX)"
export DEEPSEEK_API_KEY='sk-...'   # 可选
pnpm demo:agent-service
```

打开 `http://127.0.0.1:8790`，网关会跳转到 `/login`。登录后进入 `/console`，新建分析并提交任务即可看到事件流。没有 `DEEPSEEK_API_KEY` 时会话和事件链路仍然工作，只是模型回合以错误结束。

接口隔离可以这样验证：

```bash
BASE=http://127.0.0.1:8790
curl -sS -c /tmp/analyst.cookies -H 'content-type: application/json' \
  -d '{"username":"analyst","password":"analyst"}' "$BASE/api/login"
curl -sS -c /tmp/auditor.cookies -H 'content-type: application/json' \
  -d '{"username":"auditor","password":"auditor"}' "$BASE/api/login"
curl -sS -b /tmp/auditor.cookies "$BASE/api/sessions"   # 预期 0 条
```

## 后续演进顺序

1. 接入狱情系统账号，会话与事件落库，补齐审计和部署加固。
2. 把业务数据做成 MCP 工具，增加结构化结论提交。
3. 需要更高交互保真度时，再扩展 dsh 插件和 SDK 协议，加入逐 token 流式、审批和取消。
4. 需要强隔离时，把共享运行时升级为按用户或按租户的运行时池。
