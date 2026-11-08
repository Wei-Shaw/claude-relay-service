jest.mock(
  '../config/config',
  () => ({
    logging: { dirname: '/tmp/claude-relay-service-tests' },
    system: { timezoneOffset: 8 },
    vendorErrorSanitization: {
      enabled: true,
      providers: { claudeConsole: true }
    }
  }),
  { virtual: true }
)

const {
  buildClaudeConsoleClientError,
  sanitizeClaudeConsoleStreamEvent
} = require('../src/utils/claudeConsoleErrorAdapter')

describe('claude console error adapter', () => {
  const originalFlag = process.env.CLAUDE_CONSOLE_ERROR_SANITIZATION_ENABLED

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.CLAUDE_CONSOLE_ERROR_SANITIZATION_ENABLED
    } else {
      process.env.CLAUDE_CONSOLE_ERROR_SANITIZATION_ENABLED = originalFlag
    }
  })

  it('maps upstream 401 errors to a safe temporary-unavailable response', () => {
    const result = buildClaudeConsoleClientError(401, {
      error: { type: 'authentication_error', message: 'secret upstream URL' }
    })

    expect(result).toEqual({
      status: 503,
      body: {
        type: 'error',
        error: { type: 'api_error', message: 'Account temporarily unavailable' }
      }
    })
  })

  it('preserves retry_after while sanitizing a 429 response', () => {
    const result = buildClaudeConsoleClientError(429, {
      error: { message: 'slow down' },
      retry_after: 7
    })

    expect(result.body.error).toEqual({
      type: 'rate_limit_error',
      message: 'Rate limit exceeded',
      retry_after: 7
    })
  })

  it('returns a JSON-safe response for a non-JSON upstream body', () => {
    const result = buildClaudeConsoleClientError(502, 'proxy failed at https://upstream.example')

    expect(result).toEqual({
      status: 502,
      body: {
        type: 'error',
        error: { type: 'api_error', message: 'Upstream service error' }
      }
    })
  })

  it('maps Anthropic overload responses to overloaded_error', () => {
    const result = buildClaudeConsoleClientError(529, { message: 'capacity reached' })

    expect(result.body.error).toEqual({
      type: 'overloaded_error',
      message: 'Server overloaded'
    })
  })

  it('sanitizes error SSE events without retaining upstream fields', () => {
    const result = sanitizeClaudeConsoleStreamEvent({
      type: 'error',
      message: 'secret details',
      code: 'upstream_code',
      details: 'https://upstream.example/internal',
      error: { type: 'api_error', message: 'secret details' }
    })

    expect(result.changed).toBe(true)
    expect(result.data).toEqual({
      type: 'error',
      error: { type: 'api_error', message: 'Upstream service error' }
    })
  })

  it('returns the original body when sanitization is disabled', () => {
    process.env.CLAUDE_CONSOLE_ERROR_SANITIZATION_ENABLED = 'false'
    const originalBody = { error: { message: 'raw upstream detail' } }

    expect(buildClaudeConsoleClientError(400, originalBody, { originalBody })).toEqual({
      status: 400,
      body: originalBody
    })
    expect(sanitizeClaudeConsoleStreamEvent(originalBody)).toEqual({
      changed: false,
      data: originalBody
    })
  })
})
