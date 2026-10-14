/**
 * Runtime seam between the gateway and one DeepSeek Harness SDK process.
 *
 * The gateway talks to an {@link AgentRuntime}; the production implementation
 * spawns `dsh --profile sdk` through `@deepseek-ai/dsh-sdk-client`. Tests use a
 * fake runtime, so the HTTP and ownership layers never need a real model.
 *
 * @module @deepseek-ai/dsh-agent-service/runtime
 */

import { HarnessClient, type NotificationSubscription } from '@deepseek-ai/dsh-sdk-client'
import { errorMessage } from './util.ts'

/** One notification received from the dsh runtime. */
export interface RuntimeNotification {
  /** JSON-RPC notification method. */
  readonly method: string
  /** Decoded parameters. */
  readonly params: Record<string, unknown>
}

/** Runtime callbacks owned by the gateway. */
export interface RuntimeCallbacks {
  /** Receive every notification the runtime publishes. */
  onNotification(notification: RuntimeNotification): void
  /** Observe an unrecoverable runtime failure. */
  onFailure(error: Error): void
}

/** One running agent runtime the gateway can drive. */
export interface AgentRuntime {
  /**
   * Create or restore one dsh session with its own working directory.
   * @param input - gateway session id and absolute working directory.
   */
  ensureSession(input: { sessionId: string; cwd: string }): Promise<void>

  /**
   * Queue one user message.
   * @param input - target session and message text.
   * @returns the durable inbox message id.
   */
  prompt(input: { sessionId: string; text: string }): Promise<{ messageId: string }>

  /** Stop the runtime and release its child process. */
  close(): Promise<void>
}

/** Construction options for one SDK-backed runtime. */
export interface SdkRuntimeOptions {
  /** dsh profile that serves the SDK protocol. */
  readonly runtimeProfile: string
  /** Posix Harness home owned by this gateway deployment. */
  readonly dshHome: string
  /** Process working directory and sandbox fallback root. */
  readonly processCwd: string
  /** Provider route validated during the SDK handshake. */
  readonly provider: string
  /** Model resolved by the provider adapter. */
  readonly model: string
  /** Ordered per-launch patches applied below the profile. */
  readonly patches: readonly string[]
  /** Child environment; defaults to the gateway process environment. */
  readonly env?: NodeJS.ProcessEnv
}

/** Creates one runtime instance for the gateway. */
export type AgentRuntimeFactory = (callbacks: RuntimeCallbacks) => AgentRuntime

/**
 * Build the production runtime factory.
 * @param options - SDK launch settings.
 * @returns a factory the gateway calls once when the first session starts.
 */
export function createSdkRuntimeFactory(options: SdkRuntimeOptions): AgentRuntimeFactory {
  return callbacks => new SdkRuntime(options, callbacks)
}

/** SDK-backed runtime that lazily starts one dsh subprocess. */
class SdkRuntime implements AgentRuntime {
  private readonly client: HarnessClient
  private startTask: Promise<void> | undefined
  private subscription: NotificationSubscription | undefined
  private closed = false

  /**
   * @param options - SDK launch settings.
   * @param callbacks - gateway notification and failure sinks.
   */
  constructor(
    private readonly options: SdkRuntimeOptions,
    private readonly callbacks: RuntimeCallbacks,
  ) {
    this.client = new HarnessClient({
      profile: options.runtimeProfile,
      patches: [...options.patches],
      dshHome: options.dshHome,
      processCwd: options.processCwd,
      initializeTimeoutMs: 30_000,
      ...options.env === undefined ? {} : { env: options.env },
    })
  }

  /** @inheritdoc */
  async ensureSession(input: { sessionId: string; cwd: string }): Promise<void> {
    await this.start()
    await this.client.setWorkingDirectory(input.sessionId, input.cwd)
  }

  /** @inheritdoc */
  async prompt(input: { sessionId: string; text: string }): Promise<{ messageId: string }> {
    await this.start()
    const messageId = await this.client.prompt(input.sessionId, [{ type: 'text', text: input.text }])
    return { messageId }
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    this.closed = true
    this.subscription?.close()
    this.subscription = undefined
    await this.client.close()
  }

  /** Memoize the process-wide handshake and notification pump. */
  private start(): Promise<void> {
    this.startTask ??= this.performStart()
    return this.startTask
  }

  private async performStart(): Promise<void> {
    this.client.start()
    await this.client.initialize({
      cwd: this.options.processCwd,
      provider: this.options.provider,
      model: this.options.model,
    })
    const subscription = this.client.subscribe()
    this.subscription = subscription
    void this.consume(subscription)
  }

  private async consume(subscription: NotificationSubscription): Promise<void> {
    try {
      for await (const notification of subscription) {
        if (this.closed) return
        this.callbacks.onNotification({ method: notification.method, params: notification.params })
      }
    } catch (error) {
      if (this.closed) return
      this.callbacks.onFailure(error instanceof Error ? error : new Error(errorMessage(error)))
    }
  }
}
