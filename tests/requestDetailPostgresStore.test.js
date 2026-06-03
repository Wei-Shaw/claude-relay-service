jest.mock('../src/models/postgres', () => ({
  query: jest.fn()
}))

const postgres = require('../src/models/postgres')
const requestDetailPostgresStore = require('../src/services/requestDetailStores/postgresRequestDetailStore')

describe('requestDetailPostgresStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    postgres.query.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  test('upsertRequestDetail writes payload booleans when only request body is present', async () => {
    await requestDetailPostgresStore.upsertRequestDetail({
      requestId: 'req_payload_only',
      timestamp: '2026-05-27T08:00:00.000Z',
      model: 'glm-5.1',
      requestBodySnapshot: { model: 'glm-5.1' }
    })

    const payloadCall = postgres.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO request_detail_payloads')
    )

    expect(payloadCall).toBeTruthy()
    expect(payloadCall[1][5]).toBe(false)
    expect(payloadCall[1][10]).toBe(false)
  })

  test('upsertRequestDetail writes response payload fields', async () => {
    await requestDetailPostgresStore.upsertRequestDetail({
      requestId: 'req_response_payload',
      timestamp: '2026-05-27T08:00:00.000Z',
      model: 'glm-5.1',
      responseBodySnapshot: {
        id: 'resp_123',
        output: [{ content: 'hello' }]
      },
      responseTextPreview: '{"id":"resp_123"',
      responseBodySizeBytes: 128,
      responseBodyTruncated: false,
      upstreamResponseId: 'resp_123',
      finishReason: 'stop',
      responseMetadata: {
        captureMode: 'full'
      }
    })

    const payloadCall = postgres.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO request_detail_payloads')
    )

    expect(payloadCall).toBeTruthy()
    expect(JSON.parse(payloadCall[1][7])).toEqual({
      id: 'resp_123',
      output: [{ content: 'hello' }]
    })
    expect(payloadCall[1][8]).toBe('{"id":"resp_123"')
    expect(payloadCall[1][9]).toBe(128)
    expect(payloadCall[1][10]).toBe(false)
    expect(payloadCall[1][11]).toBe('resp_123')
    expect(payloadCall[1][12]).toBe('stop')
    expect(JSON.parse(payloadCall[1][14])).toEqual({ captureMode: 'full' })
  })

  test('listRecordsPage orders by whitelisted request metric columns', async () => {
    await requestDetailPostgresStore.listRecordsPage({
      startDate: '2026-05-27T00:00:00.000Z',
      endDate: '2026-05-28T00:00:00.000Z',
      sortBy: 'cost',
      sortOrder: 'asc',
      page: 1,
      pageSize: 20
    })

    const [sql, values] = postgres.query.mock.calls[0]
    expect(sql).toContain('ORDER BY d.cost ASC, d.timestamp ASC, d.request_id ASC')
    expect(sql).not.toContain('sortBy')
    expect(values).toHaveLength(4)
  })
})
