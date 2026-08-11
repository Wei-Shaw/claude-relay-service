jest.mock('../config/config', () => ({ bedrock: {} }), { virtual: true })
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))
jest.mock('../src/services/userMessageQueueService', () => ({}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  markTempUnavailable: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(),
  InvokeModelCommand: jest.fn((input) => ({ input })),
  InvokeModelWithResponseStreamCommand: jest.fn((input) => ({ input }))
}))
jest.mock('@aws-sdk/client-bedrock', () => ({
  BedrockClient: jest.fn(),
  ListInferenceProfilesCommand: jest.fn((input) => ({ input }))
}))

const runtimeSdk = require('@aws-sdk/client-bedrock-runtime')
const controlSdk = require('@aws-sdk/client-bedrock')
const relay = require('../src/services/relay/bedrockRelayService')
const { BEDROCK_TEST_MODEL } = require('../config/models')

function streamResponse(text = 'OK') {
  return {
    body: (async function* stream() {
      yield {
        chunk: {
          bytes: Buffer.from(
            JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })
          )
        }
      }
      yield { chunk: { bytes: Buffer.from(JSON.stringify({ type: 'message_stop' })) } }
    })()
  }
}

function emptyStreamResponse() {
  return {
    body: (async function* stream() {})()
  }
}

