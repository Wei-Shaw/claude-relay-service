const express = require('express');
const apiKeyService = require('../services/apiKeyService');
const claudeAccountService = require('../services/claudeAccountService');
const geminiAccountService = require('../services/geminiAccountService');
const redis = require('../models/redis');
const { authenticateAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const oauthHelper = require('../utils/oauthHelper');
const CostCalculator = require('../utils/costCalculator');
const pricingService = require('../services/pricingService');
const claudeCodeHeadersService = require('../services/claudeCodeHeadersService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');

const router = express.Router();

// 🔑 API Keys 管理

// 调试：获取API Key费用详情
router.get('/api-keys/:keyId/cost-debug', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params;
    const costStats = await redis.getCostStats(keyId);
    const dailyCost = await redis.getDailyCost(keyId);
    const today = redis.getDateStringInTimezone();
    const client = redis.getClientSafe();
    
    // 获取所有相关的Redis键
    const costKeys = await client.keys(`usage:cost:*:${keyId}:*`);
    const keyValues = {};
    
    for (const key of costKeys) {
      keyValues[key] = await client.get(key);
    }
    
    res.json({
      keyId,
      today,
      dailyCost,
      costStats,
      redisKeys: keyValues,
      timezone: config.system.timezoneOffset || 8
    });
  } catch (error) {
    logger.error('❌ Failed to get cost debug info:', error);
    res.status(500).json({ error: 'Failed to get cost debug info', message: error.message });
  }
});

// 获取所有API Keys
router.get('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const { timeRange = 'all' } = req.query; // all, 7days, monthly
    const apiKeys = await apiKeyService.getAllApiKeys();
    
    // 根据时间范围计算查询模式
    const now = new Date();
    let searchPatterns = [];
    
    if (timeRange === 'today') {
      // 今日 - 使用时区日期
      const redis = require('../models/redis');
      const tzDate = redis.getDateInTimezone(now);
      const dateStr = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}-${String(tzDate.getDate()).padStart(2, '0')}`;
      searchPatterns.push(`usage:daily:*:${dateStr}`);
    } else if (timeRange === '7days') {
      // 最近7天
      const redis = require('../models/redis');
      for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const tzDate = redis.getDateInTimezone(date);
        const dateStr = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}-${String(tzDate.getDate()).padStart(2, '0')}`;
        searchPatterns.push(`usage:daily:*:${dateStr}`);
      }
    } else if (timeRange === 'monthly') {
      // 本月
      const redis = require('../models/redis');
      const tzDate = redis.getDateInTimezone(now);
      const currentMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`;
      searchPatterns.push(`usage:monthly:*:${currentMonth}`);
    }
    
    // 为每个API Key计算准确的费用和统计数据
    for (const apiKey of apiKeys) {
      const client = redis.getClientSafe();
      
      if (timeRange === 'all') {
        // 全部时间：保持原有逻辑
        if (apiKey.usage && apiKey.usage.total) {
          // 使用与展开模型统计相同的数据源
          // 获取所有时间的模型统计数据
          const monthlyKeys = await client.keys(`usage:${apiKey.id}:model:monthly:*:*`);
        const modelStatsMap = new Map();
        
        // 汇总所有月份的数据
        for (const key of monthlyKeys) {
          const match = key.match(/usage:.+:model:monthly:(.+):\d{4}-\d{2}$/);
          if (!match) continue;
          
          const model = match[1];
          const data = await client.hgetall(key);
          
          if (data && Object.keys(data).length > 0) {
            if (!modelStatsMap.has(model)) {
              modelStatsMap.set(model, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              });
            }
            
            const stats = modelStatsMap.get(model);
            stats.inputTokens += parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0;
            stats.outputTokens += parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0;
            stats.cacheCreateTokens += parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0;
            stats.cacheReadTokens += parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0;
          }
        }
        
        let totalCost = 0;
        
        // 计算每个模型的费用
        for (const [model, stats] of modelStatsMap) {
          const usage = {
            input_tokens: stats.inputTokens,
            output_tokens: stats.outputTokens,
            cache_creation_input_tokens: stats.cacheCreateTokens,
            cache_read_input_tokens: stats.cacheReadTokens
          };
          
          const costResult = CostCalculator.calculateCost(usage, model);
          totalCost += costResult.costs.total;
        }
        
        // 如果没有详细的模型数据，使用总量数据和默认模型计算
        if (modelStatsMap.size === 0) {
          const usage = {
            input_tokens: apiKey.usage.total.inputTokens || 0,
            output_tokens: apiKey.usage.total.outputTokens || 0,
            cache_creation_input_tokens: apiKey.usage.total.cacheCreateTokens || 0,
            cache_read_input_tokens: apiKey.usage.total.cacheReadTokens || 0
          };
          
          const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022');
          totalCost = costResult.costs.total;
        }
        
          // 添加格式化的费用到响应数据
          apiKey.usage.total.cost = totalCost;
          apiKey.usage.total.formattedCost = CostCalculator.formatCost(totalCost);
        }
      } else {
        // 7天或本月：重新计算统计数据
        const tempUsage = {
          requests: 0,
          tokens: 0,
          allTokens: 0, // 添加allTokens字段
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0
        };
        
        // 获取指定时间范围的统计数据
        for (const pattern of searchPatterns) {
          const keys = await client.keys(pattern.replace('*', apiKey.id));
          
          for (const key of keys) {
            const data = await client.hgetall(key);
            if (data && Object.keys(data).length > 0) {
              // 使用与 redis.js incrementTokenUsage 中相同的字段名
              tempUsage.requests += parseInt(data.totalRequests) || parseInt(data.requests) || 0;
              tempUsage.tokens += parseInt(data.totalTokens) || parseInt(data.tokens) || 0;
              tempUsage.allTokens += parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0; // 读取包含所有Token的字段
              tempUsage.inputTokens += parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0;
              tempUsage.outputTokens += parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0;
              tempUsage.cacheCreateTokens += parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0;
              tempUsage.cacheReadTokens += parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0;
            }
          }
        }
        
        // 计算指定时间范围的费用
        let totalCost = 0;
        const redis = require('../models/redis');
        const tzToday = redis.getDateStringInTimezone(now);
        const tzDate = redis.getDateInTimezone(now);
        const tzMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`;
        
        const modelKeys = timeRange === 'today' 
          ? await client.keys(`usage:${apiKey.id}:model:daily:*:${tzToday}`)
          : timeRange === '7days' 
          ? await client.keys(`usage:${apiKey.id}:model:daily:*:*`)
          : await client.keys(`usage:${apiKey.id}:model:monthly:*:${tzMonth}`);
        
        const modelStatsMap = new Map();
        
        // 过滤和汇总相应时间范围的模型数据
        for (const key of modelKeys) {
          if (timeRange === '7days') {
            // 检查是否在最近7天内
            const dateMatch = key.match(/\d{4}-\d{2}-\d{2}$/);
            if (dateMatch) {
              const keyDate = new Date(dateMatch[0]);
              const daysDiff = Math.floor((now - keyDate) / (1000 * 60 * 60 * 24));
              if (daysDiff > 6) continue;
            }
          } else if (timeRange === 'today') {
            // today选项已经在查询时过滤了，不需要额外处理
          }
          
          const modelMatch = key.match(/usage:.+:model:(?:daily|monthly):(.+):\d{4}-\d{2}(?:-\d{2})?$/);
          if (!modelMatch) continue;
          
          const model = modelMatch[1];
          const data = await client.hgetall(key);
          
          if (data && Object.keys(data).length > 0) {
            if (!modelStatsMap.has(model)) {
              modelStatsMap.set(model, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              });
            }
            
            const stats = modelStatsMap.get(model);
            stats.inputTokens += parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0;
            stats.outputTokens += parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0;
            stats.cacheCreateTokens += parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0;
            stats.cacheReadTokens += parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0;
          }
        }
        
        // 计算费用
        for (const [model, stats] of modelStatsMap) {
          const usage = {
            input_tokens: stats.inputTokens,
            output_tokens: stats.outputTokens,
            cache_creation_input_tokens: stats.cacheCreateTokens,
            cache_read_input_tokens: stats.cacheReadTokens
          };
          
          const costResult = CostCalculator.calculateCost(usage, model);
          totalCost += costResult.costs.total;
        }
        
        // 如果没有模型数据，使用临时统计数据计算
        if (modelStatsMap.size === 0 && tempUsage.tokens > 0) {
          const usage = {
            input_tokens: tempUsage.inputTokens,
            output_tokens: tempUsage.outputTokens,
            cache_creation_input_tokens: tempUsage.cacheCreateTokens,
            cache_read_input_tokens: tempUsage.cacheReadTokens
          };
          
          const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022');
          totalCost = costResult.costs.total;
        }
        
        // 使用从Redis读取的allTokens，如果没有则计算
        const allTokens = tempUsage.allTokens || (tempUsage.inputTokens + tempUsage.outputTokens + tempUsage.cacheCreateTokens + tempUsage.cacheReadTokens);
        
        // 更新API Key的usage数据为指定时间范围的数据
        apiKey.usage[timeRange] = {
          ...tempUsage,
          tokens: allTokens, // 使用包含所有Token的总数
          allTokens: allTokens,
          cost: totalCost,
          formattedCost: CostCalculator.formatCost(totalCost)
        };
        
        // 为了保持兼容性，也更新total字段
        apiKey.usage.total = apiKey.usage[timeRange];
      }
    }
    
    res.json({ success: true, data: apiKeys });
  } catch (error) {
    logger.error('❌ Failed to get API keys:', error);
    res.status(500).json({ error: 'Failed to get API keys', message: error.message });
  }
});

