#!/usr/bin/env node
/**
 * ACAS.X 多账号 Web 调试适配器。
 *
 * 账号存储、密码校验和“账号 → DSH_HOME / DSH_AGENTS_HOME”的映射来自
 * `../src/account.ts`，与桌面端 Electron main 计划共用同一份 Host 侧模块。
 * 本文件只承担 Web 调试面独有的部分：HTTP 登录页、浏览器会话 cookie，以及
 * 为当前账号启动一个 dsh web 子进程。
 *
 * 桌面端不会复用这里的 HTTP 服务或端口：它由 Electron main 在 Host 启动前
 * 显示登录窗口，并按同一份账号映射设置 Host 的 DSH_HOME。
 *
 * 数据默认写入 ~/.acasx-demo，可用 ACASX_DEMO_HOME 覆盖；
 * 登录页默认监听 127.0.0.1:8088，可用 ACASX_DEMO_PORT 覆盖。
 */

import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAccountStore, prepareAccountHome, resolveAccountHome, verifyAccount } from '../src/account.ts'

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const demoRoot = process.env.ACASX_DEMO_HOME ?? join(homedir(), '.acasx-demo')
const listenPort = readPort(process.env.ACASX_DEMO_PORT ?? '8088')
const accountsFile = join(demoRoot, 'accounts.json')
const cookieName = 'acasx_demo_session'
const runtimeTimeoutMs = 180_000
const shutdownGraceMs = 6_000

/** Web 调试面的内置账号；桌面端接入真实账号源后替换这里。 */
const seededAccounts = [
  { id: 'alice', username: 'alice', password: 'alice123', displayName: 'Alice' },
  { id: 'bob', username: 'bob', password: 'bob123', displayName: 'Bob' },
]

/** 已登录浏览器会话：token -> accountId。演示阶段保存在内存里。 */
const loginSessions = new Map()
/** 当前唯一运行的 dsh web；切换账号会先停掉它。 */
let activeRuntime

/**
 * 校验监听端口。
 * @param value - 环境变量中的端口文本。
 * @returns 可用的 TCP 端口。
 */
function readPort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`ACASX_DEMO_PORT 必须是 1-65535 的整数，收到 ${JSON.stringify(value)}`)
  }
  return port
}

/**
 * 统计账号 home 下已落盘的会话目录数量。
 * @param home - 账号的 DSH_HOME。
 * @returns 会话目录数量；目录不存在时为 0。
 */
function countSessions(home) {
  try {
    return readdirSync(join(home, 'sessions'), { withFileTypes: true }).filter(entry => entry.isDirectory()).length
  } catch (error) {
    if (error instanceof Error && error.code !== 'ENOENT') {
      console.warn(`[acasx demo] 读取会话目录失败：${error.message}`)
    }
    return 0
  }
}

/**
 * 汇总账号展示与运行时状态。
 * @param account - 账号记录。
 * @returns 页面和状态接口使用的状态对象。
 */
function runtimeStatus(account) {
  const home = resolveAccountHome(demoRoot, account.id)
  const running = activeRuntime?.accountId === account.id
  return {
    ready: running && activeRuntime.url !== undefined,
    url: running ? activeRuntime.url : undefined,
    error: running ? activeRuntime.error : undefined,
    home: home.home,
    agents: home.agents,
    sessions: countSessions(home.home),
  }
}

/**
 * 启动账号自己的 dsh web，并等待它打印认证 URL。
 * @param account - 账号记录。
 * @returns 已就绪的运行时记录。
 */
