/** ACAS.X desktop account login and per-account harness-home resolution. */

import { join } from 'node:path'
import {
  accountView,
  loadAccountStore,
  prepareAccountHome,
  resolveAccountHome,
  verifyAccount,
  type AccountHome,
  type AccountSeed,
  type AccountView,
} from '@deepseek-ai/dsh-client-acasx/account'

/** Web demo 与桌面 demo 共用的内置账号；接入业务后端后替换这里。 */
export const DESKTOP_DEMO_ACCOUNTS: readonly AccountSeed[] = [
  { id: 'alice', username: 'alice', password: 'alice123', displayName: 'Alice' },
  { id: 'bob', username: 'bob', password: 'bob123', displayName: 'Bob' },
]

/** 一次成功的桌面登录：账号视图与它自己的运行时目录。 */
export interface DesktopAccountLogin {
  /** 不含密码材料的账号视图。 */
  readonly account: AccountView
  /** 该账号的 DSH_HOME / DSH_AGENTS_HOME 目录。 */
  readonly home: AccountHome
}

/** 桌面登录门使用的账号会话。 */
export interface DesktopAccountSession {
  /**
   * 校验一组账号密码。
   * @param username - 登录用户名。
   * @param password - 登录密码。
   * @returns 成功时的账号与目录；失败时为 undefined。
   */
  login(username: string, password: string): DesktopAccountLogin | undefined
}

/**
 * 创建一个桌面账号会话。
 *
 * 账号文件放在 ACAS.X 产品 home 的根部（默认 `~/.acasx/accounts.json`），
 * 每个账号的数据目录是 `~/.acasx/accounts/<id>/`。桌面端共用同一个
 * `desktop` profile，账号之间只隔离 DSH_HOME 与 DSH_AGENTS_HOME。
 * @param root - ACAS.X 产品 home。
 * @returns 可复用的账号会话。
 */
export function createDesktopAccountSession(root: string): DesktopAccountSession {
  const accounts = loadAccountStore(join(root, 'accounts.json'), DESKTOP_DEMO_ACCOUNTS)
  return {
    login(username, password) {
      const account = verifyAccount(accounts, username, password)
      if (account === undefined) return undefined
      const home = resolveAccountHome(root, account.id)
      prepareAccountHome(home, account)
      return { account: accountView(account), home }
    },
  }
}
