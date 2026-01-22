const { v4: uuidv4 } = require('uuid')
const config = require('../../config/config')
const apiKeyService = require('../services/apiKeyService')
const userService = require('../services/userService')
const logger = require('../utils/logger')
const redis = require('../models/redis')
// const { RateLimiterRedis } = require('rate-limiter-flexible') // 暂时未使用
const ClientValidator = require('../validators/clientValidator')
const ClaudeCodeValidator = require('../validators/clients/claudeCodeValidator')
const claudeRelayConfigService = require('../services/claudeRelayConfigService')
const { calculateWaitTimeStats } = require('../utils/statsHelper')
const { isClaudeFamilyModel } = require('../utils/modelHelper')

// 工具函数
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 检查排队是否过载，决定是否应该快速失败
 * 详见 design.md Decision 7: 排队健康检查与快速失败
 *
 * @param {string} apiKeyId - API Key ID
 * @param {number} timeoutMs - 排队超时时间（毫秒）
 * @param {Object} queueConfig - 队列配置
 * @param {number} maxQueueSize - 最大排队数
 * @returns {Promise<Object>} { reject: boolean, reason?: string, estimatedWaitMs?: number, timeoutMs?: number }
 */
async function shouldRejectDueToOverload(apiKeyId, timeoutMs, queueConfig, maxQueueSize) {
  try {
    // 如果健康检查被禁用，直接返回不拒绝
    if (!queueConfig.concurrentRequestQueueHealthCheckEnabled) {
      return { reject: false, reason: 'health_check_disabled' }
    }

    // 🔑 先检查当前队列长度
    const currentQueueCount = await redis.getConcurrencyQueueCount(apiKeyId).catch(() => 0)

    // 队列为空，说明系统已恢复，跳过健康检查
    if (currentQueueCount === 0) {
      return { reject: false, reason: 'queue_empty', currentQueueCount: 0 }
    }

    // 🔑 关键改进：只有当队列接近满载时才进行健康检查
    // 队列长度 <= maxQueueSize * 0.5 时，认为系统有足够余量，跳过健康检查
    // 这避免了在队列较短时过于保守地拒绝请求
    // 使用 ceil 确保小队列（如 maxQueueSize=3）时阈值为 2，即队列 <=1 时跳过
    const queueLoadThreshold = Math.ceil(maxQueueSize * 0.5)
    if (currentQueueCount <= queueLoadThreshold) {
      return {
        reject: false,
        reason: 'queue_not_loaded',
        currentQueueCount,
        queueLoadThreshold,
        maxQueueSize
      }
    }

    // 获取该 API Key 的等待时间样本
    const waitTimes = await redis.getQueueWaitTimes(apiKeyId)
    const stats = calculateWaitTimeStats(waitTimes)

    // 样本不足（< 10），跳过健康检查，避免冷启动误判
    if (!stats || stats.sampleCount < 10) {
      return { reject: false, reason: 'insufficient_samples', sampleCount: stats?.sampleCount || 0 }
    }

    // P90 不可靠时也跳过（虽然 sampleCount >= 10 时 p90Unreliable 应该是 false）
    if (stats.p90Unreliable) {
      return { reject: false, reason: 'p90_unreliable', sampleCount: stats.sampleCount }
    }

    // 计算健康阈值：P90 >= 超时时间 × 阈值 时拒绝
    const threshold = queueConfig.concurrentRequestQueueHealthThreshold || 0.8
    const maxAllowedP90 = timeoutMs * threshold

    if (stats.p90 >= maxAllowedP90) {
      return {
        reject: true,
        reason: 'queue_overloaded',
        estimatedWaitMs: stats.p90,
        timeoutMs,
        threshold,
        sampleCount: stats.sampleCount,
        currentQueueCount,
        maxQueueSize
      }
    }

    return { reject: false, p90: stats.p90, sampleCount: stats.sampleCount, currentQueueCount }
  } catch (error) {
    // 健康检查出错时不阻塞请求，记录警告并继续
    logger.warn(`Health check failed for ${apiKeyId}:`, error.message)
    return { reject: false, reason: 'health_check_error', error: error.message }
  }
}

// 排队轮询配置常量（可通过配置文件覆盖）
// 性能权衡：初始间隔越短响应越快，但 Redis QPS 越高
// 当前配置：100 个等待者时约 250-300 QPS（指数退避后）
const QUEUE_POLLING_CONFIG = {
  pollIntervalMs: 200, // 初始轮询间隔（毫秒）- 平衡响应速度和 Redis 压力
  maxPollIntervalMs: 2000, // 最大轮询间隔（毫秒）- 长时间等待时降低 Redis 压力
  backoffFactor: 1.5, // 指数退避系数
  jitterRatio: 0.2, // 抖动比例（±20%）- 防止惊群效应
  maxRedisFailCount: 5 // 连续 Redis 失败阈值（从 3 提高到 5，提高网络抖动容忍度）
}

const FALLBACK_CONCURRENCY_CONFIG = {
  leaseSeconds: 300,
  renewIntervalSeconds: 30,
  cleanupGraceSeconds: 30
}

const resolveConcurrencyConfig = () => {
  if (typeof redis._getConcurrencyConfig === 'function') {
    return redis._getConcurrencyConfig()
  }

  const raw = {
    ...FALLBACK_CONCURRENCY_CONFIG,
    ...(config.concurrency || {})
  }

  const toNumber = (value, fallback) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return fallback
    }
    return parsed
  }

  const leaseSeconds = Math.max(
    toNumber(raw.leaseSeconds, FALLBACK_CONCURRENCY_CONFIG.leaseSeconds),
    30
  )

  let renewIntervalSeconds
  if (raw.renewIntervalSeconds === 0 || raw.renewIntervalSeconds === '0') {
    renewIntervalSeconds = 0
  } else {
    renewIntervalSeconds = Math.max(
      toNumber(raw.renewIntervalSeconds, FALLBACK_CONCURRENCY_CONFIG.renewIntervalSeconds),
      0
    )
  }

  const cleanupGraceSeconds = Math.max(
    toNumber(raw.cleanupGraceSeconds, FALLBACK_CONCURRENCY_CONFIG.cleanupGraceSeconds),
    0
  )

  return {
    leaseSeconds,
    renewIntervalSeconds,
    cleanupGraceSeconds
  }
}

const TOKEN_COUNT_PATHS = new Set([
  '/v1/messages/count_tokens',
  '/api/v1/messages/count_tokens',
  '/claude/v1/messages/count_tokens'
])

function extractApiKey(req) {
  const candidates = [
    req.headers['x-api-key'],
    req.headers['x-goog-api-key'],
    req.headers['authorization'],
    req.headers['api-key'],
    req.query?.key
  ]

  for (const candidate of candidates) {
    let value = candidate

    if (Array.isArray(value)) {
      value = value.find((item) => typeof item === 'string' && item.trim())
    }

    if (typeof value !== 'string') {
      continue
    }

    let trimmed = value.trim()
    if (!trimmed) {
      continue
    }

    if (/^Bearer\s+/i.test(trimmed)) {
      trimmed = trimmed.replace(/^Bearer\s+/i, '').trim()
      if (!trimmed) {
        continue
      }
    }

    return trimmed
  }

  return ''
}

function normalizeRequestPath(value) {
  if (!value) {
    return '/'
  }
  const lower = value.split('?')[0].toLowerCase()
  const collapsed = lower.replace(/\/{2,}/g, '/')
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1)
  }
  return collapsed || '/'
}

function isTokenCountRequest(req) {
  const combined = normalizeRequestPath(`${req.baseUrl || ''}${req.path || ''}`)
  if (TOKEN_COUNT_PATHS.has(combined)) {
    return true
  }
  const original = normalizeRequestPath(req.originalUrl || '')
  if (TOKEN_COUNT_PATHS.has(original)) {
    return true
  }
  return false
}

/**
 * 等待并发槽位（排队机制核心）
 *
 * 采用「先占后检查」模式避免竞态条件：
 * - 每次轮询时尝试 incrConcurrency 占位
 * - 如果超限则 decrConcurrency 释放并继续等待
 * - 成功获取槽位后返回，调用方无需再次 incrConcurrency
 *
 * ⚠️ 重要清理责任说明：
 * - 排队计数：此函数的 finally 块负责调用 decrConcurrencyQueue 清理
 * - 并发槽位：当返回 acquired=true 时，槽位已被占用（通过 incrConcurrency）
 *   调用方必须在请求结束时调用 decrConcurrency 释放槽位
 *   （已在 authenticateApiKey 的 finally 块中处理）
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {string} apiKeyId - API Key ID
 * @param {Object} queueOptions - 配置参数
 * @returns {Promise<Object>} { acquired: boolean, reason?: string, waitTimeMs: number }
 */
