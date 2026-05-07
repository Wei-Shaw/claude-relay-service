const {
  sanitizeRequestBodySnapshot,
  extractRequestReasoningInfo,
  resolveRequestDetailReasoning,
  createRequestDetailMeta,
  finalizeRequestDetailMeta,
  extractOpenAICacheReadTokens,
  isOpenAIRelatedEndpoint,
  calculateCacheHitRate
} = require('../src/utils/requestDetailHelper')

describe('requestDetailHelper', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  test('sanitizeRequestBodySnapshot redacts secrets and truncates long text', () => {
    const snapshot = sanitizeRequestBodySnapshot({
      apiKey: 'super-secret-api-key',
      messages: [
        {
          role: 'user',
          content: 'x'.repeat(400)
        }
      ]
    })

    expect(snapshot.apiKey).toContain('***')
    expect(snapshot.messages[0].content).toBe(`${'x'.repeat(80)}...[320 chars]`)
  })

  test('sanitizeRequestBodySnapshot keeps all object keys while truncating long values', () => {
    const payload = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [
        `key_${index}`,
        `value-${index}-${'x'.repeat(100)}`
      ])
    )

    const snapshot = sanitizeRequestBodySnapshot(payload)

    expect(Object.keys(snapshot)).toHaveLength(50)
    expect(snapshot.__truncatedKeys).toBeUndefined()
    expect(snapshot.key_0).toBe(`value-0-${'x'.repeat(72)}...[28 chars]`)
  })

  test('sanitizeRequestBodySnapshot still wraps oversized payloads in preview metadata', () => {
    const snapshot = sanitizeRequestBodySnapshot(
      Object.fromEntries(
        Array.from({ length: 220 }, (_, index) => [`key_${index}`, `${index}-${'x'.repeat(120)}`])
      )
    )

    expect(snapshot.summary).toBe('request body snapshot truncated')
    expect(snapshot.maxChars).toBe(12000)
    expect(typeof snapshot.preview).toBe('string')
    expect(snapshot.preview).toContain('...[')
  })

  test('sanitizeRequestBodySnapshot omits encrypted_content values', () => {
    const snapshot = sanitizeRequestBodySnapshot({
      reasoning: {
        encrypted_content: 'x'.repeat(512)
      }
    })

    expect(snapshot.reasoning.encrypted_content).toBe('...[512 chars]')
  })

  test('sanitizeRequestBodySnapshot keeps only tool type and name', () => {
    const snapshot = sanitizeRequestBodySnapshot({
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup_weather',
            description: 'Weather lookup',
            parameters: {
              type: 'object',
              properties: {
                city: {
                  type: 'string'
                }
              }
            }
          }
        },
        {
          name: 'claude_tool',
          description: 'Anthropic style tool',
          input_schema: {
            type: 'object'
          }
        }
      ]
    })

    expect(snapshot.tools).toEqual([
      { type: 'function', name: 'lookup_weather' },
      { name: 'claude_tool' }
    ])
  })

  test('extractRequestReasoningInfo supports openai, anthropic, and gemini payloads', () => {
    expect(
      extractRequestReasoningInfo({
        reasoning: {
          effort: 'xhigh'
        }
      })
    ).toEqual({
      reasoningDisplay: 'xhigh',
      reasoningSource: 'reasoning.effort'
    })

    expect(
      extractRequestReasoningInfo({
        output_config: {
          effort: 'medium'
        }
      })
    ).toEqual({
      reasoningDisplay: 'medium',
      reasoningSource: 'output_config.effort'
    })

    expect(
      extractRequestReasoningInfo({
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: -1
          }
        }
      })
    ).toEqual({
      reasoningDisplay: 'dynamic',
      reasoningSource: 'generationConfig.thinkingConfig.thinkingBudget'
    })
  })

  test('resolveRequestDetailReasoning falls back to stored preview text when needed', () => {
    expect(
      resolveRequestDetailReasoning({
        requestBodySnapshot: {
          preview:
            '{"model":"gpt-5.4-mini","reasoning":{"effort":"high","summary":"auto"}}...[25 chars]'
        }
      })
    ).toEqual({
      reasoningDisplay: 'high',
      reasoningSource: 'reasoning.effort'
    })

    expect(
      resolveRequestDetailReasoning({
        requestBodySnapshot: {
          preview:
            '{"model":"claude-opus-4-6","thinking":{"type":"enabled","budget_tokens":4096}...[60 chars]'
        }
      })
    ).toEqual({
      reasoningDisplay: 'enabled / budget:4096',
      reasoningSource: 'thinking.type,thinking.budget_tokens'
    })
  })

  test('createRequestDetailMeta derives endpoint and duration from request', () => {
    const now = Date.now()
    const req = {
      requestId: 'req_123',
      originalUrl: '/v1/messages?stream=true',
      method: 'POST',
      requestStartedAt: now - 250,
      body: { model: 'claude-sonnet-4-6', stream: true },
      res: { statusCode: 201 }
    }

    const meta = createRequestDetailMeta(req)

    expect(meta.requestId).toBe('req_123')
    expect(meta.endpoint).toBe('/v1/messages')
    expect(meta.method).toBe('POST')
    expect(meta.stream).toBe(true)
    expect(meta.statusCode).toBe(201)
    expect(meta.durationMs).toBeGreaterThanOrEqual(200)
    expect(meta.requestBody).toEqual(req.body)
  })

  test('finalizeRequestDetailMeta refreshes duration from requestStartedAt', () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-04-09T05:00:00.500Z'))

    const meta = finalizeRequestDetailMeta({
      requestId: 'req_123',
      requestStartedAt: '2026-04-09T05:00:00.000Z',
      durationMs: 25
    })

    expect(meta.durationMs).toBe(500)
  })

  test('identifies openai-style request detail endpoints', () => {
    expect(isOpenAIRelatedEndpoint('/openai/v1/responses')).toBe(true)
    expect(isOpenAIRelatedEndpoint('/openai/responses')).toBe(true)
    expect(isOpenAIRelatedEndpoint('/azure/chat/completions')).toBe(true)
    expect(isOpenAIRelatedEndpoint('/droid/openai/v1/responses')).toBe(true)
    expect(isOpenAIRelatedEndpoint('/openai/claude/v1/messages')).toBe(false)
    expect(isOpenAIRelatedEndpoint('/v1/messages')).toBe(false)
  })

  test('extractOpenAICacheReadTokens prefers input_tokens_details.cached_tokens', () => {
    expect(
      extractOpenAICacheReadTokens({
        input_tokens_details: { cached_tokens: 42 },
        prompt_tokens_details: { cached_tokens: 99 }
      })
    ).toBe(42)
  })

  test('extractOpenAICacheReadTokens supports singular cached_token fallback fields', () => {
    expect(
      extractOpenAICacheReadTokens({
        input_tokens_details: { cached_token: '17' }
      })
    ).toBe(17)

    expect(
      extractOpenAICacheReadTokens({
        prompt_tokens_details: { cached_token: 23 }
      })
    ).toBe(23)
  })

  test('extractOpenAICacheReadTokens falls back to prompt_tokens_details.cached_tokens', () => {
    expect(
      extractOpenAICacheReadTokens({
        prompt_tokens_details: { cached_tokens: '31' }
      })
    ).toBe(31)
  })

  test('extractOpenAICacheReadTokens normalizes invalid values to zero', () => {
    expect(extractOpenAICacheReadTokens()).toBe(0)
    expect(
      extractOpenAICacheReadTokens({
        input_tokens_details: { cached_tokens: -5 }
      })
    ).toBe(0)
    expect(
      extractOpenAICacheReadTokens({
        input_tokens_details: { cached_tokens: 'abc' },
        prompt_tokens_details: { cached_tokens: null }
      })
    ).toBe(0)
  })

  test('calculateCacheHitRate uses cacheRead / (cacheRead + cacheCreate) for non-openai requests', () => {
    expect(calculateCacheHitRate(120, 80)).toBe(60)
    expect(calculateCacheHitRate(0, 0)).toBe(0)
  })

  test('calculateCacheHitRate uses cached_tokens / prompt_tokens for /openai/ requests', () => {
    expect(
      calculateCacheHitRate({
        endpoint: '/openai/v1/responses',
        inputTokens: 100,
        cacheReadTokens: 60,
        cacheCreateTokens: 999
      })
    ).toBe(37.5)
    expect(
      calculateCacheHitRate({
        endpoint: '/openai/v1/responses',
        inputTokens: 0,
        cacheReadTokens: 0
      })
    ).toBe(0)
  })

  test('calculateCacheHitRate uses openai formula for azure records and non-openai formula for claude compatibility routes', () => {
    expect(
      calculateCacheHitRate({
        endpoint: '/azure/chat/completions',
        accountType: 'azure-openai',
        inputTokens: 100,
        cacheReadTokens: 60,
        cacheCreateTokens: 0
      })
    ).toBe(37.5)

    expect(
      calculateCacheHitRate({
        endpoint: '/openai/claude/v1/messages',
        accountType: 'claude',
        inputTokens: 100,
        cacheReadTokens: 30,
        cacheCreateTokens: 20
      })
    ).toBe(60)
  })
})
