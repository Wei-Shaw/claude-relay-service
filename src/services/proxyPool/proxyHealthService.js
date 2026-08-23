const axios = require('axios')

const logger = require('../../utils/logger')
const config = require('../../../config/config')
const redis = require('../../models/redis')
const ProxyHelper = require('../../utils/proxyHelper')
const proxyPoolService = require('./proxyPoolService')
const { classifyProxyError, classifyProxyErrorFromStatus } = require('./proxyPoolCore')

const SHARD_ID = `${require('os').hostname()}_${process.pid}`

// 并发执行（index 工作池）
const runConcurrent = async (items, fn, concurrency) => {
  let idx = 0
  const n = Math.min(concurrency, items.length)
  const workers = []
  for (let w = 0; w < n; w++) {
    workers.push(
      (async () => {
        while (idx < items.length) {
          const i = idx
          idx += 1
          try {
            await fn(items[i])
          } catch (error) {
            logger.error('❌ [ProxyHealth] concurrent task failed:', error)
          }
        }
      })()
    )
  }
  await Promise.all(workers)
}

// 质量检测目标（base 连通性 + 上游可达性）
const QUALITY_TARGETS = [
  {
    target: 'base_connectivity',
    method: 'get',
    url: 'http://ip-api.com/json/?fields=status,query,country,regionName,city,isp',
    expect: (status, data) => status === 200 && data && data.query
  },
  {
    target: 'openai',
    method: 'get',
    url: 'https://api.openai.com/v1/models',
    expect: (status) => status === 200 || status === 401
  },
  {
    target: 'anthropic',
    method: 'get',
    url: 'https://api.anthropic.com/v1/messages',
    expect: (status) => status === 400 || status === 401 || status === 405
  },
  {
    target: 'gemini',
    method: 'get',
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    expect: (status) => status === 200 || status === 400 || status === 403
  },
  {
    target: 'codex',
    method: 'get',
    url: 'https://chatgpt.com/backend-api/me',
    expect: (status) => status === 401 || status === 403 || status === 200
  }
]

// 代理健康检查 + 质量检测服务（分布式选主，只在 leader 实例执行）
class ProxyHealthService {
  constructor() {
    this.timer = null
    this.isChecking = false
    this.started = false
    this._loadConfig()
  }

  // 从 config.proxy.pool 读取健康检查参数（含 proxyPoolService 启动时合并进来的持久化设置）
  _loadConfig() {
    const pool = config.proxy?.pool || {}
    this.healthEnabled = pool.healthCheckEnabled !== false
    this.intervalMs = pool.healthCheckIntervalMs || 30000
    this.concurrency = pool.healthConcurrency || 10
    this.timeoutMs = pool.healthCheckTimeoutMs || 10000
    this.healthCheckUrl = pool.healthCheckUrl || 'https://api.anthropic.com'
  }

  start() {
    if (this.started) {
      return
    }
    this._loadConfig()
    if (config.proxy?.pool?.enabled === false || !this.healthEnabled) {
      logger.info('🌐 Proxy health check disabled')
      return
    }
    this.timer = setInterval(() => {
      this._tick().catch((e) => logger.error('❌ Proxy health tick failed:', e.message))
    }, this.intervalMs)
    this.started = true
    logger.success(`🌐 Proxy health check started (interval=${this.intervalMs}ms)`)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.started = false
  }

  // 设置变更后重载配置并重启定时器（间隔/超时/并发/开关立即生效）
  reconfigure() {
    this.stop()
    this.start()
  }

  // 一轮检查（分布式选主 + 本实例防重入）
  async _tick() {
    if (this.isChecking) {
      return
    }
    const proxies = proxyPoolService.getEnabledProxyConfigs()
    if (proxies.length === 0) {
      return
    }
    const { RedisKeys } = require('../../constants/redisKeys')
    const lockToken = `${SHARD_ID}:${Date.now()}`
    const estimatedMs = Math.ceil(proxies.length / this.concurrency) * this.timeoutMs + 10000
    const lockTtlMs = Math.max(estimatedMs, 30000)
    const acquired = await redis.setAccountLock(
      RedisKeys.proxy.healthCheckLock,
      lockToken,
      lockTtlMs
    )
    if (!acquired) {
      return
    }
    this.isChecking = true
    try {
      await runConcurrent(proxies, (p) => this.checkProxy(p), this.concurrency)
    } finally {
      this.isChecking = false
      await redis.releaseAccountLock(RedisKeys.proxy.healthCheckLock, lockToken)
    }
  }

