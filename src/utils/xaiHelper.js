/**
 * xAI / Grok 协议工具
 * 对齐 sub2api internal/pkg/xai 的 OAuth 常量、模型映射、上游 URL 构造
 */

const crypto = require('crypto')
const { URL } = require('url')
const config = require('../../config/config')

const XAI_DEFAULTS = {
  authorizeUrl: 'https://auth.x.ai/oauth2/authorize',
  tokenUrl: 'https://auth.x.ai/oauth2/token',
  baseUrl: 'https://api.x.ai/v1',
  cliBaseUrl: 'https://cli-chat-proxy.grok.com/v1',
  clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
  scope: 'openid profile email offline_access grok-cli:access api:access',
  redirectUri: 'http://127.0.0.1:56121/callback',
  sessionTtlMs: 30 * 60 * 1000,
  // 与 sub2api billing.go CLIClientVersion 对齐，OAuth/billing 共用
  cliClientVersion: '0.2.114'
}

const xaiConfig = () => config.xai || {}

const OAUTH_ENDPOINT_ALLOWED_HOSTS = ['x.ai', '*.x.ai']
const BASE_URL_ALLOWED_HOSTS = ['api.x.ai', '*.api.x.ai', 'cli-chat-proxy.grok.com']

const DEFAULT_MODELS = [
  { id: 'grok-4.5', displayName: 'Grok 4.5' },
  { id: 'grok-4.3', displayName: 'Grok 4.3' },
  { id: 'grok-build-0.1', displayName: 'Grok Build 0.1' },
  { id: 'grok-composer-2.5-fast', displayName: 'Grok Composer 2.5 Fast' },
  { id: 'grok-4.20-0309-reasoning', displayName: 'Grok 4.20 Reasoning' },
  { id: 'grok-4.20-0309-non-reasoning', displayName: 'Grok 4.20 Non Reasoning' },
  { id: 'grok-4.20-multi-agent-0309', displayName: 'Grok 4.20 Multi Agent' },
  { id: 'grok-imagine', displayName: 'Grok Imagine' },
  { id: 'grok-imagine-image', displayName: 'Grok Imagine Image' },
  { id: 'grok-imagine-image-quality', displayName: 'Grok Imagine Image Quality' },
  { id: 'grok-imagine-edit', displayName: 'Grok Imagine Edit' },
  { id: 'grok-imagine-video', displayName: 'Grok Imagine Video' },
  { id: 'grok-imagine-video-1.5', displayName: 'Grok Imagine Video 1.5' }
]

const DEFAULT_MODEL_MAPPING = {
  grok: 'grok-4.5',
  'grok-latest': 'grok-4.5',
  'grok-4.5-latest': 'grok-4.5',
  'grok-build': 'grok-build-0.1',
  'grok-build-latest': 'grok-4.5',
  'grok-composer': 'grok-composer-2.5-fast',
  'composer-2.5': 'grok-composer-2.5-fast',
  'grok-4.20-reasoning': 'grok-4.20-0309-reasoning',
  'grok-4.20-non-reasoning': 'grok-4.20-0309-non-reasoning'
}

const CLI_HEADERS = {
  tokenAuthHeader: 'x-xai-token-auth',
  tokenAuthValue: 'xai-grok-cli',
  clientVersionHeader: 'x-grok-client-version'
}

const allowUnsafeUrlOverrides = () => xaiConfig().allowUnsafeUrlOverrides === true

const effectiveAuthorizeUrl = () => xaiConfig().oauthAuthorizeUrl || XAI_DEFAULTS.authorizeUrl
const effectiveTokenUrl = () => xaiConfig().oauthTokenUrl || XAI_DEFAULTS.tokenUrl
const effectiveClientId = () => xaiConfig().oauthClientId || XAI_DEFAULTS.clientId
const effectiveScope = () => xaiConfig().oauthScope || XAI_DEFAULTS.scope

const effectiveRedirectUri = (override = '') => {
  const trimmed = String(override || '').trim()
  if (trimmed) {
    return trimmed
  }
  return xaiConfig().oauthRedirectUri || XAI_DEFAULTS.redirectUri
}

const effectiveBaseUrl = (override = '') => {
  const trimmed = String(override || '').trim()
  if (trimmed) {
    return trimmed.replace(/\/+$/, '')
  }
  return (xaiConfig().baseUrl || XAI_DEFAULTS.baseUrl).replace(/\/+$/, '')
}

const effectiveCliBaseUrl = () =>
  (xaiConfig().cliBaseUrl || XAI_DEFAULTS.cliBaseUrl).replace(/\/+$/, '')

