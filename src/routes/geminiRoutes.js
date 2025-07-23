const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateApiKey } = require('../middleware/auth');
const geminiAccountService = require('../services/geminiAccountService');
const { sendGeminiRequest, getAvailableModels } = require('../services/geminiRelayService');
const crypto = require('crypto');

// 生成会话哈希
function generateSessionHash(req) {
  const sessionData = [
    req.headers['user-agent'],
    req.ip,
    req.headers['x-api-key']?.substring(0, 10)
  ].filter(Boolean).join(':');
  
  return crypto.createHash('sha256').update(sessionData).digest('hex');
}

// 检查 API Key 权限
function checkPermissions(apiKeyData, requiredPermission = 'gemini') {
  const permissions = apiKeyData.permissions || 'all';
  return permissions === 'all' || permissions === requiredPermission;
}

// Gemini 消息处理端点
router.post('/messages', authenticateApiKey, async (req, res) => {
  const startTime = Date.now();
  let abortController = null;
  
  try {
    const apiKeyData = req.apiKey;
    
    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied'
        }
      });
    }
    
    // 提取请求参数
    const {
      messages,
      model = 'gemini-2.0-flash-exp',
      temperature = 0.7,
      max_tokens = 4096,
      stream = false
    } = req.body;
    
    // 验证必需参数
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required',
          type: 'invalid_request_error'
        }
      });
    }
    
    // 生成会话哈希用于粘性会话
    const sessionHash = generateSessionHash(req);
    
    // 选择可用的 Gemini 账户
    const account = await geminiAccountService.selectAvailableAccount(
      apiKeyData.id,
      sessionHash
    );
    
    if (!account) {
      return res.status(503).json({
        error: {
          message: 'No available Gemini accounts',
          type: 'service_unavailable'
        }
      });
    }
    
    logger.info(`Using Gemini account: ${account.id} for API key: ${apiKeyData.id}`);
    
    // 标记账户被使用
    await geminiAccountService.markAccountUsed(account.id);
    
    // 创建中止控制器
    abortController = new AbortController();
    
    // 处理客户端断开连接
    req.on('close', () => {
      if (abortController && !abortController.signal.aborted) {
        logger.info('Client disconnected, aborting Gemini request');
        abortController.abort();
      }
    });
    
    // 发送请求到 Gemini
    const geminiResponse = await sendGeminiRequest({
      messages,
      model,
      temperature,
      maxTokens: max_tokens,
      stream,
      accessToken: account.accessToken,
      proxy: account.proxy,
      apiKeyId: apiKeyData.id,
      signal: abortController.signal,
      projectId: account.projectId
    });
    
    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      
      // 流式传输响应
      for await (const chunk of geminiResponse) {
        if (abortController.signal.aborted) {
          break;
        }
        res.write(chunk);
      }
      
      res.end();
    } else {
      // 非流式响应
      res.json(geminiResponse);
    }
    
    const duration = Date.now() - startTime;
    logger.info(`Gemini request completed in ${duration}ms`);
    
  } catch (error) {
    logger.error('Gemini request error:', error);
    
    // 处理速率限制
    if (error.status === 429) {
      if (req.apiKey && req.account) {
        await geminiAccountService.setAccountRateLimited(req.account.id, true);
      }
    }
    
    // 返回错误响应
    const status = error.status || 500;
    const errorResponse = {
      error: error.error || {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    };
    
    res.status(status).json(errorResponse);
  } finally {
    // 清理资源
    if (abortController) {
      abortController = null;
    }
  }
});

// 获取可用模型列表
router.get('/models', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey;
    
    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied'
        }
      });
    }
    
    // 选择账户获取模型列表
    const account = await geminiAccountService.selectAvailableAccount(apiKeyData.id);
    
    if (!account) {
      // 返回默认模型列表
      return res.json({
        object: 'list',
        data: [
          {
            id: 'gemini-2.0-flash-exp',
            object: 'model',
            created: Date.now() / 1000,
            owned_by: 'google'
          }
        ]
      });
    }
    
    // 获取模型列表
    const models = await getAvailableModels(account.accessToken, account.proxy);
    
    res.json({
      object: 'list',
      data: models
    });
    
  } catch (error) {
    logger.error('Failed to get Gemini models:', error);
    res.status(500).json({
      error: {
        message: 'Failed to retrieve models',
        type: 'api_error'
      }
    });
  }
});

// 使用情况统计（与 Claude 共用）
router.get('/usage', authenticateApiKey, async (req, res) => {
  try {
    const usage = req.apiKey.usage;
    
    res.json({
      object: 'usage',
      total_tokens: usage.total.tokens,
      total_requests: usage.total.requests,
      daily_tokens: usage.daily.tokens,
      daily_requests: usage.daily.requests,
      monthly_tokens: usage.monthly.tokens,
      monthly_requests: usage.monthly.requests
    });
  } catch (error) {
    logger.error('Failed to get usage stats:', error);
    res.status(500).json({
      error: {
        message: 'Failed to retrieve usage statistics',
        type: 'api_error'
      }
    });
  }
});

// API Key 信息（与 Claude 共用）
router.get('/key-info', authenticateApiKey, async (req, res) => {
  try {
    const keyData = req.apiKey;
    
    res.json({
      id: keyData.id,
      name: keyData.name,
      permissions: keyData.permissions || 'all',
      token_limit: keyData.tokenLimit,
      tokens_used: keyData.usage.total.tokens,
      tokens_remaining: keyData.tokenLimit > 0 
        ? Math.max(0, keyData.tokenLimit - keyData.usage.total.tokens)
        : null,
      rate_limit: {
        window: keyData.rateLimitWindow,
        requests: keyData.rateLimitRequests
      },
      concurrency_limit: keyData.concurrencyLimit,
      model_restrictions: {
        enabled: keyData.enableModelRestriction,
        models: keyData.restrictedModels
      }
    });
  } catch (error) {
    logger.error('Failed to get key info:', error);
    res.status(500).json({
      error: {
        message: 'Failed to retrieve API key information',
        type: 'api_error'
      }
    });
  }
});

module.exports = router;