function startRuntime(account) {
  const home = resolveAccountHome(demoRoot, account.id)
  prepareAccountHome(home, account)
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'],
      {
        cwd: repositoryRoot,
        env: { ...process.env, DSH_HOME: home.home, DSH_AGENTS_HOME: home.agents },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const entry = { accountId: account.id, child, url: undefined, error: undefined, tail: '' }
    activeRuntime = entry
    let settled = false
    const settle = (error, url) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      entry.url = url
      entry.error = error
      if (url === undefined) reject(new Error(error ?? `账号 ${account.id} 的 dsh web 启动失败`))
      else resolve(entry)
    }
    const timer = setTimeout(() => {
      entry.error = `启动超时（${runtimeTimeoutMs}ms）`
      child.kill('SIGTERM')
      settle(entry.error)
    }, runtimeTimeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      const text = chunk.toString()
      entry.tail = `${entry.tail}${text}`.slice(-8000)
      const match = /dsh web:\s+(https?:\/\/\S+)/.exec(entry.tail)
      if (match !== null) {
        process.stdout.write(`[acasx demo ${account.id}] dsh web 已就绪\n`)
        settle(undefined, match[1])
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      const text = chunk.toString()
      entry.tail = `${entry.tail}${text}`.slice(-8000)
      process.stderr.write(`[acasx demo ${account.id}] ${text}`)
    })
    child.once('error', error => {
      entry.error = error.message
      settle(entry.error)
    })
    child.once('close', code => {
      if (!settled) {
        entry.error = `dsh web 提前退出，退出码 ${String(code)}`
        settle(entry.error)
      } else if (entry.error === undefined) {
        entry.error = `dsh web 已停止，退出码 ${String(code)}`
      }
    })
  })
}

/**
 * 停止当前 dsh web，并等待它退出。
 * @returns 子进程退出后的 Promise。
 */
async function stopRuntime() {
  const entry = activeRuntime
  if (entry === undefined) return
  activeRuntime = undefined
  const child = entry.child
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise(resolve => {
    let finished = false
    let timer
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve()
    }
    child.once('close', finish)
    timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish()
    }, shutdownGraceMs)
    child.kill('SIGTERM')
  })
}

/**
 * 确保当前账号的运行时已启动；账号变化时先停掉旧运行时。
 * @param account - 目标账号。
 * @returns 已就绪的运行时记录。
 */
async function ensureRuntime(account) {
  if (activeRuntime?.accountId === account.id && activeRuntime.url !== undefined) return activeRuntime
  for (const [token, accountId] of loginSessions) {
    if (accountId !== account.id) loginSessions.delete(token)
  }
  await stopRuntime()
  return startRuntime(account)
}

/**
 * 在后台启动账号运行时；登录响应不等待 dsh 就绪。
 * @param account - 目标账号。
 */
function startRuntimeInBackground(account) {
  void ensureRuntime(account).catch(error => {
    console.error(`[acasx demo] 账号 ${account.id} 启动失败：${error instanceof Error ? error.message : String(error)}`)
  })
}

/**
 * 输出 HTML 响应。
 * @param response - HTTP 响应。
 * @param status - 状态码。
 * @param html - 页面内容。
 */
function sendHtml(response, status, html) {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  response.end(html)
}

/**
 * 输出 JSON 响应。
 * @param response - HTTP 响应。
 * @param status - 状态码。
 * @param value - JSON 值。
 */
function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

/**
 * 转义写入 HTML 的文本。
 * @param value - 原始文本。
 * @returns HTML 安全文本。
 */
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/**
 * 解析请求 cookie。
 * @param request - HTTP 请求。
 * @returns 名称到值的映射。
 */
function readCookies(request) {
  const header = request.headers.cookie ?? ''
  const cookies = new Map()
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()))
  }
  return cookies
}

/**
 * 读取当前浏览器的登录会话。
 * @param request - HTTP 请求。
 * @returns 会话与账号；未登录时为 undefined。
 */
function readSession(request) {
  const token = readCookies(request).get(cookieName)
  if (token === undefined) return undefined
  const accountId = loginSessions.get(token)
  if (accountId === undefined) return undefined
  return { token, account: accounts.find(candidate => candidate.id === accountId) }
}

/**
 * 读取表单请求体。
 * @param request - HTTP 请求。
 * @returns 解析后的表单参数。
 */
async function readForm(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 8192) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

