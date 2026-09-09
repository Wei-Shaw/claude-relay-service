jest.mock(
  '../config/config',
  () => ({
    system: { timezoneOffset: 8 }
  }),
  { virtual: true }
)
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const redis = require('../src/models/redis')

describe('Redis Bedrock usage stats', () => {
  test('loads Bedrock creation time from its JSON account key', async () => {
    const originalClient = redis.client
    const originalDailyCost = redis.getAccountDailyCost
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const client = {
      hgetall: jest.fn(async (key) => {
        if (key === 'account_usage:bedrock-1') {
          return { totalTokens: '1000', totalRequests: '100' }
        }
        return {}
      }),
      get: jest.fn(async (key) =>
        key === 'bedrock_account:bedrock-1' ? JSON.stringify({ createdAt }) : null
      )
    }
    redis.client = client
    redis.getAccountDailyCost = jest.fn().mockResolvedValue(0)

    try {
      const result = await redis.getAccountUsageStats('bedrock-1', 'bedrock')

      expect(client.get).toHaveBeenCalledWith('bedrock_account:bedrock-1')
      expect(result.total.requests).toBe(100)
      expect(result.averages.dailyRequests).toBeLessThan(100)
    } finally {
      redis.client = originalClient
      redis.getAccountDailyCost = originalDailyCost
    }
  })
})
