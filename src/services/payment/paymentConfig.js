// 支付全局配置服务：单一 JSON 存于 Redis，带内存缓存。仿 claudeRelayConfigService 模式。

const redis = require('../../models/redis')
const logger = require('../../utils/logger')

const { RedisKeys } = require('../../constants/redisKeys')

const CONFIG_KEY = RedisKeys.payment.config
const CONFIG_CACHE_TTL = 60000 // 1 分钟缓存

const DEFAULT_CONFIG = {
  enabled: false, // 支付总开关
  orderTimeoutMinutes: 30, // 订单超时（分钟）
  maxPendingOrders: 3, // 每用户最大待支付订单数
  dailyLimit: 0, // 每日充值金额上限（元，0=不限）
  allowCustomAmount: false, // 是否允许自定义金额
  customRatio: 0, // 自定义金额倍率（额度→支付货币），0=未配置则禁用自定义
  feeRate: 0, // 手续费率
  lbStrategy: 'least_amount', // 负载均衡策略：least_amount | round_robin
  enabledPaymentTypes: [], // 启用的支付方式
  updatedAt: null,
  updatedBy: null
}

// 数值配置字段约束：[最小值, 是否要求整数]。orderTimeoutMinutes 用于算订单过期时间，非正数会生成创建即过期或 Invalid Date 的订单
const NUMERIC_CONSTRAINTS = {
  orderTimeoutMinutes: [1, true],
  maxPendingOrders: [0, true],
  dailyLimit: [0, false],
  customRatio: [0, false],
  feeRate: [0, false]
}

const validateConfigPatch = (patch) => {
  for (const [field, [min, mustBeInt]] of Object.entries(NUMERIC_CONSTRAINTS)) {
    if (patch[field] === undefined) {
      continue
    }
    const value = patch[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
      throw new Error(`支付配置 ${field} 必须是不小于 ${min} 的有限数字`)
    }
    if (mustBeInt && !Number.isInteger(value)) {
      throw new Error(`支付配置 ${field} 必须是整数`)
    }
  }
}

class PaymentConfigService {
  constructor() {
    this._cache = null
    this._cacheTime = 0
  }

  // 严格读取：Redis 读失败时抛错（不伪装成默认值）。用于管理端加载与保存前的读改写——
  // 这两条路径若把「读失败」当「空配置」，会用默认值覆盖真实生产配置（资损）。
  async getConfigStrict() {
    const now = Date.now()
    if (this._cache && now - this._cacheTime < CONFIG_CACHE_TTL) {
      return this._cache
    }
    const data = await redis.client.get(CONFIG_KEY)
    // 到这里说明 Redis 读成功：data 为 null=从未配置（合法空），否则解析
    const parsed = data ? JSON.parse(data) : {}
    const merged = { ...DEFAULT_CONFIG, ...parsed }
    this._cache = merged
    this._cacheTime = now
    return merged
  }

  // 宽松读取：Redis 读失败时降级为默认（关闭态），供运行时热路径使用（不能因读失败阻断请求）。
  async getConfig() {
    try {
      return await this.getConfigStrict()
    } catch (error) {
      logger.error('❌ [payment] Failed to get payment config:', error)
      // 配置读失败时返回默认（关闭态），不缓存，让下次重试
      return { ...DEFAULT_CONFIG }
    }
  }

  async updateConfig(patch, updatedBy = 'admin') {
    validateConfigPatch(patch)
    // 读改写必须用严格读：读失败时抛错中止，绝不把 patch 合并到默认值上覆盖生产配置
    const current = await this.getConfigStrict()
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy
    }
    await redis.client.set(CONFIG_KEY, JSON.stringify(updated))
    this._cache = updated
    this._cacheTime = Date.now()
    logger.info(`[payment] config updated by ${updatedBy}`)
    return updated
  }

  clearCache() {
    this._cache = null
    this._cacheTime = 0
  }
}

module.exports = new PaymentConfigService()