async function waitForConcurrencySlot(req, res, apiKeyId, queueOptions) {
  const {
    concurrencyLimit,
    requestId,
    leaseSeconds,
    timeoutMs,
    pollIntervalMs,
    maxPollIntervalMs,
    backoffFactor,
    jitterRatio,
    maxRedisFailCount: configMaxRedisFailCount
  } = queueOptions

  let clientDisconnected = false
  // 追踪轮询过程中是否临时占用了槽位（用于异常时清理）
  // 工作流程：
  // 1. incrConcurrency 成功且 count <= limit 时，设置 internalSlotAcquired = true
  // 2. 统计记录完成后，设置 internalSlotAcquired = false 并返回（所有权转移给调用方）
  // 3. 如果在步骤 1-2 之间发生异常，finally 块会检测到 internalSlotAcquired = true 并释放槽位
  let internalSlotAcquired = false

  // 监听客户端断开事件
  // ⚠️ 重要：必须监听 socket 的事件，而不是 req 的事件！
  // 原因：对于 POST 请求，当 body-parser 读取完请求体后，req（IncomingMessage 可读流）
  // 的 'close' 事件会立即触发，但这不代表客户端断开连接！客户端仍在等待响应。
  // socket 的 'close' 事件才是真正的连接关闭信号。
  const { socket } = req
  const onSocketClose = () => {
    clientDisconnected = true
    logger.debug(
      `🔌 [Queue] Socket closed during queue wait for API key ${apiKeyId}, requestId: ${requestId}`
    )
  }

  if (socket) {
    socket.once('close', onSocketClose)
  }

  // 检查 socket 是否在监听器注册前已被销毁（边界情况）
  if (socket?.destroyed) {
    clientDisconnected = true
  }

  const startTime = Date.now()
  let pollInterval = pollIntervalMs
  let redisFailCount = 0
  // 优先使用配置中的值，否则使用默认值
  const maxRedisFailCount = configMaxRedisFailCount || QUEUE_POLLING_CONFIG.maxRedisFailCount

  try {
    while (Date.now() - startTime < timeoutMs) {
      // 检测客户端是否断开（双重检查：事件标记 + socket 状态）
      // socket.destroyed 是同步检查，确保即使事件处理有延迟也能及时检测
      if (clientDisconnected || socket?.destroyed) {
        redis
          .incrConcurrencyQueueStats(apiKeyId, 'cancelled')
          .catch((e) => logger.warn('Failed to record cancelled stat:', e))
        return {
          acquired: false,
          reason: 'client_disconnected',
          waitTimeMs: Date.now() - startTime
        }
      }

      // 尝试获取槽位（先占后检查）
      try {
        const count = await redis.incrConcurrency(apiKeyId, requestId, leaseSeconds)
        redisFailCount = 0 // 重置失败计数

        if (count <= concurrencyLimit) {
          // 成功获取槽位！
          const waitTimeMs = Date.now() - startTime

          // 槽位所有权转移说明：
          // 1. 此时槽位已通过 incrConcurrency 获取
          // 2. 先标记 internalSlotAcquired = true，确保异常时 finally 块能清理
          // 3. 统计操作完成后，清除标记并返回，所有权转移给调用方
          // 4. 调用方（authenticateApiKey）负责在请求结束时释放槽位

          // 标记槽位已获取（用于异常时 finally 块清理）
          internalSlotAcquired = true

          // 记录统计（非阻塞，fire-and-forget 模式）
          // ⚠️ 设计说明：
          // - 故意不 await 这些 Promise，因为统计记录不应阻塞请求处理
          // - 每个 Promise 都有独立的 .catch()，确保单个失败不影响其他
          // - 外层 .catch() 是防御性措施，处理 Promise.all 本身的异常
          // - 即使统计记录在函数返回后才完成/失败，也是安全的（仅日志记录）
          // - 统计数据丢失可接受，不影响核心业务逻辑
          Promise.all([
            redis
              .recordQueueWaitTime(apiKeyId, waitTimeMs)
              .catch((e) => logger.warn('Failed to record queue wait time:', e)),
            redis
              .recordGlobalQueueWaitTime(waitTimeMs)
              .catch((e) => logger.warn('Failed to record global wait time:', e)),
            redis
              .incrConcurrencyQueueStats(apiKeyId, 'success')
              .catch((e) => logger.warn('Failed to increment success stats:', e))
          ]).catch((e) => logger.warn('Failed to record queue stats batch:', e))

          // 成功返回前清除标记（所有权转移给调用方，由其负责释放）
          internalSlotAcquired = false
          return { acquired: true, waitTimeMs }
        }

        // 超限，释放槽位继续等待
        try {
          await redis.decrConcurrency(apiKeyId, requestId)
        } catch (decrError) {
          // 释放失败时记录警告但继续轮询
          // 下次 incrConcurrency 会自然覆盖同一 requestId 的条目
          logger.warn(
            `Failed to release slot during polling for ${apiKeyId}, will retry:`,
            decrError
          )
        }
      } catch (redisError) {
        redisFailCount++
        logger.error(
          `Redis error in queue polling (${redisFailCount}/${maxRedisFailCount}):`,
          redisError
        )

        if (redisFailCount >= maxRedisFailCount) {
          // 连续 Redis 失败，放弃排队
          return {
            acquired: false,
            reason: 'redis_error',
            waitTimeMs: Date.now() - startTime
          }
        }
      }

      // 指数退避等待
      await sleep(pollInterval)

      // 计算下一次轮询间隔（指数退避 + 抖动）
      // 1. 先应用指数退避
      let nextInterval = pollInterval * backoffFactor
      // 2. 添加抖动防止惊群效应（±jitterRatio 范围内的随机偏移）
      //    抖动范围：[-jitterRatio, +jitterRatio]，例如 jitterRatio=0.2 时为 ±20%
      //    这是预期行为：负抖动可使间隔略微缩短，正抖动可使间隔略微延长
      //    目的是分散多个等待者的轮询时间点，避免同时请求 Redis
      const jitter = nextInterval * jitterRatio * (Math.random() * 2 - 1)
      nextInterval = nextInterval + jitter
      // 3. 确保在合理范围内：最小 1ms，最大 maxPollIntervalMs
      //    Math.max(1, ...) 保证即使负抖动也不会产生 ≤0 的间隔
      pollInterval = Math.max(1, Math.min(nextInterval, maxPollIntervalMs))
    }

    // 超时
    redis
      .incrConcurrencyQueueStats(apiKeyId, 'timeout')
      .catch((e) => logger.warn('Failed to record timeout stat:', e))
    return { acquired: false, reason: 'timeout', waitTimeMs: Date.now() - startTime }
  } finally {
    // 确保清理：
    // 1. 减少排队计数（排队计数在调用方已增加，这里负责减少）
    try {
      await redis.decrConcurrencyQueue(apiKeyId)
    } catch (cleanupError) {
      // 清理失败记录错误（可能导致计数泄漏，但有 TTL 保护）
      logger.error(
        `Failed to decrement queue count in finally block for ${apiKeyId}:`,
        cleanupError
      )
    }

    // 2. 如果内部获取了槽位但未正常返回（异常路径），释放槽位
    if (internalSlotAcquired) {
      try {
        await redis.decrConcurrency(apiKeyId, requestId)
        logger.warn(
          `⚠️ Released orphaned concurrency slot in finally block for ${apiKeyId}, requestId: ${requestId}`
        )
      } catch (slotCleanupError) {
        logger.error(
          `Failed to release orphaned concurrency slot for ${apiKeyId}:`,
          slotCleanupError
        )
      }
    }

    // 清理 socket 事件监听器
    if (socket) {
      socket.removeListener('close', onSocketClose)
    }
  }
}

