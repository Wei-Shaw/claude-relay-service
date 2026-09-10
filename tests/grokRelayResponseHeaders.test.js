// 上游账号是多个 API Key 共享的，把它的 set-cookie 原样转给调用方等于把会话凭据
// 发给任意 Key 持有者。content-length 也必须剥掉 —— res.json() 会重新序列化，
// 保留上游的长度会与实际 body 不符。
//
// 另一半是计费：_recordUsage 此前在上游不回 usage 时直接 return，该请求在费用
// 统计、每日/总额度、账号用量、请求详情里会完全不存在。images / videos 这类
// 端点按张计费，响应里结构性地就没有 usage 字段。

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  api: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))
jest.mock('axios', () => jest.fn())
jest.mock('../src/services/account/grokAccountService', () => ({}))
jest.mock('../src/services/scheduler/grokScheduler', () => ({}))
jest.mock('../src/utils/proxyHelper', () => ({ createProxyAgent: () => null }))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))

const mockRecordUsage = jest.fn(async () => {})
jest.mock('../src/services/apiKeyService', () => ({
  recordUsage: (...args) => mockRecordUsage(...args)
}))

const grokRelayService = require('../src/services/relay/grokRelayService')

const makeRes = () => {
  const headers = {}
  return {
    headers,
    statusCode: null,
    body: null,
    setHeader(k, v) {
      headers[k] = v
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    }
  }
}

describe('grokRelayService._handleNormalResponse 响应头透传', () => {
  beforeEach(() => jest.clearAllMocks())

  it('剥掉 set-cookie 与传输相关头，保留诊断头', async () => {
    const res = makeRes()
    const upstream = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': '27',
        'content-encoding': 'gzip',
        'transfer-encoding': 'chunked',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'set-cookie': ['upstream_sess=SECRET; Path=/; HttpOnly'],
        'x-request-id': 'req-abc-123'
      },
      data: { id: 'x', model: 'grok-4.5', usage: { prompt_tokens: 1, completion_tokens: 2 } }
    }

    await grokRelayService._handleNormalResponse(upstream, res, { id: 'a1' }, { id: 'k1' }, 'm', {
      body: {}
    })

    expect(res.headers['set-cookie']).toBeUndefined()
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers['content-length']).toBeUndefined()
    expect(res.headers['transfer-encoding']).toBeUndefined()
    expect(res.headers.connection).toBeUndefined()
    // 诊断头不能被误伤
    expect(res.headers['x-request-id']).toBe('req-abc-123')
    expect(res.headers['content-type']).toBe('application/json')
  })
})

describe('grokRelayService._recordUsage 计费可见性', () => {
  beforeEach(() => jest.clearAllMocks())

  // images / videos 的响应里没有 usage 字段。直接 return 会让这些请求在
  // 账号用量与调用记录里完全消失。
  it('上游没有回传 usage 时仍然记一条请求', async () => {
    await grokRelayService._recordUsage({ id: 'a1' }, { id: 'k1' }, null, 'grok-2-image', {
      body: {},
      path: '/v1/images/generations'
    })

    expect(mockRecordUsage).toHaveBeenCalledTimes(1)
    const [keyId, inputTokens, outputTokens] = mockRecordUsage.mock.calls[0]
    expect(keyId).toBe('k1')
    expect(inputTokens).toBe(0)
    expect(outputTokens).toBe(0)
  })

  it('没有 apiKey 时不记录', async () => {
    await grokRelayService._recordUsage({ id: 'a1' }, null, { prompt_tokens: 5 }, 'grok-4.5', {
      body: {}
    })

    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('有 usage 时按实际 token 记录', async () => {
    await grokRelayService._recordUsage(
      { id: 'a1' },
      { id: 'k1' },
      { prompt_tokens: 100, completion_tokens: 40 },
      'grok-4.5',
      { body: {} }
    )

    const [, inputTokens, outputTokens] = mockRecordUsage.mock.calls[0]
    expect(inputTokens).toBe(100)
    expect(outputTokens).toBe(40)
  })
})
