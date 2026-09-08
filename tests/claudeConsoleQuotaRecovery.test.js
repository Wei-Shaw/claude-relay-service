const ACCOUNT_ID = 'console-quota-1'
const ACCOUNT_KEY = `claude_console_account:${ACCOUNT_ID}`

// 测试统一使用 UTC+8 时区
const TZ_OFFSET_HOURS = 8
const TZ_OFFSET_MS = TZ_OFFSET_HOURS * 3600000

// 忠实复现 src/models/redis.js 的时区语义：
// getDateInTimezone(d) 返回 d + offset 小时；
// getDateStringInTimezone(d) 内部会再调用一次 getDateInTimezone(d)。
// 如果调用方把已经偏移过的时间再传给 getDateStringInTimezone，就会叠加两次偏移。
const tzDate = (date = new Date()) => new Date(date.getTime() + TZ_OFFSET_MS)
const tzDateString = (date = new Date()) => {
  const d = tzDate(date)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`
}

// 把 "UTC+8 的墙上时间" 换算成真实的 UTC 时间点，方便用 +8 语义描述用例
const tz8 = (year, month, day, hour = 0, minute = 0, second = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute, second) - TZ_OFFSET_MS)

// 内存 hash 存储，供 redis mock 使用
const store = new Map()

const getHash = (key) => {
  if (!store.has(key)) {
    store.set(key, {})
  }
  return store.get(key)
}

const mockClient = {
  hset: jest.fn(async (key, data) => {
    const hash = getHash(key)
    for (const [field, value] of Object.entries(data)) {
      hash[field] = value === null || value === undefined ? '' : String(value)
    }
    return Object.keys(data).length
  }),
  hget: jest.fn(async (key, field) => {
    const hash = store.get(key)
    return hash && hash[field] !== undefined ? hash[field] : null
  }),
  hmget: jest.fn(async (key, ...fields) => {
    const hash = store.get(key) || {}
    return fields.flat().map((field) => (hash[field] !== undefined ? hash[field] : null))
  }),
  hgetall: jest.fn(async (key) => ({ ...(store.get(key) || {}) })),
  sadd: jest.fn(async () => 1),
  srem: jest.fn(async () => 1),
  expire: jest.fn(async () => 1),
  del: jest.fn(async (key) => (store.delete(key) ? 1 : 0))
}

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))

jest.mock('../config/config', () => ({ system: { timezoneOffset: 8 } }), { virtual: true })

jest.mock('../src/utils/webhookNotifier', () => ({
  sendAccountAnomalyNotification: jest.fn(async () => undefined)
}))

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => mockClient),
  getAccountUsageStats: jest.fn(async () => ({ daily: { cost: 0 } })),
  getConsoleAccountConcurrency: jest.fn(async () => 0),
  getDateStringInTimezone: jest.fn((date) => tzDateString(date)),
  getDateInTimezone: jest.fn((date) => tzDate(date))
}))

describe('Claude Console daily quota auto stop / auto recovery', () => {
  let service
  let redis

  const seedAccount = (overrides = {}) => {
    store.set(ACCOUNT_KEY, {
      id: ACCOUNT_ID,
      name: 'Console Quota Account',
      apiUrl: 'https://console.example.com',
      apiKey: '',
      priority: '50',
      supportedModels: '[]',
      userAgent: '',
      rateLimitDuration: '60',
      proxy: '',
      isActive: 'true',
      accountType: 'shared',
      status: 'active',
      errorMessage: '',
      schedulable: 'true',
      dailyQuota: '10',
      dailyUsage: '0',
      quotaResetTime: '00:00',
      lastResetDate: '2026-09-04',
      quotaStoppedAt: '',
      quotaAutoStopped: '',
      rateLimitAutoStopped: '',
      maxConcurrentTasks: '0',
      ...overrides
    })
  }

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    // 2026-09-04 18:30 (UTC+8)
    jest.setSystemTime(tz8(2026, 9, 4, 18, 30))
    store.clear()
    seedAccount()
    redis = require('../src/models/redis')
    service = require('../src/services/account/claudeConsoleAccountService')
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('persists quotaAutoStopped marker when the daily quota is exceeded', async () => {
    redis.getAccountUsageStats.mockResolvedValue({ daily: { cost: 12 } })

    await service.checkQuotaUsage(ACCOUNT_ID)

    const saved = store.get(ACCOUNT_KEY)
    expect(saved.schedulable).toBe('false')
    expect(saved.quotaAutoStopped).toBe('true')
    expect(saved.quotaStoppedAt).toBeTruthy()
  })

  it('restores scheduling on the next day after the quota reset time', async () => {
    redis.getAccountUsageStats.mockResolvedValue({ daily: { cost: 12 } })
    await service.checkQuotaUsage(ACCOUNT_ID)
    expect(store.get(ACCOUNT_KEY).schedulable).toBe('false')

    // 进入第二天 10:00 (UTC+8)：上次重置日期为昨天，已跨过 00:00 重置点
    jest.setSystemTime(tz8(2026, 9, 5, 10, 0))

    const exceeded = await service.isAccountQuotaExceeded(ACCOUNT_ID)

    const saved = store.get(ACCOUNT_KEY)
    expect(exceeded).toBe(false)
    expect(saved.schedulable).toBe('true')
    expect(saved.quotaStoppedAt).toBe('')
    expect(saved.quotaAutoStopped).toBe('')
    expect(saved.lastResetDate).toBe('2026-09-05')
  })

  it('still clears auto stop markers when scheduling is toggled manually', async () => {
    seedAccount({
      schedulable: 'false',
      quotaAutoStopped: 'true',
      rateLimitAutoStopped: 'true',
      quotaStoppedAt: '2026-09-04T09:00:00.000Z'
    })

    await service.updateAccount(ACCOUNT_ID, { schedulable: false })

    const saved = store.get(ACCOUNT_KEY)
    expect(saved.schedulable).toBe('false')
    expect(saved.quotaAutoStopped).toBe('')
    expect(saved.rateLimitAutoStopped).toBe('')
  })

  it('does not reset in the evening right after being stopped (double timezone offset regression)', async () => {
    // 今天 19:00 (UTC+8) 超额停用
    jest.setSystemTime(tz8(2026, 9, 4, 19, 0))
    seedAccount({
      schedulable: 'false',
      quotaAutoStopped: 'true',
      quotaStoppedAt: tz8(2026, 9, 4, 19, 0).toISOString(),
      lastResetDate: '2026-09-04'
    })

    // 5 秒后调度器再次检查
    jest.setSystemTime(tz8(2026, 9, 4, 19, 0, 5))

    const exceeded = await service.isAccountQuotaExceeded(ACCOUNT_ID)

    const saved = store.get(ACCOUNT_KEY)
    expect(exceeded).toBe(true)
    expect(saved.schedulable).toBe('false')
    expect(saved.quotaStoppedAt).toBe(tz8(2026, 9, 4, 19, 0).toISOString())
  })

  it('does not reset when lastResetDate is stale but the reset point predates the stop', async () => {
    // lastResetDate 是 5 天前（账户从未重置过），今天 10:00 (UTC+8) 停用
    jest.setSystemTime(tz8(2026, 9, 4, 10, 0))
    seedAccount({
      schedulable: 'false',
      quotaAutoStopped: 'true',
      quotaStoppedAt: tz8(2026, 9, 4, 10, 0).toISOString(),
      lastResetDate: '2026-08-30'
    })

    jest.setSystemTime(tz8(2026, 9, 4, 10, 3))

    const exceeded = await service.isAccountQuotaExceeded(ACCOUNT_ID)

    const saved = store.get(ACCOUNT_KEY)
    expect(exceeded).toBe(true)
    expect(saved.schedulable).toBe('false')
    expect(saved.quotaAutoStopped).toBe('true')
  })

  it('restores after crossing the 00:00 reset point', async () => {
    // 昨天 23:00 (UTC+8) 停用，今天 00:10 检查
    seedAccount({
      schedulable: 'false',
      quotaAutoStopped: 'true',
      quotaStoppedAt: tz8(2026, 9, 4, 23, 0).toISOString(),
      lastResetDate: '2026-09-04'
    })
    jest.setSystemTime(tz8(2026, 9, 5, 0, 10))

    const exceeded = await service.isAccountQuotaExceeded(ACCOUNT_ID)

    const saved = store.get(ACCOUNT_KEY)
    expect(exceeded).toBe(false)
    expect(saved.schedulable).toBe('true')
    expect(saved.quotaStoppedAt).toBe('')
    expect(saved.quotaAutoStopped).toBe('')
    expect(saved.lastResetDate).toBe('2026-09-05')
  })

  describe('custom quota reset time 08:00', () => {
    it('restores when stopped at 07:00 and checked at 09:00', async () => {
      seedAccount({
        schedulable: 'false',
        quotaAutoStopped: 'true',
        quotaResetTime: '08:00',
        quotaStoppedAt: tz8(2026, 9, 4, 7, 0).toISOString(),
        lastResetDate: '2026-09-03'
      })
      jest.setSystemTime(tz8(2026, 9, 4, 9, 0))

      const exceeded = await service.isAccountQuotaExceeded(ACCOUNT_ID)

      const saved = store.get(ACCOUNT_KEY)
      expect(exceeded).toBe(false)
      expect(saved.schedulable).toBe('true')
      expect(saved.quotaStoppedAt).toBe('')
      expect(saved.lastResetDate).toBe('2026-09-04')
    })

    it('does not restore when stopped at 09:00 and checked at 10:00', async () => {
      seedAccount({
        schedulable: 'false',
        quotaAutoStopped: 'true',
        quotaResetTime: '08:00',
        quotaStoppedAt: tz8(2026, 9, 4, 9, 0).toISOString(),
        lastResetDate: '2026-09-03'
      })
      jest.setSystemTime(tz8(2026, 9, 4, 10, 0))

      const exceeded = await service.isAccountQuotaExceeded(ACCOUNT_ID)

      const saved = store.get(ACCOUNT_KEY)
      expect(exceeded).toBe(true)
      expect(saved.schedulable).toBe('false')
      expect(saved.quotaAutoStopped).toBe('true')
    })

    it('restores when stopped at 09:00 and checked at 08:05 the next day', async () => {
      seedAccount({
        schedulable: 'false',
        quotaAutoStopped: 'true',
        quotaResetTime: '08:00',
        quotaStoppedAt: tz8(2026, 9, 4, 9, 0).toISOString(),
        lastResetDate: '2026-09-04'
      })
      jest.setSystemTime(tz8(2026, 9, 5, 8, 5))

      const exceeded = await service.isAccountQuotaExceeded(ACCOUNT_ID)

      const saved = store.get(ACCOUNT_KEY)
      expect(exceeded).toBe(false)
      expect(saved.schedulable).toBe('true')
      expect(saved.quotaStoppedAt).toBe('')
      expect(saved.lastResetDate).toBe('2026-09-05')
    })
  })
})
