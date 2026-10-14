import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TransportClosedError } from '@deepseek-ai/dsh-sdk-client'
import type { DemoUser } from '../src/auth.ts'
import { createAgentGateway } from '../src/gateway.ts'
import type { AgentRuntime, AgentRuntimeFactory, RuntimeCallbacks, RuntimeNotification } from '../src/runtime.ts'

const users: DemoUser[] = [
  { id: 'u1', username: 'analyst', password: 'pw1', displayName: '分析员' },
  { id: 'u2', username: 'auditor', password: 'pw2', displayName: '审核员' },
]

class FakeRuntime implements AgentRuntime {
  readonly opened: { sessionId: string; cwd: string }[] = []
  readonly prompts: { sessionId: string; text: string }[] = []
  closed = false

  constructor(private readonly callbacks: RuntimeCallbacks) {}

  async ensureSession(input: { sessionId: string; cwd: string }): Promise<void> {
    this.opened.push(input)
  }

  async prompt(input: { sessionId: string; text: string }): Promise<{ messageId: string }> {
    this.prompts.push(input)
    this.callbacks.onNotification({ method: 'session.status', params: { sessionId: input.sessionId, status: 'running' } })
    return { messageId: 'msg-1' }
  }

  async close(): Promise<void> {
    this.closed = true
  }

  emit(notification: RuntimeNotification): void {
    this.callbacks.onNotification(notification)
  }

  fail(error: Error): void {
    this.callbacks.onFailure(error)
  }
}

/** Runtime whose first process dies before the session opens. */
class FailingStartRuntime extends FakeRuntime {
  override async ensureSession(): Promise<void> {
    throw new TransportClosedError('child exited during startup')
  }
}

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

async function startFixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-agent-service-'))
  let runtime: FakeRuntime | undefined
  let runtimeCount = 0
  const factory: AgentRuntimeFactory = (callbacks) => {
    runtimeCount += 1
    runtime = new FakeRuntime(callbacks)
    return runtime
  }
  const gateway = createAgentGateway({
    host: '127.0.0.1',
    port: 0,
    dataDir,
    publicDir: resolve(import.meta.dirname, '../public'),
    users,
    runtime: factory,
  })
  const port = await gateway.start()
  cleanups.push(async () => {
    await gateway.close()
    await rm(dataDir, { recursive: true, force: true })
  })
  return {
    port,
    dataDir,
    runtimeCount: (): number => runtimeCount,
    fake: (): FakeRuntime => {
      if (runtime === undefined) throw new Error('runtime not created')
      return runtime
    },
  }
}

