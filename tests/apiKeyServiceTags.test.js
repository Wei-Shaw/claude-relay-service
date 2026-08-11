// 标签读取语义回归：
// 1) getAllTags / getTagsWithCount 以"未删除 key 的标签"为准，不把 tags:all 残留的死标签（scard=0）带回；
// 2) 但"手工创建的标签"（apikey:tags:manual，0 引用也保留）必须在两个读接口里可见——否则 createTag 退化成无效写操作；
// 3) createTag 登记到手工集合、且不把已空的死标签误判为"已存在"。

jest.mock('../config/config', () => ({ security: { apiKeyPrefix: 'cr_' } }), { virtual: true })

jest.mock('../src/models/redis', () => ({
  scanAllApiKeyTags: jest.fn(() => Promise.resolve([])),
  getManualTags: jest.fn(() => Promise.resolve([])),
  getAllApiKeys: jest.fn(() => Promise.resolve([])),
  addManualTag: jest.fn(() => Promise.resolve()),
  removeManualTag: jest.fn(() => Promise.resolve()),
  removeTag: jest.fn(() => Promise.resolve()),
  getClientSafe: jest.fn()
}))
jest.mock('../src/services/costRankService', () => ({
  addKeyToIndexes: jest.fn(),
  removeKeyFromIndexes: jest.fn()
}))
jest.mock('../src/services/apiKeyIndexService', () => {
  const { RedisKeys } = require('../src/constants/redisKeys')
  return {
    INDEX_KEYS: { TAGS_ALL: RedisKeys.apiKey.tagsAll }
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

describe('标签读取 = key 派生标签 ∪ 手工标签（死标签隐藏、手工空标签可见）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    redis.scanAllApiKeyTags.mockResolvedValue([])
    redis.getManualTags.mockResolvedValue([])
    redis.getAllApiKeys.mockResolvedValue([])
  })

  test('getAllTags 不把死标签带回下拉（死标签不在手工集合、不在 live key）', async () => {
    redis.scanAllApiKeyTags.mockResolvedValue(['live']) // 已 scard 过滤
    redis.getManualTags.mockResolvedValue([]) // dead 不是手工标签

    const tags = await apiKeyService.getAllTags()

    expect(tags).toEqual(['live'])
    expect(tags).not.toContain('dead')
  })

  test('getAllTags 包含手工创建但未挂 key 的空标签（Model 2，可预创建）', async () => {
    redis.scanAllApiKeyTags.mockResolvedValue(['live'])
    redis.getManualTags.mockResolvedValue(['manualEmpty'])

    const tags = await apiKeyService.getAllTags()

    expect(tags).toEqual(['live', 'manualEmpty'])
  })

  test('getTagsWithCount：live 标签带真实计数，手工空标签以 count=0 出现，死标签不出现', async () => {
    redis.getAllApiKeys.mockResolvedValue([{ isDeleted: 'false', tags: JSON.stringify(['live']) }])
    redis.getManualTags.mockResolvedValue(['manualEmpty'])

    const details = await apiKeyService.getTagsWithCount()

    expect(details).toContainEqual({ name: 'live', count: 1 })
    expect(details).toContainEqual({ name: 'manualEmpty', count: 0 })
    expect(details.some((d) => d.name === 'dead')).toBe(false)
  })

  test('createTag 登记到手工集合，且对已空的死标签不误判为"已存在"', async () => {
    redis.scanAllApiKeyTags.mockResolvedValue([]) // 无 live key 挂 dead
    redis.getManualTags.mockResolvedValue([]) // dead 也不在手工集合

    const result = await apiKeyService.createTag('dead')

    expect(result).toEqual({ success: true })
    expect(redis.addManualTag).toHaveBeenCalledWith('dead')
  })

  test('createTag 对已存在的手工标签返回"已存在"，不重复登记', async () => {
    redis.scanAllApiKeyTags.mockResolvedValue([])
    redis.getManualTags.mockResolvedValue(['exists'])

    const result = await apiKeyService.createTag('exists')

    expect(result.success).toBe(false)
    expect(redis.addManualTag).not.toHaveBeenCalled()
  })
})
