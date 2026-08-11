// 回归测试：delete/restore/permanentDelete 必须在【原子 MULTI】里维护主列表依赖的状态集合/核心索引，
// 且不再因 JSON.parse(tags) 抛错而跳过状态集合更新（历史上是"先改 hash、再 try/catch 尽力维护"导致漂移）。

jest.mock('../config/config', () => ({ security: { apiKeyPrefix: 'cr_' } }), { virtual: true })

// Proxy 捕获 MULTI 上的全部链式调用为 [method, ...args]
const mockMultiCalls = []
let mockExecResult = [] // execMultiOrThrow 校验的逐条结果；默认全 OK，部分失败/空用例可覆盖
const mockMulti = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined
      }
      if (prop === 'exec') {
        return () => Promise.resolve(mockExecResult)
      }
      return (...args) => {
        mockMultiCalls.push([prop, ...args])
        return mockMulti
      }
    }
  }
)
const mockIdxPipeline = {
  srem: jest.fn(() => mockIdxPipeline),
  exec: jest.fn(() => Promise.resolve([]))
}

jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn(),
  getClientSafe: jest.fn(() => ({
    multi: () => mockMulti,
    scard: jest.fn(() => Promise.resolve(0)),
    srem: jest.fn(() => Promise.resolve(1))
  })),
  client: { pipeline: () => mockIdxPipeline },
  setApiKeyHash: jest.fn(() => Promise.resolve()),
  scanKeys: jest.fn(() => Promise.resolve([])),
  batchDelChunked: jest.fn(() => Promise.resolve()),
  getDateStringInTimezone: jest.fn(() => '2026-06-02')
}))

jest.mock('../src/services/apiKeyIndexService', () => {
  const { RedisKeys } = require('../src/constants/redisKeys')
  return {
    INDEX_KEYS: {
      ACTIVE_SET: RedisKeys.apiKey.set.active,
      DELETED_SET: RedisKeys.apiKey.set.deleted,
      ALL_SET: RedisKeys.apiKey.idx.all,
      DELETED_AT: RedisKeys.apiKey.idx.deletedAt,
      CREATED_AT: RedisKeys.apiKey.idx.createdAt,
      LAST_USED_AT: RedisKeys.apiKey.idx.lastUsedAt,
      NAME: RedisKeys.apiKey.idx.name,
      TAGS_ALL: RedisKeys.apiKey.tagsAll
    },
    addToIndex: jest.fn(() => Promise.resolve()),
    updateIndex: jest.fn(() => Promise.resolve()),
    removeFromIndex: jest.fn(() => Promise.resolve())
  }
})

jest.mock('../src/services/costRankService', () => ({
  addKeyToIndexes: jest.fn(() => Promise.resolve()),
  removeKeyFromIndexes: jest.fn(() => Promise.resolve())
}))

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
jest.mock('../src/services/requestDetailService', () => ({ captureRequestDetail: jest.fn() }))
jest.mock('../src/services/billingEventPublisher', () => ({ publishBillingEvent: jest.fn() }))
jest.mock('../src/utils/costCalculator', () => ({ calculateCost: jest.fn() }))
jest.mock('../src/utils/modelHelper', () => ({ isClaudeFamilyModel: jest.fn(() => false) }))
jest.mock('../src/utils/requestDetailHelper', () => ({
  finalizeRequestDetailMeta: jest.fn((value) => value)
}))

const redis = require('../src/models/redis')
const apiKeyIndexService = require('../src/services/apiKeyIndexService')
const apiKeyService = require('../src/services/apiKeyService')

