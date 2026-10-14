import { describe, expect, it } from 'vitest'
import { AuthService, authCookie, clearAuthCookie, parseCookie } from '../src/auth.ts'
import { GatewayError, MemoryStore } from '../src/store.ts'

const users = [
  { id: 'u1', username: 'analyst', password: 'pw1', displayName: '分析员' },
  { id: 'u2', username: 'auditor', password: 'pw2', displayName: '审核员' },
]

describe('agent-service auth', () => {
  it('issues opaque tokens and rejects unknown credentials', () => {
    const auth = new AuthService(users)
    const issued = auth.login('analyst', 'pw1')
    expect(issued.user).toEqual({ id: 'u1', username: 'analyst', displayName: '分析员' })
    expect(auth.userForToken(issued.token).id).toBe('u1')
    expect(() => auth.login('analyst', 'wrong')).toThrow(GatewayError)
    expect(() => auth.userForToken('missing')).toThrow('Sign in to continue.')
  })

  it('revokes tokens and round-trips cookie values', () => {
    const auth = new AuthService(users)
    const issued = auth.login('auditor', 'pw2')
    const cookie = authCookie(issued.token)
    expect(parseCookie(cookie, 'dsh_agent_token')).toBe(issued.token)
    expect(parseCookie(undefined, 'dsh_agent_token')).toBeUndefined()
    expect(parseCookie('other=1; broken', 'dsh_agent_token')).toBeUndefined()
    auth.logout(issued.token)
    expect(() => auth.userForToken(issued.token)).toThrow('Sign in to continue.')
    expect(clearAuthCookie()).toContain('Max-Age=0')
  })
})

describe('agent-service store isolation', () => {
  it('returns only the owner session and rejects cross-user reads', () => {
    const store = new MemoryStore()
    store.addUser({ id: 'u1', username: 'analyst', displayName: '分析员' })
    store.addUser({ id: 'u2', username: 'auditor', displayName: '审核员' })
    store.createSession('u1', { id: 's1', title: '分析' })
    expect(store.listSessions('u1').map(entry => entry.id)).toEqual(['s1'])
    expect(store.listSessions('u2')).toEqual([])
    expect(store.requireSession('u1', 's1').id).toBe('s1')
    expect(() => store.requireSession('u2', 's1')).toThrow('not available')
    expect(() => store.listEvents('u2', 's1', 0)).toThrow('not available')
    expect(store.appendEvent('missing', 'gateway.ready', {})).toBeUndefined()
  })

  it('appends ordered events and notifies only the owned subscription', () => {
    const store = new MemoryStore()
    store.addUser({ id: 'u1', username: 'analyst', displayName: '分析员' })
    store.addUser({ id: 'u2', username: 'auditor', displayName: '审核员' })
    store.createSession('u1', { id: 's1', title: '分析' })
    const delivered: number[] = []
    const dispose = store.subscribe('u1', 's1', event => delivered.push(event.seq))
    const first = store.appendEvent('s1', 'gateway.ready', {})
    const second = store.appendEvent('s1', 'session.event', { event: { type: 'tool/call', data: {} } })
    expect(first?.seq).toBe(1)
    expect(second?.seq).toBe(2)
    expect(second?.eventType).toBe('tool/call')
    expect(delivered).toEqual([1, 2])
    dispose()
    store.appendEvent('s1', 'gateway.ready', {})
    expect(delivered).toEqual([1, 2])
    expect(() => store.subscribe('u2', 's1', () => {})).toThrow('not available')
  })

  it('fails only running sessions when the runtime dies', () => {
    const store = new MemoryStore()
    store.addUser({ id: 'u1', username: 'analyst', displayName: '分析员' })
    store.createSession('u1', { id: 'idle', title: '空闲' })
    store.createSession('u1', { id: 'busy', title: '运行中' })
    store.setStatus('busy', 'running')
    store.failRunning('runtime stopped')
    expect(store.requireSession('u1', 'idle').status).toBe('idle')
    expect(store.requireSession('u1', 'busy').status).toBe('error')
    expect(store.listEvents('u1', 'busy', 0).map(event => event.method)).toEqual(['gateway.error'])
  })
})
