# `@deepseek-ai/dsh-agent-service`

English | [中文](README.zh.md)

The agent-service application serves a per-user analysis console and drives one DeepSeek Harness SDK runtime behind the gateway. A browser authenticates against the gateway, creates sessions, sends analysis tasks, and follows execution over server-sent events. The gateway keeps every session owned by one account, while the agent process runs with a read-only, network-free tool profile.

## Use this application

Run the shipped profile from a source checkout:

```sh
pnpm demo:agent-service
```

The profile binds `127.0.0.1:8790` by default and stores state under `./.dsh-agent-service`. Set `DSH_AGENT_SERVICE_DATA` to move the state root. The login page is `/login` and the working console is `/console`; the gateway redirects between them from the authentication cookie. Sign in with the demo account `analyst` / `analyst` or `auditor` / `auditor`; each account sees only its own sessions.

| Config | Default | Meaning |
|---|---|---|
| `host` | `127.0.0.1` | Listener address. |
| `port` | `8790` | Listener port. |
| `dataDir` | `./.dsh-agent-service` | Tenant state root for sessions and the SDK Harness home. |
| `runtimeProfile` | `sdk` | dsh profile serving the SDK protocol. |
| `provider` | `deepseek-official` | Provider route validated during the SDK handshake. |
| `model` | `deepseek-v4-flash` | Model resolved by the provider adapter. |
| `users` | demo accounts | Configured login accounts. |

## Understand the implementation

The gateway is the only component that reaches the dsh runtime. It starts one SDK runtime on the first session, routes notifications to the owning gateway session, stores them in memory, and streams them to the browser. The runtime launches the `sdk` profile with `patches/restricted.cordis.yml`, which applies a read-only sandbox, disables approval prompts, and removes network and subagent tools.

Logic isolation is enforced in the gateway: session ids are opaque gateway-owned identifiers, every read and stream resolves the authenticated user first, and a foreign session id answers as not found. The demo keeps state in memory and uses demo passwords; production must replace the auth module with the prison system's own account service and add a durable event store.

See [docs/implementation.md](docs/implementation.md) for the complete file inventory, requirement coverage, and remaining gaps.

## Known limitations

- Demo authentication keeps tokens and sessions in memory, so a restart signs users out and clears the gateway event history.
- The SDK protocol forwards durable session events; the console shows steps and tool calls, not token-level streaming.
- One shared runtime means one model route per deployment; per-user credentials or filesystem isolation require separate runtime processes.