describe('apiKeyService 索引随 hash 原子维护', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMultiCalls.length = 0
    mockExecResult = []
  })

  test('deleteApiKey 在原子 MULTI 中移出 ACTIVE、移入 DELETED', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'K', isActive: 'true', tags: '[]' })

    await apiKeyService.deleteApiKey('k1', 'admin', 'admin')

    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:set:active', 'k1'])
    expect(mockMultiCalls).toContainEqual(['sadd', 'apikey:set:deleted', 'k1'])
    // 状态集合不再走尽力维护的 updateIndex
    expect(apiKeyIndexService.updateIndex).not.toHaveBeenCalled()
  })

  test('deleteApiKey 即使 tags 是坏 JSON 也照常维护状态集合（修复 JSON.parse 吞错致漂移）', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'K', isActive: 'true', tags: '{坏的json' })

    await expect(apiKeyService.deleteApiKey('k1', 'admin', 'admin')).resolves.toEqual({
      success: true
    })

    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:set:active', 'k1'])
    expect(mockMultiCalls).toContainEqual(['sadd', 'apikey:set:deleted', 'k1'])
  })

  test('restoreApiKey 在原子 MULTI 中移入 ACTIVE、移出 DELETED、移出 deletedAt 索引', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'K', isDeleted: 'true', tags: '[]' })

    await apiKeyService.restoreApiKey('k1', 'admin', 'admin')

    expect(mockMultiCalls).toContainEqual(['sadd', 'apikey:set:active', 'k1'])
    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:set:deleted', 'k1'])
    expect(mockMultiCalls).toContainEqual(['zrem', 'apikey:idx:deletedAt', 'k1'])
    expect(apiKeyIndexService.updateIndex).not.toHaveBeenCalled()
  })

  test('restoreApiKey 在同一 MULTI 中重建认证结构（apikey_hash + hash_map），不走事务外 setApiKeyHash（避免半成功）', async () => {
    redis.getApiKey.mockResolvedValue({
      id: 'k1',
      name: 'K',
      isDeleted: 'true',
      tags: '[]',
      apiKey: 'hashedval'
    })

    await apiKeyService.restoreApiKey('k1', 'admin', 'admin')

    // 旧结构 apikey_hash:* 与新结构 hash_map 都在同一事务里重建
    expect(mockMultiCalls).toContainEqual([
      'hset',
      'apikey_hash:hashedval',
      { id: 'k1', name: 'K', isActive: 'true' }
    ])
    expect(mockMultiCalls).toContainEqual(['hset', 'apikey:hash_map', 'hashedval', 'k1'])
    // 不再事务外单独写认证结构（否则恢复已提交、setApiKeyHash 失败会半成功）
    expect(redis.setApiKeyHash).not.toHaveBeenCalled()
  })

  test('permanentDeleteApiKey 在原子 MULTI 中移除主列表依赖的核心索引（ALL/状态集合/排序/名称）', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'MyKey', isDeleted: 'true', tags: '[]' })

    await apiKeyService.permanentDeleteApiKey('k1')

    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:idx:all', 'k1'])
    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:set:active', 'k1'])
    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:set:deleted', 'k1'])
    expect(mockMultiCalls).toContainEqual(['zrem', 'apikey:idx:createdAt', 'k1'])
    expect(mockMultiCalls).toContainEqual(['zrem', 'apikey:idx:lastUsedAt', 'k1'])
    // 名称索引成员格式 name\x00keyId（小写）
    expect(mockMultiCalls).toContainEqual(['zrem', 'apikey:idx:name', 'mykey\x00k1'])
  })

  test('updateApiKey 把 hash 写入与索引更新放进同一 MULTI（索引随事务原子提交，不再事务外 best-effort）', async () => {
    redis.getApiKey.mockResolvedValue({
      id: 'k1',
      name: 'Old',
      isActive: 'true',
      isDeleted: 'false',
      tags: '[]',
      apiKey: 'hashedval'
    })

    await apiKeyService.updateApiKey('k1', { name: 'NewName' })

    // hash 与 hash_map 写入都落在事务上
    expect(mockMultiCalls.some((c) => c[0] === 'hset' && c[1] === 'apikey:k1')).toBe(true)
    expect(mockMultiCalls).toContainEqual(['hset', 'apikey:hash_map', 'hashedval', 'k1'])
    // 索引更新接收同一个 multi（随事务原子提交）
    expect(apiKeyIndexService.updateIndex).toHaveBeenCalledWith(
      'k1',
      expect.objectContaining({ name: 'NewName' }),
      expect.objectContaining({ name: 'Old' }),
      mockMulti
    )
  })

  test('hardDeleteApiKey 委托 permanentDeleteApiKey 做完整原子清理（不再只删 hash）', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'K', isDeleted: 'true', tags: '[]' })

    await apiKeyService.hardDeleteApiKey('k1')

    // 走到了 permanentDeleteApiKey 的原子清理：核心索引移除 + 删 hash
    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:idx:all', 'k1'])
    expect(mockMultiCalls).toContainEqual(['del', 'apikey:k1'])
  })

  test('regenerateApiKey 原子轮换：删旧认证映射 + 写新数据 + 建新映射同一 MULTI', async () => {
    redis.getApiKey.mockResolvedValue({
      id: 'k1',
      name: 'K',
      apiKey: 'oldhash',
      isActive: 'true',
      tags: '[]'
    })

    await apiKeyService.regenerateApiKey('k1')

    // 删旧认证映射（旧结构 apikey_hash:* + 新结构 hash_map）
    expect(mockMultiCalls).toContainEqual(['del', 'apikey_hash:oldhash'])
    expect(mockMultiCalls).toContainEqual(['hdel', 'apikey:hash_map', 'oldhash'])
    // 新 hash_map 映射指向 k1（新 hash 随机、未知，只校验目标）
    const newMap = mockMultiCalls.find(
      (c) => c[0] === 'hset' && c[1] === 'apikey:hash_map' && c[2] !== 'oldhash'
    )
    expect(newMap[3]).toBe('k1')
    // 旧兼容结构 apikey_hash:* 也为新 hash 重建（hash_map 回退路径下也能认证）
    expect(
      mockMultiCalls.some(
        (c) =>
          c[0] === 'hset' &&
          typeof c[1] === 'string' &&
          c[1].startsWith('apikey_hash:') &&
          c[1] !== 'apikey_hash:oldhash'
      )
    ).toBe(true)
    // 新数据写入 apikey:k1
    expect(mockMultiCalls.some((c) => c[0] === 'hset' && c[1] === 'apikey:k1')).toBe(true)
  })

  test('MULTI 部分失败（逐条结果含错误）时抛错，不把部分成功当成功', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'K', isActive: 'true', tags: '[]' })
    // MULTI/EXEC 非回滚：某条命令运行时报错（如 WRONGTYPE），其它已提交，但结果数组里该条 err 非空
    mockExecResult = [
      [null, 'OK'],
      [new Error('WRONGTYPE Operation against a key holding the wrong kind of value'), null]
    ]

    await expect(apiKeyService.deleteApiKey('k1', 'admin', 'admin')).rejects.toThrow('WRONGTYPE')
  })

  test('MULTI EXEC 返回空（事务未执行）时抛错', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'K', isActive: 'true', tags: '[]' })
    mockExecResult = null

    await expect(apiKeyService.deleteApiKey('k1', 'admin', 'admin')).rejects.toThrow()
  })

  test('deleteApiKey 在 MULTI 中移除该 key 的标签成员（标签语义=未删除 key）', async () => {
    redis.getApiKey.mockResolvedValue({
      id: 'k1',
      name: 'K',
      isActive: 'true',
      tags: '["foo","bar"]'
    })

    await apiKeyService.deleteApiKey('k1', 'admin', 'admin')

    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:tag:foo', 'k1'])
    expect(mockMultiCalls).toContainEqual(['srem', 'apikey:tag:bar', 'k1'])
  })

  test('restoreApiKey 在 MULTI 中把标签成员加回（含 tags:all）', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'k1', name: 'K', isDeleted: 'true', tags: '["foo"]' })

    await apiKeyService.restoreApiKey('k1', 'admin', 'admin')

    expect(mockMultiCalls).toContainEqual(['sadd', 'apikey:tag:foo', 'k1'])
    expect(mockMultiCalls).toContainEqual(['sadd', 'apikey:tags:all', 'foo'])
  })

  test('generateApiKey 在 MULTI 中同时写 hash_map 与旧兼容结构 apikey_hash:*（hash_map 回退路径）', async () => {
    await apiKeyService.generateApiKey({ name: 'NewKey' })

    expect(mockMultiCalls.some((c) => c[0] === 'hset' && c[1] === 'apikey:hash_map')).toBe(true)
    expect(
      mockMultiCalls.some(
        (c) => c[0] === 'hset' && typeof c[1] === 'string' && c[1].startsWith('apikey_hash:')
      )
    ).toBe(true)
  })
})