  // 单代理健康检查：HEAD 探测。判定"代理能否到达上游"——只要收到任意 HTTP 响应（含 4xx/5xx）即算连通，
  // 仅网络层失败/超时才算不健康。因探测目标为需鉴权的上游（api.anthropic.com），无鉴权 HEAD 常返 4xx，
  // 沿用旧的 200-399 判定会把连通的代理全部误判为不健康。
  async checkProxy(proxyConfig) {
    const start = Date.now()
    const agent = ProxyHelper.createProxyAgentFromUrl(proxyConfig.url)
    let healthy = false
    let statusCode
    let errorMsg
    try {
      const res = await axios.request({
        method: 'head',
        url: this.healthCheckUrl,
        httpAgent: agent,
        httpsAgent: agent,
        proxy: false,
        timeout: this.timeoutMs,
        maxRedirects: 0,
        validateStatus: () => true
      })
      statusCode = res.status
      // 收到任意 HTTP 响应即证明代理能到达上游（validateStatus 恒 true，不会因状态码抛错）
      healthy = Number.isInteger(res.status) && res.status > 0
    } catch (error) {
      // 网络层失败/超时/连接被拒 → 代理不可用
      errorMsg = error.message
    }
    const latencyMs = Date.now() - start

    await proxyPoolService.onHealthChanged(proxyConfig.id, healthy)
    // 健康探测结果计入 per-context 统计（successIsTransport=true）
    const errorType = healthy
      ? undefined
      : statusCode
        ? classifyProxyErrorFromStatus(statusCode)
        : classifyProxyError(undefined, { message: errorMsg })
    proxyPoolService.recordResult(
      proxyConfig.id,
      'health_check',
      healthy,
      latencyMs,
      statusCode,
      errorType,
      true
    )
    await redis
      .pushProxyHealthHistory(proxyConfig.id, {
        healthy,
        latencyMs,
        statusCode: statusCode || null,
        error: errorMsg || null,
        checkedAt: new Date().toISOString()
      })
      .catch((error) => logger.error('❌ [ProxyHealth] push health history failed:', error))

    return { healthy, latencyMs, statusCode }
  }

  // 质量检测：5 项探测，返回 A-F 评分 + 出口 IP
  async checkProxyQuality(proxyId) {
    const proxyConfig = proxyPoolService.getProxyConfig(proxyId)
    if (!proxyConfig) {
      throw new Error('Proxy not found')
    }
    const agent = ProxyHelper.createProxyAgentFromUrl(proxyConfig.url)
    const items = []
    let exitIp = null
    let exitInfo = null

    for (const qualityTarget of QUALITY_TARGETS) {
      const start = Date.now()
      let httpStatus = 0
      let status = 'fail'
      let message = ''
      try {
        const res = await axios.request({
          method: qualityTarget.method,
          url: qualityTarget.url,
          httpAgent: agent,
          httpsAgent: agent,
          proxy: false,
          timeout: this.timeoutMs,
          maxRedirects: 0,
          validateStatus: () => true
        })
        httpStatus = res.status
        if (qualityTarget.expect(res.status, res.data)) {
          status = 'pass'
        } else if (res.status > 0) {
          status = 'warn'
          message = `unexpected status ${res.status}`
        }
        if (qualityTarget.target === 'base_connectivity' && res.data && res.data.query) {
          exitIp = res.data.query
          exitInfo = {
            ip: res.data.query,
            country: res.data.country || null,
            region: res.data.regionName || null,
            city: res.data.city || null,
            isp: res.data.isp || null,
            checkedAt: new Date().toISOString()
          }
        }
      } catch (error) {
        status = 'fail'
        message = error.message || 'error'
      }
      const latencyMs = Date.now() - start
      items.push({ target: qualityTarget.target, status, httpStatus, latencyMs, message })
      // 计入 per-context 统计
      proxyPoolService.recordResult(
        proxyId,
        `quality_${qualityTarget.target}`,
        status === 'pass',
        latencyMs,
        httpStatus || undefined,
        undefined,
        true
      )
    }

    // 评分：base 100，warn -10，fail -22
    let score = 100
    for (const item of items) {
      if (item.status === 'warn') {
        score -= 10
      } else if (item.status === 'fail') {
        score -= 22
      }
    }
    score = Math.max(0, score)
    const grade =
      score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
    const baseItem = items.find((item) => item.target === 'base_connectivity')

    const result = {
      proxyId,
      score,
      grade,
      exitIp,
      baseLatencyMs: baseItem ? baseItem.latencyMs : null,
      checkedAt: new Date().toISOString(),
      items
    }
    await redis
      .setProxyQualityResult(proxyId, result)
      .catch((error) => logger.error('❌ [ProxyHealth] save quality result failed:', error))
    if (exitInfo) {
      await redis
        .setProxyExitInfo(proxyId, exitInfo)
        .catch((error) => logger.error('❌ [ProxyHealth] save exit info failed:', error))
    }
    return result
  }
}

module.exports = new ProxyHealthService()
