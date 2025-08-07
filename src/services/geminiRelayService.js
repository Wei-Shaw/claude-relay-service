const axios = require('axios')
const { HttpsProxyAgent } = require('https-proxy-agent')
const { SocksProxyAgent } = require('socks-proxy-agent')
const logger = require('../utils/logger')
const config = require('../../config/config')
const apiKeyService = require('./apiKeyService')

// Gemini API 配置
const GEMINI_API_BASE = 'https://cloudcode.googleapis.com/v1'
const DEFAULT_MODEL = 'models/gemini-2.0-flash-exp'

// 创建代理 agent
function createProxyAgent(proxyConfig) {
  if (!proxyConfig) {
    return null
  }

  try {
    const proxy = typeof proxyConfig === 'string' ? JSON.parse(proxyConfig) : proxyConfig

    if (!proxy.type || !proxy.host || !proxy.port) {
      return null
    }

    const proxyUrl =
      proxy.username && proxy.password
        ? `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
        : `${proxy.type}://${proxy.host}:${proxy.port}`

    if (proxy.type === 'socks5') {
      return new SocksProxyAgent(proxyUrl)
    } else if (proxy.type === 'http' || proxy.type === 'https') {
      return new HttpsProxyAgent(proxyUrl)
    }
  } catch (error) {
    logger.error('Error creating proxy agent:', error)
  }

  return null
}

// 转换 OpenAI 消息格式到 Gemini 格式
function convertMessagesToGemini(messages) {
  const contents = []
  let systemInstruction = ''

  for (const message of messages) {
    if (message.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + message.content
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: message.content }]
      })
    } else if (message.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: message.content }]
      })
    }
  }

  return { contents, systemInstruction }
}

// 转换 Gemini 响应到 OpenAI 格式
function convertGeminiResponse(geminiResponse, model, stream = false) {
  if (stream) {
    // 流式响应
    const candidate = geminiResponse.candidates?.[0]
    if (!candidate) {
      return null
    }

    const content = candidate.content?.parts?.[0]?.text || ''
    const finishReason = candidate.finishReason?.toLowerCase()

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            content
          },
          finish_reason: finishReason === 'stop' ? 'stop' : null
        }
      ]
    }
  } else {
    // 非流式响应
    const candidate = geminiResponse.candidates?.[0]
    if (!candidate) {
      throw new Error('No response from Gemini')
    }

    const content = candidate.content?.parts?.[0]?.text || ''
    const finishReason = candidate.finishReason?.toLowerCase() || 'stop'

    // 计算 token 使用量
    const usage = geminiResponse.usageMetadata || {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content
          },
          finish_reason: finishReason
        }
      ],
      usage: {
        prompt_tokens: usage.promptTokenCount,
        completion_tokens: usage.candidatesTokenCount,
        total_tokens: usage.totalTokenCount
      }
    }
  }
}