// 获取支持的客户端列表
router.get('/supported-clients', authenticateAdmin, async (req, res) => {
  try {
    const clients = config.clientRestrictions.predefinedClients.map(client => ({
      id: client.id,
      name: client.name,
      description: client.description
    }));
    res.json({ success: true, data: clients });
  } catch (error) {
    logger.error('❌ Failed to get supported clients:', error);
    res.status(500).json({ error: 'Failed to get supported clients', message: error.message });
  }
});

// 创建新的API Key
router.post('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      geminiAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      tags
    } = req.body;

    // 输入验证
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' });
    }

    if (description && (typeof description !== 'string' || description.length > 500)) {
      return res.status(400).json({ error: 'Description must be a string with less than 500 characters' });
    }

    if (tokenLimit && (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0)) {
      return res.status(400).json({ error: 'Token limit must be a non-negative integer' });
    }


    if (concurrencyLimit !== undefined && concurrencyLimit !== null && concurrencyLimit !== '' && (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0)) {
      return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' });
    }
    
    if (rateLimitWindow !== undefined && rateLimitWindow !== null && rateLimitWindow !== '' && (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 1)) {
      return res.status(400).json({ error: 'Rate limit window must be a positive integer (minutes)' });
    }
    
    if (rateLimitRequests !== undefined && rateLimitRequests !== null && rateLimitRequests !== '' && (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 1)) {
      return res.status(400).json({ error: 'Rate limit requests must be a positive integer' });
    }

    // 验证模型限制字段
    if (enableModelRestriction !== undefined && typeof enableModelRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable model restriction must be a boolean' });
    }

    if (restrictedModels !== undefined && !Array.isArray(restrictedModels)) {
      return res.status(400).json({ error: 'Restricted models must be an array' });
    }

    // 验证客户端限制字段
    if (enableClientRestriction !== undefined && typeof enableClientRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable client restriction must be a boolean' });
    }

    if (allowedClients !== undefined && !Array.isArray(allowedClients)) {
      return res.status(400).json({ error: 'Allowed clients must be an array' });
    }

    // 验证标签字段
    if (tags !== undefined && !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }
    
    if (tags && tags.some(tag => typeof tag !== 'string' || tag.trim().length === 0)) {
      return res.status(400).json({ error: 'All tags must be non-empty strings' });
    }

    const newKey = await apiKeyService.generateApiKey({
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      geminiAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      tags
    });

    logger.success(`🔑 Admin created new API key: ${name}`);
    res.json({ success: true, data: newKey });
  } catch (error) {
    logger.error('❌ Failed to create API key:', error);
    res.status(500).json({ error: 'Failed to create API key', message: error.message });
  }
});

// 更新API Key
router.put('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { tokenLimit, concurrencyLimit, rateLimitWindow, rateLimitRequests, claudeAccountId, geminiAccountId, permissions, enableModelRestriction, restrictedModels, enableClientRestriction, allowedClients, expiresAt, dailyCostLimit, tags } = req.body;

    // 只允许更新指定字段
    const updates = {};
    
    if (tokenLimit !== undefined && tokenLimit !== null && tokenLimit !== '') {
      if (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0) {
        return res.status(400).json({ error: 'Token limit must be a non-negative integer' });
      }
      updates.tokenLimit = Number(tokenLimit);
    }

    if (concurrencyLimit !== undefined && concurrencyLimit !== null && concurrencyLimit !== '') {
      if (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0) {
        return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' });
      }
      updates.concurrencyLimit = Number(concurrencyLimit);
    }
    
    if (rateLimitWindow !== undefined && rateLimitWindow !== null && rateLimitWindow !== '') {
      if (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 0) {
        return res.status(400).json({ error: 'Rate limit window must be a non-negative integer (minutes)' });
      }
      updates.rateLimitWindow = Number(rateLimitWindow);
    }
    
    if (rateLimitRequests !== undefined && rateLimitRequests !== null && rateLimitRequests !== '') {
      if (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 0) {
        return res.status(400).json({ error: 'Rate limit requests must be a non-negative integer' });
      }
      updates.rateLimitRequests = Number(rateLimitRequests);
    }

    if (claudeAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.claudeAccountId = claudeAccountId || '';
    }

    if (geminiAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.geminiAccountId = geminiAccountId || '';
    }

    if (permissions !== undefined) {
      // 验证权限值
      if (!['claude', 'gemini', 'all'].includes(permissions)) {
        return res.status(400).json({ error: 'Invalid permissions value. Must be claude, gemini, or all' });
      }
      updates.permissions = permissions;
    }

    // 处理模型限制字段
    if (enableModelRestriction !== undefined) {
      if (typeof enableModelRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable model restriction must be a boolean' });
      }
      updates.enableModelRestriction = enableModelRestriction;
    }

    if (restrictedModels !== undefined) {
      if (!Array.isArray(restrictedModels)) {
        return res.status(400).json({ error: 'Restricted models must be an array' });
      }
      updates.restrictedModels = restrictedModels;
    }

    // 处理客户端限制字段
    if (enableClientRestriction !== undefined) {
      if (typeof enableClientRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable client restriction must be a boolean' });
      }
      updates.enableClientRestriction = enableClientRestriction;
    }

    if (allowedClients !== undefined) {
      if (!Array.isArray(allowedClients)) {
        return res.status(400).json({ error: 'Allowed clients must be an array' });
      }
      updates.allowedClients = allowedClients;
    }

    // 处理过期时间字段
    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        // null 表示永不过期
        updates.expiresAt = null;
      } else {
        // 验证日期格式
        const expireDate = new Date(expiresAt);
        if (isNaN(expireDate.getTime())) {
          return res.status(400).json({ error: 'Invalid expiration date format' });
        }
        updates.expiresAt = expiresAt;
      }
    }

    // 处理每日费用限制
    if (dailyCostLimit !== undefined && dailyCostLimit !== null && dailyCostLimit !== '') {
      const costLimit = Number(dailyCostLimit);
      if (isNaN(costLimit) || costLimit < 0) {
        return res.status(400).json({ error: 'Daily cost limit must be a non-negative number' });
      }
      updates.dailyCostLimit = costLimit;
    }

    // 处理标签
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
      }
      if (tags.some(tag => typeof tag !== 'string' || tag.trim().length === 0)) {
        return res.status(400).json({ error: 'All tags must be non-empty strings' });
      }
      updates.tags = tags;
    }

    await apiKeyService.updateApiKey(keyId, updates);
    
    logger.success(`📝 Admin updated API key: ${keyId}`);
    res.json({ success: true, message: 'API key updated successfully' });
  } catch (error) {
    logger.error('❌ Failed to update API key:', error);
    res.status(500).json({ error: 'Failed to update API key', message: error.message });
  }
});

// 删除API Key
router.delete('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params;
    
    await apiKeyService.deleteApiKey(keyId);
    
    logger.success(`🗑️ Admin deleted API key: ${keyId}`);
    res.json({ success: true, message: 'API key deleted successfully' });
  } catch (error) {
    logger.error('❌ Failed to delete API key:', error);
    res.status(500).json({ error: 'Failed to delete API key', message: error.message });
  }
});

// 🏢 Claude 账户管理

