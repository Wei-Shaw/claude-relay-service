const http = require('http')
const logger = require('../utils/logger')

/**
 * Clash 代理智能管理器
 *
 * 当检测到代理相关的网络错误时，自动调用 Clash RESTful API 触发测速并切换到最快节点。
 * 采用防抖+冷却机制，避免短时间内大量错误触发频繁切换。
 *
 * 环境变量配置：
 *   CLASH_API_HOST       - Clash API 地址（默认 clash）
 *   CLASH_API_PORT       - Clash API 端口（默认 9090）
 *   CLASH_PROXY_GROUP    - 要管理的代理组名（默认 自动选择）
 *   CLASH_AUTO_SWITCH    - 是否启用自动切换（默认 true）
 *   CLASH_COOLDOWN_MS    - 切换冷却时间（默认 30000，即30秒）
 *   CLASH_DEBOUNCE_MS    - 防抖等待时间（默认 3000，即3秒）
 *   CLASH_ERROR_THRESHOLD - 冷却期内触发切换的最小错误数（默认 2）
 */
class ClashProxyManager {
  constructor() {
    // Clash API 连接配置
    this.apiHost = process.env.CLASH_API_HOST || 'clash'
    this.apiPort = parseInt(process.env.CLASH_API_PORT) || 9090
    this.proxyGroup = process.env.CLASH_PROXY_GROUP || '自动选择'
    this.enabled = process.env.CLASH_AUTO_SWITCH !== 'false' // 默认启用

    // 防抖和冷却
    this.cooldownMs = parseInt(process.env.CLASH_COOLDOWN_MS) || 30000
    this.debounceMs = parseInt(process.env.CLASH_DEBOUNCE_MS) || 3000
    this.errorThreshold = parseInt(process.env.CLASH_ERROR_THRESHOLD) || 2

    // 内部状态
    this._lastSwitchTime = 0
    this._debounceTimer = null
    this._errorCount = 0
    this._errorCountResetTimer = null
    this._currentNode = null
    this._initialized = false

    // 代理相关的网络错误码
    this.PROXY_ERROR_CODES = new Set([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EPIPE',
      'EAI_AGAIN',
      'ECONNABORTED',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ERR_SOCKET_CONNECTION_TIMEOUT'
    ])

    // 代理相关的 HTTP 状态码
    this.PROXY_HTTP_STATUS_CODES = new Set([502, 503, 504])
  }

  /**
   * 初始化：获取当前节点信息
   */
  async initialize() {
    if (!this.enabled) {
      logger.info('🔌 Clash 智能代理管理器已禁用 (CLASH_AUTO_SWITCH=false)')
      return
    }

    try {
      const groupInfo = await this._getProxyGroup()
      if (groupInfo) {
        this._currentNode = groupInfo.now
        this._initialized = true
        logger.info(
          `🔌 Clash 智能代理管理器已启动 | 代理组: ${this.proxyGroup} | 当前节点: ${this._currentNode} | ` +
            `冷却: ${this.cooldownMs / 1000}s | 防抖: ${this.debounceMs / 1000}s | 错误阈值: ${this.errorThreshold}`
        )
      } else {
        logger.warn('⚠️ Clash 智能代理管理器初始化失败：无法获取代理组信息，可能 Clash 未运行')
      }
    } catch (error) {
      logger.warn(`⚠️ Clash 智能代理管理器初始化失败: ${error.message}`)
    }
  }

  /**
   * 判断错误是否是代理/网络相关
   * @param {Error} error - 错误对象
   * @param {number} [httpStatus] - HTTP 状态码
   * @returns {boolean}
   */
  isProxyRelatedError(error, httpStatus) {
    if (!error) return false

    // 检查 error.code
    if (error.code && this.PROXY_ERROR_CODES.has(error.code)) {
      return true
    }

    // 检查 HTTP 状态码（502/503/504 通常与代理或上游不可达有关）
    if (httpStatus && this.PROXY_HTTP_STATUS_CODES.has(httpStatus)) {
      return true
    }

    // 检查 axios 响应状态码
    if (error.response?.status && this.PROXY_HTTP_STATUS_CODES.has(error.response.status)) {
      return true
    }

    // 检查错误消息中的网络相关关键词
    const msg = (error.message || '').toLowerCase()
    if (
      msg.includes('socket hang up') ||
      msg.includes('network error') ||
      msg.includes('connection') ||
      msg.includes('proxy')
    ) {
      return true
    }

    return false
  }

