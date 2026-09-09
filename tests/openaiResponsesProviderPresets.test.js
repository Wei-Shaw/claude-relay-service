const mockHSet = jest.fn()
const mockHGetAll = jest.fn()
const mockSAdd = jest.fn()

const mockClient = {
  hset: mockHSet,
  hgetall: mockHGetAll,
  sadd: mockSAdd,
  srem: jest.fn(),
  del: jest.fn(),
  pipeline: jest.fn()
}

jest.mock(
  '../config/config',
  () => ({
    security: {
      encryptionKey: 'test-encryption-key-32-characters!!'
    }
  }),
  { virtual: true }
)

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => mockClient),
  getDateStringInTimezone: jest.fn(() => '2026-08-27'),
  addToIndex: jest.fn(),
  removeFromIndex: jest.fn(),
  getAllIdsByIndex: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  database: jest.fn(),
  debug: jest.fn(),
  info: jest.fn()
}))

const service = require('../src/services/account/openaiResponsesAccountService')

describe('OpenAIResponsesAccountService provider presets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createAccount', () => {
    it('resolves orcarouter provider to the preset base URL', async () => {
      const account = await service.createAccount({
        name: 'OrcaRouter Pool',
        apiKey: 'sk-orca-test',
        provider: 'orcarouter'
      })

      expect(account.provider).toBe('orcarouter')
      expect(account.baseApi).toBe('https://api.orcarouter.ai/v1')
      // apiKey is masked in the returned data
      expect(account.apiKey).toBe('***')
      // the encrypted key was persisted via hset
      expect(mockHSet).toHaveBeenCalled()
      const saved = mockHSet.mock.calls[0][1]
      expect(saved.baseApi).toBe('https://api.orcarouter.ai/v1')
      expect(saved.provider).toBe('orcarouter')
    })

    it('keeps a custom baseApi when provider is custom', async () => {
      const account = await service.createAccount({
        name: 'Custom Gateway',
        baseApi: 'https://my-gateway.example.com/v1',
        apiKey: 'sk-custom-test',
        provider: 'custom'
      })

      expect(account.provider).toBe('custom')
      expect(account.baseApi).toBe('https://my-gateway.example.com/v1')
    })

    it('defaults to custom provider when provider is omitted', async () => {
      const account = await service.createAccount({
        name: 'Legacy Account',
        baseApi: 'https://legacy.example.com/v1',
        apiKey: 'sk-legacy-test'
      })

      expect(account.provider).toBe('custom')
      expect(account.baseApi).toBe('https://legacy.example.com/v1')
    })

    it('rejects unknown provider names', async () => {
      await expect(
        service.createAccount({
          name: 'Bad',
          apiKey: 'sk-bad',
          provider: 'not-a-provider'
        })
      ).rejects.toThrow(/Invalid provider: not-a-provider/)
    })

    it('still requires an apiKey even when provider is preset', async () => {
      await expect(
        service.createAccount({
          name: 'No Key',
          provider: 'orcarouter'
        })
      ).rejects.toThrow(/API Key are required/)
    })
  })

  describe('updateAccount', () => {
    it('switches an existing account to orcarouter and fills the preset URL', async () => {
      mockHGetAll.mockResolvedValue({
        id: 'acc-1',
        platform: 'openai-responses',
        name: 'Existing',
        baseApi: 'https://old.example.com/v1',
        apiKey: 'encrypted-key',
        provider: 'custom',
        isActive: 'true'
      })

      const result = await service.updateAccount('acc-1', { provider: 'orcarouter' })

      expect(result.success).toBe(true)
      const saved = mockHSet.mock.calls[0][1]
      expect(saved.provider).toBe('orcarouter')
      expect(saved.baseApi).toBe('https://api.orcarouter.ai/v1')
    })

    it('keeps the existing baseApi when updating to custom', async () => {
      mockHGetAll.mockResolvedValue({
        id: 'acc-2',
        platform: 'openai-responses',
        name: 'Existing',
        baseApi: 'https://old.example.com/v1',
        apiKey: 'encrypted-key',
        provider: 'orcarouter',
        isActive: 'true'
      })

      const result = await service.updateAccount('acc-2', { provider: 'custom' })

      expect(result.success).toBe(true)
      const saved = mockHSet.mock.calls[0][1]
      expect(saved.provider).toBe('custom')
      expect(saved.baseApi).toBe('https://old.example.com/v1')
    })
  })
})
