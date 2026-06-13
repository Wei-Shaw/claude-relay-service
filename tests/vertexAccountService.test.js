jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))

jest.mock('../config/config', () => ({
  security: {
    encryptionKey: 'test-encryption-key-32-chars-aaaa'
  }
}))

const mockRedisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn()
}

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => mockRedisClient),
  addToIndex: jest.fn(),
  removeFromIndex: jest.fn(),
  getAllIdsByIndex: jest.fn(),
  batchGetChunked: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({
  clearTempUnavailable: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('../src/utils/webhookNotifier', () => ({
  sendAccountAnomalyNotification: jest.fn().mockResolvedValue(undefined)
}))

const mockAuthorize = jest.fn()
jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({
    authorize: mockAuthorize
  }))
}))

let redis

describe('vertexAccountService', () => {
  let vertexAccountService

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    Object.values(mockRedisClient).forEach((fn) => fn.mockReset?.())
    mockAuthorize.mockReset()
    redis = require('../src/models/redis')
    vertexAccountService = require('../src/services/account/vertexAccountService')
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  const sampleCredentials = {
    type: 'service_account',
    project_id: 'sample-proj',
    client_email: 'svc@sample-proj.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n'
  }

  describe('createAccount', () => {
    it('encrypts the credentialsJson and persists to Redis', async () => {
      mockRedisClient.set.mockResolvedValue('OK')
      redis.addToIndex.mockResolvedValue(1)

      const result = await vertexAccountService.createAccount({
        name: 'My Vertex',
        projectId: 'p-1',
        region: 'us-east5',
        credentialsJson: sampleCredentials
      })

      expect(result.success).toBe(true)
      expect(result.data.id).toBeDefined()
      expect(result.data.projectId).toBe('p-1')
      expect(result.data.type).toBe('vertex')

      // Verify Redis write
      expect(mockRedisClient.set).toHaveBeenCalledTimes(1)
      const [key, payload] = mockRedisClient.set.mock.calls[0]
      expect(key).toMatch(/^vertex_account:/)
      const stored = JSON.parse(payload)

      // 凭证应当被加密（encrypted+iv 字段），不能含明文 private_key
      expect(stored.credentialsJson).toHaveProperty('encrypted')
      expect(stored.credentialsJson).toHaveProperty('iv')
      expect(payload).not.toContain('FAKE')
      expect(payload).not.toContain('private_key')

      // Should add to index
      expect(redis.addToIndex).toHaveBeenCalledWith('vertex_account:index', expect.any(String))
    })

    it('rejects when projectId is missing', async () => {
      await expect(
        vertexAccountService.createAccount({
          name: 'No project',
          credentialsJson: sampleCredentials
        })
      ).rejects.toThrow(/projectId is required/)
    })

    it('rejects when credentialsJson is missing', async () => {
      await expect(
        vertexAccountService.createAccount({
          name: 'No creds',
          projectId: 'p-2'
        })
      ).rejects.toThrow(/credentialsJson .* is required/)
    })

    it('rejects when credentialsJson lacks required fields', async () => {
      await expect(
        vertexAccountService.createAccount({
          name: 'Bad creds',
          projectId: 'p-3',
          credentialsJson: { foo: 'bar' }
        })
      ).rejects.toThrow(/Invalid Service Account JSON/)
    })
  })

  describe('getAccount', () => {
    it('returns decrypted credentialsJson', async () => {
      mockRedisClient.set.mockResolvedValue('OK')
      redis.addToIndex.mockResolvedValue(1)

      const created = await vertexAccountService.createAccount({
        name: 'Decrypt-test',
        projectId: 'pp',
        credentialsJson: sampleCredentials
      })
      const accountId = created.data.id

      // Mock Redis to return what was just persisted
      const persisted = mockRedisClient.set.mock.calls[0][1]
      mockRedisClient.get.mockResolvedValue(persisted)

      const fetched = await vertexAccountService.getAccount(accountId)
      expect(fetched.success).toBe(true)
      expect(fetched.data.credentialsJson).toBeDefined()
      expect(fetched.data.credentialsJson.client_email).toBe(sampleCredentials.client_email)
      expect(fetched.data.credentialsJson.private_key).toBe(sampleCredentials.private_key)
    })

    it('returns failure when account not found', async () => {
      mockRedisClient.get.mockResolvedValue(null)
      const result = await vertexAccountService.getAccount('missing-id')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Account not found')
    })
  })

  describe('getAllAccounts', () => {
    it('lists accounts without exposing credentials', async () => {
      mockRedisClient.set.mockResolvedValue('OK')
      redis.addToIndex.mockResolvedValue(1)

      const created = await vertexAccountService.createAccount({
        name: 'List-test',
        projectId: 'list-proj',
        credentialsJson: sampleCredentials
      })

      const persisted = mockRedisClient.set.mock.calls[0][1]
      redis.getAllIdsByIndex.mockResolvedValue([created.data.id])
      redis.batchGetChunked.mockResolvedValue([persisted])

      const result = await vertexAccountService.getAllAccounts()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      const a = result.data[0]
      expect(a.id).toBe(created.data.id)
      expect(a.projectId).toBe('list-proj')
      expect(a.hasCredentials).toBe(true)
      // The list view should never include the credentialsJson field
      expect(a.credentialsJson).toBeUndefined()
    })
  })

  describe('deleteAccount', () => {
    it('removes the account record and index entry', async () => {
      mockRedisClient.set.mockResolvedValue('OK')
      redis.addToIndex.mockResolvedValue(1)

      const created = await vertexAccountService.createAccount({
        name: 'Del-test',
        projectId: 'd-proj',
        credentialsJson: sampleCredentials
      })
      const accountId = created.data.id

      const persisted = mockRedisClient.set.mock.calls[0][1]
      mockRedisClient.get.mockResolvedValue(persisted)
      mockRedisClient.del.mockResolvedValue(1)
      redis.removeFromIndex.mockResolvedValue(1)

      const res = await vertexAccountService.deleteAccount(accountId)
      expect(res.success).toBe(true)
      expect(mockRedisClient.del).toHaveBeenCalledWith(`vertex_account:${accountId}`)
      expect(redis.removeFromIndex).toHaveBeenCalledWith('vertex_account:index', accountId)
    })
  })

  describe('getAccessToken', () => {
    it('caches the token and reuses it within TTL', async () => {
      const fakeAccount = {
        id: 'tok-acc',
        name: 'tok',
        credentialsJson: sampleCredentials
      }
      mockAuthorize.mockResolvedValue({
        access_token: 'ya29.cached-token',
        expiry_date: Date.now() + 30 * 60 * 1000
      })

      const t1 = await vertexAccountService.getAccessToken(fakeAccount)
      const t2 = await vertexAccountService.getAccessToken(fakeAccount)
      expect(t1).toBe('ya29.cached-token')
      expect(t2).toBe('ya29.cached-token')
      // Should authorize only once thanks to cache
      expect(mockAuthorize).toHaveBeenCalledTimes(1)
    })

    it('refreshes when cached token nears expiry', async () => {
      const fakeAccount = {
        id: 'tok-refresh',
        name: 'refresh',
        credentialsJson: sampleCredentials
      }
      // First token expires in 10 seconds (under 60s safety margin), so a refresh is required
      mockAuthorize
        .mockResolvedValueOnce({
          access_token: 'first-token',
          expiry_date: Date.now() + 10 * 1000
        })
        .mockResolvedValueOnce({
          access_token: 'second-token',
          expiry_date: Date.now() + 50 * 60 * 1000
        })

      const a = await vertexAccountService.getAccessToken(fakeAccount)
      const b = await vertexAccountService.getAccessToken(fakeAccount)
      expect(a).toBe('first-token')
      expect(b).toBe('second-token')
      expect(mockAuthorize).toHaveBeenCalledTimes(2)
    })
  })
})
