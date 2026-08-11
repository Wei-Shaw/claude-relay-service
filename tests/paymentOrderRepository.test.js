// 测 orderRepository.pendingStats 的日期过滤 + countActiveByProviderInstance（iterateOrderFields 路径）

// getDateStringInTimezone 按 UTC 切日（单测只验过滤逻辑，不验时区换算）
const mockRedis = {
  client: {
    zrevrange: jest.fn(),
    zrange: jest.fn(),
    zcard: jest.fn(),
    hmget: jest.fn(),
    hget: jest.fn(),
    hgetall: jest.fn(),
    pipeline: jest.fn()
  },
  getDateStringInTimezone: jest.fn((d) => d.toISOString().slice(0, 10))
}
jest.mock('../src/models/redis', () => mockRedis)

const orderRepository = require('../src/services/payment/orderRepository')

beforeEach(() => {
  jest.clearAllMocks()
})

// key 形如 payment:order:{id}，取末段即订单 id
const idOf = (key) => key.split(':').pop()

// pipeline mock：收集 hmget 调用，exec 时按 key 回 hash
const installPipeline = (hashById) => {
  mockRedis.client.pipeline.mockImplementation(() => {
    const ops = []
    const api = {
      hmget: (key, ..._fields) => {
        ops.push(key)
        return api
      },
      hgetall: (key) => {
        ops.push(key)
        return api
      },
      exec: async () =>
        ops.map((key) => {
          const id = idOf(key)
          return [null, hashById[id] || null]
        })
    }
    return api
  })
}

describe('orderRepository.pendingStats 日期过滤（问题1）', () => {
  test('count 计全部 pending；金额仅计 sumDate 当天创建的（昨天遗留不占今天日限额）', async () => {
    mockRedis.client.zrevrange.mockResolvedValue(['today1', 'yesterday1', 'paid1'])
    const hash = {
      today1: ['pending', '30', '2026-06-03T10:00:00.000Z'],
      yesterday1: ['pending', '50', '2026-06-02T23:50:00.000Z'], // 昨天创建、仍 pending
      paid1: ['paid', '40', '2026-06-03T09:00:00.000Z']
    }
    // pendingStats 走 pipeline hmget
    installPipeline(hash)
    // 若走非 pipeline 路径也兜底
    mockRedis.client.hmget.mockImplementation((key) => Promise.resolve(hash[idOf(key)]))

    const { count, pendingPayAmountSum } = await orderRepository.pendingStats('k1', '2026-06-03')

    expect(count).toBe(2) // today1 + yesterday1 都是 pending
    expect(pendingPayAmountSum).toBe(30) // 仅 today1；昨天的 50 不占今天日限额
  })

  test('不传 sumDate 时金额计全部 pending（向后兼容）', async () => {
    mockRedis.client.zrevrange.mockResolvedValue(['a', 'b'])
    const hash = {
      a: ['pending', '30', '2026-06-03T10:00:00.000Z'],
      b: ['pending', '50', '2026-06-02T23:50:00.000Z']
    }
    installPipeline(hash)
    mockRedis.client.hmget.mockImplementation((key) => Promise.resolve(hash[idOf(key)]))

    const { count, pendingPayAmountSum } = await orderRepository.pendingStats('k1')

    expect(count).toBe(2)
    expect(pendingPayAmountSum).toBe(80) // 不过滤 → 全部
  })
})

describe('orderRepository.countActiveByProviderInstance - provider 引用守卫', () => {
  // iterateOrderFields: zcard + zrevrange + pipeline hmget(status, providerInstanceId)
  const setup = () => {
    mockRedis.client.zcard.mockResolvedValue(4)
    mockRedis.client.zrevrange.mockResolvedValue(['o1', 'o2', 'o3', 'o4'])
    // hmget 返回 [status, providerInstanceId]
    const hash = {
      o1: ['completed', 'inst1'],
      o2: ['pending', 'inst1'],
      o3: ['refunded', 'inst1'], // 终态，不计
      o4: ['paid', 'inst2'] // 别的实例，不计
    }
    installPipeline(hash)
  }

  test('默认 includeCompleted=true（删除守卫用）：completed 计入', async () => {
    setup()
    const count = await orderRepository.countActiveByProviderInstance('inst1')
    expect(count).toBe(2) // completed + pending（refunded 终态不计，inst2 不计）
  })

  test('includeCompleted=false（更新守卫用，快照化后）：completed 不计', async () => {
    setup()
    const count = await orderRepository.countActiveByProviderInstance('inst1', {
      includeCompleted: false
    })
    expect(count).toBe(1) // 仅 pending（completed 已自包含快照、不再冻结实例）
  })
})