// 生成OAuth授权URL
router.post('/claude-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body; // 接收代理配置
    const oauthParams = await oauthHelper.generateOAuthParams();
    
    // 将codeVerifier和state临时存储到Redis，用于后续验证
    const sessionId = require('crypto').randomUUID();
    await redis.setOAuthSession(sessionId, {
      codeVerifier: oauthParams.codeVerifier,
      state: oauthParams.state,
      codeChallenge: oauthParams.codeChallenge,
      proxy: proxy || null, // 存储代理配置
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10分钟过期
    });
    
    logger.success('🔗 Generated OAuth authorization URL with proxy support');
    res.json({ 
      success: true, 
      data: {
        authUrl: oauthParams.authUrl,
        sessionId: sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Anthropic 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL',
          '5. 在添加账户表单中粘贴完整的回调 URL 和授权码'
        ]
      }
    });
  } catch (error) {
    logger.error('❌ Failed to generate OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL', message: error.message });
  }
});

// 验证授权码并获取token
router.post('/claude-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, authorizationCode, callbackUrl } = req.body;
    
    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res.status(400).json({ error: 'Session ID and authorization code (or callback URL) are required' });
    }
    
    // 从Redis获取OAuth会话信息
    const oauthSession = await redis.getOAuthSession(sessionId);
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' });
    }
    
    // 检查会话是否过期
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId);
      return res.status(400).json({ error: 'OAuth session has expired, please generate a new authorization URL' });
    }
    
    // 统一处理授权码输入（可能是直接的code或完整的回调URL）
    let finalAuthCode;
    const inputValue = callbackUrl || authorizationCode;
    
    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue);
    } catch (parseError) {
      return res.status(400).json({ error: 'Failed to parse authorization input', message: parseError.message });
    }
    
    // 交换访问令牌
    const tokenData = await oauthHelper.exchangeCodeForTokens(
      finalAuthCode,
      oauthSession.codeVerifier,
      oauthSession.state,
      oauthSession.proxy // 传递代理配置
    );
    
    // 清理OAuth会话
    await redis.deleteOAuthSession(sessionId);
    
    logger.success('🎉 Successfully exchanged authorization code for tokens');
    res.json({ 
      success: true, 
      data: {
        claudeAiOauth: tokenData
      }
    });
  } catch (error) {
    logger.error('❌ Failed to exchange authorization code:', {
      error: error.message,
      sessionId: req.body.sessionId,
      // 不记录完整的授权码，只记录长度和前几个字符
      codeLength: req.body.callbackUrl ? req.body.callbackUrl.length : (req.body.authorizationCode ? req.body.authorizationCode.length : 0),
      codePrefix: req.body.callbackUrl ? req.body.callbackUrl.substring(0, 10) + '...' : (req.body.authorizationCode ? req.body.authorizationCode.substring(0, 10) + '...' : 'N/A')
    });
    res.status(500).json({ error: 'Failed to exchange authorization code', message: error.message });
  }
});

// 获取所有Claude账户
router.get('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await claudeAccountService.getAllAccounts();
    
    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(accounts.map(async (account) => {
      try {
        const usageStats = await redis.getAccountUsageStats(account.id);
        return {
          ...account,
          usage: {
            daily: usageStats.daily,
            total: usageStats.total,
            averages: usageStats.averages
          }
        };
      } catch (statsError) {
        logger.warn(`⚠️ Failed to get usage stats for account ${account.id}:`, statsError.message);
        // 如果获取统计失败，返回空统计
        return {
          ...account,
          usage: {
            daily: { tokens: 0, requests: 0, allTokens: 0 },
            total: { tokens: 0, requests: 0, allTokens: 0 },
            averages: { rpm: 0, tpm: 0 }
          }
        };
      }
    }));
    
    res.json({ success: true, data: accountsWithStats });
  } catch (error) {
    logger.error('❌ Failed to get Claude accounts:', error);
    res.status(500).json({ error: 'Failed to get Claude accounts', message: error.message });
  }
});

// 创建新的Claude账户
router.post('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // 验证accountType的有效性
    if (accountType && !['shared', 'dedicated'].includes(accountType)) {
      return res.status(400).json({ error: 'Invalid account type. Must be "shared" or "dedicated"' });
    }

    const newAccount = await claudeAccountService.createAccount({
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType: accountType || 'shared' // 默认为共享类型
    });

    logger.success(`🏢 Admin created new Claude account: ${name} (${accountType || 'shared'})`);
    res.json({ success: true, data: newAccount });
  } catch (error) {
    logger.error('❌ Failed to create Claude account:', error);
    res.status(500).json({ error: 'Failed to create Claude account', message: error.message });
  }
});

// 更新Claude账户
router.put('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const updates = req.body;

    await claudeAccountService.updateAccount(accountId, updates);
    
    logger.success(`📝 Admin updated Claude account: ${accountId}`);
    res.json({ success: true, message: 'Claude account updated successfully' });
  } catch (error) {
    logger.error('❌ Failed to update Claude account:', error);
    res.status(500).json({ error: 'Failed to update Claude account', message: error.message });
  }
});

// 删除Claude账户
router.delete('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    
    await claudeAccountService.deleteAccount(accountId);
    
    logger.success(`🗑️ Admin deleted Claude account: ${accountId}`);
    res.json({ success: true, message: 'Claude account deleted successfully' });
  } catch (error) {
    logger.error('❌ Failed to delete Claude account:', error);
    res.status(500).json({ error: 'Failed to delete Claude account', message: error.message });
  }
});

// 刷新Claude账户token
router.post('/claude-accounts/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const result = await claudeAccountService.refreshAccountToken(accountId);
    
    logger.success(`🔄 Admin refreshed token for Claude account: ${accountId}`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('❌ Failed to refresh Claude account token:', error);
    res.status(500).json({ error: 'Failed to refresh token', message: error.message });
  }
});

// 🤖 Gemini 账户管理

// 生成 Gemini OAuth 授权 URL
router.post('/gemini-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { state } = req.body;
    
    // 使用固定的 localhost:45462 作为回调地址
    const redirectUri = 'http://localhost:45462';
    
    logger.info(`Generating Gemini OAuth URL with redirect_uri: ${redirectUri}`);
    
    const { authUrl, state: authState } = await geminiAccountService.generateAuthUrl(state, redirectUri);
    
    // 创建 OAuth 会话
    const sessionId = authState;
    await redis.setOAuthSession(sessionId, {
      state: authState,
      type: 'gemini',
      redirectUri: redirectUri, // 保存固定的 redirect_uri 用于 token 交换
      createdAt: new Date().toISOString()
    });
    
    logger.info(`Generated Gemini OAuth URL with session: ${sessionId}`);
    res.json({ 
      success: true, 
      data: { 
        authUrl,
        sessionId
      } 
    });
  } catch (error) {
    logger.error('❌ Failed to generate Gemini auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL', message: error.message });
  }
});

// 轮询 Gemini OAuth 授权状态
router.post('/gemini-accounts/poll-auth-status', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const result = await geminiAccountService.pollAuthorizationStatus(sessionId);
    
    if (result.success) {
      logger.success(`✅ Gemini OAuth authorization successful for session: ${sessionId}`);
      res.json({ success: true, data: { tokens: result.tokens } });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('❌ Failed to poll Gemini auth status:', error);
    res.status(500).json({ error: 'Failed to poll auth status', message: error.message });
  }
});

// 交换 Gemini 授权码
router.post('/gemini-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    // 使用固定的 localhost:45462 作为 redirect_uri
    const redirectUri = 'http://localhost:45462';
    logger.info(`Using fixed redirect_uri: ${redirectUri}`);
    
    const tokens = await geminiAccountService.exchangeCodeForTokens(code, redirectUri);
    
    // 清理 OAuth 会话
    if (sessionId) {
      await redis.deleteOAuthSession(sessionId);
    }
    
    logger.success('✅ Successfully exchanged Gemini authorization code');
    res.json({ success: true, data: { tokens } });
  } catch (error) {
    logger.error('❌ Failed to exchange Gemini authorization code:', error);
    res.status(500).json({ error: 'Failed to exchange code', message: error.message });
  }
});

// 获取所有 Gemini 账户
router.get('/gemini-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await geminiAccountService.getAllAccounts();
    
    // 为Gemini账户添加空的使用统计（暂时）
    const accountsWithStats = accounts.map(account => ({
      ...account,
      usage: {
        daily: { tokens: 0, requests: 0, allTokens: 0 },
        total: { tokens: 0, requests: 0, allTokens: 0 },
        averages: { rpm: 0, tpm: 0 }
      }
    }));
    
    res.json({ success: true, data: accountsWithStats });
  } catch (error) {
    logger.error('❌ Failed to get Gemini accounts:', error);
    res.status(500).json({ error: 'Failed to get accounts', message: error.message });
  }
});

