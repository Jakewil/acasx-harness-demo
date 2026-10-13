/**
 * ACAS.X 账号与运行时目录映射的 Host 侧共享模块。
 *
 * 这里只处理账号记录、密码校验和“账号 → 独立 DSH_HOME / DSH_AGENTS_HOME”的
 * 纯映射，不包含 HTTP 登录页、端口、cookie 或任何运行时启动逻辑。Web
 * 开发适配器和桌面端 Electron main 各自消费这份模块，再按自己的方式启动
 * dsh。
 * @module @deepseek-ai/dsh-client-acasx/account
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 演示或部署注入的账号种子；密码只在建库时出现。 */
export interface AccountSeed {
  /** 稳定的账号 id，也是数据目录名。 */
  readonly id: string
  /** 登录用户名。 */
  readonly username: string
  /** 登录密码明文；只用于初始化账号存储。 */
  readonly password: string
  /** 界面显示名。 */
  readonly displayName: string
}

/** 持久化到账号文件中的账号记录。 */
export interface AccountRecord {
  /** 稳定的账号 id。 */
  readonly id: string
  /** 登录用户名。 */
  readonly username: string
  /** 界面显示名。 */
  readonly displayName: string
  /** 每个账号独立的密码盐。 */
  readonly salt: string
  /** scrypt 派生的十六进制密码摘要。 */
  readonly passwordHash: string
}

/** 可以安全交给登录界面的账号视图，不含密码材料。 */
export interface AccountView {
  /** 稳定的账号 id。 */
  readonly id: string
  /** 登录用户名。 */
  readonly username: string
  /** 界面显示名。 */
  readonly displayName: string
}

/** 一个账号对应的运行时目录。 */
export interface AccountHome {
  /** 账号自己的根目录，位于产品数据根之下。 */
  readonly root: string
  /** 该账号的 DSH_HOME。 */
  readonly home: string
  /** 该账号的 DSH_AGENTS_HOME。 */
  readonly agents: string
}

/** 账号 id 允许的字符集。 */
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

/**
 * 校验账号 id，避免它进入文件路径时越界。
 * @param id - 待校验的账号 id。
 * @returns 校验通过的账号 id。
 * @throws 当 id 不符合字符集或长度限制时。
 */
export function assertAccountId(id: string): string {
  if (!ACCOUNT_ID_PATTERN.test(id)) throw new Error(`非法账号 id：${JSON.stringify(id)}`)
  return id
}

/**
 * 把账号种子转换成带盐和摘要的持久化记录。
 * @param seed - 账号种子。
 * @returns 可以写入账号文件的记录。
 */
function createAccountRecord(seed: AccountSeed): AccountRecord {
  assertAccountId(seed.id)
  const salt = randomBytes(16).toString('hex')
  return {
    id: seed.id,
    username: seed.username,
    displayName: seed.displayName,
    salt,
    passwordHash: scryptSync(seed.password, salt, 64).toString('hex'),
  }
}

/**
 * 读取账号文件；文件不存在时用种子初始化。
 * @param file - 账号文件路径。
 * @param seeds - 首次初始化使用的账号种子。
 * @returns 账号记录列表。
 * @throws 当已有文件不是受支持的账号文档时。
 */
export function loadAccountStore(file: string, seeds: readonly AccountSeed[]): AccountRecord[] {
  if (!existsSync(file)) {
    const accounts = seeds.map(createAccountRecord)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify({ version: 1, accounts }, undefined, 2)}\n`)
    return accounts
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown; accounts?: unknown }
  if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) {
    throw new Error(`账号文件格式无效：${file}`)
  }
  return parsed.accounts.map((value, index) => readAccountRecord(file, index, value))
}

/**
 * 校验账号文件中一条持久化记录。
 * @param file - 账号文件路径，用于错误定位。
 * @param index - 记录在数组中的位置。
 * @param value - 待校验的原始值。
 * @returns 校验通过的账号记录。
 * @throws 当记录缺少字符串字段或 id 非法时。
 */
function readAccountRecord(file: string, index: number, value: unknown): AccountRecord {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
  const fields = ['id', 'username', 'displayName', 'salt', 'passwordHash'] as const
  if (record === undefined || fields.some(field => typeof record[field] !== 'string')) {
    throw new Error(`账号文件格式无效：${file} 的第 ${String(index)} 条记录`)
  }
  const account = record as { id: string; username: string; displayName: string; salt: string; passwordHash: string }
  assertAccountId(account.id)
  return account
}

/**
 * 用恒定时间比较校验用户名和密码。
 * @param accounts - 账号记录列表。
 * @param username - 登录用户名。
 * @param password - 登录密码明文。
 * @returns 匹配的账号；用户名或密码错误时为 undefined。
 */
export function verifyAccount(accounts: readonly AccountRecord[], username: string, password: string): AccountRecord | undefined {
  const account = accounts.find(candidate => candidate.username === username)
  if (account === undefined) return undefined
  const expected = Buffer.from(account.passwordHash, 'hex')
  const actual = Buffer.from(scryptSync(password, account.salt, 64).toString('hex'), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? account : undefined
}

/**
 * 把账号记录投影成不含密码材料的界面视图。
 * @param account - 账号记录。
 * @returns 可以交给登录界面的视图。
 */
export function accountView(account: AccountRecord): AccountView {
  return { id: account.id, username: account.username, displayName: account.displayName }
}

/**
 * 解析一个账号的运行时目录。
 * @param root - 产品数据根目录。
 * @param id - 账号 id。
 * @returns 该账号的根目录、DSH_HOME 与 DSH_AGENTS_HOME。
 */
export function resolveAccountHome(root: string, id: string): AccountHome {
  assertAccountId(id)
  const accountRoot = join(root, 'accounts', id)
  return { root: accountRoot, home: join(accountRoot, 'home'), agents: join(accountRoot, 'agents') }
}

/**
 * 创建账号目录，并写入一份只属于该账号的 AGENTS.md。
 * @param home - 账号目录布局。
 * @param account - 账号记录。
 */
export function prepareAccountHome(home: AccountHome, account: AccountRecord): void {
  mkdirSync(home.home, { recursive: true })
  mkdirSync(home.agents, { recursive: true })
  const instructions = join(home.agents, 'AGENTS.md')
  if (existsSync(instructions)) return
  writeFileSync(
    instructions,
    `# ACAS.X 演示账号\n\n- 当前账号：${account.displayName}\n- 账号 ID：${account.id}\n\n这个目录只属于该账号。\n`,
  )
}
