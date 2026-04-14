jest.mock('../src/models/redis', () => ({
  getClient: jest.fn(),
  getApiKey: jest.fn()
}))

jest.mock('../src/services/claudeRelayConfigService', () => ({
  getConfig: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  start: jest.fn()
}))

jest.mock('../src/services/account/claudeAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/ccrAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/geminiAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/geminiApiAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/openaiAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn()
}))
jest.mock('../src/services/account/azureOpenaiAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/droidAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/account/bedrockAccountService', () => ({ getAccount: jest.fn() }))

const redis = require('../src/models/redis')
const claudeRelayConfigService = require('../src/services/claudeRelayConfigService')
const claudeAccountService = require('../src/services/account/claudeAccountService')
const openaiAccountService = require('../src/services/account/openaiAccountService')
const bedrockAccountService = require('../src/services/account/bedrockAccountService')
const requestDetailService = require('../src/services/requestDetailService')

describe('requestDetailService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(Date.parse('2026-04-07T18:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('captureRequestDetail stores normalized request detail records when enabled', async () => {
    const exec = jest.fn().mockResolvedValue([])
    const multi = {
      set: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec
    }

    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })
    redis.getClient.mockReturnValue({ multi: jest.fn(() => multi) })

    const result = await requestDetailService.captureRequestDetail({
      requestId: 'req_capture_1',
      timestamp: '2026-04-07T12:00:00.000Z',
      endpoint: '/openai/v1/responses',
      method: 'POST',
      statusCode: 200,
      apiKeyId: 'key_1',
      accountId: 'acct_1',
      accountType: 'openai',
      model: 'gpt-5.4',
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: 3,
      cacheCreateTokens: 2,
      cost: 0.123456,
      requestBody: {
        apiKey: 'super-secret',
        model: 'gpt-5.4',
        reasoning: {
          effort: 'medium'
        },
        prompt: 'hello'
      }
    })

    expect(result).toEqual({ captured: true, requestId: 'req_capture_1' })
    expect(multi.set).toHaveBeenCalled()
    expect(multi.set).toHaveBeenCalledWith(
      'request_detail:item:req_capture_1',
      expect.any(String),
      'EX',
      21600
    )
    const storedPayload = JSON.parse(multi.set.mock.calls[0][1])
    expect(storedPayload.requestBodySnapshot.apiKey).toContain('***')
    expect(storedPayload.endpoint).toBe('/openai/v1/responses')
    expect(storedPayload.reasoningDisplay).toBe('medium')
    expect(storedPayload.reasoningSource).toBe('reasoning.effort')
    expect(multi.zadd).toHaveBeenCalled()
    expect(exec).toHaveBeenCalled()
  })

  test('listRequestDetails applies openai cache display flags and openai hit-rate formula', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getApiKey.mockResolvedValue({ name: 'Primary Key' })
    openaiAccountService.getAccount.mockResolvedValue({ name: 'OpenAI Main' })

    const redisClient = {
      zrangebyscore: jest.fn().mockResolvedValue(['req_1', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_1',
          timestamp: '2026-04-07T12:00:00.000Z',
          endpoint: '/openai/v1/responses',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_1',
          accountType: 'openai',
          model: 'gpt-5.4',
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 60,
          cacheCreateTokens: 40,
          totalTokens: 250,
          cost: 0.5,
          durationMs: 1200,
          requestBodySnapshot: { model: 'gpt-5.4' }
        })
      ])
    }

    redis.getClient.mockReturnValue(redisClient)

    const result = await requestDetailService.listRequestDetails({
      apiKeyId: 'key_1',
      model: 'gpt-5.4',
      keyword: 'primary',
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].apiKeyName).toBe('Primary Key')
    expect(result.records[0].accountName).toBe('OpenAI Main')
    expect(result.records[0].requestBodySnapshot).toBeUndefined()
    expect(result.records[0].isOpenAIRelated).toBe(true)
    expect(result.records[0].cacheCreateNotApplicable).toBe(true)
    expect(result.retentionHours).toBe(6)
    expect(result.summary.totalRequests).toBe(1)
    expect(result.summary.cacheCreateTokens).toBe(0)
    expect(result.summary.cacheCreateNotApplicable).toBe(true)
    expect(result.summary.cacheHitRate).toBe(37.5)
    expect(result.availableFilters.models).toEqual(['gpt-5.4'])
    expect(result.filters.hasCustomDateRange).toBe(true)
  })

  test('listRequestDetails aggregates mixed openai and non-openai cache metrics correctly', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getApiKey.mockImplementation(async (keyId) => ({ name: `Key ${keyId}` }))
    openaiAccountService.getAccount.mockImplementation(async (accountId) =>
      accountId === 'acct_1' ? { name: 'OpenAI Main' } : null
    )
    claudeAccountService.getAccount.mockImplementation(async (accountId) =>
      accountId === 'acct_2' ? { name: 'Claude Main' } : null
    )

    redis.getClient.mockReturnValue({
      zrangebyscore: jest
        .fn()
        .mockResolvedValue(['req_openai', '1775563200000', 'req_claude', '1775566800000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_openai',
          timestamp: '2026-04-07T12:00:00.000Z',
          endpoint: '/openai/v1/responses',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_1',
          accountType: 'openai',
          model: 'gpt-5.4',
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 60,
          cacheCreateTokens: 40,
          totalTokens: 180,
          cost: 0.3,
          durationMs: 500
        }),
        JSON.stringify({
          requestId: 'req_claude',
          timestamp: '2026-04-07T13:00:00.000Z',
          endpoint: '/v1/messages',
          method: 'POST',
          apiKeyId: 'key_2',
          accountId: 'acct_2',
          accountType: 'claude',
          model: 'claude-sonnet-4-6',
          inputTokens: 90,
          outputTokens: 30,
          cacheReadTokens: 30,
          cacheCreateTokens: 30,
          totalTokens: 180,
          cost: 0.2,
          durationMs: 700
        })
      ])
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.records).toHaveLength(2)
    expect(result.summary.totalRequests).toBe(2)
    expect(result.summary.cacheCreateNotApplicable).toBe(false)
    expect(result.summary.cacheCreateTokens).toBe(30)
    expect(result.summary.cacheHitRate).toBe(40.91)
  })

  test('listRequestDetails treats azure-openai cache hits as openai-style metrics', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getApiKey.mockResolvedValue({ name: 'Azure Key' })

    redis.getClient.mockReturnValue({
      zrangebyscore: jest.fn().mockResolvedValue(['req_azure', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_azure',
          timestamp: '2026-04-07T12:00:00.000Z',
          endpoint: '/azure/chat/completions',
          method: 'POST',
          apiKeyId: 'key_azure',
          accountId: 'acct_azure',
          accountType: 'azure-openai',
          model: 'gpt-4o',
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 60,
          cacheCreateTokens: 0,
          totalTokens: 180,
          cost: 0.3,
          durationMs: 500
        })
      ])
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].isOpenAIRelated).toBe(true)
    expect(result.records[0].cacheCreateNotApplicable).toBe(true)
    expect(result.records[0].cacheHitRate).toBe(37.5)
    expect(result.summary.cacheCreateTokens).toBe(0)
    expect(result.summary.cacheHitRate).toBe(37.5)
  })

  test('listRequestDetails still exposes retained data when capture is disabled', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: false,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: false
    })

    redis.getApiKey.mockResolvedValue({ name: 'Primary Key' })
    openaiAccountService.getAccount.mockResolvedValue({ name: 'OpenAI Main' })

    redis.getClient.mockReturnValue({
      zrangebyscore: jest.fn().mockResolvedValue(['req_1', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_1',
          timestamp: '2026-04-07T12:00:00.000Z',
          endpoint: '/v1/messages',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_1',
          accountType: 'openai',
          model: 'gpt-5.4',
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 60,
          cacheCreateTokens: 40,
          totalTokens: 250,
          cost: 0.5,
          durationMs: 1200
        })
      ])
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.captureEnabled).toBe(false)
    expect(result.retentionHours).toBe(6)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].apiKeyName).toBe('Primary Key')
  })

  test('listRequestDetails derives reasoning from legacy preview-only records', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getApiKey.mockResolvedValue({ name: 'Primary Key' })
    openaiAccountService.getAccount.mockResolvedValue({ name: 'OpenAI Main' })

    redis.getClient.mockReturnValue({
      zrangebyscore: jest.fn().mockResolvedValue(['req_preview', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_preview',
          timestamp: '2026-04-07T12:00:00.000Z',
          endpoint: '/openai/v1/responses',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_1',
          accountType: 'openai',
          model: 'gpt-5.4',
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 60,
          cacheCreateTokens: 0,
          totalTokens: 210,
          cost: 0.5,
          durationMs: 1200,
          requestBodySnapshot: {
            summary: 'request body snapshot truncated',
            originalChars: 18000,
            maxChars: 12000,
            preview:
              '{"model":"gpt-5.4","reasoning":{"effort":"high","summary":"auto"},"input":"...[42 chars]'
          }
        })
      ])
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].reasoningDisplay).toBe('high')
    expect(result.records[0].reasoningSource).toBe('reasoning.effort')
  })

  test('captureRequestDetail omits requestBodySnapshot when body preview is disabled', async () => {
    const exec = jest.fn().mockResolvedValue([])
    const multi = {
      set: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec
    }

    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: false
    })
    redis.getClient.mockReturnValue({ multi: jest.fn(() => multi) })

    await requestDetailService.captureRequestDetail({
      requestId: 'req_capture_no_preview',
      timestamp: '2026-04-07T12:00:00.000Z',
      endpoint: '/openai/v1/responses',
      method: 'POST',
      model: 'gpt-5.4',
      requestBody: {
        model: 'gpt-5.4',
        reasoning: {
          effort: 'high'
        },
        input: 'hello world'
      }
    })

    const storedPayload = JSON.parse(multi.set.mock.calls[0][1])
    expect(storedPayload.requestBodySnapshot).toBeUndefined()
    expect(storedPayload.reasoningDisplay).toBe('high')
    expect(storedPayload.reasoningSource).toBe('reasoning.effort')
  })

  test('getRequestBodyPreviewStats counts stored snapshots', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: false
    })

    redis.getClient.mockReturnValue({
      scan: jest
        .fn()
        .mockResolvedValueOnce([
          '0',
          ['request_detail:item:req_1', 'request_detail:item:req_2', 'request_detail:item:req_3']
        ]),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({ requestId: 'req_1', requestBodySnapshot: { model: 'gpt-5.4' } }),
        JSON.stringify({ requestId: 'req_2', model: 'gpt-5.4' }),
        JSON.stringify({
          requestId: 'req_3',
          requestBodySnapshot: {
            preview: '{"model":"gpt-5.4"}'
          }
        })
      ])
    })

    const result = await requestDetailService.getRequestBodyPreviewStats()

    expect(result.bodyPreviewEnabled).toBe(false)
    expect(result.snapshotCount).toBe(2)
    expect(result.hasSnapshots).toBe(true)
  })

  test('getRequestDetail returns null for records outside retention window', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getClient.mockReturnValue({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          requestId: 'req_old',
          timestamp: '2026-04-07T10:00:00.000Z',
          endpoint: '/v1/messages',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_1',
          accountType: 'claude',
          model: 'claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.5,
          durationMs: 1200
        })
      )
    })

    const result = await requestDetailService.getRequestDetail('req_old')

    expect(result.record).toBeNull()
    expect(result.retentionHours).toBe(6)
    expect(result.captureEnabled).toBe(true)
  })

  test('getRequestDetail returns record within retention window', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    claudeAccountService.getAccount.mockResolvedValue({ name: 'Claude Main' })
    redis.getApiKey.mockResolvedValue({ name: 'Primary Key' })

    redis.getClient.mockReturnValue({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          requestId: 'req_recent',
          timestamp: '2026-04-07T14:00:00.000Z',
          endpoint: '/v1/messages',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_1',
          accountType: 'claude',
          model: 'claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.5,
          durationMs: 1200
        })
      )
    })

    const result = await requestDetailService.getRequestDetail('req_recent')

    expect(result.record).not.toBeNull()
    expect(result.record.requestId).toBe('req_recent')
    expect(result.record.apiKeyName).toBe('Primary Key')
  })

  test('getRequestDetail recovers missing timestamp from retention-window day index', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getClient.mockReturnValue({
      zscore: jest.fn().mockResolvedValue('1775570400000'),
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          requestId: 'req_no_ts',
          endpoint: '/v1/messages',
          method: 'POST'
        })
      )
    })

    const result = await requestDetailService.getRequestDetail('req_no_ts')

    expect(result.record).not.toBeNull()
    expect(result.record.requestId).toBe('req_no_ts')
    expect(result.record.timestamp).toBe('2026-04-07T14:00:00.000Z')
  })

  test('getRequestDetail recovers unparseable timestamp from retention-window day index', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getClient.mockReturnValue({
      zscore: jest.fn().mockResolvedValue('1775570400000'),
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          requestId: 'req_bad_ts',
          timestamp: 'invalid-date',
          endpoint: '/v1/messages',
          method: 'POST'
        })
      )
    })

    const result = await requestDetailService.getRequestDetail('req_bad_ts')

    expect(result.record).not.toBeNull()
    expect(result.record.requestId).toBe('req_bad_ts')
    expect(result.record.timestamp).toBe('2026-04-07T14:00:00.000Z')
  })

  test('getRequestDetail hides legacy records without a recoverable in-window timestamp', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getClient.mockReturnValue({
      zscore: jest.fn().mockResolvedValue('1775556000000'),
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          requestId: 'req_legacy_old',
          endpoint: '/v1/messages',
          method: 'POST'
        })
      )
    })

    const result = await requestDetailService.getRequestDetail('req_legacy_old')

    expect(result.record).toBeNull()
  })

  test('resolves bedrock account name from { success, data } wrapper', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getApiKey.mockResolvedValue({ name: 'Bedrock Key' })
    bedrockAccountService.getAccount.mockResolvedValue({
      success: true,
      data: { name: 'My Bedrock Account' }
    })

    redis.getClient.mockReturnValue({
      zrangebyscore: jest.fn().mockResolvedValue(['req_bedrock', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_bedrock',
          timestamp: '2026-04-07T12:00:00.000Z',
          endpoint: '/v1/messages',
          method: 'POST',
          apiKeyId: 'key_bedrock',
          accountId: 'acct_bedrock',
          accountType: 'bedrock',
          model: 'anthropic.claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.5,
          durationMs: 1200
        })
      ])
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].accountName).toBe('My Bedrock Account')
    expect(result.records[0].accountTypeName).toBe('AWS Bedrock')
  })

  test('handles bedrock { success: false } wrapper gracefully', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getApiKey.mockResolvedValue({ name: 'Some Key' })
    claudeAccountService.getAccount.mockResolvedValue(null)
    openaiAccountService.getAccount.mockResolvedValue(null)
    bedrockAccountService.getAccount.mockResolvedValue({
      success: false,
      error: 'Account not found'
    })

    redis.getClient.mockReturnValue({
      zrangebyscore: jest.fn().mockResolvedValue(['req_missing', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_missing',
          timestamp: '2026-04-07T12:00:00.000Z',
          endpoint: '/v1/messages',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_gone',
          accountType: 'bedrock',
          model: 'anthropic.claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.5,
          durationMs: 1200
        })
      ])
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].accountName).toBe('acct_gone')
    expect(result.records[0].accountTypeName).toBe('AWS Bedrock')
  })

  test('listRequestDetails without keyword uses deferred enrichment for page records only', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getApiKey.mockResolvedValue({ name: 'Primary Key' })
    openaiAccountService.getAccount.mockResolvedValue({ name: 'OpenAI Main' })

    const records = []
    const pointerEntries = []
    for (let i = 0; i < 5; i++) {
      const ts = 1775563200000 + i * 3600000
      pointerEntries.push(`req_${i}`, String(ts))
      records.push(
        JSON.stringify({
          requestId: `req_${i}`,
          timestamp: new Date(ts).toISOString(),
          endpoint: '/openai/v1/responses',
          method: 'POST',
          apiKeyId: 'key_1',
          accountId: 'acct_1',
          accountType: 'openai',
          model: 'gpt-5.4',
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheCreateTokens: 0,
          totalTokens: 150,
          cost: 0.5,
          durationMs: 1200
        })
      )
    }

    redis.getClient.mockReturnValue({
      zrangebyscore: jest.fn().mockResolvedValue(pointerEntries),
      mget: jest.fn().mockResolvedValue(records)
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-08T23:59:59.000Z',
      pageSize: 2,
      page: 1
    })

    expect(result.records).toHaveLength(2)
    expect(result.pagination.totalRecords).toBe(5)
    expect(result.records[0].apiKeyName).toBe('Primary Key')
    expect(result.records[0].accountName).toBe('OpenAI Main')
    expect(result.availableFilters.models).toEqual(['gpt-5.4'])
    expect(result.summary.totalRequests).toBe(5)
  })

  test('listRequestDetails backfills invalid timestamps from day-index scores', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: true
    })

    redis.getClient.mockReturnValue({
      zrangebyscore: jest.fn().mockResolvedValue(['req_invalid_ts', '1775563200000']),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_invalid_ts',
          timestamp: 'invalid-date',
          endpoint: '/v1/messages',
          method: 'POST',
          model: 'claude-sonnet-4-6'
        })
      ])
    })

    const result = await requestDetailService.listRequestDetails({
      startDate: '2026-04-07T00:00:00.000Z',
      endDate: '2026-04-07T23:59:59.000Z'
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].timestamp).toBe('2026-04-07T12:00:00.000Z')
    expect(result.availableFilters.dateRange.earliest).toBe('2026-04-07T12:00:00.000Z')
  })

  test('purgeRequestBodySnapshots removes snapshots while keeping records', async () => {
    claudeRelayConfigService.getConfig.mockResolvedValue({
      requestDetailCaptureEnabled: true,
      requestDetailRetentionHours: 6,
      requestDetailBodyPreviewEnabled: false
    })

    const exec = jest.fn().mockResolvedValue([])
    const pipeline = {
      set: jest.fn().mockReturnThis(),
      exec
    }
    const client = {
      scan: jest
        .fn()
        .mockResolvedValueOnce(['0', ['request_detail:item:req_1', 'request_detail:item:req_2']]),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          requestId: 'req_1',
          model: 'gpt-5.4',
          requestBodySnapshot: { model: 'gpt-5.4' }
        }),
        JSON.stringify({
          requestId: 'req_2',
          model: 'claude-sonnet-4-6'
        })
      ]),
      pipeline: jest.fn(() => pipeline)
    }
    redis.getClient.mockReturnValue(client)

    const result = await requestDetailService.purgeRequestBodySnapshots()

    expect(result.updatedRecords).toBe(1)
    expect(pipeline.set).toHaveBeenCalledWith(
      'request_detail:item:req_1',
      JSON.stringify({
        requestId: 'req_1',
        model: 'gpt-5.4'
      }),
      'KEEPTTL'
    )
    expect(exec).toHaveBeenCalled()
  })
})
