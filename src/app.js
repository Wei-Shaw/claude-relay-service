const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const path = require('path')
const fs = require('fs')
const bcrypt = require('bcryptjs')
const promClient = require('prom-client')

const config = require('../config/config')
const logger = require('./utils/logger')
const redis = require('./models/redis')
const pricingService = require('./services/pricingService')
const cacheMonitor = require('./utils/cacheMonitor')

// Import routes
const apiRoutes = require('./routes/api')
const unifiedRoutes = require('./routes/unified')
const adminRoutes = require('./routes/admin')
const webRoutes = require('./routes/web')
const apiStatsRoutes = require('./routes/apiStats')
const geminiRoutes = require('./routes/geminiRoutes')
const openaiGeminiRoutes = require('./routes/openaiGeminiRoutes')
const standardGeminiRoutes = require('./routes/standardGeminiRoutes')
const openaiClaudeRoutes = require('./routes/openaiClaudeRoutes')
const openaiRoutes = require('./routes/openaiRoutes')
const droidRoutes = require('./routes/droidRoutes')
const userRoutes = require('./routes/userRoutes')
const azureOpenaiRoutes = require('./routes/azureOpenaiRoutes')
const webhookRoutes = require('./routes/webhook')

// Import middleware
const {
  corsMiddleware,
  requestLogger,
  securityMiddleware,
  errorHandler,
  globalRateLimit,
  requestSizeLimit
} = require('./middleware/auth')
const { browserFallbackMiddleware } = require('./middleware/browserFallback')

class Application {
  constructor() {
    this.app = express()
    this.server = null
    this.initPrometheusMetrics()
  }