// 🔑 API Key验证中间件（优化版）
const authenticateApiKey = async (req, res, next) => {
  const startTime = Date.now()
  let authErrored = false
  let concurrencyCleanup = null
  let hasConcurrencySlot = false

  try {
    // 安全提取API Key，支持多种格式（包括Gemini CLI支持）
    const apiKey = extractApiKey(req)

    if (apiKey) {
      req.headers['x-api-key'] = apiKey
    }

    if (!apiKey) {
      logger.security(`Missing API key attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Missing API key',
        message:
          'Please provide an API key in the x-api-key, x-goog-api-key, or Authorization header'
      })
    }

    // 基本API Key格式验证
    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      logger.security(`Invalid API key format from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    // 验证API Key（带缓存优化）
    const validation = await apiKeyService.validateApiKey(apiKey)

    if (!validation.valid) {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
      logger.security(`Invalid API key attempt: ${validation.error} from ${clientIP}`)
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    const skipKeyRestrictions = isTokenCountRequest(req)

    // 🔒 检查客户端限制（使用新的验证器）
    if (
      !skipKeyRestrictions &&
      validation.keyData.enableClientRestriction &&
      validation.keyData.allowedClients?.length > 0
    ) {
      // 使用新的 ClientValidator 进行验证
      const validationResult = ClientValidator.validateRequest(
        validation.keyData.allowedClients,
        req
      )

      if (!validationResult.allowed) {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
        logger.security(
          `🚫 Client restriction failed for key: ${validation.keyData.id} (${validation.keyData.name}) from ${clientIP}`
        )
        return res.status(403).json({
          error: 'Client not allowed',
          message: 'Your client is not authorized to use this API key',
          allowedClients: validation.keyData.allowedClients,
          userAgent: validationResult.userAgent
        })
      }

      // 验证通过
      logger.api(
        `✅ Client validated: ${validationResult.clientName} (${validationResult.matchedClient}) for key: ${validation.keyData.id} (${validation.keyData.name})`
      )
    }

    // 🔒 检查全局 Claude Code 限制（与 API Key 级别是 OR 逻辑）
    // 仅对 Claude 服务端点生效 (/api/v1/messages 和 /claude/v1/messages)
    if (!skipKeyRestrictions) {
      const normalizedPath = (req.originalUrl || req.path || '').toLowerCase()
      const isClaudeMessagesEndpoint =
        normalizedPath.includes('/v1/messages') &&
        (normalizedPath.startsWith('/api') || normalizedPath.startsWith('/claude'))

      if (isClaudeMessagesEndpoint) {
        try {
          const globalClaudeCodeOnly = await claudeRelayConfigService.isClaudeCodeOnlyEnabled()

          // API Key 级别的 Claude Code 限制
          const keyClaudeCodeOnly =
            validation.keyData.enableClientRestriction &&
            Array.isArray(validation.keyData.allowedClients) &&
            validation.keyData.allowedClients.length === 1 &&
            validation.keyData.allowedClients.includes('claude_code')

          // OR 逻辑：全局开启 或 API Key 级别限制为仅 claude_code
          if (globalClaudeCodeOnly || keyClaudeCodeOnly) {
            const isClaudeCode = ClaudeCodeValidator.validate(req)

            if (!isClaudeCode) {
              const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
              logger.api(
                `❌ Claude Code client validation failed (global: ${globalClaudeCodeOnly}, key: ${keyClaudeCodeOnly}) from ${clientIP}`
              )
              return res.status(403).json({
                error: {
                  type: 'client_validation_error',
                  message: 'This endpoint only accepts requests from Claude Code CLI'
                }
              })
            }

            logger.api(
              `✅ Claude Code client validated (global: ${globalClaudeCodeOnly}, key: ${keyClaudeCodeOnly})`
            )
          }
        } catch (error) {
          logger.error('❌ Error checking Claude Code restriction:', error)
          // 配置服务出错时不阻断请求
        }
      }
    }

    // 检查并发限制
    const concurrencyLimit = validation.keyData.concurrencyLimit || 0
    if (!skipKeyRestrictions && concurrencyLimit > 0) {
      const { leaseSeconds: configLeaseSeconds, renewIntervalSeconds: configRenewIntervalSeconds } =
        resolveConcurrencyConfig()
      const leaseSeconds = Math.max(Number(configLeaseSeconds) || 300, 30)
      let renewIntervalSeconds = configRenewIntervalSeconds
      if (renewIntervalSeconds > 0) {
        const maxSafeRenew = Math.max(leaseSeconds - 5, 15)
        renewIntervalSeconds = Math.min(Math.max(renewIntervalSeconds, 15), maxSafeRenew)
      } else {
        renewIntervalSeconds = 0
      }
      const requestId = uuidv4()

      // ⚠️ 优化后的 Connection: close 设置策略
      // 问题背景：HTTP Keep-Alive 使多个请求共用同一个 TCP 连接
      // 当第一个请求正在处理，第二个请求进入排队时，它们共用同一个 socket
      // 如果客户端超时关闭连接，两个请求都会受影响
      // 优化方案：只有在请求实际进入排队时才设置 Connection: close
      // 未排队的请求保持 Keep-Alive，避免不必要的 TCP 握手开销
      // 详见 design.md Decision 2: Connection: close 设置时机
      // 注意：Connection: close 将在下方代码实际进入排队时设置（第 637 行左右）

      // ============================================================
      // 🔒 并发槽位状态管理说明
      // ============================================================
      // 此函数中有两个关键状态变量：
      // - hasConcurrencySlot: 当前是否持有并发槽位
      // - concurrencyCleanup: 错误时调用的清理函数
      //
      // 状态转换流程：
      // 1. incrConcurrency 成功 → hasConcurrencySlot=true, 设置临时清理函数
      // 2. 若超限 → 释放槽位，hasConcurrencySlot=false, concurrencyCleanup=null
      // 3. 若排队成功 → hasConcurrencySlot=true, 升级为完整清理函数（含 interval 清理）
      // 4. 请求结束（res.close/req.close）→ 调用 decrementConcurrency 释放
      // 5. 认证错误 → finally 块调用 concurrencyCleanup 释放
      //
      // 为什么需要两种清理函数？
      // - 临时清理：在排队/认证过程中出错时使用，只释放槽位
      // - 完整清理：请求正常开始后使用，还需清理 leaseRenewInterval
      // ============================================================
      const setTemporaryConcurrencyCleanup = () => {
        concurrencyCleanup = async () => {
          if (!hasConcurrencySlot) {
            return
          }
          hasConcurrencySlot = false
          try {
            await redis.decrConcurrency(validation.keyData.id, requestId)
          } catch (cleanupError) {
            logger.error(
              `Failed to decrement concurrency after auth error for key ${validation.keyData.id}:`,
              cleanupError
            )
          }
        }
      }

      const currentConcurrency = await redis.incrConcurrency(
        validation.keyData.id,
        requestId,
        leaseSeconds
      )
      hasConcurrencySlot = true
      setTemporaryConcurrencyCleanup()
      logger.api(
        `📈 Incremented concurrency for key: ${validation.keyData.id} (${validation.keyData.name}), current: ${currentConcurrency}, limit: ${concurrencyLimit}`
      )

      if (currentConcurrency > concurrencyLimit) {
        // 1. 先释放刚占用的槽位
        try {
          await redis.decrConcurrency(validation.keyData.id, requestId)
        } catch (error) {
          logger.error(
            `Failed to decrement concurrency after limit exceeded for key ${validation.keyData.id}:`,
            error
          )
        }
        hasConcurrencySlot = false
        concurrencyCleanup = null

        // 2. 获取排队配置
        const queueConfig = await claudeRelayConfigService.getConfig()

        // 3. 排队功能未启用，直接返回 429（保持现有行为）
        if (!queueConfig.concurrentRequestQueueEnabled) {
          logger.security(
            `🚦 Concurrency limit exceeded for key: ${validation.keyData.id} (${
              validation.keyData.name
            }), current: ${currentConcurrency - 1}, limit: ${concurrencyLimit}`
          )
          // 建议客户端在短暂延迟后重试（并发场景下通常很快会有槽位释放）
          res.set('Retry-After', '1')
          return res.status(429).json({
            error: 'Concurrency limit exceeded',
            message: `Too many concurrent requests. Limit: ${concurrencyLimit} concurrent requests`,
            currentConcurrency: currentConcurrency - 1,
            concurrencyLimit
          })
        }

        // 4. 计算最大排队数
        const maxQueueSize = Math.max(
          concurrencyLimit * queueConfig.concurrentRequestQueueMaxSizeMultiplier,
          queueConfig.concurrentRequestQueueMaxSize
        )

        // 4.5 排队健康检查：过载时快速失败
        // 详见 design.md Decision 7: 排队健康检查与快速失败
        const overloadCheck = await shouldRejectDueToOverload(
          validation.keyData.id,
          queueConfig.concurrentRequestQueueTimeoutMs,
          queueConfig,
          maxQueueSize
        )
        if (overloadCheck.reject) {
          // 使用健康检查返回的当前排队数，避免重复调用 Redis
          const currentQueueCount = overloadCheck.currentQueueCount || 0
          logger.api(
            `🚨 Queue overloaded for key: ${validation.keyData.id} (${validation.keyData.name}), ` +
              `P90=${overloadCheck.estimatedWaitMs}ms, timeout=${overloadCheck.timeoutMs}ms, ` +
              `threshold=${overloadCheck.threshold}, samples=${overloadCheck.sampleCount}, ` +
              `concurrency=${concurrencyLimit}, queue=${currentQueueCount}/${maxQueueSize}`
          )
          // 记录被拒绝的过载统计
          redis
            .incrConcurrencyQueueStats(validation.keyData.id, 'rejected_overload')
            .catch((e) => logger.warn('Failed to record rejected_overload stat:', e))
          // 返回 429 + Retry-After，让客户端稍后重试
          const retryAfterSeconds = 30
          res.set('Retry-After', String(retryAfterSeconds))
          return res.status(429).json({
            error: 'Queue overloaded',
            message: `Queue is overloaded. Estimated wait time (${overloadCheck.estimatedWaitMs}ms) exceeds threshold. Limit: ${concurrencyLimit} concurrent requests, queue: ${currentQueueCount}/${maxQueueSize}. Please retry later.`,
            currentConcurrency: concurrencyLimit,
            concurrencyLimit,
            queueCount: currentQueueCount,
            maxQueueSize,
            estimatedWaitMs: overloadCheck.estimatedWaitMs,
            timeoutMs: overloadCheck.timeoutMs,
            queueTimeoutMs: queueConfig.concurrentRequestQueueTimeoutMs,
            retryAfterSeconds
          })
        }

        // 5. 尝试进入排队（原子操作：先增加再检查，避免竞态条件）
        let queueIncremented = false
        try {
          const newQueueCount = await redis.incrConcurrencyQueue(
            validation.keyData.id,
            queueConfig.concurrentRequestQueueTimeoutMs
          )
          queueIncremented = true

          if (newQueueCount > maxQueueSize) {
            // 超过最大排队数，立即释放并返回 429
            await redis.decrConcurrencyQueue(validation.keyData.id)
            queueIncremented = false
            logger.api(
              `🚦 Concurrency queue full for key: ${validation.keyData.id} (${validation.keyData.name}), ` +
                `queue: ${newQueueCount - 1}, maxQueue: ${maxQueueSize}`
            )
            // 队列已满，建议客户端在排队超时时间后重试
            const retryAfterSeconds = Math.ceil(queueConfig.concurrentRequestQueueTimeoutMs / 1000)
            res.set('Retry-After', String(retryAfterSeconds))
            return res.status(429).json({
              error: 'Concurrency queue full',
              message: `Too many requests waiting in queue. Limit: ${concurrencyLimit} concurrent requests, queue: ${newQueueCount - 1}/${maxQueueSize}, timeout: ${retryAfterSeconds}s`,
              currentConcurrency: concurrencyLimit,
              concurrencyLimit,
              queueCount: newQueueCount - 1,
              maxQueueSize,
              queueTimeoutMs: queueConfig.concurrentRequestQueueTimeoutMs,
              retryAfterSeconds
            })
          }

          // 6. 已成功进入排队，记录统计并开始等待槽位
          logger.api(
            `⏳ Request entering queue for key: ${validation.keyData.id} (${validation.keyData.name}), ` +
              `queue position: ${newQueueCount}`
          )
          redis
            .incrConcurrencyQueueStats(validation.keyData.id, 'entered')
            .catch((e) => logger.warn('Failed to record entered stat:', e))

          // ⚠️ 仅在请求实际进入排队时设置 Connection: close
          // 详见 design.md Decision 2: Connection: close 设置时机
          // 未排队的请求保持 Keep-Alive，避免不必要的 TCP 握手开销
          if (!res.headersSent) {
            res.setHeader('Connection', 'close')
            logger.api(
              `🔌 [Queue] Set Connection: close for queued request, key: ${validation.keyData.id}`
            )
          }

          // ⚠️ 记录排队开始时的 socket 标识，用于排队完成后验证
          // 问题背景：HTTP Keep-Alive 连接复用时，长时间排队可能导致 socket 被其他请求使用
          // 验证方法：使用 UUID token + socket 对象引用双重验证
          // 详见 design.md Decision 1: Socket 身份验证机制
          req._crService = req._crService || {}
          req._crService.queueToken = uuidv4()
          req._crService.originalSocket = req.socket
          req._crService.startTime = Date.now()
          const savedToken = req._crService.queueToken
          const savedSocket = req._crService.originalSocket

          // ⚠️ 重要：在调用前将 queueIncremented 设为 false
          // 因为 waitForConcurrencySlot 的 finally 块会负责清理排队计数
          // 如果在调用后设置，当 waitForConcurrencySlot 抛出异常时
          // 外层 catch 块会重复减少计数（finally 已经减过一次）
          queueIncremented = false

          const slot = await waitForConcurrencySlot(req, res, validation.keyData.id, {
            concurrencyLimit,
            requestId,
            leaseSeconds,
            timeoutMs: queueConfig.concurrentRequestQueueTimeoutMs,
            pollIntervalMs: QUEUE_POLLING_CONFIG.pollIntervalMs,
            maxPollIntervalMs: QUEUE_POLLING_CONFIG.maxPollIntervalMs,
            backoffFactor: QUEUE_POLLING_CONFIG.backoffFactor,
            jitterRatio: QUEUE_POLLING_CONFIG.jitterRatio,
            maxRedisFailCount: queueConfig.concurrentRequestQueueMaxRedisFailCount
          })

          // 7. 处理排队结果
          if (!slot.acquired) {
            if (slot.reason === 'client_disconnected') {
              // 客户端已断开，不返回响应（连接已关闭）
              logger.api(
                `🔌 Client disconnected while queuing for key: ${validation.keyData.id} (${validation.keyData.name})`
              )
              return
            }

            if (slot.reason === 'redis_error') {
              // Redis 连续失败，返回 503
              logger.error(
                `❌ Redis error during queue wait for key: ${validation.keyData.id} (${validation.keyData.name})`
              )
              return res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Failed to acquire concurrency slot due to internal error'
              })
            }
            // 排队超时（使用 api 级别，与其他排队日志保持一致）
            logger.api(
              `⏰ Queue timeout for key: ${validation.keyData.id} (${validation.keyData.name}), waited: ${slot.waitTimeMs}ms`
            )
            // 已等待超时，建议客户端稍后重试
            // ⚠️ Retry-After 策略优化：
            // - 请求已经等了完整的 timeout 时间，说明系统负载较高
            // - 过早重试（如固定 5 秒）会加剧拥塞，导致更多超时
            // - 合理策略：使用 timeout 时间的一半作为重试间隔
            // - 最小值 5 秒，最大值 30 秒，避免极端情况
            const timeoutSeconds = Math.ceil(queueConfig.concurrentRequestQueueTimeoutMs / 1000)
            const retryAfterSeconds = Math.max(5, Math.min(30, Math.ceil(timeoutSeconds / 2)))
            res.set('Retry-After', String(retryAfterSeconds))
            return res.status(429).json({
              error: 'Queue timeout',
              message: `Request timed out waiting for concurrency slot. Limit: ${concurrencyLimit} concurrent requests, maxQueue: ${maxQueueSize}, Queue timeout: ${timeoutSeconds}s, waited: ${slot.waitTimeMs}ms`,
              currentConcurrency: concurrencyLimit,
              concurrencyLimit,
              maxQueueSize,
              queueTimeoutMs: queueConfig.concurrentRequestQueueTimeoutMs,
              waitTimeMs: slot.waitTimeMs,
              retryAfterSeconds
            })
          }

          // 8. 排队成功，slot.acquired 表示已在 waitForConcurrencySlot 中获取到槽位
          logger.api(
            `✅ Queue wait completed for key: ${validation.keyData.id} (${validation.keyData.name}), ` +
              `waited: ${slot.waitTimeMs}ms`
          )
          hasConcurrencySlot = true
          setTemporaryConcurrencyCleanup()

          // 9. ⚠️ 关键检查：排队等待结束后，验证客户端是否还在等待响应
          // 长时间排队后，客户端可能在应用层已放弃（如 Claude Code 的超时机制），
          // 但 TCP 连接仍然存活。此时继续处理请求是浪费资源。
          // 注意：如果发送了心跳，headersSent 会是 true，但这是正常的
          const postQueueSocket = req.socket
          // 只检查连接是否真正断开（destroyed/writableEnded/socketDestroyed）
          // headersSent 在心跳场景下是正常的，不应该作为放弃的依据
          if (res.destroyed || res.writableEnded || postQueueSocket?.destroyed) {
            logger.warn(
              `⚠️ Client no longer waiting after queue for key: ${validation.keyData.id} (${validation.keyData.name}), ` +
                `waited: ${slot.waitTimeMs}ms | destroyed: ${res.destroyed}, ` +
                `writableEnded: ${res.writableEnded}, socketDestroyed: ${postQueueSocket?.destroyed}`
            )
            // 释放刚获取的槽位
            hasConcurrencySlot = false
            await redis
              .decrConcurrency(validation.keyData.id, requestId)
              .catch((e) => logger.error('Failed to release slot after client abandoned:', e))
            // 不返回响应（客户端已不在等待）
            return
          }

          // 10. ⚠️ 关键检查：验证 socket 身份是否改变
          // HTTP Keep-Alive 连接复用可能导致排队期间 socket 被其他请求使用
          // 验证方法：UUID token + socket 对象引用双重验证
          // 详见 design.md Decision 1: Socket 身份验证机制
          const queueData = req._crService
          const socketIdentityChanged =
            !queueData ||
            queueData.queueToken !== savedToken ||
            queueData.originalSocket !== savedSocket

          if (socketIdentityChanged) {
            logger.error(
              `❌ [Queue] Socket identity changed during queue wait! ` +
                `key: ${validation.keyData.id} (${validation.keyData.name}), ` +
                `waited: ${slot.waitTimeMs}ms | ` +
                `tokenMatch: ${queueData?.queueToken === savedToken}, ` +
                `socketMatch: ${queueData?.originalSocket === savedSocket}`
            )
            // 释放刚获取的槽位
            hasConcurrencySlot = false
            await redis
              .decrConcurrency(validation.keyData.id, requestId)
              .catch((e) => logger.error('Failed to release slot after socket identity change:', e))
            // 记录 socket_changed 统计
            redis
              .incrConcurrencyQueueStats(validation.keyData.id, 'socket_changed')
              .catch((e) => logger.warn('Failed to record socket_changed stat:', e))
            // 不返回响应（socket 已被其他请求使用）
            return
          }
        } catch (queueError) {
          // 异常时清理资源，防止泄漏
          // 1. 清理排队计数（如果还没被 waitForConcurrencySlot 的 finally 清理）
          if (queueIncremented) {
            await redis
              .decrConcurrencyQueue(validation.keyData.id)
              .catch((e) => logger.error('Failed to cleanup queue count after error:', e))
          }

          // 2. 防御性清理：如果 waitForConcurrencySlot 内部获取了槽位但在返回前异常
          //    虽然这种情况极少发生（统计记录的异常会被内部捕获），但为了安全起见
          //    尝试释放可能已获取的槽位。decrConcurrency 使用 ZREM，即使成员不存在也安全
          if (hasConcurrencySlot) {
            hasConcurrencySlot = false
            await redis
              .decrConcurrency(validation.keyData.id, requestId)
              .catch((e) =>
                logger.error('Failed to cleanup concurrency slot after queue error:', e)
              )
          }

          throw queueError
        }
      }

      const renewIntervalMs =
        renewIntervalSeconds > 0 ? Math.max(renewIntervalSeconds * 1000, 15000) : 0

      // 使用标志位确保只减少一次
      let concurrencyDecremented = false
      let leaseRenewInterval = null

      if (renewIntervalMs > 0) {
        // 🔴 关键修复：添加最大刷新次数限制，防止租约永不过期
        // 默认最大生存时间为 10 分钟，可通过环境变量配置
        const maxLifetimeMinutes = parseInt(process.env.CONCURRENCY_MAX_LIFETIME_MINUTES) || 10
        const maxRefreshCount = Math.ceil((maxLifetimeMinutes * 60 * 1000) / renewIntervalMs)
        let refreshCount = 0

        leaseRenewInterval = setInterval(() => {
          refreshCount++

          // 超过最大刷新次数，强制停止并清理
          if (refreshCount > maxRefreshCount) {
            logger.warn(
              `⚠️ Lease refresh exceeded max count (${maxRefreshCount}) for key ${validation.keyData.id} (${validation.keyData.name}), forcing cleanup after ${maxLifetimeMinutes} minutes`
            )
            // 清理定时器
            if (leaseRenewInterval) {
              clearInterval(leaseRenewInterval)
              leaseRenewInterval = null
            }
            // 强制减少并发计数（如果还没减少）
            if (!concurrencyDecremented) {
              concurrencyDecremented = true
              redis.decrConcurrency(validation.keyData.id, requestId).catch((error) => {
                logger.error(
                  `Failed to decrement concurrency after max refresh for key ${validation.keyData.id}:`,
                  error
                )
              })
            }
            return
          }

          redis
            .refreshConcurrencyLease(validation.keyData.id, requestId, leaseSeconds)
            .catch((error) => {
              logger.error(
                `Failed to refresh concurrency lease for key ${validation.keyData.id}:`,
                error
              )
            })
        }, renewIntervalMs)

        if (typeof leaseRenewInterval.unref === 'function') {
          leaseRenewInterval.unref()
        }
      }

      const decrementConcurrency = async () => {
        if (!concurrencyDecremented) {
          concurrencyDecremented = true
          hasConcurrencySlot = false
          if (leaseRenewInterval) {
            clearInterval(leaseRenewInterval)
            leaseRenewInterval = null
          }
          try {
            const newCount = await redis.decrConcurrency(validation.keyData.id, requestId)
            logger.api(
              `📉 Decremented concurrency for key: ${validation.keyData.id} (${validation.keyData.name}), new count: ${newCount}`
            )
          } catch (error) {
            logger.error(`Failed to decrement concurrency for key ${validation.keyData.id}:`, error)
          }
        }
      }
      // 升级为完整清理函数（包含 leaseRenewInterval 清理逻辑）
      // 此时请求已通过认证，后续由 res.close/req.close 事件触发清理
      if (hasConcurrencySlot) {
        concurrencyCleanup = decrementConcurrency
      }

      // 监听最可靠的事件（避免重复监听）
      // res.on('close') 是最可靠的，会在连接关闭时触发
      res.once('close', () => {
        logger.api(
          `🔌 Response closed for key: ${validation.keyData.id} (${validation.keyData.name})`
        )
        decrementConcurrency()
      })

      // req.on('close') 作为备用，处理请求端断开
      req.once('close', () => {
        logger.api(
          `🔌 Request closed for key: ${validation.keyData.id} (${validation.keyData.name})`
        )
        decrementConcurrency()
      })

      req.once('aborted', () => {
        logger.warn(
          `⚠️ Request aborted for key: ${validation.keyData.id} (${validation.keyData.name})`
        )
        decrementConcurrency()
      })

      req.once('error', (error) => {
        logger.error(
          `❌ Request error for key ${validation.keyData.id} (${validation.keyData.name}):`,
          error
        )
        decrementConcurrency()
      })

      res.once('error', (error) => {
        logger.error(
          `❌ Response error for key ${validation.keyData.id} (${validation.keyData.name}):`,
          error
        )
        decrementConcurrency()
      })

      // res.on('finish') 处理正常完成的情况
      res.once('finish', () => {
        logger.api(
          `✅ Response finished for key: ${validation.keyData.id} (${validation.keyData.name})`
        )
        decrementConcurrency()
      })

      // 存储并发信息到请求对象，便于后续处理
      req.concurrencyInfo = {
        apiKeyId: validation.keyData.id,
        apiKeyName: validation.keyData.name,
        requestId,
        decrementConcurrency
      }
    }

    // 检查时间窗口限流
    const rateLimitWindow = validation.keyData.rateLimitWindow || 0
    const rateLimitRequests = validation.keyData.rateLimitRequests || 0
    const rateLimitCost = validation.keyData.rateLimitCost || 0 // 新增：费用限制

    // 兼容性检查：如果tokenLimit仍有值，使用tokenLimit；否则使用rateLimitCost
    const hasRateLimits =
      rateLimitWindow > 0 &&
      (rateLimitRequests > 0 || validation.keyData.tokenLimit > 0 || rateLimitCost > 0)

    if (hasRateLimits) {
      const windowStartKey = `rate_limit:window_start:${validation.keyData.id}`
      const requestCountKey = `rate_limit:requests:${validation.keyData.id}`
      const tokenCountKey = `rate_limit:tokens:${validation.keyData.id}`
      const costCountKey = `rate_limit:cost:${validation.keyData.id}` // 新增：费用计数器

      const now = Date.now()
      const windowDuration = rateLimitWindow * 60 * 1000 // 转换为毫秒

      // 获取窗口开始时间
      let windowStart = await redis.getClient().get(windowStartKey)

      if (!windowStart) {
        // 第一次请求，设置窗口开始时间
        await redis.getClient().set(windowStartKey, now, 'PX', windowDuration)
        await redis.getClient().set(requestCountKey, 0, 'PX', windowDuration)
        await redis.getClient().set(tokenCountKey, 0, 'PX', windowDuration)
        await redis.getClient().set(costCountKey, 0, 'PX', windowDuration) // 新增：重置费用
        windowStart = now
      } else {
        windowStart = parseInt(windowStart)

        // 检查窗口是否已过期
        if (now - windowStart >= windowDuration) {
          // 窗口已过期，重置
          await redis.getClient().set(windowStartKey, now, 'PX', windowDuration)
          await redis.getClient().set(requestCountKey, 0, 'PX', windowDuration)
          await redis.getClient().set(tokenCountKey, 0, 'PX', windowDuration)
          await redis.getClient().set(costCountKey, 0, 'PX', windowDuration) // 新增：重置费用
          windowStart = now
        }
      }

      // 获取当前计数
      const currentRequests = parseInt((await redis.getClient().get(requestCountKey)) || '0')
      const currentTokens = parseInt((await redis.getClient().get(tokenCountKey)) || '0')
      const currentCost = parseFloat((await redis.getClient().get(costCountKey)) || '0') // 新增：当前费用

      // 检查请求次数限制
      if (rateLimitRequests > 0 && currentRequests >= rateLimitRequests) {
        const resetTime = new Date(windowStart + windowDuration)
        const remainingMinutes = Math.ceil((resetTime - now) / 60000)

        logger.security(
          `🚦 Rate limit exceeded (requests) for key: ${validation.keyData.id} (${validation.keyData.name}), requests: ${currentRequests}/${rateLimitRequests}`
        )

        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `已达到请求次数限制 (${rateLimitRequests} 次)，将在 ${remainingMinutes} 分钟后重置`,
          currentRequests,
          requestLimit: rateLimitRequests,
          resetAt: resetTime.toISOString(),
          remainingMinutes
        })
      }

      // 兼容性检查：优先使用Token限制（历史数据），否则使用费用限制
      const tokenLimit = parseInt(validation.keyData.tokenLimit)
      if (tokenLimit > 0) {
        // 使用Token限制（向后兼容）
        if (currentTokens >= tokenLimit) {
          const resetTime = new Date(windowStart + windowDuration)
          const remainingMinutes = Math.ceil((resetTime - now) / 60000)

          logger.security(
            `🚦 Rate limit exceeded (tokens) for key: ${validation.keyData.id} (${validation.keyData.name}), tokens: ${currentTokens}/${tokenLimit}`
          )

          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `已达到 Token 使用限制 (${tokenLimit} tokens)，将在 ${remainingMinutes} 分钟后重置`,
            currentTokens,
            tokenLimit,
            resetAt: resetTime.toISOString(),
            remainingMinutes
          })
        }
      } else if (rateLimitCost > 0) {
        // 使用费用限制（新功能）
        if (currentCost >= rateLimitCost) {
          const resetTime = new Date(windowStart + windowDuration)
          const remainingMinutes = Math.ceil((resetTime - now) / 60000)

          logger.security(
            `💰 Rate limit exceeded (cost) for key: ${validation.keyData.id} (${
              validation.keyData.name
            }), cost: $${currentCost.toFixed(2)}/$${rateLimitCost}`
          )

          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `已达到费用限制 ($${rateLimitCost})，将在 ${remainingMinutes} 分钟后重置`,
            currentCost,
            costLimit: rateLimitCost,
            resetAt: resetTime.toISOString(),
            remainingMinutes
          })
        }
      }

      // 增加请求计数
      await redis.getClient().incr(requestCountKey)

      // 存储限流信息到请求对象
      req.rateLimitInfo = {
        windowStart,
        windowDuration,
        requestCountKey,
        tokenCountKey,
        costCountKey, // 新增：费用计数器
        currentRequests: currentRequests + 1,
        currentTokens,
        currentCost, // 新增：当前费用
        rateLimitRequests,
        tokenLimit,
        rateLimitCost // 新增：费用限制
      }
    }

    // 检查每日费用限制
    const dailyCostLimit = validation.keyData.dailyCostLimit || 0
    if (dailyCostLimit > 0) {
      const dailyCost = validation.keyData.dailyCost || 0

      if (dailyCost >= dailyCostLimit) {
        logger.security(
          `💰 Daily cost limit exceeded for key: ${validation.keyData.id} (${
            validation.keyData.name
          }), cost: $${dailyCost.toFixed(2)}/$${dailyCostLimit}`
        )

        // 使用 402 Payment Required 而非 429，避免客户端自动重试
        return res.status(402).json({
          error: {
            type: 'insufficient_quota',
            message: `已达到每日费用限制 ($${dailyCostLimit})`,
            code: 'daily_cost_limit_exceeded'
          },
          currentCost: dailyCost,
          costLimit: dailyCostLimit,
          resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString()
        })
      }

      // 记录当前费用使用情况
      logger.api(
        `💰 Cost usage for key: ${validation.keyData.id} (${
          validation.keyData.name
        }), current: $${dailyCost.toFixed(2)}/$${dailyCostLimit}`
      )
    }

    // 检查总费用限制
    const totalCostLimit = validation.keyData.totalCostLimit || 0
    if (totalCostLimit > 0) {
      const totalCost = validation.keyData.totalCost || 0

      if (totalCost >= totalCostLimit) {
        logger.security(
          `💰 Total cost limit exceeded for key: ${validation.keyData.id} (${
            validation.keyData.name
          }), cost: $${totalCost.toFixed(2)}/$${totalCostLimit}`
        )

        // 使用 402 Payment Required 而非 429，避免客户端自动重试
        return res.status(402).json({
          error: {
            type: 'insufficient_quota',
            message: `已达到总费用限制 ($${totalCostLimit})`,
            code: 'total_cost_limit_exceeded'
          },
          currentCost: totalCost,
          costLimit: totalCostLimit
        })
      }

      logger.api(
        `💰 Total cost usage for key: ${validation.keyData.id} (${
          validation.keyData.name
        }), current: $${totalCost.toFixed(2)}/$${totalCostLimit}`
      )
    }

    // 检查 Claude 周费用限制
    const weeklyOpusCostLimit = validation.keyData.weeklyOpusCostLimit || 0
    if (weeklyOpusCostLimit > 0) {
      // 从请求中获取模型信息
      const requestBody = req.body || {}
      const model = requestBody.model || ''

      // 判断是否为 Claude 模型
      if (isClaudeFamilyModel(model)) {
        const weeklyOpusCost = validation.keyData.weeklyOpusCost || 0

        if (weeklyOpusCost >= weeklyOpusCostLimit) {
          logger.security(
            `💰 Weekly Claude cost limit exceeded for key: ${validation.keyData.id} (${
              validation.keyData.name
            }), cost: $${weeklyOpusCost.toFixed(2)}/$${weeklyOpusCostLimit}`
          )

          // 计算下周一的重置时间
          const now = new Date()
          const dayOfWeek = now.getDay()
          const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7
          const resetDate = new Date(now)
          resetDate.setDate(now.getDate() + daysUntilMonday)
          resetDate.setHours(0, 0, 0, 0)

          // 使用 402 Payment Required 而非 429，避免客户端自动重试
          return res.status(402).json({
            error: {
              type: 'insufficient_quota',
              message: `已达到 Opus 模型周费用限制 ($${weeklyOpusCostLimit})`,
              code: 'weekly_opus_cost_limit_exceeded'
            },
            currentCost: weeklyOpusCost,
            costLimit: weeklyOpusCostLimit,
            resetAt: resetDate.toISOString()
          })
        }

        // 记录当前 Claude 费用使用情况
        logger.api(
          `💰 Claude weekly cost usage for key: ${validation.keyData.id} (${
            validation.keyData.name
          }), current: $${weeklyOpusCost.toFixed(2)}/$${weeklyOpusCostLimit}`
        )
      }
    }

    // 将验证信息添加到请求对象（只包含必要信息）
    req.apiKey = {
      id: validation.keyData.id,
      name: validation.keyData.name,
      tokenLimit: validation.keyData.tokenLimit,
      claudeAccountId: validation.keyData.claudeAccountId,
      claudeConsoleAccountId: validation.keyData.claudeConsoleAccountId, // 添加 Claude Console 账号ID
      geminiAccountId: validation.keyData.geminiAccountId,
      openaiAccountId: validation.keyData.openaiAccountId, // 添加 OpenAI 账号ID
      bedrockAccountId: validation.keyData.bedrockAccountId, // 添加 Bedrock 账号ID
      droidAccountId: validation.keyData.droidAccountId,
      permissions: validation.keyData.permissions,
      concurrencyLimit: validation.keyData.concurrencyLimit,
      rateLimitWindow: validation.keyData.rateLimitWindow,
      rateLimitRequests: validation.keyData.rateLimitRequests,
      rateLimitCost: validation.keyData.rateLimitCost, // 新增：费用限制
      enableModelRestriction: validation.keyData.enableModelRestriction,
      restrictedModels: validation.keyData.restrictedModels,
      enableClientRestriction: validation.keyData.enableClientRestriction,
      allowedClients: validation.keyData.allowedClients,
      dailyCostLimit: validation.keyData.dailyCostLimit,
      dailyCost: validation.keyData.dailyCost,
      totalCostLimit: validation.keyData.totalCostLimit,
      totalCost: validation.keyData.totalCost
    }

    const authDuration = Date.now() - startTime
    const userAgent = req.headers['user-agent'] || 'No User-Agent'
    logger.api(
      `🔓 Authenticated request from key: ${validation.keyData.name} (${validation.keyData.id}) in ${authDuration}ms`
    )
    logger.api(`   User-Agent: "${userAgent}"`)

    return next()
  } catch (error) {
    authErrored = true
    const authDuration = Date.now() - startTime
    logger.error(`❌ Authentication middleware error (${authDuration}ms):`, {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    })

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    })
  } finally {
    if (authErrored && typeof concurrencyCleanup === 'function') {
      try {
        await concurrencyCleanup()
      } catch (cleanupError) {
        logger.error('Failed to cleanup concurrency after auth error:', cleanupError)
      }
    }
  }
}

