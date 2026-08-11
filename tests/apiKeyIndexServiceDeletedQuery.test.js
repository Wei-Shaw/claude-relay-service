// queryDeletedWithIndex 的回归测试：只读当前页（O(pageSize)）、纯读。
// 稳态（索引干净，写入已原子化）下分页/总数准确；遇到僵尸索引项（hash 已彻底删除 / 已恢复）时，
// 仅从展示剔除、绝不在读路径 ZREM 改动 DELETED_AT —— 否则会移动后续页 offset、翻页跨页漏项。
// 僵尸由原子写入预防、由重建愈合；有残留时当前页可能短几条、total 可能短暂偏高，但翻页序列始终正确。

jest.mock('../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const apiKeyIndexService = require('../src/services/apiKeyIndexService')

describe('apiKeyIndexService.queryDeletedWithIndex 只读当前页 + 轻量对账', () => {
  // 内存数组模拟 DELETED_AT ZSET（已按 zrevrange 倒序排列），validSet 表示 hash 仍有效（且 isDeleted）的 keyId
  let store = []
  let validSet = new Set()

  const client = {
    zcard: jest.fn(() => Promise.resolve(store.length)),
    zrevrange: jest.fn((_key, start, end) => Promise.resolve(store.slice(start, end + 1))),
    zrem: jest.fn((_key, ...members) => {
      store = store.filter((id) => !members.includes(id))
      return Promise.resolve(members.length)
    })
  }
  const redis = {
    getClientSafe: () => client,
    batchGetApiKeys: jest.fn((ids) =>
      Promise.resolve(
        ids.filter((id) => validSet.has(id)).map((id) => ({ id, name: id, isDeleted: true }))
      )
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    apiKeyIndexService.init(redis)
  })

  test('稳态（无僵尸）：只读当前页，分页与总数准确，不触发清理', async () => {
    const valid = Array.from({ length: 5 }, (_, i) => `v${i}`)
    store = [...valid]
    validSet = new Set(valid)

    const result = await apiKeyIndexService.queryDeletedWithIndex({ page: 1, pageSize: 20 })

    expect(result.items.map((k) => k.id)).toEqual(valid)
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 5, totalPages: 1 })
    expect(client.zrem).not.toHaveBeenCalled()
  })

  test('稳态：只读当前页（不会把后续页/整库拉回来）', async () => {
    const valid = Array.from({ length: 100 }, (_, i) => `v${i}`)
    store = [...valid]
    validSet = new Set(valid)

    const result = await apiKeyIndexService.queryDeletedWithIndex({ page: 2, pageSize: 20 })

    // 只 ZREVRANGE 当前页区间、只 batchGet 当前页 20 个（O(pageSize)，非全量遍历）
    expect(client.zrevrange).toHaveBeenCalledWith('apikey:idx:deletedAt', 20, 39)
    expect(redis.batchGetApiKeys).toHaveBeenCalledTimes(1)
    expect(redis.batchGetApiKeys.mock.calls[0][0]).toHaveLength(20)
    expect(result.items).toHaveLength(20)
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 100, totalPages: 5 })
  })

  test('回收站为空：返回空列表与 0 总数', async () => {
    store = []
    validSet = new Set()

    const result = await apiKeyIndexService.queryDeletedWithIndex({ page: 1, pageSize: 20 })

    expect(result.items).toEqual([])
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  })

  test('当前页混入僵尸：仅从展示剔除、不在读路径 ZREM；total 取原始 ZCARD（offset 稳定）', async () => {
    // page1（pageSize3）切片 [z1,z2,v1]：僵尸剔除后当前页只剩 v1（不回填）；读路径不改动索引
    store = ['z1', 'z2', 'v1', 'v2', 'v3']
    validSet = new Set(['v1', 'v2', 'v3'])

    const result = await apiKeyIndexService.queryDeletedWithIndex({ page: 1, pageSize: 3 })

    expect(result.items.map((k) => k.id)).toEqual(['v1'])
    // 纯读：不 ZREM、不改动 store；total 取原始 ZCARD=5（含未清僵尸，随重建自愈）
    expect(client.zrem).not.toHaveBeenCalled()
    expect(store).toEqual(['z1', 'z2', 'v1', 'v2', 'v3'])
    expect(result.pagination.total).toBe(5)
  })

  test('纯读保证跨页 offset 稳定：前导僵尸不会让真实项跨页漏掉/重复', async () => {
    // 5 个前导僵尸 + 30 个有效；pageSize 20
    const zombies = Array.from({ length: 5 }, (_, i) => `z${i}`)
    const valid = Array.from({ length: 30 }, (_, i) => `v${i}`)
    store = [...zombies, ...valid]
    validSet = new Set(valid)

    // 第 1 页 [z0..z4, v0..v14] → 剔除僵尸 → [v0..v14]（15 条）
    const p1 = await apiKeyIndexService.queryDeletedWithIndex({ page: 1, pageSize: 20 })
    // 第 2 页 [v15..v29]（offset 未因读时清理而左移）
    const p2 = await apiKeyIndexService.queryDeletedWithIndex({ page: 2, pageSize: 20 })

    // 读路径不改动索引，store 始终不变
    expect(client.zrem).not.toHaveBeenCalled()
    expect(store).toEqual([...zombies, ...valid])
    // 关键：两页拼起来恰好覆盖全部 30 个有效项，无漏项、无重复
    expect([...p1.items, ...p2.items].map((k) => k.id)).toEqual(valid)
  })
})