// 处理流式响应
async function* handleStreamResponse(response, model, apiKeyId, accountId = null) {
  let buffer = ''
  let totalUsage = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0
  }

  try {
    for await (const chunk of response.data) {
      buffer += chunk.toString()

      // 处理 SSE 格式的数据
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留最后一个不完整的行

      for (const line of lines) {
        if (!line.trim()) {
          continue
        }

        // 处理 SSE 格式: "data: {...}"
        let jsonData = line
        if (line.startsWith('data: ')) {
          jsonData = line.substring(6).trim()
        }

        if (!jsonData || jsonData === '[DONE]') {
          continue
        }

        try {
          const data = JSON.parse(jsonData)

          // 更新使用量统计
          if (data.usageMetadata) {
            totalUsage = data.usageMetadata
          }

          // 转换并发送响应
          const openaiResponse = convertGeminiResponse(data, model, true)
          if (openaiResponse) {
            yield `data: ${JSON.stringify(openaiResponse)}\n\n`
          }

          // 检查是否结束
          if (data.candidates?.[0]?.finishReason === 'STOP') {
            // 记录使用量
            if (apiKeyId && totalUsage.totalTokenCount > 0) {
              await apiKeyService
                .recordUsage(
                  apiKeyId,
                  totalUsage.promptTokenCount || 0, // inputTokens
                  totalUsage.candidatesTokenCount || 0, // outputTokens
                  0, // cacheCreateTokens (Gemini 没有这个概念)
                  0, // cacheReadTokens (Gemini 没有这个概念)
                  model,
                  accountId
                )
                .catch((error) => {
                  logger.error('❌ Failed to record Gemini usage:', error)
                })
            }

            yield 'data: [DONE]\n\n'
            return
          }
        } catch (e) {
          logger.debug('Error parsing JSON line:', e.message, 'Line:', jsonData)
        }
      }
    }

    // 处理剩余的 buffer
    if (buffer.trim()) {
      try {
        let jsonData = buffer.trim()
        if (jsonData.startsWith('data: ')) {
          jsonData = jsonData.substring(6).trim()
        }

        if (jsonData && jsonData !== '[DONE]') {
          const data = JSON.parse(jsonData)
          const openaiResponse = convertGeminiResponse(data, model, true)
          if (openaiResponse) {
            yield `data: ${JSON.stringify(openaiResponse)}\n\n`
          }
        }
      } catch (e) {
        logger.debug('Error parsing final buffer:', e.message)
      }
    }

    yield 'data: [DONE]\n\n'
  } catch (error) {
    // 检查是否是请求被中止
    if (error.name === 'CanceledError' || error.code === 'ECONNABORTED') {
      logger.info('Stream request was aborted by client')
    } else {
      logger.error('Stream processing error:', error)
      yield `data: ${JSON.stringify({
        error: {
          message: error.message,
          type: 'stream_error'
        }
      })}\n\n`
    }
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
  signal,
  projectId,
  location = 'us-central1',
  accountId = null
}) {
  // 确保模型名称格式正确
  if (!model.startsWith('models/')) {
    model = `models/${model}`
  }

  // 转换消息格式
  const { contents, systemInstruction } = convertMessagesToGemini(messages)

  // 构建请求体
  const requestBody = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      candidateCount: 1
    }
  }

  if (systemInstruction) {
    requestBody.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  // 配置请求选项
  let apiUrl
  if (projectId) {
    // 使用项目特定的 URL 格式（Google Cloud/Workspace 账号）
    apiUrl = `${GEMINI_API_BASE}/projects/${projectId}/locations/${location}/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}?alt=sse`
    logger.debug(`Using project-specific URL with projectId: ${projectId}, location: ${location}`)
  } else {
    // 使用标准 URL 格式（个人 Google 账号）
    apiUrl = `${GEMINI_API_BASE}/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}?alt=sse`
    logger.debug('Using standard URL without projectId')
  }

  const axiosConfig = {
    method: 'POST',
    url: apiUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    data: requestBody,
    timeout: config.requestTimeout || 120000
  }

  // 添加代理配置
  const proxyAgent = createProxyAgent(proxy)
  if (proxyAgent) {
    axiosConfig.httpsAgent = proxyAgent
    logger.debug('Using proxy for Gemini request')
  }

  // 添加 AbortController 信号支持
  if (signal) {
    axiosConfig.signal = signal
    logger.debug('AbortController signal attached to request')
  }

  if (stream) {
    axiosConfig.responseType = 'stream'
  }

  try {
    logger.debug('Sending request to Gemini API')
    const response = await axios(axiosConfig)

    if (stream) {
      return handleStreamResponse(response, model, apiKeyId, accountId)
    } else {
      // 非流式响应
      const openaiResponse = convertGeminiResponse(response.data, model, false)

      // 记录使用量
      if (apiKeyId && openaiResponse.usage) {
        await apiKeyService
          .recordUsage(
            apiKeyId,
            openaiResponse.usage.prompt_tokens || 0,
            openaiResponse.usage.completion_tokens || 0,
            0, // cacheCreateTokens
            0, // cacheReadTokens
            model,
            accountId
          )
          .catch((error) => {
            logger.error('❌ Failed to record Gemini usage:', error)
          })
      }

      return openaiResponse
    }
  } catch (error) {
    // 检查是否是请求被中止
    if (error.name === 'CanceledError' || error.code === 'ECONNABORTED') {
      logger.info('Gemini request was aborted by client')
      const err = new Error('Request canceled by client')
      err.status = 499
      err.error = {
        message: 'Request canceled by client',
        type: 'canceled',
        code: 'request_canceled'
      }
      throw err
    }

    logger.error('Gemini API request failed:', error.response?.data || error.message)

    // 转换错误格式
    if (error.response) {
      const geminiError = error.response.data?.error
      const err = new Error(geminiError?.message || 'Gemini API request failed')
      err.status = error.response.status
      err.error = {
        message: geminiError?.message || 'Gemini API request failed',
        type: geminiError?.code || 'api_error',
        code: geminiError?.code
      }
      throw err
    }

    const err = new Error(error.message)
    err.status = 500
    err.error = {
      message: error.message,
      type: 'network_error'
    }
    throw err
  }
}

