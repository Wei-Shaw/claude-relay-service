/**
 * Grok / xAI helper
 *
 * Ports Sub2API's three Grok upstream modes into Claude Relay Service:
 *   (1) OAuth subscription  -> cli-chat-proxy.grok.com (or custom OAuth upstream)
 *   (2) Official xAI API    -> api.x.ai / regional *.api.x.ai
 *   (3) Custom relay        -> operator-set OpenAI-shaped base URL + API key
 *
 * OAuth authorization and token refresh always stay on official auth.x.ai.
 *
 * All three upstreams speak OpenAI Chat Completions (cli-chat-proxy exposes
 * both /v1/chat/completions and /v1/responses), so client requests are
 * forwarded on their original path. Mirroring Sub2API's raw Chat Completions
 * path, only xAI-specific field hygiene is applied before forwarding.
 */

const crypto = require('crypto')
const axios = require('axios')
const logger = require('./logger')
const ProxyHelper = require('./proxyHelper')

const OAUTH_ISSUER = 'https://auth.x.ai'
const DEFAULT_AUTHORIZE_URL = `${OAUTH_ISSUER}/oauth2/authorize`
const DEFAULT_TOKEN_URL = `${OAUTH_ISSUER}/oauth2/token`
const DEFAULT_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const DEFAULT_SCOPE = 'openid profile email offline_access grok-cli:access api:access'
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:56121/callback'

const DEFAULT_API_BASE_URL = 'https://api.x.ai/v1'
const DEFAULT_CLI_BASE_URL = 'https://cli-chat-proxy.grok.com/v1'
const REGIONAL_BASE_URLS = {
  'us-east-1': 'https://us-east-1.api.x.ai/v1',
  'us-west-2': 'https://us-west-2.api.x.ai/v1',
  'eu-west-1': 'https://eu-west-1.api.x.ai/v1'
}

const CLI_PROXY_HOST = 'cli-chat-proxy.grok.com'
const CLI_TOKEN_AUTH = 'xai-grok-cli'
const CLI_CLIENT_IDENTIFIER = 'grok-shell'
const CLI_CLIENT_VERSION = '0.2.120'
const CLI_STABLE_VERSION = '0.2.93'
const CLI_VERSION_ENV = 'XAI_GROK_CLI_VERSION'

const OAUTH_ALLOWED_HOSTS = ['x.ai', '*.x.ai']
const OFFICIAL_BASE_HOSTS = ['api.x.ai', '*.api.x.ai', CLI_PROXY_HOST]

const AUTH_TYPES = Object.freeze({
  OAUTH: 'oauth',
  API_KEY: 'api_key'
})

const BASE_URL_MODES = Object.freeze({
  CLI: 'cli',
  API: 'api',
  'US-EAST-1': 'us-east-1',
  'US-WEST-2': 'us-west-2',
  'EU-WEST-1': 'eu-west-1',
  CUSTOM: 'custom'
})

function envOrDefault(key, fallback) {
  const value = typeof process.env[key] === 'string' ? process.env[key].trim() : ''
  return value || fallback
}

function allowUnsafeUrlOverrides() {
  const raw = String(process.env.XAI_ALLOW_UNSAFE_URL_OVERRIDES || '')
    .trim()
    .toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on'].includes(raw)
}

