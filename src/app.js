const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const config = require('../config/config');
const logger = require('./utils/logger');
const redis = require('./models/redis');
const pricingService = require('./services/pricingService');

// Import routes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const webRoutes = require('./routes/web');

// Import middleware
const { 
  corsMiddleware, 
  requestLogger, 
  securityMiddleware, 
  errorHandler,
  globalRateLimit,
  requestSizeLimit
} = require('./middleware/auth');

class Application {
  constructor() {
    this.app = express();
    this.server = null;
  }

  async initialize() {
    try {
      // 🔗 连接Redis
      logger.info('🔄 Connecting to Redis...');
      await redis.connect();
      logger.success('✅ Redis connected successfully');
      
      // 💰 初始化价格服务
      logger.info('🔄 Initializing pricing service...');
      await pricingService.initialize();
      
      // 🔧 初始化管理员凭据
      logger.info('🔄 Initializing admin credentials...');
      await this.initializeAdmin();
      
      // 🛡️ 安全中间件
      this.app.use(helmet({
        contentSecurityPolicy: false, // 允许内联样式和脚本
        crossOriginEmbedderPolicy: false
      }));
      
      // 🌐 CORS
      if (config.web.enableCors) {
        this.app.use(cors());
      } else {
        this.app.use(corsMiddleware);
      }
      
      // 📦 压缩
      this.app.use(compression());
      
      // 🚦 全局速率限制（仅在生产环境启用）
      if (process.env.NODE_ENV === 'production') {
        this.app.use(globalRateLimit);
      }
      
      // 📏 请求大小限制
      this.app.use(requestSizeLimit);
      
      // 📝 请求日志（使用自定义logger而不是morgan）
      this.app.use(requestLogger);
      
      // 🔧 基础中间件
      this.app.use(express.json({ 
        limit: '10mb',
        verify: (req, res, buf, encoding) => {
          // 验证JSON格式
          if (buf && buf.length && !buf.toString(encoding || 'utf8').trim()) {
            throw new Error('Invalid JSON: empty body');
          }
        }
      }));
      this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
      this.app.use(securityMiddleware);
      
      // 🎯 信任代理
      if (config.server.trustProxy) {
        this.app.set('trust proxy', 1);
      }

      // 🛣️ 路由
      this.app.use('/api', apiRoutes);
      this.app.use('/admin', adminRoutes);
      this.app.use('/web', webRoutes);
      
      // 🏠 根路径重定向到管理界面
      this.app.get('/', (req, res) => {
        res.redirect('/web');
      });
      
      // 🏥 增强的健康检查端点
      this.app.get('/health', async (req, res) => {
        try {
          const timer = logger.timer('health-check');
          
          // 检查各个组件健康状态
          const [redisHealth, loggerHealth] = await Promise.all([
            this.checkRedisHealth(),
            this.checkLoggerHealth()
          ]);
          
          const memory = process.memoryUsage();
          const health = {
            status: 'healthy',
            service: 'claude-relay-service',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
              used: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
              total: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
              external: Math.round(memory.external / 1024 / 1024) + 'MB'
            },
            components: {
              redis: redisHealth,
              logger: loggerHealth
            },
            stats: logger.getStats()
          };
          
          timer.end('completed');
          res.json(health);
        } catch (error) {
          logger.error('❌ Health check failed:', { error: error.message, stack: error.stack });
          res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // 📊 指标端点
      this.app.get('/metrics', async (req, res) => {
        try {
          const stats = await redis.getSystemStats();
          const metrics = {
            ...stats,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          };
          
          res.json(metrics);
        } catch (error) {
          logger.error('❌ Metrics collection failed:', error);
          res.status(500).json({ error: 'Failed to collect metrics' });
        }
      });
      
      // 🚫 404 处理
      this.app.use('*', (req, res) => {
        res.status(404).json({
          error: 'Not Found',
          message: `Route ${req.originalUrl} not found`,
          timestamp: new Date().toISOString()
        });
      });
      
      // 🚨 错误处理
      this.app.use(errorHandler);
      
      logger.success('✅ Application initialized successfully');
      
    } catch (error) {
      logger.error('💥 Application initialization failed:', error);
      throw error;
    }
  }

  // 🔧 初始化管理员凭据（总是从 init.json 加载，确保数据一致性）
  async initializeAdmin() {
    try {
      const initFilePath = path.join(__dirname, '..', 'data', 'init.json');
      
      if (!fs.existsSync(initFilePath)) {
        logger.warn('⚠️ No admin credentials found. Please run npm run setup first.');
        return;
      }

      // 从 init.json 读取管理员凭据（作为唯一真实数据源）
      const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'));
      
      // 将明文密码哈希化
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(initData.adminPassword, saltRounds);
      
      // 存储到Redis（每次启动都覆盖，确保与 init.json 同步）
      const adminCredentials = {
        username: initData.adminUsername,
        passwordHash: passwordHash,
        createdAt: initData.initializedAt || new Date().toISOString(),
        lastLogin: null,
        updatedAt: initData.updatedAt || null
      };
      
      await redis.setSession('admin_credentials', adminCredentials);
      
      logger.success('✅ Admin credentials loaded from init.json (single source of truth)');
      logger.info(`📋 Admin username: ${adminCredentials.username}`);
      
    } catch (error) {
      logger.error('❌ Failed to initialize admin credentials:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  // 🔍 Redis健康检查
  async checkRedisHealth() {
    try {
      const start = Date.now();
      await redis.getClient().ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        connected: redis.isConnected,
        latency: `${latency}ms`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }

  // 📝 Logger健康检查
  async checkLoggerHealth() {
    try {
      const health = logger.healthCheck();
      return {
        status: health.healthy ? 'healthy' : 'unhealthy',
        ...health
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(config.server.port, config.server.host, () => {
        logger.start(`🚀 Claude Relay Service started on ${config.server.host}:${config.server.port}`);
        logger.info(`🌐 Web interface: http://${config.server.host}:${config.server.port}/web`);
        logger.info(`🔗 API endpoint: http://${config.server.host}:${config.server.port}/api/v1/messages`);
        logger.info(`⚙️  Admin API: http://${config.server.host}:${config.server.port}/admin`);
        logger.info(`🏥 Health check: http://${config.server.host}:${config.server.port}/health`);
        logger.info(`📊 Metrics: http://${config.server.host}:${config.server.port}/metrics`);
      });

      const serverTimeout = 600000; // 默认10分钟
      this.server.timeout = serverTimeout;
      this.server.keepAliveTimeout = serverTimeout + 5000; // keepAlive 稍长一点
      logger.info(`⏱️  Server timeout set to ${serverTimeout}ms (${serverTimeout/1000}s)`);
      

      // 🔄 定期清理任务
      this.startCleanupTasks();
      
      // 🛑 优雅关闭
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('💥 Failed to start server:', error);
      process.exit(1);
    }
  }

  startCleanupTasks() {
    // 🧹 每小时清理一次过期数据
    setInterval(async () => {
      try {
        logger.info('🧹 Starting scheduled cleanup...');
        
        const apiKeyService = require('./services/apiKeyService');
        const claudeAccountService = require('./services/claudeAccountService');
        
        const [expiredKeys, errorAccounts] = await Promise.all([
          apiKeyService.cleanupExpiredKeys(),
          claudeAccountService.cleanupErrorAccounts()
        ]);
        
        await redis.cleanup();
        
        logger.success(`🧹 Cleanup completed: ${expiredKeys} expired keys, ${errorAccounts} error accounts reset`);
      } catch (error) {
        logger.error('❌ Cleanup task failed:', error);
      }
    }, config.system.cleanupInterval);

    logger.info(`🔄 Cleanup tasks scheduled every ${config.system.cleanupInterval / 1000 / 60} minutes`);
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);
      
      if (this.server) {
        this.server.close(async () => {
          logger.info('🚪 HTTP server closed');
          
          try {
            await redis.disconnect();
            logger.info('👋 Redis disconnected');
          } catch (error) {
            logger.error('❌ Error disconnecting Redis:', error);
          }
          
          logger.success('✅ Graceful shutdown completed');
          process.exit(0);
        });

        // 强制关闭超时
        setTimeout(() => {
          logger.warn('⚠️ Forced shutdown due to timeout');
          process.exit(1);
        }, 10000);
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // 处理未捕获异常
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// 启动应用
if (require.main === module) {
  const app = new Application();
  app.start().catch((error) => {
    logger.error('💥 Application startup failed:', error);
    process.exit(1);
  });
}

module.exports = Application;