describe('bedrockRelayService', () => {
  let runtimeInstances
  let runtimeSend
  let middlewareAdd
  let controlSend
  let controlDestroy

  beforeEach(() => {
    jest.clearAllMocks()
    relay.clients.clear()
    runtimeInstances = []
    runtimeSend = jest.fn().mockResolvedValue(streamResponse())
    middlewareAdd = jest.fn()
    controlSend = jest.fn().mockResolvedValue({ inferenceProfileSummaries: [] })
    controlDestroy = jest.fn()
    runtimeSdk.BedrockRuntimeClient.mockImplementation((clientConfig) => {
      const client = {
        clientConfig,
        send: runtimeSend,
        middlewareStack: { add: middlewareAdd }
      }
      runtimeInstances.push(client)
      return client
    })
    controlSdk.BedrockClient.mockImplementation(() => ({
      send: controlSend,
      destroy: controlDestroy
    }))
  })

  test('normalizes Region before constructing the SDK client', () => {
    relay._getBedrockClient(' us-west-2 ', {
      id: 'account-1',
      credentialType: 'access_key',
      awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
    })

    expect(runtimeInstances[0].clientConfig.region).toBe('us-west-2')
    expect(runtimeInstances[0].clientConfig.requestHandler).toEqual({
      requestTimeout: 600000,
      connectionTimeout: 10000
    })
  })

  test('rejects malformed Region instead of generating an invalid URL', () => {
    expect(() =>
      relay._getBedrockClient('us-west-2.invalid', {
        id: 'account-1',
        credentialType: 'access_key',
        awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
      })
    ).toThrow('Invalid AWS Region')
  })

  test('uses a credential fingerprint so rotations create a fresh client', () => {
    const first = relay._getBedrockClient('us-west-2', {
      id: 'account-1',
      credentialType: 'access_key',
      awsCredentials: { accessKeyId: 'AKIA_ONE', secretAccessKey: 'secret-one' }
    })
    const second = relay._getBedrockClient('us-west-2', {
      id: 'account-1',
      credentialType: 'access_key',
      awsCredentials: { accessKeyId: 'AKIA_TWO', secretAccessKey: 'secret-two' }
    })

    expect(second).not.toBe(first)
    expect(runtimeSdk.BedrockRuntimeClient).toHaveBeenCalledTimes(2)
    for (const cacheKey of relay.clients.keys()) {
      expect(cacheKey).not.toContain('AKIA_ONE')
      expect(cacheKey).not.toContain('AKIA_TWO')
      expect(cacheKey).not.toContain('secret-one')
      expect(cacheKey).not.toContain('secret-two')
    }
  })

  test('destroys cached clients when an account is invalidated', () => {
    const client = relay._getBedrockClient('us-west-2', {
      id: 'account-1',
      credentialType: 'access_key',
      awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
    })
    client.destroy = jest.fn()

    expect(relay.invalidateAccountClients('account-1')).toBe(1)
    expect(client.destroy).toHaveBeenCalledTimes(1)
    expect(relay.clients).toHaveProperty('size', 0)
  })

  test('strictly follows bearer_token even when stale access keys exist', () => {
    relay._getBedrockClient('us-west-2', {
      id: 'account-1',
      credentialType: 'bearer_token',
      bearerToken: 'bedrock-token',
      awsCredentials: { accessKeyId: 'STALE', secretAccessKey: 'stale-secret' }
    })

    expect(runtimeInstances[0].clientConfig.credentials).toEqual({
      accessKeyId: 'BEDROCK_API_KEY_PLACEHOLDER',
      secretAccessKey: 'BEDROCK_API_KEY_PLACEHOLDER'
    })
    expect(middlewareAdd).toHaveBeenCalledTimes(1)
  })

  test('leaves credentials unset for the standard AWS provider chain', () => {
    relay._getBedrockClient('us-west-2', {
      id: 'account-default',
      credentialType: 'default'
    })

    expect(runtimeInstances[0].clientConfig).not.toHaveProperty('credentials')
  })

  test('destroys the control-plane client after paginated model discovery', async () => {
    controlSend
      .mockResolvedValueOnce({
        inferenceProfileSummaries: [
          {
            inferenceProfileId: BEDROCK_TEST_MODEL,
            inferenceProfileName: 'Claude Haiku 4.5'
          }
        ],
        nextToken: 'next-page'
      })
      .mockResolvedValueOnce({ inferenceProfileSummaries: [] })

    await expect(
      relay.getAvailableModels({
        id: 'account-1',
        region: 'us-west-2',
        credentialType: 'access_key',
        awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
      })
    ).resolves.toEqual([
      expect.objectContaining({ id: BEDROCK_TEST_MODEL, name: 'Claude Haiku 4.5' })
    ])
    expect(controlSend).toHaveBeenCalledTimes(2)
    expect(controlDestroy).toHaveBeenCalledTimes(1)
  })

  test('destroys the control-plane client when discovery falls back', async () => {
    controlSend.mockRejectedValueOnce(new Error('Access denied'))

    const models = await relay.getAvailableModels({
      id: 'account-1',
      region: 'us-west-2',
      credentialType: 'access_key',
      awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
    })

    expect(models).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: BEDROCK_TEST_MODEL })])
    )
    expect(controlDestroy).toHaveBeenCalledTimes(1)
  })

  test('honors the requested model before the account default', () => {
    expect(
      relay._selectModel(
        { model: 'claude-haiku-4-5' },
        { id: 'account-1', defaultModel: 'us.anthropic.claude-sonnet-4-20250514-v1:0' }
      )
    ).toBe(BEDROCK_TEST_MODEL)
  })

  test('maps Sonnet 4.6 without silently downgrading it', () => {
    expect(relay._selectModel({ model: 'claude-sonnet-4-6' }, null)).toBe(
      'us.anthropic.claude-sonnet-4-6'
    )
  })

  test('maps the Claude Code Opus 5 alias to the official Bedrock profile', () => {
    expect(relay._selectModel({ model: 'claude-opus-5' }, null)).toBe(
      'global.anthropic.claude-opus-5'
    )
    expect(relay._selectModel({ model: 'claude-opus-5[1m]' }, null)).toBe(
      'global.anthropic.claude-opus-5'
    )
  })

  test('maps the Claude Code Sonnet 5 alias to the official Bedrock profile', () => {
    expect(relay._selectModel({ model: 'claude-sonnet-5' }, null)).toBe(
      'global.anthropic.claude-sonnet-5'
    )
    expect(relay._selectModel({ model: 'claude-sonnet-5[1m]' }, null)).toBe(
      'global.anthropic.claude-sonnet-5'
    )
  })

  test('preserves adaptive thinking and effort for Opus 5', () => {
    const payload = relay._convertToBedrockFormat(
      {
        model: 'claude-opus-5[1m]',
        max_tokens: 64000,
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' }
      },
      'global.anthropic.claude-opus-5'
    )

    expect(payload.thinking).toEqual({ type: 'adaptive' })
    expect(payload.output_config).toEqual({ effort: 'high' })
  })

  test('upgrades legacy extended thinking requests for Opus 5', () => {
    const request = {
      model: 'claude-opus-5',
      max_tokens: 32000,
      messages: [{ role: 'user', content: 'Hello' }],
      system: [{ type: 'text', text: "You are Claude Code, Anthropic's official CLI." }],
      tools: [{ name: 'Read', description: 'Read a file', input_schema: { type: 'object' } }],
      metadata: { user_id: 'session-1' },
      thinking: { type: 'enabled', budget_tokens: 31999 },
      context_management: {
        edits: [{ type: 'clear_thinking_20251015', keep: 'all' }]
      },
      stream: true
    }
    const payload = relay._convertToBedrockFormat(request, 'global.anthropic.claude-opus-5')

    expect(payload.thinking).toEqual({ type: 'adaptive' })
    expect(payload.output_config).toEqual({ effort: 'high' })
    expect(payload.context_management).toEqual(request.context_management)
    expect(payload.anthropic_beta).toContain('context-management-2025-06-27')
    expect(payload.messages).toEqual(request.messages)
    expect(payload.system).toEqual(request.system)
    expect(payload.tools).toEqual(request.tools)
    expect(payload.metadata).toEqual(request.metadata)
    expect(payload).not.toHaveProperty('model')
    expect(payload).not.toHaveProperty('stream')
    expect(request.thinking).toEqual({ type: 'enabled', budget_tokens: 31999 })
  })

  test('upgrades legacy extended thinking requests for Sonnet 5', () => {
    const payload = relay._convertToBedrockFormat(
      {
        model: 'claude-sonnet-5',
        max_tokens: 32000,
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled', budget_tokens: 31999 }
      },
      'global.anthropic.claude-sonnet-5'
    )

    expect(payload.thinking).toEqual({ type: 'adaptive' })
    expect(payload.output_config).toEqual({ effort: 'high' })
  })

  test('keeps fixed-budget thinking for models without adaptive thinking', () => {
    const payload = relay._convertToBedrockFormat(
      {
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' }
      },
      BEDROCK_TEST_MODEL
    )

    expect(payload.thinking).toEqual({ type: 'enabled', budget_tokens: 4095 })
    expect(payload).not.toHaveProperty('output_config')
  })

  test('preserves Bedrock response extensions while normalizing the model name', () => {
    const response = relay._convertFromBedrockFormat({
      id: 'message-1',
      type: 'message',
      role: 'assistant',
      model: 'global.anthropic.claude-opus-5',
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: { type: 'refusal', category: null },
      context_management: {
        applied_edits: [{ type: 'clear_thinking_20251015', cleared_thinking_turns: 1 }]
      },
      usage: { input_tokens: 2, output_tokens: 1 }
    })

    expect(response.model).toBe('claude-opus-5')
    expect(response.stop_details).toEqual({ type: 'refusal', category: null })
    expect(response.context_management).toEqual({
      applied_edits: [{ type: 'clear_thinking_20251015', cleared_thinking_turns: 1 }]
    })
  })

  test('performs a real streaming Runtime request for connection tests', async () => {
    const account = {
      id: 'account-1',
      region: 'us-west-2',
      credentialType: 'access_key',
      awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
    }
    const onContent = jest.fn()

    await expect(relay.testConnection(account, BEDROCK_TEST_MODEL, onContent)).resolves.toEqual(
      expect.objectContaining({
        status: 'connected',
        model: BEDROCK_TEST_MODEL,
        region: 'us-west-2',
        responseText: 'OK'
      })
    )
    expect(runtimeSend).toHaveBeenCalledTimes(1)
    expect(onContent).toHaveBeenCalledWith('OK')
  })

  test('does not report connected for an incomplete Runtime stream', async () => {
    runtimeSend.mockResolvedValueOnce(emptyStreamResponse())

    await expect(
      relay.testConnection(
        {
          id: 'account-1',
          region: 'us-west-2',
          credentialType: 'access_key',
          awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
        },
        BEDROCK_TEST_MODEL
      )
    ).rejects.toThrow('incomplete response stream')
  })

  test('surfaces Runtime exception events from the response stream', async () => {
    runtimeSend.mockResolvedValueOnce({
      body: (async function* stream() {
        yield { validationException: { message: 'Model is unavailable' } }
      })()
    })

    await expect(
      relay.testConnection(
        {
          id: 'account-1',
          region: 'us-west-2',
          credentialType: 'access_key',
          awsCredentials: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret' }
        },
        BEDROCK_TEST_MODEL
      )
    ).rejects.toThrow('Model is unavailable')
  })
})