const hostMatches = (host, patterns) => {
  const normalized = String(host || '')
    .trim()
    .toLowerCase()
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2)
      if (normalized === suffix || normalized.endsWith(`.${suffix}`)) {
        return true
      }
      continue
    }
    if (normalized === pattern) {
      return true
    }
  }
  return false
}

const isOfficialBaseUrlHost = (host) => hostMatches(host, BASE_URL_ALLOWED_HOSTS)

const isOfficialBaseUrl = (raw) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    return true
  }
  try {
    const parsed = new URL(trimmed)
    if (!parsed.host) {
      return true
    }
    return isOfficialBaseUrlHost(parsed.hostname)
  } catch {
    return true
  }
}

const normalizeKnownBaseUrlPath = (raw) => {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('invalid base URL')
  }
  if (!parsed.protocol || !parsed.host) {
    throw new Error('invalid base URL')
  }
  if (parsed.username || parsed.password) {
    throw new Error('base URL must not include userinfo')
  }
  if (parsed.search || raw.includes('?')) {
    throw new Error('base URL must not include a query')
  }
  if (parsed.hash) {
    throw new Error('base URL must not include a fragment')
  }

  let path = parsed.pathname.replace(/\/+$/, '')
  if (!path || path === '/') {
    path = '/v1'
  } else if (path !== '/v1' && isOfficialBaseUrlHost(parsed.hostname)) {
    throw new Error('base URL path must be /v1')
  }

  parsed.pathname = path
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/+$/, '')
}

const validateHttpsUrl = (raw, { allowedHosts = null, allowPrivate = false } = {}) => {
  let parsed
  try {
    parsed = new URL(String(raw || '').trim())
  } catch {
    throw new Error('invalid URL')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('URL must use https')
  }
  if (!parsed.hostname) {
    throw new Error('invalid URL host')
  }
  if (!allowPrivate) {
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      throw new Error('private hosts are not allowed')
    }
  }
  if (allowedHosts && !hostMatches(parsed.hostname, allowedHosts)) {
    throw new Error('URL host is not in allowlist')
  }
  return parsed.toString()
}

const validateOAuthEndpointUrl = (raw) => {
  if (allowUnsafeUrlOverrides()) {
    return String(raw || '').trim()
  }
  return validateHttpsUrl(raw, { allowedHosts: OAUTH_ENDPOINT_ALLOWED_HOSTS, allowPrivate: false })
}

const validateBaseUrl = (raw) => {
  if (allowUnsafeUrlOverrides()) {
    return normalizeKnownBaseUrlPath(String(raw || '').trim())
  }
  const normalized = validateHttpsUrl(raw, { allowPrivate: false })
  return normalizeKnownBaseUrlPath(normalized)
}

const validateTrustedBaseUrl = (raw) => {
  if (allowUnsafeUrlOverrides()) {
    return normalizeKnownBaseUrlPath(String(raw || '').trim())
  }
  const normalized = validateHttpsUrl(raw, {
    allowedHosts: BASE_URL_ALLOWED_HOSTS,
    allowPrivate: false
  })
  return normalizeKnownBaseUrlPath(normalized)
}

const validatedBaseUrl = (override = '', validator = null) => {
  const raw = effectiveBaseUrl(override)
  if (typeof validator === 'function') {
    return normalizeKnownBaseUrlPath(validator(raw))
  }
  return validateBaseUrl(raw)
}

const joinBasePath = (baseUrl, suffix) => {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const path = String(suffix || '').startsWith('/') ? suffix : `/${suffix}`
  return `${base}${path}`
}

const buildResponsesUrl = (baseUrl, validator = null) =>
  joinBasePath(validatedBaseUrl(baseUrl, validator), '/responses')

const buildChatCompletionsUrl = (baseUrl, validator = null) =>
  joinBasePath(validatedBaseUrl(baseUrl, validator), '/chat/completions')

const buildImagesGenerationsUrl = (baseUrl, validator = null) =>
  joinBasePath(validatedBaseUrl(baseUrl, validator), '/images/generations')

const buildImagesEditsUrl = (baseUrl, validator = null) =>
  joinBasePath(validatedBaseUrl(baseUrl, validator), '/images/edits')

const buildVideosGenerationsUrl = (baseUrl, validator = null) =>
  joinBasePath(validatedBaseUrl(baseUrl, validator), '/videos/generations')

const buildVideosEditsUrl = (baseUrl, validator = null) =>
  joinBasePath(validatedBaseUrl(baseUrl, validator), '/videos/edits')

const buildVideosExtensionsUrl = (baseUrl, validator = null) =>
  joinBasePath(validatedBaseUrl(baseUrl, validator), '/videos/extensions')