// 创建新的 Gemini 账户
router.post('/gemini-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accountData = req.body;
    
    // 输入验证
    if (!accountData.name) {
      return res.status(400).json({ error: 'Account name is required' });
    }
    
    const newAccount = await geminiAccountService.createAccount(accountData);
    
    logger.success(`🏢 Admin created new Gemini account: ${accountData.name}`);
    res.json({ success: true, data: newAccount });
  } catch (error) {
    logger.error('❌ Failed to create Gemini account:', error);
    res.status(500).json({ error: 'Failed to create account', message: error.message });
  }
});

// 更新 Gemini 账户
router.put('/gemini-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const updates = req.body;
    
    const updatedAccount = await geminiAccountService.updateAccount(accountId, updates);
    
    logger.success(`📝 Admin updated Gemini account: ${accountId}`);
    res.json({ success: true, data: updatedAccount });
  } catch (error) {
    logger.error('❌ Failed to update Gemini account:', error);
    res.status(500).json({ error: 'Failed to update account', message: error.message });
  }
});

// 删除 Gemini 账户
router.delete('/gemini-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    
    await geminiAccountService.deleteAccount(accountId);
    
    logger.success(`🗑️ Admin deleted Gemini account: ${accountId}`);
    res.json({ success: true, message: 'Gemini account deleted successfully' });
  } catch (error) {
    logger.error('❌ Failed to delete Gemini account:', error);
    res.status(500).json({ error: 'Failed to delete account', message: error.message });
  }
});

// 刷新 Gemini 账户 token
router.post('/gemini-accounts/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const result = await geminiAccountService.refreshAccountToken(accountId);
    
    logger.success(`🔄 Admin refreshed token for Gemini account: ${accountId}`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('❌ Failed to refresh Gemini account token:', error);
    res.status(500).json({ error: 'Failed to refresh token', message: error.message });
  }
});

// 📊 账户使用统计

// 获取所有账户的使用统计
router.get('/accounts/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const accountsStats = await redis.getAllAccountsUsageStats();
    
    res.json({
      success: true,
      data: accountsStats,
      summary: {
        totalAccounts: accountsStats.length,
        activeToday: accountsStats.filter(account => account.daily.requests > 0).length,
        totalDailyTokens: accountsStats.reduce((sum, account) => sum + (account.daily.allTokens || 0), 0),
        totalDailyRequests: accountsStats.reduce((sum, account) => sum + (account.daily.requests || 0), 0)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to get accounts usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get accounts usage stats',
      message: error.message
    });
  }
});

// 获取单个账户的使用统计
router.get('/accounts/:accountId/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const accountStats = await redis.getAccountUsageStats(accountId);
    
    // 获取账户基本信息
    const accountData = await claudeAccountService.getAccount(accountId);
    if (!accountData) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        ...accountStats,
        accountInfo: {
          name: accountData.name,
          email: accountData.email,
          status: accountData.status,
          isActive: accountData.isActive,
          createdAt: accountData.createdAt
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to get account usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get account usage stats',
      message: error.message
    });
  }
});

// 📊 系统统计

// 获取系统概览
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const [, apiKeys, claudeAccounts, geminiAccounts, todayStats, systemAverages] = await Promise.all([
      redis.getSystemStats(),
      apiKeyService.getAllApiKeys(),
      claudeAccountService.getAllAccounts(),
      geminiAccountService.getAllAccounts(),
      redis.getTodayStats(),
      redis.getSystemAverages()
    ]);

    // 计算使用统计（统一使用allTokens）
    const totalTokensUsed = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.allTokens || 0), 0);
    const totalRequestsUsed = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.requests || 0), 0);
    const totalInputTokensUsed = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.inputTokens || 0), 0);
    const totalOutputTokensUsed = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.outputTokens || 0), 0);
    const totalCacheCreateTokensUsed = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.cacheCreateTokens || 0), 0);
    const totalCacheReadTokensUsed = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.cacheReadTokens || 0), 0);
    const totalAllTokensUsed = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.allTokens || 0), 0);
    
    const activeApiKeys = apiKeys.filter(key => key.isActive).length;
    const activeClaudeAccounts = claudeAccounts.filter(acc => acc.isActive && acc.status === 'active').length;
    const rateLimitedClaudeAccounts = claudeAccounts.filter(acc => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited).length;
    const activeGeminiAccounts = geminiAccounts.filter(acc => acc.isActive && acc.status === 'active').length;
    const rateLimitedGeminiAccounts = geminiAccounts.filter(acc => acc.rateLimitStatus === 'limited').length;

    const dashboard = {
      overview: {
        totalApiKeys: apiKeys.length,
        activeApiKeys,
        totalClaudeAccounts: claudeAccounts.length,
        activeClaudeAccounts: activeClaudeAccounts,
        rateLimitedClaudeAccounts: rateLimitedClaudeAccounts,
        totalGeminiAccounts: geminiAccounts.length,
        activeGeminiAccounts: activeGeminiAccounts,
        rateLimitedGeminiAccounts: rateLimitedGeminiAccounts,
        totalTokensUsed,
        totalRequestsUsed,
        totalInputTokensUsed,
        totalOutputTokensUsed,
        totalCacheCreateTokensUsed,
        totalCacheReadTokensUsed,
        totalAllTokensUsed
      },
      recentActivity: {
        apiKeysCreatedToday: todayStats.apiKeysCreatedToday,
        requestsToday: todayStats.requestsToday,
        tokensToday: todayStats.tokensToday,
        inputTokensToday: todayStats.inputTokensToday,
        outputTokensToday: todayStats.outputTokensToday,
        cacheCreateTokensToday: todayStats.cacheCreateTokensToday || 0,
        cacheReadTokensToday: todayStats.cacheReadTokensToday || 0
      },
      systemAverages: {
        rpm: systemAverages.systemRPM,
        tpm: systemAverages.systemTPM
      },
      systemHealth: {
        redisConnected: redis.isConnected,
        claudeAccountsHealthy: activeClaudeAccounts > 0,
        geminiAccountsHealthy: activeGeminiAccounts > 0,
        uptime: process.uptime()
      }
    };

    res.json({ success: true, data: dashboard });
  } catch (error) {
    logger.error('❌ Failed to get dashboard data:', error);
    res.status(500).json({ error: 'Failed to get dashboard data', message: error.message });
  }
});

// 获取使用统计
router.get('/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'daily' } = req.query; // daily, monthly
    
    // 获取基础API Key统计
    const apiKeys = await apiKeyService.getAllApiKeys();
    
    const stats = apiKeys.map(key => ({
      keyId: key.id,
      keyName: key.name,
      usage: key.usage
    }));

    res.json({ success: true, data: { period, stats } });
  } catch (error) {
    logger.error('❌ Failed to get usage stats:', error);
    res.status(500).json({ error: 'Failed to get usage stats', message: error.message });
  }
});

// 获取按模型的使用统计和费用
router.get('/model-stats', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'daily' } = req.query; // daily, monthly
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    logger.info(`📊 Getting global model stats, period: ${period}, today: ${today}, currentMonth: ${currentMonth}`);
    
    const client = redis.getClientSafe();
    
    // 获取所有模型的统计数据
    const pattern = period === 'daily' ? `usage:model:daily:*:${today}` : `usage:model:monthly:*:${currentMonth}`;
    logger.info(`📊 Searching pattern: ${pattern}`);
    
    const keys = await client.keys(pattern);
    logger.info(`📊 Found ${keys.length} matching keys:`, keys);
    
    const modelStats = [];
    
    for (const key of keys) {
      const match = key.match(period === 'daily' ? 
        /usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/ : 
        /usage:model:monthly:(.+):\d{4}-\d{2}$/
      );
      
      if (!match) {
        logger.warn(`📊 Pattern mismatch for key: ${key}`);
        continue;
      }
      
      const model = match[1];
      const data = await client.hgetall(key);
      
      logger.info(`📊 Model ${model} data:`, data);
      
      if (data && Object.keys(data).length > 0) {
        const usage = {
          input_tokens: parseInt(data.inputTokens) || 0,
          output_tokens: parseInt(data.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
        };
        
        // 计算费用
        const costData = CostCalculator.calculateCost(usage, model);
        
        modelStats.push({
          model,
          period,
          requests: parseInt(data.requests) || 0,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreateTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          allTokens: parseInt(data.allTokens) || 0,
          usage: {
            requests: parseInt(data.requests) || 0,
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheCreateTokens: usage.cache_creation_input_tokens,
            cacheReadTokens: usage.cache_read_input_tokens,
            totalTokens: usage.input_tokens + usage.output_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens
          },
          costs: costData.costs,
          formatted: costData.formatted,
          pricing: costData.pricing
        });
      }
    }
    
    // 按总费用排序
    modelStats.sort((a, b) => b.costs.total - a.costs.total);
    
    logger.info(`📊 Returning ${modelStats.length} global model stats for period ${period}:`, modelStats);
    
    res.json({ success: true, data: modelStats });
  } catch (error) {
    logger.error('❌ Failed to get model stats:', error);
    res.status(500).json({ error: 'Failed to get model stats', message: error.message });
  }
});

