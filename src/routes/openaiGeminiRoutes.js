const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateApiKey } = require('../middleware/auth');
const geminiAccountService = require('../services/geminiAccountService');
const { getAvailableModels } = require('../services/geminiRelayService');
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

// 转换 OpenAI 消息格式到 Gemini 格式
function convertMessagesToGemini(messages) {
  const contents = [];
  let systemInstruction = '';
  
  // 辅助函数：提取文本内容
  function extractTextContent(content) {
    // 处理 null 或 undefined
    if (content == null) {
      return '';
    }
    
    // 处理字符串
    if (typeof content === 'string') {
      return content;
    }
    
    // 处理数组格式的内容
    if (Array.isArray(content)) {
      return content.map(item => {
        if (item == null) return '';
        if (typeof item === 'string') {
          return item;
        }
        if (typeof item === 'object') {
          // 处理 {type: 'text', text: '...'} 格式
          if (item.type === 'text' && item.text) {
            return item.text;
          }
          // 处理 {text: '...'} 格式
          if (item.text) {
            return item.text;
          }
          // 处理嵌套的对象或数组
          if (item.content) {
            return extractTextContent(item.content);
          }
        }
        return '';
      }).join('');
    }
    
    // 处理对象格式的内容
    if (typeof content === 'object') {
      // 处理 {text: '...'} 格式
      if (content.text) {
        return content.text;
      }
      // 处理 {content: '...'} 格式
      if (content.content) {
        return extractTextContent(content.content);
      }
      // 处理 {parts: [{text: '...'}]} 格式
      if (content.parts && Array.isArray(content.parts)) {
        return content.parts.map(part => {
          if (part && part.text) {
            return part.text;
          }
          return '';
        }).join('');
      }
    }
    
    // 最后的后备选项：只有在内容确实不为空且有意义时才转换为字符串
    if (content !== undefined && content !== null && content !== '' && typeof content !== 'object') {
      return String(content);
    }
    
    return '';
  }
  
  for (const message of messages) {
    const textContent = extractTextContent(message.content);
    
    if (message.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + textContent;
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: textContent }]
      });
    } else if (message.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: textContent }]
      });
    }
  }
  
  return { contents, systemInstruction };
}

// 转换 Gemini 响应到 OpenAI 格式
function convertGeminiResponseToOpenAI(geminiResponse, model, stream = false) {
  if (stream) {
    // 处理流式响应 - 原样返回 SSE 数据
    return geminiResponse;
  } else {
    // 非流式响应转换
    // 处理嵌套的 response 结构
    const actualResponse = geminiResponse.response || geminiResponse;
    
    if (actualResponse.candidates && actualResponse.candidates.length > 0) {
      const candidate = actualResponse.candidates[0];
      const content = candidate.content?.parts?.[0]?.text || '';
      const finishReason = candidate.finishReason?.toLowerCase() || 'stop';

      // 计算 token 使用量
      const usage = actualResponse.usageMetadata || {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0
      };

      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: content
          },
          finish_reason: finishReason
        }],
        usage: {
          prompt_tokens: usage.promptTokenCount,
          completion_tokens: usage.candidatesTokenCount,
          total_tokens: usage.totalTokenCount
        }
      };
    } else {
      throw new Error('No response from Gemini');
    }
  }
}

