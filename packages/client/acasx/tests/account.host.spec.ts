/** ACAS.X 共享账号核心：账号存储、密码校验与运行时目录映射。 */

import { scryptSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { accountView, assertAccountId, loadAccountStore, prepareAccountHome, resolveAccountHome, verifyAccount } from '../src/account.ts'

const roots: string[] = []
const seeds = [
  { id: 'alice', username: 'alice', password: 'alice123', displayName: 'Alice' },
  { id: 'bob', username: 'bob', password: 'bob123', displayName: 'Bob' },
] as const

/**
 * 创建一个测试用的临时根目录。
 * @returns 已登记清理的临时目录。
 */
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'acasx-account-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ACAS.X 账号存储', () => {
  it('首次运行写入种子账号，之后按文件内容读取', () => {
    const file = join(tempRoot(), 'nested', 'accounts.json')
    const created = loadAccountStore(file, seeds)
    expect(created.map(account => account.id)).toEqual(['alice', 'bob'])
    expect(readFileSync(file, 'utf8')).toContain('alice')

    const reloaded = loadAccountStore(file, [])
    expect(reloaded).toEqual(created)
  })

  it('拒绝文件版本或账号列表非法', () => {
    const file = join(tempRoot(), 'accounts.json')
    writeFileSync(file, JSON.stringify({ version: 2, accounts: [] }))
    expect(() => loadAccountStore(file, [])).toThrow(/账号文件格式无效/)

    writeFileSync(file, JSON.stringify({ version: 1, accounts: {} }))
    expect(() => loadAccountStore(file, [])).toThrow(/账号文件格式无效/)
  })

  it('拒绝非对象、缺字段和非法 id 的记录', () => {
    const file = join(tempRoot(), 'accounts.json')
    writeFileSync(file, JSON.stringify({ version: 1, accounts: [42] }))
    expect(() => loadAccountStore(file, [])).toThrow(/第 0 条记录/)

    writeFileSync(file, JSON.stringify({ version: 1, accounts: [{ id: 'alice' }] }))
    expect(() => loadAccountStore(file, [])).toThrow(/第 0 条记录/)

    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        accounts: [{ id: 'BAD', username: 'alice', displayName: 'Alice', salt: 'salt', passwordHash: 'hash' }],
      }),
    )
    expect(() => loadAccountStore(file, [])).toThrow(/非法账号 id/)
  })
})

describe('ACAS.X 密码校验与账号视图', () => {
  it('只接受匹配的密码', () => {
    const accounts = loadAccountStore(join(tempRoot(), 'accounts.json'), seeds)
    const alice = accounts[0]
    if (alice === undefined) throw new Error('缺少 alice 种子账号')

    expect(verifyAccount(accounts, 'alice', 'alice123')?.id).toBe('alice')
    expect(verifyAccount(accounts, 'nobody', 'alice123')).toBeUndefined()
    expect(verifyAccount(accounts, 'alice', 'wrong')).toBeUndefined()
    expect(verifyAccount([{ ...alice, passwordHash: '00' }], 'alice', 'alice123')).toBeUndefined()

    const equalLengthWrongHash = scryptSync('different', alice.salt, 64).toString('hex')
    expect(verifyAccount([{ ...alice, passwordHash: equalLengthWrongHash }], 'alice', 'alice123')).toBeUndefined()
  })

  it('投影出的视图不含密码材料', () => {
    const accounts = loadAccountStore(join(tempRoot(), 'accounts.json'), seeds)
    const alice = accounts[0]
    if (alice === undefined) throw new Error('缺少 alice 种子账号')
    expect(accountView(alice)).toEqual({ id: 'alice', username: 'alice', displayName: 'Alice' })
  })
})

describe('ACAS.X 账号目录映射', () => {
  it('只接受安全账号 id', () => {
    expect(assertAccountId('alice-1')).toBe('alice-1')
    expect(() => assertAccountId('../alice')).toThrow(/非法账号 id/)
    expect(() => assertAccountId('Alice')).toThrow(/非法账号 id/)
  })

  it('把账号映射到自己的 home 与 agents 目录', () => {
    const root = tempRoot()
    expect(resolveAccountHome(root, 'alice')).toEqual({
      root: join(root, 'accounts', 'alice'),
      home: join(root, 'accounts', 'alice', 'home'),
      agents: join(root, 'accounts', 'alice', 'agents'),
    })
    expect(() => resolveAccountHome(root, 'bad id')).toThrow(/非法账号 id/)
  })

  it('创建目录和默认 AGENTS.md，且不覆盖已有内容', () => {
    const root = tempRoot()
    const accounts = loadAccountStore(join(root, 'accounts.json'), seeds)
    const alice = accounts[0]
    if (alice === undefined) throw new Error('缺少 alice 种子账号')
    const home = resolveAccountHome(root, 'alice')
    prepareAccountHome(home, alice)

    const instructions = join(home.agents, 'AGENTS.md')
    expect(existsSync(home.home)).toBe(true)
    expect(existsSync(home.agents)).toBe(true)
    expect(readFileSync(instructions, 'utf8')).toContain('Alice')

    writeFileSync(instructions, '自定义内容\n')
    prepareAccountHome(home, alice)
    expect(readFileSync(instructions, 'utf8')).toBe('自定义内容\n')
  })
})