// 🛡️ 管理员验证中间件（优化版）
const authenticateAdmin = async (req, res, next) => {
  const startTime = Date.now()

  try {
    // 安全提取token，支持多种方式
    const token =
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.cookies?.adminToken ||
      req.headers['x-admin-token']

    if (!token) {
      logger.security(`Missing admin token attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Missing admin token',
        message: 'Please provide an admin token'
      })
    }

    // 基本token格式验证
    if (typeof token !== 'string' || token.length < 32 || token.length > 512) {
      logger.security(`Invalid admin token format from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid admin token format',
        message: 'Admin token format is invalid'
      })
    }

    // 获取管理员会话（带超时处理）
    const adminSession = await Promise.race([
      redis.getSession(token),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Session lookup timeout')), 5000)
      )
    ])

    if (!adminSession || Object.keys(adminSession).length === 0) {
      logger.security(`Invalid admin token attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid admin token',
        message: 'Invalid or expired admin session'
      })
    }

    // 🔒 安全修复：验证会话必须字段（防止伪造会话绕过认证）
    if (!adminSession.username || !adminSession.loginTime) {
      logger.security(
        `🔒 Corrupted admin session from ${req.ip || 'unknown'} - missing required fields (username: ${!!adminSession.username}, loginTime: ${!!adminSession.loginTime})`
      )
      await redis.deleteSession(token) // 清理无效/伪造的会话
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Session data corrupted or incomplete'
      })
    }

    // 检查会话活跃性（可选：检查最后活动时间）
    const now = new Date()
    const lastActivity = new Date(adminSession.lastActivity || adminSession.loginTime)
    const inactiveDuration = now - lastActivity
    const maxInactivity = 24 * 60 * 60 * 1000 // 24小时

    if (inactiveDuration > maxInactivity) {
      logger.security(
        `🔒 Expired admin session for ${adminSession.username} from ${req.ip || 'unknown'}`
      )
      await redis.deleteSession(token) // 清理过期会话
      return res.status(401).json({
        error: 'Session expired',
        message: 'Admin session has expired due to inactivity'
      })
    }

    // 更新最后活动时间（异步，不阻塞请求）
    redis
      .setSession(
        token,
        {
          ...adminSession,
          lastActivity: now.toISOString()
        },
        86400
      )
      .catch((error) => {
        logger.error('Failed to update admin session activity:', error)
      })

    // 设置管理员信息（只包含必要信息）
    req.admin = {
      username: adminSession.username,
      sessionId: token,
      loginTime: adminSession.loginTime
    }

    const authDuration = Date.now() - startTime
    logger.security(`Admin authenticated: ${adminSession.username} in ${authDuration}ms`)

    return next()
  } catch (error) {
    const authDuration = Date.now() - startTime
    logger.error(`❌ Admin authentication error (${authDuration}ms):`, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    })

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during admin authentication'
    })
  }
}

// 👤 用户验证中间件
const authenticateUser = async (req, res, next) => {
  const startTime = Date.now()

  try {
    // 安全提取用户session token，支持多种方式
    const sessionToken =
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.cookies?.userToken ||
      req.headers['x-user-token']

    if (!sessionToken) {
      logger.security(`Missing user session token attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Missing user session token',
        message: 'Please login to access this resource'
      })
    }

    // 基本token格式验证
    if (typeof sessionToken !== 'string' || sessionToken.length < 32 || sessionToken.length > 128) {
      logger.security(`Invalid user session token format from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid session token format',
        message: 'Session token format is invalid'
      })
    }

    // 验证用户会话
    const sessionValidation = await userService.validateUserSession(sessionToken)

    if (!sessionValidation) {
      logger.security(`Invalid user session token attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid session token',
        message: 'Invalid or expired user session'
      })
    }

    const { session, user } = sessionValidation

    // 检查用户是否被禁用
    if (!user.isActive) {
      logger.security(
        `🔒 Disabled user login attempt: ${user.username} from ${req.ip || 'unknown'}`
      )
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled. Please contact administrator.'
      })
    }

    // 设置用户信息（只包含必要信息）
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      sessionToken,
      sessionCreatedAt: session.createdAt
    }

    const authDuration = Date.now() - startTime
    logger.info(`👤 User authenticated: ${user.username} (${user.id}) in ${authDuration}ms`)

    return next()
  } catch (error) {
    const authDuration = Date.now() - startTime
    logger.error(`❌ User authentication error (${authDuration}ms):`, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    })

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during user authentication'
    })
  }
}

