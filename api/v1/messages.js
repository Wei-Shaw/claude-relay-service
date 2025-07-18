/**
 * Claude API Messages 端点 - Vercel Function
 * 核心代理转发功能
 */

const claudeRelayService = require('../../lib/services/claudeRelayService');
const apiKeyService = require('../../lib/services/apiKeyService');
const { authenticateApiKey } = require('../../lib/middleware/auth');
const logger = require('../../lib/utils/logger');

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are allowed'
    });
  }

  try {
    // API Key 认证
    const authResult = await authenticateApiKey(req);
    if (!authResult.success) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: authResult.error
      });
    }

    const apiKeyData = authResult.apiKey;
    const startTime = Date.now();
    
    // 严格的输入验证
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request body must be a valid JSON object'
      });
    }

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Missing or invalid field: messages (must be an array)'
      });
    }

    if (req.body.messages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Messages array cannot be empty'
      });
    }

    // 检查是否为流式请求
    const isStream = req.body.stream === true;
    
    logger.api(`🚀 Processing ${isStream ? 'stream' : 'non-stream'} request for key: ${apiKeyData.name}`);

    if (isStream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      let usageDataCaptured = false;
      
      // 使用流式处理器捕获usage数据
      await claudeRelayService.relayStreamRequest(req.body, apiKeyData, res, req.headers, (usageData) => {
        logger.info('🎯 Usage callback triggered:', JSON.stringify(usageData, null, 2));
        
        if (usageData && usageData.input_tokens !== undefined && usageData.output_tokens !== undefined) {
          const inputTokens = usageData.input_tokens || 0;
          const outputTokens = usageData.output_tokens || 0;
          const cacheCreateTokens = usageData.cache_creation_input_tokens || 0;
          const cacheReadTokens = usageData.cache_read_input_tokens || 0;
          const model = usageData.model || 'unknown';
          
          // 记录真实的token使用量
          apiKeyService.recordUsage(apiKeyData.id, inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens, model).catch(error => {
            logger.error('❌ Failed to record stream usage:', error);
          });
          
          usageDataCaptured = true;
          logger.api(`📊 Stream usage recorded - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens}`);
        } else {
          logger.warn('⚠️ Usage callback triggered but data is incomplete:', JSON.stringify(usageData));
        }
      });
      
      // 检查是否捕获到usage数据
      setTimeout(() => {
        if (!usageDataCaptured) {
          logger.warn('⚠️ No usage data captured from SSE stream');
        }
      }, 1000);
      
    } else {
      // 非流式响应
      logger.info('📄 Starting non-streaming request', {
        apiKeyId: apiKeyData.id,
        apiKeyName: apiKeyData.name
      });
      
      const response = await claudeRelayService.relayRequest(req.body, apiKeyData, req.headers);
      
      logger.info('📡 Claude API response received', {
        statusCode: response.statusCode,
        bodyLength: response.body ? response.body.length : 0
      });
      
      res.status(response.statusCode);
      
      // 设置响应头
      Object.keys(response.headers).forEach(key => {
        res.setHeader(key, response.headers[key]);
      });
      
      // 尝试解析响应体来记录使用统计
      let responseData = null;
      try {
        responseData = JSON.parse(response.body);
        
        if (responseData.usage) {
          const usage = responseData.usage;
          const inputTokens = usage.input_tokens || 0;
          const outputTokens = usage.output_tokens || 0;
          const cacheCreateTokens = usage.cache_creation_input_tokens || 0;
          const cacheReadTokens = usage.cache_read_input_tokens || 0;
          const model = responseData.model || req.body.model || 'unknown';
          
          // 记录使用统计
          await apiKeyService.recordUsage(apiKeyData.id, inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens, model);
          
          logger.api(`📊 Non-stream usage recorded - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens}`);
        }
      } catch (parseError) {
        logger.debug('Could not parse response body for usage tracking:', parseError.message);
      }
      
      // 发送响应
      res.send(response.body);
    }
    
  } catch (error) {
    logger.error('❌ Request processing failed:', error);
    
    // 错误响应
    const statusCode = error.statusCode || 500;
    const errorMessage = error.message || 'Internal server error';
    
    res.status(statusCode).json({
      error: 'Processing failed',
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}