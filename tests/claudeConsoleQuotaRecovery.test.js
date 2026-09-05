const ACCOUNT_ID = 'console-quota-1'
const ACCOUNT_KEY = `claude_console_account:${ACCOUNT_ID}`

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

jest.mock('../config/config', () => ({}), { virtual: true })

jest.mock('../src/utils/webhookNotifier', () => ({
  sendAccountAnomalyNotification: jest.fn(async () => undefined)
}))

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => mockClient),
  getAccountUsageStats: jest.fn(async () => ({ daily: { cost: 0 } })),
  getConsoleAccountConcurrency: jest.fn(async () => 0),
  getDateStringInTimezone: jest.fn(() => '2026-09-04'),
  getDateInTimezone: jest.fn(() => new Date(Date.UTC(2026, 8, 4, 10, 30, 0)))
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
    jest.setSystemTime(new Date('2026-09-04T10:30:00.000Z'))
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

    // 进入第二天：上次重置日期为昨天，当前时间已过 00:00 重置点
    store.get(ACCOUNT_KEY).lastResetDate = '2026-09-04'
    redis.getDateStringInTimezone.mockReturnValue('2026-09-05')
    redis.getDateInTimezone.mockReturnValue(new Date(Date.UTC(2026, 8, 5, 10, 30, 0)))

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
})