// 🔧 系统管理

// 清理过期数据
router.post('/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const [expiredKeys, errorAccounts] = await Promise.all([
      apiKeyService.cleanupExpiredKeys(),
      claudeAccountService.cleanupErrorAccounts()
    ]);
    
    await redis.cleanup();
    
    logger.success(`🧹 Admin triggered cleanup: ${expiredKeys} expired keys, ${errorAccounts} error accounts`);
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      data: {
        expiredKeysRemoved: expiredKeys,
        errorAccountsReset: errorAccounts
      }
    });
  } catch (error) {
    logger.error('❌ Cleanup failed:', error);
    res.status(500).json({ error: 'Cleanup failed', message: error.message });
  }
});

// 获取使用趋势数据
router.get('/usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { days = 7, granularity = 'day', startDate, endDate } = req.query;
    const client = redis.getClientSafe();
    
    const trendData = [];
    
    if (granularity === 'hour') {
      // 小时粒度统计
      let startTime, endTime;
      
      if (startDate && endDate) {
        // 使用自定义时间范围
        startTime = new Date(startDate);
        endTime = new Date(endDate);
      } else {
        // 默认最近24小时
        endTime = new Date();
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
      }
      
      // 确保时间范围不超过24小时
      const timeDiff = endTime - startTime;
      if (timeDiff > 24 * 60 * 60 * 1000) {
        return res.status(400).json({ 
          error: '小时粒度查询时间范围不能超过24小时' 
        });
      }
      
      // 按小时遍历
      const currentHour = new Date(startTime);
      currentHour.setMinutes(0, 0, 0);
      
      while (currentHour <= endTime) {
        const dateStr = currentHour.toISOString().split('T')[0];
        const hour = String(currentHour.getHours()).padStart(2, '0');
        const hourKey = `${dateStr}:${hour}`;
        
        // 获取当前小时的模型统计数据
        const modelPattern = `usage:model:hourly:*:${hourKey}`;
        const modelKeys = await client.keys(modelPattern);
        
        let hourInputTokens = 0;
        let hourOutputTokens = 0;
        let hourRequests = 0;
        let hourCacheCreateTokens = 0;
        let hourCacheReadTokens = 0;
        let hourCost = 0;
        
        for (const modelKey of modelKeys) {
          const modelMatch = modelKey.match(/usage:model:hourly:(.+):\d{4}-\d{2}-\d{2}:\d{2}$/);
          if (!modelMatch) continue;
          
          const model = modelMatch[1];
          const data = await client.hgetall(modelKey);
          
          if (data && Object.keys(data).length > 0) {
            const modelInputTokens = parseInt(data.inputTokens) || 0;
            const modelOutputTokens = parseInt(data.outputTokens) || 0;
            const modelCacheCreateTokens = parseInt(data.cacheCreateTokens) || 0;
            const modelCacheReadTokens = parseInt(data.cacheReadTokens) || 0;
            const modelRequests = parseInt(data.requests) || 0;
            
            hourInputTokens += modelInputTokens;
            hourOutputTokens += modelOutputTokens;
            hourCacheCreateTokens += modelCacheCreateTokens;
            hourCacheReadTokens += modelCacheReadTokens;
            hourRequests += modelRequests;
            
            const modelUsage = {
              input_tokens: modelInputTokens,
              output_tokens: modelOutputTokens,
              cache_creation_input_tokens: modelCacheCreateTokens,
              cache_read_input_tokens: modelCacheReadTokens
            };
            const modelCostResult = CostCalculator.calculateCost(modelUsage, model);
            hourCost += modelCostResult.costs.total;
          }
        }
        
        // 如果没有模型级别的数据，尝试API Key级别的数据
        if (modelKeys.length === 0) {
          const pattern = `usage:hourly:*:${hourKey}`;
          const keys = await client.keys(pattern);
          
          for (const key of keys) {
            const data = await client.hgetall(key);
            if (data) {
              hourInputTokens += parseInt(data.inputTokens) || 0;
              hourOutputTokens += parseInt(data.outputTokens) || 0;
              hourRequests += parseInt(data.requests) || 0;
              hourCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0;
              hourCacheReadTokens += parseInt(data.cacheReadTokens) || 0;
            }
          }
          
          const usage = {
            input_tokens: hourInputTokens,
            output_tokens: hourOutputTokens,
            cache_creation_input_tokens: hourCacheCreateTokens,
            cache_read_input_tokens: hourCacheReadTokens
          };
          const costResult = CostCalculator.calculateCost(usage, 'unknown');
          hourCost = costResult.costs.total;
        }
        
        trendData.push({
          date: hourKey,
          hour: currentHour.toISOString(),
          inputTokens: hourInputTokens,
          outputTokens: hourOutputTokens,
          requests: hourRequests,
          cacheCreateTokens: hourCacheCreateTokens,
          cacheReadTokens: hourCacheReadTokens,
          totalTokens: hourInputTokens + hourOutputTokens + hourCacheCreateTokens + hourCacheReadTokens,
          cost: hourCost
        });
        
        // 移到下一个小时
        currentHour.setHours(currentHour.getHours() + 1);
      }
      
    } else {
      // 天粒度统计（保持原有逻辑）
      const daysCount = parseInt(days) || 7;
      const today = new Date();
      
      // 获取过去N天的数据
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        // 汇总当天所有API Key的使用数据
        const pattern = `usage:daily:*:${dateStr}`;
        const keys = await client.keys(pattern);
      
      let dayInputTokens = 0;
      let dayOutputTokens = 0;
      let dayRequests = 0;
      let dayCacheCreateTokens = 0;
      let dayCacheReadTokens = 0;
      let dayCost = 0;
      
      // 按模型统计使用量
      // const modelUsageMap = new Map();
      
      // 获取当天所有模型的使用数据
      const modelPattern = `usage:model:daily:*:${dateStr}`;
      const modelKeys = await client.keys(modelPattern);
      
      for (const modelKey of modelKeys) {
        // 解析模型名称
        const modelMatch = modelKey.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/);
        if (!modelMatch) continue;
        
        const model = modelMatch[1];
        const data = await client.hgetall(modelKey);
        
        if (data && Object.keys(data).length > 0) {
          const modelInputTokens = parseInt(data.inputTokens) || 0;
          const modelOutputTokens = parseInt(data.outputTokens) || 0;
          const modelCacheCreateTokens = parseInt(data.cacheCreateTokens) || 0;
          const modelCacheReadTokens = parseInt(data.cacheReadTokens) || 0;
          const modelRequests = parseInt(data.requests) || 0;
          
          // 累加总数
          dayInputTokens += modelInputTokens;
          dayOutputTokens += modelOutputTokens;
          dayCacheCreateTokens += modelCacheCreateTokens;
          dayCacheReadTokens += modelCacheReadTokens;
          dayRequests += modelRequests;
          
          // 按模型计算费用
          const modelUsage = {
            input_tokens: modelInputTokens,
            output_tokens: modelOutputTokens,
            cache_creation_input_tokens: modelCacheCreateTokens,
            cache_read_input_tokens: modelCacheReadTokens
          };
          const modelCostResult = CostCalculator.calculateCost(modelUsage, model);
          dayCost += modelCostResult.costs.total;
        }
      }
      
      // 如果没有模型级别的数据，回退到原始方法
      if (modelKeys.length === 0 && keys.length > 0) {
        for (const key of keys) {
          const data = await client.hgetall(key);
          if (data) {
            dayInputTokens += parseInt(data.inputTokens) || 0;
            dayOutputTokens += parseInt(data.outputTokens) || 0;
            dayRequests += parseInt(data.requests) || 0;
            dayCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0;
            dayCacheReadTokens += parseInt(data.cacheReadTokens) || 0;
          }
        }
        
        // 使用默认模型价格计算
        const usage = {
          input_tokens: dayInputTokens,
          output_tokens: dayOutputTokens,
          cache_creation_input_tokens: dayCacheCreateTokens,
          cache_read_input_tokens: dayCacheReadTokens
        };
        const costResult = CostCalculator.calculateCost(usage, 'unknown');
        dayCost = costResult.costs.total;
      }
      
      trendData.push({
        date: dateStr,
        inputTokens: dayInputTokens,
        outputTokens: dayOutputTokens,
        requests: dayRequests,
        cacheCreateTokens: dayCacheCreateTokens,
        cacheReadTokens: dayCacheReadTokens,
        totalTokens: dayInputTokens + dayOutputTokens + dayCacheCreateTokens + dayCacheReadTokens,
        cost: dayCost,
        formattedCost: CostCalculator.formatCost(dayCost)
      });
    }
    
    }
    
    // 按日期正序排列
    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour));
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    res.json({ success: true, data: trendData, granularity });
  } catch (error) {
    logger.error('❌ Failed to get usage trend:', error);
    res.status(500).json({ error: 'Failed to get usage trend', message: error.message });
  }
});

