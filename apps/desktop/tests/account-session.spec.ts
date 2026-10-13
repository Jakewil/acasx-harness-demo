/** ACAS.X desktop account session: seeded login and per-account home creation. */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDesktopAccountSession } from '../src/account-session.ts'

const roots: string[] = []

/**
 * 创建测试用临时产品 home。
 * @returns 已登记清理的临时目录。
 */
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'acasx-desktop-account-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ACAS.X 桌面账号会话', () => {
  it('校验种子账号并创建它自己的 home 与 agents 目录', () => {
    const root = tempRoot()
    const session = createDesktopAccountSession(root)
    const login = session.login('alice', 'alice123')
    if (login === undefined) throw new Error('alice 登录失败')
    expect(login.account).toEqual({ id: 'alice', username: 'alice', displayName: 'Alice' })
    expect(login.home.home).toBe(join(root, 'accounts', 'alice', 'home'))
    expect(login.home.agents).toBe(join(root, 'accounts', 'alice', 'agents'))
    expect(existsSync(join(root, 'accounts.json'))).toBe(true)
    expect(readFileSync(join(login.home.agents, 'AGENTS.md'), 'utf8')).toContain('Alice')
  })

  it('拒绝未知用户名和错误密码', () => {
    const root = tempRoot()
    const session = createDesktopAccountSession(root)
    expect(session.login('nobody', 'alice123')).toBeUndefined()
    expect(session.login('alice', 'wrong')).toBeUndefined()
  })
})
