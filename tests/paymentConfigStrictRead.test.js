// 回归：Redis 读失败时，配置服务不得把默认值伪装成成功响应。
//
// Bug: getConfig() 捕获读异常后返回 DEFAULT_CONFIG；管理端 GET 路由包装为 success:true，
// 前端 configLoadFailed 永不触发；且 updateConfig 读改写时若读失败会把 patch 合并到默认值上，
// 覆盖真实生产配置（资损）。
// Fix: getConfigStrict() 读失败抛错（管理端加载 + 保存前读改写都用它）；getConfig() 仅供运行时热路径降级。

const mockRedis = {
  client: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK')
  }
}
jest.mock('../src/models/redis', () => mockRedis)
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/constants/redisKeys', () => ({
  RedisKeys: { payment: { config: 'payment:config' } }
}))

const paymentConfig = require('../src/services/payment/paymentConfig')

// 每个用例前清空内部缓存（模块单例），避免缓存串测
beforeEach(() => {
  jest.clearAllMocks()
  paymentConfig._cache = null
  paymentConfig._cacheTime = 0
  mockRedis.client.set.mockResolvedValue('OK')
})

describe('paymentConfig 严格读 / 宽松读', () => {
  it('getConfigStrict: Redis 读成功且为空 → 返回默认（合法空配置）', async () => {
    mockRedis.client.get.mockResolvedValue(null)
    const cfg = await paymentConfig.getConfigStrict()
    expect(cfg.enabled).toBe(false)
    expect(cfg.orderTimeoutMinutes).toBe(30)
  })

  it('getConfigStrict: Redis 读成功且有值 → 合并覆盖默认', async () => {
    mockRedis.client.get.mockResolvedValue(JSON.stringify({ enabled: true, feeRate: 0.05 }))
    const cfg = await paymentConfig.getConfigStrict()
    expect(cfg.enabled).toBe(true)
    expect(cfg.feeRate).toBe(0.05)
  })

  it('getConfigStrict: Redis 读失败 → 抛错（不伪装成默认值）', async () => {
    mockRedis.client.get.mockRejectedValue(new Error('Connection is closed'))
    await expect(paymentConfig.getConfigStrict()).rejects.toThrow('Connection is closed')
  })

  it('getConfig: Redis 读失败 → 降级为默认关闭态（运行时热路径不被阻断）', async () => {
    mockRedis.client.get.mockRejectedValue(new Error('Connection is closed'))
    const cfg = await paymentConfig.getConfig()
    expect(cfg.enabled).toBe(false)
  })

  it('updateConfig: 读失败时抛错中止，绝不把 patch 合并到默认值上覆盖生产配置', async () => {
    mockRedis.client.get.mockRejectedValue(new Error('Connection is closed'))
    await expect(paymentConfig.updateConfig({ feeRate: 0.1 })).rejects.toThrow(
      'Connection is closed'
    )
    // 关键：读失败时不得写入
    expect(mockRedis.client.set).not.toHaveBeenCalled()
  })

  it('updateConfig: 读成功时正常读改写', async () => {
    mockRedis.client.get.mockResolvedValue(JSON.stringify({ enabled: true, feeRate: 0.05 }))
    await paymentConfig.updateConfig({ feeRate: 0.1 })
    expect(mockRedis.client.set).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(mockRedis.client.set.mock.calls[0][1])
    // 保留原有 enabled:true，仅覆盖 feeRate
    expect(saved.enabled).toBe(true)
    expect(saved.feeRate).toBe(0.1)
  })
})
