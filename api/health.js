/**
 * 健康检查端点 - Vercel Function
 */

const kv = require('../lib/database/kv');
const logger = require('../lib/utils/logger');

export default async function handler(req, res) {
  // 只允许 GET 请求
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET requests are allowed'
    });
  }

  try {
    const timer = logger.timer('health-check');
    
    // 检查各个组件健康状态
    const [kvHealth, loggerHealth] = await Promise.all([
      checkKVHealth(),
      checkLoggerHealth()
    ]);
    
    const memory = process.memoryUsage();
    const health = {
      status: 'healthy',
      service: 'claude-relay-service-vercel',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      platform: 'vercel',
      runtime: 'nodejs',
      memory: {
        used: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(memory.external / 1024 / 1024) + 'MB'
      },
      components: {
        kv: kvHealth,
        logger: loggerHealth
      },
      environment: {
        vercel: process.env.VERCEL === '1',
        vercelEnv: process.env.VERCEL_ENV || 'development',
        nodeEnv: process.env.NODE_ENV || 'development'
      }
    };
    
    timer.end('completed');
    
    res.json(health);
    
  } catch (error) {
    logger.error('❌ Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'claude-relay-service-vercel'
    });
  }
}

// 检查 KV 健康状态
async function checkKVHealth() {
  try {
    const start = Date.now();
    
    // 测试 KV 连接
    const testKey = 'health_check_test';
    const testValue = Date.now().toString();
    
    await kv.getClient().set(testKey, testValue, { ex: 10 });
    const retrievedValue = await kv.getClient().get(testKey);
    await kv.getClient().del(testKey);
    
    const latency = Date.now() - start;
    
    return {
      status: 'healthy',
      connected: true,
      latency: `${latency}ms`,
      testPassed: retrievedValue === testValue
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error.message
    };
  }
}

// 检查 Logger 健康状态
async function checkLoggerHealth() {
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