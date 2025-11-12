const REQUIRED_BASE_URL = 'RELAY_BASE_URL'
const API_KEY_ENV = 'RELAY_API_KEY'
const API_ID_ENV = 'RELAY_API_ID'
const OTEL_URL_ENV = 'OTEL_EXPORT_URL'
const OTEL_INTERVAL_ENV = 'OTEL_PUSH_INTERVAL_MS'
const OTEL_TIMEOUT_ENV = 'OTEL_TIMEOUT_MS'
const OTEL_HEADERS_ENV = 'OTEL_EXPORT_HEADERS'
const OTEL_BASIC_AUTH_USER_ENV = 'OTEL_EXPORT_BASIC_AUTH_USERNAME'
const OTEL_BASIC_AUTH_PASS_ENV = 'OTEL_EXPORT_BASIC_AUTH_PASSWORD'
const METRIC_PERIOD_ENV = 'RELAY_METRICS_PERIOD'
const STATS_POLL_INTERVAL_ENV = 'RELAY_STATS_POLL_INTERVAL'

const DEFAULTS = {
  otlpUrl: 'http://localhost:4318/v1/metrics',
  pushIntervalMs: 60000,
  requestTimeoutMs: 5000,
  metricsPeriod: 'monthly',
  statsPollIntervalMs: 10000
}

function readNumber(envValue, fallback) {
  if (typeof envValue === 'string' && envValue.trim() !== '') {
    const parsed = Number(envValue)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return fallback
}

function resolveCredential(env) {
  const apiId = env[API_ID_ENV]
  if (apiId && apiId.trim().length > 0) {
    return { type: 'apiId', value: apiId.trim() }
  }

  const apiKey = env[API_KEY_ENV]
  if (apiKey && apiKey.trim().length > 0) {
    return { type: 'apiKey', value: apiKey.trim() }
  }

  throw new Error('Provide RELAY_API_KEY or RELAY_API_ID')
}

function parseHeaders(raw) {
  if (!raw || raw.trim().length === 0) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OTEL_EXPORT_HEADERS must be a JSON object')
    }

    return Object.entries(parsed).reduce((acc, [key, value]) => {
      if (typeof key !== 'string') {
        return acc
      }
      acc[key] = String(value)
      return acc
    }, {})
  } catch (error) {
    throw new Error(`Failed to parse OTEL_EXPORT_HEADERS: ${error.message}`)
  }
}

function buildOtlpHeaders(env) {
  const headers = parseHeaders(env[OTEL_HEADERS_ENV])

  const username = env[OTEL_BASIC_AUTH_USER_ENV]
  const password = env[OTEL_BASIC_AUTH_PASS_ENV]

  if (username && username.trim().length > 0) {
    if (!password || password.trim().length === 0) {
      throw new Error('OTEL_EXPORT_BASIC_AUTH_PASSWORD is required when OTEL_EXPORT_BASIC_AUTH_USERNAME is set')
    }

    const token = Buffer.from(`${username.trim()}:${password.trim()}`, 'utf8').toString('base64')
    headers.Authorization = `Basic ${token}`
  }

  return headers
}

function parseDurationToMs(rawValue, fallback) {
  if (typeof rawValue !== 'string') {
    return fallback
  }

  const trimmed = rawValue.trim()
  if (trimmed.length === 0) {
    return fallback
  }

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric
  }

  const match = trimmed.match(/^([0-9]+)\s*(ms|s|m|h)$/i)
  if (!match) {
    return fallback
  }

  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }

  const unit = match[2].toLowerCase()
  switch (unit) {
    case 'ms':
      return value
    case 's':
      return value * 1000
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    default:
      return fallback
  }
}

function loadConfiguration(env = process.env) {
  const baseUrl = env[REQUIRED_BASE_URL]
  if (!baseUrl || baseUrl.trim().length === 0) {
    throw new Error('RELAY_BASE_URL is required')
  }

  const credential = resolveCredential(env)

  const otlpUrl = env[OTEL_URL_ENV] && env[OTEL_URL_ENV].trim().length > 0 ? env[OTEL_URL_ENV].trim() : DEFAULTS.otlpUrl

  return {
    baseUrl: baseUrl.trim(),
    credential,
    otlpUrl,
    pushIntervalMs: readNumber(env[OTEL_INTERVAL_ENV], DEFAULTS.pushIntervalMs),
    requestTimeoutMs: readNumber(env[OTEL_TIMEOUT_ENV], DEFAULTS.requestTimeoutMs),
    otlpHeaders: buildOtlpHeaders(env),
    metricsPeriod:
      env[METRIC_PERIOD_ENV] && env[METRIC_PERIOD_ENV].trim().length > 0
        ? env[METRIC_PERIOD_ENV].trim()
        : DEFAULTS.metricsPeriod,
    statsPollIntervalMs: parseDurationToMs(env[STATS_POLL_INTERVAL_ENV], DEFAULTS.statsPollIntervalMs)
  }
}

module.exports = loadConfiguration
