// 回归测试：queryWithIndex（主列表）只读当前页 + 纯读过滤——以 hash 真实状态为准，把漂移进结果的
// 已删 / 已不存在 / 标签不符项从展示中剔除；读路径绝不改动索引（保证翻页 offset 稳定、不跨页漏项）。
// 索引漂移由同一 MULTI 写入收窄、由启动检测 + 重建愈合，不在读路径修复。

jest.mock('../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const apiKeyIndexService = require('../src/services/apiKeyIndexService')

describe('apiKeyIndexService.queryWithIndex 读时对账', () => {
  let candidateIds = []
  let hashesById = {}
  const cleanupCalls = []
  const cleanupPipeline = {
    srem: jest.fn((k, m) => cleanupCalls.push(['srem', k, m])),
    sadd: jest.fn((k, m) => cleanupCalls.push(['sadd', k, m])),
    zrem: jest.fn((k, m) => cleanupCalls.push(['zrem', k, m])),
    exec: jest.fn(() => Promise.resolve([]))
  }
  const client = {
    sdiffstore: jest.fn(() => Promise.resolve(1)),
    sinterstore: jest.fn(() => Promise.resolve(1)),
    expire: jest.fn(() => Promise.resolve(1)),
    smembers: jest.fn((key) => Promise.resolve(key === 'apikey:tags:all' ? [] : candidateIds)),
    zadd: jest.fn(() => Promise.resolve(1)),
    zinterstore: jest.fn(() => Promise.resolve(1)),
    zrevrange: jest.fn(() => Promise.resolve(candidateIds)),
    zrange: jest.fn(() => Promise.resolve(candidateIds)),
    del: jest.fn(() => Promise.resolve(1)),
    pipeline: jest.fn(() => cleanupPipeline)
  }
  const redis = {
    getClientSafe: () => client,
    batchGetApiKeys: jest.fn((ids) =>
      Promise.resolve(ids.map((id) => hashesById[id]).filter(Boolean))
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    cleanupCalls.length = 0
    apiKeyIndexService.init(redis)
  })

  test('当前页剔除已删/孤儿项（不回填）；total 为候选集大小、含未清漂移项，随清理/重建自愈', async () => {
    candidateIds = ['v1', 'd1', 'v2', 'm1']
    hashesById = {
      v1: { id: 'v1', isActive: 'true' },
      d1: { id: 'd1', isDeleted: 'true' }, // 漂移：仍在候选集，但 hash 已删
      v2: { id: 'v2', isActive: 'true' }
      // m1 无 hash（彻底删除残留的索引项）
    }

    const result = await apiKeyIndexService.queryWithIndex({
      page: 1,
      pageSize: 20,
      excludeDeleted: true
    })

    // 当前页只保留有效项（d1 已删、m1 孤儿被纯读剔除，不回填）
    expect(result.items.map((k) => k.id)).toEqual(['v1', 'v2'])
    // O(pageSize) 取舍：total 取候选集大小，含本次未展示的漂移项（随重建愈合）
    expect(result.pagination.total).toBe(4)
    // 读路径纯读：绝不在读时改动索引（否则 ZREM 会移动后续页 offset、造成跨页漏项）
    expect(cleanupCalls).toHaveLength(0)
  })

  test('读路径纯读：即使当前页混入脏项也绝不改动索引（保证翻页 offset 稳定）', async () => {
    candidateIds = ['v1', 'd1', 'm1']
    hashesById = {
      v1: { id: 'v1', isActive: 'true' },
      d1: { id: 'd1', isDeleted: 'true' } // m1 无 hash（孤儿）
    }

    const result = await apiKeyIndexService.queryWithIndex({
      page: 1,
      pageSize: 20,
      excludeDeleted: true
    })

    // 脏项从展示剔除，但不触发任何索引写入（pipeline 未被调用）
    expect(result.items.map((k) => k.id)).toEqual(['v1'])
    expect(client.pipeline).not.toHaveBeenCalled()
    expect(cleanupCalls).toHaveLength(0)
  })

  test('无漂移时正常返回且不触发修复', async () => {
    candidateIds = ['v1', 'v2']
    hashesById = { v1: { id: 'v1', isActive: 'true' }, v2: { id: 'v2', isActive: 'true' } }

    const result = await apiKeyIndexService.queryWithIndex({
      page: 1,
      pageSize: 20,
      excludeDeleted: true
    })

    expect(result.items.map((k) => k.id)).toEqual(['v1', 'v2'])
    expect(result.pagination.total).toBe(2)
    expect(client.pipeline).not.toHaveBeenCalled()
  })

  test('按标签筛选时以 hash 真实 tags 为准，剔除 tag 集合里的脏成员并清理', async () => {
    candidateIds = ['t1', 'x1'] // t1 真有 foo；x1 是脏成员（hash 已不含 foo）
    hashesById = {
      t1: { id: 't1', isActive: 'true', tags: ['foo'] },
      x1: { id: 'x1', isActive: 'true', tags: ['bar'] }
    }

    const result = await apiKeyIndexService.queryWithIndex({ page: 1, pageSize: 20, tag: 'foo' })

    // 脏成员 x1（hash 真实 tags 不含 foo）从展示剔除；total 取候选集大小（含未清脏成员，随重建愈合）
    expect(result.items.map((k) => k.id)).toEqual(['t1'])
    expect(result.pagination.total).toBe(2)
    // 读路径纯读，不改动索引
    expect(cleanupCalls).toHaveLength(0)
  })

  test('信任排序索引给出的顺序（lastUsedAt 为 best-effort，读时不再按 hash 重排）', async () => {
    // 排序索引（zrevrange）给出的顺序即结果顺序；O(pageSize) 取舍下不再全量 HGETALL 重排
    candidateIds = ['a', 'b']
    hashesById = {
      a: { id: 'a', isActive: 'true', lastUsedAt: '2026-01-01T00:00:00.000Z' },
      b: { id: 'b', isActive: 'true', lastUsedAt: '2026-06-01T00:00:00.000Z' }
    }

    const result = await apiKeyIndexService.queryWithIndex({
      page: 1,
      pageSize: 20,
      sortBy: 'lastUsedAt',
      sortOrder: 'desc'
    })

    // 按索引给出的顺序 [a, b]（不读时重排；lastUsedAt 偶发轻微错序随下次使用 / 重建自愈）
    expect(result.items.map((k) => k.id)).toEqual(['a', 'b'])
  })

  test('孤儿项（hash 不存在）在标签查询中也从 tag 集合移除，避免反复拉回不自愈', async () => {
    candidateIds = ['t1', 'orphan'] // orphan 无 hash，但残留在 apikey:tag:foo 里
    hashesById = { t1: { id: 't1', isActive: 'true', tags: ['foo'] } }

    const result = await apiKeyIndexService.queryWithIndex({ page: 1, pageSize: 20, tag: 'foo' })

    // 孤儿 orphan（无 hash）从展示剔除；读路径纯读、不改动索引
    expect(result.items.map((k) => k.id)).toEqual(['t1'])
    expect(cleanupCalls).toHaveLength(0)
  })

  test('只读当前页：候选远多于 pageSize 时也只 batchGet 当前页（O(pageSize)，不全量 HGETALL）', async () => {
    candidateIds = Array.from({ length: 50 }, (_, i) => `k${i}`)
    hashesById = Object.fromEntries(candidateIds.map((id) => [id, { id, isActive: 'true' }]))

    const result = await apiKeyIndexService.queryWithIndex({
      page: 1,
      pageSize: 20,
      excludeDeleted: true
    })

    // 关键：只对当前页 20 个 batchGet，而非把 50 个候选全量 HGETALL 拉回
    expect(redis.batchGetApiKeys).toHaveBeenCalledTimes(1)
    expect(redis.batchGetApiKeys.mock.calls[0][0]).toHaveLength(20)
    expect(result.items).toHaveLength(20)
    expect(result.pagination.total).toBe(50)
    expect(result.pagination.totalPages).toBe(3)
  })
})

// _getAvailableTags 读时按 scard 过滤空死标签（兜底 tags:all 裁剪 best-effort 可能失败）
describe('apiKeyIndexService._getAvailableTags 过滤死标签', () => {
  test('剔除集合为空（scard==0）的死标签，只返回仍有成员的标签', async () => {
    const client = {
      smembers: () => Promise.resolve(['live', 'dead']),
      pipeline: () => ({
        scard: () => {},
        // live 集合还有 3 个成员，dead 集合已空（裁剪 best-effort 失败残留）
        exec: () =>
          Promise.resolve([
            [null, 3],
            [null, 0]
          ])
      })
    }

    const tags = await apiKeyIndexService._getAvailableTags(client)

    expect(tags).toEqual(['live'])
  })
})

// detectAndHealMainIndexDrift：以 hash 真实状态核对主列表依赖的全部索引（ALL/ACTIVE/DELETED/排序分数/名称/回收站），
// 任一不符即触发重建自愈。重点覆盖"基数一致但成员/分数错"的漂移（ACTIVE 缺成员、排序分数过期），这是只比 ALL_SET 基数会漏的。
describe('apiKeyIndexService.detectAndHealMainIndexDrift 漂移检测自愈', () => {
  const T = 1700000000000
  // 用 id/属性造 key hash（batchGetApiKeys 返回的形态）
  const mkKey = (
    id,
    { active = true, deleted = false, name = id, lastUsed = T, tags = [] } = {}
  ) => ({
    id,
    name,
    createdAt: new Date(T).toISOString(),
    lastUsedAt: new Date(lastUsed).toISOString(),
    isActive: String(active),
    isDeleted: String(deleted),
    deletedAt: deleted ? new Date(T).toISOString() : '',
    tags
  })
  // 用真实 _indexEntryForKey 由 key 列表构建"一致"索引状态，保证与验证器同源
  const buildConsistent = (keys) => {
    const e = (k) => apiKeyIndexService._indexEntryForKey(k)
    // 标签集合 / tags:all 仅由未删除 key 贡献（与 rebuild 的 if(!isDeleted) 一致）
    const tagSets = {}
    const tagsAll = new Set()
    for (const k of keys) {
      if (e(k).isDeleted) {
        continue
      }
      for (const tag of k.tags || []) {
        if (!tagSets[tag]) {
          tagSets[tag] = []
        }
        tagSets[tag].push(k.id)
        tagsAll.add(tag)
      }
    }
    return {
      all: keys.map((k) => k.id),
      active: keys.filter((k) => e(k).isActive && !e(k).isDeleted).map((k) => k.id),
      deleted: keys.filter((k) => e(k).isDeleted).map((k) => k.id),
      createdFlat: keys.flatMap((k) => [k.id, String(e(k).createdScore)]),
      lastUsedFlat: keys.flatMap((k) => [k.id, String(e(k).lastUsedScore)]),
      name: keys.map((k) => e(k).nameMember),
      deletedAt: keys
        .filter((k) => e(k).isDeleted)
        .flatMap((k) => [k.id, String(e(k).deletedScore)]),
      tagSets,
      tagsAll: [...tagsAll],
      hashes: keys
    }
  }

  let state
  const client = {
    smembers: jest.fn((key) => {
      if (key === 'apikey:idx:all') {
        return Promise.resolve(state.all)
      }
      if (key === 'apikey:set:active') {
        return Promise.resolve(state.active)
      }
      if (key === 'apikey:set:deleted') {
        return Promise.resolve(state.deleted)
      }
      if (key === 'apikey:tags:all') {
        return Promise.resolve(state.tagsAll)
      }
      if (key.startsWith('apikey:tag:')) {
        return Promise.resolve(state.tagSets[key.slice('apikey:tag:'.length)] || [])
      }
      return Promise.resolve([])
    }),
    zrange: jest.fn((key) => {
      if (key === 'apikey:idx:createdAt') {
        return Promise.resolve(state.createdFlat)
      }
      if (key === 'apikey:idx:lastUsedAt') {
        return Promise.resolve(state.lastUsedFlat)
      }
      if (key === 'apikey:idx:name') {
        return Promise.resolve(state.name)
      }
      if (key === 'apikey:idx:deletedAt') {
        return Promise.resolve(state.deletedAt)
      }
      return Promise.resolve([])
    }),
    hset: jest.fn(() => Promise.resolve(1)),
    hincrby: jest.fn(() => Promise.resolve(1)),
    // 仅支持 apikey:tag:* 扫描（一次返回全部，cursor 回 '0' 终止）
    scan: jest.fn(() =>
      Promise.resolve(['0', Object.keys(state.tagSets).map((t) => `apikey:tag:${t}`)])
    )
  }
  const redis = {
    getClientSafe: () => client,
    scanApiKeyIds: jest.fn(() => Promise.resolve(state.hashes.map((k) => k.id))),
    batchGetApiKeys: jest.fn((ids) =>
      Promise.resolve(ids.map((id) => state.hashes.find((k) => k.id === id)).filter(Boolean))
    )
  }

  beforeEach(() => {
    state = buildConsistent([mkKey('k1', { tags: ['foo'] }), mkKey('k2', { deleted: true })])
    apiKeyIndexService.init(redis)
    apiKeyIndexService.isBuilding = false
    jest.spyOn(apiKeyIndexService, 'rebuildIndexes').mockResolvedValue(undefined)
  })

  afterEach(() => {
    apiKeyIndexService.rebuildIndexes.mockRestore()
  })

  test('所有索引与 hash 一致时不重建，并记录本次对账通过', async () => {
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).not.toHaveBeenCalled()
    expect(client.hset).toHaveBeenCalledWith(
      'apikey:index:drift',
      'lastCheckAt',
      expect.any(String),
      'lastCheckResult',
      'ok'
    )
  })

  test('活跃 key 缺失于 ACTIVE_SET（ALL 基数仍一致）→ 触发重建', async () => {
    state.active = [] // k1 active 却不在 ACTIVE_SET：只比 ALL 基数发现不了
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
    // 漂移指标累计（getStatus 据此暴露给 admin 观测）
    expect(client.hincrby).toHaveBeenCalledWith('apikey:index:drift', 'driftCount', 1)
  })

  test('最后使用排序分数过期（member 在、score 旧）→ 触发重建', async () => {
    state.lastUsedFlat = ['k1', String(T - 999), 'k2', String(T)] // k1 score 旧
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('名称排序成员漂移（改名后 NAME 未更新）→ 触发重建', async () => {
    state.name = ['stale\x00k1', 'k2\x00k2'] // k1 名称成员是旧名
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('已删 key 残留在 ACTIVE_SET → 触发重建', async () => {
    state.active = ['k1', 'k2'] // k2 已删却仍在 ACTIVE
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('僵尸索引项（索引有、hash 无）→ 触发重建', async () => {
    state.all = ['k1', 'k2', 'zombie'] // zombie 无对应 hash
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('标签集合残留已删成员（scard>0 仍是死标签）→ 触发重建', async () => {
    state.tagSets.foo = ['k1', 'k2'] // k2 已删、非 live，却残留在 apikey:tag:foo，scard 仍>0
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('live key 的标签缺失于 apikey:tag 集合（标签筛选漏 key）→ 触发重建', async () => {
    state.tagSets.foo = [] // k1 有 foo，集合里却没有 k1
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('tags:all 缺失仍在使用的标签（下拉漏标签）→ 触发重建', async () => {
    state.tagsAll = [] // foo 仍被 live key k1 使用，却不在 tags:all
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('live key 串进错误的 tag 集合（真实 tags 不含该标签）→ 触发重建', async () => {
    state.tagSets.bar = ['k1'] // k1.tags=['foo']，却残留在 apikey:tag:bar（成员是 live，仅校验 live 会漏）
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('回收站 DELETED_AT 分数过期（member 在、score 旧）→ 触发重建', async () => {
    state.deletedAt = ['k2', String(T - 999)] // k2 在 DELETED_AT 里但删除时间分数错了，回收站排序会乱
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).toHaveBeenCalledTimes(1)
  })

  test('正在重建(isBuilding)时跳过，不并发触发', async () => {
    apiKeyIndexService.isBuilding = true
    state.all = ['k1'] // 即便有漂移
    await apiKeyIndexService.detectAndHealMainIndexDrift()
    expect(apiKeyIndexService.rebuildIndexes).not.toHaveBeenCalled()
  })

  // 周期后台对账：把启动后部分提交漂移的收敛窗口从"重启"缩到 ≤ 间隔
  test('startPeriodicDriftScan 周期触发检测、幂等；stopPeriodicDriftScan 停止后不再触发', async () => {
    jest.useFakeTimers()
    const detectSpy = jest
      .spyOn(apiKeyIndexService, 'detectAndHealMainIndexDrift')
      .mockResolvedValue(undefined)
    const origInterval = apiKeyIndexService.DRIFT_SCAN_INTERVAL_MS
    try {
      apiKeyIndexService.stopPeriodicDriftScan() // 干净起点
      apiKeyIndexService.DRIFT_SCAN_INTERVAL_MS = 1000

      apiKeyIndexService.startPeriodicDriftScan()
      const handle = apiKeyIndexService._driftTimer
      apiKeyIndexService.startPeriodicDriftScan()
      expect(apiKeyIndexService._driftTimer).toBe(handle) // 幂等：不重复起

      await jest.advanceTimersByTimeAsync(1000)
      expect(detectSpy).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(1000)
      expect(detectSpy).toHaveBeenCalledTimes(2) // 上一轮跑完自动排下一轮

      apiKeyIndexService.stopPeriodicDriftScan()
      await jest.advanceTimersByTimeAsync(3000)
      expect(detectSpy).toHaveBeenCalledTimes(2) // 停止后不再触发
    } finally {
      apiKeyIndexService.stopPeriodicDriftScan()
      apiKeyIndexService.DRIFT_SCAN_INTERVAL_MS = origInterval
      detectSpy.mockRestore()
      jest.useRealTimers()
    }
  })
})