// 获取可用模型列表
async function getAvailableModels(accessToken, proxy, projectId, location = 'us-central1') {
  let apiUrl
  if (projectId) {
    // 使用项目特定的 URL 格式
    apiUrl = `${GEMINI_API_BASE}/projects/${projectId}/locations/${location}/models`
    logger.debug(`Fetching models with projectId: ${projectId}, location: ${location}`)
  } else {
    // 使用标准 URL 格式
    apiUrl = `${GEMINI_API_BASE}/models`
    logger.debug('Fetching models without projectId')
  }

  const axiosConfig = {
    method: 'GET',
    url: apiUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    timeout: 30000
  }

  const proxyAgent = createProxyAgent(proxy)
  if (proxyAgent) {
    axiosConfig.httpsAgent = proxyAgent
  }

  try {
    const response = await axios(axiosConfig)
    const models = response.data.models || []

    // 转换为 OpenAI 格式
    return models
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => ({
        id: model.name.replace('models/', ''),
        object: 'model',
        created: Date.now() / 1000,
        owned_by: 'google'
      }))
  } catch (error) {
    logger.error('Failed to get Gemini models:', error)
    // 返回默认模型列表
    return [
      {
        id: 'gemini-2.0-flash-exp',
        object: 'model',
        created: Date.now() / 1000,
        owned_by: 'google'
      }
    ]
  }
}

// Count Tokens API - 用于Gemini CLI兼容性
async function countTokens({
  model,
  content,
  accessToken,
  proxy,
  projectId,
  location = 'us-central1'
}) {
  // 确保模型名称格式正确
  if (!model.startsWith('models/')) {
    model = `models/${model}`
  }

  // 转换内容格式 - 支持多种输入格式
  let requestBody
  if (Array.isArray(content)) {
    // 如果content是数组，直接使用
    requestBody = { contents: content }
  } else if (typeof content === 'string') {
    // 如果是字符串，转换为Gemini格式
    requestBody = {
      contents: [
        {
          parts: [{ text: content }]
        }
      ]
    }
  } else if (content.parts || content.role) {
    // 如果已经是Gemini格式的单个content
    requestBody = { contents: [content] }
  } else {
    // 其他情况，尝试直接使用
    requestBody = { contents: content }
  }

  // 构建API URL - countTokens需要使用generativelanguage API
  const GENERATIVE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
  let apiUrl
  if (projectId) {
    // 使用项目特定的 URL 格式（Google Cloud/Workspace 账号）
    apiUrl = `${GENERATIVE_API_BASE}/projects/${projectId}/locations/${location}/${model}:countTokens`
    logger.debug(
      `Using project-specific countTokens URL with projectId: ${projectId}, location: ${location}`
    )
  } else {
    // 使用标准 URL 格式（个人 Google 账号）
    apiUrl = `${GENERATIVE_API_BASE}/${model}:countTokens`
    logger.debug('Using standard countTokens URL without projectId')
  }

  const axiosConfig = {
    method: 'POST',
    url: apiUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': projectId || undefined
    },
    data: requestBody,
    timeout: 30000
  }

  // 添加代理配置
  const proxyAgent = createProxyAgent(proxy)
  if (proxyAgent) {
    axiosConfig.httpsAgent = proxyAgent
    logger.debug('Using proxy for Gemini countTokens request')
  }

  try {
    logger.debug(`Sending countTokens request to: ${apiUrl}`)
    logger.debug(`Request body: ${JSON.stringify(requestBody, null, 2)}`)
    const response = await axios(axiosConfig)

    // 返回符合Gemini API格式的响应
    return {
      totalTokens: response.data.totalTokens || 0,
      totalBillableCharacters: response.data.totalBillableCharacters || 0,
      ...response.data
    }
  } catch (error) {
    logger.error(`Gemini countTokens API request failed for URL: ${apiUrl}`)
    logger.error(
      'Request config:',
      JSON.stringify(
        {
          url: apiUrl,
          headers: axiosConfig.headers,
          data: requestBody
        },
        null,
        2
      )
    )
    logger.error('Error details:', error.response?.data || error.message)

    // 转换错误格式
    if (error.response) {
      const geminiError = error.response.data?.error
      const errorObj = new Error(
        geminiError?.message ||
          `Gemini countTokens API request failed (Status: ${error.response.status})`
      )
      errorObj.status = error.response.status
      errorObj.error = {
        message:
          geminiError?.message ||
          `Gemini countTokens API request failed (Status: ${error.response.status})`,
        type: geminiError?.code || 'api_error',
        code: geminiError?.code
      }
      throw errorObj
    }

    const errorObj = new Error(error.message)
    errorObj.status = 500
    errorObj.error = {
      message: error.message,
      type: 'network_error'
    }
    throw errorObj
  }
}

module.exports = {
  sendGeminiRequest,
  getAvailableModels,
  convertMessagesToGemini,
  convertGeminiResponse,
  countTokens
}
