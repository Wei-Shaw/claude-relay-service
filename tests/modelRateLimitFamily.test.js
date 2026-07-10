const { getRateLimitModelFamily, RATE_LIMITED_MODEL_FAMILIES } = require('../src/utils/modelHelper')

describe('getRateLimitModelFamily', () => {
  it('maps each Claude model to its independent rate-limit family', () => {
    expect(getRateLimitModelFamily('claude-opus-4-8')).toBe('opus')
    expect(getRateLimitModelFamily('claude-sonnet-4-5')).toBe('sonnet')
    expect(getRateLimitModelFamily('claude-sonnet-4-6')).toBe('sonnet')
    expect(getRateLimitModelFamily('claude-fable-5')).toBe('fable')
    expect(getRateLimitModelFamily('claude-fable-5-mythos-5')).toBe('fable')
    expect(getRateLimitModelFamily('claude-3-5-haiku-20241022')).toBe('haiku')
  })

  it('strips vendor prefixes before matching', () => {
    expect(getRateLimitModelFamily('ccr,claude-sonnet-4-5')).toBe('sonnet')
  })

  it('returns null for unknown or invalid models', () => {
    expect(getRateLimitModelFamily('deepseek-chat')).toBeNull()
    expect(getRateLimitModelFamily('')).toBeNull()
    expect(getRateLimitModelFamily(null)).toBeNull()
    expect(getRateLimitModelFamily(undefined)).toBeNull()
    expect(getRateLimitModelFamily(123)).toBeNull()
  })

  it('exposes the family list used for per-model rate-limit buckets', () => {
    expect(RATE_LIMITED_MODEL_FAMILIES).toEqual(['opus', 'sonnet', 'haiku', 'fable'])
  })
})
