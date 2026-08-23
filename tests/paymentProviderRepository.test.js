// 测 providerRepository 对旧 providerDaily string 键的运行时兼容迁移。

const pipeline = {
  del: jest.fn().mockReturnThis(),
  hset: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([])
}

const mockRedis = {
  client: {
    type: jest.fn(),
    get: jest.fn(),
    ttl: jest.fn(),
    pipeline: jest.fn(() => pipeline),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    smembers: jest.fn(),
    eval: jest.fn()
  }
}

jest.mock('../src/models/redis', () => mockRedis)
jest.mock('../src/utils/commonHelper', () => ({ encrypt: jest.fn(), decrypt: jest.fn() }))
jest.mock('../src/utils/logger', () => ({ warn: jest.fn(), error: jest.fn() }))

const providerRepository = require('../src/services/payment/providerRepository')

beforeEach(() => {
  jest.clearAllMocks()
  pipeline.del.mockReturnThis()
  pipeline.hset.mockReturnThis()
  pipeline.expire.mockReturnThis()
  pipeline.exec.mockResolvedValue([])
  mockRedis.client.type.mockReset()
  mockRedis.client.get.mockReset()
  mockRedis.client.ttl.mockReset()
  mockRedis.client.hgetall.mockReset()
  mockRedis.client.hdel.mockReset()
})

describe('providerRepository providerDaily 兼容旧 string 键', () => {
  test('getDailyReservations 首次命中旧 string 时迁成 hash 再读取', async () => {
    mockRedis.client.type.mockResolvedValueOnce('string').mockResolvedValueOnce('hash')
    mockRedis.client.get.mockResolvedValue('12.5')
    mockRedis.client.ttl.mockResolvedValue(123)
    mockRedis.client.hgetall.mockResolvedValue({ __legacy_total__: '12.5:0' })

    const data = await providerRepository.getDailyReservations('inst1', '2026-06-01')

    expect(mockRedis.client.pipeline).toHaveBeenCalledTimes(1)
    expect(pipeline.del).toHaveBeenCalled()
    expect(pipeline.hset).toHaveBeenCalledWith(
      'payment:provider:daily:inst1:2026-06-01',
      '__legacy_total__',
      '12.5:0'
    )
    expect(pipeline.expire).toHaveBeenCalledWith('payment:provider:daily:inst1:2026-06-01', 123)
    expect(data).toEqual({ __legacy_total__: '12.5:0' })
  })

  test('releaseDailyReservation 命中旧 string 时先迁移再 HDEL', async () => {
    mockRedis.client.type.mockResolvedValue('string')
    mockRedis.client.get.mockResolvedValue('8')
    mockRedis.client.ttl.mockResolvedValue(-1)

    await providerRepository.releaseDailyReservation('inst1', 'o1', '2026-06-01')

    expect(pipeline.hset).toHaveBeenCalledWith(
      'payment:provider:daily:inst1:2026-06-01',
      '__legacy_total__',
      '8:0'
    )
    expect(pipeline.expire).toHaveBeenCalledWith('payment:provider:daily:inst1:2026-06-01', 259200)
    expect(mockRedis.client.hdel).toHaveBeenCalledWith(
      'payment:provider:daily:inst1:2026-06-01',
      'o1'
    )
  })
})
