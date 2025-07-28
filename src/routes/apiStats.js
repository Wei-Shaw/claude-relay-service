const express = require('express');
const path = require('path');
const fs = require('fs');
const redis = require('../models/redis');
const logger = require('../utils/logger');
const apiKeyService = require('../services/apiKeyService');
const CostCalculator = require('../utils/costCalculator');

const router = express.Router();

// 🛡️ 安全文件服务函数
function serveStaticFile(req, res, filename, contentType) {
  const filePath = path.join(__dirname, '../../web/apiStats', filename);
  
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      logger.error(`❌ API Stats file not found: ${filePath}`);
      return res.status(404).json({ error: 'File not found' });
    }

    // 读取并返回文件内容
    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(content);
    
    logger.info(`📄 Served API Stats file: ${filename}`);
  } catch (error) {
    logger.error(`❌ Error serving API Stats file ${filename}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 🏠 API Stats 主页面
router.get('/', (req, res) => {
  serveStaticFile(req, res, 'index.html', 'text/html; charset=utf-8');
});

// 📱 JavaScript 文件
router.get('/app.js', (req, res) => {
  serveStaticFile(req, res, 'app.js', 'application/javascript; charset=utf-8');
});

// 🎨 CSS 文件
router.get('/style.css', (req, res) => {
  serveStaticFile(req, res, 'style.css', 'text/css; charset=utf-8');
});

// 🔑 获取 API Key 对应的 ID
router.post('/api/get-key-id', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      });
    }

    // 基本API Key格式验证
    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      });
    }

    // 验证API Key
    const validation = await apiKeyService.validateApiKey(apiKey);
    
    if (!validation.valid) {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
      logger.security(`🔒 Invalid API key in get-key-id: ${validation.error} from ${clientIP}`);
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      });
    }

    const keyData = validation.keyData;
    
    res.json({
      success: true,
      data: {
        id: keyData.id
      }
    });

  } catch (error) {
    logger.error('❌ Failed to get API key ID:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve API key ID'
    });
  }
});

// 📊 用户API Key统计查询接口 - 安全的自查询接口
router.post('/api/user-stats', async (req, res) => {
  try {
    const { apiKey, apiId } = req.body;
    
    let keyData;
    let keyId;
    
    if (apiId) {
      // 通过 apiId 查询
      if (typeof apiId !== 'string' || !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
        return res.status(400).json({
          error: 'Invalid API ID format',
          message: 'API ID must be a valid UUID'
        });
      }
      
      // 直接通过 ID 获取 API Key 数据
      keyData = await redis.getApiKey(apiId);
      
      if (!keyData || Object.keys(keyData).length === 0) {
        logger.security(`🔒 API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`);
        return res.status(404).json({
          error: 'API key not found',
          message: 'The specified API key does not exist'
        });
      }
      
      // 检查是否激活
      if (keyData.isActive !== 'true') {
        return res.status(403).json({
          error: 'API key is disabled',
          message: 'This API key has been disabled'
        });
      }
      
      // 检查是否过期
      if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
        return res.status(403).json({
          error: 'API key has expired',
          message: 'This API key has expired'
        });
      }
      
      keyId = apiId;
      
      // 获取使用统计
      const usage = await redis.getUsageStats(keyId);
      
      // 获取当日费用统计
      const dailyCost = await redis.getDailyCost(keyId);
      
      // 处理数据格式，与 validateApiKey 返回的格式保持一致
      // 解析限制模型数据
      let restrictedModels = [];
      try {
        restrictedModels = keyData.restrictedModels ? JSON.parse(keyData.restrictedModels) : [];
      } catch (e) {
        restrictedModels = [];
      }
      
      // 解析允许的客户端数据
      let allowedClients = [];
      try {
        allowedClients = keyData.allowedClients ? JSON.parse(keyData.allowedClients) : [];
      } catch (e) {
        allowedClients = [];
      }
      
      // 格式化 keyData
      keyData = {
        ...keyData,
        tokenLimit: parseInt(keyData.tokenLimit) || 0,
        concurrencyLimit: parseInt(keyData.concurrencyLimit) || 0,
        rateLimitWindow: parseInt(keyData.rateLimitWindow) || 0,
        rateLimitRequests: parseInt(keyData.rateLimitRequests) || 0,
        dailyCostLimit: parseFloat(keyData.dailyCostLimit) || 0,
        dailyCost: dailyCost || 0,
        enableModelRestriction: keyData.enableModelRestriction === 'true',
        restrictedModels: restrictedModels,
        enableClientRestriction: keyData.enableClientRestriction === 'true',
        allowedClients: allowedClients,
        permissions: keyData.permissions || 'all',
        usage: usage  // 使用完整的 usage 数据，而不是只有 total
      };
      
    } else if (apiKey) {
      // 通过 apiKey 查询（保持向后兼容）
      if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
        logger.security(`🔒 Invalid API key format in user stats query from ${req.ip || 'unknown'}`);
        return res.status(400).json({
          error: 'Invalid API key format',
          message: 'API key format is invalid'
        });
      }

      // 验证API Key（重用现有的验证逻辑）
      const validation = await apiKeyService.validateApiKey(apiKey);
      
      if (!validation.valid) {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
        logger.security(`🔒 Invalid API key in user stats query: ${validation.error} from ${clientIP}`);
        return res.status(401).json({
          error: 'Invalid API key',
          message: validation.error
        });
      }

      keyData = validation.keyData;
      keyId = keyData.id;
      
    } else {
      logger.security(`🔒 Missing API key or ID in user stats query from ${req.ip || 'unknown'}`);
      return res.status(400).json({
        error: 'API Key or ID is required',
        message: 'Please provide your API Key or API ID'
      });
    }

    // 记录合法查询
    logger.api(`📊 User stats query from key: ${keyData.name} (${keyId}) from ${req.ip || 'unknown'}`);

    // 获取验证结果中的完整keyData（包含isActive状态和cost信息）
    const fullKeyData = keyData;
    
    // 计算总费用 - 使用与模型统计相同的逻辑（按模型分别计算）
    let totalCost = 0;
    let formattedCost = '$0.000000';
    
    try {
      const client = redis.getClientSafe();
      
      // 获取所有月度模型统计（与model-stats接口相同的逻辑）
      const allModelKeys = await client.keys(`usage:${keyId}:model:monthly:*:*`);
      const modelUsageMap = new Map();
      
      for (const key of allModelKeys) {
        const modelMatch = key.match(/usage:.+:model:monthly:(.+):(\d{4}-\d{2})$/);
        if (!modelMatch) continue;
        
        const model = modelMatch[1];
        const data = await client.hgetall(key);
        
        if (data && Object.keys(data).length > 0) {
          if (!modelUsageMap.has(model)) {
            modelUsageMap.set(model, {
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0
            });
          }
          
          const modelUsage = modelUsageMap.get(model);
          modelUsage.inputTokens += parseInt(data.inputTokens) || 0;
          modelUsage.outputTokens += parseInt(data.outputTokens) || 0;
          modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0;
          modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0;
        }
      }
      
      // 按模型计算费用并汇总
      for (const [model, usage] of modelUsageMap) {
        const usageData = {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_creation_input_tokens: usage.cacheCreateTokens,
          cache_read_input_tokens: usage.cacheReadTokens
        };
        
        const costResult = CostCalculator.calculateCost(usageData, model);
        totalCost += costResult.costs.total;
      }
      
      // 如果没有模型级别的详细数据，回退到总体数据计算
      if (modelUsageMap.size === 0 && fullKeyData.usage?.total?.allTokens > 0) {
        const usage = fullKeyData.usage.total;
        const costUsage = {
          input_tokens: usage.inputTokens || 0,
          output_tokens: usage.outputTokens || 0,
          cache_creation_input_tokens: usage.cacheCreateTokens || 0,
          cache_read_input_tokens: usage.cacheReadTokens || 0
        };
        
        const costResult = CostCalculator.calculateCost(costUsage, 'claude-3-5-sonnet-20241022');
        totalCost = costResult.costs.total;
      }
      
      formattedCost = CostCalculator.formatCost(totalCost);
      
    } catch (error) {
      logger.warn(`Failed to calculate detailed cost for key ${keyId}:`, error);
      // 回退到简单计算
      if (fullKeyData.usage?.total?.allTokens > 0) {
        const usage = fullKeyData.usage.total;
        const costUsage = {
          input_tokens: usage.inputTokens || 0,
          output_tokens: usage.outputTokens || 0,
          cache_creation_input_tokens: usage.cacheCreateTokens || 0,
          cache_read_input_tokens: usage.cacheReadTokens || 0
        };
        
        const costResult = CostCalculator.calculateCost(costUsage, 'claude-3-5-sonnet-20241022');
        totalCost = costResult.costs.total;
        formattedCost = costResult.formatted.total;
      }
    }

    // 构建响应数据（只返回该API Key自己的信息，确保不泄露其他信息）
    const responseData = {
      id: keyId,
      name: fullKeyData.name,
      description: keyData.description || '',
      isActive: true, // 如果能通过validateApiKey验证，说明一定是激活的
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
      permissions: fullKeyData.permissions,
      
      // 使用统计（使用验证结果中的完整数据）
      usage: {
        total: {
          ...(fullKeyData.usage?.total || {
            requests: 0,
            tokens: 0,
            allTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0
          }),
          cost: totalCost,
          formattedCost: formattedCost
        }
      },
      
      // 限制信息（只显示配置，不显示当前使用量）
      limits: {
        tokenLimit: fullKeyData.tokenLimit || 0,
        concurrencyLimit: fullKeyData.concurrencyLimit || 0,
        rateLimitWindow: fullKeyData.rateLimitWindow || 0,
        rateLimitRequests: fullKeyData.rateLimitRequests || 0,
        dailyCostLimit: fullKeyData.dailyCostLimit || 0
      },
      
      // 绑定的账户信息（只显示ID，不显示敏感信息）
      accounts: {
        claudeAccountId: fullKeyData.claudeAccountId && fullKeyData.claudeAccountId !== '' ? fullKeyData.claudeAccountId : null,
        geminiAccountId: fullKeyData.geminiAccountId && fullKeyData.geminiAccountId !== '' ? fullKeyData.geminiAccountId : null
      },
      
      // 模型和客户端限制信息
      restrictions: {
        enableModelRestriction: fullKeyData.enableModelRestriction || false,
        restrictedModels: fullKeyData.restrictedModels || [],
        enableClientRestriction: fullKeyData.enableClientRestriction || false,
        allowedClients: fullKeyData.allowedClients || []
      }
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    logger.error('❌ Failed to process user stats query:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve API key statistics'
    });
  }
});

// 📊 用户模型统计查询接口 - 安全的自查询接口
router.post('/api/user-model-stats', async (req, res) => {
  try {
    const { apiKey, apiId, period = 'monthly' } = req.body;
    
    let keyData;
    let keyId;
    
    if (apiId) {
      // 通过 apiId 查询
      if (typeof apiId !== 'string' || !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
        return res.status(400).json({
          error: 'Invalid API ID format',
          message: 'API ID must be a valid UUID'
        });
      }
      
      // 直接通过 ID 获取 API Key 数据
      keyData = await redis.getApiKey(apiId);
      
      if (!keyData || Object.keys(keyData).length === 0) {
        logger.security(`🔒 API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`);
        return res.status(404).json({
          error: 'API key not found',
          message: 'The specified API key does not exist'
        });
      }
      
      // 检查是否激活
      if (keyData.isActive !== 'true') {
        return res.status(403).json({
          error: 'API key is disabled',
          message: 'This API key has been disabled'
        });
      }
      
      keyId = apiId;
      
      // 获取使用统计
      const usage = await redis.getUsageStats(keyId);
      keyData.usage = { total: usage.total };
      
    } else if (apiKey) {
      // 通过 apiKey 查询（保持向后兼容）
      // 验证API Key
      const validation = await apiKeyService.validateApiKey(apiKey);
      
      if (!validation.valid) {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
        logger.security(`🔒 Invalid API key in user model stats query: ${validation.error} from ${clientIP}`);
        return res.status(401).json({
          error: 'Invalid API key',
          message: validation.error
        });
      }

      keyData = validation.keyData;
      keyId = keyData.id;
      
    } else {
      logger.security(`🔒 Missing API key or ID in user model stats query from ${req.ip || 'unknown'}`);
      return res.status(400).json({
        error: 'API Key or ID is required',
        message: 'Please provide your API Key or API ID'
      });
    }
    
    logger.api(`📊 User model stats query from key: ${keyData.name} (${keyId}) for period: ${period}`);

    // 重用管理后台的模型统计逻辑，但只返回该API Key的数据
    const client = redis.getClientSafe();
    // 使用与管理页面相同的时区处理逻辑
    const tzDate = redis.getDateInTimezone();
    const today = redis.getDateStringInTimezone();
    const currentMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`;
    
    const pattern = period === 'daily' ? 
      `usage:${keyId}:model:daily:*:${today}` : 
      `usage:${keyId}:model:monthly:*:${currentMonth}`;
    
    const keys = await client.keys(pattern);
    const modelStats = [];
    
    for (const key of keys) {
      const match = key.match(period === 'daily' ? 
        /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/ : 
        /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
      );
      
      if (!match) continue;
      
      const model = match[1];
      const data = await client.hgetall(key);
      
      if (data && Object.keys(data).length > 0) {
        const usage = {
          input_tokens: parseInt(data.inputTokens) || 0,
          output_tokens: parseInt(data.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
        };
        
        const costData = CostCalculator.calculateCost(usage, model);
        
        modelStats.push({
          model,
          requests: parseInt(data.requests) || 0,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreateTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          allTokens: parseInt(data.allTokens) || 0,
          costs: costData.costs,
          formatted: costData.formatted,
          pricing: costData.pricing
        });
      }
    }

    // 如果没有详细的模型数据，不显示历史数据以避免混淆
    // 只有在查询特定时间段时返回空数组，表示该时间段确实没有数据
    if (modelStats.length === 0) {
      logger.info(`📊 No model stats found for key ${keyId} in period ${period}`);
    }

    // 按总token数降序排列
    modelStats.sort((a, b) => b.allTokens - a.allTokens);

    res.json({
      success: true,
      data: modelStats,
      period: period
    });

  } catch (error) {
    logger.error('❌ Failed to process user model stats query:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve model statistics'
    });
  }
});

module.exports = router;