  initPrometheusMetrics() {
    // Create a Registry to register the metrics
    this.register = new promClient.Registry()

    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register: this.register })

    // Custom metrics for Claude Relay Service
    this.totalApiKeysGauge = new promClient.Gauge({
      name: 'claude_relay_total_api_keys',
      help: 'Total number of API keys in the system',
      registers: [this.register]
    })

    this.totalClaudeAccountsGauge = new promClient.Gauge({
      name: 'claude_relay_total_claude_accounts',
      help: 'Total number of Claude accounts in the system',
      registers: [this.register]
    })

    this.totalUsageRecordsGauge = new promClient.Gauge({
      name: 'claude_relay_total_usage_records',
      help: 'Total number of usage records in the system',
      registers: [this.register]
    })

    this.uptimeGauge = new promClient.Gauge({
      name: 'claude_relay_uptime_seconds',
      help: 'Application uptime in seconds',
      registers: [this.register]
    })
  }

  async initialize() {
    try {
      // 🔗 连接Redis
      logger.info('🔄 Connecting to Redis...')
      await redis.connect()
      logger.success('✅ Redis connected successfully')

      // 💰 初始化价格服务
      logger.info('🔄 Initializing pricing service...')
      await pricingService.initialize()

      // 📋 初始化模型服务
      logger.info('🔄 Initializing model service...')
      const modelService = require('./services/modelService')
      await modelService.initialize()

      // 📊 初始化缓存监控
      await this.initializeCacheMonitoring()

      // 🔧 初始化管理员凭据
      logger.info('🔄 Initializing admin credentials...')
      await this.initializeAdmin()

      // 💰 初始化费用数据
      logger.info('💰 Checking cost data initialization...')
      const costInitService = require('./services/costInitService')
      const needsInit = await costInitService.needsInitialization()
      if (needsInit) {
        logger.info('💰 Initializing cost data for all API Keys...')
        const result = await costInitService.initializeAllCosts()
        logger.info(
          `💰 Cost initialization completed: ${result.processed} processed, ${result.errors} errors`
        )
      }

      // 🕐 初始化Claude账户会话窗口
      logger.info('🕐 Initializing Claude account session windows...')
      const claudeAccountService = require('./services/claudeAccountService')
      await claudeAccountService.initializeSessionWindows()

      // 超早期拦截 /admin-next/ 请求 - 在所有中间件之前
      this.app.use((req, res, next) => {
        if (req.path === '/admin-next/' && req.method === 'GET') {
          logger.warn('🚨 INTERCEPTING /admin-next/ request at the very beginning!')
          const adminSpaPath = path.join(__dirname, '..', 'web', 'admin-spa', 'dist')
          const indexPath = path.join(adminSpaPath, 'index.html')

          if (fs.existsSync(indexPath)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            return res.sendFile(indexPath)
          } else {
            logger.error('❌ index.html not found at:', indexPath)
            return res.status(404).send('index.html not found')
          }
        }
        next()
      })

      // 🛡️ 安全中间件
      this.app.use(
        helmet({
          contentSecurityPolicy: false, // 允许内联样式和脚本
          crossOriginEmbedderPolicy: false
        })
      )

      // 🌐 CORS
      if (config.web.enableCors) {
        this.app.use(cors())
      } else {
        this.app.use(corsMiddleware)
      }

      // 🆕 兜底中间件：处理Chrome插件兼容性（必须在认证之前）
      this.app.use(browserFallbackMiddleware)

      // 📦 压缩 - 排除流式响应（SSE）
      this.app.use(
        compression({
          filter: (req, res) => {
            // 不压缩 Server-Sent Events
            if (res.getHeader('Content-Type') === 'text/event-stream') {
              return false
            }
            // 使用默认的压缩判断
            return compression.filter(req, res)
          }
        })
      )

      // 🚦 全局速率限制（仅在生产环境启用）
      if (process.env.NODE_ENV === 'production') {
        this.app.use(globalRateLimit)
      }

      // 📏 请求大小限制
      this.app.use(requestSizeLimit)

      // 📝 请求日志（使用自定义logger而不是morgan）
      this.app.use(requestLogger)

      // 🐛 HTTP调试拦截器（仅在启用调试时生效）
      if (process.env.DEBUG_HTTP_TRAFFIC === 'true') {
        try {
          const { debugInterceptor } = require('./middleware/debugInterceptor')
          this.app.use(debugInterceptor)
          logger.info('🐛 HTTP调试拦截器已启用 - 日志输出到 logs/http-debug-*.log')
        } catch (error) {
          logger.warn('⚠️ 无法加载HTTP调试拦截器:', error.message)
        }
      }

      // 🔧 基础中间件
      this.app.use(
        express.json({
          limit: '10mb',
          verify: (req, res, buf, encoding) => {
            // 验证JSON格式
            if (buf && buf.length && !buf.toString(encoding || 'utf8').trim()) {
              throw new Error('Invalid JSON: empty body')
            }
          }
        })
      )
      this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
      this.app.use(securityMiddleware)

      // 🎯 信任代理
      if (config.server.trustProxy) {
        this.app.set('trust proxy', 1)
      }

      // 调试中间件 - 拦截所有 /admin-next 请求
      this.app.use((req, res, next) => {
        if (req.path.startsWith('/admin-next')) {
          logger.info(
            `🔍 DEBUG: Incoming request - method: ${req.method}, path: ${req.path}, originalUrl: ${req.originalUrl}`
          )
        }
        next()
      })

      // 🎨 新版管理界面静态文件服务（必须在其他路由之前）
      const adminSpaPath = path.join(__dirname, '..', 'web', 'admin-spa', 'dist')
      if (fs.existsSync(adminSpaPath)) {
        // 处理不带斜杠的路径，重定向到带斜杠的路径
        this.app.get('/admin-next', (req, res) => {
          res.redirect(301, '/admin-next/')
        })

        // 使用 all 方法确保捕获所有 HTTP 方法
        this.app.all('/admin-next/', (req, res) => {
          logger.info('🎯 HIT: /admin-next/ route handler triggered!')
          logger.info(`Method: ${req.method}, Path: ${req.path}, URL: ${req.url}`)

          if (req.method !== 'GET' && req.method !== 'HEAD') {
            return res.status(405).send('Method Not Allowed')
          }

          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          res.sendFile(path.join(adminSpaPath, 'index.html'))
        })

        // 处理所有其他 /admin-next/* 路径（但排除根路径）
        this.app.get('/admin-next/*', (req, res) => {
          // 如果是根路径，跳过（应该由上面的路由处理）
          if (req.path === '/admin-next/') {
            logger.error('❌ ERROR: /admin-next/ should not reach here!')
            return res.status(500).send('Route configuration error')
          }

          const requestPath = req.path.replace('/admin-next/', '')

          // 安全检查
          if (
            requestPath.includes('..') ||
            requestPath.includes('//') ||
            requestPath.includes('\\')
          ) {
            return res.status(400).json({ error: 'Invalid path' })
          }

          // 检查是否为静态资源
          const filePath = path.join(adminSpaPath, requestPath)

          // 如果文件存在且是静态资源
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            // 设置缓存头
            if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            } else if (filePath.endsWith('.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            }
            return res.sendFile(filePath)
          }

          // 如果是静态资源但文件不存在
          if (requestPath.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/i)) {
            return res.status(404).send('Not found')
          }

          // 其他所有路径返回 index.html（SPA 路由）
          res.sendFile(path.join(adminSpaPath, 'index.html'))
        })

        logger.info('✅ Admin SPA (next) static files mounted at /admin-next/')
      } else {
        logger.warn('⚠️ Admin SPA dist directory not found, skipping /admin-next route')
      }

      // 🛣️ 路由
      this.app.use('/api', apiRoutes)
      this.app.use('/api', unifiedRoutes) // 统一智能路由（支持 /v1/chat/completions 等）
      this.app.use('/claude', apiRoutes) // /claude 路由别名，与 /api 功能相同
      this.app.use('/admin', adminRoutes)
      this.app.use('/users', userRoutes)
      // 使用 web 路由（包含 auth 和页面重定向）
      this.app.use('/web', webRoutes)
      this.app.use('/apiStats', apiStatsRoutes)
      // Gemini 路由：同时支持标准格式和原有格式
      this.app.use('/gemini', standardGeminiRoutes) // 标准 Gemini API 格式路由
      this.app.use('/gemini', geminiRoutes) // 保留原有路径以保持向后兼容
      this.app.use('/openai/gemini', openaiGeminiRoutes)
      this.app.use('/openai/claude', openaiClaudeRoutes)
      this.app.use('/openai', unifiedRoutes) // 复用统一智能路由，支持 /openai/v1/chat/completions
      this.app.use('/openai', openaiRoutes) // Codex API 路由（/openai/responses, /openai/v1/responses）
      // Droid 路由：支持多种 Factory.ai 端点
      this.app.use('/droid', droidRoutes) // Droid (Factory.ai) API 转发
      this.app.use('/azure', azureOpenaiRoutes)
      this.app.use('/admin/webhook', webhookRoutes)

      // 🏠 根路径重定向到新版管理界面
      this.app.get('/', (req, res) => {
        res.redirect('/admin-next/api-stats')
      })

      // 🏥 增强的健康检查端点
      this.app.get('/health', async (req, res) => {
        try {
          const timer = logger.timer('health-check')

          // 检查各个组件健康状态
          const [redisHealth, loggerHealth] = await Promise.all([
            this.checkRedisHealth(),
            this.checkLoggerHealth()
          ])

          const memory = process.memoryUsage()

          // 获取版本号：优先使用环境变量，其次VERSION文件，再次package.json，最后使用默认值
          let version = process.env.APP_VERSION || process.env.VERSION
          if (!version) {
            try {
              const versionFile = path.join(__dirname, '..', 'VERSION')
              if (fs.existsSync(versionFile)) {
                version = fs.readFileSync(versionFile, 'utf8').trim()
              }
            } catch (error) {
              // 忽略错误，继续尝试其他方式
            }
          }
          if (!version) {
            try {
              const { version: pkgVersion } = require('../package.json')
              version = pkgVersion
            } catch (error) {
              version = '1.0.0'
            }
          }

          const health = {
            status: 'healthy',
            service: 'claude-relay-service',
            version,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
              used: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
              total: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
              external: `${Math.round(memory.external / 1024 / 1024)}MB`
            },
            components: {
              redis: redisHealth,
              logger: loggerHealth
            },
            stats: logger.getStats()
          }

          timer.end('completed')
          res.json(health)
        } catch (error) {
          logger.error('❌ Health check failed:', { error: error.message, stack: error.stack })
          res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
          })
        }
      })

      // 📊 指标端点 (JSON格式)
      this.app.get('/metrics', async (req, res) => {
        try {
          const stats = await redis.getSystemStats()
          const metrics = {
            ...stats,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          }

          res.json(metrics)
        } catch (error) {
          logger.error('❌ Metrics collection failed:', error)
          res.status(500).json({ error: 'Failed to collect metrics' })
        }
      })

      // 📊 Prometheus指标端点 (OpenMetrics格式)
      this.app.get('/prometheus', async (req, res) => {
        try {
          // Update custom metrics with current values
          const stats = await redis.getSystemStats()

          this.totalApiKeysGauge.set(stats.totalApiKeys || 0)
          this.totalClaudeAccountsGauge.set(stats.totalClaudeAccounts || 0)
          this.totalUsageRecordsGauge.set(stats.totalUsageRecords || 0)
          this.uptimeGauge.set(process.uptime())

          // Return metrics in Prometheus format
          res.set('Content-Type', this.register.contentType)
          res.end(await this.register.metrics())
        } catch (error) {
          logger.error('❌ Prometheus metrics collection failed:', error)
          res.status(500).send('# Error collecting metrics\n')
        }
      })

      // 🚫 404 处理
      this.app.use('*', (req, res) => {
        res.status(404).json({
          error: 'Not Found',
          message: `Route ${req.originalUrl} not found`,
          timestamp: new Date().toISOString()
        })
      })

      // 🚨 错误处理
      this.app.use(errorHandler)

      logger.success('✅ Application initialized successfully')
    } catch (error) {
      logger.error('💥 Application initialization failed:', error)
      throw error
    }
  }

  // 🔧 初始化管理员凭据（总是从 init.json 加载，确保数据一致性）
  async initializeAdmin() {
    try {
      const initFilePath = path.join(__dirname, '..', 'data', 'init.json')

      if (!fs.existsSync(initFilePath)) {
        logger.warn('⚠️ No admin credentials found. Please run npm run setup first.')
        return
      }

      // 从 init.json 读取管理员凭据（作为唯一真实数据源）
      const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))

      // 将明文密码哈希化
      const saltRounds = 10
      const passwordHash = await bcrypt.hash(initData.adminPassword, saltRounds)

      // 存储到Redis（每次启动都覆盖，确保与 init.json 同步）
      const adminCredentials = {
        username: initData.adminUsername,
        passwordHash,
        createdAt: initData.initializedAt || new Date().toISOString(),
        lastLogin: null,
        updatedAt: initData.updatedAt || null
      }

      await redis.setSession('admin_credentials', adminCredentials)

      logger.success('✅ Admin credentials loaded from init.json (single source of truth)')
      logger.info(`📋 Admin username: ${adminCredentials.username}`)
    } catch (error) {
      logger.error('❌ Failed to initialize admin credentials:', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  // 🔍 Redis健康检查
  async checkRedisHealth() {
    try {
      const start = Date.now()
      await redis.getClient().ping()
      const latency = Date.now() - start

      return {
        status: 'healthy',
        connected: redis.isConnected,
        latency: `${latency}ms`
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      }
    }
  }

  // 📝 Logger健康检查
  async checkLoggerHealth() {
    try {
      const health = logger.healthCheck()
      return {
        status: health.healthy ? 'healthy' : 'unhealthy',
        ...health
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      }
    }
  }

  async start() {
    try {
      await this.initialize()

      this.server = this.app.listen(config.server.port, config.server.host, () => {
        logger.start(
          `🚀 Claude Relay Service started on ${config.server.host}:${config.server.port}`
        )
        logger.info(
          `🌐 Web interface: http://${config.server.host}:${config.server.port}/admin-next/api-stats`
        )
        logger.info(
          `🔗 API endpoint: http://${config.server.host}:${config.server.port}/api/v1/messages`
        )
        logger.info(`⚙️  Admin API: http://${config.server.host}:${config.server.port}/admin`)
        logger.info(`🏥 Health check: http://${config.server.host}:${config.server.port}/health`)
        logger.info(`📊 Metrics: http://${config.server.host}:${config.server.port}/metrics`)
      })

      const serverTimeout = 600000 // 默认10分钟
      this.server.timeout = serverTimeout
      this.server.keepAliveTimeout = serverTimeout + 5000 // keepAlive 稍长一点
      logger.info(`⏱️  Server timeout set to ${serverTimeout}ms (${serverTimeout / 1000}s)`)

      // 🔄 定期清理任务
      this.startCleanupTasks()

      // 🛑 优雅关闭
      this.setupGracefulShutdown()
    } catch (error) {
      logger.error('💥 Failed to start server:', error)
      process.exit(1)
    }
  }

  // 📊 初始化缓存监控
  async initializeCacheMonitoring() {
    try {
      logger.info('🔄 Initializing cache monitoring...')

      // 注册各个服务的缓存实例
      const services = [
        { name: 'claudeAccount', service: require('./services/claudeAccountService') },
        { name: 'claudeConsole', service: require('./services/claudeConsoleAccountService') },
        { name: 'bedrockAccount', service: require('./services/bedrockAccountService') }
      ]

      // 注册已加载的服务缓存
      for (const { name, service } of services) {
        if (service && (service._decryptCache || service.decryptCache)) {
          const cache = service._decryptCache || service.decryptCache
          cacheMonitor.registerCache(`${name}_decrypt`, cache)
          logger.info(`✅ Registered ${name} decrypt cache for monitoring`)
        }
      }

      // 初始化时打印一次统计
      setTimeout(() => {
        const stats = cacheMonitor.getGlobalStats()
        logger.info(`📊 Cache System - Registered: ${stats.cacheCount} caches`)
      }, 5000)

      logger.success('✅ Cache monitoring initialized')
    } catch (error) {
      logger.error('❌ Failed to initialize cache monitoring:', error)
      // 不阻止应用启动
    }
  }

  startCleanupTasks() {
    // 🧹 每小时清理一次过期数据
    setInterval(async () => {
      try {
        logger.info('🧹 Starting scheduled cleanup...')

        const apiKeyService = require('./services/apiKeyService')
        const claudeAccountService = require('./services/claudeAccountService')

        const [expiredKeys, errorAccounts] = await Promise.all([
          apiKeyService.cleanupExpiredKeys(),
          claudeAccountService.cleanupErrorAccounts(),
          claudeAccountService.cleanupTempErrorAccounts() // 新增：清理临时错误账户
        ])

        await redis.cleanup()

        logger.success(
          `🧹 Cleanup completed: ${expiredKeys} expired keys, ${errorAccounts} error accounts reset`
        )
      } catch (error) {
        logger.error('❌ Cleanup task failed:', error)
      }
    }, config.system.cleanupInterval)

    logger.info(
      `🔄 Cleanup tasks scheduled every ${config.system.cleanupInterval / 1000 / 60} minutes`
    )

    // 🚨 启动限流状态自动清理服务
    // 每5分钟检查一次过期的限流状态，确保账号能及时恢复调度
    const rateLimitCleanupService = require('./services/rateLimitCleanupService')
    const cleanupIntervalMinutes = config.system.rateLimitCleanupInterval || 5 // 默认5分钟
    rateLimitCleanupService.start(cleanupIntervalMinutes)
    logger.info(
      `🚨 Rate limit cleanup service started (checking every ${cleanupIntervalMinutes} minutes)`
    )

    // 🔢 启动并发计数自动清理任务（Phase 1 修复：解决并发泄漏问题）
    // 每分钟主动清理所有过期的并发项，不依赖请求触发
    setInterval(async () => {
      try {
        const keys = await redis.keys('concurrency:*')
        if (keys.length === 0) {
          return
        }

        const now = Date.now()
        let totalCleaned = 0

        // 使用 Lua 脚本批量清理所有过期项
        for (const key of keys) {
          try {
            const cleaned = await redis.client.eval(
              `
              local key = KEYS[1]
              local now = tonumber(ARGV[1])

              -- 清理过期项
              redis.call('ZREMRANGEBYSCORE', key, '-inf', now)

              -- 获取剩余计数
              local count = redis.call('ZCARD', key)

              -- 如果计数为0，删除键
              if count <= 0 then
                redis.call('DEL', key)
                return 1
              end

              return 0
            `,
              1,
              key,
              now
            )
            if (cleaned === 1) {
              totalCleaned++
            }
          } catch (error) {
            logger.error(`❌ Failed to clean concurrency key ${key}:`, error)
          }
        }

        if (totalCleaned > 0) {
          logger.info(`🔢 Concurrency cleanup: cleaned ${totalCleaned} expired keys`)
        }
      } catch (error) {
        logger.error('❌ Concurrency cleanup task failed:', error)
      }
    }, 60000) // 每分钟执行一次

    logger.info('🔢 Concurrency cleanup task started (running every 1 minute)')
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`🛑 Received ${signal}, starting graceful shutdown...`)

      if (this.server) {
        this.server.close(async () => {
          logger.info('🚪 HTTP server closed')

          // 清理 pricing service 的文件监听器
          try {
            pricingService.cleanup()
            logger.info('💰 Pricing service cleaned up')
          } catch (error) {
            logger.error('❌ Error cleaning up pricing service:', error)
          }

          // 清理 model service 的文件监听器
          try {
            const modelService = require('./services/modelService')
            modelService.cleanup()
            logger.info('📋 Model service cleaned up')
          } catch (error) {
            logger.error('❌ Error cleaning up model service:', error)
          }

          // 停止限流清理服务
          try {
            const rateLimitCleanupService = require('./services/rateLimitCleanupService')
            rateLimitCleanupService.stop()
            logger.info('🚨 Rate limit cleanup service stopped')
          } catch (error) {
            logger.error('❌ Error stopping rate limit cleanup service:', error)
          }

          // 🔢 清理所有并发计数（Phase 1 修复：防止重启泄漏）
          try {
            logger.info('🔢 Cleaning up all concurrency counters...')
            const keys = await redis.keys('concurrency:*')
            if (keys.length > 0) {
              await redis.client.del(...keys)
              logger.info(`✅ Cleaned ${keys.length} concurrency keys`)
            } else {
              logger.info('✅ No concurrency keys to clean')
            }
          } catch (error) {
            logger.error('❌ Error cleaning up concurrency counters:', error)
            // 不阻止退出流程
          }

          try {
            await redis.disconnect()
            logger.info('👋 Redis disconnected')
          } catch (error) {
            logger.error('❌ Error disconnecting Redis:', error)
          }

          logger.success('✅ Graceful shutdown completed')
          process.exit(0)
        })

        // 强制关闭超时
        setTimeout(() => {
          logger.warn('⚠️ Forced shutdown due to timeout')
          process.exit(1)
        }, 10000)
      } else {
        process.exit(0)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // 处理未捕获异常
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught exception:', error)
      shutdown('uncaughtException')
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason)
      shutdown('unhandledRejection')
    })
  }
}

// 启动应用
if (require.main === module) {
  const app = new Application()
  app.start().catch((error) => {
    logger.error('💥 Application startup failed:', error)
    process.exit(1)
  })
}

module.exports = Application