/** 页面共用的基础样式。 */
function baseCss() {
  return `
:root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f5f7; color: #1f2937; }
.panel { width: min(420px, calc(100vw - 32px)); background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 28px; }
.eyebrow { margin: 0 0 4px; color: #6b7280; font-size: 13px; letter-spacing: 0; }
h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: 0; }
.muted { color: #6b7280; font-size: 14px; }
.error { margin: 12px 0 0; padding: 10px 12px; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 6px; font-size: 14px; }
.pending { margin: 16px 0 0; color: #4b5563; font-size: 14px; }
form { margin-top: 18px; display: grid; gap: 12px; }
label { display: grid; gap: 6px; font-size: 14px; color: #374151; }
input { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; font: inherit; }
button { font: inherit; border-radius: 6px; border: 1px solid #d1d5db; background: #f9fafb; color: #111827; padding: 10px 14px; cursor: pointer; }
button:hover { background: #f3f4f6; }
.primary { border-color: #111827; background: #111827; color: #fff; text-align: center; text-decoration: none; }
.primary:hover { background: #374151; }
.link { display: inline-block; margin-top: 18px; padding: 10px 16px; }
.demo { margin-top: 22px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
.demo-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.lines { margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; font-size: 14px; }
.lines li { display: grid; gap: 2px; }
.lines span { color: #6b7280; font-size: 12px; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; word-break: break-all; }
`
}

/**
 * 渲染登录页。
 * @param error - 可选的错误提示。
 * @returns 登录页面 HTML。
 */
function loginPage(error) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ACAS.X 登录</title>
<style>${baseCss()}</style>
</head>
<body>
<main class="panel">
  <p class="eyebrow">ACAS.X 综合智能体</p>
  <h1>账号登录</h1>
  <p class="muted">登录成功后进入属于该账号的独立会话环境。</p>
  ${error === undefined ? '' : `<p class="error">${escapeHtml(error)}</p>`}
  <form method="post" action="/login">
    <label>用户名<input name="username" autocomplete="username" required autofocus></label>
    <label>密码<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="primary" type="submit">登录</button>
  </form>
  <div class="demo">
    <p class="muted">演示账号</p>
    <div class="demo-actions">
      <button type="button" data-user="alice" data-password="alice123">Alice / alice123</button>
      <button type="button" data-user="bob" data-password="bob123">Bob / bob123</button>
    </div>
  </div>
</main>
<script>
for (const button of document.querySelectorAll('[data-user]')) {
  button.addEventListener('click', () => {
    document.querySelector('input[name=username]').value = button.dataset.user
    document.querySelector('input[name=password]').value = button.dataset.password
  })
}
</script>
</body>
</html>`
}

/**
 * 渲染登录后的账号页。
 * @param account - 当前账号。
 * @param status - 运行时状态。
 * @returns 账号页面 HTML。
 */
function accountPage(account, status) {
  const running = status.ready
    ? `<a class="primary link" href="${escapeHtml(status.url)}" target="_blank" rel="noreferrer">打开 ACAS.X</a>`
    : status.error === undefined
      ? '<p class="pending">正在启动账号运行时，请稍候……</p>'
      : `<p class="error">启动失败：${escapeHtml(status.error)}</p>`
  const poll =
    status.ready || status.error !== undefined
      ? ''
      : `<script>
const poll = async () => {
  const response = await fetch('/api/status')
  const status = await response.json()
  if (status.ready || status.error) location.reload()
  else setTimeout(poll, 900)
}
setTimeout(poll, 900)
</script>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ACAS.X 账号</title>
<style>${baseCss()}</style>
</head>
<body>
<main class="panel">
  <p class="eyebrow">ACAS.X 综合智能体</p>
  <h1>${escapeHtml(account.displayName)}</h1>
  <p class="muted">当前账号：${escapeHtml(account.username)}（${escapeHtml(account.id)}）</p>
  <ul class="lines">
    <li><span>数据目录</span><code>${escapeHtml(status.home)}</code></li>
    <li><span>Agent 指令目录</span><code>${escapeHtml(status.agents)}</code></li>
    <li><span>已落盘会话数</span><code>${String(status.sessions)}</code></li>
  </ul>
  ${running}
  <p class="muted" style="margin-top:18px">切换账号前先退出登录；每个账号的会话与凭据只存在于自己的数据目录。</p>
  <form method="post" action="/logout">
    <button type="submit">退出登录</button>
  </form>
