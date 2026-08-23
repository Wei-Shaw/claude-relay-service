jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

// 真实 registry 当前为空(两个真迁移走原生幂等)。用测试 registry 覆盖,验证 runMarker 通用逻辑。
jest.mock('../../src/migrations/registry', () => ({
  registry: [
    {
      id: 'test_marker_v1',
      legacyMarkerKey: 'legacy:test_marker_v1',
      up: jest.fn(() => Promise.resolve())
    }
  ]
}))

const runner = require('../../src/migrations/runner')
const { registry } = require('../../src/migrations/registry')

// 内存版 client mock:普通 key(get/set) + applied hash(hexists/hset)
const makeClient = (initialStore) => {
  const store = { ...initialStore }
  const hashes = {}
  return {
    get: jest.fn((k) => Promise.resolve(k in store ? store[k] : null)),
    set: jest.fn((k, v) => {
      store[k] = v
      return Promise.resolve('OK')
    }),
    hexists: jest.fn((h, f) => Promise.resolve(hashes[h] && f in hashes[h] ? 1 : 0)),
    hset: jest.fn((h, f, v) => {
      if (!hashes[h]) {
        hashes[h] = {}
      }
      hashes[h][f] = v
      return Promise.resolve(1)
    })
  }
}

describe('migrations/runner runVersionGated', () => {
  const ORIGINAL_ENV = process.env.APP_VERSION
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.APP_VERSION
    } else {
      process.env.APP_VERSION = ORIGINAL_ENV
    }
  })

  const makeRedis = (overrides) => ({
    getMigratedVersion: jest.fn(() => Promise.resolve('0.0.0')),
    needsGlobalStatsMigration: jest.fn(() => Promise.resolve(true)),
    migrateGlobalStats: jest.fn(() => Promise.resolve()),
    cleanupSystemMetrics: jest.fn(() => Promise.resolve()),
    setMigratedVersion: jest.fn(() => Promise.resolve()),
    ...overrides
  })

  test('同版本(migrated==current):整块跳过,不迁移不写水位', async () => {
    process.env.APP_VERSION = '1.1.306'
    const redis = makeRedis({ getMigratedVersion: jest.fn(() => Promise.resolve('1.1.306')) })
    await runner.runVersionGated(redis)
    expect(redis.migrateGlobalStats).not.toHaveBeenCalled()
    expect(redis.cleanupSystemMetrics).not.toHaveBeenCalled()
    expect(redis.setMigratedVersion).not.toHaveBeenCalled()
  })

  test('版本升级 + 需要迁移:跑 global+cleanup,写回水位', async () => {
    process.env.APP_VERSION = '1.1.306'
    const redis = makeRedis({ getMigratedVersion: jest.fn(() => Promise.resolve('1.1.200')) })
    await runner.runVersionGated(redis)
    expect(redis.migrateGlobalStats).toHaveBeenCalledTimes(1)
    expect(redis.cleanupSystemMetrics).toHaveBeenCalledTimes(1)
    expect(redis.setMigratedVersion).toHaveBeenCalledWith('1.1.306')
  })

  test('版本升级但全局统计已存在:不跑 global,仍跑 cleanup + 写水位', async () => {
    process.env.APP_VERSION = '1.1.306'
    const redis = makeRedis({
      getMigratedVersion: jest.fn(() => Promise.resolve('1.1.200')),
      needsGlobalStatsMigration: jest.fn(() => Promise.resolve(false))
    })
    await runner.runVersionGated(redis)
    expect(redis.migrateGlobalStats).not.toHaveBeenCalled()
    expect(redis.cleanupSystemMetrics).toHaveBeenCalledTimes(1)
    expect(redis.setMigratedVersion).toHaveBeenCalledWith('1.1.306')
  })

  // 对应评审问题②:版本已过线但全局统计缺失,必须补跑(不可错杀)
  test('migrated 已过 1.1.250 但全局统计缺失:仍补跑 migrateGlobalStats', async () => {
    process.env.APP_VERSION = '1.1.306'
    const redis = makeRedis({
      getMigratedVersion: jest.fn(() => Promise.resolve('1.1.251')),
      needsGlobalStatsMigration: jest.fn(() => Promise.resolve(true))
    })
    await runner.runVersionGated(redis)
    expect(redis.migrateGlobalStats).toHaveBeenCalledTimes(1)
    expect(redis.setMigratedVersion).toHaveBeenCalledWith('1.1.306')
  })
})

describe('migrations/runner runMarker (接管存量,不重跑)', () => {
  beforeEach(() => {
    registry[0].up.mockClear()
    registry[0].up.mockResolvedValue(undefined)
  })

  const makeRedis = (client) => ({ getClientSafe: () => client })

  test('老实例(存量旧 marker 存在):导入台账后跳过,不重跑 up', async () => {
    const client = makeClient({ 'legacy:test_marker_v1': '1699999999999' })
    await runner.runMarker(makeRedis(client), 'test_marker_v1')
    expect(registry[0].up).not.toHaveBeenCalled()
  })

  test('全新实例(无旧 marker、无台账):跑一次 up 并登记', async () => {
    const client = makeClient({})
    await runner.runMarker(makeRedis(client), 'test_marker_v1')
    expect(registry[0].up).toHaveBeenCalledTimes(1)
    expect(client.hset).toHaveBeenCalledWith(
      'system:migrations:applied',
      'test_marker_v1',
      expect.any(String)
    )
  })

  // 对应评审问题①:up 失败必须抛错且不记台账,下次可重试
  test('up 失败抛错:不写台账,下次可重试', async () => {
    registry[0].up.mockRejectedValueOnce(new Error('boom'))
    const client = makeClient({})
    await expect(runner.runMarker(makeRedis(client), 'test_marker_v1')).rejects.toThrow('boom')
    expect(client.hset).not.toHaveBeenCalledWith(
      'system:migrations:applied',
      'test_marker_v1',
      expect.anything()
    )
  })

  test('未知 id 抛错', async () => {
    const client = makeClient({})
    await expect(runner.runMarker(makeRedis(client), 'nope')).rejects.toThrow('Unknown migration')
  })
})

describe('migrations/runner importLegacyMarkers (per-migration 接管,无全局 guard)', () => {
  test('旧 marker 存在且未 applied:导入台账', async () => {
    const client = makeClient({ 'legacy:test_marker_v1': '123' })
    await runner.importLegacyMarkers(client)
    expect(client.hset).toHaveBeenCalledWith('system:migrations:applied', 'test_marker_v1', '123')
  })

  test('已 applied:跳过,不重复导入', async () => {
    const client = makeClient({ 'legacy:test_marker_v1': '123' })
    await client.hset('system:migrations:applied', 'test_marker_v1', '999')
    client.hset.mockClear()
    await runner.importLegacyMarkers(client)
    expect(client.hset).not.toHaveBeenCalled()
  })
})
