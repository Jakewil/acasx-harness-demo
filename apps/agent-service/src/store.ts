/**
 * In-memory gateway state with per-user ownership checks.
 *
 * Browser sessions only ever name a gateway session id. The store resolves
 * that id against the authenticated user before returning any record, so one
 * user's session list, history, and live stream cannot be read through
 * another user's account.
 *
 * @module @deepseek-ai/dsh-agent-service/store
 */

import { isRecord } from './util.ts'

/** Structured gateway failure carrying the HTTP status the transport reports. */
export class GatewayError extends Error {
  /**
   * @param code - stable machine code for the failure.
   * @param status - HTTP status the transport reports.
   * @param message - operator-facing summary.
   */
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

/** One authenticated application user. */
export interface GatewayUser {
  /** Stable gateway-owned user id. */
  readonly id: string
  /** Login name. */
  readonly username: string
  /** Display name shown in the console. */
  readonly displayName: string
}

/** Lifecycle of one analysis session. */
export type SessionStatus = 'idle' | 'running' | 'error'

/** One gateway-owned analysis session. */
export interface GatewaySession {
  /** Gateway session id, also the dsh session id the gateway stores internally. */
  readonly id: string
  /** Owning user id. */
  readonly userId: string
  /** Operator-visible title. */
  title: string
  /** Creation timestamp in ISO 8601 form. */
  readonly createdAt: string
  /** Last observed lifecycle state. */
  status: SessionStatus
}

/** One persisted process event delivered to the browser. */
export interface GatewayEvent {
  /** Per-session monotonic sequence. */
  readonly seq: number
  /** Gateway session the event belongs to. */
  readonly sessionId: string
  /** Owning user id. */
  readonly userId: string
  /** Wire method or gateway-local event name. */
  readonly method: string
  /** Durable session event discriminant when the payload carries one. */
  readonly eventType?: string
  /** Event payload as received from the runtime. */
  readonly payload: Record<string, unknown>
  /** Arrival timestamp in ISO 8601 form. */
  readonly at: string
}

/** Listener receiving newly appended gateway events. */
export type GatewayEventListener = (event: GatewayEvent) => void

/**
 * In-memory session, history, and subscription store for one tenant.
 */
export class MemoryStore {
  private readonly users = new Map<string, GatewayUser>()
  private readonly sessions = new Map<string, GatewaySession>()
  private readonly events = new Map<string, GatewayEvent[]>()
  private readonly nextSeq = new Map<string, number>()
  private readonly listeners = new Map<string, Set<GatewayEventListener>>()

  /**
   * Register one authenticated user.
   * @param user - user record without credentials.
   */
  addUser(user: GatewayUser): void {
    this.users.set(user.id, user)
  }

  /**
   * List one user's sessions newest first.
   * @param userId - owning user id.
   * @returns the user's sessions.
   */
  listSessions(userId: string): GatewaySession[] {
    return [...this.sessions.values()]
      .filter(session => session.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  /**
   * Create one session owned by a user.
   * @param userId - owning user id.
   * @param input - session identity and initial title.
   * @returns the created session.
   */
  createSession(userId: string, input: { id: string; title: string }): GatewaySession {
    if (!this.users.has(userId)) throw new GatewayError('unknown-user', 401, 'The authenticated user is unknown.')
    if (this.sessions.has(input.id)) throw new GatewayError('session-exists', 409, 'That session already exists.')
    const session: GatewaySession = {
      id: input.id,
      userId,
      title: input.title,
      createdAt: new Date().toISOString(),
      status: 'idle',
    }
    this.sessions.set(session.id, session)
    this.events.set(session.id, [])
    this.nextSeq.set(session.id, 1)
    return session
  }

  /**
   * Resolve one session only when the authenticated user owns it.
   * @param userId - authenticated user id.
   * @param sessionId - gateway session id.
   * @returns the owned session.
   * @throws {GatewayError} session-not-found when the id is absent or not owned.
   */
  requireSession(userId: string, sessionId: string): GatewaySession {
    const session = this.sessions.get(sessionId)
    if (session === undefined || session.userId !== userId) {
      throw new GatewayError('session-not-found', 404, 'That analysis session is not available.')
    }
    return session
  }

  /**
   * Update one session's lifecycle state.
   * @param sessionId - gateway session id.
   * @param status - new lifecycle state.
   */
  setStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId)
    if (session !== undefined) session.status = status
  }

  /**
   * Append one event to a session and notify its live subscribers.
   * @param sessionId - target gateway session.
   * @param method - wire method or gateway-local event name.
   * @param payload - event payload.
   * @returns the appended event, or undefined when the session is unknown.
   */
  appendEvent(sessionId: string, method: string, payload: Record<string, unknown>): GatewayEvent | undefined {
    const session = this.sessions.get(sessionId)
    if (session === undefined) return undefined
    const seq = this.nextSeq.get(sessionId) ?? 1
    this.nextSeq.set(sessionId, seq + 1)
    const eventType = eventTypeOf(method, payload)
    const event: GatewayEvent = {
      seq,
      sessionId,
      userId: session.userId,
      method,
      ...eventType === undefined ? {} : { eventType },
      payload,
      at: new Date().toISOString(),
    }
    this.events.get(sessionId)?.push(event)
    for (const listener of this.listeners.get(sessionId) ?? []) {
      try {
        listener(event)
      } catch (error) {
        // A subscriber failure must not stop delivery to other subscribers.
        void error
      }
    }
    return event
  }

  /**
   * List one owned session's events after an exclusive sequence.
   * @param userId - authenticated user id.
   * @param sessionId - gateway session id.
   * @param afterSeq - last sequence the caller already has.
   * @returns ordered events with a greater sequence.
   */
  listEvents(userId: string, sessionId: string, afterSeq: number): GatewayEvent[] {
    this.requireSession(userId, sessionId)
    return (this.events.get(sessionId) ?? []).filter(event => event.seq > afterSeq)
  }

  /**
   * Subscribe to one owned session's live events.
   * @param userId - authenticated user id.
   * @param sessionId - gateway session id.
   * @param listener - event sink.
   * @returns an idempotent disposer.
   */
  subscribe(userId: string, sessionId: string, listener: GatewayEventListener): () => void {
    this.requireSession(userId, sessionId)
    const set = this.listeners.get(sessionId) ?? new Set<GatewayEventListener>()
    set.add(listener)
    this.listeners.set(sessionId, set)
    return () => {
      const current = this.listeners.get(sessionId)
      if (current === undefined) return
      current.delete(listener)
      if (current.size === 0) this.listeners.delete(sessionId)
    }
  }

  /**
   * Mark every running session failed after the shared runtime dies.
   * @param message - operator-facing failure summary.
   */
  failRunning(message: string): void {
    for (const session of this.sessions.values()) {
      if (session.status !== 'running') continue
      session.status = 'error'
      this.appendEvent(session.id, 'gateway.error', { message })
    }
  }
}

/** Extract the durable event discriminant the browser renders. */
function eventTypeOf(method: string, payload: Record<string, unknown>): string | undefined {
  if (method !== 'session.event') return undefined
  const event = payload.event
  if (!isRecord(event)) return undefined
  return typeof event.type === 'string' ? event.type : undefined
}
