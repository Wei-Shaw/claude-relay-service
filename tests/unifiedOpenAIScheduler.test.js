jest.mock('../src/services/account/openaiAccountService', () => ({
  getAllAccounts: jest.fn(),
  setAccountRateLimited: jest.fn()
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  checkAndClearRateLimit: jest.fn(),
  getAllAccounts: jest.fn(),
  getAccount: jest.fn(),
  isModelSupported: jest.fn((mapping, requestedModel) => {
    if (!mapping || Object.keys(mapping).length === 0) return true
    return Object.keys(mapping).some(
      (model) => model.toLowerCase() === requestedModel.toLowerCase()
    )
  }),
  isSubscriptionExpired: jest.fn(() => false),
  markAccountRateLimited: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}))
jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn((value) => value !== false && value !== 'false'),
  sortAccountsByPriority: jest.fn((accounts) => accounts)
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  isTempUnavailable: jest.fn(() => false)
}))

const openaiAccountService = require('../src/services/account/openaiAccountService')
const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const unifiedOpenAIScheduler = require('../src/services/scheduler/unifiedOpenAIScheduler')

describe('UnifiedOpenAIScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('markAccountRateLimited', () => {
    it('does not disable scheduling again when OpenAI-Responses auto protection is disabled', async () => {
      openaiResponsesAccountService.getAccount.mockResolvedValue({
        id: 'account-1',
        disableAutoProtection: 'true'
      })

      await unifiedOpenAIScheduler.markAccountRateLimited(
        'account-1',
        'openai-responses',
        null,
        120
      )

      expect(openaiResponsesAccountService.markAccountRateLimited).toHaveBeenCalledWith(
        'account-1',
        2
      )
      expect(openaiResponsesAccountService.updateAccount).not.toHaveBeenCalled()
    })

    it('keeps disabling scheduling for protected OpenAI-Responses accounts', async () => {
      openaiResponsesAccountService.getAccount.mockResolvedValue({
        id: 'account-1',
        disableAutoProtection: 'false'
      })

      await unifiedOpenAIScheduler.markAccountRateLimited(
        'account-1',
        'openai-responses',
        null,
        120
      )

      expect(openaiResponsesAccountService.updateAccount).toHaveBeenCalledWith(
        'account-1',
        expect.objectContaining({
          schedulable: 'false'
        })
      )
    })
  })

  describe('OpenAI-Responses 模型重定向调度', () => {
    it('仅选择包含客户端请求模型映射的账户', async () => {
      openaiAccountService.getAllAccounts.mockResolvedValue([])
      openaiResponsesAccountService.getAllAccounts.mockResolvedValue([
        {
          id: 'responses-gpt-4',
          name: 'GPT-4 only',
          isActive: true,
          schedulable: true,
          status: 'active',
          accountType: 'shared',
          supportedModels: { 'gpt-4.1': 'upstream-gpt-4.1' }
        },
        {
          id: 'responses-gpt-5',
          name: 'GPT-5',
          isActive: true,
          schedulable: true,
          status: 'active',
          accountType: 'shared',
          supportedModels: { 'gpt-5-2025-08-07': 'upstream-gpt-5' }
        }
      ])

      const accounts = await unifiedOpenAIScheduler._getAllAvailableAccounts({}, 'gpt-5-2025-08-07')

      expect(accounts).toHaveLength(1)
      expect(accounts[0]).toEqual(expect.objectContaining({ accountId: 'responses-gpt-5' }))
    })

    it('仍按规范化后的模型检查 OpenAI OAuth 账户', () => {
      expect(
        unifiedOpenAIScheduler._isModelSupportedByAccount(
          { supportedModels: ['gpt-5'] },
          'openai',
          'gpt-5-2025-08-07'
        )
      ).toBe(true)
    })
  })
})
