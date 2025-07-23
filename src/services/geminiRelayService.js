const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const logger = require('../utils/logger');
const config = require('../../config/config');
const { recordUsageMetrics } = require('./apiKeyService');

// Gemini API 配置
const GEMINI_API_BASE = 'https://cloudcode.googleapis.com/v1';
const DEFAULT_MODEL = 'models/gemini-2.0-flash-exp';

// 创建代理 agent
function createProxyAgent(proxyConfig) {
  if (!proxyConfig) return null;
  
  try {
    const proxy = typeof proxyConfig === 'string' ? JSON.parse(proxyConfig) : proxyConfig;
    
    if (!proxy.type || !proxy.host || !proxy.port) {
      return null;
    }
    
    const proxyUrl = proxy.username && proxy.password
      ? `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      : `${proxy.type}://${proxy.host}:${proxy.port}`;
    
    if (proxy.type === 'socks5') {
      return new SocksProxyAgent(proxyUrl);
    } else if (proxy.type === 'http' || proxy.type === 'https') {
      return new HttpsProxyAgent(proxyUrl);
    }
  } catch (error) {
    logger.error('Error creating proxy agent:', error);
  }
  
  return null;
}

// 转换 OpenAI 消息格式到 Gemini 格式
function convertMessagesToGemini(messages) {
  const contents = [];
  let systemInstruction = '';
  
  for (const message of messages) {
    if (message.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + message.content;
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: message.content }]
      });
    } else if (message.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: message.content }]
      });
    }
  }
  
  return { contents, systemInstruction };
}

// 转换 Gemini 响应到 OpenAI 格式
function convertGeminiResponse(geminiResponse, model, stream = false) {
  if (stream) {
    // 流式响应
    const candidate = geminiResponse.candidates?.[0];
    if (!candidate) return null;
    
    const content = candidate.content?.parts?.[0]?.text || '';
    const finishReason = candidate.finishReason?.toLowerCase();
    
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        delta: {
          content: content
        },
        finish_reason: finishReason === 'stop' ? 'stop' : null
      }]
    };
  } else {
    // 非流式响应
    const candidate = geminiResponse.candidates?.[0];
    if (!candidate) {
      throw new Error('No response from Gemini');
    }
    
    const content = candidate.content?.parts?.[0]?.text || '';
    const finishReason = candidate.finishReason?.toLowerCase() || 'stop';
    
    // 计算 token 使用量
    const usage = geminiResponse.usageMetadata || {
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
  }
}

// 处理流式响应
async function* handleStreamResponse(response, model, apiKeyId) {
  let buffer = '';
  let totalUsage = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0
  };
  
  try {
    for await (const chunk of response.data) {
      buffer += chunk.toString();
      
      // 处理可能的多个 JSON 对象
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后一个不完整的行
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const data = JSON.parse(line);
          
          // 更新使用量统计
          if (data.usageMetadata) {
            totalUsage = data.usageMetadata;
          }
          
          // 转换并发送响应
          const openaiResponse = convertGeminiResponse(data, model, true);
          if (openaiResponse) {
            yield `data: ${JSON.stringify(openaiResponse)}\n\n`;
          }
          
          // 检查是否结束
          if (data.candidates?.[0]?.finishReason === 'STOP') {
            // 记录使用量
            if (apiKeyId && totalUsage.totalTokenCount > 0) {
              await recordUsageMetrics(apiKeyId, {
                inputTokens: totalUsage.promptTokenCount,
                outputTokens: totalUsage.candidatesTokenCount,
                model: model
              });
            }
            
            yield 'data: [DONE]\n\n';
            return;
          }
        } catch (e) {
          logger.debug('Error parsing JSON line:', e.message);
        }
      }
    }
    
    // 处理剩余的 buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        const openaiResponse = convertGeminiResponse(data, model, true);
        if (openaiResponse) {
          yield `data: ${JSON.stringify(openaiResponse)}\n\n`;
        }
      } catch (e) {
        logger.debug('Error parsing final buffer:', e.message);
      }
    }
    
    yield 'data: [DONE]\n\n';
  } catch (error) {
    logger.error('Stream processing error:', error);
    yield `data: ${JSON.stringify({
      error: {
        message: error.message,
        type: 'stream_error'
      }
    })}\n\n`;
  }
}

