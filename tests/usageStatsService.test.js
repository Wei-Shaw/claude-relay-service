const loadService = ({ writeMode = 'redis', readMode = 'redis' } = {}) => {
  jest.resetModules()
  process.env.USAGE_WRITE_MODE = writeMode
  process.env.USAGE_READ_MODE = readMode

  const redisMock = {
    getApiKey: jest
      .fn()
      .mockResolvedValue({ id: 'key_1', name: 'dev key', createdAt: '2026-05-01T00:00:00.000Z' }),
    getUsageStats: jest.fn().mockResolvedValue({ total: { requests: 1 } }),
    getUsageRecords: jest.fn().mockResolvedValue([]),
    getDailyCost: jest.fn().mockResolvedValue(1.2),
    getCostStats: jest.fn().mockResolvedValue({ total: 2.3 }),
    getAllUsedModels: jest.fn().mockResolvedValue(['glm-5.1']),
    getKeyIdsWithModels: jest.fn().mockResolvedValue(new Set(['key_1']))
  }
  const pgStoreMock = {
    upsertUsageEvent: jest.fn().mockResolvedValue({ inserted: 1, skipped: 0 }),
    getUsageStats: jest.fn().mockResolvedValue({ total: { requests: 2 } }),
    getUsageRecords: jest
      .fn()
      .mockResolvedValue([{ requestId: 'req_1', costBreakdown: { total: 1 } }]),
    getDailyCost: jest.fn().mockResolvedValue(3.4),
    getCostStats: jest.fn().mockResolvedValue({ total: 4.5 }),
    getKeyUsageSummary: jest.fn().mockResolvedValue({ requests: 3, cost: 1.23 }),
    getModelStatsForKey: jest.fn().mockResolvedValue([]),
    getBatchModelStats: jest.fn().mockResolvedValue([]),
    getAllUsedModels: jest.fn().mockResolvedValue(['glm-5.1']),
    getKeyIdsWithModels: jest.fn().mockResolvedValue(new Set(['key_1'])),
    getBatchKeyCosts: jest.fn().mockResolvedValue(new Map([['key_1', 1.23]])),
    calculateCustomRangeCosts: jest.fn().mockResolvedValue(new Map([['key_1', 1.23]]))
  }
  const loggerMock = {
    warn: jest.fn()
  }

  jest.doMock('../src/models/redis', () => redisMock)
  jest.doMock('../src/services/usageStores/postgresUsageStore', () => pgStoreMock)
  jest.doMock('../src/utils/logger', () => loggerMock)

  return {
    service: require('../src/services/usageStatsService'),
    redisMock,
    pgStoreMock,
    loggerMock
  }
}

describe('usageStatsService', () => {
  const originalWriteMode = process.env.USAGE_WRITE_MODE
  const originalReadMode = process.env.USAGE_READ_MODE

  afterEach(() => {
    jest.dontMock('../src/models/redis')
    jest.dontMock('../src/services/usageStores/postgresUsageStore')
    jest.dontMock('../src/utils/logger')
    process.env.USAGE_WRITE_MODE = originalWriteMode
    process.env.USAGE_READ_MODE = originalReadMode
  })

  test('redis mode delegates reads to Redis', async () => {
    const { service, redisMock, pgStoreMock } = loadService()

    await expect(service.getDailyCost('key_1')).resolves.toBe(1.2)
    await expect(service.getCostStats('key_1')).resolves.toEqual({ total: 2.3 })

    expect(redisMock.getDailyCost).toHaveBeenCalledWith('key_1')
    expect(redisMock.getCostStats).toHaveBeenCalledWith('key_1')
    expect(pgStoreMock.getDailyCost).not.toHaveBeenCalled()
  })

  test('postgres read mode delegates key usage summaries to PostgreSQL store', async () => {
    const { service, redisMock, pgStoreMock } = loadService({ readMode: 'postgres' })

    const summary = await service.getKeyUsageSummary('key_1', 'custom', '2026-06-01', '2026-06-03')

    expect(summary).toEqual({ requests: 3, cost: 1.23 })
    expect(pgStoreMock.getKeyUsageSummary).toHaveBeenCalledWith(
      'key_1',
      'custom',
      '2026-06-01',
      '2026-06-03'
    )
    expect(redisMock.getUsageStats).not.toHaveBeenCalled()
  })

  test('postgres read mode delegates usage stats and records to PostgreSQL store', async () => {
    const { service, redisMock, pgStoreMock } = loadService({ readMode: 'postgres' })

    const stats = await service.getUsageStatsWithRecords('key_1', { recordLimit: 5 })

    expect(redisMock.getApiKey).toHaveBeenCalledWith('key_1')
    expect(pgStoreMock.getUsageStats).toHaveBeenCalledWith('key_1', {
      createdAt: '2026-05-01T00:00:00.000Z'
    })
    expect(pgStoreMock.getUsageRecords).toHaveBeenCalledWith('key_1', 5)
    expect(stats.total.requests).toBe(2)
    expect(stats.recentRecords[0].realCostBreakdown).toEqual({ total: 1 })
  })

  test('dual write logs PostgreSQL failures without throwing', async () => {
    const { service, pgStoreMock, loggerMock } = loadService({ writeMode: 'dual' })
    pgStoreMock.upsertUsageEvent.mockRejectedValueOnce(new Error('pg down'))

    const result = await service.recordUsageEvent(
      'key_1',
      { requestId: 'req_1' },
      { name: 'dev key' }
    )

    expect(result).toEqual({ inserted: 0, skipped: 0, error: 'pg down' })
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  test('postgres write mode propagates PostgreSQL failures', async () => {
    const { service, pgStoreMock } = loadService({ writeMode: 'postgres' })
    pgStoreMock.upsertUsageEvent.mockRejectedValueOnce(new Error('pg down'))

    await expect(
      service.recordUsageEvent('key_1', { requestId: 'req_1' }, { name: 'dev key' })
    ).rejects.toThrow('pg down')
  })
})
