/**
 * Demo login and cookie-token handling for the agent-service gateway.
 *
 * Production deployments replace this with the prison system's own SSO or
 * account service. The gateway only owns the authenticated user id and never
 * trusts a browser-supplied user id or dsh session id.
 *
 * @module @deepseek-ai/dsh-agent-service/auth
 */

import { randomUUID } from 'node:crypto'
import { GatewayError, type GatewayUser } from './store.ts'

/** Name of the gateway authentication cookie. */
export const AUTH_COOKIE = 'dsh_agent_token'

/** One configured demo account. */
export interface DemoUser extends GatewayUser {
  /** Plain comparison password; demo configuration only. */
  readonly password: string
}

/** Login result returned to the browser. */
export interface LoginResult {
  /** Opaque bearer value stored in the authentication cookie. */
  readonly token: string
  /** Authenticated user safe to expose. */
  readonly user: GatewayUser
}

/**
 * In-memory demo credential and token store.
 */
export class AuthService {
  private readonly usersByName = new Map<string, DemoUser>()
  private readonly usersById = new Map<string, GatewayUser>()
  private readonly tokens = new Map<string, string>()

  /**
   * @param users - configured demo accounts.
   */
  constructor(users: readonly DemoUser[]) {
    for (const user of users) {
      this.usersByName.set(user.username, user)
      this.usersById.set(user.id, { id: user.id, username: user.username, displayName: user.displayName })
    }
  }

  /**
   * Verify one login and issue an opaque token.
   * @param username - login name.
   * @param password - plain comparison password.
   * @returns the issued token and authenticated user.
   * @throws {GatewayError} invalid-credentials for any mismatch.
   */
  login(username: string, password: string): LoginResult {
    const user = this.usersByName.get(username)
    if (user === undefined || user.password !== password) {
      throw new GatewayError('invalid-credentials', 401, 'The user name or password is incorrect.')
    }
    const token = randomUUID()
    this.tokens.set(token, user.id)
    return { token, user: { id: user.id, username: user.username, displayName: user.displayName } }
  }

  /**
   * Resolve one cookie token to its authenticated user.
   * @param token - opaque cookie value.
   * @returns the authenticated user.
   * @throws {GatewayError} not-authenticated when the token is missing or unknown.
   */
  userForToken(token: string | undefined): GatewayUser {
    const userId = token === undefined ? undefined : this.tokens.get(token)
    const user = userId === undefined ? undefined : this.usersById.get(userId)
    if (user === undefined) throw new GatewayError('not-authenticated', 401, 'Sign in to continue.')
    return user
  }

  /**
   * Revoke one token.
   * @param token - opaque cookie value.
   */
  logout(token: string | undefined): void {
    if (token !== undefined) this.tokens.delete(token)
  }
}

/**
 * Read one cookie value from a request header.
 * @param header - raw Cookie header.
 * @param name - cookie name.
 * @returns the decoded value, or undefined.
 */
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() !== name) continue
    return decodeURIComponent(part.slice(separator + 1).trim())
  }
  return undefined
}

/**
 * Build the Set-Cookie value for one issued token.
 * @param token - opaque bearer value.
 * @returns the cookie header value.
 */
export function authCookie(token: string): string {
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
}

/** @returns the Set-Cookie value that clears the authentication cookie. */
export function clearAuthCookie(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