  /**
   * 报告代理错误 - 由各 relay service 在捕获到网络错误时调用
   * 使用防抖机制，收集一段时间内的错误后统一处理
   * @param {Error} error - 错误对象
   * @param {object} context - 上下文信息（可选）
   */
  reportProxyError(error, context = {}) {
    if (!this.enabled || !this._initialized) return

    this._errorCount++

    const errorInfo = {
      code: error.code,
      message: error.message?.substring(0, 100),
      status: error.response?.status || context.httpStatus,
      service: context.service || 'unknown',
      accountId: context.accountId
    }

    logger.warn(
      `🔌 [ClashProxy] 检测到代理相关错误 #${this._errorCount}: ${JSON.stringify(errorInfo)}`
    )

    // 重置错误计数器的定时器（冷却期后清零）
    if (this._errorCountResetTimer) {
      clearTimeout(this._errorCountResetTimer)
    }
    this._errorCountResetTimer = setTimeout(() => {
      if (this._errorCount > 0) {
        logger.info(`🔌 [ClashProxy] 错误计数器重置 (之前: ${this._errorCount})`)
      }
      this._errorCount = 0
    }, this.cooldownMs)

    // 防抖：等待一小段时间收集更多错误
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
    }
    this._debounceTimer = setTimeout(() => {
      this._tryAutoSwitch()
    }, this.debounceMs)
  }

  /**
   * 尝试自动切换节点
   * @private
   */
  async _tryAutoSwitch() {
    // 检查错误数是否达到阈值
    if (this._errorCount < this.errorThreshold) {
      logger.debug(
        `🔌 [ClashProxy] 错误数 ${this._errorCount} 未达阈值 ${this.errorThreshold}，跳过切换`
      )
      return
    }

    // 检查冷却时间
    const now = Date.now()
    const elapsed = now - this._lastSwitchTime
    if (elapsed < this.cooldownMs) {
      const remaining = Math.ceil((this.cooldownMs - elapsed) / 1000)
      logger.info(`🔌 [ClashProxy] 冷却中，${remaining}s 后可再次切换`)
      return
    }

    logger.info(`🔌 [ClashProxy] 累计 ${this._errorCount} 个代理错误，开始测速切换...`)

    try {
      // 1. 触发所有节点测速
      const delayResults = await this._testAllProxies()

      if (!delayResults || delayResults.length === 0) {
        logger.error('🔌 [ClashProxy] 测速失败：没有可用节点')
        return
      }

      // 2. 选择延迟最低的节点
      const bestNode = delayResults[0]

      // 3. 获取当前节点
      const groupInfo = await this._getProxyGroup()
      const currentNode = groupInfo?.now

      if (currentNode === bestNode.name) {
        logger.info(
          `🔌 [ClashProxy] 当前节点 "${currentNode}" (${bestNode.delay}ms) 已是最优，无需切换`
        )
      } else {
        logger.info(
          `🔌 [ClashProxy] 切换节点: "${currentNode}" → "${bestNode.name}" (延迟: ${bestNode.delay}ms)`
        )
      }

      // url-test 组会自动切换到最快节点，这里记录状态
      this._currentNode = bestNode.name
      this._lastSwitchTime = now
      this._errorCount = 0

      // 输出完整排名
      const top5 = delayResults.slice(0, 5)
      logger.info(
        `🔌 [ClashProxy] 测速排名 Top5: ${top5.map((n, i) => `${i + 1}.${n.name}(${n.delay}ms)`).join(' | ')}`
      )
    } catch (error) {
      logger.error(`🔌 [ClashProxy] 自动切换失败: ${error.message}`)
    }
  }

  /**
   * 获取代理组信息
   * @private
   */
  _getProxyGroup() {
    return new Promise((resolve) => {
      const path = `/proxies/${encodeURIComponent(this.proxyGroup)}`
      const req = http.get(
        { hostname: this.apiHost, port: this.apiPort, path, timeout: 5000 },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(body))
            } catch {
              resolve(null)
            }
          })
        }
      )
      req.on('error', () => resolve(null))
      req.on('timeout', () => {
        req.destroy()
        resolve(null)
      })
    })
  }

  /**
   * 获取所有代理节点信息
   * @private
   */
  _getAllProxies() {
    return new Promise((resolve) => {
      const req = http.get(
        { hostname: this.apiHost, port: this.apiPort, path: '/proxies', timeout: 5000 },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(body))
            } catch {
              resolve(null)
            }
          })
        }
      )
      req.on('error', () => resolve(null))
      req.on('timeout', () => {
        req.destroy()
        resolve(null)
      })
    })
  }

  /**
   * 对单个节点进行延迟测试
   * @private
   */
  _testProxy(proxyName) {
    return new Promise((resolve) => {
      const path = `/proxies/${encodeURIComponent(proxyName)}/delay?timeout=5000&url=http%3A%2F%2Fwww.gstatic.com%2Fgenerate_204`
      const req = http.get(
        { hostname: this.apiHost, port: this.apiPort, path, timeout: 8000 },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => {
            try {
              const data = JSON.parse(body)
              resolve({ name: proxyName, delay: data.delay || Infinity, alive: data.delay > 0 })
            } catch {
              resolve({ name: proxyName, delay: Infinity, alive: false })
            }
          })
        }
      )
      req.on('error', () => resolve({ name: proxyName, delay: Infinity, alive: false }))
      req.on('timeout', () => {
        req.destroy()
        resolve({ name: proxyName, delay: Infinity, alive: false })
      })
    })
  }

  /**
   * 测试代理组中所有节点的延迟，返回按延迟排序的结果
   * @private
   */
  async _testAllProxies() {
    const groupInfo = await this._getProxyGroup()
    if (!groupInfo || !groupInfo.all) {
      return null
    }

    // 过滤掉非代理节点（如嵌套的组名）
    const allProxies = await this._getAllProxies()
    const realProxies = groupInfo.all.filter((name) => {
      const p = allProxies?.proxies?.[name]
      return (
        p &&
        p.type !== 'Selector' &&
        p.type !== 'Fallback' &&
        p.type !== 'URLTest' &&
        p.type !== 'Direct' &&
        p.type !== 'Reject'
      )
    })

    // 并发测试所有节点
    const results = await Promise.all(realProxies.map((name) => this._testProxy(name)))

    // 过滤存活节点并按延迟排序
    return results.filter((r) => r.alive && r.delay < Infinity).sort((a, b) => a.delay - b.delay)
  }

  /**
   * 手动触发测速和切换（供管理接口调用）
   * @returns {object} 测速结果
   */
  async manualSpeedTest() {
    const results = await this._testAllProxies()
    const groupInfo = await this._getProxyGroup()

    return {
      currentNode: groupInfo?.now,
      groupType: groupInfo?.type,
      results: results || [],
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 获取当前状态（供管理接口调用）
   */
  async getStatus() {
    const groupInfo = await this._getProxyGroup()

    return {
      enabled: this.enabled,
      initialized: this._initialized,
      proxyGroup: this.proxyGroup,
      currentNode: groupInfo?.now || this._currentNode,
      groupType: groupInfo?.type,
      errorCount: this._errorCount,
      errorThreshold: this.errorThreshold,
      lastSwitchTime: this._lastSwitchTime ? new Date(this._lastSwitchTime).toISOString() : null,
      cooldownMs: this.cooldownMs,
      cooldownRemaining: Math.max(0, this.cooldownMs - (Date.now() - this._lastSwitchTime)),
      config: {
        apiHost: this.apiHost,
        apiPort: this.apiPort,
        debounceMs: this.debounceMs
      }
    }
  }
}

// 单例导出
module.exports = new ClashProxyManager()
