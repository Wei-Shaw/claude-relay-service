// permanentDeleteApiKey 的回归测试：锁死"删干净所有 usage/cost 键形态 + 清理索引集合残留成员"，
// 防止历史上反复出现的删不干净（精确总用量键、索引集合成员）问题再次回归。

jest.mock('../config/config', () => ({ security: { apiKeyPrefix: 'cr_' } }), { virtual: true })

const mockSremCalls = []
const mockPipeline = {
  srem: jest.fn((key, member) => mockSremCalls.push([key, member])),
  exec: jest.fn(() => Promise.resolve([]))
}
const mockMulti = {
  hdel: jest.fn(() => mockMulti),
  del: jest.fn(() => mockMulti),
  zrem: jest.fn(() => mockMulti),
  srem: jest.fn(() => mockMulti),
  sadd: jest.fn(() => mockMulti),
  hset: jest.fn(() => mockMulti),
  expire: jest.fn(() => mockMulti),
  zadd: jest.fn(() => mockMulti),
  exec: jest.fn(() => Promise.resolve([]))
}

jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn(),
  scanKeys: jest.fn(() => Promise.resolve([])),
  batchDelChunked: jest.fn(() => Promise.resolve()),
  getDateStringInTimezone: jest.fn(() => '2026-06-02'),
  getClientSafe: jest.fn(() => ({ multi: () => mockMulti })),
  client: { pipeline: () => mockPipeline }
}))

jest.mock('../src/services/costRankService', () => ({
  addKeyToIndexes: jest.fn(),
  removeKeyFromIndexes: jest.fn()
}))

jest.mock('../src/services/apiKeyIndexService', () => {
  const { RedisKeys } = require('../src/constants/redisKeys')
  return {
    removeFromIndex: jest.fn(() => Promise.resolve()),
    INDEX_KEYS: { DELETED_AT: RedisKeys.apiKey.idx.deletedAt }
  }
})

jest.mock('../src/utils/logger', () => ({
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  database: jest.fn()
}))

jest.mock('../src/services/serviceRatesService', () => ({
  getService: jest.fn(),
  getServiceRate: jest.fn()
}))
jest.mock('../src/services/requestDetailService', () => ({
  captureRequestDetail: jest.fn()
}))
jest.mock('../src/services/billingEventPublisher', () => ({
  publishBillingEvent: jest.fn()
}))
jest.mock('../src/utils/costCalculator', () => ({
  calculateCost: jest.fn()
}))
jest.mock('../src/utils/modelHelper', () => ({
  isClaudeFamilyModel: jest.fn(() => false)
}))
jest.mock('../src/utils/requestDetailHelper', () => ({
  finalizeRequestDetailMeta: jest.fn((value) => value)
}))

const redis = require('../src/models/redis')
const apiKeyService = require('../src/services/apiKeyService')

describe('apiKeyService.permanentDeleteApiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSremCalls.length = 0
    redis.getApiKey.mockResolvedValue({ id: 'key-1', name: 'K', isDeleted: 'true', tags: '[]' })
  })

  test('删干净三种 usage 键形态，含两个模式都匹配不到的精确总用量键 usage:${keyId}', async () => {
    redis.scanKeys.mockImplementation((pattern) => {
      if (pattern === 'usage:key-1:*') {
        return Promise.resolve(['usage:key-1:model:daily:test-model:2026-06-02'])
      }
      if (pattern === 'usage:*:key-1*') {
        return Promise.resolve(['usage:daily:key-1:2026-06-02', 'usage:cost:total:key-1'])
      }
      return Promise.resolve([])
    })

    await apiKeyService.permanentDeleteApiKey('key-1')

    const deletedKeys = redis.batchDelChunked.mock.calls[0][0]
    expect(deletedKeys).toContain('usage:key-1') // 精确总用量 hash（无 TTL，两个模式都匹配不到）
    expect(deletedKeys).toContain('usage:key-1:model:daily:test-model:2026-06-02') // keyId 在前
    expect(deletedKeys).toContain('usage:daily:key-1:2026-06-02') // keyId 在后
    expect(deletedKeys).toContain('usage:cost:total:key-1') // keyId 结尾
  })

  test('清理索引集合中残留的 keyId 成员（键名不含 keyId，删除模式碰不到）', async () => {
    redis.scanKeys.mockImplementation((pattern) => {
      if (pattern === 'usage:key-1:*') {
        // alltime 键（无 TTL）是模型名提取来源
        return Promise.resolve([
          'usage:key-1:model:alltime:test-model',
          'usage:key-1:model:daily:test-model:2026-06-02'
        ])
      }
      return Promise.resolve([])
    })

    await apiKeyService.permanentDeleteApiKey('key-1')

    // 成员 = keyId
    expect(mockSremCalls).toContainEqual(['usage:daily:index:2026-06-02', 'key-1'])
    expect(mockSremCalls).toContainEqual(['usage:hourly:index:2026-06-02:13', 'key-1'])
    // 成员 = ${keyId}:${model}（model 从被删 usage 键名里提取）
    expect(mockSremCalls).toContainEqual([
      'usage:keymodel:daily:index:2026-06-02',
      'key-1:test-model'
    ])
    expect(mockSremCalls).toContainEqual([
      'usage:keymodel:hourly:index:2026-06-02:13',
      'key-1:test-model'
    ])
  })

  test('只能彻底删除已软删除的 key', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'key-1', name: 'K', isDeleted: 'false', tags: '[]' })

    await expect(apiKeyService.permanentDeleteApiKey('key-1')).rejects.toThrow(
      '只能彻底删除已经删除的API Key'
    )
    expect(redis.batchDelChunked).not.toHaveBeenCalled()
  })

  test('模型名含冒号时，索引成员用完整模型名（不被第一个冒号截断）', async () => {
    redis.scanKeys.mockImplementation((pattern) => {
      if (pattern === 'usage:key-1:*') {
        // _normalizeModelName 不剥离这种中间冒号，模型名带冒号会真实落到索引成员里
        return Promise.resolve(['usage:key-1:model:alltime:vendor:model-x'])
      }
      return Promise.resolve([])
    })

    await apiKeyService.permanentDeleteApiKey('key-1')

    // 必须删完整成员 key-1:vendor:model-x，而不是被截断的 key-1:vendor
    expect(mockSremCalls).toContainEqual([
      'usage:keymodel:daily:index:2026-06-02',
      'key-1:vendor:model-x'
    ])
    expect(mockSremCalls).not.toContainEqual([
      'usage:keymodel:daily:index:2026-06-02',
      'key-1:vendor'
    ])
  })

  test('alltime 缺失（旧数据未迁移）时，仍从 daily/hourly 提取模型并清理索引成员', async () => {
    redis.scanKeys.mockImplementation((pattern) => {
      if (pattern === 'usage:key-1:*') {
        // 无 alltime 键，只有 daily/hourly（历史数据），且模型名带冒号
        return Promise.resolve([
          'usage:key-1:model:daily:vendor:model-x:2026-06-02',
          'usage:key-1:model:hourly:vendor:model-x:2026-06-02:13'
        ])
      }
      return Promise.resolve([])
    })

    await apiKeyService.permanentDeleteApiKey('key-1')

    // 即使没有 alltime，也要从 daily/hourly 提取出完整模型名 vendor:model-x
    expect(mockSremCalls).toContainEqual([
      'usage:keymodel:daily:index:2026-06-02',
      'key-1:vendor:model-x'
    ])
    expect(mockSremCalls).toContainEqual([
      'usage:keymodel:hourly:index:2026-06-02:13',
      'key-1:vendor:model-x'
    ])
  })
})
