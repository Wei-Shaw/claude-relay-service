/**
 * UnifiedClaudeScheduler - 1M context PRO account restriction tests
 *
 * PRO accounts do not support 1M context models.
 * 1M context is detected via the "context-1m" flag in the anthropic-beta header.
 * When a sticky session is bound to a Pro account, 1M requests bypass it
 * without deleting the mapping, so non-1M requests continue using Pro.
 */

jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  database: jest.fn(),
  security: jest.fn()
}))

jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({}))
jest.mock('../src/services/account/bedrockAccountService', () => ({}))
jest.mock('../src/services/account/ccrAccountService', () => ({}))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))
jest.mock('../src/utils/modelHelper', () => ({
  parseVendorPrefixedModel: jest.fn((m) => ({ vendor: null, baseModel: m })),
  isOpus45OrNewer: jest.fn(() => true)
}))
jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn(() => true),
  sortAccountsByPriority: jest.fn((a) => a)
}))

describe('UnifiedClaudeScheduler - 1M context restrictions', () => {
  let scheduler

  beforeEach(() => {
    jest.clearAllMocks()
    scheduler = require('../src/services/scheduler/unifiedClaudeScheduler')
  })

  // --- _is1mContextRequest ---

  describe('_is1mContextRequest', () => {
    it('should return true when beta header contains context-1m', () => {
      expect(
        scheduler._is1mContextRequest(
          'claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14'
        )
      ).toBe(true)
    })

    it('should return false when beta header has no context-1m', () => {
      expect(
        scheduler._is1mContextRequest(
          'claude-code-20250219,interleaved-thinking-2025-05-14,redact-thinking-2026-02-12'
        )
      ).toBe(false)
    })

    it('should return false for empty/null/undefined', () => {
      expect(scheduler._is1mContextRequest('')).toBe(false)
      expect(scheduler._is1mContextRequest(null)).toBe(false)
      expect(scheduler._is1mContextRequest(undefined)).toBe(false)
    })
  })

  // --- _isModelSupportedByAccount with 1M context ---

  describe('_isModelSupportedByAccount - 1M context check', () => {
    const beta1m = 'claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14'
    const betaDefault =
      'claude-code-20250219,interleaved-thinking-2025-05-14,redact-thinking-2026-02-12'

    const proAccount = {
      name: 'pro-account-1',
      subscriptionInfo: JSON.stringify({
        hasClaudePro: true,
        hasClaudeMax: false,
        accountType: 'claude_pro'
      })
    }

    const maxAccount = {
      name: 'max-account-1',
      subscriptionInfo: JSON.stringify({
        hasClaudePro: false,
        hasClaudeMax: true,
        accountType: 'claude_max'
      })
    }

    const noSubInfoAccount = { name: 'legacy-account-1' }

    it('should reject PRO account for opus with 1M context', () => {
      expect(
        scheduler._isModelSupportedByAccount(proAccount, 'claude-official', 'claude-opus-4-6', '', beta1m)
      ).toBe(false)
    })

    it('should reject PRO account for sonnet with 1M context', () => {
      expect(
        scheduler._isModelSupportedByAccount(
          proAccount,
          'claude-official',
          'claude-sonnet-4-6',
          '',
          beta1m
        )
      ).toBe(false)
    })

    it('should allow PRO account without 1M context', () => {
      expect(
        scheduler._isModelSupportedByAccount(
          proAccount,
          'claude-official',
          'claude-sonnet-4-6',
          '',
          betaDefault
        )
      ).toBe(true)
    })

    it('should allow PRO account with empty beta header', () => {
      expect(
        scheduler._isModelSupportedByAccount(proAccount, 'claude-official', 'claude-sonnet-4-6', '', '')
      ).toBe(true)
    })

    it('should allow Max account with 1M context', () => {
      expect(
        scheduler._isModelSupportedByAccount(maxAccount, 'claude-official', 'claude-opus-4-6', '', beta1m)
      ).toBe(true)
    })

    it('should allow account without subscriptionInfo (legacy compatibility)', () => {
      expect(
        scheduler._isModelSupportedByAccount(
          noSubInfoAccount,
          'claude-official',
          'claude-opus-4-6',
          '',
          beta1m
        )
      ).toBe(true)
    })

    it('should not affect non-claude-official account types', () => {
      expect(
        scheduler._isModelSupportedByAccount(proAccount, 'claude-console', 'claude-opus-4-6', '', beta1m)
      ).toBe(true)
    })

    it('should include context string in log message', () => {
      const logger = require('../src/utils/logger')
      scheduler._isModelSupportedByAccount(
        proAccount,
        'claude-official',
        'claude-opus-4-6',
        'in session check',
        beta1m
      )
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('does not support 1M context model')
      )
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('in session check'))
    })
  })
})
