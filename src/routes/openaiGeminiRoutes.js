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
    req.headers['authorization']?.substring(0, 20)
  ].filter(Boolean).join(':');
  
  return crypto.createHash('sha256').update(sessionData).digest('hex');
}

// 检查 API Key 权限
function checkPermissions(apiKeyData, requiredPermission = 'gemini') {
  const permissions = apiKeyData.permissions || 'all';
  return permissions === 'all' || permissions === requiredPermission;
}

// OpenAI 兼容的聊天完成端点
router.post('/v1/chat/completions', authenticateApiKey, async (req, res) => {
  const startTime = Date.now();
  let abortController = null;
  
  try {
    const apiKeyData = req.apiKey;
    
    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied',
          code: 'permission_denied'
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
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      });
    }
    
    // 检查模型限制
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels.length > 0) {
      if (!apiKeyData.restrictedModels.includes(model)) {
        return res.status(403).json({
          error: {
            message: `Model ${model} is not allowed for this API key`,
            type: 'invalid_request_error',
            code: 'model_not_allowed'
          }
        });
      }
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
          type: 'service_unavailable',
          code: 'service_unavailable'
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
    
    // 发送请求到 Gemini（已经返回 OpenAI 格式）
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
    logger.info(`OpenAI-Gemini request completed in ${duration}ms`);
    
  } catch (error) {
    logger.error('OpenAI-Gemini request error:', error);
    
    // 处理速率限制
    if (error.status === 429) {
      if (req.apiKey && req.account) {
        await geminiAccountService.setAccountRateLimited(req.account.id, true);
      }
    }
    
    // 返回 OpenAI 格式的错误响应
    const status = error.status || 500;
    const errorResponse = {
      error: error.error || {
        message: error.message || 'Internal server error',
        type: 'server_error',
        code: 'internal_error'
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

// OpenAI 兼容的模型列表端点
router.get('/v1/models', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey;
    
    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      });
    }
    
    // 选择账户获取模型列表
    const account = await geminiAccountService.selectAvailableAccount(apiKeyData.id);
    
    let models = [];
    
    if (account) {
      // 获取实际的模型列表
      models = await getAvailableModels(account.accessToken, account.proxy);
    } else {
      // 返回默认模型列表
      models = [
        {
          id: 'gemini-2.0-flash-exp',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'google'
        }
      ];
    }
    
    // 如果启用了模型限制，过滤模型列表
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels.length > 0) {
      models = models.filter(model => apiKeyData.restrictedModels.includes(model.id));
    }
    
    res.json({
      object: 'list',
      data: models
    });
    
  } catch (error) {
    logger.error('Failed to get OpenAI-Gemini models:', error);
    res.status(500).json({
      error: {
        message: 'Failed to retrieve models',
        type: 'server_error',
        code: 'internal_error'
      }
    });
  }
});

// OpenAI 兼容的模型详情端点
router.get('/v1/models/:model', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey;
    const modelId = req.params.model;
    
    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      });
    }
    
    // 检查模型限制
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels.length > 0) {
      if (!apiKeyData.restrictedModels.includes(modelId)) {
        return res.status(404).json({
          error: {
            message: `Model '${modelId}' not found`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }
    }
    
    // 返回模型信息
    res.json({
      id: modelId,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'google',
      permission: [],
      root: modelId,
      parent: null
    });
    
  } catch (error) {
    logger.error('Failed to get model details:', error);
    res.status(500).json({
      error: {
        message: 'Failed to retrieve model details',
        type: 'server_error',
        code: 'internal_error'
      }
    });
  }
});

module.exports = router;