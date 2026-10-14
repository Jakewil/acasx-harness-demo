export async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? '请求失败')
    error.status = response.status
    throw error
  }
  return payload
}

export function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