</main>
${poll}
</body>
</html>`
}

mkdirSync(demoRoot, { recursive: true })
const accounts = loadAccountStore(accountsFile, seededAccounts)

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? 'GET'
    const url = new URL(request.url ?? '/', 'http://acasx.demo')
    if (method === 'GET' && url.pathname === '/healthz') {
      sendJson(response, 200, { ok: true })
      return
    }
    if (method === 'GET' && url.pathname === '/') {
      if (readSession(request) !== undefined) {
        response.writeHead(303, { location: '/account', 'cache-control': 'no-store' })
        response.end()
        return
      }
      sendHtml(response, 200, loginPage(url.searchParams.get('error') ?? undefined))
      return
    }
    if (method === 'POST' && url.pathname === '/login') {
      const form = await readForm(request)
      const account = verifyAccount(accounts, form.get('username')?.trim() ?? '', form.get('password') ?? '')
      if (account === undefined) {
        response.writeHead(303, { location: `/?error=${encodeURIComponent('用户名或密码不正确')}`, 'cache-control': 'no-store' })
        response.end()
        return
      }
      const token = randomBytes(32).toString('hex')
      loginSessions.set(token, account.id)
      startRuntimeInBackground(account)
      response.writeHead(303, {
        location: '/account',
        'set-cookie': `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`,
        'cache-control': 'no-store',
      })
      response.end()
      return
    }
    if (method === 'GET' && url.pathname === '/account') {
      const session = readSession(request)
      if (session === undefined) {
        response.writeHead(303, { location: '/', 'cache-control': 'no-store' })
        response.end()
        return
      }
      sendHtml(response, 200, accountPage(session.account, runtimeStatus(session.account)))
      return
    }
    if (method === 'GET' && url.pathname === '/api/status') {
      const session = readSession(request)
      if (session === undefined) {
        sendJson(response, 401, { error: '未登录' })
        return
      }
      sendJson(response, 200, runtimeStatus(session.account))
      return
    }
    if ((method === 'POST' || method === 'GET') && url.pathname === '/logout') {
      const session = readSession(request)
      if (session !== undefined) {
        loginSessions.delete(session.token)
        await stopRuntime()
      }
      response.writeHead(303, {
        location: '/',
        'set-cookie': `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
        'cache-control': 'no-store',
      })
      response.end()
      return
    }
    sendHtml(response, 404, '<h1>404</h1>')
  } catch (error) {
    console.error('[acasx demo] 请求处理失败', error)
    if (!response.headersSent) {
      sendHtml(
        response,
        500,
        `<h1>500</h1><pre>${escapeHtml(error instanceof Error ? (error.stack ?? error.message) : String(error))}</pre>`,
      )
    } else {
      response.end()
    }
  }
})

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`[acasx demo] 登录页：http://127.0.0.1:${listenPort}`)
  console.log(`[acasx demo] 数据根目录：${demoRoot}`)
  console.log('[acasx demo] 演示账号：alice / alice123、bob / bob123')
  if ((process.env.DEEPSEEK_API_KEY ?? '') === '' && !existsSync(join(homedir(), '.acasx', '.credentials.yaml'))) {
    console.warn('[acasx demo] 未检测到 DEEPSEEK_API_KEY 或 ~/.acasx/.credentials.yaml；账号隔离可用，但模型对话会失败。')
  }
})

/**
 * 停止子进程后退出。
 * @returns 退出前完成清理的 Promise。
 */
async function shutdown() {
  server.close()
  await stopRuntime()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
