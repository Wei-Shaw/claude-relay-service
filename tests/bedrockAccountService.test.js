jest.useFakeTimers()

jest.mock('../config/config', () => ({ security: { encryptionKey: 'test-encryption-key' } }), {
  virtual: true
})
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({ clearTempUnavailable: jest.fn() }))
jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(),
  addToIndex: jest.fn(),
  removeFromIndex: jest.fn(),
  getAllIdsByIndex: jest.fn(),
  batchGetChunked: jest.fn()
}))
jest.mock('../src/services/relay/bedrockRelayService', () => ({
  testConnection: jest.fn(),
  getAvailableModels: jest.fn(),
  invalidateAccountClients: jest.fn()
}))

const redis = require('../src/models/redis')
const relay = require('../src/services/relay/bedrockRelayService')
const service = require('../src/services/account/bedrockAccountService')
const { BEDROCK_TEST_MODEL } = require('../config/models')

describe('bedrockAccountService', () => {
  let store
  let client

  beforeEach(() => {
    jest.clearAllMocks()
    store = new Map()
    client = {
      get: jest.fn(async (key) => store.get(key) || null),
      set: jest.fn(async (key, value) => store.set(key, value)),
      del: jest.fn(async (key) => store.delete(key))
    }
    redis.getClientSafe.mockReturnValue(client)
    redis.addToIndex.mockResolvedValue(undefined)
    redis.removeFromIndex.mockResolvedValue(undefined)
    relay.testConnection.mockResolvedValue({
      status: 'connected',
      model: BEDROCK_TEST_MODEL,
      region: 'us-west-2',
      responseText: 'OK'
    })
    relay.getAvailableModels.mockResolvedValue([{ id: BEDROCK_TEST_MODEL }])
  })

  async function createAccessKeyAccount(overrides = {}) {
    return service.createAccount({
      name: 'Bedrock test',
      region: 'us-west-2',
      credentialType: 'access_key',
      awsCredentials: {
        accessKeyId: 'AKIA_ORIGINAL',
        secretAccessKey: 'original-secret',
        sessionToken: 'original-session'
      },
      ...overrides
    })
  }

  test('normalizes Region when creating and reading accounts', async () => {
    const created = await createAccessKeyAccount({ region: '  US-West-2 ' })
    const account = await service.getAccount(created.data.id)

    expect(created.data.region).toBe('us-west-2')
    expect(account.data.region).toBe('us-west-2')
  })

  test('merges partial access key updates without deleting omitted fields', async () => {
    const created = await createAccessKeyAccount()

    await service.updateAccount(created.data.id, {
      awsCredentials: { secretAccessKey: 'rotated-secret' }
    })
    const account = await service.getAccount(created.data.id)

    expect(account.data.awsCredentials).toEqual({
      accessKeyId: 'AKIA_ORIGINAL',
      secretAccessKey: 'rotated-secret',
      sessionToken: 'original-session'
    })
    expect(relay.invalidateAccountClients).toHaveBeenCalledWith(created.data.id)
  })

  test('removes a session token only when null is explicit', async () => {
    const created = await createAccessKeyAccount()

    await service.updateAccount(created.data.id, {
      awsCredentials: { sessionToken: null }
    })
    const account = await service.getAccount(created.data.id)

    expect(account.data.awsCredentials).not.toHaveProperty('sessionToken')
    expect(account.data.awsCredentials.accessKeyId).toBe('AKIA_ORIGINAL')
  })

  test('disables and remains deletable after the complete access key group is removed', async () => {
    const created = await createAccessKeyAccount()

    const updated = await service.updateAccount(created.data.id, { awsCredentials: null })
    const stored = JSON.parse(store.get(`bedrock_account:${created.data.id}`))

    expect(updated.success).toBe(true)
    expect(stored).not.toHaveProperty('awsCredentials')
    expect(stored.isActive).toBe(false)
    expect(stored.schedulable).toBe(false)
    await expect(service.getAccount(created.data.id)).resolves.toEqual(
      expect.objectContaining({ success: false })
    )

    relay.invalidateAccountClients.mockClear()
    await expect(service.deleteAccount(created.data.id)).resolves.toEqual({ success: true })
    expect(store.has(`bedrock_account:${created.data.id}`)).toBe(false)
    expect(relay.invalidateAccountClients).toHaveBeenCalledTimes(1)
    expect(relay.invalidateAccountClients).toHaveBeenCalledWith(created.data.id)
  })

  test('atomically clears stale access keys when switching to bearer token', async () => {
    const created = await createAccessKeyAccount()

    const updated = await service.updateAccount(created.data.id, {
      credentialType: 'bearer_token',
      bearerToken: 'new-bedrock-token'
    })
    const stored = JSON.parse(store.get(`bedrock_account:${created.data.id}`))
    const account = await service.getAccount(created.data.id)

    expect(updated.success).toBe(true)
    expect(stored).not.toHaveProperty('awsCredentials')
    expect(account.data.credentialType).toBe('bearer_token')
    expect(account.data.bearerToken).toBe('new-bedrock-token')
  })

  test('supports the standard AWS default credential chain without stored secrets', async () => {
    const created = await service.createAccount({
      name: 'Role account',
      region: 'us-west-2',
      credentialType: 'default'
    })
    const stored = JSON.parse(store.get(`bedrock_account:${created.data.id}`))
    const account = await service.getAccount(created.data.id)

    expect(stored).not.toHaveProperty('awsCredentials')
    expect(stored).not.toHaveProperty('bearerToken')
    expect(account).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ credentialType: 'default' })
      })
    )
  })

  test('disables a bearer-token account when its token is explicitly removed', async () => {
    const created = await service.createAccount({
      name: 'Bearer account',
      region: 'us-west-2',
      credentialType: 'bearer_token',
      bearerToken: 'bedrock-token'
    })

    const updated = await service.updateAccount(created.data.id, { bearerToken: null })
    const stored = JSON.parse(store.get(`bedrock_account:${created.data.id}`))

    expect(updated.success).toBe(true)
    expect(stored).not.toHaveProperty('bearerToken')
    expect(stored.isActive).toBe(false)
    expect(stored.schedulable).toBe(false)
  })

  test('rejects non-string bearer tokens as validation errors', async () => {
    await expect(
      service.createAccount({
        name: 'Invalid bearer account',
        region: 'us-west-2',
        credentialType: 'bearer_token',
        bearerToken: 123
      })
    ).rejects.toEqual(expect.objectContaining({ statusCode: 400 }))
  })

  test('clears stored credentials when switching to the default provider chain', async () => {
    const created = await createAccessKeyAccount()

    const updated = await service.updateAccount(created.data.id, { credentialType: 'default' })
    const stored = JSON.parse(store.get(`bedrock_account:${created.data.id}`))

    expect(updated.success).toBe(true)
    expect(stored.credentialType).toBe('default')
    expect(stored).not.toHaveProperty('awsCredentials')
    expect(stored).not.toHaveProperty('bearerToken')
  })

  test('infers access key authentication for legacy accounts without credentialType', async () => {
    const created = await createAccessKeyAccount()
    const key = `bedrock_account:${created.data.id}`
    const legacy = JSON.parse(store.get(key))
    delete legacy.credentialType
    legacy.region = ' US-West-2 '
    store.set(key, JSON.stringify(legacy))

    const account = await service.getAccount(created.data.id)

    expect(account.success).toBe(true)
    expect(account.data.credentialType).toBe('access_key')
    expect(account.data.region).toBe('us-west-2')
    expect(account.data.awsCredentials.accessKeyId).toBe('AKIA_ORIGINAL')
  })

  test('connection test succeeds only after a Runtime request succeeds', async () => {
    const created = await createAccessKeyAccount()

    const result = await service.testAccount(created.data.id)

    expect(relay.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: created.data.id }),
      BEDROCK_TEST_MODEL
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ status: 'connected', modelsCount: 1 })
      })
    )
  })

  test('propagates Runtime failures instead of treating the model catalog as connectivity', async () => {
    const created = await createAccessKeyAccount()
    relay.testConnection.mockRejectedValueOnce(new Error('Access denied'))

    await expect(service.testAccount(created.data.id)).resolves.toEqual({
      success: false,
      error: 'Access denied'
    })
  })

  test('recognizes both stored and DTO expiry field names', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()

    expect(service.isSubscriptionExpired({ subscriptionExpiresAt: past })).toBe(true)
    expect(service.isSubscriptionExpired({ expiresAt: past })).toBe(true)
    expect(service.isSubscriptionExpired({ expiresAt: future })).toBe(false)
  })

  test('preserves legacy expiresAt through the account-list DTO', async () => {
    const created = await createAccessKeyAccount()
    const key = `bedrock_account:${created.data.id}`
    const legacy = JSON.parse(store.get(key))
    const expiresAt = '2020-01-01T00:00:00.000Z'
    delete legacy.subscriptionExpiresAt
    legacy.expiresAt = expiresAt
    store.set(key, JSON.stringify(legacy))
    redis.getAllIdsByIndex.mockResolvedValue([created.data.id])
    redis.batchGetChunked.mockImplementation(async (keys) => keys.map((item) => store.get(item)))

    const result = await service.getAllAccounts()

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        subscriptionExpiresAt: expiresAt,
        tokenExpiresAt: null,
        expiresAt
      })
    )
    expect(service.isSubscriptionExpired(result.data[0])).toBe(true)
  })
})