// 👤 用户或管理员验证中间件（支持两种身份）
const authenticateUserOrAdmin = async (req, res, next) => {
  const startTime = Date.now()

  try {
    // 检查是否有管理员token
    const adminToken =
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.cookies?.adminToken ||
      req.headers['x-admin-token']

    // 检查是否有用户session token
    const userToken =
      req.headers['x-user-token'] ||
      req.cookies?.userToken ||
      (!adminToken ? req.headers['authorization']?.replace(/^Bearer\s+/i, '') : null)

    // 优先尝试管理员认证
    if (adminToken) {
      try {
        const adminSession = await redis.getSession(adminToken)
        if (adminSession && Object.keys(adminSession).length > 0) {
          // 🔒 安全修复：验证会话必须字段（与 authenticateAdmin 保持一致）
          if (!adminSession.username || !adminSession.loginTime) {
            logger.security(
              `🔒 Corrupted admin session in authenticateUserOrAdmin from ${req.ip || 'unknown'} - missing required fields (username: ${!!adminSession.username}, loginTime: ${!!adminSession.loginTime})`
            )
            await redis.deleteSession(adminToken) // 清理无效/伪造的会话
            // 不返回 401，继续尝试用户认证
          } else {
            req.admin = {
              username: adminSession.username,
              sessionId: adminToken,
              loginTime: adminSession.loginTime
            }
            req.userType = 'admin'

            const authDuration = Date.now() - startTime
            logger.security(`Admin authenticated: ${adminSession.username} in ${authDuration}ms`)
            return next()
          }
        }
      } catch (error) {
        logger.debug('Admin authentication failed, trying user authentication:', error.message)
      }
    }

    // 尝试用户认证
    if (userToken) {
      try {
        const sessionValidation = await userService.validateUserSession(userToken)
        if (sessionValidation) {
          const { session, user } = sessionValidation

          if (user.isActive) {
            req.user = {
              id: user.id,
              username: user.username,
              email: user.email,
              displayName: user.displayName,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
              sessionToken: userToken,
              sessionCreatedAt: session.createdAt
            }
            req.userType = 'user'

            const authDuration = Date.now() - startTime
            logger.info(`👤 User authenticated: ${user.username} (${user.id}) in ${authDuration}ms`)
            return next()
          }
        }
      } catch (error) {
        logger.debug('User authentication failed:', error.message)
      }
    }

    // 如果都失败了，返回未授权
    logger.security(`Authentication failed from ${req.ip || 'unknown'}`)
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please login as user or admin to access this resource'
    })
  } catch (error) {
    const authDuration = Date.now() - startTime
    logger.error(`❌ User/Admin authentication error (${authDuration}ms):`, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    })

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    })
  }
}

