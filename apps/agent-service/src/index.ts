/**
 * The agent-service application plugin: one Node gateway per prison
 * deployment. It serves the custom analysis console, authenticates users,
 * keeps each account's sessions separate, and drives one shared DeepSeek
 * Harness SDK runtime behind the gateway.
 *
 * @module @deepseek-ai/dsh-agent-service
 */

import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { type DemoUser } from './auth.ts'
import { createAgentGateway, type AgentGatewayOptions } from './gateway.ts'
import { createSdkRuntimeFactory } from './runtime.ts'
import { AGENT_SERVICE_STARTUP_SERVICE } from './startup.ts'

/** Stable Cordis plugin name. */
export const name = 'agent-service'

/** The gateway binds only after the command line accepted this invocation. */
export const inject = [AGENT_SERVICE_STARTUP_SERVICE]

/** One configured demo account. */
export interface ConfigUser {
  /** Login name. */
  username: string
  /** Demo password; production deployments replace this module's auth. */
  password: string
  /** Display name shown in the console. */
  displayName: string
}

/** Agent-service configuration resolved from the profile patch. */
export interface Config {
  /** Listener address. */
  host?: string
  /** Listener port; zero requests an OS-assigned port. */
  port?: number
  /** Tenant state root for sessions and the dsh home. */
  dataDir?: string
  /** dsh profile that serves the SDK protocol. */
  runtimeProfile?: string
  /** Provider route validated during the SDK handshake. */
  provider?: string
  /** Model resolved by the provider adapter. */
  model?: string
  /** Demo accounts. */
  users?: ConfigUser[]
}

/** Validated configuration surface. */
export const Config: z<Config> = z.object({
  host: z.string(),
  port: z.number(),
  dataDir: z.string(),
  runtimeProfile: z.string(),
  provider: z.string(),
  model: z.string(),
  users: z.array(z.object({
    username: z.string(),
    password: z.string(),
    displayName: z.string(),
  })),
})

/** Accounts shipped for the repository demo. */
const DEFAULT_USERS: readonly ConfigUser[] = [
  { username: 'analyst', password: 'analyst', displayName: '分析员' },
  { username: 'auditor', password: 'auditor', displayName: '审核员' },
]

/**
 * Start the gateway as one Cordis effect.
 * @param ctx - plugin context owning the effect lifetime.
 * @param config - profile-supplied configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const options = resolveOptions(config, ctx)
  const gateway = createAgentGateway(options)
  const port = await gateway.start()
  ctx.effect(() => () => gateway.close())
  ctx.logger.info(`agent-service console listening on http://${options.host}:${String(port)}`)
}

/** Resolve defaults and validate every deployment-varying value. */
function resolveOptions(config: Config, ctx: Context): AgentGatewayOptions {
  const host = config.host ?? '127.0.0.1'
  const port = config.port ?? 8790
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`agent-service port must be an integer between 0 and 65535, got ${String(port)}`)
  }
  const dataDir = resolve(config.dataDir ?? '.dsh-agent-service')
  const configured = config.users ?? [...DEFAULT_USERS]
  if (configured.length === 0) throw new Error('agent-service requires at least one configured user')
  if (new Set(configured.map(user => user.username)).size !== configured.length) {
    throw new Error('agent-service user names must be unique')
  }
  const users: DemoUser[] = configured.map(user => ({
    id: user.username,
    username: user.username,
    displayName: user.displayName,
    password: user.password,
  }))
  const packageRoot = resolve(import.meta.dirname, '..')
  const runtime = createSdkRuntimeFactory({
    runtimeProfile: config.runtimeProfile ?? 'sdk',
    dshHome: resolve(dataDir, 'dsh-home'),
    processCwd: resolve(dataDir, 'runtime-workspace'),
    provider: config.provider ?? 'deepseek-official',
    model: config.model ?? 'deepseek-v4-flash',
    patches: [resolve(packageRoot, 'patches', 'restricted.cordis.yml')],
    env: process.env,
  })
  return {
    host,
    port,
    dataDir,
    publicDir: resolve(packageRoot, 'public'),
    users,
    runtime,
    logger: {
      info: message => ctx.logger.info(message),
      warn: message => ctx.logger.warn(message),
      error: message => ctx.logger.error(message),
    },
  }
}
