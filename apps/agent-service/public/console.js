import { api, element } from './client-api.js'

const state = {
  user: null,
  sessions: [],
  activeSessionId: null,
  stream: null,
  seenSeq: new Set(),
  toolCards: new Map(),
}

const currentUser = document.querySelector('#current-user')
const sessionList = document.querySelector('#session-list')
const sessionTitle = document.querySelector('#session-title')
const sessionStatus = document.querySelector('#session-status')
const messageList = document.querySelector('#message-list')
const composer = document.querySelector('#composer')
const composerInput = document.querySelector('#composer-input')
const sendButton = document.querySelector('#send-button')

document.querySelector('#logout-button').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {})
  window.location.replace('/login')
})

document.querySelector('#new-session-button').addEventListener('click', async () => {
  try {
    const payload = await api('/api/sessions', { method: 'POST', body: { title: '狱情分析' } })
    await loadSessions()
    openSession(payload.session.id)
  } catch (error) {
    appendMessage('error', error.message)
  }
})

composer.addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = composerInput.value.trim()
  if (text === '' || state.activeSessionId === null) return
  composerInput.value = ''
  sendButton.disabled = true
  try {
    await api(`/api/sessions/${encodeURIComponent(state.activeSessionId)}/messages`, {
      method: 'POST',
      body: { text },
    })
  } catch (error) {
    appendMessage('error', error.message)
  } finally {
    sendButton.disabled = false
  }
})

async function loadSessions() {
  const payload = await api('/api/sessions')
  state.sessions = payload.sessions
  renderSessionList()
}

function renderSessionList() {
  sessionList.replaceChildren()
  if (state.sessions.length === 0) {
    sessionList.append(element('p', 'session-empty', '还没有分析会话'))
    return
  }
  for (const session of state.sessions) {
    const item = element('button', 'session-item')
    item.type = 'button'
    item.setAttribute('aria-current', String(session.id === state.activeSessionId))
    item.append(element('span', 'session-title', session.title))
    item.append(element('span', 'session-meta', new Date(session.createdAt).toLocaleString('zh-CN')))
    item.addEventListener('click', () => openSession(session.id))
    sessionList.append(item)
  }
}

function openSession(sessionId) {
  const session = state.sessions.find(candidate => candidate.id === sessionId)
  if (session === undefined) return
  state.activeSessionId = sessionId
  state.seenSeq = new Set()
  state.toolCards = new Map()
  messageList.replaceChildren()
  sessionTitle.textContent = session.title
  setStatus(session.status)
  composerInput.disabled = false
  sendButton.disabled = false
  renderSessionList()
  stopStream()
  state.stream = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/stream?afterSeq=0`)
  state.stream.addEventListener('message', (event) => {
    handleGatewayEvent(JSON.parse(event.data))
  })
  state.stream.addEventListener('error', () => setStatus('running'))
}

function stopStream() {
  state.stream?.close()
  state.stream = null
}

function handleGatewayEvent(gatewayEvent) {
  if (state.seenSeq.has(gatewayEvent.seq)) return
  state.seenSeq.add(gatewayEvent.seq)
  if (gatewayEvent.method === 'gateway.user-message') {
    setStatus('running')
    appendMessage('user', gatewayEvent.payload.text)
    return
  }
  if (gatewayEvent.method === 'gateway.error') {
    setStatus('error')
    appendMessage('error', gatewayEvent.payload.message)
    return
  }
  if (gatewayEvent.method === 'session.status') {
    setStatus(gatewayEvent.payload.status)
    return
  }
  if (gatewayEvent.method !== 'session.event') return
  renderSessionEvent(gatewayEvent.payload.event)
}

function renderSessionEvent(event) {
  const data = event.data ?? {}
  switch (event.type) {
    case 'assistant/message': {
      const text = textOf(data.message?.content)
      if (text !== '') appendMessage('assistant', text)
      break
    }
    case 'tool/call':
      renderToolCall(data)
      break
    case 'tool/result':
      renderToolResult(data)
      break
    case 'turn/end': {
      const reason = data.reason ?? {}
      if (reason.kind === 'error') {
        setStatus('error')
        appendMessage('error', reason.error?.message ?? '模型调用失败')
        break
      }
      if (reason.kind === 'aborted' || reason.kind === 'interrupted') {
        setStatus('idle')
        appendMessage('system', '分析已中止')
        break
      }
      if (reason.kind === 'blocked') appendMessage('system', '分析被安全策略阻止')
      setStatus('idle')
      break
    }
    default:
      break
  }
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

function renderToolCall(data) {
  const card = element('article', 'tool-card')
  const header = element('header', 'tool-header')
  header.append(element('span', 'tool-name', data.name ?? 'tool'))
  const status = element('span', 'tool-state', '运行中')
  status.dataset.state = 'running'
  header.append(status)
  card.append(header)
  const body = element('pre', 'tool-body', data.arguments ?? '')
  card.append(body)
  if (typeof data.callId === 'string') state.toolCards.set(data.callId, { status, body })
  messageList.append(card)
  scrollMessages()
}

function renderToolResult(data) {
  const callId = data.message?.toolCallId
  const card = typeof callId === 'string' ? state.toolCards.get(callId) : undefined
  const text = textOf(data.message?.content)
  const output = data.error?.reason ? `${text}\n\n错误：${data.error.reason}` : text
  if (card !== undefined) {
    card.status.textContent = data.error === undefined ? '完成' : '失败'
    card.status.dataset.state = data.error === undefined ? 'done' : 'error'
    card.body.textContent = output
  } else {
    const fallback = element('article', 'tool-card')
    const header = element('header', 'tool-header')
    header.append(element('span', 'tool-name', 'tool result'))
    header.append(element('span', 'tool-state', '完成'))
    fallback.append(header)
    fallback.append(element('pre', 'tool-body', output))
    messageList.append(fallback)
  }
  scrollMessages()
}

function appendMessage(kind, text) {
  const message = element('div', `message ${kind}`, text)
  messageList.append(message)
  scrollMessages()
}

function setStatus(status) {
  const labels = { idle: '空闲', running: '分析中', error: '异常' }
  sessionStatus.dataset.status = status
  sessionStatus.textContent = labels[status] ?? status
  const session = state.sessions.find(candidate => candidate.id === state.activeSessionId)
  if (session !== undefined) session.status = status
}

function scrollMessages() {
  messageList.scrollTop = messageList.scrollHeight
}

async function boot() {
  try {
    const payload = await api('/api/me')
    state.user = payload.user
    currentUser.textContent = state.user.displayName
    await loadSessions()
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/login')
      return
    }
    appendMessage('error', error.message)
  }
}

void boot()
