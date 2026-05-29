jest.mock('../src/models/postgres', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}))

const postgres = require('../src/models/postgres')
const usagePostgresStore = require('../src/services/usageStores/postgresUsageStore')

describe('postgresUsageStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    postgres.query.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  test('upsertUsageEvent inserts event and increments rollups in one transaction', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ event_id: 'req_1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 16 })
    }
    postgres.transaction.mockImplementation(async (callback) => callback(client))

    const result = await usagePostgresStore.upsertUsageEvent({
      requestId: 'req_1',
      timestamp: '2026-05-28T03:00:00.000Z',
      apiKeyId: 'key_1',
      apiKeyName: 'dev key',
      model: 'us.anthropic.claude-sonnet-4-v1:0',
      inputTokens: 10,
      outputTokens: 2,
      cacheCreateTokens: 3,
      cacheReadTokens: 4,
      ephemeral5mTokens: 1,
      totalTokens: 19,
      cost: 0.12,
      realCost: 0.1,
      costBreakdown: { total: 0.1 }
    })

    expect(result).toEqual({ inserted: 1, skipped: 0 })
    expect(postgres.transaction).toHaveBeenCalledTimes(1)
    expect(client.query).toHaveBeenCalledTimes(2)
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO usage_events')
    expect(client.query.mock.calls[0][0]).toContain('VALUES ($1, $2, $3')
    expect(client.query.mock.calls[0][1][0]).toBe('req_1')
    expect(client.query.mock.calls[0][1][8]).toBe('claude-sonnet-4')
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO usage_rollups')
    expect(client.query.mock.calls[1][0]).toContain('VALUES ($1, $2, $3')
    expect(client.query.mock.calls[1][0]).toContain('DO UPDATE SET')
  })

  test('upsertUsageEvent skips rollup increments for duplicate event', async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 })
    }
    postgres.transaction.mockImplementation(async (callback) => callback(client))

    const result = await usagePostgresStore.upsertUsageEvent({
      requestId: 'req_duplicate',
      timestamp: '2026-05-28T03:00:00.000Z',
      apiKeyId: 'key_1',
      model: 'glm-5.1',
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3
    })

    expect(result).toEqual({ inserted: 0, skipped: 1 })
    expect(client.query).toHaveBeenCalledTimes(1)
  })

  test('upsertRollupRows stores Redis baseline rows idempotently by source type', async () => {
    postgres.query.mockResolvedValueOnce({ rows: [], rowCount: 1 })

    const result = await usagePostgresStore.upsertRollupRows(
      [
        {
          periodType: 'day',
          periodStart: '2026-05-28T00:00:00.000Z',
          dimensionType: 'api_key',
          apiKeyId: 'key_1',
          requestCount: 2,
          totalTokens: 30,
          cost: 0.12
        }
      ],
      { sourceType: 'redis_baseline' }
    )

    expect(result).toEqual({ upserted: 1 })
    expect(postgres.query.mock.calls[0][0]).toContain('INSERT INTO usage_rollups')
    expect(postgres.query.mock.calls[0][0]).toContain(
      'ON CONFLICT (source_type, period_type, period_start, dimension_type, api_key_id, model)'
    )
    expect(postgres.query.mock.calls[0][1][0]).toBe('redis_baseline')
  })
})
