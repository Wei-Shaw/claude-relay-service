const path = require('path')

describe('loadConfiguration', () => {
  const CONFIG_PATH = path.join(__dirname, '..', 'configuration.js')
  let loadConfiguration

  beforeEach(() => {
    jest.resetModules()
    loadConfiguration = require(CONFIG_PATH)
  })

  afterEach(() => {
    delete process.env.RELAY_BASE_URL
    delete process.env.RELAY_API_KEY
    delete process.env.RELAY_API_ID
    delete process.env.OTEL_EXPORT_URL
    delete process.env.OTEL_EXPORT_HEADERS
    delete process.env.OTEL_EXPORT_BASIC_AUTH_USERNAME
    delete process.env.OTEL_EXPORT_BASIC_AUTH_PASSWORD
    delete process.env.OTEL_PUSH_INTERVAL_MS
    delete process.env.OTEL_TIMEOUT_MS
    delete process.env.RELAY_METRICS_PERIOD
    delete process.env.RELAY_STATS_POLL_INTERVAL
  })

  it('returns an object with defaults when required variables are set', () => {
    process.env.RELAY_BASE_URL = 'https://relay.test'
    process.env.RELAY_API_KEY = 'cr_abc'

    const config = loadConfiguration()

    expect(config).toEqual({
      baseUrl: 'https://relay.test',
      credential: { type: 'apiKey', value: 'cr_abc' },
      otlpUrl: 'http://localhost:4318/v1/metrics',
      pushIntervalMs: 60000,
      requestTimeoutMs: 5000,
      otlpHeaders: {},
      metricsPeriod: 'monthly',
      statsPollIntervalMs: 10000
    })
  })

  it('prefers API ID over API key when both are present', () => {
    process.env.RELAY_BASE_URL = 'https://relay.test'
    process.env.RELAY_API_KEY = 'cr_abc'
    process.env.RELAY_API_ID = 'uuid-1234'

    const config = loadConfiguration()

    expect(config.credential).toEqual({ type: 'apiId', value: 'uuid-1234' })
  })

  it('parses numeric overrides', () => {
    process.env.RELAY_BASE_URL = 'https://relay.test'
    process.env.RELAY_API_ID = 'uuid-1234'
    process.env.OTEL_EXPORT_URL = 'https://otel.collector/v1/metrics'
    process.env.OTEL_PUSH_INTERVAL_MS = '120000'
    process.env.OTEL_TIMEOUT_MS = '9000'
    process.env.RELAY_METRICS_PERIOD = 'daily'
    process.env.OTEL_EXPORT_HEADERS = '{"X-Test-Header":"foo"}'

    const config = loadConfiguration()

    expect(config).toEqual({
      baseUrl: 'https://relay.test',
      credential: { type: 'apiId', value: 'uuid-1234' },
      otlpUrl: 'https://otel.collector/v1/metrics',
      pushIntervalMs: 120000,
      requestTimeoutMs: 9000,
      otlpHeaders: { 'X-Test-Header': 'foo' },
      metricsPeriod: 'daily',
      statsPollIntervalMs: 10000
    })
  })

  it('adds basic auth header when credentials provided', () => {
    process.env.RELAY_BASE_URL = 'https://relay.test'
    process.env.RELAY_API_KEY = 'cr_abc'
    process.env.OTEL_EXPORT_BASIC_AUTH_USERNAME = 'user'
    process.env.OTEL_EXPORT_BASIC_AUTH_PASSWORD = 'pass'

    const config = loadConfiguration()

    expect(config.otlpHeaders.Authorization).toBe('Basic dXNlcjpwYXNz')
  })

  it('parses human friendly stats polling intervals', () => {
    process.env.RELAY_BASE_URL = 'https://relay.test'
    process.env.RELAY_API_KEY = 'cr_abc'
    process.env.RELAY_STATS_POLL_INTERVAL = '15s'

    const config = loadConfiguration()

    expect(config.statsPollIntervalMs).toBe(15000)
  })

  it('throws when only basic auth username provided', () => {
    process.env.RELAY_BASE_URL = 'https://relay.test'
    process.env.RELAY_API_KEY = 'cr_abc'
    process.env.OTEL_EXPORT_BASIC_AUTH_USERNAME = 'user'

    expect(() => loadConfiguration()).toThrow(/OTEL_EXPORT_BASIC_AUTH_PASSWORD/)
  })

  it('throws when base url missing', () => {
    process.env.RELAY_API_KEY = 'cr_abc'

    expect(() => loadConfiguration()).toThrow(/RELAY_BASE_URL/)
  })

  it('throws when no credentials provided', () => {
    process.env.RELAY_BASE_URL = 'https://relay.test'

    expect(() => loadConfiguration()).toThrow(/RELAY_API_KEY or RELAY_API_ID/)
  })
})