const buildVideoUrl = (baseUrl, requestId, validator = null) => {
  const id = String(requestId || '').trim()
  if (!id) {
    throw new Error('request id is required')
  }
  if (id === '.' || id === '..' || /[\x00\r\n]/.test(id)) {
    throw new Error('invalid request id')
  }
  return joinBasePath(validatedBaseUrl(baseUrl, validator), `/videos/${encodeURIComponent(id)}`)
}

const buildVideoContentUrl = (baseUrl, requestId, validator = null) =>
  `${buildVideoUrl(baseUrl, requestId, validator)}/content`

const buildBillingUrl = (baseUrl, weekly = false, validator = null) => {
  const path = weekly ? '/billing?format=credits' : '/billing'
  return joinBasePath(validatedBaseUrl(baseUrl, validator), path)
}

const generateState = () => crypto.randomBytes(32).toString('hex')
const generateNonce = () => crypto.randomBytes(16).toString('hex')
const generateSessionId = () => crypto.randomBytes(16).toString('hex')
const generateCodeVerifier = () => crypto.randomBytes(32).toString('base64url')
const generateCodeChallenge = (verifier) =>
  crypto.createHash('sha256').update(verifier).digest('base64url')

const buildAuthorizationUrl = ({ state, codeChallenge, redirectUri, nonce } = {}) => {
  const authorizeUrl = validateOAuthEndpointUrl(effectiveAuthorizeUrl())
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: effectiveClientId(),
    redirect_uri: effectiveRedirectUri(redirectUri),
    scope: effectiveScope(),
    state,
    nonce: nonce || generateNonce(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    plan: 'generic',
    referrer: 'claude-relay-service'
  })
  return `${authorizeUrl}?${params.toString()}`
}

// 接受完整 callback URL / query string / 裸 code
const parseAuthorizationInput = (raw) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    return { code: '', state: '', requiresState: false }
  }

  try {
    const parsed = new URL(trimmed)
    const code = String(parsed.searchParams.get('code') || '').trim()
    if (code) {
      return {
        code,
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
    const code = String(values.get('code') || '').trim()
    if (code) {
      return {
        code,
        state: String(values.get('state') || '').trim(),
        requiresState: true
      }
    }
  }

  return { code: trimmed, state: '', requiresState: false }
}

const defaultModelIds = () => DEFAULT_MODELS.map((model) => model.id)

const defaultModelMapping = () => {
  const mapping = {}
  for (const model of DEFAULT_MODELS) {
    mapping[model.id] = model.id
  }
  return { ...mapping, ...DEFAULT_MODEL_MAPPING }
}

const mapModel = (model) => {
  const raw = String(model || '').trim()
  if (!raw) {
    return raw
  }
  const mapping = defaultModelMapping()
  return mapping[raw] || raw
}

const isGrokTextModel = (model) => {
  const mapped = mapModel(model).toLowerCase()
  return mapped.startsWith('grok') || mapped.startsWith('composer')
}

const isGrokMediaModel = (model) => {
  const mapped = mapModel(model).toLowerCase()
  return mapped.includes('imagine')
}

const buildCliIdentityHeaders = () => {
  const version = xaiConfig().cliClientVersion || XAI_DEFAULTS.cliClientVersion
  return {
    [CLI_HEADERS.tokenAuthHeader]: CLI_HEADERS.tokenAuthValue,
    [CLI_HEADERS.clientVersionHeader]: version,
    'User-Agent': `grok-pager/${version} grok-shell/${version} (linux; x86_64)`
  }
}

module.exports = {
  XAI_DEFAULTS,
  OAUTH_ENDPOINT_ALLOWED_HOSTS,
  BASE_URL_ALLOWED_HOSTS,
  DEFAULT_MODELS,
  CLI_HEADERS,
  allowUnsafeUrlOverrides,
  effectiveAuthorizeUrl,
  effectiveTokenUrl,
  effectiveClientId,
  effectiveScope,
  effectiveRedirectUri,
  effectiveBaseUrl,
  effectiveCliBaseUrl,
  isOfficialBaseUrlHost,
  isOfficialBaseUrl,
  validateOAuthEndpointUrl,
  validateBaseUrl,
  validateTrustedBaseUrl,
  normalizeKnownBaseUrlPath,
  buildResponsesUrl,
  buildChatCompletionsUrl,
  buildImagesGenerationsUrl,
  buildImagesEditsUrl,
  buildVideosGenerationsUrl,
  buildVideosEditsUrl,
  buildVideosExtensionsUrl,
  buildVideoUrl,
  buildVideoContentUrl,
  buildBillingUrl,
  generateState,
  generateNonce,
  generateSessionId,
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  parseAuthorizationInput,
  defaultModelIds,
  defaultModelMapping,
  mapModel,
  isGrokTextModel,
  isGrokMediaModel,
  buildCliIdentityHeaders
}