// 发送请求到 Gemini
async function sendGeminiRequest({
  messages,
  model = DEFAULT_MODEL,
  temperature = 0.7,
  maxTokens = 4096,
  stream = false,
  accessToken,
  proxy,
  apiKeyId,
  projectId,
  location = 'us-central1'
}) {
  // 确保模型名称格式正确
  if (!model.startsWith('models/')) {
    model = `models/${model}`;
  }
  
  // 转换消息格式
  const { contents, systemInstruction } = convertMessagesToGemini(messages);
  
  // 构建请求体
  const requestBody = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      candidateCount: 1
    }
  };
  
  if (systemInstruction) {
    requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  
  // 配置请求选项
  let apiUrl;
  if (projectId) {
    // 使用项目特定的 URL 格式（Google Cloud/Workspace 账号）
    apiUrl = `${GEMINI_API_BASE}/projects/${projectId}/locations/${location}/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}?alt=sse`;
    logger.debug(`Using project-specific URL with projectId: ${projectId}, location: ${location}`);
  } else {
    // 使用标准 URL 格式（个人 Google 账号）
    apiUrl = `${GEMINI_API_BASE}/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}?alt=sse`;
    logger.debug('Using standard URL without projectId');
  }
  
  const axiosConfig = {
    method: 'POST',
    url: apiUrl,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    data: requestBody,
    timeout: config.requestTimeout || 120000
  };
  
  // 添加代理配置
  const proxyAgent = createProxyAgent(proxy);
  if (proxyAgent) {
    axiosConfig.httpsAgent = proxyAgent;
    logger.debug('Using proxy for Gemini request');
  }
  
  if (stream) {
    axiosConfig.responseType = 'stream';
  }
  
  try {
    logger.debug('Sending request to Gemini API');
    const response = await axios(axiosConfig);
    
    if (stream) {
      return handleStreamResponse(response, model, apiKeyId);
    } else {
      // 非流式响应
      const openaiResponse = convertGeminiResponse(response.data, model, false);
      
      // 记录使用量
      if (apiKeyId && openaiResponse.usage) {
        await recordUsageMetrics(apiKeyId, {
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
          model: model
        });
      }
      
      return openaiResponse;
    }
  } catch (error) {
    logger.error('Gemini API request failed:', error.response?.data || error.message);
    
    // 转换错误格式
    if (error.response) {
      const geminiError = error.response.data?.error;
      throw {
        status: error.response.status,
        error: {
          message: geminiError?.message || 'Gemini API request failed',
          type: geminiError?.code || 'api_error',
          code: geminiError?.code
        }
      };
    }
    
    throw {
      status: 500,
      error: {
        message: error.message,
        type: 'network_error'
      }
    };
  }
}

// 获取可用模型列表
async function getAvailableModels(accessToken, proxy, projectId, location = 'us-central1') {
  let apiUrl;
  if (projectId) {
    // 使用项目特定的 URL 格式
    apiUrl = `${GEMINI_API_BASE}/projects/${projectId}/locations/${location}/models`;
    logger.debug(`Fetching models with projectId: ${projectId}, location: ${location}`);
  } else {
    // 使用标准 URL 格式
    apiUrl = `${GEMINI_API_BASE}/models`;
    logger.debug('Fetching models without projectId');
  }
  
  const axiosConfig = {
    method: 'GET',
    url: apiUrl,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    timeout: 30000
  };
  
  const proxyAgent = createProxyAgent(proxy);
  if (proxyAgent) {
    axiosConfig.httpsAgent = proxyAgent;
  }
  
  try {
    const response = await axios(axiosConfig);
    const models = response.data.models || [];
    
    // 转换为 OpenAI 格式
    return models
      .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
      .map(model => ({
        id: model.name.replace('models/', ''),
        object: 'model',
        created: Date.now() / 1000,
        owned_by: 'google'
      }));
  } catch (error) {
    logger.error('Failed to get Gemini models:', error);
    // 返回默认模型列表
    return [
      {
        id: 'gemini-2.0-flash-exp',
        object: 'model',
        created: Date.now() / 1000,
        owned_by: 'google'
      }
    ];
  }
}

module.exports = {
  sendGeminiRequest,
  getAvailableModels,
  convertMessagesToGemini,
  convertGeminiResponse
};