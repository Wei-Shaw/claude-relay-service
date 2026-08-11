// 安全回归：已删除 API Key 的认证/更新边界。
// 1) validateApiKey 必须拒绝已删除 Key（即便 hash_map 仍指向它）——认证边界兜底。
// 2) updateApiKey 必须拒绝更新已删除 Key，且绝不把它写回 hash_map（否则等于绕过 restore 接口复活）。

jest.mock('../config/config', () => ({ security: { apiKeyPrefix: 'cr_' } }), { virtual: true })

// 捕获挂到 MULTI 上的命令；任何写操作都会被记录，用于断言"守卫触发时没有任何写入"
const mockMultiCalls = []
const mockMulti = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined
      }
      if (prop === 'exec') {
        return () => Promise.resolve([])
      }
      return (...args) => {
        mockMultiCalls.push([prop, ...args])
        return mockMulti
      }
    }
  }
)

jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn(),
  findApiKeyByHash: jest.fn(),
  getClientSafe: jest.fn(() => ({ multi: () => mockMulti })),
  deleteApiKeyHash: jest.fn(() => Promise.resolve())
}))

jest.mock('../src/services/costRankService', () => ({
  addKeyToIndexes: jest.fn(),
  removeKeyFromIndexes: jest.fn()
}))
jest.mock('../src/services/apiKeyIndexService', () => {
  const { RedisKeys } = require('../src/constants/redisKeys')
  return {
    INDEX_KEYS: { TAGS_ALL: RedisKeys.apiKey.tagsAll },
    addToIndex: jest.fn(),
    updateIndex: jest.fn(() => []),
    removeFromIndex: jest.fn()
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
jest.mock('../src/services/requestDetailService', () => ({ captureRequestDetail: jest.fn() }))
jest.mock('../src/services/billingEventPublisher', () => ({ publishBillingEvent: jest.fn() }))
jest.mock('../src/utils/costCalculator', () => ({ calculateCost: jest.fn() }))
jest.mock('../src/utils/modelHelper', () => ({ isClaudeFamilyModel: jest.fn(() => false) }))
jest.mock('../src/utils/requestDetailHelper', () => ({
  finalizeRequestDetailMeta: jest.fn((value) => value)
}))

const redis = require('../src/models/redis')
const apiKeyService = require('../src/services/apiKeyService')

describe('已删除 API Key 的认证/更新安全边界', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMultiCalls.length = 0
  })

  test('validateApiKey 拒绝已删除 Key，且按"不存在"而非"disabled"返回（isDeleted 先于 isActive，不泄漏状态）', async () => {
    // 已删除且未激活：必须返回 not found，而不是先撞到 isActive 的 disabled
    redis.findApiKeyByHash.mockResolvedValue({
      id: 'k1',
      name: 'K',
      isActive: 'false',
      isDeleted: 'true'
    })

    const result = await apiKeyService.validateApiKey('cr_whatever')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('API key not found')
  })

  test('validateApiKeyForStats 拒绝已删除 Key（统计认证旁路也不放行，即便 isActive=true）', async () => {
    // 异常态：已删除但 isActive 仍为 true —— 必须由 isDeleted 兜底拦住，而非依赖 isActive
    redis.findApiKeyByHash.mockResolvedValue({
      id: 'k1',
      name: 'K',
      isActive: 'true',
      isDeleted: 'true'
    })

    const result = await apiKeyService.validateApiKeyForStats('cr_whatever')

    expect(result.valid).toBe(false)
  })

  test('updateApiKey 拒绝更新已删除 Key，且不把它写回 hash_map（不复活）', async () => {
    redis.getApiKey.mockResolvedValue({
      id: 'k1',
      name: 'K',
      isActive: 'false',
      isDeleted: 'true',
      tags: '[]',
      apiKey: 'hashedval'
    })

    await expect(apiKeyService.updateApiKey('k1', { isActive: true })).rejects.toThrow(
      'Cannot update a deleted API key'
    )

    // 守卫在事务之前抛出：没有打开事务、没有任何写入（尤其没有写回 hash_map）
    expect(redis.getClientSafe).not.toHaveBeenCalled()
    expect(mockMultiCalls).toEqual([])
  })
})
