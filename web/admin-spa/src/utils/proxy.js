export function createDefaultProxyState() {
  return {
    enabled: false,
    type: 'socks5',
    host: '',
    port: '',
    username: '',
    password: ''
  }
}

function parseProxyResponse(rawProxy) {
  if (!rawProxy) {
    return null
  }

  let proxyObject = rawProxy
  if (typeof rawProxy === 'string') {
    try {
      proxyObject = JSON.parse(rawProxy)
    } catch {
      return null
    }
  }

  if (
    proxyObject &&
    typeof proxyObject === 'object' &&
    proxyObject.proxy &&
    typeof proxyObject.proxy === 'object'
  ) {
    proxyObject = proxyObject.proxy
  }

  if (!proxyObject || typeof proxyObject !== 'object') {
    return null
  }

  const host =
    typeof proxyObject.host === 'string'
      ? proxyObject.host.trim()
      : proxyObject.host !== undefined && proxyObject.host !== null
        ? String(proxyObject.host).trim()
        : ''

  const port =
    proxyObject.port !== undefined && proxyObject.port !== null
      ? String(proxyObject.port).trim()
      : ''

  const type =
    typeof proxyObject.type === 'string' && proxyObject.type.trim()
      ? proxyObject.type.trim()
      : 'socks5'

  const username =
    typeof proxyObject.username === 'string'
      ? proxyObject.username
      : proxyObject.username !== undefined && proxyObject.username !== null
        ? String(proxyObject.username)
        : ''

  const password =
    typeof proxyObject.password === 'string'
      ? proxyObject.password
      : proxyObject.password !== undefined && proxyObject.password !== null
        ? String(proxyObject.password)
        : ''

  return { type, host, port, username, password }
}

export function normalizeProxyFormState(rawProxy) {
  const parsed = parseProxyResponse(rawProxy)

  if (parsed && parsed.host && parsed.port) {
    return {
      enabled: true,
      type: parsed.type || 'socks5',
      host: parsed.host,
      port: parsed.port,
      username: parsed.username || '',
      password: parsed.password || ''
    }
  }

  return createDefaultProxyState()
}

export function getProxyValidationError(proxyState) {
  if (!proxyState || !proxyState.enabled) {
    return ''
  }

  const type = String(proxyState.type || 'socks5')
    .trim()
    .toLowerCase()
  if (!['socks5', 'http', 'https'].includes(type)) {
    return '代理类型必须是 SOCKS5 / HTTP / HTTPS'
  }

  const host = (proxyState.host || '').trim()
  if (!host) {
    return '请填写代理主机地址'
  }

  const portNumber = Number.parseInt(proxyState.port, 10)
  if (!Number.isFinite(portNumber) || portNumber < 1 || portNumber > 65535) {
    return '请填写正确的代理端口 (1-65535)'
  }

  return ''
}

export function buildProxyPayload(proxyState) {
  if (!proxyState || !proxyState.enabled) {
    return null
  }

  const validationError = getProxyValidationError(proxyState)
  if (validationError) {
    return null
  }

  const username = proxyState.username ? proxyState.username.trim() : ''
  const password = proxyState.password ? proxyState.password.trim() : ''

  return {
    type: (proxyState.type || 'socks5').trim(),
    host: (proxyState.host || '').trim(),
    port: Number.parseInt(proxyState.port, 10),
    username: username || null,
    password: password || null
  }
}

export function formatProxySummary(proxyConfig) {
  const parsed = parseProxyResponse(proxyConfig)
  if (!parsed || !parsed.host || !parsed.port) {
    return ''
  }

  const type = parsed.type || 'socks5'
  const hasAuth = !!(parsed.username && parsed.password)
  return `${type}://${parsed.host}:${parsed.port}${hasAuth ? ' (auth)' : ''}`
}