// 🛡️ 权限检查中间件
const requireRole = (allowedRoles) => (req, res, next) => {
  // 管理员始终有权限
  if (req.admin) {
    return next()
  }

  // 检查用户角色
  if (req.user) {
    const userRole = req.user.role
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

    if (allowed.includes(userRole)) {
      return next()
    } else {
      logger.security(
        `🚫 Access denied for user ${req.user.username} (role: ${userRole}) to ${req.originalUrl}`
      )
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This resource requires one of the following roles: ${allowed.join(', ')}`
      })
    }
  }

  return res.status(401).json({
    error: 'Authentication required',
    message: 'Please login to access this resource'
  })
}

// 🔒 管理员权限检查中间件
const requireAdmin = (req, res, next) => {
  if (req.admin) {
    return next()
  }

  // 检查是否是admin角色的用户
  if (req.user && req.user.role === 'admin') {
    return next()
  }

  logger.security(
    `🚫 Admin access denied for ${req.user?.username || 'unknown'} from ${req.ip || 'unknown'}`
  )
  return res.status(403).json({
    error: 'Admin access required',
    message: 'This resource requires administrator privileges'
  })
}

// 注意：使用统计现在直接在/api/v1/messages路由中处理，
// 以便从Claude API响应中提取真实的usage数据

// 🚦 CORS中间件（优化版，支持Chrome插件）
const corsMiddleware = (req, res, next) => {
  const { origin } = req.headers

  // 允许的源（可以从配置文件读取）
  const allowedOrigins = [
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:3000'
  ]

  // 🆕 检查是否为Chrome插件请求
  const isChromeExtension = origin && origin.startsWith('chrome-extension://')

  // 设置CORS头
  if (allowedOrigins.includes(origin) || !origin || isChromeExtension) {
    res.header('Access-Control-Allow-Origin', origin || '*')
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header(
    'Access-Control-Allow-Headers',
    [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'x-api-key',
      'x-goog-api-key',
      'api-key',
      'x-admin-token',
      'anthropic-version',
      'anthropic-dangerous-direct-browser-access'
    ].join(', ')
  )

  res.header('Access-Control-Expose-Headers', ['X-Request-ID', 'Content-Type'].join(', '))

  res.header('Access-Control-Max-Age', '86400') // 24小时预检缓存
  res.header('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
  } else {
    next()
  }
}

// 📝 请求日志中间件（优化版）
const requestLogger = (req, res, next) => {
  const start = Date.now()
  const requestId = Math.random().toString(36).substring(2, 15)

  // 添加请求ID到请求对象
  req.requestId = requestId
  res.setHeader('X-Request-ID', requestId)

  // 获取客户端信息
  const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown'
  const userAgent = req.get('User-Agent') || 'unknown'
  const referer = req.get('Referer') || 'none'

  // 记录请求开始
  const isDebugRoute = req.originalUrl.includes('event_logging')
  if (req.originalUrl !== '/health') {
    if (isDebugRoute) {
      logger.debug(`▶️ [${requestId}] ${req.method} ${req.originalUrl} | IP: ${clientIP}`)
    } else {
      logger.info(`▶️ [${requestId}] ${req.method} ${req.originalUrl} | IP: ${clientIP}`)
    }
  }

  res.on('finish', () => {
    const duration = Date.now() - start
    const contentLength = res.get('Content-Length') || '0'

    // 构建日志元数据
    const logMetadata = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      contentLength,
      ip: clientIP,
      userAgent,
      referer
    }

    // 根据状态码选择日志级别
    if (res.statusCode >= 500) {
      logger.error(
        `◀️ [${requestId}] ${req.method} ${req.originalUrl} | ${res.statusCode} | ${duration}ms | ${contentLength}B`,
        logMetadata
      )
    } else if (res.statusCode >= 400) {
      logger.warn(
        `◀️ [${requestId}] ${req.method} ${req.originalUrl} | ${res.statusCode} | ${duration}ms | ${contentLength}B`,
        logMetadata
      )
    } else if (req.originalUrl !== '/health') {
      if (isDebugRoute) {
        logger.debug(
          `🟢 ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`,
          logMetadata
        )
      } else {
        logger.request(req.method, req.originalUrl, res.statusCode, duration, logMetadata)
      }
    }

    // API Key相关日志
    if (req.apiKey) {
      logger.api(
        `📱 [${requestId}] Request from ${req.apiKey.name} (${req.apiKey.id}) | ${duration}ms`
      )
    }

    // 慢请求警告
    if (duration > 5000) {
      logger.warn(
        `🐌 [${requestId}] Slow request detected: ${duration}ms for ${req.method} ${req.originalUrl}`
      )
    }
  })

  res.on('error', (error) => {
    const duration = Date.now() - start
    logger.error(`💥 [${requestId}] Response error after ${duration}ms:`, error)
  })

  next()
}

// 🛡️ 安全中间件（增强版）
const securityMiddleware = (req, res, next) => {
  // 设置基础安全头
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  // 添加更多安全头
  res.setHeader('X-DNS-Prefetch-Control', 'off')
  res.setHeader('X-Download-Options', 'noopen')
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')

  // Cross-Origin-Opener-Policy (仅对可信来源设置)
  const host = req.get('host') || ''
  const isLocalhost =
    host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0')
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https'

  if (isLocalhost || isHttps) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('Origin-Agent-Cluster', '?1')
  }

  // Content Security Policy (适用于web界面)
  if (req.path.startsWith('/web') || req.path === '/') {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.bootcdn.net",
        "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.bootcdn.net",
        "font-src 'self' https://cdnjs.cloudflare.com https://cdn.bootcdn.net",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    )
  }

  // Strict Transport Security (HTTPS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }

  // 移除泄露服务器信息的头
  res.removeHeader('X-Powered-By')
  res.removeHeader('Server')

  // 防止信息泄露
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  next()
}

// 🚨 错误处理中间件（增强版）
const errorHandler = (error, req, res, _next) => {
  const requestId = req.requestId || 'unknown'
  const isDevelopment = process.env.NODE_ENV === 'development'

  // 记录详细错误信息
  logger.error(`💥 [${requestId}] Unhandled error:`, {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
    apiKey: req.apiKey ? req.apiKey.id : 'none',
    admin: req.admin ? req.admin.username : 'none'
  })

  // 确定HTTP状态码
  let statusCode = 500
  let errorMessage = 'Internal Server Error'
  let userMessage = 'Something went wrong'

  if (error.status && error.status >= 400 && error.status < 600) {
    statusCode = error.status
  }

  // 根据错误类型提供友好的错误消息
  switch (error.name) {
    case 'ValidationError':
      statusCode = 400
      errorMessage = 'Validation Error'
      userMessage = 'Invalid input data'
      break
    case 'CastError':
      statusCode = 400
      errorMessage = 'Cast Error'
      userMessage = 'Invalid data format'
      break
    case 'MongoError':
    case 'RedisError':
      statusCode = 503
      errorMessage = 'Database Error'
      userMessage = 'Database temporarily unavailable'
      break
    case 'TimeoutError':
      statusCode = 408
      errorMessage = 'Request Timeout'
      userMessage = 'Request took too long to process'
      break
    default:
      if (error.message && !isDevelopment) {
        // 在生产环境中，只显示安全的错误消息
        if (error.message.includes('ECONNREFUSED')) {
          userMessage = 'Service temporarily unavailable'
        } else if (error.message.includes('timeout')) {
          userMessage = 'Request timeout'
        }
      }
  }

  // 设置响应头
  res.setHeader('X-Request-ID', requestId)

  // 构建错误响应
  const errorResponse = {
    error: errorMessage,
    message: isDevelopment ? error.message : userMessage,
    requestId,
    timestamp: new Date().toISOString()
  }

  // 在开发环境中包含更多调试信息
  if (isDevelopment) {
    errorResponse.stack = error.stack
    errorResponse.url = req.originalUrl
    errorResponse.method = req.method
  }

  res.status(statusCode).json(errorResponse)
}

// 🌐 全局速率限制中间件（延迟初始化）
// const rateLimiter = null // 暂时未使用

// 暂时注释掉未使用的函数
// const getRateLimiter = () => {
//   if (!rateLimiter) {
//     try {
//       const client = redis.getClient()
//       if (!client) {
//         logger.warn('⚠️ Redis client not available for rate limiter')
//         return null
//       }
//
//       rateLimiter = new RateLimiterRedis({
//         storeClient: client,
//         keyPrefix: 'global_rate_limit',
//         points: 1000, // 请求数量
//         duration: 900, // 15分钟 (900秒)
//         blockDuration: 900 // 阻塞时间15分钟
//       })
//
//       logger.info('✅ Rate limiter initialized successfully')
//     } catch (error) {
//       logger.warn('⚠️ Rate limiter initialization failed, using fallback', { error: error.message })
//       return null
//     }
//   }
//   return rateLimiter
// }

const globalRateLimit = async (req, res, next) =>
  // 已禁用全局IP限流 - 直接跳过所有请求
  next()

// 以下代码已被禁用
/*
  // 跳过健康检查和内部请求
  if (req.path === '/health' || req.path === '/api/health') {
    return next()
  }

  const limiter = getRateLimiter()
  if (!limiter) {
    // 如果Redis不可用，直接跳过速率限制
    return next()
  }

  const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'

  try {
    await limiter.consume(clientIP)
    return next()
  } catch (rejRes) {
    const remainingPoints = rejRes.remainingPoints || 0
    const msBeforeNext = rejRes.msBeforeNext || 900000

    logger.security(`🚦 Global rate limit exceeded for IP: ${clientIP}`)

    res.set({
      'Retry-After': Math.round(msBeforeNext / 1000) || 900,
      'X-RateLimit-Limit': 1000,
      'X-RateLimit-Remaining': remainingPoints,
      'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString()
    })

    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.round(msBeforeNext / 1000)
    })
  }
  */

// 📊 请求大小限制中间件
const requestSizeLimit = (req, res, next) => {
  const MAX_SIZE_MB = parseInt(process.env.REQUEST_MAX_SIZE_MB || '100', 10)
  const maxSize = MAX_SIZE_MB * 1024 * 1024
  const contentLength = parseInt(req.headers['content-length'] || '0')

  if (contentLength > maxSize) {
    logger.security(`🚨 Request too large: ${contentLength} bytes from ${req.ip}`)
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body size exceeds limit',
      limit: `${MAX_SIZE_MB}MB`
    })
  }

  return next()
}

module.exports = {
  authenticateApiKey,
  authenticateAdmin,
  authenticateUser,
  authenticateUserOrAdmin,
  requireRole,
  requireAdmin,
  corsMiddleware,
  requestLogger,
  securityMiddleware,
  errorHandler,
  globalRateLimit,
  requestSizeLimit
}