// 获取单个API Key的模型统计
router.get('/api-keys/:keyId/model-stats', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { period = 'monthly', startDate, endDate } = req.query;
    
    logger.info(`📊 Getting model stats for API key: ${keyId}, period: ${period}, startDate: ${startDate}, endDate: ${endDate}`);
    
    const client = redis.getClientSafe();
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    let searchPatterns = [];
    
    if (period === 'custom' && startDate && endDate) {
      // 自定义日期范围，生成多个日期的搜索模式
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // 确保日期范围有效
      if (start > end) {
        return res.status(400).json({ error: 'Start date must be before or equal to end date' });
      }
      
      // 限制最大范围为31天
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      if (daysDiff > 31) {
        return res.status(400).json({ error: 'Date range cannot exceed 31 days' });
      }
      
      // 生成日期范围内所有日期的搜索模式
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        searchPatterns.push(`usage:${keyId}:model:daily:*:${dateStr}`);
      }
      
      logger.info(`📊 Custom date range patterns: ${searchPatterns.length} days from ${startDate} to ${endDate}`);
    } else {
      // 原有的预设期间逻辑
      const pattern = period === 'daily' ? 
        `usage:${keyId}:model:daily:*:${today}` : 
        `usage:${keyId}:model:monthly:*:${currentMonth}`;
      searchPatterns = [pattern];
      logger.info(`📊 Preset period pattern: ${pattern}`);
    }
    
    // 汇总所有匹配的数据
    const modelStatsMap = new Map();
    const modelStats = []; // 定义结果数组
    
    for (const pattern of searchPatterns) {
      const keys = await client.keys(pattern);
      logger.info(`📊 Pattern ${pattern} found ${keys.length} keys`);
      
      for (const key of keys) {
        const match = key.match(/usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/) || 
                     key.match(/usage:.+:model:monthly:(.+):\d{4}-\d{2}$/);
        
        if (!match) {
          logger.warn(`📊 Pattern mismatch for key: ${key}`);
          continue;
        }
        
        const model = match[1];
        const data = await client.hgetall(key);
        
        if (data && Object.keys(data).length > 0) {
          // 累加同一模型的数据
          if (!modelStatsMap.has(model)) {
            modelStatsMap.set(model, {
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0,
              allTokens: 0
            });
          }
          
          const stats = modelStatsMap.get(model);
          stats.requests += parseInt(data.requests) || 0;
          stats.inputTokens += parseInt(data.inputTokens) || 0;
          stats.outputTokens += parseInt(data.outputTokens) || 0;
          stats.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0;
          stats.cacheReadTokens += parseInt(data.cacheReadTokens) || 0;
          stats.allTokens += parseInt(data.allTokens) || 0;
        }
      }
    }
    
    // 将汇总的数据转换为最终结果
    for (const [model, stats] of modelStatsMap) {
      logger.info(`📊 Model ${model} aggregated data:`, stats);
      
      const usage = {
        input_tokens: stats.inputTokens,
        output_tokens: stats.outputTokens,
        cache_creation_input_tokens: stats.cacheCreateTokens,
        cache_read_input_tokens: stats.cacheReadTokens
      };
      
      // 使用CostCalculator计算费用
      const costData = CostCalculator.calculateCost(usage, model);
      
      modelStats.push({
        model,
        requests: stats.requests,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        cacheCreateTokens: stats.cacheCreateTokens,
        cacheReadTokens: stats.cacheReadTokens,
        allTokens: stats.allTokens,
        // 添加费用信息
        costs: costData.costs,
        formatted: costData.formatted,
        pricing: costData.pricing,
        usingDynamicPricing: costData.usingDynamicPricing
      });
    }
    
    // 如果没有找到模型级别的详细数据，尝试从汇总数据中生成展示
    if (modelStats.length === 0) {
      logger.info(`📊 No detailed model stats found, trying to get aggregate data for API key ${keyId}`);
      
      // 尝试从API Keys列表中获取usage数据作为备选方案
      try {
        const apiKeys = await apiKeyService.getAllApiKeys();
        const targetApiKey = apiKeys.find(key => key.id === keyId);
        
        if (targetApiKey && targetApiKey.usage) {
          logger.info(`📊 Found API key usage data from getAllApiKeys for ${keyId}:`, targetApiKey.usage);
          
          // 从汇总数据创建展示条目
          let usageData;
          if (period === 'custom' || period === 'daily') {
            // 对于自定义或日统计，使用daily数据或total数据
            usageData = targetApiKey.usage.daily || targetApiKey.usage.total;
          } else {
            // 对于月统计，使用monthly数据或total数据
            usageData = targetApiKey.usage.monthly || targetApiKey.usage.total;
          }
          
          if (usageData && usageData.allTokens > 0) {
            const usage = {
              input_tokens: usageData.inputTokens || 0,
              output_tokens: usageData.outputTokens || 0,
              cache_creation_input_tokens: usageData.cacheCreateTokens || 0,
              cache_read_input_tokens: usageData.cacheReadTokens || 0
            };
            
            // 对于汇总数据，使用默认模型计算费用
            const costData = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022');
            
            modelStats.push({
              model: '总体使用 (历史数据)',
              requests: usageData.requests || 0,
              inputTokens: usageData.inputTokens || 0,
              outputTokens: usageData.outputTokens || 0,
              cacheCreateTokens: usageData.cacheCreateTokens || 0,
              cacheReadTokens: usageData.cacheReadTokens || 0,
              allTokens: usageData.allTokens || 0,
              // 添加费用信息
              costs: costData.costs,
              formatted: costData.formatted,
              pricing: costData.pricing,
              usingDynamicPricing: costData.usingDynamicPricing
            });
            
            logger.info('📊 Generated display data from API key usage stats');
          } else {
            logger.info(`📊 No usage data found for period ${period} in API key data`);
          }
        } else {
          logger.info(`📊 API key ${keyId} not found or has no usage data`);
        }
      } catch (error) {
        logger.error('❌ Error fetching API key usage data:', error);
      }
    }
    
    // 按总token数降序排列
    modelStats.sort((a, b) => b.allTokens - a.allTokens);
    
    logger.info(`📊 Returning ${modelStats.length} model stats for API key ${keyId}:`, modelStats);
    
    res.json({ success: true, data: modelStats });
  } catch (error) {
    logger.error('❌ Failed to get API key model stats:', error);
    res.status(500).json({ error: 'Failed to get API key model stats', message: error.message });
  }
});


