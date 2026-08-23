// Golden 测试:在 compat 抽取(四期)之前,黑盒锁死两个 token 标准化闭包的现行行为。
//   - getUsageStats 内 handleLegacyData(redis.js:1720):API Key 维度,旧单字段按 30/70 拆 input/output
//   - getAccountUsageStats 内 handleAccountData(redis.js:2225):账户维度,不拆分
// 四期抽出 compat 纯函数后,白盒测试复用同一批 case;两套全绿 = 行为逐字节一致。

jest.mock('../../config/config', () => ({ system: { timezoneOffset: 8 } }), { virtual: true })
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const redis = require('../../src/models/redis')

// 注入桩 client:getUsageStats 取 usage:{id}(total)、daily/monthly(空)、apikey:{id}(createdAt)
const stubKeyUsage = (totalData) => {
  redis.client = {
    hgetall: jest.fn((key) => {
      if (key === 'usage:k1') {
        return Promise.resolve(totalData)
      }
      if (key === 'apikey:k1') {
        return Promise.resolve({ createdAt: '2025-01-01T00:00:00.000Z' })
      }
      return Promise.resolve({})
    })
  }
}

// 注入桩 client:getAccountUsageStats 取 account_usage:{id}(total)、daily/monthly(空)、claude:account:{id}(createdAt)
const stubAccountUsage = (totalData) => {
  redis.client = {
    hgetall: jest.fn((key) => {
      if (key === 'account_usage:a1') {
        return Promise.resolve(totalData)
      }
      if (key === 'claude:account:a1') {
        return Promise.resolve({ createdAt: '2025-01-01T00:00:00.000Z' })
      }
      return Promise.resolve({})
    })
  }
}

describe('getUsageStats / handleLegacyData golden (API Key 维度,含 30/70 拆分)', () => {
  test('旧单字段:30/70 拆分,tokens 保留原值', async () => {
    stubKeyUsage({ totalTokens: '1000', totalRequests: '10' })
    const { total } = await redis.getUsageStats('k1')
    expect(total).toEqual({
      tokens: 1000,
      inputTokens: 300,
      outputTokens: 700,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 1000,
      requests: 10
    })
  })

  test('新分离字段:走 else 分支,tokens = allTokens 合计', async () => {
    stubKeyUsage({
      totalInputTokens: '100',
      totalOutputTokens: '200',
      totalCacheReadTokens: '50',
      totalRequests: '5'
    })
    const { total } = await redis.getUsageStats('k1')
    expect(total).toEqual({
      tokens: 350,
      inputTokens: 100,
      outputTokens: 200,
      cacheCreateTokens: 0,
      cacheReadTokens: 50,
      allTokens: 350,
      requests: 5
    })
  })

  test('显式 totalAllTokens:不重算,直接采用', async () => {
    stubKeyUsage({
      totalInputTokens: '100',
      totalOutputTokens: '200',
      totalAllTokens: '999',
      totalRequests: '5'
    })
    const { total } = await redis.getUsageStats('k1')
    expect(total.allTokens).toBe(999)
    expect(total.tokens).toBe(999)
  })

  test('仅 totalTokens 的旧数据:30/70 取整', async () => {
    stubKeyUsage({ totalTokens: '500' })
    const { total } = await redis.getUsageStats('k1')
    expect(total.inputTokens).toBe(150)
    expect(total.outputTokens).toBe(350)
    expect(total.allTokens).toBe(500)
  })

  test('空数据:全 0,不触发拆分', async () => {
    stubKeyUsage({})
    const { total } = await redis.getUsageStats('k1')
    expect(total).toEqual({
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0,
      requests: 0
    })
  })
})

describe('getAccountUsageStats / handleAccountData golden (账户维度,无拆分)', () => {
  beforeEach(() => {
    redis.getAccountDailyCost = jest.fn(() => Promise.resolve(0))
  })

  test('旧单字段:不拆分,input/output 保持 0,tokens 保留原值,allTokens 按合计(此处 0)', async () => {
    stubAccountUsage({ totalTokens: '1000', totalRequests: '10' })
    const { total } = await redis.getAccountUsageStats('a1')
    expect(total).toEqual({
      tokens: 1000,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0,
      requests: 10
    })
  })

  test('新分离字段:allTokens = 合计,tokens 取原始 totalTokens(此处 0)', async () => {
    stubAccountUsage({
      totalInputTokens: '100',
      totalOutputTokens: '200',
      totalCacheReadTokens: '50',
      totalRequests: '5'
    })
    const { total } = await redis.getAccountUsageStats('a1')
    expect(total).toEqual({
      tokens: 0,
      inputTokens: 100,
      outputTokens: 200,
      cacheCreateTokens: 0,
      cacheReadTokens: 50,
      allTokens: 350,
      requests: 5
    })
  })

  test('显式 totalAllTokens:直接采用', async () => {
    stubAccountUsage({
      totalInputTokens: '100',
      totalOutputTokens: '200',
      totalAllTokens: '999'
    })
    const { total } = await redis.getAccountUsageStats('a1')
    expect(total.allTokens).toBe(999)
  })

  test('空数据:全 0', async () => {
    stubAccountUsage({})
    const { total } = await redis.getAccountUsageStats('a1')
    expect(total).toEqual({
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0,
      requests: 0
    })
  })
})

describe('两个 handle 在旧单字段下输出不同(防四期误合并的安全网)', () => {
  beforeEach(() => {
    redis.getAccountDailyCost = jest.fn(() => Promise.resolve(0))
  })

  test('同样 {totalTokens:1000}:Key 版拆 30/70 且 allTokens=1000,账户版不拆且 allTokens=0', async () => {
    const input = { totalTokens: '1000', totalRequests: '10' }
    stubKeyUsage(input)
    const keyResult = await redis.getUsageStats('k1')
    stubAccountUsage(input)
    const accResult = await redis.getAccountUsageStats('a1')

    expect(keyResult.total.inputTokens).toBe(300)
    expect(accResult.total.inputTokens).toBe(0)
    expect(keyResult.total.allTokens).toBe(1000)
    expect(accResult.total.allTokens).toBe(0)
    expect(keyResult.total).not.toEqual(accResult.total)
  })
})
