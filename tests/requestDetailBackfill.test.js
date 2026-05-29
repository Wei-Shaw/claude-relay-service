jest.mock('../src/models/redis', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  getClient: jest.fn()
}))

jest.mock('../src/models/postgres', () => ({
  close: jest.fn()
}))

jest.mock('../src/services/requestDetailStores/postgresRequestDetailStore', () => ({
  ensureSchema: jest.fn(),
  upsertRequestDetails: jest.fn()
}))

const redis = require('../src/models/redis')
const requestDetailPostgresStore = require('../src/services/requestDetailStores/postgresRequestDetailStore')
const { backfill, parseRedisRecord } = require('../scripts/backfill-request-details-to-postgres')

describe('request detail Redis to PostgreSQL backfill', () => {
  let consoleLogSpy
  let consoleWarnSpy

  beforeEach(() => {
    jest.clearAllMocks()
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  test('parseRedisRecord restores missing timestamp from index pointer', () => {
    const parsed = parseRedisRecord(
      JSON.stringify({
        model: 'gpt-5.4',
        timestamp: 'bad-date'
      }),
      {
        requestId: 'req_restore',
        timestampMs: Date.parse('2026-04-07T12:00:00.000Z')
      }
    )

    expect(parsed.record).toEqual({
      requestId: 'req_restore',
      model: 'gpt-5.4',
      timestamp: '2026-04-07T12:00:00.000Z'
    })
  })

  test('dry run reports duplicates, missing item keys, and bad JSON without PG writes', async () => {
    const client = {
      zrangebyscore: jest
        .fn()
        .mockResolvedValueOnce([
          'req_1',
          '1775563200000',
          'req_1',
          '1775563200000',
          'req_missing',
          '1775566800000',
          'req_bad',
          '1775570400000'
        ]),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_1',
          timestamp: '2026-04-07T12:00:00.000Z',
          model: 'gpt-5.4'
        }),
        null,
        '{bad-json'
      ])
    }
    redis.getClient.mockReturnValue(client)

    const stats = await backfill({
      dryRun: true,
      skipSchema: true,
      batchSize: 10,
      startDate: new Date('2026-04-07T00:00:00.000Z'),
      endDate: new Date('2026-04-07T23:59:59.000Z')
    })

    expect(stats).toEqual({
      scannedPointers: 4,
      duplicatePointers: 1,
      uniquePointers: 3,
      missingItems: 1,
      badJson: 1,
      recordsReady: 1,
      upserted: 0,
      pgErrors: 0,
      pgErrorSamples: []
    })
    expect(requestDetailPostgresStore.upsertRequestDetails).not.toHaveBeenCalled()
  })

  test('non-dry backfill ensures schema and uses idempotent PG upsert reruns', async () => {
    const client = {
      zrangebyscore: jest.fn().mockResolvedValue(['req_1', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_1',
          timestamp: '2026-04-07T12:00:00.000Z',
          model: 'gpt-5.4'
        })
      ])
    }
    redis.getClient.mockReturnValue(client)
    requestDetailPostgresStore.upsertRequestDetails.mockResolvedValue({ upserted: 1 })

    const options = {
      dryRun: false,
      skipSchema: false,
      batchSize: 10,
      startDate: new Date('2026-04-07T00:00:00.000Z'),
      endDate: new Date('2026-04-07T23:59:59.000Z')
    }
    const firstRun = await backfill(options)
    const secondRun = await backfill(options)

    expect(firstRun.upserted).toBe(1)
    expect(secondRun.upserted).toBe(1)
    expect(requestDetailPostgresStore.ensureSchema).toHaveBeenCalledTimes(2)
    expect(requestDetailPostgresStore.upsertRequestDetails).toHaveBeenCalledTimes(2)
    expect(requestDetailPostgresStore.upsertRequestDetails).toHaveBeenLastCalledWith([
      {
        requestId: 'req_1',
        timestamp: '2026-04-07T12:00:00.000Z',
        model: 'gpt-5.4'
      }
    ])
  })

  test('backfill splits failed PG batches and skips only bad records', async () => {
    const client = {
      zrangebyscore: jest
        .fn()
        .mockResolvedValue(['req_good', '1775563200000', 'req_bad_pg', '1775566800000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_good',
          timestamp: '2026-04-07T12:00:00.000Z',
          model: 'gpt-5.4'
        }),
        JSON.stringify({
          requestId: 'req_bad_pg',
          timestamp: '2026-04-07T13:00:00.000Z',
          model: 'bad'
        })
      ])
    }
    redis.getClient.mockReturnValue(client)
    requestDetailPostgresStore.upsertRequestDetails.mockImplementation(async (records) => {
      if (records.some((record) => record.requestId === 'req_bad_pg')) {
        throw new Error('invalid input syntax for type json')
      }
      return { upserted: records.length }
    })

    const stats = await backfill({
      dryRun: false,
      skipSchema: true,
      batchSize: 10,
      startDate: new Date('2026-04-07T00:00:00.000Z'),
      endDate: new Date('2026-04-07T23:59:59.000Z')
    })

    expect(stats.upserted).toBe(1)
    expect(stats.pgErrors).toBe(1)
    expect(stats.pgErrorSamples).toEqual([
      {
        requestId: 'req_bad_pg',
        message: 'invalid input syntax for type json'
      }
    ])
  })
})
