const describeIntegration =
  process.env.RUN_PG_INTEGRATION === '1' && process.env.RUN_PG_INTEGRATION_PURGE === '1'
    ? describe
    : describe.skip

const postgres = require('../src/models/postgres')
const requestDetailPostgresStore = require('../src/services/requestDetailStores/postgresRequestDetailStore')

describeIntegration('request detail PostgreSQL store integration', () => {
  const requestId = `req_pg_smoke_${Date.now()}`

  beforeAll(async () => {
    await requestDetailPostgresStore.ensureSchema()
    await postgres.query('DELETE FROM request_details WHERE request_id = $1', [requestId])
  })

  afterAll(async () => {
    await postgres.query('DELETE FROM request_details WHERE request_id = $1', [requestId])
    await postgres.close()
  })

  test('insert sample request detail, list it, fetch detail, and purge body snapshot', async () => {
    const timestamp = '2026-04-07T12:00:00.000Z'

    await requestDetailPostgresStore.upsertRequestDetail({
      requestId,
      timestamp,
      endpoint: '/openai/v1/responses',
      method: 'POST',
      apiKeyId: 'key_smoke',
      accountId: 'acct_smoke',
      accountType: 'openai',
      model: 'gpt-5.4',
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 30,
      totalTokens: 150,
      cost: 0.12,
      realCost: 0.12,
      durationMs: 500,
      firstByteAt: '2026-04-07T12:00:00.100Z',
      firstTokenAt: '2026-04-07T12:00:00.200Z',
      responseCompletedAt: '2026-04-07T12:00:00.500Z',
      timeToFirstByteMs: 100,
      timeToFirstTokenMs: 200,
      contentGenerationMs: 300,
      sessionId: 'session-smoke',
      sessionHash: 'session-smoke-hash',
      conversationId: 'conv-smoke',
      metadataUserId: 'user-smoke',
      requestBodySnapshot: {
        model: 'gpt-5.4'
      }
    })

    const listed = await requestDetailPostgresStore.listRecordsInRange({
      startDate: new Date('2026-04-07T00:00:00.000Z'),
      endDate: new Date('2026-04-07T23:59:59.999Z')
    })
    const detail = await requestDetailPostgresStore.getRequestDetail(requestId)
    const beforePurge = await requestDetailPostgresStore.countRequestBodySnapshots()
    const purge = await requestDetailPostgresStore.purgeRequestBodySnapshots()
    const afterPurge = await requestDetailPostgresStore.getRequestDetail(requestId)

    expect(listed.some((record) => record.requestId === requestId)).toBe(true)
    expect(detail.conversationId).toBe('conv-smoke')
    expect(detail.timeToFirstTokenMs).toBe(200)
    expect(detail.contentGenerationMs).toBe(300)
    expect(detail.requestBodySnapshot).toEqual({ model: 'gpt-5.4' })
    expect(beforePurge).toBeGreaterThan(0)
    expect(purge.updatedRecords).toBeGreaterThan(0)
    expect(afterPurge.requestBodySnapshot).toBeUndefined()
  })
})
