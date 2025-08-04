const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateApiKey } = require('../middleware/auth');
const geminiAccountService = require('../services/geminiAccountService');
const { sendGeminiRequest, getAvailableModels } = require('../services/geminiRelayService');
const crypto = require('crypto');
const sessionHelper = require('../utils/sessionHelper');
const unifiedGeminiScheduler = require('../services/unifiedGeminiScheduler');
// const { OAuth2Client } = require('google-auth-library'); // OAuth2Client is not used in this file

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

    // 使用统一调度选择可用的 Gemini 账户（传递请求的模型）
    let accountId;
    try {
      const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
        apiKeyData,
        sessionHash,
        model  // 传递请求的模型进行过滤
      );
      accountId = schedulerResult.accountId;
    } catch (error) {
      logger.error('Failed to select Gemini account:', error);
      return res.status(503).json({
        error: {
          message: error.message || 'No available Gemini accounts',
          type: 'service_unavailable'
        }
      });
    }

    // 获取账户详情
    const account = await geminiAccountService.getAccount(accountId);
    if (!account) {
      return res.status(503).json({
        error: {
          message: 'Selected account not found',
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
      projectId: account.projectId,
      accountId: account.id
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

// 共用的 loadCodeAssist 处理函数
async function handleLoadCodeAssist(req, res) {
  try {
    const sessionHash = sessionHelper.generateSessionHash(req.body);

    // 使用统一调度选择账号（传递请求的模型）
    const requestedModel = req.body.model;
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(req.apiKey, sessionHash, requestedModel);
    const { accessToken, refreshToken } = await geminiAccountService.getAccount(accountId);
    logger.info(`accessToken: ${accessToken}`);

    const { metadata, cloudaicompanionProject } = req.body;

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.info(`LoadCodeAssist request (${version})`, {
      metadata: metadata || {},
      cloudaicompanionProject: cloudaicompanionProject || null,
      apiKeyId: req.apiKey?.id || 'unknown'
    });

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken);
    const response = await geminiAccountService.loadCodeAssist(client, cloudaicompanionProject);
    res.json(response);
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.error(`Error in loadCodeAssist endpoint (${version})`, { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// 共用的 onboardUser 处理函数
async function handleOnboardUser(req, res) {
  try {
    const { tierId, cloudaicompanionProject, metadata } = req.body;
    const sessionHash = sessionHelper.generateSessionHash(req.body);

    // 使用统一调度选择账号（传递请求的模型）
    const requestedModel = req.body.model;
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(req.apiKey, sessionHash, requestedModel);
    const { accessToken, refreshToken } = await geminiAccountService.getAccount(accountId);

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.info(`OnboardUser request (${version})`, {
      tierId: tierId || 'not provided',
      cloudaicompanionProject: cloudaicompanionProject || null,
      metadata: metadata || {},
      apiKeyId: req.apiKey?.id || 'unknown'
    });

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken);

    // 如果提供了完整参数，直接调用onboardUser
    if (tierId && metadata) {
      const response = await geminiAccountService.onboardUser(client, tierId, cloudaicompanionProject, metadata);
      res.json(response);
    } else {
      // 否则执行完整的setupUser流程
      const response = await geminiAccountService.setupUser(client, cloudaicompanionProject, metadata);
      res.json(response);
    }
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.error(`Error in onboardUser endpoint (${version})`, { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// 共用的 countTokens 处理函数
async function handleCountTokens(req, res) {
  try {
    // 处理请求体结构，支持直接 contents 或 request.contents
    const requestData = req.body.request || req.body;
    const { contents, model = 'gemini-2.0-flash-exp' } = requestData;
    const sessionHash = sessionHelper.generateSessionHash(req.body);

    // 验证必需参数
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({
        error: {
          message: 'Contents array is required',
          type: 'invalid_request_error'
        }
      });
    }

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(req.apiKey, sessionHash, model);
    const { accessToken, refreshToken } = await geminiAccountService.getAccount(accountId);

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.info(`CountTokens request (${version})`, {
      model: model,
      contentsLength: contents.length,
      apiKeyId: req.apiKey?.id || 'unknown'
    });

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken);
    const response = await geminiAccountService.countTokens(client, contents, model);

    res.json(response);
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.error(`Error in countTokens endpoint (${version})`, { error: error.message });
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    });
  }
}

// 共用的 generateContent 处理函数
async function handleGenerateContent(req, res) {
  try {
    const { model, project, user_prompt_id, request: requestData } = req.body;
    const sessionHash = sessionHelper.generateSessionHash(req.body);
    
    // 处理不同格式的请求
    let actualRequestData = requestData;
    if (!requestData) {
      if (req.body.messages) {
        // 这是 OpenAI 格式的请求，构建 Gemini 格式的 request 对象
        actualRequestData = {
          contents: req.body.messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: req.body.temperature !== undefined ? req.body.temperature : 0.7,
            maxOutputTokens: req.body.max_tokens !== undefined ? req.body.max_tokens : 4096,
            topP: req.body.top_p !== undefined ? req.body.top_p : 0.95,
            topK: req.body.top_k !== undefined ? req.body.top_k : 40
          }
        };
      } else if (req.body.contents) {
        // 直接的 Gemini 格式请求（没有 request 包装）
        actualRequestData = req.body;
      }
    }

    // 验证必需参数
    if (!actualRequestData || !actualRequestData.contents) {
      return res.status(400).json({
        error: {
          message: 'Request contents are required',
          type: 'invalid_request_error'
        }
      });
    }

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(req.apiKey, sessionHash, model);
    const account = await geminiAccountService.getAccount(accountId);
    const { accessToken, refreshToken } = account;

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.info(`GenerateContent request (${version})`, {
      model: model,
      userPromptId: user_prompt_id,
      projectId: project || account.projectId,
      apiKeyId: req.apiKey?.id || 'unknown'
    });

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken);
    const response = await geminiAccountService.generateContent(
      client,
      { model, request: actualRequestData },
      user_prompt_id,
      project || account.projectId,
      req.apiKey?.id // 使用 API Key ID 作为 session ID
    );

    res.json(response);
  } catch (error) {
    console.log(321, error.response);
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.error(`Error in generateContent endpoint (${version})`, { error: error.message });
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    });
  }
}

// 共用的 streamGenerateContent 处理函数
async function handleStreamGenerateContent(req, res) {
  let abortController = null;

  try {
    const { model, project, user_prompt_id, request: requestData } = req.body;
    const sessionHash = sessionHelper.generateSessionHash(req.body);

    // 处理不同格式的请求
    let actualRequestData = requestData;
    if (!requestData) {
      if (req.body.messages) {
        // 这是 OpenAI 格式的请求，构建 Gemini 格式的 request 对象
        actualRequestData = {
          contents: req.body.messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: req.body.temperature !== undefined ? req.body.temperature : 0.7,
            maxOutputTokens: req.body.max_tokens !== undefined ? req.body.max_tokens : 4096,
            topP: req.body.top_p !== undefined ? req.body.top_p : 0.95,
            topK: req.body.top_k !== undefined ? req.body.top_k : 40
          }
        };
      } else if (req.body.contents) {
        // 直接的 Gemini 格式请求（没有 request 包装）
        actualRequestData = req.body;
      }
    }

    // 验证必需参数
    if (!actualRequestData || !actualRequestData.contents) {
      return res.status(400).json({
        error: {
          message: 'Request contents are required',
          type: 'invalid_request_error'
        }
      });
    }

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(req.apiKey, sessionHash, model);
    const account = await geminiAccountService.getAccount(accountId);
    const { accessToken, refreshToken } = account;

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.info(`StreamGenerateContent request (${version})`, {
      model: model,
      userPromptId: user_prompt_id,
      projectId: project || account.projectId,
      apiKeyId: req.apiKey?.id || 'unknown'
    });

    // 创建中止控制器
    abortController = new AbortController();

    // 处理客户端断开连接
    req.on('close', () => {
      if (abortController && !abortController.signal.aborted) {
        logger.info('Client disconnected, aborting stream request');
        abortController.abort();
      }
    });

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken);
    const streamResponse = await geminiAccountService.generateContentStream(
      client,
      { model, request: actualRequestData },
      user_prompt_id,
      project || account.projectId,
      req.apiKey?.id, // 使用 API Key ID 作为 session ID
      abortController.signal // 传递中止信号
    );

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 直接管道转发流式响应，不进行额外处理
    streamResponse.pipe(res, { end: false });

    streamResponse.on('end', () => {
      logger.info('Stream completed successfully');
      res.end();
    });

    streamResponse.on('error', (error) => {
      logger.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: error.message || 'Stream error',
            type: 'api_error'
          }
        });
      } else {
        res.end();
      }
    });

  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal';
    logger.error(`Error in streamGenerateContent endpoint (${version})`, { error: error.message });

    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'api_error'
        }
      });
    }
  } finally {
    // 清理资源
    if (abortController) {
      abortController = null;
    }
  }
}

// 注册所有路由端点
// v1internal 版本的端点
router.post('/v1internal\\:loadCodeAssist', authenticateApiKey, handleLoadCodeAssist);
router.post('/v1internal\\:onboardUser', authenticateApiKey, handleOnboardUser);
router.post('/v1internal\\:countTokens', authenticateApiKey, handleCountTokens);
router.post('/v1internal\\:generateContent', authenticateApiKey, handleGenerateContent);
router.post('/v1internal\\:streamGenerateContent', authenticateApiKey, handleStreamGenerateContent);

// v1beta 版本的端点 - 支持动态模型名称
router.post('/v1beta/models/:modelName\\:loadCodeAssist', authenticateApiKey, handleLoadCodeAssist);
router.post('/v1beta/models/:modelName\\:onboardUser', authenticateApiKey, handleOnboardUser);
router.post('/v1beta/models/:modelName\\:countTokens', authenticateApiKey, handleCountTokens);
router.post('/v1beta/models/:modelName\\:generateContent', authenticateApiKey, handleGenerateContent);
router.post('/v1beta/models/:modelName\\:streamGenerateContent', authenticateApiKey, handleStreamGenerateContent);

module.exports = router;