// OpenAI 兼容的聊天完成端点
router.post('/v1/chat/completions', authenticateApiKey, async (req, res) => {
  const startTime = Date.now();
  let abortController = null;
  let account = null; // Declare account outside try block for error handling
  
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
    // 处理请求体结构 - 支持多种格式
    let requestBody = req.body;
    
    // 如果请求体被包装在 body 字段中，解包它
    if (req.body.body && typeof req.body.body === 'object') {
      requestBody = req.body.body;
    }
    
    // 从 URL 路径中提取模型信息（如果存在）
    let urlModel = null;
    const urlPath = req.body?.config?.url || req.originalUrl || req.url;
    const modelMatch = urlPath.match(/\/([^/]+):(?:stream)?[Gg]enerateContent/);
    if (modelMatch) {
      urlModel = modelMatch[1];
      logger.debug(`Extracted model from URL: ${urlModel}`);
    }
    
    // 提取请求参数
    const {
      messages: requestMessages,
      contents: requestContents,
      model: bodyModel = 'gemini-2.0-flash-exp',
      temperature = 0.7,
      max_tokens = 4096,
      stream = false
    } = requestBody;
    
    // 检查URL中是否包含stream标识
    const isStreamFromUrl = urlPath && urlPath.includes('streamGenerateContent');
    const actualStream = stream || isStreamFromUrl;

    // 优先使用 URL 中的模型，其次是请求体中的模型
    const model = urlModel || bodyModel;

    // 支持两种格式: OpenAI 的 messages 或 Gemini 的 contents
    let messages = requestMessages;
    if (requestContents && Array.isArray(requestContents)) {
      messages = requestContents;
    }

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
    
    // 转换消息格式
    const { contents: geminiContents, systemInstruction } = convertMessagesToGemini(messages);
    
    // 构建 Gemini 请求体
    const geminiRequestBody = {
      contents: geminiContents,
      generationConfig: {
        temperature,
        maxOutputTokens: max_tokens,
        candidateCount: 1
      }
    };
    
    if (systemInstruction) {
      geminiRequestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    
    // 生成会话哈希用于粘性会话
    const sessionHash = generateSessionHash(req);
    
    // 选择可用的 Gemini 账户
    account = await geminiAccountService.selectAvailableAccount(
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
    
    // 获取OAuth客户端
    const client = await geminiAccountService.getOauthClient(account.accessToken, account.refreshToken);
    if (actualStream) {
      // 流式响应
      logger.info('StreamGenerateContent request', {
        model: model,
        projectId: account.projectId,
        apiKeyId: apiKeyData.id
      });
      
      const streamResponse = await geminiAccountService.generateContentStream(
        client,
        { model, request: geminiRequestBody },
        null, // user_prompt_id
        account.projectId, // 使用有权限的项目ID
        apiKeyData.id, // 使用 API Key ID 作为 session ID
        abortController.signal // 传递中止信号
      );
      
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      
      // 处理流式响应，转换为 OpenAI 格式
      let buffer = '';
      
      // 发送初始的空消息，符合 OpenAI 流式格式
      const initialChunk = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null
        }]
      };
      res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
      
      streamResponse.on('data', (chunk) => {
        try {
          const chunkStr = chunk.toString();
          
          if (!chunkStr.trim()) {
            return;
          }
          
          buffer += chunkStr;
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一个不完整的行
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            // 处理 SSE 格式
            let jsonData = line;
            if (line.startsWith('data: ')) {
              jsonData = line.substring(6).trim();
            }
            
            if (!jsonData || jsonData === '[DONE]') continue;
            
            try {
              const data = JSON.parse(jsonData);
              
              // 转换为 OpenAI 流式格式
              if (data.response?.candidates && data.response.candidates.length > 0) {
                const candidate = data.response.candidates[0];
                const content = candidate.content?.parts?.[0]?.text || '';
                const finishReason = candidate.finishReason;
                
                // 只有当有内容或者是结束标记时才发送数据
                if (content || finishReason === 'STOP') {
                  const openaiChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: model,
                    choices: [{
                      index: 0,
                      delta: content ? { content: content } : {},
                      finish_reason: finishReason === 'STOP' ? 'stop' : null
                    }]
                  };
                  
                  res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
                  
                  // 如果结束了，添加 usage 信息并发送最终的 [DONE]
                  if (finishReason === 'STOP') {
                    // 如果有 usage 数据，添加到最后一个 chunk
                    if (data.response.usageMetadata) {
                      const usageChunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: model,
                        choices: [{
                          index: 0,
                          delta: {},
                          finish_reason: 'stop'
                        }],
                        usage: {
                          prompt_tokens: data.response.usageMetadata.promptTokenCount || 0,
                          completion_tokens: data.response.usageMetadata.candidatesTokenCount || 0,
                          total_tokens: data.response.usageMetadata.totalTokenCount || 0
                        }
                      };
                      res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
                    }
                    res.write('data: [DONE]\n\n');
                  }
                }
              }
            } catch (e) {
              logger.debug('Error parsing JSON line:', e.message);
            }
          }
        } catch (error) {
          logger.error('Stream processing error:', error);
          if (!res.headersSent) {
            res.status(500).json({
              error: {
                message: error.message || 'Stream error',
                type: 'api_error'
              }
            });
          }
        }
      });
      
      streamResponse.on('end', () => {
        logger.info('Stream completed successfully');
        if (!res.headersSent) {
          res.write('data: [DONE]\n\n');
        }
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
          // 如果已经开始发送流数据，发送错误事件
          res.write(`data: {"error": {"message": "${error.message || 'Stream error'}"}}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      });
      
    } else {
      // 非流式响应
      logger.info('GenerateContent request', {
        model: model,
        projectId: account.projectId,
        apiKeyId: apiKeyData.id
      });
      
      const response = await geminiAccountService.generateContent(
        client,
        { model, request: geminiRequestBody },
        null, // user_prompt_id
        account.projectId, // 使用有权限的项目ID
        apiKeyData.id // 使用 API Key ID 作为 session ID
      );
      
      // 转换为 OpenAI 格式并返回
      const openaiResponse = convertGeminiResponseToOpenAI(response, model, false);
      res.json(openaiResponse);
    }
    
    const duration = Date.now() - startTime;
    logger.info(`OpenAI-Gemini request completed in ${duration}ms`);
    
  } catch (error) {
    logger.error('OpenAI-Gemini request error:', error);
    
    // 处理速率限制
    if (error.status === 429) {
      if (req.apiKey && account) {
        await geminiAccountService.setAccountRateLimited(account.id, true);
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