// 获取按API Key分组的使用趋势
router.get('/api-keys-usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { granularity = 'day', days = 7, startDate, endDate } = req.query;
    
    logger.info(`📊 Getting API keys usage trend, granularity: ${granularity}, days: ${days}`);
    
    const client = redis.getClientSafe();
    const trendData = [];
    
    // 获取所有API Keys
    const apiKeys = await apiKeyService.getAllApiKeys();
    const apiKeyMap = new Map(apiKeys.map(key => [key.id, key]));
    
    if (granularity === 'hour') {
      // 小时粒度统计
      let endTime, startTime;
      
      if (startDate && endDate) {
        // 自定义时间范围
        startTime = new Date(startDate);
        endTime = new Date(endDate);
      } else {
        // 默认近24小时
        endTime = new Date();
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
      }
      
      // 按小时遍历
      const currentHour = new Date(startTime);
      currentHour.setMinutes(0, 0, 0);
      
      while (currentHour <= endTime) {
        const hourKey = currentHour.toISOString().split(':')[0].replace('T', ':');
        
        // 获取这个小时所有API Key的数据
        const pattern = `usage:hourly:*:${hourKey}`;
        const keys = await client.keys(pattern);
        
        const hourData = {
          hour: currentHour.toISOString(),
          apiKeys: {}
        };
        
        for (const key of keys) {
          const match = key.match(/usage:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/);
          if (!match) continue;
          
          const apiKeyId = match[1];
          const data = await client.hgetall(key);
          
          if (data && apiKeyMap.has(apiKeyId)) {
            const totalTokens = (parseInt(data.inputTokens) || 0) + 
                              (parseInt(data.outputTokens) || 0) + 
                              (parseInt(data.cacheCreateTokens) || 0) + 
                              (parseInt(data.cacheReadTokens) || 0);
            
            hourData.apiKeys[apiKeyId] = {
              name: apiKeyMap.get(apiKeyId).name,
              tokens: totalTokens,
              requests: parseInt(data.requests) || 0
            };
          }
        }
        
        trendData.push(hourData);
        currentHour.setHours(currentHour.getHours() + 1);
      }
      
    } else {
      // 天粒度统计
      const daysCount = parseInt(days) || 7;
      const today = new Date();
      
      // 获取过去N天的数据
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        // 获取这一天所有API Key的数据
        const pattern = `usage:daily:*:${dateStr}`;
        const keys = await client.keys(pattern);
        
        const dayData = {
          date: dateStr,
          apiKeys: {}
        };
        
        for (const key of keys) {
          const match = key.match(/usage:daily:(.+?):\d{4}-\d{2}-\d{2}/);
          if (!match) continue;
          
          const apiKeyId = match[1];
          const data = await client.hgetall(key);
          
          if (data && apiKeyMap.has(apiKeyId)) {
            const totalTokens = (parseInt(data.inputTokens) || 0) + 
                              (parseInt(data.outputTokens) || 0) + 
                              (parseInt(data.cacheCreateTokens) || 0) + 
                              (parseInt(data.cacheReadTokens) || 0);
            
            dayData.apiKeys[apiKeyId] = {
              name: apiKeyMap.get(apiKeyId).name,
              tokens: totalTokens,
              requests: parseInt(data.requests) || 0
            };
          }
        }
        
        trendData.push(dayData);
      }
    }
    
    // 按时间正序排列
    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour));
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    // 计算每个API Key的总token数，用于排序
    const apiKeyTotals = new Map();
    for (const point of trendData) {
      for (const [apiKeyId, data] of Object.entries(point.apiKeys)) {
        apiKeyTotals.set(apiKeyId, (apiKeyTotals.get(apiKeyId) || 0) + data.tokens);
      }
    }
    
    // 获取前10个使用量最多的API Key
    const topApiKeys = Array.from(apiKeyTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([apiKeyId]) => apiKeyId);
    
    res.json({ 
      success: true, 
      data: trendData, 
      granularity,
      topApiKeys,
      totalApiKeys: apiKeyTotals.size
    });
  } catch (error) {
    logger.error('❌ Failed to get API keys usage trend:', error);
    res.status(500).json({ error: 'Failed to get API keys usage trend', message: error.message });
  }
});

// 计算总体使用费用
router.get('/usage-costs', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'all' } = req.query; // all, today, monthly
    
    logger.info(`💰 Calculating usage costs for period: ${period}`);
    
    // 获取所有API Keys的使用统计
    const apiKeys = await apiKeyService.getAllApiKeys();
    
    let totalCosts = {
      inputCost: 0,
      outputCost: 0,
      cacheCreateCost: 0,
      cacheReadCost: 0,
      totalCost: 0
    };
    
    let modelCosts = {};
    
    // 按模型统计费用
    const client = redis.getClientSafe();
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    let pattern;
    if (period === 'today') {
      pattern = `usage:model:daily:*:${today}`;
    } else if (period === 'monthly') {
      pattern = `usage:model:monthly:*:${currentMonth}`;
    } else {
      // 全部时间，先尝试从Redis获取所有历史模型统计数据（只使用monthly数据避免重复计算）
      const allModelKeys = await client.keys('usage:model:monthly:*:*');
      logger.info(`💰 Total period calculation: found ${allModelKeys.length} monthly model keys`);
      
      if (allModelKeys.length > 0) {
        // 如果有详细的模型统计数据，使用模型级别的计算
        const modelUsageMap = new Map();
        
        for (const key of allModelKeys) {
          // 解析模型名称（只处理monthly数据）
          let modelMatch = key.match(/usage:model:monthly:(.+):(\d{4}-\d{2})$/);
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
        
        // 使用模型级别的数据计算费用
        logger.info(`💰 Processing ${modelUsageMap.size} unique models for total cost calculation`);
        
        for (const [model, usage] of modelUsageMap) {
          const usageData = {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_creation_input_tokens: usage.cacheCreateTokens,
            cache_read_input_tokens: usage.cacheReadTokens
          };
          
          const costResult = CostCalculator.calculateCost(usageData, model);
          totalCosts.inputCost += costResult.costs.input;
          totalCosts.outputCost += costResult.costs.output;
          totalCosts.cacheCreateCost += costResult.costs.cacheWrite;
          totalCosts.cacheReadCost += costResult.costs.cacheRead;
          totalCosts.totalCost += costResult.costs.total;
          
          logger.info(`💰 Model ${model}: ${usage.inputTokens + usage.outputTokens + usage.cacheCreateTokens + usage.cacheReadTokens} tokens, cost: ${costResult.formatted.total}`);
          
          // 记录模型费用
          modelCosts[model] = {
            model,
            requests: 0, // 历史汇总数据没有请求数
            usage: usageData,
            costs: costResult.costs,
            formatted: costResult.formatted,
            usingDynamicPricing: costResult.usingDynamicPricing
          };
        }
      } else {
        // 如果没有详细的模型统计数据，回退到API Key汇总数据
        logger.warn('No detailed model statistics found, falling back to API Key aggregated data');
        
        for (const apiKey of apiKeys) {
          if (apiKey.usage && apiKey.usage.total) {
            const usage = {
              input_tokens: apiKey.usage.total.inputTokens || 0,
              output_tokens: apiKey.usage.total.outputTokens || 0,
              cache_creation_input_tokens: apiKey.usage.total.cacheCreateTokens || 0,
              cache_read_input_tokens: apiKey.usage.total.cacheReadTokens || 0
            };
            
            // 使用加权平均价格计算（基于当前活跃模型的价格分布）
            const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022');
            totalCosts.inputCost += costResult.costs.input;
            totalCosts.outputCost += costResult.costs.output;
            totalCosts.cacheCreateCost += costResult.costs.cacheWrite;
            totalCosts.cacheReadCost += costResult.costs.cacheRead;
            totalCosts.totalCost += costResult.costs.total;
          }
        }
      }
      
      res.json({
        success: true,
        data: {
          period,
          totalCosts: {
            ...totalCosts,
            formatted: {
              inputCost: CostCalculator.formatCost(totalCosts.inputCost),
              outputCost: CostCalculator.formatCost(totalCosts.outputCost),
              cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
              cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
              totalCost: CostCalculator.formatCost(totalCosts.totalCost)
            }
          },
          modelCosts: Object.values(modelCosts).sort((a, b) => b.costs.total - a.costs.total),
          pricingServiceStatus: pricingService.getStatus()
        }
      });
      return;
    }
    
    // 对于今日或本月，从Redis获取详细的模型统计
    const keys = await client.keys(pattern);
    
    for (const key of keys) {
      const match = key.match(period === 'today' ? 
        /usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/ : 
        /usage:model:monthly:(.+):\d{4}-\d{2}$/
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
        
        const costResult = CostCalculator.calculateCost(usage, model);
        
        // 累加总费用
        totalCosts.inputCost += costResult.costs.input;
        totalCosts.outputCost += costResult.costs.output;
        totalCosts.cacheCreateCost += costResult.costs.cacheWrite;
        totalCosts.cacheReadCost += costResult.costs.cacheRead;
        totalCosts.totalCost += costResult.costs.total;
        
        // 记录模型费用
        modelCosts[model] = {
          model,
          requests: parseInt(data.requests) || 0,
          usage,
          costs: costResult.costs,
          formatted: costResult.formatted,
          usingDynamicPricing: costResult.usingDynamicPricing
        };
      }
    }
    
    res.json({
      success: true,
      data: {
        period,
        totalCosts: {
          ...totalCosts,
          formatted: {
            inputCost: CostCalculator.formatCost(totalCosts.inputCost),
            outputCost: CostCalculator.formatCost(totalCosts.outputCost),
            cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
            cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
            totalCost: CostCalculator.formatCost(totalCosts.totalCost)
          }
        },
        modelCosts: Object.values(modelCosts).sort((a, b) => b.costs.total - a.costs.total),
        pricingServiceStatus: pricingService.getStatus()
      }
    });
  } catch (error) {
    logger.error('❌ Failed to calculate usage costs:', error);
    res.status(500).json({ error: 'Failed to calculate usage costs', message: error.message });
  }
});

