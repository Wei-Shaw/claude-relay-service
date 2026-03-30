jest.mock('../src/utils/upstreamErrorHelper', () => ({
  markTempUnavailable: jest.fn().mockResolvedValue({ success: true })
}))

const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')
const {
  isQuotaExceededError,
  applyQuotaExceededCooldown,
  DEFAULT_QUOTA_EXCEEDED_COOLDOWN_SECONDS
} = require('../src/utils/quotaExceededHelper')

describe('quotaExceededHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('detects OpenAI insufficient_quota payloads', () => {
    expect(
      isQuotaExceededError(429, {
        error: {
          code: 'insufficient_quota',
          message: 'You exceeded your current quota, please check your plan and billing details.'
        }
      })
    ).toBe(true)
  })

  it('detects plain string quota exceeded payloads', () => {
    expect(isQuotaExceededError(403, 'quota exceeded for this account')).toBe(true)
  })

  it('detects balance-disabled and no-plan style chinese payloads', () => {
    expect(isQuotaExceededError(403, 'API Key 不允许使用余额且无可用套餐')).toBe(true)
    expect(isQuotaExceededError(403, '当前无可用套餐，且该 API Key 不允许使用余额')).toBe(true)
  })

  it('applies a two-hour cooldown and clears sticky mapping when quota is exceeded', async () => {
    const clearSessionMapping = jest.fn().mockResolvedValue(undefined)

    const result = await applyQuotaExceededCooldown({
      accountId: 'acc_1',
      accountType: 'openai',
      statusCode: 429,
      payload: {
        error: {
          type: 'insufficient_quota',
          message: 'billing_hard_limit_reached'
        }
      },
      sessionHash: 'session_hash',
      clearSessionMapping
    })

    expect(result).toEqual({
      applied: true,
      cooldownSeconds: DEFAULT_QUOTA_EXCEEDED_COOLDOWN_SECONDS
    })
    expect(upstreamErrorHelper.markTempUnavailable).toHaveBeenCalledWith(
      'acc_1',
      'openai',
      429,
      DEFAULT_QUOTA_EXCEEDED_COOLDOWN_SECONDS,
      expect.objectContaining({
        reason: 'quota_exceeded'
      })
    )
    expect(clearSessionMapping).toHaveBeenCalledWith('session_hash')
  })

  it('does not cool down accounts for unrelated errors', async () => {
    const clearSessionMapping = jest.fn()

    const result = await applyQuotaExceededCooldown({
      accountId: 'acc_2',
      accountType: 'openai',
      statusCode: 429,
      payload: {
        error: {
          message: 'Rate limit reached, retry later.'
        }
      },
      sessionHash: 'session_hash',
      clearSessionMapping
    })

    expect(result).toEqual({ applied: false, cooldownSeconds: null })
    expect(upstreamErrorHelper.markTempUnavailable).not.toHaveBeenCalled()
    expect(clearSessionMapping).not.toHaveBeenCalled()
  })
})
