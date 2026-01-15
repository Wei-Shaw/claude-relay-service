const axios = require('axios')
const logger = require('../../utils/logger')
const ProxyHelper = require('../../utils/proxyHelper')

/**
 * Provider 抽象基类
 * 各平台 Provider 需继承并实现 queryBalance(account)
 */
class BaseBalanceProvider {
  constructor(platform) {
    this.platform = platform
    this.logger = logger
  }

  /**
   * 查询余额（抽象方法）
   * @param {object} account - 账户对象
   * @returns {Promise<object>}
   * 形如：
   * {
   *   balance: number|null,
   *   currency?: string,
   *   quota?: { daily, used, remaining, resetAt, percentage, unlimited? },
   *   queryMethod?: 'api'|'field'|'local',
   *   rawData?: any
   * }
   */
  async queryBalance(_account) {
    throw new Error('queryBalance 方法必须由子类实现')
  }

  /**
   * 通用 HTTP 请求方法（支持代理）
   * @param {string} url
   * @param {object} options
   * @param {object} account
   */
  async makeRequest(url, options = {}, account = {}) {
    const config = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 15000,
      data: options.data,
      params: options.params,
      responseType: options.responseType
    }

    const proxyConfig = account.proxyConfig || account.proxy
    if (proxyConfig) {
      const agent = ProxyHelper.createProxyAgent(proxyConfig)
      if (agent) {
        config.httpAgent = agent
        config.httpsAgent = agent
        config.proxy = false
      }
    }

    try {
      const response = await axios(config)
      return {
        success: true,
        data: response.data,
        status: response.status,
        headers: response.headers
      }
    } catch (error) {
      const status = error.response?.status
      const message = error.response?.data?.message || error.message || '请求失败'
      this.logger.debug(`余额 Provider HTTP 请求失败: ${url} (${this.platform})`, {
        status,
        message
      })
      return { success: false, status, error: message }
    }
  }

  /**
   * 从账户字段读取 dailyQuota / dailyUsage（通用降级方案）
   * 注意：部分平台 dailyUsage 字段可能不是实时值，最终以 AccountBalanceService 的本地统计为准
   */
  readQuotaFromFields(account) {
    const dailyQuota = Number(account?.dailyQuota || 0)
    const dailyUsage = Number(account?.dailyUsage || 0)

    // 无限制
    if (!Number.isFinite(dailyQuota) || dailyQuota <= 0) {
      return {
        balance: null,
        currency: 'USD',
        quota: {
          daily: Infinity,
          used: Number.isFinite(dailyUsage) ? dailyUsage : 0,
          remaining: Infinity,
          percentage: 0,
          unlimited: true
        },
        queryMethod: 'field'
      }
    }

    const used = Number.isFinite(dailyUsage) ? dailyUsage : 0
    const remaining = Math.max(0, dailyQuota - used)
    const percentage = dailyQuota > 0 ? (used / dailyQuota) * 100 : 0

    return {
      balance: remaining,
      currency: 'USD',
      quota: {
        daily: dailyQuota,
        used,
        remaining,
        percentage: Math.round(percentage * 100) / 100
      },
      queryMethod: 'field'
    }
  }

  parseCurrency(data) {
    return data?.currency || data?.Currency || 'USD'
  }

  async safeExecute(fn, fallbackValue = null) {
    try {
      return await fn()
    } catch (error) {
      this.logger.error(`余额 Provider 执行失败: ${this.platform}`, error)
      return fallbackValue
    }
  }
}

module.exports = BaseBalanceProvider
