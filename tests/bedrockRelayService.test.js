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

  beforeEach(() => {
    jest.clearAllMocks()
    relay.clients.clear()
    runtimeInstances = []
    runtimeSend = jest.fn().mockResolvedValue(streamResponse())
    middlewareAdd = jest.fn()
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
      send: jest.fn().mockResolvedValue({ inferenceProfileSummaries: [] })
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
