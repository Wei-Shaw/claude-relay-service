jest.useFakeTimers()

const mockHgetall = jest.fn()
const mockHset = jest.fn()
const mockSadd = jest.fn()

jest.mock('../src/models/redis', () => ({
  addToIndex: jest.fn(),
  getClientSafe: jest.fn(() => ({
    hgetall: mockHgetall,
    hset: mockHset,
    sadd: mockSadd
  })),
  getDateStringInTimezone: jest.fn(() => '2026-07-10')
}))

jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({}))
jest.mock('../config/config', () => ({
  security: { encryptionKey: '12345678901234567890123456789012' }
}))
jest.mock('uuid', () => ({ v4: jest.fn(() => 'responses-1') }))

const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')

describe('OpenAIResponsesAccountService 模型重定向', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('创建账户时将模型映射序列化到 Redis', async () => {
    await openaiResponsesAccountService.createAccount({
      baseApi: 'https://api.example.com',
      apiKey: 'secret',
      supportedModels: { 'gpt-5': 'upstream-gpt-5' }
    })

    expect(mockHset).toHaveBeenCalledWith(
      'openai_responses_account:responses-1',
      expect.objectContaining({
        supportedModels: JSON.stringify({ 'gpt-5': 'upstream-gpt-5' })
      })
    )
  })

  it('读取账户时解析模型映射并支持大小写不敏感匹配', async () => {
    mockHgetall.mockResolvedValue({
      id: 'responses-1',
      apiKey: '',
      supportedModels: JSON.stringify({ 'GPT-5': 'upstream-gpt-5' })
    })

    const account = await openaiResponsesAccountService.getAccount('responses-1')

    expect(account.supportedModels).toEqual({ 'GPT-5': 'upstream-gpt-5' })
    expect(openaiResponsesAccountService.isModelSupported(account.supportedModels, 'gpt-5')).toBe(
      true
    )
    expect(openaiResponsesAccountService.getMappedModel(account.supportedModels, 'gpt-5')).toBe(
      'upstream-gpt-5'
    )
  })
})
