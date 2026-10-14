/**
 * HTTP and server-sent-event gateway for the agent-service application.
 *
 * One gateway serves many users. Every session lookup, history read, and live
 * stream resolves the authenticated user first, so the deployment can share
 * one dsh runtime process while each account only observes its own sessions.
 *
 * @module @deepseek-ai/dsh-agent-service/gateway
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, resolve, sep } from 'node:path'
import { RequestTimeoutError, TransportClosedError } from '@deepseek-ai/dsh-sdk-client'
import { AUTH_COOKIE, AuthService, authCookie, clearAuthCookie, parseCookie, type DemoUser } from './auth.ts'
import type { AgentRuntime, AgentRuntimeFactory, RuntimeNotification } from './runtime.ts'
import { GatewayError, MemoryStore, type GatewayEvent, type GatewaySession, type GatewayUser } from './store.ts'
import { errorMessage, isRecord, stringField } from './util.ts'

/** Operator log sink owned by the composing application. */
export interface AgentGatewayLogger {
  /** Record one ordinary lifecycle line. */
  info(message: string): void
  /** Record one recoverable failure. */
  warn(message: string): void
  /** Record one failure that affects a request or session. */
  error(message: string): void
}

/** Construction options for one tenant gateway. */
export interface AgentGatewayOptions {
  /** Listener address; the shipped profile binds loopback. */
  readonly host: string
  /** Listener port; zero requests an OS-assigned port. */
  readonly port: number
  /** Tenant-owned state root for sessions and the dsh home. */
  readonly dataDir: string
  /** Directory holding the browser console assets. */
  readonly publicDir: string
  /** Configured demo accounts. */
  readonly users: readonly DemoUser[]
  /** Runtime factory invoked when the first session starts. */
  readonly runtime: AgentRuntimeFactory
  /** Optional operator logger. */
  readonly logger?: AgentGatewayLogger
}

/** Running gateway handle. */
export interface AgentGateway {
  /**
   * Create state directories and bind the listener.
   * @returns the bound port.
   */
  start(): Promise<number>
  /** Stop accepting requests and release the runtime to quiescence. */
  close(): Promise<void>
}

/** Seed material every analysis session starts with. */
const DEMO_CASE = `# 模拟案情材料

- 案件编号：JQ-2026-0001
- 涉及人员：张某（绰号“老张”）
- 近期线索：多次在监区内传递纸条，内容涉及违禁品交易。
- 待分析：评估风险等级，列出可能的同伙，并给出需要进一步核查的线索。
`

/**
 * Create one gateway without starting it.
 * @param options - listener, state, users, and runtime factory.
 * @returns the unstarted gateway handle.
 */
export function createAgentGateway(options: AgentGatewayOptions): AgentGateway {
  return new HttpAgentGateway(options)
}

/** HTTP implementation of {@link AgentGateway}. */
class HttpAgentGateway implements AgentGateway {
  private readonly store = new MemoryStore()
  private readonly auth: AuthService
  private readonly server: Server
  private runtime: AgentRuntime | undefined
  private port = 0
  private closing = false

  /** @param options - listener, state, users, and runtime factory. */
  constructor(private readonly options: AgentGatewayOptions) {
    this.auth = new AuthService(options.users)
    for (const user of options.users) {
      this.store.addUser({ id: user.id, username: user.username, displayName: user.displayName })
    }
    this.server = createServer((request, response) => {
      void this.handle(request, response)
    })
  }

  /** @inheritdoc */
  async start(): Promise<number> {
    await mkdir(resolve(this.options.dataDir, 'sessions'), { recursive: true })
    await mkdir(resolve(this.options.dataDir, 'runtime-workspace'), { recursive: true })
    await this.listen()
    return this.port
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    await new Promise<void>((settle) => {
      if (!this.server.listening) {
        settle()
        return
      }
      this.server.close(() => settle())
      this.server.closeAllConnections()
    })
    await this.runtime?.close()
  }

