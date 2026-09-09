const grokHelper = require('../src/utils/grokHelper')

describe('grokHelper upstream modes', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    delete process.env.XAI_ALLOW_UNSAFE_URL_OVERRIDES
    delete process.env.XAI_GROK_CLI_VERSION
    delete process.env.XAI_OAUTH_AUTHORIZE_URL
    delete process.env.XAI_OAUTH_TOKEN_URL
    delete process.env.XAI_BASE_URL
  })

  describe('OAuth default upstream', () => {
    it('sends OAuth accounts to the CLI chat proxy by default', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.OAUTH
        })
      ).toBe(grokHelper.DEFAULT_CLI_BASE_URL)
    })

    it('redirects legacy OAuth accounts that stored api.x.ai to the CLI proxy', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.OAUTH,
          baseUrl: 'https://api.x.ai/v1'
        })
      ).toBe(grokHelper.DEFAULT_CLI_BASE_URL)
    })

    it('keeps the CLI proxy host and redirects regional API hosts to the CLI proxy', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.OAUTH,
          baseUrl: 'https://cli-chat-proxy.grok.com/v1'
        })
      ).toBe(grokHelper.DEFAULT_CLI_BASE_URL)

      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.OAUTH,
          baseUrl: 'https://us-west-2.api.x.ai/v1'
        })
      ).toBe(grokHelper.DEFAULT_CLI_BASE_URL)
    })

    it('ignores a third-party OAuth upstream unless customUpstream is enabled', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.OAUTH,
          baseUrl: 'https://relay.example.com/v1'
        })
      ).toBe(grokHelper.DEFAULT_CLI_BASE_URL)
    })

    it('allows a public HTTPS custom upstream for OAuth overlay mode', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.OAUTH,
          baseUrl: 'https://relay.example.com/xai/v1',
          customUpstream: true
        })
      ).toBe('https://relay.example.com/xai/v1')
    })
  })

  describe('official API key and custom relay', () => {
    it('defaults API-key accounts to the public xAI API', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY
        })
      ).toBe(grokHelper.DEFAULT_API_BASE_URL)
    })

    it('accepts regional official API hosts', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY,
          baseUrl: 'https://eu-west-1.api.x.ai/v1'
        })
      ).toBe('https://eu-west-1.api.x.ai/v1')
    })

    it('keeps a third-party relay path prefix', () => {
      expect(
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY,
          baseUrl: 'https://relay.example.com/xai/v1'
        })
      ).toBe('https://relay.example.com/xai/v1')
    })

    it('rejects private or http custom relays by default', () => {
      expect(() =>
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY,
          baseUrl: 'http://relay.example.com/v1'
        })
      ).toThrow(/https/)

      expect(() =>
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY,
          baseUrl: 'https://127.0.0.1/v1'
        })
      ).toThrow(/Private/)

      expect(() =>
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY,
          baseUrl: 'https://127.0.0.2/v1'
        })
      ).toThrow(/Private/)

      expect(() =>
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY,
          baseUrl: 'https://169.254.169.254/v1'
        })
      ).toThrow(/Private/)

      expect(() =>
        grokHelper.resolveAccountBaseUrl({
          authType: grokHelper.AUTH_TYPES.API_KEY,
          baseUrl: 'https://[::1]/v1'
        })
      ).toThrow(/Private/)
    })

    it('rejects official hosts that are not /v1', () => {
      expect(() => grokHelper.validateTrustedBaseURL('https://api.x.ai/openai')).toThrow(/\/v1/)
    })
  })

  describe('OAuth endpoints stay on auth.x.ai', () => {
    it('builds an authorization URL against official auth.x.ai', () => {
      const url = grokHelper.buildAuthorizationURL({
        state: 'abc',
        codeChallenge: 'challenge',
        nonce: 'nonce'
      })
      expect(url.startsWith('https://auth.x.ai/oauth2/authorize?')).toBe(true)
      expect(url).toContain('code_challenge=challenge')
      expect(url).toContain('code_challenge_method=S256')
    })

    it('does not honor an unallowlisted token URL override', () => {
      process.env.XAI_OAUTH_TOKEN_URL = 'https://evil.example/oauth/token'
      expect(() => grokHelper.validateOAuthEndpointURL(grokHelper.effectiveTokenURL())).toThrow()
    })

    it('parses a callback URL, query string, or bare code', () => {
      expect(
        grokHelper.parseAuthorizationInput('http://127.0.0.1:56121/callback?code=abc123&state=xyz')
      ).toEqual({ code: 'abc123', state: 'xyz', requiresState: true })

      expect(grokHelper.parseAuthorizationInput('code=fromquery&state=s')).toEqual({
        code: 'fromquery',
        state: 's',
        requiresState: true
      })

      expect(grokHelper.parseAuthorizationInput('bare-code')).toEqual({
        code: 'bare-code',
        state: '',
        requiresState: false
      })
    })
  })

  describe('CLI identity headers', () => {
    it('stamps CLI identity only for cli-chat-proxy.grok.com', () => {
      const cliHeaders = grokHelper.applyCLIProxyHeaders(
        { Authorization: 'Bearer tok' },
        'https://cli-chat-proxy.grok.com/v1/responses'
      )
      expect(cliHeaders['X-XAI-Token-Auth']).toBe('xai-grok-cli')
      expect(cliHeaders['x-grok-client-identifier']).toBe('grok-shell')
      expect(cliHeaders['x-grok-client-version']).toBe(grokHelper.CLI_CLIENT_VERSION)
      expect(cliHeaders['User-Agent']).toBe(grokHelper.cliUserAgent())

      const apiHeaders = grokHelper.applyCLIProxyHeaders(
        { Authorization: 'Bearer tok' },
        'https://api.x.ai/v1/responses'
      )
      expect(apiHeaders['X-XAI-Token-Auth']).toBeUndefined()
    })

    it('drops CLI version overrides below the stable floor', () => {
      process.env.XAI_GROK_CLI_VERSION = '0.2.1'
      expect(grokHelper.resolveCLIVersion()).toBe(grokHelper.CLI_CLIENT_VERSION)
    })
  })

  describe('path joining', () => {
    it('avoids duplicating /v1 when the base already ends with it', () => {
      expect(grokHelper.joinBaseAndPath('https://api.x.ai/v1', '/v1/chat/completions')).toBe(
        'https://api.x.ai/v1/chat/completions'
      )
      expect(grokHelper.joinBaseAndPath('https://relay.example.com/xai/v1', '/responses')).toBe(
        'https://relay.example.com/xai/v1/responses'
      )
    })
  })

  describe('Chat Completions body normalization', () => {
    it('keeps Chat Completions tools and messages untouched (no Responses rewrite)', () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } }
          }
        }
      ]
      const messages = [
        { role: 'system', content: 'Be terse.' },
        { role: 'user', content: 'Weather in Paris?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{}' } }
          ]
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'sunny' }
      ]
      const body = { model: 'grok-4.6', messages, tools, tool_choice: 'auto', stream: false }
      const normalized = grokHelper.normalizeChatCompletionsBody(body)
      expect(normalized.tools).toBe(tools)
      expect(normalized.messages).toBe(messages)
      expect(normalized.tool_choice).toBe('auto')
      expect(normalized.input).toBeUndefined()
      expect(normalized.max_output_tokens).toBeUndefined()
      expect(normalized.stream_options).toBeUndefined()
      expect(body.stream_options).toBeUndefined()
    })

    it('forces stream usage on streaming requests without clobbering other options', () => {
      const normalized = grokHelper.normalizeChatCompletionsBody({
        model: 'grok-4.6',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        stream_options: { foo: 'bar' }
      })
      expect(normalized.stream_options).toEqual({ foo: 'bar', include_usage: true })
      expect(
        grokHelper.normalizeChatCompletionsBody({ model: 'grok-4.6', stream: true }).stream_options
      ).toEqual({ include_usage: true })
    })

    it('drops the Responses-only prompt_cache_key', () => {
      const normalized = grokHelper.normalizeChatCompletionsBody({
        model: 'grok-4.6',
        prompt_cache_key: 'abc',
        messages: []
      })
      expect(normalized.prompt_cache_key).toBeUndefined()
    })

    it('normalizes reasoning_effort like Sub2API', () => {
      const effort = (model, value, key = 'reasoning_effort') =>
        grokHelper.normalizeChatCompletionsBody({ model, [key]: value }).reasoning_effort

      expect(effort('grok-4.6', 'minimal')).toBe('low')
      expect(effort('grok-4.6', 'max')).toBe('high')
      expect(effort('grok-4.6', 'x-high')).toBe('xhigh')
      expect(effort('grok-4.5', 'xhigh')).toBe('high')
      expect(effort('xai/grok-4.6', 'Medium')).toBe('medium')
      expect(effort('grok-4.6', 'bogus')).toBeUndefined()
      expect(effort('grok-4.6', null)).toBeUndefined()
      expect(effort('grok-4', 'high')).toBeUndefined()
      expect(effort('grok-4.6', 'high', 'reasoningEffort')).toBe('high')
      expect(
        grokHelper.normalizeChatCompletionsBody({ model: 'grok-4.6', reasoningEffort: 'high' })
          .reasoningEffort
      ).toBeUndefined()
    })

    it('returns non-object bodies unchanged', () => {
      expect(grokHelper.normalizeChatCompletionsBody(null)).toBeNull()
      expect(grokHelper.normalizeChatCompletionsBody('raw')).toBe('raw')
      const arr = []
      expect(grokHelper.normalizeChatCompletionsBody(arr)).toBe(arr)
    })
  })
})
