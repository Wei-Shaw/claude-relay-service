const { v4: uuidv4 } = require('uuid')
const config = require('../../config/config')
const apiKeyService = require('../services/apiKeyService')
const userService = require('../services/userService')
const logger = require('../utils/logger')
const redis = require('../models/redis')
// const { RateLimiterRedis } = require('rate-limiter-flexible') // 暂时未使用
const ClientValidator = require('../validators/clientValidator')

const TOKEN_COUNT_PATHS = new Set([
  '/v1/messages/count_tokens',
  '/api/v1/messages/count_tokens',
  '/claude/v1/messages/count_tokens',
  '/droid/claude/v1/messages/count_tokens'
])

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

// 🔑 API Key验证中间件（优化版）
const authenticateApiKey = async (req, res, next) => {
  const startTime = Date.now()

  try {
    // 安全提取API Key，支持多种格式（包括Gemini CLI支持）
    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['x-goog-api-key'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.headers['api-key'] ||
      req.query.key

    if (!apiKey) {
      logger.security(`🔒 Missing API key attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Missing API key',
        message: 'Please provide an API key in the x-api-key header or Authorization header'
      })
    }

    // 基本API Key格式验证
    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      logger.security(`🔒 Invalid API key format from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    // 验证API Key（带缓存优化）
    const validation = await apiKeyService.validateApiKey(apiKey)

    if (!validation.valid) {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
      logger.security(`🔒 Invalid API key attempt: ${validation.error} from ${clientIP}`)
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

    // 检查并发限制
    const concurrencyLimit = validation.keyData.concurrencyLimit || 0
    if (!skipKeyRestrictions && concurrencyLimit > 0) {
      const concurrencyConfig = config.concurrency || {}
      const leaseSeconds = Math.max(concurrencyConfig.leaseSeconds || 900, 30)
      const rawRenewInterval =
        typeof concurrencyConfig.renewIntervalSeconds === 'number'
          ? concurrencyConfig.renewIntervalSeconds
          : 60
      let renewIntervalSeconds = rawRenewInterval
      if (renewIntervalSeconds > 0) {
        const maxSafeRenew = Math.max(leaseSeconds - 5, 15)
        renewIntervalSeconds = Math.min(Math.max(renewIntervalSeconds, 15), maxSafeRenew)
      } else {
        renewIntervalSeconds = 0
      }
      const requestId = uuidv4()

      const currentConcurrency = await redis.incrConcurrency(
        validation.keyData.id,
        requestId,
        leaseSeconds
      )
      logger.api(
        `📈 Incremented concurrency for key: ${validation.keyData.id} (${validation.keyData.name}), current: ${currentConcurrency}, limit: ${concurrencyLimit}`
      )

      if (currentConcurrency > concurrencyLimit) {
        // 如果超过限制，立即减少计数
        await redis.decrConcurrency(validation.keyData.id, requestId)
        logger.security(
          `🚦 Concurrency limit exceeded for key: ${validation.keyData.id} (${
            validation.keyData.name
          }), current: ${currentConcurrency - 1}, limit: ${concurrencyLimit}`
        )
        return res.status(429).json({
          error: 'Concurrency limit exceeded',
          message: `Too many concurrent requests. Limit: ${concurrencyLimit} concurrent requests`,
          currentConcurrency: currentConcurrency - 1,
          concurrencyLimit
        })
      }

      const renewIntervalMs =
        renewIntervalSeconds > 0 ? Math.max(renewIntervalSeconds * 1000, 15000) : 0

      // 使用标志位确保只减少一次
      let concurrencyDecremented = false
      let leaseRenewInterval = null

      if (renewIntervalMs > 0) {
        leaseRenewInterval = setInterval(() => {
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

        return res.status(429).json({
          error: 'Daily cost limit exceeded',
          message: `已达到每日费用限制 ($${dailyCostLimit})`,
          currentCost: dailyCost,
          costLimit: dailyCostLimit,
          resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString() // 明天0点重置
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

        return res.status(429).json({
          error: 'Total cost limit exceeded',
          message: `已达到总费用限制 ($${totalCostLimit})`,
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

    // 检查 Opus 日费用限制（仅对 Opus 模型生效）
    const dailyOpusCostLimit = validation.keyData.dailyOpusCostLimit || 0
    if (dailyOpusCostLimit > 0) {
      // 从请求中获取模型信息
      const requestBody = req.body || {}
      const model = requestBody.model || ''

      // 判断是否为 Opus 模型
      if (model && model.toLowerCase().includes('claude-opus')) {
        const dailyOpusCost = validation.keyData.dailyOpusCost || 0

        if (dailyOpusCost >= dailyOpusCostLimit) {
          logger.security(
            `💰 Daily Opus cost limit exceeded for key: ${validation.keyData.id} (${
              validation.keyData.name
            }), cost: $${dailyOpusCost.toFixed(2)}/$${dailyOpusCostLimit}`
          )

          // 计算明日 00:00 的重置时间
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          tomorrow.setHours(0, 0, 0, 0)

          return res.status(429).json({
            error: 'Daily Opus cost limit exceeded',
            message: `已达到 Opus 模型日费用限制 ($${dailyOpusCostLimit})`,
            currentCost: dailyOpusCost,
            costLimit: dailyOpusCostLimit,
            resetAt: tomorrow.toISOString() // 明日 00:00 重置
          })
        }

        // 记录当前 Opus 日费用使用情况
        logger.api(
          `💰 Opus daily cost usage for key: ${validation.keyData.id} (${
            validation.keyData.name
          }), current: $${dailyOpusCost.toFixed(2)}/$${dailyOpusCostLimit}`
        )
      }
    }

    // 检查 Opus 周费用限制（仅对 Opus 模型生效）
    const weeklyOpusCostLimit = validation.keyData.weeklyOpusCostLimit || 0
    if (weeklyOpusCostLimit > 0) {
      // 从请求中获取模型信息
      const requestBody = req.body || {}
      const model = requestBody.model || ''

      // 判断是否为 Opus 模型
      if (model && model.toLowerCase().includes('claude-opus')) {
        const weeklyOpusCost = validation.keyData.weeklyOpusCost || 0

        if (weeklyOpusCost >= weeklyOpusCostLimit) {
          logger.security(
            `💰 Weekly Opus cost limit exceeded for key: ${validation.keyData.id} (${
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

          return res.status(429).json({
            error: 'Weekly Opus cost limit exceeded',
            message: `已达到 Opus 模型周费用限制 ($${weeklyOpusCostLimit})`,
            currentCost: weeklyOpusCost,
            costLimit: weeklyOpusCostLimit,
            resetAt: resetDate.toISOString() // 下周一重置
          })
        }

        // 记录当前 Opus 费用使用情况
        logger.api(
          `💰 Opus weekly cost usage for key: ${validation.keyData.id} (${
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
      totalCost: validation.keyData.totalCost,
      usage: validation.keyData.usage
    }
    req.usage = validation.keyData.usage

    const authDuration = Date.now() - startTime
    const userAgent = req.headers['user-agent'] || 'No User-Agent'
    logger.api(
      `🔓 Authenticated request from key: ${validation.keyData.name} (${validation.keyData.id}) in ${authDuration}ms`
    )
    logger.api(`   User-Agent: "${userAgent}"`)

    return next()
  } catch (error) {
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
      logger.security(`🔒 Missing admin token attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Missing admin token',
        message: 'Please provide an admin token'
      })
    }

    // 基本token格式验证
    if (typeof token !== 'string' || token.length < 32 || token.length > 512) {
      logger.security(`🔒 Invalid admin token format from ${req.ip || 'unknown'}`)
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
      logger.security(`🔒 Invalid admin token attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid admin token',
        message: 'Invalid or expired admin session'
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
      id: adminSession.adminId || 'admin',
      username: adminSession.username,
      sessionId: token,
      loginTime: adminSession.loginTime
    }

    const authDuration = Date.now() - startTime
    logger.security(`🔐 Admin authenticated: ${adminSession.username} in ${authDuration}ms`)

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
      logger.security(`🔒 Missing user session token attempt from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Missing user session token',
        message: 'Please login to access this resource'
      })
    }

    // 基本token格式验证
    if (typeof sessionToken !== 'string' || sessionToken.length < 32 || sessionToken.length > 128) {
      logger.security(`🔒 Invalid user session token format from ${req.ip || 'unknown'}`)
      return res.status(401).json({
        error: 'Invalid session token format',
        message: 'Session token format is invalid'
      })
    }

    // 验证用户会话
    const sessionValidation = await userService.validateUserSession(sessionToken)

    if (!sessionValidation) {
      logger.security(`🔒 Invalid user session token attempt from ${req.ip || 'unknown'}`)
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
          req.admin = {
            id: adminSession.adminId || 'admin',
            username: adminSession.username,
            sessionId: adminToken,
            loginTime: adminSession.loginTime
          }
          req.userType = 'admin'

          const authDuration = Date.now() - startTime
          logger.security(`🔐 Admin authenticated: ${adminSession.username} in ${authDuration}ms`)
          return next()
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
    logger.security(`🔒 Authentication failed from ${req.ip || 'unknown'}`)
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
  if (req.originalUrl !== '/health') {
    // 避免健康检查日志过多
    logger.info(`▶️ [${requestId}] ${req.method} ${req.originalUrl} | IP: ${clientIP}`)
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
      logger.request(req.method, req.originalUrl, res.statusCode, duration, logMetadata)
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
  const maxSize = 60 * 1024 * 1024 // 60MB
  const contentLength = parseInt(req.headers['content-length'] || '0')

  if (contentLength > maxSize) {
    logger.security(`🚨 Request too large: ${contentLength} bytes from ${req.ip}`)
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body size exceeds limit',
      limit: '10MB'
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
