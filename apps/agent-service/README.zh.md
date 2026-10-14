# `@deepseek-ai/dsh-agent-service`

[English](README.md) | 中文

agent-service 应用提供按用户隔离的分析控制台，并在网关之后驱动一个 DeepSeek Harness SDK 运行时。浏览器向网关完成登录，创建会话、提交分析任务，并通过 server-sent events 跟踪执行过程。网关保证每个会话只属于一个账号，Agent 进程则运行在只读且无网络的工具配置下。

## 使用本应用

在源码检出目录运行随附 profile：

```sh
pnpm demo:agent-service
```

该 profile 默认绑定 `127.0.0.1:8790`，并把状态保存在 `./.dsh-agent-service`。设置 `DSH_AGENT_SERVICE_DATA` 可以更换状态根目录。登录页是 `/login`，工作台是 `/console`；网关根据登录 cookie 在两者之间跳转。使用演示账号 `analyst` / `analyst` 或 `auditor` / `auditor` 登录；每个账号只能看到自己的会话。

| 配置 | 默认值 | 含义 |
|---|---|---|
| `host` | `127.0.0.1` | 监听地址。 |
| `port` | `8790` | 监听端口。 |
| `dataDir` | `./.dsh-agent-service` | 租户状态根目录，存放会话与 SDK Harness home。 |
| `runtimeProfile` | `sdk` | 提供 SDK 协议的 dsh profile。 |
| `provider` | `deepseek-official` | SDK 握手期间校验的 provider 路由。 |
| `model` | `deepseek-v4-flash` | 由 provider 适配器解析的模型。 |
| `users` | 演示账号 | 配置的登录账号。 |

## 理解实现

网关是唯一接触 dsh 运行时的组件。它在第一个会话出现时启动一个 SDK 运行时，把通知路由到所属网关会话，保存在内存中，再流式发送给浏览器。运行时会加载 `sdk` profile 和 `patches/restricted.cordis.yml`，该 patch 应用只读沙箱、关闭审批提示，并移除网络与 subagent 工具。

逻辑隔离由网关强制执行：会话 id 是网关持有的不透明标识，每次读取和流式订阅都先解析登录用户，访问他人会话 id 会返回不存在。演示把状态保存在内存中并使用演示密码；生产环境必须把认证模块替换为狱情系统自己的账号服务，并加入持久事件存储。

完整的文件清单、需求覆盖和待补齐能力见 [docs/implementation.md](docs/implementation.md)。

## 已知限制

- 演示认证把令牌和会话保存在内存中，重启会登出用户并清空网关事件历史。
- SDK 协议只转发已落盘的会话事件；控制台展示步骤和工具调用，不提供逐 token 流式输出。
- 共享一个运行时意味着每次部署只有一个模型路由；按用户隔离凭据或文件系统需要独立运行时进程。
