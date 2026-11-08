/**
 * serviceRatesService 模型倍率测试
 */
const mockRedis = {
  client: {
    get: jest.fn(),
    set: jest.fn()
  }
}

jest.mock('../src/models/redis', () => mockRedis)
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  database: jest.fn(),
  api: jest.fn(),
  security: jest.fn()
}))

describe('serviceRatesService - modelRates', () => {
  let serviceRatesService

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    serviceRatesService = require('../src/services/serviceRatesService')
    serviceRatesService.clearCache()
    mockRedis.client.get.mockResolvedValue(null)
    mockRedis.client.set.mockResolvedValue('OK')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getRates', () => {
    it('无 Redis 配置时返回默认值（modelRates 为空对象）', async () => {
      const config = await serviceRatesService.getRates()
      expect(config.modelRates).toEqual({})
      expect(config.rates.claude).toBe(1.0)
    })

    it('兼容旧配置：无 modelRates 字段时默认为空对象', async () => {
      mockRedis.client.get.mockResolvedValue(
        JSON.stringify({ baseService: 'claude', rates: { claude: 2.0 } })
      )
      const config = await serviceRatesService.getRates()
      expect(config.rates.claude).toBe(2.0)
      expect(config.modelRates).toEqual({})
    })

    it('读取已存储的 modelRates', async () => {
      mockRedis.client.get.mockResolvedValue(
        JSON.stringify({
          baseService: 'claude',
          rates: { claude: 1.0 },
          modelRates: { 'claude-fable': 1.5 }
        })
      )
      const config = await serviceRatesService.getRates()
      expect(config.modelRates['claude-fable']).toBe(1.5)
    })
  })

  describe('saveRates', () => {
    it('持久化 modelRates 并使缓存失效', async () => {
      await serviceRatesService.saveRates(
        { rates: { claude: 1.0 }, modelRates: { 'claude-fable': 1.5 } },
        'tester'
      )

      expect(mockRedis.client.set).toHaveBeenCalledTimes(1)
      const [, saved] = mockRedis.client.set.mock.calls[0]
      const parsed = JSON.parse(saved)
      expect(parsed.modelRates['claude-fable']).toBe(1.5)
      expect(parsed.updatedBy).toBe('tester')

      // 缓存已失效，下次 getRates 重新读 Redis
      mockRedis.client.get.mockResolvedValue(saved)
      const config = await serviceRatesService.getRates()
      expect(mockRedis.client.get).toHaveBeenCalled()
      expect(config.modelRates['claude-fable']).toBe(1.5)
    })

    it('未提供 modelRates 时保存为空对象', async () => {
      await serviceRatesService.saveRates({ rates: { claude: 1.0 } }, 'tester')
      const parsed = JSON.parse(mockRedis.client.set.mock.calls[0][1])
      expect(parsed.modelRates).toEqual({})
    })
  })

  describe('validateRates', () => {
    it('拒绝非正数模型倍率', () => {
      expect(() =>
        serviceRatesService.validateRates({ rates: {}, modelRates: { fable: 0 } })
      ).toThrow('模型 fable 的倍率必须是正数')
    })

    it('拒绝非数字模型倍率', () => {
      expect(() =>
        serviceRatesService.validateRates({ rates: {}, modelRates: { fable: '1.5' } })
      ).toThrow('模型 fable 的倍率必须是正数')
    })

    it('拒绝空模型名', () => {
      expect(() =>
        serviceRatesService.validateRates({ rates: {}, modelRates: { '  ': 1.5 } })
      ).toThrow('模型名称不能为空')
    })

    it('拒绝非对象 modelRates', () => {
      expect(() => serviceRatesService.validateRates({ rates: {}, modelRates: [1.5] })).toThrow(
        '无效的模型倍率配置格式'
      )
    })

    it('合法配置通过校验', () => {
      expect(() =>
        serviceRatesService.validateRates({
          rates: { claude: 1.0 },
          modelRates: { 'claude-fable': 1.5 }
        })
      ).not.toThrow()
    })
  })

  describe('getModelRate', () => {
    const setConfig = (modelRates) => {
      mockRedis.client.get.mockResolvedValue(
        JSON.stringify({ baseService: 'claude', rates: { claude: 1.0 }, modelRates })
      )
    }

    it('未配置 modelRates 时返回 1.0', async () => {
      const rate = await serviceRatesService.getModelRate('claude-fable-5-1')
      expect(rate).toBe(1.0)
    })

    it('空模型参数返回 1.0', async () => {
      expect(await serviceRatesService.getModelRate(null)).toBe(1.0)
      expect(await serviceRatesService.getModelRate('')).toBe(1.0)
      expect(await serviceRatesService.getModelRate(123)).toBe(1.0)
    })

    it('精确匹配', async () => {
      setConfig({ 'claude-fable-5-1': 1.5 })
      expect(await serviceRatesService.getModelRate('claude-fable-5-1')).toBe(1.5)
    })

    it('前缀匹配', async () => {
      setConfig({ 'claude-fable': 1.5 })
      expect(await serviceRatesService.getModelRate('claude-fable-5-1')).toBe(1.5)
    })

    it('最长前缀优先', async () => {
      setConfig({ 'claude-fable': 1.5, 'claude-fable-5': 2.0 })
      expect(await serviceRatesService.getModelRate('claude-fable-5-1')).toBe(2.0)
    })

    it('剥离 [1m] 后缀后匹配', async () => {
      setConfig({ 'claude-fable-5-1': 1.5 })
      expect(await serviceRatesService.getModelRate('claude-fable-5-1[1m]')).toBe(1.5)
    })

    it('配置键也做 [1m] 归一化', async () => {
      setConfig({ 'claude-fable-5-1[1m]': 1.5 })
      expect(await serviceRatesService.getModelRate('claude-fable-5-1')).toBe(1.5)
    })

    it('剥离厂商前缀（ccr,xxx）后匹配', async () => {
      setConfig({ 'claude-fable': 1.5 })
      expect(await serviceRatesService.getModelRate('ccr,claude-fable-5-1')).toBe(1.5)
    })

    it('大小写不敏感', async () => {
      setConfig({ 'Claude-Fable': 1.5 })
      expect(await serviceRatesService.getModelRate('CLAUDE-FABLE-5-1')).toBe(1.5)
    })

    it('未命中的模型返回 1.0', async () => {
      setConfig({ 'claude-fable': 1.5 })
      expect(await serviceRatesService.getModelRate('claude-sonnet-5')).toBe(1.0)
    })

    it('模型名是配置键的前缀时不算匹配', async () => {
      // 请求模型比配置键短，且不是其前缀超集关系反转
      setConfig({ 'claude-fable-5-1-full': 2.0 })
      expect(await serviceRatesService.getModelRate('claude-fable-5-1')).toBe(1.0)
    })
  })
})
