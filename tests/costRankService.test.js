describe('costRankService', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('../src/models/redis')
    jest.dontMock('../src/services/usageStatsService')
  })

  test('reports PostgreSQL read mode as ready for cost sorting', async () => {
    const redisMock = {
      scanApiKeyIds: jest.fn().mockResolvedValue(['key_1', 'key_2']),
      batchGetApiKeys: jest.fn().mockResolvedValue([
        { id: 'key_1', isDeleted: false },
        { id: 'key_2', isDeleted: true }
      ])
    }
    const usageStatsServiceMock = {
      shouldReadPostgres: jest.fn(() => true)
    }

    jest.doMock('../src/models/redis', () => redisMock)
    jest.doMock('../src/services/usageStatsService', () => usageStatsServiceMock)

    const costRankService = require('../src/services/costRankService')
    const status = await costRankService.getRankStatus()

    expect(status.today).toMatchObject({
      status: 'ready',
      source: 'postgres',
      keyCount: 1,
      isQueryTimeCalculation: true
    })
    expect(status['7days'].status).toBe('ready')
  })
})