  private listen(): Promise<void> {
    return new Promise<void>((settle, fail) => {
      const onError = (error: Error): void => {
        this.server.off('listening', onListening)
        fail(error)
      }
      const onListening = (): void => {
        this.server.off('error', onError)
        const address = this.server.address()
        if (address !== null && typeof address !== 'string') this.port = (address as AddressInfo).port
        settle()
      }
      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(this.options.port, this.options.host)
    })
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
      if (url.pathname.startsWith('/api/')) {
        await this.handleApi(request, response, url)
        return
      }
      if ((request.method === 'GET' || request.method === 'HEAD')
        && (url.pathname === '/' || url.pathname === '/login' || url.pathname === '/console')) {
        await this.servePage(request, response, url.pathname)
        return
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        await this.serveStatic(request, response, url.pathname)
        return
      }
      this.sendJson(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed.' } })
    } catch (error) {
      const failure = error instanceof GatewayError
        ? error
        : new GatewayError('internal', 500, 'The gateway could not complete the request.')
      this.options.logger?.error(`agent-service request failed: ${failure.code}`)
      if (response.headersSent) {
        response.destroy()
        return
      }
      this.sendJson(response, failure.status, { error: { code: failure.code, message: failure.message } })
    }
  }

  private async handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const segments = url.pathname.split('/').filter(Boolean)
    if (request.method === 'POST' && url.pathname === '/api/login') {
      const body = await readJsonBody(request)
      const username = requireBodyString(body, 'username')
      const password = requireBodyString(body, 'password')
      const result = this.auth.login(username, password)
      this.sendJson(response, 200, { user: result.user }, { 'set-cookie': authCookie(result.token) })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/logout') {
      this.auth.logout(this.requestToken(request))
      this.sendJson(response, 200, {}, { 'set-cookie': clearAuthCookie() })
      return
    }
    const user = this.requireUser(request)
    if (request.method === 'GET' && url.pathname === '/api/me') {
      this.sendJson(response, 200, { user })
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/sessions') {
      this.sendJson(response, 200, { sessions: this.store.listSessions(user.id).map(sessionView) })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/sessions') {
      const body = await readJsonBody(request)
      const session = await this.createSession(user, stringField(body, 'title'))
      this.sendJson(response, 201, { session: sessionView(session) })
      return
    }
    if (segments.length >= 4 && segments[1] === 'sessions' && segments[2] !== undefined) {
      const sessionId = decodeURIComponent(segments[2])
      const session = this.store.requireSession(user.id, sessionId)
      if (request.method === 'GET' && segments[3] === 'events') {
        const afterSeq = parseNonNegative(url.searchParams.get('afterSeq'))
        this.sendJson(response, 200, { events: this.store.listEvents(user.id, session.id, afterSeq) })
        return
      }
      if (request.method === 'GET' && segments[3] === 'stream') {
        const afterSeq = parseNonNegative(url.searchParams.get('afterSeq'))
        this.openStream(request, response, user, session, afterSeq)
        return
      }
      if (request.method === 'POST' && segments[3] === 'messages') {
        const body = await readJsonBody(request)
        const text = requireBodyString(body, 'text').trim()
        if (text === '') throw new GatewayError('empty-message', 400, 'Message text is required.')
        const receipt = await this.submitPrompt(session, text)
        this.sendJson(response, 202, receipt)
        return
      }
    }
    throw new GatewayError('not-found', 404, 'No gateway route owns that request.')
  }

  private requireUser(request: IncomingMessage): GatewayUser {
    return this.auth.userForToken(this.requestToken(request))
  }

  private requestToken(request: IncomingMessage): string | undefined {
    return parseCookie(request.headers.cookie, AUTH_COOKIE)
  }

  private async createSession(user: GatewayUser, requestedTitle: string | undefined): Promise<GatewaySession> {
    const id = randomUUID()
    const title = requestedTitle?.trim() === undefined || requestedTitle?.trim() === ''
      ? '新分析会话'
      : requestedTitle.trim()
    const workspace = resolve(this.options.dataDir, 'sessions', id)
    await mkdir(workspace, { recursive: true })
    await writeFile(resolve(workspace, 'case.md'), DEMO_CASE, { encoding: 'utf8', flag: 'wx' })
    const session = this.store.createSession(user.id, { id, title })
    try {
      await this.openSession(id, workspace)
    } catch (error) {
      this.options.logger?.error(`agent-service could not open session ${id}: ${errorMessage(error)}`)
      this.store.setStatus(id, 'error')
      this.store.appendEvent(id, 'gateway.error', { message: 'The agent runtime could not open this session.' })
      throw new GatewayError('runtime-unavailable', 502, 'The agent runtime could not open this session.')
    }
    this.store.appendEvent(id, 'gateway.ready', { title })
    return session
  }

  private async submitPrompt(session: GatewaySession, text: string): Promise<{ messageId: string }> {
    this.store.setStatus(session.id, 'running')
    this.store.appendEvent(session.id, 'gateway.user-message', { text })
    try {
      const receipt = await this.ensureRuntime().prompt({ sessionId: session.id, text })
      this.store.appendEvent(session.id, 'gateway.receipt', { messageId: receipt.messageId })
      return receipt
    } catch (error) {
      this.options.logger?.error(`agent-service prompt failed for session ${session.id}: ${errorMessage(error)}`)
      this.store.setStatus(session.id, 'error')
      this.store.appendEvent(session.id, 'gateway.error', { message: 'The agent runtime rejected this message.' })
      throw new GatewayError('runtime-prompt-failed', 502, 'The agent runtime rejected this message.')
    }
  }

  private ensureRuntime(): AgentRuntime {
    this.runtime ??= this.options.runtime({
      onNotification: notification => this.onNotification(notification),
      onFailure: error => this.onRuntimeFailure(error),
    })
    return this.runtime
  }

  /**
   * Open one session, retrying once only when the child runtime vanished or
   * timed out during startup. A protocol or configuration failure is
   * deterministic and goes straight to the caller.
   */
  private async openSession(sessionId: string, cwd: string): Promise<void> {
    try {
      await this.ensureRuntime().ensureSession({ sessionId, cwd })
      return
    } catch (error) {
      if (!(error instanceof TransportClosedError) && !(error instanceof RequestTimeoutError)) throw error
      this.options.logger?.warn(`agent-service retrying runtime startup for session ${sessionId}`)
      await this.discardRuntime()
    }
    await this.ensureRuntime().ensureSession({ sessionId, cwd })
  }

  private onNotification(notification: RuntimeNotification): void {
    const params = notification.params
    if (notification.method === 'session.event' || notification.method === 'session.status') {
      const sessionId = stringField(params, 'sessionId')
      if (sessionId === undefined) return
      if (notification.method === 'session.status') {
        const status = stringField(params, 'status')
        if (status === 'running' || status === 'idle' || status === 'error') this.store.setStatus(sessionId, status)
      }
      this.store.appendEvent(sessionId, notification.method, params)
      return
    }
    if (notification.method === 'subagent.started' || notification.method === 'subagent.finished') {
      const parentSessionId = stringField(params, 'parentSessionId')
      if (parentSessionId !== undefined) this.store.appendEvent(parentSessionId, notification.method, params)
    }
  }

  private onRuntimeFailure(error: Error): void {
    this.options.logger?.error(`agent-service runtime failed: ${error.message}`)
    this.store.failRunning('The agent runtime stopped before this analysis finished.')
    void this.discardRuntime()
  }

  /** Close and forget one runtime so the next request starts a fresh child. */
  private async discardRuntime(): Promise<void> {
    const failed = this.runtime
    this.runtime = undefined
    await failed?.close().catch((closeError: unknown) => {
      // The transport already reported the failure; a teardown error adds no new handling.
      void closeError
    })
  }

  private openStream(
    request: IncomingMessage,
    response: ServerResponse,
    user: GatewayUser,
    session: GatewaySession,
    afterSeq: number,
  ): void {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const write = (event: GatewayEvent): void => {
      if (response.writableEnded) return
      response.write(`id: ${String(event.seq)}\ndata: ${JSON.stringify(event)}\n\n`)
    }
    for (const event of this.store.listEvents(user.id, session.id, afterSeq)) write(event)
    const dispose = this.store.subscribe(user.id, session.id, write)
    const heartbeat = setInterval(() => {
      response.write(': ping\n\n')
    }, 15_000)
    let cleaned = false
    const cleanup = (): void => {
      if (cleaned) return
      cleaned = true
      clearInterval(heartbeat)
      dispose()
    }
    request.once('close', cleanup)
    response.once('close', cleanup)
    response.once('error', cleanup)
  }

  private async serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
    const relative = decodeURIComponent(pathname).replace(/^\/+/u, '')
    if (relative === '') throw new GatewayError('not-found', 404, 'That application asset does not exist.')
    const root = resolve(this.options.publicDir)
    const target = resolve(root, relative)
    if (target !== root && !target.startsWith(root + sep)) {
      throw new GatewayError('forbidden', 403, 'That path is outside the application assets.')
    }
    await this.sendFile(response, target, request.method === 'HEAD')
  }

  private async servePage(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const user = this.optionalUser(request)
    if (pathname === '/') {
      this.redirect(response, user === undefined ? '/login' : '/console')
      return
    }
    if (pathname === '/login') {
      if (user !== undefined) {
        this.redirect(response, '/console')
        return
      }
      await this.sendFile(response, resolve(this.options.publicDir, 'login.html'), request.method === 'HEAD')
      return
    }
    if (user === undefined) {
      this.redirect(response, '/login')
      return
    }
    await this.sendFile(response, resolve(this.options.publicDir, 'console.html'), request.method === 'HEAD')
  }

  private optionalUser(request: IncomingMessage): GatewayUser | undefined {
    try {
      return this.auth.userForToken(this.requestToken(request))
    } catch {
      return undefined
    }
  }

  private redirect(response: ServerResponse, location: string): void {
    response.writeHead(302, { location, 'cache-control': 'no-store' })
    response.end()
  }

  private async sendFile(response: ServerResponse, target: string, head: boolean): Promise<void> {
    let body: Buffer
    try {
      body = await readFile(target)
    } catch {
      throw new GatewayError('not-found', 404, 'That application asset does not exist.')
    }
    response.writeHead(200, {
      'content-type': contentType(target),
      'content-length': body.byteLength,
      'cache-control': 'no-store',
    })
    if (head) response.end()
    else response.end(body)
  }

  private sendJson(
    response: ServerResponse,
    status: number,
    value: unknown,
    headers: Record<string, string> = {},
  ): void {
    const body = JSON.stringify(value)
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      ...headers,
    })
    response.end(body)
  }
}

/** Read one JSON object body; an empty body decodes as an empty record. */
async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GatewayError('invalid-json', 400, 'The request body must be valid JSON.')
  }
  if (!isRecord(parsed)) throw new GatewayError('invalid-request', 400, 'The request body must be a JSON object.')
  return parsed
}

/** Read one required string body field. */
function requireBodyString(body: Record<string, unknown>, key: string): string {
  const value = stringField(body, key)
  if (value === undefined || value === '') throw new GatewayError('invalid-request', 400, `Field "${key}" is required.`)
  return value
}

/** Parse one non-negative integer query parameter; invalid input reads as zero. */
function parseNonNegative(value: string | null): number {
  if (value === null) return 0
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

/** Project one session for the browser. */
function sessionView(session: GatewaySession): Record<string, unknown> {
  return { id: session.id, title: session.title, status: session.status, createdAt: session.createdAt }
}

/** Map an asset extension to its response media type. */
function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.json': return 'application/json; charset=utf-8'
    default: return 'application/octet-stream'
  }
}