async function call(port: number, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${String(port)}${path}`, init)
}

async function login(port: number, username: string, password: string): Promise<string> {
  const response = await call(port, '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie')
  if (cookie === null) throw new Error('login returned no cookie')
  return cookie.split(';', 1)[0] ?? ''
}

describe('agent-service gateway', () => {
  it('rejects invalid credentials and unauthenticated reads', async () => {
    const { port } = await startFixture()
    const bad = await call(port, '/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'analyst', password: 'wrong' }),
    })
    expect(bad.status).toBe(401)
    expect((await call(port, '/api/sessions')).status).toBe(401)
    expect((await call(port, '/styles.css')).status).toBe(200)
  })

  it('keeps the login page and console on separate routes', async () => {
    const { port } = await startFixture()
    const root = await call(port, '/', { redirect: 'manual' })
    expect(root.status).toBe(302)
    expect(root.headers.get('location')).toBe('/login')

    const loginPage = await call(port, '/login')
    expect(loginPage.status).toBe(200)
    expect(await loginPage.text()).toContain('登录')

    const anonymousConsole = await call(port, '/console', { redirect: 'manual' })
    expect(anonymousConsole.status).toBe(302)
    expect(anonymousConsole.headers.get('location')).toBe('/login')

    const analyst = await login(port, 'analyst', 'pw1')
    const signedInLogin = await call(port, '/login', { headers: { cookie: analyst }, redirect: 'manual' })
    expect(signedInLogin.headers.get('location')).toBe('/console')
    const consolePage = await call(port, '/console', { headers: { cookie: analyst } })
    expect(consolePage.status).toBe(200)
    expect(await consolePage.text()).toContain('新建分析')
  })

  it('creates one seeded session and keeps it private to the owner', async () => {
    const { port, dataDir } = await startFixture()
    const analyst = await login(port, 'analyst', 'pw1')
    const auditor = await login(port, 'auditor', 'pw2')
    const created = await call(port, '/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst },
      body: JSON.stringify({ title: '张某风险分析' }),
    })
    expect(created.status).toBe(201)
    const session = (await created.json()).session as { id: string }
    const seeded = await readFile(join(dataDir, 'sessions', session.id, 'case.md'), 'utf8')
    expect(seeded).toContain('JQ-2026-0001')

    const own = await call(port, '/api/sessions', { headers: { cookie: analyst } })
    expect((await own.json()).sessions).toHaveLength(1)
    const other = await call(port, '/api/sessions', { headers: { cookie: auditor } })
    expect((await other.json()).sessions).toEqual([])
    const crossRead = await call(port, `/api/sessions/${session.id}/events`, { headers: { cookie: auditor } })
    expect(crossRead.status).toBe(404)
    const crossWrite = await call(port, `/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: auditor },
      body: JSON.stringify({ text: '越权' }),
    })
    expect(crossWrite.status).toBe(404)
  })

  it('drives a prompt and reports the runtime failure to the running session', async () => {
    const { port, fake, runtimeCount } = await startFixture()
    const analyst = await login(port, 'analyst', 'pw1')
    const created = await call(port, '/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst },
      body: JSON.stringify({}),
    })
    const session = (await created.json()).session as { id: string }
    const prompt = await call(port, `/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst },
      body: JSON.stringify({ text: '分析当前案情' }),
    })
    expect(prompt.status).toBe(202)
    expect(fake().prompts).toEqual([{ sessionId: session.id, text: '分析当前案情' }])
    const events = await call(port, `/api/sessions/${session.id}/events?afterSeq=0`, { headers: { cookie: analyst } })
    const methods = ((await events.json()).events as { method: string }[]).map(event => event.method)
    expect(methods).toContain('gateway.user-message')
    expect(methods).toContain('gateway.receipt')

    fake().fail(new Error('child exited'))
    const after = await call(port, '/api/sessions', { headers: { cookie: analyst } })
    const sessions = (await after.json()).sessions as { id: string; status: string }[]
    expect(sessions.find(entry => entry.id === session.id)?.status).toBe('error')

    const recovered = await call(port, '/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst },
      body: JSON.stringify({}),
    })
    expect(recovered.status).toBe(201)
    expect(runtimeCount()).toBe(2)
  })

  it('retries one cold-start runtime loss before failing the session', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'dsh-agent-service-'))
    let runtimeCount = 0
    const gateway = createAgentGateway({
      host: '127.0.0.1',
      port: 0,
      dataDir,
      publicDir: resolve(import.meta.dirname, '../public'),
      users,
      runtime: (callbacks) => {
        runtimeCount += 1
        return runtimeCount === 1 ? new FailingStartRuntime(callbacks) : new FakeRuntime(callbacks)
      },
    })
    const port = await gateway.start()
    cleanups.push(async () => {
      await gateway.close()
      await rm(dataDir, { recursive: true, force: true })
    })
    const analyst = await login(port, 'analyst', 'pw1')
    const created = await call(port, '/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst },
      body: JSON.stringify({}),
    })
    expect(created.status).toBe(201)
    expect(runtimeCount).toBe(2)
  })

  it('streams the seeded history over server-sent events', async () => {
    const { port } = await startFixture()
    const analyst = await login(port, 'analyst', 'pw1')
    const created = await call(port, '/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst },
      body: JSON.stringify({}),
    })
    const session = (await created.json()).session as { id: string }
    const abort = new AbortController()
    cleanups.push(async () => { abort.abort() })
    const stream = await call(port, `/api/sessions/${session.id}/stream?afterSeq=0`, {
      headers: { cookie: analyst },
      signal: abort.signal,
    })
    expect(stream.status).toBe(200)
    const reader = stream.body?.getReader()
    if (reader === undefined) throw new Error('stream had no body')
    let payload = ''
    while (payload.length < 4096) {
      const chunk = await reader.read()
      if (chunk.done) break
      payload += new TextDecoder().decode(chunk.value)
      if (payload.includes('gateway.ready')) break
    }
    expect(payload).toContain('gateway.ready')
    await reader.cancel()
  })
})