// 📋 获取所有账号的 Claude Code headers 信息
router.get('/claude-code-headers', authenticateAdmin, async (req, res) => {
  try {
    const allHeaders = await claudeCodeHeadersService.getAllAccountHeaders();
    
    // 获取所有 Claude 账号信息
    const accounts = await claudeAccountService.getAllAccounts();
    const accountMap = {};
    accounts.forEach(account => {
      accountMap[account.id] = account.name;
    });
    
    // 格式化输出
    const formattedData = Object.entries(allHeaders).map(([accountId, data]) => ({
      accountId,
      accountName: accountMap[accountId] || 'Unknown',
      version: data.version,
      userAgent: data.headers['user-agent'],
      updatedAt: data.updatedAt,
      headers: data.headers
    }));
    
    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    logger.error('❌ Failed to get Claude Code headers:', error);
    res.status(500).json({ error: 'Failed to get Claude Code headers', message: error.message });
  }
});

// 🗑️ 清除指定账号的 Claude Code headers
router.delete('/claude-code-headers/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    await claudeCodeHeadersService.clearAccountHeaders(accountId);
    
    res.json({
      success: true,
      message: `Claude Code headers cleared for account ${accountId}`
    });
  } catch (error) {
    logger.error('❌ Failed to clear Claude Code headers:', error);
    res.status(500).json({ error: 'Failed to clear Claude Code headers', message: error.message });
  }
});

// 🔄 版本检查
router.get('/check-updates', authenticateAdmin, async (req, res) => {
  // 读取当前版本
  const versionPath = path.join(__dirname, '../../VERSION');
  let currentVersion = '1.0.0';
  try {
    currentVersion = fs.readFileSync(versionPath, 'utf8').trim();
  } catch (err) {
    logger.warn('⚠️ Could not read VERSION file:', err.message);
  }

  try {

    // 从缓存获取
    const cacheKey = 'version_check_cache';
    const cached = await redis.getClient().get(cacheKey);
    
    if (cached && !req.query.force) {
      const cachedData = JSON.parse(cached);
      const cacheAge = Date.now() - cachedData.timestamp;
      
      // 缓存有效期1小时
      if (cacheAge < 3600000) {
        // 实时计算 hasUpdate，不使用缓存的值
        const hasUpdate = compareVersions(currentVersion, cachedData.latest) < 0;
        
        return res.json({
          success: true,
          data: {
            current: currentVersion,
            latest: cachedData.latest,
            hasUpdate: hasUpdate, // 实时计算，不用缓存
            releaseInfo: cachedData.releaseInfo,
            cached: true
          }
        });
      }
    }

    // 请求 GitHub API
    const githubRepo = 'wei-shaw/claude-relay-service';
    const response = await axios.get(
      `https://api.github.com/repos/${githubRepo}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Claude-Relay-Service'
        },
        timeout: 10000
      }
    );

    const release = response.data;
    const latestVersion = release.tag_name.replace(/^v/, '');
    
    // 比较版本
    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;
    
    const releaseInfo = {
      name: release.name,
      body: release.body,
      publishedAt: release.published_at,
      htmlUrl: release.html_url
    };

    // 缓存结果（不缓存 hasUpdate，因为它应该实时计算）
    await redis.getClient().set(cacheKey, JSON.stringify({
      latest: latestVersion,
      releaseInfo,
      timestamp: Date.now()
    }), 'EX', 3600); // 1小时过期

    res.json({
      success: true,
      data: {
        current: currentVersion,
        latest: latestVersion,
        hasUpdate,
        releaseInfo,
        cached: false
      }
    });

  } catch (error) {
    // 改进错误日志记录
    const errorDetails = {
      message: error.message || 'Unknown error',
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null,
      request: error.request ? 'Request was made but no response received' : null
    };
    
    logger.error('❌ Failed to check for updates:', errorDetails.message);
    
    // 处理 404 错误 - 仓库或版本不存在
    if (error.response && error.response.status === 404) {
      return res.json({
        success: true,
        data: {
          current: currentVersion,
          latest: currentVersion,
          hasUpdate: false,
          releaseInfo: {
            name: 'No releases found',
            body: 'The GitHub repository has no releases yet.',
            publishedAt: new Date().toISOString(),
            htmlUrl: '#'
          },
          warning: 'GitHub repository has no releases'
        }
      });
    }
    
    // 如果是网络错误，尝试返回缓存的数据
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      const cacheKey = 'version_check_cache';
      const cached = await redis.getClient().get(cacheKey);
      
      if (cached) {
        const cachedData = JSON.parse(cached);
        // 实时计算 hasUpdate
        const hasUpdate = compareVersions(currentVersion, cachedData.latest) < 0;
        
        return res.json({
          success: true,
          data: {
            current: currentVersion,
            latest: cachedData.latest,
            hasUpdate: hasUpdate, // 实时计算
            releaseInfo: cachedData.releaseInfo,
            cached: true,
            warning: 'Using cached data due to network error'
          }
        });
      }
    }
    
    // 其他错误返回当前版本信息
    res.json({
      success: true,
      data: {
        current: currentVersion,
        latest: currentVersion,
        hasUpdate: false,
        releaseInfo: {
          name: 'Update check failed',
          body: `Unable to check for updates: ${error.message || 'Unknown error'}`,
          publishedAt: new Date().toISOString(),
          htmlUrl: '#'
        },
        error: true,
        warning: error.message || 'Failed to check for updates'
      }
    });
  }
});

// 版本比较函数
function compareVersions(current, latest) {
  const parseVersion = (v) => {
    const parts = v.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    };
  };
  
  const currentV = parseVersion(current);
  const latestV = parseVersion(latest);
  
  if (currentV.major !== latestV.major) {
    return currentV.major - latestV.major;
  }
  if (currentV.minor !== latestV.minor) {
    return currentV.minor - latestV.minor;
  }
  return currentV.patch - latestV.patch;
}

// 🎨 OEM设置管理

// 获取OEM设置（公开接口，用于显示）
router.get('/oem-settings', async (req, res) => {
  try {
    const client = redis.getClient();
    const oemSettings = await client.get('oem:settings');
    
    // 默认设置
    const defaultSettings = {
      siteName: 'Claude Relay Service',
      siteIcon: '',
      siteIconData: '', // Base64编码的图标数据
      updatedAt: new Date().toISOString()
    };
    
    let settings = defaultSettings;
    if (oemSettings) {
      try {
        settings = { ...defaultSettings, ...JSON.parse(oemSettings) };
      } catch (err) {
        logger.warn('⚠️ Failed to parse OEM settings, using defaults:', err.message);
      }
    }
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('❌ Failed to get OEM settings:', error);
    res.status(500).json({ error: 'Failed to get OEM settings', message: error.message });
  }
});

// 更新OEM设置
router.put('/oem-settings', authenticateAdmin, async (req, res) => {
  try {
    const { siteName, siteIcon, siteIconData } = req.body;
    
    // 验证输入
    if (!siteName || typeof siteName !== 'string' || siteName.trim().length === 0) {
      return res.status(400).json({ error: 'Site name is required' });
    }
    
    if (siteName.length > 100) {
      return res.status(400).json({ error: 'Site name must be less than 100 characters' });
    }
    
    // 验证图标数据大小（如果是base64）
    if (siteIconData && siteIconData.length > 500000) { // 约375KB
      return res.status(400).json({ error: 'Icon file must be less than 350KB' });
    }
    
    // 验证图标URL（如果提供）
    if (siteIcon && !siteIconData) {
      // 简单验证URL格式
      try {
        new URL(siteIcon);
      } catch (err) {
        return res.status(400).json({ error: 'Invalid icon URL format' });
      }
    }
    
    const settings = {
      siteName: siteName.trim(),
      siteIcon: (siteIcon || '').trim(),
      siteIconData: (siteIconData || '').trim(), // Base64数据
      updatedAt: new Date().toISOString()
    };
    
    const client = redis.getClient();
    await client.set('oem:settings', JSON.stringify(settings));
    
    logger.info(`✅ OEM settings updated: ${siteName}`);
    
    res.json({
      success: true,
      message: 'OEM settings updated successfully',
      data: settings
    });
  } catch (error) {
    logger.error('❌ Failed to update OEM settings:', error);
    res.status(500).json({ error: 'Failed to update OEM settings', message: error.message });
  }
});

module.exports = router;