function hostnameMatches(host, pattern) {
  const normalizedHost = String(host || '')
    .trim()
    .toLowerCase()
  const normalizedPattern = String(pattern || '')
    .trim()
    .toLowerCase()
  if (!normalizedHost || !normalizedPattern) {
    return false
  }
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2)
    return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`)
  }
  return normalizedHost === normalizedPattern
}

function isOfficialBaseURLHost(host) {
  return OFFICIAL_BASE_HOSTS.some((pattern) => hostnameMatches(host, pattern))
}

function parseAbsoluteUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = new URL(trimmed)
    if (!parsed.protocol || !parsed.hostname) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function stripUrlExtras(parsed) {
  parsed.username = ''
  parsed.password = ''
  parsed.search = ''
  parsed.hash = ''
  if (parsed.pathname === '/') {
    parsed.pathname = ''
  }
  return parsed
}

function stripIPv6Brackets(host) {
  if (host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1)
  }
  return host
}

function ipv4Octets(host) {
  const parts = String(host || '').split('.')
  if (parts.length !== 4) {
    return null
  }
  const octets = parts.map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }
  return octets
}

function expandIPv6(host) {
  const raw = stripIPv6Brackets(host).toLowerCase()
  if (!raw.includes(':')) {
    return null
  }
  if (raw.startsWith('::ffff:')) {
    const mapped = raw.slice('::ffff:'.length)
    if (ipv4Octets(mapped)) {
      return ['mapped-v4', mapped]
    }
  }
  const sides = raw.split('::')
  if (sides.length > 2) {
    return null
  }
  const head = sides[0] ? sides[0].split(':') : []
  const tail = sides.length === 2 && sides[1] ? sides[1].split(':') : []
  if (head.concat(tail).some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null
  }
  const missing = 8 - (head.length + tail.length)
  if (missing < 0 || (sides.length === 1 && missing !== 0)) {
    return null
  }
  const groups = [...head, ...Array(Math.max(0, missing)).fill('0'), ...tail].map((part) =>
    parseInt(part || '0', 16)
  )
  if (groups.length !== 8 || groups.some((value) => Number.isNaN(value))) {
    return null
  }
  return groups
}

function isBlockedHost(host) {
  const normalized = String(host || '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    return true
  }
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true
  }

  const v4 = ipv4Octets(normalized)
  if (v4) {
    const [a, b] = v4
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)) {
      return true
    }
    if (a === 192 && b === 168) {
      return true
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true
    }
    return false
  }

  const v6 = expandIPv6(normalized)
  if (Array.isArray(v6) && v6[0] === 'mapped-v4') {
    return isBlockedHost(v6[1])
  }
  if (Array.isArray(v6)) {
    const first = v6[0]
    if (v6.every((part) => part === 0)) {
      return true
    }
    if (v6.slice(0, 7).every((part) => part === 0) && v6[7] === 1) {
      return true
    }
    if ((first & 0xfe00) === 0xfc00) {
      return true
    }
    if (first === 0xfe80) {
      return true
    }
    return false
  }

  return false
}

function validateHttpsUrl(raw, { allowedHosts = null, allowPrivate = false } = {}) {
  const parsed = parseAbsoluteUrl(raw)
  if (!parsed) {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('URL must use https')
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL must not include userinfo')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('URL must not include a query or fragment')
  }

  const host = parsed.hostname.toLowerCase()
  if (!allowPrivate && isBlockedHost(host)) {
    throw new Error('Private or localhost hosts are not allowed')
  }

  if (Array.isArray(allowedHosts) && allowedHosts.length > 0) {
    const allowed = allowedHosts.some((pattern) => hostnameMatches(host, pattern))
    if (!allowed) {
      throw new Error(`Host ${host} is not in the allowlist`)
    }
  }

  return parsed
}

function validateOAuthEndpointURL(raw) {
  if (allowUnsafeUrlOverrides()) {
    const parsed = parseAbsoluteUrl(raw)
    if (!parsed) {
      throw new Error('Invalid OAuth endpoint URL')
    }
    return parsed.toString()
  }
  return validateHttpsUrl(raw, {
    allowedHosts: OAUTH_ALLOWED_HOSTS,
    allowPrivate: false
  }).toString()
}

function normalizeKnownBaseURLPath(raw) {
  const parsed = parseAbsoluteUrl(raw)
  if (!parsed) {
    throw new Error('Invalid base URL')
  }
  if (parsed.username || parsed.password) {
    throw new Error('base URL must not include userinfo')
  }
  if (parsed.search) {
    throw new Error('base URL must not include a query')
  }
  if (parsed.hash) {
    throw new Error('base URL must not include a fragment')
  }

  const path = parsed.pathname.replace(/\/+$/, '')
  if (!path) {
    parsed.pathname = '/v1'
  } else if (path !== '/v1' && isOfficialBaseURLHost(parsed.hostname)) {
    throw new Error('base URL path must be /v1')
  } else {
    parsed.pathname = path
  }

  stripUrlExtras(parsed)
  return parsed.toString().replace(/\/+$/, '')
}

function validateTrustedBaseURL(raw) {
  if (allowUnsafeUrlOverrides()) {
    return normalizeKnownBaseURLPath(raw)
  }
  const parsed = validateHttpsUrl(raw, {
    allowedHosts: OFFICIAL_BASE_HOSTS,
    allowPrivate: false
  })
  return normalizeKnownBaseURLPath(parsed.toString())
}

function validateBaseURL(raw) {
  if (allowUnsafeUrlOverrides()) {
    return normalizeKnownBaseURLPath(raw)
  }
  const parsed = validateHttpsUrl(raw, { allowPrivate: false })
  return normalizeKnownBaseURLPath(parsed.toString())
}

function isOfficialBaseURL(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    return true
  }
  const parsed = parseAbsoluteUrl(trimmed)
  if (!parsed || !parsed.hostname) {
    return true
  }
  return isOfficialBaseURLHost(parsed.hostname)
}

function resolveBaseUrlMode(mode, customUrl) {
  const normalized = String(mode || '')
    .trim()
    .toLowerCase()
  if (normalized === BASE_URL_MODES.CLI) {
    return DEFAULT_CLI_BASE_URL
  }
  if (normalized === BASE_URL_MODES.API) {
    return DEFAULT_API_BASE_URL
  }
  if (REGIONAL_BASE_URLS[normalized]) {
    return REGIONAL_BASE_URLS[normalized]
  }
  if (normalized === BASE_URL_MODES.CUSTOM || customUrl) {
    return String(customUrl || '').trim()
  }
  return ''
}

function defaultBaseUrlForAuthType(authType) {
  return authType === AUTH_TYPES.OAUTH ? DEFAULT_CLI_BASE_URL : DEFAULT_API_BASE_URL
}

function resolveAccountBaseUrl({ authType, baseUrl, customUpstream } = {}) {
  const trimmed = String(baseUrl || '').trim()
  const type = authType === AUTH_TYPES.API_KEY ? AUTH_TYPES.API_KEY : AUTH_TYPES.OAUTH

  if (type === AUTH_TYPES.OAUTH) {
    if (customUpstream && trimmed) {
      return validateBaseURL(trimmed)
    }
    // OAuth inference always uses the CLI proxy unless a custom upstream is
    // explicitly enabled. Legacy accounts that stored api.x.ai or a regional
    // *.api.x.ai host are redirected at runtime. The CLI proxy itself is kept.
    const parsed = parseAbsoluteUrl(trimmed)
    if (parsed && hostnameMatches(parsed.hostname, CLI_PROXY_HOST)) {
      return validateTrustedBaseURL(trimmed)
    }
    // Overlay off: never forward OAuth bearer tokens to a third-party host.
    return DEFAULT_CLI_BASE_URL
  }

  if (!trimmed) {
    return DEFAULT_API_BASE_URL
  }
  if (isOfficialBaseURL(trimmed)) {
    return validateTrustedBaseURL(trimmed)
  }
  return validateBaseURL(trimmed)
}

function isChatCompletionsPath(requestPath) {
  const path = String(requestPath || '')
  return path === '/chat/completions' || path === '/v1/chat/completions'
}

// Models that accept reasoning_effort on Chat Completions (Sub2API
// grokSupportsReasoningEffort). Others reject or ignore the field, so it is
// dropped rather than forwarded.
const REASONING_EFFORT_MODELS = new Set([
  'grok-4.5',
  'grok-4.5-latest',
  'grok-4.6',
  'grok-4.6-latest',
  'grok-4.3',
  'grok-4.3-latest',
  'grok-3-mini',
  'grok-3-mini-fast',
  'grok-4.20-0309-reasoning',
  'grok-4.20-reasoning',
  'grok-4.20-multi-agent-0309'
])
const XHIGH_REASONING_EFFORT_MODELS = new Set(['grok-4.6', 'grok-4.6-latest'])

function stripGrokProviderPrefix(model) {
  const trimmed = String(model || '').trim()
  const lower = trimmed.toLowerCase()
  for (const prefix of ['xai/', 'x-ai/', 'grok/']) {
    if (lower.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim()
    }
  }
  return trimmed
}

function normalizeGrokModelName(model) {
  return stripGrokProviderPrefix(model).toLowerCase()
}

function supportsReasoningEffort(model) {
  return REASONING_EFFORT_MODELS.has(normalizeGrokModelName(model))
}

function supportsXHighReasoningEffort(model) {
  return XHIGH_REASONING_EFFORT_MODELS.has(normalizeGrokModelName(model))
}

// Maps client reasoning_effort spellings onto the values xAI accepts.
// Returns '' when the value is unknown (the field is then dropped).
function normalizeReasoningEffortValue(raw, model) {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]/g, '')
  switch (value) {
    case 'none':
    case 'low':
    case 'medium':
    case 'high':
      return value
    case 'minimal':
      return 'low'
    case 'xhigh':
    case 'extrahigh':
      return supportsXHighReasoningEffort(model) ? 'xhigh' : 'high'
    case 'max':
    case 'ultra':
      return 'high'
    default:
      return ''
  }
}

/**
 * Prepare a Chat Completions body for xAI without changing its protocol.
 * Port of Sub2API's raw Chat Completions path (forwardAsRawChatCompletions):
 *   - prompt_cache_key is Responses-only and is removed
 *   - reasoning_effort (or camelCase reasoningEffort) is normalized, and
 *     dropped for models that do not accept it
 *   - streaming requests force stream_options.include_usage so the final
 *     chunk carries usage for accounting (and downstream clients)
 * messages, tools, tool_choice and tool_calls are forwarded untouched: the
 * upstream deserializes the Chat Completions shapes natively.
 */
function normalizeChatCompletionsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body
  }
  const normalized = { ...body }

  delete normalized.prompt_cache_key

  const rawEffort =
    typeof normalized.reasoning_effort === 'string' && normalized.reasoning_effort.trim()
      ? normalized.reasoning_effort
      : normalized.reasoningEffort
  delete normalized.reasoning_effort
  delete normalized.reasoningEffort
  const effort = normalizeReasoningEffortValue(rawEffort, normalized.model)
  if (effort && supportsReasoningEffort(normalized.model)) {
    normalized.reasoning_effort = effort
  }

  if (normalized.stream === true) {
    const options =
      normalized.stream_options &&
      typeof normalized.stream_options === 'object' &&
      !Array.isArray(normalized.stream_options)
        ? normalized.stream_options
        : {}
    normalized.stream_options = { ...options, include_usage: true }
  }

  return normalized
}

function joinBaseAndPath(baseUrl, requestPath) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '')
  let path = String(requestPath || '')
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  if (normalizedBase.endsWith('/v1') && path.startsWith('/v1/')) {
    path = path.slice(3)
  }
  return `${normalizedBase}${path}`
}

function isSupportedCLIVersion(version) {
  const raw = String(version || '').trim()
  if (!/^\d+\.\d+\.\d+$/.test(raw)) {
    return false
  }
  const parts = raw.split('.').map((part) => Number(part))
  const min = CLI_STABLE_VERSION.split('.').map((part) => Number(part))
  for (let i = 0; i < 3; i++) {
    if (parts[i] > min[i]) {
      return true
    }
    if (parts[i] < min[i]) {
      return false
    }
  }
  return true
}

function resolveCLIVersion() {
  const override = envOrDefault(CLI_VERSION_ENV, '')
  if (isSupportedCLIVersion(override)) {
    return override
  }
  return CLI_CLIENT_VERSION
}

function cliUserAgent(version = resolveCLIVersion()) {
  return `xai-grok-workspace/${version}`
}

function shouldApplyCLIProxyHeaders(targetUrl) {
  const parsed = parseAbsoluteUrl(targetUrl)
  return Boolean(parsed && hostnameMatches(parsed.hostname, CLI_PROXY_HOST))
}

function applyCLIProxyHeaders(headers = {}, targetUrl) {
  if (!shouldApplyCLIProxyHeaders(targetUrl)) {
    return headers
  }
  const version = resolveCLIVersion()
  return {
    ...headers,
    'X-XAI-Token-Auth': CLI_TOKEN_AUTH,
    'x-grok-client-version': version,
    'x-grok-client-identifier': CLI_CLIENT_IDENTIFIER,
    'User-Agent': cliUserAgent(version)
  }
}

function generateState() {
  return crypto.randomBytes(32).toString('hex')
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex')
}

function effectiveAuthorizeURL() {
  return envOrDefault('XAI_OAUTH_AUTHORIZE_URL', DEFAULT_AUTHORIZE_URL)
}

function effectiveTokenURL() {
  return envOrDefault('XAI_OAUTH_TOKEN_URL', DEFAULT_TOKEN_URL)
}

function effectiveClientID() {
  return envOrDefault('XAI_OAUTH_CLIENT_ID', DEFAULT_CLIENT_ID)
}

function effectiveScope() {
  return envOrDefault('XAI_OAUTH_SCOPE', DEFAULT_SCOPE)
}

function effectiveRedirectURI(override) {
  const trimmed = String(override || '').trim()
  if (trimmed) {
    return trimmed
  }
  return envOrDefault('XAI_OAUTH_REDIRECT_URI', DEFAULT_REDIRECT_URI)
}

function buildAuthorizationURL({ state, codeChallenge, redirectURI, nonce, clientID, scope } = {}) {
  const authorizeURL = validateOAuthEndpointURL(effectiveAuthorizeURL())
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientID || effectiveClientID(),
    redirect_uri: effectiveRedirectURI(redirectURI),
    scope: scope || effectiveScope(),
    state,
    nonce: nonce || generateNonce(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    plan: 'generic',
    referrer: 'claude-relay-service'
  })
  return `${authorizeURL}?${params.toString()}`
}

function parseAuthorizationInput(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    return { code: '', state: '', requiresState: false }
  }

  try {
    const parsed = new URL(trimmed)
    const code = parsed.searchParams.get('code')
    if (code) {
      return {
        code: code.trim(),
        state: String(parsed.searchParams.get('state') || '').trim(),
        requiresState: true
      }
    }
  } catch {
    // not a full URL
  }

  const queryCandidate = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed
  if (queryCandidate.includes('=')) {
    const values = new URLSearchParams(queryCandidate)
    const code = values.get('code')
    if (code) {
      return {
        code: code.trim(),
        state: String(values.get('state') || '').trim(),
        requiresState: true
      }
    }
  }

  return { code: trimmed, state: '', requiresState: false }
}

function applyProxyToAxiosConfig(axiosConfig, proxy) {
  const proxyAgent = ProxyHelper.createProxyAgent(proxy)
  if (proxyAgent) {
    axiosConfig.httpAgent = proxyAgent
    axiosConfig.httpsAgent = proxyAgent
    axiosConfig.proxy = false
  }
  return axiosConfig
}

function describeTokenError(error, action) {
  if (error.response) {
    const errorData = error.response.data || {}
    let message = `xAI 服务器返回错误 (${error.response.status})`
    if (error.response.status === 400) {
      if (errorData.error === 'invalid_grant') {
        message = '授权码或 Refresh Token 无效或已过期，请重新授权'
      } else {
        message = `请求错误：${errorData.error_description || errorData.error || '未知错误'}`
      }
    } else if (error.response.status === 401) {
      message = '认证失败：凭证无效'
    } else if (error.response.status === 403) {
      message = '访问被拒绝：可能是 IP 被封或账户被禁用'
    } else if (error.response.status === 429) {
      message = '请求过于频繁，请稍后重试'
    } else if (error.response.status >= 500) {
      message = 'xAI 服务器内部错误，请稍后重试'
    } else if (errorData.error_description) {
      message = errorData.error_description
    }
    const wrapped = new Error(message)
    wrapped.status = error.response.status
    wrapped.details = errorData
    return wrapped
  }

  if (error.request) {
    const wrapped = new Error(
      `无法连接到 xAI ${action} 端点${error.message ? ` - ${error.message}` : ''}`
    )
    wrapped.code = error.code
    return wrapped
  }

  return error
}

async function exchangeAuthorizationCode({
  code,
  codeVerifier,
  redirectURI,
  proxy = null,
  clientID
}) {
  const tokenURL = validateOAuthEndpointURL(effectiveTokenURL())
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientID || effectiveClientID(),
    code,
    redirect_uri: effectiveRedirectURI(redirectURI),
    code_verifier: codeVerifier
  })

  const axiosConfig = applyProxyToAxiosConfig(
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'claude-relay-service-grok-oauth/1.0'
      },
      timeout: 60000
    },
    proxy
  )

  try {
    const response = await axios.post(tokenURL, form.toString(), axiosConfig)
    return normalizeTokenResponse(response.data)
  } catch (error) {
    logger.error('Grok OAuth token exchange failed:', error.message)
    throw describeTokenError(error, 'token exchange')
  }
}

async function refreshAccessToken(refreshToken, proxy = null, clientID) {
  const tokenURL = validateOAuthEndpointURL(effectiveTokenURL())
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientID || effectiveClientID(),
    refresh_token: refreshToken
  })

  const axiosConfig = applyProxyToAxiosConfig(
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'claude-relay-service-grok-oauth/1.0'
      },
      timeout: 60000
    },
    proxy
  )

  try {
    const response = await axios.post(tokenURL, form.toString(), axiosConfig)
    return normalizeTokenResponse(response.data, refreshToken)
  } catch (error) {
    logger.error('Grok OAuth token refresh failed:', error.message)
    throw describeTokenError(error, 'token refresh')
  }
}

function normalizeTokenResponse(data = {}, fallbackRefreshToken = '') {
  const expiresIn = Number(data.expires_in) || 3600
  return {
    accessToken: data.access_token || '',
    refreshToken: data.refresh_token || fallbackRefreshToken || '',
    tokenType: data.token_type || 'Bearer',
    expiresIn,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scope: data.scope || '',
    idToken: data.id_token || ''
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null
  }
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function extractAccountInfoFromTokens(tokens = {}) {
  const payload = decodeJwtPayload(tokens.idToken) || decodeJwtPayload(tokens.accessToken) || {}
  return {
    email: payload.email || payload.preferred_username || '',
    name: payload.name || payload.given_name || '',
    emailVerified: payload.email_verified === true
  }
}

function isTokenExpired(account, skewMs = 60 * 1000) {
  if (!account?.expiresAt) {
    return false
  }
  const expiresAt = Date.parse(account.expiresAt)
  if (Number.isNaN(expiresAt)) {
    return false
  }
  return expiresAt <= Date.now() + skewMs
}

module.exports = {
  AUTH_TYPES,
  BASE_URL_MODES,
  DEFAULT_AUTHORIZE_URL,
  DEFAULT_TOKEN_URL,
  DEFAULT_CLIENT_ID,
  DEFAULT_SCOPE,
  DEFAULT_REDIRECT_URI,
  DEFAULT_API_BASE_URL,
  DEFAULT_CLI_BASE_URL,
  REGIONAL_BASE_URLS,
  CLI_PROXY_HOST,
  CLI_CLIENT_VERSION,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  generateNonce,
  effectiveAuthorizeURL,
  effectiveTokenURL,
  effectiveClientID,
  effectiveScope,
  effectiveRedirectURI,
  buildAuthorizationURL,
  parseAuthorizationInput,
  exchangeAuthorizationCode,
  refreshAccessToken,
  extractAccountInfoFromTokens,
  isTokenExpired,
  resolveAccountBaseUrl,
  resolveBaseUrlMode,
  defaultBaseUrlForAuthType,
  validateBaseURL,
  validateTrustedBaseURL,
  validateOAuthEndpointURL,
  isOfficialBaseURL,
  isOfficialBaseURLHost,
  joinBaseAndPath,
  isChatCompletionsPath,
  normalizeChatCompletionsBody,
  normalizeReasoningEffortValue,
  supportsReasoningEffort,
  supportsXHighReasoningEffort,
  stripGrokProviderPrefix,
  applyCLIProxyHeaders,
  shouldApplyCLIProxyHeaders,
  resolveCLIVersion,
  cliUserAgent,
  isSupportedCLIVersion,
  allowUnsafeUrlOverrides
}
